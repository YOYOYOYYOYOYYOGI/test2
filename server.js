const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();
const SESSION_TTL = 2 * 60 * 60 * 1000;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('='))
    .filter(([key]) => key).map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]));
}
function getSession(req) {
  const id = parseCookies(req).flash_agent_session;
  const session = id && sessions.get(id);
  if (!session || Date.now() - session.createdAt > SESSION_TTL) {
    if (id) sessions.delete(id);
    return null;
  }
  return { id, ...session };
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 300_000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON.'); }
}
async function google(url, key, options = {}) {
  const response = await fetch(`${GEMINI_BASE}${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Google API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}
function agentModels(models) {
  return (models || []).filter(model =>
    Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent')
  ).map(model => ({ name: model.name.replace(/^models\//, ''), label: model.displayName || model.name.replace(/^models\//, '') }))
    .sort((a, b) => {
      const af = /flash/i.test(a.name), bf = /flash/i.test(b.name);
      return Number(bf) - Number(af) || a.name.localeCompare(b.name);
    });
}
function safeText(value, max = 12000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
async function api(req, res) {
  if (req.method === 'GET' && req.url === '/api/session') {
    const session = getSession(req);
    return json(res, 200, { connected: Boolean(session), model: session?.model || null, models: session?.models || [] });
  }
  if (req.method === 'POST' && req.url === '/api/connect') {
    const { apiKey } = await body(req);
    const key = safeText(apiKey, 300);
    if (!key) return json(res, 400, { error: 'Paste an API key first.' });
    try {
      const result = await google('/models', key);
      const models = agentModels(result.models);
      if (!models.length) return json(res, 403, { error: 'This key is valid, but it has no text-generation models available.' });
      const preferred = models.find(m => /gemini.*flash/i.test(m.name)) || models[0];
      const id = crypto.randomBytes(32).toString('hex');
      sessions.set(id, { key, models, model: preferred.name, createdAt: Date.now() });
      res.setHeader('Set-Cookie', `flash_agent_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
      return json(res, 200, { connected: true, model: preferred.name, models });
    } catch (error) {
      return json(res, error.status === 400 || error.status === 403 ? 401 : 502, { error: `Could not verify this key: ${error.message}` });
    }
  }
  if (req.method === 'POST' && req.url === '/api/disconnect') {
    const current = getSession(req);
    if (current) sessions.delete(current.id);
    res.setHeader('Set-Cookie', 'flash_agent_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { connected: false });
  }
  if (req.method === 'POST' && req.url === '/api/chat') {
    const session = getSession(req);
    if (!session) return json(res, 401, { error: 'Connect an API key before starting the agent.' });
    const { message, history, model } = await body(req);
    const prompt = safeText(message, 10000);
    if (!prompt) return json(res, 400, { error: 'Write a message first.' });
    const selected = session.models.find(item => item.name === model)?.name || session.model;
    const prior = Array.isArray(history) ? history.slice(-12).map(turn => ({
      role: turn?.role === 'model' ? 'model' : 'user',
      parts: [{ text: safeText(turn?.text, 8000) }]
    })).filter(turn => turn.parts[0].text) : [];
    try {
      const result = await google(`/models/${encodeURIComponent(selected)}:generateContent`, session.key, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are Flash Agent, a clear, practical and helpful AI assistant. Be concise by default. If you are uncertain, say so. Do not claim to perform actions you cannot perform.' }] },
          contents: [...prior, { role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      });
      const text = result?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!text) return json(res, 502, { error: 'The model returned no text. It may have blocked this request or reached a quota limit.' });
      return json(res, 200, { text, model: selected });
    } catch (error) {
      return json(res, error.status === 429 ? 429 : 502, { error: error.status === 429 ? `Rate limit or quota reached: ${error.message}` : error.message });
    }
  }
  return json(res, 404, { error: 'API route not found.' });
}
function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Only GET requests are supported for website files.' });
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, requested);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
http.createServer(async (req, res) => {
  try { if (req.url.startsWith('/api/')) await api(req, res); else serveStatic(req, res); }
  catch (error) { json(res, 400, { error: error.message || 'Something went wrong.' }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Flash Agent is running on http://0.0.0.0:${PORT}`));

setInterval(() => { for (const [id, session] of sessions) if (Date.now() - session.createdAt > SESSION_TTL) sessions.delete(id); }, 15 * 60 * 1000).unref();
