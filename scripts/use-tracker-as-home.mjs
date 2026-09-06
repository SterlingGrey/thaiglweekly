#!/usr/bin/env node
/**
 * The This week page is not shipping. Homepage is the tracker.
 * build-site still emits a week view at index.html; this overwrites it.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function patch(html, file) {
  const isTracker = file === "tracker.html" || file === "index.html";
  const isMail = file === "subscribe.html" || file === "welcome.html";
  const nav = `<nav class="header-nav"><a href="index.html"${isTracker ? ' aria-current="page"' : ""}>Tracker</a><a href="subscribe.html"${isMail ? ' aria-current="page"' : ""}>Monday email</a></nav>`;
  html = html.replace(/<nav class="header-nav">[\s\S]*?<\/nav>/, nav);
  html = html.replace(
    /<a href="index.html">This week<\/a>\s*<a href="tracker.html">Tracker<\/a>/g,
    `<a href="index.html">Tracker</a>`,
  );
  html = html.replaceAll(">Back to this week<", ">Back to the tracker<");
  html = html.replace('href="tracker.html">Browse the full tracker', 'href="index.html">Browse the full tracker');
  if (!html.includes("css/art-blocks.css")) {
    html = html.replace(
      '<link rel="stylesheet" href="css/site.css">',
      '<link rel="stylesheet" href="css/site.css">\n<link rel="stylesheet" href="css/art-blocks.css?v=blocks">',
    );
  } else {
    html = html.replace('css/art-blocks.css"', 'css/art-blocks.css?v=blocks"');
    html = html.replace("css/art-blocks.css'", "css/art-blocks.css?v=blocks'");
  }
  html = html.replace(/<style id="week-blocks">[\s\S]*?<\/style>\s*/g, "");
  html = html.replace(
    "</head>",
    `<style id="week-blocks">.week-row{display:flex!important;flex-direction:row!important;gap:12px;align-items:stretch}.week-row .card-media{width:96px!important;max-width:96px!important;min-width:0!important;flex:0 0 96px!important;margin:0!important;overflow:hidden}.week-row .art-wide{width:96px!important;height:96px!important;max-height:96px!important;aspect-ratio:1/1!important;overflow:hidden}.week-row .art-img{width:96px!important;height:96px!important;max-width:96px!important;max-height:96px!important;aspect-ratio:auto!important;object-fit:cover!important;display:block!important}@media (max-width:560px){.week-row{flex-direction:row!important}}</style>\n</head>`,
  );
  html = html.replace(
    /<div class="card-media layout-row" data-kind="(thumbnail|none)">/g,
    '<div class="card-media layout-row" data-kind="$1" style="width:96px;height:96px;max-width:96px;min-width:0;flex:0 0 96px;margin:0;overflow:hidden">',
  );
  html = html.replace(
    /(<div class="card-media layout-row"[^>]*>)\s*<figure class="art-wide">/g,
    '$1<figure class="art-wide" style="width:96px;height:96px;aspect-ratio:1/1;margin:0;overflow:hidden;border-radius:8px">',
  );
  html = html.replace(
    /(<div class="card-media layout-row"[^>]*>\s*<figure class="art-wide art-ph">)/g,
    '<div class="card-media layout-row" data-kind="none" style="width:96px;height:96px;max-width:96px;min-width:0;flex:0 0 96px;margin:0;overflow:hidden"><figure class="art-wide art-ph" style="width:96px;height:96px;aspect-ratio:1/1;margin:0;overflow:hidden;border-radius:8px">',
  );
  html = html.replace(
    /(<div class="card-media layout-row"[\s\S]{0,500}?<img class="art-img"[^>]*?)width="480" height="360"/g,
    '$1width="96" height="96" style="width:96px;height:96px;object-fit:cover;display:block"',
  );
  return html;
}

for (const file of readdirSync(ROOT)) {
  if (!file.endsWith(".html")) continue;
  if (file === "brand" || file.startsWith("wordmark")) continue;
  const path = join(ROOT, file);
  writeFileSync(path, patch(readFileSync(path, "utf8"), file));
}

writeFileSync(join(ROOT, "index.html"), readFileSync(join(ROOT, "tracker.html"), "utf8"));
console.log("homepage is the tracker; This week is not linked");
