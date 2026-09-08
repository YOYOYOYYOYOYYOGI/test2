// ---------------------------------------------------------------------------
// Settings → Old Data: import an old customer/order Excel/CSV file.
// Records are stored SEPARATELY from new orders (their own storage key) and
// are used only for WhatsApp → previous-orders lookup + autofill on the
// New Order page. They are never counted in dashboards/sales/Excel exports.
// ---------------------------------------------------------------------------
import { useRef, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import { fileToRows, scanHeaders, missingRequiredColumns, rowsToOldRecords } from '../../lib/tableImport';
import { clearOldOrders, mergeOldOrders } from '../../services/oldOrders';
import { Button, Card } from '../../components/ui';
import { IconUpload, IconTrash } from '../../components/icons';

const MAX_BYTES = 40 * 1024 * 1024; // 40 MB safety cap

export function OldDataTab() {
  const oldOrders = useAppStore((s) => s.oldOrders);
  const refreshConfig = useAppStore((s) => s.refreshConfig);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [preview, setPreview] = useState<{ orderNumber: string; name: string; whatsapp: string; address: string }[]>([]);

  const importFile = async (file: File) => {
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
      const res = await mergeOldOrders(records);
      await refreshConfig();
      setPreview(records.slice(0, 5).map((r) => ({ orderNumber: r.orderNumber, name: r.name, whatsapp: r.whatsapp, address: r.address })));
      const bits = [
        `Imported ${res.added} old order${res.added === 1 ? '' : 's'}`,
        res.skipped > 0 ? `${res.skipped} skipped (empty rows / duplicates)` : undefined,
        skipped > 0 ? `${skipped} rows skipped in this file` : undefined,
      ].filter(Boolean).join(' · ');
      toast('success', `Old customer data imported (${res.total} stored)`, { message: bits });
    } catch (e) {
      console.error('[old data import] technical detail:', e);
      toast('error', 'Import failed', { message: e instanceof Error ? e.message : 'Could not read that file. Use .xlsx or .csv.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
            <span className="mono">Order Number · Name · Address · Whatsapp Number</span>.
            Extra columns are kept too and autofill matching fields (City, State, Pincode, custom fields…).
          </p>
          <div className="row" style={{ gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }}
            />
            <Button variant="primary" icon={<IconUpload width={14} />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <span className="spinner" /> : 'Import Excel / CSV'}
            </Button>
            <span className="hint">{oldOrders.length} old order{oldOrders.length === 1 ? '' : 's'} stored</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
            <b>How it works</b><br />
            • Imported records are stored separately — they are <b>never</b> counted in the dashboard, today's sales or Excel exports.<br />
            • On the <b>New Order</b> page, typing a WhatsApp number instantly finds that customer's previous orders.<br />
            • Choosing one autofills Name / Address / other fields and appends the old order number to the new auto number, e.g. <span className="mono">14000-4673-4312-3542</span>.<br />
            • The same WhatsApp number can appear many times (different old orders) — nothing is deleted or merged automatically.
          </div>
        </div>
      </Card>

      {preview.length > 0 && (
        <Card title="Just imported">
          <div className="table-wrap" style={{ margin: 0 }}>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead><tr><th>Order Number</th><th>Name</th><th>WhatsApp</th><th>Address</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.orderNumber}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.whatsapp}</td>
                    <td className="small muted">{r.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {oldOrders.length === 0 && preview.length === 0 && (
        <p className="hint" style={{ marginTop: 12 }}>Nothing imported yet. Old data is optional — it only powers the previous-order lookup on the New Order page.</p>
      )}
    </div>
  );
}
