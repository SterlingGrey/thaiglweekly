import { freeTracker } from "./free-tracker.mjs";
import { hasFullAccess, verifiedEmail } from "./access.mjs";
import { releaseEnabled, privateReviewAllowed } from "./release.mjs";
import { memberApi } from "./member-api.mjs";
export { MemberState } from "./member-state.mjs";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const cors = (origin) => ({ "Access-Control-Allow-Origin": origin, Vary: "Origin" });
const reply = (message, status, origin) => new Response(message, {
  status,
  headers: { ...noStore, ...cors(origin), "Content-Type": "text/plain; charset=utf-8" },
});
const testPage = "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Sandbox access verified</title><body><h1>Sandbox access verified</h1><p>Your signed-in email has an active test subscription. No money was charged. This is a sample page, not premium editorial content.</p></body></html>";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (url.pathname === "/free-tracker") return freeTracker(request, env);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/calendar/") || url.pathname.startsWith("/review/")) return memberApi(request, env);
    const sandbox = url.pathname === "/tracker-test";
    if (url.pathname !== "/tracker" && !sandbox) return reply("Not found", 404, env.CLERK_ALLOWED_ORIGIN);
    // Default deployment stays unavailable even with valid provider credentials.
    // An authenticated reviewer can use the separate sandbox route only.
    if ((!sandbox && !releaseEnabled(env)) || (sandbox && env.PREMIUM_REVIEW !== "enabled")) {
      return new Response("Not found", { status: 404, headers: noStore });
    }
    const accessEnv = sandbox ? { ...env, STRIPE_RESTRICTED_KEY: env.STRIPE_TEST_RESTRICTED_KEY,
      FULL_ACCESS_PRICE_ID: env.FULL_ACCESS_TEST_PRICE_ID } : env;
    if (origin !== env.CLERK_ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403, headers: noStore });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        ...noStore, ...cors(origin), "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization",
        "Access-Control-Max-Age": "600",
      } });
    }
    if (request.method !== "GET") return reply("Not found", 404, origin);
    if (!env.CLERK_ISSUER || !env.CLERK_ALLOWED_ORIGIN || !env.CLERK_SECRET_KEY ||
        !accessEnv.STRIPE_RESTRICTED_KEY || !accessEnv.FULL_ACCESS_PRICE_ID || (!sandbox && !env.PREMIUM_CONTENT) ||
        !new RegExp(`^rk_${sandbox ? "test" : "live"}_`).test(accessEnv.STRIPE_RESTRICTED_KEY)) {
      return reply("Premium access is not configured", 503, origin);
    }
    const authorization = request.headers.get("Authorization") || "";
    const token = /^Bearer ([^\s]+)$/.exec(authorization)?.[1];
    if (!token) return reply("Sign in to view the expanded Tracker", 401, origin);
    let email;
    try {
      email = await verifiedEmail(token, env);
    } catch {
      return reply("Sign in again to view the expanded Tracker", 401, origin);
    }
    if (sandbox && !privateReviewAllowed(env, email)) return reply("Not found", 404, origin);
    let paid;
    try {
      paid = await hasFullAccess(email, accessEnv);
    } catch {
      return reply("Subscription check is temporarily unavailable", 503, origin);
    }
    if (!paid) return reply("An active Full Access subscription is required", 403, origin);
    const html = sandbox ? testPage : await env.PREMIUM_CONTENT.get("tracker", "text");
    if (!html) return reply("Expanded Tracker is not ready", 503, origin);
    return new Response(html, { headers: { ...noStore, ...cors(origin), "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; frame-ancestors 'none'" } });
  },
};
