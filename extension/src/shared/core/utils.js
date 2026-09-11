/**
 * ReelForge — shared utility helpers.
 * Pure functions only (no DOM / chrome API dependencies) so they are unit-testable.
 */

/** Small unique id generator (timestamp + random). */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Promise-based sleep. */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Format seconds as m:ss (e.g. 0:32). */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Escape a string for safe HTML interpolation. */
export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Deterministic string hash → 32-bit int (used to seed the local music generator). */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 seeded RNG — deterministic pseudo-random numbers. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple tokenizer for keyword matching (knowledge-base retrieval). */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'as',
  'at', 'by', 'from', 'you', 'your', 'i', 'we', 'they', 'he', 'she', 'my', 'our',
  'will', 'can', 'do', 'does', 'did', 'not', 'no', 'yes', 'so', 'if', 'then',
]);

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Extract the first balanced JSON object/array from arbitrary LLM output.
 * Tolerates markdown fences and surrounding prose. Returns null when not found.
 */
export function extractJson(text) {
  if (text == null) return null;
  let str = String(text).trim();
  // Strip markdown code fences.
  str = str.replace(/^```(?:json|javascript)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const candidates = [];
  const openers = ['{', '['];
  for (const opener of openers) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === opener) {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === (opener === '{' ? '}' : ']')) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(str.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  // Prefer the longest candidate (a complete object beats a fragment).
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Truncate a string to n chars with ellipsis. */
export function truncate(str, n = 120) {
  const s = String(str ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Deep clone via structured clone when available, JSON otherwise. */
export function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(obj));
}

/** Group an array by a key selector. */
export function groupBy(arr, fn) {
  const out = new Map();
  for (const item of arr) {
    const k = fn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

/** Turn a Blob into a base64 data URL. */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

/** Turn a data URL back into a Blob. */
export function dataURLToBlob(dataURL) {
  const [head, body] = String(dataURL).split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Download a Blob as a file (works inside extension pages). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Safe timestamp for filenames. */
export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
