// Local operator tool. Writes private review files only; never calls a provider.
// Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE [LOCAL_SEND_TIME]
//   e.g. node premium/tonight-dry-run.mjs 2026-11-18 America/New_York 07:00
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tonightLineup, memberView, renderTonightEmail, bangkokDateAt } from './tonight.mjs';
import { localSendInstant } from './delivery-plan.mjs';

const [date, zone, time = '07:00'] = process.argv.slice(2);
if (!date || !zone) throw new Error('Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE [LOCAL_SEND_TIME]');
const catalog = JSON.parse(await readFile(new URL('../data/series.json', import.meta.url), 'utf8'));
// Find the member's local send instant whose Bangkok date is the one asked for.
let sendAt = null;
for (const shift of [0, -1, 1]) {
  const local = new Date(Date.parse(`${date}T12:00:00Z`) + shift * 86400000).toISOString().slice(0, 10);
  const candidate = localSendInstant(local, time, zone);
  if (bangkokDateAt(candidate) === date) { sendAt = candidate; break; }
}
if (!sendAt) throw new Error('No local send time on that Bangkok date');
const view = memberView(tonightLineup(catalog, date), { timezone: zone, sendAt });
const email = renderTonightEmail(view);
const out = new URL('./review-output/tonight/', import.meta.url); // ignored by Git
await mkdir(out, { recursive: true });
const stem = `tonight-${date}-${zone.replace(/[^A-Za-z0-9]+/g, '-')}`;
const summary = { date, zone, sendAt, confirmed: view.confirmed.map(i => [i.title, i.episode, i.local?.time ?? null, i.aired]), usualSlot: view.usualSlot.map(i => [i.title, i.local?.time ?? null]), held: view.held, catalogGeneratedAt: view.catalogGeneratedAt, catalogVerifiedAt: view.catalogVerifiedAt, subject: email?.subject ?? null };
await writeFile(new URL(`${stem}.json`, out), JSON.stringify(summary, null, 2) + '\n');
if (email) {
  await writeFile(new URL(`${stem}.html`, out), email.html);
  await writeFile(new URL(`${stem}.txt`, out), email.text + '\n');
}
console.log(JSON.stringify(summary, null, 2));
console.log(email ? `Wrote ${fileURLToPath(new URL(`${stem}.html`, out))}. Nothing scheduled or sent.` : 'Nothing listed for that date. No email prepared. Nothing scheduled or sent.');
