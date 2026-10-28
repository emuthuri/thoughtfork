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
      if(this.key!==key){this.key=key;try { const saved=JSON.parse(this.storage.getItem(key)||'{}');this.drafts=Object.assign(Object.create(null),saved.drafts||{});this.forms=saved.forms||{};for(const f of Object.values(this.forms))if(f.status==='saving'){f.status='unsaved';f.error='The previous save was interrupted. Inspect confirmed state before retrying.';}for(const d of Object.values(this.drafts))if(d.status==='saving')d.status='unsaved'; }catch(_){this.storageWarning='Stored drafts could not be read. Keep this tab open and copy unsaved text before closing.';}}
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
      try{this.storage.setItem(this.key,JSON.stringify({drafts:this.drafts,forms:this.forms}));}
      catch(_){this.storageWarning='Browser draft storage is full or unavailable. Unsaved text is only in this tab; copy it before closing.';}
      this.notify();
    }
    setForm(name,value){if(value===null)delete this.forms[name];else this.forms[name]=copy(value);this.persist();}
    recoverable(){const found=[];try{for(let n=0;n<(this.storage.length||0);n++){const k=this.storage.key(n);if(k!==this.key&&k?.startsWith(this.key.split(':').slice(0,2).join(':')+':')){const v=JSON.parse(this.storage.getItem(k)||'{}');if(Object.keys(v.drafts||{}).length||Object.keys(v.forms||{}).length)found.push({key:k,...v});}}}catch(_){this.storageWarning='Other-window drafts could not be read.';}return found;}
    recover(key){if(this.dirty())return false;const item=this.recoverable().find(v=>v.key===key);if(!item)return false;this.drafts=copy(item.drafts||{});this.forms=copy(item.forms||{});for(const v of [...Object.values(this.drafts),...Object.values(this.forms)])if(v.status==='saving'){v.status='unsaved';v.error='Interrupted save. Inspect confirmed state before retrying.';}this.persist();try{const stored=JSON.parse(this.storage.getItem(this.key)||'{}');if(JSON.stringify(stored.drafts)===JSON.stringify(this.drafts)&&JSON.stringify(stored.forms)===JSON.stringify(this.forms)){const old=JSON.parse(this.storage.getItem(key)||'{}');if(JSON.stringify(old.drafts||{})===JSON.stringify(item.drafts||{})&&JSON.stringify(old.forms||{})===JSON.stringify(item.forms||{}))this.storage.setItem(key,JSON.stringify({drafts:{},forms:{}}));}}catch(_){this.storageWarning='Recovered drafts remain in both windows because storage could not be verified.';}return true;}
    dirty(){return Object.keys(this.drafts).length>0||Object.keys(this.forms).length>0;}
    status(){const statuses=[...Object.values(this.drafts),...Object.values(this.forms)].map(d=>d.status);return statuses.includes('conflict')?'Conflict':statuses.includes('failed')?'Save failed':this.runners.size||statuses.includes('saving')?'Saving…':this.dirty()?'Unsaved':'Saved';}
    draft(id){return this.drafts[id]||null;}
    stage(id,patch,{delay=0,baseVersion,retry=false}={}){
      let d=this.drafts[id];
      if(!d)d=this.drafts[id]={patch:{},baseVersion:baseVersion||this.versions[id],generation:this.generation,seq:0,status:'unsaved',error:null};
      else if(baseVersion!==undefined)d.baseVersion=baseVersion;
      Object.assign(d.patch,copy(patch));d.seq++;
      if(!['failed','conflict'].includes(d.status)||retry){d.status='unsaved';d.error=null;}
      this.persist();clearTimeout(this.timers.get(id));this.timers.delete(id);
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
