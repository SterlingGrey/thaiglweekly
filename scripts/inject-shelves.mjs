#!/usr/bin/env node
/**
 * Tracker shelves:
 *   This Week          — rolling next 7 days (episode rows)
 *   Just Concluded     — finales in the last 7 days
 *   Concluded in 2026  — rename of Wrapped 2026, minus just-concluded
 *
 *   node --experimental-strip-types scripts/inject-shelves.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCatalog, formatIct, groupByDay } from "../src/lib/schedule.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
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
    } else depth++;
  }
  return null;
}

function divBoundsAt(html, start) {
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
        return [start, end];
      }
    } else depth++;
  }
  return null;
}

function upsertSection(html, title, section, beforeTitles) {
  const existing = sectionBounds(html, title);
  if (existing) return html.slice(0, existing[0]) + section + html.slice(existing[1]);
  for (const t of beforeTitles) {
    const target = sectionBounds(html, t);
    if (!target) continue;
    return html.slice(0, target[0]) + section + html.slice(target[0]);
  }
  throw new Error(`no insertion point for "${title}"`);
}

function sectionHtml({ title, labelClass, count, peek, inner, open, always = false }) {
  if (count === 0 && !always) return "";
  return `    <div class="section" data-open="${open ? "1" : "0"}" data-title="${esc(title)}"${always ? ' data-always-open="1"' : ""}>
    <div class="section-header" role="button" tabindex="0" aria-expanded="${open ? "true" : "false"}">
      <h2 class="${labelClass}">${esc(title)}</h2>
      <span class="badge">${count}</span>
      <span class="acc-chevron" aria-hidden="true">▶</span>
    </div>
    <span class="acc-peek">${esc(peek)}</span>
    <div class="acc-body"><div class="acc-inner"><div class="acc-pad">
      ${inner}
    </div></div></div>
  </div>
`;
}

function art(series) {
  const id = series.trailer_youtube_id || series.pilot_youtube_id;
  if (id) {
    const url = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    return `<div class="card-media layout-row" data-kind="thumbnail"><figure class="art-wide"><img class="art-img" src="${esc(url)}" alt="${esc(series.title)}" width="480" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure></div>`;
  }
  return `<div class="card-media layout-row" data-kind="none"><figure class="art-wide art-ph"><span class="art-ph-title">${esc(series.title)}</span><span class="art-ph-studio">${esc(series.studio || "")}</span></figure></div>`;
}

function platClass(name) {
  const n = String(name).toLowerCase();
  if (n.includes("iqiyi")) return "p-iqiyi";
  if (n.includes("wetv")) return "p-wetv";
  if (n.includes("youtube") || n === "yt") return "p-yt";
  if (n.includes("gmm")) return "p-gmm";
  if (n.includes("netflix")) return "p-netflix";
  if (n.includes("ch3") || n.includes("channel 3") || n.includes("3plus")) return "p-ch3";
  if (n.includes("ch7")) return "p-ch7";
  if (n.includes("oned") || n.includes("one31") || n.includes("one 31")) return "p-oned";
  return "p-generic";
}

function episodeRow(ep) {
  const t = formatIct(ep.airs_at);
  const isFinale = ep.state === "finale";
  const isPenult = ep.state === "penultimate";
  const isPremiere = ep.number === 1 && !ep.isPast;
  const cls = [
    "schedule-box",
    "week-row",
    isFinale ? "is-finale" : "",
    isPenult ? "is-penult" : "",
    isPremiere ? "is-premiere" : "",
    ep.isTonight ? "is-tonight" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const flag = isFinale
    ? `<strong style="color:var(--red)">🏁 ${esc(t.day)} ${esc(t.date)} — ${esc(ep.series.title)} FINALE</strong>`
    : isPremiere
      ? `<strong style="color:var(--green)">${esc(t.day)} ${esc(t.date)} — ${esc(ep.series.title)} PREMIERE</strong>`
      : isPenult
        ? `<strong style="color:var(--amber)">${esc(t.day)} ${esc(t.date)} — ${esc(ep.series.title)} · penultimate</strong>`
        : `<strong style="color:var(--text)">${esc(t.day)} ${esc(t.date)} — ${esc(ep.series.title)}</strong>`;
  const time = ep.time_unverified ? "time not confirmed" : `${t.time} ICT`;
  const state = ep.isPast ? "Aired" : ep.isTonight ? "Tonight" : "";
  const plats = (ep.series.platforms || [])
    .map((p) => {
      const name = p.uncut ? `${p.name} (uncut)` : p.name;
      return `<span class="plat ${platClass(p.name)}">${esc(name)}</span>`;
    })
    .join("");
  return `<div class="${cls}" style="padding:12px 14px">
    ${art(ep.series)}
    <div class="week-row-body">
    <div class="sch-row"><span>${flag} <span style="color:var(--text-dim)">EP ${ep.number}${ep.series.total_episodes ? "/" + ep.series.total_episodes : ""} · ${esc(ep.series.pairing)} · ${esc(time)}${state ? " · " + state : ""}</span></span></div>
    ${isFinale ? `<p class="card-banner finale" style="margin-top:6px">Series Finale</p>` : ""}
    ${isPenult ? `<p class="card-banner penult" style="margin-top:6px">Penultimate episode</p>` : ""}
    <div class="platform-row" style="margin-top:8px">${plats}</div>
    </div>
  </div>`;
}

function thisWeekInner(view) {
  const upcoming = view.upcomingWeek;
  if (!upcoming.length) {
    return `<p class="section-note">No dated episode in the next seven days.</p>`;
  }
  const tonight = upcoming.filter((e) => e.isTonight);
  const rest = upcoming.filter((e) => !e.isTonight);
  const bits = [];
  if (tonight.length) {
    bits.push(`<div class="day-group"><h3>Tonight</h3><div class="week-list">${tonight.map(episodeRow).join("")}</div></div>`);
  }
  for (const [, eps] of groupByDay(rest)) {
    const label = formatIct(eps[0].airs_at);
    bits.push(`<div class="day-group"><h3>${esc(label.day)} ${esc(label.date)}</h3><div class="week-list">${eps.map(episodeRow).join("")}</div></div>`);
  }
  return bits.join("");
}

function justConcludedSeries(view) {
  const ids = new Set();
  for (const ep of [...view.airedThisWeek, ...view.tonight]) {
    if (ep.state === "finale" && ep.isPast) ids.add(ep.series.id);
  }
  for (const s of view.wrapped) {
    const finale = (s.episodes || []).find((e) => s.total_episodes != null && e.number === s.total_episodes);
    if (!finale) continue;
    const t = Date.parse(finale.airs_at);
    if (Number.isFinite(t) && t <= view.now && view.now - t <= WEEK_MS) ids.add(s.id);
  }
  return view.wrapped.filter((s) => ids.has(s.id));
}

function extractCard(html, id) {
  const needle = `id="card-${id}"`;
  const i = html.indexOf(needle);
  if (i < 0) return "";
  const start = html.lastIndexOf("<div", i);
  const b = divBoundsAt(html, start);
  return b ? html.slice(b[0], b[1]) : "";
}

function stripCards(html, ids, insideTitle) {
  const bounds = sectionBounds(html, insideTitle);
  if (!bounds) return html;
  let chunk = html.slice(bounds[0], bounds[1]);
  for (const id of ids) {
    const card = extractCard(chunk, id);
    if (card) chunk = chunk.replace(card, "");
  }
  chunk = chunk.replace(/<span class="badge">\d+<\/span>/, `<span class="badge">${countCards(chunk)}</span>`);
  return html.slice(0, bounds[0]) + chunk + html.slice(bounds[1]);
}

function countCards(chunk) {
  return (chunk.match(/class="compact-card"/g) || []).length;
}

const catalog = JSON.parse(readFileSync(join(ROOT, "data/series.json"), "utf8"));
const now = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
const view = computeCatalog(catalog, now);
const just = justConcludedSeries(view);

let html = readFileSync(join(ROOT, "tracker.html"), "utf8");

const weekSection = sectionHtml({
  title: "This Week",
  labelClass: "airing-label",
  count: view.upcomingWeek.length,
  peek: `Rolling next seven days · ${view.weekStart} – ${view.weekEnd} (Bangkok).`,
  inner: thisWeekInner(view),
  open: true,
  always: true,
});
html = upsertSection(html, "This Week", weekSection, ["Currently Airing"]);

if (just.length) {
  const cards = just.map((s) => extractCard(html, s.id)).filter(Boolean);
  const justSection = sectionHtml({
    title: "Just Concluded",
    labelClass: "wrapped-label",
    count: just.length,
    peek: "Finales in the last seven days.",
    inner: cards.length
      ? `<div class="wrapped-grid">${cards.join("")}</div>`
      : `<p class="section-note">Finales in the last seven days.</p>`,
    open: true,
  });
  html = upsertSection(html, "Just Concluded", justSection, [
    "Next Up for Your Favorite GL Pairs",
    "Hot Takes",
    "Wrapped 2026",
    "Concluded in 2026",
  ]);
}

html = html.replaceAll("Wrapped 2026", "Concluded in 2026");
html = html.replace("Series whose finale has aired.", "Every 2026 title whose finale has aired.");

if (just.length) {
  html = stripCards(html, just.map((s) => s.id), "Concluded in 2026");
  const bounds = sectionBounds(html, "Concluded in 2026");
  const remaining = bounds ? countCards(html.slice(bounds[0], bounds[1])) : 0;
  html = html.replace(/\d+ Concluded in 2026/, `${remaining} Concluded in 2026`);
}

writeFileSync(join(ROOT, "tracker.html"), html);
console.log(
  `shelves: this week ${view.upcomingWeek.length}, just concluded ${just.map((s) => s.id).join(",") || "none"}`,
);
