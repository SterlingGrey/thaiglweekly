import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {onTonightRows, onTonightBuild, dateBasis} from '../../scripts/on-tonight-data.mjs';

const scriptPath = fileURLToPath(new URL('../../js/on-tonight.js', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');

function load(extra = {}) {
  const context = vm.createContext({Intl, Date, ...extra});
  context.window = context;
  vm.runInContext(script, context);
  return context.tgwOnTonight;
}
const plain = value => JSON.parse(JSON.stringify(value));
const at = iso => new Date(iso);

const timed = (id, title, number, instant, extra = {}) => ({id, title, number, total: 10, date: instant.slice(0, 10), instant, platform: null, dateBasis: 'episode-source', ...extra});
const dateOnly = (id, title, number, date, extra = {}) => ({id, title, number, total: 8, date, instant: null, platform: null, dateBasis: 'episode-source', ...extra});

test('Bangkok date turns over at 17:00 UTC, whatever the reader zone', () => {
  const tonight = load();
  assert.equal(tonight.bangkokDate(at('2026-11-16T16:59:59Z')), '2026-11-16');
  assert.equal(tonight.bangkokDate(at('2026-11-16T17:00:00Z')), '2026-11-17');
  assert.equal(tonight.ZONE, 'Asia/Bangkok');
});

test('a 20:30 Bangkok episode appears on its Bangkok date for a reader whose local date differs', () => {
  const tonight = load();
  const rows = [timed('a', 'Alpha', 5, '2026-11-17T20:30:00+07:00')];
  // 01:30 on 17 Nov in Bangkok. It is still 16 Nov in UTC and in Los Angeles.
  const found = tonight.selectTonight(rows, at('2026-11-16T18:30:00Z'));
  assert.equal(found.length, 1);
  assert.equal(found[0].time, '8:30 PM');
  // 23:30 on 16 Nov in Bangkok. It is already 17 Nov in Auckland.
  assert.equal(tonight.selectTonight(rows, at('2026-11-16T16:30:00Z')).length, 0);
});

test('the result does not change with the reader time zone', () => {
  const probe = `
    const vm = require('node:vm');
    const context = vm.createContext({Intl, Date});
    context.window = context;
    vm.runInContext(require('node:fs').readFileSync(process.argv[1], 'utf8'), context);
    const rows = [
      {id:'a', title:'Alpha', number:5, total:10, date:'2026-11-17', instant:'2026-11-17T13:30:00.000Z', platform:null, dateBasis:'episode-source'},
      {id:'b', title:'Beta', number:1, total:8, date:'2026-11-17', instant:null, platform:null, dateBasis:'premiere'}
    ];
    const out = [];
    for (const now of ['2026-11-16T16:59:00Z', '2026-11-16T17:00:00Z', '2026-11-17T16:59:00Z', '2026-11-17T17:00:00Z']) {
      out.push(context.tgwOnTonight.bangkokDate(new Date(now)) + ':' + context.tgwOnTonight.selectTonight(rows, new Date(now)).map(r => r.id + '@' + r.time).join(','));
    }
    console.log(out.join('|'));`;
  const outputs = ['UTC', 'Pacific/Auckland', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Bangkok'].map(zone => {
    const run = spawnSync(process.execPath, ['-e', probe, scriptPath], {env: {...process.env, TZ: zone}, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim();
  });
  assert.equal(new Set(outputs).size, 1, outputs.join('\n'));
  assert.equal(outputs[0], '2026-11-16:|2026-11-17:a@8:30 PM,b@Time pending|2026-11-17:a@8:30 PM,b@Time pending|2026-11-18:');
});

test('a date-only episode appears all day and never shows a clock time', () => {
  const tonight = load();
  const rows = [dateOnly('d', 'Delta', 1, '2026-11-18')];
  for (const now of ['2026-11-17T17:00:00Z', '2026-11-18T05:00:00Z', '2026-11-18T16:59:59Z']) {
    const found = tonight.selectTonight(rows, at(now));
    assert.equal(found.length, 1, now);
    assert.equal(found[0].time, 'Time pending');
  }
  assert.equal(tonight.selectTonight(rows, at('2026-11-18T17:00:00Z')).length, 0);
  assert.equal(tonight.selectTonight(rows, at('2026-11-17T16:59:59Z')).length, 0);
});

test('a confirmed time decides its day, not the catalogue date string', () => {
  const tonight = load();
  // 00:30 on 17 Nov in Bangkok, filed under 16 Nov.
  const rows = [timed('x', 'Xray', 2, '2026-11-16T17:30:00.000Z', {date: '2026-11-16'})];
  assert.equal(tonight.selectTonight(rows, at('2026-11-16T10:00:00Z')).length, 0);
  assert.equal(tonight.selectTonight(rows, at('2026-11-17T10:00:00Z')).length, 1);
});

test('yesterday and tomorrow do not appear', () => {
  const tonight = load();
  const rows = [
    timed('y', 'Yesterday', 1, '2026-11-15T20:30:00+07:00'),
    timed('t', 'Today', 2, '2026-11-16T20:30:00+07:00'),
    timed('m', 'Tomorrow', 3, '2026-11-17T20:30:00+07:00'),
    dateOnly('yd', 'Yesterday date', 1, '2026-11-15'),
    dateOnly('md', 'Tomorrow date', 1, '2026-11-17')
  ];
  assert.deepEqual(plain(tonight.selectTonight(rows, at('2026-11-16T09:00:00Z'))).map(r => r.id), ['t']);
});

test('an empty day gives the quiet line and keeps the strip', () => {
  const tonight = load();
  assert.deepEqual(plain(tonight.selectTonight([], at('2026-11-16T09:00:00Z'))), []);
  assert.deepEqual(plain(tonight.selectTonight(undefined, at('2026-11-16T09:00:00Z'))), []);
  assert.match(tonight.listMarkup([]), /No episodes confirmed for tonight\./);
  const body = {innerHTML: ''};
  assert.equal(tonight.mount({getElementById: id => id === 'on-tonight-body' ? body : null}, [], at('2026-11-16T09:00:00Z')), true);
  assert.match(body.innerHTML, /No episodes confirmed for tonight\./);
});

test('rows sort by time, with date-only rows last', () => {
  const tonight = load();
  const rows = [
    dateOnly('p2', 'Zulu pending', 1, '2026-11-18'),
    timed('late', 'Late', 3, '2026-11-18T22:30:00+07:00'),
    dateOnly('p1', 'Alpha pending', 2, '2026-11-18'),
    timed('early', 'Early', 4, '2026-11-18T20:00:00+07:00'),
    timed('tie-b', 'Bravo', 1, '2026-11-18T20:30:00+07:00'),
    timed('tie-a', 'Alpha', 1, '2026-11-18T20:30:00+07:00')
  ];
  const found = plain(tonight.selectTonight(rows, at('2026-11-18T08:00:00Z')));
  assert.deepEqual(found.map(r => r.id), ['early', 'tie-a', 'tie-b', 'late', 'p1', 'p2']);
  assert.deepEqual(found.map(r => r.time), ['8:00 PM', '8:30 PM', '8:30 PM', '10:30 PM', 'Time pending', 'Time pending']);
});

test('markup shows episode, total, time, platform link and a card link, and escapes catalogue text', () => {
  const tonight = load();
  const html = tonight.listMarkup(plain(tonight.selectTonight([
    timed('built-in-love', 'Built <in> Love', 5, '2026-11-18T20:30:00+07:00', {platform: {name: 'GMM25', url: 'https://www.gmm-tv.com/contents/Vxp3G/'}}),
    dateOnly('no-total', 'No Total', 2, '2026-11-18', {total: null, platform: {name: 'YouTube', url: null}}),
    dateOnly('bad-link', 'Bad Link', 1, '2026-11-18', {platform: {name: 'Odd', url: 'javascript:alert(1)'}})
  ], at('2026-11-18T08:00:00Z'))));
  assert.match(html, /href="tracker-classic\.html#card-built-in-love"[^>]*>Built &lt;in&gt; Love<\/a>/);
  assert.match(html, /Episode 5 of 10/);
  assert.match(html, />8:30 PM</);
  assert.match(html, /<a href="https:\/\/www\.gmm-tv\.com\/contents\/Vxp3G\/" target="_blank" rel="noopener noreferrer">GMM25<\/a>/);
  assert.match(html, /Episode 2<\/span>/);
  assert.doesNotMatch(html, /Episode 2 of/);
  assert.match(html, /<span class="on-tonight-platform">YouTube<\/span>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal((html.match(/Time pending/g) || []).length, 2);
});

test('the browser script reads only the two same-site Tracker files and names the Bangkok zone', () => {
  assert.match(script, /Asia\/Bangkok/);
  assert.doesNotMatch(script, /XMLHttpRequest|premium|localStorage|sendBeacon|https?:\/\/(?!www\.w3)/i);
  assert.deepEqual([...script.matchAll(/var (DATA_URL|CLASSIC_URL) = "([^"]+)"/g)].map(m => m[2]), ['on-tonight.json', 'tracker-classic.html']);
});

// ---- Source eligibility -------------------------------------------------------
const OFFICIAL = 'https://example.org/official-schedule';
const catalogue = {series: [
  {id: 'timed', title: 'Timed Show', total_episodes: 10, confidence: 'confirmed', sources: [{label: 'x', url: OFFICIAL}], platforms: [{name: 'iQIYI', url: 'https://www.iq.com/x'}, {name: 'GMM25'}],
    episodes: [{number: 1, airs_at: '2026-11-01T20:30:00+07:00'}, {number: 2, airs_at: '2026-11-16T20:30:00+07:00', date_source: OFFICIAL}]},
  {id: 'pending', title: 'Pending Show', total_episodes: 8, confidence: 'confirmed', sources: [{label: 'x', url: OFFICIAL}], platforms: [{name: 'YouTube'}],
    episodes: [{number: 1, airs_at: '2026-11-16T20:30:00+07:00', time_unverified: true}]},
  {id: 'bare', title: 'Bare </script> Show', confidence: 'confirmed', sources: [{label: 'x', url: OFFICIAL}], platforms: [],
    episodes: [{number: 1, airs_at: 'not a date'}, {number: 2, airs_at: '2026-11-17T20:30:00+07:00', date_source: OFFICIAL}]}
]};

test('build rows keep catalogue facts only: no clock time for date-only, first platform, old episodes dropped', () => {
  const rows = onTonightRows(catalogue, '2026-11-16T10:00:00Z');
  assert.deepEqual(rows.map(r => `${r.id}#${r.number}`), ['timed#2', 'pending#1', 'bare#2']);
  assert.deepEqual(rows[0], {id: 'timed', title: 'Timed Show', number: 2, total: 10, date: '2026-11-16',
    instant: '2026-11-16T13:30:00.000Z', platform: {name: 'iQIYI', url: 'https://www.iq.com/x'}, dateBasis: 'episode-source'});
  assert.equal(rows[1].instant, null);
  assert.equal(rows[1].dateBasis, 'premiere');
  assert.deepEqual(rows[1].platform, {name: 'YouTube', url: null});
  assert.equal(rows[2].platform, null);
  assert.equal(rows[2].total, null);
});

test('only an episode with its own date evidence, a reviewed schedule, or a confirmed premiere is eligible', () => {
  const series = {confidence: 'confirmed', sources: [{url: OFFICIAL}]};
  assert.equal(dateBasis(series, {number: 1}), 'premiere');
  assert.equal(dateBasis(series, {number: 2}), null);
  assert.equal(dateBasis(series, {number: 2, date_source: OFFICIAL}), 'episode-source');
  assert.equal(dateBasis(series, {number: 2, date_source: 'http://insecure.example/x'}), null);
  assert.equal(dateBasis(series, {number: 2, date_source: 'not a url'}), null);
  assert.equal(dateBasis({...series, episode_schedule_source: OFFICIAL}, {number: 6}), 'schedule-source');
  assert.equal(dateBasis({...series, confidence: 'announced'}, {number: 1}), null);
  assert.equal(dateBasis({confidence: 'confirmed', sources: []}, {number: 1}), null);
  // time_unverified says only that the clock is unknown. It never establishes a date.
  assert.equal(dateBasis(series, {number: 3, time_unverified: true}), null);
  assert.equal(dateBasis(series, {number: 3, time_unverified: false}), null);
});

test('selectTonight itself refuses a row that carries no date basis', () => {
  const tonight = load();
  const rows = [timed('a', 'Alpha', 2, '2026-11-18T20:30:00+07:00', {dateBasis: undefined}), dateOnly('b', 'Beta', 2, '2026-11-18', {dateBasis: 'guess'}), dateOnly('c', 'Gamma', 1, '2026-11-18', {dateBasis: 'premiere'})];
  assert.deepEqual(plain(tonight.selectTonight(rows, at('2026-11-18T08:00:00Z'))).map(r => r.id), ['c']);
});

test('Buy My Boss: the premiere shows on 2 December, episode 2 does not show on 9 December', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/series.json', import.meta.url), 'utf8'));
  const boss = real.series.find(s => s.id === 'buy-my-boss');
  assert.ok(boss.episodes.length >= 2 && boss.episodes.every(e => e.time_unverified === true), 'catalogue fixture changed');
  const tonight = load();
  const premiere = plain(tonight.selectTonight(onTonightRows(real, '2026-12-02T01:00:00Z'), at('2026-12-02T14:00:00Z'))).filter(r => r.id === 'buy-my-boss');
  assert.deepEqual(premiere.map(r => `${r.number}|${r.time}`), ['1|Time pending']);
  for (const built of ['2026-12-09T01:00:00Z', '2026-12-02T01:00:00Z']) {
    const found = plain(tonight.selectTonight(onTonightRows(real, built), at('2026-12-09T14:00:00Z'))).filter(r => r.id === 'buy-my-boss');
    assert.deepEqual(found, [], built);
  }
  // The row shape the reviewer reproduced, built without evidence, is also refused.
  const legacy = {id: 'buy-my-boss', title: 'Buy My Boss', number: 2, total: 8, date: '2026-12-09', instant: null, platform: null};
  assert.deepEqual(plain(tonight.selectTonight([legacy], at('2026-12-09T14:00:00Z'))), []);
});

test('a confirmed date with no known clock still shows as Time pending', () => {
  const tonight = load();
  const rows = onTonightRows({series: [{id: 's', title: 'S', confidence: 'confirmed', sources: [{url: OFFICIAL}], episodes: [{number: 4, airs_at: '2026-11-18T20:30:00+07:00', time_unverified: true, date_source: OFFICIAL}]}]}, '2026-11-18T01:00:00Z');
  assert.deepEqual(plain(tonight.selectTonight(rows, at('2026-11-18T08:00:00Z'))).map(r => r.time), ['Time pending']);
});

test('the real catalogue builds valid rows, each with a date basis', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/series.json', import.meta.url), 'utf8'));
  const rows = onTonightRows(real, '2026-11-16T10:00:00Z');
  for (const row of rows) {
    assert.ok(row.id && row.title && Number.isInteger(row.number), JSON.stringify(row));
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.instant === null || Number.isFinite(Date.parse(row.instant)));
    assert.ok(['premiere', 'episode-source', 'schedule-source'].includes(row.dateBasis));
    assert.ok(row.platform === null || (row.platform.name && (row.platform.url === null || row.platform.url.startsWith('https://'))));
  }
});

// ---- One source of truth and freshness ----------------------------------------
const classicHtml = '<!doctype html><html><head><title>Tracker</title></head><body><article data-series-id="timed"></article></body></html>';
const build = onTonightBuild(classicHtml, catalogue, '2026-11-16T10:00:00Z');
const dataFile = JSON.parse(build.json);
const response = (body, ok = true) => ({ok, json: async () => JSON.parse(body), text: async () => body});
function fetchFor(files, calls = []) {
  return async (url, options) => {
    calls.push([url, options && options.cache]);
    if (!(url in files)) throw new Error('offline');
    const entry = files[url];
    return typeof entry === 'string' ? response(entry) : entry;
  };
}
const goodFiles = () => ({'on-tonight.json': build.json, 'tracker-classic.html': build.classic});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('the stamped classic page and the data file agree, and the stamp tracks the page', () => {
  assert.match(build.classic, /<meta name="tracker-build" content="[0-9a-f]{16}">\s*<\/head>/);
  assert.equal(dataFile.build, /name="tracker-build" content="([0-9a-f]{16})"/.exec(build.classic)[1]);
  assert.equal(dataFile.builtAt, '2026-11-16T10:00:00.000Z');
  assert.deepEqual(dataFile.rows.map(r => r.id), ['timed', 'pending', 'bare']);
  const other = onTonightBuild(classicHtml.replace('Tracker', 'Tracker changed'), catalogue, '2026-11-16T10:00:00Z');
  assert.notEqual(other.id, build.id);
  assert.doesNotMatch(build.json.slice(1, -1), /<\//);
});

test('the strip reads both files uncached and accepts a consistent pair', async () => {
  const tonight = load();
  const calls = [];
  const result = plain(await tonight.loadSource(fetchFor(goodFiles(), calls), at('2026-11-16T12:00:00Z')));
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(calls.sort(), [['on-tonight.json', 'no-cache'], ['tracker-classic.html', 'no-cache']]);
});

test('a data file from a different build than the classic Tracker is refused as stale', async () => {
  const tonight = load();
  const older = onTonightBuild(classicHtml.replace('Tracker', 'Older'), catalogue, '2026-11-15T10:00:00Z');
  const result = plain(await tonight.loadSource(fetchFor({'on-tonight.json': older.json, 'tracker-classic.html': build.classic}), at('2026-11-16T12:00:00Z')));
  assert.deepEqual(result, {ok: false, reason: 'stale'});
  const noStamp = plain(await tonight.loadSource(fetchFor({'on-tonight.json': build.json, 'tracker-classic.html': classicHtml}), at('2026-11-16T12:00:00Z')));
  assert.deepEqual(noStamp, {ok: false, reason: 'stale'});
});

test('data older than the freshness limit is stale, and so are unreadable files', async () => {
  const tonight = load();
  assert.equal(tonight.MAX_AGE_MS, 72 * 3600 * 1000);
  assert.deepEqual(plain(await tonight.loadSource(fetchFor(goodFiles()), at('2026-11-19T10:00:01Z'))), {ok: false, reason: 'stale'});
  assert.equal((await tonight.loadSource(fetchFor(goodFiles()), at('2026-11-19T09:59:59Z'))).ok, true);
  assert.deepEqual(plain(await tonight.loadSource(fetchFor({}), at('2026-11-16T12:00:00Z'))), {ok: false, reason: 'failed'});
  assert.deepEqual(plain(await tonight.loadSource(fetchFor({'on-tonight.json': response('{}', false), 'tracker-classic.html': build.classic}), at('2026-11-16T12:00:00Z'))), {ok: false, reason: 'failed'});
  assert.deepEqual(plain(await tonight.loadSource(fetchFor({'on-tonight.json': '{"rows": 3}', 'tracker-classic.html': build.classic}), at('2026-11-16T12:00:00Z'))), {ok: false, reason: 'failed'});
  assert.deepEqual(plain(await tonight.loadSource(fetchFor({'on-tonight.json': {ok: true, json: async () => { throw new Error('bad json'); }}, 'tracker-classic.html': build.classic}), at('2026-11-16T12:00:00Z'))), {ok: false, reason: 'failed'});
  assert.deepEqual(plain(await tonight.loadSource(undefined, at('2026-11-16T12:00:00Z'))), {ok: false, reason: 'failed'});
});

test('the three states read differently: confirmed list, none confirmed, data unavailable', () => {
  const tonight = load();
  const list = tonight.stateMarkup({ok: true, rows: [timed('a', 'Alpha', 1, '2026-11-18T20:30:00+07:00')]}, at('2026-11-18T08:00:00Z'));
  const none = tonight.stateMarkup({ok: true, rows: []}, at('2026-11-18T08:00:00Z'));
  const down = tonight.stateMarkup({ok: false, reason: 'failed'}, at('2026-11-18T08:00:00Z'));
  assert.deepEqual([list.state, none.state, down.state], ['list', 'empty', 'unavailable']);
  assert.match(list.html, /on-tonight-list/);
  assert.match(none.html, /<p class="on-tonight-empty">No episodes confirmed for tonight\.<\/p>/);
  assert.equal(tonight.UNAVAILABLE, 'Tonight’s schedule could not be checked just now.');
  assert.match(down.html, /Tonight’s schedule could not be checked just now\./);
  assert.match(down.html, /<button type="button" class="on-tonight-retry" data-on-tonight-retry>Check again<\/button>/);
  assert.match(down.html, /href="tracker-classic\.html"/);
  assert.doesNotMatch(down.html, /No episodes confirmed/);
  assert.doesNotMatch(none.html + list.html, /could not be checked/);
  // Ok data past the freshness limit is unavailable, not an empty night.
  assert.equal(tonight.stateMarkup({ok: true, rows: [], builtAt: '2026-11-10T00:00:00Z'}, at('2026-11-18T08:00:00Z')).state, 'unavailable');
});

// A fake page: one body node, a visibility flag, captured timers and listeners.
function page(files, startIso) {
  const body = {innerHTML: '<p class="on-tonight-empty">Checking tonight’s schedule…</p>', attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }};
  const listeners = {};
  const timers = [];
  const doc = {
    visibilityState: 'visible',
    getElementById: id => id === 'on-tonight-body' ? body : null,
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const state = {now: at(startIso), files, calls: []};
  const tonight = load();
  const strip = tonight.createStrip({
    doc, fetch: (url, options) => { state.calls.push(url); return fetchFor(state.files)(url, options); },
    clock: () => state.now, setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {}
  });
  return {body, listeners, timers, doc, state, strip, tonight};
}
const stampedFor = (rows, builtIso) => {
  const html = classicHtml.replace('Tracker', 'Tracker ' + builtIso);
  const built = onTonightBuild(html, {series: rows}, builtIso);
  return {'on-tonight.json': built.json, 'tracker-classic.html': built.classic};
};
const showSeries = (id, title, number, airs, extra = {}) => ({id, title, confidence: 'confirmed', sources: [{url: OFFICIAL}], platforms: [], episodes: [{number, airs_at: airs, date_source: OFFICIAL, ...extra}]});

test('the strip shows the list after the first read, then rolls over at Bangkok midnight without a reload', async () => {
  const files = stampedFor([showSeries('a', 'Alpha', 3, '2026-11-18T20:30:00+07:00'), showSeries('b', 'Beta', 1, '2026-11-19T21:00:00+07:00')], '2026-11-18T01:00:00Z');
  const p = page(files, '2026-11-18T10:00:00Z');
  p.strip.start();
  await flush();
  assert.equal(p.body.attrs['data-state'], 'list');
  assert.match(p.body.innerHTML, /Alpha/);
  assert.doesNotMatch(p.body.innerHTML, /Beta/);
  // 23:59 Bangkok: unchanged. 00:00 on 19 Nov Bangkok: yesterday's rows go.
  p.state.now = at('2026-11-18T16:59:00Z');
  p.timers[0]();
  await flush();
  assert.match(p.body.innerHTML, /Alpha/);
  p.state.now = at('2026-11-18T17:00:30Z');
  p.timers[0]();
  assert.doesNotMatch(p.body.innerHTML, /Alpha/, 'yesterday must clear at once, before any reload finishes');
  await flush();
  assert.match(p.body.innerHTML, /Beta/);
  assert.doesNotMatch(p.body.innerHTML, /Alpha/);
  assert.ok(p.state.calls.length >= 4, 'rollover re-reads the data: ' + p.state.calls);
});

test('a tab that wakes up after midnight corrects itself on visibilitychange', async () => {
  const files = stampedFor([showSeries('a', 'Alpha', 3, '2026-11-18T20:30:00+07:00')], '2026-11-18T01:00:00Z');
  const p = page(files, '2026-11-18T10:00:00Z');
  p.strip.start();
  await flush();
  assert.match(p.body.innerHTML, /Alpha/);
  // Hidden tab: timers are throttled and the clock passes midnight meanwhile.
  p.doc.visibilityState = 'hidden';
  p.state.now = at('2026-11-18T18:00:00Z');
  const before = p.state.calls.length;
  p.listeners.visibilitychange();
  await flush();
  assert.equal(p.state.calls.length, before, 'a hidden tab does not fetch');
  p.doc.visibilityState = 'visible';
  p.listeners.visibilitychange();
  assert.match(p.body.innerHTML, /No episodes confirmed for tonight\./);
  await flush();
  assert.ok(p.state.calls.length > before, 'resume re-reads the data');
});

test('resume within the refresh window does not refetch, and a long absence does', async () => {
  const files = stampedFor([showSeries('a', 'Alpha', 3, '2026-11-18T20:30:00+07:00')], '2026-11-18T01:00:00Z');
  const p = page(files, '2026-11-18T10:00:00Z');
  p.strip.start();
  await flush();
  const n = p.state.calls.length;
  p.state.now = at('2026-11-18T10:02:00Z');
  p.listeners.visibilitychange();
  assert.equal(p.state.calls.length, n);
  p.state.now = at('2026-11-18T10:06:00Z');
  p.listeners.visibilitychange();
  await flush();
  assert.equal(p.state.calls.length, n + 2);
});

test('a failed or stale read shows the unavailable state, and checking again recovers', async () => {
  const good = stampedFor([showSeries('a', 'Alpha', 3, '2026-11-18T20:30:00+07:00')], '2026-11-18T01:00:00Z');
  const p = page({}, '2026-11-18T10:00:00Z');
  p.strip.start();
  assert.match(p.body.innerHTML, /Checking tonight’s schedule/);
  await flush();
  assert.equal(p.body.attrs['data-state'], 'unavailable');
  assert.match(p.body.innerHTML, /could not be checked just now/);
  assert.doesNotMatch(p.body.innerHTML, /No episodes confirmed/);
  p.state.files = good;
  p.strip.retry();
  await flush();
  assert.equal(p.body.attrs['data-state'], 'list');
  // A shell whose data file belongs to another build is unavailable, not trusted.
  p.state.files = {'on-tonight.json': good['on-tonight.json'], 'tracker-classic.html': classicHtml};
  p.state.now = at('2026-11-18T10:07:00Z');
  p.listeners.visibilitychange();
  await flush();
  assert.equal(p.body.attrs['data-state'], 'unavailable');
});

test('an unavailable strip retries by itself, no more than once a minute', async () => {
  const p = page({}, '2026-11-18T10:00:00Z');
  p.strip.start();
  await flush();
  const n = p.state.calls.length;
  p.state.now = at('2026-11-18T10:00:30Z');
  p.timers[0]();
  await flush();
  assert.equal(p.state.calls.length, n);
  p.state.now = at('2026-11-18T10:01:05Z');
  p.timers[0]();
  await flush();
  assert.ok(p.state.calls.length > n);
});

test('data that ages past the limit while the tab stays open turns unavailable, not empty', async () => {
  const files = stampedFor([showSeries('a', 'Alpha', 3, '2026-11-18T20:30:00+07:00')], '2026-11-18T01:00:00Z');
  const p = page(files, '2026-11-18T10:00:00Z');
  p.strip.start();
  await flush();
  p.state.files = {};
  p.state.now = at('2026-11-21T10:00:00Z');
  p.timers[0]();
  assert.equal(p.body.attrs['data-state'], 'unavailable');
  await flush();
  assert.equal(p.body.attrs['data-state'], 'unavailable');
});

// ---- Title links ---------------------------------------------------------------
function clickOn(attrs, extra = {}) {
  const link = {getAttribute: name => attrs[name]};
  const event = {target: {closest: selector => /data-card-id/.test(selector) ? link : null}, defaultPrevented: false, button: 0, prevented: false, preventDefault() { this.prevented = true; }, ...extra};
  return event;
}

test('a title link is cancelled only when the card is actually shown', () => {
  const shown = [];
  const loaded = load({showTrackerCard: id => { shown.push(id); return id === 'here'; }});
  const hit = clickOn({'data-card-id': 'here'});
  loaded.followCard(hit);
  assert.equal(hit.prevented, true);
  const miss = clickOn({'data-card-id': 'not-loaded'});
  loaded.followCard(miss);
  assert.equal(miss.prevented, false, 'card catalogue lacks the card: the link must navigate');
  assert.deepEqual(shown, ['here', 'not-loaded']);
  const noHook = clickOn({'data-card-id': 'here'});
  load().followCard(noHook);
  assert.equal(noHook.prevented, false, 'no card catalogue yet: the link must navigate');
  const modified = clickOn({'data-card-id': 'here'}, {ctrlKey: true});
  loaded.followCard(modified);
  assert.equal(modified.prevented, false);
  const throws = load({showTrackerCard: () => { throw new Error('broken'); }});
  const broken = clickOn({'data-card-id': 'here'});
  throws.followCard(broken);
  assert.equal(broken.prevented, false, 'a failing handler must not trap the link');
});

test('title links point at the classic Tracker card, so they work with no card catalogue', () => {
  const tonight = load();
  const html = tonight.listMarkup(plain(tonight.selectTonight([timed('a-b', 'Alpha', 1, '2026-11-18T20:30:00+07:00')], at('2026-11-18T08:00:00Z'))));
  assert.match(html, /<a class="on-tonight-title notranslate" translate="no" href="tracker-classic\.html#card-a-b" data-card-id="a-b">Alpha<\/a>/);
});
