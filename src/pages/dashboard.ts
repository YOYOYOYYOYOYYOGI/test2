import { customerName, getOrders } from '../services/store';
import { esc, money } from '../utils';
import type { Ctx, PageResult } from './ctx';
import { resetDraft } from './order-form';

export function dashboardPage(ctx: Ctx): PageResult {
  const orders = getOrders();
  const today = new Date().toDateString();
  const count = (f: (o: (typeof orders)[number]) => boolean) => orders.filter(f).length;
  const stats = [
    ["Today's Orders", count((o) => new Date(o.createdAt).toDateString() === today)],
    ['Pending Labels', count((o) => !o.labelPrinted)],
    ['Paid Orders', count((o) => o.paymentStatus === 'Paid')],
    ['COD Orders', count((o) => o.paymentStatus === 'COD')],
  ];
  const recent = orders.slice(0, 5);
  return {
    html: `<div class="page-head">
        <div><h2 class="page-title">Dashboard</h2><div class="page-sub">Overview of your orders</div></div>
        <div class="head-actions">
          <button class="btn primary" data-act="new">+ New Order</button>
          <button class="btn" data-act="orders">Orders</button>
          <button class="btn" data-act="settings">Settings</button>
        </div>
      </div>
      <div class="stats">${stats.map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
      <div class="card">
        <div class="card-title">Recent Orders</div>
        ${
          recent.length === 0
            ? `<div class="empty">No orders yet.<br><button class="btn primary" data-act="new">+ New Order</button></div>`
            : `<div class="tblwrap" style="border:0"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th class="num">Amount</th><th>Payment</th><th></th></tr></thead><tbody>${recent
                .map(
                  (o) => `<tr>
                    <td class="strong nowrap">${esc(o.orderNumber)}</td>
                    <td class="ellip">${esc(customerName(o))}</td>
                    <td class="num strong nowrap">${money(o.total)}</td>
                    <td><span class="badge ${o.paymentStatus}">${o.paymentStatus}</span></td>
                    <td class="num"><button class="btn small" data-label="${o.id}">Label</button></td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`
        }
      </div>`,
    bind(root) {
      root.querySelectorAll('[data-act="new"]').forEach((b) => b.addEventListener('click', () => {
        resetDraft();
        ctx.go('new');
      }));
      root.querySelector('[data-act="orders"]')?.addEventListener('click', () => ctx.go('orders'));
      root.querySelector('[data-act="settings"]')?.addEventListener('click', () => ctx.go('settings'));
      root.querySelectorAll('[data-label]').forEach((b) =>
        b.addEventListener('click', () => ctx.go('label', (b as HTMLElement).dataset.label))
      );
    },
  };
}
