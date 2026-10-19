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
assert.match(read("index.html"), /Your Thai GL week,/, "Homepage must explain newsletter value");
assert.match(read("index.html"), /data-form="mO4Dhh"/, "Homepage must include signup");
assert.match(read("index.html"), /href="tracker.html"/, "Free Tracker must remain accessible");
for (const title of ["This Week", "Currently Airing", "Coming Soon", "2025 Series Archive", "Complete 2024 Archive", "Complete 2023 Archive", "2022 Archive", "Thai GL-Related Dramas", "Thai GL Movies"]) {
  assert.ok(tracker.includes(`data-title="${title}"`), `Missing tracker shelf: ${title}`);
}
assert.ok(tracker.includes('id="week-blocks"'), "Final homepage styling was not applied");
assert.ok(tracker.includes("css/art-blocks.css"), "Tracker artwork stylesheet is missing");
assert.doesNotMatch(
  tracker,
  /class="compact-card[^"]*(?:is-finale[^"]*is-penult|is-penult[^"]*is-finale)/,
  "A This Week card cannot label its first upcoming episode as both finale and penultimate",
);
for (const file of ["index.html", "tracker.html", "subscribe.html", "welcome.html", "privacy.html", "terms.html", "refund.html", "audience.html"]) {
  const html = read(file);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:access-check|checkout|clerk|stripe)[^"']*["']/i, `Paid access link or sign-in script found on free page: ${file}`);
}
const corrections = read("corrections.html");
assert.match(corrections, /juliet-2026-10-19/, "Public correction must survive a rebuild");
assert.match(read("index.html"), /newsletter\/issue-007\//, "Homepage must offer a full sample issue");
const archive = read("newsletter/issue-007/index.html");
assert.doesNotMatch(archive, /\{\$|ads@spinfuel|mom2jrs93/, "Public issue must not contain email merge tags or private recipient data");
assert.match(archive, /corrections.html#juliet-2026-10-19/, "Archive must display the dated correction");
const subscribe = read("subscribe.html");
assert.match(subscribe, /id="signup-confirmation-note"/, "Rebuild removed the newsletter confirmation instructions");
assert.match(subscribe, /Then check your inbox and click the confirmation link/, "Signup must explain email confirmation");
console.log("Verified assembled free pages: homepage, shelves, styling, and no paid-access links");
