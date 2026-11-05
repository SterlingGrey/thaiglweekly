// Publication gate: a manifest never substitutes for complete current-source dictionaries.
import {readFileSync} from 'node:fs';
import {languages} from './lib/tracker-i18n.mjs';
const source=JSON.parse(readFileSync('review-output/tracker-language-source.json','utf8'));
const manifest=JSON.parse(readFileSync('assets/translations/manifest.json','utf8'));
if(manifest.sourceHash!==source.report.sourceHash)throw new Error('Translation source changed; prepare current dictionaries');
for(const language of languages.filter(l=>l.code!=='en')){
 const data=JSON.parse(readFileSync('assets/translations/'+language.code+'.json','utf8'));
 if(data.sourceHash!==manifest.sourceHash||data.language!==language.code||data.provider!=='Microsoft Translator')throw new Error('Wrong or stale translation asset '+language.code);
 for(const text of source.strings)if(typeof data.translations[text]!=='string'||!data.translations[text].trim())throw new Error('Incomplete language '+language.code);
}
console.log('All seven Microsoft translation dictionaries match the prepared public source. Browser acceptance remains required.');
