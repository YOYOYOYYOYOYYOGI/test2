// ---------------------------------------------------------------------------
// Zustand store — single source of truth for UI state, persisted to
// chrome.storage.local through the storage service.
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import type { OldOrderRecord, Order, OrderField, Product, Settings, Toast } from '../types';
import { LS, storage } from '../services/storage';
import { makeDefaultSettingsWithTemplate } from '../services/config';

interface AppState {
  ready: boolean;
  settings: Settings;
  fields: OrderField[];
  products: Product[];
  orders: Order[];
  oldOrders: OldOrderRecord[];
  counter: number;
  setupComplete: boolean;

  init(): Promise<void>;
  refreshOrders(): Promise<void>;
  refreshConfig(): Promise<void>;

  /** Persist any subset of the config; updates state. */
  persist(config: { settings?: Settings; fields?: OrderField[]; products?: Product[] }): Promise<void>;
  patchSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): Promise<void>;

  addOrder(order: Order, replace?: boolean): Promise<void>;
  updateOrderInList(order: Order): Promise<void>;
  removeOrder(id: string): Promise<void>;
  setCounter(n: number): Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: undefined as unknown as Settings,
  fields: [],
  products: [],
  orders: [],
  oldOrders: [],
  counter: 0,
  setupComplete: false,

  async init() {
    // First run ever: seed the default settings + starter field template so the
    // wizard always has something to show.
    const existingSettings = await storage.getState<Settings | undefined>(LS.settings);
    if (existingSettings === undefined) {
      const { settings, fields } = makeDefaultSettingsWithTemplate();
      await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields });
    }
    const s = await storage.loadAll();
    set({
      settings: s.settings,
      fields: s.fields,
      products: s.products,
      orders: s.orders,
      oldOrders: s.oldOrders,
      counter: s.nextOrderNumber,
      setupComplete: s.setupDone,
      ready: true,
    });
    // keep every open page in sync (app + popup)
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[LS.orders]) void get().refreshOrders();
        if (
          changes[LS.settings] ||
          changes[LS.fields] ||
          changes[LS.products] ||
          changes[LS.oldOrders] ||
          changes[LS.nextOrderNumber] ||
          changes[LS.setupDone]
        ) {
          void get().refreshConfig();
        }
      });
    }
  },

  async refreshConfig() {
    const s = await storage.loadAll();
    set({
      settings: s.settings,
      fields: s.fields,
      products: s.products,
      orders: s.orders,
      oldOrders: s.oldOrders,
      counter: s.nextOrderNumber,
      setupComplete: s.setupDone,
    });
  },

  async refreshOrders() {
    const orders = (await storage.getState<Order[]>(LS.orders)) ?? [];
    set({ orders });
  },

  async persist(config) {
    const cur = get();
    const settings = config.settings ?? cur.settings;
    const fields = config.fields ?? cur.fields;
    const products = config.products ?? cur.products;
    const items: Record<string, unknown> = {};
    if (config.settings) items[LS.settings] = settings;
    if (config.fields) items[LS.fields] = fields;
    if (config.products) items[LS.products] = products;
    await storage.setMany(items);
    set({ settings, fields, products });
  },

  async patchSettings(patch) {
    const s = get().settings;
    const applied = typeof patch === 'function' ? { ...s, ...patch(s) } : { ...s, ...patch };
    await get().persist({ settings: applied });
  },

  async addOrder(order, replace = false) {
    const all = get().orders;
    const next = replace
      ? all.map((o) => (o.id === order.id ? order : o))
      : [...all, order];
    await storage.set(LS.orders, next);
    set({ orders: next });
  },

  async updateOrderInList(order) {
    const next = get().orders.map((o) => (o.id === order.id ? order : o));
    await storage.set(LS.orders, next);
    set({ orders: next });
  },

  async removeOrder(id) {
    const next = get().orders.filter((o) => o.id !== id);
    await storage.set(LS.orders, next);
    set({ orders: next });
  },

  async setCounter(n) {
    await storage.set(LS.nextOrderNumber, n);
    set({ counter: n });
  },
}));

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): number;
  dismiss(id: number): void;
}

let toastSeq = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(t) {
    const id = toastSeq++;
    const toast: Toast = { ...t, id };
    set({ toasts: [...get().toasts, toast] });
    if (t.kind !== 'loading') {
      const autoDismiss = t.kind === 'success' ? 4500 : 9000;
      setTimeout(() => get().dismiss(id), autoDismiss);
    }
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export function toast(
  kind: Toast['kind'],
  title: string,
  opts: Partial<Omit<Toast, 'id' | 'kind' | 'title'>> = {},
): number {
  return useToastStore.getState().push({ kind, title, ...opts });
}
