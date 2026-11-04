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
