'use strict';
// Focused provenance/evolution UI; persistence continues through the existing save client/API.
const EvolutionUI=(()=>{
  let derivedContext=null,originContext=null,mergeContext=null,selectedExcerpt=null,derivedReview=null,originReview=null;
  const model=()=>IdeaModel;
  const dispositionLabel=value=>value==='Merge'?'Needs merge':value;
  const ideaLink=(id,label)=>`<button type="button" class="link-button jump-idea" data-id="${attr(id)}">${esc(label||ideaById(id)?.title||'Missing idea')}</button>`;
  function sourceReferences(idea){return model().origins(idea).map(p=>{const s=sourceById(p.sourceId);return `<li><button type="button" class="link-button open-origin" data-source="${attr(p.sourceId)}">${esc(s?.title||'Missing source')}</button><span class="tiny"> · ${esc(s?.project||'')} · ${p.sourceId===idea.source?'primary origin':'contributing origin'}${p.start!==undefined?' · excerpt':''}</span>${p.start!==undefined?`<blockquote class="origin-excerpt" tabindex="0">${esc(s?.raw.slice(p.start,p.end)||'')}</blockquote>`:''}</li>`;}).join('');}
  function lineDescription(edge,incoming){
    const other=incoming?edge.from:edge.to;
    if(edge.relation==='merged-into')return incoming?`${ideaLink(other)} ${edge.completed?'was merged into this idea':'links into this idea (legacy merge link)'}`:`${edge.completed?'Merged into':'Legacy merge link to'} ${ideaLink(other)}`;
    const verb={'derived-from':'derives from','related-to':'is related to'}[edge.relation]||edge.relation;
    return incoming?`${ideaLink(other)} ${esc(verb)} this idea`:`${esc(verb)} ${ideaLink(other)}`;
  }
  function lineage(idea){
    const edges=model().connections(state.ledger.ideas),out=edges.filter(e=>e.from===idea.id),incoming=edges.filter(e=>e.to===idea.id);
    const render=(list,isIncoming)=>list.length?list.map(e=>{const index=idea.review.lineage.findIndex(r=>r.relation===e.relation&&r.targetId===e.to);return `<div class="lineage-item"><span>${lineDescription(e,isIncoming)}${e.note?`<br>${esc(e.note)}`:''}</span>${!isIncoming&&!e.completed&&index>=0?`<button type="button" class="remove-lineage" data-index="${index}" aria-label="Remove ${attr(e.relation)} relationship">×</button>`:''}</div>`;}).join(''):'<p class="tiny">None recorded.</p>';
    return `<div class="lineage-direction">This idea</div>${render(out,false)}<div class="lineage-direction">Other ideas</div>${render(incoming,true)}`;
  }
  function warnings(idea){const list=model().compilationWarnings(idea,state.ledger.ideas);return list.length?`<div class="evolution-warning" role="status"><strong>Compilation review</strong><ul>${list.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><small>Selection is yours; nothing was unchecked.</small></div>`:'';}
  function eventValue(value){
    if(value==null)return '';
    return Object.entries(value).map(([key,value])=>{
      if(key==='operationId')return '';
      if(key==='into'||key==='ideaId')return `${key==='into'?'Merged into':'Idea'}: ${ideaById(value)?.title||'Missing idea'}`;
      if(key==='contributorIds')return 'Contributors: '+value.map(id=>ideaById(id)?.title||'Missing idea').join('; ');
      if(key==='sourceId')return 'Source: '+(sourceById(value)?.title||'Missing source');
      if(key==='provenance')return 'Sources: '+value.map(p=>model().sourceText(p,state.ledger.sources)).join('; ');
      if(key==='lineage')return 'Relationships: '+(value.map(r=>model().relationText(r,state.ledger.ideas)).join('; ')||'none');
      if(key==='disposition')value=dispositionLabel(value);
      if(key==='origin')return `Created by: ${{'user-capture':'Quick Capture','source-extraction':'source extraction'}[value]||value}`;
      if(key==='tags')return 'Tags: '+value.map(t=>'#'+t).join(' ');
      if(key==='include')return `Compilation: ${value?'included':'excluded'}`;
      return `${key}: ${typeof value==='string'?value:JSON.stringify(value)}`;
    }).filter(Boolean).join('\n');
  }
  function history(idea){
    const labels={'created':'Idea created','content-edited':'Idea text edited','disposition-changed':'Disposition changed','compilation-changed':'Compilation selection changed','relationships-changed':'Relationships changed','provenance-added':'Contributing source added','merged-into':'Merged into another idea','merge-completed':'Ideas merged into this survivor','superseded-by':'Superseded by another idea','supersession-removed':'Supersession link removed','project-renamed':'Project renamed'};
    return `<details class="idea-history"><summary>Recorded changes (${idea.history?.length||0})</summary>${idea.history?.length?`<ol>${[...idea.history].reverse().map(e=>`<li><strong>${esc(labels[e.type]||e.type)}</strong> <time datetime="${attr(e.at)}">${esc(new Date(e.at).toLocaleString())}</time>${e.relatedIdeaIds?.length?`<div>${e.relatedIdeaIds.map(id=>ideaLink(id)).join(' · ')}</div>`:''}<details><summary>Before / after</summary>${e.before?`<div class="history-value"><strong>Before</strong>\n${esc(eventValue(e.before))}</div>`:''}<div class="history-value"><strong>After</strong>\n${esc(eventValue(e.after))}</div></details></li>`).join('')}</ol>`:'<p>No change events were recorded for this legacy idea before this upgrade.</p>'}</details>`;
  }
  function overview(idea){
    const edges=model().connections(state.ledger.ideas);
    const prior=edges.filter(e=>(e.to===idea.id&&e.relation==='merged-into')||(e.from===idea.id&&['derived-from','refines','supersedes'].includes(e.relation)));
    const later=edges.filter(e=>(e.to===idea.id&&['derived-from','refines','supersedes'].includes(e.relation))||(e.from===idea.id&&e.relation==='merged-into'));
    const list=items=>items.length?`<ul>${items.map(e=>`<li>${lineDescription(e,e.to===idea.id)}</li>`).join('')}</ul>`:'<p class="tiny">No links recorded yet.</p>';
    const inheritors=model().currentInheritors(idea.id,state.ledger.ideas);
    return `${idea.review.disposition==='Archive'?'<p class="tiny">Legacy Archive state — retained and filterable.</p>':''}${warnings(idea)}<details id="ideaEvolution" class="idea-evolution"><summary>Sources & evolution · ${new Set(model().origins(idea).map(p=>p.sourceId)).size} source(s)</summary><button type="button" class="button thread-entry" data-thread="${attr(idea.id)}">View thread</button><h3>Where this idea came from</h3><ul class="origin-list">${sourceReferences(idea)}</ul><button id="addOriginBtn" type="button" class="link-button">Add contributing source</button><h3>Inherited or developed from</h3>${list(prior)}<h3>What became of this idea</h3>${list(later)}${inheritors.length?`<p>Latest linked inheritor${inheritors.length===1?'':'s'}: ${inheritors.map(i=>`${ideaLink(i.id)} <span class="tiny">(${esc(model().disposition(i))})</span>`).join(' · ')}</p>`:''}<p>Disposition: <strong>${esc(model().disposition(idea))}</strong> · ${idea.review.include?'Included in compilation':'Not included in compilation'}</p><details><summary>Review context</summary><p class="history-value">${esc(idea.review.comment||'No comment recorded.')}</p></details>${history(idea)}<div class="source-actions"><button id="mergeIdeasBtn" type="button" class="button">Merge with other ideas…</button></div></details>`;
  }
  function bindReview(idea){
    $('#addOriginBtn').onclick=()=>openOrigin(idea.id).catch(e=>toast(e.message,true));$('#mergeIdeasBtn').onclick=()=>openMerge(idea.id).catch(e=>toast(e.message,true));
    $$('.open-origin').forEach(b=>b.onclick=()=>openSourceModal(b.dataset.source));bindIdeaJumps();
  }
  async function ready(except){await saves.flushAll();if(Object.keys(saves.drafts).length||Object.keys(saves.forms).some(k=>k!==except)){toast('Save or review the other retained drafts first.',true);return false;}return true;}
  function readSelection(){
    const root=$('#sourceDialogRaw'),selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
    const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
    const start=before.toString().length,end=start+range.toString().length;
    return {start,end,excerpt:sourceById(state.activeSourceId).raw.slice(start,end)};
  }
  function excerptFields(source,value,selection){
    if(!value)return {};
    const normalized=s=>s.replace(/\r\n?/g,'\n');
    if(selection&&normalized(value)===normalized(source.raw.slice(selection.start,selection.end)))return {start:selection.start,end:selection.end};
    return {excerpt:value};
  }
  function derivedValues(){const f=$('#derivedForm');return {title:f.elements.title.value,summary:f.elements.summary.value,project:f.elements.project.value,type:f.elements.type.value,tags:[...new Set(f.elements.tags.value.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],excerpt:f.elements.excerpt.value};}
  function recordDerived(status='unsaved',error=null){if(!derivedContext)return;const values=derivedValues();saves.setForm('derived',values.title||values.summary||values.excerpt?{...derivedContext,values,status,error}:null);}
  async function openDerived(sourceId,restored=false){
    $('#derivedError').dataset.tone='error';
    if(!restored&&!await ready('derived'))return;
    const saved=saves.forms.derived;if(saved&&saved.sourceId!==sourceId){toast('A derived-idea draft for another source is retained. Use Review drafts.',true);return;}
    const source=sourceById(sourceId);if(!source&&!saved){toast('This source is no longer in the current ledger.',true);return;}
    derivedContext=saved?{sourceId:saved.sourceId,generation:saved.generation,selection:saved.selection,sourceTitle:saved.sourceTitle}:{sourceId,generation:saves.generation,selection:selectedExcerpt,sourceTitle:source.title};selectedExcerpt=null;
    const f=$('#derivedForm');f.reset();const values=saved?.values||{title:'',summary:'',project:source.project,type:'Note',tags:[],excerpt:derivedContext.selection?.excerpt||''};
    for(const[k,v]of Object.entries(values))f.elements[k].value=k==='tags'?v.join(', '):v;
    $('#derivedSourceTitle').textContent=source?.title||saved?.sourceTitle||'Original source no longer present';$('#derivedError').textContent=!source?'This source was removed by a ledger replacement. Your text is retained here for copying or explicit discard.':saved?.error||'';$('#derivedSave').disabled=$('#derivedAnother').disabled=!source;$('#derivedLatest').classList.add('hidden');derivedReview=null;$('#derivedDialog').showModal();if(values.excerpt)recordDerived();f.elements.title.focus();
  }
  async function saveDerived(another=false){
    $('#derivedError').dataset.tone='error';
    const f=$('#derivedForm');if(!f.reportValidity())return;recordDerived('saving');const values=derivedValues(),source=sourceById(derivedContext.sourceId);
    if(!source){recordDerived('conflict','The original source is absent.');$('#derivedError').textContent='The original source is absent. Copy or discard your retained draft.';return;}
    const body={...values,sourceId:source.id,generation:derivedContext.generation,...excerptFields(source,values.excerpt,derivedContext.selection)};delete body.excerpt;if(!('start'in body)&&values.excerpt)body.excerpt=values.excerpt;
    let createdAnother=false;f.inert=true;$('#derivedError').textContent='';
    try{
      const out=await request('/api/ideas',{method:'POST',body:JSON.stringify(body)});saves.accept(out);saves.setForm('derived',null);
      if($('#sourceDialog').open)openSourceModal(source.id);
      if(another){createdAnother=true;f.elements.title.value='';f.elements.summary.value='';f.elements.excerpt.value='';derivedContext={sourceId:source.id,generation:saves.generation,selection:null,sourceTitle:source.title};f.elements.title.focus();}
      else $('#derivedDialog').close();
      ensureCurrentVisible();renderAll();toast('Derived idea saved; the raw source is unchanged.');
    }catch(e){recordDerived(e.status===409?'conflict':'failed',e.message);$('#derivedError').textContent=e.message+' Your draft is retained. No automatic retry is performed.';}
    finally{f.inert=false;if(createdAnother)f.elements.title.focus();}
  }
  function originValues(){return {sourceId:$('#originSource').value,excerpt:$('#originExcerpt').value};}
  function recordOrigin(status='unsaved',error=null){if(originContext)saves.setForm('origin',{...originContext,...originValues(),status,error});}
  function sourceOptions(query,selected){const matches=state.ledger.sources.filter(s=>[s.title,s.project].join(' ').toLowerCase().includes(query.toLowerCase()));$('#originSource').innerHTML=matches.map(s=>`<option value="${attr(s.id)}" ${s.id===selected?'selected':''}>${esc(s.title)} · ${esc(s.project)}</option>`).join('');}
  async function openOrigin(id,restored=false){
    $('#originError').dataset.tone='error';
    if(!restored&&!await ready('origin'))return;const idea=ideaById(id),saved=saves.forms.origin;
    if(!idea&&!saved){toast('The idea is no longer present.',true);return;}
    originContext={id,baseVersion:saved?.baseVersion||saves.versions[id],ideaTitle:idea?.title||saved?.ideaTitle};$('#originIdeaTitle').textContent=idea?.title||saved?.ideaTitle||'Original idea no longer present';$('#originSearch').value='';sourceOptions('',saved?.sourceId);if(saved?.sourceId&&!sourceById(saved.sourceId))$('#originSource').value='';$('#originExcerpt').value=saved?.excerpt||'';$('#originError').textContent=!idea?'The idea was removed by a replacement. Copy or explicitly discard this retained source-reference draft.':saved?.error||'';$('#originSave').disabled=!idea;$('#originLatest').classList.add('hidden');originReview=null;$('#originDialog').showModal();
  }
  async function saveOrigin(){
    $('#originError').dataset.tone='error';
    if(!$('#originSource').value){$('#originError').textContent='Choose a source by its title.';return;}
    recordOrigin('saving');const form=$('#originForm');form.inert=true;
    try{const values=originValues(),out=await request(`/api/ideas/${encodeURIComponent(originContext.id)}/provenance`,{method:'POST',body:JSON.stringify({...values,baseVersion:originContext.baseVersion})});saves.accept(out);saves.setForm('origin',null);$('#originDialog').close();renderAll();toast('Contributing source recorded.');}
    catch(e){recordOrigin(e.status===409?'conflict':'failed',e.message);$('#originError').textContent=e.message;}
    finally{form.inert=false;}
  }
  function mergeValues(){const f=$('#mergeForm');return {title:f.elements.title.value,summary:f.elements.summary.value,project:f.elements.project.value,type:f.elements.type.value,tags:[...new Set(f.elements.tags.value.split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],disposition:f.elements.disposition.value};}
  function fillSurvivor(idea){const f=$('#mergeForm');for(const k of ['title','summary','project','type'])f.elements[k].value=idea[k];f.elements.tags.value=idea.tags.join(', ');f.elements.disposition.value=idea.review.disposition==='Archive'?'Keep':idea.review.disposition;}
  function recordMerge(status='unsaved',error=null){if(!mergeContext)return;saves.setForm('merge',mergeContext.ids.length>=2?{...mergeContext,values:mergeValues(),status,error}:null);}
  function mergeCandidates(){SearchUI.mergeCandidates($('#mergeSearch').value,mergeContext.ids,id=>{mergeContext.ids.push(id);mergeContext.ideaVersions[id]=saves.versions[id];renderMerge();recordMerge();});}
  function participantCard(idea){const edges=model().connections(state.ledger.ideas).filter(e=>e.from===idea.id||e.to===idea.id);return `<details class="merge-participant" open><summary>${esc(idea.title)}</summary><p>${esc(idea.project)} · ${esc(idea.type)} · ${esc(model().disposition(idea))}</p><p>${idea.tags.map(t=>esc('#'+t)).join(' ')}</p><div class="participant-summary" tabindex="0">${esc(idea.summary)}</div><h4>Sources</h4><ul class="origin-list">${sourceReferences(idea)}</ul><h4>Comment</h4><p class="history-value">${esc(idea.review.comment||'No comment')}</p><h4>Connections</h4>${edges.length?`<ul>${edges.map(e=>`<li>${lineDescription(e,e.to===idea.id)}</li>`).join('')}</ul>`:'<p>No connections recorded.</p>'}<p>Compilation: ${idea.review.include?'included':'not included'} · ${idea.history?.length||0} recorded changes</p>${idea.id!==mergeContext.survivorId?`<button type="button" class="link-button merge-remove" data-id="${attr(idea.id)}">Remove from this merge</button>`:''}</details>`;}
  function renderMerge(){
    const select=$('#mergeSurvivor');select.innerHTML=mergeContext.ids.map(id=>`<option value="${attr(id)}" ${id===mergeContext.survivorId?'selected':''}>${esc(ideaById(id)?.title||'Missing idea')}</option>`).join('');
    $('#mergeParticipants').innerHTML=mergeContext.ids.map(id=>ideaById(id)?participantCard(ideaById(id)):`<div class="merge-participant">A previously selected idea is no longer in this ledger.${id!==mergeContext.survivorId?` <button type="button" class="link-button merge-remove" data-id="${attr(id)}">Remove missing participant</button>`:''}</div>`).join('');$('#mergeConfirmed').checked=false;$('#mergeCommit').disabled=mergeContext.ids.some(id=>!ideaById(id)||ideaById(id).merge);
    $$('.merge-remove').forEach(b=>b.onclick=()=>{mergeContext.ids=mergeContext.ids.filter(id=>id!==b.dataset.id);renderMerge();recordMerge();});
    $$('#mergeParticipants .open-origin').forEach(b=>b.onclick=()=>openSourceModal(b.dataset.source));bindIdeaJumps();mergeCandidates();
  }
  async function openMerge(id,restored=false){
    $('#mergeError').dataset.tone='error';
    if(!restored&&!await ready('merge'))return;
    const saved=saves.forms.merge;
    if(!saved){const fresh=await request('/api/ledger');saves.connect(fresh);state.ledger=saves.ledger;}
    const idea=ideaById(id||saved?.survivorId);if(!idea&&!saved){toast('The original merge survivor is missing.',true);return;}
    if(!saved&&idea.merge){toast('This idea was already merged away. Follow its current inheritor first.',true);return;}
    mergeContext=saved?{ids:[...saved.ids],survivorId:saved.survivorId,ideaVersions:{...saved.ideaVersions}}:{ids:[idea.id],survivorId:idea.id,ideaVersions:{[idea.id]:saves.versions[idea.id]}};
    $('#mergeForm').reset();$('#mergeDisposition').innerHTML=DISPOSITIONS.filter(d=>d!=='Archive').map(d=>`<option value="${attr(d)}">${esc(dispositionLabel(d))}</option>`).join('');
    if(saved){for(const[k,v]of Object.entries(saved.values))$('#mergeForm').elements[k].value=k==='tags'?v.join(', '):v;}else fillSurvivor(idea);
    $('#mergeError').textContent=saved?.error||'';renderMerge();$('#mergeDialog').showModal();$('#mergeSearch').focus();
  }
  async function refreshMerge(){
    $('#mergeError').dataset.tone='error';
    if(!await ready('merge'))return;const values=mergeValues(),fresh=await request('/api/ledger');saves.connect(fresh);state.ledger=saves.ledger;
    if(mergeContext.ids.some(id=>!ideaById(id)||ideaById(id).merge)){$('#mergeError').textContent='A participant disappeared or was merged away. Remove it and choose its latest inheritor. Your survivor text is retained.';renderMerge();return;}
    mergeContext.ideaVersions=Object.fromEntries(mergeContext.ids.map(id=>[id,saves.versions[id]]));for(const[k,v]of Object.entries(values))$('#mergeForm').elements[k].value=k==='tags'?v.join(', '):v;
    renderMerge();recordMerge();$('#mergeError').dataset.tone='info';$('#mergeError').textContent='Latest participants loaded. Review their content and check the confirmation again.';
  }
  async function saveMerge(){
    $('#mergeError').dataset.tone='error';
    const f=$('#mergeForm');if(!f.reportValidity())return;
    if(mergeContext.ids.length<2||!$('#mergeConfirmed').checked){$('#mergeError').textContent='Select at least two ideas and explicitly confirm the reviewed merge.';return;}
    recordMerge('saving');f.inert=true;$('#mergeError').textContent='';
    try{const out=await request('/api/merge',{method:'POST',body:JSON.stringify({...mergeContext,survivorPatch:mergeValues()})});saves.accept(out);saves.setForm('merge',null);$('#mergeDialog').close();state.reviewId=out.idea.id;state.project='All';state.disposition='All';state.action='All';state.search='';$('#searchInput').value='';switchView('review');toast('Merge saved. Contributors and all raw sources remain available.');}
    catch(e){recordMerge(e.status===409?'conflict':'failed',e.message);$('#mergeError').textContent=e.message;}
    finally{f.inert=false;}
  }
  async function supersede(newerId,olderId,note){
    if(!await ready())return false;const newer=ideaById(newerId),older=ideaById(olderId);
    if(!confirm(`“${newer.title}” replaces “${older.title}”. Mark the older idea Superseded and record the link? Both ideas and their compilation selections will be retained.`))return false;
    try{const out=await request(`/api/ideas/${encodeURIComponent(newerId)}/supersede`,{method:'POST',body:JSON.stringify({baseVersion:saves.versions[newerId],targetId:olderId,targetVersion:saves.versions[olderId],note})});saves.accept(out);ensureCurrentVisible();renderAll();return true;}
    catch(e){toast(e.message,true);return false;}
  }
  async function reviewDerivedSource(){
    $('#derivedError').dataset.tone='error';
    if(!await ready('derived'))return;
    const fresh=await request('/api/ledger'),source=fresh.ledger.sources.find(s=>s.id===derivedContext.sourceId);
    if(!source){$('#derivedError').textContent='The original source is absent. Copy or discard your retained idea; no origin will be substituted automatically.';return;}
    derivedReview={fresh,source};$('#derivedLatestText').textContent=source.raw;$('#derivedLatest').classList.remove('hidden');$('#derivedLatest').open=true;
    $('#derivedError').dataset.tone='info';$('#derivedError').textContent='Review this latest source, then explicitly use it for your retained draft.';
  }
  function useReviewedSource(){
    if(!derivedReview)return;const {fresh,source}=derivedReview;saves.connect(fresh);state.ledger=saves.ledger;
    derivedContext={sourceId:source.id,sourceTitle:source.title,generation:fresh.generation,selection:null};recordDerived();
    $('#derivedSourceTitle').textContent=source.title;$('#derivedSave').disabled=$('#derivedAnother').disabled=false;$('#derivedLatest').classList.add('hidden');$('#derivedError').dataset.tone='info';$('#derivedError').textContent='Latest source reviewed. Your idea text is unchanged; retry Save when ready.';renderAll();
  }
  async function reviewOriginIdea(){
    $('#originError').dataset.tone='error';
    if(!await ready('origin'))return;
    const fresh=await request('/api/ledger'),idea=fresh.ledger.ideas.find(i=>i.id===originContext.id);
    if(!idea){$('#originError').textContent='This idea is absent. Copy or discard the retained excerpt; no target will be substituted.';return;}
    originReview={fresh,idea};$('#originLatestText').textContent=`${idea.title}\n${idea.project} · ${idea.type}\n\n${idea.summary}\n\nCurrent origins: ${IdeaModel.origins(idea).map(p=>fresh.ledger.sources.find(s=>s.id===p.sourceId)?.title||'Missing source').join('; ')}`;$('#originLatest').classList.remove('hidden');$('#originLatest').open=true;
  }
  function useReviewedIdea(){
    if(!originReview)return;const {fresh,idea}=originReview,chosen=$('#originSource').value;
    saves.connect(fresh);state.ledger=saves.ledger;originContext={id:idea.id,ideaTitle:idea.title,baseVersion:fresh.ideaVersions[idea.id]};sourceOptions('',chosen);if(!fresh.ledger.sources.some(s=>s.id===chosen))$('#originSource').value='';recordOrigin();$('#originSave').disabled=false;$('#originLatest').classList.add('hidden');$('#originError').dataset.tone='info';$('#originError').textContent='Latest idea reviewed. Choose the contributing source and retry Add source.';renderAll();
  }
  function restoreDraft(){if(saves.forms.derived){openDerived(saves.forms.derived.sourceId,true).catch(e=>toast(e.message,true));return true;}if(saves.forms.origin){openOrigin(saves.forms.origin.id,true).catch(e=>toast(e.message,true));return true;}if(saves.forms.merge){openMerge(saves.forms.merge.survivorId,true).catch(e=>toast(e.message,true));return true;}return false;}
  function leaveForJump(){
    if($('#mergeDialog').open)recordMerge();if($('#derivedDialog').open)recordDerived();
    for(const id of ['mergeDialog','derivedDialog','originDialog','sourceDialog'])if($('#'+id).open)$('#'+id).close();
  }
  function setup(){
    $('#derivedReviewSource').onclick=()=>reviewDerivedSource().catch(e=>$('#derivedError').textContent=e.message);$('#derivedUseSource').onclick=useReviewedSource;$('#originReviewLatest').onclick=()=>reviewOriginIdea().catch(e=>$('#originError').textContent=e.message);$('#originUseLatest').onclick=useReviewedIdea;
    $('#sourceCreate').onmousedown=()=>{selectedExcerpt=readSelection();};$('#sourceCreate').onclick=()=>{selectedExcerpt||=readSelection();openDerived(state.activeSourceId).catch(e=>toast(e.message,true));};
    $('#derivedForm').addEventListener('input',()=>recordDerived());$('#derivedForm').onsubmit=e=>{e.preventDefault();saveDerived();};$('#derivedSave').onclick=()=>saveDerived();$('#derivedAnother').onclick=()=>saveDerived(true);$('#derivedCancel').onclick=()=>{if(!$('#derivedForm').inert){recordDerived();$('#derivedDialog').close();}};$('#derivedDiscard').onclick=()=>{if(confirm('Discard this derived-idea draft?')){saves.setForm('derived',null);$('#derivedDialog').close();}};
    $('#originSearch').oninput=()=>sourceOptions($('#originSearch').value,$('#originSource').value);$('#originSource').onchange=()=>recordOrigin();$('#originExcerpt').oninput=()=>recordOrigin();$('#originForm').onsubmit=e=>{e.preventDefault();saveOrigin();};$('#originSave').onclick=saveOrigin;$('#originCancel').onclick=()=>{if(!$('#originForm').inert)$('#originDialog').close();};$('#originDiscard').onclick=()=>{if(confirm('Discard this source-reference draft?')){saves.setForm('origin',null);$('#originDialog').close();}};
    $('#mergeSearch').oninput=mergeCandidates;$('#mergeForm').addEventListener('input',()=>recordMerge());$('#mergeSurvivor').onchange=()=>{if(!confirm('Use this selected idea as the survivor and load its text into the editor?')){$('#mergeSurvivor').value=mergeContext.survivorId;return;}mergeContext.survivorId=$('#mergeSurvivor').value;fillSurvivor(ideaById(mergeContext.survivorId));renderMerge();recordMerge();};$('#mergeForm').onsubmit=e=>{e.preventDefault();saveMerge();};$('#mergeCommit').onclick=saveMerge;$('#mergeRefresh').onclick=()=>refreshMerge().catch(e=>$('#mergeError').textContent=e.message);$('#mergeCancel').onclick=()=>{if(!$('#mergeForm').inert){recordMerge();$('#mergeDialog').close();}};$('#mergeDiscard').onclick=()=>{if(confirm('Discard this merge draft? Saved ideas will be unchanged.')){saves.setForm('merge',null);$('#mergeDialog').close();}};
    for(const id of ['derivedDialog','originDialog','mergeDialog'])$('#'+id).addEventListener('cancel',e=>{if(e.target.querySelector('form')?.inert)e.preventDefault();});
  }
  return {overview,lineage,bindReview,sourceReferences,warnings,setup,restoreDraft,openDerived,dispositionLabel,supersede,leaveForJump};
})();
