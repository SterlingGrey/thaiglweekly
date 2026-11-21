// Stripe times are seconds since epoch. Use cancel_at when Stripe provides it,
// and the matching plan item's billing boundary for period-end cancellations.
export function paidThroughCancellation(subscription, priceId) {
  if (!priceId || subscription?.status !== "active") return null;
  const matches = (subscription.items?.data ?? []).filter(item => item.price?.id === priceId);
  if (!matches.length) return null;
  const explicit = subscription.cancel_at;
  const periodEnd = matches.length === 1
    ? (matches[0].current_period_end ?? subscription.current_period_end)
    : null;
  const end = explicit ?? (subscription.cancel_at_period_end === true ? periodEnd : null);
  return Number.isSafeInteger(end) && end > 0 && end <= 8_640_000_000_000 ? end : null;
}

export function cancellationEmail(subscription, priceId, { timeZone = "America/New_York", now = Date.now() } = {}) {
  const end = paidThroughCancellation(subscription, priceId);
  if (subscription?.cancel_at_period_end !== true || end === null || end * 1000 <= now) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(end * 1000));
  return {
    subject: "Your Thai GL Weekly Full Access cancellation",
    text: `We’re sorry to see you go. Your Full Access membership will end on ${date}. You can keep using it until then, and you won’t be charged again.`,
    accessEndsAt: new Date(end * 1000).toISOString(),
  };
}
