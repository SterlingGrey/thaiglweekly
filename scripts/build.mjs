#!/usr/bin/env node
// One complete build for previews and GitHub Pages.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoRetiredEntry, verifyDormantOutput } from "./premium-public-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
assertNoRetiredEntry(root);
const env = {
  ...process.env,
  SITE_OUT: process.env.SITE_OUT || "site",
  BUILD_NOW: process.env.BUILD_NOW || new Date().toISOString(),
};
for (const script of [
  "build-site.mjs",
  "inject-pairs.mjs",
  "build-series-pages.mjs",
  "inject-shelves.mjs",
  "use-tracker-as-home.mjs",
  "inject-social-meta.mjs",
  "inject-translation.mjs",
  "verify-build.mjs",
  "prepare-essay-launch.mjs",
  "prepare-selling-the-ship.mjs",
  "prepare-building-their-own-house.mjs",
]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(root, "scripts", script)], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Run last, after all dated essay/newsletter assembly stages as well.
// Root builds contain source, so verify the emitted public surface separately.
verifyDormantOutput(env.SITE_OUT === "." ? root : join(root, env.SITE_OUT), { sourceRoot: env.SITE_OUT === "." });
