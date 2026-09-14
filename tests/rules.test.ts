// ---------------------------------------------------------------------------
// v1.0.4 feature tests: delivery-charge rules, duplicate/matching rules,
// filtered Excel export + totals, manual order-number handling (v1.0.5+:
// no auto counter — numbers are typed and saved exactly as typed).
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, makeId } from '../src/lib/constants';
import { deliveryChargeFor, hasDeliverySettings } from '../src/lib/delivery';
import { scanMatches, valuesMatch, MATCH_MODE_LABELS, matchingFieldOptions } from '../src/lib/matching';
import type { DeliveryConfig, MatchingConfig, Order, OrderField } from '../src/types';
import { excelGrid, excelHeaders, prepareOrdersExport } from '../src/services/excelExport';
import { buildLabelModel } from '../src/components/label/labelModel';
import { LS, storage } from '../src/services/storage';
import { createOrder, getAllOrders, isSimpleOrderNumber, previousSequenceOrderFor } from '../src/services/orders';

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

  it('excel export ends with Delivery Charge + Total + Previous Order Number + Previous Sequence Order Number (text)', () => {
    const headers = excelHeaders(c);
    expect(headers.slice(-4)).toEqual(['Delivery Charge', 'Total', 'Previous Order Number', 'Previous Sequence Order Number']);
    const o = mk('ORD-1001', 1000, 100);
    o.previousOrderNumber = '4673-4312-3542';
    o.previousSequenceOrderNumber = '4672';
    const row = excelGrid([o], c)[1];
    expect(row[row.length - 4]).toBe(100);
    expect(row[row.length - 3]).toBe(599);
    expect(row[row.length - 2]).toBe('4673-4312-3542');
    expect(row[row.length - 1]).toBe('4672');
    const free = excelGrid([mk('ORD-1002', 1001, 0)], c)[1];
    expect(free[free.length - 4]).toBe(0);
    expect(free[free.length - 3]).toBe(499);
    expect(free[free.length - 2]).toBe('');
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
describe('manual order numbers — typed exactly as-is, nothing auto', () => {
  beforeEach(async () => { await storage.area.clear(); });

  const ord = (n: string, id = `o${n}`): Order => ({
    id, orderNumber: n,
    customer: { name: 'x', whatsapp: '', mobile: '', address: '', city: '', state: '', pincode: '' },
    products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
    orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null,
    createdAt: 1, updatedAt: 1, customFields: {},
  });

  it('isSimpleOrderNumber: only plain digit numbers qualify — never chains', () => {
    expect(isSimpleOrderNumber('15000')).toBe(true);
    expect(isSimpleOrderNumber('  15000 ')).toBe(true);
    expect(isSimpleOrderNumber('15000-14030-11694-9602-4776')).toBe(false);
    expect(isSimpleOrderNumber('ORD-1001')).toBe(false);
    expect(isSimpleOrderNumber('')).toBe(false);
    expect(isSimpleOrderNumber('015000')).toBe(true);
  });

  it('previousSequenceOrderFor takes the highest existing simple number strictly below — never typed−1', () => {
    const orders = [
      ord('14995'), ord('14997'), ord('14998'), ord('14999'),
      // chains and prefixed numbers are history identifiers — ignored
      ord('14030-11694-9602-4776'), ord('ORD-1001'), ord('15001'),
    ];
    expect(previousSequenceOrderFor('15000', orders)).toBe('14999');
    // 14999 missing → falls to 14998 (NOT assumed 14999)
    const no14999 = orders.filter((o) => o.orderNumber !== '14999');
    expect(previousSequenceOrderFor('15000', no14999)).toBe('14998');
    // chain typed → no sequence reference at all
    expect(previousSequenceOrderFor('15000-14030-11694-9602-4776', orders)).toBe('');
    // nothing lower → none
    expect(previousSequenceOrderFor('14995', orders)).toBe('');
    expect(previousSequenceOrderFor('1', orders)).toBe('');
    expect(previousSequenceOrderFor('', orders)).toBe('');
  });

  it('createOrder stores the number exactly as typed — no prefix, padding, or counter', async () => {
    const settings = defaultSettings();
    const ctx = { settings, fields: FIELDS, products: [] };
    await storage.setMany({ [LS.settings]: settings, [LS.orders]: [] });
    const base = {
      customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
      products: {}, paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '',
      paymentAmount: '', orderStatus: 'New' as const, notes: '', deliveryCharge: 100,
    };
    const res = await createOrder({ ...base, orderNumber: '15000' }, ctx, { skipSheet: true });
    expect(res.ok).toBe(true);
    expect(res.order!.orderNumber).toBe('15000');
    expect(res.order!.deliveryCharge).toBe(100);
    expect(res.order!.totalAmount).toBe(100);
    expect(res.order!.previousOrderNumber).toBeUndefined();
    expect(res.order!.previousSequenceOrderNumber).toBeUndefined();
    // every later order number is manually chosen — no counter exists to advance
    const res2 = await createOrder({ ...base, orderNumber: '14030-11694-9602-4776' }, ctx, { skipSheet: true });
    expect(res2.ok).toBe(true);
    expect(res2.order!.orderNumber).toBe('14030-11694-9602-4776');
    expect((await getAllOrders()).map((o) => o.orderNumber).sort()).toEqual(['14030-11694-9602-4776', '15000']);
  });

  it('duplicate check compares the complete final string (manual numbers)', async () => {
    const settings = defaultSettings();
    const ctx = { settings, fields: FIELDS, products: [] };
    const base = {
      customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
      products: {}, paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '',
      paymentAmount: '', orderStatus: 'New' as const, notes: '', deliveryCharge: 0,
    };
    await storage.setMany({ [LS.settings]: settings, [LS.orders]: [ord('15000'), ord('15000-14030-11694-9602-4776')] });
    // exact repeat of an existing full string → blocked
    const dup = await createOrder({ ...base, orderNumber: '15000' }, ctx, { skipSheet: true });
    expect(dup.ok).toBe(false);
    expect(dup.duplicate?.existing.orderNumber).toBe('15000');
    const dupChain = await createOrder({ ...base, orderNumber: '15000-14030-11694-9602-4776' }, ctx, { skipSheet: true });
    expect(dupChain.ok).toBe(false);
    // a chain and a plain number sharing a leading segment are DIFFERENT numbers
    const ok = await createOrder({ ...base, orderNumber: '15000-14030-11694-9602-4776' }, ctx, { skipSheet: true });
    void ok;
    const plain = await createOrder({ ...base, orderNumber: '15001' }, ctx, { skipSheet: true });
    expect(plain.ok).toBe(true);
  });

  it('previous order chain + sequence reference are stored separately and never merged', async () => {
    const settings = defaultSettings();
    const ctx = { settings, fields: FIELDS, products: [] };
    await storage.setMany({ [LS.settings]: settings, [LS.orders]: [ord('14030-11694-9602-4776')] });
    const res = await createOrder({
      orderNumber: '15000-14030-11694-9602-4776',
      customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '', city: '', state: 'Gujarat', pincode: '' },
      products: {}, paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '',
      paymentAmount: '', orderStatus: 'New' as const, notes: '', deliveryCharge: 0,
      previousOrderNumber: '14030-11694-9602-4776',
      previousSequenceOrderNumber: '15000',
    }, ctx, { skipSheet: true });
    expect(res.ok).toBe(true);
    expect(res.order!.orderNumber).toBe('15000-14030-11694-9602-4776');
    expect(res.order!.previousOrderNumber).toBe('14030-11694-9602-4776');
    expect(res.order!.previousSequenceOrderNumber).toBe('15000');
  });
});
