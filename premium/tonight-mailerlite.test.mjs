import test from 'node:test';
import assert from 'node:assert/strict';
import { tonightLineup, prepareTonightDelivery, deliveryKey } from './tonight.mjs';
import { memoryLedger, currentLedger, publishTonight, collectTonightReceipts } from './tonight-delivery.mjs';
import { createMailerLiteProvider, campaignName, parseCampaignName } from './tonight-mailerlite.mjs';

// A pretend MailerLite account held in memory. Nothing here can reach a real service.
function mockMailerLite({ fail = () => null, dropOnAssign = [], staleRecipients = false } = {}) {
  let next = 1000;
  const groups = new Map(), campaigns = new Map(), log = [];
  const ok = (json, status = 200) => ({ status, json });
  const view = c => ({ ...c, recipients_count: staleRecipients ? c.frozenRecipients : (groups.get(c.groupId)?.members.size ?? 0) });
  async function http(method, path, body) {
    log.push([method, path.split('?')[0]]);
    const injected = fail(method, path, body);
    if (injected === 'throw') throw new Error('socket closed');
    if (injected) return injected;
    let m;
    if (method === 'POST' && path === '/api/groups') { const id = String(next++); groups.set(id, { name: body.name, members: new Set() }); return ok({ data: { id, name: body.name } }, 201); }
    if ((m = /^\/api\/subscribers\/(\d+)\/groups\/(\d+)$/.exec(path))) {
      const group = groups.get(m[2]); if (!group) return ok({ message: 'Not found' }, 404);
      if (method === 'POST') { if (!dropOnAssign.includes(m[1])) group.members.add(m[1]); return ok({ data: { id: m[2] } }); }
      if (method === 'DELETE') { group.members.delete(m[1]); return ok(null, 204); }
    }
    if (method === 'GET' && (m = /^\/api\/groups\/(\d+)\/subscribers/.exec(path))) return ok({ data: [...(groups.get(m[1])?.members || [])].map(id => ({ id })), meta: { next_cursor: null } });
    if (method === 'POST' && path === '/api/campaigns') {
      const id = String(next++);
      campaigns.set(id, { id, name: body.name, status: 'draft', scheduled_for: null, finished_at: null, groupId: body.groups[0], filter: [[{ operator: 'in_any', args: ['groups', [body.groups[0]]] }]], emails: body.emails, frozenRecipients: groups.get(body.groups[0]).members.size });
      return ok({ data: view(campaigns.get(id)) }, 201);
    }
    if (method === 'GET' && path.startsWith('/api/campaigns?')) { const status = /filter\[status\]=(\w+)/.exec(path)[1]; return ok({ data: [...campaigns.values()].filter(c => c.status === status).map(view) }); }
    if ((m = /^\/api\/campaigns\/(\d+)\/schedule$/.exec(path)) && method === 'POST') {
      const c = campaigns.get(m[1]); const s = body.schedule;
      c.status = 'ready'; c.scheduled_for = `${s.date} ${s.hours}:${s.minutes}:00`; c.scheduleBody = body; return ok({ data: view(c) });
    }
    if ((m = /^\/api\/campaigns\/(\d+)\/cancel$/.exec(path)) && method === 'POST') { const c = campaigns.get(m[1]); c.status = 'draft'; c.scheduled_for = null; return ok({ data: view(c) }); }
    if ((m = /^\/api\/campaigns\/(\d+)\/reports\/subscriber-activity/.exec(path)) && method === 'GET') { const type = /filter\[type\]=(\w+)/.exec(path)[1]; return ok({ data: (campaigns.get(m[1]).activity?.[type] || []).map(id => ({ subscriber: { id } })) }); }
    if ((m = /^\/api\/campaigns\/(\d+)$/.exec(path))) {
      if (method === 'GET') return campaigns.has(m[1]) ? ok({ data: view(campaigns.get(m[1])) }) : ok({ message: 'Not found' }, 404);
      if (method === 'DELETE') { campaigns.delete(m[1]); return ok(null, 204); }
    }
    return ok({ message: 'Unhandled in mock' }, 500);
  }
  return { http, groups, campaigns, log };
}

const KEY = deliveryKey('2026-11-18', 'America/New_York'), PV = 'b'.repeat(64);
const provider = (mock, extra = {}) => createMailerLiteProvider({ http: mock.http, sender: { from: 'hello@example.com', fromName: 'Fixture', replyTo: 'hello@example.com' }, utcTimezoneId: 7, ...extra });
const request = (extra = {}) => ({ key: KEY, sendAt: '2026-11-18T12:00:00.000Z', subscriberIds: ['1', '2'], subject: 'Fixture subject', preheader: 'p', html: '<p>Fixture</p>', text: 'Fixture', payloadVersion: PV, bangkokDate: '2026-11-18', timezone: 'America/New_York', ...extra });

test('the campaign name carries the delivery key and payload version within the provider’s limit', () => {
  const name = campaignName({ bangkokDate: '2026-11-18', timezone: 'America/Argentina/ComodRivadavia', key: KEY, payloadVersion: PV });
  assert.ok(name.length <= 255); assert.deepEqual(parseCampaignName(name), { bangkokDate: '2026-11-18', timezone: 'America/Argentina/ComodRivadavia', key: KEY, payloadVersion: PV });
  assert.equal(parseCampaignName('Thai GL Weekly · Issue 011'), null);
  assert.throws(() => campaignName({ bangkokDate: '2026-11-18', timezone: 'UTC', key: 'short', payloadVersion: PV }));
});

test('a cohort becomes one group, one campaign and one schedule, to the minute in UTC', async () => {
  const mock = mockMailerLite(), job = await provider(mock).scheduleJob(request());
  assert.equal(mock.groups.size, 1); assert.equal(mock.campaigns.size, 1);
  const campaign = [...mock.campaigns.values()][0];
  assert.deepEqual([...mock.groups.get(campaign.groupId).members].sort(), ['1', '2']);
  assert.deepEqual(campaign.scheduleBody, { delivery: 'scheduled', schedule: { date: '2026-11-18', hours: '12', minutes: '00', timezone_id: 7 } });
  assert.deepEqual(campaign.emails, [{ subject: 'Fixture subject', from_name: 'Fixture', from: 'hello@example.com', reply_to: 'hello@example.com', content: '<p>Fixture</p>' }]);
  assert.deepEqual({ key: job.key, sendAt: job.sendAt, subscriberIds: [...job.subscriberIds].sort(), payloadVersion: job.payloadVersion, state: job.state }, { key: KEY, sendAt: '2026-11-18T12:00:00.000Z', subscriberIds: ['1', '2'], payloadVersion: PV, state: 'scheduled' });
  const odd = await provider(mockMailerLite()).scheduleJob(request({ sendAt: '2026-11-18T03:13:00.000Z' }));
  assert.equal(odd.sendAt, '2026-11-18T03:13:00.000Z', 'any whole minute is kept exactly');
});

test('a request the provider cannot honour exactly is refused before anything can send', async () => {
  for (const bad of [{ sendAt: '2026-11-18T12:00:30.000Z' }, { subscriberIds: [] }, { key: 'k' }, { html: '' }, { subscriberIds: ['abc'] }]) {
    const mock = mockMailerLite();
    await assert.rejects(provider(mock).scheduleJob(request(bad)), e => e.definite === true);
    assert.equal(mock.campaigns.size, 0); assert.equal(mock.groups.size, 0);
  }
  // A subscriber the provider will not place (unsubscribed there, say) makes the audience inexact.
  const mock = mockMailerLite({ dropOnAssign: ['2'] });
  await assert.rejects(provider(mock).scheduleJob(request()), e => e.definite === true && /exactly the intended audience/.test(e.message));
  assert.equal(mock.campaigns.size, 0, 'no campaign is created for an inexact group');
});

test('a refusal creates nothing; no answer is reported as unknown, never as refused', async () => {
  const refusedCreate = mockMailerLite({ fail: (m, p) => (m === 'POST' && p === '/api/campaigns' ? { status: 422, json: { message: 'invalid' } } : null) });
  await assert.rejects(provider(refusedCreate).scheduleJob(request()), e => e.definite === true);
  assert.equal(refusedCreate.campaigns.size, 0);
  for (const answer of ['throw', { status: 500, json: {} }, { status: 429, json: {} }]) {
    const silent = mockMailerLite({ fail: (m, p) => (m === 'POST' && p === '/api/campaigns' ? answer : null) });
    await assert.rejects(provider(silent).scheduleJob(request()), e => e.definite !== true);
  }
  const refusedSchedule = mockMailerLite({ fail: (m, p) => (/\/schedule$/.test(p) ? { status: 422, json: {} } : null) });
  await assert.rejects(provider(refusedSchedule).scheduleJob(request()), e => e.definite === true && /draft was removed/.test(e.message));
  assert.equal(refusedSchedule.campaigns.size, 0, 'the unscheduled draft does not linger');
  const stuck = mockMailerLite({ fail: (m, p) => (/\/schedule$/.test(p) ? { status: 422, json: {} } : m === 'DELETE' && /^\/api\/campaigns\/\d+$/.test(p) ? { status: 500, json: {} } : null) });
  await assert.rejects(provider(stuck).scheduleJob(request()), e => e.definite !== true);
  assert.equal(stuck.campaigns.size, 1);
  assert.equal((await provider(stuck).findJob(KEY)).state, 'draft', 'the lingering draft is visible to the next lookup');
});

test('a job is found again by its key, and two under one key are never adopted', async () => {
  const mock = mockMailerLite(), p = provider(mock);
  assert.equal(await p.findJob(KEY), null);
  mock.campaigns.set('1', { id: '1', name: 'Thai GL Weekly · Issue 012', status: 'ready', filter: [], frozenRecipients: 0 });
  assert.equal(await p.findJob(KEY), null, 'other campaigns in the account are ignored');
  const made = await p.scheduleJob(request());
  const found = await p.findJob(KEY);
  assert.deepEqual([found.id, found.key, found.sendAt, found.payloadVersion, [...found.subscriberIds].sort()], [made.id, KEY, made.sendAt, PV, ['1', '2']]);
  assert.equal(await p.findJob(deliveryKey('2026-11-18', 'Asia/Bangkok')), null);
  await p.scheduleJob(request()); // a second campaign under the same key, as a bug or a race at the provider would leave
  const conflict = await p.findJob(KEY);
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.duplicateIds.length, 2); assert.deepEqual(conflict.subscriberIds, []);
  await assert.rejects(p.findJob('not-a-key'));
});

// The adapter under the real publisher: one plan, the mock account, an in-memory ledger.
const DATE = '2026-11-18', prepared = new Date('2026-11-17T10:00:00Z');
const catalog = { series: [{ id: 'dated', title: 'Fixture dated', status: 'airing', total_episodes: 10, platforms: [{ name: 'Stream', url: 'https://example.com/dated' }], episodes: [{ number: 5, airs_at: `${DATE}T20:30:00+07:00` }] }] };
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: prepared.toISOString(), ...extra });
const readers = [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok')];
const makePlan = () => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'fixture', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version },
  footer: { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}', postalAddressByProvider: true }, now: prepared, readers });
const recheck = list => async ids => Object.fromEntries(list.filter(r => ids.includes(r.memberId)).map(r => [r.memberId, r]));

test('the plan for this provider prints the postal address once: the provider’s', () => {
  const plan = makePlan(), body = plan.payloads[plan.batches[0].payloadRef];
  assert.match(body.html, /href="\{\$unsubscribe\}"/); assert.match(body.html, /Turn it off in your settings/);
  assert.doesNotMatch(body.html, /Thai GL Weekly · \d/, 'no address line of our own beside the provider’s footer');
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: { status: 'approved', receipt: 'f', bangkokDate: DATE, lineupVersion: tonightLineup(catalog, DATE).version }, footer: { manageUrl: 'https://example.com/settings', unsubscribeHref: '{$unsubscribe}' }, now: prepared, readers }), /postal address/);
});

test('through the publisher: one job per cohort, adopted on a second run and with the ledger lost', async () => {
  const mock = mockMailerLite(), p = provider(mock), ledger = memoryLedger(), plan = makePlan();
  const first = await publishTonight({ plan, provider: p, ledger, recheck: recheck(readers), now: prepared });
  assert.deepEqual(first.outcomes.map(o => [o.timezone, o.outcome]), [['Asia/Bangkok', 'queued'], ['America/New_York', 'queued']]); assert.deepEqual(first.alerts, []);
  assert.equal(mock.campaigns.size, 2); assert.equal(mock.groups.size, 2);
  const ny = [...mock.campaigns.values()].find(c => /America\/New_York/.test(c.name));
  assert.equal(ny.scheduled_for, '2026-11-18 12:00:00'); assert.deepEqual([...mock.groups.get(ny.groupId).members].sort(), ['1', '2']);
  assert.equal(ny.emails[0].content, plan.payloads[plan.batches.find(b => b.timezone === 'America/New_York').payloadRef].html, 'the frozen body is what is sent');
  const second = await publishTonight({ plan, provider: p, ledger, recheck: recheck(readers), now: prepared });
  assert.deepEqual(second.outcomes.map(o => o.outcome), ['adopted_existing_job', 'adopted_existing_job']); assert.equal(mock.campaigns.size, 2);
  const amnesia = await publishTonight({ plan, provider: p, ledger: memoryLedger(), recheck: recheck(readers), now: prepared });
  assert.equal(amnesia.jobsCreated, 0); assert.equal(mock.campaigns.size, 2, 'the provider’s own record stops a second campaign');
});

test('through the publisher: an unanswered creation is held, and a lingering draft is never adopted', async () => {
  const mock = mockMailerLite({ fail: (m, p) => (/\/schedule$/.test(p) ? 'throw' : null) }), ledger = memoryLedger(), plan = makePlan();
  const first = await publishTonight({ plan, provider: provider(mock), ledger, recheck: recheck(readers), now: prepared });
  assert.deepEqual(first.outcomes.map(o => o.outcome), ['ambiguous', 'ambiguous']);
  assert.ok(currentLedger(ledger.all()).every(e => e.state === 'unknown'));
  const later = await publishTonight({ plan, provider: provider(mock), ledger, recheck: recheck(readers), now: new Date(prepared.getTime() + 10 * 60000) });
  assert.deepEqual(later.outcomes.map(o => o.outcome), ['held_mismatch', 'held_mismatch'], 'a draft with no schedule does not match the intent');
  assert.equal(mock.campaigns.size, 2, 'and no second campaign is created beside it');
  assert.ok(currentLedger(ledger.all()).every(e => e.state === 'unknown'));
});

test('dispatch is read from status and finished_at; delivery is read per recipient', async () => {
  const mock = mockMailerLite(), p = provider(mock), ledger = memoryLedger(), plan = makePlan();
  await publishTonight({ plan, provider: p, ledger, recheck: recheck(readers), now: prepared });
  const ny = [...mock.campaigns.values()].find(c => /America\/New_York/.test(c.name));
  assert.equal((await p.getJob(ny.id)).state, 'scheduled');
  ny.status = 'sent';
  assert.equal((await p.getJob(ny.id)).state, 'sending', 'sent without finished_at is not yet a dispatch receipt');
  assert.equal((await collectTonightReceipts({ editionKey: plan.editionKey, provider: p, ledger, now: new Date('2026-11-18T12:01:00Z') })).recorded, 0);
  ny.finished_at = '2026-11-18 12:00:49'; ny.activity = { sent: ['1', '2'], hardbounced: ['2'] };
  const job = await p.getJob(ny.id);
  assert.equal(job.state, 'sent'); assert.equal(job.finishedAt, '2026-11-18T12:00:49.000Z'); assert.deepEqual(job.deliveredSubscriberIds, ['1']);
  await collectTonightReceipts({ editionKey: plan.editionKey, provider: p, ledger, now: new Date('2026-11-18T12:02:00Z') });
  assert.deepEqual(Object.fromEntries(currentLedger(ledger.all()).map(e => [e.subscriberId, e.state])), { 1: 'delivered', 2: 'dispatched', 3: 'queued' });
});

test('an opt-out after scheduling leaves the job only if the campaign confirms it; otherwise the job is cancelled', async () => {
  const mock = mockMailerLite(), p = provider(mock), job = await p.scheduleJob(request());
  assert.deepEqual(await p.withdraw(job.id, '2'), { withdrawn: true, cancelled: false, remaining: 1 });
  assert.deepEqual((await p.getJob(job.id)).subscriberIds, ['1']); assert.equal(mock.campaigns.get(job.id).status, 'ready');
  const last = await p.withdraw(job.id, '1');
  assert.equal(last.cancelled, true); assert.equal(mock.campaigns.get(job.id).status, 'draft', 'a cohort with nobody left is not sent');
  // If the provider's campaign does not show the smaller audience, cancelling is the safe side.
  const stale = mockMailerLite({ staleRecipients: true }), q = provider(stale), other = await q.scheduleJob(request());
  const result = await q.withdraw(other.id, '2');
  assert.equal(result.cancelled, true); assert.match(result.reason, /did not confirm/); assert.equal(stale.campaigns.get(other.id).status, 'draft');
  stale.campaigns.get(other.id).status = 'sent'; stale.campaigns.get(other.id).finished_at = '2026-11-18 12:00:49';
  assert.deepEqual(await q.withdraw(other.id, '1'), { withdrawn: false, cancelled: false, reason: 'The job is sent' });
});

test('the adapter holds no credential and makes no network call of its own', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./tonight-mailerlite.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|connect\.mailerlite\.com|process\.env|Authorization|Bearer/i);
  assert.throws(() => createMailerLiteProvider({ sender: { from: 'a@example.com', fromName: 'A' }, utcTimezoneId: 1 }), /http/);
  assert.throws(() => createMailerLiteProvider({ http: async () => ({}), utcTimezoneId: 1 }), /sender/);
  assert.throws(() => createMailerLiteProvider({ http: async () => ({}), sender: { from: 'a@example.com', fromName: 'A' } }), /UTC/);
});
