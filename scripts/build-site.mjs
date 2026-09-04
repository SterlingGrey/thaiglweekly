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
  return `<div class="stamp" role="status"><span class="ok">Verified as of ${esc(formatStamp(view.verifiedAt))}</span><span class="hint">Pages rebuilt ${esc(formatStamp(view.generatedAt))}. Air dates computed against Asia/Bangkok.</span></div>`;
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
    <div class="updated">Verified ${esc(formatStamp(view.verifiedAt))}</div>
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
  if (n.includes("monomax")) return "p-monomax";
  return "p-generic";
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
      return p.url
        ? `<a href="${esc(p.url)}" target="_blank" rel="noreferrer" class="plat ${cls}">${inner}</a>`
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

function youtubeThumb(id, size = "maxresdefault") {
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
  const wh = kind === "poster" ? "" : ` width="1280" height="720"`;
  const load = eager ? "eager" : "lazy";
  const hq = videoId ? youtubeThumb(videoId, "hqdefault") : "";
  const onerr =
    hq && !String(url).includes("hqdefault")
      ? ` onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${esc(hq)}';}"`
      : "";
  return `<img class="art-img" src="${esc(url)}" alt="${esc(alt)}"${wh} loading="${load}" decoding="async" referrerpolicy="no-referrer"${onerr}>`;
}

function placeholder(series) {
  return `<span class="art-ph-kicker">Thai <span>GL</span> Weekly</span><span class="art-ph-title">${esc(series.title)}</span><span class="art-ph-studio">${esc(series.studio || "")}</span>`;
}

/**
 * One slot, 16:9, in every layout. A YouTube thumbnail fills it. A poster
 * (none yet) sits inside it letterboxed, never cropped. Kind none shows a
 * designed placeholder (wordmark, title, studio). The heat marker lives
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

  const inner = `<figure class="art-wide${kind === "none" ? " art-ph" : ""}">${wideInner}</figure>`;
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

/**
 * Episode pins. Dated series compute each pin from airs_at. A finished series
 * with no dated episodes (wrapped or library) shows every pin as aired, so
 * the watched marks the old tracker offered on wrapped cards still work.
 */
function epTrack(series, { hint = true } = {}) {
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
      `<button type="button" class="ep-pill ${cls}" data-ep="${i}" title="${esc(title)}" ${cls === "ep-future" ? "disabled" : ""}><span>${i}</span></button>`,
    );
  }
  const hintLine = hint ? `<p class="ep-hint">Click an aired or next pill to mark it watched (pink ✓). Progress stays in this browser.</p>` : "";
  return `<div class="ep-track" data-show="${esc(series.id)}" data-total="${total}">${pills.join("")}</div>${hintLine}`;
}

function ictLine(iso, unverified) {
  if (unverified) return "time not confirmed";
  const t = formatIct(iso);
  return `${t.day} ${t.date} · ${t.time} ICT`;
}

function seriesCard(series, { compact = false } = {}) {
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
    `${series.title} ${series.title_th} ${series.pairing} ${series.studio} ${(series.tags || []).join(" ")} conf:${series.confidence}`,
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
    return `<div class="${cardClass}" data-filter="${filter}" id="card-${esc(series.id)}">
      ${artSlot(series, { layout: "compact" })}
      <div class="cc-title">${esc(series.title)} ${confBadge(series.confidence)}</div>
      <div class="cc-pairing">${esc(series.pairing)}</div>
      <div class="cc-meta"><span>${esc(series.studio)}${series.year ? ` · ${series.year}` : ""}</span>${heatTag(series)}<span class="cc-done">${series.total_episodes ? series.total_episodes + " eps" : ""}</span></div>
      ${epTrack(series, { hint: false })}
      ${factsLine(series)}
      ${platPills(series.platforms)}
      ${videoBtn(series)}
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

  return `<article class="${cardClass}" data-filter="${filter}" id="card-${esc(series.id)}">
    ${banner}
    ${artSlot(series, { layout: "card" })}
    <div class="card-top">
      <div>
        <div class="show-title">${esc(series.title)}${series.title_th ? ` <span class="th">${esc(series.title_th)}</span>` : ""} ${confBadge(series.confidence)}</div>
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
    ${series.availability_note ? `<p class="src-line">${esc(series.availability_note)}</p>` : ""}
    ${conflictBox(series)}
    ${sourceLine(series)}
  </article>`;
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
    ${confBadge(ep.series.confidence)}
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
  return `<details class="tgw-key"><summary>Key — confidence and studio heat</summary><div class="keybody"><div class="legend-bar">
  <span class="legend-title">Confidence</span>
  <span class="conf conf-aired">Aired</span> <span>episodes released, self-verifying</span>
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
    <div class="stat-pill"><span class="dot dot-hot"></span> Hot Takes: last seven days</div>
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
    ${section({
      title: "Hot Takes",
      labelClass: "hot-label",
      count: view.hotTakes.length,
      peek: "Verified public activity, last seven days.",
      inner: hotCards(view.hotTakes),
      open: view.hotTakes.length > 0,
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
  const wrapped2026 = wrapped.filter((s) => s.year >= 2026);
  const library2025 = [...wrapped.filter((s) => s.year === 2025), ...library.filter((s) => s.year === 2025)];
  const libraryOlder = [...wrapped.filter((s) => s.year < 2025), ...library.filter((s) => s.year < 2025)];

  const body = `${header("tracker", "The verified Thai GL tracker · iQIYI · WeTV · GMMTV · YouTube · Netflix · Ch7HD · Ch3")}
  <div class="stats-bar">
    <div class="stat-pill"><span class="dot dot-airing"></span> ${airing.length} Currently Airing</div>
    <div class="stat-pill"><span class="dot dot-wrapped"></span> ${wrapped2026.length} Wrapped 2026</div>
    <div class="stat-pill"><span class="dot dot-soon"></span> ${upcoming.length} Coming Soon</div>
    <div class="stat-pill"><span class="dot dot-hot"></span> Hot Takes: verified activity only</div>
    <div class="stat-pill"><span class="dot" style="background:var(--accent)"></span> ${library2025.length} Notable 2025</div>
    <div class="stat-pill"><span class="dot" style="background:var(--accent)"></span> ${libraryOlder.length} Notable 2024</div>
  </div>
  <div class="page">
    ${subStrip()}
    ${legend()}
    <div class="tgw-controls">
      <button class="tgw-btn" id="tgw-all" type="button">Open all</button>
      <button class="tgw-btn" id="tgw-none" type="button">Close all</button>
      <button class="tgw-btn" id="export-progress" type="button">Export watched</button>
      <button class="tgw-btn" id="import-progress" type="button">Import watched</button>
      <input id="import-file" type="file" accept="application/json" hidden>
    </div>
    <div class="filter-row">
      <input id="filter-q" type="search" placeholder="Title, pairing, studio" aria-label="Filter series">
      <select id="filter-conf" aria-label="Confidence">
        <option value="all">All confidence</option>
        <option value="aired">Aired</option>
        <option value="confirmed">Confirmed</option>
        <option value="announced">Announced</option>
        <option value="fan_sourced">Fan-sourced</option>
        <option value="unverified">Unverified</option>
      </select>
    </div>
    ${section({
      title: "Currently Airing",
      labelClass: "airing-label",
      count: airing.length,
      peek: "Full cards, platforms, episode progress.",
      note: "Tip: click an aired or next episode pill to mark it watched (pink ✓). Your progress saves in this browser.",
      inner: `<div class="airing-grid">${airing.map((s) => seriesCard(s)).join("") || "<p class='section-note'>None.</p>"}</div>`,
      open: true,
    })}
    ${section({
      title: "Coming Soon",
      labelClass: "soon-label",
      count: upcoming.length,
      peek: "Dated premieres and announced projects.",
      inner: `<div class="soon-grid">${upcoming.map((s) => seriesCard(s)).join("")}</div>`,
      open: true,
    })}
    ${section({
      title: "Hot Takes",
      labelClass: "hot-label",
      count: view.hotTakes.length,
      peek: "Verified public activity, last seven days.",
      inner: hotCards(view.hotTakes),
      open: view.hotTakes.length > 0,
    })}
    ${section({
      title: "Wrapped 2026",
      labelClass: "wrapped-label",
      count: wrapped2026.length,
      peek: "Series whose finale has aired.",
      inner: `<div class="wrapped-grid">${wrapped2026.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
    })}
    ${section({
      title: "Completed 2025 — Notable",
      labelClass: "wrapped-label",
      count: library2025.length,
      peek: "Catch-up shelf.",
      inner: `<div class="wrapped-grid">${library2025.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
    })}
    ${section({
      title: "Completed 2024 — Notable",
      labelClass: "wrapped-label",
      count: libraryOlder.length,
      peek: "Catch-up shelf.",
      inner: `<div class="wrapped-grid">${libraryOlder.map((s) => seriesCard(s, { compact: true })).join("")}</div>`,
      open: false,
    })}
    ${footer()}
  </div>
  ${notesPanel()}`;

  return shell({
    title: "Thai GL Weekly — The Series Tracker",
    desc: "Full verified Thai GL tracker. Every fact sourced. Every rumor labeled.",
    current: "tracker",
    body,
  });
}

function buildSubscribe() {
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
        <li><b>Couples Radar</b> <span>what your ships are filming next, sourced.</span></li>
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
