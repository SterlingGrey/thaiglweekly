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
    send(key, delivered) { const job = jobs.get(key); job.state = 'sent'; job.deliveredSubscriberIds = delivered; },
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
  assert.equal(second.outcomes[0].outcome, 'skipped_on_record'); assert.equal(lost.requests.length, 1, 'no second submission');
  assert.equal(second.alerts[0].kind, 'ambiguous_submission');
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

test('receipts move a job from queued to dispatched and delivered', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  await publish(plan, provider, ledger);
  const ny = plan.batches.find(b => b.timezone === 'America/New_York');
  assert.equal((await collectTonightReceipts({ editionKey: plan.editionKey, provider, ledger, now: new Date('2026-11-18T11:00:00Z') })).recorded, 0, 'nothing is assumed before the provider says sent');
  provider.send(ny.deliveryKey, ['1']);
  const read = await collectTonightReceipts({ editionKey: plan.editionKey, provider, ledger, now: new Date('2026-11-18T12:10:00Z') });
  assert.equal(read.recorded, 2);
  const states = Object.fromEntries(currentLedger(ledger.all()).map(e => [e.subscriberId, e.state]));
  assert.deepEqual(states, { 1: 'delivered', 2: 'dispatched', 3: 'queued' });
  assert.equal((await collectTonightReceipts({ editionKey: plan.editionKey, provider, ledger, now: new Date('2026-11-18T12:20:00Z') })).recorded, 0, 'a second read records nothing new');
});

test('the alarm: silence is never taken as success', async () => {
  const plan = makePlan(), provider = fakeProvider(), ledger = memoryLedger();
  const alarm = now => tonightAlarm({ plan, entries: ledger.all(), now: new Date(now) });
  assert.equal(alarm('2026-11-17T12:00:00Z').ok, true, 'a day ahead, nothing is due yet');
  assert.deepEqual(alarm('2026-11-17T22:30:00Z').alerts.map(a => [a.kind, a.timezone]), [['not_queued', 'Asia/Bangkok']], 'two hours before the first send, an unqueued batch raises the alarm');
  await publish(plan, provider, ledger);
  assert.equal(alarm('2026-11-17T23:00:00Z').ok, true);
  assert.deepEqual(alarm('2026-11-18T00:45:00Z').alerts.map(a => [a.kind, a.timezone]), [['no_dispatch_receipt', 'Asia/Bangkok']], 'half an hour after a send time with no receipt');
  provider.send(plan.batches[0].deliveryKey, ['3']);
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
