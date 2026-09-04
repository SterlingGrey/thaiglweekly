## 2026-09-04 — artwork 5b (TVDB check, local stills) + Cloudflare 6b

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: updated section 5b (investigate TVDB first) and 6b (beacon that counts).

TVDB API v4: do not use for images. Their ToS (23 Oct 2020) says the API licence does not authorise displaying images. Write-up: `data/tvdb-licensing.txt`. Fallback: 10 official-channel YouTube stills hotlinked from `img.youtube.com/vi/{id}/maxresdefault.jpg`, 68 designed placeholders (wordmark, heat marker, title). No local copies of those stills. No open-web posters. Cloudflare beacon is in the shared shell, gated on `data/cloudflare-beacon.txt`.

# Thai GL Weekly — assistant log

This file exists so later assistants can see who touched the repo, and when.


## 2026-09-04 — artwork + Cloudflare beacon (Brief C, 5b and 6b)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: implement section 5b artwork and put a real Cloudflare Web Analytics beacon in the page shell. Push to `rebuild/static-html`, not `main`.

### Artwork

`data/series.json` now has `image: {url, kind: "poster"|"thumbnail"|"none", source, permission}` on every series. Cards emit both a 2:3 portrait slot and a 16:9 slot; the unused one is hidden, so `none` does not leave a hole.

10 of 78 series have `trailer_youtube_id`. Those 10 hotlink `img.youtube.com/vi/{id}/maxresdefault.jpg` as `kind: "thumbnail"`. No posters were fetched from the open web. The 68 without a trailer id are listed in `data/missing-trailers.txt`. Fairway of Love has a pilot id only; it is still on the missing list.

### Measurement

The Cloudflare Web Analytics snippet is emitted from the shared shell in `scripts/build-site.mjs`. The token lives in `data/cloudflare-beacon.txt`. Until that file contains a token, the pages get an HTML comment instead of the script, so nothing is counted and no dummy beacon is sent. `/audience` is still the weekly log in `data/analytics.txt`.

Do not install Google Analytics.

## 2026-09-04 — static HTML emit (Brief C, section 2b)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: emit static HTML from `data/series.json`, keep the live look, push to a branch (not `main`).

### What changed

The public pages are now static HTML written by `scripts/build-site.mjs`. `src/lib/schedule.ts` still owns date arithmetic against Asia/Bangkok. The React preview app is not the product. A GitHub push to `rebuild/static-html` is ready and waiting on repository write permission.

Look is the existing tracker, not a redesign. Wordmark from `brand/wordmark.html`. Palette from `tracker.html`. 🔥 / UNCUT / Hot Takes / platform marks kept. Finale uses existing red `#f87171`; penultimate uses existing amber `#fbbf24`.

Paid tier remains removed.

### How to add a series

Edit `scripts/generate-series-json.mjs` (or `data/series.json` directly), then run `node scripts/generate-series-json.mjs` if you used the generator, then `node --experimental-strip-types scripts/build-site.mjs`. Give every claim a `sources` entry. If sources disagree, put both claims in `conflicts` and write a `weight`. Dated runs need `episodes[].airs_at` as ISO-8601 with `+07:00`.

## 2026-09-04 — tracker rebuild (Brief C)

- Assistant: Grok 4 (Grok Build, xAI)
- Date: 2026-09-04
- Request: BRIEF-C-tracker-rebuild-2026-09-04.md (Sterling Grey)

Separated data from rendering. `data/series.json` is the source of truth. Status (airing / upcoming / wrapped), "tonight", "next seven days", finale and penultimate flags are computed from `airs_at` against now in Asia/Bangkok.

Removed the paid tier, waitlist, founding-member rate, and every "feature withheld" mark. The product is free. Video (trailers and pilots) plays in an on-site YouTube iframe on the free pages.

Added a cookieless audience log at `data/analytics.txt` and an `/audience` page. Do not install Google Analytics.

Daily rebuild: `.github/workflows/daily-rebuild.yml` stamps `generated_at` and re-emits HTML. Rendering stays arithmetic. Weekly research still needs a human or an assistant to edit the JSON with sources.
