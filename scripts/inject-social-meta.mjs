#!/usr/bin/env node
// Run last: covers generated pages and copied archives, idempotently.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,process.env.SITE_OUT || 'site');
const origin='https://thaiglweekly.com';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const descriptions={
 home:'Your Thai GL week, brought together: Sterling’s Top Six, essays, Dao’s films and a free series Tracker.',
 subscribe:'Get the free Thai GL Weekly Monday newsletter. Sterling’s Top Six, essays, Dao’s films and the week ahead. Sign up, then confirm your email.',
 tracker:'Search Thai GL series, check episode dates and find official viewing links with country notes. Free, with no signup required.',
 newsletter:'Read a complete Thai GL Weekly issue before you join the free Monday email.',
 essays:'Essays by Sterling Grey on Thai GL, the performances and the stories that stay with us.'};
function walk(dir){for(const f of readdirSync(dir,{withFileTypes:true})){
 if(f.name==='assets'||f.name==='brand'||f.name.startsWith('.'))continue;
 const path=join(dir,f.name);
 if(f.isDirectory())walk(path);else if(f.name.endsWith('.html'))patch(path);
}}
function patch(path){
 const file=relative(out,path).replaceAll('\\','/');
 if(file==='access-check.html')return;
 let html=readFileSync(path,'utf8');
 if(!/<head[\s>]/i.test(html))return;
 const kind=file==='index.html'?'home':file==='tracker.html'?'tracker':file==='subscribe.html'?'subscribe':file.startsWith('essays/')?'essays':file.startsWith('newsletter/')?'newsletter':file.startsWith('shows/')?'tracker':'home';
 const route=file==='index.html'?'/':'/'+file.replace(/index\.html$/,'');
 const url=origin+route;
 const title=decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Thai GL Weekly');
 const desc=decode(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=(["'])([\s\S]*?)\1[^>]*>/i)?.[2] || descriptions[kind]);
 html=html.replace(/\s*<!-- SOCIAL PREVIEW START -->[\s\S]*?<!-- SOCIAL PREVIEW END -->\s*/g,'\n');
 html=html.replace(/<meta\b[^>]*(?:property|name)=["'](?:og:|twitter:)[^"']*["'][^>]*>\s*/gi,'');
 html=html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi,'');
 const showId=file.match(/^shows\/([^/]+)\/index\.html$/)?.[1];
 const essayId=file.match(/^essays\/(what-a-studio-owes-its-artists|how-to-love-thai-gl-without-overspending)\/index\.html$/)?.[1];
 const image=origin+'/assets/social/'+(essayId||showId||kind)+'-v1.png';
 const article=kind==='essays'&&file!=='essays/index.html';
 const meta=`<!-- SOCIAL PREVIEW START -->
<link rel="canonical" href="${escape(url)}">
<meta property="og:site_name" content="Thai GL Weekly">
<meta property="og:locale" content="en_US">
<meta property="og:type" content="${article?'article':'website'}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(desc)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escape('Thai GL Weekly: '+descriptions[kind])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(desc)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${escape('Thai GL Weekly: '+descriptions[kind])}">
<!-- SOCIAL PREVIEW END -->`;
 html=html.replace(/<\/head>/i,meta+'\n</head>');
 writeFileSync(path,html);
}
walk(out);console.log('Applied page-specific canonical and social preview metadata');
