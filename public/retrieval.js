'use strict';
(function(root){
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const normalize=value=>clean(value).toLowerCase();
  const terms=q=>[...new Set(normalize(q).split(' ').filter(Boolean))];
  const labels={id:'ID',title:'Title',summary:'Summary',tags:'Tags',comment:'Comment',project:'Project',type:'Type',disposition:'Disposition',action:'Action',raw:'Source text'};
  const weights={id:95,title:80,tags:55,summary:40,comment:30,project:20,type:18,disposition:12,action:10,raw:25};
  function fields(item,kind){const r=item.review||{};return (kind==='sources'?['id','title','project','raw']:['id','title','summary','tags','comment','project','type','disposition','action']).map(field=>{let value=field==='tags'?(item.tags||[]).join(' '):['comment','disposition','action'].includes(field)?r[field]:item[field];if(field==='disposition'){if(value==='Merge')value='Needs merge';if(item.merge)value='Merged away ('+value+')';}const text=clean(value);return {field,label:labels[field],text,low:text.toLowerCase()};});}
  function snippet(text,words,radius=70){const value=clean(text),low=value.toLowerCase();const positions=words.map(w=>low.indexOf(w)).filter(n=>n>=0);if(!positions.length)return '';const at=Math.min(...positions),start=Math.max(0,at-radius),end=Math.min(value.length,at+Math.max(...words.map(w=>w.length))+radius);return (start?'…':'')+value.slice(start,end)+(end<value.length?'…':'');}
  function match(doc,words,query){
    const found=new Set(),matches=[];let score=0;
    for(const f of doc.fields){const hit=words.filter(w=>f.low.includes(w));if(!hit.length)continue;hit.forEach(w=>found.add(w));matches.push({field:f.field,label:f.label,text:f.text,terms:hit});score=Math.max(score,weights[f.field]);}
    if(found.size!==words.length)return null;
    const id=doc.fields.find(f=>f.field==='id').low,title=doc.fields.find(f=>f.field==='title').low;
    if(id===query)score+=1000;else if(title===query)score+=900;else if(title.startsWith(query))score+=200;
    score+=matches.length;
    matches.sort((a,b)=>weights[b.field]-weights[a.field]);
    return {item:doc.item,score,matches};
  }
  class Index{
    constructor(ledger){this.docs={ideas:new Map(),sources:new Map()};this.cache=new Map();this.sync(ledger);}
    sync(ledger){
      this.ledger=ledger;this.cache.clear();
      for(const kind of ['ideas','sources']){const next=new Map();for(const item of ledger[kind]){const old=this.docs[kind].get(item.id);next.set(item.id,old?.item===item?old:{item,fields:fields(item,kind)});}this.docs[kind]=next;}
      this.ideas=new Map(ledger.ideas.map(i=>[i.id,i]));this.sources=new Map(ledger.sources.map(s=>[s.id,s]));
      this.contributions=new Map(ledger.sources.map(s=>[s.id,[]]));
      for(const idea of ledger.ideas){const ids=new Set([idea.source,...(idea.provenance||[]).map(p=>p.sourceId)]);for(const id of ids)this.contributions.get(id)?.push(idea);}
    }
    search(q,kind='ideas'){
      const query=normalize(q);if(!query)return [];
      const key=kind+'\0'+query;if(this.cache.has(key))return this.cache.get(key);
      const words=terms(query),result=[];for(const doc of this.docs[kind].values()){const hit=match(doc,words,query);if(hit)result.push(hit);}
      result.sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title)||a.item.id.localeCompare(b.item.id));
      this.cache.set(key,result);if(this.cache.size>8)this.cache.delete(this.cache.keys().next().value);return result;
    }
  }
  function projectKey(name){return name==='All'||name.startsWith('project:')?'project:'+name:name;}
  function projectName(key){return key==='All'?null:key.startsWith('project:')?key.slice(8):key;}
  function filter(items,state){const p=projectName(state.project||'All');return items.filter(i=>(p===null||i.project===p)&&(!state.disposition||state.disposition==='All'||i.review.disposition===state.disposition)&&(!state.action||state.action==='All'||i.review.action===state.action));}
  function time(item,sort){const r=item.review||{};if(sort==='reviewed')return Date.parse(r.reviewedAt)||0;if(sort==='created')return Date.parse(item.createdAt)||0;return (item.history||[]).reduce((latest,e)=>Math.max(latest,Date.parse(e.at)||0),Math.max(Date.parse(item.updatedAt)||0,Date.parse(r.updatedAt)||0,Date.parse(item.createdAt)||0));}
  function sorted(items,sort='original'){if(['created-oldest','updated-oldest','title-desc'].includes(sort)){const field=sort.startsWith('created')?'created':'updated';return [...items].sort(sort==='title-desc'?(a,b)=>b.title.localeCompare(a.title)||a.id.localeCompare(b.id):(a,b)=>{const x=time(a,field),y=time(b,field);return !x&&!y?a.id.localeCompare(b.id):!x?1:!y?-1:x-y||a.id.localeCompare(b.id);});}if(sort==='original'||sort==='relevance')return items;return [...items].sort(sort==='title'?(a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id):(a,b)=>time(b,sort)-time(a,sort)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));}
  function chooseCurrent(previous,current,next){if(next.includes(current))return current;const at=previous.indexOf(current);if(at>=0){const present=new Set(next);for(let n=at+1;n<previous.length;n++)if(present.has(previous[n]))return previous[n];for(let n=at-1;n>=0;n--)if(present.has(previous[n]))return previous[n];}return next[0]||null;}
  function page(items,n,size=40){const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(pages-1,Number.isInteger(n)?n:0));return {items:items.slice(current*size,(current+1)*size),page:current,pages,total:items.length,start:items.length?current*size+1:0,end:Math.min(items.length,(current+1)*size)};}
  function projects(ledger,pinned=[]){const counts=new Map((ledger.meta.projects||[]).map(name=>[name,{name,ideas:0,sources:0}]));for(const s of ledger.sources){if(!counts.has(s.project))counts.set(s.project,{name:s.project,ideas:0,sources:0});counts.get(s.project).sources++;}for(const i of ledger.ideas){if(!counts.has(i.project))counts.set(i.project,{name:i.project,ideas:0,sources:0});counts.get(i.project).ideas++;}const pins=new Set(pinned),order=new Map((ledger.meta.projects||[]).map((name,n)=>[name,n]));return [...counts.values()].sort((a,b)=>Number(pins.has(b.name))-Number(pins.has(a.name))||(order.get(a.name)??Infinity)-(order.get(b.name)??Infinity)||a.name.localeCompare(b.name));}
  const api={Index,clean,normalize,terms,snippet,filter,sorted,time,chooseCurrent,page,projects,projectKey,projectName};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.Retrieval=api;
})(typeof window==='undefined'?globalThis:window);
