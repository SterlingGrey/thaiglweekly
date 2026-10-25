import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
const out=resolve(process.env.SITE_OUT||'site');
const config=JSON.parse(readFileSync(new URL('../launch-source/release-gate.json',import.meta.url),'utf8'));
if(process.env.ESSAY_LAUNCH_PREVIEW!=='1' && (new Date(process.env.BUILD_NOW||Date.now())<new Date(config.publishAt)||!config.rightOfReplyReviewed)){console.log('Essay release gate closed: preview remains unpublished.');process.exit(0);}
const origin='https://thaiglweekly.com';
const slugs=['what-a-studio-owes-its-artists','how-to-love-thai-gl-without-overspending'];
for(const route of ['essays/',...slugs.map(s=>'essays/'+s+'/')]){
 const file=join(out,route,'index.html');let html=readFileSync(file,'utf8');
 html=html.replace(/<meta name="robots" content="noindex,nofollow">/g,'<meta name="robots" content="index,follow">').replace(/<div class="preview">[\s\S]*?<\/div>/g,'').replaceAll('Planned 26 October 2026','26 October 2026');
 if(slugs.some(s=>route.includes(s))){
 const title=html.match(/<h1>(.*?)<\/h1>/)[1];
 const schema={'@context':'https://schema.org','@type':'Article',headline:title,author:{'@type':'Person',name:'Sterling Grey'},publisher:{'@type':'Organization',name:'Thai GL Weekly'},datePublished:'2026-10-26T06:30:00-04:00',mainEntityOfPage:origin+'/'+route,image:origin+'/assets/social/'+route.split('/')[1]+'-v1.png'};
 html=html.replace('</head>','<script type="application/ld+json">'+JSON.stringify(schema)+'</script></head>');
 }
 writeFileSync(file,html);
}
const mapfile=join(out,'sitemap.xml');let map=readFileSync(mapfile,'utf8');
for(const slug of slugs){const url=origin+'/essays/'+slug+'/';if(!map.includes(url))map=map.replace('</urlset>','<url><loc>'+url+'</loc><lastmod>2026-10-26</lastmod></url>\n</urlset>');}
writeFileSync(mapfile,map);
for(const slug of slugs){const h=readFileSync(join(out,'essays',slug,'index.html'),'utf8');if(h.includes('noindex')||h.includes('Not published')||!h.includes(slug+'-v1.png'))throw Error('Launch metadata check failed: '+slug);if(!existsSync(join(out,'assets/social',slug+'-v1.png')))throw Error('Missing image');}
console.log('Essay launch artifact prepared. NOT deployed. Sunday right-of-reply review and live deployment still required.');
