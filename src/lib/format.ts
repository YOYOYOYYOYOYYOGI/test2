// ---------------------------------------------------------------------------
// Validation helpers + friendly error messages (used by form + order service)
// ---------------------------------------------------------------------------
import type { FieldType, Product } from '../types';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from './constants';
import { formatMoney as fmtMoney } from './constants';

export interface FieldValidation {
  field: string;
  error: string;
  inlineKey?: string;
}

export function isEmpty(value: string | number | boolean | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** ₹ formatted with Indian digit grouping */
export const formatMoney = fmtMoney;
export const fmtQty = (n: number) => String(n);

/** Accepts 10-digit, +91-prefixed, and 0-prefixed Indian numbers; also 8-15 digit international */
export function normalizePhone(raw: string): string {
  let s = (raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s;
}

export function validatePhone(raw: string, label = 'Phone number'): string | null {
  if (isEmpty(raw)) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return `${label} must have 10–15 digits.`;
  }
  if (digits.length === 12 && digits.startsWith('91')) return null; // international +91 w/o leading +
  if (digits.length === 10) {
    if (!/^[6-9]/.test(digits)) return `Please enter a valid 10-digit ${label.toLowerCase()}.`;
    return null;
  }
  if (digits.length === 11 && digits.startsWith('91')) return null; // lenient
  return null;
}

export function validateRequired(raw: string, label: string): string | null {
  return isEmpty(raw) ? `${label} is required.` : null;
}

export function validateEmail(raw: string): string | null {
  if (isEmpty(raw)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim())) return 'Please enter a valid email address.';
  return null;
}

export function validatePincode(raw: string): string | null {
  if (isEmpty(raw)) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(digits)) return 'Pincode must be exactly 6 digits.';
  return null;
}

export function validateQuantity(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return 'Quantity must be at least 1.';
  if (!Number.isInteger(n)) return 'Quantity must be a whole number.';
  if (n > 9999) return 'Quantity is too large.';
  return null;
}

export function validateAmount(n: number): string | null {
  if (!Number.isFinite(n) || n < 0) return 'Amount cannot be negative.';
  if (n > 1e9) return 'Amount is too large.';
  return null;
}

export function validateOrderNumber(raw: string): string | null {
  if (isEmpty(raw)) return null;
  const s = raw.trim();
  if (s.length > 40) return 'Order number is too long (max 40 characters).';
  return null;
}

export function validateFieldValue(
  type: FieldType,
  value: string | number | boolean | undefined,
  label: string,
): string | null {
  if (type === 'number' || type === 'quantity') {
    if (isEmpty(value)) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    return null;
  }
  if (type === 'currency') {
    if (isEmpty(value)) return null;
    const n = Number(String(value).replace(/[₹,\s]/g, ''));
    if (!Number.isFinite(n)) return `${label} must be a valid amount.`;
    return null;
  }
  if (type === 'phone') {
    const msg = validatePhone(String(value ?? ''), label);
    if (msg) return msg;
    return null;
  }
  if (type === 'email') return validateEmail(String(value ?? ''));
  if (type === 'date') {
    if (isEmpty(value)) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${label} must be a valid date.`;
    return null;
  }
  return null;
}

/** Field-level validation of a bound form (order core fields). */
export function validateOrderCore(o: {
  orderNumber?: string;
  autoNumber: boolean;
  customer: { name: string; whatsapp: string; mobile: string; address: string; city: string; state: string; pincode: string };
  requiredChecks?: { name?: boolean; whatsapp?: boolean; mobile?: boolean; address?: boolean; city?: boolean; state?: boolean; pincode?: boolean; orderNumber?: boolean; paymentStatus?: boolean };
  paymentStatus?: string;
  paymentMethod?: string;
  hasProducts?: boolean;
  productsRequired?: boolean;
}): FieldValidation[] {
  const errors: FieldValidation[] = [];
  const c = o.requiredChecks ?? {};
  const push = (ok: boolean | undefined, key: string, error?: string) => {
    if (ok && error) errors.push({ field: key, error, inlineKey: key });
  };
  push(c.orderNumber, 'orderNumber', validateRequired(o.orderNumber ?? '', 'Order Number') ?? '');
  push(c.name, 'name', validateRequired(o.customer.name, 'Customer Name') ?? '');
  push(c.whatsapp, 'whatsapp', validatePhone(o.customer.whatsapp, 'WhatsApp number') ?? validateRequired(o.customer.whatsapp, 'WhatsApp Number') ?? '');
  push(c.mobile, 'mobile', validatePhone(o.customer.mobile, 'Mobile number') ?? '');
  push(c.address, 'address', validateRequired(o.customer.address, 'Address') ?? '');
  push(c.city, 'city', validateRequired(o.customer.city, 'City') ?? '');
  push(c.state, 'state', validateRequired(o.customer.state, 'State') ?? '');
  push(c.pincode, 'pincode', validatePincode(o.customer.pincode) ?? '');
  push(c.paymentStatus, 'paymentStatus', o.paymentStatus ? undefined : 'Payment Status is required.');
  if (o.paymentMethod && !PAYMENT_METHODS.includes(o.paymentMethod as never)) {
    errors.push({ field: 'paymentMethod', error: 'Select a valid payment method.', inlineKey: 'paymentMethod' });
  }
  if (o.paymentStatus && !PAYMENT_STATUSES.includes(o.paymentStatus as never)) {
    errors.push({ field: 'paymentStatus', error: 'Select a valid payment status.', inlineKey: 'paymentStatus' });
  }
  if (o.productsRequired && !o.hasProducts) {
    errors.push({ field: 'products', error: 'Add at least one product to the order.', inlineKey: 'products' });
  }
  return errors.filter((e) => e.error && e.error.length > 0);
}

/** Finds the duplicate order and builds the friendly duplicate message. */
export function duplicateMessage(orderNumber: string): string {
  return `Order ${orderNumber} already exists.`;
}

/** Total for an order */
export function computeTotal(products: Record<string, { quantity: number; price: number }>): number {
  return Object.values(products).reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.price) || 0), 0);
}

export function countUnits(products: Record<string, { quantity: number }>): number {
  return Object.values(products).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
}

export function productsSummary(products: Record<string, { quantity: number; productName: string }>): string {
  return Object.values(products)
    .map((p) => `${p.productName} x${p.quantity}`)
    .join(', ');
}

/** Format an order-number counter with padding, e.g. (1001, 4) -> "1001" */
export function padCounter(n: number, padding: number): string {
  if (!padding || padding <= 0) return String(n);
  return String(n).padStart(padding, '0');
}

export function isActiveProduct(p: Product): boolean {
  return p.active;
}
