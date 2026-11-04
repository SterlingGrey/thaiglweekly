import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { memberApi } from "./member-api.mjs";
import { MemberState } from "./member-state.mjs";
import { renderCalendar, foldLine } from "./calendar.mjs";

const catalog = { generated_at: "2026-11-04T14:00:00Z", series: [
  { id: "sample", title: "SAMPLE ONLY: ตัวอย่าง", total_episodes: 2, episodes: [
    { number: 1, airs_at: "2026-10-31T20:30:00+07:00" }, { number: 2, airs_at: "2026-11-07T20:30:00+07:00" },
  ] },
] };

function storeBinding() {
  const objects = new Map();
  return { idFromName: name => name, get: name => {
    if (!objects.has(name)) {
      const data = new Map();
      let tail = Promise.resolve();
      const storage = {
        get: async key => structuredClone(data.get(key)),
        put: async (key, value) => { data.set(key, structuredClone(value)); },
        delete: async key => data.delete(key),
        transaction: fn => { const result = tail.then(() => fn(storage)); tail = result.catch(() => {}); return result; },
      };
      objects.set(name, new MemberState({ storage }));
    }
    return objects.get(name);
  } };
}

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "members-key", alg: "RS256", use: "sig" };
  const env = { PREMIUM_RELEASE: "enabled", PREMIUM_REVIEW: "enabled", PREMIUM_REVIEW_EMAILS: "a@example.com",
    CLERK_ISSUER: "https://clerk.thaiglweekly.com", CLERK_ALLOWED_ORIGIN: "https://thaiglweekly.com", CLERK_SECRET_KEY: "sk_test_fixture",
    STRIPE_RESTRICTED_KEY: "rk_live_fixture", FULL_ACCESS_PRICE_ID: "price_live", STRIPE_TEST_RESTRICTED_KEY: "rk_test_fixture", FULL_ACCESS_TEST_PRICE_ID: "price_test", MEMBERS: storeBinding(),
    PREMIUM_CONTENT: { get: async key => key === "edition:sunday" ? { status: "draft", title: "Synthetic review only", sections: [{ heading: "Sample", body: "Not an editorial claim" }] } : null } };
  let status = "active", outage = false;
  const fetcher = async (raw, options) => {
    const url = new URL(raw);
    if (url.pathname.endsWith("jwks.json")) return Response.json({ keys: [jwk] });
    if (url.host === "api.clerk.com") {
      const userId = url.pathname.split("/").pop();
      return Response.json({ id: userId, primary_email_address_id: "primary", email_addresses: [{ id: "primary", email_address: userId === "user_a" ? "a@example.com" : "b@example.com", verification: { status: "verified" } }] });
    }
    if (url.host === "api.stripe.com") {
      if (outage) return new Response("Unavailable", { status: 503 });
      if (url.pathname === "/v1/customers" || url.pathname === "/v1/customers/search") {
        const email = url.searchParams.get("email") || "a@example.com";
        return Response.json({ data: [{ id: email.startsWith("a") ? "cus_a" : "cus_b", email }], has_more: false });
      }
      const price = options.headers.Authorization.includes("rk_test") ? "price_test" : "price_live";
      return Response.json({ data: [{ status, cancel_at_period_end: true, items: { data: [{ price: { id: price } }] } }], has_more: false });
    }
    if (url.href === "https://thaiglweekly.com/data/series.json") return Response.json(catalog);
    throw new Error("Unexpected provider URL");
  };
  const token = userId => new SignJWT({ sub: userId, azp: env.CLERK_ALLOWED_ORIGIN }).setProtectedHeader({ alg: "RS256", kid: "members-key" }).setIssuer(env.CLERK_ISSUER).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const call = async (path, { user = "user_a", method = "GET", body, origin = env.CLERK_ALLOWED_ORIGIN, auth = true } = {}) => memberApi(new Request("https://member.example" + path, {
    method, headers: { Origin: origin, ...(auth ? { Authorization: "Bearer " + await token(user) } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, fetcher);
  return { env, call, fetcher, status: value => { status = value; }, outage: value => { outage = value; } };
}

test("lists persist per verified account, reject stale writes and ignore client account injection", async () => {
  const f = await fixture();
  const initial = await (await f.call("/api/my-shows")).json();
  assert.equal(initial.version, 0);
  const body = { version: 0, follows: ["sample"], watched: { sample: [1] }, timezone: "America/New_York", userId: "user_b" };
  const saved = await f.call("/api/my-shows", { method: "PUT", body });
  assert.equal(saved.status, 200);
  assert.deepEqual((await (await f.call("/api/my-shows")).json()).follows, ["sample"]);
  assert.deepEqual((await (await f.call("/api/my-shows", { user: "user_b" })).json()).follows, []);
  assert.equal((await f.call("/api/my-shows", { method: "PUT", body })).status, 409);
  assert.equal((await f.call("/api/my-shows", { method: "PUT", body: { ...body, version: 1, follows: ["invented"] } })).status, 400);
  assert.equal((await f.call("/api/my-shows", { method: "PUT", body: { ...body, version: 1, timezone: "Mars" } })).status, 400);
});

test("feeds rotate and revoke immediately; every fetch rechecks the current subscription", async () => {
  const f = await fixture();
  await f.call("/api/my-shows", { method: "PUT", body: { version: 0, follows: ["sample"], watched: {}, timezone: "UTC" } });
  const first = await (await f.call("/api/calendar", { method: "POST" })).json();
  const read = url => memberApi(new Request(url), f.env, f.fetcher);
  let res = await read(first.url);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /DTSTART:20261107T133000Z/);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
  const second = await (await f.call("/api/calendar", { method: "POST" })).json();
  assert.notEqual(first.url, second.url);
  assert.equal((await read(first.url)).status, 404);
  assert.equal((await read(second.url)).status, 200);
  // An upstream outage denies access without destroying a valid subscription URL.
  f.outage(true); assert.equal((await read(second.url)).status, 503);
  f.outage(false); assert.equal((await read(second.url)).status, 200);
  f.status("canceled"); assert.equal((await read(second.url)).status, 403);
  f.status("active"); assert.equal((await read(second.url)).status, 404);
});

test("release off blocks every route; review uses isolated data and test billing", async () => {
  const f = await fixture();
  f.env.PREMIUM_RELEASE = "disabled";
  for (const path of ["/api/my-shows", "/api/catalog", "/api/calendar", "/calendar/" + "a".repeat(64) + ".ics"]) assert.equal((await f.call(path)).status, 404);
  assert.equal((await f.call("/review/api/my-shows")).status, 200);
  assert.equal((await f.call("/review/api/my-shows", { user: "user_b" })).status, 404);
  assert.equal((await f.call("/review/api/my-shows", { auth: false })).status, 401);
  assert.equal((await f.call("/review/api/my-shows", { origin: "https://foreign.example" })).status, 403);
  await f.call("/review/api/my-shows", { method: "PUT", body: { version: 0, follows: ["sample"], watched: {}, timezone: "UTC" } });
  f.env.PREMIUM_RELEASE = "enabled";
  assert.deepEqual((await (await f.call("/api/my-shows")).json()).follows, []);
  assert.equal((await f.call("/api/edition/sunday")).status, 404);
  assert.equal((await f.call("/review/api/edition/sunday")).status, 200);
  f.status("past_due"); assert.equal((await f.call("/review/api/my-shows")).status, 403);
});

test("calendar preserves DST instants, stable IDs, Thai text and injection escaping", () => {
  const text = renderCalendar(catalog, ["sample"]);
  assert.match(text, /DTSTART:20261031T133000Z/);
  assert.match(text, /DTSTART:20261107T133000Z/);
  assert.match(text, /UID:sample-ep-2@thaiglweekly.com/);
  assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(new Date("2026-10-31T13:30:00Z")), "9 AM");
  assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(new Date("2026-11-07T13:30:00Z")), "8 AM");
  const folded = foldLine("SUMMARY:" + "ตัวอย่าง".repeat(30));
  assert.equal(folded.replaceAll("\r\n ", ""), "SUMMARY:" + "ตัวอย่าง".repeat(30));
  for (const line of folded.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  const evil = structuredClone(catalog); evil.series[0].title = "Title\r\nATTENDEE:intruder";
  assert.doesNotMatch(renderCalendar(evil, ["sample"]), /\r\nATTENDEE/);
  assert.throws(() => renderCalendar(catalog, [], { seriesId: "sample" }));
});
