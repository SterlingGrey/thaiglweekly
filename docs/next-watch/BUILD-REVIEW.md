# Next-watch reader test, 6 November 2026

Scout (Codex). Sterling authorised completion of the build without interim approval requests. This branch is a private review build, not a launch. No production site, subscriber, sending automation or social schedule changed. Only a separate native form/source group was prepared for this tool.

## What is built

A standalone `/next-watch.html` tool with a 114-title catalogue and 81 catalogue-released seed choices at this snapshot. Ten explicit story profiles complement conservative keyword rules. Seven were freshly reviewed against primary distributor, studio or platform material; three use already sourced catalogue premises. Source dates remain visible and the full catalogue review remains 22 October. Never advance it from a build timestamp.

Story themes55, mood15, setting20, studio5, cast5. Generic “secrets” is deliberately excluded from matching; broad drama mood contributes only a quarter of its mood weight. The same studio or content-intensity label cannot create a story match. Unknown information adds nothing. The default requires a shared theme or setting and may return fewer than three suggestions. Upcoming or unknown broadcasts stay out even when a projected episode date is in the past. Stored wrapped/library records retain their existing catalogue provenance; this is not a complete new release audit.

Search supports titles, pairs and actors. Optional filters require a viewing link or a dated, sourced distribution record within30days. Country evidence is separate from playback, subtitles and price. The browser never fills missing availability. Direct episode links identify parts where known; listings are not advertised as a complete free series. Old platform links retain their earlier review status and are labelled catalogue links.

Copying a shortlist includes only show ID/preferences in the URL fragment. No email is put in the link, no cross-device list sync is promised, and no account or server storage is introduced. Dynamic text is HTML-escaped, external URLs require HTTPS without embedded credentials, and the join page accepts only allowlisted preference fields. No free-text redirect or email parameter is reflected.

## Signup integration and confirmed-reader measurement

Created a separate native MailerLite embedded form by duplicating the established free newsletter form, not the paid form. Name: Next Watch reader test · 6 Nov 2026. Form203413404756477493, embed3XPwX0. Source group203413490795283748, Next Watch · source cohort · Nov 2026; the ordinary Subscribers group196897593812321331 remains selected too. Existing live form mO4Dhh and existing automations were not modified. Double opt-in remained ON, verified on the copied form's settings screen by its green/on toggle. Confirmation subject and sender were inherited from the established form.

The join page embeds the dedicated native form and provides the same form's hosted fallback link. The live email field and “Get the free Monday newsletter” button rendered in Chrome. It states newsletter consent, inbox confirmation, a separate Tracker verification step with the same address, and browser-local list limitations. Shortlist preferences survive the return route and do not enter the signup submission. MailerLite processes the email and source membership; no second subscriber database or application backend was introduced. At native form/group creation there were zero subscribers. Local form-render tests are test visits, not reader demand.

Measurement uses the dedicated form and source group, not a UTM guess: record form visits/submissions separately, then filter source-group members by ACTIVE/confirmed and original subscription date after launch. Exclude Sterling/team/test addresses and pre-existing subscribers. Do not equate a form registration count or a group member with confirmation without checking native status. Baseline at creation: source group0, total active newsletter7 including owner, ordinary Subscribers group6. Existing main-form historical registrations24 is not the active reader count. Reconcile native status and main group after the controlled test before accepting attribution.

The embedded form rendered at desktop and390px width without horizontal overflow. No address was entered; no subscriber or email was created. Confirmation delivery, spam placement, source/main-group membership of a new confirmed address and Tracker unlocking remain a controlled live test before launch. Real Facebook in-app-browser handoff still needs a phone test. Viewport emulation is not a physical-phone end-to-end test. Owner's final build review and a test mailbox that can receive/confirm the message are the remaining release gates.

## Source ledger

- 23.5: Netflix https://www.netflix.com/vc/title/81760051, reviewed6Nov; student/online identity/first love/comedy. Listing, no country playback test.
- The Secret of Us: I.E. Entertainment https://ie-ent.com/the-secret-of-us/, reviewed6Nov; doctor/ex-girlfriend/reunion. Distributor synopsis, not a watch link.
- The Loyal Pin: TELASA release https://www.telasa.co.jp/wp-content/uploads/2024/08/0816_news.pdf, reviewed6Nov; childhood companions, royal constraints and period setting.2024release, no current global availability claim.
- Pluto: GMMTV https://www.gmm-tv.com/contents/episode/ZK7wZ/, reviewed6Nov; twin impersonation and official episode page. No global playback test.
- Affair: Netflix https://www.netflix.com/title/82761812, reviewed6Nov; class, childhood friendship, reunion; listing with8episodes. CHANGE2561 existing episode URL oEmbed confirms EP1 part2/4/uploader6Nov, not playback.
- Harmony Secret: iQIYI https://www.iq.com/short/cx199ex40s?lang=en_us and Netflix https://www.netflix.com/iq-en/title/82761822, reviewed6Nov; business rivalry and first love. Listing, no country playback test.
- PLS Love: iQIYI story introduction https://www.iq.com/wiki/zh_cn/article/3305424646300801_en_us_2026-11-02 and series page https://www.iq.com/album/pls-love-2026-wopu9fjxm5?lang=en_us, reviewed6Nov; class divides and released episodes. “Business heiress” does not imply workplace setting.
- GAP, Blank The Series, Love Design: existing `data/series.json` sourced premises. No new claim that these source pages were fully rechecked. GAP existing official EP1 link oEmbed title/uploader checked6Nov: part2of4, IDOLFACTORY OFFICIAL; no playback or subtitles test.

## Release and rollback

Deploy only after finished owner review and the launch checks above. Merge through the normal repository workflow. `scripts/build-next-watch.mjs` runs after the subscriber gate, emits only selected catalogue fields and explicit story profiles, and is included in the normal preview build. For branch-based Pages, generate `SITE_OUT=. node scripts/build-next-watch.mjs` and commit the emitted `js/next-watch-catalog.js`. Subsequent daily builds refresh it. Pages excludes docs, scripts and private members via existing configuration.

Do not change homepage/navigation or ask Rocky to promote this private URL yet. After release, add the public route to discovery surfaces in a separate reviewed change. Rollback is removal of the standalone pages/assets and its build stage; existing newsletter and Tracker pages are untouched.
