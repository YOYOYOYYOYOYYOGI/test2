/**
 * ReelForge — chrome.storage.local wrapper.
 *
 * Small structured data only: settings, projects index metadata, knowledge base,
 * brand kit, style presets. Large media lives in IndexedDB (core/idb.js).
 *
 * SECURITY NOTE: in "direct" mode the user's own provider API keys are stored in
 * chrome.storage.local, which is sandboxed to this extension and never synced.
 * This is acceptable for a BYO-key tool, but the RECOMMENDED mode is "backend",
 * where keys live only in the backend server's environment variables and the
 * extension never sees them. See docs/SECURITY.md.
 */

const AREA = chrome.storage.local;

/** Default provider/feature configuration. Shape mirrors settings view. */
export const DEFAULT_SETTINGS = {
  version: 1,
  mode: 'direct', // 'direct' = BYO keys locally | 'backend' = keys live server-side (recommended)
  backend: { url: 'http://localhost:8787', token: '' },
  llm: { provider: 'openai', model: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
  image: { provider: 'none', model: '', apiKey: '' },
  video: { provider: 'none', model: '', apiKey: '' },
  tts: { provider: 'none', apiKey: '', voiceId: '', model: '' },
  lipsync: { provider: 'none', model: '', apiKey: '' },
  music: { provider: 'local', apiKey: '' },
  defaults: {
    aspect: '9:16',
    quality: '1080',
    fps: 30,
    durationSec: 30,
    captionStyle: 'bold-pop',
    voiceVolume: 1.0,
    musicVolume: 0.18,
    autoDucking: true,
    includeCTA: true,
  },
};

const SETTINGS_KEY = 'settings';
const KB_KEY = 'kbEntries';
const BRAND_KEY = 'brandKit';
const BRANDS_KEY = 'brandKits';
const STYLES_KEY = 'customStyles';

async function get(key, fallback) {
  const res = await AREA.get(key);
  return res[key] !== undefined ? res[key] : fallback;
}

async function set(key, value) {
  await AREA.set({ [key]: value });
  return value;
}

/* --------------------------------- settings -------------------------------- */

export async function loadSettings() {
  const stored = await get(SETTINGS_KEY, null);
  if (!stored) return deepMergeDefaults(structuredClone(DEFAULT_SETTINGS));
  return deepMergeDefaults(stored);
}

function deepMergeDefaults(stored) {
  const merge = (base, over) => {
    if (over === undefined || over === null) return base;
    if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
    const out = { ...base };
    for (const k of Object.keys(base)) out[k] = merge(base[k], over[k]);
    // preserve extra keys the user stored (e.g. custom baseUrl models)
    for (const k of Object.keys(over)) if (!(k in out)) out[k] = over[k];
    return out;
  };
  return merge(structuredClone(DEFAULT_SETTINGS), stored);
}

export async function saveSettings(settings) {
  return set(SETTINGS_KEY, settings);
}

export async function updateSettings(patch) {
  const current = await loadSettings();
  const next = deepMergeDefaults({ ...structuredClone(current), ...patch });
  return saveSettings(next);
}

/** True when at least an LLM is configured — the minimum for script understanding. */
export function isLLMConfigured(settings) {
  if (settings.mode === 'backend') return !!settings.backend.url;
  return !!(settings.llm.apiKey && settings.llm.provider);
}

export function isConfigured(category, settings) {
  if (category === 'music') return true; // local procedural generator needs no config
  if (settings.mode === 'backend') return !!settings.backend.url;
  const c = settings[category];
  if (!c || !c.provider || c.provider === 'none') return false;
  return !!c.apiKey;
}

/* ------------------------------- knowledge base ---------------------------- */

/** KB entry: { id, type, title, content, tags[], stats:{uses,wins}, createdAt, updatedAt } */
export async function listKB() {
  return get(KB_KEY, []);
}

export async function saveKBEntry(entry) {
  const all = await listKB();
  const now = Date.now();
  if (entry.id) {
    const idx = all.findIndex((e) => e.id === entry.id);
    if (idx >= 0) all[idx] = { ...all[idx], ...entry, updatedAt: now };
    else all.push({ ...entry, createdAt: now, updatedAt: now });
  } else {
    entry.id = `kb_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    entry.stats = entry.stats || { uses: 0, wins: 0 };
    entry.createdAt = now;
    entry.updatedAt = now;
    all.push(entry);
  }
  await set(KB_KEY, all);
  return entry;
}

export async function deleteKBEntry(id) {
  const all = await listKB();
  await set(KB_KEY, all.filter((e) => e.id !== id));
}

export async function bumpKB(id, field = 'uses') {
  const all = await listKB();
  const e = all.find((x) => x.id === id);
  if (e) {
    e.stats = e.stats || { uses: 0, wins: 0 };
    e.stats[field] = (e.stats[field] || 0) + 1;
    await set(KB_KEY, all);
  }
}

/* --------------------------------- brand kit ------------------------------- */

export const DEFAULT_BRAND = {
  name: '', logoAssetId: null, colors: { primary: '#8b5cf6', secondary: '#ec4899', accent: '#22d3ee' },
  fonts: { heading: 'Poppins, sans-serif', body: 'Inter, sans-serif' },
  website: '', cta: '', description: '', audience: '', defaultVoice: '', defaultStyle: 'realistic-ugc',
};

/** Brand kits: a list, plus which one is active by default. */
export async function listBrands() {
  return get(BRANDS_KEY, []);
}

export async function saveBrand(brand) {
  const all = await listBrands();
  const now = Date.now();
  if (!brand.id) {
    brand.id = `brand_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    brand.createdAt = now;
  }
  brand.updatedAt = now;
  const idx = all.findIndex((b) => b.id === brand.id);
  if (idx >= 0) all[idx] = { ...DEFAULT_BRAND, ...all[idx], ...brand };
  else all.push({ ...DEFAULT_BRAND, ...brand });
  await set(BRANDS_KEY, all);
  return brand;
}

export async function deleteBrand(id) {
  const all = await listBrands();
  await set(BRANDS_KEY, all.filter((b) => b.id !== id));
}

/* ------------------------------- style presets ----------------------------- */

/** User-defined custom style instructions (in addition to built-in presets). */
export async function listCustomStyles() {
  return get(STYLES_KEY, []);
}

export async function saveCustomStyle(style) {
  const all = await listCustomStyles();
  if (!style.id) style.id = `style_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const idx = all.findIndex((s) => s.id === style.id);
  if (idx >= 0) all[idx] = style;
  else all.push(style);
  await set(STYLES_KEY, all);
  return style;
}

export async function deleteCustomStyle(id) {
  const all = await listCustomStyles();
  await set(STYLES_KEY, all.filter((s) => s.id !== id));
}
