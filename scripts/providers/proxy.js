/*
 * Secure proxy adapters. When "secure backend" mode is selected, ALL provider
 * calls go to the operator's small backend (see /reelforge-backend). Secret API
 * keys live only on that server; the extension sends a shared proxy key.
 *
 * The wire contract is intentionally tiny and provider-agnostic:
 *   POST /api/chat   { messages, json, maxTokens }            -> { text }
 *   POST /api/image  { prompt, referenceDataUrl, model? }     -> { url, dataUrl }
 *   POST /api/video  { prompt, imageDataUrl, duration }       -> { jobId, status }
 *   GET  /api/video/:jobId                                   -> { status, progress, log, videoUrl, error }
 *   POST /api/test   { kind }                                -> { ok, message }
 */

import { httpJson, httpRequest } from '../util.js';
import { ConfigurationError, ProviderError } from '../errors.js';

class ProxyBase {
  constructor(settings) {
    this.base = (settings.proxyUrl || '').replace(/\/+$/, '');
    this.key = settings.proxyKey || '';
    this.defaults = settings.defaults;
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.key) h['X-ReelForge-Key'] = this.key;
    return h;
  }

  requireUrl() {
    if (!this.base) throw new ConfigurationError('No secure backend URL is configured.');
  }
}

export class ProxyChat extends ProxyBase {
  async chat(messages, { json = false, maxTokens = 900 } = {}) {
    this.requireUrl();
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base}/api/chat`,
      headers: this.headers(),
      body: { messages, json, maxTokens, language: this.defaults?.language },
      timeoutMs: 120000,
    });
    if (typeof data?.text !== 'string' || !data.text.trim()) {
      throw new ProviderError('The backend returned an empty text response.');
    }
    return data.text;
  }

  async test() {
    return testBackend(this.base, this.key, 'llm');
  }
}

export class ProxyImage extends ProxyBase {
  async generateCreator({ prompt, referenceDataUrl }) {
    this.requireUrl();
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base}/api/image`,
      headers: this.headers(),
      body: { prompt, referenceDataUrl: referenceDataUrl || null },
      timeoutMs: 240000,
    });
    if (!data?.url && !data?.dataUrl) throw new ProviderError('The backend returned no image.');
    return { url: data.url || null, dataUrl: data.dataUrl || null, model: data.model || 'proxy' };
  }

  async test() {
    return testBackend(this.base, this.key, 'image');
  }
}

export class ProxyVideo extends ProxyBase {
  async submit({ prompt, imageDataUrl, duration }) {
    this.requireUrl();
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base}/api/video`,
      headers: this.headers(),
      body: { prompt, imageDataUrl: imageDataUrl || null, duration },
      timeoutMs: 60000,
    });
    if (!data?.jobId) throw new ProviderError('The backend did not return a job id.');
    return {
      provider: 'proxy',
      model: data.model || 'proxy',
      externalId: data.jobId,
      status: data.status || 'queued',
    };
  }

  async poll(job) {
    const { data } = await httpJson({
      method: 'GET',
      url: `${this.base}/api/video/${encodeURIComponent(job.externalId)}`,
      headers: this.headers(),
      timeoutMs: 30000,
    });
    if (!['queued', 'processing', 'completed', 'failed'].includes(data.status)) {
      throw new ProviderError(`Unexpected job status: ${data.status}`);
    }
    return {
      status: data.status,
      progress: typeof data.progress === 'number' ? data.progress : undefined,
      log: data.log || '',
      videoUrl: data.videoUrl || null,
      error: data.error || null,
    };
  }

  async download(job, videoUrl) {
    const url = videoUrl || job.videoUrl;
    if (url && /^https?:\/\//.test(url) && !url.startsWith(this.base)) {
      // Provider URL may be reachable directly (public CDN).
      const res = await httpRequest({ method: 'GET', url, binary: true, timeoutMs: 300000 });
      if (res.status >= 200 && res.status < 300 && res.bytes) {
        return { blob: new Blob([res.bytes], { type: res.contentType || 'video/mp4' }), url, contentType: res.contentType || 'video/mp4' };
      }
    }
    // Otherwise stream authenticated bytes through the backend.
    const res = await httpRequest({
      method: 'GET',
      url: `${this.base}/api/video/${encodeURIComponent(job.externalId)}/content`,
      headers: this.key ? { 'X-ReelForge-Key': this.key } : {},
      binary: true,
      timeoutMs: 300000,
    });
    if (res.status < 200 || res.status >= 300 || !res.bytes) {
      throw new ProviderError('The backend could not serve the finished video.', { status: res.status });
    }
    return { blob: new Blob([res.bytes], { type: res.contentType || 'video/mp4' }), url, contentType: res.contentType || 'video/mp4' };
  }

  async test() {
    return testBackend(this.base, this.key, 'video');
  }
}

export async function testBackend(base, key, kind) {
  if (!base) throw new ConfigurationError('No secure backend URL is configured.');
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-ReelForge-Key'] = key;
  const { data } = await httpJson({
    method: 'POST',
    url: `${base.replace(/\/+$/, '')}/api/test`,
    headers,
    body: { kind },
    timeoutMs: 30000,
  });
  if (!data?.ok) throw new ProviderError(data?.message || 'The backend reported the connection test failed.');
  return { ok: true, message: data.message || 'Connected to the secure backend.' };
}

export function createProxyProviders(settings) {
  return {
    llm: new ProxyChat(settings),
    image: new ProxyImage(settings),
    video: new ProxyVideo(settings),
  };
}
