import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { hasFullAccess, verifiedEmail } from "./access.mjs";
import worker from "./worker.mjs";

const env = {
  PREMIUM_RELEASE: "enabled",
  PREMIUM_REVIEW: "enabled",
  PREMIUM_REVIEW_EMAILS: "reader@example.com",
  CLERK_ISSUER: "https://clerk.thaiglweekly.com",
  CLERK_ALLOWED_ORIGIN: "https://thaiglweekly.com",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  FULL_ACCESS_PRICE_ID: "price_full_access",
  STRIPE_RESTRICTED_KEY: "rk_live_placeholder",
};

function clerkUser(email = "Reader@Example.com", status = "verified") {
  return { id: "user_reader", primary_email_address_id: "id_primary", email_addresses: [
    { id: "id_other", email_address: "other@example.com", verification: { status: "verified" } },
    { id: "id_primary", email_address: email, verification: { status } },
  ] };
}

test("Clerk assertion requires a valid signature, issuer, user, and verified primary email", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  let user = clerkUser();
  const fetcher = async (url) => String(url).endsWith("/.well-known/jwks.json")
    ? Response.json({ keys: [jwk] }) : Response.json(user);
  const signed = (claims = {}, issuer = env.CLERK_ISSUER) => new SignJWT({ sub: "user_reader", azp: env.CLERK_ALLOWED_ORIGIN, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  assert.equal(await verifiedEmail(await signed(), env, fetcher), "Reader@Example.com");
  await assert.rejects(verifiedEmail(await signed({}, "https://another.clerk.accounts.dev"), env, fetcher));
  await assert.rejects(verifiedEmail(await signed({ azp: "https://other.example" }), env, fetcher));
  await assert.rejects(verifiedEmail(await signed({ azp: undefined }), env, fetcher));
  await assert.rejects(verifiedEmail(await signed({ sts: "pending" }), env, fetcher));
  await assert.rejects(verifiedEmail(await signed({ sub: "user_other" }), env, fetcher));
  user = clerkUser("Reader@Example.com", "unverified");
  await assert.rejects(verifiedEmail(await signed(), env, fetcher));
  user = { ...clerkUser(), banned: true };
  await assert.rejects(verifiedEmail(await signed(), env, fetcher));
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({ sub: "user_reader", azp: env.CLERK_ALLOWED_ORIGIN })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(env.CLERK_ISSUER)
    .setExpirationTime("5m").sign(other.privateKey);
  await assert.rejects(verifiedEmail(forged, env, fetcher));
  const expired = await new SignJWT({ sub: "user_reader", azp: env.CLERK_ALLOWED_ORIGIN })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(env.CLERK_ISSUER)
    .setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  await assert.rejects(verifiedEmail(expired, env, fetcher));
  await assert.rejects(verifiedEmail(await signed(), env, async (url) =>
    String(url).endsWith("/.well-known/jwks.json") ? Response.json({ keys: [jwk] }) : new Response("down", { status: 503 })));
});

function stripeFixture(status = "active", customerEmail = "reader@example.com", price = env.FULL_ACCESS_PRICE_ID) {
  return async (url) => {
    const request = new URL(url);
    if (request.pathname === "/v1/customers") return Response.json({ data: [{ id: "cus_reader", email: customerEmail }], has_more: false });
    if (request.pathname === "/v1/customers/search") return Response.json({ data: [{ id: "cus_reader", email: customerEmail }], has_more: false });
    if (request.pathname === "/v1/subscriptions") {
      assert.equal(request.searchParams.get("customer"), "cus_reader");
      assert.equal(request.searchParams.get("price"), price);
      return Response.json({ data: [{ status, items: { data: [{ price: { id: price } }] } }], has_more: false });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
}

test("active matching subscription admits the signed-in customer", async () => {
  assert.equal(await hasFullAccess("reader@example.com", env, stripeFixture()), true);
});

test("customer lookup tolerates email case without admitting a different address", async () => {
  const calls = [];
  const fetcher = async (url) => {
    const request = new URL(url);
    calls.push(request.pathname);
    if (request.pathname === "/v1/customers") {
      assert.equal(request.searchParams.get("email"), "Reader@example.com");
      return Response.json({ data: [], has_more: false });
    }
    if (request.pathname === "/v1/customers/search") {
      assert.equal(request.searchParams.get("query"), 'email:"Reader@example.com"');
      return Response.json({ data: [
        { id: "cus_wrong", email: "another-reader@example.com" },
        { id: "cus_reader", email: "reader@example.com" },
      ], has_more: false });
    }
    if (request.pathname === "/v1/subscriptions") {
      assert.equal(request.searchParams.get("customer"), "cus_reader");
      return Response.json({ data: [{ status: "active", items: { data: [{ price: { id: env.FULL_ACCESS_PRICE_ID } }] } }], has_more: false });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  assert.equal(await hasFullAccess("Reader@example.com", env, fetcher), true);
  assert.deepEqual(calls, ["/v1/customers", "/v1/customers/search", "/v1/subscriptions"]);
});

test("cancellation, past due status, and a mismatched email deny access", async () => {
  for (const status of ["canceled", "past_due", "unpaid", "incomplete"]) {
    assert.equal(await hasFullAccess("reader@example.com", env, stripeFixture(status)), false);
  }
  assert.equal(await hasFullAccess("reader@example.com", env, stripeFixture("active", "someone@example.com")), false);
});

test("Stripe errors and incomplete pagination fail closed", async () => {
  await assert.rejects(hasFullAccess("reader@example.com", env, async () => new Response("error", { status: 503 })));
  await assert.rejects(hasFullAccess("reader@example.com", env, async () => Response.json({ data: [], has_more: true })));
});

test("Worker never serves private material without configuration and a signed identity", async () => {
  const request = new Request("https://premium.example.com/tracker", { headers: { Origin: env.CLERK_ALLOWED_ORIGIN } });
  const content = { get: async () => "PRIVATE CONTENT" };
  assert.equal((await worker.fetch(request, { ...env, PREMIUM_CONTENT: content })).status, 401);
  assert.equal((await worker.fetch(request, { ...env, PREMIUM_CONTENT: content, CLERK_SECRET_KEY: "" })).status, 503);
  assert.equal((await worker.fetch(new Request("https://premium.example.com/other"), { ...env, PREMIUM_CONTENT: content })).status, 404);
  const foreign = new Request("https://premium.example.com/tracker", { headers: { Origin: "https://untrusted.example" } });
  const denied = await worker.fetch(foreign, { ...env, PREMIUM_CONTENT: content });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  const preflight = new Request("https://premium.example.com/tracker", { method: "OPTIONS", headers: { Origin: env.CLERK_ALLOWED_ORIGIN } });
  const allowed = await worker.fetch(preflight, { ...env, PREMIUM_CONTENT: content });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Headers"), "Authorization");
});

test("Worker serves content only while the authenticated email has the active price", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "worker-key", alg: "RS256", use: "sig" };
  const jwt = await new SignJWT({ sub: "user_reader", azp: env.CLERK_ALLOWED_ORIGIN })
    .setProtectedHeader({ alg: "RS256", kid: "worker-key" }).setIssuer(env.CLERK_ISSUER)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const request = new Request("https://premium.example.com/tracker", { headers: { Origin: env.CLERK_ALLOWED_ORIGIN, Authorization: `Bearer ${jwt}` } });
  const content = { get: async () => "PRIVATE CONTENT" };
  const originalFetch = globalThis.fetch;
  let status = "active";
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
    if (String(url).endsWith("/v1/users/user_reader")) return Response.json(clerkUser("reader@example.com"));
    const testRequest = options.headers.Authorization === "Bearer rk_test_sandbox";
    return stripeFixture(status, "reader@example.com", testRequest ? "price_sandbox" : env.FULL_ACCESS_PRICE_ID)(url);
  };
  try {
    const admitted = await worker.fetch(request, { ...env, PREMIUM_CONTENT: content });
    assert.equal(admitted.status, 200);
    assert.equal(await admitted.text(), "PRIVATE CONTENT");
    assert.equal(admitted.headers.get("Cache-Control"), "private, no-store");
    assert.equal(admitted.headers.get("Access-Control-Allow-Origin"), env.CLERK_ALLOWED_ORIGIN);
    const testRequest = new Request("https://premium.example.com/tracker-test", { headers: request.headers });
    const testEnv = { ...env, STRIPE_TEST_RESTRICTED_KEY: "rk_test_sandbox", FULL_ACCESS_TEST_PRICE_ID: "price_sandbox",
      PREMIUM_CONTENT: { get: async () => { throw new Error("Sandbox must not read live content"); } } };
    const testAdmitted = await worker.fetch(testRequest, testEnv);
    assert.equal(testAdmitted.status, 200);
    assert.match(await testAdmitted.text(), /Sandbox access verified/);
    assert.equal((await worker.fetch(testRequest, { ...testEnv, STRIPE_TEST_RESTRICTED_KEY: "rk_live_wrong" })).status, 503);
    assert.equal((await worker.fetch(request, { ...testEnv, STRIPE_RESTRICTED_KEY: "rk_test_wrong" })).status, 503);
    assert.equal((await worker.fetch(request, { ...testEnv, STRIPE_RESTRICTED_KEY: "" })).status, 503);
    status = "canceled";
    assert.equal((await worker.fetch(testRequest, testEnv)).status, 403);
    const denied = await worker.fetch(request, { ...env, PREMIUM_CONTENT: content });
    assert.equal(denied.status, 403);
    assert.doesNotMatch(await denied.text(), /PRIVATE CONTENT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
