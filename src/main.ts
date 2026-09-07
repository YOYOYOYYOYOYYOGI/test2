import './style.css';
import { ensureSeed, getOrder } from './services/store';
import { isSignedIn } from './services/google';
import { I } from './icons';
import type { Ctx, PageResult, Route } from './pages/ctx';
import { dashboardPage } from './pages/dashboard';
import { orderFormPage } from './pages/order-form';
import { ordersPage } from './pages/orders-list';
import { productsPage } from './pages/products';
import { fieldsPage } from './pages/fields';
import { settingsPage } from './pages/settings';
import { labelViewPage } from './pages/label-view';
import { resetDraft } from './pages/order-form';

const app = document.getElementById('app')!;

const NAV: [Route, string, string][] = [
  ['dashboard', 'Dashboard', I.dash],
  ['new', 'New Order', I.plus],
  ['orders', 'Orders', I.list],
  ['products', 'Products', I.box],
  ['fields', 'Custom Fields', I.sliders],
  ['settings', 'Settings', I.gear],
];

let route: Route = 'dashboard';
let id: string | null = null;

const ctx: Ctx = {
  get route() {
    return route;
  },
  get id() {
    return id;
  },
  go(r, i = null) {
    route = r;
    id = i ?? null;
    const h =
      r === 'new' ? (id ? `#edit=${id}` : '#new') : r === 'label' && id ? `#label=${id}` : '';
    try {
      history.replaceState(null, '', h ? h : location.pathname);
    } catch { /* ignore */ }
    render();
  },
  rerender() {
    render();
  },
};

const PAGES: Record<Exclude<Route, 'label'>, (c: Ctx) => PageResult> = {
  dashboard: dashboardPage,
  new: orderFormPage,
  orders: (c) => ordersPage(c, false),
  products: productsPage,
  fields: fieldsPage,
  settings: settingsPage,
};

function currentPage(): PageResult {
  if (route === 'label') {
    const o = id ? getOrder(id) : undefined;
    if (o) return labelViewPage(o, () => ctx.go('orders'), () => render());
    route = 'orders';
    id = null;
  }
  return PAGES[route](ctx);
}

function render(): void {
  const page = currentPage();
  app.innerHTML = `
    <header class="top">
      <div class="brand">${I.tag} Order Label Manager</div>
      <div class="spacer"></div>
      <button class="conn" data-conn title="Google Sheets connection status — click to open Settings"><span class="dot" data-gdot></span><span data-gtxt>Google</span></button>
      <button class="btn small" data-opentab title="Open all orders in a full browser tab">Orders ${I.external}</button>
    </header>
    <nav class="tabs">${NAV.map(([r, l, ic]) => `<button data-route="${r}" class="${route === r ? 'active' : ''}">${ic} ${l}</button>`).join('')}</nav>
    <main class="content"></main>`;
  const main = app.querySelector('main.content') as HTMLElement;
  main.innerHTML = page.html;
  app.querySelectorAll('[data-route]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = (b as HTMLElement).dataset.route as Route;
      if (r === 'new') resetDraft(); // nav click = start a fresh order
      ctx.go(r);
    })
  );
  app.querySelector('[data-opentab]')?.addEventListener('click', () => window.open(chrome.runtime.getURL('orders.html')));
  app.querySelector('[data-conn]')?.addEventListener('click', () => ctx.go('settings'));
  isSignedIn()
    .then((ok) => {
      const d = app.querySelector('[data-gdot]');
      const t = app.querySelector('[data-gtxt]');
      if (d) d.className = 'dot ' + (ok ? 'on' : '');
      if (t) t.textContent = ok ? 'Google connected' : 'Google';
    })
    .catch(() => undefined);
  void page.bind?.(main);
}

function parseHash(): { route: Route; id: string | null } {
  const h = location.hash.replace(/^#/, '');
  const [k, v] = h.split('=');
  if (k === 'edit' && v) return { route: 'new', id: v };
  if (k === 'label' && v) return { route: 'label', id: v };
  if (k === 'new') return { route: 'new', id: null };
  return { route: 'dashboard', id: null };
}

function detectTab(): Promise<boolean> {
  return new Promise((res) => {
    try {
      chrome.windows.getCurrent((w) => res(w.type === 'normal'));
    } catch {
      res(false);
    }
  });
}

async function boot(): Promise<void> {
  await ensureSeed();
  const h = parseHash();
  route = h.route;
  id = h.id;
  document.documentElement.classList.toggle('as-page', await detectTab());
  render();
}

void boot();
