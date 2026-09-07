// ---------------------------------------------------------------------------
// Excel export — dynamic columns (fields + products), row values, today
// filtering, filenames and a real .xlsx byte check (ZIP + OOXML parts).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/constants';
import type { Order, OrderField, Product, Settings } from '../src/types';
import {
  excelColumns, excelGrid, excelHeaders, excelFilename, localDateStamp,
  ordersCreatedToday, prepareOrdersExport, todayRange,
} from '../src/services/excelExport';

function field(id: string, name: string, key: string, order: number, type: OrderField['type'] = 'text'): OrderField {
  return { id, name, type, required: false, key, order };
}

function ctx(over: { fields?: OrderField[]; products?: Product[]; settings?: Settings } = {}) {
  const settings = over.settings ?? (() => { const s = defaultSettings(); s.includedFields = ['f-ord', 'f-cust', 'f-wa', 'f-add', 'f-custom']; s.products = { included: ['p-nc', 'p-fs', 'p-dc'] }; return s; })();
  const fields = over.fields ?? [
    field('f-ord', 'Order Number', 'orderNumber', 0),
    field('f-cust', 'Customer Name', 'customerName', 1),
    field('f-wa', 'WhatsApp Number', 'customerWhatsapp', 2),
    field('f-add', 'Address', 'customerAddress', 3),
    { id: 'f-custom', name: 'Pincode', type: 'text', required: false, key: 'custom', order: 4 } as OrderField,
  ];
  const products = over.products ?? [
    { id: 'p-nc', name: 'Night Cream', sku: 'NC001', price: 499, active: true, createdAt: 1 },
    { id: 'p-fs', name: 'Face Serum', sku: 'FS001', price: 699, active: true, createdAt: 2 },
    { id: 'p-dc', name: 'Day Cream', sku: 'DC001', price: 449, active: true, createdAt: 3 },
  ];
  return { settings, fields, products };
}

function order(over: Partial<Order> & { id: string; orderNumber: string }): Order {
  return {
    customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: { 'p-nc': { productId: 'p-nc', productName: 'Night Cream', quantity: 2, price: 499 } },
    paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New',
    notes: '', totalAmount: 998, printed: 'Not Printed', printedAt: null, createdAt: 1000, updatedAt: 1000,
    customFields: { 'f-custom': '380001' },
    ...over,
  };
}

describe('dynamic Excel columns', () => {
  it('builds field columns (in field order) then one Qty column per product', () => {
    const headers = excelHeaders(ctx());
    expect(headers).toEqual(['Order Number', 'Customer Name', 'WhatsApp Number', 'Address', 'Pincode', 'Night Cream Qty', 'Face Serum Qty', 'Day Cream Qty']);
  });

  it('respects sheet header mappings and per-field columnHeader overrides', () => {
    const settings = defaultSettings();
    settings.includedFields = ['f-ord', 'f-cust'];
    settings.products = { included: [] };
    settings.mappings = { 'f-cust': 'Client Name' };
    const c = ctx({ settings, fields: [
      { ...field('f-ord', 'Order Number', 'orderNumber', 0), columnHeader: 'Order No.' },
      field('f-cust', 'Customer Name', 'customerName', 1),
    ], products: [] });
    expect(excelHeaders(c)).toEqual(['Order No.', 'Client Name']);
  });

  it('uses only included fields and falls back to active products when products.included is empty', () => {
    const settings = defaultSettings();
    settings.includedFields = ['f-cust'];
    settings.products = {}; // no explicit product columns -> active products are used
    const c = ctx({ settings, products: [
      { id: 'p1', name: 'Alpha', sku: '', price: 1, active: true, createdAt: 1 },
      { id: 'p2', name: 'Beta', sku: '', price: 2, active: false, createdAt: 2 },
    ] });
    expect(excelHeaders(c)).toEqual(['Customer Name', 'Alpha Qty']);
  });

  it('never emits duplicate columns even when names collide', () => {
    const settings = defaultSettings();
    settings.includedFields = ['f-cust'];
    settings.products = { included: ['p1'] };
    const c = ctx({ settings, products: [
      { id: 'p1', name: 'Customer Name', sku: '', price: 1, active: true, createdAt: 1 },
    ] });
    expect(excelHeaders(c)).toEqual(['Customer Name', 'Customer Name Qty']); // product col suffix keeps it unique
  });

  it('reflects new custom fields and product list changes automatically', () => {
    const base = ctx();
    expect(excelHeaders(base)).toContain('Pincode');
    expect(excelHeaders(base)).not.toContain('Email');
    const s2 = defaultSettings();
    s2.includedFields = [...(base.settings.includedFields ?? []), 'f-email'];
    s2.products = { included: [...(base.settings.products?.included ?? []), 'p-hm'] };
    const grown = ctx({
      settings: s2,
      fields: [...base.fields, field('f-email', 'Email', 'custom', 5)],
      products: [...base.products, { id: 'p-hm', name: 'Hair Mask', sku: '', price: 0, active: true, createdAt: 9 }],
    });
    const headers = excelHeaders(grown);
    expect(headers).toContain('Email');
    expect(headers).toContain('Hair Mask Qty');
    // product qty always right after all fields, in catalog order
    expect(headers.indexOf('Hair Mask Qty')).toBe(headers.length - 1);
  });
});

describe('Excel row values', () => {
  it('maps every order to one row with real numbers and zero-filled product qtys', () => {
    const c = ctx();
    const o = order({
      id: 'o1', orderNumber: 'ORD-1001',
      products: { 'p-nc': { productId: 'p-nc', productName: 'Night Cream', quantity: 2, price: 499 } },
    });
    const grid = excelGrid([o], c);
    expect(grid).toHaveLength(2); // header + 1 row
    const row = grid[1];
    expect(row[0]).toBe('ORD-1001');
    expect(row[1]).toBe('Rahul');
    expect(row[2]).toBe(9876543210); // phone as number
    expect(row[3]).toBe('12 MG Road');
    expect(row[4]).toBe(380001); // digit-only pincode becomes a number
    expect(row[5]).toBe(2); // Night Cream Qty
    expect(row[6]).toBe(0); // Face Serum Qty — zero fill
    expect(row[7]).toBe(0); // Day Cream Qty — zero fill
  });

  it('numeric handling: digit order numbers numeric, formatted amounts parsed, booleans Yes/No', () => {
    const settings = defaultSettings();
    settings.includedFields = ['f-no', 'f-amt', 'f-box'];
    settings.products = { included: [] };
    const fields = [
      field('f-no', 'Order', 'orderNumber', 0),
      { id: 'f-amt', name: 'Paid Amount', type: 'currency', required: false, key: 'custom', order: 1 } as OrderField,
      { id: 'f-box', name: 'Gift Wrap', type: 'checkbox', required: false, key: 'custom', order: 2 } as OrderField,
    ];
    const c = ctx({ settings, fields, products: [] });
    const o = order({
      id: 'o2', orderNumber: '1001',
      customFields: { 'f-amt': '₹1,200', 'f-box': true },
    });
    const row = excelGrid([o], c)[1];
    expect(row[0]).toBe(1001);
    expect(row[1]).toBe(1200);
    expect(row[2]).toBe('Yes');
  });

  it('orders are sorted oldest first, matching the spreadsheet layout', () => {
    const c = ctx();
    const a = order({ id: 'a', orderNumber: 'ORD-2', createdAt: 2000 });
    const b = order({ id: 'b', orderNumber: 'ORD-1', createdAt: 1000 });
    const grid = excelGrid([a, b], c);
    expect((grid[1] as unknown[])[0]).toBe('ORD-1');
    expect((grid[2] as unknown[])[0]).toBe('ORD-2');
  });
});

describe('today filter + filenames', () => {
  const NOW = new Date(2026, 8, 7, 14, 30).getTime(); // 2026-09-07 14:30 local

  it('todayRange covers the local calendar day', () => {
    const [start, end] = todayRange(NOW);
    expect(new Date(start).getDate()).toBe(7);
    expect(new Date(end).getDate()).toBe(8);
    expect(end - start).toBe(24 * 3600_000);
  });

  it('keeps only orders created today — excludes yesterday and tomorrow', () => {
    const [start, end] = todayRange(NOW);
    const t0 = new Date(2026, 8, 7, 0, 0, 1).getTime();
    const mk = (id: string, createdAt: number) => order({ id, orderNumber: id, createdAt });
    const list = [
      mk('today1', start + 1000),
      mk('today2', end - 1000),
      mk('yesterday', start - 1000),
      mk('tomorrow', end + 1000),
      mk('future', end + 86400_000),
    ];
    const got = ordersCreatedToday(list, NOW).map((o) => o.id).sort();
    expect(got).toEqual(['today1', 'today2']);
    expect(start).toBe(t0 - 1000); // sanity: range starts midnight 7th
  });

  it('filename uses the actual current date, zero padded', () => {
    expect(localDateStamp(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(localDateStamp(new Date(2026, 0, 2))).toBe('2026-01-02');
    expect(excelFilename('today', new Date(2026, 8, 7, 23, 59))).toBe('orders-2026-09-07.xlsx');
    expect(excelFilename('all')).toBe('all-orders.xlsx');
  });
});

describe('real .xlsx bytes', () => {
  it('produces a genuine xlsx (ZIP magic + OOXML parts) with one row per order', async () => {
    const c = ctx();
    const o1 = order({ id: 'o1', orderNumber: 'ORD-1001' });
    const o2 = order({ id: 'o2', orderNumber: 'ORD-1002', customer: { ...order({ id: 'x', orderNumber: 'x' }).customer, name: 'Priya' } });
    const res = prepareOrdersExport('all', [o1, o2], c, new Date(2026, 8, 7));
    expect(res.count).toBe(2);
    expect(res.filename).toBe('all-orders.xlsx');

    const bytes = new Uint8Array(await res.blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(500);
    // ZIP local file header magic
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('PK\x03\x04');
    // STORE (uncompressed) entries → the XML parts are readable in the bytes
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('<sheet name="Orders"');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Night Cream Qty');
    expect(text).toContain('ORD-1001');
    expect(text).toContain('ORD-1002');
  });

  it('empty day export reports zero rows but is still a valid workbook', () => {
    const c = ctx();
    const yesterday = order({ id: 'o9', orderNumber: 'ORD-9', createdAt: new Date(2026, 8, 6, 12).getTime() });
    const res = prepareOrdersExport('today', [yesterday], c, new Date(2026, 8, 7, 10));
    expect(res.count).toBe(0);
    expect(res.filename).toBe('orders-2026-09-07.xlsx');
    expect(res.blob.size).toBeGreaterThan(500);
  });
});
