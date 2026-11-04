import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemberState } from "./member-state.mjs";

test("shipping configuration keeps release closed and preserves Jekyll private-source exclusions", () => {
  const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.vars.PREMIUM_RELEASE, "disabled");
  assert.equal(config.vars.PREMIUM_REVIEW, "disabled");
  assert.equal(config.vars.PREMIUM_REVIEW_EMAILS, "");
  const jekyll = readFileSync(new URL("../_config.yml", import.meta.url), "utf8");
  for (const path of ["launch-source", "premium", "preview", "node_modules", "scripts", "src", "docs", "access-check.html"]) assert.match(jekyll, new RegExp("  - " + path.replaceAll(".", "\\.")));
});

test("parallel saves have exactly one winner, retaining the latest accepted version", async () => {
  const data = new Map(); let queue = Promise.resolve();
  const store = { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)),
    transaction: fn => { const result = queue.then(() => fn(store)); queue = result.catch(() => {}); return result; } };
  const object = new MemberState({ storage: store });
  const request = title => new Request("https://internal/save", { method: "POST", body: JSON.stringify({ userId: "user_fixture", version: 0, state: { follows: [title], watched: {}, timezone: "UTC" } }) });
  const results = await Promise.all([object.fetch(request("first")), object.fetch(request("second"))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(data.get("member:user_fixture").version, 1);
});
