import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {trackerExtrasData} from '../../scripts/tracker-extras-data.mjs';

const script = readFileSync(new URL('../../js/tracker-extras.js', import.meta.url), 'utf8');
const expiry = '2026-11-09T20:00:00+07:00';
const entry = {id:'khom-khlang', episode:10, checked:'2026-11-06', standardAt:expiry,
  verified:true, access:'paid', label:'WeTV Express', url:'https://wetv.vip/en/play/l8u24vqut3sseql'};

function reader(storage = new Map(), metadata = [entry], now = '2026-11-06T13:00:00Z') {
  const clock = {now:Date.parse(now)};
  const timers = [], badges = [];
  const intro = {textContent:''};
  class TestDate extends Date {static now() {return clock.now;}}
  const context = vm.createContext({Date:TestDate, Intl, URL, console,
    localStorage:{getItem:key=>storage.get(key) ?? null, setItem:(key,value)=>storage.set(key,value)},
    setTimeout:fn=>timers.push(fn), tgwEarlyAccess:metadata,
    document:{getElementById:()=>({querySelector:()=>intro}), querySelectorAll:()=>badges},
    myTrackerStatuses:['Want to watch','Watching','Finished'],
    CATALOG_SERIES:[{id:'demo', allowedEpisodes:[1,2,3]}],
    watchedEpisodes:()=>[], adjustWatched(){}, loadWatchedProgress(){}, renderCatalogShelves(){}, showToast(){},
    savedTrackerShows:()=>JSON.parse(storage.get('tgw-my-tracker') || '{}'),
    changeMyTrackerStatus(id,value) {
      const saved=JSON.parse(storage.get('tgw-my-tracker') || '{}');
      saved[id]=value;storage.set('tgw-my-tracker',JSON.stringify(saved));
    },
    renderMyTracker(){intro.textContent='Browser-local list.';},
    buildSeriesCardHTML:()=>'<article>Watched:</article>'
  });
  context.window=context;
  vm.runInContext(script,context);
  return {context,storage,clock,timers,badges};
}

test('rewatching preserves original history through progress changes, status changes and reload',()=>{
  const storage=new Map([['glw_demo','[1,2,3]'],['tgw-my-tracker','{"demo":"Finished"}']]);
  let {context:c}=reader(storage);
  assert.deepEqual(Array.from(c.watchedEpisodes('demo')),[1,2,3]);
  c.changeMyTrackerStatus('demo','Rewatching');
  assert.equal(c.watchedEpisodes('demo').length,0);
  c.adjustWatched('demo',1);
  assert.equal(storage.get('glw_demo'),'[1,2,3]');
  assert.equal(storage.get('glw_rewatch_demo'),'[1]');
  assert.match(c.buildSeriesCardHTML({id:'demo'}),/Rewatched:/);
  c.changeMyTrackerStatus('demo','Finished');
  assert.deepEqual(Array.from(c.watchedEpisodes('demo')),[1,2,3]);
  c.changeMyTrackerStatus('demo','Rewatching');
  ({context:c}=reader(storage));
  assert.deepEqual(Array.from(c.watchedEpisodes('demo')),[1]);
  c.adjustWatched('demo',-1);
  assert.equal(storage.get('glw_rewatch_demo'),'[]');
  assert.equal(storage.get('glw_demo'),'[1,2,3]');
});

test('rewatch progress cannot add episodes outside the reviewed allowed list',()=>{
  const storage=new Map([['glw_demo','[1,2]'],['glw_rewatch_demo','[1,2,3]'],['tgw-my-tracker','{"demo":"Rewatching"}']]);
  const {context:c}=reader(storage);
  c.adjustWatched('demo',1);
  assert.equal(storage.get('glw_rewatch_demo'),'[1,2,3]');
  assert.equal(storage.get('glw_demo'),'[1,2]');
});

test('malformed rewatch storage does not corrupt original progress',()=>{
  const storage=new Map([['glw_demo','[1,2]'],['glw_rewatch_demo','{}'],['tgw-my-tracker','{"demo":"Rewatching"}']]);
  const {context:c}=reader(storage);
  assert.equal(c.watchedEpisodes('demo').length,0);
  c.adjustWatched('demo',1);
  assert.equal(storage.get('glw_rewatch_demo'),'[1]');
  assert.equal(storage.get('glw_demo'),'[1,2]');
});

test('early access is sourced, separate from standard release, and expires at that clock',()=>{
  const {context:c}=reader();
  const html=c.buildSeriesCardHTML({id:'khom-khlang'});
  assert.match(html,/Paid early access/);
  assert.match(html,/EP 10 listed as WeTV Express/);
  assert.match(html,/Standard release: 9 Nov/);
  assert.match(html,/Official listing/);
  assert.doesNotMatch(c.buildSeriesCardHTML({id:'love-bound'}),/Paid early access/);
  const expired=reader(new Map(),[entry],expiry).context;
  assert.doesNotMatch(expired.buildSeriesCardHTML({id:'khom-khlang'}),/Paid early access/);
});

test('unverified, incomplete and unsafe early-access records produce no badge',()=>{
  for(const changed of [{verified:false},{standardAt:'unknown'},{checked:''},{url:'javascript:alert(1)'},{episode:0},{access:'unknown'}]){
    const c=reader(new Map(),[{...entry,...changed}]).context;
    assert.doesNotMatch(c.buildSeriesCardHTML({id:'khom-khlang'}),/Paid early access/);
  }
  const c=reader(new Map(),[{...entry,label:'<b>WeTV</b>'}]).context;
  assert.match(c.buildSeriesCardHTML({id:'khom-khlang'}),/&lt;b&gt;WeTV&lt;\/b&gt;/);
});

test('a badge expires on an already open page',()=>{
  const {clock,timers,badges}=reader();
  const badge={dataset:{expires:expiry},removed:false,remove(){this.removed=true;}};
  badges.push(badge);clock.now=Date.parse(expiry)+1;timers.forEach(fn=>fn());
  assert.equal(badge.removed,true);
});

test('both layouts derive the standard release from the catalog without modifying it',()=>{
  const catalog={series:[{id:'khom-khlang',early_access:{...entry,standardAt:'wrong'},episodes:[{number:10,airs_at:expiry}]}]};
  const before=JSON.stringify(catalog),html=trackerExtrasData(catalog);
  assert.equal(JSON.stringify(catalog),before);
  assert.match(html,/2026-11-09T20:00:00\+07:00/);
  assert.doesNotMatch(html,/"standardAt":"wrong"/);
});
