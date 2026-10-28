'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { createHash, randomUUID, createHmac, timingSafeEqual } = require('crypto');
const Evolution = require('./evolution');
const Projects = require('./projects');
const DISPOSITIONS = ['To review','Keep','Merge','Open question','Superseded','Historical','Archive','Trash'];
const ACTIONS = ['None','Discuss','Investigate','Verify','Build'];
const RELATIONS = ['supports','contradicts','refines','supersedes','derived-from','merged-into','related-to'];
const IDEA_FIELDS = ['title','summary','project','type','tags'];
const REVIEW_FIELDS = ['disposition','action','include','comment','lineage'];
class LedgerError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.code = code; this.details = details; }
}
const fail = (message) => { throw new LedgerError(422, 'INVALID_LEDGER', message); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hash = x => createHash('sha256').update(x).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
function string(x, field, nonempty = false) { if (typeof x !== 'string' || (nonempty && !x.trim())) fail(`${field} must be ${nonempty ? 'a non-empty string' : 'a string'}.`); }
function id(x, field) { if (typeof x !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x)) fail(`${field} is not a valid ID.`); }
function timestamp(x, field) { if (x != null && (typeof x !== 'string' || !Number.isFinite(Date.parse(x)))) fail(`${field} must be an ISO date string or null.`); }
function tags(x, field) { if (!Array.isArray(x) || x.some(t => typeof t !== 'string' || !t.trim()) || new Set(x).size !== x.length) fail(`${field} must be an array of distinct non-empty strings.`); }
function validateLineage(items, owner, ids) {
  if (!Array.isArray(items)) fail('Lineage must be an array.');
  const seen = new Set();
  for (const r of items) {
    if (!object(r) || !RELATIONS.includes(r.relation)) fail('Invalid lineage relation.');
    id(r.targetId, 'Lineage target');
    if (r.note !== undefined) string(r.note, 'Lineage note');
    if (r.targetId === owner) fail('An idea cannot link to itself.');
    if (ids && !ids.has(r.targetId)) fail(`Lineage target ${r.targetId} does not exist.`);
    const key = JSON.stringify([r.relation, r.targetId]);
    if (seen.has(key)) fail('Duplicate lineage relation and target.');
    seen.add(key);
  }
}
function validateLedger(ledger) {
  if (!object(ledger) || ledger.schemaVersion !== 2) fail('Only ledger schemaVersion 2 is supported.');
  if (!object(ledger.meta) || !Array.isArray(ledger.sources) || !Array.isArray(ledger.ideas)) fail('A ledger requires meta, sources and ideas.');
  if (ledger.meta.revision !== undefined && (!Number.isSafeInteger(ledger.meta.revision) || ledger.meta.revision < 0)) fail('Invalid ledger revision.');
  if (ledger.meta.generation !== undefined) string(ledger.meta.generation, 'Ledger generation', true);
  for (const key of ['createdAt','updatedAt','importedAt']) if (key in ledger.meta) timestamp(ledger.meta[key], `meta.${key}`);
  Projects.validate(ledger.meta.projects, fail);
  const sources = new Set(), ideas = new Set();
  for (const s of ledger.sources) {
    if (!object(s)) fail('Each source must be an object.');
    id(s.id, 'Source ID'); if (sources.has(s.id)) fail(`Duplicate source ID ${s.id}.`); sources.add(s.id);
    for (const field of ['title','project','raw']) string(s[field], `Source ${field}`, field === 'project');
    for(const field of ['createdAt','updatedAt'])if(field in s)timestamp(s[field],'Source '+field);
    if(s.revisions!==undefined){if(!Array.isArray(s.revisions))fail('Source revisions must be an array.');s.revisions.forEach((r,n)=>{if(!object(r)||r.revision!==n)fail('Invalid source revision order.');for(const k of ['raw','title'])string(r[k],'Revision '+k);timestamp(r.replacedAt,'Revision replacedAt');if(!r.replacedAt)fail('Revision timestamp required.');});}
  }
  for (const i of ledger.ideas) {
    if (!object(i)) fail('Each idea must be an object.');
    id(i.id, 'Idea ID'); if (ideas.has(i.id)) fail(`Duplicate idea ID ${i.id}.`); ideas.add(i.id);
    id(i.source, 'Idea source'); if (!sources.has(i.source)) fail(`Source ${i.source} does not exist.`);
    for (const field of ['title','summary','project','type']) string(i[field], `Idea ${field}`, ['project','type'].includes(field));
    tags(i.tags, 'Idea tags');
    if (i.createdAt !== undefined) timestamp(i.createdAt, 'Idea createdAt');
    if (i.origin !== undefined) string(i.origin, 'Idea origin');
    const r = i.review;
    if (!object(r) || !DISPOSITIONS.includes(r.disposition) || !ACTIONS.includes(r.action) || typeof r.include !== 'boolean') fail('Invalid idea review state.');
    string(r.comment, 'Review comment');
    for (const field of ['reviewedAt','updatedAt']) if (field in r) timestamp(r[field], `Review ${field}`);
  }
  for (const i of ledger.ideas) validateLineage(i.review.lineage, i.id, ideas);
  Evolution.validate(ledger, fail);
  return ledger;
}
function validatePatch(body) {
  if (!object(body) || !object(body.patch) || typeof body.baseVersion !== 'string') fail('A patch and its baseVersion are required. Refresh this app if using an older client.');
  const patch = clone(body.patch), allowed = [...IDEA_FIELDS, ...REVIEW_FIELDS];
  if (!Object.keys(patch).length || Object.keys(patch).some(k => !allowed.includes(k))) fail('Patch contains no editable fields or unknown fields.');
  for (const f of IDEA_FIELDS.filter(f => f !== 'tags')) if (f in patch) { string(patch[f], f, ['project','type'].includes(f)); }
  if ('tags' in patch) tags(patch.tags, 'Tags');
  if ('disposition' in patch && !DISPOSITIONS.includes(patch.disposition)) fail('Invalid disposition.');
  if ('action' in patch && !ACTIONS.includes(patch.action)) fail('Invalid action.');
  if ('include' in patch && typeof patch.include !== 'boolean') fail('Include must be boolean.');
  if ('comment' in patch) string(patch.comment, 'Comment');
  if ('lineage' in patch) validateLineage(patch.lineage);
  return patch;
}
function canonicalFile(file) {
  const resolved = fs.existsSync(file) ? fs.realpathSync.native(file) : path.join(fs.realpathSync.native(path.dirname(file)), path.basename(file));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
async function acquireWriter(file) {
  const identity = hash(canonicalFile(file));
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\research-ledger-${identity}` : { host: '127.0.0.1', port: 30000 + parseInt(identity.slice(0, 8), 16) % 30000, exclusive: true };
  const owner = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    owner.once('error', error => reject(new LedgerError(503, 'WRITER_ACTIVE', `Cannot acquire ledger writer ownership. Another Research Ledger process may already own this ledger. Stop it before starting this server. (${error.code})`)));
    owner.listen(address, resolve);
  });
  return { identity, release: () => new Promise(resolve => owner.close(resolve)) };
}
class LedgerStore {
  constructor(file, options = {}) {
    this.file = fs.existsSync(file) ? fs.realpathSync.native(file) : path.resolve(file); this.backups = path.join(path.dirname(this.file), 'backups');
    this.io = options.io || fs; this.now = options.now || (() => new Date());
    this.secret = randomUUID(); this.tail = Promise.resolve(); this.lastBackupAt = 0;
    this.backupStatus = { warning: null, lastFile: null }; this.expectedBytes = undefined;
    this.identity = hash(canonicalFile(file));
  }
  queue(fn) { const job = this.tail.then(fn); this.tail = job.catch(() => {}); return job; }
  bytes() { try { return this.io.readFileSync(this.file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  inspect() {
    const bytes = this.bytes(), version = bytes === null ? 'missing' : hash(bytes);
    if (this.expectedBytes !== undefined && version !== this.expectedBytes) this.externalChange = true;
    try {
      if (bytes === null) throw new Error('The canonical ledger file is missing.');
      const ledger = validateLedger(JSON.parse(bytes.toString('utf8')));
      return { mode: 'normal', ledger, version, bytes };
    } catch (e) { return { mode: 'recovery', version, bytes, error: e.message }; }
  }
  start() { const state = this.inspect(); this.expectedBytes = state.version; return state; }
  generation(ledger) { return ledger.meta.generation || 'legacy'; }
  ideaVersion(ledger, idea) { return hash(JSON.stringify([this.generation(ledger), idea])); }
  envelope(state = this.inspect()) {
    if (state.mode !== 'normal') throw new LedgerError(503, 'RECOVERY_REQUIRED', 'The ledger needs recovery. Its existing bytes have not been changed.', { reason: state.error });
    return { ledger: state.ledger, version: state.version, revision: state.ledger.meta.revision || 0,
      generation: this.generation(state.ledger), ledgerId: this.identity,
      sourceVersions:Object.fromEntries(state.ledger.sources.map(s=>[s.id,this.sourceVersion(state.ledger,s)])),
      ideaVersions: Object.fromEntries(state.ledger.ideas.map(i => [i.id, this.ideaVersion(state.ledger, i)])), backup: this.backupStatus };
  }
  latest() {
    const state = this.inspect();
    if (this.externalChange) throw new LedgerError(409, 'EXTERNAL_CHANGE', 'The ledger was changed outside this server. Stop external writers and restart Research Ledger before saving.');
    if (state.mode !== 'normal') this.envelope(state);
    return state;
  }
  verifiedCopy(bytes, prefix, validJSON = true) {
    this.io.mkdirSync(this.backups, { recursive: true });
    const file = `ledger-${prefix}-${this.now().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.${validJSON ? 'json' : 'bin'}`;
    const target = path.join(this.backups, file); let fd;
    try {
      fd = this.io.openSync(target, 'wx'); this.io.writeFileSync(fd, bytes); this.io.fsyncSync(fd); this.io.closeSync(fd); fd = undefined;
      const check = this.io.readFileSync(target);
      if (!check.equals(bytes)) throw new Error('Backup byte verification failed.');
      if (validJSON) validateLedger(JSON.parse(check.toString('utf8')));
    } catch (e) {
      if (fd !== undefined) try { this.io.closeSync(fd); } catch (_) {}
      // An incomplete uniquely named file is never exposed as a valid backup.
      try { this.io.unlinkSync(target); } catch (_) {}
      throw new LedgerError(507, 'BACKUP_FAILED', `Backup creation or verification failed. ${e.message}`);
    }
    if (validJSON) this.lastBackupAt = Date.now(); this.backupStatus = { warning: null, lastFile: file }; return file;
  }
  periodic(bytes) {
    if (Date.now() - this.lastBackupAt < 10 * 60 * 1000) return;
    try { this.verifiedCopy(bytes, 'auto'); }
    catch (e) { this.backupStatus.warning = `The edit was saved, but its periodic backup failed: ${e.message}`; }
  }
  persist(ledger, previousRevision) {
    ledger.meta.revision = previousRevision + 1;
    if (!Number.isSafeInteger(ledger.meta.revision)) fail('Ledger revision limit reached.');
    ledger.meta.updatedAt = this.now().toISOString(); validateLedger(ledger);
    const bytes = Buffer.from(JSON.stringify(ledger, null, 2));
    const temp = `${this.file}.${randomUUID()}.tmp`; let fd;
    try {
      fd = this.io.openSync(temp, 'wx'); this.io.writeFileSync(fd, bytes); this.io.fsyncSync(fd); this.io.closeSync(fd); fd = undefined;
      const check = this.io.readFileSync(temp);
      if (!check.equals(bytes)) throw new Error('Temporary file byte verification failed.');
      validateLedger(JSON.parse(check.toString('utf8')));
      // No await occurs between the current-state preconditions and this replacement.
      this.io.renameSync(temp, this.file);
    } catch (e) {
      if (fd !== undefined) try { this.io.closeSync(fd); } catch (_) {}
      try { this.io.unlinkSync(temp); } catch (_) {}
      throw new LedgerError(507, 'PERSIST_FAILED', `The ledger was not saved. ${e.message}`);
    }
    this.expectedBytes = hash(bytes); this.externalChange = false;
    return { version: this.expectedBytes, revision: ledger.meta.revision, generation: this.generation(ledger), meta: ledger.meta, backup: this.backupStatus };
  }
  patch(idValue, body) {
    const patch = validatePatch(body);
    return this.queue(() => {
      const state = this.latest(), ledger = state.ledger, idea = ledger.ideas.find(i => i.id === idValue);
      if (!idea) throw new LedgerError(409, 'CONFLICT', 'This idea no longer exists in the current ledger. Your draft has been preserved.');
      const currentVersion = this.ideaVersion(ledger, idea);
      if (body.baseVersion !== currentVersion) throw new LedgerError(409, 'CONFLICT', 'Newer changes exist for this idea. Compare them with your draft before applying it.', { currentIdea: idea, currentVersion, generation: this.generation(ledger) });
      const before = clone(idea), changed = [idea];
      for (const f of IDEA_FIELDS) if (f in patch) idea[f] = patch[f];
      for (const f of REVIEW_FIELDS) if (f in patch) idea.review[f] = patch[f];
      idea.review.updatedAt = this.now().toISOString();
      if (idea.review.disposition === 'To review') idea.review.reviewedAt = null;
      else idea.review.reviewedAt ||= this.now().toISOString();
      Evolution.meaningfulChanges(idea, before, idea.review.updatedAt);
      if ('lineage' in patch) {
        const prior = new Set(before.review.lineage.filter(r=>r.relation==='supersedes').map(r=>r.targetId));
        const next = new Set(idea.review.lineage.filter(r=>r.relation==='supersedes').map(r=>r.targetId));
        for (const targetId of new Set([...prior,...next])) if(prior.has(targetId)!==next.has(targetId)) {
          const target=ledger.ideas.find(i=>i.id===targetId);
          if(target){Evolution.record(target,idea.review.updatedAt,next.has(targetId)?'superseded-by':'supersession-removed',null,{ideaId:idea.id},[idea.id]);target.review.updatedAt=idea.review.updatedAt;changed.push(target);}
        }
      }
      validateLedger(ledger); this.periodic(state.bytes);
      const result = this.persist(ledger, ledger.meta.revision || 0);
      return { ok: true, idea, ideaVersion: this.ideaVersion(ledger, idea), ...this.affected(ledger,changed), ...result };
    });
  }
  capture(body) {
    if(body?.cards)return this.captureMany(body);
    if (!object(body) || typeof body.generation !== 'string') fail('Capture requires the current ledger generation.');
    string(body.raw, 'Capture text'); if (!body.raw.trim()) fail('Capture text is required.');
    for (const f of ['title','project','type']) if (f in body) string(body[f], `Capture ${f}`);
    if (body.tags !== undefined) tags(body.tags, 'Capture tags');
    return this.queue(() => {
      const state = this.latest(), ledger = state.ledger;
      if (body.generation !== this.generation(ledger)) throw new LedgerError(409, 'CONFLICT', 'The ledger was replaced while this capture was being written. Review the current ledger before retrying.');
      const next = (items, prefix) => `${prefix}${String(items.reduce((max, item) => { const m = item.id.match(new RegExp(`^${prefix}(\\d+)$`)); return m ? Math.max(max, Number(m[1])) : max; }, 0) + 1).padStart(3, '0')}`;
      const source = { id: next(ledger.sources, 'C'), project: body.project?.trim() || 'Inbox', title: body.title?.trim() || body.raw.trim().split(/\r?\n/)[0].slice(0, 100), raw: body.raw, createdAt:this.now().toISOString() };
      const idea = { id: next(ledger.ideas, 'U'), source: source.id, project: source.project, title: source.title, type: body.type?.trim() || 'Capture', summary: body.raw, tags: body.tags || [], createdAt: this.now().toISOString(), origin: 'user-capture', review: { disposition:'To review', action:'None', include:false, comment:'', lineage:[], reviewedAt:null, updatedAt:null } };
      Evolution.record(idea,idea.createdAt,'created',null,{sourceId:source.id,origin:'user-capture'});
      ledger.sources.push(source); ledger.ideas.push(idea); validateLedger(ledger);
      const backupFile = this.verifiedCopy(state.bytes, 'before-capture');
      return { ok: true, source, idea, backupFile, ...this.persist(ledger, ledger.meta.revision || 0), ideaVersion: this.ideaVersion(ledger, idea) };
    });
  }


  sourceVersion(ledger,source){return hash(JSON.stringify([this.generation(ledger),source]));}
  editSource(idValue,body){
    if(!object(body)||typeof body.baseVersion!=='string')fail('Source version is required.');
    for(const k of ['raw','title'])string(body[k],'Source '+k,true);
    return this.queue(()=>{const state=this.latest(),ledger=state.ledger,source=ledger.sources.find(s=>s.id===idValue);
      if(!source||this.sourceVersion(ledger,source)!==body.baseVersion)throw new LedgerError(409,'CONFLICT','Source changed elsewhere. Your draft is retained; reopen the current source before retrying.');
      if(source.raw===body.raw&&source.title===body.title)return {ok:true,source,sourceVersion:this.sourceVersion(ledger,source),...this.envelope(state)};
      const at=this.now().toISOString();source.revisions||=[];source.revisions.push({revision:source.revisions.length,raw:source.raw,title:source.title,...(source.updatedAt?{savedAt:source.updatedAt}:source.createdAt?{savedAt:source.createdAt}:{}),replacedAt:at});
      source.raw=body.raw;source.title=body.title;source.updatedAt=at;validateLedger(ledger);
      const backupFile=this.verifiedCopy(state.bytes,'before-source-edit');const result=this.persist(ledger,ledger.meta.revision||0);
      return {ok:true,source,sourceVersion:this.sourceVersion(ledger,source),backupFile,...result};
    });
  }
  captureMany(body){
    if(!object(body)||typeof body.generation!=='string'||!Array.isArray(body.cards)||!body.cards.length||body.cards.length>100)fail('Capture requires 1–100 cards and the current generation.');
    if(typeof body.requestId!=='string'||!body.requestId.match(/^[a-zA-Z0-9-]{1,100}$/))fail('Capture request identity is required.');
    const cards=clone(body.cards);for(const c of cards){if(!object(c))fail('Invalid capture card.');string(c.raw,'Capture text',true);for(const k of ['title','project','type'])if(k in c)string(c[k],'Capture '+k);if(c.tags!==undefined)tags(c.tags,'Capture tags');}
    const fingerprint=hash(JSON.stringify(cards));return this.queue(()=>{const state=this.latest(),ledger=state.ledger;
      if(body.generation!==this.generation(ledger))throw new LedgerError(409,'CONFLICT','The ledger was replaced. Review the current ledger before saving this capture.');
      const prior=ledger.sources.filter(s=>s.captureBatch?.id===body.requestId).sort((a,b)=>a.captureBatch.index-b.captureBatch.index);
      if(prior.length){if(prior.length!==cards.length||prior.some(s=>s.captureBatch.hash!==fingerprint))throw new LedgerError(409,'CONFLICT','This capture request was already saved with different content. Inspect the saved notes before starting a new capture.');const ideas=prior.map(s=>ledger.ideas.find(i=>i.source===s.id));return {ok:true,sources:prior,source:prior[0],idea:ideas[0],...this.affected(ledger,ideas),...this.envelope(state),ideaVersion:this.ideaVersion(ledger,ideas[0])};}
      const at=this.now().toISOString(),sources=[],ideas=[];
      for(const [n,c]of cards.entries()){const source={id:'C'+randomUUID(),project:c.project?.trim()||'Inbox',title:c.title?.trim()||c.raw.trim().split(/\r?\n/)[0].slice(0,100),raw:c.raw,createdAt:at,captureBatch:{id:body.requestId,index:n,hash:fingerprint}},idea={id:'U'+randomUUID(),source:source.id,project:source.project,title:source.title,type:c.type?.trim()||'Capture',summary:c.raw,tags:c.tags||[],createdAt:at,origin:'user-capture',review:{disposition:'To review',action:'None',include:false,comment:'',lineage:[],reviewedAt:null,updatedAt:null}};Evolution.record(idea,at,'created',null,{sourceId:source.id,origin:'user-capture'});sources.push(source);ideas.push(idea);ledger.sources.push(source);ledger.ideas.push(idea);}
      validateLedger(ledger);const backupFile=this.verifiedCopy(state.bytes,'before-capture');return {ok:true,sources,source:sources[0],idea:ideas[0],...this.affected(ledger,ideas),backupFile,...this.persist(ledger,ledger.meta.revision||0),ideaVersion:this.ideaVersion(ledger,ideas[0])};
    });
  }
  organise(body){
    if(!object(body)||!Array.isArray(body.items)||!body.items.length||body.items.length>200)fail('Select 1–200 ideas.');
    if(!['project','add-tag','remove-tag'].includes(body.operation))fail('Unsupported organisational action.');string(body.value,'Value',true);
    return this.queue(()=>{const state=this.latest(),ledger=state.ledger;const ids=new Set();const ideas=body.items.map(p=>{if(!object(p)||ids.has(p.id))fail('Duplicate or invalid selection.');ids.add(p.id);return this.checkedIdea(ledger,p.id,p.baseVersion);});
      const at=this.now().toISOString();for(const i of ideas){if(body.operation==='project')i.project=body.value.trim();else if(body.operation==='add-tag'){const tag=body.value.trim().replace(/^#/,'');if(!tag)fail('Tag required.');if(!i.tags.some(t=>t.trim().toLowerCase()===tag.toLowerCase()))i.tags.push(tag);}else i.tags=i.tags.filter(t=>t.trim().toLowerCase()!==body.value.trim().replace(/^#/,'').toLowerCase());i.review.updatedAt=at;}
      validateLedger(ledger);const backupFile=this.verifiedCopy(state.bytes,'before-organisation');return {ok:true,...this.affected(ledger,ideas),backupFile,...this.persist(ledger,ledger.meta.revision||0)};
    });
  }
  affected(ledger, ideas) {
    const unique=[...new Map(ideas.map(i=>[i.id,i])).values()];
    return {ideas:unique,ideaVersions:Object.fromEntries(unique.map(i=>[i.id,this.ideaVersion(ledger,i)]))};
  }
  checkedIdea(ledger,idValue,version) {
    const idea=ledger.ideas.find(i=>i.id===idValue);
    if(!idea||typeof version!=='string'||version!==this.ideaVersion(ledger,idea))throw new LedgerError(409,'CONFLICT','An idea changed after you reviewed it. Your entered text is retained; review the latest participants before retrying.',idea?{currentIdea:idea,currentVersion:this.ideaVersion(ledger,idea)}:{});
    return idea;
  }
  createIdea(body) {
    if(!object(body)||typeof body.generation!=='string')fail('Creating an idea requires the current ledger generation.');
    string(body.sourceId,'Source ID',true);string(body.title,'Title',true);string(body.summary,'Summary',true);
    if(body.project!==undefined)string(body.project,'Project',true);
    if(body.type!==undefined)string(body.type,'Type',true);
    if(body.tags!==undefined)tags(body.tags,'Tags');
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger;
      if(body.generation!==this.generation(ledger))throw new LedgerError(409,'CONFLICT','The ledger was replaced. Review the source again before creating this idea.');
      const source=ledger.sources.find(s=>s.id===body.sourceId),ref=Evolution.sourceRef(body,source,fail),at=this.now().toISOString();
      const idea={id:'D'+randomUUID(),source:source.id,provenance:[ref],title:body.title,summary:body.summary,project:body.project||source.project,type:body.type||'Note',tags:body.tags||[],origin:'source-extraction',createdAt:at,review:{disposition:'To review',action:'None',include:false,comment:'',lineage:[],reviewedAt:null,updatedAt:at}};
      Evolution.record(idea,at,'created',null,{sourceId:source.id,provenance:[ref],origin:'source-extraction'});ledger.ideas.push(idea);validateLedger(ledger);
      const backupFile=this.verifiedCopy(state.bytes,'before-derived-idea');
      return {ok:true,idea,ideaVersion:this.ideaVersion(ledger,idea),...this.affected(ledger,[idea]),backupFile,...this.persist(ledger,ledger.meta.revision||0)};
    });
  }
  attachSource(idValue,body) {
    if(!object(body)||typeof body.baseVersion!=='string')fail('Adding a source requires an idea version.');
    string(body.sourceId,'Source ID',true);
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger,idea=this.checkedIdea(ledger,idValue,body.baseVersion);
      const source=ledger.sources.find(s=>s.id===body.sourceId),ref=Evolution.sourceRef(body,source,fail),prior=Evolution.Model.origins(idea);
      if(prior.some(p=>Evolution.same(p,ref)))fail('That source reference is already recorded.');
      idea.provenance=[...prior,ref];const at=this.now().toISOString();idea.review.updatedAt=at;
      Evolution.record(idea,at,'provenance-added',{provenance:prior},{provenance:idea.provenance});validateLedger(ledger);this.periodic(state.bytes);
      return {ok:true,idea,ideaVersion:this.ideaVersion(ledger,idea),...this.affected(ledger,[idea]),...this.persist(ledger,ledger.meta.revision||0)};
    });
  }
  mergeIdeas(body) {
    if(!object(body)||!Array.isArray(body.ids)||body.ids.length<2||new Set(body.ids).size!==body.ids.length||!body.ids.includes(body.survivorId)||!object(body.ideaVersions)||!object(body.survivorPatch))fail('Select at least two distinct ideas, their versions, and a survivor among them.');
    for(const value of body.ids)id(value,'Merge participant');
    const patch=body.survivorPatch;
    if(Object.keys(patch).some(k=>![...IDEA_FIELDS,'disposition'].includes(k)))fail('Unsupported survivor field.');
    for(const f of ['title','summary','project','type'])string(patch[f],`Survivor ${f}`,true);tags(patch.tags,'Survivor tags');
    if(patch.disposition!==undefined&&!DISPOSITIONS.includes(patch.disposition))fail('Invalid survivor disposition.');
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger;
      const participants=body.ids.map(value=>this.checkedIdea(ledger,value,body.ideaVersions[value]));
      if(participants.some(i=>i.merge))fail('A selected idea was already merged away. Follow its current inheritor and choose that idea instead.');
      const survivor=participants.find(i=>i.id===body.survivorId),contributors=participants.filter(i=>i!==survivor),before=clone(survivor),at=this.now().toISOString(),operationId=randomUUID();
      survivor.provenance=Evolution.Model.unionOrigins(participants);
      for(const f of IDEA_FIELDS)survivor[f]=clone(patch[f]);
      if(patch.disposition!==undefined)survivor.review.disposition=patch.disposition;
      survivor.review.updatedAt=at;if(survivor.review.disposition==='To review')survivor.review.reviewedAt=null;else survivor.review.reviewedAt||=at;
      Evolution.meaningfulChanges(survivor,before,at);
      Evolution.record(survivor,at,'merge-completed',{project:before.project,type:before.type,tags:before.tags,provenance:Evolution.Model.origins(before)},{operationId,contributorIds:contributors.map(i=>i.id),project:survivor.project,type:survivor.type,tags:survivor.tags,provenance:survivor.provenance},contributors.map(i=>i.id));
      for(const idea of contributors){
        const old=clone(idea);idea.merge={into:survivor.id,at,operationId};idea.review.disposition='Superseded';idea.review.updatedAt=at;idea.review.reviewedAt||=at;
        Evolution.meaningfulChanges(idea,old,at);
        Evolution.record(idea,at,'merged-into',{disposition:old.review.disposition},{into:survivor.id,operationId},[survivor.id]);
      }
      validateLedger(ledger);const backupFile=this.verifiedCopy(state.bytes,'before-merge');
      return {ok:true,idea:survivor,ideaVersion:this.ideaVersion(ledger,survivor),...this.affected(ledger,participants),backupFile,...this.persist(ledger,ledger.meta.revision||0)};
    });
  }
  supersede(idValue,body) {
    if(!object(body)||typeof body.baseVersion!=='string'||typeof body.targetVersion!=='string')fail('Supersession requires versions for both ideas.');
    id(body.targetId,'Superseded idea');if(body.targetId===idValue)fail('An idea cannot supersede itself.');if(body.note!==undefined)string(body.note,'Relationship note');
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger,newer=this.checkedIdea(ledger,idValue,body.baseVersion),older=this.checkedIdea(ledger,body.targetId,body.targetVersion);
      if(newer.merge)fail('A merged-away idea cannot be the replacement. Choose its current inheritor.');
      if(newer.review.lineage.some(r=>r.relation==='supersedes'&&r.targetId===older.id))fail('This supersession is already recorded.');
      const beforeNew=clone(newer),beforeOld=clone(older),at=this.now().toISOString();
      newer.review.lineage.push({relation:'supersedes',targetId:older.id,note:body.note||''});newer.review.updatedAt=at;
      older.review.disposition='Superseded';older.review.updatedAt=at;older.review.reviewedAt||=at;
      Evolution.meaningfulChanges(newer,beforeNew,at);Evolution.meaningfulChanges(older,beforeOld,at);
      Evolution.record(older,at,'superseded-by',null,{ideaId:newer.id},[newer.id]);validateLedger(ledger);
      const backupFile=this.verifiedCopy(state.bytes,'before-supersession');
      return {ok:true,idea:newer,ideaVersion:this.ideaVersion(ledger,newer),...this.affected(ledger,[newer,older]),backupFile,...this.persist(ledger,ledger.meta.revision||0)};
    });
  }
  manageProject(body) {
    if(!object(body)||typeof body.baseVersion!=='string'||!['create','reorder'].includes(body.operation))fail('Review projects before changing project organisation.');
    if(body.operation==='create'){string(body.name,'Project name',true);if(body.name!==body.name.trim()||body.name.length>200)fail('Use a trimmed project name of at most 200 characters.');}
    if(body.operation==='reorder')Projects.validate(body.order,fail);
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger;
      if(state.version!==body.baseVersion)throw new LedgerError(409,'CONFLICT','The ledger changed after project review. Review latest projects before retrying.');
      const names=Projects.names(ledger);
      if(body.operation==='create'){if(names.includes(body.name))fail('That project already exists.');ledger.meta.projects=[...names,body.name];}
      else {if(!Array.isArray(body.order)||body.order.length!==names.length||names.some(n=>!body.order.includes(n)))fail('Reorder must include every current project exactly once.');ledger.meta.projects=[...body.order];}
      validateLedger(ledger);const backupFile=this.verifiedCopy(state.bytes,'before-project-management');this.persist(ledger,ledger.meta.revision||0);
      return {ok:true,...this.envelope(),backupFile};
    });
  }
  renameProject(body) {
    if(!object(body)||typeof body.baseVersion!=='string')fail('Project rename requires the reviewed ledger version.');
    string(body.from,'Current project',true);string(body.to,'New project',true);
    const from=body.from,to=body.to.trim();if(from===to)fail('Choose a different project name.');
    if(to.length>200)fail('Project name must be at most 200 characters.');
    if(body.confirmCombine!==undefined&&typeof body.confirmCombine!=='boolean')fail('Combine confirmation must be boolean.');
    return this.queue(()=>{
      const state=this.latest(),ledger=state.ledger;
      if(state.version!==body.baseVersion)throw new LedgerError(409,'CONFLICT','The ledger changed after project review. Review the latest projects before retrying.');
      const ideas=ledger.ideas.filter(i=>i.project===from),sources=ledger.sources.filter(s=>s.project===from);
      if(!Projects.names(ledger).includes(from))fail('The selected project no longer exists.');
      const combines=Projects.names(ledger).includes(to);
      if(combines&&body.confirmCombine!==true)fail('The destination project exists. Explicitly confirm combining these categories.');
      if(ledger.meta.projects)ledger.meta.projects=[...new Set(ledger.meta.projects.map(name=>name===from?to:name))];
      const at=this.now().toISOString();
      for(const idea of ideas){idea.project=to;idea.review.updatedAt=at;Evolution.record(idea,at,'project-renamed',{project:from},{project:to});}
      for(const source of sources)source.project=to;
      validateLedger(ledger);const backupFile=this.verifiedCopy(state.bytes,'before-project-rename');this.persist(ledger,ledger.meta.revision||0);
      return {ok:true,...this.envelope(),backupFile,renamed:{from,to,ideas:ideas.length,sources:sources.length,combined:combines}};
    });
  }
  snapshot() { return this.queue(() => { const state = this.latest(); return { ok: true, file: this.verifiedCopy(state.bytes, 'manual'), backup: this.backupStatus }; }); }
  token(version, candidateHash, mode) { return createHmac('sha256', this.secret).update(JSON.stringify([version, candidateHash, mode])).digest('hex'); }
  preview(candidate) {
    validateLedger(candidate);
    return this.queue(() => {
      const current = this.inspect();
      if (this.externalChange) throw new LedgerError(409, 'EXTERNAL_CHANGE', 'External file changes detected. Stop external writers and restart before importing.');
      const old = current.ledger, sourceIds = new Set(candidate.sources.map(s => s.id)), ideaIds = new Set(candidate.ideas.map(i => i.id));
      const changed = old ? old.sources.filter(s => sourceIds.has(s.id) && candidate.sources.find(n => n.id === s.id).raw !== s.raw).map(s => s.id) : [];
      return { mode: current.mode, compatible: true, schemaVersion: 2, current: old ? { sources: old.sources.length, ideas: old.ideas.length } : null,
        candidate: { sources: candidate.sources.length, ideas: candidate.ideas.length },
        missingSourceIds: old ? old.sources.filter(s => !sourceIds.has(s.id)).map(s => s.id) : [],
        missingIdeaIds: old ? old.ideas.filter(i => !ideaIds.has(i.id)).map(i => i.id) : [], changedRawSourceIds: changed,
        empty: candidate.sources.length === 0 && candidate.ideas.length === 0,
        confirmation: this.token(current.version, hash(JSON.stringify(candidate)), current.mode) };
    });
  }
  replace(body, mode) {
    if (!object(body)) fail('A replacement object is required.');
    validateLedger(body.ledger);
    if (typeof body.confirmation !== 'string') throw new LedgerError(428, 'PREVIEW_REQUIRED', 'Preview and confirm this replacement first.');
    const candidate = clone(body.ledger), candidateHash = hash(JSON.stringify(candidate));
    return this.queue(() => {
      const current = this.inspect();
      if (this.externalChange) throw new LedgerError(409, 'EXTERNAL_CHANGE', 'External file changes detected. Restart after stopping external writers.');
      const expected = this.token(current.version, candidateHash, current.mode);
      const supplied = Buffer.from(body.confirmation);
      if (current.mode !== mode || supplied.length !== expected.length || !timingSafeEqual(supplied, Buffer.from(expected))) throw new LedgerError(409, 'CONFLICT', 'The ledger, replacement, or server changed after preview. Review a fresh preview; nothing was replaced.');
      if (!candidate.sources.length && !candidate.ideas.length && body.confirmEmpty !== true) throw new LedgerError(422, 'EMPTY_CONFIRMATION_REQUIRED', 'Explicitly acknowledge replacement with an empty ledger.');
      let backupFile = null;
      if (current.bytes !== null) backupFile = this.verifiedCopy(current.bytes, mode === 'normal' ? 'pre-import' : 'damaged', mode === 'normal');
      candidate.meta.generation = randomUUID(); candidate.meta.importedAt = this.now().toISOString();
      const result = this.persist(candidate, current.ledger?.meta.revision || 0);
      return { ok: true, backupFile, ...result };
    });
  }
  recovery() {
    const state = this.inspect(); const available = [];
    if (this.io.existsSync(this.backups)) for (const file of this.io.readdirSync(this.backups)) {
      if (!file.endsWith('.json')) continue;
      try { const ledger = this.readBackup(file); available.push({ file, sources: ledger.sources.length, ideas: ledger.ideas.length }); } catch (_) {}
    }
    return { mode: state.mode, missing: state.bytes === null, reason: state.error || null, backups: available.sort((a,b) => b.file.localeCompare(a.file)), ledgerId: this.identity };
  }
  readBackup(file) {
    if (typeof file !== 'string' || path.basename(file) !== file || !file.endsWith('.json')) fail('Invalid backup filename.');
    const resolved = fs.realpathSync.native(path.join(this.backups, file));
    if (path.dirname(resolved) !== fs.realpathSync.native(this.backups)) fail('Backup path is outside the backup directory.');
    return validateLedger(JSON.parse(this.io.readFileSync(resolved, 'utf8')));
  }
}
module.exports = { LedgerStore, LedgerError, acquireWriter, validateLedger, validatePatch, hash };
