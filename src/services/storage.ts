// Tiny abstraction over chrome.storage.local with an in-memory cache.
// All persisted extension data (fields, products, settings, orders) lives here.
type Data = Record<string, unknown>;

const mem = new Map<string, unknown>();
let ready: Promise<void> | null = null;

const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

export function load(keys?: string[]): Promise<void> {
  if (!hasChrome) return Promise.resolve();
  if (!ready) {
    ready = new Promise((res) => chrome.storage.local.get(keys ?? null, (d) => {
      for (const [k, v] of Object.entries(d || {})) mem.set(k, v);
      res();
    }));
  }
  return ready;
}

export function get<T>(key: string, fallback: T): T {
  return (mem.has(key) ? mem.get(key) : fallback) as T;
}

export async function set(key: string, value: unknown): Promise<void> {
  mem.set(key, value);
  if (hasChrome) await chrome.storage.local.set({ [key]: value });
}

export async function update<T>(key: string, fn: (cur: T) => T, fallback: T): Promise<T> {
  const next = fn(get<T>(key, fallback));
  await set(key, next);
  return next;
}
