// Build-time rows for the Tracker's "On tonight" strip (js/on-tonight.js).
// Only what the catalogue records is emitted. Date-only entries keep no clock
// time, using the same rule as the member calendar (episodeTiming).
import { episodeTiming } from "../premium/schedule-time.mjs";

function platformOf(series) {
  const first = Array.isArray(series.platforms) ? series.platforms[0] : null;
  if (!first || typeof first.name !== "string" || !first.name.trim()) return null;
  const https = typeof first.url === "string" && /^https:\/\//i.test(first.url);
  return https ? { name: first.name.trim(), url: first.url } : { name: first.name.trim(), url: null };
}

function shiftDay(date, days) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

// Keeps episodes dated from two days before the build onward, so the page stays
// small. The margin covers any record whose offset moves its date by a day.
export function onTonightRows(catalog, buildTime) {
  const earliest = shiftDay(new Date(buildTime).toISOString().slice(0, 10), -2);
  const rows = [];
  for (const series of catalog.series ?? []) {
    const platform = platformOf(series);
    const total = Number.isInteger(series.total_episodes) ? series.total_episodes : null;
    for (const episode of series.episodes ?? []) {
      const timing = episodeTiming(episode);
      if (!timing || timing.date < earliest) continue;
      rows.push({
        id: series.id, title: series.title, number: episode.number, total,
        date: timing.date, instant: timing.instant, platform,
      });
    }
  }
  return rows;
}

export function onTonightData(catalog, buildTime = new Date().toISOString()) {
  const json = JSON.stringify(onTonightRows(catalog, buildTime)).replace(/</g, "\\u003c");
  return `<script>window.tgwOnTonightData=${json};</script>`;
}
