// ---------------------------------------------------------------------------
// Old customer/order data service — imported history stored SEPARATELY from
// new orders (its own chrome.storage key). Used only for:
//   - WhatsApp → previous orders lookup (New Order page)
//   - autofill of customer details when an old order is selected
// It never participates in dashboard stats, sales, Excel exports, labels or
// the normal spreadsheet flow.
// ---------------------------------------------------------------------------
import type { OldOrderRecord, OrderField, Settings } from '../types';
import { LS, storage } from './storage';
import { normalizePhone } from '../lib/normalizePhone';
import { resolveFieldColumn } from './spreadsheet/values';

export async function getOldOrders(): Promise<OldOrderRecord[]> {
  return (await storage.getState<OldOrderRecord[]>(LS.oldOrders)) ?? [];
}

/** Merge imported records into the store. Exact duplicate rows (same order
 *  number + whatsapp + name + address) already stored are skipped — but the
 *  same WhatsApp number with DIFFERENT old order numbers is always kept. */
export async function mergeOldOrders(records: OldOrderRecord[]): Promise<{ added: number; skipped: number; total: number }> {
  const existing = await getOldOrders();
  const seen = new Set(
    existing.map((r) => `${r.orderNumber.toLowerCase()}|${r.whatsapp.toLowerCase()}|${r.name.toLowerCase()}|${r.address.toLowerCase()}`),
  );
  let added = 0;
  let skipped = 0;
  for (const rec of records) {
    const key = `${rec.orderNumber.toLowerCase()}|${rec.whatsapp.toLowerCase()}|${rec.name.toLowerCase()}|${rec.address.toLowerCase()}`;
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

/** Fast lookup index: normalized WhatsApp → matching records (built once per
 *  data version — used by the debounced search so we never scan the whole
 *  dataset on every keystroke). */
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

/** All old orders belonging to a raw phone input (normalized compare). */
export function findOldByWhatsapp(index: Map<string, OldOrderRecord[]>, raw: string | undefined): OldOrderRecord[] {
  const n = normalizePhone(raw);
  if (n.length < 10) return [];
  return index.get(n) ?? [];
}

/** Extra-column values of a record that match a configured field (by field
 *  name / column header / mapping) — used to autofill custom fields. */
export function extraValueForField(rec: OldOrderRecord, field: OrderField, settings: Settings): string {
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
