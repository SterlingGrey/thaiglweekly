/* Optional page translation. No vendor script loads before the reader clicks. */
(() => {
  const bar=document.querySelector('.translation-test');
  if(!bar) return;
  const status=document.getElementById('translation-status');
  const button=document.getElementById('enable-translation');
  const selector=document.getElementById('translation-selector');
  const labels={"en": ["Showing all tracker entries.", "Matching series:", "Clear search"], "es": ["Mostrando todas las series.", "Coincidencias:", "Borrar búsqueda"], "el": ["Εμφανίζονται όλες οι σειρές.", "Αποτελέσματα:", "Εκκαθάριση αναζήτησης"], "th": ["แสดงซีรีส์ทั้งหมด", "ซีรีส์ที่พบ:", "ล้างการค้นหา"], "pt": ["Mostrando todas as séries.", "Resultados:", "Limpar pesquisa"], "id": ["Menampilkan semua serial.", "Hasil:", "Hapus pencarian"], "vi": ["Hiển thị tất cả phim bộ.", "Kết quả:", "Xóa tìm kiếm"]};
  window.tgwTranslation={
    language:()=>selector.querySelector('select')?.value.split('|').pop() || 'en',
    search(count,active){const words=labels[this.language()]||labels.en;return active?words[1]+' '+count:words[0]},
    clear(){return (labels[this.language()]||labels.en)[2]}
  };
  document.querySelectorAll('.ml-embedded,.embed,form,input,textarea,.home-brand,.tgw-wordmark,.cc-pairing,.show-pairing,#filter-results,#filter-clear').forEach(el=>{el.classList.add('notranslate');el.setAttribute('translate','no')});
  const names=JSON.parse(document.getElementById('translation-names').textContent);
  const escape=n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+names.map(escape).join('|')+')(?![\\p{L}\\p{N}])','gu');
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement&&!node.parentElement.closest('script,style,.notranslate,form,textarea,input'))nodes.push(node)}
  for(const node of nodes){
    const text=node.textContent;pattern.lastIndex=0;if(!pattern.test(text))continue;
    pattern.lastIndex=0;const fragment=document.createDocumentFragment();let at=0;
    for(const match of text.matchAll(pattern)){
      if(match.index>at)fragment.append(document.createTextNode(text.slice(at,match.index)));
      const span=document.createElement('span');span.className='notranslate tgw-name';span.setAttribute('translate','no');span.textContent=match[0];fragment.append(span);at=match.index+match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(at)));node.replaceWith(fragment);
  }
  if(new URLSearchParams(location.search).has('original')){
    for(const domain of ['',location.hostname,'.'+location.hostname,...(location.hostname.endsWith('.thaiglweekly.com')?['.thaiglweekly.com']:[])]){
      document.cookie='googtrans=; Max-Age=0; path=/'+(domain?'; domain='+domain:'');
    }
    status.textContent='Original English selected. The external translation service is not loaded.';
  }
  selector.addEventListener('change',()=>{
    const q=document.getElementById('filter-q');if(q)q.dispatchEvent(new Event('input',{bubbles:true}));
    status.textContent='Automatic translation may contain mistakes. Forms and newsletter emails stay in English. Viewing availability does not change. The external service uses a language-preference cookie.';
  });
  button.addEventListener('click',()=>{
    button.disabled=true;status.textContent='Loading the external translation service. It uses a language-preference cookie. English is always available.';
    window.gtranslateSettings={default_language:'en',languages:['en','th','es','pt','id','vi','el'],native_language_names:true,detect_browser_language:false,wrapper_selector:'#translation-selector'};
    const script=document.createElement('script');script.src='https://cdn.gtranslate.net/widgets/latest/dropdown.js';script.defer=true;
    script.onload=()=>{status.textContent='Choose a language. Automatic translation may contain mistakes. The external service uses a language-preference cookie; forms and newsletter emails stay in English.'};
    script.onerror=()=>{status.textContent='Translation could not load. You can keep reading the original English or reload to try again.'};
    document.head.appendChild(script);
  });
})();
