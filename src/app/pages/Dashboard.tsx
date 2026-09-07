// ---------------------------------------------------------------------------
// Dashboard — key numbers + quick actions + recent orders
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';
import type { Order } from '../../types';
import { formatDate, formatMoney, startOfDay } from '../../lib/constants';
import { Badge, Card, EmptyState, orderStatusColor, paymentBadgeColor } from '../../components/ui';
import { IconPlusCircle, IconList, IconPrinter, IconSettings, IconBox, IconLink } from '../../components/icons';
import { openPrintPage } from '../../components/label/printFlow';

export function Dashboard({ go }: { go: (r: string) => void }) {
  const orders = useAppStore((s) => s.orders);
  const products = useAppStore((s) => s.products);
  const settings = useAppStore((s) => s.settings);

  const stats = useMemo(() => {
    const todayStart = startOfDay(Date.now());
    const today = orders.filter((o) => o.createdAt >= todayStart);
    const paid = orders.filter((o) => o.paymentStatus === 'Paid');
    const cod = orders.filter((o) => o.paymentStatus === 'COD');
    const pending = orders.filter((o) => o.paymentStatus === 'Pending' || o.paymentStatus === 'Failed');
    const labelsPending = orders.filter((o) => o.printed !== 'Printed' && !['Cancelled', 'Returned'].includes(o.orderStatus));
    const revenue = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    return {
      todayCount: today.length,
      paidCount: paid.length,
      codCount: cod.length,
      pendingPayments: pending.length,
      labelsPending: labelsPending.length,
      revenue,
      revenueToday: today.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0),
      newUnprinted: labelsPending.filter((o) => o.orderStatus === 'New').length,
      orderCount: orders.length,
      productCount: products.filter((p) => p.active).length,
    };
  }, [orders, products]);

  const recent = useMemo(() => [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8), [orders]);
  const conn = settings.demoMode ? { label: 'Demo mode', kind: 'amber' as const } : settings.spreadsheet.connected
    ? { label: `Google Sheets · ${settings.spreadsheet.connection?.worksheetName ?? ''}`, kind: 'green' as const }
    : { label: 'Not connected to a spreadsheet', kind: 'red' as const };

  const cards: { label: string; value: string; icon: ReactNode; accent: string }[] = [
    { label: "Today's Orders", value: String(stats.todayCount), icon: '🧾', accent: 'var(--primary)' },
    { label: 'Paid Orders', value: String(stats.paidCount), icon: '✅', accent: 'var(--success)' },
    { label: 'COD Orders', value: String(stats.codCount), icon: '💵', accent: 'var(--secondary)' },
    { label: 'Pending Payments', value: String(stats.pendingPayments), icon: '⏳', accent: 'var(--warning)' },
    { label: 'Labels Pending', value: String(stats.labelsPending), icon: '🖨️', accent: 'var(--danger)' },
    { label: 'Total Sales', value: formatMoney(stats.revenue), icon: '💰', accent: 'var(--text)' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">
            <Badge color={conn.kind}>{conn.label}</Badge>
            <span style={{ marginLeft: 8 }}>{stats.orderCount} orders total · {stats.newUnprinted} new orders waiting for a label</span>
          </div>
        </div>
        <div className="row">
          <ButtonLike onClick={() => go('orders')}><IconList width={14} /> Orders</ButtonLike>
          <ButtonLike primary onClick={() => go('new')}><IconPlusCircle width={15} /> + New Order</ButtonLike>
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

      <div className="section-title">Quick actions</div>
      <div className="grid grid-4">
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => go('new')}>
          <IconPlusCircle width={22} style={{ color: 'var(--primary)' }} /> New Order
        </button>
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => go('orders')}>
          <IconList width={22} style={{ color: 'var(--secondary)' }} /> Orders
        </button>
        <button className="btn btn-outline" style={{ padding: '16px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderStyle: 'dashed' }} onClick={() => openPrintPage({ statuses: ['New'], mark: true, auto: true })} disabled={stats.newUnprinted === 0}>
          <IconPrinter width={22} style={{ color: stats.newUnprinted ? 'var(--primary)' : 'var(--muted-2)' }} /> Print New Orders{stats.newUnprinted ? ` (${stats.newUnprinted})` : ''}
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
