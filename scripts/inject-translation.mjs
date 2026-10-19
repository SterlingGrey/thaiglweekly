// Add optional translation after homepage assembly, on each daily build.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,process.env.SITE_OUT||'site');
const catalog=JSON.parse(readFileSync(join(root,'data/series.json'),'utf8'));
const names=[...new Set(catalog.series.flatMap(s=>[s.title,s.pairing]).filter(Boolean).concat(['Thai GL Weekly','iQIYI','WeTV','YouTube','GagaOOLala']))].sort((a,b)=>b.length-a.length);
const bar="<aside class=\"translation-test notranslate\" translate=\"no\" aria-label=\"Reading language\"><strong>Read in your language</strong><span>Automatic translation, not an edited edition. Viewing availability does not change.</span><button type=\"button\" id=\"enable-translation\">Translate this page</button><div id=\"translation-selector\"></div><a href=\"?original=1\">Return to original English</a><p id=\"translation-status\" role=\"status\">Optional: loads GTranslate / Google Translate and uses a language-preference cookie. Forms and newsletter emails stay in English.</p><a href=\"privacy.html#translation\">Translation privacy</a></aside>";
for(const file of ['index.html','tracker.html']){
 const path=join(out,file);let html=readFileSync(path,'utf8');
 html=html.replace(/<!-- TRANSLATION (?:HEAD|BAR|SCRIPT) START -->[\s\S]*?<!-- TRANSLATION (?:HEAD|BAR|SCRIPT) END -->/g,'');
 html=html.replace('</head>','<!-- TRANSLATION HEAD START --><link rel="stylesheet" href="css/translation.css?v=20261019"><!-- TRANSLATION HEAD END -->\n</head>');
 html=html.replace(/(<body[^>]*>)/,'$1<!-- TRANSLATION BAR START -->'+bar+'<!-- TRANSLATION BAR END -->');
 const config=JSON.stringify(names).replaceAll('<','\\u003c');
 html=html.replace('</body>','<!-- TRANSLATION SCRIPT START --><script type="application/json" id="translation-names">'+config+'</script><script src="js/translation.js?v=20261019"></script><!-- TRANSLATION SCRIPT END --></body>');
 // Version the changed search code so cached English-only code is replaced.
 html=html.replace(/src="js\/site.js(?:\?[^" ]*)?"/g,'src="js/site.js?v=translation-20261019"');
 writeFileSync(path,html);
}
for(const file of ['css/translation.css','js/translation.js']){if(out!==root)copyFileSync(join(root,file),join(out,file))}
console.log('Optional language selector added to homepage and Tracker');
