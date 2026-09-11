import { getBackendUrl } from './storage.js';

async function request(path, options = {}) {
  const base = await getBackendUrl();
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { error: raw }; }
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function getHealth() { return request('/health'); }
export async function getProviderStatus() { return request('/providers/status'); }
export async function getCapabilities() { return request('/capabilities'); }
export async function transcodeWebm(blob) {
  const base = await getBackendUrl();
  const response = await fetch(`${base.replace(/\/$/, '')}/render/mp4`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: blob });
  if (!response.ok) { let detail = 'MP4 transcode failed'; try { detail = (await response.json()).error || detail; } catch {} throw new Error(detail); }
  return response.blob();
}
export async function analyzeScript(payload) { return request('/analyze-script', { method: 'POST', body: JSON.stringify(payload) }); }
export async function generateScript(payload) { return request('/generate-script', { method: 'POST', body: JSON.stringify(payload) }); }
export async function generateCreator(payload) { return request('/generate-creator', { method: 'POST', body: JSON.stringify(payload) }); }
export async function generateVoice(payload) { return request('/generate-voice', { method: 'POST', body: JSON.stringify(payload) }); }
export async function createRenderJob(payload) { return request('/render/jobs', { method: 'POST', body: JSON.stringify(payload) }); }
export async function getRenderJob(id) { return request(`/render/jobs/${encodeURIComponent(id)}`); }
export async function saveRemoteProject(payload) { return request('/projects', { method: 'POST', body: JSON.stringify(payload) }); }
