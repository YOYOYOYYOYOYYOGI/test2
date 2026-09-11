/*
 * ReelForge secure backend - single-file, zero-dependency Node 18+ server.
 *
 * It is a thin, auditable proxy that holds secret provider keys on the server:
 *   POST /api/chat                 { messages, json, maxTokens }
 *   POST /api/image                { prompt, referenceDataUrl }
 *   POST /api/video                { prompt, imageDataUrl, duration }
 *   GET  /api/video/:id            (job status)
 *   GET  /api/video/:id/content    (finished MP4, proxied server-side)
 *   POST /api/test                 { kind: 'llm'|'image'|'video' }
 *   GET  /health
 *
 * Authentication: the extension sends X-ReelForge-Key matching $PROXY_KEY.
 * The server never logs request bodies, keys or generated content.
 */

import http from 'node:http';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
  falChat, falImage, falVideoInput, falSubmit, falAwait, falStatus, falResult, extractFalVideoUrl,
  openAiChat, openAiImage, openAiSubmitVideo, openAiVideoStatus, openAiHeaders, openAiBase,
  downloadAsDataUrl, ping,
} from './lib/upstream.mjs';

/* ---------- environment (.env is optional) ---------- */
function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const env = process.env;
const PORT = Number(env.PORT || 8787);
const PROXY_KEY = env.PROXY_KEY || '';
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const JOB_TTL_MS = 90 * 60 * 1000;

if (!PROXY_KEY || PROXY_KEY === 'change-me-to-a-long-random-secret') {
  console.warn('[reelforge] WARNING: PROXY_KEY is not set or is the example value. Set a long random secret before deploying.');
}

/* ---------- in-memory video jobs ---------- */
const jobs = new Map();

function newJob(kind, init) {
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const job = {
    id, kind, status: 'queued', progress: 0, log: 'queued', videoUrl: null,
    upstreamUrl: null, contentType: 'video/mp4', error: null, createdAt: Date.now(), ...init,
  };
  jobs.set(id, job);
  return job;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}, 10 * 60 * 1000).unref();

function startFalVideo(job, { prompt, imageDataUrl, duration }) {
  (async () => {
    job.status = 'processing';
    job.log = 'submitted to fal.ai';
    const { endpoint, input } = falVideoInput(env, prompt, imageDataUrl, duration);
    job.endpoint = endpoint;
    job.requestId = await falSubmit(env, endpoint, input);
    job.log = 'video model running';
    const start = Date.now();
    while (Date.now() - start < 12 * 60 * 1000) {
      const status = await falStatus(env, endpoint, job.requestId);
      if (status.status === 'IN_QUEUE') { job.status = 'queued'; job.progress = 5; }
      if (status.status === 'IN_PROGRESS') {
        job.status = 'processing';
        job.progress = 55;
        if (Array.isArray(status.logs) && status.logs.length) job.log = status.logs[status.logs.length - 1].message;
      }
      if (status.status === 'COMPLETED') {
        const result = await falResult(env, endpoint, job.requestId);
        const url = extractFalVideoUrl(result);
        if (!url) throw new Error('fal.ai returned no video URL.');
        job.upstreamUrl = url;
        job.contentType = result?.video?.content_type || 'video/mp4';
        job.videoUrl = `/api/video/${job.id}/content`;
        job.status = 'completed';
        job.progress = 100;
        job.log = 'completed';
        return;
      }
      if (status.status === 'FAILED' || status.status === 'ERROR') {
        throw new Error(status.error || status.detail || 'fal.ai video job failed.');
      }
      await new Promise((r) => setTimeout(r, Number(env.POLL_INTERVAL_MS || 4000)));
    }
    throw new Error('Video generation timed out.');
  })().catch((err) => {
    job.status = 'failed';
    job.error = err.message;
    job.log = 'failed';
    console.error('[reelforge] fal video job failed:', err.message);
  });
}

function startOpenAiVideo(job, { prompt, duration }) {
  (async () => {
    job.status = 'processing';
    job.log = 'submitted to the video API';
    const externalId = await openAiSubmitVideo(env, prompt, duration);
    job.externalId = externalId;
    const start = Date.now();
    while (Date.now() - start < 12 * 60 * 1000) {
      const data = await openAiVideoStatus(env, externalId);
      const state = String(data.status || '').toLowerCase();
      if (state === 'completed' || state === 'succeeded') {
        job.upstreamUrl = `${openAiBase(env)}/videos/${externalId}/content`;
        job.upstreamAuth = true;
        job.videoUrl = `/api/video/${job.id}/content`;
        job.status = 'completed';
        job.progress = 100;
        job.log = 'completed';
        return;
      }
      if (['failed', 'canceled', 'cancelled', 'expired'].includes(state)) {
        throw new Error(data.error?.message || 'Video generation failed upstream.');
      }
      job.status = state === 'queued' ? 'queued' : 'processing';
      if (typeof data.progress === 'number') job.progress = data.progress;
      job.log = state;
      await new Promise((r) => setTimeout(r, Number(env.POLL_INTERVAL_MS || 6000)));
    }
    throw new Error('Video generation timed out.');
  })().catch((err) => {
    job.status = 'failed';
    job.error = err.message;
    job.log = 'failed';
    console.error('[reelforge] openai video job failed:', err.message);
  });
}

/* ---------- HTTP plumbing ---------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-reelforge-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large (32 MB limit).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function checkKey(req) {
  if (!PROXY_KEY) return true; // local dev without a key
  const presented = req.headers['x-reelforge-key'] || '';
  const a = Buffer.from(String(presented));
  const b = Buffer.from(PROXY_KEY);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-reelforge-key',
      'Access-Control-Allow-Methods': GET_POST_OPTIONS,
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'reelforge-backend', time: new Date().toISOString() });
  }

  if (!url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
  if (!checkKey(req)) return sendJson(res, 401, { error: 'Invalid or missing proxy key.' });

  try {
    /* ---------- chat ---------- */
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const text = (env.LLM_PROVIDER === 'fal')
        ? await falChat(env, messages, { json: !!body.json, maxTokens: body.maxTokens, model: body.model })
        : await openAiChat(env, messages, { json: !!body.json, maxTokens: body.maxTokens });
      return sendJson(res, 200, { text });
    }

    /* ---------- image (waits, returns bytes as a data URL) ---------- */
    if (req.method === 'POST' && url.pathname === '/api/image') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.prompt || typeof body.prompt !== 'string') return sendJson(res, 400, { error: 'prompt is required.' });
      let imageRef;
      if ((env.IMAGE_PROVIDER || 'fal') === 'fal') {
        imageRef = await falImage(env, body.prompt, body.referenceDataUrl || null);
      } else {
        imageRef = await openAiImage(env, body.prompt);
      }
      const result = imageRef.startsWith('data:')
        ? { dataUrl: imageRef, url: null }
        : await downloadAsDataUrl(imageRef).then((r) => ({ dataUrl: r.dataUrl, url: imageRef }));
      return sendJson(res, 200, { ...result, model: env.IMAGE_PROVIDER || 'fal' });
    }

    /* ---------- video: submit ---------- */
    if (req.method === 'POST' && url.pathname === '/api/video') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.prompt || typeof body.prompt !== 'string') return sendJson(res, 400, { error: 'prompt is required.' });
      const duration = Math.min(60, Math.max(3, Number(body.duration) || 8));
      const provider = env.VIDEO_PROVIDER || 'fal';
      const job = newJob('video', { provider });
      if (provider === 'fal') {
        startFalVideo(job, { prompt: body.prompt, imageDataUrl: body.imageDataUrl || null, duration });
      } else {
        startOpenAiVideo(job, { prompt: body.prompt, duration });
      }
      return sendJson(res, 200, { jobId: job.id, status: job.status, model: provider });
    }

    /* ---------- video: status ---------- */
    const statusMatch = /^\/api\/video\/([\w-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && statusMatch) {
      const job = jobs.get(statusMatch[1]);
      if (!job) return sendJson(res, 404, { error: 'Unknown job id. Jobs live 90 minutes.' });
      return sendJson(res, 200, {
        status: job.status, progress: job.progress, log: job.log,
        videoUrl: job.videoUrl ? `${url.origin}${job.videoUrl}` : null,
        error: job.error,
      });
    }

    /* ---------- video: content (server-side streaming keeps keys private) ---------- */
    const contentMatch = /^\/api\/video\/([\w-]+)\/content$/.exec(url.pathname);
    if (req.method === 'GET' && contentMatch) {
      const job = jobs.get(contentMatch[1]);
      if (!job) return sendJson(res, 404, { error: 'Unknown job id.' });
      if (job.status !== 'completed' || !job.upstreamUrl) {
        return sendJson(res, 409, { error: `Job is ${job.status}.` });
      }
      const headers = job.upstreamAuth ? openAiHeaders(env, { json: false }) : {};
      const upstream = await fetch(job.upstreamUrl, { headers, redirect: 'follow' });
      if (!upstream.ok) return sendJson(res, 502, { error: `Upstream returned HTTP ${upstream.status}.` });
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || job.contentType || 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'private, max-age=3600',
      });
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    /* ---------- connection test ---------- */
    if (req.method === 'POST' && url.pathname === '/api/test') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const kind = ['llm', 'image', 'video'].includes(body.kind) ? body.kind : 'video';
      try {
        const message = await ping(env, kind);
        return sendJson(res, 200, { ok: true, message });
      } catch (err) {
        return sendJson(res, 502, { ok: false, message: err.message });
      }
    }

    return sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    return sendJson(res, status, { error: err.message || 'Internal error.' });
  }
});

const GET_POST_OPTIONS = 'GET, POST, OPTIONS';

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[reelforge] secure backend listening on http://0.0.0.0:${PORT}`);
  console.log(`[reelforge] LLM=${env.LLM_PROVIDER || 'openai'} IMAGE=${env.IMAGE_PROVIDER || 'fal'} VIDEO=${env.VIDEO_PROVIDER || 'fal'}`);
});
