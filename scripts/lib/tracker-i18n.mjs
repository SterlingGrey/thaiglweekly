import {createHash} from 'node:crypto';
export const languages = [
  {code:'en',name:'English',api:'en'},
  {code:'pt-BR',name:'Português (Brasil)',api:'pt'},
  {code:'fil',name:'Filipino',api:'fil'},
  {code:'ja',name:'日本語',api:'ja'},
  {code:'ko',name:'한국어',api:'ko'},
  {code:'th',name:'ไทย',api:'th'},
  {code:'zh-Hant',name:'繁體中文',api:'zh-Hant'},
  {code:'es',name:'Español',api:'es'},
];
export const normalize = value => value.replace(/\s+/gu,' ').trim();
export const sourceHash = strings => createHash('sha256').update(JSON.stringify([...strings].sort())).digest('hex');
export function planTranslations(strings, cache, limit=600000) {
  const unique=[...new Set(strings.map(normalize).filter(Boolean))].sort();
  const pending=languages.filter(l=>l.code!=='en').map(language=>({language,strings:unique.filter(s=>typeof cache[language.code]?.[s]!=='string'||!cache[language.code][s])}));
  const characters=pending.reduce((n,item)=>n+item.strings.reduce((sum,s)=>sum+[...s].length,0),0);
  if(characters>limit)throw new Error(`Translation preparation needs ${characters} characters, exceeds explicit per-run cap ${limit}`);
  return {pending,characters,sourceHash:sourceHash(unique),strings:unique};
}
export async function translateTexts(texts, language, {key,region,fetcher=fetch}) {
  if(!key||!region)throw new Error('Missing Microsoft Translator credentials');
  const url=new URL('https://api.cognitive.microsofttranslator.com/translate');
  url.search=new URLSearchParams({'api-version':'3.0',from:'en',to:language,textType:'plain'});
  const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':key,'Ocp-Apim-Subscription-Region':region},body:JSON.stringify(texts.map(Text=>({Text}))),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Microsoft Translator returned HTTP ${response.status}; no automatic retry`);
  const result=await response.json();
  if(!Array.isArray(result)||result.length!==texts.length)throw new Error('Incomplete translation response');
  return result.map(row=>{
    const match=row.translations?.find(item=>item.to===language);
    if(!match||typeof match.text!=='string'||!match.text.trim())throw new Error('Missing requested language result');
    return match.text;
  });
}
