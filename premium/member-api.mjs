import { verifiedIdentity, hasFullAccess } from "./access.mjs";
import { releaseEnabled, privateReviewAllowed, reviewIdentityEnvironment } from "./release.mjs";
import { memberStore, tokenHash, validateMemberState } from "./member-state.mjs";
import { renderCalendar } from "./calendar.mjs";
import { validateEdition } from "./edition.mjs";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const response = (message, status = 200, origin) => new Response(message, { status, headers: { ...headers, ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } });
const json = (value, status = 200, origin) => new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } });

export async function memberApi(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const review = url.pathname.startsWith("/review/");
  const path = review ? url.pathname.slice(7) : url.pathname;
  if (review ? env.PREMIUM_REVIEW !== "enabled" : !releaseEnabled(env)) return response("Not found", 404);
  const feed = /^\/calendar\/([a-f0-9]{64})\.ics$/.exec(path);
  if (!feed && !["/api/my-shows", "/api/calendar", "/api/catalog", "/api/edition/sunday", "/api/edition/monday", "/api/edition/conflicts", "/api/edition/tracker"].includes(path)) return response("Not found", 404);
  let identityEnv;
  try { identityEnv = review ? reviewIdentityEnvironment(env) : env; }
  catch { return response("Service unavailable", 503); }
  const origin = request.headers.get("Origin");
  if (!feed && (!identityEnv.CLERK_ALLOWED_ORIGIN || origin !== identityEnv.CLERK_ALLOWED_ORIGIN)) return response("Forbidden", 403);
  if (!feed && request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  if (feed && request.method !== "GET") return response("Not found", 404);
  const planEnv = review ? { ...identityEnv, STRIPE_RESTRICTED_KEY: env.STRIPE_TEST_RESTRICTED_KEY, FULL_ACCESS_PRICE_ID: env.FULL_ACCESS_TEST_PRICE_ID } : env;
  if (!new RegExp(`^rk_${review ? "test" : "live"}_`).test(planEnv.STRIPE_RESTRICTED_KEY || "") || !planEnv.FULL_ACCESS_PRICE_ID || !identityEnv.CLERK_SECRET_KEY || !env.MEMBERS) return response("Service unavailable", 503, origin);
  const storageEnv = { ...env, MEMBER_SCOPE: review ? "review" : "live" };
  let identity;
  try {
    if (feed) {
      const stored = await memberStore(storageEnv, "/token?hash=" + await tokenHash(feed[1]), null, "GET");
      if (!stored.ok) return response("Not found", 404);
      const { userId } = await stored.json();
      const lookup = await fetcher("https://api.clerk.com/v1/users/" + encodeURIComponent(userId), { headers: { Authorization: "Bearer " + identityEnv.CLERK_SECRET_KEY } });
      if (!lookup.ok) return response("Service unavailable", 503);
      const user = await lookup.json();
      const primary = user.email_addresses?.find(row => row.id === user.primary_email_address_id);
      if (user.id !== userId || user.banned || user.locked || primary?.verification?.status !== "verified") return response("Not found", 404);
      identity = { userId, email: primary.email_address };
    } else {
      const token = /^Bearer ([^\s]+)$/.exec(request.headers.get("Authorization") || "")?.[1];
      if (!token) return response("Sign in", 401, origin);
      identity = await verifiedIdentity(token, identityEnv, fetcher);
    }
  } catch { return response("Sign in again", 401, origin); }
  if (review && !privateReviewAllowed(env, identity.email)) return response("Not found", 404, origin);
  try {
    if (!await hasFullAccess(identity.email, planEnv, fetcher)) {
      // Revocation is authoritative storage, not an eventually-consistent KV flag.
      await memberStore(storageEnv, "/revoke", { userId: identity.userId });
      return response("Access unavailable", 403, origin);
    }
    const catalogResponse = await fetcher("https://thaiglweekly.com/data/series.json");
    if (!catalogResponse.ok) throw new Error("Catalog unavailable");
    const catalog = await catalogResponse.json();
    if (!Array.isArray(catalog.series)) throw new Error("Invalid catalog");
    const current = await memberStore(storageEnv, "/get", { userId: identity.userId });
    if (!current.ok) throw new Error("List unavailable");
    const member = await current.json();
    if (feed) {
      const content = renderCalendar(catalog, member.follows, { seriesId: url.searchParams.get("series") || undefined });
      return new Response(content, { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=thaiglweekly.ics" } });
    }
    if (path === "/api/catalog" && request.method === "GET") return json(catalog, 200, origin);
    if (path.startsWith("/api/edition/") && request.method === "GET") {
      const name = path.split("/").pop();
      // Development test identities must never read production editorial keys.
      const edition = await env.PREMIUM_CONTENT?.get((review ? "review:edition:" : "edition:") + name, "json");
      if (!edition || (edition.status !== "approved" && !review)) return json({ error: "This edition is not ready yet." }, 404, origin);
      validateEdition(edition, { review });
      return json(edition, 200, origin);
    }
    if (path === "/api/my-shows" && request.method === "GET") {
      const { tokenHash: omitted, ...state } = member;
      return json(state, 200, origin);
    }
    if (path === "/api/my-shows" && request.method === "PUT") {
      const text = await request.text();
      if (text.length > 20000) return response("List too large", 413, origin);
      let input;
      try { input = validateMemberState(JSON.parse(text), catalog); }
      catch { return response("Invalid viewing list or time zone", 400, origin); }
      const saved = await memberStore(storageEnv, "/save", { userId: identity.userId, ...input });
      const { tokenHash: omitted, ...state } = await saved.json();
      return json(state, saved.status, origin);
    }
    if (path === "/api/calendar" && request.method === "POST") {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
      const saved = await memberStore(storageEnv, "/rotate", { userId: identity.userId, hash: await tokenHash(token) });
      if (!saved.ok) throw new Error("Calendar unavailable");
      return json({ url: url.origin + (review ? "/review" : "") + "/calendar/" + token + ".ics" }, 201, origin);
    }
    if (path === "/api/calendar" && request.method === "DELETE") {
      const revoked = await memberStore(storageEnv, "/revoke", { userId: identity.userId });
      if (!revoked.ok) throw new Error("Calendar unavailable");
      return json({ revoked: true }, 200, origin);
    }
    return response("Not found", 404, origin);
  } catch { return response("Service temporarily unavailable", 503, origin); }
}
