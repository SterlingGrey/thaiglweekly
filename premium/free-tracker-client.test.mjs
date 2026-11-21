import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/free-tracker-access.js',import.meta.url),'utf8');
async function harness({signedIn=true,member=false,path="/tracker.html",fragment="#subscriber-access",ledger=false}={}){
 const elements=Object.fromEntries(['access-status','subscriber-signin','subscriber-recheck','access-identity','newsletter-step','subscriber-switch'].map(id=>[id,{hidden:['subscriber-recheck','newsletter-step','subscriber-switch'].includes(id),disabled:false,textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}}]));
 if(ledger)elements['ledger-chapter']={hidden:true,children:[],append(child){this.children.push(child);}};
 const store=new Map([[ledger?'thaigl-ledger-return':'thaigl-subscriber-return','1'],['my-watchlist','keep this list']]);let listener,modal=0,writes=[],reloads=0,calls=0,modalOptions;
 const requested=[];
 const c={session:signedIn?{id:'session_initial',getToken:async()=> 'verified'}:null,user:{primaryEmailAddress:{emailAddress:'reader@example.com'}},load:async()=>{},addListener(fn){listener=fn;},openSignIn(options){modal++;modalOptions=options;},signOut:async()=>{c.session=null;}};
 const window={Clerk:c};const ctx={window,Response,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},location:{pathname:path,href:'https://thaiglweekly.com'+path+fragment,reload:()=>reloads++},document:{getElementById:id=>elements[id],createElement:()=>({setAttribute(){}}),head:{append:s=>queueMicrotask(()=>s.onload())},open(){},write:h=>writes.push(h),close(){}},fetch:async url=>{calls++;requested.push(new URL(url).searchParams.get("layout"));return member?new Response(ledger?"First paragraph\n\n* * *\n\nSecond paragraph":'<h1>Protected Tracker</h1>',{status:200}):new Response('Join the free Monday newsletter, confirm your email, then check access again.',{status:403});}};
 await vm.runInNewContext(source,ctx);
 return{elements,c,store,writes,requested,get modal(){return modal;},get modalOptions(){return modalOptions;},get calls(){return calls;},get reloads(){return reloads;},setMember:v=>member=v,emit:s=>listener?.({session:s})};
}
test('verified address without membership gets signup recovery, not another code loop',async()=>{const h=await harness();assert.match(h.elements['access-identity'].textContent,/reader@example.com/);assert.match(h.elements['access-status'].textContent,/active, confirmed newsletter/);assert.equal(h.elements['newsletter-step'].hidden,false);assert.equal(h.elements['subscriber-signin'].hidden,true);assert.equal(h.elements['subscriber-switch'].hidden,false);assert.match(h.elements['subscriber-recheck'].textContent,/confirmed the newsletter/);assert.equal(h.modal,0);assert.equal(h.writes.length,0);});
test('confirmation retry reuses verified identity and opens only after server admission',async()=>{const h=await harness();h.setMember(true);await h.elements['subscriber-recheck'].handlers.click();assert.deepEqual(h.writes,['<h1>Protected Tracker</h1>']);assert.equal(h.modal,0);assert.equal(h.store.get('my-watchlist'),'keep this list');});
test('switching the wrong address signs out without deleting saved lists',async()=>{const h=await harness();await h.elements['subscriber-switch'].handlers.click();assert.equal(h.c.session,null);assert.equal(h.store.has('thaigl-subscriber-return'),false);assert.equal(h.store.get('my-watchlist'),'keep this list');assert.equal(h.reloads,1);});
test('completed sign-in proceeds automatically instead of waiting for another click',async()=>{const h=await harness({signedIn:false,member:true});assert.equal(h.modal,1);h.c.session={id:'session_new',getToken:async()=> 'verified'};h.emit(h.c.session);for(let n=0;n<4;n++)await new Promise(r=>setImmediate(r));assert.equal(h.writes.length,1);assert.equal(h.calls,2);});

test("mobile code return targets a real static gate without an encoded fragment",async()=>{for(const path of ["/tracker.html","/tracker-classic.html"]){const h=await harness({signedIn:false,path,fragment:"#subscriber-access"});for(const key of ["forceRedirectUrl","signUpForceRedirectUrl"]){assert.equal(h.modalOptions[key],"https://thaiglweekly.com"+path);assert(!h.modalOptions[key].includes("#"));assert(!h.modalOptions[key].includes("%23"));}assert.equal(h.store.get("my-watchlist"),"keep this list");}});

test("Ledger Chapter One stays hidden until confirmation and renders its scene breaks",async()=>{
 const path="/originals/the-ledger-and-the-rose-ch1.html";
 const signedOut=await harness({ledger:true,path,signedIn:false});
 assert.equal(signedOut.modalOptions.forceRedirectUrl,"https://thaiglweekly.com"+path);
 assert.equal(signedOut.calls,0);
 const reader=await harness({ledger:true,path});
 const chapter=reader.elements["ledger-chapter"];
 assert.equal(chapter.hidden,true);
 assert.equal(chapter.children.length,0);
 assert.equal(reader.elements["newsletter-step"].hidden,false);
 reader.setMember(true);
 await reader.elements["subscriber-recheck"].handlers.click();
 assert.deepEqual(reader.requested,["ledger-ch1","ledger-ch1"]);
 assert.equal(chapter.hidden,false);
 assert.deepEqual(chapter.children.map(block=>block.textContent),["First paragraph","* * *","Second paragraph"]);
 assert.equal(chapter.children[1].className,"scene-break");
});
