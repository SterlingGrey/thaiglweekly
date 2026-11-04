// Public release and private testing are deliberately separate capabilities.
export function releaseEnabled(env) {
  return env.PREMIUM_RELEASE === "enabled";
}

export function privateReviewAllowed(env, email) {
  if (env.PREMIUM_REVIEW !== "enabled") return false;
  const reviewers = String(env.PREMIUM_REVIEW_EMAILS || "").split(",")
    .map(value => value.trim().toLowerCase()).filter(Boolean);
  return reviewers.includes(email.toLowerCase());
}

// A separate development Clerk identity is permitted only for a loopback review
// while the public release is closed. Never reinterpret production credentials.
export function reviewIdentityEnvironment(env) {
  if (!env.CLERK_REVIEW_ISSUER) return env;
  const issuer = new URL(env.CLERK_REVIEW_ISSUER);
  const origin = new URL(env.CLERK_REVIEW_ALLOWED_ORIGIN);
  if (releaseEnabled(env) || env.PREMIUM_REVIEW !== "enabled" ||
      issuer.protocol !== "https:" || !issuer.hostname.endsWith(".clerk.accounts.dev") ||
      issuer.pathname !== "/" || issuer.search || issuer.hash || issuer.username || issuer.password ||
      origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) ||
      !origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password ||
      !/^sk_test_/.test(env.CLERK_REVIEW_SECRET_KEY || "")) throw new Error("Invalid isolated review configuration");
  return { ...env, PRIVATE_LOCAL_REVIEW: true, CLERK_ISSUER: issuer.origin,
    CLERK_ALLOWED_ORIGIN: origin.origin, CLERK_SECRET_KEY: env.CLERK_REVIEW_SECRET_KEY };
}
