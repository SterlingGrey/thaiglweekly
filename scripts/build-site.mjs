#!/usr/bin/env node
/**
 * Emit static HTML from data/series.json.
 * All date-dependent state is computed here via src/lib/schedule.ts.
 * Do not type "this week" as prose.
 *
 *   SITE_OUT=site node --experimental-strip-types scripts/build-site.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCatalog,
  formatIct,
  formatStamp,
  groupByDay,
} from "../src/lib/schedule.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.SITE_OUT || "site";
const fullAccessReview = false;
const outDir = join(ROOT, OUT);

const catalog = JSON.parse(readFileSync(join(ROOT, "data/series.json"), "utf8"));
const analytics = existsSync(join(ROOT, "data/analytics.txt"))
  ? readFileSync(join(ROOT, "data/analytics.txt"), "utf8")
  : "";

function readBeaconToken() {
  const p = join(ROOT, "data/cloudflare-beacon.txt");
  if (!existsSync(p)) return "";
  const line = readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line || "";
}
const CF_TOKEN = readBeaconToken();

/** Placeholder field colour per studio. Hand-editable; see the _note in the file. */
const STUDIO_COLOURS = existsSync(join(ROOT, "data/studio-colours.json"))
  ? JSON.parse(readFileSync(join(ROOT, "data/studio-colours.json"), "utf8"))
  : {};
function studioColour(studio) {
  const hex = studio ? STUDIO_COLOURS[studio] : "";
  return typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "";
}

const now = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
const view = computeCatalog(catalog, now);

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function wordmark(extra = "") {
  return `<span class="tgw-wordmark${extra ? " " + extra : ""}"><span class="r1"><span class="a">THAI</span><span class="b">GL</span></span><span class="bar"></span><span class="r2">Weekly</span></span>`;
}

function stamp() {
  return `<div class="stamp" role="status"><span class="ok">Current listings reviewed ${esc(formatStamp(view.verifiedAt))}</span><span class="hint">Schedule recalculated ${esc(formatStamp(view.generatedAt))} · air dates use Asia/Bangkok</span></div>`;
}

function nav(current) {
  const items = [
    ["index.html", "This week", current === "index"],
    ["tracker.html", "Tracker", current === "tracker"],
    ["subscribe.html", "Monday email", current === "subscribe"],
  ];
  return `<nav class="header-nav">${items
    .map(
      ([href, label, on]) =>
        `<a href="${href}"${on ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
    )
    .join("")}</nav>`;
}

function header(current, subtitle) {
  return `<div class="header">
  <div class="header-title">
    <h1>${wordmark()}</h1>
    <div class="subtitle">${esc(subtitle)}</div>
  </div>
  <div class="header-meta">
    <div>A free companion to the Thai GL Weekly newsletter</div>
    <div class="updated">Current listings reviewed ${esc(formatStamp(view.verifiedAt))}</div>
  </div>
</div>
${nav(current)}`;
}

function footer() {
  return `<footer class="tgw-foot">
  <div class="tgw-foot-mark">Thai <span>GL</span> Weekly</div>
  <p>Compiled from studio statements, official channels, and established GL outlets.<br>
  We label what we cannot confirm. Corrections run in full. No dating rumours. Ever.</p>
  <div class="tgw-foot-links">
    <a href="index.html">This week</a>
    <a href="tracker.html">Tracker</a>
    <a href="subscribe.html">Subscribe</a>
    <a href="privacy.html">Privacy</a>
    <a href="terms.html">Terms</a>
    <a href="refund.html">Refunds</a>
    <a href="audience.html">Audience</a>
    <a href="mailto:hello@thaiglweekly.com">hello@thaiglweekly.com</a>
  </div>
</footer>`;
}

function modal() {
  return `<div class="modal" id="yt-modal" role="dialog" aria-modal="true" aria-labelledby="yt-modal-title">
  <div class="modal-card">
    <div class="modal-head">
      <div>
        <p id="yt-modal-title" data-yt-title>Video</p>
        <span>official YouTube player</span>
      </div>
      <button type="button" class="modal-x" data-yt-close aria-label="Close video">×</button>
    </div>
    <div class="modal-frame">
      <iframe title="YouTube player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="modal-fallback">
        <p>This uploader has disabled embedding. The official video is still on YouTube.</p>
        <a class="tgw-cta" data-yt-watch href="#" target="_blank" rel="noreferrer">Open on YouTube</a>
      </div>
    </div>
    <p class="modal-foot">Prefer the official studio or network channel. If the player is blank after a few seconds, <a data-yt-watch href="#" target="_blank" rel="noreferrer">open the video on YouTube</a>.</p>
  </div>
</div>`;
}

function shell({ title, desc, current, extraHead = "", body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" type="image/png" href="assets/favicon.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preload" href="assets/fonts/chakrapetch-600-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/ibmplexsansthai-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="css/site.css">
${extraHead}
</head>
<body>
${stamp()}
${body}
${modal()}
<script src="js/site.js"></script>
${cfBeacon()}
</body>
</html>
`;
}

function cfBeacon() {
  if (!CF_TOKEN) {
    return `<!-- Cloudflare Web Analytics: add the token to data/cloudflare-beacon.txt to activate. Cookieless. No personal data. No Google Analytics. -->\n`;
  }
  const payload = JSON.stringify({ token: CF_TOKEN });
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${payload}'></script>\n`;
}

function platClass(name) {
  const n = String(name).toLowerCase();
  if (n.includes("iqiyi")) return "p-iqiyi";
  if (n.includes("wetv")) return "p-wetv";
  if (n.includes("youtube") || n === "yt") return "p-yt";
  if (n.includes("gmm")) return "p-gmm";
  if (n.includes("netflix")) return "p-netflix";
  if (n.includes("ch3") || n.includes("channel 3") || n.includes("3plus") || n.includes("ch3plus")) return "p-ch3";
  if (n.includes("ch7") || n.includes("channel 7") || n.includes("ch7hd")) return "p-ch7";
  if (n.includes("oned") || n.includes("one31") || n.includes("one 31")) return "p-oned";
  if (n.includes("fabel")) return "p-fabel";
  if (n.includes("gaga")) return "p-gaga";
  if (n.includes("monomax")) return "p-monomax";
  return "p-generic";
}

const PLATFORM_DIRECTORY = [
  { name: "GagaOOLala", short: "Gaga", url: "https://www.gagaoolala.com/", group: "international" },
  { name: "YouTube", short: "YouTube", url: "https://www.youtube.com/", group: "international" },
  { name: "WeTV", short: "WeTV", url: "https://wetv.vip/", group: "international" },
  { name: "iQIYI", short: "iQIYI", url: "https://www.iq.com/", group: "international" },
  { name: "Netflix", short: "Netflix", url: "https://www.netflix.com/", group: "international" },
  { name: "Apple TV", short: "Apple TV", url: "https://tv.apple.com/", group: "international" },
  { name: "Monomax", short: "Monomax", url: "https://www.monomax.me/", group: "international" },
  { name: "3Plus", short: "3Plus", url: "https://ch3plus.com/", group: "international" },
  { name: "oneD", short: "oneD", url: "https://www.oned.net/", group: "international" },
  { name: "Viu", short: "Viu", url: "https://www.viu.com/", group: "international" },
  { name: "TrueVisions NOW", short: "True", url: "https://truevisions.co.th/", group: "international" },
  { name: "VIPA", short: "VIPA", url: "https://vipa.me/", group: "international" },
  { name: "onegrand.vip", short: "1G", url: "https://onegrand.vip/", group: "international" },
  { name: "GMMTV", short: "GMMTV", url: "https://www.gmm-tv.com/", group: "thai" },
  { name: "GMM25", short: "GMM25", url: "https://www.gmm25.com/", group: "thai" },
  { name: "one31", short: "one31", url: "https://www.one31.net/", group: "thai" },
  { name: "Channel 3", short: "Ch3", url: "https://www.becworld.com/en/home", group: "thai" },
  { name: "Ch7HD", short: "Ch7HD", url: "https://www.ch7.com/", group: "thai" },
  { name: "Channel 9 MCOT", short: "MCOT", url: "https://www.mcot.net/", group: "thai" },
  { name: "Amarin TV", short: "Amarin", url: "https://www.amarintv.com/", group: "thai" },
  { name: "Thai PBS", short: "PBS", url: "https://www.thaipbs.or.th/", group: "thai" },
  { name: "Workpoint", short: "WP", url: "https://www.workpointtv.com/", group: "thai" },
];

function platformRecord(name) {
  const n = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLATFORM_DIRECTORY.find((p) => {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key === n) return true;
    if (key === "youtube" && (n === "yt" || n.includes("youtube"))) return true;
    if (key === "3plus" && (n === "ch3plus" || n === "3plus")) return true;
    if (key === "channel3" && (n === "ch3" || n === "channel3" || n === "channel3hd")) return true;
    if (key === "ch7hd" && (n.includes("ch7") || n.includes("channel7"))) return true;
    if (key === "oned" && n.includes("oned")) return true;
    if (key === "one31" && (n === "one31" || n === "one31hd")) return true;
    return n.includes(key) || key.includes(n);
  });
}

function platformDirectory() {
  const group = (label, key) => `<div class="platform-group"><span class="platform-group-label">${esc(label)}</span><div class="platform-links">${PLATFORM_DIRECTORY
    .filter((p) => p.group === key)
    .map((p) => {
      const cls = platClass(p.name);
      const mark = cls === "p-yt" ? YT_MARK : `<span class="platform-wordmark" aria-hidden="true">${esc(p.short.slice(0, 2))}</span>`;
      return `<a class="platform-link ${cls}" href="${esc(p.url)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(p.name)} homepage">${mark}<span>${esc(p.name)}</span></a>`;
    })
    .join("")}</div></div>`;
  return `<aside class="platform-directory" aria-label="Streaming platforms and Thai broadcasters">
    ${group("Streaming apps and services", "international")}
    ${group("Thai broadcasters and studios", "thai")}
    <p>Availability varies by country. Each title card gives the most specific verified link and territory note we have.</p>
  </aside>`;
}

const YT_MARK = `<span class="yt-mark" aria-hidden="true"></span>`;

function platPills(platforms) {
  if (!platforms?.length) return "";
  return `<div class="platform-row">${platforms
    .map((p) => {
      const cls = platClass(p.name);
      const label = p.uncut ? `${p.name} (uncut)` : p.name;
      const mark = cls === "p-yt" ? YT_MARK : "";
      const inner = `${mark}${esc(label)}`;
      const href = p.url || platformRecord(p.name)?.url;
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noreferrer" class="plat ${cls}" aria-label="Open ${esc(label)}">${inner}</a>`
        : `<span class="plat ${cls}">${inner}</span>`;
    })
    .join("")}</div>`;
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

function heatTag(series) {
  if (series.heat === "bold") {
    return `<span class="tag tag-heat">🔥 Bold · ${esc(series.studio)}</span>`;
  }
  if (series.heat === "mainstream") {
    return `<span class="tag tag-tame">❄ Mainstream</span>`;
  }
  return "";
}

function tagRow(series) {
  const bits = [heatTag(series)];
  if (series.platforms.some((p) => p.uncut)) bits.push(`<span class="tag tag-uncut">UNCUT</span>`);
  for (const t of series.tags || []) bits.push(`<span class="tag">${esc(t)}</span>`);
  return bits.length ? `<div class="tag-row">${bits.join("")}</div>` : "";
}

function videoBtn(series) {
  const id = series.trailer_youtube_id || series.pilot_youtube_id;
  if (!id) return "";
  const kind = series.trailer_kind || (series.pilot_youtube_id && !series.trailer_youtube_id ? "pilot" : "trailer");
  const label = kind === "pilot" ? "Official pilot" : kind === "teaser" ? "Official teaser" : "Trailer";
  return `<button type="button" class="yt-btn" data-yt="${esc(id)}" data-yt-name="${esc(series.title)}" data-yt-kind="${esc(kind)}">${YT_MARK}${esc(label)}</button>`;
}

const YT_THUMB_PERM =
  "Official-channel YouTube thumbnail, hotlinked from img.youtube.com, for a video already embedded on this page. Not a studio poster.";

/* hqdefault (480x360, letterboxed) exists for every video; maxresdefault does not. */
function youtubeThumb(id, size = "hqdefault") {
  return `https://img.youtube.com/vi/${id}/${size}.jpg`;
}

function imageOf(series) {
  const img = series.image;
  if (img && img.kind === "poster" && img.url) return img;
  const id = series.trailer_youtube_id;
  if (id) {
    return {
      url: youtubeThumb(id),
      kind: "thumbnail",
      source: id,
      permission: YT_THUMB_PERM,
    };
  }
  return { url: null, kind: "none", source: null, permission: null };
}

function artImg(url, alt, kind, eager, videoId) {
  const wh = kind === "poster" ? "" : ` width="480" height="360"`;
  const load = eager ? "eager" : "lazy";
  return `<img class="art-img" src="${esc(url)}" alt="${esc(alt)}"${wh} loading="${load}" decoding="async" referrerpolicy="no-referrer">`;
}

function placeholder(series) {
  const note = series.image_note || "Official artwork not released";
  return `<span class="art-ph-kicker">Thai <span>GL</span> Weekly</span><span class="art-ph-title">${esc(series.title)}</span><span class="art-ph-studio">${esc(series.studio || "")}</span><span class="art-ph-note">${esc(note)}</span>`;
}

/**
 * One slot, 16:9, in every layout. A YouTube thumbnail fills it. A poster
 * (none yet) sits inside it letterboxed, never cropped. Kind none shows a
 * designed placeholder (wordmark, title, studio) on the studio's field colour
 * from data/studio-colours.json. The heat marker lives
 * outside the image, in the card or row body.
 */
function artSlot(series, { layout = "card", eager = false } = {}) {
  const img = imageOf(series);
  const kind = img.kind || "none";
  const playable = Boolean(series.trailer_youtube_id) && kind === "thumbnail";
  const alt = `${series.title} · ${kind === "poster" ? "official poster" : "official YouTube thumbnail"}`;

  const wideInner =
    kind === "poster" && img.url
      ? artImg(img.url, alt, "poster", eager)
      : kind === "thumbnail" && img.url
        ? `${artImg(img.url, alt, "thumbnail", eager, series.trailer_youtube_id)}${playable ? `<span class="art-play">${YT_MARK}</span>` : ""}`
        : placeholder(series);

  const field = kind === "none" ? studioColour(series.studio) : "";
  const inner = `<figure class="art-wide${kind === "none" ? " art-ph" : ""}"${field ? ` style="--studio:${field}"` : ""}>${wideInner}</figure>`;
  const cls = `card-media layout-${layout}${playable ? " is-playable" : ""}`;
  if (playable) {
    const vkind = series.trailer_kind || "trailer";
    return `<button type="button" class="${cls}" data-kind="${esc(kind)}" data-yt="${esc(series.trailer_youtube_id)}" data-yt-name="${esc(series.title)}" data-yt-kind="${esc(vkind)}" aria-label="Play ${esc(series.title)} ${esc(vkind)}">${inner}</button>`;
  }
  return `<div class="${cls}" data-kind="${esc(kind)}">${inner}</div>`;
}

function factsLine(series) {
  const bits = [];
  if (series.novel) bits.push(`Source novel: ${esc(series.novel)}`);
  if (series.runtime) bits.push(`Runtime: ${esc(series.runtime)}`);
  return bits.length ? `<p class="show-facts">${bits.join(" · ")}</p>` : "";
}

function sourceLine(series) {
  if (!series.sources?.length) return "";
  const parts = series.sources.map((s) => {
    const checked = s.checked ? ` (checked ${esc(s.checked)})` : "";
    if (s.url) return `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)}</a>${checked}`;
    return `${esc(s.label)}${checked}`;
  });
  return `<p class="src-line">Sources: ${parts.join("; ")}</p>`;
}

function conflictBox(series) {
  if (!series.conflicts?.length) return "";
  return series.conflicts
    .map((c) => {
      const claims = (c.claims || [])
        .map(
          (cl) =>
            `<li>${esc(cl.claim)} <span style="color:var(--text-dim)">· ${esc(cl.source)}</span></li>`,
        )
        .join("");
      return `<div class="conflict"><h4>⚠ Conflict: ${esc(c.topic)}</h4><ul>${claims}</ul><p style="margin-top:6px">Weight: ${esc(c.weight)}</p></div>`;
    })
    .join("");
}

function availabilitySummary(series) {
  if (series.availability_summary) return series.availability_summary;
  const note = String(series.availability_note || "").trim();
  if (!note) return "";
  const first = note.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || note;
  return first.length > 190 ? `${first.slice(0, 187).trim()}…` : first;
}

function versionHistory(series) {
  if (!series.version_history?.length) return "";
  const items = series.version_history
    .map((version) => {
      const date = version.date ? `<span class="version-date">${esc(version.date)}</span>` : "";
      const runtime = version.runtime ? `<span class="version-runtime">${esc(version.runtime)}</span>` : "";
      const note = version.note ? `<p>${esc(version.note)}</p>` : "";
      return `<li><div class="version-heading"><strong>${esc(version.label)}</strong>${date}${runtime}</div>${note}</li>`;
    })
    .join("");
  return `<div class="version-history"><h4>Version history</h4><ol>${items}</ol></div>`;
}

function evidencePanel(series) {
  const fullAvailability = String(series.availability_note || "").trim();
  const summary = String(availabilitySummary(series) || "").trim();
  const availabilityDetail = fullAvailability && fullAvailability !== summary
    ? `<p class="evidence-availability"><strong>Availability:</strong> ${esc(fullAvailability)}</p>`
    : "";
  const versions = versionHistory(series);
  const conflicts = conflictBox(series);
  const sources = sourceLine(series);
  if (!availabilityDetail && !versions && !conflicts && !sources) return "";
  const summaryLabel = versions ? "Version history, sources, and notes" : "Sources and detailed notes";
  return `<details class="card-evidence"><summary>${summaryLabel}</summary><div class="card-evidence-body">${versions}${availabilityDetail}${conflicts}${sources}</div></details>`;
}

/**
 * Episode pins. Dated series compute each pin from airs_at. A finished series
 * with no dated episodes (wrapped or library) shows every pin as aired, so
 * the watched marks the old tracker offered on wrapped cards still work.
 */
function epTrack(series, { hint = true, compact = false, current = 0 } = {}) {
  const total = series.total_episodes;
  if (!total) return "";
  const dated = Boolean(series.episodes?.length);
  const finished = !dated && (series.derivedStatus === "wrapped" || series.derivedStatus === "library");
  if (!dated && !finished) return "";
  const nextN = series.nextEpisode?.number ?? 0;
  const pills = [];
  for (let i = 1; i <= total; i++) {
    const ep = series.episodes.find((e) => e.number === i);
    const aired = ep ? Date.parse(ep.airs_at) <= view.now : finished || i <= series.airedCount;
    const isNext = nextN === i;
    const isFinale = series.total_episodes != null && i === series.total_episodes && isNext;
    let cls = "ep-future";
    if (isFinale) cls = "ep-finale-pin";
    else if (isNext) cls = "ep-next";
    else if (aired) cls = "ep-aired";
    const title = isFinale
      ? `EP ${i} — series finale`
      : isNext
        ? `EP ${i} — next up`
        : aired
          ? `EP ${i} aired. Click to mark watched.`
          : `EP ${i} — upcoming`;
    pills.push(
      `<button type="button" class="ep-pill ${cls}${i === current ? " ep-this" : ""}" data-ep="${i}" title="${esc(title)}" ${cls === "ep-future" ? "disabled" : ""}><span>${i}</span></button>`,
    );
  }
  const hintLine = hint ? `<p class="ep-hint">Click an aired or next pill to mark it watched (pink ✓). Progress stays in this browser.</p>` : "";
  return `<div class="ep-track${compact ? " ep-track-compact" : ""}" data-show="${esc(series.id)}" data-total="${total}">${pills.join("")}</div>${hintLine}`;
}

function ictLine(iso, unverified) {
  if (unverified) return "time not confirmed";
  const t = formatIct(iso);
  return `${t.day} ${t.date} · ${t.time} ICT`;
}

function seriesCard(series, { compact = false } = {}) {
  const isFilm = series.format === "film";
  const confidenceMark = isFilm
    ? `<span class="conf conf-aired">Released</span>`
    : confBadge(series.confidence);
  const next = series.nextEpisode;
  const isFinaleNext = next?.state === "finale";
  const isPenultNext = next?.state === "penultimate";
  const cardClass = [
    compact ? "compact-card" : "show-card",
    !compact && isFinaleNext ? "is-finale" : "",
    !compact && isPenultNext ? "is-penult" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const filter = esc(
    `${series.title} ${series.title_th} ${series.pairing} ${series.pairing_actors || ""} ${series.studio} ${(series.platforms || []).map((p) => p.name).join(" ")} ${(series.tags || []).join(" ")} ${(series.version_history || []).map((v) => `${v.label || ""} ${v.date || ""} ${v.runtime || ""} ${v.note || ""}`).join(" ")}`,
  );
  const banner = isFinaleNext
    ? `<p class="card-banner finale">🏁 Series Finale</p>`
    : isPenultNext
      ? `<p class="card-banner penult">Penultimate episode</p>`
      : "";
  const statusCls =
    isFinaleNext
      ? "status-finale"
      : series.derivedStatus === "upcoming"
        ? "status-soon"
        : series.derivedStatus === "airing"
          ? "status-airing"
          : "status-wrapped";
  const statusLabel = isFinaleNext
    ? "Finale"
    : series.derivedStatus === "upcoming"
      ? "Soon"
      : series.derivedStatus === "airing"
        ? "Airing"
        : "Wrapped";

  if (compact) {
    return `<div class="${cardClass}" data-filter="${filter}" data-confidence="${esc(series.confidence)}" data-series-id="${esc(series.id)}" id="card-${esc(series.id)}">
      ${artSlot(series, { layout: "compact" })}
      <div class="cc-title">${esc(series.title)} ${confidenceMark}</div>
      <div class="cc-pairing">${esc(series.pairing)}</div>
      <div class="cc-meta"><span>${esc(series.studio)}${series.year ? ` · ${series.year}` : ""}</span>${heatTag(series)}<span class="cc-done">${isFilm ? esc(series.runtime || "Film") : series.total_episodes ? series.total_episodes + " eps" : ""}</span></div>
      ${epTrack(series, { hint: false })}
      ${factsLine(series)}
      ${platPills(series.platforms)}
      ${videoBtn(series)}
      ${isFilm && availabilitySummary(series) ? `<p class="avail-line">${esc(availabilitySummary(series))}</p>` : ""}
      ${isFilm ? evidencePanel(series) : ""}
    </div>`;
  }

  const schedule = next
    ? `<div class="schedule-box${isFinaleNext ? " is-finale" : isPenultNext ? " is-penult" : ""}">
        <div class="sch-row"><span><span class="sch-label">Airs:</span> <span class="sch-val">${esc(series.day_of_week || "")} ${esc(series.air_time_ict ? series.air_time_ict + " ICT" : "")}</span></span></div>
        <div class="sch-row" style="margin-top:4px"><span><span class="sch-label">Latest:</span> <span class="sch-val">${series.latestAired ? "EP " + series.latestAired.number + " (" + formatIct(series.latestAired.airs_at).date + ")" : "none yet"}</span></span><span class="sch-next">▶ EP ${next.number} — ${esc(ictLine(next.airs_at, next.time_unverified))}</span></div>
      </div>`
    : series.finaleAired
      ? `<div class="schedule-box"><span class="sch-val">Finale aired.</span></div>`
      : series.wrap_note
        ? `<div class="schedule-box">${esc(series.wrap_note)}</div>`
        : "";

  const availSummary = availabilitySummary(series);
  return `<article class="${cardClass}" data-filter="${filter}" data-confidence="${esc(series.confidence)}" data-series-id="${esc(series.id)}" id="card-${esc(series.id)}">
    ${banner}
    ${artSlot(series, { layout: "card" })}
    <div class="card-top">
      <div>
        <div class="show-title">${esc(series.title)}${series.title_th ? ` <span class="th">${esc(series.title_th)}</span>` : ""} ${confidenceMark}</div>
        <div class="show-pairing">${esc(series.pairing)}${series.pairing_actors ? ` (${esc(series.pairing_actors)})` : ""}</div>
        <div class="show-studio">${esc(series.studio)}${series.director ? " · " + esc(series.director) : ""}${series.logline ? " · " + esc(series.logline) : ""}</div>
      </div>
      <div class="status-chip ${statusCls}">${statusLabel}</div>
    </div>
    ${factsLine(series)}
    ${epTrack(series)}
    ${schedule}
    ${platPills(series.platforms)}
    ${tagRow(series)}
    ${videoBtn(series)}
    ${availSummary ? `<p class="avail-line">${esc(availSummary)}</p>` : ""}
    ${evidencePanel(series)}
  </article>`;
}

function episodeRow(ep) {
  const t = formatIct(ep.airs_at);
  /* ep.series is the raw record; the computed one carries nextEpisode and derivedStatus. */
  const computed = view.series.find((s) => s.id === ep.series.id) || ep.series;
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
  return `<div class="${cls}" style="padding:12px 14px">
    ${artSlot(ep.series, { layout: "row" })}
    <div class="week-row-body">
    <div class="sch-row"><span>${flag} <span style="color:var(--text-dim)">EP ${ep.number}${ep.series.total_episodes ? "/" + ep.series.total_episodes : ""} · ${esc(ep.series.pairing)} · ${esc(time)}${state ? " · " + state : ""}</span></span><span class="sch-val">${esc((ep.series.platforms || []).map((p) => (p.uncut ? p.name + " uncut" : p.name)).join(" / "))}</span></div>
    ${isFinale ? `<p class="card-banner finale" style="margin-top:6px">Series Finale</p>` : ""}
    ${isPenult ? `<p class="card-banner penult" style="margin-top:6px">Penultimate episode</p>` : ""}
    <div class="platform-row" style="margin-top:8px">${(ep.series.platforms || []).map((p) => {
      const cls = platClass(p.name);
      const mark = cls === "p-yt" ? YT_MARK : "";
      return `<span class="plat ${cls}">${mark}${esc(p.uncut ? p.name + " (uncut)" : p.name)}</span>`;
    }).join("")}${heatTag(ep.series)}${videoBtn(ep.series)}</div>
    <div class="row-foot">${confBadge(ep.series.confidence)}${epTrack(computed, { hint: false, compact: true, current: ep.number })}</div>
    </div>
  </div>`;
}

/** A section with nothing in it is not rendered. `always` keeps it (Tonight). */
function section({ title, labelClass, count, peek, note, inner, open = false, id, always = false, cls = "" }) {
  if (count === 0 && !always) return "";
  return `<div class="section${cls ? " " + cls : ""}" data-open="${open ? "1" : "0"}" data-title="${esc(title)}"${always ? ` data-always-open="1"` : ""}${id ? ` id="${id}"` : ""}>
    <div class="section-header" role="button" tabindex="0" aria-expanded="${open ? "true" : "false"}">
      <h2 class="${labelClass}">${esc(title)}</h2>
      <span class="badge">${count}</span>
      <span class="acc-chevron" aria-hidden="true">▶</span>
    </div>
    <span class="acc-peek">${esc(peek)}</span>
    <div class="acc-body"><div class="acc-inner"><div class="acc-pad">
      ${note ? `<p class="section-note">${note}</p>` : ""}
      ${inner}
    </div></div></div>
  </div>`;
}

function hotCards(takes) {
  if (!takes.length) {
    return `<p class="section-note">Public activity from the last seven days only. Older items roll off. Nothing confirmed in that window.</p>`;
  }
  return `<div class="hot-grid">${takes
    .map((h) => {
      const kind = String(h.kind || "note").toLowerCase();
      const ht = "ht-" + kind.replace(/\s+/g, "");
      return `<article class="hot-card">
        <div class="hot-couple">${esc(h.couple)} <span class="hot-tag ${ht}">${esc(h.kind)}</span></div>
        <div class="hot-actors">${esc(h.actors)}</div>
        <div class="hot-item"><span class="hot-date">${esc(h.date)}</span> ${esc(h.text)}${h.source_label ? ` <span style="color:var(--text-dim)">· ${esc(h.source_label)}</span>` : ""}</div>
      </article>`;
    })
    .join("")}</div>`;
}

function legend() {
  return `<details class="tgw-key" id="verification-key"><summary>What the verification labels mean</summary><div class="keybody"><div class="legend-bar">
  <span class="legend-title">Confidence</span>
  <span class="conf conf-aired">Aired / released</span> <span>episodes or film have been publicly released</span>
  <span class="conf conf-confirmed">Confirmed</span> <span>studio or platform has given a date</span>
  <span class="conf conf-announced">Announced</span> <span>studio named it, no date yet</span>
  <span class="conf conf-fan">Fan-sourced</span> <span>fan accounts only, no studio statement</span>
  <span class="conf conf-unverified">Unverified</span> <span>contradictory or unsourced, do not rely on</span>
  <span style="width:100%"></span>
  <span class="legend-title">Studio Heat</span>
  <span class="tag tag-heat">🔥 Bold</span> <span>assessed PER SERIES from observable evidence — UNCUT episode releases and reported content — with studio track record as supporting context, never studio self-labels</span>
  <span class="tag tag-tame">❄ Mainstream</span> <span>network GL that stays tame by design</span>
</div></div></details>`;
}

function subStrip() {
  return `<div class="tgw-sub">
  <div class="tgw-sub-copy"><b>This tracker is free.</b> The other half is a Monday email: the week ahead, every claim sourced, and the disagreements shown instead of quietly settled. Free to join.</div>
  <a class="tgw-cta" href="subscribe.html">Get the Monday email</a>
</div>`;
}

function notesPanel() {
  const upcoming = view.upcomingWeek.slice(0, 5);
  if (!upcoming.length) return "";
  const items = upcoming
    .map((ep) => {
      const t = formatIct(ep.airs_at);
      const extra =
        ep.state === "finale" ? " finale" : ep.number === 1 ? " premieres" : "";
      return `<span class="note-item"><span class="note-show">${esc(ep.series.title)}</span> EP ${ep.number}${extra} → ${esc(t.date)} (${esc(t.day)})</span>`;
    })
    .join("");
  return `<div id="notes-panel"><span class="note-label">📺 UP NEXT:</span>${items}</div>`;
}

function buildIndex() {
  const upcoming = view.upcomingWeek;
  const tonightUpcoming = upcoming.filter((e) => e.isTonight);
  const tonightAired = view.tonight.filter((e) => e.isPast);
  const rest = upcoming.filter((e) => !e.isTonight);
  const days = groupByDay(rest);
  const ictDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "long" }).format(new Date(view.now));

  const tonightInner =
    tonightUpcoming.length === 0 && tonightAired.length === 0
      ? `<p class="section-note">Nothing airs in Thailand tonight.</p>`
      : `<div class="week-list">${[...tonightUpcoming, ...tonightAired].map(episodeRow).join("")}</div>`;

  const weekInner =
    days.length === 0
      ? `<p class="section-note">No dated episodes in this window.</p>`
      : days
          .map(([day, eps]) => {
            const label = formatIct(eps[0].airs_at);
            return `<div class="day-group"><h3>${esc(label.day)} ${esc(label.date)}</h3><div class="week-list">${eps.map(episodeRow).join("")}</div></div>`;
          })
          .join("");

  const airedInner = view.airedThisWeek.length
    ? `<ul class="aired-list">${view.airedThisWeek
        .map((ep) => {
          const t = formatIct(ep.airs_at);
          return `<li><span>${esc(ep.series.title)} · EP ${ep.number}${ep.state === "finale" ? ' <span class="card-banner finale">Series Finale</span>' : ""}</span><span style="color:var(--text-dim)">${esc(t.day)} ${esc(t.date)} · aired</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="section-note">Nothing in the last seven days sits in this catch-up list.</p>`;

  const body = `${header("index", "What's on Thai GL this week · times in GMT+7")}
  <div class="stats-bar">
    <div class="stat-pill"><span class="dot dot-airing"></span> ${view.airing.length} Currently airing</div>
    <div class="stat-pill"><span class="dot dot-soon"></span> ${view.upcoming.length} Coming soon</div>
    <div class="stat-pill"><span class="dot dot-wrapped"></span> ${view.wrapped.length} Wrapped</div>
  </div>
  <div class="page">
    ${subStrip()}
    <section class="week-hero">
      <p class="week-kicker">One screen. This week only.</p>
      <h1>What is on Thai GL this week</h1>
      <p>Times are Bangkok time (GMT+7). It is ${esc(ictDay)} in Bangkok.</p>
    </section>
    ${legend()}
    ${section({
      title: "Tonight",
      labelClass: "hot-label",
      count: tonightUpcoming.length + tonightAired.length,
      peek: "What airs in Thailand tonight.",
      inner: tonightInner,
      open: true,
      always: true,
      cls: "section-tonight",
    })}
    ${section({
      title: "Next seven days",
      labelClass: "airing-label",
      count: rest.length,
      peek: `${view.weekStart} through ${view.weekEnd} (Asia/Bangkok).`,
      note: `${view.weekStart} through ${view.weekEnd} (Asia/Bangkok).`,
      inner: weekInner,
      open: true,
    })}
    ${section({
      title: "Already aired, last seven days",
      labelClass: "wrapped-label",
      count: view.airedThisWeek.length,
      peek: "Aired in the last seven days.",
      inner: airedInner,
      open: true,
    })}
    ${footer()}
  </div>`;

  return shell({
    title: "Thai GL Weekly — What is on this week",
    desc: "Tonight and the next seven days of Thai GL, computed from air dates in Asia/Bangkok.",
    current: "index",
    body,
  });
}

function buildTracker() {
  const airing = view.airing;
  const upcoming = view.upcoming;
  const wrapped = view.wrapped;
  const library = view.library;
  const movies = library.filter((s) => s.format === "film");
  const completed = [...wrapped, ...library.filter((s) => s.format !== "film")];
  const completed2026 = completed.filter((s) => s.year === 2026);
  const completed2025 = completed.filter((s) => s.year === 2025);
  const completed2024 = completed.filter((s) => s.year === 2024);
  const completed2023 = completed.filter((s) => s.year === 2023);
  const completed2022 = completed.filter((s) => s.year === 2022);

  const stat = ({ href, dot, count, label }) => `<a class="stat-pill" href="#${esc(href)}"><span class="dot ${dot}"></span><span><strong>${count}</strong> ${esc(label)}</span></a>`;

  const body = `${header("tracker", "The sourced Thai GL series tracker")}
  ${platformDirectory()}
  <div class="stats-bar">
    ${stat({ href: "currently-airing", dot: "dot-airing", count: airing.length, label: "Currently Airing" })}
    ${stat({ href: "coming-soon", dot: "dot-soon", count: upcoming.length, label: "Coming Soon" })}
    ${stat({ href: "completed-2026", dot: "dot-wrapped", count: completed2026.length, label: "Concluded in 2026" })}
    ${stat({ href: "completed-2025", dot: "dot-archive", count: completed2025.length, label: "2025 Series Archive" })}
    ${stat({ href: "completed-2024", dot: "dot-archive", count: completed2024.length, label: "Complete 2024 Archive" })}
    ${stat({ href: "completed-2023", dot: "dot-archive", count: completed2023.length, label: "Complete 2023 Archive" })}
    ${stat({ href: "completed-2022", dot: "dot-archive", count: completed2022.length, label: "2022 Archive" })}
    ${stat({ href: "thai-gl-movies", dot: "dot-archive", count: movies.length, label: "Thai GL Movies" })}
  </div>
  <div class="page">
    ${subStrip()}
    <section class="search-panel" aria-labelledby="tracker-search-title">
      <p class="search-kicker">Search the whole tracker</p>
      <h2 id="tracker-search-title">Find a series, movie, or pair</h2>
      <p class="search-intro">Type a title, pair, actor, studio, or platform. Matching shelves open automatically.</p>
      <div class="filter-row">
        <label class="filter-field filter-main"><span>Search</span><input id="filter-q" type="search" placeholder="Try “Ginny”, “Chasing Love”, or “GagaOOLala”" autocomplete="off"></label>
        <label class="filter-field"><span>Verification status <span class="optional">(optional)</span></span><select id="filter-conf">
          <option value="all">Any verification status</option>
          <option value="aired">Released or episodes aired</option>
          <option value="confirmed">Official date confirmed</option>
          <option value="announced">Announced, no date</option>
          <option value="fan_sourced">Fan report only</option>
          <option value="unverified">Conflicting or unverified</option>
        </select></label>
        <button class="tgw-btn filter-clear" id="filter-clear" type="button" hidden>Clear search</button>
      </div>
      <div class="search-feedback" aria-live="polite"><span id="filter-results">Showing all tracker entries.</span><a href="#verification-key">What do the verification labels mean?</a></div>
      <div class="search-empty" id="filter-empty" hidden><strong>No matches.</strong> Try a shorter title, one actor’s name, or reset the verification status.</div>
    </section>
    ${legend()}
    <details class="tracker-tools">
      <summary>Tracker tools</summary>
      <p>Open or close every shelf, or move your watched-episode progress between browsers.</p>
      <div class="tgw-controls">
        <button class="tgw-btn" id="tgw-all" type="button">Open all shelves</button>
        <button class="tgw-btn" id="tgw-none" type="button">Close all shelves</button>
        <button class="tgw-btn" id="export-progress" type="button">Export watched episodes</button>
        <button class="tgw-btn" id="import-progress" type="button">Import watched episodes</button>
        <input id="import-file" type="file" accept="application/json" hidden>
      </div>
    </details>
    <div class="archive-scope"><strong>Archive scope:</strong> Thai productions only. Released scripted series, miniseries, and named anthology arcs are included when a women-loving-women romance is central. A continuing series stays under the year it first premiered. Feature films have their own shelf and do not inflate the series totals. Small independent web shorts, microdramas, pilots, and incidental subplots are outside this tracker unless reader demand makes one worth adding.</div>
    ${section({
      title: "Currently Airing",
      labelClass: "airing-label",
      count: airing.length,
      peek: "Full cards, platforms, episode progress.",
      note: "Tip: click an aired or next episode pill to mark it watched (pink ✓). Your progress saves in this browser.",
      inner: `<div class="airing-grid">${airing.map((s) => seriesCard(s)).join("") || "<p class='section-note'>None.</p>"}</div>`,
      open: true,
      id: "currently-airing",
    })}
    ${section({
      title: "Coming Soon",
      labelClass: "soon-label",
      count: upcoming.length,
      peek: "Dated premieres and announced projects.",
      inner: `<div class="soon-grid">${upcoming.map((s) => seriesCard(s)).join("")}</div>`,
      open: true,
      id: "coming-soon",
    })}
    ${section({
      title: "Concluded in 2026",
      labelClass: "wrapped-label",
      count: completed2026.length,
      peek: "Series whose finales have aired.",
      inner: `<div class="wrapped-grid">${completed2026.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "completed-2026",
    })}
    ${section({
      title: "2025 Series Archive",
      labelClass: "wrapped-label",
      count: completed2025.length,
      peek: "Main series catalog expanded; independent and short-form audit in progress.",
      inner: `<div class="wrapped-grid">${completed2025.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "completed-2025",
    })}
    ${section({
      title: "Complete 2024 Archive",
      labelClass: "wrapped-label",
      count: completed2024.length,
      peek: "17 released series and qualifying spin-offs, audited to the published scope.",
      inner: `<div class="wrapped-grid">${completed2024.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "completed-2024",
    })}
    ${section({
      title: "Complete 2023 Archive",
      labelClass: "wrapped-label",
      count: completed2023.length,
      peek: "Three released series, audited to the published scope. Films appear below.",
      inner: `<div class="wrapped-grid">${completed2023.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "completed-2023",
      always: true,
    })}
    ${section({
      title: "2022 Archive",
      labelClass: "wrapped-label",
      count: completed2022.length,
      peek: "GAP, the series that opened Thailand's modern GL wave.",
      inner: `<div class="wrapped-grid">${completed2022.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "completed-2022",
    })}
    ${section({
      title: "Thai GL Movies",
      labelClass: "wrapped-label",
      count: movies.length,
      peek: "Feature-length Thai films with central women-loving-women stories.",
      note: "Movies are searchable but counted separately from television and web series.",
      inner: `<div class="wrapped-grid">${movies.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
      id: "thai-gl-movies",
      always: true,
    })}
    ${footer()}
  </div>
  ${notesPanel()}`;

  return shell({
    title: "Thai GL Weekly — The Series Tracker",
    desc: "Full verified Thai GL series and movie tracker. Every fact sourced. Every rumor labeled.",
    current: "tracker",
    body,
  });
}

function buildSubscribe() {
  if (fullAccessReview) return buildFullAccessReview("subscribe", { header, footer, shell });
  const extraHead = `<script>
(function(w,d,e,u,f,l,n){w[f]=w[f]||function(){(w[f].q=w[f].q||[]).push(arguments);},l=d.createElement(e),l.async=1,l.src=u,n=d.getElementsByTagName(e)[0],n.parentNode.insertBefore(l,n);})
(window,document,'script','https://assets.mailerlite.com/js/universal.js','ml');
ml('account', '2598833');
</script>`;
  const body = `${header("subscribe", "The verified Thai Girls Love briefing, every Monday")}
  <div class="prose">
    <p style="text-align:center;margin-bottom:22px">${wordmark("hero")}</p>
    <h1>The Monday brief</h1>
    <p>One email a week. Every fact sourced, every rumor labeled, every conflict documented. Free. No accounts. No gate.</p>
    <div class="signup">
      <h2>Subscribe free</h2>
      <p class="sub">No cost, no app, no spam. Unsubscribe in one click.</p>
      <div class="embed"><div class="ml-embedded" data-form="mO4Dhh"></div></div>
      <p class="fineprint">We never share your address. Corrections get published, not buried.</p>
    </div>
    <div class="gets">
      <h3>What lands in your inbox</h3>
      <ul>
        <li><b>This Week on Screen</b> <span>every episode airing, with the air time converted to your own clock.</span></li>
        <li><b>The Wire</b> <span>what moved this week, each item carrying its confidence label.</span></li>
        <li><b>Coming Soon</b> <span>premieres with real dates, and an honest note where the date is not real yet.</span></li>
        <li><b>Pairs Radar</b> <span>what your ships are filming next, sourced.</span></li>
        <li><b>Corrections</b> <span>ours and the industry's, published in full.</span></li>
      </ul>
    </div>
    <div class="law">
      <h3>The rules this newsletter runs on</h3>
      <p><b>Everything carries a confidence label.</b> Aired, confirmed, announced, fan-sourced, unverified. If we cannot confirm it, we say so instead of guessing.</p>
      <p><b>No dating rumors. No relationship speculation. Ever.</b> Not once, not as a joke, not because it is trending.</p>
      <p><b>When sources conflict, you see all of them.</b> We show which way the weight leans and never quietly pick a side.</p>
      <p><b>Corrections run prominently.</b> They are the product, not an embarrassment.</p>
    </div>
    <p style="text-align:center;margin-top:28px"><a href="tracker.html">Browse the full tracker first. Free, no signup.</a></p>
  </div>
  ${footer()}`;
  return shell({
    title: "Subscribe — Thai GL Weekly",
    desc: "The verified Thai Girls Love briefing, every Monday. Every fact sourced, every rumor labeled.",
    current: "subscribe",
    extraHead,
    body,
  });
}

function buildPrivacy() {
  if (fullAccessReview) return buildFullAccessReview("privacy", { header, footer, shell });
  const body = `${header("privacy", "Privacy")}
  <article class="prose">
    <h1>Privacy</h1>
    <p>We collect your email address if you subscribe, and nothing else that identifies you. We do not sell it, rent it, or share it.</p>
    <h2>What we collect</h2>
    <ul>
      <li><strong style="color:var(--text)">Your email address</strong> given by you when you subscribe, confirmed by you before we send anything.</li>
      <li><strong style="color:var(--text)">Whether an issue was opened, and which links were clicked</strong>, standard newsletter analytics used to judge whether an issue was useful. Not sold, not shared.</li>
      <li><strong style="color:var(--text)">The web tracker</strong> requires no account. Episode progress you mark is stored in your own browser and never reaches us.</li>
    </ul>
    <h2>Analytics, without asking you for anything</h2>
    <p>We do not use Google Analytics. We do not set tracking cookies. We do not show a consent banner because we do not collect personal data for measurement.</p>
    <p>The site loads Cloudflare Web Analytics, which is cookieless and stores no personal data. Weekly totals are published on the audience page. Nothing that identifies a person is kept.</p>
    <h2>Who processes email</h2>
    <p>MailerLite stores the list and sends the issues. There is no paid product, so there is no payment processor.</p>
    <h2>Your choices</h2>
    <p>Unsubscribe using the link at the foot of any issue. Ask what we hold, or ask us to delete it, at hello@thaiglweekly.com. If you are in the UK or EU those rights are yours under GDPR. We would honour them regardless.</p>
  </article>
  ${footer()}`;
  return shell({
    title: "Privacy — Thai GL Weekly",
    desc: "We collect your email address and nothing else.",
    current: "privacy",
    body,
  });
}

function buildTerms() {
  if (fullAccessReview) return buildFullAccessReview("terms", { header, footer, shell });
  const body = `${header("terms", "Terms")}
  <article class="prose">
    <h1>Terms</h1>
    <p>Thai GL Weekly is a free information service. There is no paid tier, no account, and no user-generated content.</p>
    <h2>What we promise</h2>
    <p>Every public claim carries a confidence label or a source. When sources disagree we show the conflict instead of quietly picking a side. Corrections run in full.</p>
    <h2>What we cannot promise</h2>
    <p>Studios change dates. Platforms geo-restrict. Uploaders disable embedding. We will be wrong sometimes. When we are, we say so.</p>
    <h2>Video</h2>
    <p>Trailers and pilots play in an on-site YouTube iframe, unmodified, with YouTube branding intact. They are not gated. If embedding is disabled, we fall back to a plain YouTube link.</p>
    <p>Questions: hello@thaiglweekly.com</p>
  </article>
  ${footer()}`;
  return shell({
    title: "Terms — Thai GL Weekly",
    desc: "Thai GL Weekly is a free information service.",
    current: "terms",
    body,
  });
}

function buildRefund() {
  if (fullAccessReview) return buildFullAccessReview("refund", { header, footer, shell });
  const body = `${header("refund", "Refunds")}
  <article class="prose">
    <h1>Refunds</h1>
    <p>There is no paid product. Everything on this site and in the Monday email is free. There is nothing to refund.</p>
    <p>If you were charged historically under a plan that no longer exists, write to hello@thaiglweekly.com and we will put it right.</p>
    <p style="margin-top:24px"><a href="index.html">Back to this week</a></p>
  </article>
  ${footer()}`;
  return shell({
    title: "Refunds — Thai GL Weekly",
    desc: "There is no paid product.",
    current: "refund",
    body,
  });
}

function buildAudience() {
  const body = `${header("audience", "Audience")}
  <article class="prose">
    <h1>Audience</h1>
    <p>Unique visitors, page views, which of the two views gets used, top referrers, and the week-on-week trend. Nothing that identifies a person. No cookies. No consent banner. No Google Analytics.</p>
    <p>Counting starts once thaiglweekly.com is registered with Cloudflare Web Analytics.</p>
    <pre class="log">${esc(analytics)}</pre>
  </article>
  ${footer()}`;
  return shell({
    title: "Audience — Thai GL Weekly",
    desc: "Cookieless audience log.",
    current: "audience",
    body,
  });
}

function buildWelcome() {
  if (fullAccessReview) return buildFullAccessReview("welcome", { header, footer, shell });
  const body = `${header("subscribe", "Welcome")}
  <article class="prose">
    <p style="text-align:center;margin-bottom:22px">${wordmark("hero")}</p>
    <h1>You are on the list</h1>
    <p>The Monday brief lands once a week. Every fact sourced, every rumor labeled. Free. Nothing else to sign up for.</p>
    <p style="margin-top:24px;text-align:center"><a class="tgw-cta" href="tracker.html">Open the tracker while you wait</a></p>
  </article>
  ${footer()}`;
  return shell({
    title: "Welcome — Thai GL Weekly",
    desc: "You are on the list.",
    current: "subscribe",
    body,
  });
}

function write(name, html) {
  writeFileSync(join(outDir, name), html);
  console.log("wrote", join(OUT, name));
}

function firstExisting(paths) {
  return paths.find((p) => existsSync(p));
}

mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "css"), { recursive: true });
mkdirSync(join(outDir, "js"), { recursive: true });
mkdirSync(join(outDir, "assets"), { recursive: true });
mkdirSync(join(outDir, "data"), { recursive: true });
mkdirSync(join(outDir, "brand"), { recursive: true });

function copyIfDifferent(src, dest) {
  if (!src || !existsSync(src)) return;
  if (src === dest) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

const cssSrc = firstExisting([join(ROOT, "css/site.css"), join(ROOT, "site/css/site.css")]);
const jsSrc = firstExisting([join(ROOT, "js/site.js"), join(ROOT, "site/js/site.js")]);
copyIfDifferent(cssSrc, join(outDir, "css/site.css"));
copyIfDifferent(jsSrc, join(outDir, "js/site.js"));

const assetDir = existsSync(join(ROOT, "public/assets"))
  ? join(ROOT, "public/assets")
  : join(ROOT, "assets");
copyIfDifferent(assetDir, join(outDir, "assets"));

copyIfDifferent(join(ROOT, "data/series.json"), join(outDir, "data/series.json"));
if (existsSync(join(ROOT, "data/analytics.txt"))) {
  copyIfDifferent(join(ROOT, "data/analytics.txt"), join(outDir, "data/analytics.txt"));
}
if (existsSync(join(ROOT, "data/missing-trailers.txt"))) {
  copyIfDifferent(join(ROOT, "data/missing-trailers.txt"), join(outDir, "data/missing-trailers.txt"));
}

write("index.html", buildIndex());
write("tracker.html", buildTracker());
write("subscribe.html", buildSubscribe());
write("welcome.html", buildWelcome());
write("privacy.html", buildPrivacy());
write("terms.html", buildTerms());
write("refund.html", buildRefund());
write("audience.html", buildAudience());

const wm = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Thai GL Weekly — wordmark</title>
<link rel="stylesheet" href="../css/site.css">
<style>body{padding:48px;background:#1a0a2e}</style>
</head>
<body>
<p style="color:#9184ad;font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:24px">Do not redraw. This is the wordmark.</p>
${wordmark("hero")}
<p style="margin-top:32px;color:#9184ad;font-size:13px;max-width:40rem">
THAI in paper #efe9f6. GL in gold #d4a15a. A gold rule. Weekly in muted #9184ad, letter-spaced.
Violet field #1a0a2e. This file is the rule, not an emblem to replace with a logo mark.
</p>
</body>
</html>
`;
writeFileSync(join(outDir, "brand/wordmark.html"), wm);

console.log("built", OUT, "at", new Date(now).toISOString(), "stamp", view.generatedAt);
console.log(
  "counts",
  JSON.stringify({
    airing: view.airing.length,
    upcoming: view.upcoming.length,
    wrapped: view.wrapped.length,
    tonight: view.tonight.length,
    thisWeek: view.upcomingWeek.length,
    airedThisWeek: view.airedThisWeek.length,
  }),
);
