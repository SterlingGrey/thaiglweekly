/**
 * Fold data/series-additions.json into data/series.json before a rebuild.
 * Idempotent. Safe to run when the additions file is missing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = join(ROOT, "data/series.json");
const extraPath = join(ROOT, "data/series-additions.json");

if (!existsSync(extraPath)) {
  console.log("no series-additions.json");
  process.exit(0);
}

const catalog = JSON.parse(readFileSync(mainPath, "utf8"));
const extra = JSON.parse(readFileSync(extraPath, "utf8"));
const have = new Set((catalog.series || []).map((s) => s.id));
let added = 0;
for (const s of extra.series || []) {
  if (!have.has(s.id)) {
    catalog.series.push(s);
    added += 1;
  }
}
const haveH = new Set((catalog.hot_takes || []).map((h) => h.id));
let takes = 0;
for (const h of extra.hot_takes || []) {
  if (!haveH.has(h.id)) {
    (catalog.hot_takes ||= []).unshift(h);
    takes += 1;
  }
}
if (extra.verified_at) catalog.verified_at = extra.verified_at;
writeFileSync(mainPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`merged additions: +${added} series, +${takes} hot takes`);
