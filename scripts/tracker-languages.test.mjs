import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {languages,planTranslations,translateTexts} from './lib/tracker-i18n.mjs';
import {normalize,protectNames,textNodes} from '../js/tracker-language-core.js';
test('eight languages use the intended Microsoft regional codes',()=>{
 assert.equal(languages.length,8);assert.equal(languages.find(l=>l.code==='pt-BR').api,'pt');assert.equal(languages.find(l=>l.code==='fil').api,'fil');assert.equal(languages.find(l=>l.code==='zh-Hant').api,'zh-Hant');
});
test('cached text is not resent and over-budget preparations fail before network work',()=>{
 const plan=planTranslations([' New show ','New show'],{'th':{'New show':'รายการใหม่'}});
 assert.equal(plan.strings.length,1);assert.equal(plan.pending.find(p=>p.language.code==='th').strings.length,0);
 assert.throws(()=>planTranslations(['long enough'],{},1),/exceeds explicit/);
});
test('Microsoft requests use fixed HTTPS endpoint and keys only in headers; wrong language results fail',async()=>{
 let seen;
 const result=await translateTexts(['Hello'],'th',{key:'test-only',region:'eastus',fetcher:async(url,options)=>{seen={url,options};return {ok:true,json:async()=>[{translations:[{to:'th',text:'สวัสดี'}]}]};}});
 assert.equal(result[0],'สวัสดี');assert.equal(seen.url.hostname,'api.cognitive.microsofttranslator.com');assert.ok(!seen.url.href.includes('test-only'));assert.equal(seen.options.headers['Ocp-Apim-Subscription-Region'],'eastus');
 await assert.rejects(()=>translateTexts(['Hello'],'th',{key:'test-only',region:'eastus',fetcher:async()=>({ok:true,json:async()=>[{translations:[{to:'es',text:'Hola'}]}]})}),/Missing requested/);
});
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
async function fixture(fetcher){
 const dom=new JSDOM('<html><body><div translate="no"><select id="tracker-language"></select><a id="original-english" href="?original=1">English</a><p id="translation-status"></p></div><script type="application/json" id="tracker-protected-names">["Thai GL Weekly","Third Person"]</script><p id="reading">Watch Third Person tonight</p><h4 translate="no">Third Person</h4><div id="dynamic"></div><input value="Private reader note"><select id="viewing"><option value="Watching">Watching</option></select></body></html>',{url:'https://thaiglweekly.com/tracker.html',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.__core={normalize,protectNames,textNodes};dom.window.fetch=fetcher;
 const source=readFileSync(new URL('../js/tracker-languages.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'const {normalize,protectNames,textNodes}=window.__core;\n');
 dom.window.eval(source);await settle();return dom;
}
test('same-origin cache switching preserves names, private inputs, option values and English originals',async()=>{
 const requests=[];const dom=await fixture(async url=>{requests.push(url);return {ok:true,json:async()=>({version:1,provider:'Microsoft Translator',language:'th',translations:{Watch:'ดู',tonight:'คืนนี้',Watching:'กำลังรับชม','New content':'เนื้อหาใหม่'}})};});
 const w=dom.window,select=w.document.getElementById('tracker-language');
 select.value='th';select.dispatchEvent(new w.Event('change'));await settle();
 assert.match(w.document.getElementById('reading').textContent,/ดู/);assert.match(w.document.getElementById('reading').textContent,/Third Person/);
 assert.equal(w.document.querySelector('input').value,'Private reader note');assert.equal(w.document.getElementById('viewing').value,'Watching');assert.equal(w.document.querySelector('#viewing option').textContent,'กำลังรับชม');
 w.document.getElementById('dynamic').textContent='New content';await settle();assert.equal(w.document.getElementById('dynamic').textContent,'เนื้อหาใหม่');
 w.document.getElementById('original-english').click();await settle();assert.equal(w.document.getElementById('reading').textContent,'Watch Third Person tonight');assert.equal(w.document.getElementById('viewing').textContent,'Watching');assert.equal(w.document.documentElement.lang,'en');assert.deepEqual(requests,['assets/translations/th.json']);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
});
test('unavailable language leaves English intact and reports not ready',async()=>{
 const dom=await fixture(async()=>({ok:false}));const w=dom.window,s=w.document.getElementById('tracker-language');s.value='ja';s.dispatchEvent(new w.Event('change'));await settle();assert.equal(w.document.documentElement.lang,'en');assert.equal(s.value,'en');assert.match(w.document.getElementById('translation-status').textContent,/not ready/);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
});
