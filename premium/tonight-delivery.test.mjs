import test from 'node:test';
import assert from 'node:assert/strict';
import { tonightLineup, prepareTonightDelivery } from './tonight.mjs';
import { memoryLedger, currentLedger, publishTonight, collectTonightReceipts, tonightAlarm } from './tonight-delivery.mjs';

// Synthetic catalogue and a fake provider. Nothing here can reach a real service.
const DATE = '2026-11-18';
const catalog = { series: [{ id: 'dated', title: 'Fixture dated', status: 'airing', total_episodes: 10, platforms: [{ name: 'Stream', url: 'https://example.com/dated' }], episodes: [{ number: 5, airs_at: `${DATE}T20:30:00+07:00` }] }] };
const prepared = new Date('2026-11-17T10:00:00Z');
const footer = { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}', postalAddress: 'Fixture Street 1' };
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: prepared.toISOString(), ...extra });
const readers = [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok')];
const makePlan = (list = readers, ledgerEntries = []) => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'fixture', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version }, footer, now: prepared, readers: list, ledger: ledgerEntries });
const recheckFrom = list => async ids => Object.fromEntries(list.filter(r => ids.includes(r.memberId)).map(r => [r.memberId, r]));

function fakeProvider(mode = 'ok') {
  const jobs = new Map(); const requests = [];
  return { jobs, requests,
    async findJob(key) { const job = jobs.get(key); return job ? structuredClone(job) : null; },
    async scheduleJob(request) {
      requests.push(structuredClone(request));
      if (mode === 'reject') throw Object.assign(new Error('refused'), { definite: true });
      if (mode === 'timeout') throw new Error('no answer');
      const job = { id: `job_${requests.length}`, key: request.key, sendAt: mode === 'wrong-time' ? '2026-11-18T12:30:00.000Z' : request.sendAt, subscriberIds: mode === 'wrong-audience' ? [...request.subscriberIds, '999'] : [...request.subscriberIds], payloadVersion: request.payloadVersion, state: 'scheduled' };
      jobs.set(request.key, job);
      if (mode === 'timeout-after-accept') throw new Error('no answer');
      return structuredClone(job);
    },
    async getJob(id) { const job = [...jobs.values()].find(j => j.id === id); return job ? structuredClone(job) : null; },
    // A real provider accounts for recipients one by one, and a job can read
    // 'sent' while naming only some of them. Nothing is implied for the rest.
    send(key, { sent, delivered, bounced } = {}) {
      const job = jobs.get(key); job.state = 'sent';
      if (sent) job.sentSubscriberIds = sent;
      if (delivered) job.deliveredSubscriberIds = delivered;
      if (bounced) job.bouncedSubscriberIds = bounced;
    },
  };
}
const solo = [reader(1, 'UTC')];
const publish = (plan, provider, ledger, list = readers, now = prepared) => publishTonight({ plan, provider, ledger, recheck: recheckFrom(list), now });

test('each cohort becomes one job with the exact audience, instant and frozen body', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  const result = await publish(plan, provider, ledger);
  assert.equal(result.jobsCreated, 2); assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.outcomes.map(o => [o.timezone, o.outcome, o.subscribers]), [['Asia/Bangkok', 'queued', 1], ['America/New_York', 'queued', 2]]);
  const ny = plan.batches.find(b => b.timezone === 'America/New_York'), sent = provider.requests.find(r => r.key === ny.deliveryKey);
  assert.equal(sent.sendAt, '2026-11-18T12:00:00.000Z'); assert.deepEqual(sent.subscriberIds, ['1', '2']);
  assert.equal(sent.html, plan.payloads[ny.payloadRef].html); assert.equal(sent.text, plan.payloads[ny.payloadRef].text); assert.equal(sent.payloadVersion, ny.payloadVersion);
  assert.deepEqual(currentLedger(ledger.all()).map(e => e.state), ['queued', 'queued', 'queued']);
});

test('publishing the same plan again, or a fresh plan for the same day, creates nothing new', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  await publish(plan, provider, ledger);
  const again = await publish(plan, provider, ledger);
  assert.equal(again.jobsCreated, 0); assert.deepEqual(again.outcomes.map(o => o.outcome), ['adopted_existing_job', 'adopted_existing_job']);
  const replan = makePlan([...readers, reader(4, 'Asia/Bangkok')], ledger.all());
  assert.equal(replan.batches.length, 0, 'a later plan holds every cohort already on record');
  assert.equal(provider.requests.length, 2);
  // Even if the ledger were lost, the provider's own record stops a second job.
  const amnesia = await publish(plan, provider, memoryLedger());
  assert.equal(amnesia.jobsCreated, 0); assert.equal(provider.requests.length, 2);
});

test('an opt-out, a lapsed payment or a zone change after preparation takes effect at dispatch', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  const later = [reader(1, 'America/New_York', { dailyEmailConsent: false }), reader(2, 'America/New_York'), reader(3, 'Europe/London')];
  const result = await publish(plan, provider, ledger, later);
  assert.deepEqual(result.outcomes.map(o => [o.timezone, o.outcome]), [['Asia/Bangkok', 'no_audience'], ['America/New_York', 'queued']]);
  assert.deepEqual(provider.requests.map(r => r.subscriberIds), [['2']]);
  assert.match(result.outcomes[1].dropped[0].reason, /Opted out/); assert.match(result.outcomes[0].dropped[0].reason, /zone changed/);
  const unpaid = await publish(makePlan([reader(5, 'UTC')]), fakeProvider(), memoryLedger(), [reader(5, 'UTC', { stripeAccess: false })]);
  assert.equal(unpaid.jobsCreated, 0); assert.match(unpaid.outcomes[0].dropped[0].reason, /Paid access/);
  const gone = await publish(makePlan([reader(6, 'UTC')]), fakeProvider(), memoryLedger(), []);
  assert.equal(gone.outcomes[0].outcome, 'no_audience');
});

test('an unanswered submission is never repeated blindly', async () => {
  const plan = makePlan(solo);
  const lost = fakeProvider('timeout'), ledger = memoryLedger();
  const first = await publish(plan, lost, ledger, solo);
  assert.equal(first.outcomes[0].outcome, 'ambiguous'); assert.equal(first.alerts[0].kind, 'ambiguous_submission');
  assert.deepEqual(currentLedger(ledger.all()).map(e => e.state), ['unknown']);
  const second = await publish(plan, lost, ledger, solo);
  assert.equal(second.outcomes[0].outcome, 'claimed_elsewhere'); assert.deepEqual(second.alerts, [], 'a fresh claim is another worker’s business, not an alarm');
  const later = await publish(plan, lost, ledger, solo, new Date(prepared.getTime() + 10 * 60000));
  assert.equal(later.outcomes[0].outcome, 'skipped_on_record'); assert.equal(later.alerts[0].kind, 'ambiguous_submission');
  assert.equal(lost.requests.length, 1, 'no second submission, however often it runs');
  assert.deepEqual(currentLedger(ledger.all()).map(e => e.state), ['unknown'], 'the unknown intent is kept');
  // If the provider did accept it, the next run finds the job and adopts it.
  const accepted = fakeProvider('timeout-after-accept'), ledger2 = memoryLedger();
  await publish(plan, accepted, ledger2, solo);
  const adopt = await publish(plan, accepted, ledger2, solo);
  assert.equal(adopt.outcomes[0].outcome, 'adopted_existing_job'); assert.equal(accepted.requests.length, 1);
  assert.deepEqual(currentLedger(ledger2.all()).map(e => e.state), ['queued']);
});

test('a refusal is recorded as failed, and a job that does not match what was submitted is held', async () => {
  const plan = makePlan(solo);
  const refused = fakeProvider('reject'), ledger = memoryLedger();
  const r = await publish(plan, refused, ledger, solo);
  assert.equal(r.outcomes[0].outcome, 'rejected'); assert.deepEqual(currentLedger(ledger.all()).map(e => e.state), ['failed']);
  for (const mode of ['wrong-time', 'wrong-audience']) {
    const provider = fakeProvider(mode), l = memoryLedger();
    const result = await publish(plan, provider, l, solo);
    assert.equal(result.outcomes[0].outcome, 'held_mismatch'); assert.equal(result.alerts[0].kind, 'readback_mismatch');
    assert.deepEqual(currentLedger(l.all()).map(e => e.state), ['unknown'], 'a mismatched job is not recorded as queued');
    const again = await publish(plan, provider, l, solo);
    assert.equal(again.outcomes[0].outcome, 'held_mismatch'); assert.equal(again.alerts[0].kind, 'adopted_job_mismatch');
    assert.deepEqual(currentLedger(l.all()).map(e => e.state), ['unknown'], 'a later run does not adopt a job that differs from the recorded intent');
    assert.equal(provider.requests.length, 1);
  }
});

test('two workers publishing the same batch at once create one job, and the other stops safely', async () => {
  for (let round = 0; round < 25; round++) {
    const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
    // A provider and a recheck that each yield, so the two calls truly interleave.
    const slowSchedule = provider.scheduleJob.bind(provider);
    provider.scheduleJob = async request => { await new Promise(r => setTimeout(r, round % 3)); return slowSchedule(request); };
    const slowFind = provider.findJob.bind(provider);
    provider.findJob = async key => { await new Promise(r => setImmediate(r)); return slowFind(key); };
    const [a, b] = await Promise.all([publish(plan, provider, ledger), publish(plan, provider, ledger)]);
    assert.equal(provider.requests.length, 2, 'one submission per cohort, not per worker');
    assert.equal(provider.jobs.size, 2); assert.equal(a.jobsCreated + b.jobsCreated, 2);
    for (const batch of plan.batches) {
      const pair = [a, b].map(r => r.outcomes.find(o => o.deliveryKey === batch.deliveryKey).outcome);
      assert.equal(pair.filter(o => o === 'queued').length, 1, `${batch.timezone}: exactly one worker queues`);
      // The other either lost the claim, or arrived after the job existed and matched it to the intent.
      assert.ok(pair.every(o => ['queued', 'claimed_elsewhere', 'adopted_existing_job'].includes(o)), `${batch.timezone}: the other stands down safely (${pair})`);
      assert.equal(provider.requests.filter(r => r.key === batch.deliveryKey).length, 1);
    }
    assert.deepEqual([...a.alerts, ...b.alerts], []);
    assert.deepEqual(currentLedger(ledger.all()).map(e => e.state), ['queued', 'queued', 'queued']);
    assert.equal(new Set(currentLedger(ledger.all()).map(e => e.providerJobId)).size, 2, 'every member points at the one job for their cohort');
  }
  // The narrowest race: both workers pass every check before either claims.
  const plan = makePlan(solo), provider = fakeProvider(), ledger = memoryLedger();
  let waiting = [], release;
  const gate = new Promise(r => { release = r; });
  const recheck = async ids => { waiting.push(1); if (waiting.length === 2) release(); await gate; return recheckFrom(solo)(ids); };
  const [x, y] = await Promise.all([publishTonight({ plan, provider, ledger, recheck, now: prepared }), publishTonight({ plan, provider, ledger, recheck, now: prepared })]);
  assert.deepEqual([x.outcomes[0].outcome, y.outcomes[0].outcome].sort(), ['claimed_elsewhere', 'queued'], 'both saw no record and no job; the claim lets one through');
  assert.equal(provider.requests.length, 1); assert.equal(provider.jobs.size, 1);
  const noClaim = memoryLedger(); delete noClaim.claim;
  await assert.rejects(publish(makePlan(), fakeProvider(), noClaim), /atomic claim/, 'a ledger without an atomic claim is refused outright');
});

test('with the ledger lost, an existing provider job is adopted only if it fits this plan', async () => {
  const plan = makePlan(), batch = plan.batches.find(b => b.timezone === 'America/New_York');
  const fits = fakeProvider(); fits.jobs.set(batch.deliveryKey, { id: 'job_old', key: batch.deliveryKey, sendAt: batch.sendAt, subscriberIds: ['2'], payloadVersion: batch.payloadVersion, state: 'scheduled' });
  const ledger = memoryLedger();
  const adopted = await publish({ ...plan, batches: [batch] }, fits, ledger);
  assert.equal(adopted.outcomes[0].outcome, 'adopted_existing_job'); assert.equal(fits.requests.length, 0);
  assert.deepEqual(currentLedger(ledger.all()).map(e => [e.subscriberId, e.state]), [['2', 'queued']], 'only the people the job really covers are recorded');
  for (const wrong of [{ sendAt: '2026-11-18T12:30:00.000Z' }, { subscriberIds: ['2', '999'] }, { payloadVersion: 'another-body' }, { subscriberIds: [] }]) {
    const provider = fakeProvider(); provider.jobs.set(batch.deliveryKey, { id: 'job_odd', key: batch.deliveryKey, sendAt: batch.sendAt, subscriberIds: ['1', '2'], payloadVersion: batch.payloadVersion, state: 'scheduled', ...wrong });
    const l = memoryLedger();
    const result = await publish({ ...plan, batches: [batch] }, provider, l);
    assert.equal(result.outcomes[0].outcome, 'held_mismatch'); assert.equal(result.alerts[0].kind, 'adopted_job_mismatch');
    assert.deepEqual(l.all(), [], 'nothing is recorded as queued for a job that does not fit'); assert.equal(provider.requests.length, 0);
  }
});

test('a send time already passed is never made up, and a plan without its body is held', async () => {
  const plan = makePlan(solo), provider = fakeProvider();
  const late = await publish(plan, provider, memoryLedger(), solo, new Date('2026-11-18T07:00:00Z'));
  assert.equal(late.outcomes[0].outcome, 'missed_window'); assert.equal(provider.requests.length, 0);
  const stripped = await publish({ ...plan, payloads: {} }, provider, memoryLedger(), solo);
  assert.equal(stripped.outcomes[0].outcome, 'held'); assert.equal(stripped.alerts[0].kind, 'payload_missing'); assert.equal(provider.requests.length, 0);
  await assert.rejects(publishTonight({ plan: { product: 'other' }, provider, ledger: memoryLedger(), recheck: async () => ({}) }));
  await assert.rejects(publishTonight({ plan, provider, ledger: memoryLedger() }));
});

test('a receipt is recorded only for a recipient the provider names, never inferred from a sent job', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  await publish(plan, provider, ledger);
  const ny = plan.batches.find(b => b.timezone === 'America/New_York');
  const read = at => collectTonightReceipts({ editionKey: plan.editionKey, provider, ledger, now: new Date(at) });
  const states = () => Object.fromEntries(currentLedger(ledger.all()).map(e => [e.subscriberId, e.state]));
  assert.equal((await read('2026-11-18T11:00:00Z')).recorded, 0, 'nothing is assumed before the provider says sent');

  // Scout's case: the campaign reads 'sent' and vouches for one of two recipients.
  provider.send(ny.deliveryKey, { delivered: ['1'] });
  const partial = await read('2026-11-18T12:10:00Z');
  assert.equal(partial.recorded, 1, 'only the recipient the provider named is recorded');
  assert.equal(partial.unobserved, 1);
  assert.deepEqual(partial.missingReceipts.map(m => m.subscriberId), ['2']);
  assert.deepEqual(states(), { 1: 'delivered', 2: 'queued', 3: 'queued' }, 'a sent job is no evidence about subscriber 2');

  // And the alarm keeps saying so, although a cohort-mate came back.
  const alarm = tonightAlarm({ plan, entries: ledger.all(), now: new Date('2026-11-18T12:40:00Z') });
  const unreceipted = alarm.alerts.filter(a => a.kind === 'no_dispatch_receipt' && a.timezone === 'America/New_York');
  assert.equal(unreceipted.length, 1); assert.match(unreceipted[0].reason, /no dispatch receipt for 1 of 2 recipients/);

  // The provider names the second recipient later; now, and only now, it is dispatched.
  provider.send(ny.deliveryKey, { sent: ['2'], delivered: ['1'] });
  assert.equal((await read('2026-11-18T12:20:00Z')).recorded, 1);
  assert.deepEqual(states(), { 1: 'delivered', 2: 'dispatched', 3: 'queued' });
  const settled = await read('2026-11-18T12:25:00Z');
  assert.equal(settled.recorded, 0, 'a second read records nothing new'); assert.equal(settled.unobserved, 0);
  assert.deepEqual(tonightAlarm({ plan, entries: ledger.all(), now: new Date('2026-11-18T12:40:00Z') }).alerts.filter(a => a.timezone === 'America/New_York'), []);
});

test('the alarm: silence is never taken as success', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  const alarm = now => tonightAlarm({ plan, entries: ledger.all(), now: new Date(now) });
  assert.equal(alarm('2026-11-17T12:00:00Z').ok, true, 'a day ahead, nothing is due yet');
  assert.deepEqual(alarm('2026-11-17T22:30:00Z').alerts.map(a => [a.kind, a.timezone]), [['not_queued', 'Asia/Bangkok']], 'two hours before the first send, an unqueued batch raises the alarm');
  await publish(plan, provider, ledger);
  assert.equal(alarm('2026-11-17T23:00:00Z').ok, true);
  assert.deepEqual(alarm('2026-11-18T00:45:00Z').alerts.map(a => [a.kind, a.timezone]), [['no_dispatch_receipt', 'Asia/Bangkok']], 'half an hour after a send time with no receipt');
  provider.send(plan.batches[0].deliveryKey, { sent: ['3'] });
  await collectTonightReceipts({ editionKey: plan.editionKey, provider, ledger, now: new Date('2026-11-18T00:50:00Z') });
  assert.equal(alarm('2026-11-18T00:55:00Z').ok, true);
  const lost = memoryLedger(); await publish(makePlan(solo), fakeProvider('timeout'), lost, solo);
  assert.deepEqual(tonightAlarm({ plan: makePlan(solo), entries: lost.all(), now: prepared }).alerts.map(a => a.kind), ['ambiguous_submission']);
  const gapCatalog = { series: [{ id: 'weekly', title: 'Fixture weekly', status: 'airing', total_episodes: 10, day_of_week: 'Wed', air_time_ict: '20:30', episodes: [{ number: 1, airs_at: '2026-11-11T20:30:00+07:00' }] }] };
  const gap = prepareTonightDelivery({ catalog: gapCatalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'fixture', bangkokDate: DATE, lineupVersion: tonightLineup(gapCatalog, DATE).version }, footer, now: prepared, readers: [] });
  assert.deepEqual(tonightAlarm({ plan: gap, entries: [], now: prepared }).alerts.map(a => a.kind), ['evidence_gap'], 'a day with a show expected but unsourced is not a quiet day');
});

test('the publisher holds no credential and makes no network call of its own', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./tonight-delivery.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|mailerlite\.com|api\.stripe|process\.env|Authorization/i);
});
