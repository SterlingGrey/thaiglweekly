// Offline by default. --translate sends only generated public-site strings to Microsoft.
import {JSDOM} from 'jsdom';
import {protectNames,textNodes} from '../js/tracker-language-core.js';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {languages,normalize,planTranslations,translateTexts} from './lib/tracker-i18n.mjs';
const root=process.cwd(),out=join(root,process.env.SITE_OUT||'site');
const html=readFileSync(join(out,'tracker.html'),'utf8');
const classic=readFileSync(join(out,'tracker-classic.html'),'utf8');
const dom=new JSDOM(html,{url:'https://thaiglweekly.com/tracker.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
await new Promise(resolve=>w.document.readyState==='complete'?resolve():w.addEventListener('load',resolve,{once:true}));
w.fetch=async url=>{if(String(url)!=='./tracker-classic.html')throw new Error('Unexpected extraction request');return {ok:true,text:async()=>classic};};
w.HTMLElement.prototype.scrollIntoView=function(){};
const app=[...w.document.querySelectorAll('script:not([src])')].find(s=>s.textContent.includes('async function syncFromLiveTrackerHTML'));
if(!app)throw new Error('Tracker application script missing');
w.eval(app.textContent);await w.onload();
const strings=new Set();
function collect(){
 protectNames(w.document,JSON.parse(w.document.getElementById('tracker-protected-names').textContent));
 for(const node of textNodes(w.document)){
  const value=normalize(node.textContent);
  if(value&&/[A-Za-z]/.test(value)&&!/^https?:/.test(value))strings.add(value);
 }
 // Attribute strings never include reader-entered input or a personal list name.
 w.document.querySelectorAll('[aria-label],[title]').forEach(el=>{
  if(el.closest('[translate="no"],.notranslate,form,input,textarea'))return;
  for(const attr of ['aria-label','title'])if(el.hasAttribute(attr))strings.add(normalize(el.getAttribute(attr)));
 });
}
w.eval("setShelfViewMode('ALL')");collect();
w.document.getElementById('global-search').value='__no_matching_series__';w.eval('handleFilterChange()');collect();
w.eval('resetAllFilters()');
// Exercise one synthetic saved show to capture control labels, never reader data.
w.saveMyTracker(w.document.querySelector('#catalog-shelves-container article').id.slice(5));collect();
const dir=join(root,'assets/translations');mkdirSync(dir,{recursive:true});
const cache={};
for(const l of languages.filter(l=>l.code!=='en')){
 const path=join(dir,l.code+'.json');cache[l.code]=existsSync(path)?JSON.parse(readFileSync(path,'utf8')).translations:{};
}
const plan=planTranslations([...strings],cache,Number(process.env.TRANSLATOR_RUN_CHARACTER_LIMIT||600000));
const report={sourceHash:plan.sourceHash,sourceStrings:plan.strings.length,charactersToTranslate:plan.characters,languages:languages.map(l=>l.code),status:'prepared_not_translated'};
const privateDir=join(root,'review-output');mkdirSync(privateDir,{recursive:true});
writeFileSync(join(privateDir,'tracker-language-source.json'),JSON.stringify({report,strings:plan.strings},null,2)+'\n');
console.log(JSON.stringify(report));
if(process.argv.includes('--translate')){
 if(process.env.AZURE_TRANSLATOR_TIER!=='F0')throw new Error('Explicit AZURE_TRANSLATOR_TIER=F0 confirmation required');
 const key=process.env.AZURE_TRANSLATOR_KEY,region=process.env.AZURE_TRANSLATOR_REGION;
 if(!key||!region)throw new Error('Missing private AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION');
 for(const item of plan.pending){
  const checkpoint=join(privateDir,'tracker-language-'+item.language.code+'.json');
  const partial=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{};
  const dictionary={...cache[item.language.code],...partial};
  item.strings=item.strings.filter(s=>!dictionary[s]);
  for(let i=0;i<item.strings.length;i+=40){
   const batch=item.strings.slice(i,i+40);
   // Reserve attempted characters conservatively, including timed-out calls.
   const usagePath=join(privateDir,'tracker-language-usage.json');
   const month=new Date().toISOString().slice(0,7);
   const previous=existsSync(usagePath)?JSON.parse(readFileSync(usagePath,'utf8')):{};
   const usage=previous.month===month?previous:{month,attemptedCharacters:0};
   const characters=batch.reduce((n,s)=>n+[...s].length,0);
   if(usage.attemptedCharacters+characters>1500000)throw new Error('Local monthly preparation budget exhausted; no automatic tier upgrade');
   usage.attemptedCharacters+=characters;
   writeFileSync(usagePath,JSON.stringify(usage,null,2)+'\n',{mode:0o600});
   const translated=await translateTexts(batch,item.language.api,{key,region});
   batch.forEach((s,j)=>dictionary[s]=translated[j]);
   writeFileSync(checkpoint,JSON.stringify(dictionary,null,2)+'\n',{mode:0o600});
  }
  writeFileSync(join(dir,item.language.code+'.json'),JSON.stringify({version:1,provider:'Microsoft Translator',language:item.language.code,sourceHash:plan.sourceHash,translations:Object.fromEntries(plan.strings.map(s=>[s,dictionary[s]]))},null,2)+'\n');
 }
 writeFileSync(join(dir,'manifest.json'),JSON.stringify({version:1,provider:'Microsoft Translator',sourceHash:plan.sourceHash,languages},null,2)+'\n');
 console.log('Translation assets prepared; human/browser acceptance and publication are separate.');
}
w.close();
