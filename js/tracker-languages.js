import {normalize,protectNames,textNodes} from './tracker-language-core.js';
/* Same-origin cached translations. This browser never calls Microsoft or receives its key. */
(() => {
 const select=document.getElementById('tracker-language');
 const status=document.getElementById('translation-status');
 if(!select||!status)return;
 const languages=[['en','English'],['pt-BR','Português (Brasil)'],['fil','Filipino'],['ja','日本語'],['ko','한국어'],['th','ไทย'],['zh-Hant','繁體中文'],['es','Español']];
 select.replaceChildren(...languages.map(([code,name])=>{const option=document.createElement('option');option.value=code;option.textContent=name;return option;}));
 const names=JSON.parse(document.getElementById('tracker-protected-names')?.textContent||'[]');
 const originals=new WeakMap(),attributes=new WeakMap();
 let dictionary={},active='en',request=0,scheduled=false,frame=null;
 const excluded='script,style,noscript,[translate="no"],.notranslate,form,input,textarea';
 function translated(source){const value=dictionary[normalize(source)];return typeof value==='string'&&value?value:source;}
 function apply(){
  observer.disconnect();
  protectNames(document,names);
  for(const node of textNodes(document)){
   if(!originals.has(node))originals.set(node,node.textContent);
   const source=originals.get(node),value=active==='en'?source:translated(source);
   if(node.textContent!==value)node.textContent=value;
  }
  document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(element=>{
   if(element.closest('[translate="no"],.notranslate')||element.matches('input,textarea'))return;
   let saved=attributes.get(element);if(!saved){saved={};attributes.set(element,saved);}
   for(const attr of ['aria-label','title','placeholder']){
    if(!element.hasAttribute(attr))continue;
    if(!(attr in saved))saved[attr]=element.getAttribute(attr);
    const value=active==='en'?saved[attr]:translated(saved[attr]);
    if(element.getAttribute(attr)!==value)element.setAttribute(attr,value);
   }
  });
  document.documentElement.lang=active;
  observe();
 }
 function schedule(){if(scheduled)return;scheduled=true;frame=requestAnimationFrame(()=>{frame=null;scheduled=false;apply();});}
 const observer=new MutationObserver(schedule);
 function observe(){observer.observe(document.body,{childList:true,characterData:true,subtree:true});}
 async function choose(code){
  const ticket=++request;select.disabled=true;
  try{
   if(!languages.some(([id])=>id===code))throw new Error('Unsupported language');
   let next={};
   if(code!=='en'){
    status.textContent='Loading saved translations…';
    const response=await fetch('assets/translations/'+encodeURIComponent(code)+'.json',{credentials:'omit'});
    if(!response.ok)throw new Error('Translation file unavailable');
    const data=await response.json();
    if(data.version!==1||data.language!==code||data.provider!=='Microsoft Translator'||!data.translations||Object.values(data.translations).some(v=>typeof v!=='string'))throw new Error('Invalid translation file');
    next=data.translations;
   }
   if(ticket!==request)return;
   dictionary=next;active=code;select.value=code;
   apply();
   try{localStorage.setItem('tgw-reading-language',code);}catch{}
   status.textContent=code==='en'?'Original English selected.':'Automatic translation. Names, viewing availability and newsletter language do not change. New or untranslated text remains in English.';
  }catch{
   if(ticket!==request)return;
   select.value=active;
   status.textContent='This language is not ready. Your current language is unchanged; English is always available.';
  }finally{if(ticket===request)select.disabled=false;}
 }
 select.addEventListener('change',()=>choose(select.value));
 document.getElementById('original-english')?.addEventListener('click',event=>{event.preventDefault();choose('en');});
 window.tgwCachedTranslation={refresh:schedule};
 window.addEventListener('pagehide',()=>{observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);frame=null;scheduled=false;});
 window.addEventListener('pageshow',schedule);
 observe();
 let saved='en';try{saved=localStorage.getItem('tgw-reading-language')||'en';}catch{}
 choose(new URLSearchParams(location.search).has('original')?'en':saved);
})();
