import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadCatalog(root) {
  const catalog = JSON.parse(readFileSync(join(root, "data/series.json"), "utf8"));
  const additionsPath = join(root, "data/series-additions.json");
  if (existsSync(additionsPath)) {
    const extra = JSON.parse(readFileSync(additionsPath, "utf8"));
    const have = new Set((catalog.series || []).map((s) => s.id));
    for (const s of extra.series || []) if (!have.has(s.id)) catalog.series.push(s);
    const haveH = new Set((catalog.hot_takes || []).map((h) => h.id));
    for (const h of extra.hot_takes || []) if (!haveH.has(h.id)) (catalog.hot_takes ||= []).unshift(h);
    if (extra.verified_at) catalog.verified_at = extra.verified_at;
  }
  return catalog;
}
