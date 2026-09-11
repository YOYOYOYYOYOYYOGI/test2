/*
 * util.js - Small, dependency-free helpers used across the extension:
 * id generation, timing, file validation, image reading/resizing,
 * downloads and the single network chokepoint (relayed through the
 * service worker so credentials never touch page JavaScript).
 */

import { ValidationError, NetworkError, ProviderError } from './errors.js';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from './config.js';

export function uid(prefix = 'id') {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return `${prefix}_${rand}`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function nowIso() {
  return new Date().toISOString();
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function bytesLabel(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function fileNameSafe(name) {
  return (name || 'ugc-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ugc-video';
}

/* ---------- DOM helpers (templates are built with textContent, never innerHTML of user text) ---------- */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) node.dataset[dk] = dv;
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function showStatus(container, kind, message, details = '') {
  if (!container) return;
  container.className = `status-banner status-${kind}`;
  container.replaceChildren();
  container.append(el('span', { class: 'status-icon', text: kind === 'error' ? '⚠' : kind === 'success' ? '✓' : 'ℹ' }));
  container.append(el('div', { class: 'status-body' },
    el('div', { class: 'status-message', text: message }),
    details ? el('div', { class: 'status-details', text: details }) : null,
  ));
}

export function clearStatus(container) {
  if (container) container.replaceChildren();
}

/* ---------- Image handling ---------- */

export function validateImageFile(file) {
  if (!file) throw new ValidationError('No file selected.');
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ValidationError(`Unsupported image format: ${file.type || 'unknown'}.`, 'Allowed formats: JPG, JPEG, PNG, WEBP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ValidationError('That image is too large.', `Maximum size is 12 MB; this file is ${bytesLabel(file.size)}.`);
  }
  if (file.size === 0) throw new ValidationError('The selected image is empty.');
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new ValidationError('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlMime(dataUrl) {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match ? match[1] : 'image/png';
}

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ValidationError('The image file appears to be corrupt or is not a valid image.'));
    img.src = dataUrl;
  });
}

/*
 * Re-encodes and downscales uploaded images so large photos never blow up
 * storage limits or API payloads. Runs entirely on the user's device.
 */
export async function prepareImage(fileOrDataUrl, { maxDimension = MAX_IMAGE_DIMENSION, quality = 0.88 } = {}) {
  let dataUrl;
  let sourceType;
  if (typeof fileOrDataUrl === 'string') {
    dataUrl = fileOrDataUrl;
    sourceType = dataUrlMime(dataUrl);
  } else {
    validateImageFile(fileOrDataUrl);
    sourceType = fileOrDataUrl.type;
    dataUrl = await readFileAsDataURL(fileOrDataUrl);
  }
  const img = await loadImage(dataUrl);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new ValidationError('Could not read the image dimensions.');
  }
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  // Keep PNG only when the source really is png (transparency); otherwise JPEG keeps payloads small.
  const outType = sourceType === 'image/png' ? 'image/png' : 'image/jpeg';
  const result = canvas.toDataURL(outType, outType === 'image/png' ? undefined : quality);
  return {
    dataUrl: result,
    width,
    height,
    mimeType: outType,
    bytes: Math.round((result.length - result.indexOf(',') - 1) * 0.75),
  };
}

/*
 * Reads a finite duration from a <video>. MediaRecorder-produced WebM files
 * (common from test pipelines and some providers) omit the duration metadata
 * and report Infinity; the seekable range still reveals the real length.
 */
export async function readVideoDuration(video, { timeoutMs = 2500 } = {}) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    };
    const onSeeked = () => {
      try {
        if (video.seekable && video.seekable.length) {
          const end = video.seekable.end(video.seekable.length - 1);
          finish(end);
          return;
        }
      } catch { /* fall through */ }
      finish(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = 1e101; } catch { finish(null); }
    setTimeout(() => finish(Number.isFinite(video.duration) ? video.duration : null), timeoutMs);
  });
}

export function drawVideoThumbnail(video, { maxDimension = 640 } = {}) {
  try {
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null; // Cross-origin video without CORS headers cannot be thumbnailed; callers fall back to the creator image.
  }
}

/* ---------- Network: every request is executed by the service worker ---------- */

function messageServiceWorker(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new NetworkError('The extension service worker is unavailable.', err.message));
        return;
      }
      if (!response || !response.ok) {
        const err = response && response.error;
        reject(err ? new NetworkError(err.message || 'The network request failed.', err.name || '') : new NetworkError('No response from the service worker.'));
        return;
      }
      resolve(response.data);
    });
  });
}

/*
 * Executes an HTTPS request from the service worker.
 * Rules enforced in the worker (defence in depth):
 *  - only https:// origins, except http://localhost / 127.0.0.1 for local testing
 *  - only GET/POST/PUT methods
 *  - responses are returned as data, never executed
 */
export async function httpRequest({ method = 'GET', url, headers = {}, body = null, timeoutMs = 60000, binary = false }) {
  return messageServiceWorker({
    type: 'rf:fetch',
    request: { method: method.toUpperCase(), url, headers, body, timeoutMs, binary },
  });
}

export async function httpJson({ method = 'GET', url, headers = {}, body = null, timeoutMs = 60000 }) {
  const finalHeaders = { ...headers };
  let finalBody = body;
  if (body !== null && typeof body === 'object') {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    finalBody = JSON.stringify(body);
  }
  const response = await httpRequest({ method, url, headers: finalHeaders, body: finalBody, timeoutMs, binary: false });
  let parsed = null;
  if (response.bodyText) {
    try {
      parsed = JSON.parse(response.bodyText);
    } catch {
      throw new ProviderError('The API returned a non-JSON response.', { status: response.status, details: response.bodyText.slice(0, 300) });
    }
  }
  if (response.status < 200 || response.status >= 300) {
    const message = (parsed && (parsed.error?.message || parsed.message || parsed.error)) || `The API returned HTTP ${response.status}.`;
    throw new ProviderError(typeof message === 'string' ? message : 'The API returned an error.', {
      status: response.status,
      details: response.bodyText ? response.bodyText.slice(0, 500) : '',
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return { status: response.status, data: parsed };
}

export async function downloadUrl(url, filename) {
  const response = await httpRequest({ method: 'GET', url, binary: true, timeoutMs: 180000 });
  if (response.status < 200 || response.status >= 300 || !response.bytes) {
    throw new ProviderError('The video could not be downloaded from the provider.', { status: response.status });
  }
  const mime = response.contentType || 'video/mp4';
  const blob = new Blob([response.bytes], { type: mime });
  triggerDownload(URL.createObjectURL(blob), filename);
  return { size: response.bytes.byteLength, blob };
}

export function triggerDownload(href, filename) {
  const a = el('a', { href, download: filename });
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

/* Ask the user to grant host permissions (MV3). One prompt for all origins. */
export async function requestOriginPatterns(patterns) {
  if (!patterns.length) return true;
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: patterns });
  } catch {
    granted = false;
  }
  if (!granted) {
    throw new NetworkError('Host permission was denied.', 'ReelForge needs permission to contact the configured API host. Press the action button again and approve the permission prompt.');
  }
  return true;
}

/* Single-origin convenience used by ad-hoc media fetches. Accepts a full URL. */
export async function ensureOriginPermission(originUrl) {
  if (!originUrl) throw new ValidationError('No API URL configured.');
  let url;
  try {
    url = new URL(originUrl);
  } catch {
    throw new ValidationError(`"${originUrl}" is not a valid URL.`);
  }
  return requestOriginPatterns([`${url.protocol}//${url.host}/*`]);
}
