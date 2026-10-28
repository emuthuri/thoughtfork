'use strict';
const SearchUI=(()=>{
  let index=null,ledger=null,revision=null,lineageQuery='',lineagePage=0,mergeQuery='',mergePage=0,previewApi=null;
  function invalidate(){revision=null;}
  function getIndex(){if(!state.ledger)return null;if(!index)index=new Retrieval.Index(state.ledger);if(ledger!==state.ledger||revision!==saves.revision){index.sync(state.ledger);ledger=state.ledger;revision=saves.revision;}return index;}
  function evidence(hit){return `<div class="match-evidence">${hit.matches.slice(0,3).map(m=>`<div><span class="match-label">${esc(m.label)}</span> ${esc(Retrieval.snippet(m.text,m.terms))}</div>`).join('')}${hit.matches.length>3?`<span class="tiny">Also matches: ${hit.matches.slice(3).map(m=>esc(m.label)).join(', ')}</span>`:''}</div>`;}
  function previewButton(id,kind='ideas'){return `<button type="button" class="preview-open" data-id="${attr(id)}" data-kind="${kind}" aria-label="Preview ${attr(kind==='sources'?getIndex().sources.get(id)?.title:getIndex().ideas.get(id)?.title)}" title="Read complete preview (F2)">Preview</button>`;}
  function result(hit,kind){const i=hit.item,source=kind==='sources';return `<div class="search-result-row"><button type="button" class="search-result ${source?'search-source':'search-idea'}" data-id="${attr(i.id)}"><div class="search-result-top"><strong>${esc(i.title)}</strong><span>${esc(i.project)} · ${source?'Raw source':esc(i.type)}</span></div>${evidence(hit)}</button>${previewButton(i.id,kind)}${!source?`<button type="button" class="link-button thread-entry" data-thread="${attr(i.id)}">Thread</button>`:''}</div>`;}
  function bindResults(root){root.querySelectorAll('.search-idea').forEach(b=>b.onclick=()=>jumpToIdea(b.dataset.id));root.querySelectorAll('.search-source').forEach(b=>b.onclick=()=>{const id=b.dataset.id;hideSuggestions();if(state.view!=='search')showAll();openSourceModal(id);});}
  function hideSuggestions(){ $('#searchResults').classList.add('hidden');$('#searchInput').setAttribute('aria-expanded','false'); }
  function suggestions(){
    const box=$('#searchResults'),q=state.search.trim();if(!q||state.view==='search'||document.activeElement!==$('#searchInput')&&!box.contains(document.activeElement)){hideSuggestions();return;}
    const ideas=UsabilityUI.scopedSearch(q),sources=UsabilityUI.scopedSearch(q,'sources');
    box.innerHTML=`<p class="result-count">${ideas.length} idea matches · ${sources.length} raw source matches</p>${ideas.slice(0,8).map(h=>result(h,'ideas')).join('')}${sources.length?'<div class="result-group">Raw sources — source text matches stay here</div>':''}${sources.slice(0,5).map(h=>result(h,'sources')).join('')}${!ideas.length&&!sources.length?'<p>No matching ideas or sources. All search words must occur in a record.</p>':''}<button id="allSearchResults" type="button" class="button all-results">See all ${ideas.length+sources.length} results</button><p class="search-help">↓ ↑ results · Enter open · F2 preview · Esc dismiss</p>`;
    box.classList.remove('hidden');$('#searchInput').setAttribute('aria-expanded','true');bindResults(box);$('#allSearchResults').onclick=showAll;
  }
  function showAll(){hideSuggestions();if(state.view!=='search'){NavigationUI.capture();if(state.searchScope!=='project')state.project=state.disposition=state.action='All';}state.view='search';state.pages.search=0;renderAll();$('#searchHeading').focus();}
  function pager(info,id){return `<div class="list-pager" id="${id}" aria-label="Result pages"><button type="button" class="button page-prev" ${info.page===0?'disabled':''}>← Previous page</button><span role="status">${info.start}–${info.end} of ${info.total} · page ${info.page+1} / ${info.pages}</span><button type="button" class="button page-next" ${info.page+1>=info.pages?'disabled':''}>Next page →</button>${info.pages>1?`<div class="page-jump"><label>Page <input class="page-number" type="number" min="1" max="${info.pages}" value="${info.page+1}" aria-label="Page number"></label><button type="button" class="button page-go">Go</button></div>`:''}</div>`;}
  function bindPager(id,info,change){const el=$('#'+id);el.querySelector('.page-prev').onclick=()=>change(info.page-1);el.querySelector('.page-next').onclick=()=>change(info.page+1);const input=el.querySelector('.page-number');if(input){const go=()=>{if(input.reportValidity()&&Number.isInteger(Number(input.value))&&input.value)change(Number(input.value)-1);};el.querySelector('.page-go').onclick=go;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();go();}};}}
  function renderComplete(){
    const q=state.search.trim(),ranked=UsabilityUI.scopedSearch(q),byId=new Map(ranked.map(h=>[h.item.id,h])),ideas=Retrieval.sorted(Retrieval.filter(ranked.map(h=>h.item),state),state.sort).map(i=>byId.get(i.id)),project=Retrieval.projectName(state.project),sources=UsabilityUI.scopedSearch(q,'sources').filter(h=>project===null||h.item.project===project),kind=state.searchKind||'all';
    const combined=[...(kind!=='sources'?ideas.map(h=>({hit:h,kind:'ideas'})):[]),...(kind!=='ideas'?sources.map(h=>({hit:h,kind:'sources'})):[])];const info=Retrieval.page(combined,state.pages.search,30);state.pages.search=info.page;
    $('#searchView').innerHTML=`<div class="panel"><h1 id="searchHeading" tabindex="-1">Search results${q?' for “'+esc(q)+'”':''}</h1><p class="results-explanation">${state.project==='All'&&state.disposition==='All'&&state.action==='All'?'Entire ledger':'Current filters'} · all words, case-insensitive. Idea matches use their own fields and selected idea order. Raw sources use project/search filters and relevance order. Source-only matches stay under raw sources; open one to see its contributions.</p><div class="results-tabs" aria-label="Result type">${[['all','All',ideas.length+sources.length],['ideas','Ideas',ideas.length],['sources','Raw sources',sources.length]].map(([value,label,count])=>`<button type="button" class="button result-kind" data-kind="${value}" aria-pressed="${kind===value}">${label} (${count})</button>`).join('')}</div><div class="complete-results">${info.items.map(({hit,kind})=>result(hit,kind)).join('')||'<p>No matches. Try fewer words or another term.</p>'}</div>${pager(info,'completePager')}</div>`;
    bindResults($('#searchView'));$$('.result-kind').forEach(b=>b.onclick=()=>{state.searchKind=b.dataset.kind;state.pages.search=0;renderComplete();NavigationUI.remember();[...$$('.result-kind')].find(el=>el.dataset.kind===state.searchKind)?.focus();});bindPager('completePager',info,n=>{state.pages.search=n;renderComplete();NavigationUI.remember();$('#searchHeading').focus();});
    $('#searchView').onkeydown=e=>{if(!e.target.matches('.search-result'))return;const buttons=[...$('#searchView').querySelectorAll('.search-result')],at=buttons.indexOf(e.target);let next;if(e.key==='ArrowDown')next=Math.min(buttons.length-1,at+1);else if(e.key==='ArrowUp')next=Math.max(0,at-1);else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();buttons[next].focus();buttons[next].scrollIntoView({block:'nearest'});}};
  }
  function lineage(currentId,q){
    if(q!==lineageQuery){lineageQuery=q;lineagePage=0;}
    const box=$('#lineageSuggestions');if(!q.trim()){box.classList.add('hidden');return;}
    const hits=getIndex().search(q).filter(h=>h.item.id!==currentId),info=Retrieval.page(hits,lineagePage,7);lineagePage=info.page;
    box.innerHTML=info.items.map(h=>`<div class="candidate-row"><button type="button" class="lineage-suggestion" data-id="${attr(h.item.id)}"><strong>${esc(h.item.title)}</strong><span>${esc(h.item.project)} · ${esc(h.item.type)}</span>${evidence(h)}</button>${previewButton(h.item.id)}</div>`).join('')+`<p class="result-count">${hits.length} matching ideas · ↓ ↑ navigate · F2 or Preview reads full content. Use pages for every candidate.</p>`+pager(info,'lineagePager');box.classList.remove('hidden');
    box.querySelectorAll('.lineage-suggestion').forEach(b=>b.onclick=()=>{const hit=ideaById(b.dataset.id);$('#relationTarget').value=hit.id;$('#relationTargetSearch').value=hit.title;box.classList.add('hidden');$('#addLineageBtn').focus();});
    bindPager('lineagePager',info,n=>{lineagePage=n;lineage(currentId,q);box.querySelector('.lineage-suggestion')?.focus();});
  }
  function mergeCandidates(q,excluded,select){
    if(q!==mergeQuery){mergeQuery=q;mergePage=0;}
    const root=$('#mergeCandidates');if(!q.trim()){root.innerHTML='';return;}
    const hits=getIndex().search(q).filter(h=>!h.item.merge&&!excluded.includes(h.item.id)),info=Retrieval.page(hits,mergePage,12);mergePage=info.page;
    root.innerHTML=info.items.map(h=>`<div class="candidate-row"><button type="button" class="merge-candidate" data-id="${attr(h.item.id)}"><strong>${esc(h.item.title)}</strong><span>${esc(h.item.project)} · ${esc(h.item.type)}</span>${evidence(h)}</button>${previewButton(h.item.id)}</div>`).join('')+`<p class="result-count">${hits.length} matching available ideas</p>`+pager(info,'mergePager');
    root.querySelectorAll('.merge-candidate').forEach(b=>b.onclick=()=>select(b.dataset.id));bindPager('mergePager',info,n=>{mergePage=n;mergeCandidates(q,excluded,select);root.querySelector('.merge-candidate')?.focus();});
  }
  function listKeys(input,box,selector){
    const move=e=>{
      if(e.key==='Escape'){if(box.id==='searchResults')hideSuggestions();else box.classList.add('hidden');input.focus();e.preventDefault();e.stopPropagation();return;}
      if(e.key==='F2'){const el=document.activeElement;if(el.matches(selector)){e.preventDefault();previewApi?.show(el,true);}return;}
      const buttons=[...box.querySelectorAll(selector)].filter(el=>!el.disabled&&el.getClientRects().length);if(!buttons.length)return;
      const at=buttons.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();const next=e.key==='ArrowDown'?(at+1)%buttons.length:(at<0?buttons.length-1:(at-1+buttons.length)%buttons.length);buttons[next].focus();buttons[next].scrollIntoView({block:'nearest'});}
      else if(e.key==='Home'&&at>=0){e.preventDefault();buttons[0].focus();}else if(e.key==='End'&&at>=0){e.preventDefault();buttons.at(-1).focus();}
      else if(e.key==='Enter'&&document.activeElement===input){e.preventDefault();buttons[0].click();}
    };input.addEventListener('keydown',move);box.addEventListener('keydown',move);
  }
  function setupPreviews(){
    const panel=document.createElement('section');panel.id='contentPreview';panel.className='content-preview hidden';panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','previewTitle');panel.tabIndex=0;document.body.append(panel);
    let anchor=null,pinned=false,timer,dismissed=null;
    const selector='.search-result,.lineage-suggestion,.merge-candidate,.thread-node';
    function hide(restore=false){clearTimeout(timer);const previous=anchor;anchor?.removeAttribute('aria-details');anchor=null;pinned=false;panel.classList.add('hidden');if(restore&&previous?.isConnected){dismissed=previous.dataset.id;previous.focus();}}
    function show(button,explicit=false){
      clearTimeout(timer);if(!explicit&&(innerWidth<760||dismissed===button.dataset.id))return;dismissed=null;if(pinned&&!explicit)return;if(anchor===button&&!panel.classList.contains('hidden')){if(explicit){pinned=true;panel.focus();}return;}
      hide();const kind=button.dataset.kind|| (button.classList.contains('search-source')?'sources':'ideas'),item=kind==='sources'?sourceById(button.dataset.id):ideaById(button.dataset.id);if(!item)return;
      anchor=button;pinned=explicit;anchor.setAttribute('aria-details',panel.id);const parent=button.closest('dialog[open]')||document.body;if(panel.parentElement!==parent)parent.append(panel);
      panel.innerHTML=`<button type="button" class="preview-close button" aria-label="Close preview">Close</button><h3 id="previewTitle">${esc(item.title)}</h3><div class="preview-meta">${esc(item.project)} · ${kind==='sources'?'Raw source':esc(item.type)}${kind!=='sources'?' · '+esc(sourceById(item.source)?.title):''}</div>${item.tags?.length?`<div class="preview-tags">${item.tags.map(t=>esc('#'+t)).join(' ')}</div>`:''}<div class="preview-body ${kind==='sources'?'source-preview-text':''}">${esc(kind==='sources'?item.raw:item.summary)}</div>${kind!=='sources'&&item.review.comment?`<h4>Comment</h4><div class="preview-body">${esc(item.review.comment)}</div>`:''}${kind!=='sources'?`<button type="button" class="button thread-entry" data-thread="${attr(item.id)}">View thread</button>`:''}`;
      panel.classList.remove('hidden');panel.scrollTop=0;const row=button.getBoundingClientRect(),container=button.closest('.search-results,.lineage-suggestions,.merge-candidates,.complete-results')?.getBoundingClientRect()||row;
      const margin=12,width=Math.min(500,innerWidth-2*margin);let left=container.right+10,top=Math.max(margin,Math.min(row.top,innerHeight-320)),height=innerHeight-top-margin;
      if(innerWidth<760){left=margin;top=Math.max(margin,innerHeight*.2);height=innerHeight-top-margin;}else if(left+width>innerWidth-margin){if(container.left-width-10>=margin)left=container.left-width-10;else{left=Math.max(margin,Math.min(row.left,innerWidth-width-margin));top=Math.max(margin,Math.min(row.bottom+10,innerHeight-300));height=innerHeight-top-margin;}}
      Object.assign(panel.style,{width:width+'px',left:left+'px',top:top+'px',maxHeight:Math.min(560,height)+'px'});panel.querySelector('.preview-close').onclick=()=>hide(true);if(explicit)panel.focus();
    }
    function delay(){clearTimeout(timer);if(!pinned)timer=setTimeout(()=>hide(),180);}
    document.addEventListener('mouseover',e=>{if(matchMedia('(hover:hover)').matches){const b=e.target.closest(selector);if(b)show(b);}});
    document.addEventListener('mouseout',e=>{if(e.target.closest(selector)&&!e.relatedTarget?.closest(selector))delay();});
    document.addEventListener('focusin',e=>{const b=e.target.closest(selector);if(b)show(b);else if(!panel.contains(e.target)&&!e.target.closest('.preview-open')&&!pinned)hide();});
    document.addEventListener('focusout',e=>{if(e.target.closest(selector)||panel.contains(e.target))delay();});panel.onmouseenter=()=>clearTimeout(timer);panel.onmouseleave=delay;panel.onfocusin=()=>clearTimeout(timer);
    document.addEventListener('click',e=>{const b=e.target.closest('.preview-open');if(b){e.preventDefault();show(b,true);}else if(!panel.contains(e.target)&&!e.target.closest(selector))hide();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.classList.contains('hidden')){e.preventDefault();e.stopImmediatePropagation();hide(true);}else if(e.key==='F2'&&e.target.closest(selector)){e.preventDefault();show(e.target.closest(selector),true);}},true);
    window.addEventListener('resize',()=>hide());document.addEventListener('scroll',e=>{if(!pinned&&!panel.contains(e.target))hide();},true);
    new MutationObserver(()=>{if(anchor&&(!anchor.isConnected||anchor.closest('.hidden')))hide();}).observe($('#app'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    previewApi={show,hide};
  }
  function setup(){
    setupPreviews();listKeys($('#searchInput'),$('#searchResults'),'.search-result,#allSearchResults');
    $('#searchInput').addEventListener('focus',suggestions);
    $('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&state.view==='search'){e.preventDefault();showAll();}});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap,#contentPreview'))hideSuggestions();});
    listKeys($('#mergeSearch'),$('#mergeCandidates'),'.merge-candidate');
  }
  function bindLineage(){listKeys($('#relationTargetSearch'),$('#lineageSuggestions'),'.lineage-suggestion');}
  return {closePreview:()=>previewApi?.hide(),getIndex,invalidate,evidence,previewButton,result,suggestions,hideSuggestions,showAll,pager,bindPager,renderComplete,lineage,mergeCandidates,setup,bindLineage};
})();

