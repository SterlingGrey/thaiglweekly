// Scout (Codex), 6 Nov 2026. Emit only the reader-facing fields used by this tool.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=path.resolve(root,process.env.SITE_OUT||'site');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/series.json'))),profiles=JSON.parse(fs.readFileSync(path.join(root,'data/next-watch-profiles.json')));
for(const id of Object.keys(profiles.profiles))if(!catalog.series.some(s=>s.id===id))throw Error('Unknown match profile '+id);
const keys=['id','title','status','logline','tags','studio','pairing','pairing_actors','platforms','sources','category'];
const data={generated_at:catalog.generated_at,verified_at:catalog.verified_at,profile_reviewed_at:profiles.profile_reviewed_at,series:catalog.series.map(s=>({...Object.fromEntries(keys.filter(k=>k in s).map(k=>[k,s[k]])),matchProfile:profiles.profiles[s.id]}))};
fs.mkdirSync(path.join(out,'js'),{recursive:true});fs.mkdirSync(path.join(out,'css'),{recursive:true});fs.writeFileSync(path.join(out,'js/next-watch-catalog.js'),'globalThis.NEXT_WATCH_CATALOG='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n');
for(const f of ['next-watch.html','next-watch-join.html','js/next-watch-engine.js','js/next-watch-ui.js','js/next-watch-join.js','css/next-watch.css'])if(path.resolve(root,f)!==path.resolve(out,f))fs.copyFileSync(path.join(root,f),path.join(out,f));
console.log('Next-watch: '+data.series.length+' titles; '+Object.keys(profiles.profiles).length+' explicit profiles.');
