// ---------------------------------------------------------------------------
// Dashboard product sales — computed straight from the existing order store
// (NO separate sales database). Callers pass the date-filtered orders first;
// this aggregates quantity sold / distinct order count / sales amount per
// product from the product lines saved with each order.
// ---------------------------------------------------------------------------
import type { Order, Product } from '../types';
import { roundMoney } from './format';

export interface ProductSalesRow {
  productId: string;
  /** current catalogue name (fallback: name saved on the order line) */
  name: string;
  /** current catalogue label name, when set */
  labelName?: string;
  qty: number;
  /** distinct orders containing this product */
  orderCount: number;
  /** sum of qty × line price across the window */
  sales: number;
  /** false when the product was deleted from the catalogue (old orders) */
  inCatalog: boolean;
}

export function computeProductSales(orders: Order[], products: Product[]): ProductSalesRow[] {
  // aggregate by product id from the order lines
  const agg = new Map<string, { name: string; qty: number; orderCount: number; sales: number }>();
  for (const o of orders) {
    for (const [pid, line] of Object.entries(o.products ?? {})) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      if (qty <= 0) continue;
      const rec = agg.get(pid) ?? { name: (line.labelName || line.productName || pid).trim(), qty: 0, orderCount: 0, sales: 0 };
      rec.qty += qty;
      rec.orderCount += 1;
      rec.sales = roundMoney(rec.sales + qty * price);
      agg.set(pid, rec);
    }
  }
  if (agg.size === 0) return [];

  const rows: ProductSalesRow[] = [];
  const seen = new Set<string>();
  // catalogue products keep the configured product order
  for (const p of products) {
    const a = agg.get(p.id);
    if (!a) continue;
    rows.push({
      productId: p.id,
      name: p.name,
      labelName: p.labelName || undefined,
      qty: a.qty,
      orderCount: a.orderCount,
      sales: a.sales,
      inCatalog: true,
    });
    seen.add(p.id);
  }
  // products sold but no longer in the catalogue (historical orders stay safe)
  for (const [pid, a] of agg) {
    if (seen.has(pid)) continue;
    rows.push({ productId: pid, name: a.name, qty: a.qty, orderCount: a.orderCount, sales: a.sales, inCatalog: false });
  }
  return rows.filter((r) => r.qty > 0);
}

/** Compact summary counts for the dashboard sub-line. */
export function salesSummary(orders: Order[]): { count: number; revenue: number; paid: number; cod: number; pending: number } {
  let revenue = 0;
  let paid = 0;
  let cod = 0;
  let pending = 0;
  for (const o of orders) {
    revenue = roundMoney(revenue + (Number(o.totalAmount) || 0));
    if (o.paymentStatus === 'Paid') paid += 1;
    else if (o.paymentStatus === 'COD') cod += 1;
    else if (o.paymentStatus === 'Pending' || o.paymentStatus === 'Failed') pending += 1;
  }
  return { count: orders.length, revenue, paid, cod, pending };
}
