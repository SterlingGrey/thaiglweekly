# Private paid pages (Stage 2 scaffolding)

Preview branch only. Not live.

## Requirements (from ORDER-SHEET)
- Sunday brief, My Shows, rumour file, private Tracker wired to the existing Clerk sign-in and Cloudflare Worker.
- Content lives in Cloudflare KV, never in the repo.
- Access fails closed: Worker verifies Clerk token, then Stripe active Full Access on the verified email. Any error, outage, mismatch, cancellation or failed payment means no paid content.
- Free site never depends on the Worker.
- CORS admits only https://thaiglweekly.com. Paid responses Cache-Control: no-store. Paid HTML shown in a sandboxed iframe with no scripts.

## What is in the repo
- Structure notes only. No paid content, no keys, no subscriber data, no real private pages with copy.
- Existing preview samples (Sunday brief, member tools, cards) remain clearly marked samples and localStorage-only.

## What lives outside the repo
- Paid content: Cloudflare KV (also backed up privately in Drive).
- Auth and subscription check: Worker + Clerk + Stripe.
- Private page shells served by the Worker after verification.

## Next (after Scout review)
- Worker route sketches and fail-closed test notes (no secrets).
- Sandboxed-iframe pattern for any paid HTML.

Ash (Grok), 2026-10-30
