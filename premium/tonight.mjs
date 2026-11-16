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
// The operator is no longer asked to verify a usual slot once the last sourced episode is this old.
const USUAL_SLOT_MAX_GAP_DAYS = 28;

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
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
const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// A link is withheld when it is plainly a link to some other episode: its
// address names an episode number, or it is a single video whose note names
// one. A series page stays linked, but a note that describes another episode
// ("lists episode 1 of 8") is not repeated beside tonight's.
const EPISODE = /episode[\s_-]+(\d{1,3})\b/i;
function episodeNamedIn(text) { const hit = EPISODE.exec(text || ''); return hit ? Number(hit[1]) : null; }
function isSingleVideo(url) {
  try { const u = new URL(url); return (/(^|\.)youtube\.com$/.test(u.hostname) && (u.pathname === '/watch' || u.pathname.startsWith('/shorts/'))) || u.hostname === 'youtu.be'; }
  catch { return false; }
}

function watchLinks(show, episode) {
  const platforms = Array.isArray(show.platforms) ? show.platforms : [];
  return platforms
    .map(p => {
      const name = String(p.name || '').trim();
      let address = p.url || '';
      try { address = decodeURIComponent(address); } catch { /* keep the raw address */ }
      const inUrl = episodeNamedIn(address), inNote = episodeNamedIn(p.note);
      const known = Number.isInteger(episode);
      const otherEpisode = known && ((inUrl !== null && inUrl !== episode) || (isSingleVideo(p.url) && inNote !== null && inNote !== episode));
      const staleNote = known && inNote !== null && inNote !== episode;
      return { name, url: p.url && !otherEpisode ? httpsUrl(p.url) : null, note: staleNote ? '' : String(p.note || '').trim(), preferred: p.preferred === true, linkWithheld: Boolean(p.url && otherEpisode) };
    })
    .filter(p => p.name)
    .sort((a, b) => Number(Boolean(b.url)) - Number(Boolean(a.url)) || Number(b.preferred) - Number(a.preferred));
}

function artwork(show) {
  const image = show.image;
  if (!image || !image.url || image.kind === 'none') return null;
  // Catalogue art is stored site-relative. An email needs an absolute HTTPS address.
  const url = httpsUrl(new URL(image.url, SITE).href);
  if (!url || !url.startsWith(SITE)) return null;
  return { url, kind: image.kind, alt: image.alt || `${show.title} official artwork` };
}

function describe(show, episode) {
  return {
    showId: show.id,
    title: show.title,
    pairing: show.pairing || null,
    cast: show.pairing_actors || null,
    studio: show.studio || null,
    logline: show.logline || null,
    totalEpisodes: Number.isInteger(show.total_episodes) ? show.total_episodes : null,
    watch: watchLinks(show, episode),
    image: artwork(show),
    trackerUrl: `${SITE}tracker.html#card-${encodeURIComponent(show.id)}`,
  };
}

/**
 * One Bangkok calendar day's lineup.
 *
 * confirmed: an episode row in the catalogue carries this date. Only these
 *   reach a member. A row marked time_unverified keeps its date and is shown
 *   as "time pending"; no clock time is invented for it.
 * toVerify: operator checklist, never shown to a member. A show that has
 *   premiered, has not reached its last episode, has no sourced episode dated
 *   today or later and whose stated weekly day is today probably airs, but no
 *   source says so. Each one raises an operator alert.
 * dayStatus: 'listed' (members get an email), 'quiet_checked' (nothing airs and
 *   nothing is in doubt) or 'evidence_gap' (nothing confirmed, but something
 *   needs checking before the day is called quiet).
 */
export function tonightLineup(catalog, date) {
  if (!validDate(date)) throw new Error('Choose a Bangkok date as YYYY-MM-DD');
  const weekday = weekdayOf(date);
  const confirmed = [], toVerify = [], alerts = [];
  for (const show of catalog?.series || []) {
    if (!show?.id || !show.title) continue;
    const timed = (show.episodes || []).map(ep => ({ ep, timing: episodeTiming(ep) })).filter(x => x.timing);
    const today = timed.filter(x => x.timing.date === date);
    for (const { ep, timing } of today) {
      // The catalogue stores Bangkok wall time. Any other offset would make the
      // stored calendar date a different Bangkok day, so it is held, not shifted.
      if (!/\+07:00$/.test(ep.airs_at)) { alerts.push({ showId: show.id, kind: 'held', reason: 'Episode time is not stored in Bangkok time; row left out' }); continue; }
      const row = {
        ...describe(show, ep.number), episode: ep.number,
        isPremiere: ep.number === 1,
        isFinale: Number.isInteger(show.total_episodes) && ep.number === show.total_episodes,
        instant: timing.timeConfirmed ? timing.instant : null,
        timeConfirmed: timing.timeConfirmed,
      };
      confirmed.push(row);
      if (!row.watch.some(w => w.url)) alerts.push({ showId: show.id, kind: 'no_watch_link', reason: `No official watch link on file for episode ${ep.number}${row.watch.some(w => w.linkWithheld) ? '; the catalogue link names a different episode' : ''}` });
      if ((show.conflicts || []).some(c => c && c.resolved === false)) alerts.push({ showId: show.id, kind: 'open_conflict', reason: 'The catalogue records an unresolved source conflict for this show' });
    }
    if (today.length) continue;
    if (show.day_of_week !== weekday || !/^([01]\d|2[0-3]):[0-5]\d$/.test(show.air_time_ict || '')) continue;
    if (!timed.length) continue; // Announced titles with no sourced episode are not expected yet.
    const past = timed.filter(x => x.timing.date < date);
    const future = timed.filter(x => x.timing.date > date);
    if (!past.length || future.length) continue; // Not premiered yet, or the sourced schedule already says when it returns.
    const last = past.reduce((a, b) => (a.timing.date > b.timing.date ? a : b));
    const lastNumber = Math.max(...past.map(x => x.ep.number));
    if (Number.isInteger(show.total_episodes) && lastNumber >= show.total_episodes) continue; // Run complete.
    if (show.status === 'wrapped' || show.status === 'library') continue;
    const gapDays = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${last.timing.date}T00:00:00Z`)) / DAY_MS);
    if (gapDays > USUAL_SLOT_MAX_GAP_DAYS) continue;
    toVerify.push({ showId: show.id, title: show.title, usualTimeBangkok: show.air_time_ict, lastSourcedEpisode: lastNumber, lastSourcedDate: last.timing.date });
    alerts.push({ showId: show.id, kind: 'unsourced_usual_slot', reason: `Usually airs ${weekday} ${show.air_time_ict} in Bangkok; last sourced episode ${lastNumber} on ${last.timing.date}; nothing sourced for today` });
  }
  // Timed rows first in air order; date-only rows after them. Plain comparison,
  // because locale collation does not order ISO instants against a sentinel.
  confirmed.sort((a, b) => (a.instant === null) - (b.instant === null)
    || (a.instant < b.instant ? -1 : a.instant > b.instant ? 1 : 0) || a.title.localeCompare(b.title));
  // The lineup version covers every fact a member would read. Approval is bound to it.
  const version = sha(['tonight-lineup', 1, date, confirmed.map(r => [r.showId, r.episode, r.instant, r.timeConfirmed, r.title, r.cast, r.logline, r.image?.url ?? null, r.watch.map(w => [w.name, w.url, w.note])])]);
  return {
    date, weekday, timezone: BANGKOK, confirmed, toVerify, alerts, version,
    dayStatus: confirmed.length ? 'listed' : alerts.length ? 'evidence_gap' : 'quiet_checked',
    operatorAlert: alerts.length > 0,
    catalogGeneratedAt: catalog?.generated_at || null,
    catalogVerifiedAt: catalog?.verified_at || null,
    empty: confirmed.length === 0,
  };
}

/** Plain-text checklist for whoever releases the day. Not member copy. */
export function operatorChecklist(lineup) {
  const head = `Tonight in Bangkok · ${lineup.weekday} ${lineup.date} · ${lineup.dayStatus} · lineup ${lineup.version.slice(0, 12)}`;
  const listed = lineup.confirmed.length ? lineup.confirmed.map(r => `  listed: ${r.title} ep ${r.episode} ${r.timeConfirmed ? r.instant : '(time pending)'}`) : ['  listed: nothing'];
  const alerts = lineup.alerts.length ? lineup.alerts.map(a => `  CHECK ${a.kind}: ${a.showId}: ${a.reason}`) : ['  no alerts'];
  return [head, ...listed, ...alerts].join('\n');
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
  return { ...lineup, memberTimezone: zone, sendAt: new Date(sent).toISOString(), confirmed: lineup.confirmed.map(view) };
}

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function whenLine(item) {
  if (!item.timeConfirmed) return { main: 'Time pending', sub: 'The date is confirmed for today in Bangkok. The time is not confirmed yet.' };
  // The member reads this at the send instant, which may be the evening before.
  const where = item.local.relative === 'today' ? 'today, your time' : `${item.local.relative ? `${item.local.relative}, ` : ''}${item.local.day}, your time`;
  return { main: `${item.local.time} ${item.local.zone}`, sub: `${item.aired ? 'Aired in Thailand already · ' : ''}${where} · ${item.bangkok.time} in Bangkok, ${item.bangkok.day}` };
}

function episodeLine(item) {
  const of = item.totalEpisodes ? ` of ${item.totalEpisodes}` : '';
  const tag = item.isPremiere ? ' · Premiere' : item.isFinale ? ' · Finale' : '';
  return `Episode ${item.episode}${of}${tag}`;
}

const REGION = 'Check your region. This email does not confirm playback, subtitles or price in your country.';
const NO_LINK = 'No official link for this episode is on file yet. The Tracker has the show’s platforms.';

function cardHtml(item) {
  const when = whenLine(item);
  const primary = item.watch.find(w => w.url);
  const others = item.watch.filter(w => w !== primary).map(w => w.name);
  const art = item.image
    ? `<tr><td style="padding:0 0 14px 0;"><img src="${esc(item.image.url)}" alt="${esc(item.image.alt)}" width="${item.image.kind === 'poster' ? 220 : 536}" style="display:block;width:100%;max-width:${item.image.kind === 'poster' ? 220 : 536}px;height:auto;border:0;border-radius:6px;margin:0 auto;"></td></tr>`
    : '';
  const button = primary
    ? `<tr><td style="padding:14px 0 0 0;"><a href="${esc(primary.url)}" style="display:inline-block;background:#d4a15a;color:#1c0b31;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:11px 20px;border-radius:4px;">Watch on ${esc(primary.name)}</a></td></tr>`
    : `<tr><td style="padding:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#b9b9d0;">${esc(NO_LINK)}</td></tr>`;
  const rail = item.isPremiere ? '#4ade80' : '#d4a15a';
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
    primary ? `Watch on ${primary.name}: ${primary.url}` : NO_LINK, `Tracker: ${item.trackerUrl}`].filter(Boolean).join('\n');
}

/**
 * Email body for one member-zone view: source-confirmed episodes only.
 * Returns null on a day with nothing confirmed: no email is prepared.
 */
export function renderTonightEmail(view) {
  if (!view?.memberTimezone) throw new Error('Render a member view, not a raw lineup');
  if (view.empty) return null;
  const headDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${view.date}T12:00:00Z`));
  const names = view.confirmed.map(i => i.title);
  const lead = view.confirmed[0];
  const subject = names.length === 1 ? `Tonight in Bangkok: ${names[0]}` : `Tonight in Bangkok: ${names[0]} and ${names.length - 1} more`;
  const preheader = lead.local
    ? `${lead.title} at ${lead.local.time} ${lead.local.zone}${names.length > 1 ? `, plus ${names.slice(1).join(', ')}` : ''}.`
    : `${names.join(', ')}.`;
  const hasArt = view.confirmed.some(i => i.image);
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
<tr><td style="padding:8px 24px 0 24px;">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d4a15a;margin:0 0 12px 0;">On tonight</p>
${view.confirmed.map(cardHtml).join('\n')}</td></tr>
<tr><td style="padding:6px 24px 24px 24px;">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#b9b9d0;margin:0 0 10px 0;">${esc(REGION)}</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#b9b9d0;margin:0 0 10px 0;"><a href="${SITE}tracker.html" style="color:#d4a15a;">Open the full Tracker</a></p>
${hasArt ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#8888a8;margin:0;">Artwork is official promotional art, shown to identify each series. Rights remain with the studios and platforms.</p>` : ''}
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [`TONIGHT IN BANGKOK · ${headDay}`, `Your times are ${view.memberTimezone.replace(/_/g, ' ')}.`, '',
    'ON TONIGHT', '', ...view.confirmed.flatMap(i => [cardText(i), '']),
    REGION, `Full Tracker: ${SITE}tracker.html`].join('\n');
  return { subject, preheader, html, text, contentHash: sha(html + '\n' + text) };
}

// Thai prime time starts at about 20:00 in Bangkok. The send time is chosen
// against that fixed reference, not the day's lineup, so each zone keeps one
// habit: the morning when the first broadcast is still ahead, otherwise the
// evening before. Sterling left the timing to Jarvis on 16 November 2026.
const PRIME_TIME_BANGKOK = '20:00';
const MORNING = '07:00', EVENING_BEFORE = '19:00', MARGIN_MS = 30 * 60000;

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

/** One edition is one Bangkok date. Its key never changes when the body is corrected. */
export const editionKey = bangkokDate => sha(['tonight-edition', bangkokDate]);
/** One delivery is one edition to one zone cohort. Stable across revisions. */
export const deliveryKey = (bangkokDate, timezone) => sha(['tonight-delivery', bangkokDate, zoneName(timezone)]);

const LEDGER_STATES = new Set(['queued', 'dispatched', 'delivered', 'failed', 'unknown']);

/**
 * Prepare one Bangkok date's delivery. Each confirmed zone becomes a cohort at
 * its own send instant. Nothing is scheduled, sent or changed.
 *
 * approval: { status: 'approved', receipt, bangkokDate, lineupVersion }. It is
 *   bound to the exact lineup: if the catalogue changes any member-visible
 *   fact after approval, preparation stops until the day is approved again.
 * ledger: what the publisher has already recorded for this edition, as
 *   [{ deliveryKey, memberId, payloadVersion, state }]. A member who appears
 *   there in any state other than 'failed' is never placed in a cohort again,
 *   whatever zone they have since chosen. A cohort whose delivery key already
 *   has an entry is held for reconciliation instead of being prepared twice.
 */
export function prepareTonightDelivery({ catalog, bangkokDate, readers, approval, ledger = [], now = new Date(), leadHours = 6 }) {
  if (!validDate(bangkokDate)) throw new Error('Choose a Bangkok date as YYYY-MM-DD');
  if (!Array.isArray(readers) || !Array.isArray(ledger) || !Number.isFinite(+now) || !Number.isFinite(leadHours) || leadHours < 2) throw new Error('Invalid delivery input');
  // The lineup is facts from the catalogue, but a person still releases each day.
  if (!approval || approval.status !== 'approved' || typeof approval.receipt !== 'string' || !approval.receipt.trim() || approval.bangkokDate !== bangkokDate) throw new Error('An owner approval receipt for this date is required');
  const lineup = tonightLineup(catalog, bangkokDate);
  if (approval.lineupVersion !== lineup.version) throw new Error('The lineup changed since approval; approve this version before preparing');
  for (const entry of ledger) if (!entry?.deliveryKey || !entry.memberId || !LEDGER_STATES.has(entry.state)) throw new Error('Invalid publisher ledger entry');
  const settledMembers = new Set(ledger.filter(e => e.state !== 'failed').map(e => e.memberId));
  const priorByKey = new Map();
  for (const entry of ledger) { const list = priorByKey.get(entry.deliveryKey) || []; list.push(entry); priorByKey.set(entry.deliveryKey, list); }
  const cohorts = new Map(), held = [], seenMembers = new Set(), seenSubscribers = new Set();
  for (const reader of readers) {
    if (!reader?.memberId || !/^\d+$/.test(reader.subscriberId || '')) throw new Error('Member and MailerLite subscriber mapping required');
    if (seenMembers.has(reader.memberId) || seenSubscribers.has(reader.subscriberId)) throw new Error('Duplicate member or subscriber mapping');
    seenMembers.add(reader.memberId); seenSubscribers.add(reader.subscriberId);
    const hold = reason => held.push({ memberId: reader.memberId, reason });
    if (settledMembers.has(reader.memberId)) { hold('Already queued or sent for this edition; reconcile the publisher record before any retry'); continue; }
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
      cohort = { timezone: zone, ...send, bangkokDate, email, members: [] };
      cohorts.set(zone, cohort);
    }
    cohort.members.push({ memberId: reader.memberId, subscriberId: reader.subscriberId });
  }
  const batches = [], reconcile = [], payloads = {};
  for (const cohort of cohorts.values()) {
    if (!cohort.email) continue;
    const { email, members, ...rest } = cohort;
    const key = deliveryKey(bangkokDate, cohort.timezone);
    const prior = priorByKey.get(key) || [];
    members.sort((a, b) => a.subscriberId.localeCompare(b.subscriberId));
    const batch = { ...rest, deliveryKey: key, editionKey: editionKey(bangkokDate), lineupVersion: lineup.version,
      payloadVersion: email.contentHash, payloadRef: `tonight/${bangkokDate}/${cohort.timezone}/${email.contentHash}`,
      subject: email.subject, memberIds: members.map(m => m.memberId), subscriberIds: members.map(m => m.subscriberId) };
    if (prior.length) {
      // The same cohort has a publisher record already. Whether its body matches or
      // not, a second job must not be created until that record is read back.
      reconcile.push({ ...batch, status: 'held_reconcile_first', priorStates: [...new Set(prior.map(e => e.state))].sort(), priorPayloadVersions: [...new Set(prior.map(e => e.payloadVersion))].sort(),
        reason: prior.some(e => e.payloadVersion !== email.contentHash) ? 'A different body is already on record for this cohort' : 'This cohort is already on record' });
      continue;
    }
    // The payload is frozen with the plan: delivery uses these exact bytes.
    payloads[batch.payloadRef] = Object.freeze({ subject: email.subject, preheader: email.preheader, html: email.html, text: email.text });
    batches.push({ ...batch, status: 'prepared_not_scheduled' });
  }
  batches.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  return { status: 'prepared_not_scheduled', product: 'tonight-in-bangkok', generatedAt: now.toISOString(), approvalReceipt: approval.receipt, bangkokDate,
    editionKey: editionKey(bangkokDate), lineupVersion: lineup.version, dayStatus: lineup.dayStatus, operatorAlerts: lineup.alerts,
    batches, reconcile, held, payloads: Object.freeze(payloads),
    prepareBy: batches.length ? new Date(Date.parse(batches[0].sendAt) - leadHours * 3600000).toISOString() : null,
    requiredReadbacks: ['Exact audience contains only these currently eligible, opted-in subscriber IDs', 'One campaign per zone cohort at the exact UTC instant, carrying the frozen payload for its payloadRef', 'Entitlement, consent and zone rechecked immediately before dispatch', 'Queue, dispatch and delivery each recorded against the delivery key before any retry'],
    mutations: 0 };
}
