// ---------------------------------------------------------------------------
// Identifier normalization for phone/WhatsApp numbers and order numbers.
//
// Phones & order numbers are IDENTIFIERS, never numbers:
//   - Excel scientific notation  "8.320336766E9"  → "8320336766"
//   - decimal noise               "8320336766.0"  → "8320336766"
//   - formatting                  "+91 83470 34843", "083470-34843" → "8347034843"
//   - order numbers keep hyphens: "4673-4312-3542" stays exactly as-is
// ---------------------------------------------------------------------------

/** If the trimmed raw text is a decimal/exponent form of a whole number
 *  (e.g. "3542.0", "8.347034843E9") return its plain integer string.
 *  Limited to ≤ 15 significant digits (beyond that the data is already
 *  un-recoverable — the original text is returned unchanged). */
function decimalWholeToInt(raw: string): string | null {
  const s = raw.trim();
  const core = s.replace(/[+()\s]/g, '');
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(core)) return null;
  if (!core.includes('.') && !/[eE]/.test(core)) return null; // already plain
  const n = Number(core);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null; // "8320336766.5" — leave for digit-strip
  const abs = Math.abs(n);
  if (abs >= 1e15) return null;
  return String(Math.trunc(n));
}

/** Normalize a phone/WhatsApp identifier to a plain digit string:
 *  removes spaces/hyphens/brackets/dots, converts scientific & decimal
 *  notation, drops a leading country code (+91 / 0) where sensible. */
export function normalizePhone(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const int = decimalWholeToInt(s);
  const d = int !== null
    ? int.replace(/[^\d]/g, '')
    : s.replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  if (d.length > 10) return d.slice(-10);
  return d;
}

/** True when the (normalized) number is long enough to search — 10 digits. */
export function phoneSearchable(raw: unknown): boolean {
  return normalizePhone(raw).length >= 10;
}

/**
 * Normalize an order-number identifier — ALWAYS a string, never numeric:
 *   - trims whitespace
 *   - strips a trailing ".0" / decimal zeros ("3542.0" → "3542")
 *   - converts whole scientific notation when lossless ("1.4043E4" → "14043")
 *   - KEEPS hyphens and letters exactly as typed ("4673-4312-3542")
 */
export function normalizeOrderNumber(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const int = decimalWholeToInt(s);
  if (int !== null) return int;
  // "3542.00" or "ORD.0"? — only strip a pure trailing decimal-zero run when
  // the integer part itself contains no hyphen/letter (a plain number)
  const m = /^(\d+)(?:\.0+)$/.exec(s);
  if (m) return m[1];
  return s;
}

/** Display form: order number + phone with nothing scientific ever shown. */
export function cleanIdentifierDisplay(raw: unknown, kind: 'phone' | 'order'): string {
  return kind === 'phone' ? normalizePhone(raw) : normalizeOrderNumber(raw);
}
