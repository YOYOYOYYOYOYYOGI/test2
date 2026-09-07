// ---------------------------------------------------------------------------
// Single source of label typography + logo sizing.
// Used by the ONE label renderer (<LabelSheetComponent>) which drives the
// preview, the print page and the PDF download — so all three always agree.
// ---------------------------------------------------------------------------
import type { LabelConfig, LabelFontKey } from '../../types';

export const LABEL_FONT_KEYS: LabelFontKey[] = [
  'businessName',
  'orderNumber',
  'customerName',
  'customerDetails',
  'address',
  'productName',
  'productQty',
  'payment',
  'amount',
  'footer',
];

export const LABEL_FONT_LABELS: Record<LabelFontKey, string> = {
  businessName: 'Business name',
  orderNumber: 'Order number',
  customerName: 'Customer name',
  customerDetails: 'Customer details',
  address: 'Address',
  productName: 'Product name',
  productQty: 'Product quantity',
  payment: 'Payment',
  amount: 'Amount / total',
  footer: 'Footer',
};

/** Font families offered in Settings. Keep them safe everywhere (DOM + print). */
export const LABEL_FONT_FAMILIES = ['Inter', 'Arial', 'Helvetica', 'Roboto', 'sans-serif'] as const;

const MIN_GLOBAL = 8;
const MAX_GLOBAL = 30;
const MIN_PART = 6;
const MAX_PART = 72;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Which font family to use (falls back to Inter when the stored one is odd). */
export function labelFontFamily(cfg: Pick<LabelConfig, 'fontFamily'>): string {
  const f = cfg.fontFamily?.trim();
  return (LABEL_FONT_FAMILIES as readonly string[]).includes(f ?? '') ? (f as string) : 'Inter';
}

/** CSS font stack: preferred family first, then safe fallbacks. */
export function labelFontStack(cfg: Pick<LabelConfig, 'fontFamily'>): string {
  const family = labelFontFamily(cfg);
  const stack = family === 'sans-serif' ? "'sans-serif'" : `'${family}', 'Arial', 'Helvetica', sans-serif`;
  return stack;
}

/** Global base size (px). */
export function labelGlobalFontSize(cfg: Pick<LabelConfig, 'fontSize'>): number {
  const v = cfg.fontSize ?? 13;
  return clamp(v, MIN_GLOBAL, MAX_GLOBAL);
}

/** Effective size for one part: per-part override when set, else the global value. */
export function labelFontSize(cfg: Pick<LabelConfig, 'fontSize' | 'fontSizes'>, key: LabelFontKey): number {
  const override = cfg.fontSizes?.[key];
  if (override !== undefined && Number.isFinite(override)) return clamp(override, MIN_PART, MAX_PART);
  return labelGlobalFontSize(cfg);
}
