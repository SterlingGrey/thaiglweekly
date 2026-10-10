# Preview notes (Ash)

## Timing (DECIDED 2026-10-10)
- Paid member brief: Sunday evening, US Eastern (Sunday night UK, Monday morning Thailand).
- Free Monday issue: Monday 6:30 AM ET. Owns Monday.
- Thursday Dossier: midweek note.

## Country groups
The Sunday brief reads Scout's `availability` rows. Snapshot copied onto `preview` from `main` on 10 Oct, not written back.
1. You can watch this where you are — status `available`.
2. Not verified for your country — status `not verified`, or no row.
3. Not available where you are — every platform says `not available`.

Hide switch removes group 3 only. Calendar includes groups 1 and 2.

As of that snapshot: 6 titles, 110 not-verified rows, 2 available rows. Both available rows are Moonshadow in Thailand (GMM25 and oneD). iQIYI is not verified in any of the seven countries.

## Member tools (2026-10-10)
Working on this browser only. localStorage keys `previewFollows` and `previewWatched`.
- Follow stores the schedule fingerprint. The desk stays quiet until that fingerprint changes.
- Watched marks are episode buttons on the sample cards. Pink means watched. They do not change the free tracker.
- Conflict history is rendered from a copy of `conflicts` in `data/series.json`. Weight leads. Sources stay. `data/series.json` was not edited.
- Buy My Boss has no episode pins here. The stored rows carry a clock, and the 8 Oct note says the airtime is still unannounced.
- "Show the Buy My Boss date note" on the desk pretends you followed before the 8 Oct postponement (28 Oct → 2 Dec). It does not write the tracker.

## Not built
- Stripe, accounts, MailerLite keys, cross-device sync.
- Anything public.

Demand test gates launch (verdict 17 Oct). Nothing merges to main without Sterling's go and Scout's read.
