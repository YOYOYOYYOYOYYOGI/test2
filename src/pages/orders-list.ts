import { customerName, customerPhone, getFields, getOrders, getSettings } from '../services/store';
import { downloadOrdersExcel } from '../services/excel';
import { downloadOrderLabel, markLabelPrinted, printOrderLabel } from '../services/label';
import type { Order } from '../types';
import { esc, fmtDate, money } from '../utils';
import { msg, toast } from '../ui';
import { I } from '../icons';
import type { Ctx, PageResult } from './ctx';

let q = '';

const summary = (o: Order): string => o.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(', ');

export function ordersPage(ctx: Ctx, full: boolean): PageResult {
  const orders = getOrders();
  const query = q.trim().toLowerCase();
  const list = query
    ? orders.filter((o) => [o.orderNumber, customerName(o), customerPhone(o)].some((v) => v.toLowerCase().includes(query)))
    : orders;
  const shown = full ? list : list.slice(0, 50);
  const s = getSettings();

  return {
    html: `<div class="page-head">
        <div><h2 class="page-title">Orders</h2><div class="page-sub">${orders.length} order${orders.length === 1 ? '' : 's'} saved${s.sheetId ? ' · synced to Google Sheets' : ' · saved on this device'}</div></div>
        <div class="head-actions">
          <button class="btn primary" data-act="new">+ New Order</button>
          ${full ? '' : `<button class="btn" data-act="tab" title="Open all orders in a full browser tab">All Orders ${I.external}</button>`}
        </div>
      </div>
      <div class="toolbar">
        <input type="search" placeholder="Search order no., customer, phone…" data-search value="${esc(q)}">
        <span class="count">${shown.length}${full ? '' : ' recent'} shown</span>
        <span class="spacer"></span>
        <button class="btn small" data-act="xl-today" title="Download today's orders as Excel (.xlsx)">Excel · Today</button>
        <button class="btn small" data-act="xl-all" title="Download all orders as Excel (.xlsx)">Excel · All</button>
      </div>
      ${
        shown.length === 0
          ? `<div class="card"><div class="empty">${query ? 'No orders match your search.' : 'No orders yet.'}<br><button class="btn primary" data-act="new">+ New Order</button></div></div>`
          : `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>Order Number</th><th>Customer</th><th>Phone</th><th>Products</th><th class="num">Amount</th><th>Payment</th><th>Date</th><th>Label</th><th></th></tr></thead>
        <tbody>
          ${shown
            .map(
              (o) => `<tr>
            <td class="strong nowrap">${esc(o.orderNumber)}</td>
            <td class="ellip">${esc(customerName(o))}</td>
            <td class="nowrap muted">${esc(customerPhone(o))}</td>
            <td class="ellip muted" title="${esc(summary(o))}">${esc(summary(o))}</td>
            <td class="num strong nowrap">${money(o.total)}</td>
            <td><span class="badge ${o.paymentStatus}">${o.paymentStatus}</span></td>
            <td class="nowrap muted">${fmtDate(o.createdAt)}</td>
            <td><span class="badge ${o.labelPrinted ? 'ok' : 'warn'}">${o.labelPrinted ? 'Printed' : 'Pending'}</span></td>
            <td><div class="rowbtns">
              <button class="btn small" data-act="label" data-id="${o.id}" title="Preview label">Label</button>
              <button class="btn small" data-act="edit" data-id="${o.id}" title="Edit order">${I.edit}</button>
              <button class="btn small" data-act="print" data-id="${o.id}" title="Print label">${I.print}</button>
              <button class="btn small" data-act="download" data-id="${o.id}" title="Download label PDF">${I.download}</button>
            </div></td>
          </tr>`
            )
            .join('')}
        </tbody></table></div>`
      }`,
    bind(root) {
      const search = root.querySelector('[data-search]') as HTMLInputElement | null;
      search?.addEventListener('input', () => {
        q = search.value;
        ctx.rerender();
        const el = document.querySelector('[data-search]') as HTMLInputElement | null;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
      root.querySelector('[data-act="new"]')?.addEventListener('click', () => {
        if (full) window.open(chrome.runtime.getURL('index.html') + '#new');
        else ctx.go('new');
      });
      root.querySelector('[data-act="tab"]')?.addEventListener('click', () => window.open(chrome.runtime.getURL('orders.html')));
      root.querySelector('[data-act="xl-today"]')?.addEventListener('click', () => {
        const today = new Date().toDateString();
        const todays = getOrders().filter((o) => new Date(o.createdAt).toDateString() === today);
        if (todays.length === 0) return toast('No orders for today yet.', 'err');
        downloadOrdersExcel(todays, 'today');
        toast(`Exported ${todays.length} order${todays.length === 1 ? '' : 's'} to Excel.`, 'ok');
      });
      root.querySelector('[data-act="xl-all"]')?.addEventListener('click', () => {
        const all = getOrders();
        if (all.length === 0) return toast('No orders yet.', 'err');
        downloadOrdersExcel(all, 'all');
        toast(`Exported ${all.length} order${all.length === 1 ? '' : 's'} to Excel.`, 'ok');
      });
      root.querySelectorAll('[data-id]').forEach((el) =>
        el.addEventListener('click', () => {
          const act = (el as HTMLElement).dataset.act;
          const id = (el as HTMLElement).dataset.id!;
          const order = getOrders().find((o) => o.id === id);
          if (!order) return;
          if (act === 'label') {
            ctx.go('label', id);
          } else if (act === 'edit') {
            if (full) window.open(chrome.runtime.getURL('index.html') + '#edit=' + id);
            else ctx.go('new', id);
          } else if (act === 'print') {
            printOrderLabel(order, getSettings(), getFields())
              .then(() => markLabelPrinted(order))
              .then(() => {
                toast('Label sent to printer.', 'ok');
                ctx.rerender();
              })
              .catch((e) => toast(msg(e), 'err'));
          } else if (act === 'download') {
            downloadOrderLabel(order, getSettings(), getFields())
              .then(() => markLabelPrinted(order))
              .then(() => {
                toast(`${order.orderNumber}-label.pdf downloaded.`, 'ok');
                ctx.rerender();
              })
              .catch((e) => toast(msg(e), 'err'));
          }
        })
      );
    },
  };
}

