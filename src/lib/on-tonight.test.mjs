import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {onTonightRows, onTonightData} from '../../scripts/on-tonight-data.mjs';

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

const timed = (id, title, number, instant, extra = {}) => ({id, title, number, total: 10, date: instant.slice(0, 10), instant, platform: null, ...extra});
const dateOnly = (id, title, number, date, extra = {}) => ({id, title, number, total: 8, date, instant: null, platform: null, ...extra});

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
      {id:'a', title:'Alpha', number:5, total:10, date:'2026-11-17', instant:'2026-11-17T13:30:00.000Z', platform:null},
      {id:'b', title:'Beta', number:1, total:8, date:'2026-11-17', instant:null, platform:null}
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
  assert.match(tonight.listMarkup([]), /Nothing confirmed for tonight yet\./);
  const body = {innerHTML: ''};
  assert.equal(tonight.mount({getElementById: id => id === 'on-tonight-body' ? body : null}, [], at('2026-11-16T09:00:00Z')), true);
  assert.match(body.innerHTML, /Nothing confirmed for tonight yet\./);
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
  assert.match(html, /href="#card-built-in-love"[^>]*>Built &lt;in&gt; Love<\/a>/);
  assert.match(html, /Episode 5 of 10/);
  assert.match(html, />8:30 PM</);
  assert.match(html, /<a href="https:\/\/www\.gmm-tv\.com\/contents\/Vxp3G\/" target="_blank" rel="noopener noreferrer">GMM25<\/a>/);
  assert.match(html, /Episode 2<\/span>/);
  assert.doesNotMatch(html, /Episode 2 of/);
  assert.match(html, /<span class="on-tonight-platform">YouTube<\/span>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal((html.match(/Time pending/g) || []).length, 2);
});

test('the browser script reads no network or premium source and names the Bangkok zone', () => {
  assert.match(script, /Asia\/Bangkok/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|premium|localStorage|sendBeacon/);
});

const catalogue = {series: [
  {id: 'timed', title: 'Timed Show', total_episodes: 10, platforms: [{name: 'iQIYI', url: 'https://www.iq.com/x'}, {name: 'GMM25'}],
    episodes: [{number: 1, airs_at: '2026-11-01T20:30:00+07:00'}, {number: 2, airs_at: '2026-11-16T20:30:00+07:00'}]},
  {id: 'pending', title: 'Pending Show', total_episodes: 8, platforms: [{name: 'YouTube'}],
    episodes: [{number: 1, airs_at: '2026-11-16T20:30:00+07:00', time_unverified: true}]},
  {id: 'bare', title: 'Bare </script> Show', platforms: [],
    episodes: [{number: 1, airs_at: 'not a date'}, {number: 2, airs_at: '2026-11-17T20:30:00+07:00'}]}
]};

test('build rows keep catalogue facts only: no clock time for date-only, first platform, old episodes dropped', () => {
  const rows = onTonightRows(catalogue, '2026-11-16T10:00:00Z');
  assert.deepEqual(rows.map(r => `${r.id}#${r.number}`), ['timed#2', 'pending#1', 'bare#2']);
  assert.deepEqual(rows[0], {id: 'timed', title: 'Timed Show', number: 2, total: 10, date: '2026-11-16',
    instant: '2026-11-16T13:30:00.000Z', platform: {name: 'iQIYI', url: 'https://www.iq.com/x'}});
  assert.equal(rows[1].instant, null);
  assert.deepEqual(rows[1].platform, {name: 'YouTube', url: null});
  assert.equal(rows[2].platform, null);
  assert.equal(rows[2].total, null);
});

test('inline data is a script that cannot be closed early, and the page logic reads it end to end', () => {
  const tag = onTonightData(catalogue, '2026-11-16T10:00:00Z');
  assert.doesNotMatch(tag.slice('<script>'.length, -'</script>'.length), /<\//);
  const data = JSON.parse(tag.slice('<script>window.tgwOnTonightData='.length, -';</script>'.length));
  const tonight = load();
  const found = plain(tonight.selectTonight(data, at('2026-11-16T09:00:00Z')));
  assert.deepEqual(found.map(r => `${r.title}|${r.time}`), ['Timed Show|8:30 PM', 'Pending Show|Time pending']);
});

test('the real catalogue builds valid rows', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/series.json', import.meta.url), 'utf8'));
  const rows = onTonightRows(real, '2026-11-16T10:00:00Z');
  for (const row of rows) {
    assert.ok(row.id && row.title && Number.isInteger(row.number), JSON.stringify(row));
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.instant === null || Number.isFinite(Date.parse(row.instant)));
    assert.ok(row.platform === null || (row.platform.name && (row.platform.url === null || row.platform.url.startsWith('https://'))));
  }
});
