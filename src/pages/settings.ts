import { disconnect as gDisconnect, connect as gConnect, getSheetInfo, isSignedIn } from '../services/google';
import { ensureAllColumns, extractSheetId, STD_COLS } from '../services/sheets-data';
import { exportBackup, getFields, getHeaders, getOrders, getSettings, importBackup, saveAllOrders, saveHeaders, saveSettings } from '../services/store';
import type { Settings } from '../types';
import { esc } from '../utils';
import { msg, toast } from '../ui';
import type { Ctx, PageResult } from './ctx';

const state = { signedIn: false as boolean };

export function settingsPage(ctx: Ctx): PageResult {
  const s = getSettings();
  const fields = getFields();
  const headers = getHeaders();
  const connected = !!s.sheetId;

  const lfChecked = (id: string): boolean => (s.labelFields === null ? true : s.labelFields.includes(id));
  const fieldChecks = fields
    .map(
      (f) => `<label class="checkrow"><input type="checkbox" data-lf="${f.id}" ${lfChecked(f.id) ? 'checked' : ''}> ${esc(f.name)}</label>`
    )
    .join('');
  const extras: [keyof Settings['labelExtras'], string][] = [
    ['orderNumber', 'Order Number'],
    ['products', 'Products'],
    ['quantity', 'Quantity'],
    ['payment', 'Payment Status'],
    ['amount', 'Amount'],
    ['gst', 'Business GST'],
    ['barcode', 'Barcode'],
  ];
  const extraChecks = extras
    .map(([k, l]) => `<label class="checkrow"><input type="checkbox" data-ex="${k}" ${s.labelExtras[k] ? 'checked' : ''}> ${l}</label>`)
    .join('');

  const mapping = connected
    ? `<div class="card-sub" style="margin-top:12px">Column mapping — fields reuse matching columns automatically. Map a field to a different existing column if needed.</div>
       ${
         fields.length === 0
           ? `<div class="muted" style="font-size:12px">No custom fields to map.</div>`
           : fields
               .map((f) => {
                 const current = s.customMap[f.id] || '';
                 return `<div class="map-row"><div class="strong">${esc(f.name)}</div><select data-map="${f.id}"><option value="">Auto${current ? '' : ' (matched)'}</option>${headers
                   .map((h) => `<option value="${esc(h)}" ${current === h ? 'selected' : ''}>${esc(h)}</option>`)
                   .join('')}</select></div>`;
               })
               .join('')
       }`
    : '';

  return {
    html: `<div class="page-head">
        <div><h2 class="page-title">Settings</h2><div class="page-sub">Changes are saved automatically</div></div>
      </div>

      <div class="card">
        <div class="card-title">Business</div>
        <div class="set-grid">
          <div class="field"><label class="f">Business Name</label><input type="text" data-k="businessName" value="${esc(s.businessName)}"></div>
          <div class="field"><label class="f">Phone</label><input type="text" data-k="phone" value="${esc(s.phone)}"></div>
          <div class="field"><label class="f">Website</label><input type="text" data-k="website" value="${esc(s.website)}"></div>
          <div class="field"><label class="f">GST</label><input type="text" data-k="gst" value="${esc(s.gst)}"></div>
          <div class="field span2"><label class="f">Address</label><textarea rows="2" data-k="address">${esc(s.address)}</textarea></div>
          <div class="field span2"><label class="f">Label Footer</label><input type="text" data-k="footer" value="${esc(s.footer)}" placeholder="Thank you for your order!"></div>
          <div class="field span2"><label class="f">Logo</label>
            <div class="logo-row">
              ${s.logo ? `<img src="${s.logo}" alt="logo">` : ''}
              <button class="btn small" data-act="logo">${s.logo ? 'Change Logo' : 'Upload Logo'}</button>
              ${s.logo ? `<button class="btn small ghost-danger" data-act="logorm">Remove</button>` : ''}
              <input type="file" accept="image/*" data-logo hidden>
            </div>
            <div class="hint">Shown on the shipping label. PNG/JPG, up to ~300 KB.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Google Sheets</div>
        <div class="toolbar" style="margin-bottom:8px">
          <span class="dot ${state.signedIn ? 'on' : ''}" data-gdot></span>
          <span class="count" data-gstatus>${connected ? `Spreadsheet connected: ${s.sheetName || '…'}` : state.signedIn ? 'Google account connected' : 'Not connected'}</span>
          <span class="spacer"></span>
          <button class="btn small" data-act="gdisconnect" ${state.signedIn || connected ? '' : 'disabled'}>Disconnect</button>
        </div>
        <div class="set-grid">
          <div class="field span2"><label class="f">Spreadsheet URL or ID</label><input type="text" data-sheetref value="${esc(s.sheetId)}" placeholder="https://docs.google.com/spreadsheets/d/…"></div>
          <div class="field"><label class="f">Worksheet</label><select data-ws ${connected ? '' : 'disabled'}><option value="${esc(s.sheetName)}">${esc(s.sheetName || '—')}</option></select></div>
          <div class="field"><label class="f">&nbsp;</label><button class="btn" data-act="use" style="width:100%">${connected ? 'Re-read Connection' : 'Connect Spreadsheet'}</button></div>
        </div>
        <div class="field" style="margin-top:4px"><label class="f">Google OAuth Client ID</label><input type="text" data-k="clientId" value="${esc(s.clientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com"></div>
        <details class="help">
          <summary>One-time setup: how to get a Client ID (free, ~2 minutes)</summary>
          <ol>
            <li>Open <b>console.cloud.google.com</b> → create/select a project.</li>
            <li><b>APIs &amp; Services → Library</b> → enable <b>Google Sheets API</b>.</li>
            <li><b>OAuth consent screen</b> → External → add yourself as a <b>test user</b>.</li>
            <li><b>Credentials → Create credentials → OAuth client ID</b> → type <b>Web application</b>.</li>
            <li>Add this <b>Authorized redirect URI</b>: <code>${esc(chrome?.identity?.getRedirectURL ? chrome.identity.getRedirectURL() : 'chrome-extension://EXTENSION_ID.chromiumapp.org/')}</code></li>
            <li>Copy the <b>Client ID</b> and paste it above, then click <b>Connect Spreadsheet</b>.</li>
          </ol>
        </details>
        ${mapping}
      </div>

      <div class="card">
        <div class="card-title">Orders</div>
        <div class="set-grid">
          <div class="field"><label class="f">Order Prefix</label><input type="text" data-k="orderPrefix" value="${esc(s.orderPrefix)}"></div>
          <div class="field"><label class="f">Starting Number</label><input type="number" min="1" step="1" data-k="nextNumber" value="${s.nextNumber}"></div>
        </div>
        <div class="hint">New orders get <b>${esc(s.orderPrefix)}${s.nextNumber}</b>. You can always type a manual order number.</div>
      </div>

      <div class="card">
        <div class="card-title">Label</div>
        <div class="set-grid">
          <div class="field"><label class="f">Label Size</label>
            <select data-k="labelSize">
              <option value="4x6" ${s.labelSize === '4x6' ? 'selected' : ''}>4 × 6 inch (default)</option>
              <option value="a6" ${s.labelSize === 'a6' ? 'selected' : ''}>A6 (105 × 148 mm)</option>
            </select>
          </div>
          <div class="field"><label class="f">Text Size</label>
            <select data-k="labelFontScale">
              <option value="0.9" ${s.labelFontScale === 0.9 ? 'selected' : ''}>Small</option>
              <option value="1" ${s.labelFontScale === 1 ? 'selected' : ''}>Normal</option>
              <option value="1.1" ${s.labelFontScale === 1.1 ? 'selected' : ''}>Large</option>
              <option value="1.25" ${s.labelFontScale === 1.25 ? 'selected' : ''}>Extra Large</option>
            </select>
          </div>
        </div>
        <div class="card-sub" style="margin-top:12px">Customer fields shown on the label</div>
        ${fields.length === 0 ? `<div class="muted" style="font-size:12px">No custom fields yet.</div>` : `<div style="columns:2;gap:24px">${fieldChecks}</div>`}
        <div class="card-sub" style="margin-top:12px">Label sections</div>
        <div style="columns:2;gap:24px">${extraChecks}</div>
      </div>

      <div class="card">
        <div class="card-title">Backup</div>
        <div class="toolbar">
          <button class="btn" data-act="export">Export Orders</button>
          <button class="btn" data-act="import">Import Settings</button>
          <span class="count">Exports include orders, fields, products and settings as JSON.</span>
        </div>
        <input type="file" accept="application/json" data-importfile hidden>
      </div>`,
    async bind(root) {
      const s2 = getSettings();
      // Auto-save simple key fields on change
      root.querySelectorAll('[data-k]').forEach((el) => {
        const key = (el as HTMLElement).dataset.k as keyof Settings;
        el.addEventListener('change', async () => {
          const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          let v: string | number = input.value;
          if (key === 'nextNumber') v = Math.max(1, Math.floor(Number(v) || 1));
          if (key === 'labelFontScale') v = Number(v) || 1;
          await saveSettings({ ...getSettings(), [key]: v } as Settings);
          toast('Saved.');
        });
      });
      // Logo
      const fileInput = root.querySelector('[data-logo]') as HTMLInputElement;
      root.querySelector('[data-act="logo"]')?.addEventListener('click', () => fileInput.click());
      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 400 * 1024) {
          toast('Logo is too large — please use an image under 400 KB.', 'err');
          fileInput.value = '';
          return;
        }
        const r = new FileReader();
        r.onload = async () => {
          await saveSettings({ ...getSettings(), logo: String(r.result) });
          toast('Logo saved.', 'ok');
          ctx.rerender();
        };
        r.readAsDataURL(file);
      });
      root.querySelector('[data-act="logorm"]')?.addEventListener('click', async () => {
        await saveSettings({ ...getSettings(), logo: '' });
        ctx.rerender();
      });
      // Google status (async refresh)
      isSignedIn()
        .then((ok) => {
          state.signedIn = ok;
          const dot = root.querySelector('[data-gdot]');
          const st = root.querySelector('[data-gstatus]');
          if (dot) dot.className = 'dot ' + (ok ? 'on' : '');
          if (st && !getSettings().sheetId) st.textContent = ok ? 'Google account connected' : 'Not connected';
        })
        .catch(() => undefined);
      // Connect spreadsheet flow
      root.querySelector('[data-act="use"]')?.addEventListener('click', () => void connectFlow(ctx, root));
      root.querySelector('[data-act="gdisconnect"]')?.addEventListener('click', () => void disconnectFlow(ctx));
      // Worksheet change
      const ws = root.querySelector('[data-ws]') as HTMLSelectElement | null;
      ws?.addEventListener('change', () => void changeWorksheet(ctx, ws.value));
      // Mapping overrides
      root.querySelectorAll('[data-map]').forEach((el) =>
        el.addEventListener('change', async () => {
          const fid = (el as HTMLSelectElement).dataset.map!;
          const v = (el as HTMLSelectElement).value;
          const cm = { ...getSettings().customMap };
          if (v) cm[fid] = v;
          else delete cm[fid];
          await saveSettings({ ...getSettings(), customMap: cm });
          toast('Column mapping saved.', 'ok');
        })
      );
      // Label field toggles
      root.querySelectorAll('[data-lf]').forEach((el) =>
        el.addEventListener('change', async () => {
          const fid = (el as HTMLInputElement).dataset.lf!;
          const on = (el as HTMLInputElement).checked;
          const all = getFields().map((f) => f.id);
          const cur = s2.labelFields === null ? [...all] : [...s2.labelFields];
          const next = cur.filter((x) => x !== fid);
          if (on) next.push(fid);
          await saveSettings({ ...getSettings(), labelFields: next });
        })
      );
      root.querySelectorAll('[data-ex]').forEach((el) =>
        el.addEventListener('change', async () => {
          const k = (el as HTMLInputElement).dataset.ex as keyof Settings['labelExtras'];
          const on = (el as HTMLInputElement).checked;
          const cur = { ...getSettings().labelExtras, [k]: on };
          await saveSettings({ ...getSettings(), labelExtras: cur });
        })
      );
      // Backup
      root.querySelector('[data-act="export"]')?.addEventListener('click', () => {
        exportBackup();
        toast('Backup exported.', 'ok');
      });
      const importInput = root.querySelector('[data-importfile]') as HTMLInputElement;
      root.querySelector('[data-act="import"]')?.addEventListener('click', () => importInput.click());
      importInput?.addEventListener('change', () => {
        const f = importInput.files?.[0];
        if (!f) return;
        importBackup(f)
          .then(() => {
            toast('Settings imported.', 'ok');
            ctx.rerender();
          })
          .catch((e) => toast('Import failed: ' + (e instanceof Error ? e.message : 'invalid file'), 'err'));
      });
    },
  };
}

async function connectFlow(ctx: Ctx, root: HTMLElement): Promise<void> {
  const s = getSettings();
  const refInput = root.querySelector('[data-sheetref]') as HTMLInputElement;
  const sheetRef = refInput.value.trim();
  if (!s.clientId.trim()) {
    toast('Add your Google OAuth Client ID first (see the steps below the field).', 'err');
    return;
  }
  if (!sheetRef) {
    refInput.classList.add('invalid');
    toast('Paste your Google Sheets link or spreadsheet ID.', 'err');
    return;
  }
  const sheetId = extractSheetId(sheetRef);
  try {
    await saveSettings({ ...getSettings(), clientId: s.clientId.trim() });
    await gConnect();
    const info = await getSheetInfo(sheetId);
    if (info.sheets.length === 0) throw new Error('This spreadsheet has no worksheets.');
    const sheetName = info.sheets[0];
    saveHeaders([]); // force a fresh header read for this spreadsheet
    const headers = await ensureAllColumns(sheetId, sheetName);
    await saveSettings({ ...getSettings(), sheetId, sheetName });
    saveHeaders(headers);
    // row numbers from a previous spreadsheet are meaningless here — orders will be re-matched by order number
    await saveAllOrders(getOrders().map((o) => ({ ...o, sheetRow: undefined })));
    state.signedIn = true;
    toast(`Connected. ${headers.length} columns ready (${STD_COLS.length} standard + your fields).`, 'ok');
    ctx.rerender();
  } catch (e) {
    toast(msg(e), 'err');
  }
}

async function changeWorksheet(ctx: Ctx, name: string): Promise<void> {
  const s = getSettings();
  if (!s.sheetId || !name) return;
  try {
    saveHeaders([]); // different worksheet -> different header row
    const headers = await ensureAllColumns(s.sheetId, name);
    await saveSettings({ ...getSettings(), sheetName: name });
    saveHeaders(headers);
    toast(`Worksheet switched to "${name}".`, 'ok');
    ctx.rerender();
  } catch (e) {
    toast(msg(e), 'err');
  }
}

async function disconnectFlow(ctx: Ctx): Promise<void> {
  try {
    await gDisconnect();
  } catch { /* ignore */ }
  await saveSettings({ ...getSettings(), sheetId: '', sheetName: '' });
  saveHeaders([]);
  state.signedIn = false;
  toast('Disconnected from Google Sheets.');
  ctx.rerender();
}

