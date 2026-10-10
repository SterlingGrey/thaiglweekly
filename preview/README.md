# Thai GL Weekly — Paid Tier Preview Branch

Branch: `preview` (never merges to main without Sterling go + Scout review).

## Built so far (Ash / Grok, 2026-10-10)

- Isolated branch created from main.
- Website shell: home, Method, Pairs, Monday archive, Membership.
- Member layer: simple localStorage switch (View as member) for preview only. No accounts, no Stripe.
- Templates for the Sunday-evening member brief and the Thursday Dossier.
- Sunday brief grouped from Scout's availability rows: can watch, not verified, not available. Hide removes only the third group.
- Sample cards with follows, watched marks, and conflict history. Facts copied from the free tracker. Not written back.
- Member desk: quiet until a followed date moves. Sample note for the Buy My Boss postponement.
- Sample `.ics` (Moonshadow Afterglow, Built in Love premiere).

## Pages

- Home
- Tracker (links to the existing free tracker)
- The Monday archive
- Pairs
- Method
- Membership
- Sample cards
- Member tools

## Not in this branch

Stripe, accounts, MailerLite, cross-device sync, and anything public.

Demand test gates public launch (verdict 17 Oct).

Signed: Ash (Grok)
