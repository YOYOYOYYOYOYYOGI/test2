// ---------------------------------------------------------------------------
// Dashboard date-filter helpers — pure functions (no DOM/storage).
//
// Windows are half-open [start, end) in LOCAL time, computed from each
// order's real createdAt timestamp.
// ---------------------------------------------------------------------------
import type { Order } from '../types';
import { startOfDay } from './constants';

export type DashRange = 'today' | 'tomorrow' | 'yesterday' | '7d' | '30d' | 'date' | 'range';

export const DASH_RANGE_OPTIONS: { id: DashRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'date', label: 'Custom date' },
  { id: 'range', label: 'Custom date range' },
];

export function isDashCustom(r: DashRange): boolean {
  return r === 'date' || r === 'range';
}

export function ymd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse an <input type="date"> value as a LOCAL day start (ms). */
export function dayStart(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** [start, end) window for the selected filter; null when inputs are missing. */
export function dashWindow(range: DashRange, fromD: string, toD: string, now: number = Date.now()): [number, number] | null {
  const day = 86400000;
  const todayStart = startOfDay(now);
  switch (range) {
    case 'today': return [todayStart, todayStart + day];
    case 'tomorrow': return [todayStart + day, todayStart + 2 * day];
    case 'yesterday': return [todayStart - day, todayStart];
    case '7d': return [todayStart - 7 * day, todayStart + day];
    case '30d': return [todayStart - 30 * day, todayStart + day];
    case 'date': {
      const f = dayStart(fromD || toD);
      return f === null ? null : [f, f + day];
    }
    case 'range': {
      const f = dayStart(fromD);
      if (f === null) return null;
      const t = dayStart(toD);
      const end = t === null ? f + day : t + day;
      return end > f ? [f, end] : [f, f + day];
    }
    default: return null;
  }
}

/** Orders inside the window (createdAt is the order's real creation time). */
export function ordersInWindow(orders: Order[], range: DashRange, fromD: string, toD: string, now: number = Date.now()): Order[] {
  const win = dashWindow(range, fromD, toD, now);
  if (!win) return [];
  return orders.filter((o) => {
    const ts = o.createdAt ?? 0;
    return ts >= win[0] && ts < win[1];
  });
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Human label for the filter, e.g. "Today", "Yesterday", "05–07 Sep 2026". */
export function dashRangeLabel(range: DashRange, fromD: string, toD: string, now: number = Date.now()): string {
  const opts = DASH_RANGE_OPTIONS.find((o) => o.id === range);
  if (!isDashCustom(range)) return opts?.label ?? 'All';
  const f = dayStart(fromD || toD);
  if (f === null) return opts?.label ?? 'Custom';
  if (range === 'date' || !toD) return fmtDate(f);
  const t = dayStart(toD);
  return t === null || t <= f ? fmtDate(f) : `${fmtDate(f)} – ${fmtDate(t)}`;
}
