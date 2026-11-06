/* Scout (Codex), 6 Nov 2026. Explainable, browser-only matching. */
(function(root){
'use strict';
const defaults={themes:55,mood:15,setting:20,studio:5,cast:5};
const labels={'second-chance':'second chances','secrets':'secrets','hidden-identity':'hidden identities','first-love':'first love','childhood-friends':'childhood friendship','family-pressure':'family pressure','class-difference':'class differences','rivals-to-lovers':'rivals becoming lovers','age-gap':'an age-gap relationship','amnesia':'memory loss','time-travel':'time travel','arranged-marriage':'an arranged marriage','love-triangle':'a love triangle','bodyguard':'a bodyguard relationship','school':'school or campus life','workplace':'working life','medical':'a medical setting','historical':'a historical setting','crime':'a crime investigation','supernatural':'supernatural elements','comedy':'comedy','feel-good':'a feel-good mood','drama':'romantic drama'};
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const intersect=(a,b)=>[...new Set(a)].filter(x=>new Set(b).has(x));
const safeUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:''}catch{return ''}};
const rules={themes:{'second-chance':/\b(second chance|ex lovers|ex girlfriend|reunite|reunion)\b/i,'class-difference':/\b(class prejudice|class differences?|separated by class)\b/i,'family-pressure':/\b(family pressure|family expectations)\b/i,'age-gap':/\bage gap\b/i,'amnesia':/\b(amnesia|memory loss)\b/i,'time-travel':/\btime travel\b/i,'arranged-marriage':/\barranged marriage\b/i,'love-triangle':/\b(love triangle|romantic triangle)\b/i,'bodyguard':/\bbodyguard\b/i,'rivals-to-lovers':/\b(rival architects|enemies to lovers|rivals to lovers)\b/i,'hidden-identity':/\b(hidden identity|identity swap)\b/i},settings:{school:/\b(school|campus|university|college|student)\b/i,workplace:/\b(workplace|office|boss|assistant|architects?|accountant)\b/i,medical:/\b(doctor|hospital|medical|nurse|cardiologist)\b/i,historical:/\b(historical|nineteenth century|period drama)\b/i,crime:/\b(crime|detective|police thriller|investigation)\b/i,supernatural:/\b(ghost|supernatural|vampire|fantasy romance)\b/i},moods:{comedy:/\b(comedy|rom com)\b/i,'feel-good':/\bfeel good\b/i,drama:/\b(melodrama|romantic drama)\b/i}};
function profile(s){
 const reviewed=s.matchProfile;if(reviewed)return {...reviewed,basis:reviewed.reviewBasis==='existing-catalogue'?'catalogue':'reviewed'};
 const text=[s.logline,...(s.tags||[])].join(' ').replace(/[-–]/g,' '),p={summary:s.logline||'',basis:'keywords',evidence:(s.sources||[]).filter(x=>safeUrl(x.url))};
 for(const type of ['themes','settings','moods'])p[type]=Object.entries(rules[type]).filter(([,rx])=>rx.test(text)).map(([k])=>k);
 return p;
}
function release(s,now=Date.now()){
 if(/cancel|shelv|withdraw/i.test(s.status||''))return false;
 if(['library','wrapped','aired','completed'].includes(s.status))return true;
 const e=s.matchProfile?.releaseEvidence;
 // Projected dates and an old announcement never prove an episode is available.
 return !!(e&&e.state==='released-episodes'&&safeUrl(e.url)&&Number.isFinite(Date.parse(e.checked))&&Date.parse(e.checked)<=now);
}
function cast(s){return(s.pairing_actors||'').split(/\s*(?:&|,|;|·|\bwith\b|\band\b)\s*/i).map(norm).filter(x=>x.split(' ').length>=2&&!/supporting|couples| as /.test(x));}
function studio(s){return norm(s.studio).replace(/\s+/g,'').replace(/entertainment$/,'');}
function distribution(s,country,now=Date.now()){
 const rows=(s.platforms||[]).flatMap(p=>(p.availability||[]).filter(a=>a.country===country).map(a=>({...a,platform:p.name})));
 const available=rows.filter(a=>a.status==='available'&&safeUrl(a.source)&&Number.isFinite(Date.parse(a.checked))&&now-Date.parse(a.checked)<=30*86400000&&Date.parse(a.checked)<=now);
 return {recorded:available.length>0,evidence:rows,text:available.length?'Recent distribution record for your country. Playback, subtitles and price may vary.':'Country playback, subtitles and price have not been verified.'};
}
function routes(s){const out=[];if(s.matchProfile?.route&&safeUrl(s.matchProfile.route.url))out.push(s.matchProfile.route);for(const p of s.platforms||[])if(safeUrl(p.url))out.push({url:p.url,label:p.name+' catalogue link',checked:null,kind:'catalogue',playbackVerified:false});return out.filter((r,i,a)=>a.findIndex(t=>t.url===r.url)===i);}
function rank(seed,series,options={}){
 const now=options.now??Date.now(),w={...defaults,...options.weights};for(const k of Object.keys(w))w[k]=Number.isFinite(Number(w[k]))?Math.max(0,Math.min(100,Number(w[k]))):0;
 const a=profile(seed),total=Object.values(w).reduce((x,y)=>x+y,0);if(!total)return [];
 return series.filter(s=>s.id!==seed.id&&release(s,now)).map(s=>{
  const b=profile(s),themes=intersect(a.themes,b.themes),settings=intersect(a.settings,b.settings),moods=intersect(a.moods,b.moods),actors=intersect(cast(seed),cast(s));
  const overlap=(shared,l,r)=>shared.length/Math.max(l.length,r.length,1);
  const parts={themes:overlap(themes,a.themes,b.themes),mood:overlap(moods,a.moods,b.moods),setting:overlap(settings,a.settings,b.settings),studio:studio(seed)&&studio(seed)===studio(s)?1:0,cast:actors.length?1:0};
  if(moods.length===1&&moods[0]==='drama')parts.mood*=0.25;
  const score=Object.entries(parts).reduce((n,[k,v])=>n+v*w[k],0),story=themes.length>0||settings.length>0;
  const reasons=[];if(themes.length&&w.themes)reasons.push('Both explore '+themes.map(k=>labels[k]||k).join(' and ')+'.');if(settings.length&&w.setting)reasons.push('Both feature '+settings.map(k=>labels[k]||k).join(' and ')+'.');if(moods.length&&w.mood)reasons.push('Both are described with '+moods.map(k=>labels[k]||k).join(' and ')+'.');if(parts.cast&&w.cast)reasons.push('Returning cast: '+actors.join(', ')+'.');if(parts.studio&&w.studio)reasons.push('Same studio: '+s.studio+'.');
  return{s,score,total,parts,story,themes,settings,moods,reasons,profile:b,access:distribution(s,options.country||'US',now),routes:routes(s),storySupported:story&&(themes.length>0&&w.themes>0||settings.length>0&&w.setting>0)};
 }).filter(r=>r.score>0&&r.reasons.length&&(!options.storyOnly||r.storySupported)&&(!options.verifiedOnly||r.access.recorded)&&(!options.withLinks||r.routes.length)).sort((a,b)=>b.score-a.score||a.s.title.localeCompare(b.s.title));
}
root.NextWatch={defaults,labels,norm,profile,release,distribution,routes,rank,safeUrl};
})(globalThis);
