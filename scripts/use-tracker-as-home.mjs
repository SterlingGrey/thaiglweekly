#!/usr/bin/env node
/**
 * Assemble navigation and the newsletter homepage after Tracker enhancements.
 * The complete, freely accessible Tracker stays at tracker.html.
 */
import { newsletterHome } from "./newsletter-home.mjs";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, process.env.SITE_OUT || ".");

function patch(html, file) {
  const isTracker = file === "tracker.html" || file === "index.html";
  const isMail = file === "subscribe.html" || file === "welcome.html";
  const nav = `<nav class="header-nav"><a href="index.html">Home</a><a href="tracker.html"${isTracker ? ' aria-current="page"' : ""}>Tracker</a><a href="essays/">Essays</a><a href="subscribe.html"${isMail ? ' aria-current="page"' : ""}>Monday email</a></nav>`;
  html = html.replace(/<nav class="header-nav">[\s\S]*?<\/nav>/, nav);
  html = html.replace(
    /<a href="index.html">This week<\/a>\s*<a href="tracker.html">Tracker<\/a>/g,
    `<a href="tracker.html">Tracker</a>`,
  );
  html = html.replaceAll(">Back to this week<", ">Back to the tracker<");

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
    `<style id="week-blocks">.week-list{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}.week-list .compact-card,.week-list .week-ep{height:100%;margin:0}.week-ep.is-premiere{border-left:3px solid var(--green)}.week-ep.is-tonight{border-left:3px solid var(--gold)}.week-ep.is-finale{border-left:3px solid var(--red)}.week-ep.is-penult{border-left:3px solid var(--amber)}@media (max-width:720px){.week-list{grid-template-columns:1fr}}</style>\n</head>`,
  );
  return html;
}

for (const file of readdirSync(OUT)) {
  if (!file.endsWith(".html")) continue;
  if (file === "brand" || file.startsWith("wordmark")) continue;
  const path = join(OUT, file);
  writeFileSync(path, patch(readFileSync(path, "utf8"), file));
}

writeFileSync(join(OUT, "index.html"), newsletterHome(readFileSync(join(OUT, "tracker.html"), "utf8").match(/<script defer src="https:\/\/static\.cloudflareinsights\.com[\s\S]*?<\/script>/)?.[0] || ""));
console.log("Newsletter homepage assembled; complete free Tracker at tracker.html");
