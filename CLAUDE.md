# Thai GL Weekly — working notes

Live: https://thaiglweekly.com · Repo: SterlingGrey/thaiglweekly · GitHub Pages
Product owner: Sterling Grey (SGreyStudio). Mac/Apple first. Develop for Mac users by default.

**Do not truncate this file.** Append a dated log; keep the Product / Do not ship / Remaining sections current.

## Product (as of 5 Sep 2026 night)

- **Homepage is the tracker.** `index.html` is a copy of `tracker.html`. The old “This week” / On Tonight page is ugly and is not shipping. If we need that page later, design it new.
- **This Week** (top shelf): rolling next 7 days from whenever you land, Bangkok time. One 2-column grid of stacked compact cards (16:9 art on top, title / pair / time / platforms under). Not full-width banners. Not per-day grids (those left a black hole beside a single episode). Date lives on the card. Premiere = green title + left rail. Tonight = gold rail. Sterling called the 2-col stacked cards a win (8:56 PM). They are larger than Currently Airing; leave them unless asked.
- **Currently Airing**: still the 16:9 show-card grid. Do not turn those into banners or week-rows.
- **Just Concluded**: finales in the last 7 days.
- **Concluded in 2026**: the rest of wrapped 2026 (was “Wrapped 2026”).
- **Next Up for Your Favorite GL Pairs**: never “GL Couples.” Restore if a build drops it.
- **Hot Takes**: verified activity only. Restore if a build drops it.
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

## Remaining (not done 5 Sep)

- MailerLite Comfort is paid. Launch copy still needs the paid-tier sweep (forms, subscribe/welcome pages).
- Cloudflare Web Analytics is on the pages (`data/cloudflare-beacon.txt`, token `7962dd155ded4746a3a987dec140e013`). Dashboard is Cloudflare → Web Analytics, not Google. Cookieless; no extra cookie banner.
- Weekly research pass = human/assistant pass over studios + YouTube for new Thai GL announcements, then edit `data/series.json`. The daily rebuild only recomputes dates on what is already in JSON.
- Optional later: 2025 / 2024 / 2023 catalogs, only if search can carry them. More info is fine if findable.
- Optional later: match This Week card size to Currently Airing if the larger tiles feel loud.
- Duplicate “Announced” chips and YouTube/Official Teaser placement were tightened; re-check Pairs + compact cards if a rebuild regresses them.
- **Juliet & Juliet English/geo:** US oneD is a copyright block. Thai oneD plays EP1 with no subs (Sterling, 6 Sep). Card + conflict on the page. Flip the gold line only when Eng is confirmed on a platform that actually plays in the US (likely Gaga, not oneD).

## How to rebuild

`build-site.mjs` → `inject-pairs.mjs` → `inject-shelves.mjs` → `use-tracker-as-home.mjs` (copies tracker → index, injects `css/art-blocks.css` + `#week-blocks`). Then commit. `workflow_dispatch` on `daily-rebuild.yml`.

This Week markup is built in `scripts/inject-shelves.mjs` (`episodeRow` → `compact-card week-ep`, one `.week-list`). Two-column CSS is the `#week-blocks` style in `scripts/use-tracker-as-home.mjs` (always rewritten on build so it cannot go stale).

## Where files live

Canonical store is **this GitHub repo**, not a local iCloud folder in the Grok Build sandbox. Sterling also keeps copies at iCloud/Sterling-HQ for Claude/Grok desktop. After a session, copy `CLAUDE.md` there if you want it off-GitHub too. Do not invent a second source of truth.

## Log

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

Sterling (oneD subscriber, Nashua) could not find English on EP1. Promo said worldwide uncut, not English. X: Thai recaps are up; a PH viewer is geo-blocked on oneD; Gaga barely promoted vs BL. Card now carries a gold availability line. Do not flip it until Eng is actually on oneD or Gaga.


