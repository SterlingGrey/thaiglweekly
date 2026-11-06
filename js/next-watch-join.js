/* Preserve only validated, non-personal shortlist preferences. Never redirect to a supplied URL. */
'use strict';
(()=>{const raw=new URLSearchParams(location.hash.slice(1)),safe=new URLSearchParams();
const id=raw.get('show');if(id&&/^[a-z0-9-]{1,80}$/.test(id))safe.set('show',id);
const country=raw.get('country');if(['US','UK','BR','PH','TH','OTHER'].includes(country))safe.set('country',country);
for(const k of ['story','verified','links'])if(['0','1'].includes(raw.get(k)))safe.set(k,raw.get(k));
for(const k of ['themes','mood','setting','studio','cast']){if(raw.has(k)){const n=Number(raw.get(k));if(Number.isFinite(n)&&n>=0&&n<=100)safe.set(k,String(n));}}
document.getElementById('return').href='next-watch.html'+(safe.size?'#'+safe:'');
})();
