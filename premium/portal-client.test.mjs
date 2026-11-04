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
