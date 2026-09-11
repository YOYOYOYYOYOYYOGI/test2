const PROJECTS_KEY = 'ugc_projects_v1';
const BRAND_KEY = 'ugc_brand_kit';
const KNOWLEDGE_KEY = 'ugc_knowledge_base_v1';
const BACKEND_KEY = 'ugc_backend_url';

const chromeStorage = () => globalThis.chrome?.storage?.local ?? null;

export async function getValue(key, fallback = null) {
  const store = chromeStorage();
  if (store) {
    const result = await store.get(key);
    return result[key] ?? fallback;
  }
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export async function setValue(key, value) {
  const store = chromeStorage();
  if (store) return store.set({ [key]: value });
  localStorage.setItem(key, JSON.stringify(value));
}

export async function getProjects() {
  return getValue(PROJECTS_KEY, []);
}

export async function saveProject(project) {
  const projects = await getProjects();
  const next = { ...project, updatedAt: new Date().toISOString() };
  const index = projects.findIndex(item => item.id === next.id);
  if (index >= 0) projects[index] = next; else projects.unshift(next);
  await setValue(PROJECTS_KEY, projects.slice(0, 30));
  return next;
}

export async function deleteProject(id) {
  const projects = await getProjects();
  await setValue(PROJECTS_KEY, projects.filter(project => project.id !== id));
}

export async function getBrandKit() {
  return getValue(BRAND_KEY, {
    brandName: 'Rangat Naturals', tagline: 'Everyday care, made beautifully.', primary: '#d9f565', secondary: '#1c2330', accent: '#ff9e75', font: 'DM Sans', cta: 'Shop now', website: 'rangatnaturals.com', defaultStyle: 'Beauty / cosmetics UGC', logoAssetId: null
  });
}

export async function saveBrandKit(brandKit) { await setValue(BRAND_KEY, brandKit); return brandKit; }

export async function getKnowledge() {
  return getValue(KNOWLEDGE_KEY, [
    { id: 'kb-1', type: 'Brand rule', title: 'Sound like a confident friend', content: 'Use clear, warm Indian English. Avoid exaggerated medical claims. Keep benefits specific and easy to understand.' },
    { id: 'kb-2', type: 'Winning hook', title: 'The 3-second problem opener', content: 'Start with a relatable skincare frustration before introducing the product.' },
    { id: 'kb-3', type: 'CTA', title: 'Soft conversion', content: 'Close with one direct action: tap to shop, save this routine, or try it today.' },
    { id: 'kb-4', type: 'Reels rule', title: 'Retention-first six beats', content: 'Open with a visual or question in the first three seconds. Move Hook → Problem → Product → Benefits → Proof / Result → CTA. Keep each beat focused and conversational.' }
  ]);
}

export async function saveKnowledge(items) { await setValue(KNOWLEDGE_KEY, items); return items; }

export async function getBackendUrl() {
  const fallback = globalThis.location?.protocol === 'http:' ? '/api' : 'http://localhost:8787/api';
  return getValue(BACKEND_KEY, fallback);
}
export async function saveBackendUrl(url) { await setValue(BACKEND_KEY, url.replace(/\/$/, '')); }

const DB_NAME = 'ugc-video-creator-assets';
const DB_VERSION = 1;
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveAsset(file, metadata = {}) {
  const id = metadata.id || `asset-${crypto.randomUUID()}`;
  const dataUrl = await fileToDataUrl(file);
  const record = { id, name: file.name, type: file.type, size: file.size, dataUrl, createdAt: new Date().toISOString(), ...metadata };
  return saveAssetRecord(record);
}
export async function saveDataUrlAsset(dataUrl, metadata = {}) {
  const id = metadata.id || `asset-${crypto.randomUUID()}`;
  const record = { id, name: metadata.name || 'generated-creator.svg', type: metadata.type || 'image/svg+xml', size: dataUrl.length, dataUrl, createdAt: new Date().toISOString(), ...metadata };
  return saveAssetRecord(record);
}
async function saveAssetRecord(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put(record); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  return record;
}
export async function getAsset(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => { const request = db.transaction('assets').objectStore('assets').get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
}
export async function deleteAsset(id) {
  if (!id) return;
  const db = await openDb();
  await new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}
