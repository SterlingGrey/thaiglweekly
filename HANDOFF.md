# Handoff — Brief C, static emit, 2026-09-04

Assistant: Grok 4 (Grok Build, xAI). Product: Thai GL Weekly tracker rebuild, now static HTML.

## What was built

- `data/series.json`: 78 series migrated from `tracker.html`, plus hot takes dated so they expire.
- Date engine (`src/lib/schedule.ts`): all "upcoming / aired / wrapped / tonight / finale / penultimate" state is computed from `airs_at` vs now in Asia/Bangkok.
- **Static HTML** from `scripts/build-site.mjs`. No React on the public site.
- Front page (`index.html`): tonight + next seven days + recently aired (so a finale cannot hide as upcoming).
- Full tracker (`tracker.html`): airing, coming soon, wrapped, library, filters, source lines, conflict reports, watched pills (local only).
- Video modal: official YouTube iframe, free, fallback link if embed is blocked.
- Paid tier removed from every page this app serves.
- Cookieless audience log: `data/analytics.txt` and `audience.html`.
- Daily GitHub Action: stamps `generated_at` and re-emits HTML.

Tests in `src/lib/schedule.test.ts` encode the 4 Sep incident: The Fire finale of 29 Aug must not appear as upcoming.

## Look (section 2b)

The brief was missing a visual section. The look already existed in the repo and was not open for redesign.

- Wordmark: `brand/wordmark.html`. THAI paper `#efe9f6`, GL gold `#d4a15a`, violet `#1a0a2e`. Not redrawn.
- Palette from the live tracker: background `#0f0f14`, surface `#1a1a24`, accent `#c084fc`, gold `#d4a15a`, green `#4ade80`, amber `#fbbf24`, red `#f87171`.
- Episode pins: `#7c3aed` aired, `#fbbf24` next, `#2e2e3e` future, `#f472b6` watched. Finale pin uses red `#f87171` so it is not only a colour change from "next".
- Type: Chakra Petch display, IBM Plex Sans Thai body.
- Flair kept: 🔥 studio markers, UNCUT badges, Hot Takes left-bar cards, platform colour marks including YouTube red.

### One thing that fights a purely static page

Visitor local time cannot be known at build time. The HTML bakes ICT (`8:30 PM ICT`). A small script, copied from the live tracker, appends the reader's clock. Air dates themselves are never recomputed in the browser. Watched pills and accordion state also stay in `localStorage` because they are personal, not facts.

If that script is unacceptable, drop it and print ICT only. The product still works. I kept it because the live tracker already did this and readers outside Thailand use it.

## Architecture vs the first React preview

The first pass of this rebuild ran as a React app so the Grok preview could recompute dates on every load. Sterling asked for option 2: static HTML from JSON, on a branch, not `main`. That is now the product.

The React files remain in the Grok workspace as reference only. They are not on the GitHub branch.

## What was corrected in the migrated data

From the 26 Aug 2026 hand-typed tracker, as of 5 Sep 2026 00:24 ICT:

| Series | Old (typed 26 Aug) | Computed now | Notes |
| --- | --- | --- | --- |
| 4 Elements: The Fire | Airing, EP 8 finale Aug 29 listed as next | Wrapped. Finale aired Aug 29. | This is the public incident. |
| In Love Forever | Airing, EP 11 Aug 28 | Wrapped. EP 12 finale aired Sep 4 20:30 ICT. | |
| My Lady's Bodyguard | Airing, EP 10 Aug 27, count disputed | Wrapped under a 11-ep weekly calendar from Jun 25. Count still disputed (Aug 27 vs Sep 3 finale). Conflict kept. | Do not treat 11 as studio-confirmed. |
| Moonshadow | Airing, EP 3 Aug 26 as next | Airing, EP 4 aired Sep 2, next EP 5 Sep 9. | |
| Juliet & Juliet | Coming soon, Sep 5 | Premiere tonight (Sat 5 Sep 20:30 ICT) once that instant has arrived. | |
| Fairway of Love | Coming soon, Sep 6 | Premiere Sun 6 Sep 22:30 one31, uncut 23:30 WeTV. | |
| Khom Khlang | Coming soon, Sep 7 | Premiere Mon 7 Sep, WeTV. Clock time still unverified. | |
| PLS Love | Coming soon, Sep 11 | Premiere Fri 11 Sep 20:30 Channel 3 / 3Plus. | |
| Hot takes dated Aug 19–25 | Shown as "this week" | Hidden. Older than seven days. Empty state is honest. | |

## Paid tier audit (section 7b)

See the 2026-09-04 table in the previous handoff. This emit keeps those pages free: no `$4/mo`, no waitlist, no founding rate, no withheld features.

## YouTube paywall question (section 5)

Sterling's 2026-09-04 decision stands: video lives on the free side. YouTube's Terms restrict charging for access to the embedded player. Keeping the iframe free removes that question. Uploaders can still disable embedding; the modal then offers a plain link.

## GitHub

The rebuild is ready for branch **`rebuild/static-html`**, not `main`. GitHub Pages on `main` is still the live site. Merging the branch would replace thaiglweekly.com.

Push from this session was blocked: the connected GitHub account can read `SterlingGrey/thaiglweekly` but the token cannot create refs or upload blobs (`Resource not accessible by integration`). Reconnect GitHub with repository write, then ask to push. Until then the files live in this preview and in the zip of the branch tree.

Scheduled Actions only run on the default branch. Until this is merged, use **workflow_dispatch** on the branch if you want a morning rebuild. After merge, the 00:10 ICT cron will stamp `generated_at` and re-emit HTML with no model involved.

The React preview from the first pass is **not** in the branch tree. It stays in the Grok workspace only. The App Builder scaffold (auth, database helpers, Vite) is not part of the product.

## What remains

- **Cloudflare Web Analytics token.** The beacon is in the page shell. Put the token in `data/cloudflare-beacon.txt` (see README). Until then, nothing counts.
- Confirm My Lady's Bodyguard finale night against a studio or platform billing, then keep or close the conflict.
- Confirm Khom Khlang and Third Person clock times; they are date-only with `time_unverified`.
- Juliet and PLS Love episode counts still need a studio number.
- Cranium status is still unverified. Four non-studio sources disagree.
- MailerLite and any private launch copy still need the paid-tier sweep.
- Daily Action needs write permission on the branch that hosts the JSON and HTML.
- Weekly research pass (announcements, date changes) is still human.
- **68 series have no `trailer_youtube_id`.** Research list: `data/missing-trailers.txt`. Do not fill art by searching the open web for posters.

## Artwork (section 5b), 2026-09-04, updated

Schema on every series:

```
image: { url, kind: "poster" | "thumbnail" | "none", source, permission }
```

Cards have two slots. Portrait is 150×200 when `kind` is `poster`. 16:9 when `kind` is `thumbnail`. A landscape still is never cropped into the portrait slot. `none` shows a designed placeholder (wordmark colours, title, studio), not a hole.

**TVDB: investigated, not used.** Full note in `data/tvdb-licensing.txt`. Short version: the v4 API licence is for metadata. The Terms of Service (23 Oct 2020) say in so many words that the API licence does not authorise displaying images, and that image rights must be got from the content owners. Pricing for the metadata feed is separate (subscriber PIN at ~$12/year per end user, or commercial tiers from free-under-$50k up to negotiated). This project is free. That does not turn TVDB artwork into ours. Sapphic Signal's wsrv.nl proxy is a resize tool, not a licence, and it is hotlinking. We will not copy it.

This pass: 10 official-channel YouTube stills, hotlinked from `img.youtube.com/vi/{id}/maxresdefault.jpg` (16:9 slot, lazy-loaded except tonight). Sterling reversed the local-file plan: the still stays on Google's servers and is tied to the embed we already run. 68 series use the designed placeholder (wordmark, heat marker, title, studio). Fairway of Love has a pilot id only. Research list: `data/missing-trailers.txt`. No posters were fetched. TVDB is out.

## Cloudflare Web Analytics (section 6b), 2026-09-04

The shared shell emits:

```
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"…"}'></script>
```

just before `</body>`, when `data/cloudflare-beacon.txt` contains a token. Empty file: HTML comment only, no script, so a preview cannot fake a count.

Sterling's Cloudflare steps:

1. dash.cloudflare.com → Analytics & logs → Web Analytics.
2. Add site `thaiglweekly.com`. DNS does not have to move.
3. Copy the token from the JS snippet.
4. One line in `data/cloudflare-beacon.txt`.
5. Rebuild.
6. Next Monday, copy unique visitors / page views / paths / top referrer into `data/analytics.txt`.

No Google Analytics. No cookies. No consent banner.

