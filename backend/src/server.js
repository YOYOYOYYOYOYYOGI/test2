/**
 * ReelForge — secure backend proxy.
 *
 * PURPOSE
 *   Chrome extensions are plain JavaScript: any key pasted into the frontend
 *   is readable by anyone with access to the machine or the code. Production
 *   AI products therefore keep secret keys server-side. This tiny Express
 *   server does exactly that:
 *
 *     extension ──▶ /api/proxy/<provider>/… ──▶ provider API
 *                        │  injects the key from THIS server's env vars
 *
 *   The extension never sees a key in backend mode.
 *
 * ENDPOINTS
 *   GET  /api/health                 → { ok, keys: {openai: true, …} } (booleans only)
 *   ANY  /api/proxy/:provider/*      → authenticated passthrough to the provider
 *
 * SECURITY
 *   - Optional EXTENSION_TOKEN shared secret (header x-ugc-token)
 *   - Strict CORS: chrome-extension origins + localhost (+ EXTRA_ORIGIN)
 *   - Keys are read from environment variables only (see .env.example)
 *   - Requests are streamed end-to-end; nothing is logged or stored
 */

import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const EXTENSION_TOKEN = process.env.EXTENSION_TOKEN || '';

/* ------------------------- provider registry ------------------------------ */

const PROVIDERS = {
  openai: {
    base: 'https://api.openai.com/v1',
    key: () => process.env.OPENAI_API_KEY,
    auth: (key, headers) => { headers.Authorization = `Bearer ${key}`; },
  },
  'openai-compat': {
    base: () => (process.env.OPENAI_COMPAT_BASE_URL || '').replace(/\/+$/, ''),
    key: () => process.env.OPENAI_COMPAT_API_KEY,
    auth: (key, headers) => { headers.Authorization = `Bearer ${key}`; },
  },
  anthropic: {
    base: 'https://api.anthropic.com/v1',
    key: () => process.env.ANTHROPIC_API_KEY,
    auth: (key, headers) => {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
    },
  },
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta',
    key: () => process.env.GEMINI_API_KEY,
    auth: (key, headers, url) => {
      const u = new URL(url);
      u.searchParams.set('key', key);
      return u.toString();
    },
  },
  stability: {
    base: 'https://api.stability.ai',
    key: () => process.env.STABILITY_API_KEY,
    auth: (key, headers) => { headers.Authorization = `Bearer ${key}`; },
  },
  replicate: {
    base: 'https://api.replicate.com/v1',
    key: () => process.env.REPLICATE_API_TOKEN,
    auth: (key, headers) => { headers.Authorization = `Bearer ${key}`; },
  },
  fal: {
    base: 'https://fal.run',
    key: () => process.env.FAL_KEY,
    auth: (key, headers) => { headers.Authorization = `Key ${key}`; },
  },
  elevenlabs: {
    base: 'https://api.elevenlabs.io',
    key: () => process.env.ELEVENLABS_API_KEY,
    auth: (key, headers) => { headers['xi-api-key'] = key; },
  },
};

function keyStatus() {
  const out = {};
  for (const [name, p] of Object.entries(PROVIDERS)) {
    const k = p.key();
    out[name] = !!(k && (typeof p.base === 'function' ? p.base() : p.base));
  }
  return out;
}

/* --------------------------------- app ------------------------------------ */

const app = express();
app.disable('x-powered-by');

/* CORS: allow Chrome extension origins + localhost (+ optional extra origin). */
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    (process.env.EXTRA_ORIGIN && origin === process.env.EXTRA_ORIGIN);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-ugc-token, Authorization,anthropic-version');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

/* Auth: optional shared token (checked before any proxying). */
function checkToken(req) {
  if (!EXTENSION_TOKEN) return true;
  return (req.headers['x-ugc-token'] || '') === EXTENSION_TOKEN;
}

/* Health check — reports which provider keys are present (booleans only). */
app.get('/api/health', (req, res) => {
  if (!checkToken(req)) { res.status(401).json({ ok: false, error: 'Invalid or missing x-ugc-token' }); return; }
  res.json({
    ok: true,
    service: 'reelforge-backend',
    version: '1.0.0',
    keys: keyStatus(),
    tokenRequired: !!EXTENSION_TOKEN,
  });
});

/*
 * Provider passthrough — mounted BEFORE express.json so request bodies stream
 * (needed for multipart image uploads and large JSON with data URLs).
 */
app.use('/api/proxy/:provider', async (req, res) => {
  const providerName = req.params.provider;
  const provider = PROVIDERS[providerName];

  if (!checkToken(req)) { res.status(401).json({ ok: false, error: 'Invalid or missing x-ugc-token' }); return; }
  if (!provider) { res.status(404).json({ ok: false, error: `Unknown provider "${providerName}"` }); return; }

  const key = provider.key();
  const base = typeof provider.base === 'function' ? provider.base() : provider.base;
  if (!key || !base) {
    res.status(400).json({
      ok: false,
      error: `No API key configured on this backend for "${providerName}". Set it in backend/.env and restart.`,
      keys: keyStatus(),
    });
    return;
  }

  // /api/proxy/openai/chat/completions?x=1  →  https://api.openai.com/v1/chat/completions?x=1
  const suffix = req.url.replace(/^\/+/, '');
  let target = `${base}/${suffix}`;

  try {
    const headers = {};
    for (const h of ['content-type', 'accept', 'accept-encoding', 'anthropic-version', 'user-agent']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    const rewritten = provider.auth(key, headers, target);
    if (typeof rewritten === 'string' && rewritten) target = rewritten; // gemini injects key via URL
    delete headers['content-length'];
    if (!headers['user-agent']) headers['user-agent'] = 'ReelForge-Backend/1.0';

    const method = req.method;
    const body = ['GET', 'HEAD'].includes(method) ? undefined : req;

    const upstream = await fetch(target, {
      method,
      headers,
      body,
      duplex: 'half',
    });

    res.status(upstream.status);
    upstream.headers.forEach((v, h) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(h)) {
        res.setHeader(h, v);
      }
    });
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          if (!res.write(Buffer.from(value))) {
            await new Promise((r) => res.once('drain', r));
          }
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err) {
    console.error(`[proxy:${providerName}]`, err?.message || err);
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: `Upstream request failed: ${err?.message || 'unknown error'}` });
    } else {
      res.end();
    }
  }
});

/* Simple HTML landing page so opening the root isn't a 404. */
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>ReelForge backend</title></head>
  <body style="font-family:system-ui;background:#0a0a10;color:#ececf4;display:grid;place-items:center;height:100vh;margin:0">
    <div style="text-align:center">
      <h1>🎬 ReelForge backend is running</h1>
      <p style="color:#9c9cb3">Configure your provider keys in <code>backend/.env</code>, then point the extension at
      <code>http://localhost:${PORT}</code> (Settings → Connection).</p>
      <p style="color:#6a6a85">Providers with keys: ${Object.entries(keyStatus()).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none yet'}</p>
    </div>
  </body></html>`);
});

app.listen(PORT, () => {
  const withKeys = Object.entries(keyStatus()).filter(([, v]) => v).map(([k]) => k);
  console.log(`\n🎬 ReelForge backend listening on http://localhost:${PORT}`);
  console.log(`   Provider keys loaded: ${withKeys.length ? withKeys.join(', ') : 'NONE — add keys to backend/.env'}`);
  console.log(`   Token protection: ${EXTENSION_TOKEN ? 'ENABLED' : 'disabled (set EXTENSION_TOKEN for production)'}`);
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.log('   ⚠ No .env found — copy .env.example to .env and add your keys.\n');
  }
});
