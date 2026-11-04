import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "./worker.mjs";
import { privateReviewAllowed, reviewIdentityEnvironment } from "./release.mjs";

test("development identity is confined to a loopback reviewer and closed public release", () => {
  const env = { PREMIUM_RELEASE: "disabled", PREMIUM_REVIEW: "enabled",
    CLERK_REVIEW_ISSUER: "https://sample.clerk.accounts.dev", CLERK_REVIEW_ALLOWED_ORIGIN: "http://127.0.0.1:8791",
    CLERK_REVIEW_SECRET_KEY: "sk_test_placeholder" };
  assert.equal(reviewIdentityEnvironment(env).CLERK_ALLOWED_ORIGIN, "http://127.0.0.1:8791");
  for (const changed of [
    { PREMIUM_RELEASE: "enabled" }, { PREMIUM_REVIEW: "disabled" }, { CLERK_REVIEW_SECRET_KEY: "sk_live_placeholder" },
    { CLERK_REVIEW_ISSUER: "https://clerk.thaiglweekly.com" }, { CLERK_REVIEW_ISSUER: "https://sample.clerk.accounts.dev.evil.example" },
    { CLERK_REVIEW_ALLOWED_ORIGIN: "http://public.example:8791" }, { CLERK_REVIEW_ALLOWED_ORIGIN: "http://127.0.0.1:8791/other" },
  ]) assert.throws(() => reviewIdentityEnvironment({ ...env, ...changed }));
});
import { verifyDormantOutput } from "../scripts/premium-public-guard.mjs";

test("unreleased service hides both member and sandbox routes before any provider call", async () => {
  for (const path of ["/tracker", "/tracker-test"]) {
    for (const method of ["GET", "OPTIONS", "POST"]) {
      const response = await worker.fetch(new Request(`https://member.example${path}`, { method }), {});
      assert.equal(response.status, 404);
      assert.equal(await response.text(), "Not found");
      assert.match(response.headers.get("Cache-Control"), /no-store/);
    }
  }
});

test("private review requires a verified address on an exact, explicit allowlist", () => {
  const env = { PREMIUM_REVIEW: "enabled", PREMIUM_REVIEW_EMAILS: " Owner@Example.com " };
  assert.equal(privateReviewAllowed(env, "owner@example.com"), true);
  assert.equal(privateReviewAllowed(env, "other@example.com"), false);
  assert.equal(privateReviewAllowed({ ...env, PREMIUM_REVIEW: "false" }, "owner@example.com"), false);
});

test("public-output guard catches nested, stale and metadata-only premium leaks", () => {
  const root = mkdtempSync(join(tmpdir(), "tgw-public-"));
  try {
    mkdirSync(join(root, "essays"));
    writeFileSync(join(root, "essays", "index.html"), "<p>Free essays; 3Plus Premium is a viewing service.</p>");
    assert.equal(verifyDormantOutput(root), true);
    for (const content of ["<meta content='Full Access'>", "<a href='/premium.html'>Read more</a>", "PREMIUM_PRIVATE_CANARY"]) {
      writeFileSync(join(root, "essays", "index.html"), content);
      assert.throws(() => verifyDormantOutput(root));
    }
    writeFileSync(join(root, "essays", "index.html"), "Free");
    writeFileSync(join(root, "access-check.html"), "Old sign-in");
    assert.throws(() => verifyDormantOutput(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
