// ---------------------------------------------------------------------------
// Delivery charge rules — pure logic (no DOM/storage), unit-testable.
//
// A rule is a list of ANDed conditions on fields the order form collects
// (customer State/City/Pincode, any configured field, or the product
// subtotal "__amount"). Rules are tried top-to-bottom; the FIRST rule whose
// conditions all match wins. No match -> settings.delivery.defaultCharge.
// ---------------------------------------------------------------------------
import type { DeliveryConfig, DeliveryCondition, OrderField } from '../types';
import { roundMoney } from './format';

/** Reserved field id: the order's product subtotal (before delivery). */
export const AMOUNT_FIELD = '__amount';

const COLLECTABLE_EXCLUDE_KEYS = new Set([
  'productsSummary', 'quantity', 'totalAmount', 'createdAt', 'updatedAt', 'orderNumber',
]);

/** Fields the rule builder can test. '__amount' + every configured field the
 *  New Order form collects as text-like input. */
export function deliveryFieldOptions(fields: OrderField[]): { id: string; label: string }[] {
  const opts: { id: string; label: string }[] = [{ id: AMOUNT_FIELD, label: 'Order Amount (subtotal)' }];
  for (const f of fields) {
    if (COLLECTABLE_EXCLUDE_KEYS.has(String(f.key))) continue;
    if (f.type === 'product' || f.type === 'checkbox') continue;
    opts.push({ id: f.id, label: f.name || f.id });
  }
  return opts;
}

export function conditionFieldLabel(fieldId: string, fields: OrderField[]): string {
  if (fieldId === AMOUNT_FIELD) return 'Order Amount';
  const f = fields.find((x) => x.id === fieldId);
  return f?.name ?? 'Deleted field';
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Strip ₹, spaces and Indian grouping commas, keep digits/decimal. */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const t = String(raw ?? '').replace(/[₹,\s]/g, '');
  if (!NUMERIC.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Field value a condition is compared against. */
function fieldValue(cond: DeliveryCondition, input: DeliveryInput): string | number | boolean | undefined {
  if (cond.field === AMOUNT_FIELD) return input.subtotal;
  if (cond.field in input.byFieldId) return input.byFieldId[cond.field];
  return undefined;
}

function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function matchOne(cond: DeliveryCondition, actual: string | number | boolean | undefined): boolean {
  const want = text(cond.value);
  if (cond.field === AMOUNT_FIELD && cond.op !== 'contains') {
    // numeric comparisons on amounts
    const a = toNumber(actual);
    const b = toNumber(cond.value);
    switch (cond.op) {
      case 'equals': return a !== null && b !== null && a === b;
      case 'notEquals': return a !== null && b !== null && a !== b;
      case 'greaterThan': return a !== null && b !== null && a > b;
      case 'lessThan': return a !== null && b !== null && a < b;
      default: break;
    }
  }
  const a = text(actual);
  const al = a.toLowerCase();
  const wl = want.toLowerCase();
  switch (cond.op) {
    case 'equals': return a !== '' && al === wl;
    case 'notEquals': return want !== '' && al !== wl;
    case 'greaterThan':
    case 'lessThan': {
      const na = toNumber(a);
      const nb = toNumber(want);
      if (na === null || nb === null) return false;
      return cond.op === 'greaterThan' ? na > nb : na < nb;
    }
    case 'contains': return a !== '' && want !== '' && al.includes(wl);
    default: return false;
  }
}

export interface DeliveryInput {
  /** product subtotal (before delivery) */
  subtotal: number;
  /** values keyed by configured field id (bound fields use the same ids) */
  byFieldId: Record<string, string | number | boolean>;
}

/** Applies the first matching rule; falls back to the default charge. */
export function deliveryChargeFor(input: DeliveryInput, cfg?: DeliveryConfig): number {
  if (!cfg) return 0;
  for (const rule of cfg.rules ?? []) {
    const ok = (rule.conditions ?? []).every((c) => matchOne(c, fieldValue(c, input)));
    if (ok) return roundMoney(rule.charge);
  }
  return roundMoney(cfg.defaultCharge ?? 0);
}

/** True when the user has configured any delivery-charge behaviour at all
 *  (rules or a non-zero default). UI uses this to show/hide charge rows. */
export function hasDeliverySettings(cfg?: DeliveryConfig): boolean {
  if (!cfg) return false;
  return roundMoney(cfg.defaultCharge ?? 0) > 0 || (cfg.rules?.length ?? 0) > 0;
}

/** True when the order's stored delivery charge is non-zero. */
export function chargeVisible(deliveryCharge?: number): boolean {
  return roundMoney(deliveryCharge ?? 0) > 0;
}
