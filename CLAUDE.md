# Thai GL Weekly — working notes

Live: https://thaiglweekly.com · Repo: SterlingGrey/thaiglweekly · GitHub Pages
Product owner: Sterling Grey (SGreyStudio). Mac/Apple first. Develop for Mac users by default.

**Do not truncate this file.** Append a dated log; keep the Product / Do not ship / Remaining sections current.

## Product (live tracker; next website preview clarified 2 Oct 2026)

- **Homepage is the tracker.** `index.html` is a copy of `tracker.html`. The old “This week” / On Tonight page is ugly and is not shipping. If we need that page later, design it new.
- **This Week** (top shelf): rolling next 7 days from whenever you land, Bangkok time. One 2-column grid of stacked compact cards (16:9 art on top, title / pair / time / platforms under). Not full-width banners. Not per-day grids (those left a black hole beside a single episode). Date lives on the card. Premiere = green title + left rail. Tonight = gold rail. Sterling called the 2-col stacked cards a win (8:56 PM). They are larger than Currently Airing; leave them unless asked.
- **Currently Airing**: still the 16:9 show-card grid. Do not turn those into banners or week-rows.
- **Just Concluded**: finales in the last 7 days.
- **Concluded in 2026**: the rest of wrapped 2026 (was “Wrapped 2026”).
- **Pairs shelf retired in the 24 Sep redesign.** Pairs and actors remain searchable. Do not restore the old shelf.
- **Hot Takes shelf retired in the 24 Sep redesign.** Do not restore it from older notes.
- Daily rebuild: `.github/workflows/daily-rebuild.yml` at 00:10 ICT (`workflow_dispatch` too). Rebuilds airing status, This Week, pairs, shelves. Does not magically add new series — that is a research pass (see Remaining).
- Fonts: leave them. Header/logo/footer type is the brand. Do not switch to Avenir. `-webkit-font-smoothing: antialiased` is on for Mac/OLED.
- Local clock is **gold**, not purple. Air times are ICT; visitor offset shown in gold.
- Art: official still / YouTube thumb only. No open-web posters. Series with no video show a title+studio placeholder — that is correct, not a broken image.

## Do not ship

- “GL Couples”
- The old This week / On Tonight page as homepage
- 16:9 banners replacing week/card blocks
- Per-day This Week grids (one episode → empty column)
- Horizontal week-rows (thumb beside text) as the This Week layout — those read as thin banners
- Font change without Sterling asking

## Remaining (historical items plus current website task)

- **Current priority (2 Oct):** Build a separate-branch website preview around the existing free tracker for Sterling to review visually before deployment. No new website preview was built tonight. See the end-of-night handoff below.

- MailerLite Comfort is paid. Newsletter stays free. Double opt-in works. Welcome automation copy is approved (logo + “You’re on the list” + Open the Tracker + signup-only footer). Sterling to **Activate** if not already. Later: authenticate sending domain `hello@thaiglweekly.com` (SPF/DKIM) so Apple junks less. Hide My Email still tends to Junk until that is done.
- Cloudflare Web Analytics is on the pages (`data/cloudflare-beacon.txt`, token `7962dd155ded4746a3a987dec140e013`). Dashboard is Cloudflare → Web Analytics, not Google. Cookieless; no extra cookie banner.
- Weekly research pass = human/assistant pass over studios + YouTube for new Thai GL announcements, then edit `data/series.json`. The daily rebuild only recomputes dates on what is already in JSON.
- Optional later: 2025 / 2024 / 2023 catalogs, only if search can carry them. More info is fine if findable.
- Optional later: match This Week card size to Currently Airing if the larger tiles feel loud.
- Duplicate “Announced” chips and YouTube/Official Teaser placement were tightened; re-check Pairs + compact cards if a rebuild regresses them.
- **Juliet & Juliet English/geo:** US oneD is a copyright block. Thai oneD: no Eng. **oneD CC menu lists “English Transcribed” — nothing renders** (Sterling, 8 Sep). **English paints on GagaOOLala** US Mac/iPad app. Exclusive for inter fans until a YouTube/iQIYI/WeTV license. App: `https://apps.apple.com/us/app/gagaoolala-gay-les-bl-shows/id1196141528`

## How to rebuild

Use `npm test` then `npm run build` for a complete preview in `site/`. For GitHub Pages output, use `SITE_OUT=. npm run build`. `scripts/build.mjs` runs every assembly stage plus final free-page verification. The daily workflow tests before publishing. Pull requests receive the Verify tracker check. Branch protection must separately require the check if desired.

This Week markup is built in `scripts/inject-shelves.mjs` (`episodeRow` → `compact-card week-ep`, one `.week-list`). Two-column CSS is the `#week-blocks` style in `scripts/use-tracker-as-home.mjs` (always rewritten on build so it cannot go stale).

## Where files live

Canonical store is **this GitHub repo**, not a local iCloud folder in the Grok Build sandbox. Sterling also keeps copies at iCloud/Sterling-HQ for Claude/Grok desktop. After a session, copy `CLAUDE.md` there if you want it off-GitHub too. Do not invent a second source of truth.

## Log

### 2026-10-04: Daily source pass and corrected 2022 scope

Rechecked the six active schedules and the dated or production-active upcoming slate against official studio and platform sources. No premiere clocks, episode counts, platforms, subtitle routes, recasts, artwork, or production states changed. Official pages confirm *Juliet & Juliet* episode 5 and *Third Person* episode 4 aired; the next *Fairway of Love* and *Khom Khlang* releases remain on schedule. The 2022 completeness rotation keeps *GAP* as the sole standalone GL romance, while adding *The Root* and *The Warp Effect* to a separate GL-related/supporting-story shelf so their substantial sapphic material is searchable without inflating the standalone archive count. Scout (Codex).

### 2026-10-03: Daily source pass and 2025 archive recheck

Rechecked the six active schedules and the dated or production-active upcoming slate against official studio and platform sources. No dates, episode counts, platforms, subtitle routes, recasts, artwork, or production states changed. iQIYI now lists *PLS Love* through episode 4 of 8; official previews are live for the next episodes of *Juliet & Juliet*, *Third Person*, *Fairway of Love*, and *Khom Khlang*. The 2025 completeness rotation remains unchanged at 24 qualifying full-length series or anthology arcs, with films and short-form productions categorized separately. Scout (Codex).

### 2026-10-01: Daily source pass and 2024 archive recheck

Rechecked the six active schedules and the dated or production-active upcoming slate against official studio and platform sources. No dates, episode counts, platforms, subtitle routes, recasts, artwork, or production states changed. iQIYI now lists *Moonshadow* through episode 8. The 2024 completeness rotation remains unchanged at 17 qualifying full-length series, specials, or anthology arcs, with films categorized separately. Scout (Codex).

### 2026-09-30: Daily source pass and Love on Hire artwork

Rechecked the six active schedules and the dated or production-active upcoming slate against official studio and platform sources. No dates, episode counts, platforms, subtitle routes, recasts or production states changed. Added the official *Love on Hire* cast-and-schedule poster from the series account as a local editorial-identification asset with source and rights provenance. The 2023 completeness rotation remains unchanged at three standalone series, with *Solids by the Seashore* categorized separately as a film. Scout (Codex).

### 2026-09-29: YES maybe NO, Love on Hire date, and 2022 special

Rechecked the six active schedules on their official platform or studio pages. Added Kongthup's official *YES maybe NO* pilot without inventing a premiere date, dated only the officially confirmed 22 Oct premiere for *Love on Hire*, and added GMMTV's 2022 *Magic of Zero: Zero Photography* to a new specials-and-anthology shelf. The separate shelf keeps GAP as the sole standalone 2022 Thai GL series while making the MilkLove special searchable. All 23 tests and the production build passed. Scout (Codex).

### 2026-09-28: Daily source pass and complete 2025 archive audit

Reviewed current official platform pages and the dated or production-active upcoming slate. The stored schedules remain aligned: iQIYI lists PLS Love through episode 3 of 8 and Moonshadow through episode 7; WeTV lists Fairway of Love through episode 4 and Khom Khlang through episode 3 with its episode 4 teaser posted before airtime; GagaOOLala's Juliet & Juliet series page remains live. Added three omitted 2025 releases from official-channel evidence: *Mission: Love or Lies*, *I Am Devil Season 2*, and the four-episode Club Friday anthology arc *Merit Wins the Soul*. The published 2025 archive now contains 24 qualifying full-length series or arcs, while films and short-form productions remain categorized separately. The Monday CHANGE2561 and established-reporting check found no verified new shared NileNamwan project beyond *Chasing Love*. All 21 tests and the production build passed. Scout (Codex).

### 2026-09-24 — Uranus 2324 availability clarified

Corrected the *Uranus 2324* movie card so its editions and availability cannot be conflated. The original cut is labeled 130 minutes and retains its regional Netflix link; Apple TV remains only as a 130-minute catalog-page source because global playback was not confirmed. The 2026 Special Version is labeled 150 minutes, with Thai/Czech theatrical screenings confirmed and streaming explicitly unconfirmed. Added a regression test preventing the Apple catalog page from returning as a watch-platform badge. Ten tests pass. Scout (Codex).

### 2026-09-24 — Free Tracker redesign deployed and verified

Deployed commit `13ea50d` to `main`: the approved free Tracker redesign, linked platform directory, compact search with verification guidance, dynamic archive counts, complete 2025/2024/2023 series shelves, separate Thai GL movie shelf, and four-film starter catalog. *Uranus 2324* now carries an expandable four-version history covering the original theatrical cut, 2024 Re-Edit Version, extended Blu-ray, and 2026 Special Version, with the unresolved Blu-ray/Special Version relationship stated plainly. The public page returned HTTP 200 after GitHub Pages completed, with the 24 Sep review date, one grouped PLS Love week card containing both episodes, Moonshadow on iQIYI, 3Plus separated from Channel 3, all archives and films present, and retired Hot Takes/pair shelves absent. Nine automated tests and the production acceptance checks passed. Full Access code, checkout, and paid content were not included or launched. Scout (Codex).

### 2026-09-05 night (Grok 4.6 / Grok Build)

Sterling on browser Grok (desktop client down). Long session on tracker.html / thaiglweekly.com.

- Cloudflare beacon in. MailerLite Comfort paid; copy sweep still open.
- Tracker is homepage. Ugly This week page unlinked.
- Pairs radar + Hot Takes restored. Never “couples.” Duplicate Announced chips and stacked YouTube/teaser buttons cleaned.
- Fonts stay. Antialiased smoothing for Mac/OLED. Opinion only on Avenir — not shipped.
- This Week + Just Concluded + Concluded in 2026 shelves.
- This Week layout fight (banners → 96px rows → tiny auto-fill tiles → thin 120px strips → stacked 16:9 cards → flattened to one 2-col grid). Final: stacked compact cards, two columns, date on the card. Sterling: “PERFECT.”
- GitHub Pages `max-age=600` lied about “hard refresh / incognito.” Square/block CSS is inlined in HTML (`#week-blocks`) so a stale stylesheet cannot win.

### 2026-09-06 midday (Grok 4.6) — weekly research pass

What this pass is: studio/YouTube check for *new titles and new facts*, then edit `data/series.json`. The daily rebuild only recomputes dates on what is already in JSON.

Done:
- Third Person: official trailer `eWVtJtYbZgI`, Ch3 HD Saturdays 22:25 ICT from 12 Sept, uncut on North Star YouTube. Platform conflict resolved.
- Added **Beauty and the Bike** (NorthStar First Light 2026 + official trailer `sY15eXJcRMU`, MewRenee).
- Added **Remain** (Star Hunter official pilot `jAQ-I2HmJ8I` + 2026 lineup, AndaLookkaew).
- Juliet episode count: noted MDL now says 8; left stored 10 until one31 speaks. Conflict stays open.
- `verified_at` → 2026-09-06.

Not added (fan lists / no studio statement this pass): Hak Na My Boss, Built in Love, The Hidden Blood, Hidden Heart, Kongthup Crush, Uprising “five series” (only The Dragon House is titled), MGI Beyond novel-rights buys (Occult Exorcism, Tiger Heart).

### 2026-09-06 — Juliet English gap

Sterling (oneD subscriber, Nashua) could not find English on EP1. Promo said worldwide uncut, not English. X: Thai recaps are up; a PH viewer is geo-blocked on oneD; Gaga barely promoted vs BL.

Follow-up same day: Sterling subscribed on the US App Store GagaOOLala app ($6.99/mo). English (and other language) subs, good picture, Mac + iPad. Free tier = one episode. Card flipped to Gaga exclusive for inter fans. oneD still blocked in the US.

### 2026-09-06 — MailerLite Comfort

Double opt-in is live. Sterling signed up with Hide My Email; confirm went to Apple Mail Junk; moved to Inbox; confirmed; flow worked.

Welcome automation: Simple welcome email, group Subscribers. Test letter approved 14:09. Activate if not already. Remaining later: SPF/DKIM on hello@thaiglweekly.com.

### 2026-09-08 — Juliet oneD “English Transcribed”

oneD Closed Captioning offers “English Transcribed.” No captions appear. Gaga Mac app still draws English. Card gold line stays Gaga-exclusive; conflict updated. Do not treat the oneD CC row as English.

### 2026-10-02: Publishing safeguards prepared

The existing tracker remains permanently free. The future Premium Tracker will add richer show information and actor profiles; membership launch is deferred. Added a complete build entry point with consistent preview output and shared build time, final assembled-page checks, tests before both publishing workflows push, and read-only pull-request verification. Updated obsolete shelf instructions to match the September redesign. Prepared on a separate branch for review.

### 2026-10-02, 21:23 EDT: End-of-night handoff for Sterling, Claude, Grok, and Codex

Sterling asked to stop for tonight and preserve the state so the team can resume in the morning. No website design work is running in the background.

**Actual next task:** Build a website preview around the existing tracker in this repository so Sterling can see how it looks as pages and sections are moved around. Work on a separate branch and make a concrete visual preview for review before deploying the redesign. The preview's page structure and layout still need to be developed; do not present assistant suggestions as an approved design. The live homepage currently remains the complete tracker. Do not repeat the old "This week" / On Tonight design.

**Not started:** No new website homepage, navigation design, rearranged website preview, or preview branch was built tonight. Codex drifted into planning Premium Tracker content instead of the requested website preview; Sterling corrected that direction. Resume with the website preview, not a premium-content planning exercise.

**Finished tonight:**
- Fixed GitHub access. The authenticated user was SterlingGrey, but the ChatGPT Codex Connector initially had no account installation. Identity authorization and user admin/push metadata did not establish connector write access. Sterling installed the Connector on SterlingGrey; actual branch, tree, commit, and PR writes then succeeded.
- Applied the saved publishing safeguards patch. PR #1 (`codex/publishing-safeguards`) was merged into main as `120ab3c9fbba9c3a5bd4f182cfbbdf63fa503045`.
- `npm run build` now runs the complete assembly sequence with a shared output directory and build time. Final checks confirm the homepage matches the free tracker, expected shelves and styling exist, and free pages have no paid-access/sign-in links.
- Both publishing workflows run catalog/schedule tests before building and pushing. Added a read-only Verify tracker workflow for PRs and main.
- All 23 tests and complete preview build passed locally. GitHub Verify tracker passed on the PR and main using Node 22. Main verification run 37085623452 and GitHub Pages deployment run 37085623373 both concluded success.
- Checked https://thaiglweekly.com/: HTTP 200, principal tracker shelves and final styling present, no access-check link detected. No catalog data or generated tracker pages were edited in this safeguards PR. This was build protection, not a visual website redesign.
- The standalone patch remains a backup; it has already been applied and merged. Do not apply it again.
- Branch protection requiring Verify tracker has NOT been configured. A successful check exists, but merge enforcement is separate.

**Product constraints from Sterling:** The current tracker will always be free. A future separate Premium Tracker can contain more show information and actor/actress spotlights. Premium membership launch is deferred while the audience and offering develop. Do not launch payment, membership, or paid access as part of the website preview.

**Communication correction:** Codex repeatedly ended turns instead of progressing with the original preview task and overstated readiness before testing actual writes. Be explicit about completed work versus proposed work. During an active work turn, carry authorized work through to a concrete result and give progress updates. Do not imply background work continues after a final reply or that Sterling must repeatedly say "continue" to keep an active turn working. No service/data-center issue was established.

**Morning pickup:** Read this handoff and current repository files, use the merged build entry point, create an isolated website-preview branch, and produce a visual draft for Sterling to judge. Preserve the working free tracker and existing brand. Sterling plans to check back with Codex tomorrow night.
