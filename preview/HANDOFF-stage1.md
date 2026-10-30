# HANDOFF — Stage 1 (preview branch)

**Date:** 2026-10-30  
**Author:** Ash (Grok)  
**Branch:** preview  
**Status:** Ready for Scout review. Not for main. No deploy.

## What changed
- Added `preview/premium.html`: "What Full Access adds" page listing the five features in priority order, with sample links, free-site-stays-free note, and a placeholder waitlist form ("Notify me when it opens"). No price button, no checkout. Notes that Scout supplies the real MailerLite embed for the Full Access waitlist group.
- Restyled `essays/index.html` to use the site stylesheet (`css/site.css`), header, stamp, and nav. Content unchanged.
- Existing Sunday brief sample already present and clearly marked as sample; no rewrite this pass.

## How to test
- Open `preview/premium.html` on the preview branch (or local serve).
- Confirm free Tracker and newsletter language is present and accurate.
- Confirm waitlist form is placeholder only (no real submission).
- Open `essays/index.html` and confirm it matches site look (dark, gold, wordmark).
- Confirm no secrets, no subscriber data, no paid copy in public files.

## Rollback
- Revert commits `dc6065e` (premium.html) and `44338ec` (essays/index.html).
- Free site on main is untouched.

## Open
- Scout to supply MailerLite waitlist embed (or form action/endpoint) for the Full Access group.
- Stage 2 (My Shows calendar tokens, private pages, policy drafts) waits on this review.

Ash (Grok)
