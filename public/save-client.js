'use strict';
// Confirmed state never contains unsaved values. Drafts live separately in browser storage.
(function(root){
  const copy = x => JSON.parse(JSON.stringify(x));
  class SaveClient {
    constructor({ request, storage, session, onChange = () => {}, onConfirmed = () => {} }) {
      this.request=request;this.storage=storage;this.session=session;this.onChange=onChange;this.onConfirmed=onConfirmed;
      this.runners=new Map();this.timers=new Map();this.drafts=Object.create(null);this.forms={};this.storageWarning=null;
      try { this.tab=session.getItem('research-ledger-tab') || crypto.randomUUID();session.setItem('research-ledger-tab',this.tab); }
      catch (_) { this.tab=crypto.randomUUID();this.storageWarning='Browser session storage is unavailable. Keep this tab open until your work is saved.'; }
    }
    connect(envelope) {
      this.ledger=envelope.ledger;this.versions=envelope.ideaVersions;this.version=envelope.version;
      this.sourceVersions=envelope.sourceVersions||{};this.generation=envelope.generation;this.revision=envelope.revision;this.backup=envelope.backup;this.acceptedSourceRevisions=Object.fromEntries(this.ledger.sources.map(s=>[s.id,this.revision]));this.acceptedRevisions=Object.fromEntries(this.ledger.ideas.map(i=>[i.id,this.revision]));
      const key=`research-ledger-drafts:${envelope.ledgerId}:${this.tab}`;
      if(this.key!==key){this.key=key;this.unrecognizedSession=false;try { const saved=JSON.parse(this.storage.getItem(key)||'{}');if(!this.sessionValue(saved)?.known){this.unrecognizedSession=true;this.storageWarning='This session contains unrecognized retained content and was left untouched.';return;}this.drafts=Object.assign(Object.create(null),saved.drafts||{});this.forms=saved.forms||{};this.metadata=saved.metadata||null;for(const f of Object.values(this.forms))if(f.status==='saving'){f.status='unsaved';f.error='The previous save was interrupted. Inspect confirmed state before retrying.';}for(const d of Object.values(this.drafts))if(d.status==='saving')d.status='unsaved'; }catch(_){this.unrecognizedSession=true;this.storageWarning='Stored drafts could not be read. Keep this tab open and copy unsaved text before closing.';}}
      // A response can be lost during navigation even though its exact intent reached disk.
      // GET is authoritative: only reconcile identical values in the same corpus generation.
      for(const [id,d] of Object.entries(this.drafts)){
        const idea=this.ledger.ideas.find(i=>i.id===id);
        if(d.generation===this.generation&&idea&&Object.entries(d.patch).every(([k,v])=>JSON.stringify(k in (idea.review||{})?idea.review[k]:idea[k])===JSON.stringify(v)))delete this.drafts[id];
      }
      this.persist();
    }
    notify(){this.onChange(this);}
    persist(){
      if(!this.key)return;
      try{if(!this.dirty()&&this.storage.removeItem)this.storage.removeItem(this.key);else this.storage.setItem(this.key,JSON.stringify({drafts:this.drafts,forms:this.forms,...(this.metadata?{metadata:this.metadata}:{})}));}
      catch(_){this.storageWarning='Browser draft storage is full or unavailable. Unsaved text is only in this tab; copy it before closing.';}
      this.notify();
    }
    touch(){this.metadata={lastUpdated:new Date().toISOString(),types:[...new Set([...Object.keys(this.forms),...Object.values(this.drafts).map(d=>Object.keys(d.patch||{}).length===1&&'comment'in d.patch?'comment':'idea')])],titles:[...Object.values(this.forms).flatMap(f=>(f?.cards||f?.captureCards||[f]).map(v=>v?.title||v?.patch?.title||this.ledger?.ideas.find(i=>i.id===v?.id)?.title||this.ledger?.sources.find(i=>i.id===v?.id)?.title||v?.raw?.trim().split(/\r?\n/)[0])),...Object.keys(this.drafts).map(id=>this.ledger?.ideas.find(i=>i.id===id)?.title)].filter(t=>typeof t==='string'&&t.trim()).slice(0,20)};}
    sessionPrefix(){return this.key?.split(':').slice(0,2).join(':')+':';}
    sessionValue(value){
      const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
      if(!object(value)||!['drafts','forms'].every(k=>value[k]===undefined||object(value[k])))return null;
      const extras=Object.keys(value).filter(k=>!['drafts','forms','metadata'].includes(k));
      const metadataSafe=value.metadata===undefined||object(value.metadata)&&Object.keys(value.metadata).every(k=>['lastUpdated','types','titles'].includes(k));
      return {empty:!Object.keys(value.drafts||{}).length&&!Object.keys(value.forms||{}).length&&!extras.length&&metadataSafe,known:!extras.length&&metadataSafe};
    }
    discardSession(key,expected){
      if(key===this.key||!key?.startsWith(this.sessionPrefix())||typeof expected!=='string')return false;
      try{const raw=this.storage.getItem(key);if(raw!==expected)return false;this.storage.removeItem(key);return this.storage.getItem(key)===null;}catch(_){this.storageWarning='The retained session could not be discarded. Its storage may be unavailable.';return false;}
    }
    setForm(name,value){if(value===null)delete this.forms[name];else this.forms[name]=copy(value);this.touch();this.persist();}
    recoverable(){
      const found=[];if(!this.key)return found;
      try{const keys=Array.from({length:this.storage.length||0},(_,n)=>this.storage.key(n));
        for(const key of keys){if(key===this.key||!key?.startsWith(this.sessionPrefix()))continue;
          try{const raw=this.storage.getItem(key);if(raw===null)continue;const value=JSON.parse(raw),shape=this.sessionValue(value);
            if(!shape){this.storageWarning='Some retained sessions could not be interpreted and were left untouched.';continue;}
            if(shape.empty){if(this.storage.getItem(key)===raw&&this.storage.removeItem)this.storage.removeItem(key);continue;}
            found.push({...value,key,raw,known:shape.known});
          }catch(_){this.storageWarning='Some retained sessions could not be read and were left untouched.';}
        }
      }catch(_){this.storageWarning='Other-window drafts could not be read.';}
      return found;
    }
    recover(key,expected){
      if(this.dirty())return false;const item=this.recoverable().find(v=>v.key===key);if(!item||!item.known||expected!==undefined&&item.raw!==expected)return false;
      this.drafts=copy(item.drafts||{});this.forms=copy(item.forms||{});this.metadata=copy(item.metadata||null);
      for(const v of [...Object.values(this.drafts),...Object.values(this.forms)])if(v.status==='saving'){v.status='unsaved';v.error='Interrupted save. Inspect confirmed state before retrying.';}
      this.persist();
      try{const stored=JSON.parse(this.storage.getItem(this.key)||'{}');if(JSON.stringify(stored.drafts)!==JSON.stringify(this.drafts)||JSON.stringify(stored.forms)!==JSON.stringify(this.forms))return false;
        if(this.storage.getItem(key)===item.raw){if(this.storage.removeItem)this.storage.removeItem(key);else this.storage.setItem(key,JSON.stringify({drafts:{},forms:{}}));}
      }catch(_){this.storageWarning='Recovered drafts remain in both windows because storage could not be verified.';return false;}
      return true;
    }
    dirty(){return Object.keys(this.drafts).length>0||Object.keys(this.forms).length>0;}
    status(){const statuses=[...Object.values(this.drafts),...Object.values(this.forms)].map(d=>d.status);return statuses.includes('conflict')?'Conflict':statuses.includes('failed')?'Save failed':this.runners.size||statuses.includes('saving')?'Saving…':this.dirty()?'Unsaved':'Saved';}
    draft(id){return this.drafts[id]||null;}
    stage(id,patch,{delay=0,baseVersion,retry=false}={}){
      let d=this.drafts[id];
      if(!d)d=this.drafts[id]={patch:{},baseVersion:baseVersion||this.versions[id],generation:this.generation,seq:0,status:'unsaved',error:null};
      else if(baseVersion!==undefined)d.baseVersion=baseVersion;
      Object.assign(d.patch,copy(patch));d.seq++;
      if(!['failed','conflict'].includes(d.status)||retry){d.status='unsaved';d.error=null;}
      this.touch();this.persist();clearTimeout(this.timers.get(id));this.timers.delete(id);
      if(delay>0)this.timers.set(id,setTimeout(()=>{this.timers.delete(id);this.flush(id).catch(()=>{});},delay));
      return d;
    }
    accept(out){
      const ideas=out.ideas||(out.idea?[out.idea]:[]);this.acceptedRevisions||={};
      for(const idea of ideas){
        if(out.revision<(this.acceptedRevisions[idea.id]??-1))continue;
        const index=this.ledger.ideas.findIndex(i=>i.id===idea.id);
        if(index>=0)this.ledger.ideas[index]=idea;else this.ledger.ideas.push(idea);
        this.versions[idea.id]=out.ideaVersions?.[idea.id]||(idea.id===out.idea?.id?out.ideaVersion:this.versions[idea.id]);
        this.acceptedRevisions[idea.id]=out.revision;
      }
      {for(const source of out.sources||(out.source?[out.source]:[])){this.acceptedSourceRevisions||={};if(out.revision<(this.acceptedSourceRevisions[source.id]??-1))continue;this.acceptedSourceRevisions[source.id]=out.revision;const at=this.ledger.sources.findIndex(s=>s.id===source.id);if(at<0)this.ledger.sources.push(source);else this.ledger.sources[at]=source;this.sourceVersions||={};this.sourceVersions[source.id]=out.sourceVersions?.[source.id]||(source.id===out.source?.id?out.sourceVersion:this.sourceVersions[source.id]);}}
      if(out.revision>=this.revision){this.revision=out.revision;this.version=out.version;this.generation=out.generation;this.ledger.meta=out.meta;this.backup=out.backup;}
      this.onConfirmed(this);
    }
    flush(id){
      clearTimeout(this.timers.get(id));this.timers.delete(id);
      if(this.runners.has(id))return this.runners.get(id);
      const d=this.drafts[id];if(!d)return Promise.resolve(true);
      if(['failed','conflict'].includes(d.status))return Promise.resolve(false);
      const runner=(async()=>{
        while(this.drafts[id]){
          const current=this.drafts[id],snapshot=copy(current);current.status='saving';this.persist();
          try{
            const previous=this.ledger.ideas.find(i=>i.id===id),before=previous?copy(previous):null;
            const out=await this.request(`/api/ideas/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({patch:snapshot.patch,baseVersion:snapshot.baseVersion})});
            this.accept(out);
            if(before&&(!out.ideas||out.ideas.length===1))this.lastUndo={id,baseVersion:out.ideaVersion,patch:Object.fromEntries(Object.keys(snapshot.patch).map(k=>[k,copy(k in before.review?before.review[k]:before[k])]))};
            if(this.drafts[id]?.seq===snapshot.seq)delete this.drafts[id];
            else if(this.drafts[id]){this.drafts[id].baseVersion=out.ideaVersion;this.drafts[id].status='unsaved';}
            this.persist();
          }catch(e){
            const pending=this.drafts[id];if(pending){pending.status=e.status===409?'conflict':'failed';pending.error={message:e.message,code:e.code,currentIdea:e.currentIdea,currentVersion:e.currentVersion};this.persist();}
            return false;
          }
        }
        return true;
      })();
      this.runners.set(id,runner);this.notify();
      return runner.finally(()=>{this.runners.delete(id);this.notify();});
    }
    async save(id,patch,options={}){this.stage(id,patch,{...options,retry:options.retry!==false});return this.flush(id);}
    async flushAll(){return (await Promise.all(Object.keys(this.drafts).map(id=>this.flush(id)))).every(Boolean);}
    resume(){for(const [id,d]of Object.entries(this.drafts))if(d.status==='unsaved')this.flush(id).catch(()=>{});}
    retry(id,reviewedVersion){const d=this.drafts[id];if(!d)return Promise.resolve(true);if(d.status==='conflict'&&!reviewedVersion)return Promise.resolve(false);if(reviewedVersion)d.baseVersion=reviewedVersion;d.status='unsaved';d.error=null;this.persist();return this.flush(id);}
    discard(id){if(this.runners.has(id))return false;clearTimeout(this.timers.get(id));this.timers.delete(id);delete this.drafts[id];this.persist();return true;}
  }
  if(typeof module==='object'&&module.exports)module.exports={SaveClient};else root.SaveClient=SaveClient;
})(typeof window==='undefined'?globalThis:window);
