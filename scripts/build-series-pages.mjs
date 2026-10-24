// Source-backed viewing guides. Schedule and viewing facts come from the same catalog as the Tracker.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCatalog, formatIct } from '../src/lib/schedule.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.env.SITE_OUT || 'site');
const origin = 'https://thaiglweekly.com';
const catalog = JSON.parse(readFileSync(join(root, 'data/series.json'), 'utf8'));
const now = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
const computed = computeCatalog(catalog, now);
const esc = value => String(value ?? '').replaceAll('&', '&').replaceAll('<', '<').replaceAll('>', '>').replaceAll('"', '"');
const pilots = JSON.parse(readFileSync(join(root, 'data/series-guides.json'), 'utf8'));
const time = iso => { const t = formatIct(iso); return `${t.day} ${t.date} · ${t.time} ICT`; };
const beacon = readFileSync(join(out, 'index.html'), 'utf8').match(/<script defer src="https:\/\/static\.cloudflareinsights\.com[\s\S]*?<\/script>/)?.[0] || '';
const footer = `<footer><p>Thai GL Weekly · Facts sourced. Opinions labelled. Corrections published.</p><nav aria-label="Footer"><a href="../../tracker.html">Free Tracker</a><a href="../../corrections.html">Corrections</a><a href="../../privacy.html">Privacy</a></nav></footer>`;

for (const [id, editorial] of Object.entries(pilots)) {
  const series = computed.series.find(s => s.id === id);
  if (!series) throw new Error(`Missing pilot title: ${id}`);
  const preferred = series.platforms.find(p => p.preferred && p.url);
  if (!preferred) throw new Error(`Missing official title route: ${id}`);
  const edition = preferred.uncut ? `${preferred.name} uncut route, as recorded in the Tracker.` : `${preferred.name} series listing; no uncut edition is established by this record.`;
  const countryNote = series.availability_note || preferred.note || "Country playback, subtitles and current payment requirements have not been tested.";
  const countConflict = series.conflicts.find(c => !c.resolved && /episode count|specials/i.test(c.topic));
  const unresolved = series.conflicts.filter(c => !c.resolved);
  const image = /^https:\/\//.test(series.image.url) ? series.image.url : '../../'+series.image.url;
  const absoluteImage = /^https:\/\//.test(series.image.url) ? series.image.url : origin+'/'+series.image.url;
  const imageLabel = series.image.kind === 'thumbnail' ? 'official-channel trailer thumbnail' : 'official promotional poster';
  const next = series.nextEpisode;
  const episodeLabel = next ? (countConflict ? `Episode ${next.number} · recorded regular run` : `Episode ${next.number} of ${series.total_episodes}`) : (countConflict ? 'No further regular episode dated' : 'Run complete');
  const event = next ? next.number === series.total_episodes ? (countConflict ? 'Last recorded regular episode ahead' : 'Finale ahead') : next.number === series.total_episodes - 1 ? 'Penultimate episode ahead' : 'Next episode' : (countConflict ? 'Recorded regular schedule finished' : 'The story is ready to revisit');
  const date = next ? time(next.airs_at) : series.latestAired ? `Final scheduled episode: ${time(series.latestAired.airs_at)}` : 'No future episode date recorded';
  const description = `${series.title}: official ${preferred.name} viewing link, episode schedule, country and subtitle notes, plus Sterling’s take. A free Thai GL Weekly viewing guide.`;
  const sourceMap = new Map();
  for (const source of series.sources) if (/^https:\/\//.test(source.url || '')) sourceMap.set(source.url, source);
  // The main viewing URL appears once, as the useful action. Keep its check note next to it.
  sourceMap.delete(preferred.url);
  const sources = [...sourceMap.values()].sort((a, b) => b.checked.localeCompare(a.checked)).slice(0, 5);
  const directory = join(out, 'shows', id);
  mkdirSync(directory, { recursive: true });
  const related = Object.keys(pilots).filter(other => other !== id).map(other => computed.series.find(s => s.id === other));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(series.title)}: where to watch and episode guide | Thai GL Weekly</title><meta name="description" content="${esc(description)}"><link rel="icon" href="../../assets/favicon.png"><link rel="stylesheet" href="../../css/site.css"><link rel="stylesheet" href="../../css/series-guide.css?v=20261019">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'TVSeries', name: series.title, url: `${origin}/shows/${id}/`, description: series.logline, ...(countConflict ? {} : {numberOfEpisodes: series.total_episodes}), image: absoluteImage }).replaceAll('<', '\\u003c')}</script></head>
<body data-page="series-guide"><div class="guide-wrap"><header class="guide-nav"><a class="home-brand" href="../../"><img src="../../essays/logo-tgw.png" alt=""><span>THAI GL WEEKLY</span></a><nav aria-label="Main navigation"><a href="../../tracker.html">Free Tracker</a><a href="../../essays/">Essays</a><a href="../../subscribe.html">Monday email</a></nav></header>
<main><p class="guide-breadcrumb"><a href="../../tracker.html#card-${id}">Tracker</a> / Viewing guide</p>
<section class="guide-hero" aria-labelledby="series-title"><div class="guide-art"><img src="${esc(image)}" alt="${esc(series.title)} ${imageLabel}" fetchpriority="high"><p>${series.image.kind === 'thumbnail' ? 'Official-channel trailer thumbnail.' : 'Official promotional artwork.'} Rights remain with the rights holder.</p></div><div><p class="guide-eyebrow">${esc(event)}</p><h1 id="series-title" class="notranslate" translate="no">${esc(series.title)}</h1><p class="guide-pairing notranslate" translate="no">${esc(series.pairing)}</p><p class="guide-intro">${esc(series.logline)}</p>
<div class="guide-answer"><p class="guide-eyebrow">Where to watch</p><h2>${preferred.name === 'YouTube' ? 'Start with the official episode upload.' : 'Start with the official show page.'}</h2><a class="guide-button" href="${esc(preferred.url)}" target="_blank" rel="noreferrer" aria-label="Watch ${esc(series.title)} on ${esc(preferred.name)} (opens in a new tab)">Watch on ${esc(preferred.name)} ↗</a><p>${esc(edition)}</p><p class="guide-small">Official listing reviewed ${esc(catalog.verified_at)}. Playback varies by country.</p></div></div></section>
<section class="guide-facts" aria-label="Release facts"><div><span>Next in the schedule</span><strong>${esc(episodeLabel)}</strong><p>${esc(date)}</p></div><div><span>Series length</span><strong>${series.total_episodes} ${countConflict ? 'regular episodes recorded' : 'episodes'}</strong><p>${countConflict ? 'Regular episodes recorded; see the unresolved platform count below.' : 'Recorded in the Tracker; evidence and edition notes below.'}</p></div><div><span>Schedule clock</span><strong>Thailand time</strong><p>ICT is UTC+7. This page does not convert to your local time.</p></div></section>
<section class="guide-section" aria-labelledby="country-notes"><p class="guide-eyebrow">Before you press play</p><h2 id="country-notes">A listing is not a country guarantee.</h2><p>${esc(countryNote)}</p>${unresolved.length ? `<details class="guide-uncertainty"><summary>What is still unresolved?</summary>${unresolved.map(c=>`<h3>${esc(c.topic)}</h3><p>${esc(c.weight)}</p>`).join('')}</details>` : ''}<p class="guide-small">Episode times follow the recorded Thai broadcast schedule; the streaming edition can appear later. Source review is separate from a playback test. <a href="../../tracker.html#card-${id}">See the full Tracker record and evidence</a>.</p></section>
<section class="guide-opinion" aria-labelledby="sterling-take"><p class="guide-eyebrow">Sterling’s verdict · Personal opinion</p><h2 id="sterling-take">Sterling’s take</h2><blockquote>${esc(editorial.quote)}</blockquote><p>From the 19 October 2026 newsletter. Rankings and reactions belong to that issue.</p><a href="../../newsletter/issue-007/">Read the complete issue →</a></section>
<section class="guide-section" aria-labelledby="episode-schedule"><h2 id="episode-schedule">The episode schedule</h2><p>Times shown are the recorded Thailand schedule. “Scheduled” does not confirm that a stream is available.</p><ol class="guide-episodes">${series.episodes.map(ep => `<li><strong>EP ${ep.number}${ep.number === series.total_episodes ? (countConflict ? ' · Last recorded regular episode' : ' · Finale') : ''}</strong><time datetime="${esc(ep.airs_at)}">${esc(time(ep.airs_at))}</time><span>${Date.parse(ep.airs_at) <= now ? 'Scheduled date passed' : 'Scheduled'}</span></li>`).join('')}</ol></section>
<section class="guide-section" aria-labelledby="sources"><h2 id="sources">Sources and checks</h2><p>The viewing button above is the official title listing, reviewed ${esc(catalog.verified_at)}. These records explain the schedule and its limits.</p><ul class="guide-sources">${sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)}</a><span>Checked ${esc(s.checked)}</span></li>`).join('')}</ul><p><a href="../../corrections.html">Read our corrections</a> if a listing or episode count has changed.</p></section>
<section class="guide-signup"><p class="guide-eyebrow">Free every Monday</p><h2>The viewing link gets you started.<br>The Monday email brings the week together.</h2><p>Sterling’s Top Six, essays, Dao’s films and what’s coming next. No payment or app required.</p><a class="guide-button" href="../../subscribe.html">Get the free Monday newsletter</a><p class="guide-small">After signing up, check your inbox or spam and click the confirmation link.</p></section>
<section class="guide-section"><h2>Another show on your list?</h2>${related.map(s => `<a class="guide-related" href="../${s.id}/"><span class="notranslate" translate="no">${esc(s.title)}</span><span>Official link, dates and country notes →</span></a>`).join('')}</section></main>${footer}</div>${beacon}</body></html>`;
  writeFileSync(join(directory, 'index.html'), html);
}

// Add a useful internal route without changing any official platform button or old anchor.
const trackerPath = join(out, 'tracker.html');
let tracker = readFileSync(trackerPath, 'utf8');
tracker = tracker.replace(/<!-- SERIES GUIDE LINK START -->[\s\S]*?<!-- SERIES GUIDE LINK END -->/g, '');
for (const id of Object.keys(pilots)) {
  const title = esc(computed.series.find(s => s.id === id).title);
  const cardNeedle = `id="card-${id}"`;
  const cardIndex = tracker.indexOf(cardNeedle);
  if (cardIndex < 0) continue;
  const searchFrom = Math.max(0, cardIndex - 3000);
  const searchTo = Math.min(tracker.length, cardIndex + 8000);
  const slice = tracker.slice(searchFrom, searchTo);
  const titlePrefix = `<div class="show-title">${title}`;
  const pos = slice.indexOf(titlePrefix);
  if (pos >= 0) {
    const absolutePos = searchFrom + pos;
    const replacement = `<div class="show-title"><a href="shows/${id}/" class="series-guide-title" aria-label="${title}: viewing guide and episode dates">${title}</a>`;
    tracker = tracker.slice(0, absolutePos) + replacement + tracker.slice(absolutePos + titlePrefix.length);
  }
}
writeFileSync(trackerPath, tracker);

const routes = ['/', '/tracker.html', '/subscribe.html', '/privacy.html', '/corrections.html', '/terms.html', '/refund.html', '/audience.html', ...Object.keys(pilots).map(id => `/shows/${id}/`)];
function archiveRoutes(dir, prefix) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'archive') continue;
    if (entry.isDirectory()) archiveRoutes(join(dir, entry.name), `${prefix}${entry.name}/`);
    else if (entry.name === 'index.html') routes.push(prefix);
  }
}
archiveRoutes(join(out, 'essays'), '/essays/');
archiveRoutes(join(out, 'newsletter'), '/newsletter/');
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${origin}${esc(route)}</loc></url>`).join('')}</urlset>\n`);
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
writeFileSync(join(out, 'css/series-guide.css'), readFileSync(join(root, 'css/series-guide.css')));
console.log('Built source-linked series guides and public sitemap');
