import assert from "node:assert/strict";
import test from "node:test";
import { hasFullAccess } from "./access.mjs";
import { cancellationEmail } from "./cancellation-email.mjs";

const price = "price_full";
const now = Date.parse("2026-11-30T09:00:00Z");
const end = Date.parse("2026-12-17T15:30:00Z");
const subscription = {
  status: "active", cancel_at_period_end: true, canceled_at: now / 1000,
  items: { data: [{ price: { id: price }, current_period_end: end / 1000 }] },
};

test("the cancellation email and actual access check share the same paid-through boundary", async () => {
  const message = cancellationEmail(subscription, price, { now });
  assert.equal(message.accessEndsAt, new Date(end).toISOString());
  assert.equal(message.text, "We’re sorry to see you go. Your Full Access membership will end on December 17, 2026 at 10:30 AM EST. You can keep using it until then, and you won’t be charged again.");
  const email = "reader@example.com";
  const env = { FULL_ACCESS_PRICE_ID: price, STRIPE_RESTRICTED_KEY: "fixture" };
  const fetcher = async url => Response.json({ has_more: false, data: new URL(url).pathname.endsWith("/subscriptions") ? [subscription] : [{ id: "cus_reader", email }] });
  assert.equal(await hasFullAccess(email, env, fetcher, now), true);
  assert.equal(await hasFullAccess(email, env, fetcher, end - 1), true);
  assert.equal(await hasFullAccess(email, env, fetcher, end), false);
});

test("no scheduled cancellation email for missing dates, immediate cancellation or wrong plan", () => {
  assert.equal(cancellationEmail({ ...subscription, status: "canceled" }, price, { now }), null);
  assert.equal(cancellationEmail({ ...subscription, cancel_at_period_end: false }, price, { now }), null);
  assert.equal(cancellationEmail({ ...subscription, items: { data: [{ price: { id: price } }] } }, price, { now }), null);
  assert.equal(cancellationEmail(subscription, "price_other", { now }), null);
  assert.equal(cancellationEmail(subscription, price, { now: end }), null);
});
