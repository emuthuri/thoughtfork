'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createHash } = require('crypto');
const { LedgerStore, LedgerError, acquireWriter } = require('./lib/ledger');
const HOST = '127.0.0.1';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon' };
function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(payload), 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra }); res.end(payload);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = false; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > max) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(chunk); });
    req.on('end', () => {
      if (tooLarge) return reject(new LedgerError(413, 'BODY_TOO_LARGE', `Request exceeds the configured ${Math.round(max/1024/1024)} MiB limit. Nothing was changed.`));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(new LedgerError(400, 'BAD_JSON', 'Request is not valid JSON.')); }
    });
    req.on('aborted', () => reject(new LedgerError(400, 'REQUEST_ABORTED', 'Request ended before the body was received.')));
    req.on('error', reject);
  });
}
function checkLocal(req, mutation) {
  const port = req.socket.localPort;
  if (![`${HOST}:${port}`, `localhost:${port}`].includes(req.headers.host)) throw new LedgerError(403, 'INVALID_HOST', 'Use the local thoughtFork address shown by the server.');
  if (!mutation) return;
  const expected = `http://${req.headers.host}`;
  if (req.headers.origin !== undefined && req.headers.origin !== expected) throw new LedgerError(403, 'FOREIGN_ORIGIN', 'Cross-origin mutations are not allowed.');
  if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) throw new LedgerError(403, 'FOREIGN_ORIGIN', 'Cross-site mutations are not allowed.');
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) throw new LedgerError(415, 'JSON_REQUIRED', 'Mutations require Content-Type: application/json.');
}
async function createApplication(options = {}) {
  const root = options.root || __dirname;
  const store = options.store || new LedgerStore(options.ledgerFile || path.join(root, 'data', 'ledger.json'));
  const owner = options.ownership === false ? null : await acquireWriter(store.file);
  try { store.start(); } catch (e) { if (owner) await owner.release(); throw e; }
  const importLimit = options.importLimit || 128 * 1024 * 1024;
  const server = http.createServer(async (req, res) => {
    try {
      checkLocal(req, !['GET','HEAD','OPTIONS'].includes(req.method));
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const match = url.pathname.match(/^\/api\/ideas\/([^/]+)$/);
        const sourceMatch=url.pathname.match(/^\/api\/sources\/([^/]+)$/);
        const evolutionMatch=url.pathname.match(/^\/api\/ideas\/([^/]+)\/(provenance|supersede)$/);
        if (req.method === 'GET') {
          if (url.pathname === '/api/health') return json(res, 200, { application:'thoughtFork', launchProtocol:1, projectId:createHash('sha256').update(path.resolve(root).replaceAll('\\','/').toLowerCase()).digest('hex'), pid:process.pid, mode:store.inspect().mode });
          if (url.pathname === '/api/ledger') return json(res, 200, store.envelope());
          if (url.pathname === '/api/recovery') return json(res, 200, store.recovery());
          if (url.pathname === '/api/backup') return json(res, 200, { ledger: store.readBackup(url.searchParams.get('file')) });
          throw new LedgerError(405, 'METHOD_NOT_ALLOWED', 'This API route does not support GET.');
        }
        if (!((sourceMatch && req.method==='PATCH') || (match && req.method === 'PATCH') || (evolutionMatch && req.method === 'POST') || (!match && req.method === 'POST' && ['/api/organise','/api/ideas','/api/merge','/api/projects/rename','/api/projects/manage','/api/captures','/api/snapshot','/api/import/preview','/api/import','/api/recover'].includes(url.pathname)))) throw new LedgerError(405, 'METHOD_NOT_ALLOWED', 'Unsupported API route or HTTP method.');
        const body = await readBody(req, ['/api/import/preview','/api/import','/api/recover'].includes(url.pathname) ? importLimit : 32 * 1024 * 1024);
        if(sourceMatch)return json(res,200,await store.editSource(decodeURIComponent(sourceMatch[1]),body));
        if(url.pathname==='/api/organise')return json(res,200,await store.organise(body));
        if (match) return json(res, 200, await store.patch(decodeURIComponent(match[1]), body));
        if(evolutionMatch)return json(res,200,await store[evolutionMatch[2]==='provenance'?'attachSource':'supersede'](decodeURIComponent(evolutionMatch[1]),body));
        if(url.pathname==='/api/ideas')return json(res,201,await store.createIdea(body));
        if(url.pathname==='/api/projects/manage')return json(res,200,await store.manageProject(body));
        if(url.pathname==='/api/projects/rename')return json(res,200,await store.renameProject(body));
        if(url.pathname==='/api/merge')return json(res,200,await store.mergeIdeas(body));
        if (url.pathname === '/api/captures') return json(res, 201, await store.capture(body));
        if (url.pathname === '/api/snapshot') { if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new LedgerError(422, 'INVALID_SNAPSHOT', 'Snapshot requires an empty JSON object.'); return json(res, 200, await store.snapshot()); }
        if (url.pathname === '/api/import/preview') return json(res, 200, await store.preview(body.ledger));
        if (url.pathname === '/api/import') return json(res, 200, await store.replace(body, 'normal'));
        if (url.pathname === '/api/recover') return json(res, 200, await store.replace(body, 'recovery'));
      }
      if (!['GET','HEAD'].includes(req.method)) throw new LedgerError(405, 'METHOD_NOT_ALLOWED', 'Static files are read only.');
      const publicDir = path.join(root, 'public');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(publicDir, '.' + pathname);
      if (!file.startsWith(publicDir + path.sep)) throw new LedgerError(403, 'FORBIDDEN', 'Forbidden path.');
      const bytes = await fs.promises.readFile(file);
      res.writeHead(200, { 'Content-Type':MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length':bytes.length, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      const status = e instanceof LedgerError ? e.status : e.code === 'ENOENT' ? 404 : 500;
      if (!res.headersSent) json(res, status, { error: e instanceof LedgerError ? e.message : 'The operation failed. No success has been acknowledged.', code: e.code || 'INTERNAL_ERROR', ...(e.details || {}) });
      else res.destroy();
    }
  });
  let closed = false;
  const close = async () => { if (closed) return; closed = true; server.closeIdleConnections?.(); await new Promise(resolve => server.close(resolve)); await store.tail; if (owner) await owner.release(); };
  server.once('error', () => owner?.release().catch(() => {}));
  return { server, store, close };
}
async function main() {
  const app = await createApplication();
  const port = Number(process.env.PORT || 4173);
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, HOST, resolve); });
  const address = `http://${HOST}:${app.server.address().port}`;
  console.log(`\nthoughtFork is running at ${address}\nMode: ${app.store.inspect().mode}\nYour data is stored in data/ledger.json\nPress Ctrl+C to stop.\n`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (process.argv.includes('--open')) {
    const args = process.platform === 'win32' ? ['cmd', ['/c','start','',address]] : process.platform === 'darwin' ? ['open',[address]] : ['xdg-open',[address]];
    try { spawn(args[0], args[1], { detached:true, stdio:'ignore', windowsHide:true }).unref(); } catch (_) {}
  }
}
if (require.main === module) main().catch(e => { console.error(`thoughtFork could not start: ${e.message}`); process.exitCode = 1; });
module.exports = { createApplication, readBody, checkLocal };
