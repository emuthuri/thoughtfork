'use strict';
// A read-only projection of existing lineage, merge metadata, origins and recorded events.
(function(root){
 const structural=new Set(['refines','derived-from','supersedes','merged-into']);
 const relations=new Set([...structural,'supports','contradicts','related-to']);
 const labels={'created':'Origin recorded','content-edited':'Idea text changed','disposition-changed':'Disposition changed','compilation-changed':'Compilation changed','relationships-changed':'Relationships changed','provenance-added':'Source added','merged-into':'Merged into another idea','merge-completed':'Merge completed','superseded-by':'Superseded by another idea','supersession-removed':'Supersession removed','project-renamed':'Project renamed'};
 const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?x:null;
 class Index{
  constructor(ledger){
   this.ideas=new Map((ledger.ideas||[]).map(i=>[i.id,i]));this.sources=new Map((ledger.sources||[]).map(s=>[s.id,s]));this.adj=new Map([...this.ideas.keys()].map(id=>[id,[]]));this.edges=[];this.invalid=[];
   const add=e=>{if(!relations.has(e.relation)||!this.ideas.has(e.to)||e.from===e.to){this.invalid.push(e);return;}const prior=this.edgesByKey.get(JSON.stringify([e.from,e.to,e.relation]));if(prior){if(e.completed){prior.completed=true;prior.at=e.at;}return;}this.edgesByKey.set(JSON.stringify([e.from,e.to,e.relation]),e);this.edges.push(e);this.adj.get(e.from).push(e);this.adj.get(e.to).push(e);};this.edgesByKey=new Map();
   for(const i of this.ideas.values()){for(const r of Array.isArray(i.review?.lineage)?i.review.lineage:[])add({from:i.id,to:r?.targetId,relation:r?.relation,note:typeof r?.note==='string'?r.note:'',completed:false});if(i.merge)add({from:i.id,to:i.merge.into,relation:'merged-into',note:'',completed:true,at:date(i.merge.at)});}
  }
  direction(e){return e.relation==='merged-into'?{older:e.from,newer:e.to}:{older:e.to,newer:e.from};}
  neighborhood(focal){
   if(!this.ideas.has(focal))return {ids:[],edges:[],warnings:['This idea is no longer available.'],sources:[],events:[],groups:{},current:[]};
   const family=new Set([focal]),pending=[focal];for(let p=0;p<pending.length;p++)for(const e of this.adj.get(pending[p])||[])if(structural.has(e.relation)){const other=e.from===pending[p]?e.to:e.from;if(!family.has(other)){family.add(other);pending.push(other);}}
   const ids=new Set(family);for(const id of family)for(const e of this.adj.get(id)||[])ids.add(e.from===id?e.to:e.from);
   const edges=this.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),flow=edges.filter(e=>structural.has(e.relation));
   const traverse=forward=>{const seen=new Map([[focal,0]]),todo=[focal];for(let p=0;p<todo.length;p++)for(const e of this.adj.get(todo[p])||[]){if(!structural.has(e.relation))continue;const d=this.direction(e),a=forward?d.older:d.newer,b=forward?d.newer:d.older;if(a===todo[p]&&family.has(b)&&!seen.has(b)){seen.set(b,seen.get(a)+1);todo.push(b);}}seen.delete(focal);return seen;};
   const earlier=traverse(false),later=traverse(true),groups={earlier:[],focal:[focal],later:[],context:[]},warnings=[];
   for(const id of ids){if(id===focal)continue;if(earlier.has(id)&&later.has(id))groups.context.push(id);else if(earlier.has(id))groups.earlier.push(id);else if(later.has(id))groups.later.push(id);else groups.context.push(id);}
   const order=(a,b)=>(earlier.get(a)||later.get(a)||0)-(earlier.get(b)||later.get(b)||0)||this.ideas.get(a).title.localeCompare(this.ideas.get(b).title);for(const group of Object.values(groups))group.sort(order);
   // Kahn detects development cycles without recursion. Contradictions/support are not temporal edges.
   const degrees=new Map([...family].map(id=>[id,0])),next=new Map([...family].map(id=>[id,[]]));for(const e of flow){const d=this.direction(e);next.get(d.older)?.push(d.newer);degrees.set(d.newer,(degrees.get(d.newer)||0)+1);}const ready=[...degrees].filter(([,n])=>!n).map(([id])=>id);let visited=0;for(let p=0;p<ready.length;p++){visited++;for(const id of next.get(ready[p])||[]){degrees.set(id,degrees.get(id)-1);if(!degrees.get(id))ready.push(id);}}if(visited<family.size)warnings.push('Development links contain a cycle. These links are shown as recorded; no reliable earlier/later order can be inferred for the cycle.');
   const invalid=this.invalid.filter(e=>ids.has(e.from));if(invalid.length)warnings.push(`${invalid.length} malformed, self-referencing or missing-target relationship(s) omitted. No data was repaired.`);
   const sources=new Map(),events=[];
   for(const id of ids){const i=this.ideas.get(id),refs=[...(Array.isArray(i.provenance)?i.provenance:[])];if(!refs.some(p=>p.sourceId===i.source))refs.unshift({sourceId:i.source});for(const ref of refs){if(!sources.has(ref.sourceId))sources.set(ref.sourceId,{id:ref.sourceId,source:this.sources.get(ref.sourceId),contributions:[]});sources.get(ref.sourceId).contributions.push({ideaId:id,...ref});}
    const history=Array.isArray(i.history)?i.history:[];for(const event of history)events.push({ideaId:id,...event,at:date(event.at),label:labels[event.type]||event.type});
    if(date(i.createdAt)&&!history.some(e=>e.type==='created'))events.push({ideaId:id,type:'known-created',label:'Known creation timestamp (not a recorded extraction event)',at:i.createdAt});
    if(i.merge&&date(i.merge.at)&&!history.some(e=>e.type==='merged-into'&&e.at===i.merge.at))events.push({ideaId:id,type:'known-merge',label:'Completed merge metadata',at:i.merge.at,after:{into:i.merge.into}});
   }
   events.sort((a,b)=>(a.at?Date.parse(a.at):Infinity)-(b.at?Date.parse(b.at):Infinity)||a.ideaId.localeCompare(b.ideaId)||String(a.id||'').localeCompare(String(b.id||'')));
   const current=[...later.keys()].filter(id=>{const i=this.ideas.get(id);return i.review?.disposition==='Keep'&&!i.merge&&!edges.some(e=>(e.relation==='supersedes'&&e.to===id)||(e.relation==='merged-into'&&e.from===id));});
   return {ids:[...ids],family:[...family],edges,warnings,sources:[...sources.values()],events,groups,current};
  }
 }
 const api={Index,structural,labels,date};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ThreadModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
