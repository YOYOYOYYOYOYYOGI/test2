// ---------------------------------------------------------------------------
// v1.0.4 feature tests: delivery-charge rules, duplicate/matching rules,
// filtered Excel export + totals, auto order-number robustness.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, makeId } from '../src/lib/constants';
import { deliveryChargeFor, hasDeliverySettings } from '../src/lib/delivery';
import { scanMatches, valuesMatch, MATCH_MODE_LABELS, matchingFieldOptions } from '../src/lib/matching';
import type { DeliveryConfig, MatchingConfig, Order, OrderField } from '../src/types';
import { excelGrid, excelHeaders, prepareOrdersExport } from '../src/services/excelExport';
import { buildLabelModel } from '../src/components/label/labelModel';
import { LS, storage } from '../src/services/storage';
import { createOrder, getAllOrders, nextCounter, normalizeCounter } from '../src/services/orders';

function field(id: string, name: string, key: string, order = 0, type: OrderField['type'] = 'text'): OrderField {
  return { id, name, type, required: false, key, order };
}

const FIELDS = [
  field('f-state', 'State', 'customerState', 0, 'dropdown'),
  field('f-txn', 'Transaction ID', 'transactionId', 1),
  field('f-wa', 'WhatsApp Number', 'customerWhatsapp', 2, 'phone'),
  field('f-cust', 'Customer ID', 'custom', 3),
];

function cfg(rules: DeliveryConfig['rules'], defaultCharge = 0): DeliveryConfig {
  return { defaultCharge, rules };
}

function cond(partial: Partial<{ field: string; op: DeliveryConfig['rules'][number]['conditions'][number]['op']; value: string }> = {}) {
  return { id: makeId(), field: '__amount', op: 'lessThan' as const, value: '600', ...partial };
}

// ---------------------------------------------------------------------------
describe('delivery charge rules', () => {
  const input = (over: Partial<{ subtotal: number; state: string }> = {}) => ({
    subtotal: 499,
    byFieldId: { 'f-state': over.state ?? 'Gujarat' },
    ...over,
  });

  it('charges 0 when no rules and no default (original behaviour)', () => {
    expect(deliveryChargeFor(input(), cfg([]))).toBe(0);
    expect(hasDeliverySettings(cfg([]))).toBe(false);
  });

  it('applies the default charge when nothing matches', () => {
    const rules = cfg([{ id: 'r1', charge: 100, conditions: [cond({ field: 'f-state', op: 'equals', value: 'Maharashtra' })] }], 150);
    expect(deliveryChargeFor(input(), rules)).toBe(150);
    expect(hasDeliverySettings(rules)).toBe(true);
  });

  it('first matching rule wins (priority order)', () => {
    const rules = cfg([
      { id: 'r1', charge: 100, conditions: [cond({ field: 'f-state', op: 'equals', value: 'Gujarat' }), cond()] },
      { id: 'r2', charge: 150, conditions: [cond({ field: 'f-state', op: 'notEquals', value: 'Gujarat' }), cond({ value: '1000' })] },
    ]);
    // Gujarat AND <600 → ₹100 (rule 1), even though rule 2 would also apply
    expect(deliveryChargeFor(input({ subtotal: 500 }), rules)).toBe(100);
    // Gujarat AND ≥600 → rule 1 fails → rule 2: Gujarat ≠ Gujarat false → default 0
    expect(deliveryChargeFor(input({ subtotal: 700 }), rules)).toBe(0);
    // Maharashtra AND <600 → rule 2 → ₹150
    expect(deliveryChargeFor(input({ subtotal: 500, state: 'Maharashtra' }), rules)).toBe(150);
  });

  it('compares order amounts numerically (₹ + Indian commas, equals/gt/lt)', () => {
    const eq = cfg([{ id: 'r', charge: 90, conditions: [cond({ op: 'equals', value: '₹1,200' })] }]);
    expect(deliveryChargeFor(input({ subtotal: 1200 }), eq)).toBe(90);
    expect(deliveryChargeFor(input({ subtotal: 1201 }), eq)).toBe(0);
    const lt = cfg([{ id: 'r', charge: 80, conditions: [cond({ value: '1,000.50' })] }]);
    expect(deliveryChargeFor(input({ subtotal: 1000.5 }), lt)).toBe(0); // not strictly less
    expect(deliveryChargeFor(input({ subtotal: 1000 }), lt)).toBe(80);
  });

  it('state equals is case-insensitive; not-equals also matches a blank state', () => {
    const eq = cfg([{ id: 'r', charge: 10, conditions: [cond({ field: 'f-state', op: 'equals', value: 'gujarat' })] }]);
    expect(deliveryChargeFor(input({ state: 'GUJARAT' }), eq)).toBe(10);
    const neq = cfg([{ id: 'r', charge: 20, conditions: [cond({ field: 'f-state', op: 'notEquals', value: 'Gujarat' })] }]);
    expect(deliveryChargeFor(input({ state: '' }), neq)).toBe(20); // blank ≠ Gujarat → rule applies
    expect(deliveryChargeFor(input({ state: 'Gujarat' }), neq)).toBe(0);
  });

  it('contains matches substrings; text >/< falls back to numeric compare', () => {
    const c = cfg([{ id: 'r', charge: 5, conditions: [cond({ field: 'f-state', op: 'contains', value: 'GUJ' })] }]);
    expect(deliveryChargeFor(input(), c)).toBe(5);
    expect(deliveryChargeFor(input({ state: 'Delhi' }), c)).toBe(0);
    const gt = cfg([{ id: 'r', charge: 7, conditions: [cond({ field: 'f-state', op: 'greaterThan', value: 'A' })] }]);
    expect(deliveryChargeFor(input(), gt)).toBe(0); // non-numeric text → no match
  });

  it('rounds charges to paise', () => {
    const rules = cfg([{ id: 'r', charge: 100.456, conditions: [cond()] }]);
    expect(deliveryChargeFor(input({ subtotal: 100 }), rules)).toBe(100.46);
  });
});

// ---------------------------------------------------------------------------
describe('duplicate / matching rules', () => {
  const rules: MatchingConfig = {
    rules: [
      { id: 'm1', fieldId: 'f-txn', mode: 'exact', enabled: true },
      { id: 'm2', fieldId: 'f-wa', mode: 'exact', enabled: false }, // disabled
      { id: 'm3', fieldId: 'f-cust', mode: 'insensitive', enabled: true },
      { id: 'm4', fieldId: 'f-state', mode: 'contains', enabled: true },
    ],
  };
  const mkOrder = (id: string, number: string, over: Partial<Order> = {}): Order => ({
    id, orderNumber: number,
    customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
    products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: 'TXN12345', paymentAmount: '',
    orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null,
    createdAt: 1, updatedAt: 1, customFields: { 'f-cust': 'Cust-001' },
    ...over,
  });
  const existing = [
    mkOrder('o1', 'ORD-1001'),
    mkOrder('o2', 'ORD-1002', { transactionId: 'TXN99999', customer: { ...mkOrder('o2', 'ORD-1002').customer, state: 'Maharashtra' }, customFields: { 'f-cust': 'cust-002' } }),
  ];

  it('comparison modes: exact vs insensitive vs contains', () => {
    expect(valuesMatch('TXN12345', 'TXN12345', 'exact')).toBe(true);
    expect(valuesMatch('TXN12345', 'txn12345', 'exact')).toBe(false);
    expect(valuesMatch('TXN12345', 'txn12345', 'insensitive')).toBe(true);
    expect(valuesMatch('TXN12345', 'TXN123', 'contains')).toBe(true); // new contains existing
    expect(valuesMatch('TXN1', 'TXN12345', 'contains')).toBe(true); // existing contains new
    expect(valuesMatch('', 'TXN12345', 'exact')).toBe(false); // empty never matches
    expect(MATCH_MODE_LABELS.exact).toBe('Exact Match');
  });

  it('scanMatches reports every enabled rule hit with the existing orders', () => {
    const hits = scanMatches({
      fields: FIELDS,
      rules: rules.rules,
      orders: existing,
      values: { 'f-txn': 'TXN12345', 'f-wa': '9876543210', 'f-cust': 'CUST-001', 'f-state': 'Maharashtra' },
    });
    expect(hits).toHaveLength(3); // txn exact, cust insensitive, state contains — WA disabled
    const txn = hits.find((h) => h.fieldId === 'f-txn')!;
    expect(txn.fieldName).toBe('Transaction ID');
    expect(txn.orders.map((o) => o.orderNumber)).toEqual(['ORD-1001']);
    const cust = hits.find((h) => h.fieldId === 'f-cust')!;
    expect(cust.orders.map((o) => o.orderNumber)).toEqual(['ORD-1001']); // CUST-001 ≈ Cust-001 (case ignored)
    expect(hits.find((h) => h.fieldId === 'f-wa')).toBeUndefined();
  });

  it('skips rules with empty form values and ignores the edited order itself', () => {
    const noHits = scanMatches({ fields: FIELDS, rules: rules.rules, orders: existing, values: {} });
    expect(noHits).toHaveLength(0);
    // editing ORD-1001 with its own txn must NOT flag itself
    const hits = scanMatches({
      fields: FIELDS, rules: rules.rules, orders: existing,
      values: { 'f-txn': 'TXN12345' }, excludeOrderId: 'o1',
    });
    expect(hits).toHaveLength(0);
  });

  it('offers every configured collectable field for matching', () => {
    const labels = matchingFieldOptions(FIELDS).map((o) => o.label);
    expect(labels).toEqual(['State', 'Transaction ID', 'WhatsApp Number', 'Customer ID']);
  });
});

// ---------------------------------------------------------------------------
describe('filtered Excel export + money columns', () => {
  function ctx() {
    const settings = defaultSettings();
    settings.includedFields = ['f-ord', 'f-name'];
    settings.products = { included: ['p1'] };
    return {
      settings,
      fields: [field('f-ord', 'Order Number', 'orderNumber', 0), field('f-name', 'Customer Name', 'customerName', 1)],
      products: [{ id: 'p1', name: 'Night Cream', sku: '', price: 499, active: true, createdAt: 1 }],
    };
  }
  const mk = (id: string, createdAt: number, delivery: number): Order => ({
    id, orderNumber: id,
    customer: { name: 'Rahul', whatsapp: '', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
    products: { p1: { productId: 'p1', productName: 'Night Cream', quantity: 1, price: 499 } },
    paymentStatus: 'Paid', paymentMethod: 'COD', transactionId: '', paymentAmount: '', orderStatus: 'New',
    notes: '', totalAmount: 499 + delivery, deliveryCharge: delivery, printed: 'Not Printed', printedAt: null,
    createdAt, updatedAt: createdAt, customFields: {},
  });
  const c = ctx();

  it('excel export ends with Delivery Charge + Total + Previous Order Number', () => {
    const headers = excelHeaders(c);
    expect(headers.slice(-3)).toEqual(['Delivery Charge', 'Total', 'Previous Order Number']);
    const o = mk('ORD-1001', 1000, 100);
    o.previousOrderNumber = '4673-4312-3542';
    const row = excelGrid([o], c)[1];
    expect(row[row.length - 3]).toBe(100);
    expect(row[row.length - 2]).toBe(599);
    expect(row[row.length - 1]).toBe('4673-4312-3542');
    const free = excelGrid([mk('ORD-1002', 1001, 0)], c)[1];
    expect(free[free.length - 3]).toBe(0);
    expect(free[free.length - 2]).toBe(499);
    expect(free[free.length - 1]).toBe('');
  });

  it('Download Filtered exports exactly the supplied (already filtered) rows', async () => {
    const orders = [mk('ORD-1001', 1, 0), mk('ORD-1002', 2, 0), mk('ORD-1003', 3, 0)];
    const res = prepareOrdersExport('filtered', [orders[1]], c, new Date(2026, 8, 7));
    expect(res.count).toBe(1);
    expect(res.filename).toBe('orders-filtered-2026-09-07.xlsx');
    const text = new TextDecoder().decode(new Uint8Array(await res.blob.arrayBuffer()));
    expect(text).toContain('ORD-1002');
    expect(text).not.toContain('ORD-1001');
  });

  it('label shows Subtotal + Delivery + Total when the order carries a charge', () => {
    const o = mk('ORD-1001', 1, 100);
    const model = buildLabelModel(o, c.settings, c.fields);
    expect(model.payment.subtotal).toBe('₹499');
    expect(model.payment.delivery).toBe('₹100');
    expect(model.payment.amount).toBe('₹599');
    const free = buildLabelModel(mk('ORD-1002', 1, 0), c.settings, c.fields);
    expect(free.payment.delivery).toBeUndefined();
    expect(free.payment.amount).toBe('₹499');
  });
});

// ---------------------------------------------------------------------------
describe('auto order number never repeats', () => {
  beforeEach(async () => { await storage.area.clear(); });

  const ord = (n: number, id = `o${n}`): Order => ({
    id, orderNumber: `ORD-${n}`,
    customer: { name: 'x', whatsapp: '', mobile: '', address: '', city: '', state: '', pincode: '' },
    products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
    orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null,
    createdAt: 1, updatedAt: 1, customFields: {},
  });

  it('counter stored as 1001 but ORD-1001…1003 already exist → next is 1004', async () => {
    const settings = defaultSettings(); // prefix ORD-, start 1001
    await storage.setMany({ [LS.settings]: settings, [LS.orders]: [ord(1001), ord(1002), ord(1003)], [LS.nextOrderNumber]: 1001 });
    expect(await nextCounter()).toBe(1004);
  });

  it('orders imported without a stored counter (fresh setup) still skip used numbers', async () => {
    await storage.set(LS.orders, [ord(1001), ord(1002), ord(1003), ord(1004)]);
    // no LS.nextOrderNumber stored → derived from orders
    expect(await nextCounter()).toBe(1005);
  });

  it('deleting an order never reuses its number (counter only moves forward)', async () => {
    await storage.setMany({ [LS.orders]: [ord(1001), ord(1002)], [LS.nextOrderNumber]: 1005 });
    expect(await nextCounter()).toBe(1005); // not 1003 — 1003-1005 were used before
    await storage.set(LS.orders, [ord(1001)]);
    expect(await nextCounter()).toBe(1005);
  });

  it('raising the starting number jumps the counter forward', async () => {
    const s = defaultSettings();
    s.order.startNumber = 2000;
    await storage.setMany({ [LS.settings]: s, [LS.orders]: [ord(1001)] });
    expect(await nextCounter()).toBe(2000);
  });

  it('createOrder increments past the just-saved number (ORD-1001 → next 1002)', async () => {
    const settings = defaultSettings();
    const ctx = { settings, fields: FIELDS, products: [] };
    await storage.setMany({ [LS.settings]: settings, [LS.orders]: [], [LS.nextOrderNumber]: 1001 });
    const input = {
      orderNumber: 'ORD-1001',
      customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
      products: {}, paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '',
      paymentAmount: '', orderStatus: 'New' as const, notes: '', deliveryCharge: 100,
    };
    const res = await createOrder(input, ctx, { skipSheet: true });
    expect(res.ok).toBe(true);
    expect(res.order!.orderNumber).toBe('ORD-1001');
    expect(res.order!.deliveryCharge).toBe(100);
    expect(res.order!.totalAmount).toBe(100);
    expect(await nextCounter()).toBe(1002);
    // and it must never hand out an existing number afterwards
    const nums = (await getAllOrders()).map((o) => o.orderNumber);
    for (let i = 0; i < 3; i += 1) {
      const n = await nextCounter();
      expect(nums.includes(`ORD-${n}`)).toBe(false);
      const again = await createOrder({ ...input, orderNumber: `ORD-${n}` }, ctx, { skipSheet: true });
      expect(again.ok).toBe(true);
      nums.push(`ORD-${n}`);
    }
  });

  it('normalizeCounter ignores other prefixes and non-numeric tails', () => {
    const s = defaultSettings();
    const orders = [ord(1001), { ...ord(1099, 'o2'), orderNumber: 'PO-1099' }, { ...ord(1003, 'o3'), orderNumber: 'ORD-ABC' }];
    // only ORD-1001 counts → max(start-1=1000, 1001) + 1
    expect(normalizeCounter(orders, s)).toBe(1002);
  });
});
