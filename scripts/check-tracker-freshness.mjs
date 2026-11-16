// Alerts only. Expected weekly slots are leads, never new episode records.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadCatalog } from "./load-catalog.mjs";

const day = 86_400_000;
const activeWindow = 28 * day;
const reviewWindow = 26 * 3_600_000;
const snapshot = ({ series }) => Object.fromEntries(series.map(show => [
  show.id, (show.episodes ?? []).map(ep => [ep.number, ep.airs_at, ep.time_unverified === true])
]));

export function checkTrackerFreshness({ expected, live, receipt, now }) {
  const current = +new Date(now);
  const reviewed = Date.parse(receipt?.checkedAt);
  const failures = [];
  if (!Number.isFinite(reviewed) || reviewed > current || current - reviewed > reviewWindow) {
    failures.push("No completed or partial source-review receipt in the last 26 hours.");
  }
  const generated = Date.parse(live.generated_at);
  if (!Number.isFinite(generated) || generated > current || current - generated > 36 * 3_600_000) {
    failures.push("Live catalog rebuild is older than 36 hours.");
  }
  const actual = snapshot(live);
  const wanted = snapshot(expected);
  for (const id of new Set([...Object.keys(wanted), ...Object.keys(actual)])) {
    if (JSON.stringify(wanted[id]) !== JSON.stringify(actual[id])) failures.push(`Live episode rows differ from main for ${id}.`);
  }

  const leads = [];
  for (const show of live.series) {
    if (!show.day_of_week || !show.air_time_ict || ["wrapped", "library"].includes(show.status)) continue;
    const timed = (show.episodes ?? []).map(ep => ({ ...ep, instant: Date.parse(ep.airs_at) }))
      .filter(ep => Number.isFinite(ep.instant)).sort((a, b) => b.instant - a.instant);
    const last = timed[0];
    if (!last || current - last.instant > activeWindow ||
        (Number.isInteger(show.total_episodes) && timed.some(ep => ep.number >= show.total_episodes))) continue;
    const due = last.instant + 7 * day;
    if (current >= due + 6 * 3_600_000) {
      leads.push(`${show.title}: expected weekly slot after EP${last.number} has passed; verify episode, break or schedule change.`);
    }
  }
  return { failures, leads, open: receipt?.open ?? [] };
}

async function main() {
  const expected = loadCatalog(process.cwd());
  const receipt = JSON.parse(await readFile("docs/tracker-source-review.json", "utf8"));
  const response = await fetch(`https://thaiglweekly.com/data/series.json?freshness=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Live catalog returned HTTP ${response.status}`);
  const result = checkTrackerFreshness({ expected, live: await response.json(), receipt, now: new Date() });
  console.log(JSON.stringify(result, null, 2));
  for (const item of result.leads) console.warn(`::warning::${item}`);
  for (const item of result.failures) console.error(`::error::${item}`);
  if (result.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
