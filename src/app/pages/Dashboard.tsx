// ---------------------------------------------------------------------------
// Dashboard — date-filtered key numbers + product sales + quick actions
//
// Data flow: selected date filter → filter cached orders (same order store
// as every other page — no duplicate database) → stats & product sales are
// recomputed immediately (no refresh / Apply button needed).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';
import type { Order } from '../../types';
import { formatDate, formatMoney } from '../../lib/constants';
import { DASH_RANGE_OPTIONS, DashRange, dashRangeLabel, isDashCustom, ordersInWindow, ymd } from '../../lib/dateRange';
import { computeProductSales, salesSummary } from '../../lib/productSales';
import { Badge, Card, EmptyState, Input, Select, orderStatusColor, paymentBadgeColor } from '../../components/ui';
import { IconPlusCircle, IconList, IconPrinter, IconSettings, IconBox, IconLink } from '../../components/icons';
import { openPrintPage } from '../../components/label/printFlow';

export function Dashboard({ go }: { go: (r: string) => void }) {
  const orders = useAppStore((s) => s.orders);
  const products = useAppStore((s) => s.products);
  const settings = useAppStore((s) => s.settings);

  const [range, setRange] = useState<DashRange>('today');
  const [fromD, setFromD] = useState('');
  const [toD, setToD] = useState('');

  const pickRange = (r: DashRange) => {
    setRange(r);
    if (isDashCustom(r)) {
      const today = ymd();
      setFromD(fromD || today);
      setToD(r === 'range' ? toD || today : today);
    }
  };

  const windowed = useMemo(() => ordersInWindow(orders, range, fromD, toD), [orders, range, fromD, toD]);
  const stats = useMemo(() => salesSummary(windowed), [windowed]);
  const productRows = useMemo(() => computeProductSales(windowed, products), [windowed, products]);
  const rangeLabel = dashRangeLabel(range, fromD, toD);

  const newUnprinted = orders.filter((o) => o.orderStatus === 'New' && o.printed !== 'Printed').length;
  const recent = useMemo(() => [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8), [orders]);
  const conn = settings.demoMode ? { label: 'Demo mode', kind: 'amber' as const } : settings.spreadsheet.connected
    ? { label: `Google Sheets · ${settings.spreadsheet.connection?.worksheetName ?? ''}`, kind: 'green' as const }
    : { label: 'Not connected to a spreadsheet', kind: 'red' as const };

  const cards: { label: string; value: string; icon: ReactNode; accent: string }[] = [
    { label: 'Total Orders', value: String(stats.count), icon: '🧾', accent: 'var(--primary)' },
    { label: 'Total Sales', value: formatMoney(stats.revenue), icon: '💰', accent: 'var(--text)' },
    { label: 'Paid Orders', value: String(stats.paid), icon: '✅', accent: 'var(--success)' },
    { label: 'COD Orders', value: String(stats.cod), icon: '💵', accent: 'var(--secondary)' },
    { label: 'Pending Payments', value: String(stats.pending), icon: '⏳', accent: 'var(--warning)' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">
            <Badge color={conn.kind}>{conn.label}</Badge>
            <span style={{ marginLeft: 8 }}>{rangeLabel} · {stats.count} order{stats.count === 1 ? '' : 's'} in range{stats.revenue > 0 ? ` · ${formatMoney(stats.revenue)} sales` : ''}</span>
          </div>
        </div>
        <div className="row">
          <ButtonLike onClick={() => go('orders')}><IconList width={14} /> Orders</ButtonLike>
          <ButtonLike primary onClick={() => go('new')}><IconPlusCircle width={15} /> + New Order</ButtonLike>
        </div>
      </div>

      {/* --- Date filter bar --- */}
      <div className="card" style={{ marginBottom: 16, padding: '10px 12px' }}>
        <div className="toolbar" style={{ padding: 0, marginBottom: 0 }}>
          <span className="small muted" style={{ marginRight: 6, whiteSpace: 'nowrap' }}>Show</span>
          <Select value={range} onChange={(e) => pickRange(e.target.value as DashRange)} style={{ width: 150 }}>
            {DASH_RANGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
          {range === 'date' && (
            <Input type="date" value={fromD || ymd()} onChange={(e) => setFromD(e.target.value)} style={{ width: 150 }} />
          )}
          {range === 'range' && (
            <>
              <Input type="date" value={fromD} onChange={(e) => setFromD(e.target.value)} style={{ width: 150 }} />
              <span className="small muted">to</span>
              <Input type="date" value={toD} onChange={(e) => setToD(e.target.value)} style={{ width: 150 }} />
            </>
          )}
          <span className="hint" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>updates instantly — no Apply needed</span>
        </div>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="label">{c.label}</span>
              <span style={{ fontSize: 19 }}>{c.icon}</span>
            </div>
            <div className="value" style={{ color: c.accent }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* --- Product sales (date-filtered) --- */}
      <div className="section-title">Product Sales · {rangeLabel}</div>
      {productRows.length === 0 ? (
        <Card>
          <EmptyState icon={<IconBox width={26} height={26} />} title="No product sales in range" sub="Orders in the selected period had no products — or pick another date range." />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty Sold</th>
                  <th className="num">Orders</th>
                  <th className="num">Sales</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((r) => (
                  <tr key={r.productId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}{!r.inCatalog && <span className="small muted"> (deleted)</span>}</div>
                      {r.labelName && r.labelName !== r.name && <div className="small muted">label: {r.labelName}</div>}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>{r.qty}</td>
                    <td className="num">{r.orderCount}</td>
                    <td className="num">{formatMoney(r.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="section-title">Quick actions</div>
      <div className="grid grid-4">
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => go('new')}>
          <IconPlusCircle width={22} style={{ color: 'var(--primary)' }} /> New Order
        </button>
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => go('orders')}>
          <IconList width={22} style={{ color: 'var(--secondary)' }} /> Orders
        </button>
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => openPrintPage({ statuses: ['New'], mark: true, auto: true })} disabled={newUnprinted === 0}>
          <IconPrinter width={22} style={{ color: newUnprinted ? 'var(--primary)' : 'var(--muted-2)' }} /> Print New Orders{newUnprinted ? ` (${newUnprinted})` : ''}
        </button>
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => go('settings')}>
          <IconSettings width={22} style={{ color: 'var(--muted)' }} /> Settings
        </button>
      </div>

      {(!settings.spreadsheet.connected && !settings.demoMode) && (
        <div className="card card-pad" style={{ marginTop: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', borderColor: '#fde68a' }}>
          <span style={{ fontSize: 24 }}>🔌</span>
          <div className="grow">
            <b>Connect Google Sheets to store orders in the cloud</b>
            <p className="hint">Orders are currently saved only on this computer. Connect once and every order will be appended to your spreadsheet as a new row.</p>
          </div>
          <ButtonLike primary onClick={() => go('settings')}><IconLink width={14} /> Connect Spreadsheet</ButtonLike>
        </div>
      )}
      {products.length === 0 && (
        <div className="card card-pad" style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24 }}>📦</span>
          <div className="grow"><b>No products yet</b><p className="hint">Add your catalogue so orders can include products with quantity columns in the spreadsheet.</p></div>
          <ButtonLike primary onClick={() => go('products')}><IconBox width={14} /> Add Products</ButtonLike>
        </div>
      )}

      <div className="section-title">Recent orders</div>
      {recent.length === 0 ? (
        <Card><EmptyState icon={<IconList width={26} height={26} />} title="No orders yet" sub="Create your first order — it takes about 30 seconds." action={<button className="btn btn-primary" onClick={() => go('new')}><IconPlusCircle width={14} /> Create Order</button>} /></Card>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th className="num">Amount</th><th>Date</th><th style={{ textAlign: 'right' }}>Label</th></tr>
              </thead>
              <tbody>
                {recent.map((o: Order) => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = `#/edit/${o.id}`; }}>
                    <td><b className="mono">{o.orderNumber}</b></td>
                    <td>{o.customer.name || '—'}</td>
                    <td><Badge color={paymentBadgeColor(o.paymentStatus)}>{o.paymentStatus}</Badge></td>
                    <td><Badge color={orderStatusColor(o.orderStatus)}>{o.orderStatus}</Badge></td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatMoney(o.totalAmount)}</td>
                    <td className="small muted">{formatDate(o.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openPrintPage({ orderIds: [o.id], mark: true, auto: true }); }}>
                        <IconPrinter width={12} /> Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ButtonLike({ children, onClick, primary }: { children: ReactNode; onClick?: () => void; primary?: boolean }) {
  return (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-outline'}`} onClick={onClick}>{children}</button>
  );
}
