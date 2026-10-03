#!/usr/bin/env node
// Check the assembled pages, after every build stage has completed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, process.env.SITE_OUT || "site");
const read = (file) => readFileSync(join(out, file), "utf8");
const tracker = read("tracker.html");
assert.equal(read("index.html"), tracker, "Homepage must be the complete free tracker");
for (const title of ["This Week", "Currently Airing", "Coming Soon", "2025 Series Archive", "Complete 2024 Archive", "Complete 2023 Archive", "2022 Archive", "Thai GL Movies"]) {
  assert.ok(tracker.includes(`data-title="${title}"`), `Missing tracker shelf: ${title}`);
}
assert.ok(tracker.includes('id="week-blocks"'), "Final homepage styling was not applied");
assert.ok(tracker.includes("css/art-blocks.css"), "Tracker artwork stylesheet is missing");
for (const file of ["index.html", "tracker.html", "subscribe.html", "welcome.html", "privacy.html", "terms.html", "refund.html", "audience.html"]) {
  const html = read(file);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:access-check|checkout|clerk|stripe)[^"']*["']/i, `Paid access link or sign-in script found on free page: ${file}`);
}
console.log("Verified assembled free pages: homepage, shelves, styling, and no paid-access links");
