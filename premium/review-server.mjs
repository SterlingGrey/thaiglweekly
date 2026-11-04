// Loopback-only, synthetic acceptance environment. Never a deployment target.
import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { MemberState } from "./member-state.mjs";
import { memberApi } from "./member-api.mjs";
import { renderPortal } from "./portal.mjs";

const port = Number(process.env.REVIEW_PORT || 8789);
const origin = "http://127.0.0.1:" + port;
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "local-review", alg: "RS256", use: "sig" };
const objects = new Map();
const storage = () => {
  const data = new Map(); let tail = Promise.resolve();
  const db = { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)), delete: async key => data.delete(key),
    transaction: fn => { const result = tail.then(() => fn(db)); tail = result.catch(() => {}); return result; } };
  return db;
};
const catalog = { generated_at: "2026-11-04T14:00:00Z", verified_at: null, series: [
  { id: "sample-one", title: "Sample show: A Second Look", total_episodes: 3, episodes: [{ number: 1, airs_at: "2026-11-04T20:30:00+07:00" }, { number: 2, airs_at: "2026-11-11T20:30:00+07:00" }, { number: 3, airs_at: "2026-11-18T20:30:00+07:00" }] },
  { id: "sample-two", title: "Sample show: The Long Way Home", total_episodes: 2, episodes: [{ number: 1, airs_at: "2026-11-07T20:30:00+07:00" }, { number: 2, airs_at: "2026-11-14T20:30:00+07:00" }] },
] };
const titles = { sunday: "The week ahead", monday: "A closer reading", conflicts: "The source notebook", tracker: "Sterling’s takes" };
const env = { PREMIUM_RELEASE: "disabled", PREMIUM_REVIEW: "enabled", PREMIUM_REVIEW_EMAILS: "review@example.com",
  CLERK_ISSUER: "https://local-fixture.clerk.example", CLERK_ALLOWED_ORIGIN: "https://thaiglweekly.com", CLERK_SECRET_KEY: "sk_test_local_fixture",
  STRIPE_TEST_RESTRICTED_KEY: "rk_test_local_fixture", FULL_ACCESS_TEST_PRICE_ID: "price_local_fixture",
  MEMBERS: { idFromName: name => name, get: name => { if (!objects.has(name)) objects.set(name, new MemberState({ storage: storage() })); return objects.get(name); } },
  PREMIUM_CONTENT: { get: async key => ({ status: "draft", title: titles[key.split(":")[1]] || "Sample reading", date: "Private design sample", sections: [{ heading: "A place for the detail that matters", body: "This is synthetic layout text, not a published essay, a real show claim or a verdict by Sterling. Finished editions will carry their own source dates and editorial approval." }] }) },
};
const fetcher = async (raw) => {
  const url = new URL(raw);
  if (url.pathname.endsWith("jwks.json")) return Response.json({ keys: [jwk] });
  if (url.host === "api.clerk.com") return Response.json({ id: "user_review", primary_email_address_id: "primary", email_addresses: [{ id: "primary", email_address: "review@example.com", verification: { status: "verified" } }] });
  if (url.pathname === "/v1/customers") return Response.json({ data: [{ id: "cus_review", email: "review@example.com" }], has_more: false });
  if (url.pathname === "/v1/subscriptions") return Response.json({ data: [{ status: "active", items: { data: [{ price: { id: "price_local_fixture" } }] } }], has_more: false });
  if (url.href === "https://thaiglweekly.com/data/series.json") return Response.json(catalog);
  throw new Error("Local review does not access real providers");
};
http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const openingPage = req.url === "/" && req.method === "GET";
  if (req.headers.host !== "127.0.0.1:" + port || (req.headers.origin && req.headers.origin !== origin) || (!openingPage && req.headers["sec-fetch-site"] === "cross-site")) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    if (req.url === "/" && req.method === "GET") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(renderPortal({ api: origin + "/review", demo: true })); return; }
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 22000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const jwt = await new SignJWT({ sub: "user_review", azp: env.CLERK_ALLOWED_ORIGIN }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer(env.CLERK_ISSUER).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const request = new Request(origin + req.url, { method: req.method, headers: { Origin: env.CLERK_ALLOWED_ORIGIN, Authorization: "Bearer " + jwt }, ...(!["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const result = await memberApi(request, env, fetcher);
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
  } catch { res.writeHead(500); res.end("Synthetic review unavailable"); }
}).listen(port, "127.0.0.1", () => console.log("Synthetic member review ready on " + origin));
