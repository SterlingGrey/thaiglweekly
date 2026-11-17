// Build-time data for the Tracker's "On tonight" strip (js/on-tonight.js).
// Only what the catalogue independently establishes is emitted. Date-only
// entries keep no clock time, using the same rule as the member calendar
// (episodeTiming).
import { createHash } from "node:crypto";
import { episodeTiming } from "../premium/schedule-time.mjs";

const isHttps = (value) => typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value);

// Why this episode's date can be trusted, or null. `time_unverified` is not
// evidence: it only says the clock is unknown, so a stored date that is just
// a weekly-slot anchor never qualifies on its own.
//   episode-source   the episode row names its own dated https source
//   schedule-source  the series names a reviewed official episode schedule
//   premiere         episode 1 of a series whose premiere the catalogue confirms
export function dateBasis(series, episode) {
  if (isHttps(episode?.date_source)) return "episode-source";
  if (isHttps(series?.episode_schedule_source)) return "schedule-source";
  const sourced = Array.isArray(series?.sources) && series.sources.length > 0;
  if (episode?.number === 1 && series?.confidence === "confirmed" && sourced) return "premiere";
  return null;
}

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

// Keeps episodes dated from two days before the build onward, so the file stays
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
      const basis = dateBasis(series, episode);
      if (!basis) continue;
      rows.push({
        id: series.id, title: series.title, number: episode.number, total,
        date: timing.date, instant: timing.instant, platform, dateBasis: basis,
      });
    }
  }
  return rows;
}

// The classic Tracker page is what the card workspace reads. Stamp it with an id
// derived from its own text and publish the rows under the same id, so the
// strip can prove its data belongs to the page the cards come from.
export function onTonightBuild(classicHtml, catalog, buildTime = new Date().toISOString()) {
  const id = createHash("sha256").update(classicHtml).digest("hex").slice(0, 16);
  if (!/<\/head>/i.test(classicHtml)) throw new Error("Classic Tracker has no </head> to stamp");
  const classic = classicHtml.replace(/<\/head>/i, `<meta name="tracker-build" content="${id}">\n</head>`);
  const json = JSON.stringify({
    build: id,
    builtAt: new Date(buildTime).toISOString(),
    rows: onTonightRows(catalog, buildTime),
  }).replace(/</g, "\\u003c");
  return { id, classic, json };
}
