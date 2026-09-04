/**
 * Daily job: rewrite generated_at to now. Episode dates stay untouched.
 * verified_at is never touched here; only a research pass sets it.
 * Status is computed at build time by scripts/build-site.mjs.
 *
 * Usage: node scripts/stamp-generated-at.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const paths = ["data/series.json", "src/data/series.json", "public/data/series.json"];

const now = new Date();
const generated_at = now.toISOString();

for (const p of paths) {
  if (!existsSync(p)) continue;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    data.generated_at = generated_at;
    writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
    console.log("stamped", p, generated_at);
  } catch (err) {
    console.warn("skip", p, err.message);
  }
}
