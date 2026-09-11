/**
 * ReelForge — IndexedDB persistence layer.
 *
 * Blobs (product images, person references, generated scene images, voice audio,
 * music tracks, rendered videos) are stored in IndexedDB because they can be
 * large; small structured data (settings, projects, knowledge base, brand kit)
 * lives in chrome.storage.local (see core/storage.js).
 */

const DB_NAME = 'reelforge';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/* ---------------------------------- assets --------------------------------- */

export async function putAsset(asset) {
  const db = await openDB();
  return tx(db, 'assets', 'readwrite', (s) => s.put(asset));
}

/**
 * Store a blob as a managed asset. Returns the asset descriptor
 * { id, mime, size, name, createdAt } — the blob itself never leaves IndexedDB
 * except through short-lived object URLs.
 */
export async function saveBlob(blob, { id, name, type, meta } = {}) {
  const record = {
    id: id || `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    blob,
    mime: blob.type || type || 'application/octet-stream',
    size: blob.size,
    name: name || null,
    meta: meta || null,
    createdAt: Date.now(),
  };
  await putAsset(record);
  return { id: record.id, mime: record.mime, size: record.size, name: record.name };
}

export async function getAsset(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('assets', 'readonly');
    const req = t.objectStore('assets').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** Get a short-lived object URL for an asset blob (caller should revoke). */
export async function getAssetURL(id) {
  if (!id) return null;
  const rec = await getAsset(id);
  return rec ? URL.createObjectURL(rec.blob) : null;
}

export async function getAssetDataURL(id) {
  if (!id) return null;
  const rec = await getAsset(id);
  if (!rec) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(rec.blob);
  });
}

export async function deleteAsset(id) {
  if (!id) return;
  const db = await openDB();
  return tx(db, 'assets', 'readwrite', (s) => s.delete(id));
}

/* --------------------------------- projects -------------------------------- */

export async function putProject(project) {
  const db = await openDB();
  project.updatedAt = Date.now();
  return tx(db, 'projects', 'readwrite', (s) => s.put(project));
}

export async function getProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('projects', 'readonly');
    const req = t.objectStore('projects').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('projects', 'readonly');
    const req = t.objectStore('projects').getAll();
    req.onsuccess = () => {
      const all = (req.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete a project and every media asset referenced by it. */
export async function deleteProject(id) {
  const project = await getProject(id);
  if (!project) return;
  const assetIds = new Set();
  const collect = (v) => {
    if (!v) return;
    if (typeof v === 'string' && /^(img_|aud_|vid_|asset_)/.test(v)) assetIds.add(v);
  };
  for (const img of project.input?.images || []) collect(img);
  collect(project.input?.personImage);
  for (const scene of project.storyboard?.scenes || []) {
    collect(scene?.assets?.imageAssetId);
    collect(scene?.assets?.videoAssetId);
    collect(scene?.assets?.audioAssetId);
  }
  if (project.render?.videoAssetId) collect(project.render.videoAssetId);
  if (project.music?.uploadedAssetId) collect(project.music.uploadedAssetId);
  for (const aid of assetIds) await deleteAsset(aid);
  const db = await openDB();
  return tx(db, 'projects', 'readwrite', (s) => s.delete(id));
}

/* ------------------------------- backup / kv ------------------------------- */

/** Export everything (projects + assets) into a single JSON snapshot. Assets are base64 data URLs. */
export async function exportAll() {
  const projects = await listProjects();
  const db = await openDB();
  const assets = await new Promise((resolve, reject) => {
    const t = db.transaction('assets', 'readonly');
    const req = t.objectStore('assets').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const assetOut = [];
  for (const a of assets) {
    const dataURL = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(a.blob);
    });
    assetOut.push({ id: a.id, mime: a.mime, name: a.name, dataURL });
  }
  return { format: 'reelforge-backup', version: 1, exportedAt: new Date().toISOString(), projects, assets: assetOut };
}

export async function importAll(snapshot) {
  if (!snapshot || snapshot.format !== 'reelforge-backup') {
    throw new Error('Not a ReelForge backup file');
  }
  for (const a of snapshot.assets || []) {
    const blob = await new Promise((resolve) => {
      const bin = atob(String(a.dataURL).split(',')[1] || '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: a.mime }));
    });
    await putAsset({ id: a.id, blob, mime: a.mime, size: blob.size, name: a.name, meta: null, createdAt: Date.now() });
  }
  for (const p of snapshot.projects || []) {
    await putProject(p);
  }
}

/* ------------------------------------ kv ----------------------------------- */

export async function kvSet(key, value) {
  const db = await openDB();
  return tx(db, 'kv', 'readwrite', (s) => s.put({ key, value }));
}

export async function kvGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readonly');
    const req = t.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}
