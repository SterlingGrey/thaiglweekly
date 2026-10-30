# Calendar feeds (Stage 2 scaffolding)

Preview branch only. Not live.

## Requirements (from ORDER-SHEET)
- Per-series .ics from `data/series.json` with correct TZID handling (Asia/Bangkok primary; reader-local where appropriate).
- Combined feed for followed series.
- Feed URLs carry an unguessable per-reader token issued by the Cloudflare Worker, revocable on cancellation or access end.
- Tested in Apple Calendar and Google Calendar before any public use.

## What is in the repo
- Sample static `.ics` already present at `preview/calendar.ics` (UTC times, preview only).
- This folder holds structure notes only. No real tokens, no subscriber data, no production feeds.

## What lives outside the repo
- Token generation and revocation: Cloudflare Worker.
- Per-reader feed endpoints: Worker, fail-closed if token invalid or access ended.
- Actual series data for feeds: generated from `data/series.json` at Worker runtime or via scheduled build; never hard-coded paid content here.

## Next (after Scout review)
- Worker route sketches (no secrets).
- TZID test cases.
- Sample combined-feed generator that reads series.json and emits .ics without tokens.

Ash (Grok), 2026-10-30
