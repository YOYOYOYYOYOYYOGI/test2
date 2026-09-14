// ---------------------------------------------------------------------------
// Editable Order Date — calendar-safe storage, reporting and sheet/export flow
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import type { Order } from '../src/types';
import { formatOrderDate, localOrderDate, normalizeOrderDate, orderDateOf, parseOrderDate } from '../src/lib/orderDate';
import { ordersInWindow } from '../src/lib/dateRange';
import { excelGrid, excelHeaders, ordersCreatedToday } from '../src/services/excelExport';
import { bindOrderColumns, parseOrderRow } from '../src/services/dataExchange';
import { buildRowForHeaders } from '../src/services/spreadsheet/values';
import { defaultSettings } from '../src/lib/constants';
import { createOrder, updateOrder } from '../src/services/orders';
import { storage } from '../src/services/storage';
import { buildLabelModel } from '../src/components/label/labelModel';

function order(over: Partial<Order>): Order {
  return {
    id: 'o1', orderNumber: '15000', customer: { name: 'Patel', whatsapp: '6352808571', mobile: '', address: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New', notes: '', totalAmount: 600,
    printed: 'Not Printed', printedAt: null, createdAt: new Date(2026, 8, 13, 12).getTime(), updatedAt: 1, customFields: {},
    ...over,
  };
}

const ctx = () => ({ settings: defaultSettings(), fields: [], products: [] });

describe('order date calendar model', () => {
  it('stores and presents calendar dates without a timezone conversion', () => {
    expect(parseOrderDate('10/09/2026')).toBe('2026-09-10');
    expect(normalizeOrderDate('2026-09-10')).toBe('2026-09-10');
    expect(formatOrderDate('2026-09-10')).toBe('10/09/2026');
    expect(parseOrderDate('2026-02-30')).toBeNull();
    expect(localOrderDate(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-13');
  });

  it('uses the saved order date for dashboard windows, not creation timestamp', () => {
    const lateEntry = order({ orderDate: '2026-09-10' }); // created on 13 Sep
    const todayEntry = order({ id: 'o2', orderNumber: '15001', orderDate: '2026-09-13' });
    const now = new Date(2026, 8, 13, 9).getTime();
    expect(ordersInWindow([lateEntry, todayEntry], 'today', '', '', now).map((o) => o.id)).toEqual(['o2']);
    expect(ordersInWindow([lateEntry, todayEntry], 'date', '2026-09-10', '', now).map((o) => o.id)).toEqual(['o1']);
    expect(orderDateOf(lateEntry)).toBe('2026-09-10');
  });

  it('writes a safe text date to Sheets and a DD/MM/YYYY date to real Excel exports', () => {
    const saved = order({ orderDate: '2026-09-10' });
    const row = buildRowForHeaders(['Order Number', 'Order Date'], saved, ctx());
    expect(row).toEqual(['', "'10/09/2026"]);
    expect(excelHeaders(ctx())).toContain('Order Date');
    const grid = excelGrid([saved], ctx());
    expect(grid[1][grid[0].indexOf('Order Date')]).toBe('10/09/2026');
  });

  it('imports a Google/Excel DD/MM/YYYY order date as a calendar value', () => {
    const settings = defaultSettings();
    const bindings = bindOrderColumns(['Order Number', 'Order Date', 'Customer Name'], [], settings);
    const parsed = parseOrderRow(['15000', '10/09/2026', 'Patel'], bindings, 2);
    expect(parsed?.orderDate).toBe('2026-09-10');
  });

  it('uses Order Date for Today downloads while legacy rows remain compatible', () => {
    const now = new Date(2026, 8, 13, 12).getTime();
    const oldBusinessDate = order({ orderDate: '2026-09-10' });
    const todayBusinessDate = order({ id: 'o2', orderDate: '2026-09-13' });
    expect(ordersCreatedToday([oldBusinessDate, todayBusinessDate], now).map((o) => o.id)).toEqual(['o2']);
    // An upgraded historical order with no saved Order Date retains createdAt behaviour.
    expect(orderDateOf(order({ orderDate: undefined }))).toBe('2026-09-13');
  });

  it('persists a user-selected date on create and updates the same order on edit', async () => {
    await storage.area.clear();
    const context = ctx();
    const input = {
      orderNumber: '15000', orderDate: '2026-09-10', customer: order({}).customer, products: {},
      paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '', paymentAmount: '',
      orderStatus: 'New' as const, notes: '',
    };
    const created = await createOrder(input, context, { skipSheet: true });
    expect(created.order?.orderDate).toBe('2026-09-10');
    const updated = await updateOrder(created.order!.id, { ...input, orderDate: '2026-09-12' }, context);
    expect(updated.order?.id).toBe(created.order?.id);
    expect(updated.order?.orderDate).toBe('2026-09-12');
  });

  it('does not silently replace a supplied invalid date with today', async () => {
    await storage.area.clear();
    await expect(createOrder({
      orderNumber: '15002', orderDate: '2026-02-30', customer: order({}).customer, products: {},
      paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New', notes: '',
    }, ctx(), { skipSheet: true })).rejects.toThrow('Order Date must be a valid calendar date.');
  });

  it('feeds the saved date into a label when the existing field-based label design includes it', () => {
    const saved = order({ orderDate: '2026-09-10' });
    const fields = [{ id: 'date', name: 'Order Date', type: 'date' as const, required: true, key: 'orderDate', order: 0 }];
    const model = buildLabelModel(saved, { ...defaultSettings(), labelFields: ['date'] }, fields);
    expect(model.lines).toContainEqual(expect.objectContaining({ label: 'Order Date', value: '10/09/2026' }));
  });
});
