// ---------------------------------------------------------------------------
// Automatic/manual order-number modes — global counter + customer history.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import type { OldOrderRecord, Settings } from '../src/types';
import { defaultSettings } from '../src/lib/constants';
import { createOrder, updateOrder } from '../src/services/orders';
import { LS, storage } from '../src/services/storage';

function settings(mode: 'automatic' | 'manual', nextOrderNumber = '15000'): Settings {
  const value = defaultSettings();
  value.order = { ...value.order, numberMode: mode, nextOrderNumber };
  return value;
}

function input(orderNumber: string, whatsapp = '6352808571') {
  return {
    orderNumber,
    orderDate: '2026-09-10',
    customer: { name: 'Patel', whatsapp, mobile: '', address: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: {},
    paymentStatus: 'Paid' as const,
    paymentMethod: 'UPI' as const,
    transactionId: '',
    paymentAmount: '',
    orderStatus: 'New' as const,
    notes: '',
  };
}

function old(orderNumber: string, whatsapp: string): OldOrderRecord {
  return {
    id: `old-${orderNumber}`,
    orderNumber,
    name: 'Patel', address: 'Ahmedabad', whatsapp, importedAt: 100, sourceRow: 2,
  };
}

beforeEach(async () => {
  await storage.area.clear();
});

describe('order number modes', () => {
  it('hydrates legacy settings without changing the established manual workflow', async () => {
    const legacy = defaultSettings() as unknown as { order: Record<string, unknown> };
    delete legacy.order.numberMode;
    delete legacy.order.nextOrderNumber;
    await storage.set(LS.settings, legacy);
    const hydrated = await storage.loadAll();
    expect(hydrated.settings.order.numberMode).toBe('manual');
    expect(hydrated.settings.order.nextOrderNumber).toBe('1');
  });

  it('uses only the explicitly selected complete order as automatic history, and advances the global text counter after saving', async () => {
    const conf = settings('automatic', '15000');
    const history = [old('6000', '6352808571'), old('7000-6000', '6352808571'), old('3214', '6352808571')];
    await storage.setMany({ [LS.settings]: conf, [LS.oldOrders]: history });
    const ctx = { settings: conf, fields: [], products: [] };

    // Existing matching history does not imply a suffix until the owner selects it.
    const noSelection = await createOrder(input('ignored'), ctx, { skipSheet: true });
    expect(noSelection.order).toMatchObject({ orderNumber: '15000', previousOrderNumber: undefined });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15001');

    // A selected imported order is used verbatim, including an existing chain.
    const selectedChain = await createOrder({ ...input('ignored'), previousOrderNumber: '7000-6000' }, ctx, { skipSheet: true });
    expect(selectedChain.order).toMatchObject({ orderNumber: '15001-7000-6000', previousOrderNumber: '7000-6000' });

    // Changing the selection before save changes just the suffix; it never picks
    // the latest current/imported order or expands all history.
    const changedSelection = await createOrder({ ...input('ignored'), previousOrderNumber: '3214' }, ctx, { skipSheet: true });
    expect(changedSelection.order).toMatchObject({ orderNumber: '15002-3214', previousOrderNumber: '3214' });
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15003');
    expect((await storage.loadAll()).oldOrders).toEqual(history);
  });

  it('keeps Previous Sequence Order separate from an explicitly selected customer chain', async () => {
    const manual = settings('manual', '15000');
    await storage.set(LS.settings, manual);
    await createOrder(input('14999', '9000000001'), { settings: manual, fields: [], products: [] }, { skipSheet: true });

    const automatic = settings('automatic', '15000');
    await storage.setMany({ [LS.settings]: automatic, [LS.oldOrders]: [old('7000-3214', '6352808571')] });
    const created = await createOrder({ ...input('ignored'), previousOrderNumber: '7000-3214' }, { settings: automatic, fields: [], products: [] }, { skipSheet: true });
    expect(created.order).toMatchObject({
      orderNumber: '15000-7000-3214',
      previousOrderNumber: '7000-3214',
      previousSequenceOrderNumber: '14999',
    });
    expect(created.order?.orderNumber).not.toContain('14999');

    const otherCustomer = await createOrder(input('ignored', '9876543210'), { settings: automatic, fields: [], products: [] }, { skipSheet: true });
    expect(otherCustomer.order?.orderNumber).toBe('15001');
  });

  it('persists an explicit previous-order selection found by Mobile Number', async () => {
    const conf = settings('automatic', '15000');
    const imported = old('7000-3214', '6352808571');
    imported.mobile = '91234 56780';
    await storage.setMany({ [LS.settings]: conf, [LS.oldOrders]: [imported] });
    const mobileOnly = input('ignored', '9999999999');
    mobileOnly.customer.mobile = '+91 91234-56780';
    const created = await createOrder({ ...mobileOnly, previousOrderNumber: imported.orderNumber }, { settings: conf, fields: [], products: [] }, { skipSheet: true });
    expect(created.order).toMatchObject({
      orderNumber: '15000-7000-3214',
      previousOrderNumber: '7000-3214',
    });
  });

  it('keeps manual numbers untouched and does not consume the automatic counter', async () => {
    const conf = settings('manual', '15000');
    await storage.set(LS.settings, conf);
    const created = await createOrder(input('MANUAL-ORDER-42'), { settings: conf, fields: [], products: [] }, { skipSheet: true });
    expect(created.order?.orderNumber).toBe('MANUAL-ORDER-42');
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15000');
  });

  it('does not consume a number until save and refuses an exact automatic duplicate without advancing', async () => {
    const manual = settings('manual', '15000');
    await storage.set(LS.settings, manual);
    await createOrder(input('15000', '9000000001'), { settings: manual, fields: [], products: [] }, { skipSheet: true });

    const automatic = settings('automatic', '15000');
    await storage.set(LS.settings, automatic);
    // Merely preparing/cancelling a form does nothing; saving this duplicate
    // is refused and leaves the counter for the owner to correct.
    const duplicate = await createOrder(input('ignored', '9876543210'), { settings: automatic, fields: [], products: [] }, { skipSheet: true });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.duplicate?.existing.orderNumber).toBe('15000');
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15000');
  });

  it('serializes near-simultaneous automatic saves and keeps edits from consuming a new number', async () => {
    const conf = settings('automatic', '15000');
    await storage.set(LS.settings, conf);
    const ctx = { settings: conf, fields: [], products: [] };
    const [a, b] = await Promise.all([
      createOrder(input('ignored', '9000000001'), ctx, { skipSheet: true }),
      createOrder(input('ignored', '9000000002'), ctx, { skipSheet: true }),
    ]);
    expect([a.order?.orderNumber, b.order?.orderNumber].sort()).toEqual(['15000', '15001']);
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15002');

    const edited = await updateOrder(a.order!.id, { ...input(a.order!.orderNumber, '9000000001'), notes: 'updated' }, ctx);
    expect(edited.ok).toBe(true);
    expect(edited.order?.orderNumber).toBe(a.order?.orderNumber);
    expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15002');
  });
});
