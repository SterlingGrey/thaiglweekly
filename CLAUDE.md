## 2026-09-04: artwork 5b (TVDB check, local stills) + Cloudflare 6b

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: updated section 5b (investigate TVDB first) and 6b (beacon that counts).

TVDB API v4: do not use for images. Their ToS (23 Oct 2020) says the API licence does not authorise displaying images. Write-up: `data/tvdb-licensing.txt`. Fallback: 10 official-channel YouTube stills hotlinked from `img.youtube.com/vi/{id}/maxresdefault.jpg`, 68 designed placeholders (wordmark, heat marker, title). No local copies of those stills. No open-web posters. Cloudflare beacon is in the shared shell, gated on `data/cloudflare-beacon.txt`.

# Thai GL Weekly: assistant log

This file exists so later assistants can see who touched the repo, and when.


## 2026-09-04: artwork + Cloudflare beacon (Brief C, 5b and 6b)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: implement section 5b artwork and put a real Cloudflare Web Analytics beacon in the page shell. Push to `rebuild/static-html`, not `main`.

### Artwork

`data/series.json` now has `image: {url, kind: "poster"|"thumbnail"|"none", source, permission}` on every series. Cards emit both a 2:3 portrait slot and a 16:9 slot; the unused one is hidden, so `none` does not leave a hole.

10 of 78 series have `trailer_youtube_id`. Those 10 hotlink `img.youtube.com/vi/{id}/maxresdefault.jpg` as `kind: "thumbnail"`. No posters were fetched from the open web. The 68 without a trailer id are listed in `data/missing-trailers.txt`. Fairway of Love has a pilot id only; it is still on the missing list.

### Measurement

The Cloudflare Web Analytics snippet is emitted from the shared shell in `scripts/build-site.mjs`. The token lives in `data/cloudflare-beacon.txt`. Until that file contains a token, the pages get an HTML comment instead of the script, so nothing is counted and no dummy beacon is sent. `/audience` is still the weekly log in `data/analytics.txt`.

Do not install Google Analytics.

## 2026-09-04: static HTML emit (Brief C, section 2b)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: emit static HTML from `data/series.json`, keep the live look, push to a branch (not `main`).

### What changed

The public pages are now static HTML written by `scripts/build-site.mjs`. `src/lib/schedule.ts` still owns date arithmetic against Asia/Bangkok. The React preview app is not the product. A GitHub push to `rebuild/static-html` is ready and waiting on repository write permission.

Look is the existing tracker, not a redesign. Wordmark from `brand/wordmark.html`. Palette from `tracker.html`. 🔥 / UNCUT / Hot Takes / platform marks kept. Finale uses existing red `#f87171`; penultimate uses existing amber `#fbbf24`.

Paid tier remains removed.

### How to add a series

Edit `scripts/generate-series-json.mjs` (or `data/series.json` directly), then run `node scripts/generate-series-json.mjs` if you used the generator, then `node --experimental-strip-types scripts/build-site.mjs`. Give every claim a `sources` entry. If sources disagree, put both claims in `conflicts` and write a `weight`. Dated runs need `episodes[].airs_at` as ISO-8601 with `+07:00`.

## 2026-09-04: tracker rebuild (Brief C)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: BRIEF-C-tracker-rebuild-2026-09-04.md (Sterling Grey)

Separated data from rendering. `data/series.json` is the source of truth. Status (airing / upcoming / wrapped), "tonight", "next seven days", finale and penultimate flags are computed from `airs_at` against now in Asia/Bangkok.

Removed the paid tier, waitlist, founding-member rate, and every "feature withheld" mark. The product is free. Video (trailers and pilots) plays in an on-site YouTube iframe on the free pages.

Added a cookieless audience log at `data/analytics.txt` and an `/audience` page. Do not install Google Analytics.

Daily rebuild: `.github/workflows/daily-rebuild.yml` stamps `generated_at` and re-emits HTML. Rendering stays arithmetic. Weekly research still needs a human or an assistant to edit the JSON with sources.

## 2026-09-04: three front-page fixes after the static emit

- Assistant: Claude, running in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.
- Date: 2026-09-04 (evening, EDT)
- Request: Sterling Grey. Three fixes on `rebuild/static-html`, one commit each, nothing else. `main` untouched, nothing pushed.

### What changed

1. **Internal commentary removed from the public pages** (`aecf0e7`). The stamp
   bar, the front-page hero, the "Already aired" peek and note, the wrapped-card
   line, and one sentence each on the privacy and audience pages were talking
   about the build, the bug, or the rules the developer was following. Visitors
   keep "Verified as of" and the plain Bangkok-time line. All in
   `scripts/build-site.mjs`.
2. **Image slot** (`ba6d21c`). The row slot was 112×63 with a bottom-aligned
   placeholder, so the wordmark and title were pushed above the top edge. There
   is now one slot shape, 16:9, in every layout; the portrait figure is gone
   (a poster, if one ever arrives, is letterboxed inside the wide frame with
   `object-fit: contain`). The row frame is 160×90, sized so the longest title
   in `series.json` fits on two lines, and the placeholder title clamps to two
   lines. The heat marker is no longer drawn inside the image; rows now get
   `heatTag()` in the body beside the platform pills.
3. **Tonight leads the page** (`2179251`). `js/site.js` restores an
   open-section list from `localStorage` under a key shared with the tracker
   page, which is how Tonight could load collapsed. Tonight is now emitted with
   `data-always-open` and the script skips it. It also carries
   `section-tonight` styling: gold border, larger gold heading. `section()`
   returns nothing when `count` is 0 unless `always` is set; Tonight is the
   only `always`. The ✦ glyph before PREMIERE rows is removed.

### Things to know

- `node --experimental-strip-types scripts/build-site.mjs` overwrites
  `brand/wordmark.html` with a generated copy. That predates this session. I
  reverted it after every build and did not commit it. The daily Action adds
  `brand` to its commit, so it will clobber the file on its first run.
- The front-page stats bar still shows a "Hot Takes: last seven days" pill
  even when the Hot Takes section is not rendered. Not touched; out of scope.
- I could not reproduce a thumbnail being squeezed into a portrait box in
  the Chromium preview (the frame measured 112×63 before the fix). The new CSS
  pins 16:9 on both the frame and the image, so the ratio no longer depends on
  the figure sitting inside a `<button>`.
- Verification: `npm test` (8 passing) and DOM measurements in a local
  preview after every fix. No new tests were added.

## 2026-09-04: Phase 1, pre-merge fixes

- Assistant: Claude, in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.
- Request: Sterling Grey, "complete the build and take it live", Phase 1 of 4. Branch `rebuild/static-html`.

1. **Stamp split** (`d9b01c6`). `data/series.json` carries `verified_at`, set by hand at the end of a research pass, next to `generated_at`, which is build time and which the daily job rewrites. The stamp and header show `verified_at`; the stamp hint says "Pages rebuilt [generated_at]". Test added. README step added. The generator emits both.
2. **CSS precedence** (`485329c`). `.schedule-box.is-tonight` now comes before the finale, penultimate and premiere rules, so those accents win on the night they air.
3. **Daily Action** (`0f7800a`). `brand` removed from the commit list. The local build still writes `brand/wordmark.html`; revert it before committing by hand.
4. **House rules** (this commit's predecessor). README no longer quotes the banned word. CLAUDE.md headings use colons.

## 2026-09-04: Phase 3, live fixes (prepared on the branch; Phase 2 merge blocked, see below)

- Assistant: Claude, in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.

5. **Contrast** (`baae8ef`). Watched pin text is violet on pink (7.0:1); WeTV and iQIYI pill text is page-black on the brand greens (7.5:1 and 6.9:1). Still large-text-only: dim text on the future pin (3.9:1) and white on YouTube red (4.0:1).
6. **Under 100 KB** (`b5769e1`). Fonts self-hosted in `assets/fonts/`: Chakra Petch 400 and 600, IBM Plex Sans Thai 400, each as latin and thai woff2 with `unicode-range`, so Thai glyphs download only where they render. Google Fonts removed. Weight 700 resolves to 600; body bold is synthesised. Every still lazy-loads. Front page first load measured at 16.2 KB HTML, 34.4 KB CSS, 11.6 KB JS, 32.6 KB latin fonts: 94.8 KB. Thumbnails are outside that figure; the Tonight still is 171 KB from `maxresdefault`. Using `hqdefault` for the 160×90 row slot would cut that by about two thirds if wanted.
7. **Pins on finished series** (`9484743`). Compact cards carry the pin track again; a wrapped or library series with no dated episodes shows every pin as aired. 47 of 52 compact cards have a track; the other 5 have no `total_episodes`.
8. **Video fallback** (`95178c6`). The iframe's load event marks the player as arrived; six seconds without it, or an error event, switches the modal to the plain link. YouTube's own "playback disabled" page cannot be detected cross-origin, so the foot link stays.
9. **Novel and runtime** (`15b47d0`). `factsLine()` renders "Source novel" and "Runtime" on full and compact cards. Eight series carry a novel. `runtime` is now in the schema; no series has a value, which is why the audit found none to display.
10. **Studio field colour** (`644d54f`, selector fix in the commit after). `data/studio-colours.json` maps each of the 28 named studios to a dark hue; the build sets `--studio` on the placeholder. These are distinct hues assigned by the build, not researched brand colours; every one keeps paper at 7:1 and gold at 4.5:1 or better. Edit the file freely.

### Verified in a local preview

Fonts load from `assets/fonts` with no request to Google. Pins render and toggle on compact cards. Placeholders show 26 distinct fields. Novel lines render. The stamp reads "Verified as of 4 Sep 2026" with "Pages rebuilt" beside it.

## 2026-09-04: Phase 2, merged and live

- Assistant: Claude, in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.

The first push was refused because the `gh` OAuth token lacked the `workflow` scope and the branch carries `.github/workflows/daily-rebuild.yml`. Sterling ran `gh auth refresh -h github.com -s workflow`; after that the branch pushed, `main` fast-forwarded from `142369d` to `fb9e3ca` (nothing on main was missing from the branch), and the Pages build for `fb9e3ca` reported built within a minute.

Live checks on thaiglweekly.com after deploy: stamp reads "Verified as of 4 Sep 2026" with "Pages rebuilt" beside it; Tonight is open, gold, 21.6px; row slots are 160×90; fonts come from `assets/fonts` with zero requests to Google; 47 compact cards carry pin tracks and a watched pin shows violet text; 26 distinct placeholder fields; 8 novel lines; the video modal opens the official embed; no console errors on either page.

The daily Action registered on merge ("Daily tracker rebuild") and a manual `workflow_dispatch` succeeded (run 33930371468): it stamped `generated_at`, rebuilt, committed `344d6e4` "daily stamp 2026-09-04" as thai-gl-weekly-bot touching only `data/series.json`, and Pages redeployed. `brand/wordmark.html` was untouched. The 00:10 ICT cron is now live.

One cosmetic note: `formatStamp` reads the calendar date from the ISO string's own prefix, and the bot stamps in UTC, so "Pages rebuilt" will show the UTC date, one day behind Bangkok for a run at 00:10 ICT. `verified_at` is unaffected.

## 2026-09-04: Phase 4, data still missing (do not invent)

No airing series lacks dates. Three series are typed `status: airing` but compute as wrapped from their dates and should be retyped: In Love Forever, My Lady's Bodyguard, 4 Elements: The Fire. Bake Love Feeling has one dated episode and no `total_episodes`, so its finale can never be detected.

Seventeen coming-soon series have no `episodes[].airs_at`. Every one of them also lacks `day_of_week`, `air_time_ict` and `total_episodes`, except Cranium, which has a count of 12. Fill in: premiere date and clock time in ICT, weekly slot, episode count, and a platform where it says TBA.

| Series | Studio | Platform | Confidence | What the data already says |
| --- | --- | --- | --- | --- |
| Love Bound | Kongthup | TBA | confirmed | November 2026 window; exact date, count, platform not stated |
| Ditto | GMMTV | GMM25 | announced | TBA 2026, official pilot out |
| Her | GMMTV | GMM25 | announced | conflict open on year, premise and pairing |
| Oxytoxin | GMMTV | GMM25 | announced | |
| Love's Echoes | GMMTV | GMM25 | announced | first pilot pulled; recast version has none |
| Shades: Special Episodes + Season 2 | FRT Entertainment | YouTube | announced | |
| Dangerous Queen: Special Edition | (blank) | YouTube | fan_sourced | studio field empty |
| Wish Upon a Star | GMMTV | GMM25 | announced | |
| FirstLove | 22Style Entertainment | TBA | announced | studio announcement via Girls Love Info, Aug 12 |
| Love Above the Clouds | CUU Thailand (Century UU) | TBA | announced | |
| Love in Bloom | Monomax | Monomax | fan_sourced | conflict open on release year |
| Final Round: The Last Round…For Her | IDX Entertainment | MCOT HD | announced | conflict open on a possible rename overlap |
| Resonance: Our Song of Love | VelCurve Studio | TBA | announced | Thai Content Experience 2026 lineup |
| When Osmanthus Blooms | Yubaba Studios | TBA | announced | Girls Love Info, Aug 18 |
| The Dragon House | Uprising Entertainment | TBA | announced | filming start reported |
| Lunar Secret | NorthStar Entertainment | TBA | announced | conflict open on premiere window |
| Cranium | TBC | TBA | unverified | total_episodes 12; conflict open on whether it is cancelled |

## 2026-09-04: compact pin track on the front-page rows

- Assistant: Claude, in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.

Front-page rows had no pin track, so the finale and penultimate colours had nowhere to land. `epTrack()` gained `compact` and `current` options; `episodeRow()` renders it beside the confidence chip in a new `.row-foot` line, which the chip already occupied, so no row grew (measured 141/141/133/135/168/141/135 px before and after at desktop width). Pins are 16×14 px on one line, same colours as the full track; the row's own episode carries a thin paper outline. Rows use the computed series, not the raw record, so `nextEpisode` is known. Watched clicks share the tracker's localStorage keys.

Noted for Sterling: a finale row now marks the finale three times (title word, "Series Finale" banner, red pin). Dropping the row banner was offered and not yet decided. "FEATURED" is a ribbon from the old hand-typed tracker in iCloud and GL-Tracker, not the live build.

## 2026-09-04: trailer IDs for 60 series, thumbnails switched to hqdefault

- Assistant: Claude, in Claude Code. Model: Claude Fable 5.1 (`claude-fable-5-1`), Anthropic.
- Request: Sterling Grey. Data only: fill `trailer_youtube_id` from official channels, verify, record provenance, then use `hqdefault`.

Method: web search restricted to youtube.com per series, then every candidate ID checked through YouTube's oEmbed endpoint (which returns the uploading channel's name and handle) and a 200 on `img.youtube.com/vi/<id>/hqdefault.jpg`. Fan re-uploads, reaction channels, cinema chains and compilation channels were rejected at that step. Each accepted ID has a `sources` entry naming the channel as YouTube reports it, with the watch URL and the check date. 60 added, 70 of 78 now carry a still. Every one of the 70 image URLs returned 200 at build time.

Preference order applied: official trailer, then teaser, then pilot. Kinds recorded in `trailer_kind`: 41 trailers, 12 teasers, 7 pilots.

Five IDs are flagged in their own source label because the uploader is a production company that is not the studio the card names: The Dragon House (Wonderframe), Denied Love and its Special (Copy A Bangkok), Roller Coaster (Motion Minds), Reverse with Me (SiamSi Studio), Mate (Zense). They are production-side channels, not fans, but Sterling should confirm the relationship or correct the studio field.

Not found on any official channel, listed in `data/missing-trailers.txt`: Third Person (only a NorthStar lineup reel), Love's Echoes (the GMMTV pilot is gone, as the data already noted), Shades Special Episodes + Season 2 (no separate trailer yet), FirstLove, Love in Bloom (Monomax has a post, no video found), Final Round, Resonance, When Osmanthus Blooms. Nothing was substituted.

Build: `youtubeThumb()` defaults to `hqdefault`, the `maxresdefault` fallback `onerror` is gone, the image carries 480×360 attributes. `hqdefault` is 4:3 with letterbox bars; `object-fit: cover` in the 16:9 frame crops exactly those bars, checked in a render. Test now asserts `hqdefault` and at least 60 ids. `scripts/generate-series-json.mjs` refuses to run without `--force`, because `data/series.json` is now ahead of it.
