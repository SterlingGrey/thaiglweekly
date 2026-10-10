# Preview notes (Ash)

## Timing (DECIDED 2026-10-10)
- Paid member brief: Sunday evening, US Eastern (Sunday night UK, Monday morning Thailand).
- Free Monday issue: Monday 6:30 AM ET. Owns Monday.
- Thursday Dossier: midweek note.

## Country groups (spec 2026-10-10, Jarvis; built on preview by Ash)
Code was fine. Data was missing. The Sunday brief now sorts each title, for the reader's country, into three groups:
1. You can watch this where you are — a platform row says `available`, with source and date.
2. Not verified for your country — no row, an empty `availability` array, or status `not verified`.
3. Not available where you are — every checked platform says `not available`, with source and date.

A title is hidden only if the reader turns on "Hide what I can't watch," and that switch hides group 3 only. The calendar includes groups 1 and 2.

Moonshadow is the first real example. GMM25 and oneD are `available` for TH only, sourced to the GMMTV episode page checked 2026-09-27. iQIYI has no per-country row, because the Tracker says availability can vary. US, UK, PH, ID, VN, and BR therefore stay in group 2. Scout adds `availability` to `data/series.json` on main. This branch does not.

Shape: `preview/brief-sample.json`. Countries: US, UK, PH, TH, ID, VN, BR.

## Logic stubs
- Follow a series/pair: note only when a date changes.
- Watched marks (localStorage now; cross-device later).
- Conflict history on the card (preserve sources + weight).

## Not built
- Stripe, accounts, MailerLite keys (stubs only; Sterling wires payment).
- Anything public.

Demand test gates launch (verdict 17 Oct). Nothing merges to main without Sterling go + Scout review.
