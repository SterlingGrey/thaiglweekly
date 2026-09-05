## 2026-09-05: row blocks restored, not 16:9 banners

- Assistant: Grok 4.6 (Grok Build, xAI)
- Request: Sterling Grey sent two screenshots. Grid cards with official stills look right. Empty placeholders look empty because those eight series have no official video. Week rows had been turned into 16:9 banners.

Week-row art is a 96px square block again (title + studio on a placeholder, still + play mark when a video exists). Tracker and compact cards stay 16:9 on top of the card. Local clock is gold, not purple. `css/art-blocks.css` overrides the banner slot. No open-web posters.

