/*
 * net-relay.js - The single network chokepoint, shared (unchanged) by:
 *   - background/service-worker.js in the real extension
 *   - the development test harness
 *
 * Rules enforced on every outbound request:
 *   - https:// only, except http://localhost / 127.0.0.1 for local testing
 *   - method allow-list (GET/POST/PUT/DELETE)
 *   - request bodies are plain strings (JSON); nothing is ever evaluated
 *   - responses are returned as text or bytes, NEVER executed
 */

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const MAX_RESPONSE_BYTES = 200 * 1024 * 1024; // guard against pathological downloads

function validateRequestUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid request URL: ${String(rawUrl).slice(0, 120)}`);
  }
  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol === 'http:' && !isLocalHost) {
    throw new Error('Plain HTTP is only permitted for localhost testing.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Disallowed URL protocol: ${url.protocol}`);
  }
  return url;
}

export async function relayFetch(request) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new Error(`HTTP method not allowed: ${method}`);
  validateRequestUrl(request.url);

  if (request.body !== null && request.body !== undefined && typeof request.body !== 'string') {
    throw new Error('Request bodies must be serialized strings.');
  }

  const controller = new AbortController();
  const timeout = Math.min(Math.max(Number(request.timeoutMs) || 60000, 1000), 600000);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request.url, {
      method,
      headers: request.headers || {},
      body: request.body ?? undefined,
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
    });

    const contentType = response.headers.get('content-type') || '';
    if (request.binary) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error('Response exceeded the 200 MB safety limit.');
      }
      return { status: response.status, ok: response.ok, contentType, bytes: buffer };
    }
    const bodyText = await response.text();
    return { status: response.status, ok: response.ok, contentType, bodyText };
  } finally {
    clearTimeout(timer);
  }
}
