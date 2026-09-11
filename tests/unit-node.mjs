/*
 * Node-side unit + integration tests (dev tool - NOT shipped).
 *  - pure content modules (script/hook builders, parsers, prompts)
 *  - service worker message wiring using the REAL net-relay over HTTP
 *  - the REAL secure backend end-to-end against a localhost fal-shaped mock
 *  - manifest validity and a strict source security audit
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EXT = join(ROOT, 'reelforge-ai-ugc');
const BACKEND = join(ROOT, 'reelforge-backend');

let passed = 0;
function ok(name, cond, detail = '') {
  assert.ok(cond, `${name} ${detail}`);
  passed++;
  console.log('PASS ', name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extUrl = (p) => pathToFileURL(join(EXT, p)).href;

/* ========================================================= */
/* 1. Content modules                                         */
/* ========================================================= */
{
  const gen = await import(extUrl('scripts/script-generator.js'));
  const { defaultSettings } = await import(extUrl('scripts/config.js'));
  const product = {
    name: 'GlowDrop Serum',
    description: 'A lightweight hydrating serum',
    benefits: 'all-day hydration\nplumper skin',
    audience: 'women with dry skin',
    problem: 'dry tight skin by noon',
    solution: 'three drops lock in moisture',
    offer: '20% off first order',
    cta: 'grab yours via the link',
  };
  const defaults = defaultSettings().defaults;

  const script = gen.buildLocalScript({ product, defaults: { ...defaults, language: 'English' } });
  for (const label of ['HOOK', 'PROBLEM', 'SOLUTION', 'PRODUCT', 'BENEFIT', 'CTA']) {
    ok(`local script contains ${label}`, script.includes(label));
  }
  ok('local script mentions the product', script.includes('GlowDrop'));
  ok('local script includes the CTA', /link/i.test(script));

  const sections = gen.parseScriptSections(script);
  ok('parsed script has all six sections', ['HOOK', 'PROBLEM', 'SOLUTION', 'PRODUCT', 'BENEFIT', 'CTA'].every((s) => sections[s]));
  ok('parsed HOOK is non-empty', sections.HOOK.length > 5);

  const freeForm = gen.parseScriptSections('just a plain script with no labels');
  ok('free-form script tolerated', freeForm.HOOK.startsWith('just a plain'));

  const hooks = gen.buildLocalHooks(product, 6);
  ok('six local hooks generated', hooks.length === 6);
  ok('hooks sound like UGC', hooks.some((h) => /I wish|finally|sign|stop scrolling/i.test(h)));

  const parsed = gen.extractJsonObject('Here you go:\n```json\n{"name":"X","benefits":["a","b"]}\n```\n');
  ok('JSON object extraction from code fence', parsed.name === 'X' && parsed.benefits.length === 2);
  const hookList = gen.parseHooksPayload('{"hooks":["one?","two!"]}');
  ok('hooks payload parsed', hookList.length === 2 && hookList[0] === 'one?');
  assert.throws(() => gen.extractJsonObject('no json here'), /JSON/);
  ok('invalid JSON throws', true);

  const merged = gen.mergeProductInfo({ name: 'Kept', description: '' }, { name: 'Ignored?', description: 'filled', benefits: ['a', 'b'] });
  ok('merge preserves user-filled fields', merged.name === 'Kept' && merged.description === 'filled' && merged.benefits === 'a\nb');

  const creatorPrompt = gen.creatorImagePrompt({ product, defaults });
  ok('creator prompt describes a phone UGC shot', /UGC|selfie/i.test(creatorPrompt) && creatorPrompt.includes('GlowDrop Serum'));
  const motion = gen.videoMotionPrompt({ product, scriptText: script, defaults });
  ok('video motion prompt is vertical 9:16', /9:16/i.test(motion) && motion.includes('GlowDrop Serum'));
  ok('motion prompt embeds spoken content for lip-sync', /HOOK|hydration/i.test(motion));

  const msgs = gen.scriptMessages({ product, defaults });
  ok('script prompt messages built', msgs.length === 2 && /HOOK/.test(msgs[1].content));
}

/* ========================================================= */
/* 2. Service worker wiring via the REAL relay (http mock)    */
/* ========================================================= */
function localServer(handler, port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
{
  const { server, url } = await localServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"hello":true}'); }
    res.writeHead(500); res.end('boom');
  });

  let listener;
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener() {} },
    },
  };
  await import(extUrl('background/service-worker.js'));
  ok('service worker registered an onMessage listener', typeof listener === 'function');

  const keepAlive = listener({ type: 'other' }, {}, () => {});
  ok('worker ignores unrelated messages (returns false)', keepAlive === false);

  const response = await new Promise((resolve) => {
    listener({ type: 'rf:fetch', request: { method: 'GET', url: `${url}/ok` } }, {}, resolve);
  });
  ok('relay through worker returns 200 JSON', response.ok && response.data.status === 200 && response.data.bodyText.includes('hello'));

  const blocked = await new Promise((resolve) => {
    listener({ type: 'rf:fetch', request: { method: 'GET', url: 'http://example.com/x' } }, {}, resolve);
  });
  ok('worker relay blocks non-localhost http', blocked.ok === false && /localhost/i.test(blocked.error.message));

  server.close();
}

/* ========================================================= */
/* 3. Secure backend against a localhost fal-shaped mock       */
/* ========================================================= */
function falLikeMock() {
  const jobs = new Map();
  const webm = readFileSync(join(HERE, 'fixtures', 'sample.webm'));
  const png = readFileSync(join(HERE, 'fixtures', 'product.png'));
  const self = { url: 'http://127.0.0.1' };
  const server = http.createServer((req, res) => {
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
      res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
    };
    const u = new URL(req.url, self.url);
    if (req.method === 'GET' && u.pathname.startsWith('/media/')) {
      return send(200, u.pathname.endsWith('.webm') ? webm : png, u.pathname.endsWith('.webm') ? 'video/webm' : 'image/png');
    }
    if (req.headers.authorization !== 'Key mock-key') return send(403, { detail: 'bad key' });
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      // POST /:endpoint
      if (req.method === 'POST' && !u.pathname.includes('/requests/')) {
        const id = `r_${Math.random().toString(36).slice(2, 10)}`;
        jobs.set(id, { endpoint: u.pathname.replace(/^\//, ''), body, at: Date.now() });
        return send(200, { request_id: id });
      }
      const statusMatch = /^\/([\w./-]+)\/requests\/([\w-]+)\/status/.exec(u.pathname);
      if (req.method === 'GET' && statusMatch) {
        const j = jobs.get(statusMatch[2]);
        if (!j) return send(404, { detail: 'unknown' });
        return send(200, { status: Date.now() - j.at > 200 ? 'COMPLETED' : 'IN_PROGRESS' });
      }
      const resultMatch = /^\/([\w./-]+)\/requests\/([\w-]+)$/.exec(u.pathname);
      if (req.method === 'GET' && resultMatch) {
        const j = jobs.get(resultMatch[2]);
        if (!j) return send(404, { detail: 'unknown' });
        if (j.endpoint.includes('any-llm')) {
          const isHooks = JSON.stringify(j.body.messages || []).includes('hooks');
          const text = isHooks
            ? JSON.stringify({ hooks: ['hook one', 'hook two', 'hook three', 'hook four', 'hook five', 'hook six'] })
            : JSON.stringify({ name: 'P', description: 'D', benefits: ['b1', 'b2'], audience: 'a', problem: 'p', solution: 's', offer: 'o', cta: 'c' });
          return send(200, { choices: [{ message: { content: text } }] });
        }
        if (/video|kling/i.test(j.endpoint)) {
          return send(200, { video: { url: `http://${u.host}/media/sample.webm`, content_type: 'video/webm' } });
        }
        return send(200, { images: [{ url: `http://${u.host}/media/product.png` }] });
      }
      send(404, { detail: 'unmapped' });
    });
  });
  server.selfUrl = () => { self.url = `http://127.0.0.1:${server.address().port}`; };
  return server;
}
{
  const mock = falLikeMock();
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  mock.selfUrl();
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;

  const backendPort = 8801 + Math.floor(Math.random() * 100);
  const backendServer = spawn(process.execPath, [join(BACKEND, 'server.mjs')], {
    env: {
      ...process.env,
      PORT: String(backendPort),
      PROXY_KEY: 'unit-key',
      LLM_PROVIDER: 'fal', IMAGE_PROVIDER: 'fal', VIDEO_PROVIDER: 'fal',
      FAL_KEY: 'mock-key', FAL_ROOT_URL: mockUrl,
      FAL_IMAGE_MODEL: 'fal-ai/flux/kontext/max',
      FAL_VIDEO_MODEL: 'fal-ai/kling-video/v2/master/image-to-video',
    },
  });
  const base = `http://127.0.0.1:${backendPort}`;
  let logs = '';
  backendServer.stdout.on('data', (d) => { logs += d; });
  backendServer.stderr.on('data', (d) => { logs += d; });

  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) break; } catch {}
    await sleep(150);
  }
  const api = (path, opts = {}) => fetch(`${base}${path}`, {
    ...opts,
    headers: { 'X-ReelForge-Key': 'unit-key', 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

  const health = await fetch(`${base}/health`);
  ok('backend /health responds', health.ok);

  const noKey = await fetch(`${base}/api/test`, { method: 'POST', body: '{}' });
  ok('backend rejects missing proxy key with 401', noKey.status === 401);

  const test = await (await api('/api/test', { method: 'POST', body: JSON.stringify({ kind: 'video' }) })).json();
  ok('backend connection test passes (video)', test.ok === true && /accepted/i.test(test.message), JSON.stringify(test));

  const chat = await (await api('/api/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'write 6 short UGC video hooks' }] }) })).json();
  ok('backend /api/chat returns LLM text', /hooks/.test(chat.text), String(chat.text).slice(0, 80));

  const image = await (await api('/api/image', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'a UGC creator holding the product', referenceDataUrl: null }),
  })).json();
  if (!(typeof image.dataUrl === 'string' && image.dataUrl.startsWith('data:image/png;base64,'))) {
    console.log('IMAGE FAILURE RESPONSE:', JSON.stringify(image), '\nbackend logs:\n' + logs);
  }
  ok('backend /api/image returns a data URL image', typeof image.dataUrl === 'string' && image.dataUrl.startsWith('data:image/png;base64,'));

  const job = await (await api('/api/video', { method: 'POST', body: JSON.stringify({ prompt: 'creator talking to camera', duration: 5 }) })).json();
  ok('backend submits a video job', !!job.jobId && job.status !== undefined, JSON.stringify(job));
  let finalState;
  for (let i = 0; i < 40; i++) {
    finalState = await (await api(`/api/video/${job.jobId}`)).json();
    if (finalState.status === 'completed' || finalState.status === 'failed') break;
    await sleep(400);
  }
  ok('backend video job completes', finalState.status === 'completed', JSON.stringify(finalState));
  const content = await api(finalState.videoUrl.replace(base, ''));
  const buf = Buffer.from(await content.arrayBuffer());
  ok('backend streams finished video bytes', content.ok && buf.length === readFileSync(join(HERE, 'fixtures', 'sample.webm')).length, `len=${buf.length}`);

  const unknown = await api('/api/video/job_does_not_exist');
  ok('unknown job returns 404', unknown.status === 404);

  backendServer.kill();
  mock.close();
  if (/Unhandled|Error: listen/i.test(logs)) ok('backend logged no startup errors', false, logs.slice(0, 200));
  else ok('backend logged no startup errors', true);
}

/* ========================================================= */
/* 3b. v2 settings, migration, per-provider LLM adapters      */
/* ========================================================= */
{
  // chrome shim: in-memory storage + the REAL net-relay for httpJson().
  const relay = await import(extUrl('scripts/net-relay.js'));
  const storeVals = new Map();
  globalThis.chrome = {
    runtime: {
      sendMessage(message, cb) {
        relay.relayFetch(message.request)
          .then((data) => cb({ ok: true, data }))
          .catch((err) => cb({ ok: false, error: { message: err.message, name: err.name } }));
      },
    },
    storage: {
      local: {
        async get(key) { return { [key]: storeVals.has(key) ? structuredClone(storeVals.get(key)) : undefined }; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) storeVals.set(k, structuredClone(v)); },
        async remove(key) { storeVals.delete(key); },
      },
    },
  };

  const config = await import(extUrl('scripts/config.js'));
  const storage = await import(extUrl('scripts/storage.js'));
  const llmMod = await import(extUrl('scripts/providers/llm.js'));
  const upstream = await import(pathToFileURL(join(BACKEND, 'lib', 'upstream.mjs')).href);

  /* ---- catalogue order and v2 default shape ---- */
  ok('LLM providers ordered: local, gemini, openai, openrouter, groq, together, fal',
    JSON.stringify(config.PROVIDERS.llm.map((p) => p.id))
      === JSON.stringify(['local', 'gemini', 'openai', 'openrouter', 'groq', 'together', 'fal']));
  const d = config.defaultSettings();
  ok('default settings are version 2', d.version === 2);
  ok('each cloud LLM provider has its own credential slot',
    ['gemini', 'openai', 'openrouter', 'groq', 'together', 'fal'].every((id) => d.llm.providers[id]));
  ok('no legacy shared llm apiKey/baseUrl/model in defaults',
    d.llm.apiKey === undefined && d.llm.baseUrl === undefined && d.llm.model === undefined);
  ok('gemini slot preconfigured for the native endpoint and a 2.5 model',
    d.llm.providers.gemini.baseUrl === 'https://generativelanguage.googleapis.com/v1beta'
      && d.llm.providers.gemini.model === 'gemini-2.5-flash');
  ok('openai slot pinned to https://api.openai.com/v1', d.llm.providers.openai.baseUrl === 'https://api.openai.com/v1');
  ok('all provider keys default to empty', Object.values(d.llm.providers).every((p) => !p.apiKey));

  /* ---- v1 -> v2 migration through the real storage layer ---- */
  storeVals.set(config.STORAGE_KEYS.SETTINGS, {
    mode: 'direct',
    llm: { provider: 'groq', apiKey: 'gsk-legacy', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-old' },
    image: d.image, video: d.video, defaults: d.defaults,
  });
  const migrated = await storage.getSettings();
  ok('migration moves the legacy key into the SELECTED provider slot',
    migrated.llm.providers.groq.apiKey === 'gsk-legacy'
      && migrated.llm.providers.groq.model === 'llama-old'
      && migrated.llm.providers.groq.baseUrl === 'https://api.groq.com/openai/v1');
  ok('migration deletes the legacy shared llm fields',
    migrated.llm.apiKey === undefined && migrated.llm.model === undefined && migrated.llm.baseUrl === undefined);
  ok('migration never leaks the legacy key into other provider slots',
    ['gemini', 'openai', 'openrouter', 'together', 'fal'].every((id) => !migrated.llm.providers[id].apiKey));
  ok('migration is persisted at version 2', storeVals.get(config.STORAGE_KEYS.SETTINGS).version === 2);
  const again = await storage.getSettings();
  ok('migration is idempotent', again.llm.providers.groq.apiKey === 'gsk-legacy' && again.version === 2);
  const pub = storage.publicSettingsView(migrated);
  ok('public settings view masks every provider key and never echoes the raw key',
    !JSON.stringify(pub).includes('gsk-legacy')
      && Object.values(pub.llm.providers).every((p) => p.apiKey === '' || p.apiKey === '••••••••'));

  /* ---- localhost mocks implementing the two genuinely different protocols ---- */
  const geminiHits = [];
  const GEM_KEY = 'gemini-mock-key';
  const geminiMock = await localServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const hit = {
        method: req.method, url: req.url,
        googKey: req.headers['x-goog-api-key'] || null,
        auth: req.headers.authorization || null,
        body: raw ? JSON.parse(raw) : null,
      };
      geminiHits.push(hit);
      const good = hit.googKey === GEM_KEY && !hit.auth;
      if (!good) {
        return send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
      }
      if (req.method === 'GET' && u.pathname.endsWith('/models')) {
        return send(200, { models: [{ name: 'models/gemini-2.5-flash' }] });
      }
      if (req.method === 'POST' && u.pathname.includes(':generateContent')) {
        if (u.pathname.includes('gemini-blocked')) {
          return send(200, { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] });
        }
        if (u.pathname.includes('gemini-empty')) {
          return send(200, { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] });
        }
        const asJson = hit.body.generationConfig?.responseMimeType === 'application/json';
        const text = asJson
          ? JSON.stringify({ hooks: ['one?', 'two!', 'three.', 'four?', 'five!', 'six.'] })
          : 'HOOK line\nPROBLEM line';
        return send(200, { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }] });
      }
      send(404, { error: { message: 'not found' } });
    });
  });

  const openaiHits = [];
  const OA_KEY = 'oa-mock-key';
  const openaiMock = await localServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const hit = {
        method: req.method, url: req.url,
        googKey: req.headers['x-goog-api-key'] || null,
        auth: req.headers.authorization || null,
        body: raw ? JSON.parse(raw) : null,
      };
      openaiHits.push(hit);
      // A Google header on the OpenAI-shaped host is a protocol violation by definition.
      if (hit.googKey) return send(400, { error: { message: 'unexpected google key header' } });
      if (hit.auth !== `Bearer ${OA_KEY}`) return send(401, { error: { message: 'Incorrect API key provided' } });
      if (req.method === 'GET' && u.pathname.endsWith('/models')) return send(200, { data: [{ id: 'gpt-4o-mini' }] });
      if (req.method === 'POST' && u.pathname.endsWith('/chat/completions')) {
        const asJson = hit.body.response_format?.type === 'json_object';
        const content = asJson ? JSON.stringify({ hooks: ['a', 'b', 'c'] }) : 'OPENAI OK';
        return send(200, { choices: [{ message: { role: 'assistant', content } }] });
      }
      send(404, { error: { message: 'not found' } });
    });
  });

  const settingsWith = (id, overrides = {}) => {
    const s = config.defaultSettings();
    s.mode = 'direct';
    s.llm.provider = id;
    Object.assign(s.llm.providers[id], overrides);
    return s;
  };

  /* ---- Google Gemini native adapter ---- */
  ok('local templates create no network adapter', llmMod.createLlmProvider(config.defaultSettings()) === null);
  const gemini = llmMod.createLlmProvider(settingsWith('gemini', {
    apiKey: GEM_KEY, baseUrl: `${geminiMock.url}/v1beta`, model: 'gemini-2.5-flash',
  }));
  ok('factory builds the Gemini adapter (not an OpenAI-shaped one)', gemini.constructor.name === 'GeminiChatProvider');
  const text = await gemini.chat([
    { role: 'system', content: 'You write UGC scripts.' },
    { role: 'user', content: 'write a script' },
    { role: 'assistant', content: 'sure' },
    { role: 'user', content: 'continue' },
  ]);
  ok('gemini chat returns candidate text', /HOOK/.test(text));
  const post = geminiHits.find((h) => h.method === 'POST');
  ok('gemini calls the native :generateContent endpoint', /\/models\/gemini-2\.5-flash:generateContent$/.test(post.url));
  ok('gemini authenticates ONLY with x-goog-api-key (never Bearer)', post.googKey === GEM_KEY && post.auth === null);
  ok('gemini maps system messages to systemInstruction', !!post.body.systemInstruction?.parts?.[0]?.text);
  ok('gemini maps assistant turns to role "model"', post.body.contents.some((c) => c.role === 'model'));
  ok('gemini sends generationConfig', post.body.generationConfig && post.body.generationConfig.temperature === 0.8);

  const jsonText = await gemini.chat([{ role: 'user', content: 'give 6 hooks as JSON' }], { json: true });
  const postJson = geminiHits.filter((h) => h.method === 'POST').pop();
  ok('gemini JSON mode sets responseMimeType=application/json',
    postJson.body.generationConfig.responseMimeType === 'application/json'
      && Array.isArray(JSON.parse(jsonText).hooks) && JSON.parse(jsonText).hooks.length === 6);

  const testOk = await gemini.test();
  ok('gemini test() succeeds via GET models listing', testOk.ok === true && /Gemini/.test(testOk.message)
    && geminiHits.some((h) => h.method === 'GET' && /\/models/.test(h.url)));

  const badGemini = llmMod.createLlmProvider(settingsWith('gemini', {
    apiKey: 'wrong-key', baseUrl: `${geminiMock.url}/v1beta`,
  }));
  await assert.rejects(() => badGemini.test(), (err) => err.message === 'Gemini connection failed — please check your Gemini API key.');
  ok('bad gemini key on test() yields the exact required error string', true);
  await assert.rejects(() => badGemini.chat([{ role: 'user', content: 'hi' }]), /Gemini connection failed — please check your Gemini API key\./);
  ok('bad gemini key on chat() yields the exact required error string', true);
  const badHit = geminiHits.filter((h) => h.googKey === 'wrong-key').pop();
  ok('failed gemini request carried only the gemini slot key', badHit.auth === null);

  const blocker = llmMod.createLlmProvider(settingsWith('gemini', {
    apiKey: GEM_KEY, baseUrl: `${geminiMock.url}/v1beta`, model: 'gemini-blocked',
  }));
  await assert.rejects(() => blocker.chat([{ role: 'user', content: 'hi' }]), /safety/i);
  ok('gemini safety block is reported distinctly', true);

  const empty = llmMod.createLlmProvider(settingsWith('gemini', {
    apiKey: GEM_KEY, baseUrl: `${geminiMock.url}/v1beta`, model: 'gemini-empty',
  }));
  await assert.rejects(() => empty.chat([{ role: 'user', content: 'hi' }]), /empty response/i);
  ok('gemini empty candidate set is an error, not a fake success', true);

  const noKey = llmMod.createLlmProvider(settingsWith('gemini'));
  await assert.rejects(() => noKey.test(), /Missing Gemini API key/);
  ok('gemini without a saved key is a configuration error', true);

  /* ---- OpenAI-compatible adapters and key isolation ---- */
  const oa = llmMod.createLlmProvider(settingsWith('openai', {
    apiKey: OA_KEY, baseUrl: `${openaiMock.url}/v1`, model: 'gpt-4o-mini',
  }));
  ok('factory builds the OpenAI adapter for the openai id', oa.constructor.name === 'OpenAiChatProvider');
  const oaText = await oa.chat([{ role: 'user', content: 'hi' }], { json: true });
  const oaPost = openaiHits.find((h) => h.method === 'POST');
  ok('openai calls /chat/completions with Bearer auth',
    /\/v1\/chat\/completions$/.test(oaPost.url) && oaPost.auth === `Bearer ${OA_KEY}` && /hooks/.test(oaText));
  ok('openai request never carries the x-goog-api-key header', oaPost.googKey === null);
  ok('openai JSON mode uses response_format json_object', oaPost.body.response_format?.type === 'json_object');
  const oaTest = await oa.test();
  ok('openai test() probes GET /models', oaTest.ok === true
    && openaiHits.some((h) => h.method === 'GET' && /\/v1\/models/.test(h.url)));

  // Even if a user mistakenly pasted the Gemini key into the OpenAI slot, it is
  // never sent as a Google header and the error names OpenAI (not a raw vendor string).
  const confused = llmMod.createLlmProvider(settingsWith('openai', {
    apiKey: GEM_KEY, baseUrl: `${openaiMock.url}/v1`,
  }));
  await assert.rejects(() => confused.test(), (err) => err.message === 'OpenAI connection failed — please check your OpenAI API key.');
  ok('wrong key against the OpenAI host yields the exact OpenAI error', true);
  ok('no request to the OpenAI-shaped host ever used the google header',
    openaiHits.every((h) => h.googKey === null));

  const groq = llmMod.createLlmProvider(settingsWith('groq', {
    apiKey: 'bad-groq', baseUrl: `${openaiMock.url}/v1`, model: 'm',
  }));
  await assert.rejects(() => groq.test(), /Groq connection failed — please check your Groq API key\./);
  ok('groq adapter reports its own provider name on auth failure', true);

  // Cross-provider isolation: the captured Gemini traffic never held the OpenAI key and vice versa.
  ok('gemini host never received the OpenAI key', geminiHits.every((h) => h.auth === null && h.googKey !== OA_KEY));
  ok('openai host never received the Gemini key as a google header', openaiHits.every((h) => h.googKey === null));

  /* ---- backend parity: geminiChat + ping ---- */
  const bEnv = { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: GEM_KEY, GEMINI_BASE_URL: `${geminiMock.url}/v1beta`, LLM_MODEL: 'gemini-2.5-flash' };
  const bText = await upstream.geminiChat(bEnv, [{ role: 'system', content: 's' }, { role: 'user', content: 'hi' }], { json: true });
  ok('backend geminiChat works through the native endpoint', Array.isArray(JSON.parse(bText).hooks));
  await assert.rejects(() => upstream.ping({ ...bEnv, GEMINI_API_KEY: 'nope' }, 'llm'), /Gemini rejected the API key/);
  ok('backend ping reports gemini key rejection distinctly', true);
  const pingOk = await upstream.ping(bEnv, 'llm');
  ok('backend ping succeeds with a valid gemini key', /Gemini key accepted/.test(pingOk));

  geminiMock.server.close();
  openaiMock.server.close();
}

/* ========================================================= */
/* 4. Manifest validity + referenced assets                  */
/* ========================================================= */
{
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  ok('manifest_version is 3', manifest.manifest_version === 3);
  ok('name correct', manifest.name === 'ReelForge AI UGC Video Generator');
  ok('version is 1.0.0', manifest.version === '1.0.0');
  ok('only the storage permission', JSON.stringify(manifest.permissions?.sort()) === JSON.stringify(['storage']));
  ok('no broad host_permissions in the shipped manifest', !manifest.host_permissions);
  ok('hosts requested optionally instead', Array.isArray(manifest.optional_host_permissions));
  ok('CSP locks script-src to self', manifest.content_security_policy?.extension_pages?.includes("script-src 'self'"));
  const refs = [
    manifest.action.default_popup, manifest.options_page, manifest.background.service_worker,
    ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
  ];
  for (const ref of refs) ok(`manifest asset exists: ${ref}`, existsSync(join(EXT, ref)));
  ok('service worker is an ES module', manifest.background.type === 'module');

  for (const page of ['popup/popup.html', 'settings/settings.html']) {
    const html = readFileSync(join(EXT, page), 'utf8');
    ok(`${page} references no remote scripts/styles`, !/<script[^>]+src=["']https?:/i.test(html) && !/<link[^>]+href=["']https?:/i.test(html));
    ok(`${page} loads modules only from the extension`, /type="module"/.test(html));
  }
}

/* ========================================================= */
/* 5. Source security audit                                   */
/* ========================================================= */
{
  const banned = [
    [/\beval\s*\(/, 'eval()'],
    [/\bnew\s+Function\b/, 'new Function()'],
    [/document\.write\s*\(/, 'document.write()'],
    [/\.innerHTML\s*=|\.outerHTML\s*=/, 'innerHTML/outerHTML assignment'],
    [/document\.cookie/, 'document.cookie access'],
    [/chrome\.cookies/, 'chrome.cookies API'],
    [/chrome\.tabs|chrome\.webRequest|chrome\.history|chrome\.passwords/, 'sensitive chrome API'],
    [/String\.raw`[^`]*[A-Za-z0-9+/]{400,}=*`/, 'large encoded blob literal'],
  ];
  const allowedDirs = new Set(['popup', 'settings', 'background', 'scripts', 'assets']);
  const allowedExt = new Set(['.js', '.mjs', '.html', '.css', '.json', '.png', '.svg', '.md']);
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (['node_modules', '.git'].includes(entry)) throw new Error(`forbidden dir shipped: ${full}`);
        walk(full);
      } else {
        files.push(full);
        const rel = relative(EXT, full);
        const top = rel.split('/')[0];
        ok(`file inside an allowed directory: ${rel}`, allowedDirs.has(top) || ['manifest.json', 'README.md'].includes(rel));
        ok(`file has an allowed extension: ${rel}`, allowedExt.has(extname(full)) || rel === 'manifest.json');
        if (/\.(js|mjs|html|css|json)$/.test(full)) {
          const text = readFileSync(full, 'utf8');
          for (const [pattern, label] of banned) {
            ok(`no ${label} in ${rel}`, !pattern.test(text));
          }
          // Spot-check obviously suspicious base64 executable payloads.
          const longB64 = /["'`](?:[A-Za-z0-9+/]{120,}={0,2})["'`]/g;
          const hits = text.match(longB64) || [];
          ok(`no unexplained long base64 blobs in ${rel}`, hits.length === 0, hits[0]?.slice(0, 60));
        }
        // No executable bits on any shipped file.
        const mode = st.mode & 0o111;
        ok(`file is not executable: ${rel}`, mode === 0);
      }
    }
  })(EXT);

  // fetch() must only exist in the single network chokepoint (+ the SW import line).
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    const rel = relative(EXT, f);
    const text = readFileSync(f, 'utf8');
    if (rel === 'scripts/net-relay.js') continue;
    ok(`fetch() only in net-relay (checked ${rel})`, !/(?<![.\w])fetch\s*\(/.test(text));
  }
  ok('audited file count is reasonable', files.length >= 18, `count=${files.length}`);
}

console.log(`\nUNIT/INTEGRATION OK — ${passed} assertions`);
