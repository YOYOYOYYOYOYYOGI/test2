// ---------------------------------------------------------------------------
// Popup — quick access only. The full app opens in a Chrome tab.
// IMPORTANT: the store's settings are undefined until async init() finishes,
// so NOTHING store-derived may be computed before the `ready` gate below
// (reading settings.demoMode too early used to crash the popup on open).
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { Badge } from '../components/ui';
import { IconArrowRight, IconList, IconPlus, IconPrinter, IconSearch, IconSettings } from '../components/icons';
import { LogoMark } from '../app/Shell';
import { formatDate, formatMoney } from '../lib/constants';

function openApp(route: string, query?: string) {
  const url = chrome.runtime.getURL(`index.html#/${route}${query ? `?${query}` : ''}`);
  void chrome.tabs.create({ url });
  window.close();
}

export function Popup() {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);
  const settings = useAppStore((s) => s.settings);
  const orders = useAppStore((s) => s.orders);
  const [q, setQ] = useState('');

  useEffect(() => { void init(); }, [init]);

  // ---- NOT ready yet: settings may still be undefined — show a static
  // loading frame and derive NOTHING from the store. ----
  if (!ready) {
    return (
      <div style={{ width: 344, background: 'var(--bg)', fontFamily: 'var(--font)', fontSize: 13.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
          <LogoMark size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>Order Label Manager</div>
            <div className="row" style={{ gap: 6, marginTop: 2 }}>
              <Badge color="gray">loading…</Badge>
            </div>
          </div>
        </div>
        <div style={{ padding: 26, textAlign: 'center', color: 'var(--muted)' }}><span className="spinner" /> Loading…</div>
      </div>
    );
  }

  // ---- Ready: store is fully hydrated — safe to derive. ----
  const recent = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const conn = settings.demoMode ? { label: 'Demo', color: 'amber' as const } : settings.spreadsheet.connected
    ? { label: settings.spreadsheet.connection?.worksheetName || 'Sheets', color: 'green' as const }
    : { label: 'Local only', color: 'red' as const };
  const pendingNew = orders.filter((o) => o.printed !== 'Printed' && o.orderStatus === 'New');

  return (
    <div style={{ width: 344, background: 'var(--bg)', fontFamily: 'var(--font)', fontSize: 13.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <LogoMark size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{settings.business.name?.trim() || 'Order Label Manager'}</div>
          <div className="row" style={{ gap: 6, marginTop: 2 }}>
            <Badge color={conn.color}>{conn.label}</Badge>
            <Badge color={pendingNew.length ? 'orange' : 'gray'}>{pendingNew.length} new</Badge>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" title="Settings" onClick={() => openApp('settings')}><IconSettings width={15} /></button>
      </div>

      <div style={{ padding: 12 }}>
        <button className="btn btn-primary btn-block btn-lg" style={{ justifyContent: 'center' }} onClick={() => openApp('new')}>
          <IconPlus width={16} /> New Order
        </button>
      </div>

      <div style={{ padding: '0 12px 10px' }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="search" style={{ maxWidth: 'none', width: '100%', flex: 1 }}>
            <IconSearch width={14} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Search order / phone… (Enter)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') openApp('orders', `q=${encodeURIComponent(q.trim())}`); }}
            />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ padding: '9px 14px 4px', fontWeight: 700, fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Recent orders</div>
        {recent.length === 0 && (
          <div style={{ padding: '14px 14px 18px', color: 'var(--muted)', fontSize: 12.5 }}>No orders yet — save your first order in the full app.</div>
        )}
        {recent.map((o) => (
          <button key={o.id} onClick={() => openApp(`edit/${o.id}`)}
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid #f3f6fa' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span className="mono">{o.orderNumber}</span>
                {o.printed === 'Printed' ? <span className="small" style={{ color: 'var(--success)' }}>✓ printed</span> : null}
              </div>
              <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.customer.name || '—'} · {o.customer.city || ''} · {formatDate(o.createdAt)}
              </div>
            </div>
            <span style={{ fontWeight: 800, fontSize: 12.5, color: o.paymentStatus === 'Paid' ? 'var(--success)' : 'var(--text)' }}>
              {formatMoney(o.totalAmount)}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border)', background: '#fff' }}>
        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openApp('orders')}><IconList width={13} /> Orders</button>
        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openApp('dashboard')}>Open Full App <IconArrowRight width={12} /></button>
      </div>
      {!settings.demoMode && !settings.spreadsheet.connected && (
        <div style={{ padding: '8px 14px', fontSize: 11.5, color: '#b45309', background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
          Not connected to a spreadsheet — orders stay on this computer. Open Settings → Spreadsheet to connect Google.
        </div>
      )}
    </div>
  );
}
