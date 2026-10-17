'use strict';

const DISPOSITIONS = ['To review','Keep','Merge','Open question','Superseded','Historical','Archive','Trash'];
const ACTIONS = ['None','Discuss','Investigate','Verify','Build'];
const RELATIONS = ['supports','contradicts','refines','supersedes','derived-from','merged-into','related-to'];

const state = {
  ledger: null,
  view: 'review',
  threadId: null,
  sort: 'original',
  pages: {browse:0,sources:0,search:0},
  searchKind: 'all',
  project: 'All',
  disposition: 'All',
  action: 'All',
  search: '',
  reviewId: null,
  compileProject: 'All',
  saveTimers: new Map(),
  activeSourceId: null,
  sourceFontSize: 14
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
let saves, editContext, replacementPlan, reviewedDraft;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function attr(value){ return esc(value).replace(/`/g,'&#96;'); }
function toast(msg, error=false){ const el=$('#toast'); el.textContent=msg; el.className='toast show'+(error?' error':''); clearTimeout(toast.t); toast.t=setTimeout(()=>el.className='toast',2600); }

async function request(url, options={}) {
  const res = await fetch(url, { headers: {'Content-Type':'application/json', ...(options.headers||{})}, ...options });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) throw Object.assign(new Error(body?.error || `Request failed (${res.status})`), body || {}, {status:res.status});
  return body;
}

async function loadLedger(){
  try{
    const out=await request('/api/ledger');saves.connect(out);state.ledger=saves.ledger;
    $('#searchInput').disabled=false;
    $$('.nav-item').forEach(b=>b.disabled=false);$('#captureBtn').disabled=false;$('#snapshotBtn').disabled=false;
    $('#recoveryPanel')?.remove();
    NavigationUI.loaded();
    if (!state.reviewId || !ideaById(state.reviewId)) state.reviewId = filteredIdeas()[0]?.id || state.ledger.ideas[0]?.id || null;
    ensureCurrentVisible();renderAll();updateSaveStatus();
  }catch(e){if(e.code==='RECOVERY_REQUIRED'){await showRecovery(e);return;}throw e;}
}

function review(i){
  i.review ||= { disposition:'To review', action:'None', include:false, comment:'', lineage:[], reviewedAt:null, updatedAt:null };
  i.review.lineage ||= [];
  return i.review;
}
function ideaById(id){ return state.ledger?SearchUI.getIndex().ideas.get(id):undefined; }
function sourceById(id){ return state.ledger?SearchUI.getIndex().sources.get(id):undefined; }
function ideaSources(i){return [...new Set(IdeaModel.origins(i).map(p=>p.sourceId))].map(sourceById).filter(Boolean);}

function renderSearchResults(){SearchUI.suggestions();}
function clearSearch(){state.search='';const input=$('#searchInput');if(input)input.value='';const box=$('#searchResults');if(box){box.classList.add('hidden');box.innerHTML='';}}
function jumpToIdea(id,context={}){
  if(!ideaById(id))return;NavigationUI.capture(context);if(document.querySelector('dialog[open]'))EvolutionUI.leaveForJump();state.reviewId=id;state.project=state.disposition=state.action='All';clearSearch();NavigationUI.resetPages();switchView('review');focusReviewStart();
}
function filteredIdeas(){
  if(!state.ledger)return [];const items=state.search.trim()?SearchUI.getIndex().search(state.search).map(h=>h.item):state.ledger.ideas;
  return Retrieval.sorted(Retrieval.filter(items,state),state.sort);
}
function filteredSources(){
  if(!state.ledger)return [];const items=state.search.trim()?SearchUI.getIndex().search(state.search,'sources').map(h=>h.item):state.ledger.sources,p=Retrieval.projectName(state.project);
  return Retrieval.sorted(items.filter(s=>p===null||s.project===p),state.sort==='original'?'original':state.sort==='title'?'title':'created');
}

function countsFor(field){
  const m=new Map();
  for(const i of state.ledger.ideas){ const v=field==='project'?i.project:review(i)[field]; m.set(v,(m.get(v)||0)+1); }
  return m;
}
function renderFilters(){
  const projects=NavigationUI.sidebarProjects().map(p=>p.name);
  const pCounts=countsFor('project'); const dCounts=countsFor('disposition'); const aCounts=countsFor('action');
  $('#projectFilters').innerHTML=filterButtons('project',['All',...projects],pCounts,state.project,state.ledger.ideas.length);
  $('#dispositionFilters').innerHTML=filterButtons('disposition',['All',...DISPOSITIONS],dCounts,state.disposition,state.ledger.ideas.length);
  $('#actionFilters').innerHTML=filterButtons('action',['All',...ACTIONS],aCounts,state.action,state.ledger.ideas.length);
  $$('.filter').forEach(btn=>btn.addEventListener('click',()=>{ state[btn.dataset.kind]=btn.dataset.value; NavigationUI.resetPages();ensureCurrentVisible(); renderAll(); }));
}
function filterButtons(kind,values,counts,active,total){
  return values.map((v,n)=>{const key=kind==='project'&&n>0?Retrieval.projectKey(v):v;return `<button type="button" class="filter ${key===active?'active':''}" data-kind="${kind}" data-value="${attr(key)}" aria-pressed="${key===active}"><span>${kind==='project'&&n>0&&NavigationUI.pins().includes(v)?'<span aria-hidden="true">★ </span>':''}${esc(kind==='project'&&n===0?'All projects':kind==='disposition'?EvolutionUI.dispositionLabel(v):v)}</span><span class="count" aria-label="${n===0?total:(counts.get(v)||0)} ideas">${n===0?total:(counts.get(v)||0)}</span></button>`;}).join('');
}

function renderStats(){
  const ideas=state.ledger.ideas, sources=state.ledger.sources;
  const unreviewed=ideas.filter(i=>review(i).disposition==='To review').length;
  const kept=ideas.filter(i=>review(i).disposition==='Keep').length;
  const included=ideas.filter(i=>review(i).include).length;
  $('#statusLine').innerHTML=`<span class="stat"><strong>${sources.length}</strong> raw sources</span><span class="stat"><strong>${ideas.length}</strong> ideas</span><span class="stat"><strong>${unreviewed}</strong> to review</span><span class="stat"><strong>${kept}</strong> kept</span><span class="stat"><strong>${included}</strong> in compilation</span><span class="stat">last confirmed <strong>${formatTime(state.ledger.meta?.updatedAt)}</strong></span>`;
}
function formatTime(iso){ if(!iso)return '—'; try{return new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return iso;} }

function ensureCurrentVisible(){NavigationUI.reconcile();}
function focusReviewStart(){requestAnimationFrame(()=>{window.scrollTo(0,0);$('.idea-title')?.focus({preventScroll:true});NavigationUI.remember();});}
function reviewPosition(){ const list=filteredIdeas(); return {list,index:list.findIndex(i=>i.id===state.reviewId)}; }
function go(delta){ const {list,index}=reviewPosition(); if(!list.length)return; const next=Math.max(0,Math.min(list.length-1,(index<0?0:index)+delta)); if(state.reviewId===list[next].id)return;state.reviewId=list[next].id;renderReview();focusReviewStart(); }
function nextUnreviewed(){ const all=filteredIdeas(); const current=Math.max(0,all.findIndex(i=>i.id===state.reviewId)); const seq=[...all.slice(current+1),...all.slice(0,current+1)]; const hit=seq.find(i=>review(i).disposition==='To review'); if(hit){state.reviewId=hit.id;renderReview();focusReviewStart();}else toast('No unreviewed ideas in the current filter.'); }

function renderReview(){
  ensureCurrentVisible();const view=$('#reviewView'); const {list,index}=reviewPosition();NavigationUI.trackQueue(list.map(i=>i.id));
  const i=ideaById(state.reviewId);
  if(!i || !list.length){ view.innerHTML=`<div class="empty"><h2>Nothing matches these filters.</h2><p>Change a filter or clear the search.</p></div>`; return; }
  const r=review(i), src=sourceById(i.source);
  const excerpt=(src?.raw||'').slice(0,2600);
  view.innerHTML=`
    <div class="review-layout">
      <article class="review-card">
        <div class="eyebrow"><span class="pill project">${esc(i.project)}</span><span class="pill type">${esc(i.type)}</span><span class="pill source">${esc(i.source)} · ${esc(i.id)}</span><span class="pill">${esc(IdeaModel.disposition(i))}</span></div>
        ${i.merge?`<p class="evolution-warning">Merged into <button type="button" class="link-button jump-idea" data-id="${attr(i.merge.into)}">${esc(ideaById(i.merge.into)?.title||'Missing idea')}</button>. This historical record remains available.</p>`:''}
        <button type="button" class="button thread-entry" data-thread="${attr(i.id)}">View thread</button>
        <h1 class="idea-title" tabindex="-1">${esc(i.title)}</h1>
        <div class="idea-summary">${esc(i.summary)}</div>
        <div class="tags">${(i.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>

        <div class="section-label">DISPOSITION</div>
        <div class="disposition-grid">${DISPOSITIONS.filter(d=>d!=='Archive').map(d=>`<button class="disp ${r.disposition===d?'active':''}" aria-pressed="${r.disposition===d}" data-value="${attr(d)}">${esc(EvolutionUI.dispositionLabel(d))}</button>`).join('')}</div>

        ${r.disposition==='Merge'?'<p class="tiny">Needs merge is a pending decision. Complete the operation using “Merge with other ideas” under Sources & evolution.</p>':''}
        <div class="section-label">ACTION / COMPILATION</div>
        <div class="controls-row">
          <select id="actionSelect" class="select" aria-label="Action">${ACTIONS.map(a=>`<option ${r.action===a?'selected':''}>${esc(a)}</option>`).join('')}</select>
          <label class="checkbox-row"><input id="includeCheck" type="checkbox" ${r.include?'checked':''}> Include in compilation</label>
        </div>

        <div class="section-label">YOUR COMMENT</div>
        <textarea aria-label="Your comment" id="commentBox" rows="5" placeholder="Why keep it? What superseded it? Merge target? What needs discussion?">${esc(saves.draft(i.id)?.patch.comment ?? r.comment)}</textarea>

        ${EvolutionUI.overview(i)}
        <div class="section-label">RAW SOURCE · ${esc(src?.title||i.source)}</div>
        <div class="source-box" tabindex="0" aria-label="Source excerpt">${esc(excerpt)}${src?.raw?.length>excerpt.length?'\n\n[…]':''}</div>
        <div class="source-actions"><button id="showRawBtn" class="link-button">Open full source</button><button id="editIdeaBtn" class="link-button">Edit extracted idea</button></div>

        <div class="review-nav"><div><button id="prevBtn" class="button" ${index<=0?'disabled':''}>← Previous</button> <button id="nextBtn" class="button" ${index>=list.length-1?'disabled':''}>Next →</button></div><span class="review-index">${index+1} / ${list.length} visible · ${esc(i.id)}</span><button id="nextUnreviewedBtn" class="button accent">Next unreviewed</button></div>
      </article>
      <aside class="review-sidebar">
        <div class="side-card"><h3>Lineage</h3><div id="lineageList" class="lineage-list">${EvolutionUI.lineage(i)}</div>${lineageForm(i.id)}</div>
        <div class="side-card"><h3>Keyboard</h3><div class="key-help"><kbd>K</kbd><span>Keep</span><kbd>Q</kbd><span>Open question</span><kbd>S</kbd><span>Superseded</span><kbd>H</kbd><span>Historical</span><kbd>M</kbd><span>Needs merge</span><kbd>X</kbd><span>Trash</span><kbd>C</kbd><span>Toggle compilation</span><kbd>← →</kbd><span>Previous / next</span><kbd>U</kbd><span>Next unreviewed</span></div></div>
      </aside>
    </div>`;

  $$('.disp').forEach(b=>b.addEventListener('click',()=>patchIdea(i.id,{disposition:b.dataset.value},true)));
  $('#actionSelect').addEventListener('change',e=>patchIdea(i.id,{action:e.target.value}));
  $('#includeCheck').addEventListener('change',e=>patchIdea(i.id,{include:e.target.checked}));
  $('#commentBox').addEventListener('input',e=>debouncedPatch(i.id,{comment:e.target.value},550));
  $('#prevBtn').onclick=()=>go(-1); $('#nextBtn').onclick=()=>go(1); $('#nextUnreviewedBtn').onclick=nextUnreviewed;
  $('#showRawBtn').onclick=()=>openSourceModal(i.source);
  $('#editIdeaBtn').onclick=()=>openEdit(i);
  $('#addLineageBtn').onclick=()=>addLineage(i.id);
  bindLineagePicker(i.id);
  $$('.remove-lineage').forEach(b=>b.onclick=()=>removeLineage(i.id,Number(b.dataset.index)));
  EvolutionUI.bindReview(i);
}
function renderLineage(items){ return items.length?items.map((r,idx)=>`<div class="lineage-item"><span><strong>${esc(r.relation)}</strong> <button class="link-button jump-idea" data-id="${attr(r.targetId)}">${esc(r.targetId)}</button>${r.note?`<br>${esc(r.note)}`:''}</span><button class="remove-lineage" data-index="${idx}" title="Remove">×</button></div>`).join(''):'<div class="tiny">No idea relationships recorded yet.</div>'; }
function lineageForm(){ return `<div class="lineage-add"><select id="relationSelect" aria-label="Relationship type">${RELATIONS.filter(r=>r!=='merged-into').map(r=>`<option>${esc(r)}</option>`).join('')}</select><div class="lineage-picker"><input id="relationTargetSearch" aria-label="Find a related idea" autocomplete="off" placeholder="Search title, keyword or ID…"><input id="relationTarget" type="hidden"><div id="lineageSuggestions" class="lineage-suggestions hidden"></div></div><input id="relationNote" aria-label="Relationship note" class="relation-note" placeholder="Optional note"><button id="addLineageBtn" class="button">Add relation</button></div>`; }
function renderLineageSuggestions(currentId,q){SearchUI.lineage(currentId,q);}
function bindLineagePicker(currentId){
  const input=$('#relationTargetSearch'), hidden=$('#relationTarget'); if(!input||!hidden)return;
  input.addEventListener('input',()=>{const raw=input.value.trim();const exact=ideaById(raw.toUpperCase());hidden.value=exact&&exact.id!==currentId?exact.id:'';renderLineageSuggestions(currentId,raw);});
  input.addEventListener('focus',()=>{if(!hidden.value)renderLineageSuggestions(currentId,input.value);});SearchUI.bindLineage();
}
async function addLineage(id){ const i=ideaById(id),r=review(i); let target=$('#relationTarget').value.trim(); if(!target){const typed=$('#relationTargetSearch').value.trim().toUpperCase();if(ideaById(typed))target=typed;} if(!target){toast('Search for and choose a target idea first.',true);return;} if(!ideaById(target)){toast(`No idea ${target} exists.`,true);return;} if($('#relationSelect').value==='supersedes'){await EvolutionUI.supersede(id,target,$('#relationNote').value.trim());return;} const lineage=[...(r.lineage||[]),{relation:$('#relationSelect').value,targetId:target,note:$('#relationNote').value.trim()}]; await patchIdea(id,{lineage},true); }
async function removeLineage(id,idx){ const r=review(ideaById(id)); const lineage=(r.lineage||[]).filter((_,i)=>i!==idx); await patchIdea(id,{lineage},true); }

function dispositionDot(d){ const c=d==='Keep'?'keep':d==='Open question'?'open':d==='Superseded'||d==='Historical'?'superseded':d==='Trash'?'trash':'review'; return `<span class="dot ${c}"></span>`; }
function renderBrowse(){
  const all=filteredIdeas(),info=Retrieval.page(all,state.pages.browse,40);state.pages.browse=info.page;
  $('#browseView').innerHTML=`<div class="browse-toolbar"><div class="tiny">${all.length} matching ideas. Open a title to review; Back restores this list.</div><button id="browseUnreviewed" class="button">Go to next unreviewed</button></div><div class="table-wrap"><table class="idea-table"><thead><tr><th>Title / match</th><th>Project</th><th>Type</th><th>Disposition</th><th>Action</th><th>ID</th></tr></thead><tbody>${info.items.map(i=>{const r=review(i),hit=state.search.trim()?SearchUI.getIndex().search(state.search).find(h=>h.item.id===i.id):null;return `<tr class="clickable browse-row" data-id="${attr(i.id)}"><td class="title-cell"><button type="button" class="browse-open" data-id="${attr(i.id)}">${esc(i.title)}</button>${hit?SearchUI.evidence(hit):''}<button type="button" class="link-button thread-entry" data-thread="${attr(i.id)}">View thread</button></td><td>${esc(i.project)}</td><td>${esc(i.type)}</td><td>${dispositionDot(r.disposition)}${esc(i.merge?'Merged into '+(ideaById(i.merge.into)?.title||'missing idea'):EvolutionUI.dispositionLabel(r.disposition))}</td><td>${esc(r.action)}</td><td class="mono">${esc(i.id)}</td></tr>`;}).join('')}</tbody></table></div>${SearchUI.pager(info,'browsePager')}`;
  $$('.browse-row').forEach(row=>row.onclick=()=>jumpToIdea(row.dataset.id));$('#browseUnreviewed').onclick=()=>{nextUnreviewed();switchView('review');};
  SearchUI.bindPager('browsePager',info,n=>{state.pages.browse=n;renderBrowse();NavigationUI.remember();$('#browseView .browse-open')?.focus();});
}
function renderSources(){
  const info=Retrieval.page(filteredSources(),state.pages.sources,25);state.pages.sources=info.page;
  $('#sourcesView').innerHTML=`<p class="results-explanation">Raw sources use the project and search filters. Disposition/action apply to ideas. Open Full Source for all contributions and reading controls.</p><div class="source-grid">${info.items.map(s=>{const refs=SearchUI.getIndex().contributions.get(s.id)||[],hit=state.search.trim()?SearchUI.getIndex().search(state.search,'sources').find(h=>h.item.id===s.id):null;return `<article class="source-card"><div class="eyebrow"><span class="pill project">${esc(s.project)}</span><span class="pill source">${esc(s.id)}</span><span class="pill">${refs.filter(i=>i.source===s.id).length} derived · ${refs.filter(i=>i.source!==s.id).length} additional contributions</span></div><h3>${esc(s.title)}</h3>${hit?SearchUI.evidence(hit):''}<div class="source-actions"><button type="button" class="button create-from-source" data-source="${attr(s.id)}">Create idea from this source</button><button type="button" class="link-button open-full-source" data-source="${attr(s.id)}">Open Full Source${refs.length>10?' · all '+refs.length+' contributions':''}</button></div><details class="inline-source" data-source="${attr(s.id)}"><summary>Show verbatim source</summary><div class="raw-text" tabindex="0"></div></details>${refs.length?`<div class="tags" style="margin-top:10px">${refs.slice(0,10).map(i=>`<button type="button" class="link-button jump-idea" data-id="${attr(i.id)}">${esc(i.title)} <span class="tiny">· ${i.source===s.id?'derived here':'contributing source'}</span></button>`).join('<span class="tiny"> · </span>')}</div>`:''}</article>`;}).join('')}</div>${SearchUI.pager(info,'sourcesPager')}`;
  $$('.inline-source').forEach(d=>d.ontoggle=()=>{if(d.open)d.querySelector('.raw-text').textContent=sourceById(d.dataset.source).raw;});
  $$('.create-from-source').forEach(b=>b.onclick=()=>EvolutionUI.openDerived(b.dataset.source).catch(e=>toast(e.message,true)));$$('.open-full-source').forEach(b=>b.onclick=()=>openSourceModal(b.dataset.source));bindIdeaJumps();
  SearchUI.bindPager('sourcesPager',info,n=>{state.pages.sources=n;renderSources();NavigationUI.remember();const heading=$('#sourcesView h3');if(heading){heading.tabIndex=-1;heading.focus();}});
}

function bindIdeaJumps(){ $$('.jump-idea').forEach(b=>b.onclick=e=>{e.preventDefault();EvolutionUI.leaveForJump();jumpToIdea(b.dataset.id);}); }

let sourceIdeasPage=0;
function renderSourceIdeas(){
  const refs=SearchUI.getIndex().contributions.get(state.activeSourceId)||[],query=$('#sourceIdeaSearch').value.trim(),allowed=query?new Set(SearchUI.getIndex().search(query).map(h=>h.item.id)):null;
  const info=Retrieval.page(refs.filter(i=>!allowed||allowed.has(i.id)),sourceIdeasPage,40);sourceIdeasPage=info.page;
  $('#sourceDialogIdeas').innerHTML=info.items.map(i=>`<button type="button" class="source-idea-link" data-id="${attr(i.id)}"><span>${esc(i.id)}</span><strong>${esc(i.title)}</strong></button><button type="button" class="link-button thread-entry" data-thread="${attr(i.id)}">View thread</button>`).join('')||'<div class="tiny">No matching contributions.</div>';
  $('#sourceIdeasPaging').innerHTML=SearchUI.pager(info,'sourceIdeasPager');SearchUI.bindPager('sourceIdeasPager',info,n=>{sourceIdeasPage=n;renderSourceIdeas();$('#sourceDialogIdeas .source-idea-link')?.focus();});
  $$('.source-idea-link').forEach(b=>b.onclick=()=>{const reader={sourceId:state.activeSourceId,scroll:$('#sourceDialogRaw').scrollTop,query:$('#sourceIdeaSearch').value,page:sourceIdeasPage,ideaId:b.dataset.id};$('#sourceDialog').close();jumpToIdea(b.dataset.id,{reader});});
}
function openSourceModal(sourceId){
  const src=sourceById(sourceId);if(!src)return;const changed=state.activeSourceId!==sourceId;state.activeSourceId=sourceId;const refs=SearchUI.getIndex().contributions.get(sourceId)||[];
  $('#sourceDialogTitle').textContent=src.title;$('#sourceDialogMeta').textContent=`${src.id} · ${src.project} · ${refs.filter(i=>i.source===sourceId).length} derived ideas · ${refs.filter(i=>i.source!==sourceId).length} additional contributions`;
  const raw=$('#sourceDialogRaw');if(changed||raw.textContent!==src.raw){raw.textContent=src.raw;raw.scrollTop=0;}raw.style.fontSize=`${state.sourceFontSize}px`;if(changed||!$('#sourceDialog').open){sourceIdeasPage=0;$('#sourceIdeaSearch').value='';}renderSourceIdeas();if(!$('#sourceDialog').open)$('#sourceDialog').showModal();
}

function restoreSourceContext(reader){openSourceModal(reader.sourceId);$('#sourceIdeaSearch').value=reader.query||'';sourceIdeasPage=reader.page||0;renderSourceIdeas();$('#sourceDialogRaw').scrollTop=reader.scroll||0;[...$$('.source-idea-link')].find(b=>b.dataset.id===reader.ideaId)?.focus({preventScroll:true});}
function adjustSourceFont(delta){state.sourceFontSize=Math.max(11,Math.min(22,state.sourceFontSize+delta));const el=$('#sourceDialogRaw');if(el)el.style.fontSize=`${state.sourceFontSize}px`;}
function openActiveSourceLibrary(){if(!state.activeSourceId)return;$('#sourceDialog').close();state.view='sources';state.project='All';state.search=state.activeSourceId;$('#searchInput').value=state.activeSourceId;renderAll();}

function compilation(project=state.compileProject){return IdeaModel.markdown(state.ledger,Retrieval.projectName(project)??'All',undefined,project!=='All');}
function renderCompile(){
  const projects=['All',...Retrieval.projects(state.ledger,NavigationUI.pins()).map(p=>Retrieval.projectKey(p.name))];
  const warnings=state.ledger.ideas.filter(i=>review(i).include&&(state.compileProject==='All'||i.project===Retrieval.projectName(state.compileProject))).flatMap(i=>IdeaModel.compilationWarnings(i,state.ledger.ideas).map(text=>({i,text})));
  $('#compileView').innerHTML=`<div class="panel">${warnings.length?`<div id="compilationWarnings" class="evolution-warning"><strong>Editorial conflicts — selection remains unchanged</strong><ul>${warnings.map(({i,text})=>`<li><button type="button" class="link-button jump-idea" data-id="${attr(i.id)}">${esc(i.title)}</button>: ${esc(text)}</li>`).join('')}</ul></div>`:''}<div class="compile-options"><label>Project <select id="compileProject">${projects.map(p=>`<option value="${attr(p)}" ${state.compileProject===p?'selected':''}>${esc(Retrieval.projectName(p)??'All')}</option>`).join('')}</select></label><span>Compilation uses only checked items.</span></div><div class="compile-toolbar"><button id="copyCompile" class="button">Copy Markdown</button><button id="downloadCompile" class="button accent">Download Markdown</button><button id="downloadKept" class="button">Export all kept Markdown</button></div><pre id="compileOutput" class="compile-output">${esc(compilation())}</pre></div>`;
  $('#compileProject').onchange=e=>{state.compileProject=e.target.value;renderCompile();};
  $('#copyCompile').onclick=async()=>{await navigator.clipboard.writeText(compilation());toast('Compilation copied.');};
  $('#downloadCompile').onclick=()=>downloadText(`${slug(state.compileProject)}_research_appendix.md`,compilation(),'text/markdown');
  $('#downloadKept').onclick=()=>downloadText('research_ledger_kept.md',keptMarkdown(),'text/markdown');
}
function keptMarkdown(){ const old=state.ledger.ideas.map(i=>review(i).include); state.ledger.ideas.forEach(i=>review(i).include=review(i).disposition==='Keep'); const out=compilation('All'); state.ledger.ideas.forEach((i,n)=>review(i).include=old[n]); return out; }
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'research';}

function renderAll(){if(!state.ledger)return;renderFilters();renderStats();renderViewVisibility();NavigationUI.toolbar();if(state.view==='review')renderReview();if(state.view==='browse')renderBrowse();if(state.view==='sources')renderSources();if(state.view==='compile')renderCompile();if(state.view==='search')SearchUI.renderComplete();if(state.view==='thread')ThreadUI.render();bindIdeaJumps();renderSearchResults();NavigationUI.remember();}
function renderViewVisibility(){const map={review:'#reviewView',browse:'#browseView',sources:'#sourcesView',compile:'#compileView',search:'#searchView',thread:'#threadView'};for(const[k,sel]of Object.entries(map))$(sel).classList.toggle('hidden',state.view!==k);$$('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
function switchView(v){state.view=v;renderAll();}

async function patchIdea(id, patch, rerender=false){
  if(!ideaById(id))return false;
  const ok=await saves.save(id,patch);
  if(ok){state.ledger=saves.ledger;ensureCurrentVisible();renderAll();}
  else toast(saves.draft(id)?.error?.message || 'The change was not saved. Your draft is retained.',true);
  return ok;
}
function debouncedPatch(id,patch,ms){saves.stage(id,patch,{delay:ms});}
function editValues(){const f=$('#editForm');return {title:f.elements.title.value,project:f.elements.project.value,type:f.elements.type.value,tags:[...new Set(f.elements.tags.value.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],summary:f.elements.summary.value};}
function recordEdit(){if(!editContext)return;const patch=editValues();saves.setForm('edit',JSON.stringify(patch)===JSON.stringify(editContext.initial)?null:{id:editContext.id,baseVersion:editContext.baseVersion,patch,initial:editContext.initial});}
function openEdit(i){
  const saved=saves.forms.edit;
  if(saved&&saved.id!==i.id){toast('A draft for another idea is retained. Use Review drafts to reopen it.',true);return;}
  const values=saved?.patch || {title:i.title,project:i.project,type:i.type,tags:i.tags||[],summary:i.summary};
  editContext={id:i.id,baseVersion:saved?.baseVersion||saves.versions[i.id],initial:saved?.initial||values};
  const f=$('#editForm');f.elements.id.value=i.id;for(const [k,v]of Object.entries(values))f.elements[k].value=k==='tags'?v.join(', '):v;
  $('#editError').textContent='';$('#editDialog').showModal();
}
async function saveEdit(){
  const f=$('#editForm');if(!f.reportValidity())return;recordEdit();
  const id=editContext.id;$('#editError').textContent='';f.inert=true;
  try{
    const ok=await saves.save(id,editValues(),{baseVersion:editContext.baseVersion});
    if(!ok){$('#editError').textContent=saves.draft(id)?.error?.message || 'Save failed. Your entered values are retained.';return;}
    saves.setForm('edit',null);$('#editDialog').close();ensureCurrentVisible();renderAll();toast('Idea saved.');
  }finally{f.inert=false;}
}
function captureValues(){const f=$('#captureForm');return {title:f.elements.title.value,project:f.elements.project.value,type:f.elements.type.value,tags:[...new Set(f.elements.tags.value.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],raw:f.elements.raw.value};}
function recordCapture(){const value=captureValues();saves.setForm('capture',value.raw||value.title||value.tags.length||value.project!=='Inbox'||value.type!=='Capture'?{...value,generation:saves.forms.capture?.generation||saves.generation,status:'unsaved'}:null);}
function openCapture(){
    $('#captureError').dataset.tone='error';
  const f=$('#captureForm'),saved=saves.forms.capture;f.reset();const values=saved||{project:'Inbox',type:'Capture'};
  for(const [k,v]of Object.entries(values))if(f.elements[k])f.elements[k].value=k==='tags'?v.join(', '):v;
  $('#captureError').textContent=saved?.error||'';$('#captureReviewCurrent').classList.toggle('hidden',saved?.status!=='conflict');$('#captureDialog').showModal();setTimeout(()=>f.elements.raw.focus(),0);
}
async function reviewCaptureGeneration(){
  try{
    const latest=await request('/api/ledger');
    if(!confirm(`The current ledger contains ${latest.ledger.sources.length} sources and ${latest.ledger.ideas.length} ideas. Add your retained capture to this ledger when you retry Save?`))return;
    saves.connect(latest);state.ledger=saves.ledger;
    if(saves.forms.capture)saves.setForm('capture',{...saves.forms.capture,generation:latest.generation,status:'unsaved',error:null});
    $('#captureReviewCurrent').classList.add('hidden');$('#captureError').dataset.tone='info';$('#captureError').textContent='The current ledger has been reviewed. Retry Save to add your retained capture.';renderAll();
  }catch(e){$('#captureError').textContent=e.message;}
}
async function saveCapture(){
  $('#captureError').dataset.tone='error';
  const f=$('#captureForm'),body=captureValues();if(!body.raw.trim()){toast('Write or paste a note first.',true);f.elements.raw.focus();return;}
  recordCapture();body.generation=saves.forms.capture.generation;saves.setForm('capture',{...saves.forms.capture,status:'saving'});f.inert=true;$('#captureError').textContent='';
  try{
    const out=await request('/api/captures',{method:'POST',body:JSON.stringify(body)});
    saves.accept(out);saves.setForm('capture',null);$('#captureDialog').close();f.reset();state.reviewId=out.idea.id;state.project='All';state.disposition='All';state.action='All';switchView('review');toast('Capture saved.');
  }catch(e){saves.setForm('capture',{...saves.forms.capture,status:e.status===409?'conflict':'failed',error:e.message});$('#captureReviewCurrent').classList.toggle('hidden',e.status!==409);$('#captureError').textContent=e.message+' Your capture draft is retained. If the connection was lost, check the ledger before retrying; the outcome may be uncertain.';toast('Capture was not acknowledged. Draft retained.',true);}
  finally{f.inert=false;}
}

function downloadText(name,text,type='text/plain'){ const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),700); }
async function exportLedger(){try{const out=await request('/api/ledger');downloadText(`research_ledger_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(out.ledger,null,2),'application/json');toast(saves.dirty()?'Exported confirmed state. Unsaved drafts were excluded.':'Confirmed ledger exported.');}catch(e){toast(e.message,true);}}
async function importLedger(file){try{await prepareReplacement(JSON.parse(await file.text()));}catch(e){toast(e.message,true);}}
async function prepareReplacement(ledger){
  await saves.flushAll();
  if(saves.dirty()){toast('Save or explicitly discard retained drafts before replacing the ledger. Use Review drafts.',true);return;}
  const preview=await request('/api/import/preview',{method:'POST',body:JSON.stringify({ledger})});replacementPlan={ledger,preview};
  const current=preview.current?`${preview.current.sources} sources / ${preview.current.ideas} ideas`:'Unreadable or missing canonical ledger';
  $('#replacementTitle').textContent=preview.mode==='recovery'?'Restore ledger':'Review whole-ledger replacement';
  $('#replacementSummary').textContent=`${current} → ${preview.candidate.sources} sources / ${preview.candidate.ideas} ideas\nSchema 2: compatible\nDisappearing source IDs: ${preview.missingSourceIds.length}\nDisappearing idea IDs: ${preview.missingIdeaIds.length}\nExisting raw sources whose text changes: ${preview.changedRawSourceIds.length}\n\n${preview.mode==='recovery'?'The damaged file will be preserved byte for byte before restoration.':'This replaces the entire ledger; it does not merge. A verified pre-import backup is required.'}\n\n${preview.missingSourceIds.length?'Removed sources: '+preview.missingSourceIds.join(', ')+'\n':''}${preview.missingIdeaIds.length?'Removed ideas: '+preview.missingIdeaIds.join(', ')+'\n':''}${preview.changedRawSourceIds.length?'Changed raw sources: '+preview.changedRawSourceIds.join(', '):''}`;
  $('#emptyConfirmRow').classList.toggle('hidden',!preview.empty);$('#confirmEmpty').checked=false;$('#replacementError').textContent='';
  $('#replacementCommit').textContent=preview.mode==='recovery'?'Restore this ledger':'Replace entire ledger';
  if(!$('#replacementDialog').open)$('#replacementDialog').showModal();
}
async function commitReplacement(){
  if(!replacementPlan)return;const {ledger,preview}=replacementPlan;
  if(preview.empty&&!$('#confirmEmpty').checked){$('#replacementError').textContent='Acknowledge the empty replacement first.';return;}
  const dialog=$('#replacementDialog');dialog.inert=true;
  try{
    const out=await request(preview.mode==='recovery'?'/api/recover':'/api/import',{method:'POST',body:JSON.stringify({ledger,confirmation:preview.confirmation,confirmEmpty:$('#confirmEmpty').checked})});
    dialog.close();replacementPlan=null;state.reviewId=null;state.search='';$('#searchInput').value='';state.project='All';state.disposition='All';state.action='All';await loadLedger();
    toast(out.backupFile?'Ledger replaced; the prior file was preserved.':'Ledger restored from a validated replacement.');
  }catch(e){$('#replacementError').textContent=e.message;}
  finally{dialog.inert=false;}
}
async function snapshot(){try{const out=await request('/api/snapshot',{method:'POST',body:'{}'});saves.backup=out.backup;updateSaveStatus();toast(`Verified snapshot saved: ${out.file}`);}catch(e){toast(e.message,true);$('#backupWarning').textContent=e.message;}}
function updateSaveStatus(){
  if(!saves)return;
  $('#saveState').textContent=state.ledger?saves.status():'Recovery mode';
  $('#saveState').dataset.state=saves.status();$('#reviewDrafts').classList.toggle('hidden',!saves.dirty());
  $('#backupWarning').textContent=[saves.storageWarning,saves.backup?.warning].filter(Boolean).join(' ');
}
async function reviewDrafts(){
  if($('#editDialog').open&&editContext&&saves.draft(editContext.id)){
    recordEdit();saves.stage(editContext.id,editValues(),{baseVersion:editContext.baseVersion});
  }
  if(saves.forms.edit&&!ideaById(saves.forms.edit.id)&&!saves.draft(saves.forms.edit.id)){
    const saved=saves.forms.edit;saves.stage(saved.id,saved.patch,{baseVersion:saved.baseVersion});
  }
  const entry=Object.entries(saves.drafts)[0];
  if(!entry){
    if(saves.forms.edit){const saved=saves.forms.edit;const i=ideaById(saved.id);if(i){if(!$('#editDialog').open)openEdit(i);return;}toast('This retained editor draft belongs to an idea no longer present. Export/copy its text before discarding.',true);}
    if(saves.forms.capture){if(!$('#captureDialog').open)openCapture();return;}
    EvolutionUI.restoreDraft();return;
  }
  const [id,draft]=entry;if(saves.runners.has(id)){toast('Wait for the pending save to finish.');return;}
  let latest;try{latest=await request('/api/ledger');}catch(e){toast(e.message,true);return;}
  const current=latest.ledger.ideas.find(i=>i.id===id);
  reviewedDraft={id,seq:draft.seq,version:latest.ideaVersions[id]};
  $('#draftTitle').textContent=current?.title||'Idea no longer present';
  const fieldValue=(i,k)=>i?(k in (i.review||{})?i.review[k]:i[k]):'(idea absent)';
  $('#draftComparison').textContent=Object.entries(draft.patch).map(([k,v])=>`${k}\nLatest saved:\n${typeof fieldValue(current,k)==='string'?fieldValue(current,k):JSON.stringify(fieldValue(current,k),null,2)}\n\nYour retained draft:\n${typeof v==='string'?v:JSON.stringify(v,null,2)}`).join('\n\n────────────────\n\n');
  $('#draftApply').disabled=!current;$('#draftError').textContent=draft.error?.message||'';$('#draftDialog').showModal();
}
async function applyReviewedDraft(){
  const reviewed=reviewedDraft;if(!reviewed)return;const draft=saves.draft(reviewed.id);
  if(!draft||draft.seq!==reviewed.seq){$('#draftError').textContent='The draft changed. Close this comparison and review it again.';return;}
  $('#draftDialog').inert=true;
  try{
    const ok=await saves.retry(reviewed.id,reviewed.version);
    if(!ok){$('#draftError').textContent=saves.draft(reviewed.id)?.error?.message||'Save failed. Draft retained.';return;}
    if(saves.forms.edit?.id===reviewed.id){saves.setForm('edit',null);$('#editDialog').close();}
    $('#draftDialog').close();ensureCurrentVisible();renderAll();toast('Reviewed draft saved.');
  }finally{$('#draftDialog').inert=false;}
}
async function showRecovery(error){
  state.ledger=null;const info=await request('/api/recovery');
  $('#searchInput').disabled=true;
  $$('.nav-item').forEach(b=>b.disabled=true);$('#captureBtn').disabled=true;$('#snapshotBtn').disabled=true;
  $$('.view').forEach(v=>v.classList.add('hidden'));$('#recoveryPanel')?.remove();
  const panel=document.createElement('section');panel.id='recoveryPanel';panel.className='panel';
  panel.innerHTML=`<h2>Recovery mode</h2><p>The ledger could not be read safely. Its existing bytes have not been changed.</p><p>${esc(info.reason||error.message)}</p><p>Restore a validated backup or choose a ledger JSON file. The damaged file will be preserved before any replacement.</p><label>Valid backups <select id="recoveryBackup" class="select">${info.backups.map(b=>`<option value="${attr(b.file)}">${esc(b.file)} · ${b.sources} sources / ${b.ideas} ideas</option>`).join('')}</select></label><div class="source-actions"><button id="previewRecoveryBackup" class="button" ${info.backups.length?'':'disabled'}>Review selected backup</button><button id="chooseRecoveryFile" class="button">Choose replacement JSON</button>${info.missing?'<button id="startEmptyNotebook" class="button accent">Create an empty notebook</button>':''}</div>`;
  $('.main').append(panel);$('#statusLine').innerHTML='';updateSaveStatus();
  $('#startEmptyNotebook')?.addEventListener('click',()=>prepareReplacement({schemaVersion:2,meta:{name:'thoughtFork'},sources:[],ideas:[]}).catch(e=>toast(e.message,true)));
  $('#chooseRecoveryFile').onclick=()=>$('#importJsonInput').click();
  $('#previewRecoveryBackup').onclick=async()=>{try{const out=await request('/api/backup?file='+encodeURIComponent($('#recoveryBackup').value));await prepareReplacement(out.ledger);}catch(e){toast(e.message,true);}};
}

function handleKeys(e){
  if(e.defaultPrevented||!NavigationUI.shortcutsEnabled()||e.metaKey||e.ctrlKey||e.altKey||document.querySelector('dialog[open]')||!state.ledger)return;
  const tag=document.activeElement?.tagName; if(['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable||e.target.closest('.search-result,.lineage-suggestion,.merge-candidate,#contentPreview'))return;
  if(e.key==='/'){e.preventDefault();$('#searchInput').focus();return;}
  if(e.key==='r'||e.key==='R'){switchView('review');return;} if(e.key==='b'||e.key==='B'){switchView('browse');return;}
  if(state.view!=='review')return;
  const map={k:'Keep',K:'Keep',q:'Open question',Q:'Open question',s:'Superseded',S:'Superseded',h:'Historical',H:'Historical',m:'Merge',M:'Merge',x:'Trash',X:'Trash'};
  if(map[e.key]){e.preventDefault();patchIdea(state.reviewId,{disposition:map[e.key]},true);return;}
  if(e.key==='c'||e.key==='C'){e.preventDefault();const i=ideaById(state.reviewId);if(i)patchIdea(i.id,{include:!(saves.draft(i.id)?.patch.include ?? review(i).include)},true);return;}
  if(e.key==='ArrowLeft'){e.preventDefault();go(-1);return;}if(e.key==='ArrowRight'){e.preventDefault();go(1);return;}if(e.key==='u'||e.key==='U'){e.preventDefault();nextUnreviewed();}
}


// Previews and result interactions live in search-ui.js.
function setup(){
  const browserStorage=name=>{try{return window[name];}catch(_){return {getItem:()=>{throw new Error('Storage unavailable');},setItem:()=>{throw new Error('Storage unavailable');}};}};
  saves=new SaveClient({request,storage:browserStorage('localStorage'),session:browserStorage('sessionStorage'),onChange:updateSaveStatus,onConfirmed:()=>{state.ledger=saves.ledger;SearchUI.invalidate();const moved=NavigationUI.reconcile();renderFilters();renderStats();updateSaveStatus();NavigationUI.remember();if(state.view==='thread')ThreadUI.render();if(moved){renderAll();focusReviewStart();}}});
  SearchUI.setup();EvolutionUI.setup();NavigationUI.setup();ThreadUI.setup();
  $('#editForm').addEventListener('input',recordEdit);$('#captureForm').addEventListener('input',recordCapture);
  $('#editForm').addEventListener('submit',e=>{e.preventDefault();saveEdit();});$('#captureForm').addEventListener('submit',e=>{e.preventDefault();saveCapture();});
  $('#reviewDrafts').onclick=$('#editReviewDraft').onclick=reviewDrafts;$('#captureReviewCurrent').onclick=reviewCaptureGeneration;
  $('#replacementCancel').onclick=()=>$('#replacementDialog').close();$('#replacementCommit').onclick=commitReplacement;
  $('#replacementRefresh').onclick=()=>prepareReplacement(replacementPlan.ledger).catch(e=>$('#replacementError').textContent=e.message);
  $('#draftClose').onclick=()=>$('#draftDialog').close();$('#draftApply').onclick=applyReviewedDraft;
  $('#draftDiscard').onclick=()=>{if(!reviewedDraft)return;if(!confirm('Discard this retained unsaved change? The saved idea will remain unchanged.'))return;if(saves.discard(reviewedDraft.id)){if(saves.forms.edit?.id===reviewedDraft.id){saves.setForm('edit',null);$('#editDialog').close();}$('#draftDialog').close();renderAll();}};
  $('#editDiscard').onclick=()=>{if(confirm('Discard this unsaved editor draft?')){if(saves.discard(editContext.id)){saves.setForm('edit',null);$('#editDialog').close();}}};
  $('#captureDiscard').onclick=()=>{if(confirm('Discard this unsaved capture?')){saves.setForm('capture',null);$('#captureForm').reset();$('#captureDialog').close();}};
  for(const id of ['editDialog','captureDialog','replacementDialog','draftDialog'])$('#'+id).addEventListener('cancel',e=>{if(e.target.inert||e.target.querySelector('form')?.inert)e.preventDefault();});
  window.addEventListener('beforeunload',e=>{if(saves.dirty()){saves.persist();e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saves.persist();});
  $$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  const search=$('#searchInput');
  search.addEventListener('input',e=>{state.search=e.target.value;NavigationUI.resetPages();ensureCurrentVisible();renderAll();});
  $('#captureBtn').onclick=openCapture;
  $('#captureClose').onclick=$('#captureCancel').onclick=()=>{if(!$('#captureForm').inert){recordCapture();$('#captureDialog').close();}};
  $('#editClose').onclick=$('#editCancel').onclick=()=>{if(!$('#editForm').inert){recordEdit();$('#editDialog').close();}};
  $('#sourceClose').onclick=()=>$('#sourceDialog').close();
  $('#sourceSmaller').onclick=()=>adjustSourceFont(-1); $('#sourceLarger').onclick=()=>adjustSourceFont(1);
  $('#sourceCopy').onclick=async()=>{const src=sourceById(state.activeSourceId);if(src){await navigator.clipboard.writeText(src.raw);toast('Raw source copied.');}};
  $('#sourceLibrary').onclick=openActiveSourceLibrary;$('#sourceIdeaSearch').oninput=()=>{sourceIdeasPage=0;renderSourceIdeas();};
  $('#snapshotBtn').onclick=snapshot;
  $('#exportJsonBtn').onclick=exportLedger;
  $('#importJsonBtn').onclick=()=>$('#importJsonInput').click();
  $('#importJsonInput').onchange=e=>{const f=e.target.files?.[0];if(f)importLedger(f);e.target.value='';};
  $('#captureSave').addEventListener('click',e=>{e.preventDefault();saveCapture();});
  $('#editSave').addEventListener('click',e=>{e.preventDefault();saveEdit();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap,#contentPreview'))$('#searchResults').classList.add('hidden');if(!e.target.closest('.lineage-picker,#contentPreview'))$('#lineageSuggestions')?.classList.add('hidden');});
  document.addEventListener('keydown',handleKeys);
}

setup();
loadLedger().then(()=>{if(!state.ledger)return;saves.resume();if(saves.forms.edit){const i=ideaById(saves.forms.edit.id);if(i)openEdit(i);}else if(saves.forms.capture)openCapture();else EvolutionUI.restoreDraft();}).catch(e=>{console.error(e);$('#reviewView').innerHTML=`<div class="empty"><h2>Could not load the ledger.</h2><p>${esc(e.message)}</p><p>Make sure you started it with <code>node server.js</code>, not by opening index.html directly.</p></div>`;toast(e.message,true);});

