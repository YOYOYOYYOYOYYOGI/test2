// ---------------------------------------------------------------------------
// Old customer/order data service — imported history stored SEPARATELY from
// new orders (its own chrome.storage key) plus the ORDER CHAIN: new orders
// created from a previous order also appear in the lookup (as the customer's
// latest orders), so the chain can continue:
//   4673-4312-3542 → 14000-4673-4312-3542 → 14001-14000-4673-4312-3542
// Imported records never participate in dashboard stats, sales, Excel
// exports, labels or the normal spreadsheet flow.
// ---------------------------------------------------------------------------
import type { OldOrderRecord, Order, OrderField, Settings } from '../types';
import { LS, storage } from './storage';
import { normalizeOrderNumber, normalizePhone } from '../lib/normalizePhone';
import { resolveFieldColumn } from './spreadsheet/values';

export async function getOldOrders(): Promise<OldOrderRecord[]> {
  return (await storage.getState<OldOrderRecord[]>(LS.oldOrders)) ?? [];
}

/** Merge imported records into the store. Duplicate rows (same normalized
 *  order number + whatsapp + name + address) already stored are skipped —
 *  the same WhatsApp number with DIFFERENT order numbers is always kept. */
export async function mergeOldOrders(records: OldOrderRecord[]): Promise<{ added: number; skipped: number; total: number }> {
  const existing = await getOldOrders();
  const seen = new Set(
    existing.map((r) => `${normalizeOrderNumber(r.orderNumber).toLowerCase()}|${normalizePhone(r.whatsapp)}|${r.name.toLowerCase()}|${r.address.toLowerCase()}`),
  );
  let added = 0;
  let skipped = 0;
  for (const rec of records) {
    const key = `${normalizeOrderNumber(rec.orderNumber).toLowerCase()}|${normalizePhone(rec.whatsapp)}|${rec.name.toLowerCase()}|${rec.address.toLowerCase()}`;
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    existing.push(rec);
    added += 1;
  }
  await storage.set(LS.oldOrders, existing);
  return { added, skipped, total: existing.length };
}

export async function clearOldOrders(): Promise<void> {
  await storage.set(LS.oldOrders, []);
}

// ---------------------------------------------------------------------------
// Unified "previous order" search source: imported history + current orders
// ---------------------------------------------------------------------------

/** One selectable previous order (from the imported history or from an
 *  existing current order). Its `orderNumber` becomes the immediate parent
 *  in the chain when picked. */
export interface PreviousOrderEntry {
  id: string;
  orderNumber: string;
  whatsapp: string;
  name: string;
  address: string;
  mobile: string;
  city: string;
  state: string;
  pincode: string;
  /** imported old record extra columns (header → value) */
  extras?: Record<string, string>;
  /** current-order custom field values keyed by FIELD ID */
  customByFieldId?: Record<string, string | number | boolean>;
  /** sort: current orders by createdAt (newest first), imported by row */
  ts: number;
  seq: number;
  kind: 'order' | 'old';
  /** editing a current order — excluded from the search results */
  orderId?: string;
}

export function oldRecordToEntry(rec: OldOrderRecord): PreviousOrderEntry {
  return {
    id: `old-${rec.id}`,
    orderNumber: normalizeOrderNumber(rec.orderNumber),
    whatsapp: normalizePhone(rec.whatsapp),
    name: rec.name,
    address: rec.address,
    mobile: '',
    city: '',
    state: '',
    pincode: '',
    extras: rec.extras,
    ts: rec.importedAt,
    seq: rec.sourceRow,
    kind: 'old',
  };
}

export function currentOrderToEntry(o: Order): PreviousOrderEntry {
  return {
    id: `order-${o.id}`,
    orderNumber: o.orderNumber,
    whatsapp: normalizePhone(o.customer.whatsapp),
    name: o.customer.name,
    address: o.customer.address,
    mobile: o.customer.mobile,
    city: o.customer.city,
    state: o.customer.state,
    pincode: o.customer.pincode,
    customByFieldId: o.customFields,
    ts: o.createdAt ?? 0,
    seq: 0,
    kind: 'order',
    orderId: o.id,
  };
}

/** Pre-built lookup (built once per data change — no per-keystroke scan):
 *  WhatsApp number → previous-order candidates, current orders FIRST (newest
 *  first), then imported history in file order. */
export interface PreviousIndex {
  find(rawWhatsapp: string | undefined, excludeOrderId?: string): PreviousOrderEntry[];
}

export function createPreviousIndex(oldRecords: OldOrderRecord[], orders: Order[]): PreviousIndex {
  const oldByPhone = new Map<string, OldOrderRecord[]>();
  for (const rec of oldRecords) {
    const n = normalizePhone(rec.whatsapp);
    if (n.length < 10) continue;
    const list = oldByPhone.get(n);
    if (list) list.push(rec);
    else oldByPhone.set(n, [rec]);
  }
  const ordersByPhone = new Map<string, Order[]>();
  for (const o of orders) {
    const n = normalizePhone(o.customer.whatsapp);
    if (n.length < 10) continue;
    const list = ordersByPhone.get(n);
    if (list) list.push(o);
    else ordersByPhone.set(n, [o]);
  }
  const sortOrders = (arr: Order[]) => arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return {
    find(raw, excludeOrderId) {
      const n = normalizePhone(raw);
      if (n.length < 10) return [];
      const entries: PreviousOrderEntry[] = [];
      for (const o of sortOrders(ordersByPhone.get(n) ?? [])) {
        if (excludeOrderId && o.id === excludeOrderId) continue;
        entries.push(currentOrderToEntry(o));
      }
      // only orders with at least one real detail beyond the bare number
      const olds = (oldByPhone.get(n) ?? [])
        .map(oldRecordToEntry)
        .filter((e) => e.name || e.address || e.orderNumber);
      entries.push(...olds);
      return entries;
    },
  };
}

/** (kept for compatibility/tests) All old orders for a raw phone input. */
export function findOldByWhatsapp(index: Map<string, OldOrderRecord[]>, raw: string | undefined): OldOrderRecord[] {
  const n = normalizePhone(raw);
  if (n.length < 10) return [];
  return index.get(n) ?? [];
}

export function indexOldOrders(records: OldOrderRecord[]): Map<string, OldOrderRecord[]> {
  const map = new Map<string, OldOrderRecord[]>();
  for (const rec of records) {
    const n = normalizePhone(rec.whatsapp);
    if (n.length < 10) continue;
    const list = map.get(n);
    if (list) list.push(rec);
    else map.set(n, [rec]);
  }
  return map;
}

/** Extra-column values of an imported record that match a configured field
 *  (by field name / column header / mapping) — used to autofill custom
 *  fields from imported history. */
export function extraValueForField(rec: { extras?: Record<string, string> }, field: OrderField, settings: Settings): string {
  const extras = rec.extras ?? {};
  if (Object.keys(extras).length === 0) return '';
  const wanted = new Set([
    (field.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    ((field.columnHeader ?? '') || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    (resolveFieldColumn(field, settings) || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
  ]);
  for (const [header, value] of Object.entries(extras)) {
    const k = header.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (wanted.has(k)) return String(value ?? '').trim();
  }
  return '';
}
