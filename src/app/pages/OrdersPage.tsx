// ---------------------------------------------------------------------------
// Orders — history, search, filters, details, multi-label printing
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { Order } from '../../types';
import { formatDate, formatMoney, startOfDay, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../../lib/constants';
import { hasDeliverySettings } from '../../lib/delivery';
import { orderDelivery, orderSubtotal, orderTotal } from '../../lib/format';
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Input, Modal, Pagination, Select, paymentBadgeColor, orderStatusColor } from '../../components/ui';
import { IconCopy, IconDownload, IconEye, IconList, IconPrinter, IconRefresh, IconSearch, IconTrash } from '../../components/icons';
import { openPrintPage } from '../../components/label/printFlow';
import { LabelPreviewModal } from '../../components/label/LabelPreviewModal';
import { downloadBlob, prepareOrdersExport } from '../../services/excelExport';
import { downloadOrderLabelPdf, labelDownloadErrorMessage } from '../../services/labelDownload';

type DateFilter = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export function OrdersPage({ go }: { go: (r: string, param?: string) => void }) {
  const orders = useAppStore((s) => s.orders);
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const products = useAppStore((s) => s.products);
  const removeOrder = useAppStore((s) => s.removeOrder);
  const refreshConfig = useAppStore((s) => s.refreshConfig);

  const [q, setQ] = useState(() => {
    const m = window.location.hash.match(/[?&]q=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  });
  const [pay, setPay] = useState('all');
  const [method, setMethod] = useState('all');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState<DateFilter>('all');
  const [fromD, setFromD] = useState('');
  const [toD, setToD] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<Order | null>(null);
  const [labelOrder, setLabelOrder] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [xlBusy, setXlBusy] = useState<'today' | 'all' | 'filtered' | null>(null);
  const [dlLabelId, setDlLabelId] = useState<string | null>(null);

  const exportCtx = useMemo(() => ({ settings, fields, products }), [settings, fields, products]);

  const downloadExcel = async (kind: 'today' | 'all' | 'filtered', source?: Order[]) => {
    if (xlBusy) return;
    setXlBusy(kind);
    try {
      // Uses the extension's own order cache (mirror of the Google Sheet) —
      // no extra data source, no full sheet re-download. 'filtered' exports
      // exactly the orders currently shown on this page.
      const rows = kind === 'filtered' && source ? source : orders;
      const { filename, blob, count } = prepareOrdersExport(kind, rows, exportCtx);
      if (count === 0) {
        toast('info', kind === 'today' ? 'No orders created today yet.' : kind === 'filtered' ? 'No orders match the current filters.' : 'No orders stored yet.');
        return;
      }
      downloadBlob(filename, blob);
      toast('success', `${filename} downloaded — ${count} order${count === 1 ? '' : 's'}.`);
    } catch (e) {
      toast('error', 'Excel download failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setXlBusy(null);
    }
  };

  const downloadLabel = async (o: Order) => {
    if (dlLabelId) return;
    setDlLabelId(o.id);
    try {
      const res = await downloadOrderLabelPdf(o, settings, fields);
      toast('success', `${res.filename} downloaded.`);
    } catch (e) {
      toast('error', labelDownloadErrorMessage(e), { message: 'Please try again. If it keeps failing, check the browser console for technical details.' });
    } finally {
      setDlLabelId(null);
    }
  };

  useEffect(() => {
    void import('../../services/orders').then((m) => m.getPendingOps().then((ops) => setPendingCount(ops.length)));
  }, [orders.length]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = orders;
    if (query) {
      list = list.filter((o) => {
        const hay = [
          o.orderNumber, o.customer.name, o.customer.whatsapp, o.customer.mobile,
          o.customer.pincode, o.customer.city,
          ...Object.values(o.products).map((p) => p.productName),
        ].join(' ').toLowerCase();
        return hay.includes(query);
      });
    }
    if (pay !== 'all') list = list.filter((o) => o.paymentStatus === pay);
    if (method !== 'all') list = list.filter((o) => o.paymentMethod === method);
    if (status !== 'all') list = list.filter((o) => o.orderStatus === status);
    const now = Date.now();
    const day = 86400000;
    const todayStart = startOfDay(now);
    if (date === 'today') list = list.filter((o) => o.createdAt >= todayStart);
    if (date === 'yesterday') list = list.filter((o) => o.createdAt >= todayStart - day && o.createdAt < todayStart);
    if (date === '7d') list = list.filter((o) => o.createdAt >= todayStart - 7 * day);
    if (date === '30d') list = list.filter((o) => o.createdAt >= todayStart - 30 * day);
    if (date === 'custom' && fromD && toD) {
      const f = new Date(`${fromD}T00:00:00`).getTime();
      const t = new Date(`${toD}T23:59:59`).getTime();
      if (Number.isFinite(f) && Number.isFinite(t)) list = list.filter((o) => o.createdAt >= f && o.createdAt <= t);
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, q, pay, method, status, date, fromD, toD]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  useEffect(() => setPage(1), [q, pay, method, status, date, filtered.length]);

  const toggleAll = () => {
    setSelected((prev) => (prev.size === paged.length && paged.length > 0 ? new Set() : new Set(paged.map((o) => o.id))));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeOrder(deleteTarget.id);
      toast('success', `Order ${deleteTarget.orderNumber} deleted`);
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
    } catch (e) {
      toast('error', 'Delete failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const duplicate = (o: Order) => {
    // open the form prefilled from this order
    window.location.hash = `#/new?dupe=${encodeURIComponent(o.id)}`;
  };

  const newOrders = orders.filter((o) => o.orderStatus === 'New' && o.printed === 'Not Printed');
  const hasSelection = selected.size > 0;

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { bgSyncPendingOrders } = await import('../../services/messaging');
      const res = await bgSyncPendingOrders();
      await refreshConfig();
      toast('success', `Sync finished — ${res.synced} order${res.synced === 1 ? '' : 's'} synced${res.failed ? `, ${res.failed} failed` : ''}.`);
      setPendingCount(res.remaining ?? 0);
    } catch (e) {
      toast('error', 'Sync failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <div className="sub">{filtered.length} order{filtered.length === 1 ? '' : 's'} · <b>{newOrders.length}</b> new &amp; unprinted{pendingCount > 0 && ` · ${pendingCount} waiting to sync`}</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void downloadExcel('today')} disabled={xlBusy !== null || orders.length === 0} title="Download today's orders as an Excel .xlsx file">
            {xlBusy === 'today' ? <span className="spinner" /> : <>Download Today&rsquo;s Orders</>}
          </Button>
          <Button variant="secondary" icon={<IconDownload width={14} />} onClick={() => void downloadExcel('filtered', filtered)} disabled={xlBusy !== null || filtered.length === 0} title="Download exactly the orders currently shown (after filters & search) as an Excel .xlsx file">
            {xlBusy === 'filtered' ? <span className="spinner" /> : <>Download Filtered Orders{filtered.length > 0 ? ` (${filtered.length})` : ''}</>}
          </Button>
          <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void downloadExcel('all')} disabled={xlBusy !== null || orders.length === 0} title="Download all orders as an Excel .xlsx file">
            {xlBusy === 'all' ? <span className="spinner" /> : <>Download All Orders</>}
          </Button>
          {pendingCount > 0 && (
            <Button variant="outline" icon={<IconRefresh width={14} />} onClick={() => void syncNow()} disabled={syncing}>
              {syncing ? <span className="spinner" /> : 'Sync Now'}
            </Button>
          )}
          <Button variant="outline" icon={<IconPrinter width={14} />} onClick={() => openPrintPage({ orderIds: [...selected], auto: true })} disabled={!hasSelection}>
            Print Selected {hasSelection ? `(${selected.size})` : ''}
          </Button>
          <Button variant="primary" icon={<IconPrinter width={14} />} onClick={() => openPrintPage({ orderIds: [...selected], mark: true, auto: true })} disabled={!hasSelection}>
            Print &amp; Mark
          </Button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ padding: 12, marginBottom: 0 }}>
          <div className="search">
            <IconSearch width={15} />
            <Input placeholder="Search order no., customer, phone, pincode, product…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34 }} />
          </div>
          <Select value={pay} onChange={(e) => setPay(e.target.value)} style={{ width: 132 }} title="Filter by payment status">
            <option value="all">Payment: All</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 148 }} title="Filter by payment method">
            <option value="all">Method: All</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }} title="Filter by order status">
            <option value="all">Order: All</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={date} onChange={(e) => setDate(e.target.value as DateFilter)} style={{ width: 140 }}>
            <option value="all">Date: All</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom…</option>
          </Select>
          {date === 'custom' && (
            <>
              <Input type="date" value={fromD} onChange={(e) => setFromD(e.target.value)} style={{ width: 140 }} />
              <Input type="date" value={toD} onChange={(e) => setToD(e.target.value)} style={{ width: 140 }} />
            </>
          )}
          <div style={{ marginLeft: 'auto' }} className="row">
            <Button size="sm" variant={selected.size === filtered.length && filtered.length > 0 ? 'secondary' : 'ghost'} onClick={() => (selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map((o) => o.id))))}>
              {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all shown' : 'Select all shown'}
            </Button>
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconList width={30} height={30} style={{ color: 'var(--muted-2)' }} />} title="No orders yet"
            sub="Orders you save appear here. Use the demo mode or create your first order to see the full label workflow."
            action={<Button variant="primary" onClick={() => go('new')}>+ New Order</Button>} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState title="No orders match" sub="Try clearing the search or filters." /></div>
      ) : (
        <>
          <div className="card">
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}><Checkbox checked={selected.size === paged.length && paged.length > 0} onChange={toggleAll} /></th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>WhatsApp</th>
                    <th>Products</th>
                    <th className="num">Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Label</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((o) => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setView(o)}>
                      <td onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} /></td>
                      <td><b className="mono">{o.orderNumber}</b><br /><span className="small muted">{formatDate(o.createdAt, true)}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.customer.name || '—'}</div>
                        <div className="small muted">{o.customer.city}{o.customer.state ? `, ${o.customer.state}` : ''}</div>
                      </td>
                      <td className="mono small">{o.customer.whatsapp || '—'}</td>
                      <td>
                        <div style={{ maxWidth: 200 }}>
                          {Object.values(o.products).slice(0, 3).map((p, pi) => <div key={pi} className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.productName} × {p.quantity}</div>)}
                          {Object.values(o.products).length > 3 && <span className="small muted">+{Object.values(o.products).length - 3} more</span>}
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>{o.totalAmount ? formatMoney(o.totalAmount) : '—'}</td>
                      <td><Badge color={paymentBadgeColor(o.paymentStatus)}>{o.paymentStatus}</Badge>{o.transactionId && <div className="small muted mono">{o.transactionId}</div>}</td>
                      <td><Badge color={orderStatusColor(o.orderStatus)}>{o.orderStatus}</Badge></td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(o.createdAt)}</td>
                      <td>{o.printed === 'Printed' ? <Badge color="green">Printed</Badge> : <Badge color="gray">Not Printed</Badge>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="tbl-actions">
                          <Button size="sm" variant="ghost" title="View" onClick={() => setView(o)}><IconEye width={13} /></Button>
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => go('edit', o.id)}>Edit</Button>
                          <Button size="sm" variant="ghost" title="Download this order's label (PDF)" onClick={() => void downloadLabel(o)} disabled={dlLabelId === o.id}>
                            {dlLabelId === o.id ? <span className="spinner" /> : <IconDownload width={13} />}
                          </Button>
                          <Button size="sm" variant="primary" title="Generate label" onClick={() => setLabelOrder(o)}><IconPrinter width={13} /> Label</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap' }}>
            <Select value={String(perPage)} onChange={(e) => setPerPage(Number(e.target.value))} style={{ width: 100 }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </Select>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </div>
        </>
      )}

      {view && (
        <OrderDetailsModal
          order={view}
          onClose={() => setView(null)}
          onEdit={() => { go('edit', view.id); }}
          onLabel={() => { setLabelOrder(view); setView(null); }}
          onDuplicate={() => { const o = view; setView(null); duplicate(o); }}
          onDelete={() => { setDeleteTarget(view); setView(null); }}
        />
      )}
      {labelOrder && (
        <LabelPreviewModal order={labelOrder} onClose={() => setLabelOrder(null)} onNew={undefined} />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete order?"
        message={<div>Delete order <b>{deleteTarget?.orderNumber}</b> for {deleteTarget?.customer.name}? This removes it from local history{settings.spreadsheet.connected && !settings.demoMode ? ' — the spreadsheet row is kept as-is' : ''}. This can't be undone.</div>}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function OrderDetailsModal({ order, onClose, onEdit, onLabel, onDuplicate, onDelete }: {
  order: Order;
  onClose: () => void;
  onEdit: () => void;
  onLabel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const [dlBusy, setDlBusy] = useState(false);
  const downloadLabel = async () => {
    if (dlBusy) return;
    setDlBusy(true);
    try {
      const res = await downloadOrderLabelPdf(order, settings, fields);
      toast('success', `${res.filename} downloaded.`);
    } catch (e) {
      toast('error', labelDownloadErrorMessage(e), { message: 'Please try again. If it keeps failing, check the browser console for technical details.' });
    } finally {
      setDlBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Order ${order.orderNumber}`} wide
      footer={
        <>
          <Button variant="dangerOutline" onClick={onDelete} icon={<IconTrash width={13} />}>Delete</Button>
          <Button variant="outline" onClick={onDuplicate} icon={<IconCopy width={13} />}>Duplicate</Button>
          <Button variant="outline" onClick={onEdit}>Edit</Button>
          <Button variant="outline" icon={<IconDownload width={13} />} onClick={() => void downloadLabel()} disabled={dlBusy}>
            {dlBusy ? <span className="spinner" /> : 'Download Label'}
          </Button>
          <Button variant="primary" onClick={onLabel} icon={<IconPrinter width={13} />}>Generate Label</Button>
        </>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Customer</h4>
          <p style={{ fontWeight: 700, fontSize: 15 }}>{order.customer.name || '—'}</p>
          <p className="small">WhatsApp: <span className="mono">{order.customer.whatsapp || '—'}</span></p>
          {order.customer.mobile && <p className="small">Mobile: <span className="mono">{order.customer.mobile}</span></p>}
        </div>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Address</h4>
          <p className="small" style={{ whiteSpace: 'pre-line' }}>
            {order.customer.address || '—'}
            {[order.customer.city, order.customer.state].filter(Boolean).join(', ') ? <><br />{[order.customer.city, order.customer.state].filter(Boolean).join(', ')}</> : null}
            {order.customer.pincode ? <> — {order.customer.pincode}</> : ''}
          </p>
        </div>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Payment</h4>
          <p><Badge color={paymentBadgeColor(order.paymentStatus)}>{order.paymentStatus}</Badge> <span className="small muted">via {order.paymentMethod}</span></p>
          {order.transactionId && <p className="small">Txn: <span className="mono">{order.transactionId}</span></p>}
          {hasDeliverySettings(settings.delivery) ? (
            <div className="small" style={{ marginTop: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span className="muted">Subtotal</span><span>{formatMoney(orderSubtotal(order))}</span></div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span className="muted">Delivery</span><span>{formatMoney(orderDelivery(order))}</span></div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 10, fontWeight: 700, fontSize: 14 }}><span>Grand Total</span><span>{formatMoney(orderTotal(order))}</span></div>
            </div>
          ) : (
            <p style={{ fontWeight: 700 }}>{formatMoney(orderTotal(order))}</p>
          )}
        </div>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Status</h4>
          <p><Badge color={orderStatusColor(order.orderStatus)}>{order.orderStatus}</Badge></p>
          {order.previousOrderNumber && <p className="small">Previous order: <span className="mono">{order.previousOrderNumber}</span></p>}
          <p className="small">Label: {order.printed}{order.printedAt ? ` · ${formatDate(order.printedAt, true)}` : ''}</p>
          <p className="small muted">Created {formatDate(order.createdAt, true)}<br />Updated {formatDate(order.updatedAt, true)}</p>
        </div>
      </div>
      <hr className="divider" />
      <h4 style={{ fontSize: 13, marginBottom: 6 }}>Products</h4>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {Object.values(order.products).map((p, i) => (
              <tr key={i}>
                <td>{p.labelName || p.productName}</td>
                <td className="num">{p.quantity}</td>
                <td className="num">{formatMoney(p.price)}</td>
                <td className="num">{formatMoney(p.price * p.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.notes && <p className="small muted" style={{ marginTop: 10 }}>Notes: {order.notes}</p>}
      {order.customFields && Object.keys(order.customFields).length > 0 && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {Object.entries(order.customFields).filter(([, v]) => String(v)).map(([k, v]) => <span key={k} style={{ marginRight: 12 }}>{k}: <b>{String(v)}</b></span>)}
        </div>
      )}
      {!settings.demoMode && <p className="hint" style={{ marginTop: 8 }}>Spreadsheet row: {order.spreadsheetRow ? `row ${order.spreadsheetRow}` : order.pendingSync ? 'queued for sync' : 'not written'}{order.syncedAt ? ` · last synced ${formatDate(order.syncedAt, true)}` : ''}</p>}
    </Modal>
  );
}
