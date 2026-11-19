import test from 'node:test';
import assert from 'node:assert/strict';
import { tonightLineup, prepareTonightDelivery, deliveryKey } from './tonight.mjs';
import { memoryLedger, currentLedger, publishTonight, collectTonightReceipts } from './tonight-delivery.mjs';
import { createMailerLiteProvider, campaignName, parseCampaignName, audienceDigest } from './tonight-mailerlite.mjs';
import { mockMailerLite } from './mailerlite-mock.mjs';

const KEY = deliveryKey('2026-11-18', 'America/New_York'), PV = 'b'.repeat(64);
const provider = (mock, extra = {}) => createMailerLiteProvider({ http: mock.http, sender: { from: 'hello@example.com', fromName: 'Fixture', replyTo: 'hello@example.com' }, utcTimezoneId: 7, ...extra });
const request = (extra = {}) => ({ key: KEY, sendAt: '2026-11-18T12:00:00.000Z', subscriberIds: ['1', '2'], subject: 'Fixture subject', preheader: 'p', html: '<p>Fixture</p>', text: 'Fixture', payloadVersion: PV, bangkokDate: '2026-11-18', timezone: 'America/New_York', ...extra });
const failOn = (test, answer) => (m, p) => (test(m, p) ? answer : null);

test('the campaign name fixes the delivery key, payload version and intended audience within the provider’s limit', () => {
  const name = campaignName({ bangkokDate: '2026-11-18', timezone: 'America/Argentina/ComodRivadavia', key: KEY, payloadVersion: PV, subscriberIds: ['2', '1'] });
  assert.ok(name.length <= 255);
  assert.deepEqual(parseCampaignName(name), { bangkokDate: '2026-11-18', timezone: 'America/Argentina/ComodRivadavia', key: KEY, payloadVersion: PV, audience: audienceDigest(['1', '2']) });
  assert.equal(audienceDigest(['1', '2']), audienceDigest(['2', '1'])); assert.notEqual(audienceDigest(['1', '2']), audienceDigest(['1']));
  assert.equal(parseCampaignName('Thai GL Weekly · Issue 011'), null);
  assert.throws(() => campaignName({ bangkokDate: '2026-11-18', timezone: 'UTC', key: 'short', payloadVersion: PV, subscriberIds: ['1'] }));
});

test('a cohort becomes one group, one campaign and one schedule, to the minute in UTC', async () => {
  const mock = mockMailerLite(), job = await provider(mock).scheduleJob(request());
  assert.equal(mock.groups.size, 1); assert.equal(mock.campaigns.size, 1);
  const campaign = [...mock.campaigns.values()][0];
  assert.deepEqual([...mock.groups.get(campaign.groupId).members].sort(), ['1', '2']);
  assert.deepEqual(campaign.scheduleBody, { delivery: 'scheduled', schedule: { date: '2026-11-18', hours: '12', minutes: '00', timezone_id: 7 } });
  assert.deepEqual(campaign.emails, [{ subject: 'Fixture subject', from_name: 'Fixture', from: 'hello@example.com', reply_to: 'hello@example.com', content: '<p>Fixture</p>' }], 'no plain-text field is sent: the documented body has none');
  assert.deepEqual({ key: job.key, sendAt: job.sendAt, subscriberIds: [...job.subscriberIds].sort(), payloadVersion: job.payloadVersion, state: job.state, match: job.audienceMatchesIntent, group: job.groupId }, { key: KEY, sendAt: '2026-11-18T12:00:00.000Z', subscriberIds: ['1', '2'], payloadVersion: PV, state: 'scheduled', match: true, group: campaign.groupId });
  assert.equal((await provider(mockMailerLite()).scheduleJob(request({ sendAt: '2026-11-18T03:13:00.000Z' }))).sendAt, '2026-11-18T03:13:00.000Z', 'any whole minute is kept exactly');
});

test('a request the provider cannot honour exactly is refused before anything can send', async () => {
  for (const bad of [{ sendAt: '2026-11-18T12:00:30.000Z' }, { subscriberIds: [] }, { subscriberIds: ['1', '1'] }, { key: 'k' }, { html: '' }, { subscriberIds: ['abc'] }]) {
    const mock = mockMailerLite();
    await assert.rejects(provider(mock).scheduleJob(request(bad)), e => e.definite === true && e.staged.stage === 'none');
    assert.equal(mock.campaigns.size, 0); assert.equal(mock.groups.size, 0);
  }
  // A subscriber the provider will not place (unsubscribed there, say) makes the audience inexact.
  const mock = mockMailerLite({ dropOnAssign: ['2'] });
  await assert.rejects(provider(mock).scheduleJob(request()), e => e.definite === true && /exactly the intended audience/.test(e.message) && e.staged.groupId === [...mock.groups.keys()][0] && e.staged.campaignId === null);
  assert.equal(mock.campaigns.size, 0, 'no campaign is created for an inexact group');
});

test('a response of the wrong shape is never taken as an answer', async () => {
  const cases = [
    [failOn((m, p) => m === 'POST' && p === '/api/campaigns', { status: 201, json: { id: '5', name: 'no envelope' } }), 'campaign_unknown'],
    [failOn((m, p) => m === 'POST' && p === '/api/campaigns', { status: 201, json: { data: { name: 'no id' } } }), 'campaign_unknown'],
    [failOn((m, p) => m === 'POST' && p === '/api/campaigns', { status: 204, json: null }), 'campaign_unknown'],
    [failOn((m, p) => /\/schedule$/.test(p), { status: 200, json: {} }), 'schedule_unknown'],
  ];
  for (const [fail, stage] of cases) {
    const mock = mockMailerLite({ fail });
    await assert.rejects(provider(mock).scheduleJob(request()), e => e.definite === false && e.staged.stage === stage && Boolean(e.staged.groupId), stage);
  }
  // In the group stage nothing can send yet, so a malformed listing is a refusal that keeps the group id.
  for (const answer of [{ status: 200, json: { data: [{ id: '1' }, { id: '2' }] } }, { status: 200, json: { data: [{}], meta: { next_cursor: null } } }, { status: 200, json: { data: [], meta: { next_cursor: 7 } } }]) {
    const mock = mockMailerLite({ fail: failOn((m, p) => m === 'GET' && /\/api\/groups\/\d+\/subscribers/.test(p), answer) });
    await assert.rejects(provider(mock).scheduleJob(request()), e => e.definite === true && Boolean(e.staged.groupId) && e.staged.campaignId === null);
    assert.equal(mock.campaigns.size, 0);
  }
});

test('a refusal leaves nothing that can send; no answer is unknown; every staged id is kept', async () => {
  const refusedCreate = mockMailerLite({ fail: failOn((m, p) => m === 'POST' && p === '/api/campaigns', { status: 422, json: { message: 'invalid' } }) });
  await assert.rejects(provider(refusedCreate).scheduleJob(request()), e => e.definite === true && e.staged.stage === 'group_verified' && Boolean(e.staged.groupId) && e.staged.campaignId === null);
  assert.equal(refusedCreate.campaigns.size, 0);
  for (const answer of ['throw', { status: 500, json: {} }, { status: 429, json: {} }, { status: 408, json: {} }]) {
    const silent = mockMailerLite({ fail: failOn((m, p) => m === 'POST' && p === '/api/campaigns', answer) });
    await assert.rejects(provider(silent).scheduleJob(request()), e => e.definite === false && e.staged.stage === 'campaign_unknown' && Boolean(e.staged.groupId));
  }
  // A refused schedule leaves a draft. It is removed, and the removal is read back, before this counts as a refusal.
  const refusedSchedule = mockMailerLite({ fail: failOn((m, p) => /\/schedule$/.test(p), { status: 422, json: {} }) });
  await assert.rejects(provider(refusedSchedule).scheduleJob(request()), e => e.definite === true && e.staged.stage === 'draft_removed_verified' && e.staged.campaignId === null && /^\d+$/.test(e.staged.removedCampaignId) && Boolean(e.staged.groupId));
  assert.equal(refusedSchedule.campaigns.size, 0);
  assert.deepEqual(refusedSchedule.log.slice(-3).map(([m]) => m), ['GET', 'DELETE', 'GET'], 'read, delete, read again');
  // If the delete fails, or reports success while the draft is still there, the outcome is unknown and the draft's id is kept.
  for (const options of [{ fail: (m, p) => (/\/schedule$/.test(p) ? { status: 422, json: {} } : m === 'DELETE' && /^\/api\/campaigns\/\d+$/.test(p) ? { status: 500, json: {} } : null) }, { ignoreDelete: true, fail: failOn((m, p) => /\/schedule$/.test(p), { status: 422, json: {} }) }]) {
    const stuck = mockMailerLite(options);
    await assert.rejects(provider(stuck).scheduleJob(request()), e => e.definite === false && e.staged.stage === 'draft_lingering' && /^\d+$/.test(e.staged.campaignId));
    assert.equal(stuck.campaigns.size, 1); assert.equal((await provider(stuck).findJob(KEY)).state, 'draft', 'a draft is found, and it is not a queued job');
  }
  // Scheduled, but the readback fails: unknown, with both ids.
  let reads = 0;
  const unread = mockMailerLite({ fail: (m, p) => (m === 'GET' && /^\/api\/campaigns\/\d+$/.test(p) && ++reads ? 'throw' : null) });
  await assert.rejects(provider(unread).scheduleJob(request()), e => e.definite === false && e.staged.stage === 'scheduled_unread' && Boolean(e.staged.campaignId) && Boolean(e.staged.groupId));
});

test('a job is found again by its key across pages; a failed page fails the lookup; two under one key are never adopted', async () => {
  const mock = mockMailerLite(), p = provider(mock);
  assert.equal(await p.findJob(KEY), null);
  for (let i = 0; i < 150; i++) mock.campaigns.set(`n${i}`, { id: String(5000 + i), name: `Thai GL Weekly · Issue ${i}`, status: 'ready', filter: [], groupId: null });
  assert.equal(await p.findJob(KEY), null, 'other campaigns in the account are ignored');
  const made = await p.scheduleJob(request());
  const found = await p.findJob(KEY);
  assert.deepEqual([found.id, found.key, found.sendAt, found.payloadVersion, [...found.subscriberIds].sort()], [made.id, KEY, made.sendAt, PV, ['1', '2']], 'found on the second page');
  assert.equal(await p.findJob(deliveryKey('2026-11-18', 'Asia/Bangkok')), null);
  const broken = mockMailerLite({ fail: failOn((m, pth) => m === 'GET' && pth.startsWith('/api/campaigns?') && /page=2/.test(pth), { status: 500, json: {} }) });
  for (let i = 0; i < 150; i++) broken.campaigns.set(`n${i}`, { id: String(5000 + i), name: `Other ${i}`, status: 'ready', filter: [], groupId: null });
  await assert.rejects(provider(broken).findJob(KEY), /no clear answer/, 'a partial listing is never read as "not found"');
  const noMeta = mockMailerLite({ fail: failOn((m, pth) => m === 'GET' && pth.startsWith('/api/campaigns?'), { status: 200, json: { data: [] } }) });
  await assert.rejects(provider(noMeta).findJob(KEY), /page information/);
  await p.scheduleJob(request()); // a second campaign under the same key, as a bug or a race at the provider would leave
  const conflict = await p.findJob(KEY);
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.duplicateIds.length, 2); assert.deepEqual(conflict.subscriberIds, []);
  await assert.rejects(p.findJob('not-a-key'));
});

test('the provider group is only ever compared with the audience fixed at creation', async () => {
  const mock = mockMailerLite(), p = provider(mock), job = await p.scheduleJob(request());
  assert.equal(job.audienceMatchesIntent, true); assert.equal(job.intendedAudience, audienceDigest(['1', '2']));
  mock.groups.get(job.groupId).members.add('77'); // someone changes the group behind the adapter's back
  const drifted = await p.findJob(KEY);
  assert.equal(drifted.audienceMatchesIntent, false); assert.equal(drifted.intendedAudience, audienceDigest(['1', '2']), 'the record of who was meant does not move with the group');
  assert.deepEqual([...drifted.subscriberIds].sort(), ['1', '2', '77']);
});

// The adapter under the real publisher: one plan, the mock account, an in-memory ledger.
const DATE = '2026-11-18', prepared = new Date('2026-11-17T10:00:00Z');
const catalog = { series: [{ id: 'dated', title: 'Fixture dated', status: 'airing', total_episodes: 10, platforms: [{ name: 'Stream', url: 'https://example.com/dated' }], episodes: [{ number: 5, airs_at: `${DATE}T20:30:00+07:00` }] }] };
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: prepared.toISOString(), ...extra });
const readers = [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok')];
const makePlan = () => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'fixture', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version },
  footer: { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}', postalAddressByProvider: true }, now: prepared, readers });
const recheck = list => async ids => Object.fromEntries(list.filter(r => ids.includes(r.memberId)).map(r => [r.memberId, r]));
const publish = (plan, p, ledger, now = prepared) => publishTonight({ plan, provider: p, ledger, recheck: recheck(readers), now });

test('the plan for this provider prints the postal address once: the provider’s', () => {
  const plan = makePlan(), body = plan.payloads[plan.batches[0].payloadRef];
  assert.match(body.html, /href="\{\$unsubscribe\}"/); assert.match(body.html, /Turn it off in your settings/);
  assert.doesNotMatch(body.html, /Thai GL Weekly · \d/, 'no address line of our own beside the provider’s footer');
  assert.ok(body.text.length > 100, 'the generated plain text is kept with the plan for review, though the provider sends its own fallback');
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'f', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version }, footer: { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}' }, now: prepared, readers }), /postal address/);
});

test('through the publisher: one job per cohort, adopted on a second run and with the ledger lost', async () => {
  const mock = mockMailerLite(), p = provider(mock), ledger = memoryLedger(), plan = makePlan();
  const first = await publish(plan, p, ledger);
  assert.deepEqual(first.outcomes.map(o => [o.timezone, o.outcome]), [['Asia/Bangkok', 'queued'], ['America/New_York', 'queued']]); assert.deepEqual(first.alerts, []);
  assert.equal(mock.campaigns.size, 2); assert.equal(mock.groups.size, 2);
  const ny = [...mock.campaigns.values()].find(c => /America\/New_York/.test(c.name));
  assert.equal(ny.scheduled_for, '2026-11-18 12:00:00'); assert.deepEqual([...mock.groups.get(ny.groupId).members].sort(), ['1', '2']);
  assert.equal(ny.emails[0].content, plan.payloads[plan.batches.find(b => b.timezone === 'America/New_York').payloadRef].html, 'the frozen body is what is sent');
  assert.ok(currentLedger(ledger.all()).every(e => e.state === 'queued' && /^\d+$/.test(e.providerJobId) && /^\d+$/.test(e.providerGroupId)), 'the ledger keeps the provider’s job and group ids beside its own record of the audience');
  const second = await publish(plan, p, ledger);
  assert.deepEqual(second.outcomes.map(o => o.outcome), ['adopted_existing_job', 'adopted_existing_job']); assert.equal(mock.campaigns.size, 2);
  const amnesia = await publish(plan, p, memoryLedger());
  assert.equal(amnesia.jobsCreated, 0); assert.equal(mock.campaigns.size, 2, 'the provider’s own record stops a second campaign');
});

test('through the publisher: staged ids reach the ledger, a draft is never adopted, and a drifted group is held', async () => {
  const mock = mockMailerLite({ fail: failOn((m, p) => /\/schedule$/.test(p), 'throw') }), ledger = memoryLedger(), plan = makePlan();
  const first = await publish(plan, provider(mock), ledger);
  assert.deepEqual(first.outcomes.map(o => [o.outcome, o.providerStage]), [['ambiguous', 'schedule_unknown'], ['ambiguous', 'schedule_unknown']]);
  assert.ok(currentLedger(ledger.all()).every(e => e.state === 'unknown' && /^\d+$/.test(e.providerJobId) && /^\d+$/.test(e.providerGroupId)), 'the draft and group left behind are on record');
  const later = await publish(plan, provider(mock), ledger, new Date(prepared.getTime() + 10 * 60000));
  assert.deepEqual(later.outcomes.map(o => o.outcome), ['held_mismatch', 'held_mismatch'], 'a draft with no schedule does not match the intent');
  assert.equal(mock.campaigns.size, 2, 'and no second campaign is created beside it');
  const refusing = mockMailerLite({ fail: failOn((m, p) => m === 'POST' && p === '/api/campaigns', { status: 422, json: {} }) }), l2 = memoryLedger();
  const refused = await publish(plan, provider(refusing), l2);
  assert.deepEqual(refused.outcomes.map(o => o.outcome), ['rejected', 'rejected']);
  assert.ok(currentLedger(l2.all()).every(e => e.state === 'failed' && /^\d+$/.test(e.providerGroupId) && !e.providerJobId), 'a refusal records the group it left and no campaign');
  // A group changed behind our back after queueing: the next run must hold, not adopt.
  const drift = mockMailerLite(), l3 = memoryLedger(), p3 = provider(drift);
  await publish(plan, p3, l3);
  for (const group of drift.groups.values()) group.members.add('77');
  const held = await publish(plan, p3, l3, new Date(prepared.getTime() + 60000));
  assert.deepEqual(held.outcomes.map(o => o.outcome), ['held_mismatch', 'held_mismatch']); assert.equal(held.alerts[0].kind, 'adopted_job_mismatch');
});

test('dispatch is read from status and finished_at; bounces are recorded and nothing is called delivered', async () => {
  const mock = mockMailerLite(), p = provider(mock), ledger = memoryLedger(), plan = makePlan();
  await publish(plan, p, ledger);
  const ny = [...mock.campaigns.values()].find(c => /America\/New_York/.test(c.name));
  assert.equal((await p.getJob(ny.id)).state, 'scheduled');
  ny.status = 'sent';
  assert.equal((await p.getJob(ny.id)).state, 'sending', 'sent without finished_at is not yet a dispatch receipt');
  assert.equal((await collectTonightReceipts({ editionKey: plan.editionKey, provider: p, ledger, now: new Date('2026-11-18T12:01:00Z') })).recorded, 0);
  ny.finished_at = '2026-11-18 12:00:49'; ny.activity = { sent: ['1', '2'], hardbounced: ['2'] }; ny.stats = { sent: 2, deliveries_count: 1, hard_bounces_count: 1, soft_bounces_count: 0 };
  const job = await p.getJob(ny.id);
  assert.equal(job.state, 'sent'); assert.equal(job.finishedAt, '2026-11-18T12:00:49.000Z');
  assert.deepEqual([job.sentSubscriberIds, job.bouncedSubscriberIds], [['1', '2'], ['2']]);
  assert.equal('deliveredSubscriberIds' in job, false, 'sent and not known to have bounced is not called delivered');
  assert.deepEqual(job.aggregate, { sent: 2, deliveries: 1, hardBounces: 1, softBounces: 0 });
  await collectTonightReceipts({ editionKey: plan.editionKey, provider: p, ledger, now: new Date('2026-11-18T12:02:00Z') });
  assert.deepEqual(Object.fromEntries(currentLedger(ledger.all()).map(e => [e.subscriberId, e.state])), { 1: 'dispatched', 2: 'bounced', 3: 'queued' });
  // A bounce query that fails is not "no bounces", and a report row without a subscriber is not skipped.
  const flaky = provider({ http: (m, pth, b) => (/filter\[type\]=softbounced/.test(pth) ? Promise.resolve({ status: 500, json: {} }) : mock.http(m, pth, b)) });
  await assert.rejects(flaky.getJob(ny.id), /no clear answer/);
  const blank = provider({ http: (m, pth, b) => (/filter\[type\]=sent/.test(pth) ? Promise.resolve({ status: 200, json: { data: [{ id: '9' }], meta: { current_page: 1, last_page: 1 } } }) : mock.http(m, pth, b)) });
  await assert.rejects(blank.getJob(ny.id), /without a subscriber id/);
  await assert.rejects(collectTonightReceipts({ editionKey: plan.editionKey, provider: flaky, ledger: memoryLedger(ledger.all().filter(e => e.state === 'queued')), now: new Date() }), /no clear answer/, 'a failed report stops the receipt run; it does not record a guess');
});

test('after queueing, a change is handled by cancelling and reading back a draft; anything less is a hold', async () => {
  const mock = mockMailerLite(), p = provider(mock), job = await p.scheduleJob(request());
  const before = [...mock.groups.get(job.groupId).members].sort();
  assert.deepEqual(await p.cancelJob(job.id), { cancelled: true, hold: false, groupId: job.groupId });
  assert.equal(mock.campaigns.get(job.id).status, 'draft'); assert.deepEqual([...mock.groups.get(job.groupId).members].sort(), before, 'the group is not edited to change a queued campaign');
  assert.deepEqual(await p.cancelJob(job.id), { cancelled: true, hold: false, alreadyDraft: true, groupId: job.groupId });
  // The key is freed only by a verified removal; then a rebuilt job from a newly verified audience may be scheduled.
  assert.deepEqual(await p.removeDraft(job.id), { removed: true, campaignId: job.id, groupId: job.groupId });
  assert.equal(await p.findJob(KEY), null);
  const rebuilt = await p.scheduleJob(request({ subscriberIds: ['1'] }));
  assert.deepEqual(rebuilt.subscriberIds, ['1']); assert.notEqual(rebuilt.groupId, job.groupId, 'the replacement has its own verified group');
  await assert.rejects(p.removeDraft(rebuilt.id), /not a draft/, 'a queued job is never removed as if it were a draft');
  // Too late, refused, unanswered, or cancelled-but-still-ready: each is a hold.
  const sent = mockMailerLite(), ps = provider(sent), js = await ps.scheduleJob(request());
  sent.campaigns.get(js.id).status = 'sent'; assert.match((await ps.cancelJob(js.id)).reason, /Too late/);
  sent.campaigns.get(js.id).finished_at = '2026-11-18 12:00:49'; assert.equal((await ps.cancelJob(js.id)).hold, true);
  for (const options of [{ fail: failOn((m, pth) => /\/cancel$/.test(pth), { status: 422, json: {} }) }, { fail: failOn((m, pth) => /\/cancel$/.test(pth), 'throw') }, { ignoreCancel: true }]) {
    const m2 = mockMailerLite(options), p2 = provider(m2), j2 = await p2.scheduleJob(request());
    const result = await p2.cancelJob(j2.id);
    assert.deepEqual([result.cancelled, result.hold], [false, true], result.reason);
  }
  assert.equal((await provider(mockMailerLite()).cancelJob('424242')).hold, true, 'a job that cannot be read is a hold');
  assert.equal('withdraw' in p, false, 'there is no path that edits a group to change a queued campaign');
});

test('the adapter holds no credential and makes no network call of its own', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./tonight-mailerlite.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|connect\.mailerlite\.com|process\.env|Authorization|Bearer/i);
  assert.throws(() => createMailerLiteProvider({ sender: { from: 'a@example.com', fromName: 'A' }, utcTimezoneId: 1 }), /http/);
  assert.throws(() => createMailerLiteProvider({ http: async () => ({}), utcTimezoneId: 1 }), /sender/);
  assert.throws(() => createMailerLiteProvider({ http: async () => ({}), sender: { from: 'a@example.com', fromName: 'A' } }), /UTC/);
});
