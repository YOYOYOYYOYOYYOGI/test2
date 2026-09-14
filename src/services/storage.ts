// ---------------------------------------------------------------------------
// Storage service — single wrapper around chrome.storage.local
// (local = browser profile data; NOT the cloud spreadsheet)
// ---------------------------------------------------------------------------
import type { OldOrderRecord, Order, OrderField, Product, Settings } from '../types';
import { defaultSettings } from '../lib/constants';

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || Array.isArray(override)) {
    return (override !== undefined ? override : base) as T;
  }
  if (base && override && typeof base === 'object' && typeof override === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      const b = (base as Record<string, unknown>)[k];
      out[k] = b && v && typeof b === 'object' && typeof v === 'object' ? deepMerge(b, v) : v;
    }
    return out as T;
  }
  return (override !== undefined ? override : base) as T;
}

export const LS = {
  version: 'olm.version',
  settings: 'olm.settings',
  fields: 'olm.fields',
  products: 'olm.products',
  orders: 'olm.orders',
  nextOrderNumber: 'olm.nextOrderNumber',
  /** queue of spreadsheet operations performed offline (for sync) */
  pendingOps: 'olm.pendingOps',
  /** cached header map from the spreadsheet */
  sheetHeaders: 'olm.sheetHeaders',
  lastRow: 'olm.lastRow',
  sheetCachedOrders: 'olm.sheetCachedOrders',
  demoSeed: 'olm.demoSeed',
  setupDone: 'olm.setupDone',
  /** imported historical customer/order records (old data, kept separate) */
  oldOrders: 'olm.oldOrders',
};

export interface StoredState {
  version?: number;
  settings?: Settings;
  fields?: OrderField[];
  products?: Product[];
  orders?: Order[];
  oldOrders?: OldOrderRecord[];
  pendingOps?: unknown[];
  sheetHeaders?: Record<string, number>;
  lastRow?: number;
  sheetCachedOrders?: unknown[];
  demoSeed?: number;
  setupDone?: boolean;
}

export interface KeyedState {
  settings: Settings;
  fields: OrderField[];
  products: Product[];
  orders: Order[];
  oldOrders: OldOrderRecord[];
  setupDone: boolean;
}

function chromeArea(): typeof chrome.storage.local {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
  // plain-browser fallback (tests / browser preview): persist in localStorage
  // when available so the demo keeps its data across reloads; otherwise use
  // an in-memory map. The Chrome extension itself always takes the branch above.
  let ls: Storage | null = null;
  try {
    if (typeof localStorage !== 'undefined') ls = localStorage;
  } catch {
    ls = null;
  }
  const mem = new Map<string, unknown>();
  const rawGet = (k: string): unknown => {
    if (ls) {
      const raw = ls.getItem(k);
      if (raw === null) return undefined;
      try { return JSON.parse(raw) as unknown; } catch { return undefined; }
    }
    return mem.get(k);
  };
  const rawSet = (k: string, v: unknown) => {
    if (ls) { try { ls.setItem(k, JSON.stringify(v)); } catch { mem.set(k, v); } }
    else mem.set(k, v);
  };
  const rawRemove = (k: string) => {
    if (ls) ls.removeItem(k);
    mem.delete(k);
  };
  const m = {
    get: async (keys?: string | string[] | Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      if (!keys) {
        if (ls) {
          for (let i = 0; i < ls.length; i += 1) {
            const k = ls.key(i);
            if (k) out[k] = rawGet(k);
          }
        } else mem.forEach((v, k) => (out[k] = v));
      }
      else if (typeof keys === 'string') { const v = rawGet(keys); if (v !== undefined) out[keys] = v; }
      else if (Array.isArray(keys)) keys.forEach((k) => { const v = rawGet(k); if (v !== undefined) out[k] = v; });
      else Object.entries(keys).forEach(([k, d]) => (out[k] = rawGet(k) ?? d));
      return out;
    },
    set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([k, v]) => rawSet(k, v)); },
    remove: async (keys: string | string[]) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => rawRemove(k)); },
    clear: async () => {
      if (ls) ls.clear();
      mem.clear();
    },
  };
  return m as never;
}

export const storage = {
  area: chromeArea(),

  async loadAll(): Promise<KeyedState> {
    const raw = (await this.area.get([
      LS.settings, LS.fields, LS.products, LS.orders, LS.oldOrders, LS.setupDone,
    ])) as Record<string, unknown>;
    const settings = deepMerge(defaultSettings(), (raw[LS.settings] as Settings) ?? {});
    return {
      settings: { ...defaultSettings(), ...settings },
      fields: Array.isArray(raw[LS.fields]) ? (raw[LS.fields] as OrderField[]) : [],
      products: Array.isArray(raw[LS.products]) ? (raw[LS.products] as Product[]) : [],
      orders: Array.isArray(raw[LS.orders]) ? (raw[LS.orders] as Order[]) : [],
      oldOrders: Array.isArray(raw[LS.oldOrders]) ? (raw[LS.oldOrders] as OldOrderRecord[]) : [],
      setupDone: Boolean(raw[LS.setupDone]),
    };
  },

  async getState<K>(key: string): Promise<K | undefined> {
    const raw = (await this.area.get(String(key))) as Record<string, unknown>;
    return raw[String(key)] as K | undefined;
  },

  async set(key: string, value: unknown): Promise<void> {
    await this.area.set({ [key]: value });
  },

  async setMany(items: Record<string, unknown>): Promise<void> {
    await this.area.set(items);
  },

  async remove(keys: string | string[]): Promise<void> {
    await this.area.remove(keys);
  },

  /** Compact settings + config (for Export Settings JSON) */
  async exportSettings(): Promise<string> {
    const s = await this.loadAll();
    const payload = {
      app: 'order-label-manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s.settings,
      fields: s.fields,
      products: s.products,
    };
    return JSON.stringify(payload, null, 2);
  },

  async exportOrders(): Promise<Order[]> {
    const s = await this.loadAll();
    return s.orders;
  },
};

export function isChromeRuntime(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}

export function inExtension(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}
