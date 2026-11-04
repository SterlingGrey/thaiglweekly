// Run after canonical rendering and validation. Keep the classic DOM as the data
// source and accessible fallback, then install the responsive workspace.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,process.env.SITE_OUT||'site');mkdirSync(out,{recursive:true});
const canonical=readFileSync(join(out,'tracker.html'),'utf8');
if(!canonical.includes('data-series-id='))throw new Error('Canonical Tracker must be generated before promotion');
writeFileSync(join(out,'tracker-classic.html'),canonical);
let shell=readFileSync(join(root,'tracker2.html'),'utf8');
const social=canonical.match(/<!-- SOCIAL PREVIEW START -->[\s\S]*?<!-- SOCIAL PREVIEW END -->/)?.[0];
if(social){
  shell=shell.replace(/<!-- SOCIAL PREVIEW START -->[\s\S]*?<!-- SOCIAL PREVIEW END -->/g,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'');
  shell=shell.replace('</head>',social+'\n</head>');
}
const beacon=canonical.match(/<script defer src="https:\/\/static\.cloudflareinsights\.com[\s\S]*?<\/script>/)?.[0];
if(beacon&&!shell.includes('static.cloudflareinsights.com'))shell=shell.replace('</head>',beacon+'\n</head>');
shell=shell.replace(/[ \t]+$/gm,'');
writeFileSync(join(out,'tracker.html'),shell);
writeFileSync(join(out,'tracker2.html'),shell);
const rollback=join(root,'tracker-rollback-20261104.html');
if(out!==root&&existsSync(rollback))writeFileSync(join(out,'tracker-rollback-20261104.html'),readFileSync(rollback));
console.log('Responsive Tracker installed; current canonical DOM at tracker-classic.html');
