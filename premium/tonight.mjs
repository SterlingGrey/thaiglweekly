// Tonight in Bangkok: the daily member email. Preparation only.
// This module has no provider client, credential, fetch or send. It turns the
// Tracker catalogue into one day's lineup, one member-zone view and one email
// body, and prepares zone cohorts for a later, separately approved delivery.
import { createHash } from 'node:crypto';
import { episodeTiming } from './schedule-time.mjs';
import { localSendInstant } from './delivery-plan.mjs';

const BANGKOK = 'Asia/Bangkok';
const SITE = 'https://thaiglweekly.com/';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
// A usual-slot listing is dropped once the last sourced episode is this old.
const USUAL_SLOT_MAX_GAP_DAYS = 28;

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function zoneName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) throw new Error('Choose a named time zone');
  return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
}

/** Calendar date in Bangkok for an instant. */
export function bangkokDateAt(instant) {
  const ms = +new Date(instant);
  if (!Number.isFinite(ms)) throw new Error('Invalid instant');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: BANGKOK, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const weekdayOf = date => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
const bangkokInstant = (date, time) => new Date(`${date}T${time}:00+07:00`).toISOString();

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function watchLinks(show) {
  const platforms = Array.isArray(show.platforms) ? show.platforms : [];
  return platforms
    .map(p => ({ name: String(p.name || '').trim(), url: p.url ? httpsUrl(p.url) : null, note: String(p.note || '').trim(), preferred: p.preferred === true }))
    .filter(p => p.name)
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || Number(Boolean(b.url)) - Number(Boolean(a.url)));
}

function artwork(show) {
  const image = show.image;
  if (!image || !image.url || image.kind === 'none') return null;
  // Catalogue art is stored site-relative. An email needs an absolute HTTPS address.
  const url = httpsUrl(new URL(image.url, SITE).href);
  if (!url || !url.startsWith(SITE)) return null;
  return { url, kind: image.kind, alt: image.alt || `${show.title} official artwork`, credit: image.permission || null };
}

function describe(show) {
  return {
    showId: show.id,
    title: show.title,
    pairing: show.pairing || null,
    cast: show.pairing_actors || null,
    studio: show.studio || null,
    logline: show.logline || null,
    totalEpisodes: Number.isInteger(show.total_episodes) ? show.total_episodes : null,
    watch: watchLinks(show),
    image: artwork(show),
    trackerUrl: `${SITE}tracker.html#card-${encodeURIComponent(show.id)}`,
  };
}

/**
 * One Bangkok calendar day's lineup.
 *
 * confirmed: an episode row in the catalogue carries this date. If the row is
 *   marked time_unverified the date is kept and no clock time is given.
 * usualSlot: the show has premiered, has not reached its last episode, has no
 *   sourced episode dated today or later, and today is its stated weekly day.
 *   It is offered as "usual slot, not confirmed" and never as a fact. Shows
 *   skip weeks, so no episode number is stated.
 */
export function tonightLineup(catalog, date) {
  if (!validDate(date)) throw new Error('Choose a Bangkok date as YYYY-MM-DD');
  const weekday = weekdayOf(date);
  const confirmed = [], usualSlot = [], held = [];
  for (const show of catalog?.series || []) {
    if (!show?.id || !show.title) continue;
    const timed = (show.episodes || []).map(ep => ({ ep, timing: episodeTiming(ep) })).filter(x => x.timing);
    const today = timed.filter(x => x.timing.date === date);
    for (const { ep, timing } of today) {
      // The catalogue stores Bangkok wall time. Any other offset would make the
      // stored calendar date a different Bangkok day, so it is held, not shifted.
      if (!/\+07:00$/.test(ep.airs_at)) { held.push({ showId: show.id, reason: 'Episode time is not stored in Bangkok time' }); continue; }
      confirmed.push({
        ...describe(show), basis: 'confirmed', episode: ep.number,
        isPremiere: ep.number === 1,
        isFinale: Number.isInteger(show.total_episodes) && ep.number === show.total_episodes,
        instant: timing.timeConfirmed ? timing.instant : null,
        timeConfirmed: timing.timeConfirmed,
      });
    }
    if (today.length) continue;
    if (show.day_of_week !== weekday || !/^([01]\d|2[0-3]):[0-5]\d$/.test(show.air_time_ict || '')) continue;
    if (!timed.length) continue; // Announced titles with no sourced episode never get a slot.
    const past = timed.filter(x => x.timing.date < date);
    const future = timed.filter(x => x.timing.date > date);
    if (!past.length || future.length) continue; // Not premiered yet, or the sourced schedule already says when it returns.
    const last = past.reduce((a, b) => (a.timing.date > b.timing.date ? a : b));
    const lastNumber = Math.max(...past.map(x => x.ep.number));
    if (Number.isInteger(show.total_episodes) && lastNumber >= show.total_episodes) continue; // Run complete.
    if (show.status === 'wrapped' || show.status === 'library') continue;
    const gapDays = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${last.timing.date}T00:00:00Z`)) / DAY_MS);
    if (gapDays > USUAL_SLOT_MAX_GAP_DAYS) { held.push({ showId: show.id, reason: `No sourced episode for ${gapDays} days; usual slot not offered` }); continue; }
    usualSlot.push({
      ...describe(show), basis: 'usual_slot', episode: null, isPremiere: false, isFinale: false,
      instant: bangkokInstant(date, show.air_time_ict), timeConfirmed: false,
      lastSourcedEpisode: lastNumber, lastSourcedDate: last.timing.date,
    });
  }
  // Timed rows first in air order; date-only rows after them. Plain comparison,
  // because locale collation does not order ISO instants against a sentinel.
  const byTime = (a, b) => (a.instant === null) - (b.instant === null)
    || (a.instant < b.instant ? -1 : a.instant > b.instant ? 1 : 0) || a.title.localeCompare(b.title);
  confirmed.sort(byTime); usualSlot.sort(byTime);
  return {
    date, weekday, timezone: BANGKOK, confirmed, usualSlot, held,
    catalogGeneratedAt: catalog?.generated_at || null,
    catalogVerifiedAt: catalog?.verified_at || null,
    empty: confirmed.length === 0 && usualSlot.length === 0,
  };
}

const clock = (instant, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(instant));
const dayLabel = (instant, zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(instant));
const zoneAbbr = (instant, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')?.value || zone;
const localDateKey = (instant, zone) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

/** The same lineup as one member sees it, in their confirmed time zone. */
export function memberView(lineup, { timezone, sendAt }) {
  const zone = zoneName(timezone);
  const sent = +new Date(sendAt);
  if (!Number.isFinite(sent)) throw new Error('A send instant is required');
  const view = item => {
    const base = { ...item, bangkokDate: lineup.date };
    if (!item.instant) return { ...base, local: null, bangkok: null, aired: null, dayDiffers: null };
    const dayGap = Math.round((Date.parse(`${localDateKey(item.instant, zone)}T00:00:00Z`) - Date.parse(`${localDateKey(sent, zone)}T00:00:00Z`)) / DAY_MS);
    const local = { time: clock(item.instant, zone), day: dayLabel(item.instant, zone), zone: zoneAbbr(item.instant, zone),
      relative: dayGap === 0 ? 'today' : dayGap === 1 ? 'tomorrow' : dayGap === -1 ? 'yesterday' : null };
    const bangkok = { time: clock(item.instant, BANGKOK), day: dayLabel(item.instant, BANGKOK) };
    return { ...base, local, bangkok, aired: Date.parse(item.instant) <= sent, dayDiffers: localDateKey(item.instant, zone) !== lineup.date };
  };
  return { ...lineup, memberTimezone: zone, sendAt: new Date(sent).toISOString(), confirmed: lineup.confirmed.map(view), usualSlot: lineup.usualSlot.map(view) };
}

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function whenLine(item) {
  if (item.basis === 'confirmed' && !item.timeConfirmed) return { main: 'Today in Bangkok', sub: 'The date is announced. The time is not confirmed.' };
  const main = `${item.local.time} ${item.local.zone}`;
  // The member reads this at the send instant, which may be the evening before.
  const where = item.local.relative === 'today' ? 'today, your time' : `${item.local.relative ? `${item.local.relative}, ` : ''}${item.local.day}, your time`;
  const bangkok = `${item.bangkok.time} in Bangkok, ${item.bangkok.day}`;
  if (item.basis === 'usual_slot') return { main: `Usually ${main}`, sub: `${where} · ${bangkok}` };
  return { main, sub: `${item.aired ? 'Aired in Thailand already · ' : ''}${where} · ${bangkok}` };
}

function episodeLine(item) {
  if (item.basis === 'usual_slot') return item.lastSourcedEpisode ? `Last sourced episode: ${item.lastSourcedEpisode}${item.totalEpisodes ? ` of ${item.totalEpisodes}` : ''}` : 'Next episode';
  const of = item.totalEpisodes ? ` of ${item.totalEpisodes}` : '';
  const tag = item.isPremiere ? ' · Premiere' : item.isFinale ? ' · Finale' : '';
  return `Episode ${item.episode}${of}${tag}`;
}

const REGION = 'Check your region. This email does not confirm playback, subtitles or price in your country.';

function cardHtml(item) {
  const when = whenLine(item);
  const primary = item.watch.find(w => w.url);
  const others = item.watch.filter(w => w !== primary).map(w => w.name);
  const art = item.image
    ? `<tr><td style="padding:0 0 14px 0;"><img src="${esc(item.image.url)}" alt="${esc(item.image.alt)}" width="${item.image.kind === 'poster' ? 220 : 536}" style="display:block;width:100%;max-width:${item.image.kind === 'poster' ? 220 : 536}px;height:auto;border:0;border-radius:6px;margin:0 auto;"></td></tr>`
    : '';
  const button = primary
    ? `<tr><td style="padding:14px 0 0 0;"><a href="${esc(primary.url)}" style="display:inline-block;background:#d4a15a;color:#1c0b31;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:11px 20px;border-radius:4px;">Watch on ${esc(primary.name)}</a></td></tr>`
    : `<tr><td style="padding:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#b9b9d0;">No official watch link is on file yet.</td></tr>`;
  const rail = item.basis === 'usual_slot' ? '#5c5c78' : item.isPremiere ? '#4ade80' : '#d4a15a';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a24;border:1px solid #2e2e3e;border-left:4px solid ${rail};border-radius:8px;margin:0 0 18px 0;"><tr><td style="padding:18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${art}
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#d4a15a;">${esc(episodeLine(item))}</td></tr>
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:#ffffff;padding:4px 0 2px 0;">${esc(item.title)}</td></tr>
${item.cast || item.pairing ? `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#b9b9d0;">${esc(item.cast || item.pairing)}</td></tr>` : ''}
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;padding:12px 0 2px 0;">${esc(when.main)}</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#b9b9d0;">${esc(when.sub)}</td></tr>
${item.logline ? `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#e8e8f0;padding:12px 0 0 0;">${esc(item.logline)}</td></tr>` : ''}
${button}
${others.length ? `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#b9b9d0;padding:10px 0 0 0;">Also listed: ${esc(others.join(', '))}</td></tr>` : ''}
${primary?.note ? `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9a9ab6;padding:10px 0 0 0;">${esc(primary.note)}</td></tr>` : ''}
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9a9ab6;padding:10px 0 0 0;"><a href="${esc(item.trackerUrl)}" style="color:#d4a15a;">Open in the Tracker</a></td></tr>
</table></td></tr></table>`;
}

function cardText(item) {
  const when = whenLine(item);
  const primary = item.watch.find(w => w.url);
  return [`${item.title} · ${episodeLine(item)}`, `${when.main} (${when.sub})`, item.cast || item.pairing || null,
    primary ? `Watch on ${primary.name}: ${primary.url}` : 'No official watch link is on file yet.', `Tracker: ${item.trackerUrl}`].filter(Boolean).join('\n');
}

/**
 * Email body for one member-zone view. Returns null on a day with nothing to
 * list: on those days no email is prepared.
 */
export function renderTonightEmail(view) {
  if (!view?.memberTimezone) throw new Error('Render a member view, not a raw lineup');
  if (view.empty) return null;
  const headDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${view.date}T12:00:00Z`));
  const names = [...view.confirmed, ...view.usualSlot].map(i => i.title);
  const lead = view.confirmed[0] || view.usualSlot[0];
  // A subject line never states a usual slot as a fact.
  const unconfirmedOnly = view.confirmed.length === 0;
  const subject = (names.length === 1 ? `Tonight in Bangkok: ${names[0]}` : `Tonight in Bangkok: ${names[0]} and ${names.length - 1} more`)
    + (unconfirmedOnly ? ' (usual slot, not confirmed)' : '');
  const preheader = lead.local
    ? `${lead.title} ${unconfirmedOnly ? 'usually airs at' : 'at'} ${lead.local.time} ${lead.local.zone}${names.length > 1 ? `, plus ${names.slice(1).join(', ')}` : ''}.`
    : `${names.join(', ')}.`;
  const hasArt = [...view.confirmed, ...view.usualSlot].some(i => i.image);
  const section = (title, note, items) => items.length ? `<tr><td style="padding:8px 24px 0 24px;">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d4a15a;margin:0 0 4px 0;">${esc(title)}</p>
${note ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#b9b9d0;margin:0 0 12px 0;">${esc(note)}</p>` : '<div style="height:8px;line-height:8px;">&nbsp;</div>'}
${items.map(cardHtml).join('\n')}</td></tr>` : '';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0f0f14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0f0f14;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#14141c;border:1px solid #2e2e3e;border-radius:10px;">
<tr><td style="padding:26px 24px 6px 24px;border-bottom:1px solid #2e2e3e;">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d4a15a;margin:0;">Thai GL Weekly · Full Access</p>
<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:38px;color:#ffffff;margin:6px 0 4px 0;font-weight:normal;">Tonight in Bangkok</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#b9b9d0;margin:0 0 16px 0;">${esc(headDay)} · your times are ${esc(view.memberTimezone.replace(/_/g, ' '))}</p>
</td></tr>
<tr><td style="height:14px;line-height:14px;">&nbsp;</td></tr>
${section('On tonight', null, view.confirmed)}
${section('Usual slot, not confirmed', 'These shows normally air on this day. No source has confirmed an episode for today, and shows do skip weeks. Check before you settle in.', view.usualSlot)}
<tr><td style="padding:6px 24px 24px 24px;">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#b9b9d0;margin:0 0 10px 0;">${esc(REGION)}</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#b9b9d0;margin:0 0 10px 0;"><a href="${SITE}tracker.html" style="color:#d4a15a;">Open the full Tracker</a></p>
${hasArt ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#8888a8;margin:0;">Artwork is official promotional art, shown to identify each series. Rights remain with the studios and platforms.</p>` : ''}
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [`TONIGHT IN BANGKOK · ${headDay}`, `Times shown for ${view.memberTimezone.replace(/_/g, ' ')}.`, '',
    ...(view.confirmed.length ? ['ON TONIGHT', '', ...view.confirmed.flatMap(i => [cardText(i), ''])] : []),
    ...(view.usualSlot.length ? ['USUAL SLOT, NOT CONFIRMED', 'These shows normally air on this day. No source has confirmed an episode for today.', '', ...view.usualSlot.flatMap(i => [cardText(i), ''])] : []),
    REGION, `Full Tracker: ${SITE}tracker.html`].join('\n');
  return { subject, preheader, html, text, contentHash: createHash('sha256').update(html).digest('hex') };
}

// Thai prime time starts at about 20:00 in Bangkok. The send time is chosen
// against that fixed reference, not the day's lineup, so each zone keeps one
// habit: the morning when the first broadcast is still ahead, otherwise the
// evening before. Sterling left the timing to Jarvis on 16 November 2026.
const PRIME_TIME_BANGKOK = '20:00';
const MORNING = '07:00', EVENING_BEFORE = '19:00', MARGIN_MS = 30 * 60000;
const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * When a member in this zone is sent the email for one Bangkok date.
 * Morning (07:00 local) if that instant falls on the Bangkok date and at least
 * half an hour before prime time; otherwise 19:00 local on the evening before.
 */
export function tonightSendInstant(bangkokDate, timezone) {
  if (!validDate(bangkokDate)) throw new Error('Choose a Bangkok date as YYYY-MM-DD');
  const zone = zoneName(timezone);
  const latest = Date.parse(bangkokInstant(bangkokDate, PRIME_TIME_BANGKOK)) - MARGIN_MS;
  const pick = (time) => {
    let best = null;
    for (const days of [-1, 0, 1]) {
      let instant;
      try { instant = localSendInstant(shiftDate(bangkokDate, days), time, zone); } catch { continue; }
      const ms = Date.parse(instant);
      if (ms <= latest && (!best || ms > Date.parse(best.sendAt))) best = { sendAt: instant, localDate: shiftDate(bangkokDate, days), localTime: time };
    }
    return best;
  };
  const morning = pick(MORNING);
  if (morning && bangkokDateAt(morning.sendAt) === bangkokDate) return { ...morning, slot: 'morning' };
  const evening = pick(EVENING_BEFORE);
  if (evening && Date.parse(evening.sendAt) > Date.parse(`${shiftDate(bangkokDate, -1)}T00:00:00+07:00`)) return { ...evening, slot: 'evening_before' };
  throw new Error('No send time before the broadcast in this zone');
}

/**
 * Prepare one Bangkok date's delivery. Each confirmed zone becomes a cohort at
 * its own send instant. Nothing is scheduled, sent or changed. A date with an
 * empty lineup prepares no email for anyone.
 */
export function prepareTonightDelivery({ catalog, bangkokDate, readers, approval, now = new Date(), leadHours = 6 }) {
  if (!validDate(bangkokDate)) throw new Error('Choose a Bangkok date as YYYY-MM-DD');
  if (!Array.isArray(readers) || !Number.isFinite(+now) || !Number.isFinite(leadHours) || leadHours < 2) throw new Error('Invalid delivery input');
  // The lineup is facts from the catalogue, but a person still releases each day.
  if (!approval || approval.status !== 'approved' || typeof approval.receipt !== 'string' || !approval.receipt.trim() || approval.bangkokDate !== bangkokDate) throw new Error('An owner approval receipt for this date is required');
  const lineup = tonightLineup(catalog, bangkokDate);
  const cohorts = new Map(), held = [], seenMembers = new Set(), seenSubscribers = new Set();
  for (const reader of readers) {
    if (!reader?.memberId || !/^\d+$/.test(reader.subscriberId || '')) throw new Error('Member and MailerLite subscriber mapping required');
    if (seenMembers.has(reader.memberId) || seenSubscribers.has(reader.subscriberId)) throw new Error('Duplicate member or subscriber mapping');
    seenMembers.add(reader.memberId); seenSubscribers.add(reader.subscriberId);
    const hold = reason => held.push({ memberId: reader.memberId, reason });
    const age = +now - Date.parse(reader.eligibilityCheckedAt);
    if (!Number.isFinite(age) || age < 0 || age > 15 * 60000) { hold('Eligibility snapshot missing or stale'); continue; }
    if (reader.stripeAccess !== true || reader.mailerliteStatus !== 'active' || reader.inPaidGroup !== true) { hold('Paid access and active paid-group membership required'); continue; }
    if (reader.dailyEmailConsent !== true) { hold('Reader has not opted in to the daily email'); continue; }
    if (reader.timezoneConfirmed !== true) { hold('Reader has not confirmed a delivery time zone'); continue; }
    let zone, send;
    try { zone = zoneName(reader.timezone); send = tonightSendInstant(bangkokDate, zone); }
    catch { hold('Invalid zone or no local send time before the broadcast'); continue; }
    if (Date.parse(send.sendAt) - +now < leadHours * 3600000) { hold('Preparation deadline missed; no automatic immediate or next-day send'); continue; }
    let cohort = cohorts.get(zone);
    if (!cohort) {
      const email = renderTonightEmail(memberView(lineup, { timezone: zone, sendAt: send.sendAt }));
      cohort = { timezone: zone, ...send, bangkokDate, email, subscriberIds: [], status: 'prepared_not_scheduled' };
      cohorts.set(zone, cohort);
    }
    cohort.subscriberIds.push(reader.subscriberId);
  }
  const batches = [];
  for (const cohort of cohorts.values()) {
    if (!cohort.email) continue;
    const { email, ...rest } = cohort;
    batches.push({ ...rest, subscriberIds: cohort.subscriberIds.sort(), subject: email.subject, contentHash: email.contentHash,
      // One key per content, Bangkok date and zone: a second attempt with the same key is a duplicate.
      sendKey: createHash('sha256').update(JSON.stringify(['tonight', email.contentHash, bangkokDate, cohort.timezone])).digest('hex') });
  }
  batches.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  return { status: 'prepared_not_scheduled', product: 'tonight-in-bangkok', generatedAt: now.toISOString(), approvalReceipt: approval.receipt, bangkokDate,
    quietDay: lineup.empty, batches, held,
    prepareBy: batches.length ? new Date(Date.parse(batches[0].sendAt) - leadHours * 3600000).toISOString() : null,
    requiredReadbacks: ['Exact audience contains only these currently eligible, opted-in subscriber IDs', 'One campaign per zone cohort at the exact UTC instant, with its own content hash', 'Entitlement, consent and zone rechecked immediately before dispatch', 'A stored receipt per send key before any retry; mailbox delivery verified separately'],
    mutations: 0 };
}
