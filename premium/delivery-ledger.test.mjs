import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tonightLineup, prepareTonightDelivery, editionKey as editionKeyFor, deliveryKey } from './tonight.mjs';
import { memoryLedger, currentLedger, publishTonight, withdrawTonight, collectTonightReceipts, tonightAlarm, REMOVED_VERIFIED } from './tonight-delivery.mjs';
import { createMailerLiteProvider } from './tonight-mailerlite.mjs';
import { mockMailerLite } from './mailerlite-mock.mjs';
import { DeliveryLedger, durableLedger, LEDGER_STATES } from './delivery-ledger.mjs';

// Durable Object storage, stood in for by SQLite in memory: the same SQL runs,
// and a transaction that throws is rolled back. Nothing here reaches Cloudflare.
function sqliteStorage(db, hooks) {
  return {
    sql: { exec(query, ...bindings) { if (hooks.failOn?.(query)) throw new Error('storage interrupted'); const rows = db.prepare(query).all(...bindings); return { toArray: () => rows.map(row => ({ ...row })) }; } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
}
// A namespace of ledger objects. Every request builds the object afresh over
// its database, as if it had been evicted in between: only storage carries state.
function ledgerEnv() {
  const dbs = new Map(), hooks = {};
  return { dbs, hooks, DELIVERY_LEDGER: { idFromName: name => name, get: name => ({ fetch: async request => {
    if (!dbs.has(name)) dbs.set(name, new DatabaseSync(':memory:'));
    return new DeliveryLedger({ storage: sqliteStorage(dbs.get(name), hooks) }).fetch(request);
  } }) } };
}

const DATE = '2026-11-18', EDITION = editionKeyFor(DATE), prepared = new Date('2026-11-17T10:00:00Z');
const NY = deliveryKey(DATE, 'America/New_York'), BKK = deliveryKey(DATE, 'Asia/Bangkok');
const catalog = { series: [{ id: 'dated', title: 'Fixture dated', status: 'airing', total_episodes: 10, platforms: [{ name: 'Stream', url: 'https://example.com/dated' }], episodes: [{ number: 5, airs_at: `${DATE}T20:30:00+07:00` }] }] };
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: prepared.toISOString(), ...extra });
const readers = [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok')];
const makePlan = (list = readers) => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'fixture', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version },
  footer: { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}', postalAddressByProvider: true }, now: prepared, readers: list });
const recheck = list => async ids => Object.fromEntries(list.filter(r => ids.includes(r.memberId)).map(r => [r.memberId, r]));
const provider = mock => createMailerLiteProvider({ http: mock.http, sender: { from: 'hello@example.com', fromName: 'Fixture', replyTo: 'hello@example.com' }, utcTimezoneId: 7 });
const open = (env, scope = 'review', edition = EDITION) => durableLedger(env, { scope, editionKey: edition });
const later = minutes => new Date(prepared.getTime() + minutes * 60000);
const failOn = (when, answer) => (m, p) => (when(m, p) ? answer : null);
const count = (env, table, name = `review-tonight-ledger-v1-${EDITION}`) => env.dbs.get(name).prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const states = async ledger => Object.fromEntries(currentLedger(await ledger.list(EDITION)).map(e => [e.subscriberId, e.state]));

// One cohort's intent, as the publisher writes it.
const plan = makePlan(), nyBatch = plan.batches.find(b => b.timezone === 'America/New_York'), bkkBatch = plan.batches.find(b => b.timezone === 'Asia/Bangkok');
const intent = (batch, members = batch.memberIds.map((memberId, i) => ({ memberId, subscriberId: batch.subscriberIds[i] })), extra = {}) =>
  members.map(m => ({ editionKey: EDITION, deliveryKey: batch.deliveryKey, bangkokDate: DATE, timezone: batch.timezone, memberId: m.memberId, subscriberId: m.subscriberId, sendAt: batch.sendAt, payloadVersion: batch.payloadVersion, state: 'unknown', at: prepared.toISOString(), ...extra }));
const store = (ledger, batch) => ledger.putPayload({ editionKey: EDITION, version: batch.payloadVersion, ref: batch.payloadRef, payload: plan.payloads[batch.payloadRef] });

test('the ledger class is not bound, not migrated and not exported by the Worker, and can only append', () => {
  const config = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'), worker = readFileSync(new URL('./worker.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /DeliveryLedger|DELIVERY_LEDGER|delivery-ledger/, 'no binding and no migration in the shipping configuration');
  assert.doesNotMatch(worker, /delivery-ledger|DeliveryLedger|tonight-delivery|tonight-mailerlite/, 'the Worker does not import or export it, or anything that sends');
  const source = readFileSync(new URL('./delivery-ledger.mjs', import.meta.url), 'utf8');
  const sql = [...source.matchAll(/(?:exec|#rows)\('([^']+)'/g)].map(m => m[1]);
  assert.ok(sql.length > 15);
  for (const statement of sql) assert.match(statement, /^(CREATE (TABLE|INDEX) IF NOT EXISTS|INSERT( OR IGNORE)? INTO|SELECT) /, `append and read only: ${statement.slice(0, 40)}`);
  assert.doesNotMatch(source, /\bfetch\s*\(\s*['"`]https?:|process\.env|Authorization|Bearer|connect\.mailerlite\.com/i, 'no network call and no credential');
  assert.throws(() => durableLedger({}, { scope: 'review', editionKey: EDITION }), /not configured/);
  assert.throws(() => durableLedger(ledgerEnv(), { editionKey: EDITION }), /'review' or 'live'/, 'no default scope: live storage is never reached by omission');
  assert.throws(() => durableLedger(ledgerEnv(), { scope: 'review', editionKey: 'x' }), /edition key/);
  assert.ok(LEDGER_STATES.includes('cancelled') && LEDGER_STATES.includes('unknown'));
});

test('the claim is atomic: of many at once exactly one wins, and it survives a restart', async () => {
  const env = ledgerEnv(), ledger = open(env);
  await store(ledger, nyBatch);
  const results = await Promise.all(Array.from({ length: 6 }, () => open(env).claim(NY, intent(nyBatch))));
  assert.deepEqual(results.filter(Boolean).length, 1, 'six workers, one claim');
  const entries = await open(env).list(EDITION);
  assert.deepEqual(entries.map(e => [e.subscriberId, e.state, e.generation, e.seq]), [['1', 'unknown', 1, 1], ['2', 'unknown', 1, 2]], 'the intent is written once, with the claim');
  assert.equal(await open(env).claim(NY, intent(nyBatch)), false, 'and the key stays taken for a worker that starts later');
  assert.equal(count(env, 'claims'), 1); assert.equal(count(env, 'reservations'), 2);
  // Review and live are separate objects, and so is every other edition.
  assert.deepEqual(await open(env, 'live').list(EDITION), []);
  const other = editionKeyFor('2026-11-19');
  assert.deepEqual(await open(env, 'review', other).list(other), []);
  await assert.rejects(open(env).list(other), e => e.code === 'wrong_edition');
  await assert.rejects(open(env, 'review', other).claim(NY, intent(nyBatch)), e => e.code === 'invalid_claim', 'an entry for one edition is refused by another edition’s ledger');
});

test('a claim interrupted part-way leaves nothing behind', async () => {
  const env = ledgerEnv(), ledger = open(env);
  await store(ledger, nyBatch);
  let inserts = 0;
  env.hooks.failOn = query => /^INSERT INTO entries/.test(query) && ++inserts === 2; // after the claim row, both reservations and the first entry
  await assert.rejects(ledger.claim(NY, intent(nyBatch)), /storage interrupted/);
  env.hooks.failOn = null;
  assert.deepEqual([count(env, 'claims'), count(env, 'reservations'), count(env, 'entries')], [0, 0, 0], 'rolled back whole');
  assert.equal(await ledger.claim(NY, intent(nyBatch)), true, 'so the key is still free for a clean attempt');
});

test('a member is reserved to one cohort for the edition, across a zone change', async () => {
  const env = ledgerEnv(), ledger = open(env);
  await store(ledger, nyBatch); await store(ledger, bkkBatch);
  assert.equal(await ledger.claim(NY, intent(nyBatch)), true);
  // Member 1 has since moved to Bangkok time; a later plan puts them in that cohort too.
  const moved = intent(bkkBatch, [{ memberId: 'user_fixture_3', subscriberId: '3' }, { memberId: 'user_fixture_1', subscriberId: '1' }]);
  await assert.rejects(ledger.claim(BKK, moved), e => e.code === 'member_reserved' && e.members.join() === 'user_fixture_1');
  assert.equal(count(env, 'claims'), 1, 'the refused claim wrote nothing');
  // The same subscriber under another member id is the same inbox.
  await assert.rejects(ledger.claim(BKK, intent(bkkBatch, [{ memberId: 'user_fixture_9', subscriberId: '2' }])), e => e.code === 'member_reserved');
  assert.equal(await ledger.claim(BKK, intent(bkkBatch)), true, 'the cohort without them goes ahead');
  // Through the publisher the same fault is a hold with an alert, not a crash and not a second email.
  const env2 = ledgerEnv(), l2 = open(env2), mock = mockMailerLite();
  await store(l2, nyBatch); await l2.claim(NY, intent(nyBatch));
  const movers = [reader(1, 'Asia/Bangkok'), reader(3, 'Asia/Bangkok')];
  const result = await publishTonight({ plan: makePlan(movers), provider: provider(mock), ledger: l2, recheck: recheck(movers), now: prepared });
  assert.deepEqual(result.outcomes.map(o => o.outcome), ['held']); assert.equal(result.alerts[0].kind, 'member_reserved'); assert.equal(mock.campaigns.size, 0);
});

test('a frozen body is stored once under its hash and a claim cannot refer to one that is not on record', async () => {
  const env = ledgerEnv(), ledger = open(env), body = plan.payloads[nyBatch.payloadRef];
  await assert.rejects(ledger.claim(NY, intent(nyBatch)), e => e.code === 'payload_missing');
  assert.deepEqual(await store(ledger, nyBatch), { stored: true });
  assert.deepEqual(await store(ledger, nyBatch), { stored: false, already: true });
  assert.deepEqual(await ledger.getPayload(nyBatch.payloadVersion), { subject: body.subject, preheader: body.preheader, html: body.html, text: body.text });
  await assert.rejects(ledger.putPayload({ editionKey: EDITION, version: nyBatch.payloadVersion, ref: nyBatch.payloadRef, payload: { ...body, subject: 'Another subject' } }), e => e.code === 'payload_conflict');
  await assert.rejects(ledger.putPayload({ editionKey: EDITION, version: nyBatch.payloadVersion, ref: nyBatch.payloadRef, payload: { ...body, html: body.html + '<p>edited</p>' } }), e => e.code === 'payload_hash_mismatch', 'the body must hash to its version');
  assert.equal(await ledger.getPayload(bkkBatch.payloadVersion), null);
  assert.equal(count(env, 'payloads'), 1);
});

test('later states are appended only under a claim, never rewritten, and never backwards past dispatch', async () => {
  const env = ledgerEnv(), ledger = open(env);
  await store(ledger, nyBatch);
  const [one] = intent(nyBatch);
  await assert.rejects(ledger.put({ ...one, state: 'queued' }), e => e.code === 'not_claimed', 'put cannot stand in for a claim');
  await ledger.claim(NY, intent(nyBatch));
  await assert.rejects(ledger.put({ ...one, memberId: 'user_fixture_7', subscriberId: '7', state: 'queued' }), e => e.code === 'not_claimed');
  await assert.rejects(ledger.put({ ...one, sendAt: '2026-11-18T13:00:00.000Z', state: 'queued' }), e => e.code === 'claim_mismatch');
  await assert.rejects(ledger.put({ ...one, state: 'queued', surprise: true }), e => e.code === 'invalid_entry');
  await assert.rejects(ledger.put({ ...one, state: 'sent' }), e => e.code === 'invalid_entry');
  await ledger.put({ ...one, state: 'queued', providerJobId: '1001', providerGroupId: '1000' });
  await ledger.put({ ...one, state: 'dispatched', providerJobId: '1001', providerGroupId: '1000' });
  await assert.rejects(ledger.put({ ...one, state: 'queued' }), e => e.code === 'after_dispatch');
  await assert.rejects(ledger.put({ ...one, state: 'cancelled' }), e => e.code === 'after_dispatch', 'what was dispatched cannot be recorded as cancelled');
  await ledger.put({ ...one, state: 'bounced', providerJobId: '1001' });
  const history = (await ledger.list(EDITION)).filter(e => e.memberId === one.memberId);
  assert.deepEqual(history.map(e => e.state), ['unknown', 'queued', 'dispatched', 'bounced'], 'every state is kept, in order');
  assert.ok(history.every((e, i) => i === 0 || e.seq > history[i - 1].seq) && history.every(e => e.generation === 1 && e.recordedAt));
  const review = await ledger.reconciliation();
  assert.deepEqual([review.cohorts.length, review.cohorts[0].states, review.cohorts[0].intendedSubscriberIds, review.cohorts[0].unresolved.map(u => u.subscriberId)], [1, { bounced: 1, unknown: 1 }, ['1', '2'], ['2']]);
  assert.deepEqual(review.cohorts[0].providerObjects.map(o => [o.providerJobId, o.providerGroupId]), [['1001', '1000'], ['1001', null]]);
});

test('through the publisher: one job per cohort, adopted on a second run, and one job when two workers overlap', async () => {
  const env = ledgerEnv(), mock = mockMailerLite(), ledger = open(env);
  const run = (now = prepared) => publishTonight({ plan: makePlan(), provider: provider(mock), ledger: open(env), recheck: recheck(readers), now });
  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(mock.campaigns.size, 2, 'two cohorts, two campaigns, though two workers ran');
  for (const batch of plan.batches) {
    const pair = [a, b].map(r => r.outcomes.find(o => o.deliveryKey === batch.deliveryKey).outcome).sort();
    assert.ok(pair.includes('queued') && pair.every(o => ['queued', 'claimed_elsewhere', 'adopted_existing_job'].includes(o)), `${batch.timezone}: ${pair}`);
  }
  assert.deepEqual(await states(ledger), { 1: 'queued', 2: 'queued', 3: 'queued' });
  assert.ok(currentLedger(await ledger.list(EDITION)).every(e => /^\d+$/.test(e.providerJobId) && /^\d+$/.test(e.providerGroupId)));
  const again = await run(later(30));
  assert.deepEqual(again.outcomes.map(o => o.outcome), ['adopted_existing_job', 'adopted_existing_job']); assert.equal(again.jobsCreated, 0); assert.equal(mock.campaigns.size, 2);
  assert.equal(count(env, 'payloads'), 2, 'each cohort’s frozen body is on record');
});

test('interrupted around submission: the intent is kept, nothing is sent twice, and the next run reconciles', async () => {
  // No answer when the campaign is created. Nothing exists at the provider.
  const silent = mockMailerLite({ fail: failOn((m, p) => m === 'POST' && p === '/api/campaigns', 'throw') }), env = ledgerEnv(), ledger = open(env), solo = [reader(1, 'America/New_York')];
  const run = (mock, e, now) => publishTonight({ plan: makePlan(solo), provider: provider(mock), ledger: open(e), recheck: recheck(solo), now });
  const first = await run(silent, env, prepared);
  assert.deepEqual([first.outcomes[0].outcome, first.outcomes[0].providerStage], ['ambiguous', 'campaign_unknown']);
  silent.options.fail = null;
  const soon = await run(silent, env, later(2));
  assert.equal(soon.outcomes[0].outcome, 'claimed_elsewhere'); assert.deepEqual(soon.alerts, []);
  const stale = await run(silent, env, later(20));
  assert.equal(stale.outcomes[0].outcome, 'skipped_on_record'); assert.equal(stale.alerts[0].kind, 'ambiguous_submission'); assert.equal(silent.campaigns.size, 0, 'never resubmitted without a person');
  const review = await ledger.reconciliation();
  assert.deepEqual(review.cohorts[0].unresolved.map(u => [u.subscriberId, u.providerStage, /^\d+$/.test(u.providerGroupId)]), [['1', 'campaign_unknown', true]], 'the unresolved intent and the group it left are there to reconcile');

  // Scheduled at the provider, but the worker never hears back.
  let reads = 0;
  const deaf = mockMailerLite({ fail: (m, p) => (m === 'GET' && /^\/api\/campaigns\/\d+$/.test(p) && ++reads === 1 ? 'throw' : null) }), env2 = ledgerEnv();
  assert.equal((await run(deaf, env2, prepared)).outcomes[0].providerStage, 'scheduled_unread');
  assert.deepEqual(await states(open(env2)), { 1: 'unknown' });
  const healed = await run(deaf, env2, later(2));
  assert.equal(healed.outcomes[0].outcome, 'adopted_existing_job'); assert.deepEqual(await states(open(env2)), { 1: 'queued' }); assert.equal(deaf.campaigns.size, 1);

  // The worker stops after the provider accepted and before the ledger heard of it.
  const env3 = ledgerEnv(), mock3 = mockMailerLite(), real = open(env3);
  let armed = true;
  const dying = { ...real, put: async entry => { if (armed && entry.state === 'queued') { armed = false; throw new Error('worker stopped'); } return real.put(entry); } };
  await assert.rejects(publishTonight({ plan: makePlan(solo), provider: provider(mock3), ledger: dying, recheck: recheck(solo), now: prepared }), /worker stopped/);
  assert.deepEqual(await states(real), { 1: 'unknown' }); assert.equal(mock3.campaigns.size, 1);
  const recovered = await run(mock3, env3, later(2));
  assert.equal(recovered.outcomes[0].outcome, 'adopted_existing_job'); assert.deepEqual(await states(real), { 1: 'queued' }); assert.equal(mock3.campaigns.size, 1, 'the job that exists is matched to the intent, not made again');
});

// Queue the fixture edition, then let member 2 opt out before the send.
async function queued(ledger, mock) {
  await publishTonight({ plan: makePlan(), provider: provider(mock), ledger, recheck: recheck(readers), now: prepared });
  const oldJob = currentLedger(await ledger.list(EDITION)).find(e => e.subscriberId === '2').providerJobId;
  return { oldJob, after: [reader(1, 'America/New_York'), reader(2, 'America/New_York', { dailyEmailConsent: false }), reader(3, 'Asia/Bangkok')] };
}
const withdraw = (ledger, mock, list, now = later(60)) => withdrawTonight({ editionKey: EDITION, provider: provider(mock), ledger, recheck: recheck(list), now });
const nyCampaign = mock => [...mock.campaigns.values()].find(c => /America\/New_York/.test(c.name));

for (const [name, makeLedger] of [['durable ledger', () => open(ledgerEnv())], ['in-memory ledger', () => memoryLedger()]]) {
  test(`an opt-out after queueing: cancel, read back, remove, and rebuild for the rest (${name})`, async () => {
    const ledger = makeLedger(), mock = mockMailerLite(), { oldJob, after } = await queued(ledger, mock);
    const untouched = await withdraw(ledger, mock, readers);
    assert.deepEqual(untouched.outcomes.map(o => o.outcome), ['unchanged', 'unchanged']);
    const writesBefore = mock.log.filter(([m]) => m !== 'GET').length;
    await withdraw(ledger, mock, readers);
    assert.equal(mock.log.filter(([m]) => m !== 'GET').length, writesBefore, 'nobody changed, so nothing at the provider is touched');

    const result = await withdraw(ledger, mock, after);
    assert.deepEqual(result.outcomes.map(o => [o.timezone, o.outcome]), [['Asia/Bangkok', 'unchanged'], ['America/New_York', 'rebuilt']]); assert.deepEqual(result.alerts, []);
    assert.equal(mock.campaigns.has(oldJob), false, 'the cancelled draft is gone');
    const replacement = nyCampaign(mock);
    assert.deepEqual([replacement.status, replacement.scheduled_for, [...mock.groups.get(replacement.groupId).members]], ['ready', '2026-11-18 12:00:00', ['1']], 'one replacement, same minute, for exactly who still qualifies');
    assert.equal(replacement.emails[0].content, plan.payloads[nyBatch.payloadRef].html, 'the same frozen body, read from the ledger');
    const current = Object.fromEntries(currentLedger(await ledger.list(EDITION)).map(e => [e.subscriberId, e]));
    assert.deepEqual([current[1].state, current[1].providerJobId, current[2].state, current[2].providerStage, current[2].withdrawnReason, current[3].state], ['queued', replacement.id, 'cancelled', REMOVED_VERIFIED, 'Opted out of the daily email', 'queued']);
    // Later runs see a settled edition: nothing new is made and nothing alarms.
    const publishAgain = await publishTonight({ plan: makePlan(after), provider: provider(mock), ledger, recheck: recheck(after), now: later(90) });
    assert.equal(publishAgain.jobsCreated, 0); assert.equal(mock.campaigns.size, 2);
    assert.deepEqual((await withdraw(ledger, mock, after, later(120))).outcomes.map(o => o.outcome), ['unchanged', 'unchanged']);
    assert.deepEqual(tonightAlarm({ plan, entries: await ledger.list(EDITION), now: new Date('2026-11-18T11:00:00Z') }).alerts.filter(a => a.timezone === 'America/New_York'), [], 'two hours before its send, the rebuilt cohort is on record as queued');
    replacement.status = 'sent'; replacement.finished_at = '2026-11-18 12:00:40'; replacement.activity = { sent: ['1'] };
    await collectTonightReceipts({ editionKey: EDITION, provider: provider(mock), ledger, now: new Date('2026-11-18T12:05:00Z') });
    assert.deepEqual([(await states(ledger))[1], (await states(ledger))[2]], ['dispatched', 'cancelled'], 'the member who opted out is never recorded as sent');
  });
}

test('a withdrawal that cannot be confirmed is a hold: too late, refused, unanswered or still scheduled', async () => {
  for (const [label, sabotage] of [['already sending', mock => { nyCampaign(mock).status = 'sent'; }], ['cancel ignored', mock => { mock.options.ignoreCancel = true; }],
    ['cancel refused', mock => { mock.options.fail = failOn((m, p) => /\/cancel$/.test(p), { status: 422, json: {} }); }], ['cancel unanswered', mock => { mock.options.fail = failOn((m, p) => /\/cancel$/.test(p), 'throw'); }]]) {
    const ledger = open(ledgerEnv()), mock = mockMailerLite(), { oldJob, after } = await queued(ledger, mock);
    sabotage(mock);
    const result = await withdraw(ledger, mock, after);
    const ny = result.outcomes.find(o => o.timezone === 'America/New_York');
    assert.deepEqual([ny.outcome, ny.providerJobId, result.alerts.map(a => a.kind)], ['held_cancel_unconfirmed', oldJob, ['withdrawal_held']], label);
    assert.match(result.alerts[0].reason, /1 member\(s\) who no longer qualify may still receive it/);
    assert.deepEqual(await states(ledger), { 1: 'queued', 2: 'queued', 3: 'queued' }, `${label}: the record still says what the provider holds`);
    assert.equal(mock.campaigns.size, 2, `${label}: nothing is rebuilt beside a job that may still send`);
  }
  // After the send time there is nothing to withdraw from.
  const ledger = open(ledgerEnv()), mock = mockMailerLite(), { after } = await queued(ledger, mock);
  const late = await withdraw(ledger, mock, after, new Date('2026-11-18T12:00:00Z'));
  assert.deepEqual(late.outcomes.map(o => o.outcome), ['past_send_time', 'past_send_time']); assert.equal(mock.log.filter(([m, p]) => /cancel/.test(p)).length, 0);
});

test('a draft that will not go away stops the rebuild, raises the alarm, and is finished on a later run', async () => {
  const ledger = open(ledgerEnv()), mock = mockMailerLite(), { oldJob, after } = await queued(ledger, mock);
  mock.options.ignoreDelete = true;
  const stuck = await withdraw(ledger, mock, after);
  assert.deepEqual([stuck.outcomes[1].outcome, stuck.alerts.map(a => a.kind)], ['cancelled_draft_lingering', ['draft_lingering']]);
  const current = currentLedger(await ledger.list(EDITION)).filter(e => e.deliveryKey === NY);
  assert.deepEqual(current.map(e => [e.subscriberId, e.state, e.providerStage, e.withdrawnReason ?? null]), [['1', 'cancelled', 'cancelled_draft', null], ['2', 'cancelled', 'cancelled_draft', 'Opted out of the daily email']]);
  assert.deepEqual([mock.campaigns.get(oldJob).status, mock.campaigns.size], ['draft', 2], 'the draft sits there; nothing new was made beside it');
  assert.deepEqual(tonightAlarm({ plan, entries: await ledger.list(EDITION), now: later(90) }).alerts.map(a => a.kind), ['cancelled_not_rebuilt']);
  mock.options.ignoreDelete = false;
  const finished = await withdraw(ledger, mock, after, later(90));
  assert.equal(finished.outcomes[1].outcome, 'rebuilt'); assert.equal(mock.campaigns.has(oldJob), false);
  assert.deepEqual(await states(ledger), { 1: 'queued', 2: 'cancelled', 3: 'queued' });
  assert.equal(tonightAlarm({ plan, entries: await ledger.list(EDITION), now: later(100) }).ok, true);
});

test('when everyone in a cohort is withdrawn it is cancelled, removed and settled, with no replacement', async () => {
  const ledger = open(ledgerEnv()), mock = mockMailerLite();
  await publishTonight({ plan: makePlan(), provider: provider(mock), ledger, recheck: recheck(readers), now: prepared });
  const gone = [reader(1, 'America/New_York', { stripeAccess: false }), reader(2, 'Europe/London'), reader(3, 'Asia/Bangkok')];
  const result = await withdraw(ledger, mock, gone);
  assert.deepEqual([result.outcomes[1].outcome, result.outcomes[1].dropped.map(d => d.reason)], ['withdrawn_all', ['Paid access or active paid-group membership no longer holds', 'Delivery time zone changed or is unconfirmed']]);
  assert.equal(nyCampaign(mock), undefined); assert.equal(mock.campaigns.size, 1);
  assert.deepEqual(tonightAlarm({ plan, entries: await ledger.list(EDITION), now: new Date('2026-11-18T11:30:00Z') }).alerts.filter(a => a.timezone === 'America/New_York'), [], 'a cohort withdrawn for cause is settled, not silent');
  // Member 2 now keeps London time. The reservation still stops a second cohort taking them today.
  await assert.rejects(ledger.claim(deliveryKey(DATE, 'Europe/London'), intent({ ...nyBatch, deliveryKey: deliveryKey(DATE, 'Europe/London'), timezone: 'Europe/London' }, [{ memberId: 'user_fixture_2', subscriberId: '2' }])), e => e.code === 'member_reserved');
  // And nobody withdrawn can be brought back by a reclaim.
  await assert.rejects(ledger.reclaim(NY, intent(nyBatch, [{ memberId: 'user_fixture_1', subscriberId: '1' }])), e => e.code === 'not_from_this_cohort');
});

test('a withdrawal interrupted at any step resumes from the ledger, and two at once rebuild once', async () => {
  // Stops after the provider cancelled, before the ledger heard.
  {
    const real = open(ledgerEnv()), mock = mockMailerLite(), { after } = await queued(real, mock);
    let armed = true;
    const dying = { ...real, put: async entry => { if (armed && entry.state === 'cancelled') { armed = false; throw new Error('worker stopped'); } return real.put(entry); } };
    const stopped = await withdraw(dying, mock, after);
    assert.deepEqual([stopped.outcomes.map(o => o.outcome), stopped.alerts.map(a => a.kind)], [['unchanged', 'held_error'], ['withdrawal_error']], 'the other cohort was still checked');
    assert.deepEqual([(await states(real))[1], nyCampaign(mock).status], ['queued', 'draft']);
    assert.equal((await withdraw(real, mock, after, later(70))).outcomes[1].outcome, 'rebuilt');
    assert.deepEqual([await states(real), mock.campaigns.size, nyCampaign(mock).status], [{ 1: 'queued', 2: 'cancelled', 3: 'queued' }, 2, 'ready']);
  }
  // Stops after the draft was removed, before that was recorded.
  {
    const real = open(ledgerEnv()), mock = mockMailerLite(), { after } = await queued(real, mock);
    let armed = true;
    const dying = { ...real, put: async entry => { if (armed && entry.providerStage === REMOVED_VERIFIED) { armed = false; throw new Error('worker stopped'); } return real.put(entry); } };
    const stopped = await withdraw(dying, mock, after);
    assert.deepEqual([stopped.outcomes.map(o => o.outcome), stopped.alerts.map(a => a.kind)], [['unchanged', 'held_error'], ['withdrawal_error']], 'the other cohort was still checked');
    assert.equal(nyCampaign(mock), undefined, 'the draft is gone, and the ledger does not know it yet');
    const resumed = await withdraw(real, mock, after, later(70));
    assert.equal(resumed.outcomes[1].outcome, 'rebuilt', 'a definite "not found" for the draft is its readback');
    assert.deepEqual([await states(real), nyCampaign(mock).status, [...mock.groups.get(nyCampaign(mock).groupId).members]], [{ 1: 'queued', 2: 'cancelled', 3: 'queued' }, 'ready', ['1']]);
  }
  // The replacement gets no answer: it is an unknown intent like any other, never resubmitted blindly.
  {
    const ledger = open(ledgerEnv()), mock = mockMailerLite(), { after } = await queued(ledger, mock);
    mock.options.fail = failOn((m, p) => m === 'POST' && p === '/api/campaigns', 'throw');
    const result = await withdraw(ledger, mock, after);
    assert.deepEqual([result.outcomes[1].outcome, result.alerts.map(a => a.kind)], ['rebuild_ambiguous', ['ambiguous_submission']]);
    mock.options.fail = null;
    const next = await withdraw(ledger, mock, after, later(70));
    assert.deepEqual([next.outcomes[1].outcome, next.alerts.map(a => a.kind)], ['held_unresolved', ['ambiguous_submission']]);
    assert.equal(nyCampaign(mock), undefined, 'no second attempt without a person');
    const entry = currentLedger(await ledger.list(EDITION)).find(e => e.subscriberId === '1');
    assert.deepEqual([entry.state, entry.generation ?? 2, entry.providerStage], ['unknown', 2, 'campaign_unknown']);
  }
  // The ledger refuses a write for one cohort: that cohort is held and said aloud; the run goes on.
  {
    const real = open(ledgerEnv()), mock = mockMailerLite(), { after } = await queued(real, mock);
    const refusing = { ...real, put: async entry => { if (entry.deliveryKey === NY) throw Object.assign(new Error('refused'), { code: 'stale_generation' }); return real.put(entry); } };
    const everyoneOut = after.map(r => ({ ...r, dailyEmailConsent: false }));
    const result = await withdraw(refusing, mock, everyoneOut);
    assert.deepEqual(result.outcomes.map(o => [o.timezone, o.outcome]), [['Asia/Bangkok', 'withdrawn_all'], ['America/New_York', 'held']]);
    assert.deepEqual(result.alerts.map(a => a.kind), ['ledger_refused']);
  }
  // Two workers withdraw at once.
  {
    const env = ledgerEnv(), mock = mockMailerLite(), { after } = await queued(open(env), mock);
    const [a, b] = await Promise.all([withdraw(open(env), mock, after), withdraw(open(env), mock, after)]);
    const both = [a, b].map(r => r.outcomes[1].outcome).sort();
    assert.equal(mock.campaigns.size, 2, `one replacement, not two (${both})`);
    assert.equal([...mock.campaigns.values()].filter(c => /America\/New_York/.test(c.name)).length, 1);
    assert.deepEqual([...mock.groups.get(nyCampaign(mock).groupId).members], ['1']);
  }
});

test('a reclaim is allowed only for a cohort cancelled with its draft’s removal verified', async () => {
  const env = ledgerEnv(), ledger = open(env);
  await store(ledger, nyBatch);
  const members = intent(nyBatch), one = [{ memberId: 'user_fixture_1', subscriberId: '1' }];
  assert.equal(await ledger.reclaim(NY, intent(nyBatch, one)), false, 'nothing to replace');
  await ledger.claim(NY, members);
  assert.equal(await ledger.reclaim(NY, intent(nyBatch, one)), false, 'an intent of unknown outcome is not free to replace');
  for (const m of members) await ledger.put({ ...m, state: 'queued', providerJobId: '1001' });
  assert.equal(await ledger.reclaim(NY, intent(nyBatch, one)), false, 'nor a queued job');
  for (const m of members) await ledger.put({ ...m, state: 'cancelled', providerJobId: '1001', providerStage: 'cancelled_draft', ...(m.subscriberId === '2' ? { withdrawnReason: 'Opted out of the daily email' } : {}) });
  assert.equal(await ledger.reclaim(NY, intent(nyBatch, one)), false, 'nor a cancelled job whose draft may still exist');
  await assert.rejects(ledger.put({ ...members[0], state: 'queued' }), e => e.code === 'cancelled', 'a cancelled member returns only through a reclaim');
  for (const m of members) await ledger.put({ ...m, state: 'cancelled', providerJobId: '1001', providerStage: REMOVED_VERIFIED, ...(m.subscriberId === '2' ? { withdrawnReason: 'Opted out of the daily email' } : {}) });
  await assert.rejects(ledger.reclaim(NY, intent(nyBatch, [{ memberId: 'user_fixture_8', subscriberId: '8' }])), e => e.code === 'not_from_this_cohort', 'never anyone new');
  await assert.rejects(ledger.reclaim(NY, intent(nyBatch, one, { sendAt: '2026-11-18T13:00:00.000Z' })), e => e.code === 'cohort_changed', 'same instant and body');
  const results = await Promise.all([1, 2, 3].map(() => open(env).reclaim(NY, intent(nyBatch, one))));
  assert.equal(results.filter(Boolean).length, 1, 'and exactly one worker gets it');
  // A slower worker that read member 1 before the reclaim cannot now write over the replacement's intent.
  const readEarlier = (await ledger.list(EDITION)).find(e => e.subscriberId === '1' && e.generation === 1 && e.providerStage === REMOVED_VERIFIED);
  const { seq, recordedAt, at, ...stale } = readEarlier;
  await assert.rejects(ledger.put({ ...stale, at: prepared.toISOString(), providerStage: 'cancelled_draft' }), e => e.code === 'stale_generation');
  const review = await ledger.reconciliation();
  assert.deepEqual([review.cohorts[0].generation, review.cohorts[0].intendedSubscriberIds, review.cohorts[0].states, review.entries], [2, ['1'], { cancelled: 1, unknown: 1 }, 9], 'the first generation’s history is all still there');
});
