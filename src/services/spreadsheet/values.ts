// ---------------------------------------------------------------------------
// Spreadsheet mapping engine — decides which columns exist and what each
// column contains, so that:
//   fields (admin config)  -> spreadsheet COLUMNS
//   orders                 -> spreadsheet ROWS   (appended, never duplicated)
// Product quantity columns use one fixed column per product: "Night Cream Qty"
// ---------------------------------------------------------------------------
import type { Order, OrderField, Product, Settings } from '../../types';
import { orderTotal, productsSummary } from '../../lib/format';

/** Resolve the final spreadsheet column name for a bound field (respects custom mappings). */
export function resolveFieldColumn(field: OrderField, settings: Settings): string {
  const mapped = settings.mappings[field.id];
  if (mapped && mapped.trim()) return mapped.trim();
  return field.columnHeader?.trim() || field.name.trim();
}

/** Resolve the quantity column name for a product. */
export function productColumnName(product: Product, suffix = 'Qty'): string {
  return `${product.name.trim()} ${suffix}`.trim();
}

/** All columns the system wants on the sheet, in order. */
export function desiredColumns(
  fields: OrderField[],
  products: Product[],
  settings: Settings,
): string[] {
  const included = fields
    .filter((f) => (settings.includedFields ?? []).includes(f.id))
    .map((f) => resolveFieldColumn(f, settings));

  const includedProductIds = new Set(settings.products?.included ?? products.filter((p) => p.active).map((p) => p.id));
  const productCols = products
    .filter((p) => includedProductIds.has(p.id))
    .map((p) => productColumnName(p));

  const extras: string[] = ['Delivery Charge'];
  if (fields.some((f) => f.key === 'totalAmount' || f.name === 'Total')) {
    // Total is provided by that bound field's own column — don't duplicate.
  } else {
    extras.push('Total');
  }
  extras.push('Label Status', 'Printed At', 'Created At', 'Updated At');
  return [...included, ...productCols, ...extras];
}

/** Extra fixed system columns always created. */
export function systemColumns(): string[] {
  return ['Delivery Charge', 'Total', 'Label Status', 'Printed At', 'Created At', 'Updated At'];
}

interface Ctx {
  fields: OrderField[];
  products: Product[];
  settings: Settings;
}

function fieldByResolvedName(fields: OrderField[], settings: Settings, headerLower: string): OrderField | undefined {
  return fields.find((f) => resolveFieldColumn(f, settings).trim().toLowerCase() === headerLower);
}

function productByResolvedName(products: Product[], headerLower: string): Product | undefined {
  return products.find((p) => productColumnName(p).trim().toLowerCase() === headerLower);
}

/** Order value for a bound field id */
export function boundFieldValue(order: Order, field: OrderField): string | number | boolean {
  const key = field.key as string;
  const c = order.customer;
  switch (key) {
    case 'orderNumber': return order.orderNumber;
    case 'customerName': return c.name;
    case 'customerWhatsapp': return c.whatsapp;
    case 'customerMobile': return c.mobile;
    case 'customerAddress': return c.address;
    case 'customerCity': return c.city;
    case 'customerState': return c.state;
    case 'customerPincode': return c.pincode;
    case 'paymentStatus': return order.paymentStatus;
    case 'paymentMethod': return order.paymentMethod;
    case 'paymentAmount': return order.paymentAmount || '';
    case 'transactionId': return order.transactionId || '';
    case 'orderStatus': return order.orderStatus;
    case 'productsSummary': return productsSummary(order.products);
    case 'quantity': return Object.values(order.products).reduce((s, p) => s + p.quantity, 0);
    case 'totalAmount': return orderTotal(order);
    case 'createdAt': return formatDateTime(order.createdAt);
    case 'updatedAt': return formatDateTime(order.updatedAt);
    case 'notes': return order.notes || '';
    default:
      return order.customFields?.[field.id] ?? '';
  }
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Formats an amount column value (plain digits so the sheet can do math). */
function money(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

function cellValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return money(v);
  return v;
}

/**
 * Builds a full new row (aligned to the sheet's current headers).
 * Missing columns produce ''; product qty columns produce '0' when not ordered
 * (configurable default in #17: enter 0 or blank — we use 0 by default).
 */
export function buildRowForHeaders(
  headers: string[],
  order: Order,
  ctx: Ctx,
): string[] {
  const byName = new Map(headers.map((h, i) => [String(h ?? '').trim().toLowerCase(), i]));
  const row = headers.map(() => '');
  const setByName = (name: string, value: string) => {
    const idx = byName.get(String(name ?? '').trim().toLowerCase());
    if (idx !== undefined) row[idx] = value;
  };
  const setMoneyByName = (name: string, value: unknown) => {
    setByName(name, money(value));
  };

  for (const field of ctx.fields) {
    const name = resolveFieldColumn(field, ctx.settings);
    const val = boundFieldValue(order, field);
    if (field.key === 'totalAmount' || field.type === 'currency') setMoneyByName(name, val);
    else setByName(name, cellValue(val));
  }

  // Product qty columns
  const includedIds = new Set(ctx.settings.products?.included ?? ctx.products.map((p) => p.id));
  for (const p of ctx.products) {
    if (!includedIds.has(p.id)) continue;
    const name = productColumnName(p);
    const line = order.products[p.id];
    setMoneyByName(name, line ? line.quantity : 0);
  }

  // System columns
  setMoneyByName('Delivery Charge', order.deliveryCharge ?? 0);
  setMoneyByName('Total', orderTotal(order));
  setByName('Label Status', order.printed);
  setByName('Printed At', order.printedAt ? formatDateTime(order.printedAt) : '');
  setByName('Created At', formatDateTime(order.createdAt));
  setByName('Updated At', formatDateTime(order.updatedAt));

  return row;
}

/** Map an existing header name to a field/product it belongs to (for mapping UI). */
export function guessTarget(headers: string[], field: OrderField, products: Product[]): string | null {
  const want = resolveFieldColumn(field, { mappings: {} } as Settings) || field.name;
  // exact case-insensitive
  const exact = headers.find((h) => h.trim().toLowerCase() === want.toLowerCase());
  if (exact) return exact;
  // token overlap score
  const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  const wt = tokens(want);
  let best: string | null = null;
  let bestScore = 0;
  for (const h of headers) {
    const ht = tokens(h);
    let score = 0;
    wt.forEach((t) => { if (ht.has(t)) score++; });
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return bestScore >= 2 ? best : null;
}

/** Try to produce a reasonable settings.mappings for an existing sheet (auto-map). */
export function autoMapHeaders(
  headers: string[],
  fields: OrderField[],
  products: Product[],
): Record<string, string> {
  const mappings: Record<string, string> = {};
  const used = new Set<string>();
  const exact = new Set(headers.map((h) => h.trim().toLowerCase()).filter(Boolean));
  for (const f of fields) {
    const want = resolveFieldColumn(f, { mappings: {} } as Settings) || f.name;
    if (exact.has(want.trim().toLowerCase())) {
      // Field name already matches an existing header — mapping not needed.
      continue;
    }
    const g = guessTarget(headers, f, products);
    if (g && !used.has(g.toLowerCase()) && !exact.has(g.toLowerCase())) {
      mappings[f.id] = g;
      used.add(g.toLowerCase());
    }
  }
  return mappings;
}

/** Unique header names generator with suffix dedupe ("Address", "Address 2"). */
export function uniqueHeaders(base: string[], existing: string[]): string[] {
  const taken = new Set(existing.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const out: string[] = [];
  for (const raw of base) {
    const b = (raw || '').trim();
    if (!b) continue;
    if (!taken.has(b.toLowerCase()) && !out.some((o) => o.toLowerCase() === b.toLowerCase())) {
      out.push(b);
      taken.add(b.toLowerCase());
    } else {
      let i = 2;
      let cand = `${b} ${i}`;
      while (taken.has(cand.toLowerCase()) || out.some((o) => o.toLowerCase() === cand.toLowerCase())) {
        i += 1;
        cand = `${b} ${i}`;
      }
      out.push(cand);
      taken.add(cand.toLowerCase());
    }
  }
  return out;
}
