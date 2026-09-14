// ---------------------------------------------------------------------------
// Order-date helpers
//
// An order date is a calendar day, not a timestamp.  Store it as YYYY-MM-DD
// and never parse it through UTC; this keeps 10/09/2026 as 10/09/2026 in
// every timezone.  Legacy orders without the field retain their old
// createdAt-based reporting behaviour through orderDateOf().
// ---------------------------------------------------------------------------
import type { Order } from '../types';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today as a local calendar value suitable for <input type="date">. */
export function localOrderDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True only for a real local calendar date in YYYY-MM-DD format. */
export function isOrderDate(value: string | null | undefined): boolean {
  const m = YMD.exec(String(value ?? ''));
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Parse safe ISO or user-facing DD/MM/YYYY text without timezone conversion. */
export function parseOrderDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().replace(/^'/, ''); // Sheets text marker
  if (isOrderDate(raw)) return raw;
  const dmy = DMY.exec(raw);
  if (dmy) {
    const candidate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    if (isOrderDate(candidate)) return candidate;
  }
  return null;
}

/**
 * Convert safe ISO or user-facing DD/MM/YYYY text to YYYY-MM-DD. Invalid
 * input intentionally falls back to the supplied local calendar day.
 */
export function normalizeOrderDate(value: string | null | undefined, fallback: string = localOrderDate()): string {
  return parseOrderDate(value) ?? (isOrderDate(fallback) ? fallback : localOrderDate());
}

/** DD/MM/YYYY display text without Date/UTC conversion. */
export function formatOrderDate(value: string | null | undefined, fallback?: string): string {
  const ymd = parseOrderDate(value) ?? parseOrderDate(fallback);
  if (!ymd) return '—';
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

/**
 * Business date for a saved order. Older rows did not have orderDate; use the
 * historical creation day only for those rows so upgrading never drops them
 * from existing reports.
 */
export function orderDateOf(order: Pick<Order, 'orderDate' | 'createdAt'>): string {
  if (isOrderDate(order.orderDate)) return order.orderDate!;
  return localOrderDate(new Date(order.createdAt));
}

/** Local midnight for a safe YYYY-MM-DD value. Useful only for date windows. */
export function orderDateStart(value: string): number {
  const date = normalizeOrderDate(value);
  return new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))).getTime();
}
