// ---------------------------------------------------------------------------
// Configuration helpers — default field templates, product/field validation
// ---------------------------------------------------------------------------
import type { OrderField, Product, Settings } from '../types';
import {
  DEFAULT_DEMO_PRODUCTS,
  DEFAULT_FIELD_TYPES,
  FIELD_KEY_HINTS,
  INDIAN_STATES,
  makeId,
  PAYMENT_METHODS,
  defaultSettings,
} from '../lib/constants';
import { computeTotal } from '../lib/format';

/** Field keys the form should not show as an input (auto-computed). */
export const COMPUTED_FIELD_KEYS = new Set(['productsSummary', 'quantity', 'totalAmount', 'createdAt', 'updatedAt']);

export function fieldTypeDefault(name: string) {
  return DEFAULT_FIELD_TYPES[name] ?? 'text';
}

export function fieldKeyHint(name: string): string {
  return FIELD_KEY_HINTS[name] ?? 'custom';
}

/** The default set of fields every new installation starts with. */
export function defaultFieldTemplate(): OrderField[] {
  const make = (name: string, required: boolean): OrderField => ({
    id: makeId(),
    name,
    type: fieldTypeDefault(name),
    required,
    key: fieldKeyHint(name),
    options: name === 'State' ? INDIAN_STATES.map((s, i) => ({ id: `opt-state-${i}`, label: s })) : name === 'Payment Method'
      ? PAYMENT_METHODS.map((m, i) => ({ id: `opt-pm-${i}`, label: m }))
      : undefined,
    order: 0,
  });
  const names: [string, boolean][] = [
    ['Order Number', true],
    ['Customer Name', true],
    ['WhatsApp Number', true],
    ['Mobile Number', false],
    ['Address', true],
    ['City', false],
    ['State', false],
    ['Pincode', false],
    ['Payment Status', true],
    ['Payment Method', false],
    ['Payment Amount', false],
    ['Transaction ID', false],
    ['Order Status', false],
    ['Notes', false],
  ];
  const fields = names.map(([n, req], i) => {
    const f = make(n, req);
    f.order = i;
    return f;
  });
  // idempotent (only meaningful ids) — regenerated for fresh installs only
  return fields;
}

/** Which fields should be excluded from the label by default. */
export function defaultLabelExclusions(): Set<string> {
  return new Set(['Notes', 'Transaction ID', 'Payment Amount', 'Order Number', 'Order Status']);
}

export function labelFieldIds(fields: OrderField[], settings: Settings): string[] {
  if (settings.labelFields && settings.labelFields.length > 0) return settings.labelFields;
  const exclusions = defaultLabelExclusions();
  return fields.filter((f) => !COMPUTED_FIELD_KEYS.has(f.key) && !exclusions.has(f.name)).map((f) => f.id);
}

export function makeDefaultSettingsWithTemplate(): { settings: Settings; fields: OrderField[] } {
  const settings = defaultSettings();
  const fields = defaultFieldTemplate();
  settings.includedFields = fields.map((f) => f.id);
  settings.labelFields = labelFieldIds(fields, settings);
  settings.products.included = DEFAULT_DEMO_PRODUCTS.map((p) => p.id);
  settings.demoMode = false;
  return { settings, fields };
}

export function buildProductLineName(p: Product): string {
  return p.labelName?.trim() || p.name.trim();
}

export function validateProductInput(p: { name: string; sku: string; price: number; labelName?: string }): string | null {
  if (!p.name.trim()) return 'Product name is required.';
  if (p.name.trim().length > 60) return 'Product name is too long (max 60 characters).';
  if (!Number.isFinite(p.price) || p.price < 0) return 'Price must be a positive number.';
  return null;
}

export function activeProducts(products: Product[]): Product[] {
  return products.filter((p) => p.active);
}

export { computeTotal };
