import { DEFAULT_SETTINGS } from '../constants';
import type { CustomField, Order, Product, Settings } from '../types';
import { uid } from '../utils';
import * as store from './storage';

const K = {
  fields: 'fields',
  products: 'products',
  orders: 'orders',
  settings: 'settings',
  headers: 'sheetHeaders',
};

export const getFields = (): CustomField[] => store.get<CustomField[]>(K.fields, []).slice().sort((a, b) => a.order - b.order);
export const getProducts = (): Product[] => store.get<Product[]>(K.products, []);
export const getOrders = (): Order[] => store.get<Order[]>(K.orders, []);
export const getSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>(K.settings, {}) }) as Settings;
export const getHeaders = (): string[] => store.get<string[]>(K.headers, []);

export const saveFields = (f: CustomField[]) => store.set(K.fields, f);
export const saveProducts = (p: Product[]) => store.set(K.products, p);
export const saveSettings = (s: Settings) => store.set(K.settings, s);
export const saveHeaders = (h: string[]) => store.set(K.headers, h);

export async function saveOrder(o: Order): Promise<void> {
  await store.update<Order[]>(K.orders, (list) => {
    const i = list.findIndex((x) => x.id === o.id);
    if (i >= 0) list[i] = o;
    else list.unshift(o);
    return list;
  }, []);
}

export function getOrder(id: string): Order | undefined {
  return getOrders().find((o) => o.id === id);
}

export function findByNumber(orderNumber: string): Order | undefined {
  const n = orderNumber.trim().toLowerCase();
  return getOrders().find((o) => o.orderNumber.trim().toLowerCase() === n);
}

export function nextOrderNumber(): string {
  const s = getSettings();
  return s.orderPrefix + s.nextNumber;
}

export async function bumpOrderNumber(): Promise<void> {
  const s = getSettings();
  s.nextNumber = Math.max(s.nextNumber + 1, 1);
  await saveSettings(s);
}

export async function saveAllOrders(list: Order[]): Promise<void> {
  await store.set(K.orders, list);
}

export async function deleteOrder(id: string): Promise<void> {
  await store.update<Order[]>(K.orders, (list) => list.filter((o) => o.id !== id), []);
}

/** Customer name/phone of an order, based on the user's custom fields. */
export function customerName(order: Order): string {
  const f = getFields().find((x) => /name/i.test(x.name));
  return f ? order.customerData[f.id] || '' : '';
}

export function customerPhone(order: Order): string {
  const f = getFields().find((x) => x.type === 'phone' || /phone|mobile|whatsapp/i.test(x.name));
  return f ? order.customerData[f.id] || '' : '';
}

export async function addProduct(p?: Partial<Product>): Promise<Product> {
  const product: Product = { id: uid('p_'), name: p?.name ?? 'New Product', sku: p?.sku ?? '', price: p?.price ?? 0, active: p?.active ?? true };
  await store.update<Product[]>(K.products, (l) => [...l, product], []);
  return product;
}

/** Seed sample data once (demo mode) so every feature is testable without Google Sheets. */
export async function ensureSeed(): Promise<void> {
  await store.load();
  if (store.get<boolean>('seeded', false)) return;
  await store.set('seeded', true);
  if (getFields().length === 0) {
    await saveFields([
      { id: 'f_name', name: 'Customer Name', type: 'text', required: true, order: 0 },
      { id: 'f_phone', name: 'Phone', type: 'phone', required: true, order: 1 },
      { id: 'f_address', name: 'Address', type: 'textarea', required: false, order: 2 },
      { id: 'f_city', name: 'City', type: 'text', required: false, order: 3 },
      { id: 'f_state', name: 'State', type: 'text', required: false, order: 4 },
      { id: 'f_pincode', name: 'Pincode', type: 'number', required: false, order: 5 },
    ]);
  }
  if (getProducts().length === 0) {
    await saveProducts([
      { id: 'p_night', name: 'Night Cream', sku: 'NC-01', price: 499, active: true },
      { id: 'p_serum', name: 'Face Serum', sku: 'FS-02', price: 699, active: true },
      { id: 'p_day', name: 'Day Cream', sku: 'DC-03', price: 599, active: true },
    ]);
  }
}

/** Export everything (orders, fields, products, settings) as a JSON file download. */
export function exportBackup(): void {
  const data = {
    exportedAt: new Date().toISOString(),
    fields: getFields(),
    products: getProducts(),
    orders: getOrders(),
    settings: getSettings(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'order-label-manager-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Import a previously exported backup file via a file picker. */
export function importBackup(file: File): Promise<void> {
  return file.text().then(async (text) => {
    const d = JSON.parse(text);
    if (Array.isArray(d.fields)) await saveFields(d.fields);
    if (Array.isArray(d.products)) await saveProducts(d.products);
    if (Array.isArray(d.orders)) await store.set(K.orders, d.orders);
    if (d.settings) await saveSettings({ ...getSettings(), ...d.settings });
  });
}
