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
  if (!html.includes('id="week-blocks"')) {
    html = html.replace(
      "</head>",
      `<style id="week-blocks">.week-row{display:flex!important;flex-direction:row!important;gap:12px;align-items:stretch}.week-row>.card-media{width:96px!important;max-width:96px!important;min-width:0!important;flex:0 0 96px!important;margin:0!important;overflow:hidden}.week-row>.card-media .art-wide{width:96px!important;height:96px!important;max-height:96px!important;aspect-ratio:1/1!important;overflow:hidden}.week-row>.card-media .art-img{width:96px!important;height:96px!important;max-width:96px!important;max-height:96px!important;aspect-ratio:auto!important;object-fit:cover}@media (max-width:560px){.week-row{flex-direction:row!important}}</style>\n</head>`,
    );
  }
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
