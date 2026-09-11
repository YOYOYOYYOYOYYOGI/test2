/*
 * Mock fal.ai queue API for end-to-end tests (NOT shipped).
 * TLS + /etc/hosts map https://queue.fal.run -> this local server.
 * Faithfully implements the shapes documented at
 * https://fal.ai/docs/documentation/model-apis/inference/queue
 *
 *   POST /:endpoint                      -> { request_id, status_url, response_url, cancel_url }
 *   GET  /:endpoint/requests/:id/status  -> IN_QUEUE | IN_PROGRESS | COMPLETED
 *   GET  /:endpoint/requests/:id         -> result payload
 *   POST /:endpoint/requests/:id/cancel
 *   GET  /media/creator.png, /media/sample.webm
 *
 * Every submit is recorded so tests can assert payload contents.
 */
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_FAL_PORT || 443);
const VALID_KEY = process.env.MOCK_FAL_KEY || 'test-fal-key';

const creatorPng = readFileSync(join(HERE, 'fixtures', 'creator.png'));
const productReencoded = readFileSync(join(HERE, 'fixtures', 'product.png'));
const webm = readFileSync(join(HERE, 'fixtures', 'sample.webm'));

export const submissions = []; // { endpoint, input, at }
export const mediaHits = [];
export const authFailures = [];

const jobs = new Map();

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

function resultFor(endpoint, input) {
  if (endpoint === 'fal-ai/any-llm') {
    const convoText = JSON.stringify(input?.messages || []);
    if (convoText.includes('hooks') || convoText.includes('6 short UGC')) {
      return {
        choices: [{ message: { content: JSON.stringify({ hooks: [
          'I wish I knew about this sooner...',
          'Okay, I finally found something that actually works.',
          'If your skin feels dry all day, watch this.',
          'Nobody told me this serum existed.',
          'Why am I only finding GlowDrop now?',
          'This is your sign to fix your skincare routine.',
        ] }) } }],
      };
    }
    if (convoText.includes('marketing brief') || convoText.includes('benefits')) {
      return {
        choices: [{ message: { content: JSON.stringify({
          name: 'GlowDrop Hydrating Serum',
          description: 'A lightweight hydrating serum with hyaluronic acid that absorbs fast.',
          benefits: ['All-day hydration without stickiness', 'Plumper skin in about two weeks', 'Works under makeup'],
          audience: 'women 25-40 with dry or dull skin',
          problem: 'Dry skin that gets tight by midday, with makeup settling into patches',
          solution: 'Three drops morning and night lock in layered hydration',
          offer: '20 percent off the first order',
          cta: 'Tap the link to claim 20 percent off your first bottle.',
        }) } }],
      };
    }
    return { choices: [{ message: { content: llmScript() } }] };
  }
  if (/video|kling|minimax|wan|veo/i.test(endpoint)) {
    return { video: { url: `https://queue.fal.run/media/sample.webm?job=${randomUUID()}`, content_type: 'video/webm' } };
  }
  if (/image|flux|seedream|schnell|kontext/i.test(endpoint)) {
    return { images: [{ url: `https://queue.fal.run/media/creator.png?job=${randomUUID()}`, content_type: 'image/png' }] };
  }
  return { url: `https://queue.fal.run/media/creator.png` };
}

const server = https.createServer({
  key: readFileSync(join(HERE, 'tls', 'key.pem')),
  cert: readFileSync(join(HERE, 'tls', 'cert.pem')),
}, (req, res) => {
  const url = new URL(req.url, 'https://queue.fal.run');
  const send = (status, body, type = 'application/json') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  // Media result URLs are public CDN-style links (like real fal output URLs).
  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    mediaHits.push({ path: url.pathname });
    if (url.pathname.endsWith('.png')) return send(200, creatorPng, 'image/png');
    if (url.pathname.endsWith('.webm')) return send(200, webm, 'video/webm');
    return send(404, { detail: 'no media' });
  }

  // Queue API requires the key.
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Key ')) {
    authFailures.push({ path: url.pathname });
    return send(401, { detail: 'Authorization key is missing.' });
  }
  if (auth.slice(4) !== VALID_KEY) return send(403, { detail: 'Invalid API key.' });

  // auth-probe used by connection tests -> 404 (valid key, fake request id)
  if (url.pathname.includes('/requests/auth-probe/')) return send(404, { detail: 'not found' });

  // Submit
  const submitMatch = /^\/([\w./-]+?)(?:\/requests)?$/.exec(url.pathname);
  if (req.method === 'POST' && !url.pathname.includes('/requests/')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let input = {};
      try { input = raw ? JSON.parse(raw) : {}; } catch { /* keep empty */ }
      const id = randomUUID();
      const endpoint = url.pathname.replace(/^\//, '');
      const job = { endpoint, input, at: Date.now() };
      jobs.set(id, job);
      submissions.push({ endpoint, input, at: Date.now(), id });
      send(200, {
        request_id: id,
        status_url: `https://queue.fal.run/${endpoint}/requests/${id}/status?logs=1`,
        response_url: `https://queue.fal.run/${endpoint}/requests/${id}`,
        cancel_url: `https://queue.fal.run/${endpoint}/requests/${id}/cancel`,
        queue_position: 0,
      });
    });
    return;
  }

  const statusMatch = /^\/([\w./-]+)\/requests\/([\w-]+)\/status/.exec(url.pathname);
  if (req.method === 'GET' && statusMatch) {
    const job = jobs.get(statusMatch[2]);
    if (!job) return send(404, { detail: 'unknown request' });
    const elapsed = Date.now() - job.at;
    if (elapsed < 800) return send(200, { status: 'IN_QUEUE', queue_position: 0 });
    if (elapsed < 1800) return send(200, { status: 'IN_PROGRESS', logs: [{ message: 'model running' }] });
    return send(200, { status: 'COMPLETED' });
  }

  const cancelMatch = /^\/([\w./-]+)\/requests\/([\w-]+)\/cancel/.exec(url.pathname);
  if (req.method === 'POST' && cancelMatch) return send(200, { status: 'CANCELED' });

  const resultMatch = /^\/([\w./-]+)\/requests\/([\w-]+)$/.exec(url.pathname);
  if (req.method === 'GET' && resultMatch) {
    const job = jobs.get(resultMatch[2]);
    if (!job) return send(404, { detail: 'unknown request' });
    return send(200, resultFor(job.endpoint, job.input));
  }

  send(404, { detail: `unmapped ${req.method} ${url.pathname}` });
});

export function startMockFal() {
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// Allow direct execution: node tests/mock-fal.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  startMockFal().then(() => console.log(`mock fal listening on https://queue.fal.run:${PORT}`));
}
