import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Approved policy text can name the membership without providing a purchase path.
const policyPages = new Set(["terms.html", "privacy.html", "refund.html"]);

export function verifyDormantOutput(out, { sourceRoot = false } = {}) {
  const excluded = new Set([".git", ".github", "premium", "preview", "node_modules", "scripts", "src", "docs", "site", "launch-source", "tmp", "subscriber-output"]);
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (sourceRoot && directory === out && excluded.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Public output must not contain symlinks");
    return entry.isDirectory() ? walk(path) : [path];
  });
  for (const path of walk(out)) {
    const name = relative(out, path).replaceAll("\\", "/");
    if (/^(?:premium|preview)(?:\/|\.)|(?:^|\/)(?:access-check|membership|checkout|sunday-brief|member-tools)(?:\.html|\/)/i.test(name)) {
      throw new Error(`Member or review surface in public build: ${name}`);
    }
    if (!/\.(?:html?|js|mjs|json|xml|txt|css|map)$/i.test(name)) continue;
    const text = readFileSync(path, "utf8");
    if ((!policyPages.has(name) && /Full\s+Access/i.test(text)) ||
        /Notify me when it opens|Full\s+Access\s+waitlist|PREMIUM_PRIVATE_CANARY/i.test(text) ||
        /(?:href|src|action)\s*=\s*["'][^"']*(?:access-check|buy\.stripe\.com|checkout\.stripe\.com|premium\.html|membership\.html)/i.test(text)) {
      throw new Error(`Premium offer, entry point or private content in public build: ${name}`);
    }
  }
  return true;
}

export function assertNoRetiredEntry(root) {
  if (existsSync(join(root, "access-check.html"))) throw new Error("Remove retired public access-check.html before building");
  if (existsSync(join(root, ".nojekyll"))) throw new Error("Branch-based Pages requires Jekyll exclusions for dormant member source");
}
