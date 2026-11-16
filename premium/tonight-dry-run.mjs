// Local operator tool. Writes private review files only; never calls a provider.
// Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE
//   e.g. node premium/tonight-dry-run.mjs 2026-11-18 America/New_York
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tonightLineup, operatorChecklist, memberView, renderTonightEmail, tonightSendInstant, firstConfirmedAir, prepareTonightDelivery } from './tonight.mjs';
import { tonightAlarm } from './tonight-delivery.mjs';

const [date, zone] = process.argv.slice(2);
if (!date || !zone) throw new Error('Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE');
const catalog = JSON.parse(await readFile(new URL('../data/series.json', import.meta.url), 'utf8'));
const lineup = tonightLineup(catalog, date);
const { sendAt, slot, localDate, localTime } = tonightSendInstant(date, zone, { firstAirInstant: firstConfirmedAir(lineup) });
const view = memberView(lineup, { timezone: zone, sendAt });
const email = renderTonightEmail(view);
const out = new URL('./review-output/tonight/', import.meta.url); // ignored by Git
await mkdir(out, { recursive: true });
const stem = `tonight-${date}-${zone.replace(/[^A-Za-z0-9]+/g, '-')}`;
const summary = { date, zone, sendAt, slot, sentLocal: `${localDate} ${localTime}`, dayStatus: lineup.dayStatus, lineupVersion: lineup.version, confirmed: view.confirmed.map(i => [i.title, i.episode, i.local?.time ?? 'time pending', i.aired]), toVerify: lineup.toVerify.map(i => i.title), alerts: lineup.alerts, catalogGeneratedAt: view.catalogGeneratedAt, catalogVerifiedAt: view.catalogVerifiedAt, subject: email?.subject ?? null };
await writeFile(new URL(`${stem}.json`, out), JSON.stringify(summary, null, 2) + '\n');
if (email) {
  await writeFile(new URL(`${stem}.html`, out), email.html);
  await writeFile(new URL(`${stem}.txt`, out), email.text + '\n');
}
console.log(JSON.stringify(summary, null, 2));
console.log(operatorChecklist(lineup));
// The missing-receipt alarm belongs with delivery; until then the operator alert is printed here.
if (lineup.operatorAlert) console.log('OPERATOR ALERT: check the items above before this day is released or called quiet.');
// What the alarm would say at this zone's send time if nothing had been queued.
// One synthetic reader stands in for the cohort; no real member is read.
const prepared = new Date(Date.parse(sendAt) - 12 * 3600000);
const plan = prepareTonightDelivery({ catalog, bangkokDate: date, now: prepared,
  approval: { status: 'approved', receipt: 'DRY RUN, not an owner approval', bangkokDate: date, lineupVersion: lineup.version },
  footer: { manageUrl: 'https://example.invalid/settings', unsubscribeHref: '{$unsubscribe}', postalAddress: 'DRY RUN' },
  readers: [{ memberId: 'user_dry_run', subscriberId: '0', timezone: zone, timezoneConfirmed: true, dailyEmailConsent: true, stripeAccess: true, mailerliteStatus: 'active', inPaidGroup: true, eligibilityCheckedAt: prepared.toISOString() }] });
const alarm = tonightAlarm({ plan, entries: [], now: new Date(sendAt) });
console.log(alarm.ok ? 'ALARM at send time with nothing queued: silent (nothing was due).' : `ALARM at send time with nothing queued: ${alarm.alerts.map(a => a.kind).join(', ')}`);
console.log(email ? `Wrote ${fileURLToPath(new URL(`${stem}.html`, out))}. Nothing scheduled or sent.` : 'Nothing confirmed for that date. No email prepared. Nothing scheduled or sent.');
