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

1. Preserve the observed closed provider gates and repeat their readback before
   any launch. Deployment, real Clerk development sign-in, actual Stripe sandbox
   paid/unpaid/canceled/past-due access, recovery and calendar-client checks have
   passed; these are not evidence of live-payment or email delivery acceptance.
2. Keep private review disabled outside a bounded test, with an empty reviewer
   allowlist. Any future review must retain test/live identity and storage isolation.
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

The original local design review remains synthetic. A separate loopback-only
real-provider review has now been exercised against Clerk development and the
existing Stripe sandbox. The production instance still authorizes thaiglweekly.com;
production credentials and release settings were not opened for these tests.
Review was disabled again after acceptance. No live billing, MailerLite recipient
changes or public offer were enabled.

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
observed. Then disable review and remove the reviewer allowlist.

Run the shell with CLERK_PUBLISHABLE_KEY (the existing development public key)
and PREMIUM_WORKER_URL=https://thai-gl-weekly-premium.se-1a1.workers.dev. Backend
secrets are never needed by the local shell. No customer billing or MailerLite
recipient action is performed by the shell.

### Observed real-provider checkpoint, 4 November

The existing development instance was verified in the Clerk dashboard. Sterling
authorised a named development key and its encrypted transfer into the existing
Cloudflare service; no key value was written to files or repository. The real
loopback sign-in now completes with the official development test identity.
Clerk's return query must be accepted by the local root shell, without reflecting
or logging it. The signed-in account receives403 when the real Stripe sandbox
has no active matching membership. This is observed provider evidence, not a
fixture. Paid admission and saved choices persisted after reload. Period-end
cancellation retained access through the paid period, then denied the expired
member. An actual failed renewal produced `past_due`, denied the notebook and
existing feed, and a successful fake payment restored notebook access. Both
isolated test subscriptions ended canceled; no real money moved.

Apple Calendar and Google Calendar each imported all ten test episodes and showed
the expected New York times. The Apple test was local to the Mac. Both temporary
calendar subscriptions were removed and the feed revoked after testing. Client
caches are separate from server revocation; never promise remote deletion of
events already downloaded by a calendar app.

The existing native MailerLite Stripe product already maps checkout to the paid
group and cancellation to removal from that same group. Configuration readback
does not prove lifecycle delivery. Paid welcome and cancellation email headers
now use the approved logo, with persisted server previews checked. Actual test
email sends require explicit recipient authorization, followed by inbox readback;
native purchase/cancel/failed-renewal audience behavior is still a launch gate.

Four review:edition:* keys hold clearly labelled public-source/layout samples.
They never overwrite production edition:* keys. Public catalogue-wide verification
remains22October2026. The legacy KV key tracker returned404; no private Tracker
HTML inventory has been assumed to exist. No completed new essay or Sterling
verdict has been invented. These remain content requirements before launch.

### Delivery preparation and schedule trust, 4 November

The paid welcome and cancellation test copies were sent once each to Sterling on
his explicit approval. Actual mailbox recipient headers, arrival and gold logos
were checked, and Sterling confirmed both worked. These tests supply no customer
billing context. Their billing links do not establish native transaction delivery.
A blank support-address variable was replaced with the existing published support
address in both saved templates. No extra copies were sent after that correction.

`delivery-plan.mjs` prepares confirmed-zone cohorts for Sunday18:00 local time.
It uses each target date's time-zone rules, including DST and fractional offsets.
This does not change MailerLite's inferred subscriber timezone. The local operator
must prepare separate native campaign audiences for the exact explicit-zone
cohorts, then verify the provider audience and UTC schedule before any later send.
The planner contains no provider client, credential, scheduler or send function.
It is not an installed delivery service or evidence of recipient delivery.

Run `node premium/prepare-delivery.mjs PRIVATE_INPUT.json PRIVATE_OUTPUT.json`.
Both files must be inside the ignored, pre-created `premium/private-content/`
directory. Output is created exclusively with0600 permissions and never replaces
an existing receipt. Inputs require an approved edition and receipt, Sunday date,
explicit timezone confirmation, unique account-to-subscriber mapping, and a current
eligibility snapshot (Stripe access, active MailerLite status and paid-group
membership). No email address is needed. Do not export real audience snapshots to
Git or a shared public folder. Recheck eligibility before actual scheduling and
again before dispatch; a prepared snapshot is not continuing entitlement proof.

Unknown/stale/ineligible recipients are held. A missed24-hour preparation window
is held without an immediate send or silent deferral. Preparation statuses always
say `prepared_not_scheduled`; only native persistent campaign IDs, exact audience,
time, content hash and later delivery evidence can advance that state. For a
worldwide8November edition, UTC+14's Sunday18:00 is04:00Z on8November, so the
24-hour preparation deadline is04:00Z on7November (Friday6November23:00EST).
This remains a dry-run delivery component until the real audience bridge and
native lifecycle acceptance are verified. Public paid journeys remain disabled.

Catalogue episodes with an unconfirmed airtime now stay date-only in Sunday
schedule output. Calendars use an explicitly described all-day date marker for
those entries, instead of presenting a placeholder time as confirmed. Classified,
sourced facts and expressly approved opinions are required for released editions;
unclassified text and impossible source dates fail closed. These safeguards do
not update catalogue verification dates or approve editorial inventory.

### Explicit delivery-zone confirmation

The notebook now stores `timezoneConfirmed` with the account's viewing choices.
It defaults false, including legacy writes without that field. The reader can
select the device zone, confirm it and save; editing the zone clears confirmation
until the reader checks it again. This is a delivery preference, not email opt-in,
subscriber confirmation, a paid-group mutation or activation of an email journey.
Actual native audience mapping and delivery remain unverified. Browser save/reload
acceptance used synthetic data only; API persistence is covered by regression tests.
