// ---------------------------------------------------------------------------
// End-to-end acceptance coverage for the complete automatic/manual save path.
// These tests use createOrder (the same service used by New Order), durable
// storage, and the Demo spreadsheet driver through SpreadsheetEngine.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import type { OldOrderRecord, Settings } from '../src/types';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { createOrder } from '../src/services/orders';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';

function customerOrder(whatsapp: string, name = 'Customer') {
  return {
    orderNumber: 'form-preview-is-not-authoritative',
    orderDate: '2026-09-07',
    customer: { name, whatsapp, mobile: '', address: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: {},
    paymentStatus: 'Pending' as const,
    paymentMethod: 'UPI' as const,
    transactionId: '',
    paymentAmount: '',
    orderStatus: 'New' as const,
    notes: '',
  };
}

function oldOrder(orderNumber: string, whatsapp: string, sourceRow: number): OldOrderRecord {
  return {
    id: `history-${sourceRow}`,
    orderNumber,
    name: `Imported ${sourceRow}`,
    whatsapp,
    address: 'Ahmedabad',
    importedAt: 100,
    sourceRow,
  };
}

function automaticSettings(nextOrderNumber = '15000'): { settings: Settings; fields: ReturnType<typeof makeDefaultSettingsWithTemplate>['fields'] } {
  const { settings, fields } = makeDefaultSettingsWithTemplate();
  settings.demoMode = true; // invokes the same SpreadsheetEngine append path
  settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
  settings.order = { ...settings.order, numberMode: 'automatic', nextOrderNumber };
  settings.products.included = [];
  return { settings, fields };
}

beforeEach(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
});

describe('complete order number workflow', () => {
  it('uses only the selected prior order in Automatic mode and writes the exact final text to the spreadsheet row', async () => {
    const { settings, fields } = automaticSettings('15000');
    const customerA = '6352808571';
    const customerB = '7000000002';
    await storage.setMany({
      [LS.settings]: settings,
      [LS.fields]: fields,
      [LS.products]: [],
      [LS.oldOrders]: [
        oldOrder('7000-3214-1234', customerA, 2),
        oldOrder('8800-4001', customerB, 3),
      ],
      [LS.setupDone]: true,
    });
    const ctx = { settings, fields, products: [] };

    // 1. A first-time customer gets just the next global text number.
    const first = await createOrder(customerOrder('9000000001', 'First customer'), ctx);
    expect(first).toMatchObject({ ok: true, synced: true, order: { orderNumber: '15000' } });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15001');

    // 2. Existing matching history is not guessed. The owner explicitly
    // chooses the desired imported record as the only history parent.
    const repeatA = await createOrder({ ...customerOrder(customerA, 'Customer A'), previousOrderNumber: '7000-3214-1234' }, ctx);
    expect(repeatA).toMatchObject({
      ok: true,
      order: {
        orderNumber: '15001-7000-3214-1234',
        previousOrderNumber: '7000-3214-1234',
      },
    });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15002');

    // The owner can instead select a current order as the next parent.
    const repeatAgainA = await createOrder({ ...customerOrder(customerA, 'Customer A'), previousOrderNumber: '15001-7000-3214-1234' }, ctx);
    expect(repeatAgainA).toMatchObject({
      ok: true,
      order: {
        orderNumber: '15002-15001-7000-3214-1234',
        previousOrderNumber: '15001-7000-3214-1234',
      },
    });

    // 3. A different customer selection is never mixed with customer A.
    const repeatB = await createOrder({ ...customerOrder(customerB, 'Customer B'), previousOrderNumber: '8800-4001' }, ctx);
    expect(repeatB).toMatchObject({
      ok: true,
      order: {
        orderNumber: '15003-8800-4001',
        previousOrderNumber: '8800-4001',
      },
    });
    expect(repeatB.order?.orderNumber).not.toContain('7000-3214-1234');
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15004');

    // 4. The DemoDriver uses SpreadsheetEngine/buildRowForHeaders, the same
    // row-building code used by Google Sheets. It retains exact final text.
    const grid = await new DemoDriver(settings).getGrid();
    const orderNumberColumn = grid[0].indexOf('Order Number');
    expect(orderNumberColumn).toBeGreaterThanOrEqual(0);
    expect(grid.slice(1).map((row) => row[orderNumberColumn])).toEqual([
      '15000',
      '15001-7000-3214-1234',
      '15002-15001-7000-3214-1234',
      '15003-8800-4001',
    ]);
  });

  it('keeps Manual saves literal, preserves the automatic counter, and honors a changed next number only on a later automatic save', async () => {
    const { settings, fields } = automaticSettings('15004');
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: [] });
    const ctx = { settings, fields, products: [] };

    // Switching mode leaves the configured automatic counter intact.
    const manual = (await storage.loadAll()).settings;
    manual.order = { ...manual.order, numberMode: 'manual' };
    await storage.set(LS.settings, manual);
    const manualOrder = await createOrder({
      ...customerOrder('9000000003', 'Manual customer'),
      orderNumber: 'MANUAL-15004-7000-3214-1234',
      previousOrderNumber: '7000-3214-1234',
    }, { settings: manual, fields, products: [] });
    expect(manualOrder).toMatchObject({
      ok: true,
      order: {
        orderNumber: 'MANUAL-15004-7000-3214-1234',
        previousOrderNumber: '7000-3214-1234',
      },
    });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15004');

    // Cancelling is represented by no createOrder call: the persisted counter
    // remains untouched. Changing it controls the next automatic save.
    const changed = (await storage.loadAll()).settings;
    changed.order = { ...changed.order, numberMode: 'automatic', nextOrderNumber: '00000000000000015000' };
    await storage.set(LS.settings, changed);
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('00000000000000015000');

    const afterChange = await createOrder(customerOrder('9000000004', 'Changed counter'), ctx);
    expect(afterChange).toMatchObject({ ok: true, order: { orderNumber: '00000000000000015000' } });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('00000000000000015001');
  });
});
