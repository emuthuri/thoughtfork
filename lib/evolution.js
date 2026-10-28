'use strict';
const {randomUUID}=require('crypto');
const Model=require('../public/idea-model');
const EVENT_TYPES=['created','content-edited','disposition-changed','compilation-changed','relationships-changed','provenance-added','merged-into','merge-completed','superseded-by','supersession-removed','project-renamed'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validate(ledger,fail){
  const sources=new Map(ledger.sources.map(s=>[s.id,s])),ids=new Set(ledger.ideas.map(i=>i.id));
  for(const i of ledger.ideas){
    if(i.provenance!==undefined){
      if(!Array.isArray(i.provenance)||!i.provenance.length)fail('Provenance must be a non-empty array when present.');
      const seen=new Set();
      for(const p of i.provenance){
        if(!object(p)||typeof p.sourceId!=='string'||!sources.has(p.sourceId))fail('Provenance source does not exist.');
        if(Object.keys(p).some(k=>!['sourceId','start','end','sourceRevision'].includes(k)))fail('Unknown provenance field.');
        if(p.sourceRevision!==undefined&&(!Number.isInteger(p.sourceRevision)||p.sourceRevision<0||p.sourceRevision>(sources.get(p.sourceId).revisions?.length||0)))fail('Invalid source revision.');
        if((p.start!==undefined||p.end!==undefined)&&(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||p.end>Model.sourceRaw(p,sources.get(p.sourceId)).length))fail('Source excerpt range is outside the verbatim text.');
        const key=JSON.stringify([p.sourceId,p.sourceRevision||0,p.start??null,p.end??null]);if(seen.has(key))fail('Duplicate source provenance reference.');seen.add(key);
      }
      if(!i.provenance.some(p=>p.sourceId===i.source))fail('Provenance must retain the primary source.');
    }
    if(i.merge!==undefined){
      if(!object(i.merge)||typeof i.merge.into!=='string'||!ids.has(i.merge.into)||i.merge.into===i.id||typeof i.merge.operationId!=='string'||typeof i.merge.at!=='string'||!Number.isFinite(Date.parse(i.merge.at)))fail('Invalid completed merge metadata.');
    }
    if(i.history!==undefined){
      if(!Array.isArray(i.history))fail('Idea history must be an array.');const seen=new Set();
      for(const e of i.history){
        if(!object(e)||typeof e.id!=='string'||seen.has(e.id)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||!EVENT_TYPES.includes(e.type))fail('Invalid or duplicate idea history event.');seen.add(e.id);
        for(const k of ['before','after'])if(e[k]!==undefined&&e[k]!==null&&!object(e[k]))fail('History before/after must be objects or null.');
        if(e.relatedIdeaIds!==undefined&&(!Array.isArray(e.relatedIdeaIds)||new Set(e.relatedIdeaIds).size!==e.relatedIdeaIds.length||e.relatedIdeaIds.some(id=>!ids.has(id))))fail('History references a missing or duplicate idea.');
      }
    }
  }
  try{Model.assertAcyclic(ledger.ideas);}catch(e){fail(e.message);}
}
function record(idea,at,type,before,after,relatedIdeaIds=[]){idea.history||=[];idea.history.push({id:randomUUID(),at,type,before,after,...(relatedIdeaIds.length?{relatedIdeaIds}: {})});}
function meaningfulChanges(idea,before,at){
  const contentBefore={},contentAfter={};
  if(before.title!==idea.title){contentBefore.title=before.title;contentAfter.title=idea.title;}
  const normalized=s=>s.replace(/\s+/g,' ').trim();
  if(normalized(before.summary)!==normalized(idea.summary)){contentBefore.summary=before.summary;contentAfter.summary=idea.summary;}
  if(Object.keys(contentAfter).length)record(idea,at,'content-edited',contentBefore,contentAfter);
  if(before.review.disposition!==idea.review.disposition)record(idea,at,'disposition-changed',{disposition:before.review.disposition},{disposition:idea.review.disposition});
  if(before.review.include!==idea.review.include)record(idea,at,'compilation-changed',{include:before.review.include},{include:idea.review.include});
  if(!same(before.review.lineage,idea.review.lineage))record(idea,at,'relationships-changed',{lineage:before.review.lineage},{lineage:idea.review.lineage});
}
function sourceRef(body,source,fail){
  if(!source)fail('The selected raw source does not exist.');
  const ref={sourceId:source.id,...(source.revisions?.length?{sourceRevision:source.revisions.length}:{})};
  if(body.sourceRevision!==undefined&&body.sourceRevision!==(source.revisions?.length||0))fail('Source changed. Review the current source before extracting.');
  if(body.excerpt!==undefined&&typeof body.excerpt!=='string')fail('Excerpt must be text.');
  if(body.start!==undefined||body.end!==undefined){ref.start=body.start;ref.end=body.end;if(!Number.isInteger(ref.start)||!Number.isInteger(ref.end)||ref.start<0||ref.end<=ref.start||ref.end>source.raw.length)fail('Invalid excerpt range.');if(body.excerpt!==undefined&&source.raw.slice(ref.start,ref.end)!==body.excerpt)fail('The selected excerpt no longer matches this source.');}
  else if(body.excerpt){
    // Textareas normalize Windows newlines. Match that representation, then map
    // the range back to the original bytes' UTF-16 offsets without editing raw.
    let text='';const offsets=[];
    for(let n=0;n<source.raw.length;n++){offsets.push(n);if(source.raw[n]==='\r'){text+='\n';if(source.raw[n+1]==='\n')n++;}else text+=source.raw[n];}
    offsets.push(source.raw.length);const excerpt=body.excerpt.replace(/\r\n?/g,'\n'),start=text.indexOf(excerpt);
    if(start<0)fail('The excerpt must be copied exactly from the raw source.');
    if(start!==text.lastIndexOf(excerpt))fail('This passage occurs more than once. Select its exact occurrence in the Full Source reader, or use the whole source.');
    ref.start=offsets[start];ref.end=offsets[start+excerpt.length];
  }
  return ref;
}
module.exports={validate,record,meaningfulChanges,sourceRef,same,Model};
