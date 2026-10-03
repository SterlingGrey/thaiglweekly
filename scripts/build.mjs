#!/usr/bin/env node
// One complete build for previews and GitHub Pages.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  SITE_OUT: process.env.SITE_OUT || "site",
  BUILD_NOW: process.env.BUILD_NOW || new Date().toISOString(),
};
for (const script of [
  "build-site.mjs",
  "inject-pairs.mjs",
  "inject-shelves.mjs",
  "use-tracker-as-home.mjs",
  "verify-build.mjs",
]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(root, "scripts", script)], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
