#!/usr/bin/env node
/**
 * Insert "Next Up for Your Favorite GL Pairs" into tracker.html after a
 * static emit. Never uses the word "couples". Data is series.json only.
 *
 *   node --experimental-strip-types scripts/inject-pairs.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCatalog, formatIct } from "../src/lib/schedule.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function confBadge(c) {
  const map = {
    aired: ["conf-aired", "Aired"],
    confirmed: ["conf-confirmed", "Confirmed"],
    announced: ["conf-announced", "Announced"],
    fan_sourced: ["conf-fan", "Fan-sourced"],
    unverified: ["conf-unverified", "Unverified"],
  };
  const [cls, label] = map[c] || map.unverified;
  return `<span class="conf ${cls}">${label}</span>`;
}

function ictLine(iso, unverified) {
  if (unverified) return "time not confirmed";
  const t = formatIct(iso);
  return `${t.day} ${t.date} · ${t.time} ICT`;
}

const PAIR_SKIP =
  /^(ensemble|channel 3 ensemble|leads not named in the announcement|not yet named|elite girls'? school ensemble|memindy new-gen pairing)$/i;

function shipName(series) {
  const raw = String(series.pairing || "").trim();
  if (!raw) return "";
  return raw.split("(")[0].trim();
}

function pairRank(series) {
  if (series.derivedStatus === "airing") return 0;
  if (series.nextEpisode?.airs_at) return 1;
  if (series.derivedStatus === "upcoming") return 2;
  return 9;
}

function pairNextLine(series) {
  const href = `#card-${esc(series.id)}`;
  const title = `<a href="${href}">${esc(series.title)}</a>`;
  const flagKind =
    series.derivedStatus === "airing" ? "airing" : series.nextEpisode?.airs_at ? "soon" : "announced";
  /* Don't print Announced twice. Keep Fan-sourced / Unverified / Confirmed when they add a fact. */
  const conf =
    flagKind === "announced" && series.confidence === "announced" ? "" : ` ${confBadge(series.confidence)}`;
  if (flagKind === "airing") {
    const next = series.nextEpisode;
    const when = next ? ictLine(next.airs_at, next.time_unverified) : "";
    const ep = next ? `EP ${next.number}${series.total_episodes ? "/" + series.total_episodes : ""}` : "airing";
    return `<span class="pair-flag is-airing">Airing</span> ${title} · ${esc(ep)}${when ? ` · ${esc(when)}` : ""}${conf}`;
  }
  if (flagKind === "soon") {
    const next = series.nextEpisode;
    const when = ictLine(next.airs_at, next.time_unverified);
    const ep = `EP ${next.number}${series.total_episodes ? "/" + series.total_episodes : ""}`;
    const flag = next.number === 1 ? "Premiere" : "Next";
    return `<span class="pair-flag is-soon">${esc(flag)}</span> ${title} · ${esc(ep)} · ${esc(when)}${conf}`;
  }
  const window = (series.tags || []).find((t) => /2026|2027|November|TBA|window/i.test(t)) || "";
  return `<span class="pair-flag is-announced">Announced</span> ${title}${window ? ` · ${esc(window)}` : ""}${conf}`;
}

function pairRadar(seriesList) {
  const map = new Map();
  for (const s of seriesList) {
    const name = shipName(s);
    if (!name || PAIR_SKIP.test(name)) continue;
    const rec = map.get(name) || { name, actors: "", live: [] };
    if (s.pairing_actors && s.pairing_actors.length > rec.actors.length) rec.actors = s.pairing_actors;
    if (s.derivedStatus === "airing" || s.derivedStatus === "upcoming") rec.live.push(s);
    map.set(name, rec);
  }
  const rows = [...map.values()]
    .filter((r) => r.live.length)
    .map((r) => {
      r.live.sort((a, b) => pairRank(a) - pairRank(b) || String(a.title).localeCompare(String(b.title)));
      return r;
    });
  rows.sort((a, b) => {
    const ra = Math.min(...a.live.map(pairRank));
    const rb = Math.min(...b.live.map(pairRank));
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function pairSectionHtml(view) {
  const rows = pairRadar(view.series);
  const inner = rows.length
    ? `<div class="pair-grid">${rows
        .map((r) => {
          const filter = esc(`${r.name} ${r.actors} ${r.live.map((s) => s.title).join(" ")}`);
          return `<article class="pair-card" data-filter="${filter}">
        <div class="pair-name">${esc(r.name)}</div>
        ${r.actors ? `<div class="pair-actors">${esc(r.actors)}</div>` : ""}
        <ul class="pair-next">${r.live.map((s) => `<li>${pairNextLine(s)}</li>`).join("")}</ul>
      </article>`;
        })
        .join("")}</div>`
    : `<p class="section-note">No dated or announced next project is on the board for a named pair.</p>`;

  return `    <div class="section" data-open="1" data-title="Next Up for Your Favorite GL Pairs">
    <div class="section-header" role="button" tabindex="0" aria-expanded="true">
      <h2 class="soon-label">Next Up for Your Favorite GL Pairs</h2>
      <span class="badge">${rows.length}</span>
      <span class="acc-chevron" aria-hidden="true">▶</span>
    </div>
    <span class="acc-peek">What each pair is airing or filming next. Sourced. No dating rumours.</span>
    <div class="acc-body"><div class="acc-inner"><div class="acc-pad">
      ${inner}
    </div></div></div>
  </div>
`;
}

function sectionBounds(html, title) {
  const needle = `data-title="${title}"`;
  const i = html.indexOf(needle);
  if (i < 0) return null;
  const start = html.lastIndexOf("<div", i);
  if (start < 0) return null;
  let depth = 0;
  const re = /<\/?div\b/gi;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(html))) {
    if (html.startsWith("</div", m.index)) {
      depth--;
      if (depth === 0) {
        let end = m.index + 6;
        if (html[end] === ">") end += 1;
        while (end < html.length && /[ \t\r\n]/.test(html[end])) end++;
        return [start, end];
      }
    } else {
      depth++;
    }
  }
  return null;
}

function patchTracker(html, section) {
  const heading = "Next Up for Your Favorite GL Pairs";
  const existing = sectionBounds(html, heading);
  if (existing) {
    return html.slice(0, existing[0]) + section + html.slice(existing[1]);
  }
  for (const title of ["Hot Takes", "Wrapped 2026"]) {
    const target = sectionBounds(html, title);
    if (!target) continue;
    return html.slice(0, target[0]) + section + html.slice(target[0]);
  }
  throw new Error("tracker.html has no Hot Takes or Wrapped 2026 section to insert before");
}

function patchSubscribe(html) {
  return html
    .replaceAll("<b>Couples Radar</b>", "<b>Pairs Radar</b>")
    .replaceAll("Couples Radar", "Pairs Radar");
}

function patchFilter(html) {
  return html.replace(
    'placeholder="Title, pairing, studio"',
    'placeholder="Title, pair, studio"',
  );
}

const catalog = JSON.parse(readFileSync(join(ROOT, "data/series.json"), "utf8"));
const now = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
const view = computeCatalog(catalog, now);
const section = pairSectionHtml(view);

const trackerPath = join(ROOT, "tracker.html");
writeFileSync(trackerPath, patchFilter(patchTracker(readFileSync(trackerPath, "utf8"), section)));

const subPath = join(ROOT, "subscribe.html");
writeFileSync(subPath, patchSubscribe(readFileSync(subPath, "utf8")));

console.log(`injected pairs radar (${pairRadar(view.series).length} pairs)`);
