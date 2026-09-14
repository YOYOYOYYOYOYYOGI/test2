// ---------------------------------------------------------------------------
// Duplicate / matching rules — pure logic (no DOM/storage).
//
// Each enabled rule names a configured field + a comparison mode. Before an
// order is saved the form collects the same field values; any value that
// already exists in another order (per the rule's mode) raises a warning so
// duplicates are never created silently.
// ---------------------------------------------------------------------------
import type { MatchMode, MatchingRule, Order, OrderField } from '../types';

const COLLECTABLE_EXCLUDE_KEYS = new Set([
  'productsSummary', 'quantity', 'totalAmount', 'createdAt', 'updatedAt',
]);

/** Fields the user may pick as matching fields (anything the form collects). */
export function matchingFieldOptions(fields: OrderField[]): { id: string; label: string }[] {
  const opts: { id: string; label: string }[] = [];
  for (const f of [...fields].sort((a, b) => a.order - b.order)) {
    if (COLLECTABLE_EXCLUDE_KEYS.has(String(f.key))) continue;
    if (f.type === 'product' || f.type === 'checkbox') continue;
    opts.push({ id: f.id, label: f.name || f.id });
  }
  return opts;
}

export function matchingFieldLabel(fieldId: string, fields: OrderField[]): string {
  const f = fields.find((x) => x.id === fieldId);
  return f?.name ?? 'Deleted field';
}

export const MATCH_MODE_LABELS: Record<MatchMode, string> = {
  exact: 'Exact Match',
  insensitive: 'Case Insensitive Match',
  contains: 'Contains',
};

const eqText = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

/** True when `a` matches `b` under the given comparison mode. */
export function valuesMatch(a: unknown, b: unknown, mode: MatchMode): boolean {
  const av = eqText(a);
  const bv = eqText(b);
  if (!av || !bv) return false;
  switch (mode) {
    case 'exact': return av === bv;
    case 'insensitive': return av.toLowerCase() === bv.toLowerCase();
    case 'contains': return av.toLowerCase().includes(bv.toLowerCase()) || bv.toLowerCase().includes(av.toLowerCase());
    default: return false;
  }
}

export interface MatchHit {
  rule: MatchingRule;
  fieldId: string;
  fieldName: string;
  /** the new value that collided */
  value: string;
  /** existing orders carrying the same value */
  orders: Order[];
}

export interface MatchScanInput {
  fields: OrderField[];
  rules: MatchingRule[];
  orders: Order[];
  /** field id -> value entered on the form (raw strings) */
  values: Record<string, unknown>;
  /** order being edited — excluded from the scan */
  excludeOrderId?: string;
}

/** The order's own value for a configured field id (same source the
 *  sheet/label use: bound keys read from the order object, custom fields
 *  from order.customFields). */
export function orderFieldValue(o: Order, fieldId: string, fields: OrderField[]): unknown {
  const f = fields.find((x) => x.id === fieldId);
  if (!f) return o.customFields?.[fieldId] ?? '';
  const c = o.customer;
  switch (String(f.key)) {
    case 'orderNumber': return o.orderNumber;
    case 'customerName': return c.name;
    case 'customerWhatsapp': return c.whatsapp;
    case 'customerMobile': return c.mobile;
    case 'customerAddress': return c.address;
    case 'customerCity': return c.city;
    case 'customerState': return c.state;
    case 'customerPincode': return c.pincode;
    case 'paymentStatus': return o.paymentStatus;
    case 'paymentMethod': return o.paymentMethod;
    case 'paymentAmount': return o.paymentAmount ?? '';
    case 'transactionId': return o.transactionId ?? '';
    case 'orderStatus': return o.orderStatus;
    case 'notes': return o.notes ?? '';
    default: return o.customFields?.[fieldId] ?? '';
  }
}

/** Runs every ENABLED rule against the form's values + existing orders.
 *  Rules whose new value is empty are skipped. */
export function scanMatches(input: MatchScanInput): MatchHit[] {
  const { fields, rules, orders, values, excludeOrderId } = input;
  const hits: MatchHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const raw = values[rule.fieldId];
    const value = eqText(raw);
    if (!value) continue;
    const matched: Order[] = [];
    for (const o of orders) {
      if (o.id === excludeOrderId) continue;
      if (valuesMatch(orderFieldValue(o, rule.fieldId, fields), value, rule.mode)) matched.push(o);
    }
    if (matched.length > 0) {
      hits.push({
        rule,
        fieldId: rule.fieldId,
        fieldName: matchingFieldLabel(rule.fieldId, fields),
        value,
        orders: matched,
      });
    }
  }
  return hits;
}
