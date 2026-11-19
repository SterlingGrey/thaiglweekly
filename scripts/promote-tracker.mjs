// Run after canonical rendering and validation. Keep the classic DOM as the data
// source and accessible fallback, then install the responsive workspace.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {trackerExtrasData} from './tracker-extras-data.mjs';
import {onTonightBuild} from './on-tonight-data.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,process.env.SITE_OUT||'site');mkdirSync(out,{recursive:true});
const canonical=readFileSync(join(out,'tracker.html'),'utf8');
if(!canonical.includes('data-series-id='))throw new Error('Canonical Tracker must be generated before promotion');
let shell=readFileSync(join(root,'src/tracker-workspace.html'),'utf8');
// Seed both layouts from the generated source so the first paint is current too.
const stamps=[...canonical.matchAll(/<span class="(?:ok|hint)">([^<]+)<\/span>/g)].map(match=>match[1]);
if(stamps.length<2)throw new Error('Tracker update and schedule stamps missing');
shell=shell.replace(/(<span id="status-review-date">)[^<]+/, '$1'+stamps[0]);
shell=shell.replace(/(<span id="mobile-status-summary">)[^<]+/, '$1'+stamps.join(' · '));
const social=canonical.match(/<!-- SOCIAL PREVIEW START -->[\s\S]*?<!-- SOCIAL PREVIEW END -->/)?.[0];
if(social){
  shell=shell.replace(/<!-- SOCIAL PREVIEW START -->[\s\S]*?<!-- SOCIAL PREVIEW END -->/g,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'');
  shell=shell.replace('</head>',social+'\n</head>');
}
const beacon=canonical.match(/<script defer src="https:\/\/static\.cloudflareinsights\.com[\s\S]*?<\/script>/)?.[0];
if(beacon&&!shell.includes('static.cloudflareinsights.com'))shell=shell.replace('</head>',beacon+'\n</head>');
// The responsive shell replaces the classic page; retain its opt-in translator.
const translationHead=canonical.match(/<!-- TRANSLATION HEAD START -->[\s\S]*?<!-- TRANSLATION HEAD END -->/)?.[0];
const translationScript=canonical.match(/<!-- TRANSLATION SCRIPT START -->[\s\S]*?<!-- TRANSLATION SCRIPT END -->/)?.[0];
if(!translationHead||!translationScript)throw new Error('Missing canonical translation integration');
shell=shell.replace(/<!-- TRANSLATION (?:HEAD|SCRIPT) START -->[\s\S]*?<!-- TRANSLATION (?:HEAD|SCRIPT) END -->/g,'');
shell=shell.replace('</head>',translationHead+'\n</head>').replace('</body>',translationScript+'\n</body>');
for(const id of ['enable-translation','translation-selector','translation-status','translation-names']) {
  if((shell.match(new RegExp('id="'+id+'"','g'))||[]).length!==1)throw new Error('Responsive Tracker translation control missing or duplicated: '+id);
}
const catalogue=JSON.parse(readFileSync(join(root,'data/series.json'),'utf8'));
// The strip's rows and the classic page share one build id, so a cached shell cannot pair them wrongly.
const tonight=onTonightBuild(canonical,catalogue,process.env.BUILD_NOW||new Date().toISOString());
writeFileSync(join(out,'tracker-classic.html'),tonight.classic);
writeFileSync(join(out,'on-tonight.json'),tonight.json);
shell=shell.replace('</body>', trackerExtrasData(catalogue) + '\n<script src="js/tracker-extras.js?v=rewatch-20261106"></script>\n' + '\n<script src="js/on-tonight.js?v=on-tonight-20261117"></script>\n</body>');
// Preview builds (SITE_OUT other than the repo root) need the strip script copied beside the page.
if(out!==root){mkdirSync(join(out,'js'),{recursive:true});writeFileSync(join(out,'js/on-tonight.js'),readFileSync(join(root,'js/on-tonight.js')));}
shell=shell.replace(/[ \t]+$/gm,'');
writeFileSync(join(out,'tracker.html'),shell);
writeFileSync(join(out,'tracker2.html'),shell);
const rollback=join(root,'tracker-rollback-20261104.html');
if(out!==root&&existsSync(rollback))writeFileSync(join(out,'tracker-rollback-20261104.html'),readFileSync(rollback));
console.log('Responsive Tracker installed; current canonical DOM at tracker-classic.html');
