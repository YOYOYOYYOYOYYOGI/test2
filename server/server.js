import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeWithProviders, generateCreatorWithProvider, generateScriptWithProviders, publicProviderStatus, synthesizeWithProvider } from './providers/index.js';
import { createRenderJobRecord, getRenderingCapabilities, transcodeWebmToMp4 } from './rendering/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT || 8787);
const jobs = new Map();
const projects = new Map();

function loadDotEnv(file) { try { const content = fsSync.readFileSync(file, 'utf8'); for (const line of content.split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } } catch { /* .env is optional */ } }
function headers(extra = {}) { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', ...extra }; }
function sendJson(response, status, data) { response.writeHead(status, headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })); response.end(JSON.stringify(data)); }
function errorJson(response, error, status = 500) { sendJson(response, status, { error: error.message || String(error), provider: error.provider || undefined }); }
async function bodyJson(request, maxBytes = 2_000_000) { let data = ''; for await (const chunk of request) { data += chunk; if (data.length > maxBytes) throw new Error('Request body is too large. Keep product assets in browser storage.'); } return data ? JSON.parse(data) : {}; }
async function bodyBuffer(request, maxBytes = 100_000_000) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new Error('Video is too large for the local transcode endpoint.'); chunks.push(chunk); } return Buffer.concat(chunks); }
function safePath(urlPath) { const raw = decodeURIComponent(urlPath.split('?')[0]); const requested = raw === '/' ? '/dashboard.html' : raw; const bundledExtensionRoot = path.join(ROOT, 'extension'); const staticRoot = (awaitableExists(path.join(bundledExtensionRoot, 'dashboard.html'))) ? bundledExtensionRoot : ROOT; const relative = requested.startsWith('/extension/') ? requested.slice('/extension/'.length) : requested.slice(1); const resolved = path.resolve(staticRoot, relative); if (!resolved.startsWith(path.resolve(staticRoot))) return null; return resolved; }
function awaitableExists(file) { try { fsSync.accessSync(file); return true; } catch { return false; } }
async function serveStatic(request, response) { const file = safePath(request.url); if (!file) return sendJson(response, 403, { error: 'Forbidden' }); try { const stat = await fs.stat(file); if (!stat.isFile()) throw new Error('not file'); const extension = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' }; response.writeHead(200, headers({ 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-cache' })); response.end(await fs.readFile(file)); } catch { sendJson(response, 404, { error: 'Not found' }); } }

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, headers()); return response.end(); }
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && request.method === 'GET') return sendJson(response, 200, { ok: true, version: '1.0.0', mode: 'local', time: new Date().toISOString() });
    if (url.pathname === '/api/providers/status' && request.method === 'GET') return sendJson(response, 200, publicProviderStatus());
    if (url.pathname === '/api/capabilities' && request.method === 'GET') return sendJson(response, 200, await getRenderingCapabilities());
    if (url.pathname === '/api/render/mp4' && request.method === 'POST') { const mp4 = await transcodeWebmToMp4(await bodyBuffer(request)); response.writeHead(200, headers({ 'Content-Type': 'video/mp4', 'Content-Length': mp4.length, 'Content-Disposition': 'attachment; filename="ugc-video.mp4"' })); return response.end(mp4); }
    if (url.pathname === '/api/analyze-script' && request.method === 'POST') { const payload = await bodyJson(request); if (!payload.script?.trim()) return sendJson(response, 400, { error: 'script is required' }); return sendJson(response, 200, await analyzeWithProviders(payload)); }
    if (url.pathname === '/api/generate-script' && request.method === 'POST') { const payload = await bodyJson(request); return sendJson(response, 200, await generateScriptWithProviders(payload)); }
    if (url.pathname === '/api/generate-creator' && request.method === 'POST') { const payload = await bodyJson(request); return sendJson(response, 200, await generateCreatorWithProvider(payload)); }
    if (url.pathname === '/api/generate-voice' && request.method === 'POST') { const payload = await bodyJson(request); if (!payload.text?.trim()) return sendJson(response, 400, { error: 'text is required' }); return sendJson(response, 200, await synthesizeWithProvider(payload)); }
    if (url.pathname === '/api/render/jobs' && request.method === 'POST') { const job = createRenderJobRecord({ projectId: payloadProjectId(await bodyJson(request)) }); jobs.set(job.id, job); return sendJson(response, 202, job); }
    if (url.pathname.startsWith('/api/render/jobs/') && request.method === 'GET') { const job = jobs.get(url.pathname.split('/').pop()); return job ? sendJson(response, 200, job) : sendJson(response, 404, { error: 'Render job not found' }); }
    if (url.pathname === '/api/projects' && request.method === 'POST') { const project = await bodyJson(request); const id = project.id || `project-${Date.now()}`; const saved = { ...project, id, updatedAt: new Date().toISOString() }; projects.set(id, saved); return sendJson(response, 200, saved); }
    if (url.pathname === '/api/projects' && request.method === 'GET') return sendJson(response, 200, [...projects.values()]);
    if (request.method === 'GET') return serveStatic(request, response);
    return sendJson(response, 404, { error: 'Route not found' });
  } catch (error) { console.error(error); return errorJson(response, error, error.status || 500); }
});
function payloadProjectId(payload) { return payload?.projectId || null; }
server.listen(PORT, '0.0.0.0', () => console.log(`UGC Video Creator gateway listening on http://0.0.0.0:${PORT}`));
