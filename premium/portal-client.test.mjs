import test from 'node:test';
import assert from 'node:assert/strict';
import { portalClient } from './portal-client.mjs';

test('same-session Clerk notifications preserve reading and calendar; sign-out clears them', async () => {
  const original = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  const elements = new Map();
  const element = () => ({ hidden: false, value: '', textContent: '', children: [],
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; }, querySelectorAll() { return []; } });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  let listener, reads = 0;
  const session = { id: 'session_one', user: { id: 'user_one' }, async getToken() {
    await listener({ session: { ...session } });
    return 'test-session-token';
  } };
  try {
    globalThis.document = { getElementById: get, querySelectorAll: () => [], createElement: element };
    globalThis.window = { location: { href: 'http://127.0.0.1:8791/' }, Clerk: {
      load: async () => {}, addListener(fn) { listener = fn; }, mountUserButton() {},
      unmountUserButton() {}, mountSignIn() {}, unmountSignIn() {},
    } };
    globalThis.fetch = async url => {
      reads++;
      const value = url.endsWith('/api/catalog') ? { series: [] }
        : url.endsWith('/api/calendar') ? { url: 'https://service.example/calendar/' + 'a'.repeat(64) + '.ics' }
        : { follows: [], watched: {}, timezone: 'UTC', version: 1 };
      return { ok: true, json: async () => value };
    };
    await portalClient({ api: 'https://service.example' });
    await listener({ session });
    assert.equal(get('status').textContent, 'Your notebook is ready.');
    const reading = element(); reading.textContent = 'Member reading'; get('edition').append(reading);
    await get('calendar').onclick();
    const link = get('calendar-url').value;
    assert.match(link, /\.ics$/);
    const beforeRefreshReads = reads;
    await listener({ session: { ...session } });
    assert.equal(reads, beforeRefreshReads);
    assert.equal(get('calendar-url').value, link);
    assert.equal(get('edition').children[0], reading);
    assert.equal(get('workspace').hidden, false);
    await listener({ session: null });
    assert.equal(get('calendar-url').value, '');
    assert.equal(get('edition').children.length, 0);
    assert.equal(get('workspace').hidden, true);
  } finally { Object.assign(globalThis, original); }
});

test('changing a delivery timezone clears its confirmation and saves only an explicit choice',async()=>{
  const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};const elements=new Map();
  const element=()=>({hidden:false,value:'',checked:false,children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},querySelectorAll(){return []}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
  let state={follows:[],watched:{},timezone:'UTC',timezoneConfirmed:true,version:1},saved;
  try{
    globalThis.document={getElementById:get,querySelectorAll:()=>[],createElement:element};globalThis.window={};
    globalThis.fetch=async(url,options={})=>{if(options.method==='PUT'){saved=JSON.parse(options.body);state={...saved,version:saved.version+1}}return{ok:true,json:async()=>url.endsWith('/api/catalog')?{series:[]}:structuredClone(state)}};
    await portalClient({api:'https://service.example',demo:true});assert.equal(get('delivery-zone').checked,true);
    get('timezone').value='America/New_York';get('timezone').oninput();assert.equal(get('delivery-zone').checked,false);
    await get('save').onclick();assert.equal(saved.timezoneConfirmed,false);assert.equal(saved.timezone,'America/New_York');
    get('delivery-zone').checked=true;await get('save').onclick();assert.equal(saved.timezoneConfirmed,true);
    await get('reload').onclick();assert.equal(get('delivery-zone').checked,true);
    get('device-zone').onclick();assert.equal(get('delivery-zone').checked,false);
  }finally{Object.assign(globalThis,original)}
});

test('the daily email switch is off by default and saves only what the member ticked',async()=>{
  const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};const elements=new Map();
  const element=()=>({hidden:false,value:'',checked:false,children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},querySelectorAll(){return []}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
  let state={follows:[],watched:{},timezone:'UTC',timezoneConfirmed:true,version:1},saved;
  try{
    globalThis.document={getElementById:get,querySelectorAll:()=>[],createElement:element};globalThis.window={};
    globalThis.fetch=async(url,options={})=>{if(options.method==='PUT'){saved=JSON.parse(options.body);state={...saved,version:saved.version+1}}return{ok:true,json:async()=>url.endsWith('/api/catalog')?{series:[]}:structuredClone(state)}};
    await portalClient({api:'https://service.example',demo:true});assert.equal(get('daily-email').checked,false,'a record with no choice shows the switch off');
    await get('save').onclick();assert.equal(saved.dailyEmailConsent,false);
    get('daily-email').checked=true;await get('save').onclick();assert.equal(saved.dailyEmailConsent,true);
    await get('reload').onclick();assert.equal(get('daily-email').checked,true);
    get('daily-email').checked=false;await get('save').onclick();assert.equal(saved.dailyEmailConsent,false,'unticking and saving is the opt-out');
  }finally{Object.assign(globalThis,original)}
});

test('the week list keeps a date-only episode for its whole Bangkok day and never gives it a time',async()=>{
  const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch,now:Date.now};const elements=new Map();
  const element=()=>({hidden:false,value:'',checked:false,textContent:'',children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},querySelectorAll(){return []}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
  const ep=(number,airs_at,extra={})=>({number,airs_at,...extra});
  const pending={time_unverified:true};
  const catalog={series:[
    {id:'a',title:'Timed ahead',episodes:[ep(2,'2026-12-02T22:30:00+07:00')]},
    {id:'b',title:'Timed earlier today',episodes:[ep(4,'2026-12-02T20:30:00+07:00')]},
    {id:'c',title:'Pending today',episodes:[ep(1,'2026-12-02T20:30:00+07:00',pending)]},
    {id:'d',title:'Pending yesterday',episodes:[ep(1,'2026-12-01T20:30:00+07:00',pending)]},
    {id:'e',title:'Pending last day',episodes:[ep(1,'2026-12-08T20:30:00+07:00',pending)]},
    {id:'f',title:'Pending eighth day',episodes:[ep(1,'2026-12-09T20:30:00+07:00',pending)]},
    {id:'g',title:'Timed at the far edge',episodes:[ep(3,'2026-12-09T20:59:00+07:00'),ep(4,'2026-12-09T21:00:00+07:00')]},
    {id:'h',title:'Unusable',episodes:[ep(1,'soon'),{number:'x',airs_at:'2026-12-03T20:30:00+07:00'}]},
  ]};
  try{
    // 21:00 in Bangkok on Wednesday 2 December 2026: half an hour after the placeholder time.
    Date.now=()=>Date.parse('2026-12-02T21:00:00+07:00');
    globalThis.document={getElementById:get,querySelectorAll:()=>[],createElement:()=>({...element(),setAttribute(){}}),createTextNode:value=>({textContent:value})};globalThis.window={};
    globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/api/catalog')?catalog:{follows:[],watched:{},timezone:'America/New_York',timezoneConfirmed:true,version:1}});
    await portalClient({api:'https://service.example',demo:true});
    const rows=get('week').children.map(row=>row.children.map(cell=>cell.textContent));
    assert.deepEqual(rows,[
      ['Timed ahead, episode 2','Wednesday, 10:30 AM EST'],
      ['Pending today, episode 1','Wednesday 2 December in Bangkok · time pending'],
      ['Pending last day, episode 1','Tuesday 8 December in Bangkok · time pending'],
      ['Timed at the far edge, episode 3','Wednesday, 8:59 AM EST'],
    ]);
    assert.ok(rows.every(([,when])=>!/pending/.test(when)||!/\d:\d\d/.test(when)),'a pending row never shows a clock time');
    // One minute before Bangkok midnight the same date-only row is still listed; a minute after, it is gone.
    Date.now=()=>Date.parse('2026-12-02T23:59:00+07:00');await get('reload').onclick();
    assert.ok(get('week').children.some(row=>row.children[0].textContent==='Pending today, episode 1'));
    Date.now=()=>Date.parse('2026-12-03T00:01:00+07:00');await get('reload').onclick();
    assert.ok(!get('week').children.some(row=>row.children[0].textContent==='Pending today, episode 1'));
    assert.ok(get('week').children.some(row=>row.children[0].textContent==='Pending eighth day, episode 1'),'the window moves on by Bangkok date');
  }finally{Date.now=original.now;globalThis.document=original.document;globalThis.window=original.window;globalThis.fetch=original.fetch}
});
