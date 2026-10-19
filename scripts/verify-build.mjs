#!/usr/bin/env node
// Check the assembled pages, after every build stage has completed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, process.env.SITE_OUT || "site");
const read = (file) => readFileSync(join(out, file), "utf8");
const tracker = read("tracker.html");
assert.match(read("index.html"), /Your Thai GL week,/, "Homepage must explain newsletter value");
assert.match(read("index.html"), /data-form="mO4Dhh"/, "Homepage must include signup");
assert.match(read("index.html"), /href="tracker.html"/, "Free Tracker must remain accessible");
for (const title of ["This Week", "Currently Airing", "Coming Soon", "2025 Series Archive", "Complete 2024 Archive", "Complete 2023 Archive", "2022 Archive", "Thai GL-Related Dramas", "Thai GL Movies"]) {
  assert.ok(tracker.includes(`data-title="${title}"`), `Missing tracker shelf: ${title}`);
}
assert.ok(tracker.includes('id="week-blocks"'), "Final homepage styling was not applied");
assert.ok(tracker.includes("css/art-blocks.css"), "Tracker artwork stylesheet is missing");
assert.doesNotMatch(
  tracker,
  /class="compact-card[^"]*(?:is-finale[^"]*is-penult|is-penult[^"]*is-finale)/,
  "A This Week card cannot label its first upcoming episode as both finale and penultimate",
);
for (const file of ["index.html", "tracker.html", "subscribe.html", "welcome.html", "privacy.html", "terms.html", "refund.html", "audience.html"]) {
  const html = read(file);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*(?:access-check|checkout|clerk|stripe)[^"']*["']/i, `Paid access link or sign-in script found on free page: ${file}`);
}
const corrections = read("corrections.html");
assert.match(corrections, /juliet-2026-10-19/, "Public correction must survive a rebuild");
assert.match(read("index.html"), /newsletter\/issue-007\//, "Homepage must offer a full sample issue");
const archive = read("newsletter/issue-007/index.html");
assert.doesNotMatch(archive, /\{\$|ads@spinfuel|mom2jrs93/, "Public issue must not contain email merge tags or private recipient data");
assert.match(archive, /corrections.html#juliet-2026-10-19/, "Archive must display the dated correction");
const subscribe = read("subscribe.html");
assert.match(subscribe, /id="signup-confirmation-note"/, "Rebuild removed the newsletter confirmation instructions");
assert.match(subscribe, /Then check your inbox and click the confirmation link/, "Signup must explain email confirmation");
console.log("Verified assembled free pages: homepage, shelves, styling, and no paid-access links");
// Social crawlers need metadata in the delivered HTML, not client-side scripts.
for (const [file, card] of [
  ['index.html','home'], ['subscribe.html','subscribe'], ['tracker.html','tracker'],
  ['newsletter/index.html','newsletter'], ['newsletter/issue-007/index.html','newsletter'],
  ['essays/index.html','essays'], ['essays/when-the-love-is-real/index.html','essays'],
]) {
  const html=read(file);
  const canonical='https://thaiglweekly.com/'+(file==='index.html'?'':file.replace(/index\.html$/,''));
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `Wrong share destination: ${file}`);
  assert.equal((html.match(/property="og:image"/g)||[]).length,1,`Duplicate/missing share image: ${file}`);
  assert.ok(html.includes(`https://thaiglweekly.com/assets/social/${card}-v1.png`), `Wrong preview card: ${file}`);
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'),`Missing large X card: ${file}`);
  const png=readFileSync(join(out,'assets/social',`${card}-v1.png`));
  assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
}
console.log('Verified share destinations and 1200x630 social cards');
for (const destination of [
 'https://www.iq.com/album/pls-love-2026-wopu9fjxm5?lang=en_us',
 'https://www.gagaoolala.com/en/videos/8842/juliet-and-juliet-2026',
 'https://wetv.vip/en/play/z506bchzh793iok-Built_in_Love_(Uncut_Ver.)',
 'https://www.iq.com/album/under-her-rules-2026-1g37nef392h?lang=en_us',
]) assert.ok(tracker.includes(`href="${destination}"`), `Direct viewing destination missing: ${destination}`);
assert.ok(tracker.includes('promotional material, not a verified released episode'), 'Upcoming title page must not imply released episodes');
assert.ok(tracker.includes('reservation and previews'), 'Reservation listing must retain its limitation');
assert.ok(tracker.includes('Watch on iQIYI ↗'), 'Airing show link must explain it opens the show');
assert.ok(tracker.includes('Show page on WeTV (uncut) ↗'), 'Premiere link must not promise released episodes');
assert.ok(tracker.includes('Channel 3 · platform homepage ↗'), 'Broadcaster fallback must be labelled as homepage');
assert.ok(tracker.includes('(opens in a new tab)'), 'External viewing links must describe new-tab behaviour');

// Optional translation must remain opt-in and survive daily homepage assembly.
for (const file of ['index.html', 'tracker.html']) {
 const html=readFileSync(join(out,file),'utf8');
 if((html.match(/id="enable-translation"/g)||[]).length!==1) throw new Error(file+': missing or duplicate translation control');
 if(/<script[^>]+src="https:\/\/(?:cdn\.gtranslate\.net|translate\.google)/i.test(html)) throw new Error(file+': translator loads without reader request');
 if(!html.includes('js/translation.js?v=20261019')) throw new Error(file+': missing translation integration');
}
if(!readFileSync(join(out,'privacy.html'),'utf8').includes('id="translation"')) throw new Error('Missing translation privacy explanation');
console.log('Verified optional translation controls and privacy explanation');
