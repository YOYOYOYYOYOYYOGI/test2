// ---------------------------------------------------------------------------
// Order Fields & Spreadsheet Columns
// Field builder + mapping engine: admin config becomes columns once; orders
// always append as new rows. Existing spreadsheet columns are reused, missing
// ones are created, nothing is ever deleted.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { OrderField, Settings } from '../../types';
import { Badge, Button, Card, EmptyState, Select } from '../../components/ui';
import { FieldBuilder } from '../../components/fields/FieldBuilder';
import { bgRunSheetOp } from '../../services/messaging';
import { desiredColumns, resolveFieldColumn, autoMapHeaders, uniqueHeaders } from '../../services/spreadsheet/values';
import { LS, storage } from '../../services/storage';
import { IconCheck, IconColumns, IconRefresh } from '../../components/icons';

export function FieldsPage({ go }: { go: (r: string) => void }) {
  const store = useAppStore();
  const fields = useAppStore((s) => s.fields);
  const settings = useAppStore((s) => s.settings);
  const products = useAppStore((s) => s.products);

  const [liveHeaders, setLiveHeaders] = useState<string[] | null>(null);
  const [cachedHeaders, setCachedHeaders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const connected = settings.spreadsheet.connected || settings.demoMode;

  const headers = liveHeaders ?? cachedHeaders;

  useEffect(() => {
    void storage.getState<Record<string, number>>(LS.sheetHeaders).then((map) => setCachedHeaders(map ? Object.keys(map) : []));
  }, []);

  useEffect(() => {
    if (!connected) return;
    if (!settings.demoMode && !settings.spreadsheet.connection?.spreadsheetId) return;
    void applySchema(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySchema = async (silent = false) => {
    if (!connected) return;
    setBusy(true);
    try {
      const res = (await bgRunSheetOp({ kind: 'ensureSchema', fields, products, settings })) as { headers: string[]; created: string[] };
      setLiveHeaders(res.headers);
      if (res.created.length && !silent) {
        toast('success', `Created ${res.created.length} spreadsheet column${res.created.length > 1 ? 's' : ''}`, { message: res.created.slice(0, 6).join(', ') + (res.created.length > 6 ? '…' : '') });
      } else if (!silent) {
        toast('success', 'Spreadsheet columns are up to date', { message: 'Reused existing columns — no duplicates were created.' });
      }
    } catch (e) {
      if (!silent) {
        toast('error', 'Unable to sync columns', { message: e instanceof Error ? e.message : undefined, technical: e instanceof Error ? (e as Error & { technical?: string }).technical : undefined });
      }
    } finally {
      setBusy(false);
    }
  };

  const onChangeFields = async (next: OrderField[]) => {
    const s: Settings = { ...settings };
    const removed = new Set(fields.map((f) => f.id).filter((id) => !next.some((f) => f.id === id)));
    const included = (s.includedFields ?? next.map((f) => f.id)).filter((id) => !removed.has(id));
    const labelSel = (s.labelFields ?? []).filter((id) => !removed.has(id));
    s.includedFields = next.filter((f) => included.includes(f.id)).map((f) => f.id);
    s.labelFields = labelSel.length
      ? labelSel
      : next.filter((f) => ['customerName', 'customerWhatsapp', 'customerMobile', 'paymentStatus'].includes(String(f.key))).map((f) => f.id);
    const mappings: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.mappings ?? {})) {
      if (!removed.has(k)) mappings[k] = v;
    }
    s.mappings = mappings;
    await store.persist({ fields: next, settings: s });
    toast('success', 'Fields saved', { message: 'Field order and settings are stored — spreadsheet changes apply on the next sync or save.' });
  };

  const autoMap = async () => {
    const hdrs = headers ?? [];
    if (!hdrs.length) {
      toast('info', 'No spreadsheet headers available', { message: connected ? 'Click “Sync columns now” first.' : 'Connect a spreadsheet first.' });
      return;
    }
    const mappings = autoMapHeaders(hdrs, fields, products);
    const count = Object.keys(mappings).length;
    await store.persist({ settings: { ...settings, mappings } });
    toast('success', count ? `Auto-mapped ${count} field${count > 1 ? 's' : ''}` : 'Everything already matches', {
      message: count ? 'Check the mapping table below — you can change any entry.' : 'No mapping changes were needed.',
    });
  };

  const mappingFor = (f: OrderField): string => resolveFieldColumn(f, settings);

  const changeMapping = async (f: OrderField, column: string) => {
    const mappings = { ...(settings.mappings ?? {}) };
    if (column === '__new__') {
      mappings[f.id] = f.name.trim();
    } else if (column === '__old__') {
      delete mappings[f.id]; // fall back to the original column (kept in columnHeader)
    } else if (column) {
      mappings[f.id] = column;
    }
    await store.persist({ settings: { ...settings, mappings } });
    toast('success', 'Column mapping saved', { message: 'Applies on the next save — existing columns are reused.' });
  };

  const desired = useMemo(() => desiredColumns(fields, products, settings), [fields, products, settings]);
  const existingLower = useMemo(() => new Set((headers ?? []).map((h) => h.trim().toLowerCase())), [headers]);
  const missing = useMemo(() => uniqueHeaders(desired.filter((d) => !existingLower.has(d.trim().toLowerCase())), headers ?? []), [desired, headers, existingLower]);
  const shownFields = fields.filter((f) => (settings.includedFields ?? []).includes(f.id)).sort((a, b) => a.order - b.order);

  const includedIds = settings.products?.included ?? products.map((p) => p.id);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Order Fields</h1>
          <div className="sub">“Fields = spreadsheet columns, orders = rows”. You configure this once — every saved order is appended as one new row.</div>
        </div>
      </div>

      <Card title={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><IconColumns width={15} /> Field builder</span>}
        actions={<Badge color={connected ? 'green' : 'red'}>{connected ? 'Spreadsheet connected' : 'Not connected'}</Badge>}>
        <div className="card-pad">
          <FieldBuilder fields={fields} onChange={(f) => void onChangeFields(f)} />
          <p className="hint" style={{ marginTop: 10 }}>
            Drag rows to reorder — the order also controls the order of inputs on the New Order screen and label lines. Renaming never deletes spreadsheet data; it maps to the old column until you change it below.
          </p>
        </div>
      </Card>

      <div className="section-title">Spreadsheet columns & mapping</div>
      <Card>
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title">Column mapping</div>
          <div className="row">
            <Button size="sm" variant="ghost" icon={<IconRefresh width={13} />} onClick={() => void applySchema()} disabled={!connected || busy}>{busy ? <span className="spinner" /> : 'Sync columns now'}</Button>
            <Button size="sm" variant="outline" onClick={() => void autoMap()} disabled={!connected}>✨ Auto Map</Button>
          </div>
        </div>
        <div className="card-pad">
          {!connected ? (
            <EmptyState icon={<IconColumns width={26} height={26} />} title="No spreadsheet connected"
              sub="Connect Google Sheets (or enable Demo Mode) in Settings to see the mapping preview here."
              action={<Button variant="primary" size="sm" onClick={() => go('settings')}>Open Settings</Button>} />
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                Application field → spreadsheet column. Existing columns are detected from the first row and reused; only missing columns get created (they are added after the last header, never duplicates).
              </p>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Application field / product</th><th style={{ width: '46%' }}>Spreadsheet column</th><th>Status</th></tr></thead>
                  <tbody>
                    {shownFields.map((f) => {
                      const col = mappingFor(f);
                      const isHeader = existingLower.has(col.toLowerCase());
                      const hasMapping = Boolean(settings.mappings?.[f.id]);
                      const isNewName = col.trim() === f.name.trim() && !isHeader;
                      return (
                        <tr key={f.id}>
                          <td>{f.name} <span className="small muted">({f.type})</span></td>
                          <td>
                            <Select value={hasMapping && !isNewName ? col : isNewName ? '__new__' : '__old__'} onChange={(e) => void changeMapping(f, e.target.value)}>
                              {(headers ?? []).map((h) => <option key={h} value={h}>{h}</option>)}
                              {!isHeader && <option value="__new__">Create “{f.name}” column</option>}
                              {f.columnHeader && f.columnHeader.trim() !== f.name.trim() && <option value="__old__">Original column “{f.columnHeader}”</option>}
                            </Select>
                          </td>
                          <td>{isHeader ? <Badge color="green">reuses existing column</Badge> : <Badge color="amber">will be created</Badge>}</td>
                        </tr>
                      );
                    })}
                    {products.filter((p) => includedIds.includes(p.id)).map((p) => {
                      const col = `${p.name} Qty`;
                      const isHeader = existingLower.has(col.toLowerCase());
                      return (
                        <tr key={p.id} style={{ opacity: 0.8 }}>
                          <td>Quantity of <b>{p.name}</b> <span className="small muted">(auto)</span></td>
                          <td><span className="code-chip">{col}</span></td>
                          <td>{isHeader ? <Badge color="green">reuses existing column</Badge> : <Badge color="amber">will be created</Badge>}</td>
                        </tr>
                      );
                    })}
                    {['Total', 'Label Status', 'Printed At', 'Created At', 'Updated At'].map((sys) => {
                      const isHeader = existingLower.has(sys.toLowerCase());
                      return (
                        <tr key={sys} style={{ opacity: 0.65 }}>
                          <td><i>{sys}</i> <span className="small muted">(automatic)</span></td>
                          <td><span className="code-chip">{sys}</span></td>
                          <td>{isHeader ? <Badge color="green">exists</Badge> : <Badge color="amber">will be created</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge color={missing.length ? 'amber' : 'green'}>
                  {missing.length === 0 ? <><IconCheck width={11} /> Columns up to date</> : `${missing.length} column${missing.length > 1 ? 's' : ''} to create`}
                </Badge>
                {missing.length > 0 && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {missing.map((m) => <span key={m} className="code-chip">{m}</span>)}
                  </div>
                )}
                <span className="hint">{headers?.length ?? 0} columns currently detected in “{settings.spreadsheet.connection?.worksheetName ?? settings.demoMode ? 'Orders (demo)' : ''}”</span>
              </div>
            </>
          )}
        </div>
      </Card>
      <p className="hint" style={{ marginTop: 8 }}>Existing spreadsheet rows are never modified or deleted by this page. Edits to an order update only its own row.</p>
    </div>
  );
}
