import './style.css';
import { ensureSeed, getOrder } from './services/store';
import { I } from './icons';
import type { Ctx } from './pages/ctx';
import { ordersPage } from './pages/orders-list';
import { labelViewPage } from './pages/label-view';

const app = document.getElementById('app')!;
let labelId: string | null = null;

const ctx: Ctx = {
  route: 'orders',
  id: null,
  go(r, i = null) {
    if (r === 'label') {
      labelId = i ?? null;
      render();
    }
  },
  rerender() {
    render();
  },
};

function render(): void {
  let page = null;
  if (labelId) {
    const o = getOrder(labelId);
    if (o) page = labelViewPage(o, () => { labelId = null; render(); }, render);
    else labelId = null;
  }
  if (!page) page = ordersPage(ctx, true);
  app.innerHTML = `
    <header class="top">
      <div class="brand">${I.tag} Order Label Manager — Orders</div>
      <div class="spacer"></div>
      <button class="btn small primary" data-new>+ New Order</button>
    </header>
    <main class="content"></main>`;
  const main = app.querySelector('main.content') as HTMLElement;
  main.innerHTML = page.html;
  app.querySelector('[data-new]')?.addEventListener('click', () => window.open(chrome.runtime.getURL('index.html') + '#new'));
  void page.bind?.(main);
}

async function boot(): Promise<void> {
  await ensureSeed();
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('label=')) labelId = h.split('=')[1] || null;
  render();
}

void boot();
