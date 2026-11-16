import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDateAt, tonightLineup, operatorChecklist, memberView, renderTonightEmail, tonightSendInstant, deliveryKey, editionKey, prepareTonightDelivery } from './tonight.mjs';

// Synthetic catalogue. No real title, person or schedule is asserted here.
const show = (id, extra = {}) => ({ id, title: `Fixture ${id}`, pairing: 'Fixture pair', status: 'airing', total_episodes: 10, platforms: [{ name: 'Stream', url: `https://example.com/${id}`, preferred: true }], episodes: [], ...extra });
const ep = (number, date, time = '20:30', extra = {}) => ({ number, airs_at: `${date}T${time}:00+07:00`, ...extra });
const catalog = { generated_at: '2026-11-15T00:00:00Z', verified_at: '2026-10-22', series: [
  show('dated', { episodes: [ep(4, '2026-11-11'), ep(5, '2026-11-18')], image: { url: 'assets/series/dated.jpg', kind: 'poster', permission: 'Fixture permission' },
    platforms: [{ name: 'Broadcast', note: 'No link' }, { name: 'Stream', url: 'https://example.com/watch?a=1&b=2', preferred: true, note: 'Fixture note' }, { name: 'Bad', url: 'http://insecure.example/' }] }),
  show('dateonly', { episodes: [ep(1, '2026-11-18', '20:30', { time_unverified: true })] }),
  show('weekly', { day_of_week: 'Sun', air_time_ict: '22:30', episodes: [ep(1, '2026-11-08', '22:30')] }),
  show('skipper', { day_of_week: 'Sat', air_time_ict: '22:25', episodes: [ep(9, '2026-11-07', '22:25'), ep(10, '2026-11-21', '22:25')],
    platforms: [{ name: 'Channel', note: 'Broadcast only' }, { name: 'Upload', url: 'https://example.com/ep9', preferred: true, note: 'Official uncut episode 9, part 1 of 4.' }] }),
  show('finished', { day_of_week: 'Wed', air_time_ict: '20:30', total_episodes: 2, episodes: [ep(1, '2026-11-04'), ep(2, '2026-11-11')] }),
  show('announced', { day_of_week: 'Wed', air_time_ict: '20:30', status: 'upcoming' }),
  show('stale', { day_of_week: 'Wed', air_time_ict: '20:30', episodes: [ep(1, '2026-09-02')] }),
  show('unpremiered', { day_of_week: 'Wed', air_time_ict: '20:30', episodes: [ep(1, '2026-12-02')] }),
  show('wrongoffset', { episodes: [{ number: 3, airs_at: '2026-11-18T20:30:00+09:00' }] }),
] };
const ids = list => list.map(i => i.showId);

test('the Bangkok date follows the instant, not the server clock', () => {
  assert.equal(bangkokDateAt('2026-11-18T16:59:59Z'), '2026-11-18');
  assert.equal(bangkokDateAt('2026-11-18T17:00:00Z'), '2026-11-19');
  assert.throws(() => bangkokDateAt('nonsense'));
});

test('only source-confirmed rows are listed; a date-only row is time pending and gains no clock time', () => {
  const lineup = tonightLineup(catalog, '2026-11-18');
  assert.deepEqual(ids(lineup.confirmed), ['dated', 'dateonly']);
  const [dated, dateonly] = lineup.confirmed;
  assert.equal(dated.episode, 5); assert.equal(dated.instant, '2026-11-18T13:30:00.000Z'); assert.equal(dated.timeConfirmed, true);
  assert.equal(dateonly.instant, null); assert.equal(dateonly.timeConfirmed, false); assert.equal(dateonly.isPremiere, true);
  assert.equal(lineup.dayStatus, 'listed');
  assert.deepEqual(lineup.alerts.map(a => [a.showId, a.kind]), [['wrongoffset', 'held']], 'a row stored outside Bangkok time is left out and raised');
  assert.equal(lineup.version.length, 64);
});

test('a usual slot never reaches a member: it becomes an operator check', () => {
  assert.deepEqual(ids(tonightLineup(catalog, '2026-11-18').toVerify), [], 'finished, announced, stale and unpremiered shows are not expected');
  const sunday = tonightLineup(catalog, '2026-11-22');
  assert.deepEqual(ids(sunday.confirmed), []); assert.deepEqual(ids(sunday.toVerify), ['weekly']);
  assert.equal(sunday.dayStatus, 'evidence_gap'); assert.equal(sunday.operatorAlert, true); assert.equal(sunday.empty, true);
  assert.equal(sunday.alerts[0].kind, 'unsourced_usual_slot');
  assert.equal(renderTonightEmail(memberView(sunday, { timezone: 'UTC', sendAt: '2026-11-22T07:00:00Z' })), null, 'no member email is built from a usual slot');
  assert.match(operatorChecklist(sunday), /evidence_gap[\s\S]*CHECK unsourced_usual_slot: weekly/);
  assert.deepEqual(ids(tonightLineup(catalog, '2026-11-14').toVerify), [], 'a show whose sourced schedule names a later date is not expected on a skipped week');
});

test('a checked quiet day is told apart from a day with missing evidence', () => {
  const quiet = tonightLineup(catalog, '2026-11-16');
  assert.equal(quiet.dayStatus, 'quiet_checked'); assert.equal(quiet.operatorAlert, false); assert.equal(quiet.empty, true);
  assert.equal(renderTonightEmail(memberView(quiet, { timezone: 'UTC', sendAt: '2026-11-16T07:00:00Z' })), null);
  assert.match(operatorChecklist(quiet), /quiet_checked[\s\S]*no alerts/);
  assert.throws(() => tonightLineup(catalog, '2026-02-30'));
  assert.throws(() => renderTonightEmail(quiet), /member view/);
});

test('a link that names a different episode is withheld and raised, never offered', () => {
  const saturday = tonightLineup(catalog, '2026-11-21');
  assert.deepEqual(ids(saturday.confirmed), ['skipper']);
  const row = saturday.confirmed[0];
  assert.equal(row.isFinale, true); assert.equal(row.episode, 10);
  assert.equal(row.watch.some(w => w.url), false, 'the episode 9 upload is not the way to watch episode 10');
  assert.deepEqual(saturday.alerts.map(a => a.kind), ['no_watch_link']);
  const email = renderTonightEmail(memberView(saturday, { timezone: 'UTC', sendAt: '2026-11-21T07:00:00Z' }));
  assert.doesNotMatch(email.html, /example\.com\/ep9|episode 9/);
  assert.match(email.html, /No official link for this episode is on file yet/);
  const same = tonightLineup({ ...catalog, series: [show('x', { episodes: [ep(9, '2026-11-21')], platforms: [{ name: 'Upload', url: 'https://example.com/ep9', note: 'Official episode 9.' }] })] }, '2026-11-21');
  assert.equal(same.confirmed[0].watch[0].url, 'https://example.com/ep9', 'a link naming tonight’s episode is kept');
});

test('an unresolved source conflict on a listed show is raised to the operator', () => {
  const lineup = tonightLineup({ series: [show('c', { episodes: [ep(2, '2026-11-18')], conflicts: [{ id: 'k', resolved: false }] })] }, '2026-11-18');
  assert.deepEqual(lineup.alerts.map(a => a.kind), ['open_conflict']); assert.equal(lineup.dayStatus, 'listed');
});

test('each member sees their own clock, the Bangkok clock, and whether it has aired', () => {
  const lineup = tonightLineup(catalog, '2026-11-18');
  const ny = memberView(lineup, { timezone: 'America/New_York', sendAt: '2026-11-18T12:00:00Z' }).confirmed[0];
  assert.equal(ny.local.time, '8:30 AM'); assert.equal(ny.local.zone, 'EST'); assert.equal(ny.bangkok.time, '8:30 PM'); assert.equal(ny.aired, false); assert.equal(ny.dayDiffers, false);
  const la = memberView(lineup, { timezone: 'America/Los_Angeles', sendAt: '2026-11-18T15:00:00Z' }).confirmed[0];
  assert.equal(la.local.time, '5:30 AM'); assert.equal(la.aired, true);
  const sydney = memberView(lineup, { timezone: 'Australia/Sydney', sendAt: '2026-11-17T20:00:00Z' }).confirmed[0];
  assert.equal(sydney.local.time, '12:30 AM'); assert.equal(sydney.dayDiffers, true); assert.match(sydney.local.day, /Thursday 19 November/);
  assert.throws(() => memberView(lineup, { timezone: 'Mars', sendAt: '2026-11-18T12:00:00Z' }));
  assert.throws(() => memberView(lineup, { timezone: 'UTC' }));
});

test('the email is escaped, absolute and free of placeholders', () => {
  const view = memberView(tonightLineup(catalog, '2026-11-18'), { timezone: 'America/New_York', sendAt: '2026-11-18T12:00:00Z' });
  const email = renderTonightEmail(view);
  assert.equal(email.subject, 'Tonight in Bangkok: Fixture dated and 1 more');
  assert.match(email.html, /https:\/\/thaiglweekly\.com\/assets\/series\/dated\.jpg/);
  assert.match(email.html, /href="https:\/\/example\.com\/watch\?a=1&amp;b=2"/);
  assert.doesNotMatch(email.html, /insecure\.example/, 'only HTTPS watch links are linked');
  assert.match(email.html, /Time pending/);
  assert.match(email.html, /Check your region/);
  assert.doesNotMatch(email.html + email.text, /usual slot|not confirmed an episode/i, 'members read confirmed rows only');
  for (const body of [email.html, email.text]) assert.doesNotMatch(body, /undefined|null|NaN|\[object/);
  assert.doesNotMatch(email.html, /(src|href)="(?!https:\/\/)/, 'no relative or non-HTTPS address reaches an inbox');
  assert.equal(email.contentHash.length, 64);
  const hostile = { ...catalog, series: [show('x', { title: '<script>alert(1)</script>', episodes: [ep(1, '2026-11-18')] })] };
  const safe = renderTonightEmail(memberView(tonightLineup(hostile, '2026-11-18'), { timezone: 'UTC', sendAt: '2026-11-18T07:00:00Z' }));
  assert.doesNotMatch(safe.html, /<script>/);
});

test('every zone is sent before Thai prime time: morning where it is still ahead, else the evening before', () => {
  const at = zone => { const s = tonightSendInstant('2026-11-18', zone); return [s.slot, s.localDate, s.localTime, s.sendAt]; };
  assert.deepEqual(at('America/New_York'), ['morning', '2026-11-18', '07:00', '2026-11-18T12:00:00.000Z']);
  assert.deepEqual(at('America/Chicago'), ['evening_before', '2026-11-17', '19:00', '2026-11-18T01:00:00.000Z']);
  assert.deepEqual(at('America/Los_Angeles'), ['evening_before', '2026-11-17', '19:00', '2026-11-18T03:00:00.000Z']);
  assert.deepEqual(at('Pacific/Honolulu'), ['morning', '2026-11-17', '07:00', '2026-11-17T17:00:00.000Z']);
  assert.deepEqual(at('Asia/Bangkok'), ['morning', '2026-11-18', '07:00', '2026-11-18T00:00:00.000Z']);
  assert.deepEqual(at('Australia/Sydney'), ['morning', '2026-11-18', '07:00', '2026-11-17T20:00:00.000Z']);
  assert.deepEqual(at('Pacific/Kiritimati'), ['morning', '2026-11-18', '07:00', '2026-11-17T17:00:00.000Z']);
  // Central time is an hour nearer in summer, so the same member moves to the morning.
  assert.equal(tonightSendInstant('2026-07-08', 'America/Chicago').slot, 'morning');
  const primeTime = Date.parse('2026-11-18T13:00:00Z');
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    const s = tonightSendInstant('2026-11-18', zone);
    assert.ok(Date.parse(s.sendAt) <= primeTime - 30 * 60000, `${zone} is sent before prime time`);
    assert.ok(primeTime - Date.parse(s.sendAt) <= 26 * 3600000, `${zone} is sent within about a day of it`);
  }
  assert.throws(() => tonightSendInstant('2026-11-18', 'Mars'));
  assert.throws(() => tonightSendInstant('18 Nov', 'UTC'));
});

test('a member reading the evening before is told the show is tomorrow', () => {
  const lineup = tonightLineup(catalog, '2026-11-18');
  const view = memberView(lineup, { timezone: 'America/Los_Angeles', sendAt: tonightSendInstant('2026-11-18', 'America/Los_Angeles').sendAt });
  assert.equal(view.confirmed[0].local.relative, 'tomorrow'); assert.equal(view.confirmed[0].aired, false);
  assert.match(renderTonightEmail(view).html, /tomorrow, Wednesday 18 November, your time/);
  const ny = memberView(lineup, { timezone: 'America/New_York', sendAt: tonightSendInstant('2026-11-18', 'America/New_York').sendAt });
  assert.match(renderTonightEmail(ny).html, /today, your time/);
});

const DATE = '2026-11-18';
const now = new Date('2026-11-17T10:00:00Z');
const approve = (cat = catalog, date = DATE) => ({ status: 'approved', receipt: 'fixture-owner-receipt', bangkokDate: date, lineupVersion: tonightLineup(cat, date).version });
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: now.toISOString(), ...extra });
const prepare = extra => prepareTonightDelivery({ catalog, bangkokDate: DATE, approval: approve(), now, readers: [], ...extra });

test('daily cohorts follow each zone for one Bangkok date, keep their payload and change nothing', () => {
  const plan = prepare({ readers: [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok'), reader(4, 'Pacific/Honolulu'), reader(5, 'America/Los_Angeles')] });
  assert.equal(plan.status, 'prepared_not_scheduled'); assert.equal(plan.mutations, 0); assert.equal(plan.dayStatus, 'listed');
  assert.deepEqual(plan.batches.map(b => [b.timezone, b.slot, b.sendAt, b.subscriberIds]), [
    ['Pacific/Honolulu', 'morning', '2026-11-17T17:00:00.000Z', ['4']],
    ['Asia/Bangkok', 'morning', '2026-11-18T00:00:00.000Z', ['3']],
    ['America/Los_Angeles', 'evening_before', '2026-11-18T03:00:00.000Z', ['5']],
    ['America/New_York', 'morning', '2026-11-18T12:00:00.000Z', ['1', '2']],
  ]);
  assert.equal(plan.prepareBy, '2026-11-17T11:00:00.000Z');
  for (const batch of plan.batches) {
    assert.equal(batch.deliveryKey, deliveryKey(DATE, batch.timezone)); assert.equal(batch.editionKey, editionKey(DATE));
    assert.equal(batch.lineupVersion, plan.lineupVersion);
    const payload = plan.payloads[batch.payloadRef];
    assert.ok(payload.html.includes('Tonight in Bangkok') && payload.text && payload.subject === batch.subject, 'the rendered body travels with the plan');
    assert.ok(batch.payloadRef.endsWith(batch.payloadVersion));
    assert.ok(Object.isFrozen(payload));
  }
  assert.equal(new Set(plan.batches.map(b => b.deliveryKey)).size, 4);
  assert.equal(plan.operatorAlerts.length, 1, 'operator alerts ride along with the plan');
});

test('a corrected body keeps the same delivery key, so it cannot become a second send', () => {
  const first = prepare({ readers: [reader(1, 'America/New_York')] });
  const corrected = { ...catalog, series: catalog.series.map(s => s.id === 'dated' ? { ...s, logline: 'Corrected line' } : s) };
  assert.throws(() => prepareTonightDelivery({ catalog: corrected, bangkokDate: DATE, approval: approve(), now, readers: [reader(1, 'America/New_York')] }), /changed since approval/, 'a changed lineup needs a fresh approval');
  const second = prepareTonightDelivery({ catalog: corrected, bangkokDate: DATE, approval: approve(corrected), now, readers: [reader(1, 'America/New_York')] });
  assert.equal(second.batches[0].deliveryKey, first.batches[0].deliveryKey, 'same edition and cohort, same key');
  assert.notEqual(second.batches[0].payloadVersion, first.batches[0].payloadVersion, 'the body version is tracked separately');
  // Once the first body is on the publisher record, the revision is held, not sent alongside it.
  const ledger = [{ deliveryKey: first.batches[0].deliveryKey, memberId: 'user_fixture_1', payloadVersion: first.batches[0].payloadVersion, state: 'queued' }];
  const after = prepareTonightDelivery({ catalog: corrected, bangkokDate: DATE, approval: approve(corrected), now, ledger, readers: [reader(1, 'America/New_York'), reader(2, 'America/New_York')] });
  assert.equal(after.batches.length, 0);
  assert.equal(after.reconcile.length, 1); assert.equal(after.reconcile[0].status, 'held_reconcile_first'); assert.match(after.reconcile[0].reason, /different body/);
  assert.deepEqual(after.reconcile[0].subscriberIds, ['2'], 'only the member not yet on record is even a candidate');
  assert.match(after.held[0].reason, /Already queued or sent/);
  assert.deepEqual(Object.keys(after.payloads), [], 'no payload is issued for a held cohort');
});

test('an ambiguous submission, a zone change or a wider audience never sends to a member twice', () => {
  const first = prepare({ readers: [reader(1, 'America/New_York'), reader(2, 'Asia/Bangkok')] });
  const ny = first.batches.find(b => b.timezone === 'America/New_York');
  const unknown = [{ deliveryKey: ny.deliveryKey, memberId: 'user_fixture_1', payloadVersion: ny.payloadVersion, state: 'unknown' }];
  const retry = prepare({ ledger: unknown, readers: [reader(1, 'America/New_York'), reader(2, 'Asia/Bangkok')] });
  assert.deepEqual(retry.batches.map(b => b.timezone), ['Asia/Bangkok'], 'a submission of unknown outcome is reconciled first, never repeated');
  assert.equal(retry.held.length, 1);
  const moved = prepare({ ledger: [{ deliveryKey: ny.deliveryKey, memberId: 'user_fixture_1', payloadVersion: ny.payloadVersion, state: 'delivered' }], readers: [reader(1, 'America/Los_Angeles')] });
  assert.equal(moved.batches.length, 0, 'a member who changes zone after delivery is not sent again');
  const failed = prepare({ ledger: [{ deliveryKey: ny.deliveryKey, memberId: 'user_fixture_1', payloadVersion: ny.payloadVersion, state: 'failed' }], readers: [reader(1, 'America/New_York')] });
  assert.equal(failed.batches.length, 0); assert.equal(failed.reconcile.length, 1, 'even a recorded failure is read back before a retry is prepared');
  assert.throws(() => prepare({ ledger: [{ deliveryKey: 'k', memberId: 'm', state: 'sent?' }] }), /ledger/);
});

test('unpaid, unsubscribed, unconsenting, unconfirmed, stale and late readers never enter a cohort', () => {
  const readers = [reader(1, 'UTC', { mailerliteStatus: 'unsubscribed' }), reader(2, 'UTC', { stripeAccess: false }), reader(3, 'UTC', { inPaidGroup: false }), reader(4, 'UTC', { timezoneConfirmed: false }),
    reader(5, 'UTC', { dailyEmailConsent: false }), reader(6, 'UTC', { eligibilityCheckedAt: '2026-11-16T00:00:00Z' }), reader(7, 'Mars'), reader(8, 'UTC', { dailyEmailConsent: undefined })];
  const plan = prepare({ readers });
  assert.equal(plan.batches.length, 0); assert.equal(plan.held.length, 8);
  const late = new Date('2026-11-18T05:00:00Z');
  const held = prepare({ now: late, readers: [reader(9, 'UTC', { eligibilityCheckedAt: late.toISOString() })] });
  assert.match(held.held[0].reason, /deadline/);
});

test('a quiet day and a day with missing evidence prepare no email and say which they are', () => {
  const quiet = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-16', approval: approve(catalog, '2026-11-16'), now: new Date('2026-11-15T00:00:00Z'), readers: [reader(1, 'UTC', { eligibilityCheckedAt: '2026-11-15T00:00:00Z' })] });
  assert.equal(quiet.dayStatus, 'quiet_checked'); assert.equal(quiet.batches.length, 0); assert.equal(quiet.prepareBy, null);
  const gap = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-22', approval: approve(catalog, '2026-11-22'), now: new Date('2026-11-21T00:00:00Z'), readers: [reader(1, 'UTC', { eligibilityCheckedAt: '2026-11-21T00:00:00Z' })] });
  assert.equal(gap.dayStatus, 'evidence_gap'); assert.equal(gap.batches.length, 0); assert.equal(gap.operatorAlerts[0].kind, 'unsourced_usual_slot');
});

test('a missing, mismatched or unbound approval and duplicate mappings block preparation', () => {
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: DATE, now, readers: [] }), /approval/);
  assert.throws(() => prepare({ approval: { ...approve(), status: 'draft' } }));
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-19', approval: approve(), now, readers: [] }), /approval/);
  assert.throws(() => prepare({ approval: { ...approve(), lineupVersion: undefined } }), /changed since approval/);
  assert.throws(() => prepare({ readers: [reader(1, 'UTC'), reader(1, 'Asia/Bangkok')] }));
  assert.throws(() => prepare({ readers: [reader(1, 'UTC'), reader(2, 'UTC', { subscriberId: '1' })] }));
});

test('the module prepares only: no network, provider or send call exists in it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./tonight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|mailerlite\.com|api\.stripe/i);
});
