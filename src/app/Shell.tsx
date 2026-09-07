// ---------------------------------------------------------------------------
// Main application shell: sidebar + topbar + routed page content
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useRoute, navigate, type RouteName } from './router';
import type { ReactNode } from 'react';
import { Badge } from '../components/ui';
import { IconBox, IconColumns, IconDashboard, IconList, IconPlus, IconPrinter, IconSettings, IconTag } from '../components/icons';
import { DEFAULT_BUSINESS_NAME } from '../lib/constants';

import { Dashboard } from './pages/Dashboard';
import { OrdersPage } from './pages/OrdersPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { ProductsPage } from './pages/ProductsPage';
import { FieldsPage } from './pages/FieldsPage';
import { SettingsPage } from './pages/SettingsPage';

const ICON = {
  dashboard: <IconDashboard width={17} />,
  orders: <IconList width={17} />,
  new: <IconPlus width={17} />,
  print: <IconPrinter width={17} />,
  products: <IconBox width={17} />,
  fields: <IconColumns width={17} />,
  settings: <IconSettings width={17} />,
};

const NAV: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'new', label: 'New Order', icon: ICON.new },
  { key: 'dashboard', label: 'Dashboard', icon: ICON.dashboard },
  { key: 'orders', label: 'Orders', icon: ICON.orders },
  { key: 'products', label: 'Products', icon: ICON.products },
  { key: 'fields', label: 'Fields & Columns', icon: ICON.fields },
  { key: 'settings', label: 'Settings', icon: ICON.settings },
];

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ borderRadius: 9, flex: '0 0 auto' }}>
      <rect width="128" height="128" rx="26" fill="#F66916" />
      <rect x="36" y="22" width="56" height="32" rx="5" fill="#ffffff" />
      <rect x="27" y="50" width="74" height="50" rx="8" fill="#0F172A" />
      <path d="M43 88V64h14a7 7 0 0 1 0 14h-6v10z" fill="#fff" />
      <rect x="62" y="64" width="22" height="15" rx="3" fill="#fff" />
      <rect x="26" y="100" width="76" height="5" rx="2.5" fill="#0F172A" />
    </svg>
  );
}

function pageTitle(name: RouteName): string {
  switch (name) {
    case 'dashboard': return 'Dashboard';
    case 'orders': return 'Orders';
    case 'new': return 'New Order';
    case 'edit': return 'Edit Order';
    case 'products': return 'Products';
    case 'fields': return 'Order Fields & Spreadsheet Columns';
    case 'settings': return 'Settings';
    default: return '';
  }
}

export function Shell() {
  const route = useRoute();
  const settings = useAppStore((s) => s.settings);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let alive = true;
    void import('../services/orders').then((m) => m.getPendingOps().then((ops) => { if (alive) setPendingCount(ops.length); }));
    return () => { alive = false; };
  }, [route.name]);

  const active: RouteName = useMemo(() => {
    if (route.name === 'edit') return 'orders';
    return route.name === 'print' || route.name === 'wizard' ? 'dashboard' : route.name;
  }, [route.name]);

  const bizName = settings.business.name?.trim() || DEFAULT_BUSINESS_NAME;
  const connState = settings.demoMode ? 'demo' : settings.spreadsheet.connected ? 'sheets' : 'off';

  const content: Record<string, ReactNode> = {
    dashboard: <Dashboard go={(r) => navigate(r)} />,
    orders: <OrdersPage key="orders" go={(r, p) => navigate(p ? `${r}/${p}` : r)} />,
    new: <NewOrderPage key={`new-${route.param ?? ''}`} go={(r) => navigate(r)} />,
    edit: <NewOrderPage key={`edit-${route.param}`} go={(r) => navigate(r)} editId={route.param} />,
    products: <ProductsPage go={(r) => navigate(r)} />,
    fields: <FieldsPage go={(r) => navigate(r)} />,
    settings: <SettingsPage go={(r) => navigate(r)} />,
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <LogoMark />
          <div style={{ minWidth: 0 }}>
            <div className="bname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bizName}</div>
            <div className="bsub">Order Label Manager</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.key} className={`nav-item ${active === item.key ? 'active' : ''}`} onClick={() => navigate(item.key)}>
              {item.icon}
              {item.label}
              {item.key === 'new' && active === 'new' ? null : null}
            </button>
          ))}
          <div className="nav-group">Quick print</div>
          <button
            className="nav-item"
            onClick={() => {
              void import('../components/label/printFlow').then(({ openPrintPage }) => openPrintPage({ statuses: ['New'], mark: true, auto: true }));
            }}
            title="Print labels for all new orders"
          >
            <IconPrinter width={17} />
            Print New Orders
          </button>
        </nav>
        <div className="sidebar-foot">
          {connState === 'sheets' && <><Badge color="green">● Sheets</Badge><span className="small">{settings.spreadsheet.connection?.worksheetName || ''}</span></>}
          {connState === 'demo' && <Badge color="amber">Demo mode</Badge>}
          {connState === 'off' && <Badge color="red">Not connected</Badge>}
          {pendingCount > 0 && <Badge color="amber">{pendingCount} pending sync</Badge>}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="page-title">{pageTitle(route.name === 'edit' ? 'edit' : route.name)}</div>
          {pendingCount > 0 && (
            <Badge color="amber">Offline queue: {pendingCount} order{pendingCount > 1 ? 's' : ''}</Badge>
          )}
          <div style={{ marginLeft: 'auto' }} className="row">
            {settings.demoMode && <Badge color="purple"><IconTag width={11} /> Demo — orders stay on this computer</Badge>}
            <button
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
              onClick={() => navigate('new')}
            >
              <IconPlus width={14} /> New Order
            </button>
          </div>
        </header>
        <main className="content">{content[route.name] ?? content.dashboard}</main>
      </div>
    </div>
  );
}

export function emptyLogo(): string {
  return '';
}
