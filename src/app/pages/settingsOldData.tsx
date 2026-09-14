// ---------------------------------------------------------------------------
// Settings → Old Data: import an old customer/order Excel/CSV file.
//
// Flow: pick file → validate columns → NORMALIZED PREVIEW (order numbers like
// "3542" — never "3542.0"; phones like "8347034843" — never "8.347034843E9")
// → confirm Import → stored SEPARATELY from new orders (own storage key).
// Imported data is only used for WhatsApp → previous-order lookup + autofill
// on the New Order page; never counted in dashboards/sales/Excel exports.
// ---------------------------------------------------------------------------
import { useRef, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import { fileToRows, scanHeaders, missingRequiredColumns, rowsToOldRecords } from '../../lib/tableImport';
import { clearOldOrders, mergeOldOrders } from '../../services/oldOrders';
import { normalizePhone, normalizePhoneText } from '../../lib/normalizePhone';
import type { OldOrderRecord } from '../../types';
import { Button, Card } from '../../components/ui';
import { IconUpload, IconTrash } from '../../components/icons';

const MAX_BYTES = 40 * 1024 * 1024; // 40 MB safety cap

interface PendingImport {
  records: OldOrderRecord[];
  skipped: number;
  fileName: string;
}

interface PreviewRow {
  orderNumber: string;
  name: string;
  whatsapp: string;
  mobile: string;
  address: string;
}

export function OldDataTab() {
  const oldOrders = useAppStore((s) => s.oldOrders);
  const refreshConfig = useAppStore((s) => s.refreshConfig);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);

  const previewRows = (records: OldOrderRecord[], count: number): PreviewRow[] =>
    records.slice(0, count).map((r) => ({
      orderNumber: r.orderNumber,
      name: r.name,
      whatsapp: normalizePhone(r.whatsapp),
      mobile: r.mobile ? normalizePhoneText(r.mobile) : '',
      address: r.address,
    }));

  /** Phase 1 — read + validate + show the normalized preview. */
  const pickFile = async (file: File) => {
    if (busy) return;
    if (file.size > MAX_BYTES) {
      toast('error', 'File is too large', { message: 'Please keep old-data files under 40 MB.' });
      return;
    }
    setBusy(true);
    try {
      const rows = await fileToRows(file);
      if (rows.length === 0) throw new Error('The file is empty.');
      const scan = scanHeaders(rows);
      const missing = missingRequiredColumns(scan);
      if (missing.length > 0) {
        toast('error', 'Required column missing', { message: `Required column missing: ${missing.join(', ')}` });
        return;
      }
      const { records, skipped } = rowsToOldRecords(rows, scan);
      if (records.length === 0) {
        toast('info', 'No usable rows found', { message: 'Every row needs an Order Number and a Whatsapp Number.' });
        return;
      }
      setPending({ records, skipped, fileName: file.name });
      setPreview(previewRows(records, 8));
      toast('info', 'Review the preview', { message: `${records.length} rows ready — numbers are shown cleaned (e.g. 8347034843, never 8.347034843E9).` });
    } catch (e) {
      console.error('[old data import] technical detail:', e);
      toast('error', 'Import failed', { message: e instanceof Error ? e.message : 'Could not read that file. Use .xlsx or .csv.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** Phase 2 — confirm: store the reviewed records. */
  const doImport = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await mergeOldOrders(pending.records);
      await refreshConfig();
      setPreview(previewRows(pending.records, 5));
      const bits = [
        `Imported ${res.added} old order${res.added === 1 ? '' : 's'}`,
        res.skipped > 0 ? `${res.skipped} skipped (already stored)` : undefined,
        pending.skipped > 0 ? `${pending.skipped} rows skipped in this file (empty / no number)` : undefined,
      ].filter(Boolean).join(' · ');
      toast('success', `Old customer data imported (${res.total} stored)`, { message: bits });
      setPending(null);
    } catch (e) {
      console.error('[old data import] technical detail:', e);
      toast('error', 'Import failed', { message: e instanceof Error ? e.message : 'Could not save the records.' });
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    setPending(null);
    setPreview([]);
  };

  const doClear = async () => {
    if (clearing) return;
    if (!confirm(`Delete ALL ${oldOrders.length} imported old-customer records? New orders are not affected.`)) return;
    setClearing(true);
    try {
      await clearOldOrders();
      await refreshConfig();
      setPreview([]);
      toast('success', 'Old customer data cleared');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <Card title="Old Customer Data"
        actions={oldOrders.length > 0 ? (
          <Button size="sm" variant="dangerOutline" icon={<IconTrash width={13} />} disabled={clearing} onClick={() => void doClear()}>
            {clearing ? <span className="spinner" /> : 'Clear All'}
          </Button>
        ) : undefined}>
        <div className="card-pad col" style={{ gap: 12 }}>
          <p className="hint" style={{ margin: 0, lineHeight: 1.6 }}>
            Upload an old customer/order sheet (<b>.xlsx</b> or <b>.csv</b>) with these columns:{' '}
            <span className="mono">Order Number · Name · Address · Whatsapp Number · Mobile Number</span>.
            <b> Mobile Number</b> is optional and stays separate from WhatsApp (blank stays blank).
            Extra columns are kept too and autofill matching fields (City, State, Pincode, custom fields…).
          </p>
          <div className="row" style={{ gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); }}
            />
            <Button variant="primary" icon={<IconUpload width={14} />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <span className="spinner" /> : 'Import Excel / CSV'}
            </Button>
            <span className="hint">{oldOrders.length} old order{oldOrders.length === 1 ? '' : 's'} stored</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
            <b>How it works</b><br />
            • Imported records are stored separately — they are <b>never</b> counted in the dashboard, today's sales or Excel exports.<br />
            • On the <b>New Order</b> page, typing a WhatsApp <b>or Mobile</b> number instantly finds that customer's previous orders — imported history <b>and</b> newer orders created from it (the order chain).<br />
            • Choosing one autofills Name / WhatsApp / Mobile / Address / other fields (everything stays editable) and loads its <b>complete</b> order number into the Order Number field as a starting point — you type the new number before it, e.g. <span className="mono">15000-14030-11694-9602-4776</span>, and the chain continues exactly once (next time <span className="mono">15001-15000-14030-11694-9602-4776</span>). Order numbers are always manual — nothing is generated automatically.<br />
            • WhatsApp &amp; order numbers are always stored as text — scientific notation (<span className="mono">8.347034843E9</span>) and <span className="mono">.0</span> suffixes are cleaned automatically.
          </div>
        </div>
      </Card>

      {/* Preview before import (phase 1 result) */}
      {pending && (
        <Card title={`Review before importing (${pending.fileName})`}>
          <div className="table-wrap" style={{ margin: 0, maxHeight: 260, overflowY: 'auto' }}>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead><tr><th>Order Number</th><th>Name</th><th>WhatsApp</th><th>Mobile</th><th>Address</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.orderNumber}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.whatsapp}</td>
                    <td className="mono">{r.mobile || '—'}</td>
                    <td className="small muted">{r.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {pending.records.length} usable row{pending.records.length === 1 ? '' : 's'}
            {pending.skipped > 0 ? ` · ${pending.skipped} skipped (empty / missing number)` : ''} — order numbers and WhatsApp numbers are cleaned before saving.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Button variant="primary" disabled={busy} onClick={() => void doImport()}>
              {busy ? <span className="spinner" /> : `Import ${pending.records.length} row${pending.records.length === 1 ? '' : 's'}`}
            </Button>
            <Button variant="outline" disabled={busy} onClick={cancelImport}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Preview of the last imported batch */}
      {!pending && preview.length > 0 && (
        <Card title="Imported records">
          <div className="table-wrap" style={{ margin: 0 }}>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead><tr><th>Order Number</th><th>Name</th><th>WhatsApp</th><th>Mobile</th><th>Address</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.orderNumber}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.whatsapp}</td>
                    <td className="mono">{r.mobile || '—'}</td>
                    <td className="small muted">{r.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {oldOrders.length === 0 && !pending && preview.length === 0 && (
        <p className="hint" style={{ marginTop: 12 }}>Nothing imported yet. Old data is optional — it only powers the previous-order lookup on the New Order page.</p>
      )}
    </div>
  );
}
