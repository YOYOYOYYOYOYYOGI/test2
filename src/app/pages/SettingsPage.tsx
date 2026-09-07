// ---------------------------------------------------------------------------
// Settings — Business / Spreadsheet / Order numbering / Label / Backup
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { LabelSizeId, Order, Settings } from '../../types';
import { LABEL_SIZES, ORDER_STATUSES, PAYMENT_STATUSES, formatDate } from '../../lib/constants';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Field, Input, Select, TextArea, Toggle, downloadFile } from '../../components/ui';
import { IconDownload, IconUpload, IconLink } from '../../components/icons';
import { LS, storage, inExtension } from '../../services/storage';
import { bgAuthConnect, bgSyncPendingOrders, bgListSpreadsheets, bgListWorksheets } from '../../services/messaging';
import { LabelPreviewModal } from '../../components/label/LabelPreviewModal';

type Tab = 'business' | 'spreadsheet' | 'order' | 'label' | 'backup';

export function SettingsPage({ go }: { go: (r: string) => void }) {
  const [tab, setTab] = useState<Tab>('business');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'business', label: 'Business' },
    { id: 'spreadsheet', label: 'Spreadsheet' },
    { id: 'order', label: 'Order Numbers' },
    { id: 'label', label: 'Label Design' },
    { id: 'backup', label: 'Backup & Data' },
  ];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Everything is stored locally on this computer (except your order rows, which live in your spreadsheet).</div>
        </div>
      </div>
      <div className="tabs">
        {tabs.map((t) => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'business' && <BusinessTab />}
      {tab === 'spreadsheet' && <SpreadsheetTab go={go} />}
      {tab === 'order' && <OrderTab />}
      {tab === 'label' && <LabelTab />}
      {tab === 'backup' && <BackupTab go={go} />}
    </div>
  );
}

function useDraft<T>(pick: (s: Settings) => T): [T, (v: T) => void, () => void] {
  const settings = useAppStore((s) => s.settings);
  const [draft, setDraft] = useState<T>(() => pick(settings));
  useEffect(() => setDraft(pick(settings)), [settings]);
  return [draft, setDraft, () => setDraft(pick(settings))];
}

// ---------------------------------------------------------------------------
function BusinessTab() {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const [draft, setDraft] = useState({ ...settings.business });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.business);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    await store.persist({ settings: { ...settings, business: draft } });
    toast('success', 'Business details saved', { message: 'Used on labels and export.' });
  };

  const pickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(512, Math.max(128, img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const s = Math.min(img.width, img.height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        setDraft((d) => ({ ...d, logoDataUrl: canvas.toDataURL('image/jpeg', 0.85) }));
        toast('success', 'Logo added');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const f = (key: keyof Settings['business'], label: string, placeholder = '') => (
    <Field label={label}>
      <Input value={draft[key] ?? ''} placeholder={placeholder} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </Field>
  );

  return (
    <div style={{ maxWidth: 760 }}>
      <Card title="Business details" actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>Save</Button>}>
        <div className="card-pad">
          <div className="row" style={{ alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
            <div style={{ width: 96, height: 96, borderRadius: 12, border: '1px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff', flex: '0 0 auto' }}>
              {draft.logoDataUrl ? <img src={draft.logoDataUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="logo" /> : <span className="muted small">Logo</span>}
            </div>
            <div className="col" style={{ gap: 6 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f0 = e.target.files?.[0]; if (f0) pickLogo(f0); e.target.value = ''; }} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Upload logo</Button>
              {draft.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, logoDataUrl: '' })}>Remove logo</Button>}
              <span className="hint">Shown on printed labels (black & white friendly). PNG/JPG.</span>
            </div>
          </div>
          <div className="form-grid">
            {f('name', 'Business name', 'My Business')}
            {f('phone', 'Phone', '9876543210')}
            {f('whatsapp', 'WhatsApp number')}
            {f('email', 'Email')}
            {f('website', 'Website')}
            {f('gst', 'GST number')}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Business address</label>
            <TextArea value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} rows={2} />
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SpreadsheetTab({ go }: { go: (r: string) => void }) {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [sheetList, setSheetList] = useState<{ id: string; name: string }[] | null>(null);
  const [worksheets, setWorksheets] = useState<string[] | null>(null);
  const [sheetId, setSheetId] = useState('');
  const [worksheet, setWorksheet] = useState('');

  const conn = settings.spreadsheet.connection;

  const connect = async () => {
    if (!inExtension()) { toast('error', 'Google sign-in requires the Chrome extension', { message: 'Load the built extension in Chrome (see README) — or enable Demo Mode below.' }); return; }
    setBusy(true);
    try {
      const res = await bgAuthConnect();
      if (res && typeof res === 'object' && 'email' in res) {
        toast('success', 'Google account connected');
        await store.refreshConfig();
      }
    } catch (e) {
      toast('error', 'Connection failed', { message: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const { bgAuthLogout } = await import('../../services/messaging');
      await bgAuthLogout();
      await store.refreshConfig();
      toast('info', 'Spreadsheet disconnected', { message: 'Orders will keep saving locally until you reconnect.' });
    } finally { setBusy(false); setConfirmDisconnect(false); }
  };

  const changeTarget = async () => {
    if (!sheetId || !worksheet) { toast('error', 'Pick a spreadsheet and worksheet'); return; }
    setBusy(true);
    try {
      const { bgSaveConnection } = await import('../../services/messaging');
      const meta = sheetList?.find((s) => s.id === sheetId);
      await bgSaveConnection({ spreadsheetId: sheetId, spreadsheetName: meta?.name ?? 'Spreadsheet', worksheetName: worksheet });
      await store.refreshConfig();
      setSheetList(null); setWorksheets(null);
      toast('success', 'Spreadsheet updated');
    } catch (e) {
      toast('error', 'Update failed', { message: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  const toggleDemo = async (demo: boolean) => {
    if (demo && !confirm('Enter Demo Mode?\n\nOrders will be kept only on this computer (a local sample sheet). Google Sheets connection will stay available but unused until you exit demo mode.')) return;
    await store.persist({ settings: { ...settings, demoMode: demo } });
    toast('success', demo ? 'Demo Mode on' : 'Demo Mode off');
  };

  const demo = settings.demoMode;

  return (
    <div style={{ maxWidth: 760 }} className="col">
      <Card title="Connection" actions={!demo ? <Badge color="green">Connected</Badge> : <Badge color="amber">Demo mode</Badge>}>
        <div className="card-pad col" style={{ gap: 10 }}>
          {demo && (
            <div className="col" style={{ background: 'var(--warning-soft)', borderRadius: 10, padding: 12 }}>
              <b>Demo Mode is ON</b>
              <span className="small">Orders are simulated on this computer. Nothing is sent to Google. Disable it to use your real spreadsheet again.</span>
              <div><Button size="sm" variant="outline" onClick={() => void toggleDemo(false)}>Exit Demo Mode</Button></div>
            </div>
          )}
          {!demo && !conn && (
            <div className="col" style={{ gap: 8 }}>
              <p>Connect your Google account to store orders in Google Sheets. The extension asks only for its own tokens — no passwords are stored, and nothing is sent to any third party.</p>
              <Button variant="secondary" style={{ alignSelf: 'flex-start' }} onClick={connect} disabled={busy}>{busy ? <span className="spinner" /> : 'Connect Google Account'}</Button>
              <Button variant="outline" style={{ alignSelf: 'flex-start' }} onClick={() => void toggleDemo(true)}>or use Demo Mode</Button>
            </div>
          )}
          {!demo && conn && (
            <>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                <Field label="Google account"><Input value={conn.email ?? 'Connected'} disabled style={{ width: 300 }} /></Field>
                <Field label="Spreadsheet"><Input value={conn.spreadsheetName || '(pick below)'} disabled style={{ width: 280 }} /></Field>
                <Field label="Worksheet"><Input value={conn.worksheetName || 'Orders'} disabled style={{ width: 160 }} /></Field>
              </div>
              {conn.spreadsheetId && (
                <div className="row">
                  <Button size="sm" variant="outline" icon={<IconLink width={13} />}
                    onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${conn.spreadsheetId}/edit`, '_blank')}>
                    Open spreadsheet in Google Sheets
                  </Button>
                </div>
              )}
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Button size="sm" variant="outline" onClick={() => void (async () => {
                  setBusy(true);
                  try {
                    const list = await bgListSpreadsheets();
                    setSheetList(list);
                    if (list[0]) { setSheetId(list[0].id); const w = await bgListWorksheets(list[0].id); setWorksheets(w); setWorksheet(w[0] ?? ''); }
                  } catch (e) {
                    toast('error', 'Could not read your spreadsheets', { message: e instanceof Error ? e.message : undefined });
                  } finally { setBusy(false); }
                })()}>{busy ? <span className="spinner" /> : 'Change spreadsheet…'}</Button>
                <Button size="sm" variant="ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDisconnect(true)}>Disconnect</Button>
              </div>
              {sheetList && (
                <div className="col" style={{ gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
                  <Field label="Spreadsheet">
                    <Select value={sheetId} onChange={(e) => void (async () => {
                      setSheetId(e.target.value);
                      try { const w = await bgListWorksheets(e.target.value); setWorksheets(w); setWorksheet(w[0] ?? ''); } catch { /* ignore */ }
                    })()}>
                      {sheetList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  {worksheets && (
                    <Field label="Worksheet"><Select value={worksheet} onChange={(e) => setWorksheet(e.target.value)}>{worksheets.map((w) => <option key={w} value={w}>{w}</option>)}</Select></Field>
                  )}
                  <div className="row"><Button size="sm" variant="primary" onClick={() => void changeTarget()} disabled={busy}>Use this spreadsheet</Button><Button size="sm" variant="ghost" onClick={() => setSheetList(null)}>Cancel</Button></div>
                </div>
              )}
            </>
          )}
          <p className="hint">Rows are written only by this extension. If you already have a spreadsheet with data, its columns are detected and reused — the first row is treated as the header row.</p>
        </div>
      </Card>
      <ConfirmDialog open={confirmDisconnect} title="Disconnect Google Sheets?"
        message="Existing rows in the spreadsheet are kept. New orders will be stored locally until you reconnect."
        confirmLabel="Disconnect" danger busy={busy} onConfirm={() => void disconnect()} onCancel={() => setConfirmDisconnect(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function OrderTab() {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const [draft, setDraft] = useState({ ...settings.order });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.order);

  const save = async () => {
    await store.persist({ settings: { ...settings, order: draft } });
    toast('success', 'Order number settings saved');
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <Card title="Automatic order numbers" actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>Save</Button>}>
        <div className="card-pad col" style={{ gap: 12 }}>
          <Toggle checked={draft.autoNumber} onChange={(v) => setDraft({ ...draft, autoNumber: v })} label={<><b>Automatic numbering</b> <span className="hint">— orders get the next number automatically (e.g. ORD-1001, ORD-1002…)</span></>} />
          <div className="form-grid">
            <Field label="Prefix" hint="e.g. ORD-"><Input value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} placeholder="ORD-" /></Field>
            <Field label="Starting number" hint="First order gets this number"><Input type="number" value={draft.startNumber} onChange={(e) => setDraft({ ...draft, startNumber: parseInt(e.target.value || '1', 10) })} /></Field>
            <Field label="Zero padding (0 = none)" hint="4 → ORD-1001 stays; 6 → ORD-001001"><Input type="number" min={0} max={8} value={draft.padding} onChange={(e) => setDraft({ ...draft, padding: parseInt(e.target.value || '0', 10) })} /></Field>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <Toggle checked={draft.manualNumbering} onChange={(v) => setDraft({ ...draft, manualNumbering: v, autoNumber: !v ? draft.autoNumber : true })}
              label={<><b>Allow manual order numbers</b> <span className="hint">— the New Order screen lets you type the order number instead of using the automatic one</span></>} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }} className="form-grid">
            <Field label="Default payment status"><Select value={draft.defaultPaymentStatus} onChange={(e) => setDraft({ ...draft, defaultPaymentStatus: e.target.value as Settings['order']['defaultPaymentStatus'] })}>{PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Default order status"><Select value={draft.defaultOrderStatus} onChange={(e) => setDraft({ ...draft, defaultOrderStatus: e.target.value as Settings['order']['defaultOrderStatus'] })}>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <p className="hint">Duplicates are blocked: saving an order number that already exists asks what you want to do. The counter always skips numbers that are already in use.</p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function LabelTab() {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const orders = useAppStore((s) => s.orders);
  const [draft, setDraft] = useState<Settings['labels']>({ ...settings.labels });
  const [draftFields, setDraftFields] = useState<string[]>(settings.labelFields ?? []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.labels) || JSON.stringify(draftFields) !== JSON.stringify(settings.labelFields);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

  const included = (f: { id: string }) => draftFields.includes(f.id);
  const labelable = [...fields].sort((a, b) => a.order - b.order).filter((f) => !['productsSummary', 'quantity', 'totalAmount', 'createdAt', 'updatedAt'].includes(String(f.key)));

  const save = async () => {
    await store.persist({ settings: { ...settings, labels: draft, labelFields: draftFields } });
    toast('success', 'Label settings saved', { message: 'Used by new print jobs.' });
  };

  const toggle = (k: keyof Settings['labels']) => setDraft({ ...draft, [k]: !draft[k] });

  const toggleField = (id: string) => {
    setDraftFields((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const sizeDef = LABEL_SIZES[draft.sizeId] ?? LABEL_SIZES['4x6'];

  return (
    <div style={{ maxWidth: 900 }} className="col">
      <Card title="Label size" actions={
        <div className="row">
          <Button size="sm" variant="outline" disabled={orders.length === 0} onClick={() => setPreviewOrder(orders[0])}>👁 Preview label</Button>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>Save</Button>
        </div>
      }>
        <div className="card-pad">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(Object.keys(LABEL_SIZES) as LabelSizeId[]).filter((id) => id !== 'custom').map((id) => {
              const s = LABEL_SIZES[id];
              return (
                <button key={id} className={`pill-btn ${draft.sizeId === id ? 'selected' : ''}`}
                  onClick={() => setDraft({ ...draft, sizeId: id, widthMm: s.widthMm, heightMm: s.heightMm })}>
                  {s.label}
                </button>
              );
            })}
            <button className={`pill-btn ${draft.sizeId === 'custom' ? 'selected' : ''}`} onClick={() => setDraft({ ...draft, sizeId: 'custom', widthMm: 100, heightMm: 150 })}>Custom</button>
          </div>
          <div className="form-grid" style={{ marginTop: 12, maxWidth: 420 }}>
            <Field label="Width (mm)"><Input type="number" value={draft.widthMm} onChange={(e) => setDraft({ ...draft, widthMm: parseFloat(e.target.value || '100') })} /></Field>
            <Field label="Height (mm)"><Input type="number" value={draft.heightMm} onChange={(e) => setDraft({ ...draft, heightMm: parseFloat(e.target.value || '150') })} /></Field>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Default for thermal shipping labels: 4 × 6 inch. Each label prints on its own page at exact size (select the printer's “actual size / 100%” option).</p>
        </div>
      </Card>

      <Card title="What appears on the label">
        <div className="card-pad col" style={{ gap: 8 }}>
          <div className="grid grid-2" style={{ gap: 4 }}>
            <Checkbox checked={draft.showBusinessHeader} onChange={() => toggle('showBusinessHeader')} label="Business header (name, phone, GST…)" />
            <Checkbox checked={draft.showOrderNumber} onChange={() => toggle('showOrderNumber')} label="Order number bar" />
            <Checkbox checked={draft.showCustomer} onChange={() => toggle('showCustomer')} label="Customer name" />
            <Checkbox checked={draft.showAddress} onChange={() => toggle('showAddress')} label="Ship-to address block" />
            <Checkbox checked={draft.showProducts} onChange={() => toggle('showProducts')} label="Products with quantities" />
            <Checkbox checked={draft.showPayment} onChange={() => toggle('showPayment')} label="Payment status & method" />
            <Checkbox checked={draft.showQrCode} onChange={() => toggle('showQrCode')} label="QR code (order + customer + phone)" />
            <Checkbox checked={draft.showBarcode} onChange={() => toggle('showBarcode')} label="Barcode (order number)" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div className="hint" style={{ marginBottom: 6, fontWeight: 600 }}>Rows on the label (tick the fields to print):</div>
            <div className="grid grid-2" style={{ gap: 2 }}>
              {labelable.map((f) => (
                <Checkbox key={f.id} checked={included(f)} onChange={() => toggleField(f.id)} label={f.name} />
              ))}
              {labelable.length === 0 && <span className="hint">No fields yet — add fields on the Fields &amp; Columns page.</span>}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <Toggle checked={draft.showFooter} onChange={(v) => setDraft({ ...draft, showFooter: v })} label={<b>Footer text</b>} />
            {draft.showFooter && (
              <Input style={{ marginTop: 6 }} value={draft.footerText} placeholder="Thank you for your order!" onChange={(e) => setDraft({ ...draft, footerText: e.target.value })} />
            )}
          </div>
        </div>
      </Card>
      {previewOrder && <LabelPreviewModal order={previewOrder} onClose={() => setPreviewOrder(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BackupTab({ go }: { go: (r: string) => void }) {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const orders = useAppStore((s) => s.orders);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportOrders = async (format: 'csv' | 'json') => {
    const all: Order[] = orders;
    if (format === 'json') {
      downloadFile(`orders-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json');
    } else {
      const headers = ['Order Number', 'Customer Name', 'WhatsApp', 'Mobile', 'Address', 'City', 'State', 'Pincode', 'Products', 'Payment Status', 'Payment Method', 'Transaction ID', 'Order Status', 'Amount', 'Label', 'Created At'];
      const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [headers.join(','), ...all.map((o) => [
        o.orderNumber, o.customer.name, o.customer.whatsapp, o.customer.mobile, o.customer.address, o.customer.city, o.customer.state, o.customer.pincode,
        Object.values(o.products).map((p) => `${p.productName} x${p.quantity}`).join(' | '),
        o.paymentStatus, o.paymentMethod, o.transactionId, o.orderStatus, o.totalAmount, o.printed, formatDate(o.createdAt, true),
      ].map(esc).join(','))];
      downloadFile(`orders-${new Date().toISOString().slice(0, 10)}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv');
    }
    toast('success', `${all.length} orders exported`);
  };

  const exportSettings = async () => {
    const { storage: st } = await import('../../services/storage');
    const payload = await st.exportSettings();
    downloadFile(`order-label-manager-config-${new Date().toISOString().slice(0, 10)}.json`, payload, 'application/json');
    toast('success', 'Configuration exported');
  };

  const importSettings = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { app?: string; version?: number; settings?: Settings; fields?: unknown[]; products?: unknown[] };
      if (data.app !== 'order-label-manager') throw new Error('This is not an Order Label Manager backup file.');
      const nextSettings = { ...settings, ...(data.settings ?? {}), spreadsheet: settings.spreadsheet };
      await store.persist({
        settings: nextSettings,
        fields: (Array.isArray(data.fields) ? data.fields : []) as import('../../types').OrderField[],
        products: (Array.isArray(data.products) ? data.products : []) as import('../../types').Product[],
      });
      await storage.set(LS.nextOrderNumber, (settings.order.startNumber + 1).toString());
      toast('success', 'Configuration imported', { message: 'Spreadsheet connection was kept. Review settings before saving the next order.' });
    } catch (e) {
      toast('error', 'Import failed', { message: e instanceof Error ? e.message : 'Invalid file.' });
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await bgSyncPendingOrders();
      toast('success', `Sync complete: ${res.synced} synced${res.failed ? `, ${res.failed} still pending` : ''}`);
    } catch (e) {
      toast('error', 'Sync failed', { message: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  const resetAll = async () => {
    setBusy(true);
    try {
      await storage.remove([LS.settings, LS.fields, LS.products, LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.setupDone, LS.sheetHeaders, LS.lastRow, LS.demoSeed]);
      window.location.hash = '#/';
      window.location.reload();
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 760 }} className="col">
      <Card title="Export orders">
        <div className="card-pad row" style={{ gap: 8 }}>
          <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void exportOrders('csv')}>Export CSV</Button>
          <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void exportOrders('json')}>Export JSON</Button>
          <span className="hint">All {orders.length} orders currently stored locally. The spreadsheet itself is always the primary copy of order data.</span>
        </div>
      </Card>
      <Card title="Backup configuration">
        <div className="card-pad col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void exportSettings()}>Export Settings</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f0 = e.target.files?.[0]; if (f0) void importSettings(f0); e.target.value = ''; }} />
            <Button variant="outline" icon={<IconUpload width={14} />} onClick={() => fileRef.current?.click()}>Import Settings</Button>
          </div>
          <p className="hint">Fields, products, label design and mappings — everything except orders. Restore this file on another computer to reuse the same configuration.</p>
        </div>
      </Card>
      <Card title="Sync & connection">
        <div className="card-pad col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 10 }}>
            <Badge color={settings.demoMode ? 'amber' : settings.spreadsheet.connected ? 'green' : 'red'}>{settings.demoMode ? 'Demo' : settings.spreadsheet.connected ? 'Google Sheets connected' : 'Local only'}</Badge>
            <Button size="sm" variant="outline" onClick={() => void syncNow()} disabled={busy}>{busy ? <span className="spinner" /> : 'Sync pending orders now'}</Button>
          </div>
          <p className="hint">Pending offline orders sync automatically when the extension starts and when the connection returns.</p>
        </div>
      </Card>
      <Card title="Reset" actions={<Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>Reset everything</Button>}>
        <div className="card-pad">
          <p className="hint" style={{ lineHeight: 1.6 }}>
            Removes <b>all</b> local orders, fields, products and settings from this computer, then restarts the setup wizard. Spreadsheet rows on Google are not touched.
          </p>
        </div>
      </Card>
      <ConfirmDialog open={confirmReset} title="Reset everything?"
        message="All local orders, fields, products and settings will be erased from this computer. Rows already written to Google Sheets stay untouched. Continue?"
        confirmLabel="Yes, reset" danger busy={busy} onConfirm={() => void resetAll()} onCancel={() => setConfirmReset(false)} />
      <p className="hint">Products &amp; fields have their own full pages in the sidebar — this tab covers operational data.</p>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('products')}>Open Products</button>
    </div>
  );
}

