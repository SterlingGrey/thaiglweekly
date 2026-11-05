export const normalize = value => value.replace(/\s+/gu,' ').trim();
const excluded='script,style,noscript,[translate="no"],.notranslate,form,input,textarea,#translation-status';
export function textNodes(document){
 const nodes=[],walker=document.createTreeWalker(document.body,document.defaultView.NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const n=walker.currentNode,p=n.parentElement;
  if(!p||p.closest(excluded))continue;
  if(p.tagName==='OPTION'&&p.closest('#studio-filter')&&p.value!=='ALL')continue;
  nodes.push(n);
 }
 return nodes;
}
export function protectNames(document,names){
 const words=[...new Set(names.filter(Boolean))].sort((a,b)=>b.length-a.length);
 if(!words.length)return;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+words.map(escape).join('|')+')(?![\\p{L}\\p{N}])','gu');
 for(const node of textNodes(document)){
  if(node.parentElement.tagName==='OPTION')continue;
  const text=node.textContent;pattern.lastIndex=0;
  if(!pattern.test(text))continue;
  pattern.lastIndex=0;const fragment=document.createDocumentFragment();let at=0;
  for(const match of text.matchAll(pattern)){
   if(match.index>at)fragment.append(document.createTextNode(text.slice(at,match.index)));
   const span=document.createElement('span');span.className='notranslate tgw-name';span.setAttribute('translate','no');span.textContent=match[0];fragment.append(span);at=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(at)));node.replaceWith(fragment);
 }
}
