// Scout (Codex), 1 November 2026. Local preparation; release requires recorded clearance.
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readBeaconToken} from './beacon-token.mjs';
const out=resolve(process.env.SITE_OUT||'site');
const slug='building-their-own-house';
const eligible=new Date(process.env.BUILD_NOW||Date.now())>=new Date('2026-11-02T06:30:00-05:00');
const clearance=JSON.parse(readFileSync('launch-source/essay2-clearance.json','utf8'));
const sourceHash=createHash('sha256').update(readFileSync('launch-source/essay-2.md')).digest('hex');
if(clearance.cleared===true&&(!clearance.receipt||clearance.sourceSha256!==sourceHash))throw new Error('Essay 2 clearance receipt/hash mismatch');
const released=eligible&&clearance.cleared===true;
if(!released&&process.env.ESSAY2_PREVIEW!=='1'){
 rmSync(join(out,'essays',slug),{recursive:true,force:true});
 console.log('Essay 2 held for clearance and Monday 06:30 EST');
}else{
 let page=readFileSync('launch-source/building-their-own-house.html','utf8');
 const token=readBeaconToken('data/cloudflare-beacon.txt');
 const beacon=`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({token})}'></script>`;
 if(released){page=page.replace('content="noindex,nofollow"','content="index,follow"').replace(/<div class="preview">[\s\S]*?<\/div>/,'');
 page=page.replace('</head>',`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:'Building Their Own House',author:{'@type':'Person',name:'Sterling Grey'},datePublished:'2026-11-02T06:30:00-05:00',mainEntityOfPage:'https://thaiglweekly.com/essays/'+slug+'/'})}</script></head>`);}
 page=page.replace('</body>',(released?beacon:'<!-- Local preview: analytics disabled -->')+'</body>');mkdirSync(join(out,'essays',slug),{recursive:true});writeFileSync(join(out,'essays',slug,'index.html'),page);
 if(released){
  for(const s of ['', 'what-a-studio-owes-its-artists','how-to-love-thai-gl-without-overspending','selling-the-ship',slug]){
   const f=join(out,'essays',s,'index.html');let h=readFileSync(f,'utf8');h=h.replace(/<li>Building Their Own House<br>/g,'<li><a href="/essays/'+slug+'/">Building Their Own House</a><br>');
   if(s===''&&!h.includes('class="essay-card" href="/essays/'+slug+'/"'))h=h.replace('<div class="essay-list">','<div class="essay-list"><a class="essay-card" href="/essays/'+slug+'/"><h2>Building Their Own House</h2><p>Freen Sarocha and Becky Armstrong each run a company of her own now. The pairing goes on.</p><span class="date">2 November 2026 · Opinion by Sterling Grey</span></a>');writeFileSync(f,h);
  }
  const homeFile=join(out,'index.html');let home=readFileSync(homeFile,'utf8');home=home.replace('Thursday 29 October</p><h2>Selling the Ship</h2>','Monday 2 November</p><h2>Building Their Own House</h2>').replace('In Thai GL the pair is the product. That is a business decision, and two people carry it.','Freen Sarocha and Becky Armstrong each run a company of her own now. The pairing goes on.').replace('href="essays/selling-the-ship/">Read the essay →','href="essays/'+slug+'/">Read the essay →');writeFileSync(homeFile,home);
  const f=join(out,'sitemap.xml');let s=readFileSync(f,'utf8');if(!s.includes('/essays/'+slug+'/'))s=s.replace('</urlset>','<url><loc>https://thaiglweekly.com/essays/'+slug+'/</loc><lastmod>2026-11-02</lastmod></url></urlset>');writeFileSync(f,s);
 }
 console.log('Essay 2 '+(released?'release eligible':'isolated preview only'));
}
