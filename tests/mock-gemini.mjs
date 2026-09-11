/*
 * Mock Google Gemini (native generativelanguage REST API) for E2E tests.
 * Plain HTTP on 127.0.0.1 (the extension's relay allows localhost HTTP); the
 * extension is pointed at it via the per-provider base URL setting.
 * NOT shipped in the package.
 *
 *   GET  /v1beta/models?pageSize=1                 -> { models: [...] }
 *   POST /v1beta/models/{model}:generateContent   -> { candidates: [...] }
 *
 * It faithfully enforces the native contract the extension relies on:
 *  - auth is the `x-goog-api-key` header ONLY
 *  - a Bearer/Authorization header is a protocol violation and is rejected
 *  - a bad key answers exactly like Google: HTTP 400 API_KEY_INVALID
 * Every request is recorded so the suite can prove per-provider isolation.
 */
import http from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_GEMINI_PORT || 8812);
const VALID_KEY = process.env.MOCK_GEMINI_KEY || 'test-gemini-key';

export const hits = []; // { method, path, model, googKey, hadBearer, jsonMode, roles, at }

function llmScript() {
  return [
    'HOOK',
    'I wish I found GlowDrop months ago, honestly.',
    '',
    'PROBLEM',
    'My skin was so dry by noon that makeup just sat on top of it.',
    '',
    'SOLUTION',
    'Then I started using this hydrating serum and everything changed overnight.',
    '',
    'PRODUCT',
    'This is GlowDrop, three drops, super lightweight, no sticky feeling at all.',
    '',
    'BENEFIT',
    'By the second week my skin felt plump all day, and people actually asked what I changed.',
    '',
    'CTA',
    'Tap the link and grab yours before the 20 percent off offer ends.',
  ].join('\n');
}

function briefJson() {
  return {
    name: 'GlowDrop Hydrating Serum',
    description: 'A lightweight hydrating serum with hyaluronic acid that absorbs fast.',
    benefits: ['All-day hydration without stickiness', 'Plumper skin in about two weeks', 'Works under makeup'],
    audience: 'women 25-40 with dry or dull skin',
    problem: 'Dry skin that gets tight by midday, with makeup settling into patches',
    solution: 'Three drops morning and night lock in layered hydration',
    offer: '20 percent off the first order',
    cta: 'Tap the link to claim 20 percent off your first bottle.',
  };
}

function hooksJson() {
  return {
    hooks: [
      'I wish I knew about this sooner...',
      'Okay, I finally found something that actually works.',
      'If your skin feels dry all day, watch this.',
      'Nobody told me this serum existed.',
      'Why am I only finding GlowDrop now?',
      'This is your sign to fix your skincare routine.',
    ],
  };
}

function candidate(text) {
  return {
    candidates: [{
      finishReason: 'STOP',
      index: 0,
      content: { role: 'model', parts: [{ text }] },
    }],
    promptFeedback: {},
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'x-goog-api-key, authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(body));
  };
  // Test-only introspection endpoint.
  if (req.method === 'GET' && url.pathname === '/__hits') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(hits));
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'x-goog-api-key, authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  // Native Gemini never uses Bearer auth; reject it so a regression that mixes
  // providers fails loudly instead of silently sending a key to the wrong host.
  if (req.headers.authorization) {
    hits.push({ method: req.method, path: url.pathname, hadBearer: true, at: Date.now() });
    return send(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Gemini does not accept Authorization headers.' } });
  }
  const googKey = req.headers['x-goog-api-key'];
  if (googKey !== VALID_KEY) {
    return send(400, {
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'API_KEY_INVALID',
      },
    });
  }

  if (req.method === 'GET' && url.pathname.endsWith('/models')) {
    hits.push({ method: 'GET', path: url.pathname, googKey: true, at: Date.now() });
    return send(200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
  }

  const generateMatch = /^\/v1beta\/models\/([\w.-]+):generateContent$/.exec(url.pathname);
  if (req.method === 'POST' && generateMatch) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    return req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* keep empty */ }
      const convo = JSON.stringify(body.contents || []);
      const jsonMode = body.generationConfig?.responseMimeType === 'application/json';
      hits.push({
        method: 'POST',
        path: url.pathname,
        model: generateMatch[1],
        googKey: true,
        hadBearer: false,
        jsonMode,
        hasSystemInstruction: !!body.systemInstruction,
        roles: (body.contents || []).map((c) => c.role),
        at: Date.now(),
      });
      let text;
      if (convo.includes('hooks') || convo.includes('UGC video hooks')) {
        text = JSON.stringify(hooksJson());
      } else if (convo.includes('marketing brief') || convo.includes('Fill in a UGC')) {
        text = JSON.stringify(briefJson());
      } else {
        text = llmScript();
      }
      send(200, candidate(text));
    });
  }

  send(404, { error: { code: 404, message: `unmapped ${req.method} ${url.pathname}`, status: 'NOT_FOUND' } });
});

export function startMockGemini(port = PORT) {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockGemini().then(() => console.log(`mock gemini listening on http://127.0.0.1:${PORT}/v1beta`));
}
