// ---------------------------------------------------------------------------
// Phone / WhatsApp number normalization for matching (old-customer lookup and
// matching rules). Ignore spaces, hyphens, brackets, dots, a leading + and a
// leading country code where sensible:
//   "+91 83470 34843" and "8347034843" both become "8347034843"
// ---------------------------------------------------------------------------
export function normalizePhone(raw: unknown): string {
  const d = String(raw ?? '').replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  if (d.length > 10) return d.slice(-10);
  return d;
}

/** True when the (normalized) number is long enough to search — 10 digits. */
export function phoneSearchable(raw: unknown): boolean {
  return normalizePhone(raw).length >= 10;
}
