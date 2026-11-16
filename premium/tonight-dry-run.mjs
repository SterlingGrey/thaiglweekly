// Local operator tool. Writes private review files only; never calls a provider.
// Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE
//   e.g. node premium/tonight-dry-run.mjs 2026-11-18 America/New_York
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tonightLineup, memberView, renderTonightEmail, tonightSendInstant } from './tonight.mjs';

const [date, zone] = process.argv.slice(2);
if (!date || !zone) throw new Error('Usage: node premium/tonight-dry-run.mjs BANGKOK_DATE TIME_ZONE');
const catalog = JSON.parse(await readFile(new URL('../data/series.json', import.meta.url), 'utf8'));
const { sendAt, slot, localDate, localTime } = tonightSendInstant(date, zone);
const view = memberView(tonightLineup(catalog, date), { timezone: zone, sendAt });
const email = renderTonightEmail(view);
const out = new URL('./review-output/tonight/', import.meta.url); // ignored by Git
await mkdir(out, { recursive: true });
const stem = `tonight-${date}-${zone.replace(/[^A-Za-z0-9]+/g, '-')}`;
const summary = { date, zone, sendAt, slot, sentLocal: `${localDate} ${localTime}`, confirmed: view.confirmed.map(i => [i.title, i.episode, i.local?.time ?? null, i.aired]), usualSlot: view.usualSlot.map(i => [i.title, i.local?.time ?? null]), held: view.held, catalogGeneratedAt: view.catalogGeneratedAt, catalogVerifiedAt: view.catalogVerifiedAt, subject: email?.subject ?? null };
await writeFile(new URL(`${stem}.json`, out), JSON.stringify(summary, null, 2) + '\n');
if (email) {
  await writeFile(new URL(`${stem}.html`, out), email.html);
  await writeFile(new URL(`${stem}.txt`, out), email.text + '\n');
}
console.log(JSON.stringify(summary, null, 2));
console.log(email ? `Wrote ${fileURLToPath(new URL(`${stem}.html`, out))}. Nothing scheduled or sent.` : 'Nothing listed for that date. No email prepared. Nothing scheduled or sent.');
