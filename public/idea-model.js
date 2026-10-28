'use strict';
// Pure helpers shared by the server, interface and regression tests. No mutation on read.
(function(root){
  function origins(idea){
    const refs=(idea.provenance||[]).map(p=>({...p}));
    if(!refs.some(p=>p.sourceId===idea.source))refs.unshift({sourceId:idea.source});
    return refs;
  }
  function unionOrigins(ideas){const refs=new Map();for(const i of ideas)for(const p of origins(i))refs.set(JSON.stringify([p.sourceId,p.sourceRevision||0,p.start??null,p.end??null]),p);return [...refs.values()];}
  function connections(ideas){
    const edges=[];
    for(const i of ideas){
      for(const r of i.review.lineage||[])edges.push({from:i.id,to:r.targetId,relation:r.relation,note:r.note||'',completed:false});
      if(i.merge){const existing=edges.find(e=>e.from===i.id&&e.to===i.merge.into&&e.relation==='merged-into');if(existing)existing.completed=true;else edges.push({from:i.id,to:i.merge.into,relation:'merged-into',note:'Completed merge',completed:true});}
    }
    return edges;
  }
  function replacements(ideas){return connections(ideas).filter(e=>e.relation==='supersedes'||e.relation==='merged-into').map(e=>({older:e.relation==='supersedes'?e.to:e.from,newer:e.relation==='supersedes'?e.from:e.to,kind:e.relation,completed:e.completed}));}
  function successors(id,ideas){const byId=new Map(ideas.map(i=>[i.id,i]));return [...new Set(replacements(ideas).filter(e=>e.older===id).map(e=>e.newer))].map(id=>byId.get(id)).filter(Boolean);}
  function currentInheritors(id,ideas){
    const next=new Map();for(const e of replacements(ideas)){if(!next.has(e.older))next.set(e.older,new Set());next.get(e.older).add(e.newer);}
    const seen=new Set([id]),pending=[...(next.get(id)||[])],ends=[];
    while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);const following=next.get(current);if(following?.size)pending.push(...following);else ends.push(current);}
    const byId=new Map(ideas.map(i=>[i.id,i]));return [...new Set(ends)].map(id=>byId.get(id)).filter(Boolean);
  }
  function disposition(idea){return idea.merge?'Merged away':idea.review.disposition==='Merge'?'Needs merge':idea.review.disposition;}
  function compilationWarnings(idea,ideas){
    if(!idea.review.include)return [];
    const warnings=[];
    if(idea.merge)warnings.push('Included despite being merged into another idea.');
    else if(['Trash','Superseded'].includes(idea.review.disposition))warnings.push(`Included with disposition ${idea.review.disposition}.`);
    for(const next of successors(idea.id,ideas))if(!next.review.include)warnings.push(`Successor “${next.title}” is not included.`);
    return warnings;
  }
  function relationText(relation,ideas){const target=ideas.find(i=>i.id===relation.targetId);return `${relation.relation} “${target?.title||'Missing idea'}” (${relation.targetId})${relation.note?` — ${relation.note}`:''}`;}
  function sourceRaw(ref,source){const n=ref.sourceRevision||0;return source?.revisions?.[n]?.raw??source?.raw??'';}
  function sourceText(ref,sources){const source=sources.find(s=>s.id===ref.sourceId);return `${source?.title||'Missing source'} (${ref.sourceId}${source?.revisions?.length?' · source revision '+(ref.sourceRevision||0):''})${ref.start!==undefined?` · excerpt: ${sourceRaw(ref,source).slice(ref.start,ref.end)||''}`:''}`;}
  function markdown(ledger,project='All',generated=new Date().toLocaleString(),exactProject=false){
    const selected=ledger.ideas.filter(i=>i.review.include&&((project==='All'&&!exactProject)||i.project===project)),groups=new Map();
    for(const idea of selected){if(!groups.has(idea.project))groups.set(idea.project,[]);groups.get(idea.project).push(idea);}
    let out=`# Research compilation\n\nGenerated ${generated}. Only items explicitly marked “Include in compilation” are included.\n\n`;
    if(!selected.length)return out+'_No included items match this project filter._\n';
    const edges=connections(ledger.ideas);
    for(const[p,ideas]of groups){out+=`## ${p}\n\n`;for(const i of ideas){
      out+=`### ${i.title}\n\n${i.summary}\n\n- ID: ${i.id}\n- Type: ${i.type}\n- Disposition: ${disposition(i)}\n`;
      out+='- Sources:\n'+origins(i).map(ref=>'  - '+sourceText(ref,ledger.sources).replace(/\n/g,'\n    ')).join('\n')+'\n';
      if(i.tags.length)out+='- Tags: '+i.tags.map(t=>'#'+t).join(' ')+'\n';
      if(i.review.comment)out+='- Comment: '+i.review.comment+'\n';
      const outgoing=edges.filter(e=>e.from===i.id);
      if(outgoing.length)out+='- Lineage: '+outgoing.map(e=>relationText({relation:e.relation,targetId:e.to,note:e.completed?'Completed merge':e.note},ledger.ideas)).join('; ')+'\n';
      const merged=edges.filter(e=>e.to===i.id&&e.relation==='merged-into'&&e.completed);
      if(merged.length)out+='- Merged from: '+merged.map(e=>`“${ledger.ideas.find(x=>x.id===e.from)?.title||'Missing idea'}” (${e.from})`).join('; ')+'\n';
      const warnings=compilationWarnings(i,ledger.ideas);if(warnings.length)out+='- Editorial warnings: '+warnings.join(' ')+'\n';out+='\n';
    }}return out;
  }
  function assertAcyclic(ideas){
    const next=new Map(ideas.map(i=>[i.id,new Set()])),degree=new Map(ideas.map(i=>[i.id,0]));
    for(const {older,newer}of replacements(ideas)){if(!next.get(older)?.has(newer)){next.get(older)?.add(newer);degree.set(newer,(degree.get(newer)||0)+1);}}
    const ready=[...degree].filter(([,n])=>n===0).map(([id])=>id);let count=0;
    for(let n=0;n<ready.length;n++){const id=ready[n];count++;for(const to of next.get(id)||[]){degree.set(to,degree.get(to)-1);if(degree.get(to)===0)ready.push(to);}}
    if(count!==ideas.length)throw new Error('Supersession/merge would create a replacement cycle. No changes were saved.');
  }
  const api={sourceRaw,origins,unionOrigins,connections,replacements,successors,currentInheritors,disposition,compilationWarnings,relationText,sourceText,markdown,assertAcyclic};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IdeaModel=api;
})(typeof window==='undefined'?globalThis:window);
