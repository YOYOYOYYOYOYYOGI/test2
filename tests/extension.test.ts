/* End-to-end-ish test harness for Order Label Manager.
 * Loads the REAL built bundle (dist/assets/main-*.js) inside happy-dom with a
 * mock chrome API + mock Google Sheets API, and clicks through every feature. */
import { Window } from 'happy-dom';
import { readdirSync } from 'node:fs';

let pass = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, extra = ''): void {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ''));
    console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''));
  }
}
const flush = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/* ---------- happy-dom globals ---------- */
const win = new Window({ url: 'chrome-extension://testid/index.html' });
(globalThis as Record<string, unknown>).window = win;
for (const k of ['document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLCanvasElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'ShadowRoot', 'SVGElement', 'FileReader', 'File', 'FormData', 'history', 'location', 'navigator', 'getComputedStyle', 'requestAnimationFrame']) {
  try {
    (globalThis as Record<string, unknown>)[k] = (win as unknown as Record<string, unknown>)[k];
  } catch { /* not present */ }
}
(globalThis as Record<string, unknown>).Image = win.Image;
(globalThis as Record<string, unknown>).XMLSerializer = win.XMLSerializer;

/* ---------- chrome mock ---------- */
const memStore = new Map<string, unknown>();
const chrome: Record<string, unknown> = {
  runtime: {
    lastError: null,
    getURL: (p: string) => 'chrome-extension://testid/' + p,
    onMessage: { addListener: () => undefined },
  },
  storage: {
    local: {
      get: (keys: unknown, cb: (d: Record<string, unknown>) => void) => {
        let out: Record<string, unknown> = {};
        if (keys === null || keys === undefined) out = Object.fromEntries(memStore);
        else if (typeof keys === 'string') { if (memStore.has(keys)) out[keys] = memStore.get(keys); }
        else if (Array.isArray(keys)) for (const k of keys) if (memStore.has(k)) out[k] = memStore.get(k);
        else for (const k of Object.keys(keys as object)) out[k] = memStore.has(k) ? memStore.get(k) : (keys as Record<string, unknown>)[k];
        setTimeout(() => cb(out), 0);
      },
      set: (obj: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(obj)) memStore.set(k, v);
        cb?.();
      },
      remove: (keys: string | string[], cb?: () => void) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) memStore.delete(k);
        cb?.();
      },
    },
  },
  identity: {
    getRedirectURL: () => 'https://testid.chromiumapp.org/',
    launchWebAuthFlow: (opts: { interactive: boolean }, cb: (u?: string) => void) => {
      if (!opts.interactive) setTimeout(() => cb(undefined), 0);
      else setTimeout(() => cb('https://testid.chromiumapp.org/#access_token=TESTTOKEN&expires_in=3600'), 0);
    },
  },
  windows: { getCurrent: (cb: (w: { type: string }) => void) => cb({ type: 'popup' }) },
};
(globalThis as Record<string, unknown>).chrome = chrome;

/* ---------- Google Sheets API mock ---------- */
interface ApiCall { method: string; url: string; body?: string }
const apiCalls: ApiCall[] = [];
let sheetHeaders: string[] = ['Order Number', 'Customer Name', 'Phone', 'Notes'];
let sheetRows: string[][] = [['ORD-1001', 'Old Row', '9999999999', 'existing data']];
let appendedRows: string[][] = [];
let updatedRows: Record<number, string[]> = {};

const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const method = init?.method || 'GET';
  apiCalls.push({ method, url: u, body: init?.body });

  if (u.startsWith('chrome-extension://')) return new Response(new Uint8Array(2048), { status: 200 }); // font
  if (u.includes('oauth2.googleapis.com/revoke')) return json({});

  // Sheets API
  let path = '';
  try { path = decodeURIComponent(new URL(u).pathname + new URL(u).search); } catch { path = u; }

  if (path.includes('/values/')) {
    const range = path.split('/values/')[1].split('?')[0];
    const dec = range.replace(/%21/g, '!').replace(/%27/g, "'").replace(/%3A/g, ':');
    if (dec.includes('!1:1')) return json({ values: [sheetHeaders] });
    if (/![A-Z]+:[A-Z]+$/.test(dec)) return json({ values: [['Order Number'], ...sheetRows.map((r) => [r[0]])] });
    if (dec.includes(':append')) {
      const values = JSON.parse(init?.body || '{}').values[0] as string[];
      appendedRows.push(values);
      sheetRows.push(values);
      return json({ updates: { updatedRange: `'Orders 2024'!A${sheetRows.length + 1}` } });
    }
    const m = /!A(\d+):/.exec(dec);
    if (m && method === 'PUT') {
      const rowNo = Number(m[1]);
      const values = JSON.parse(init?.body || '{}').values[0] as string[];
      updatedRows[rowNo] = values;
      if (sheetRows[rowNo - 2]) sheetRows[rowNo - 2] = values;
      return json({ updatedRange: `'Orders 2024'!A${rowNo}` });
    }
    return json({});
  }
  if (path.includes('/spreadsheets/') && path.includes('sheets.properties.title')) {
    return json({ sheets: [{ properties: { title: 'Orders 2024' } }, { properties: { title: 'Archive' } }] });
  }
  if (path.includes('/spreadsheets/')) return json({ sheets: [{ properties: { title: 'Orders 2024' } }] });
  return json({}, 404);
}) as typeof fetch;

/* ---------- window.open mock ---------- */
const printWindows: Array<{ html: string; printed: boolean; document: unknown; print: () => void }> = [];
(win as unknown as { open: unknown }).open = () => {
  const pw = {
    html: '',
    printed: false,
    document: null as unknown,
    print() { pw.printed = true; },
  };
  pw.document = {
    open() { /* noop */ },
    write(h: string) { pw.html += h; },
    close() { /* noop */ },
    fonts: { ready: Promise.resolve() },
  };
  printWindows.push(pw);
  return pw;
};

/* ---------- canvas + blob URL mocks ---------- */
const fakeCtx = { fillStyle: '', fillRect() { /* noop */ }, drawImage() { /* noop */ } };
(win.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => fakeCtx;
(win.HTMLCanvasElement.prototype as unknown as { toDataURL: () => string }).toDataURL = () =>
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAK/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AA==';
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  style: Record<string, string> = {};
  set src(v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
(globalThis as Record<string, unknown>).Image = FakeImage;

let capturedBlob: Blob | null = null;
const realURL = globalThis.URL;
(realURL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
  capturedBlob = b;
  return 'blob:mock';
};
(realURL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL = () => undefined;

/* ---------- boot the real bundle ---------- */
console.log('\n== Loading built extension bundle ==');
document.body.innerHTML = '<div id="app"></div>';
const assets = readdirSync(new URL('../dist/assets', import.meta.url).pathname).filter((f) => f.startsWith('main-') && f.endsWith('.js'));
await import(new URL('../dist/assets/', import.meta.url).pathname + assets[0]);
await flush(120);

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const click = (sel: string): void => {
  const el = $(sel);
  if (!el) throw new Error('missing element ' + sel);
  el.click();
};
const setVal = (sel: string, v: string, ev = 'input'): void => {
  const el = $(sel) as HTMLInputElement;
  if (!el) throw new Error('missing element ' + sel);
  el.value = v;
  el.dispatchEvent(new Event(ev, { bubbles: true }));
};

console.log('\n== Dashboard ==');
ok(document.querySelector('.page-title')?.textContent === 'Dashboard', 'dashboard renders');
ok($$('.stat').length === 4, '4 stat tiles');
ok($('[data-route="products"]') !== null, 'nav has 6 sections');

console.log('\n== Products ==');
click('[data-route="products"]');
await flush();
click('[data-act="add"]');
await flush();
setVal('[data-n]', 'Night Cream Extra');
setVal('[data-s]', 'NCX-9');
setVal('[data-p]', '249');
click('[data-save]');
await flush();
ok(document.body.textContent!.includes('Night Cream Extra'), 'product created and listed');
ok($$('[data-toggle]').length === 4, '4 products with active toggles');

console.log('\n== Custom Fields ==');
click('[data-route="fields"]');
await flush();
ok($$('.list-row').length === 6, '6 seeded fields listed');
click('[data-act="add"]');
await flush();
setVal('[data-n]', 'GST Number');
click('[data-save]');
await flush();
ok(document.body.textContent!.includes('GST Number'), 'field added');
// required toggle + reorder
const beforeFirst = $$('.list-row .name')[0].textContent;
click('[data-up]:not([disabled])');
await flush();
const afterFirst = $$('.list-row .name')[0].textContent;
click('[data-down]:not([disabled])');
await flush();
ok($$('.list-row').length === 7, 'field count after add');

console.log('\n== New Order ==');
click('[data-route="new"]');
await flush();
ok(document.body.textContent!.includes('Customer Details'), 'custom fields shown on order form');
ok($$('[data-fid]').length >= 7, 'all custom fields rendered');
setVal('[data-fid="f_name"]', 'Rahul Patel');
setVal('[data-fid="f_phone"]', '9876543210');
setVal('[data-fid="f_address"]', '123 Main Road');
setVal('[data-fid="f_city"]', 'Ahmedabad');
setVal('[data-fid="f_state"]', 'Gujarat');
setVal('[data-fid="f_pincode"]', '380001');
ok(($('[data-onum]') as HTMLInputElement).value === 'ORD-1001', 'auto order number ORD-1001');
click('[data-act="addprod"]');
await flush();
const pids = $$('.plist [data-pid]');
ok(pids.length === 4, 'product picker lists active products');
(pids[0] as HTMLButtonElement).click(); // Night Cream ₹499
await flush();
setVal('[data-qty="0"]', '2');
await flush();
ok($('[data-total]')!.textContent === '₹998', 'total updates with qty (₹998)');
click('[data-act="addprod"]');
await flush();
console.log('  [pid1] modals before:', document.querySelectorAll('.modal-wrap').length); $$('.plist [data-pid]')[1].click(); console.log('  [pid1] modals after:', document.querySelectorAll('.modal-wrap').length); // Face Serum ₹699
await flush();
ok($('[data-total]')!.textContent === '₹1,697', 'multi-product total ₹1,697');

// validation: clear a required field
setVal('[data-fid="f_name"]', '');
click('[data-act="save"]');
await flush();
ok(document.body.textContent!.includes('Customer Name is required.'), 'required-field validation message');
setVal('[data-fid="f_name"]', 'Rahul Patel');
setVal('[data-fid="f_phone"]', 'abc', 'input');
click('[data-act="save"]');
await flush();
ok(document.body.textContent!.includes('valid phone number'), 'invalid phone validation');
setVal('[data-fid="f_phone"]', '9876543210');

console.log('\n== Save order + Google Sheets sync (mocked) ==');
// connect sheets first via settings
click('[data-route="settings"]');
await flush();
setVal('[data-k="clientId"]', 'test-client-id.apps.googleusercontent.com', 'change');
setVal('[data-sheetref]', 'https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=0', 'input');
click('[data-act="use"]');
await flush(80);
ok(document.body.textContent!.includes('columns ready ('), `spreadsheet connected, columns created (got: ${document.querySelector('[data-gstatus]')?.textContent})`);
ok(apiCalls.some((c) => c.method === 'PUT' && c.url.includes('/values/') && !c.url.includes('1:1')), 'missing columns created once via one PUT');
const colPut = apiCalls.find((c) => c.method === 'PUT' && JSON.parse(c.body || '{}').values);
ok(colPut && JSON.stringify(JSON.parse(colPut!.body!).values[0]) === JSON.stringify(['Order Date', 'Payment Status', 'Amount', 'Address', 'City', 'State', 'Pincode', 'GST Number', 'Night Cream Qty', 'Face Serum Qty', 'Day Cream Qty', 'Night Cream Extra Qty']), 'exact missing columns appended (never duplicates)', colPut?.body);

// back to the order form and save
click('[data-route="new"]');
await flush();
setVal('[data-fid="f_name"]', 'Rahul Patel');
setVal('[data-fid="f_phone"]', '9876543210');
setVal('[data-fid="f_address"]', '123 Main Road');
setVal('[data-fid="f_city"]', 'Ahmedabad');
setVal('[data-fid="f_state"]', 'Gujarat');
setVal('[data-fid="f_pincode"]', '380001');
click('[data-act="addprod"]');
await flush();
console.log('  [pid0] modals before:', document.querySelectorAll('.modal-wrap').length, 'disabled0=', ($$('.plist [data-pid]')[0] as HTMLButtonElement).disabled, 'parentConnected=', $$('.plist [data-pid]')[0].closest('.modal-wrap')!.isConnected);
$$('.plist [data-pid]')[0].click();
console.log('  [pid0] modals after:', document.querySelectorAll('.modal-wrap').length, 'connectedStill=', $$('.plist [data-pid]')[0]?.closest('.modal-wrap')?.isConnected, 'rowsNow=', $$('[data-qty]').length);
await flush();
setVal('[data-qty="0"]', '2');
click('[data-act="addprod"]');
await flush();
console.log('  [pid1] modals before:', document.querySelectorAll('.modal-wrap').length); $$('.plist [data-pid]')[1].click(); console.log('  [pid1] modals after:', document.querySelectorAll('.modal-wrap').length);
await flush();
click('[data-act="save"]');
await flush(80);
ok(document.body.textContent!.includes('Order saved successfully.'), 'success toast shown');
ok(appendedRows.length === 1, 'exactly ONE new spreadsheet row appended');
const row = appendedRows[0] || [];
ok(row[0] === 'ORD-1001', 'row has order number in Order Number column');
const colPut2 = apiCalls.find((c) => c.method === 'PUT' && JSON.parse(c.body || '{}').values);
const fullHeaders = [...sheetHeaders, ...JSON.parse(colPut2!.body!).values[0]] as string[];
const hdrIdx = (n: string) => fullHeaders.findIndex((h) => h.toLowerCase() === n.toLowerCase());
ok(row[hdrIdx('Customer Name')] === 'Rahul Patel', 'field value lands in matching column');
ok(row[hdrIdx('Phone')] === '9876543210', 'phone column');
ok(row[hdrIdx('City')] === 'Ahmedabad', 'city column');
ok(row[hdrIdx('Payment Status')] === 'COD', 'payment status column');
ok(row[hdrIdx('Amount')] === '1697', 'amount column');
ok(row[hdrIdx('Night Cream Qty')] === '2' && row[hdrIdx('Face Serum Qty')] === '1', 'per-product qty columns (spec example)');
ok(row.length === fullHeaders.length, 'row aligned to full header row (no column creation per customer)');

console.log('\n== Orders page + search ==');
ok(document.body.textContent!.includes('ORD-1001'), 'order listed');
ok(document.body.textContent!.includes('Rahul Patel'), 'customer shown');
ok(document.body.textContent!.includes('₹1,697'), 'amount shown');
setVal('[data-search]', 'zzz');
await flush();
ok(document.body.textContent!.includes('No orders match'), 'search: no match state');
setVal('[data-search]', '9876543210');
await flush();
ok(document.body.textContent!.includes('ORD-1001'), 'search by phone finds order');
setVal('[data-search]', '');
await flush();

console.log('\n== Label view + Print + Download ==');
const labelBtn = $$('.tbl [data-act="label"]')[0];
if (labelBtn) {
  labelBtn.click();
  await flush();
}
ok(document.body.textContent!.includes('Download Label') && document.body.textContent!.includes('Print Label'), 'label view with Back/Print/Download');
const stage = $('[data-stage]');
const shadow = stage?.firstElementChild && (stage.firstElementChild as unknown as { shadowRoot: ShadowRoot }).shadowRoot;
ok(!!shadow, 'preview rendered in shadow root');
const shadowHtml = shadow ? shadow.innerHTML : '';
ok(shadowHtml.includes('Rahul Patel'), 'label shows real customer name');
ok(shadowHtml.includes('123 Main Road'), 'label shows address');
ok(shadowHtml.includes('My Business'), 'label shows business name');
ok(shadowHtml.includes('COD'), 'label shows payment status');
ok(shadowHtml.includes('₹1,697'), 'label shows total');
ok((shadowHtml.match(/<svg class="barcode"/g) || []).length === 1, 'label has Code 39 barcode');
ok(!shadowHtml.includes('GST Number'), 'empty custom field is not printed on label');

// Print
click('[data-act="print"]');
await flush(150);
const pw = printWindows[printWindows.length - 1];
ok(pw && pw.html.includes('ORD-1001'), 'print window gets the label document');
ok(pw && pw.html.includes('@page{size:4in 6in'), 'print layout is 4x6 inch');
ok(pw && pw.html.includes('@media print{.toolbar{display:none}'), 'buttons hidden while printing');
ok(pw && pw.printed, 'browser print triggered');
ok(document.body.textContent!.includes('Label sent to printer.'), 'print confirmation');

// Download
capturedBlob = null;
click('[data-act="download"]');
await flush(150);
ok(capturedBlob !== null, 'download produces a file');
const bytes = capturedBlob ? Buffer.from(await (capturedBlob as Blob).arrayBuffer()) : Buffer.alloc(0);
ok(bytes.subarray(0, 8).toString() === '%PDF-1.4', 'downloaded file is a PDF');
ok(bytes.slice(-6).toString() === '%%EOF\n' || bytes.slice(-5).toString() === '%%EOF', 'PDF is complete');

console.log('\n== Duplicate order protection ==');
click('[data-act="back"]');
await flush();
click('[data-route="new"]');
await flush();
ok(($('[data-onum]') as HTMLInputElement).value === 'ORD-1002', 'counter bumped to ORD-1002');
setVal('[data-onum]', 'ORD-1001');
setVal('[data-fid="f_name"]', 'Dup Test');
setVal('[data-fid="f_phone"]', '9000000001');
console.log('DEBUG pre-addprod: modal-wraps=', document.querySelectorAll('.modal-wrap').length, 'items rows=', $$('[data-qty]').length, 'titles=', Array.from(document.querySelectorAll('.modal-wrap h3')).map((x) => x.textContent));
click('[data-act="addprod"]');
await flush();
console.log('DEBUG post-addprod: modal-wraps=', document.querySelectorAll('.modal-wrap').length, 'pids=', $$('.plist [data-pid]').length, 'disabled=', $$('.plist [data-pid]').map(b => (b as HTMLButtonElement).disabled));
console.log('  [pid0] modals before:', document.querySelectorAll('.modal-wrap').length, 'disabled0=', ($$('.plist [data-pid]')[0] as HTMLButtonElement).disabled, 'parentConnected=', $$('.plist [data-pid]')[0].closest('.modal-wrap')!.isConnected);
$$('.plist [data-pid]')[0].click();
console.log('  [pid0] modals after:', document.querySelectorAll('.modal-wrap').length, 'connectedStill=', $$('.plist [data-pid]')[0]?.closest('.modal-wrap')?.isConnected, 'rowsNow=', $$('[data-qty]').length);
await flush();
console.log('DEBUG post-pid: modal-wraps=', document.querySelectorAll('.modal-wrap').length, 'items rows=', $$('[data-qty]').length, 'total=', $('[data-total]')?.textContent);
click('[data-act="save"]');
await flush();
ok(document.body.textContent!.includes('Order already exists.'), 'duplicate dialog appears', 'BODY: ' + document.body.textContent!.slice(-600));
ok($$('.modal [data-open]').length === 1 && $$('.modal [data-edit]').length === 1, 'offers Open Order / Edit Order');
ok(appendedRows.length === 1, 'NO duplicate row was written');
$('.modal [data-open]')!.click();
await flush();
ok(document.body.textContent!.includes('Print Label'), 'Open Order shows the existing order label');

console.log('\n== Edit order updates the SAME row ==');
click('[data-act="back"]');
await flush();
const editBtn = $$('.tbl [data-act="edit"]')[0];
editBtn.click();
await flush();
ok(document.body.textContent!.includes('Edit Order'), 'edit mode opens');
setVal('[data-fid="f_city"]', 'Gandhinagar');
click('[data-act="save"]');
await flush(80);
ok(document.body.textContent!.includes('Order updated successfully.'), 'update toast');
ok(appendedRows.length === 1, 'edit did NOT append a new row');
const updRow = updatedRows[3];
ok(updRow && updRow[hdrIdx('City')] === 'Gandhinagar', 'same spreadsheet row updated in place', JSON.stringify(updRow || []));
ok(!apiCalls.some((c) => c.method === 'DELETE'), 'no spreadsheet data ever deleted');

console.log('\n== Settings persistence + label options ==');
click('[data-route="settings"]');
await flush();
ok(($('[data-k="businessName"]') as HTMLInputElement).value === 'My Business', 'settings persisted value');
setVal('[data-k="businessName"]', 'Acme Cosmetics', 'change');
await flush();
ok(memStore.get('settings') && (memStore.get('settings') as Record<string, unknown>).businessName === 'Acme Cosmetics', 'business name persisted to storage');
setVal('[data-k="labelSize"]', 'a6', 'change');
await flush();
ok((memStore.get('settings') as Record<string, unknown>).labelSize === 'a6', 'label size persisted');
// mapping override: map City field to existing "Notes" column
const mapSel = $$('select[data-map]').find((s) => (s.previousElementSibling?.textContent || '').includes('City')) as HTMLSelectElement;
if (mapSel) {
  mapSel.value = 'Notes';
  mapSel.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  ok((memStore.get('settings') as Record<string, unknown>).customMap && Object.values((memStore.get('settings') as Record<string, unknown>).customMap as object)[0] === 'Notes', 'custom column mapping saved');
}

console.log('\n== Export backup ==');
capturedBlob = null;
click('[data-act="export"]');
await flush();
ok(capturedBlob !== null, 'backup exported');
const backup = capturedBlob ? JSON.parse(Buffer.from(await (capturedBlob as Blob).arrayBuffer()).toString()) : {};
ok(Array.isArray(backup.orders) && backup.orders.length === 1, 'backup contains orders');
ok(Array.isArray(backup.fields) && backup.fields.length === 7, 'backup contains fields');
ok(Array.isArray(backup.products) && backup.products.length === 4, 'backup contains products');

console.log('\n== Orders tab (full page) ==');
document.body.innerHTML = '<div id="app"></div>';
printWindows.length = 0;
const ordersAssets = readdirSync(new URL('../dist/assets', import.meta.url).pathname).filter((f) => f.startsWith('orders-') && f.endsWith('.js'));
await import(new URL('../dist/assets/', import.meta.url).pathname + ordersAssets[0]);
await flush(150);
ok(document.body.textContent!.includes('Order Label Manager — Orders'), 'orders tab renders');
ok($$('.tbl tbody tr').length === 1, 'orders tab lists orders');
const dl = $$('.tbl [data-act="download"]')[0];
capturedBlob = null;
dl.click();
await flush(200);
ok(capturedBlob !== null && Buffer.from(await (capturedBlob as Blob).arrayBuffer()).subarray(0, 4).toString() === '%PDF', 'per-order download works from orders tab');

/* ---------- summary ---------- */
console.log(`\n==========================================`);
console.log(`PASS: ${pass}  FAIL: ${fails.length}`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fails.length > 0 ? 1 : 0);
