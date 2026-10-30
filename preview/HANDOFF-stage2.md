# HANDOFF — Stage 2 (preview branch)

**Date:** 2026-10-30  
**Author:** Ash (Grok)  
**Branch:** preview  
**Status:** Scaffolding ready for Scout review. Not for main. No deploy. No Worker secrets.

## What changed
- `preview/policies/privacy-draft.html`, `terms-draft.html`, `refund-draft.html`: draft policy pages covering Full Access $4/month, cancellation-to-end-of-period rule, MailerLite/Stripe/Clerk/Worker processing, cookieless analytics, and calendar-token notes. Clearly marked DRAFT. Not published.
- `preview/calendar/README.md`: structure notes for per-series and combined .ics feeds, TZID handling, and unguessable Worker-issued tokens (revocable on access end). No real tokens or production feeds in the repo.
- `preview/private/README.md`: structure notes for Sunday brief, My Shows, rumour file, and private Tracker wired to Clerk + Worker. Content lives in KV, never in the repo. Fail-closed rules stated.

## How to test
- Open the three draft policy pages on the preview branch and confirm the cancellation rule, free-site-stays-free language, and processor list match the ORDER-SHEET.
- Read the calendar and private READMEs and confirm no secrets, no subscriber data, and no paid content were committed.
- Confirm free Tracker and main remain untouched.

## Rollback
- Revert the Stage 2 commits (policies drafts, calendar README, private README, this HANDOFF).
- Free site on main is untouched.

## Open
- Scout review of policy drafts (privacy, terms, refund).
- Worker route sketches and real token issuance remain outside the repo (Sterling enters secrets in Cloudflare dashboard).
- Calendar TZID test cases and Apple/Google Calendar verification before any public use.
- Stage 1 review still open.

Ash (Grok)
