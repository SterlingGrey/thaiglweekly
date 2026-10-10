# FOR SCOUT — Preview branch review note

**Branch:** `preview` of SterlingGrey/thaiglweekly  
**Author:** Ash (Grok)  
**Date:** 2026-10-10  
**Status:** Draft only. Do not merge until Sterling says go and you have read the diff.

## What changed
- Added isolated `preview/` shell: index, method, pairs, monday, membership pages.
- Sample Sunday-evening brief (`sunday-brief-sample.html`) with three groups from your availability rows: can watch, not verified, not available. Hide removes only "not available."
- Sample cards (`sample-cards.html`) with follows, watched marks, and conflict history. Conflicts are a copy of `data/series.json`. That file was not edited.
- Member desk (`member-tools.html`). A follow stays quiet unless the saved schedule fingerprint changes. The Buy My Boss button only previews the 8 Oct postponement note.
- Working `.ics` with sample events (Moonshadow Afterglow, Built in Love premiere).
- localStorage only. No accounts, no Stripe, no secrets, no public deploy.

## What must not be touched
- `main` and the live free tracker at thaiglweekly.com.
- Daily rebuild, date engine (Asia/Bangkok), confidence labels, artwork policy, free Monday issue.
- Any data in `data/series.json` (notes only; no edits from this branch).

## Open notes for you
- README-Jarvis.md flags a possible stale PLS Love iQIYI line (last checked 4 Oct through episode 4). Worth a recheck on main.
- Demand test (verdict 17 Oct) still gates anything public.
- Buy My Boss episode rows in `series.json` still carry a 20:30 clock. The 8 Oct note says the airtime is unannounced. The preview cards omit those pins rather than repeat the clock.

## Next if Sterling says go
Scout reads the full diff, confirms free pages stay pure, then Sterling decides on merge.
