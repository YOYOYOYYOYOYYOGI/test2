// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// v1.0.6 tests — old customer/order import system:
//   phone normalization, CSV/.xlsx parsing + validation, record conversion &
//   dedupe rules, separate storage, lookup index, New Order flow (autofill +
//   composed order number + previousOrderNumber), old-data separation.
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { defaultSettings } from '../src/lib/constants';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { normalizeOrderNumber, normalizePhone, normalizePhoneText, phoneSearchable } from '../src/lib/normalizePhone';
import {
  parseDelimitedText, scanHeaders, missingRequiredColumns, rowsToOldRecords, fileToRows, parseXlsxRows,
} from '../src/lib/tableImport';
import { xlsxBlob } from '../src/lib/xlsx';
import { currentOrderToEntry, entryChainValue, findOldByWhatsapp, getOldOrders, indexOldOrders, mergeOldOrders, oldRecordToEntry } from '../src/services/oldOrders';
import { nextCounter, normalizeCounter } from '../src/services/orders';
import type { OldOrderRecord, Order, Product } from '../src/types';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('phone normalization', () => {
  it('ignores spaces, hyphens, brackets, dots, leading +', () => {
    expect(normalizePhone('+91 83470 34843')).toBe('8347034843');
    expect(normalizePhone('8347034843')).toBe('8347034843');
    expect(normalizePhone('083470-34843')).toBe('8347034843');
    expect(normalizePhone('(+91) 8347034843')).toBe('8347034843');
    expect(normalizePhone('91 83470 34843')).toBe('8347034843');
    expect(normalizePhone('91-83470-34843')).toBe('8347034843');
  });
  it('converts scientific notation and decimal noise back to plain digits', () => {
    expect(normalizePhone('8.320336766E9')).toBe('8320336766');
    expect(normalizePhone('8.347034843E9')).toBe('8347034843');
    expect(normalizePhone('9.510864699E9')).toBe('9510864699');
    expect(normalizePhone('8347034843.0')).toBe('8347034843');
    expect(normalizePhone('83203 36766')).toBe('8320336766');
    expect(normalizePhone('+91 8320336766')).toBe('8320336766');
  });

  it('order numbers are identifiers — always strings, never 3542.0 or E9', () => {
    expect(normalizeOrderNumber('3542.0')).toBe('3542');
    expect(normalizeOrderNumber('3542.00')).toBe('3542');
    expect(normalizeOrderNumber('3542')).toBe('3542');
    expect(normalizeOrderNumber('4673-4312-3542')).toBe('4673-4312-3542');
    expect(normalizeOrderNumber('14043-12781-12046-10270-8699-6136-5347-4673-4312-3542')).toBe('14043-12781-12046-10270-8699-6136-5347-4673-4312-3542');
    expect(normalizeOrderNumber(' 3542 ')).toBe('3542');
    expect(normalizeOrderNumber('ORD-3542')).toBe('ORD-3542');
  });

  it('search only starts once 10 digits exist', () => {
    expect(phoneSearchable('')).toBe(false);
    expect(phoneSearchable('83470')).toBe(false);
    expect(phoneSearchable('834703484')).toBe(false);
    expect(phoneSearchable('8347034843')).toBe(true);
    expect(phoneSearchable('+91 8347034843')).toBe(true);
  });
});

describe('CSV parsing + validation', () => {
  it('parses quotes, embedded commas/newlines and skips empty trailing rows', () => {
    const csv = `Order Number,Name,Address,Whatsapp Number
"4673-4312-3542","Patel, Poonam","A-601, Yogi Platina
Sargasan","8347034843"
3542,Patel Poonam,"A-204, Aarna",6358800465

`;
    const rows = parseDelimitedText(csv);
    expect(rows).toHaveLength(3); // header + 2 (empty line dropped)
    expect(rows[0]).toEqual(['Order Number', 'Name', 'Address', 'Whatsapp Number']);
    expect(rows[1][0]).toBe('4673-4312-3542');
    expect(rows[1][1]).toBe('Patel, Poonam');
    expect(rows[1][2]).toBe('A-601, Yogi Platina\nSargasan');
    expect(rows[1][3]).toBe('8347034843');
  });

  it('accepts header synonyms; reports missing required columns by canonical name', () => {
    const ok = scanHeaders([['order no', 'Customer Name', 'Full Address', 'whatsapp']]);
    expect(ok.index.orderNumber).toBe(0);
    expect(ok.index.name).toBe(1);
    expect(ok.index.address).toBe(2);
    expect(ok.index.whatsapp).toBe(3);
    expect(missingRequiredColumns(ok)).toEqual([]);

    const bad = scanHeaders([['Order Number', 'Name', 'Address']]);
    expect(missingRequiredColumns(bad)).toEqual(['Whatsapp Number']);

    const bad2 = scanHeaders([['Name', 'Address', 'Whatsapp Number']]);
    expect(missingRequiredColumns(bad2)).toEqual(['Order Number']);
  });

  it('skips empty rows and rows without order number/whatsapp; dedupes exact rows only', () => {
    const rows = parseDelimitedText(`Order Number,Name,Address,Whatsapp Number
4673-4312-3542,Patel Poonam,A-601,8347034843
3542,Patel Poonam,A-204,8347034843
7489,Trupti Joshi,A-204,6358800465
4673-4312-3542,Patel Poonam,A-601,8347034843
,,,
9999,,X, 
,Missing Order,,8347000000
7777,No phone,,`);
    const scan = scanHeaders(rows);
    const { records, skipped } = rowsToOldRecords(rows, scan);
    // skipped: dup row, empty row, no-order row, no-whatsapp rows (2)
    expect(skipped).toBe(5);
    expect(records).toHaveLength(3);
    // same whatsapp + different order numbers all kept (never auto-merged)
    expect(records.filter((r) => r.whatsapp === '8347034843')).toHaveLength(2);
    expect(records.map((r) => r.orderNumber)).toEqual(['4673-4312-3542', '3542', '7489']);
    // name stays canonical even when the Name column is empty
    expect(records[0].name).toBe('Patel Poonam');
    expect(records[0].sourceRow).toBe(2);
  });

  it('import normalizes scientific phones and .0 order numbers before storing', () => {
    const rows = parseDelimitedText(`Order Number,Name,Address,Whatsapp Number
3542.0,Patel Poonam,A-601,8.347034843E9
4673-4312-3542,Patel Poonam,A-601,8347034843`);
    const scan = scanHeaders(rows);
    const { records } = rowsToOldRecords(rows, scan);
    expect(records[0].orderNumber).toBe('3542'); // NOT 3542.0
    expect(records[0].whatsapp).toBe('8347034843'); // NOT 8.347034843E9
    expect(records[1].orderNumber).toBe('4673-4312-3542');
    expect(records[1].whatsapp).toBe('8347034843');
    // both rows kept — order numbers differ
    expect(records).toHaveLength(2);
  });

  it('keeps extra columns for custom-field autofill', () => {
    const rows = parseDelimitedText(`Order Number,Name,Address,Whatsapp Number,City,State,Pincode,Email
1,A,B,9000000001,Ahmedabad,Gujarat,380001,a@b.c`);
    const scan = scanHeaders(rows);
    const { records } = rowsToOldRecords(rows, scan);
    expect(records[0].extras).toEqual({ City: 'Ahmedabad', State: 'Gujarat', Pincode: '380001', Email: 'a@b.c' });
  });
});

describe('.xlsx parsing (real workbook bytes)', () => {
  it('round-trips a workbook written by the app reader/writer pair', async () => {
    const grid = [
      ['Order Number', 'Name', 'Address', 'Whatsapp Number', 'City'],
      ['4673-4312-3542', 'Patel Poonam', 'A-601, Yogi Platina', '8347034843', 'Gandhinagar'],
      ['3542', 'Trupti Joshi', 'A-204', 6358800465, 'Ahmedabad'], // numeric phone cell
    ];
    const blob = xlsxBlob(grid as (string | number)[][], { sheetName: 'Old' });
    const buf = await blob.arrayBuffer();
    const rows = await parseXlsxRows(buf);
    expect(rows).toHaveLength(3); // header + 2 data rows
    expect(rows[0][0]).toBe('Order Number');
    expect(rows[1][0]).toBe('4673-4312-3542');
    expect(rows[1][3]).toBe('8347034843');
    expect(rows[2][1]).toBe('Trupti Joshi');
    expect(rows[2][3]).toBe('6358800465'); // numeric cell read back as string
    // full import round trip through the same pipeline
    const scan = scanHeaders(rows);
    expect(missingRequiredColumns(scan)).toEqual([]);
    const { records } = rowsToOldRecords(rows, scan);
    expect(records).toHaveLength(2);
    expect(records[0].orderNumber).toBe('4673-4312-3542');
  });

  it('fileToRows routes real xlsx magic bytes to the xlsx parser', async () => {
    const blob = xlsxBlob([['Order Number', 'Name', 'Address', 'Whatsapp Number'], ['1', 'X', 'Y', '9000000001']]);
    const file = new File([blob], 'old.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const rows = await fileToRows(file);
    expect(rows[0][0]).toBe('Order Number');
    expect(rows[1][1]).toBe('X');
  });
});

describe('separate storage + lookup index', () => {
  beforeAll(async () => {
    await storage.area.clear();
    await storage.remove([LS.oldOrders, LS.orders, LS.nextOrderNumber, LS.settings, LS.fields, LS.products]);
  });

  const mk = (n: string, wa: string, name = 'P'): OldOrderRecord => ({
    id: `r-${n}`, orderNumber: n, name, address: 'addr', whatsapp: wa, sourceRow: 1, importedAt: 1,
  });

  it('merge keeps distinct old order numbers for one whatsapp; re-imports do not duplicate', async () => {
    const r1 = await mergeOldOrders([mk('4673-4312-3542', '8347034843', 'Patel Poonam'), mk('3542', '8347034843', 'Patel Poonam')]);
    expect(r1.added).toBe(2);
    const again = await mergeOldOrders([mk('4673-4312-3542', '8347034843', 'Patel Poonam')]);
    expect(again.added).toBe(0);
    expect(again.total).toBe(2);
    expect(await getOldOrders()).toHaveLength(2);
  });

  it('index + find: +91 formatted input finds the records, short numbers do not', async () => {
    const recs = await getOldOrders();
    const index = indexOldOrders(recs);
    expect(findOldByWhatsapp(index, '+91 83470 34843').map((r) => r.orderNumber)).toEqual(['4673-4312-3542', '3542']);
    expect(findOldByWhatsapp(index, '8347034843').length).toBe(2);
    expect(findOldByWhatsapp(index, '83470')).toEqual([]);
    expect(findOldByWhatsapp(index, '9999999999')).toEqual([]);
    // formatting differences never create duplicates
    expect(findOldByWhatsapp(index, '083470-34843').length).toBe(2);
  });
});

describe('auto number + old order suffix', () => {
  it('composed numbers advance the counter; never reused; main sequence continues', async () => {
    const s = defaultSettings(); // ORD- prefix, start 1001
    await storage.setMany({ [LS.settings]: s, [LS.orders]: [], [LS.nextOrderNumber]: 1001 });
    const ord = (n: string): Order => ({
      id: `x-${n}`, orderNumber: n,
      customer: { name: 'R', whatsapp: '8347034843', mobile: '', address: '', city: '', state: '', pincode: '' },
      products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
      orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null,
      createdAt: 1, updatedAt: 1, customFields: {}, previousOrderNumber: '4673-4312-3542',
    });
    const one = ord('ORD-1001-4673-4312-3542');
    await storage.setMany({ [LS.orders]: [one], [LS.nextOrderNumber]: 1001 });
    // next base stays 1002 (composed order counted via its leading run)
    expect(await nextCounter()).toBe(1002);
    expect(normalizeCounter([one], s)).toBe(1002);
    const plain = ord('ORD-1002');
    await storage.setMany({ [LS.orders]: [one, plain], [LS.nextOrderNumber]: 1002 });
    expect(await nextCounter()).toBe(1003);
  });
});

// ---------------------------------------------------------------------------
// UI: Settings → Old Data import + New Order lookup/autofill flow
// ---------------------------------------------------------------------------
function mkOrder(id: string, number: string, ts: number): Order {
  return {
    id, orderNumber: number,
    customer: { name: 'Old Customer', whatsapp: '', mobile: '', address: '', city: '', state: '', pincode: '' },
    products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
    orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null, createdAt: ts, updatedAt: ts, customFields: {},
  };
}

async function mountApp() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const { App } = await import('../src/app/App');
  await act(async () => { root.render(<App />); });
  await act(async () => { await tick(400); });
  const { navigate } = await import('../src/app/router');
  return { el, root, navigate };
}

describe('New Order page: previous-orders lookup → autofill → composed number', () => {
  beforeAll(async () => {
    DemoDriver.resetDemoGrid();
    await storage.area.clear();
    await storage.remove([LS.settings, LS.fields, LS.products, LS.orders, LS.oldOrders, LS.nextOrderNumber, LS.setupDone, LS.pendingOps]);
  });

  it('types whatsapp, sees ALL previous orders, picks one, saves with old order attached', { timeout: 90000 }, async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    const products: Product[] = [
      { id: 'p1', name: 'Night Cream', sku: '', price: 499, active: true, createdAt: 1 },
      { id: 'p2', name: 'Face Serum', sku: '', price: 699, active: true, createdAt: 1 },
    ];
    const recs: OldOrderRecord[] = [
      { id: 'a1', orderNumber: '4673-4312-3542', name: 'Patel Poonam', address: 'A-601, Yogi Platina, Sargasan, Gandhinagar - 382421', whatsapp: '8347034843', extras: { City: 'Gandhinagar', State: 'Gujarat' }, sourceRow: 2, importedAt: 1 },
      { id: 'a2', orderNumber: '3542', name: 'Patel Poonam', address: 'A-204, Aarna Residency', whatsapp: '8347034843', sourceRow: 3, importedAt: 1 },
      { id: 'a3', orderNumber: '7489', name: 'Trupti Joshi', address: 'A-204, Aarna Residency', whatsapp: '6358800465', sourceRow: 4, importedAt: 1 },
    ];
    const existing = mkOrder('ord-1001', 'ORD-1001', Date.now() - 86400_000);
    await storage.setMany({
      [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products,
      [LS.orders]: [existing], [LS.oldOrders]: recs, [LS.nextOrderNumber]: 1002, [LS.setupDone]: true,
    });

    const { el, root, navigate } = await mountApp();
    try {
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(400); });
      const text = () => el.textContent ?? '';

      const setInput = async (placeholder: string, value: string) => {
        const candidates = [...Array.from(el.querySelectorAll('input')), ...Array.from(el.querySelectorAll('textarea'))] as Array<HTMLInputElement | HTMLTextAreaElement>;
        const input = candidates.find((i) => i.getAttribute('placeholder') === placeholder);
        expect(input, `input ${placeholder}`).toBeTruthy();
        await act(async () => {
          const proto = Object.getPrototypeOf(input!);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(input, value);
          input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await tick(600); }); // debounce 350ms
      };

      // type the whatsapp number → both old orders for the SAME number shown
      await setInput('9876543210', '8347034843');
      expect(text()).toContain('Previous Orders Found');
      expect(text()).toContain('4673-4312-3542');
      expect(text()).toContain('3542');
      expect(text()).toContain('Patel Poonam');
      // Trupti (different number) must not appear
      expect(text()).not.toContain('Trupti Joshi');

      // unknown number → friendly "no previous order" note, no error
      await setInput('9876543210', '9000000000');
      expect(text()).toContain('No previous order found.');

      // back to the known number, pick the first old order
      await setInput('9876543210', '8347034843');
      const useButtons = Array.from(el.querySelectorAll('button')).filter((b) => (b.textContent ?? '').includes('Use This Order'));
      expect(useButtons.length).toBe(2);
      await act(async () => { useButtons[0].click(); });
      await act(async () => { await tick(200); });

      // autofilled customer info + previous-order chip
      const nameInput = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('placeholder') === 'Customer name') as HTMLInputElement | null;
      expect(nameInput?.value).toBe('Patel Poonam');
      const addrInput = Array.from(el.querySelectorAll('textarea')).find((i) => i.getAttribute('placeholder') === 'House no., street, landmark…') as HTMLTextAreaElement | null;
      expect(addrInput?.value).toContain('A-601, Yogi Platina');
      expect(text()).toContain('Previous Order:');
      expect(text()).toContain('4673-4312-3542');
      // City/State autofilled from extra columns when the fields exist
      const cityInput = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('placeholder') === 'City') as HTMLInputElement | null;
      expect(cityInput?.value ?? '').toBe('Gandhinagar');

      // auto order number = counter 1002? (existing ORD-1001 → counter 1002) + old suffix
      const numInput = el.querySelector('#order-number') as HTMLInputElement | null;
      expect(numInput?.value).toBe('ORD-1002-4673-4312-3542');

      // add a product & save
      await act(async () => {
        const pill = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Night Cream'));
        expect(pill).toBeTruthy();
        pill!.click();
      });
      await act(async () => { await tick(150); });
      await act(async () => {
        const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
        expect(save).toBeTruthy();
        save!.click();
      });
      await act(async () => { await tick(1400); });

      const stored = await storage.loadAll();
      const newest = [...stored.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      expect(newest.orderNumber).toBe('ORD-1002-4673-4312-3542');
      expect(newest.previousOrderNumber).toBe('4673-4312-3542');
      expect(newest.customer.name).toBe('Patel Poonam');
      expect(newest.customer.whatsapp).toBe('8347034843');
      expect(newest.customer.address).toContain('Yogi Platina');
      expect(newest.customer.state).toBe('Gujarat');
      // main counter continues normally
      expect(stored.nextOrderNumber).toBe(1003);
      // old data untouched & separate (still 3 records, still not in orders)
      expect((await storage.getState<OldOrderRecord[]>(LS.oldOrders))?.length).toBe(3);
      expect(stored.orders.length).toBe(2); // only the new one added

      // new order shows in dashboard/orders, old records never do
      await act(async () => { navigate('orders'); });
      await act(async () => { await tick(300); });
      const ordersText = el.textContent ?? '';
      expect(ordersText).toContain('ORD-1002-4673-4312-3542');
      expect(ordersText).not.toContain('7489'); // old records never listed as orders

      // -------- ORDER CHAIN: the customer returns again --------
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(400); });
      await setInput('9876543210', '8347034843');
      const chainText = () => el.textContent ?? '';
      expect(chainText()).toContain('Previous Orders Found');
      // ALL orders for this number: the new order + both imported old ones
      expect(chainText()).toContain('ORD-1002-4673-4312-3542');
      expect(chainText()).toContain('4673-4312-3542');
      expect(chainText()).toContain('3542');
      expect(chainText()).toContain('recent order');
      // newest first → first "Use This Order" belongs to the recent order
      const buttons = Array.from(el.querySelectorAll('button')).filter((b) => (b.textContent ?? '').includes('Use This Order'));
      expect(buttons.length).toBe(3);
      await act(async () => { buttons[0].click(); });
      await act(async () => { await tick(250); });
      const numInput2 = el.querySelector('#order-number') as HTMLInputElement | null;
      expect(numInput2?.value).toBe('ORD-1003-ORD-1002-4673-4312-3542');
      expect(chainText()).toContain('Previous Order:');
      // customer info editable: change the address before saving
      const addrInput2 = Array.from(el.querySelectorAll('textarea')).find((i) => i.getAttribute('placeholder') === 'House no., street, landmark…') as HTMLTextAreaElement | null;
      expect(addrInput2?.value).toContain('Yogi Platina');
      await act(async () => {
        const proto = Object.getPrototypeOf(addrInput2!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(addrInput2, 'NEW ADDRESS, New City');
        addrInput2!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { await tick(80); });
      await act(async () => {
        const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
        expect(save).toBeTruthy();
        save!.click();
      });
      await act(async () => { await tick(1500); });

      const stored2 = await storage.loadAll();
      const chainOrder = [...stored2.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      expect(chainOrder.orderNumber).toBe('ORD-1003-ORD-1002-4673-4312-3542');
      expect(chainOrder.previousOrderNumber).toBe('ORD-1002-4673-4312-3542'); // immediate parent, not the original
      expect(chainOrder.customer.address).toBe('NEW ADDRESS, New City'); // edited data saved
      // original order untouched (still old address)
      const firstOrder = stored2.orders.find((o) => o.orderNumber === 'ORD-1002-4673-4312-3542')!;
      expect(firstOrder.customer.address).toContain('Yogi Platina');
      expect(stored2.nextOrderNumber).toBe(1004); // base counter keeps counting
      expect((await storage.getState<OldOrderRecord[]>(LS.oldOrders))?.length).toBe(3); // imported history never modified
    } finally {
      root.unmount();
      el.remove();
    }
  });
});

describe('Settings → Old Data import UI', () => {
  it('uploads a CSV file and stores the records', { timeout: 90000 }, async () => {
    await storage.area.clear();
    await storage.remove([LS.settings, LS.fields, LS.products, LS.orders, LS.oldOrders, LS.nextOrderNumber, LS.setupDone]);
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.orders]: [], [LS.setupDone]: true });

    const { el, root, navigate } = await mountApp();
    try {
      await act(async () => { navigate('settings'); });
      await act(async () => { await tick(300); });
      const clickTab = async (label: string) => {
        let btn: Element | null = null;
        for (let attempt = 0; attempt < 8 && !btn; attempt += 1) {
          btn = Array.from(el.querySelectorAll('button.tab, .tabs button')).find((b) => (b.textContent ?? '').trim() === label) ?? null;
          if (!btn) await act(async () => { await tick(250); });
        }
        expect(btn, `tab ${label}`).toBeTruthy();
        await act(async () => { (btn as HTMLElement).click(); });
        await act(async () => { await tick(250); });
      };
      await clickTab('Old Data');
      expect((el.textContent ?? '')).toContain('Import Excel / CSV');
      expect((el.textContent ?? '')).toContain('Order Number · Name · Address · Whatsapp Number');

      const csv = new File(
        ['Order Number,Name,Address,Whatsapp Number\n9001,Rahul Shah,12 MG Road Ahmedabad,9876512345\n9002,Rahul Shah,12 MG Road Ahmedabad,9876512345\n9003,Meera Nair,Bandra,9988776655\n'],
        'old.csv', { type: 'text/csv' },
      );
      const input = el.querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(input).toBeTruthy();
      await act(async () => {
        Object.defineProperty(input!, 'files', { configurable: true, value: [csv] });
        input!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(900); });

      // Phase 1 preview shows normalized values (no numbers mangled)
      const previewText = el.textContent ?? '';
      expect(previewText).toContain('Review before importing');
      expect(previewText).toContain('9001');
      expect(previewText).toContain('9876512345');
      // nothing stored yet (preview only)
      expect(((await storage.loadAll()).oldOrders ?? []).length).toBe(0);

      // Phase 2 — confirm the import
      const importBtn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Import 3 rows'));
      expect(importBtn, 'import button').toBeTruthy();
      await act(async () => { importBtn!.click(); });
      await act(async () => { await tick(900); });

      const stored = await storage.loadAll();
      expect(stored.oldOrders).toHaveLength(3);
      expect(stored.oldOrders[0].orderNumber).toBe('9001');
      expect(stored.oldOrders[0].name).toBe('Rahul Shah');
      expect((el.textContent ?? '')).toContain('3 old orders stored');
      // new orders untouched
      expect(stored.orders).toHaveLength(0);
    } finally {
      root.unmount();
      el.remove();
    }
  });
});

// ---------------------------------------------------------------------------
// v1.0.8 — separate Mobile Number column + chain-level previous-order rule
// ---------------------------------------------------------------------------
describe('Mobile Number stays TEXT (separate from WhatsApp)', () => {
  it('cleans Excel scientific/.0 noise but preserves human spacing', () => {
    expect(normalizePhoneText('91234 56780')).toBe('91234 56780');
    expect(normalizePhoneText('6.358800465E9')).toBe('6358800465');
    expect(normalizePhoneText('9876543210.0')).toBe('9876543210');
    expect(normalizePhoneText('+91 98765 43210')).toBe('+91 98765 43210');
    expect(normalizePhoneText('')).toBe('');
    expect(normalizePhoneText('   ')).toBe('');
  });

  it('Whatsapp Number and Mobile Number columns are kept separate', () => {
    const rows = parseDelimitedText([
      'Order Number,Name,Address,Whatsapp Number,Mobile Number',
      '4673-4312-3542,Patel Poonam,A-601,8347034843,91234 56780',
      '3542,Patel Poonam,A-204,6358800465,6.358800465E9',
      '7489,Trupti Joshi,A-204,6358800465,',
    ].join('\n'));
    const scan = scanHeaders(rows);
    expect(scan.index.whatsapp).toBe(3);
    expect(scan.index.mobile).toBe(4);
    const { records, skipped } = rowsToOldRecords(rows, scan);
    expect(skipped).toBe(0);
    expect(records[0].whatsapp).toBe('8347034843');
    expect(records[0].mobile).toBe('91234 56780');
    expect(records[1].whatsapp).toBe('6358800465');
    expect(records[1].mobile).toBe('6358800465'); // scientific recovered, as text
    expect(records[2].whatsapp).toBe('6358800465');
    expect(records[2].mobile).toBeUndefined(); // blank stays blank — WhatsApp never copied
    // the mobile column is a real column, not an "extra"
    expect(records[0].extras ?? {}).not.toHaveProperty('Mobile Number');
    // entry carries the mobile through to the lookup/autofill
    expect(oldRecordToEntry(records[0]).mobile).toBe('91234 56780');
    expect(oldRecordToEntry(records[2]).mobile).toBe('');
  });

  it('a file with only a phone-ish column still imports it as WhatsApp', () => {
    const rows = parseDelimitedText('Order Number,Name,Address,Mobile Number\n3542,Patel Poonam,A-601,8347034843\n');
    const scan = scanHeaders(rows);
    expect(scan.index.whatsapp).toBe(3);
    expect(scan.index.mobile).toBeUndefined();
    expect(missingRequiredColumns(scan)).toEqual([]);
    const { records, skipped } = rowsToOldRecords(rows, scan);
    expect(skipped).toBe(0);
    expect(records[0].whatsapp).toBe('8347034843');
  });
});

describe('chain level of a picked order (TEST 1 / TEST 2 semantics)', () => {
  const rec = (n: string): OldOrderRecord => ({
    id: `r-${n}`, orderNumber: n, name: '', address: '', whatsapp: '6358800465', sourceRow: 2, importedAt: 1,
  });

  it('imported record whose own base equals the current auto base contributes its previous portion', () => {
    const entry = oldRecordToEntry(rec('14031-12772-10086-8491-7489'));
    expect(entryChainValue(entry, '14031')).toBe('12772-10086-8491-7489');
    expect(entryChainValue(entry, 'ORD-14031')).toBe('12772-10086-8491-7489');
    expect(entryChainValue(entry, 'ORD-00014031')).toBe('12772-10086-8491-7489');
  });

  it('otherwise the complete order number is the immediate parent (chain preserved)', () => {
    expect(entryChainValue(oldRecordToEntry(rec('14031-12772-10086-8491-7489')), '14032')).toBe('14031-12772-10086-8491-7489');
    expect(entryChainValue(oldRecordToEntry(rec('4673-4312-3542')), 'ORD-1002')).toBe('4673-4312-3542');
    expect(entryChainValue(oldRecordToEntry(rec('3542')), '14000')).toBe('3542');
  });

  it('current orders always contribute their complete number', () => {
    const current = currentOrderToEntry(mkOrder('c1', '14031-12772-10086-8491-7489', 2));
    expect(entryChainValue(current, '14032')).toBe('14031-12772-10086-8491-7489');
    expect(entryChainValue(current, '14031')).toBe('14031-12772-10086-8491-7489');
  });

  it('single-segment imported record equal to the base → no previous portion', () => {
    expect(entryChainValue(oldRecordToEntry(rec('14031')), '14031')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UI E2E — chained historical order (14031-12772-10086-8491-7489):
//   search → row shows mobile + reusable previous → use → autofill (mobile
//   included) → previous order editable → edited mobile/address saved →
//   chain continues from the new order with the next base (TEST 1–4).
// ---------------------------------------------------------------------------
describe('New Order chain from a chained historical order + Mobile Number', () => {
  beforeAll(async () => {
    DemoDriver.resetDemoGrid();
    await storage.area.clear();
    await storage.remove([LS.settings, LS.fields, LS.products, LS.orders, LS.oldOrders, LS.nextOrderNumber, LS.setupDone, LS.pendingOps]);
  });

  it('selects 14031-12772-10086-8491-7489 → 14031-… then 14032-14031-… (prefixless counters)', { timeout: 120000 }, async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    settings.order.prefix = '';
    settings.order.startNumber = 14031;
    const products: Product[] = [
      { id: 'p1', name: 'Night Cream', sku: '', price: 499, active: true, createdAt: 1 },
    ];
    const recs: OldOrderRecord[] = [
      {
        id: 't1', orderNumber: '14031-12772-10086-8491-7489', name: 'Trupti Joshi',
        address: 'A-204, Plot No. H-3093/11, Aarna Residency, GIDC, Ankleshwar - 393002',
        whatsapp: '6358800465', mobile: '91234 56780', sourceRow: 2, importedAt: 1,
      },
    ];
    await storage.setMany({
      [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products,
      [LS.orders]: [], [LS.oldOrders]: recs, [LS.nextOrderNumber]: 14031, [LS.setupDone]: true,
    });

    const { el, root, navigate } = await mountApp();
    try {
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(400); });
      const text = () => el.textContent ?? '';

      const inputs = () => Array.from(el.querySelectorAll('input')) as HTMLInputElement[];
      const setValue = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        await act(async () => {
          const proto = Object.getPrototypeOf(input);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await tick(250); });
      };
      const phoneInputs = () => inputs().filter((i) => i.getAttribute('placeholder') === '9876543210');

      // --- TEST 3: search shows the order with name, address, mobile ---
      await act(async () => { await setValue(phoneInputs()[0], '6358800465'); });
      await act(async () => { await tick(600); });
      expect(text()).toContain('Previous Orders Found');
      expect(text()).toContain('14031-12772-10086-8491-7489');
      expect(text()).toContain('Trupti Joshi');
      expect(text()).toContain('Mobile: 91234 56780');
      expect(text()).toContain('Reusable Previous Order: 12772-10086-8491-7489');

      // --- TEST 1: pick it → previous = 12772-…, auto number reconstructs ---
      const useButtons = Array.from(el.querySelectorAll('button')).filter((b) => (b.textContent ?? '').includes('Use This Order'));
      expect(useButtons.length).toBe(1);
      await act(async () => { useButtons[0].click(); });
      await act(async () => { await tick(300); });

      const numInput = () => el.querySelector('#order-number') as HTMLInputElement | null;
      const prevInput = () => el.querySelector('#previous-order-number') as HTMLInputElement | null;
      expect(numInput()?.value).toBe('14031-12772-10086-8491-7489');
      expect(prevInput()?.value).toBe('12772-10086-8491-7489');
      const nameInput = inputs().find((i) => i.getAttribute('placeholder') === 'Customer name');
      expect(nameInput?.value).toBe('Trupti Joshi');
      expect(phoneInputs()[1]?.value).toBe('91234 56780'); // separate Mobile field
      const addrInput = Array.from(el.querySelectorAll('textarea')).find((i) => i.getAttribute('placeholder') === 'House no., street, landmark…') as HTMLTextAreaElement | null;
      expect(addrInput?.value).toContain('A-204, Plot No.');

      // --- P8: the previous-order value is user-editable ---
      await setValue(prevInput()!, '4673-4312-3542');
      expect(numInput()?.value).toBe('14031-4673-4312-3542');
      // and it can be removed → only the auto base remains
      await act(async () => {
        const rm = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('✕ remove'));
        expect(rm).toBeTruthy();
        rm!.click();
      });
      await act(async () => { await tick(200); });
      expect(numInput()?.value).toBe('14031');
      expect(prevInput()).toBeNull();

      // pick the order again, then edit mobile + address before saving (TEST 4)
      await act(async () => {
        const btn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Use This Order'));
        expect(btn).toBeTruthy();
        btn!.click();
      });
      await act(async () => { await tick(250); });
      expect(prevInput()?.value).toBe('12772-10086-8491-7489');
      await setValue(phoneInputs()[1], '9999999999');
      await setValue(addrInput!, 'NEW ADDRESS, New City');

      await act(async () => {
        const pill = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Night Cream'));
        expect(pill).toBeTruthy();
        pill!.click();
      });
      await act(async () => { await tick(150); });
      await act(async () => {
        const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
        expect(save).toBeTruthy();
        save!.click();
      });
      await act(async () => { await tick(1600); });

      let stored = await storage.loadAll();
      let newest = [...stored.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      expect(newest.orderNumber).toBe('14031-12772-10086-8491-7489');
      expect(newest.previousOrderNumber).toBe('12772-10086-8491-7489');
      expect(newest.customer.name).toBe('Trupti Joshi');
      expect(newest.customer.mobile).toBe('9999999999'); // edited mobile saved
      expect(newest.customer.address).toBe('NEW ADDRESS, New City');
      expect(newest.customer.whatsapp).toBe('6358800465');
      // historical record untouched — mobile & address as imported
      const old = (await storage.getState<OldOrderRecord[]>(LS.oldOrders)) ?? [];
      expect(old).toHaveLength(1);
      expect(old[0].mobile).toBe('91234 56780');
      expect(old[0].address).toContain('A-204, Plot No.');
      expect(stored.nextOrderNumber).toBe(14032); // counter continues (TEST 1 semantics: base 14031 was re-issued)

      // --- TEST 2: next order — pick the newly created order → full parent ---
      await act(async () => { navigate('orders'); });
      await act(async () => { await tick(300); });
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(400); });
      await act(async () => { await setValue(phoneInputs()[0], '6358800465'); });
      await act(async () => { await tick(600); });
      expect(text()).toContain('Previous Orders Found');
      expect(text()).toContain('recent order'); // current order is listed too
      const useAll = Array.from(el.querySelectorAll('button')).filter((b) => (b.textContent ?? '').includes('Use This Order'));
      expect(useAll.length).toBe(2); // current order + imported history
      // newest first → the current 14031-… order is on top
      await act(async () => { useAll[0].click(); });
      await act(async () => { await tick(300); });
      expect(prevInput()?.value).toBe('14031-12772-10086-8491-7489'); // complete parent
      expect(numInput()?.value).toBe('14032-14031-12772-10086-8491-7489');
      await act(async () => {
        const pill = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Night Cream'));
        expect(pill).toBeTruthy();
        pill!.click();
      });
      await act(async () => { await tick(150); });
      await act(async () => {
        const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
        expect(save).toBeTruthy();
        save!.click();
      });
      await act(async () => { await tick(1600); });

      stored = await storage.loadAll();
      newest = [...stored.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      expect(newest.orderNumber).toBe('14032-14031-12772-10086-8491-7489');
      expect(newest.previousOrderNumber).toBe('14031-12772-10086-8491-7489');
      expect(stored.nextOrderNumber).toBe(14033);
      expect(((await storage.getState<OldOrderRecord[]>(LS.oldOrders)) ?? []).length).toBe(1);
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
