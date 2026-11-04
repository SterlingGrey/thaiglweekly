# Dormant member service

Scout (Codex), 4 November 2026. Technical integration only. Public membership,
sales, subscriber campaigns and paid editorial release remain closed.

## What is implemented

- Existing Clerk signature/issuer/authorized-origin/verified-email checks reused.
- Stripe reads the existing subscription price; active period-end cancellations
  retain access, canceled/past-due/unpaid subscriptions do not. No billing writes.
- Release defaults off. Disabled member, API, calendar and sandbox routes return
  404. Private review needs its own explicit switch, reviewer allowlist and test
  Stripe price/key. Test and production lists/tokens have separate namespaces.
- Account-saved follows, watched episodes and time zone; version checks reject
  stale multi-window saves. Free browser-local Tracker features are retained.
- Combined or per-followed-show UTC calendar feeds with stable event IDs,
  UTF-8 folding and DST-aware calendar rendering. Random private links are
  stored hashed and can be rotated/revoked. Each feed read verifies current
  identity and subscription. DO transactions avoid eventual-consistency token
  revocation. Outages deny access without destroying an otherwise valid token.
- Edition routes for Sunday, Monday, sourced conflicts and editorial Tracker.
  Public release rejects unapproved editions, missing approval receipts,
  unresolved opinions and unsourced factual sections. No private edition is
  checked into this repository. Sunday schedule assembly preserves source age,
  marks regional availability unknown and never invents Sterling's verdicts.
- Member portal client, plus a loopback-only synthetic review using the same
  identity/access/list/calendar code and fake providers. It makes no real Clerk,
  Stripe or MailerLite request and cannot demonstrate live provider integration.

## Run and verify

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:premium-bundle
npm run review:premium
```

The local design review is at `http://127.0.0.1:8789/`. Synthetic data lasts only
while the review process runs. No real member or secret is needed. The review
is not a remotely hosted private production site and is not reachable from an
iPhone via its own localhost address.

Public safeguards run after all free-site build stages. CI also assembles the
actual Jekyll Pages output and checks it for member routes/offers/private data.
`_config.yml` excludes member source, preview and historical release materials;
the retired public `access-check.html` is removed. No public premium page or
Clerk script is emitted by the free build. No newsletter automation is changed.

## Provider deployment, not yet verified

`wrangler.jsonc` is a disabled deployment template, not a readback of the live
Cloudflare configuration. Before a real deployment, inventory and preserve the
existing Worker secrets, KV binding, issuer and price variables. Do not deploy
the template over an existing account configuration without that inventory.
It adds one SQLite-backed `MemberState` Durable Object; this backend is available
on Workers Free. No upgrade or paid resource is required by this implementation.

Keep `PREMIUM_RELEASE=disabled`, `PREMIUM_REVIEW=disabled` in production. Enter
real secrets only in provider secret storage. Existing names:
`CLERK_SECRET_KEY`, `STRIPE_RESTRICTED_KEY`, `STRIPE_TEST_RESTRICTED_KEY`.
Variables: `CLERK_ISSUER`, `CLERK_ALLOWED_ORIGIN`, `FULL_ACCESS_PRICE_ID`,
`FULL_ACCESS_TEST_PRICE_ID`; bind `PREMIUM_CONTENT` to existing private KV and
`MEMBERS` to the new object. Preserve the old namespace/content.

A private provider review must use an authenticated/access-controlled origin,
explicit reviewer addresses and sandbox billing; `noindex` alone is not access
control. The portal renderer takes a verified public Clerk key and Worker API
origin. Do not emit its HTML into the public site while release is closed.

## Still required before launch

1. Actual provider deployment/readback with release closed and public 404 checks.
2. Authenticated private browser tests against real Clerk and Stripe sandbox,
   including non-subscriber denial, account isolation and calendar clients.
3. Verify existing MailerLite purchase/cancel/failed-renewal paid-group behavior
   and free/paid audience delivery with controlled test recipients. Do not build
   a competing webhook system without first checking the native integration.
4. Finished member editions approved by Sterling. Static samples are not content
   inventory and a weekly schedule generator is not an approved Sunday brief.
5. Approved scope/copy/policies, tax decision and Sterling's live purchase,
   cancellation/refund acceptance test, followed by explicit launch instruction.

No API or front-end unit test substitutes for those live acceptance receipts.

## Rollback

Keep the service release off. Revert the dormant integration commit to restore
the previous source tree; never restore public access demos without reviewing
the no-upsell requirement. The free build has no dependency on premium providers.
Do not delete member storage to roll back a release.

Official references: Clerk manual JWT verification; Stripe cancellation lifecycle;
Cloudflare SQLite Durable Object storage/Free-plan pricing. Dated source URLs
and acceptance evidence live in the shared Brain project receipt.

## Dormant service deployment, 4 November 2026

PR13 merged as20d46380; Pages verification and deployment passed. Existing Worker
updated to b2225bf5-cab0-4e13-8f13-ce2811834d3b with both release/review disabled.
Existing issuer/origin/price variables, encrypted secrets and PREMIUM_CONTENT KV
were retained. MEMBERS SQLite Durable Object added. All six remote gated routes
returned404/private no-store. Preview URLs remain disabled; prior logs/traces
remain disabled. Do not deploy this template over the real account configuration: 
merge actual existing variables/bindings first and explicitly preserve observability.

The local review remains synthetic. The real Clerk production instance authorizes
thaiglweekly.com; a suitable authenticated review origin and actual browser/Stripe
sandbox acceptance have not been established. Enabling a review flag alone is
not acceptance and must not become a public preview. No live billing, MailerLite
recipient changes or public offer were enabled.

### Real-provider review preparation

`provider-review-server.mjs` serves only127.0.0.1:8791. Unlike the synthetic
review, it supplies no fake identity or backend response: Clerk development
signs in, then the existing Cloudflare service checks the existing Stripe test
price/key. The remote service needs explicit PREMIUM_REVIEW=enabled, reviewer
allowlist and separate CLERK_REVIEW_ISSUER, CLERK_REVIEW_ALLOWED_ORIGIN and
CLERK_REVIEW_SECRET_KEY. The latter is an encrypted development-only credential;
it must be authorised and installed without being printed or checked in.

The development override is rejected if public release is enabled, if its issuer
is outside *.clerk.accounts.dev, if its key is not a development key, or if its
HTTP origin is not a loopback address with an explicit port. Public APIs retain
the production issuer/origin/key and remain404. Review uses its own list/token
namespace and rk_test billing only. Keeping this review disabled requires no
credential. Do not mark real provider verification complete until browser
identity, unpaid denial, paid admission, cancellation and token revocation are
actually observed. Then disable review and remove the reviewer allowlist.

Run the shell with CLERK_PUBLISHABLE_KEY (the existing development public key)
and PREMIUM_WORKER_URL=https://thai-gl-weekly-premium.se-1a1.workers.dev. Backend
secrets are never needed by the local shell. No customer billing or MailerLite
recipient action is performed by the shell.
