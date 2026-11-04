// Preparation only. This module has no provider client, credential, fetch or send.
import { createHash } from 'node:crypto';
import { validateEdition } from './edition.mjs';

function zoneName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) throw new Error('Choose a named time zone');
  return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
}
const partsAt = (instant, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
const keyAt = (instant, zone) => { const p = partsAt(instant, zone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };

export function localSendInstant(date, time, timezone) {
  const zone = zoneName(timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid local send date or time');
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) throw new Error('Invalid local date');
  const offsets = new Set();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const probe = wall + hours * 3600000;
    const p = partsAt(probe, zone);
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - probe);
  }
  const matches = [...offsets].map(offset => wall - offset).filter(candidate => keyAt(candidate, zone) === `${date}T${time}`);
  if (matches.length !== 1) throw new Error('Local time is missing or ambiguous; choose a different send time');
  return new Date(matches[0]).toISOString();
}

export function prepareSundayDelivery({ edition, sunday, readers, now = new Date(), time = '18:00', leadHours = 24 }) {
  validateEdition(edition); // No copy can be prepared for release from unapproved drafts.
  if (!Array.isArray(readers) || !Number.isFinite(+now) || !Number.isFinite(leadHours) || leadHours < 24) throw new Error('Invalid delivery input');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sunday) || new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) throw new Error('Choose a Sunday');
  const contentHash = createHash("sha256").update(JSON.stringify(edition)).digest("hex");
  const cohorts = new Map(), held = [], seenMembers = new Set(), seenSubscribers = new Set();
  for (const reader of readers) {
    if (!reader?.memberId || !/^\d+$/.test(reader.subscriberId || '')) throw new Error('Member and MailerLite subscriber mapping required');
    if (seenMembers.has(reader.memberId) || seenSubscribers.has(reader.subscriberId)) throw new Error('Duplicate member or subscriber mapping');
    seenMembers.add(reader.memberId); seenSubscribers.add(reader.subscriberId);
    const hold = reason => held.push({ memberId: reader.memberId, reason });
    // Eligibility is an observed snapshot, never an instruction to subscribe or
    // confirm a person. Recheck it at actual scheduling and before dispatch.
    const age = +now - Date.parse(reader.eligibilityCheckedAt);
    if (!Number.isFinite(age) || age < 0 || age > 15 * 60000) { hold('Eligibility snapshot missing or stale'); continue; }
    if (reader.stripeAccess !== true || reader.mailerliteStatus !== 'active' || reader.inPaidGroup !== true) { hold('Paid access and active paid-group membership required'); continue; }
    if (reader.timezoneConfirmed !== true) { hold('Reader has not confirmed a delivery time zone'); continue; }
    let zone, sendAt;
    try { zone = zoneName(reader.timezone); sendAt = localSendInstant(sunday, time, zone); }
    catch { hold('Invalid or ambiguous local delivery time'); continue; }
    if (Date.parse(sendAt) - +now < leadHours * 3600000) { hold('Preparation deadline missed; no automatic immediate or next-week send'); continue; }
    const cohort = cohorts.get(zone) || { timezone: zone, localDate: sunday, localTime: time, sendAt, subscriberIds: [], status: 'prepared_not_scheduled' };
    cohort.subscriberIds.push(reader.subscriberId); cohorts.set(zone, cohort);
  }
  const batches = [...cohorts.values()].map(c => ({ ...c, subscriberIds: c.subscriberIds.sort(), key: createHash('sha256').update(JSON.stringify([contentHash, sunday, time, c.timezone])).digest('hex') })).sort((a,b) => a.sendAt.localeCompare(b.sendAt));
  return { status: 'prepared_not_scheduled', generatedAt: now.toISOString(), editionApproval: edition.approvalReceipt, contentHash, sunday, batches, held,
    prepareBy: batches.length ? new Date(Date.parse(batches[0].sendAt) - leadHours * 3600000).toISOString() : null,
    requiredReadbacks: ['Exact MailerLite audience contains only these currently eligible subscriber IDs', 'Separate campaign per confirmed-zone cohort at the exact UTC instant', 'Current eligibility and owner release approval before scheduling', 'Persistent campaign IDs/time/audience/content receipts; actual mailbox delivery separately verified'],
    mutations: 0 };
}
