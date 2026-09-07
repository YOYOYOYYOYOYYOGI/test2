// ---------------------------------------------------------------------------
// Pure label view-model builder — no DOM, unit-testable.
// The LABEL always shows every product WITH its quantity.
// ---------------------------------------------------------------------------
import type { Order, OrderField, Settings } from '../../types';
import { formatMoney } from '../../lib/constants';
import { boundFieldValue } from '../../services/spreadsheet/values';
import { labelFieldIds } from '../../services/config';

export interface LabelLine {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface LabelProductLine {
  name: string;
  quantity: number;
  price: number;
  sku?: string;
}

export interface LabelModel {
  business: Settings['business'];
  orderNumber: string;
  customerName: string;
  /** contact + extra rows shown under the name */
  lines: LabelLine[];
  /** folded address block lines */
  address: string[];
  products: LabelProductLine[];
  payment: { status: string; method: string; amount: string; transactionId: string };
  notes?: string;
  qrText: string;
  settings: Settings;
}

const FOLDED_KEYS = new Set(['customerName', 'customerAddress', 'customerCity', 'customerState', 'customerPincode']);

export function buildLabelModel(order: Order, settings: Settings, fields: OrderField[]): LabelModel {
  const c = order.customer;
  const selected = new Set(labelFieldIds(fields, settings));
  const shown = (f: OrderField) => selected.has(f.id);

  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const contact: LabelLine[] = [];
  const extras: LabelLine[] = [];
  const hasField = (key: string) => sorted.find((f) => f.key === key);

  const payKeys = ['paymentStatus', 'paymentMethod', 'paymentAmount', 'transactionId'];
  const payAnySelected = payKeys.some((k) => {
    const f = sorted.find((x) => x.key === k);
    return Boolean(f && shown(f));
  });
  const showPayStrip = settings.labels.showPayment && payAnySelected;

  for (const f of sorted) {
    if (!shown(f) || FOLDED_KEYS.has(f.key)) continue;
    const raw = boundFieldValue(order, f);
    if (raw === undefined || raw === null || String(raw) === '') continue;
    const value = String(raw);
    if (f.key === 'orderNumber') {
      if (!settings.labels.showOrderNumber) extras.push({ key: f.id, label: 'Order', value });
      continue;
    }
    if (f.key === 'customerWhatsapp') contact.push({ key: f.id, label: 'WhatsApp', value });
    else if (f.key === 'customerMobile') contact.push({ key: f.id, label: 'Mobile', value });
    else if (f.key === 'paymentStatus' || f.key === 'paymentMethod' || f.key === 'paymentAmount' || f.key === 'transactionId') {
      if (showPayStrip) {
        // folded into PAYMENT section
      } else {
        const labelMap: Record<string, string> = { paymentStatus: 'Payment Status', paymentMethod: 'Payment Method', paymentAmount: 'Payment Amount', transactionId: 'Transaction ID' };
        const fmtValue = f.key === 'paymentAmount' && /^\d/.test(value) ? formatMoney(parseFloat(value.replace(/[^\d.]/g, ''))) : value;
        extras.push({ key: f.id, label: labelMap[f.key], value: fmtValue });
      }
    } else {
      extras.push({ key: f.id, label: f.name, value, multiline: f.type === 'textarea' || (f.type === 'text' && value.length > 60) });
    }
  }

  const address: string[] = [];
  const showAddressBlock = settings.labels.showAddress && c.address.trim();
  if (showAddressBlock) {
    address.push(c.address.trim());
    const cityState = [c.city.trim(), c.state.trim()].filter(Boolean).join(', ');
    if (c.pincode.trim()) address.push(cityState ? `${cityState} - ${c.pincode.trim()}` : c.pincode.trim());
    else if (cityState) address.push(cityState);
  }
  void hasField;

  const amountNum = order.totalAmount;
  const products: LabelProductLine[] = Object.values(order.products).map((p) => ({
    name: p.labelName || p.productName,
    quantity: p.quantity,
    price: p.price ?? 0,
    sku: p.sku,
  }));

  const notesF = sorted.find((f) => f.key === 'notes');
  const notes = notesF && shown(notesF) && order.notes ? order.notes : undefined;

  return {
    business: { ...settings.business },
    orderNumber: order.orderNumber,
    customerName: c.name || '—',
    lines: [...contact, ...extras],
    address,
    products,
    payment: {
      status: order.paymentStatus,
      method: order.paymentMethod,
      amount: amountNum > 0 ? formatMoney(amountNum) : '',
      transactionId: order.transactionId,
    },
    notes,
    qrText: qrContentFor(order),
    settings,
  };
}

function qrContentFor(order: Order): string {
  return JSON.stringify({
    app: 'olm',
    order: order.orderNumber,
    customer: order.customer.name,
    phone: order.customer.whatsapp || order.customer.mobile,
  });
}
