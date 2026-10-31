import { readBeaconToken } from './beacon-token.mjs';
// Scout (Codex), 28 October 2026. Approved Thursday release; preview stays isolated.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const out=resolve(process.env.SITE_OUT||'site');
const released=new Date(process.env.BUILD_NOW||Date.now())>=new Date('2026-10-29T06:30:00-04:00');
const preview=process.env.ESSAY1_PREVIEW==='1';
const token=readBeaconToken('data/cloudflare-beacon.txt');
const beacon=`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({token})}'></script>`;
const slug='selling-the-ship';
if(!released&&!preview) rmSync(join(out,'essays',slug),{recursive:true,force:true});
if(released||preview){
 let page=readFileSync('launch-source/selling-the-ship.html','utf8');
 if(released){page=page.replace(/<meta name="robots" content="noindex,nofollow">/g,'<meta name="robots" content="index,follow">').replace(/<div class="preview">[\s\S]*?<\/div>/g,'');
 const schema={'@context':'https://schema.org','@type':'Article',headline:'Selling the Ship',author:{'@type':'Person',name:'Sterling Grey'},datePublished:'2026-10-29T06:30:00-04:00',mainEntityOfPage:'https://thaiglweekly.com/essays/selling-the-ship/'};
 page=page.replace('</head>',`<script type="application/ld+json">${JSON.stringify(schema)}</script></head>`);}
 mkdirSync(join(out,'essays',slug),{recursive:true});writeFileSync(join(out,'essays',slug,'index.html'),page);
 for(const file of [join(out,'essays/index.html'),...['what-a-studio-owes-its-artists','how-to-love-thai-gl-without-overspending'].map(s=>join(out,'essays',s,'index.html')),join(out,'essays',slug,'index.html')]){
 let h=readFileSync(file,'utf8');h=h.replace(/<li>Selling the Ship<br>/g,'<li><a href="/essays/selling-the-ship/">Selling the Ship</a><br>');if(file===join(out,'essays/index.html')&&!h.includes('class="essay-card" href="/essays/selling-the-ship/"')) h=h.replace('<div class="essay-list">','<div class="essay-list"><a class="essay-card" href="/essays/selling-the-ship/"><h2>Selling the Ship</h2><p>In Thai GL the pair is the product. That is a business decision, and two people carry it.</p><span class="date">29 October 2026 · Opinion by Sterling Grey</span></a>');writeFileSync(file,h);
 }
 let home=readFileSync(join(out,'index.html'),'utf8');home=home.replace('Monday 26 October</p><h2>The Business of Love</h2>','Thursday 29 October</p><h2>Selling the Ship</h2>').replace('Four essays. Real receipts. Nobody’s private life. Free to read.','In Thai GL the pair is the product. That is a business decision, and two people carry it.').replace('href="essays/">Explore the series →','href="essays/selling-the-ship/">Read the essay →');writeFileSync(join(out,'index.html'),home);
 if(released){const f=join(out,'sitemap.xml');let s=readFileSync(f,'utf8');s=s.replace(/<script\b[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*><\/script>/g,'');if(!s.includes('/essays/selling-the-ship/'))s=s.replace('</urlset>','<url><loc>https://thaiglweekly.com/essays/selling-the-ship/</loc><lastmod>2026-10-29</lastmod></url></urlset>');writeFileSync(f,s);}
}
function inject(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=join(dir,e.name);if(e.isDirectory())inject(f);else if(e.name.endsWith('.html')){let s=readFileSync(f,'utf8');s=s.replace(/<script\b[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*><\/script>/g,'');if(!s.includes('static.cloudflareinsights.com/beacon.min.js'))s=s.replace('</body>',beacon+'</body>');writeFileSync(f,s);}}}
inject(join(out,'essays'));
console.log(`Essay 1: ${released?'release eligible':preview?'isolated preview only':'held until Thursday 06:30 ET'}; essay beacons present.`);
