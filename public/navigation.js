'use strict';
const NavigationUI=(()=>{
  const defaults=()=>({compact:false,sections:{},pinned:[],hiddenProjects:[],shortcuts:true});
  let prefs=defaults(),key=null,restored=false,drawer=false,queue=[],stack=[],projectSnapshot=null,generation=null;
  const narrow=()=>matchMedia('(max-width:760px)').matches;
  function storageRead(name){try{return JSON.parse(localStorage.getItem(name)||'null');}catch(_){return null;}}
  function write(){if(!key)return;try{localStorage.setItem(key,JSON.stringify({prefs,position:position()}));}catch(_){$('#navigationNotice').textContent='Navigation preferences could not be stored in this browser. Research saves and drafts have their own status above.';}}
  function position(){return {...Object.fromEntries(['view','project','disposition','action','search','reviewId','sort','pages','searchKind','compileProject','threadId','sourceSort','tagFilter','searchScope','viewSorts'].map(k=>[k,state[k]])),scroll:Math.max(0,scrollY),generation:saves?.generation};}
  function loaded(){
    const next='research-ledger-navigation:'+saves.key.split(':')[1];
    if(next!==key){key=next;restored=false;prefs=defaults();stack=[];}
    if(!restored){const saved=storageRead(key);if(saved?.prefs){prefs.compact=!!saved.prefs.compact;prefs.shortcuts=saved.prefs.shortcuts!==false;prefs.sections=saved.prefs.sections&&typeof saved.prefs.sections==='object'?saved.prefs.sections:{};prefs.pinned=Array.isArray(saved.prefs.pinned)?saved.prefs.pinned.filter(p=>typeof p==='string'):[];}
      prefs.hiddenProjects=Array.isArray(saved?.prefs?.hiddenProjects)?saved.prefs.hiddenProjects.filter(p=>typeof p==='string'):[];
      const p=saved?.position;if(p&&typeof p==='object'&&(!p.generation||p.generation===saves.generation)){
        if(Number.isFinite(p.scroll)&&p.scroll>=0&&p.scroll<1e8)requestAnimationFrame(()=>window.scrollTo(0,p.scroll));
        if(['review','browse','sources','compile','search','thread'].includes(p.view))state.view=p.view;
        for(const field of ['project','search','reviewId','compileProject','threadId'])if(typeof p[field]==='string')state[field]=p[field];
        if(DISPOSITIONS.includes(p.disposition)||p.disposition==='All')state.disposition=p.disposition;
        if(ACTIONS.includes(p.action)||p.action==='All')state.action=p.action;
        if(['original','title','updated','reviewed','created','created-oldest','updated-oldest','title-desc'].includes(p.sort))state.sort=p.sort;
        if(['all','ideas','sources'].includes(p.searchKind))state.searchKind=p.searchKind;
        for(const f of ['sourceSort','tagFilter','searchScope'])if(typeof p[f]==='string')state[f]=p[f];if(p.viewSorts&&typeof p.viewSorts==='object')state.viewSorts=p.viewSorts;
        if(p.pages&&typeof p.pages==='object')for(const field of ['browse','sources','search'])if(Number.isInteger(p.pages[field])&&p.pages[field]>=0)state.pages[field]=p.pages[field];
      }restored=true;$('#searchInput').value=state.search;}
    const names=new Set(Retrieval.projects(state.ledger).map(p=>p.name));if(state.project!=='All'&&!names.has(Retrieval.projectName(state.project)))state.project='All';
    if(state.compileProject!=='All'&&!names.has(Retrieval.projectName(state.compileProject)))state.compileProject='All';shell();
  }
  function shell(){
    const compact=narrow()?!drawer:prefs.compact;
    $('#app').classList.toggle('sidebar-compact',compact);$('#app').classList.toggle('drawer-open',narrow()&&drawer);
    $('#sidebarToggle').setAttribute('aria-expanded',String(!compact));$('#sidebarToggle').setAttribute('aria-label',compact?'Expand navigation and filters':'Collapse navigation');$('#sidebarToggle').title=compact?'Navigation and filters':'Collapse navigation';
    $('#sidebarToggle').textContent=compact?'☰':'‹';
    $('#railFilters').classList.toggle('has-filters',['project','disposition','action'].some(name=>state[name]!=='All'));
    $('#railFilters').setAttribute('aria-label', 'Open filters and project management'+(['project','disposition','action'].some(name=>state[name]!=='All')?' — filters active':''));
    const sidebar=$('.sidebar');if(narrow()&&drawer){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-label','Navigation and filters');}else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');sidebar.removeAttribute('aria-label');}
    $('.main').inert=narrow()&&drawer;$('#shortcutsEnabled').checked=prefs.shortcuts;
    $('#sidebarBackdrop').classList.toggle('hidden',!(narrow()&&drawer));
    for(const name of ['project','disposition','action']){const button=$(`[data-section="${name}"]`),body=$('#'+name+'Filters'),closed=!!prefs.sections[name];button.setAttribute('aria-expanded',String(!closed));body.hidden=closed;let badge=button.querySelector('.section-selection');if(!badge){badge=document.createElement('small');badge.className='section-selection';button.append(badge);}badge.textContent=state[name]!=='All'?(Retrieval.projectName(state[name])||state[name])+' · '+(state.ledger?.ideas.filter(i=>name==='project'?i.project===Retrieval.projectName(state.project):i.review[name]===state[name]).length||0)+' ideas':name==='project'&&state.ledger?Retrieval.projects(state.ledger).length+' projects':'';button.classList.toggle('has-selection',state[name]!=='All');}
  }
  function toggle(){if(narrow())drawer=!drawer;else prefs.compact=!prefs.compact;shell();write();$('#sidebarToggle').focus();}
  function closeDrawer(){if(drawer){drawer=false;shell();$('#sidebarToggle').focus();}}
  function pins(){return prefs.pinned;}
  function sidebarProjects(){return Retrieval.projects(state.ledger,prefs.pinned).filter(p=>p.ideas||p.sources||!prefs.hiddenProjects.includes(p.name)||Retrieval.projectName(state.project)===p.name); }
  function remember(){write();}
  function resetPages(){state.pages={browse:0,sources:0,search:0};}
  function trackQueue(ids){queue=ids;write();}
  function reconcile(){const next=filteredIdeas().map(i=>i.id),before=state.reviewId;state.reviewId=Retrieval.chooseCurrent(queue,before,next);queue=next;return before!==state.reviewId;}
  function capture(extra={}){
    const active=document.activeElement,focus=active?.id?{id:active.id}:active?.dataset.id?{data:active.dataset.id,kind:active.classList.contains('search-source')?'source':'idea'}:null;
    stack.push({position:structuredClone(position()),scroll:scrollY,focus,...extra});if(stack.length>12)stack.shift();
  }
  function back(){const entry=stack.pop();if(!entry)return;Object.assign(state,entry.position);$('#searchInput').value=state.search;ensureCurrentVisible();renderAll();requestAnimationFrame(()=>{if(entry.reader&&sourceById(entry.reader.sourceId)){restoreSourceContext(entry.reader);window.scrollTo(0,entry.scroll);return;}let el=entry.focus?.id?document.getElementById(entry.focus.id):null;if(!el&&entry.focus?.data)el=[...document.querySelectorAll('[data-id]')].find(b=>b.dataset.id===entry.focus.data&&b.matches(entry.focus.kind==='source'?'.search-source':'.search-idea,.browse-open,.jump-idea'));el?.focus({preventScroll:true});window.scrollTo(0,entry.scroll);});}
  function toolbar(){
    if(generation!==null&&generation!==saves.generation){stack=[];queue=[];}generation=saves.generation;
    const text=[state.project!=='All'?'Project: '+Retrieval.projectName(state.project):'',state.disposition!=='All'?EvolutionUI.dispositionLabel(state.disposition):'',state.action!=='All'?'Action: '+state.action:'',state.search?'Search: '+state.search:''].filter(Boolean).join(' · ');
    $('#navigationContext').innerHTML=`${stack.length?'<button id="navigationBack" type="button" class="button">← Back to previous context</button>':''}<span id="activeFilterSummary">${esc(text||'All ideas · no filters')}</span>${text?'<button id="clearFilters" type="button" class="link-button">Clear filters</button>':''}<label class="sort-control ${['sources','compile','thread'].includes(state.view)?'hidden':''}">Idea order <select id="ideaSort" aria-label="Idea order">${[['original','Original order / search relevance'],['updated','Recently edited'],['reviewed','Recently reviewed'],['created','Recently created'],['title','Title A–Z']].map(([value,label])=>`<option value="${value}" ${state.sort===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
    $('#navigationBack')?.addEventListener('click',back);$('#clearFilters')?.addEventListener('click',()=>{state.project=state.disposition=state.action='All';clearSearch();resetPages();ensureCurrentVisible();renderAll();});
    $('#ideaSort').onchange=e=>{state.sort=e.target.value;state.viewSorts||={};state.viewSorts[state.view]=state.sort;resetPages();ensureCurrentVisible();renderAll();$('#ideaSort').focus();};
    shell();write();
  }
  async function openProjects(){
    await saves.flushAll();if(saves.dirty()){toast('Save or review retained drafts before managing project assignments.',true);return;}
    projectSnapshot=await request('/api/ledger');saves.connect(projectSnapshot);state.ledger=saves.ledger;SearchUI.invalidate();loaded();renderAll();
    $('#projectCreateName').value='';$('#projectRenameTo').value='';$('#projectCombine').checked=false;$('#projectError').textContent='';$('#projectError').dataset.tone='error';renderProjects();closeDrawer();$('#projectsDialog').showModal();$('#projectRenameFrom').focus();
  }
  function renderProjects(selected){
    const items=Retrieval.projects(state.ledger,prefs.pinned),select=$('#projectRenameFrom'),chosen=selected||select.value;
    select.innerHTML=items.map(p=>`<option value="${attr(p.name)}">${esc(p.name)}</option>`).join('');if(items.some(p=>p.name===chosen))select.value=chosen;
    $('#projectList').innerHTML=items.map(p=>`<li><div><strong>${esc(p.name)}</strong><span>${p.ideas} ideas · ${p.sources} sources</span></div><div class="project-tools"><button type="button" class="button project-up" data-project="${attr(p.name)}" aria-label="Move ${attr(p.name)} up" ${items.indexOf(p)===0?'disabled':''}>↑</button><button type="button" class="button project-down" data-project="${attr(p.name)}" aria-label="Move ${attr(p.name)} down" ${items.indexOf(p)===items.length-1?'disabled':''}>↓</button>${!p.ideas&&!p.sources?`<button type="button" class="button project-hide" data-project="${attr(p.name)}" aria-pressed="${prefs.hiddenProjects.includes(p.name)}">${prefs.hiddenProjects.includes(p.name)?'Show':'Hide empty'}</button>`:''}<button type="button" class="button project-pin" data-project="${attr(p.name)}" aria-pressed="${prefs.pinned.includes(p.name)}">${prefs.pinned.includes(p.name)?'Unpin':'Pin'}<span class="sr-only"> ${esc(p.name)}</span></button></div></li>`).join('');
    $$('.project-pin').forEach(b=>b.onclick=()=>{const name=b.dataset.project;prefs.pinned=prefs.pinned.includes(name)?prefs.pinned.filter(p=>p!==name):[...prefs.pinned,name];write();renderProjects(select.value);renderFilters();[...$$('.project-pin')].find(el=>el.dataset.project===name)?.focus();});
    $$('.project-up,.project-down').forEach(b=>{const order=items.map(p=>p.name),at=order.indexOf(b.dataset.project),target=at+(b.classList.contains('project-up')?-1:1);b.disabled=target<0||target>=order.length||prefs.pinned.includes(order[at])!==prefs.pinned.includes(order[target]);b.onclick=()=>{if(b.disabled)return;[order[at],order[target]]=[order[target],order[at]];manageProject({operation:'reorder',order},b.dataset.project);};});
    $$('.project-hide').forEach(b=>b.onclick=()=>{const name=b.dataset.project;prefs.hiddenProjects=prefs.hiddenProjects.includes(name)?prefs.hiddenProjects.filter(p=>p!==name):[...prefs.hiddenProjects,name];write();renderProjects(name);renderFilters();[...$$('.project-hide')].find(el=>el.dataset.project===name)?.focus();});
    $('#projectRenameCommit').disabled=!items.length;renameSummary();
  }
  function renameSummary(){
    const from=$('#projectRenameFrom').value,to=$('#projectRenameTo').value.trim(),items=Retrieval.projects(state.ledger),a=items.find(p=>p.name===from),b=items.find(p=>p.name===to),combines=!!b&&from!==to;
    $('#projectRenameSummary').textContent=a?`Rename ${a.ideas} idea assignments and ${a.sources} source assignments.${combines?` Combine with “${to}” (${b.ideas} ideas, ${b.sources} sources).`:''} Raw text and existing history stay intact.`:'No projects yet. Create one above or use a project name in a capture.';
    $('#projectCombineRow').classList.toggle('hidden',!combines);$('#projectRenameCommit').textContent=combines?'Combine project categories':'Rename project';
  }
  async function renameProject(){
    $('#projectError').dataset.tone='error';
    const form=$('#projectRenameForm');if(!form.reportValidity())return;const from=$('#projectRenameFrom').value,to=$('#projectRenameTo').value.trim();
    if(Retrieval.projects(state.ledger).some(p=>p.name===to)&&from!==to&&!$('#projectCombine').checked){$('#projectError').textContent='Confirm combining these existing categories first.';return;}
    form.inert=true;$('#projectError').textContent='';
    try{const out=await request('/api/projects/rename',{method:'POST',body:JSON.stringify({from,to,baseVersion:projectSnapshot.version,confirmCombine:$('#projectCombine').checked})});
      saves.connect(out);state.ledger=saves.ledger;SearchUI.invalidate();projectSnapshot=out;prefs.pinned=[...new Set(prefs.pinned.map(p=>p===from?to:p))];prefs.hiddenProjects=[...new Set(prefs.hiddenProjects.map(p=>p===from?to:p))];
      if(Retrieval.projectName(state.project)===from)state.project=Retrieval.projectKey(to);if(Retrieval.projectName(state.compileProject)===from)state.compileProject=Retrieval.projectKey(to);
      stack=[];$('#projectRenameTo').value='';$('#projectCombine').checked=false;renderProjects(to);ensureCurrentVisible();renderAll();$('#projectError').dataset.tone='success';$('#projectError').textContent=`Saved: ${out.renamed.ideas} ideas and ${out.renamed.sources} sources reassigned. Raw text unchanged.`;
    }catch(e){$('#projectError').textContent=e.message+' Your entered name is retained. Review latest projects before retrying.';}finally{form.inert=false;}
  }
  async function manageProject(body,selected){
    $('#projectsDialog').inert=true;$('#projectError').textContent='';$('#projectError').dataset.tone='error';
    try{const out=await request('/api/projects/manage',{method:'POST',body:JSON.stringify({...body,baseVersion:projectSnapshot.version})});saves.connect(out);state.ledger=saves.ledger;projectSnapshot=out;SearchUI.invalidate();$('#projectCreateName').value='';renderProjects(selected||body.name);renderAll();$('#projectError').dataset.tone='success';$('#projectError').textContent=body.operation==='create'?'Project created. It is ready for your next capture or idea.':'Project order saved.';}
    catch(e){$('#projectError').textContent=e.message+' Review latest projects before retrying. Your entered name is retained.';}finally{$('#projectsDialog').inert=false;const target=selected?[...$$('.project-up,.project-down')].find(b=>b.dataset.project===selected&&!b.disabled):$('#projectCreateName');target?.focus();}
  }
  async function refreshProjects(){const fresh=await request('/api/ledger');projectSnapshot=fresh;saves.connect(fresh);state.ledger=saves.ledger;SearchUI.invalidate();renderProjects();renderAll();$('#projectCombine').checked=false;$('#projectError').dataset.tone='info';$('#projectError').textContent='Latest assignments loaded. Review the counts and confirm any category combination again.';}
  function setup(){
    let scrollTimer;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(write,200);},{passive:true});window.addEventListener('pagehide',write);
    $('#shortcutsEnabled').onchange=e=>{prefs.shortcuts=e.target.checked;write();};
    $('#sidebarToggle').onclick=toggle;$('#railFilters').onclick=()=>{if(narrow())drawer=true;else prefs.compact=false;shell();write();$('[data-section=project]').focus();};$('#sidebarBackdrop').onclick=closeDrawer;
    $$('[data-section]').forEach(b=>b.onclick=()=>{prefs.sections[b.dataset.section]=!prefs.sections[b.dataset.section];shell();write();});
    $('#manageProjects').onclick=()=>openProjects().catch(e=>toast(e.message,true));$('#projectsClose').onclick=()=>$('#projectsDialog').close();$('#projectRenameForm').onsubmit=e=>{e.preventDefault();renameProject();};
    $('#projectCreateForm').onsubmit=e=>{e.preventDefault();if($('#projectCreateForm').reportValidity())manageProject({operation:'create',name:$('#projectCreateName').value.trim()});};
    $('#projectRenameFrom').onchange=$('#projectRenameTo').oninput=()=>{$('#projectCombine').checked=false;renameSummary();};$('#projectRefresh').onclick=()=>refreshProjects().catch(e=>$('#projectError').textContent=e.message);
    matchMedia('(max-width:760px)').addEventListener('change',()=>{drawer=false;shell();});
    document.addEventListener('keydown',e=>{if(!drawer||!narrow()||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();closeDrawer();}if(e.key==='Tab'){const focusable=[...$('.sidebar').querySelectorAll('button,input,select,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    for(const dialog of $$('dialog')){const title=dialog.querySelector('h2');if(title){title.id||=dialog.id+'Title';dialog.setAttribute('aria-labelledby',title.id);}let opener=null;dialog.addEventListener('beforetoggle',e=>{if(e.newState==='open')opener=document.activeElement;});dialog.addEventListener('close',()=>{requestAnimationFrame(()=>{if(document.querySelector('dialog[open]'))return;if(opener?.isConnected&&opener!==document.body&&!opener.closest('.hidden')&&opener.getClientRects().length)opener.focus({preventScroll:true});else{const target=[$('.idea-title'),$('#searchHeading'),$('#searchInput')].find(el=>el?.getClientRects().length&&!el.closest('.hidden'));if(target){if(target.tagName!=='INPUT')target.tabIndex=-1;target.focus({preventScroll:true});}}});});}
    document.addEventListener('click',e=>{if(e.target.closest('.nav-item,.filter')&&drawer)closeDrawer();});
    shell();
  }
  return {setup,loaded,shell,pins,sidebarProjects,remember,resetPages,trackQueue,reconcile,capture,back,toolbar,closeDrawer,shortcutsEnabled:()=>prefs.shortcuts&&!drawer};
})();


