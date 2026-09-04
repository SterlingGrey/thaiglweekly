# Thai GL Weekly

Verified Thai GL tracker and Monday briefing. Every fact sourced. Every rumor labeled.

The public site is two views of one dataset: **this week** (one screen) and the **full tracker**. There is no paywall, no account, and no user-generated content.

The site is **static HTML**, emitted from `data/series.json` by `scripts/build-site.mjs`. Date logic lives in `src/lib/schedule.ts`. A human does not type "this week".

## Data, not prose

`data/series.json` is the source of truth. Presentation never stores air dates as sentences.

Anything that can be computed from today's date is computed, against **Asia/Bangkok (ICT, UTC+7)**:

- An episode whose `airs_at` is in the past is aired. It cannot appear under upcoming.
- Penultimate episode (`number == total_episodes - 1`): amber edge plus the label "Penultimate episode".
- Finale (`number == total_episodes`): red edge, "Series Finale" banner, 🏁 flag.
- A series whose finale has aired moves to Wrapped.
- "Verified as of [date]" is always visible at the top, from `generated_at`.

## How to add a series

1. Open `scripts/generate-series-json.mjs` and append an `add({...})` record (or edit `data/series.json` directly).
2. Required: `id`, `title`, `studio`, `pairing`, `confidence`, `sources`.
3. If you know the weekly slot, set `day_of_week`, `air_time_ict`, `total_episodes`, and `episodes` with `airs_at` like `2026-09-05T20:30:00+07:00`.
4. If sources disagree, add a `conflicts` object with each claim, its source, and your weight call. Do not delete a side.
5. Run `node scripts/generate-series-json.mjs` if you used the generator.
6. Run the date tests: `node --experimental-strip-types --test src/lib/schedule.test.ts`
7. Rebuild pages: `node --experimental-strip-types scripts/build-site.mjs`

Confidence is one of: `aired`, `confirmed`, `announced`, `fan_sourced`, `unverified`. It shows on every card.

## Artwork

Every series has:

```
"image": { "url": null, "kind": "none", "source": null, "permission": null }
```

`kind` is `poster` (150×200, 2:3), `thumbnail` (16:9), or `none`. The card markup always contains both slots. **A 16:9 still is never cropped into the portrait slot.**

TVDB API v4 was investigated and is **not used for images**. Their API licence covers metadata, not display of artwork. The write-up is `data/tvdb-licensing.txt`. Do not copy the competitor pattern of proxying TVDB files through wsrv.nl.

Permitted sources, in order:

1. Studio or network press stills with written permission (`kind: poster`). None yet.
2. Official-channel YouTube thumbnails for a trailer already on the page, hotlinked from `https://img.youtube.com/vi/{id}/maxresdefault.jpg`. The file stays on Google's servers and is tied to the embed already on the card. Today that is 10 of 78 series. The slot is 16:9 in CSS. Images below the fold lazy-load. Tonight's still loads immediately.
3. A designed placeholder (wordmark, heat marker, title, studio) so a card without art still looks finished.

Do not search the open web for posters. Do not use TVDB artwork.

Series still missing a trailer id: `data/missing-trailers.txt`. Add the official-channel YouTube id; the 16:9 slot fills itself.

## How to run a build

```
node --experimental-strip-types scripts/build-site.mjs
```

Writes `index.html`, `tracker.html`, and the legal pages. In this preview workspace the files land in `site/`. On the GitHub Pages branch they land at the repo root (`SITE_OUT=.`).

Daily stamp (no model, no research):

```
node scripts/stamp-generated-at.mjs
node --experimental-strip-types scripts/build-site.mjs
```

GitHub Action `.github/workflows/daily-rebuild.yml` runs that every morning (00:10 ICT). Weekly research is still a human pass.

## Look

Do not redesign. The palette, wordmark, pins, and badges already exist.

- Wordmark: `brand/wordmark.html`. THAI in paper `#efe9f6`, GL in gold `#d4a15a`, violet `#1a0a2e`.
- Page: background `#0f0f14`, surface `#1a1a24`, accent `#c084fc`, gold `#d4a15a`, green `#4ade80`, amber `#fbbf24`, red `#f87171`.
- Episode pins: aired `#7c3aed`, next `#fbbf24`, future `#2e2e3e`, watched `#f472b6`. Finale pin uses red `#f87171`.
- Type: Chakra Petch for display, IBM Plex Sans Thai for body.
- Keep the 🔥 studio markers, UNCUT badges, Hot Takes framing, platform colour marks (YouTube stays YouTube-red).

## What is allowed to run in the browser

Almost nothing. Two exceptions, both visitor-local:

1. **Watched pills** and accordion open-state, in `localStorage`. Same keys as the old tracker (`glw_*`), so existing progress survives.
2. **Local clock conversion.** ICT times are baked into the HTML. A small script appends the reader's own clock. Air dates themselves are never recomputed in the browser.

The YouTube modal is also client-side, because an iframe cannot be opened without a click. It uses the official player, unmodified.

## Video

Trailers and pilots open in an on-site YouTube iframe (~800×600), unmodified. If the uploader has disabled embedding, the player falls back to a plain YouTube link. Video is on the free side. Charging for access to the embedded player would raise a YouTube Terms question; this build does not.

## Analytics

Cookieless. No Google Analytics. The Cloudflare Web Analytics beacon is in the shared page shell (`scripts/build-site.mjs` → `cfBeacon()`). It does not fire until a token is in `data/cloudflare-beacon.txt`.

To activate it on Cloudflare:

1. Sign in at dash.cloudflare.com.
2. Open **Analytics & logs**, then **Web Analytics**. (This works even if thaiglweekly.com DNS is still on GitHub Pages. You are adding a JavaScript beacon, not changing DNS.)
3. **Add a site.** Hostname: `thaiglweekly.com`.
4. Cloudflare shows a JavaScript snippet. Inside it is `data-cf-beacon='{"token": "……"}'`. Copy only the token, the string between the quotes.
5. Put that token as the only non-comment line in `data/cloudflare-beacon.txt`.
6. Rebuild. The token then appears in every page, just before `</body>`.
7. After a day of live traffic, open Web Analytics, copy unique visitors, page views, which paths were hit, and the top referrer into a new row of `data/analytics.txt`. That file is what `/audience` prints.

Until the token is in the file, the pages carry an HTML comment instead of the script, so a preview cannot pretend it is counting.

## House rules for prose

No em-dashes as clause separators. The word "actually" is banned. No filler phrasing. Each URL appears once.
