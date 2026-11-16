import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDateAt, tonightLineup, memberView, renderTonightEmail, tonightSendInstant, prepareTonightDelivery } from './tonight.mjs';

// Synthetic catalogue. No real title, person or schedule is asserted here.
const show = (id, extra = {}) => ({ id, title: `Fixture ${id}`, pairing: 'Fixture pair', status: 'airing', total_episodes: 10, platforms: [], episodes: [], ...extra });
const ep = (number, date, time = '20:30', extra = {}) => ({ number, airs_at: `${date}T${time}:00+07:00`, ...extra });
const catalog = { generated_at: '2026-11-15T00:00:00Z', verified_at: '2026-10-22', series: [
  show('dated', { episodes: [ep(4, '2026-11-11'), ep(5, '2026-11-18')], image: { url: 'assets/series/dated.jpg', kind: 'poster', permission: 'Fixture permission' },
    platforms: [{ name: 'Broadcast', note: 'No link' }, { name: 'Stream', url: 'https://example.com/watch?a=1&b=2', preferred: true, note: 'Fixture note' }, { name: 'Bad', url: 'http://insecure.example/' }] }),
  show('dateonly', { episodes: [ep(1, '2026-11-18', '20:30', { time_unverified: true })] }),
  show('weekly', { day_of_week: 'Sun', air_time_ict: '22:30', episodes: [ep(1, '2026-11-08', '22:30')] }),
  show('skipper', { day_of_week: 'Sat', air_time_ict: '22:25', episodes: [ep(9, '2026-11-07', '22:25'), ep(10, '2026-11-21', '22:25')] }),
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

test('confirmed rows are listed; a date-only row keeps its date and gains no clock time', () => {
  const lineup = tonightLineup(catalog, '2026-11-18');
  assert.deepEqual(ids(lineup.confirmed), ['dated', 'dateonly']);
  const [dated, dateonly] = lineup.confirmed;
  assert.equal(dated.episode, 5); assert.equal(dated.instant, '2026-11-18T13:30:00.000Z'); assert.equal(dated.timeConfirmed, true);
  assert.equal(dateonly.instant, null); assert.equal(dateonly.timeConfirmed, false); assert.equal(dateonly.isPremiere, true);
  assert.ok(lineup.held.some(h => h.showId === 'wrongoffset'));
  assert.ok(lineup.held.some(h => h.showId === 'stale'));
});

test('a usual slot is offered only for a premiered, unfinished show with no sourced date ahead', () => {
  assert.deepEqual(ids(tonightLineup(catalog, '2026-11-18').usualSlot), [], 'finished, announced, stale and unpremiered shows never get a slot');
  const sunday = tonightLineup(catalog, '2026-11-22');
  assert.deepEqual(ids(sunday.usualSlot), ['weekly']);
  assert.equal(sunday.usualSlot[0].episode, null, 'no episode number is guessed');
  assert.equal(sunday.usualSlot[0].instant, '2026-11-22T15:30:00.000Z');
  assert.equal(sunday.usualSlot[0].lastSourcedEpisode, 1);
  assert.deepEqual(ids(tonightLineup(catalog, '2026-11-14').usualSlot), [], 'a show whose sourced schedule names a later date is not guessed onto a skipped week');
  assert.deepEqual(ids(tonightLineup(catalog, '2026-11-21').confirmed), ['skipper']);
  assert.equal(tonightLineup(catalog, '2026-11-21').confirmed[0].isFinale, true);
});

test('a day with nothing listed is empty and prepares no email', () => {
  const lineup = tonightLineup(catalog, '2026-11-16');
  assert.equal(lineup.empty, true);
  assert.equal(renderTonightEmail(memberView(lineup, { timezone: 'UTC', sendAt: '2026-11-16T07:00:00Z' })), null);
  assert.throws(() => tonightLineup(catalog, '2026-02-30'));
  assert.throws(() => renderTonightEmail(lineup), /member view/);
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

test('the email is escaped, absolute, honest about unconfirmed rows and free of placeholders', () => {
  const view = memberView(tonightLineup(catalog, '2026-11-18'), { timezone: 'America/New_York', sendAt: '2026-11-18T12:00:00Z' });
  const email = renderTonightEmail(view);
  assert.equal(email.subject, 'Tonight in Bangkok: Fixture dated and 1 more');
  assert.match(email.html, /https:\/\/thaiglweekly\.com\/assets\/series\/dated\.jpg/);
  assert.match(email.html, /href="https:\/\/example\.com\/watch\?a=1&amp;b=2"/);
  assert.doesNotMatch(email.html, /insecure\.example/, 'only HTTPS watch links are linked');
  assert.match(email.html, /The time is not confirmed/);
  assert.match(email.html, /Check your region/);
  for (const body of [email.html, email.text]) assert.doesNotMatch(body, /undefined|null|NaN|\[object/);
  assert.doesNotMatch(email.html, /(src|href)="(?!https:\/\/)/, 'no relative or non-HTTPS address reaches an inbox');
  assert.equal(email.contentHash.length, 64);
  const usual = renderTonightEmail(memberView(tonightLineup(catalog, '2026-11-22'), { timezone: 'America/New_York', sendAt: '2026-11-22T12:00:00Z' }));
  assert.match(usual.subject, /usual slot, not confirmed/);
  assert.match(usual.html, /Usually 10:30 AM EST/);
  assert.doesNotMatch(usual.html, /Episode \d/, 'a usual slot never states an episode as airing');
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
  assert.deepEqual(tonightSendInstant('2026-07-08', 'America/Chicago').slot, 'morning');
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
  const send = tonightSendInstant('2026-11-18', 'America/Los_Angeles');
  const view = memberView(lineup, { timezone: 'America/Los_Angeles', sendAt: send.sendAt });
  assert.equal(view.confirmed[0].local.relative, 'tomorrow'); assert.equal(view.confirmed[0].aired, false);
  assert.match(renderTonightEmail(view).html, /tomorrow, Wednesday 18 November, your time/);
  const ny = memberView(lineup, { timezone: 'America/New_York', sendAt: tonightSendInstant('2026-11-18', 'America/New_York').sendAt });
  assert.match(renderTonightEmail(ny).html, /today, your time/);
});

const now = new Date('2026-11-17T10:00:00Z');
const approval = { status: 'approved', receipt: 'fixture-owner-receipt', bangkokDate: '2026-11-18' };
const reader = (n, timezone, extra = {}) => ({ memberId: `user_fixture_${n}`, subscriberId: String(n), timezone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: now.toISOString(), ...extra });

test('daily cohorts follow each zone for one Bangkok date and change nothing', () => {
  const plan = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now, readers: [reader(1, 'America/New_York'), reader(2, 'America/New_York'), reader(3, 'Asia/Bangkok'), reader(4, 'Pacific/Honolulu'), reader(5, 'America/Los_Angeles')] });
  assert.equal(plan.status, 'prepared_not_scheduled'); assert.equal(plan.mutations, 0); assert.equal(plan.quietDay, false);
  assert.deepEqual(plan.batches.map(b => [b.timezone, b.slot, b.sendAt, b.subscriberIds]), [
    ['Pacific/Honolulu', 'morning', '2026-11-17T17:00:00.000Z', ['4']],
    ['Asia/Bangkok', 'morning', '2026-11-18T00:00:00.000Z', ['3']],
    ['America/Los_Angeles', 'evening_before', '2026-11-18T03:00:00.000Z', ['5']],
    ['America/New_York', 'morning', '2026-11-18T12:00:00.000Z', ['1', '2']],
  ]);
  assert.ok(plan.batches.every(b => b.bangkokDate === '2026-11-18'));
  assert.equal(plan.prepareBy, '2026-11-17T11:00:00.000Z');
  assert.equal(new Set(plan.batches.map(b => b.sendKey)).size, 4, 'each zone has its own send key');
  const again = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now, readers: [reader(3, 'Asia/Bangkok')] });
  assert.equal(again.batches[0].sendKey, plan.batches[1].sendKey, 'the same content, date and zone always produce the same send key');
  const quiet = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-16', approval: { ...approval, bangkokDate: '2026-11-16' }, now: new Date('2026-11-15T00:00:00Z'), readers: [reader(1, 'UTC', { eligibilityCheckedAt: '2026-11-15T00:00:00Z' })] });
  assert.equal(quiet.quietDay, true); assert.equal(quiet.batches.length, 0); assert.equal(quiet.prepareBy, null);
});

test('unpaid, unsubscribed, unconsenting, unconfirmed, stale and late readers never enter a cohort', () => {
  const readers = [reader(1, 'UTC', { mailerliteStatus: 'unsubscribed' }), reader(2, 'UTC', { stripeAccess: false }), reader(3, 'UTC', { inPaidGroup: false }), reader(4, 'UTC', { timezoneConfirmed: false }),
    reader(5, 'UTC', { dailyEmailConsent: false }), reader(6, 'UTC', { eligibilityCheckedAt: '2026-11-16T00:00:00Z' }), reader(7, 'Mars')];
  const plan = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now, readers });
  assert.equal(plan.batches.length, 0); assert.equal(plan.held.length, 7);
  const late = new Date('2026-11-18T05:00:00Z');
  const held = prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now: late, readers: [reader(8, 'UTC', { eligibilityCheckedAt: late.toISOString() })] });
  assert.match(held.held[0].reason, /deadline/);
});

test('a missing or mismatched approval and duplicate mappings block preparation', () => {
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', now, readers: [] }), /approval/);
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval: { ...approval, status: 'draft' }, now, readers: [] }));
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-19', approval, now, readers: [] }), /approval/);
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now, readers: [reader(1, 'UTC'), reader(1, 'Asia/Bangkok')] }));
  assert.throws(() => prepareTonightDelivery({ catalog, bangkokDate: '2026-11-18', approval, now, readers: [reader(1, 'UTC'), reader(2, 'UTC', { subscriberId: '1' })] }));
});

test('the module prepares only: no network, provider or send call exists in it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./tonight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|mailerlite\.com|api\.stripe/i);
});
