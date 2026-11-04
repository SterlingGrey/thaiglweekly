import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

const jwksByIssuer = new Map();

export async function verifiedIdentity(token, env, fetcher = fetch) {
  if (!token || !env.CLERK_ISSUER || !env.CLERK_ALLOWED_ORIGIN || !env.CLERK_SECRET_KEY) {
    throw new Error("Clerk is not configured");
  }
  const issuer = new URL(env.CLERK_ISSUER);
  const allowed = new URL(env.CLERK_ALLOWED_ORIGIN);
  const loopbackReview = env.PRIVATE_LOCAL_REVIEW === true && env.PREMIUM_RELEASE !== "enabled" &&
    env.PREMIUM_REVIEW === "enabled" && /^sk_test_/.test(env.CLERK_SECRET_KEY) &&
    issuer.hostname.endsWith(".clerk.accounts.dev") &&
    ["127.0.0.1", "localhost"].includes(allowed.hostname) && !!allowed.port;
  if (issuer.protocol !== "https:" || issuer.pathname !== "/" || issuer.search || issuer.hash ||
      (allowed.protocol !== "https:" && !(loopbackReview && allowed.protocol === "http:")) ||
      issuer.username || issuer.password || allowed.username || allowed.password ||
      allowed.pathname !== "/" || allowed.search || allowed.hash ||
      issuer.origin === allowed.origin) throw new Error("Invalid Clerk configuration");
  const cacheKey = issuer.origin;
  // Remote JWK sets cache keys and refresh on key rotation. Isolate test fetchers.
  if (fetcher === fetch && !jwksByIssuer.has(cacheKey)) {
    jwksByIssuer.set(cacheKey, createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer)));
  }
  const jwks = fetcher === fetch ? jwksByIssuer.get(cacheKey)
    : createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer), {
        [customFetch]: (url, options) => fetcher(url, options),
      });
  const { payload } = await jwtVerify(token, jwks, {
    issuer: issuer.origin,
    algorithms: ["RS256"],
  });
  if (payload.azp !== allowed.origin || typeof payload.exp !== "number") {
    throw new Error("Invalid Clerk token claims");
  }
  if (payload.sts === "pending" || typeof payload.sub !== "string" || !/^user_[\w-]+$/.test(payload.sub)) {
    throw new Error("Invalid Clerk session");
  }
  const response = await fetcher(`https://api.clerk.com/v1/users/${encodeURIComponent(payload.sub)}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Clerk user lookup failed (${response.status})`);
  const user = await response.json();
  if (user.id !== payload.sub || user.banned || user.locked) throw new Error("Invalid Clerk user");
  const primary = user.email_addresses?.find((entry) => entry.id === user.primary_email_address_id);
  if (primary?.verification?.status !== "verified" ||
      typeof primary.email_address !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary.email_address)) {
    throw new Error("Verified primary email is missing");
  }
  return { userId: user.id, email: primary.email_address.trim() };
}

export async function verifiedEmail(token, env, fetcher = fetch) {
  return (await verifiedIdentity(token, env, fetcher)).email;
}

async function stripeGet(path, env, fetcher) {
  const response = await fetcher(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_RESTRICTED_KEY}` },
  });
  if (!response.ok) throw new Error(`Stripe lookup failed (${response.status})`);
  return response.json();
}

export async function hasFullAccess(email, env, fetcher = fetch) {
  if (!env.STRIPE_RESTRICTED_KEY || !env.FULL_ACCESS_PRICE_ID) throw new Error("Stripe is not configured");
  const address = email.trim();
  const normalized = address.toLowerCase();
  // Stripe's customer-list email filter is case-sensitive. Try the exact Clerk
  // address first for immediate post-checkout consistency, then use the
  // case-insensitive customer search when that exact lookup finds nothing.
  const exact = await stripeGet(`/v1/customers?email=${encodeURIComponent(address)}&limit=100`, env, fetcher);
  if (exact.has_more || !Array.isArray(exact.data)) throw new Error("Incomplete customer lookup");
  const checked = new Set();
  const hasActiveCustomer = async (candidates) => {
    for (const customer of candidates) {
      if (customer.deleted || customer.email?.trim().toLowerCase() !== normalized || checked.has(customer.id)) continue;
      checked.add(customer.id);
      const query = new URLSearchParams({ customer: customer.id, price: env.FULL_ACCESS_PRICE_ID, status: "all", limit: "100" });
      const subscriptions = await stripeGet(`/v1/subscriptions?${query}`, env, fetcher);
      if (subscriptions.has_more || !Array.isArray(subscriptions.data)) throw new Error("Incomplete subscription lookup");
      if (subscriptions.data.some((sub) => sub.status === "active" &&
        sub.items?.data?.some((item) => item.price?.id === env.FULL_ACCESS_PRICE_ID))) return true;
    }
    return false;
  };
  if (await hasActiveCustomer(exact.data)) return true;
  // Another Stripe customer may hold the active subscription under different
  // capitalization. Search results are checked against the whole address.
  const query = encodeURIComponent(`email:${JSON.stringify(address)}`);
  const searched = await stripeGet(`/v1/customers/search?query=${query}&limit=100`, env, fetcher);
  if (searched.has_more || !Array.isArray(searched.data)) throw new Error("Incomplete customer search");
  if (await hasActiveCustomer(searched.data)) return true;
  return false;
}
