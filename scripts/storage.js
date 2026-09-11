/*
 * storage.js - All persistent state lives here.
 *
 *  - Settings (including API keys) use chrome.storage.local, which is scoped to
 *    this extension's extension ID and is never synced to a Google account.
 *  - Projects/history also use chrome.storage.local (text metadata only).
 *  - Generated video bytes are kept in IndexedDB, capped in number/size, so
 *    reopening a project can still preview/download without re-calling the API.
 *
 * No analytics, no telemetry, no external collection.
 */

import { STORAGE_KEYS, IMAGE_DB_NAME, IMAGE_DB_STORE, STORED_VIDEO_LIMIT, MAX_STORED_VIDEO_BYTES, defaultSettings } from './config.js';
import { uid, nowIso } from './util.js';
import { ConfigurationError } from './errors.js';

function mergeDeep(base, override) {
  if (!override) return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override)) {
    const value = override[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object' && base[key] !== null) {
      out[key] = mergeDeep(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function migrate(settings) {
  // v1 stored a single top-level llm.apiKey/baseUrl/model. v2 keeps a separate
  // credential set per provider so keys can never be mixed between services.
  const llm = settings.llm;
  if (llm && llm.provider && llm.providers && (llm.apiKey || llm.baseUrl || llm.model)) {
    const id = llm.provider === 'local' ? 'openai' : llm.provider;
    const target = llm.providers[id] || {};
    // Legacy values are the user's actual saved configuration, so they win
    // over the per-provider catalogue defaults.
    if (llm.apiKey) target.apiKey = llm.apiKey;
    if (llm.baseUrl) target.baseUrl = llm.baseUrl;
    if (llm.model) target.model = llm.model;
    llm.providers[id] = target;
    delete llm.apiKey;
    delete llm.baseUrl;
    delete llm.model;
  }
  settings.version = 2;
  return settings;
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const merged = migrate(mergeDeep(defaultSettings(), stored[STORAGE_KEYS.SETTINGS] || {}));
  if ((stored[STORAGE_KEYS.SETTINGS] || {}).version !== 2) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  }
  return merged;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = mergeDeep(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

/* Only non-secret settings, for display/export in the UI. */
export function publicSettingsView(settings) {
  const mask = (value) => (value ? '••••••••' : '');
  const providers = {};
  for (const [id, cfg] of Object.entries(settings.llm.providers || {})) {
    providers[id] = {
      apiKey: mask(cfg.apiKey),
      model: cfg.model || '',
      baseUrl: cfg.baseUrl || '',
    };
  }
  return {
    mode: settings.mode,
    proxyUrl: settings.proxyUrl,
    proxyKey: mask(settings.proxyKey),
    llm: { provider: settings.llm.provider, providers },
    image: { provider: settings.image.provider, model: settings.image.model, apiKey: mask(settings.image.apiKey) },
    video: { provider: settings.video.provider, model: settings.video.model, apiKey: mask(settings.video.apiKey), pollInterval: settings.video.pollInterval },
    defaults: settings.defaults,
  };
}

/* ---------- Draft (current form) ---------- */

export async function saveDraft(draft) {
  await chrome.storage.local.set({ [STORAGE_KEYS.DRAFT]: { ...draft, updatedAt: nowIso() } });
}

export async function loadDraft() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.DRAFT);
  return data[STORAGE_KEYS.DRAFT] || null;
}

export async function clearDraft() {
  await chrome.storage.local.remove(STORAGE_KEYS.DRAFT);
}

/* ---------- In-flight jobs, so polling can resume after the popup reopens ---------- */

export async function saveActiveJobs(jobs) {
  await chrome.storage.local.set({ [STORAGE_KEYS.JOBS]: jobs });
}
export async function getActiveJobs() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.JOBS);
  return data[STORAGE_KEYS.JOBS] || [];
}

/* ---------- History / projects ---------- */

export async function listProjects() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const list = data[STORAGE_KEYS.HISTORY] || [];
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getProject(id) {
  const list = await listProjects();
  return list.find((p) => p.id === id) || null;
}

export async function upsertProject(project) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const list = data[STORAGE_KEYS.HISTORY] || [];
  const index = list.findIndex((p) => p.id === project.id);
  const record = index >= 0 ? { ...list[index], ...project, updatedAt: nowIso() } : { createdAt: nowIso(), ...project };
  if (index >= 0) list[index] = record;
  else list.unshift(record);
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list });
  return record;
}

export async function deleteProject(id) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const list = (data[STORAGE_KEYS.HISTORY] || []).filter((p) => p.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list });
  await removeVideo(id).catch(() => {});
}

export function newProjectId() {
  return uid('proj');
}

/* ---------- IndexedDB: video bytes ---------- */

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_DB_STORE)) {
        db.createObjectStore(IMAGE_DB_STORE); // key = project id
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open media storage.'));
  });
}

async function idbPut(key, blob) {
  const db = await openMediaDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_DB_STORE, 'readwrite');
      tx.objectStore(IMAGE_DB_STORE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGetAllKeys() {
  const db = await openMediaDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_DB_STORE, 'readonly');
      const req = tx.objectStore(IMAGE_DB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key) {
  const db = await openMediaDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_DB_STORE, 'readwrite');
      tx.objectStore(IMAGE_DB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getVideo(projectId) {
  const db = await openMediaDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_DB_STORE, 'readonly');
      const req = tx.objectStore(IMAGE_DB_STORE).get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function removeVideo(projectId) {
  await idbDelete(projectId);
}

/*
 * Stores a video blob for a project, enforcing simple retention limits so the
 * extension cannot fill the user's disk.
 */
export async function storeVideo(projectId, blob) {
  if (!blob || blob.size > MAX_STORED_VIDEO_BYTES) {
    return { stored: false, reason: 'Video exceeds the 25 MB local cache limit; the provider URL is kept instead.' };
  }
  await idbPut(projectId, blob);
  const keys = await idbGetAllKeys();
  if (keys.length > STORED_VIDEO_LIMIT) {
    const projects = await listProjects();
    const order = new Map(projects.map((p, i) => [p.id, i]));
    const sorted = [...keys].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    for (const key of sorted.slice(0, keys.length - STORED_VIDEO_LIMIT)) {
      await idbDelete(key).catch(() => {});
    }
  }
  return { stored: true, size: blob.size };
}

export function requireConfig(settings) {
  if (settings.mode === 'proxy') {
    if (!settings.proxyUrl) {
      throw new ConfigurationError('No secure backend URL is configured.', 'Open Settings and set your ReelForge proxy URL, or switch to direct provider mode.');
    }
    return;
  }
  const problems = [];
  if (settings.image.provider !== 'none' && !settings.image.apiKey) problems.push('image generation');
  if (settings.video.provider !== 'none' && !settings.video.apiKey) problems.push('video generation');
  if (settings.llm.provider !== 'local') {
    const llmKey = settings.llm.providers?.[settings.llm.provider]?.apiKey;
    if (!llmKey) problems.push(`script generation (${settings.llm.provider})`);
  }
  if (problems.length) {
    throw new ConfigurationError(
      'API credentials are missing.',
      `Configure API keys for: ${problems.join(', ')}. Click the Settings button to add them.`,
    );
  }
}
