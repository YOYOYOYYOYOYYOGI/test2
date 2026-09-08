// ---------------------------------------------------------------------------
// Create / Edit order page — the fastest screen in the app.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { OldOrderRecord, Order, OrderField, Product, Settings } from '../../types';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, formatMoney } from '../../lib/constants';
import { Button, Checkbox, Field, Input, Modal, Select, TextArea } from '../../components/ui';
import { IconPlus, IconTrash, IconPrinter, IconX } from '../../components/icons';
import { validatePincode, validatePhone, validateEmail } from '../../lib/format';
import { COMPUTED_FIELD_KEYS } from '../../services/config';
import { makeOrderNumber, nextCounter } from '../../services/orders';
import { deliveryChargeFor, hasDeliverySettings } from '../../lib/delivery';
import { scanMatches, type MatchHit } from '../../lib/matching';
import { extraValueForField } from '../../services/oldOrders';
import { OldOrderLookup } from '../../components/orders/OldOrderLookup';
import { openPrintPage } from '../../components/label/printFlow';
import { LabelPreviewModal } from '../../components/label/LabelPreviewModal';

interface FormState {
  orderNumber: string;
  manualNumber: boolean;
  customer: { name: string; whatsapp: string; mobile: string; address: string; city: string; state: string; pincode: string };
  selected: { productId: string; productName: string; price: number; qty: string }[];
  paymentStatus: string;
  paymentMethod: string;
  transactionId: string;
  paymentAmount: string;
  orderStatus: string;
  notes: string;
  custom: Record<string, string | boolean>;
}

function emptyForm(settings: Settings, counter: number, fields: OrderField[]): FormState {
  const f = new Map(fields.map((x) => [x.key, x]));
  const custom: FormState['custom'] = {};
  for (const field of fields) {
    if (String(field.key) === 'custom') custom[field.id] = '';
  }
  return {
    orderNumber: makeOrderNumber(counter, settings),
    manualNumber: Boolean(settings.order.manualNumbering),
    customer: { name: '', whatsapp: '', mobile: '', address: '', city: '', state: '', pincode: '' },
    selected: [],
    paymentStatus: settings.order.defaultPaymentStatus || 'Pending',
    paymentMethod: settings.order.defaultPaymentStatus === 'COD' ? 'COD' : 'UPI',
    transactionId: '',
    paymentAmount: '',
    orderStatus: settings.order.defaultOrderStatus || 'New',
    notes: '',
    custom,
  };
}

/** Raw value currently typed on the form for a configured field id
 *  (same source mapping that later reads the stored order). */
function formFieldValue(form: FormState, f: OrderField): string | number | boolean {
  switch (String(f.key)) {
    case 'orderNumber': return form.orderNumber.trim();
    case 'customerName': return form.customer.name;
    case 'customerWhatsapp': return form.customer.whatsapp;
    case 'customerMobile': return form.customer.mobile;
    case 'customerAddress': return form.customer.address;
    case 'customerCity': return form.customer.city;
    case 'customerState': return form.customer.state;
    case 'customerPincode': return form.customer.pincode;
    case 'paymentStatus': return form.paymentStatus;
    case 'paymentMethod': return form.paymentMethod;
    case 'transactionId': return form.transactionId;
    case 'paymentAmount': return form.paymentAmount;
    case 'orderStatus': return form.orderStatus;
    case 'notes': return form.notes;
    default: return form.custom[f.id] ?? '';
  }
}

function orderToForm(o: Order, settings: Settings): FormState {
  const custom: FormState['custom'] = {};
  for (const [k, v] of Object.entries(o.customFields ?? {})) custom[k] = v as string;
  return {
    orderNumber: o.orderNumber,
    manualNumber: true,
    customer: { ...o.customer },
    selected: Object.values(o.products).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      price: p.price,
      qty: String(p.quantity),
    })),
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    transactionId: o.transactionId,
    paymentAmount: o.paymentAmount,
    orderStatus: o.orderStatus,
    notes: o.notes,
    custom,
  };
}

export function NewOrderPage({ editId, go }: { editId?: string; go: (r: string) => void }) {
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const products = useAppStore((s) => s.products);
  const orders = useAppStore((s) => s.orders);
  const oldOrders = useAppStore((s) => s.oldOrders);
  const counter = useAppStore((s) => s.counter);
  const refreshConfig = useAppStore((s) => s.refreshConfig);
  const refreshOrders = useAppStore((s) => s.refreshOrders);

  const editing = useMemo(() => orders.find((o) => o.id === editId), [orders, editId]);
  const isNewFlow = !editId; // old-order lookup only on the New Order screen
  const [form, setForm] = useState<FormState>(() => (editing ? orderToForm(editing, settings) : emptyForm(settings, counter, fields)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<Order | null>(null);
  const [matchHits, setMatchHits] = useState<MatchHit[] | null>(null);
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  /** old order number selected via the WhatsApp lookup (appended to the auto
   *  order number; stored separately as previousOrderNumber) */
  const [selectedOld, setSelectedOld] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const first = useRef(true);

  // refresh counter whenever the page loads
  useEffect(() => {
    if (!editing) {
      void nextCounter().then((n) => {
        if (first.current) {
          setForm((f) => (f.manualNumber ? f : { ...f, orderNumber: makeOrderNumber(n, settings) }));
        }
      });
    }
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the automatic number in sync: counter + optional old-order suffix
  useEffect(() => {
    if (form.manualNumber) return;
    const base = makeOrderNumber(counter, settings);
    setForm((f) => (f.manualNumber ? f : { ...f, orderNumber: selectedOld ? `${base}-${selectedOld}` : base }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counter, selectedOld]);

  /** Autofill the form from an imported old order + append its number. */
  const applyOldRecord = (rec: OldOrderRecord) => {
    const cust = { ...form.customer };
    const custom = { ...form.custom };
    const patch: Partial<FormState> = {};
    if (rec.name) cust.name = rec.name;
    if (rec.address) cust.address = rec.address;
    if (rec.whatsapp) cust.whatsapp = rec.whatsapp;
    for (const f of sortedFields) {
      const k = String(f.key);
      if (['customerName', 'customerWhatsapp', 'customerAddress', 'orderNumber'].includes(k)) continue;
      if (COMPUTED_FIELD_KEYS.has(k)) continue;
      if (f.type === 'checkbox' || f.type === 'product' || f.type === 'quantity') continue;
      if (k === 'customerMobile' && cust.mobile.trim()) continue; // never overwrite a typed number
      const v = extraValueForField(rec, f, settings);
      if (!v) continue;
      switch (k) {
        case 'customerMobile': cust.mobile = v; break;
        case 'customerCity': cust.city = v; break;
        case 'customerState': cust.state = v; break;
        case 'customerPincode': cust.pincode = v; break;
        case 'paymentStatus': if ((PAYMENT_STATUSES as string[]).includes(v)) patch.paymentStatus = v; break;
        case 'paymentMethod': if ((PAYMENT_METHODS as string[]).includes(v)) patch.paymentMethod = v; break;
        case 'orderStatus': if ((ORDER_STATUSES as string[]).includes(v)) patch.orderStatus = v; break;
        case 'transactionId': patch.transactionId = v; break;
        case 'paymentAmount': patch.paymentAmount = v; break;
        case 'notes': patch.notes = v; break;
        default:
          if (k === 'custom') custom[f.id] = v;
      }
    }
    setSelectedOld(rec.orderNumber);
    setForm((prev) => ({
      ...prev,
      ...patch,
      customer: cust,
      custom,
      orderNumber: prev.manualNumber
        ? prev.orderNumber
        : `${makeOrderNumber(counter, settings)}-${rec.orderNumber}`,
    }));
    setErrors({});
  };

  // "duplicate order" prefill (#/new?dupe=<id>)
  useEffect(() => {
    const m = window.location.hash.match(/[?&]dupe=([^&]+)/);
    if (!m || editId) return;
    const id = decodeURIComponent(m[1]);
    const o = orders.find((x) => x.id === id);
    if (o) {
      setForm(orderToForm(o, settings));
      toast('info', `Duplicating ${o.orderNumber}`, { message: 'Review the details — saving will create a new order.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.hash]);

  const sortedFields = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);
  const byKey = useMemo(() => {
    const m = new Map<string, OrderField>();
    for (const f of sortedFields) { if (!m.has(f.key)) m.set(f.key, f); }
    return m;
  }, [sortedFields]);

  const set = (patch: Partial<FormState>) => { setForm((f) => ({ ...f, ...patch })); };
  const setCust = (patch: Partial<FormState['customer']>) => setForm((f) => ({ ...f, customer: { ...f.customer, ...patch } }));

  const total = useMemo(() => {
    const fromProducts = form.selected.reduce((s, row) => s + (Number(row.qty) || 0) * (Number(row.price) || 0), 0);
    const productTotal = Math.round(fromProducts * 100) / 100;
    const entered = parseFloat(String(form.paymentAmount).replace(/[₹,\s]/g, ''));
    // delivery charge = first matching delivery rule, else the default
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const byFieldId: Record<string, string | number | boolean> = {};
    for (const f of sorted) byFieldId[f.id] = formFieldValue(form, f);
    const delivery = deliveryChargeFor({ subtotal: productTotal, byFieldId }, settings.delivery);
    return { productTotal, entered: Number.isFinite(entered) ? entered : 0, delivery, grandTotal: productTotal + delivery };
  }, [form.selected, form.paymentAmount, form, fields, settings.delivery]);

  const addProduct = (p: Product) => {
    if (form.selected.some((r) => r.productId === p.id)) return;
    set({ selected: [...form.selected, { productId: p.id, productName: p.name, price: p.price, qty: '1' }] });
  };

  const removeProduct = (idx: number) => set({ selected: form.selected.filter((_, i) => i !== idx) });
  const clearProducts = () => set({ selected: [] });

  // ---------- validation ----------
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const reqField = (key: string) => byKey.get(key);
    const requiredKeys = ['orderNumber', 'customerName', 'customerWhatsapp', 'customerAddress'];
    for (const key of requiredKeys) {
      const f = reqField(key);
      if (f && f.required) {
        const v = key === 'orderNumber' ? form.orderNumber : key === 'customerName' ? form.customer.name
          : key === 'customerWhatsapp' ? form.customer.whatsapp : form.customer.address;
        if (!v.trim()) errs[key === 'orderNumber' ? 'orderNumber' : `customer.${key}`] = 'This field is required.';
      }
    }
    if (form.customer.whatsapp) { const msg = validatePhone(form.customer.whatsapp, 'WhatsApp number'); if (msg) errs['customer.whatsapp'] = msg; }
    if (form.customer.mobile) { const msg = validatePhone(form.customer.mobile, 'Mobile number'); if (msg) errs['customer.mobile'] = msg; }
    if (form.customer.pincode) { const msg = validatePincode(form.customer.pincode); if (msg) errs['customer.pincode'] = msg; }
    if (form.customer.name && !byKey.get('customerName')?.required && !form.customer.name.trim()) { /* noop */ }
    // custom typed fields validation
    for (const f of sortedFields) {
      if (COMPUTED_FIELD_KEYS.has(f.key) || ['orderNumber', 'customerName', 'customerWhatsapp', 'customerMobile', 'customerAddress', 'customerCity', 'customerState', 'customerPincode', 'paymentStatus', 'paymentMethod', 'transactionId', 'paymentAmount', 'orderStatus', 'productsSummary'].includes(String(f.key))) continue;
      const val = f.type === 'checkbox' ? String(form.custom[f.id] ?? '') : form.custom[f.id];
      if (f.required && !val && String(f.key) === 'custom') errs[`custom.${f.id}`] = 'This field is required.';
      if (f.type === 'email' && val && !validateEmail(String(val))) errs[`custom.${f.id}`] = 'Please enter a valid email address.';
      if (f.type === 'phone' && val && validatePhone(String(val), f.name)) errs[`custom.${f.id}`] = 'Please enter a valid phone number.';
    }
    for (const row of form.selected) {
      const n = Number(row.qty);
      if (!Number.isInteger(n) || n < 1) errs[`qty.${row.productId}`] = 'Quantity must be a whole number ≥ 1';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---------- duplicate/matching scan ----------
  const scanForMatches = (): MatchHit[] => {
    const rules = settings.matching?.rules ?? [];
    if (rules.length === 0) return [];
    const values: Record<string, unknown> = {};
    for (const f of sortedFields) {
      const raw = formFieldValue(form, f);
      if (raw !== undefined && String(raw) !== '') values[f.id] = raw;
    }
    return scanMatches({ fields: sortedFields, rules, orders, values, excludeOrderId: editing?.id });
  };

  // ---------- submit ----------
  const submit = async (force = false, bypassMatch = false) => {
    if (!validate()) {
      toast('error', 'Please fix the highlighted fields', { message: 'Check the red messages next to each field.' });
      return;
    }
    if (!bypassMatch && !force) {
      const hits = scanForMatches();
      if (hits.length > 0) {
        setMatchHits(hits);
        return;
      }
    }
    setSaving(true);
    try {
      const productsRecord: Record<string, { quantity: number; price: number; productName: string; sku?: string; labelName?: string }> = {};
      for (const row of form.selected) {
        const product = products.find((p) => p.id === row.productId);
        productsRecord[row.productId] = {
          quantity: Number(row.qty),
          price: Number(row.price) || 0,
          productName: row.productName,
          sku: product?.sku,
          labelName: product?.labelName,
        };
      }
      const customValues: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(form.custom)) if (String(v) !== '') customValues[k] = v;
      const input = {
        orderNumber: form.orderNumber.trim(),
        customer: { ...form.customer },
        products: productsRecord,
        paymentStatus: form.paymentStatus as Order['paymentStatus'],
        paymentMethod: form.paymentMethod as Order['paymentMethod'],
        transactionId: form.transactionId,
        paymentAmount: total.entered ? String(total.entered) : '',
        orderStatus: form.orderStatus as Order['orderStatus'],
        notes: form.notes,
        customFields: customValues,
        deliveryCharge: total.delivery,
        previousOrderNumber: editing ? (selectedOld ?? editing.previousOrderNumber) : (selectedOld ?? undefined),
      };
      const svc = await import('../../services/orders');
      if (editing) {
        const res = await svc.updateOrder(editing.id, input, { settings, fields, products });
        if (res.ok && res.order) {
          toast('success', `Order ${res.order.orderNumber} updated.`, { message: res.code === 'pending' ? res.error : undefined });
          await refreshOrders();
          go('orders');
          return;
        }
        if (res.duplicate) { setDuplicate(res.duplicate.existing); return; }
        if (res.error) { toast('error', 'Update failed', { message: res.error }); return; }
        return;
      }
      const res = await svc.createOrder(input, { settings, fields, products }, { force });
      if (!res.ok && res.duplicate) {
        setDuplicate(res.duplicate.existing);
        return;
      }
      if (!res.ok || !res.order) {
        toast('error', 'Order could not be saved', { message: res.error });
        return;
      }
      const order = res.order;
      await refreshOrders();
      await refreshConfig();
      setSavedOrder(order);
      const msg = res.code === 'pending' ? (res.error ?? 'Saved locally; will sync when back online.') : res.synced
        ? `Saved to ${settings.spreadsheet.connected ? 'spreadsheet' : 'local storage'}.`
        : 'Saved locally.';
      const title = res.synced ? `Order ${order.orderNumber} saved successfully.` : `Order ${order.orderNumber} saved locally.`;
      toast(res.code === 'pending' ? 'info' : 'success', title, {
        message: msg,
        actions: [
          { label: 'Print Label', kind: 'primary', onClick: () => openPrintPage({ orderIds: [order.id], mark: true, auto: true }) },
          { label: 'All Orders', kind: 'secondary', onClick: () => go('orders') },
        ],
      });
    } catch (e) {
      toast('error', 'Unexpected error while saving', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const activeProducts = products.filter((p) => p.active);
  const anySpreadsheet = settings.spreadsheet.connected || settings.demoMode;

  const widget = (f: OrderField, key: string, value: string | boolean, onChange: (v: string | boolean) => void, err?: string, wide = false) => {
    const common = { invalid: Boolean(err), id: `f-${f.id}` };
    const label = f.name;
    switch (f.type) {
      case 'textarea':
        return <Field key={f.id} label={label} required={f.required} error={err} className={wide ? 'wide' : ''}><TextArea {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={key === 'customerAddress' ? 'House no., street, landmark…' : undefined} /></Field>;
      case 'number':
      case 'quantity':
        return <Field key={f.id} label={label} required={f.required} error={err}><Input {...common} type="number" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      case 'currency':
        return <Field key={f.id} label={label} required={f.required} error={err}><Input {...common} inputMode="decimal" placeholder="0.00" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      case 'date':
        return <Field key={f.id} label={label} required={f.required} error={err}><Input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      case 'phone':
        return <Field key={f.id} label={label} required={f.required} error={err} hint="10-digit Indian number, or +91 …"><Input {...common} type="tel" inputMode="tel" placeholder="9876543210" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      case 'email':
        return <Field key={f.id} label={label} required={f.required} error={err}><Input {...common} type="email" placeholder="name@example.com" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      case 'checkbox':
        return (
          <div key={f.id} className="field">
            <Checkbox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} label={<><b>{label}</b>{f.required && <span style={{ color: 'var(--danger)' }}> *</span>}</>} />
          </div>
        );
      case 'radio':
      case 'dropdown': {
        const opts = f.options?.map((o) => o.label) ?? [];
        return (
          <Field key={f.id} label={label} required={f.required} error={err}>
            {f.type === 'dropdown' ? (
              <Select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
                <option value="">— select —</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <div className="row row-wrap" style={{ gap: 12, paddingTop: 4 }}>
                {opts.map((o) => (
                  <label key={o} className="check-label" style={{ fontSize: 13 }}>
                    <input type="radio" className="cb" checked={String(value) === o} onChange={() => onChange(o)} /> {o}
                  </label>
                ))}
              </div>
            )}
          </Field>
        );
      }
      case 'paymentStatus':
        return (
          <Field key={f.id} label={label} required={f.required} error={err}>
            <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        );
      case 'orderStatus':
        return (
          <Field key={f.id} label={label} required={f.required} error={err}>
            <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        );
      default: {
        const placeholders: Record<string, string> = {
          customerName: 'Customer name',
          customerCity: 'City',
          customerState: 'State',
          orderNumber: 'ORD-…',
        };
        return <Field key={f.id} label={label} required={f.required} error={err}><Input {...common} placeholder={placeholders[key] ?? undefined} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></Field>;
      }
    }
  };

  if (!editing && editId) return <div>Loading…</div>;

  const orderNoField = byKey.get('orderNumber');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* --- Order number --- */}
      <div className="section-card">
        <div className="sec-head"><span className="idx">1</span>Order Information</div>
        <div className="sec-body">
          <div className="form-grid">
            <div className="field">
              {orderNoField && (
                <>
                  <label htmlFor="order-number">Order Number{orderNoField.required && <span className="req">*</span>}</label>
                  <div className="row" style={{ gap: 6 }}>
                    <Input
                      id="order-number"
                      value={form.orderNumber}
                      invalid={Boolean(errors.orderNumber)}
                      disabled={!form.manualNumber}
                      onChange={(e) => set({ orderNumber: e.target.value })}
                      style={{ flex: 1 }}
                      placeholder={makeOrderNumber(counter, settings)}
                    />
                    {!settings.order.manualNumbering && (
                      <Button
                        size="sm"
                        variant={form.manualNumber ? 'secondary' : 'outline'}
                        title={form.manualNumber ? 'Back to automatic numbering' : 'Enter the order number manually for this order'}
                        onClick={() => set({ manualNumber: !form.manualNumber, orderNumber: form.manualNumber ? makeOrderNumber(counter, settings) : '' })}
                      >
                        {form.manualNumber ? 'Auto' : 'Manual'}
                      </Button>
                    )}
                  </div>
                  <span className="hint">
                    {form.manualNumber && !settings.order.manualNumbering ? 'Manual override for this order only.' : !form.manualNumber ? `Auto — next is ${form.orderNumber}` : 'Manual numbering is on (Settings → Order).'}
                  </span>
                  {errors.orderNumber && <span className="error-text">{errors.orderNumber}</span>}
                  {selectedOld && !form.manualNumber && (
                    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, background: 'var(--primary-soft)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
                        Previous Order: <span className="mono">{selectedOld}</span>
                      </span>
                      <Button size="sm" variant="ghost" title="Remove the old-order number — keep only the auto number" onClick={() => setSelectedOld(null)}>✕ remove</Button>
                    </div>
                  )}
                </>
              )}
              {!orderNoField && (
                <>
                  <label>Order Number</label>
                  <Input disabled value={form.orderNumber} />
                </>
              )}
            </div>
          </div>
          {!anySpreadsheet && (
            <div style={{ marginTop: 10, background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
              ⚠️ No spreadsheet connected — orders will only be saved locally. Connect Google Sheets in Settings when you're ready.
            </div>
          )}
        </div>
      </div>

      {/* --- Customer info (bound fields) --- */}
      <div className="section-card">
        <div className="sec-head"><span className="idx">2</span>Customer Information</div>
        <div className="sec-body">
          <div className="form-grid">
            {sortedFields.filter((f) => ['customerName', 'customerWhatsapp', 'customerMobile', 'customerPincode'].includes(String(f.key))).map((f) =>
              f.key === 'customerName' ? widget(f, f.key, form.customer.name, (v) => setCust({ name: String(v) }), errors['customer.name'])
                : f.key === 'customerWhatsapp' ? (
                  <Field key={f.id} label={f.name} required={f.required} error={errors['customer.whatsapp']} hint="10-digit Indian number, or +91 …">
                    <Input type="tel" inputMode="tel" placeholder="9876543210" value={form.customer.whatsapp}
                      invalid={Boolean(errors['customer.whatsapp'])}
                      onChange={(e) => setCust({ whatsapp: e.target.value })} />
                    {isNewFlow && (
                      <OldOrderLookup whatsapp={form.customer.whatsapp} records={oldOrders} chosenNumber={selectedOld} onPick={applyOldRecord} />
                    )}
                  </Field>
                )
                  : f.key === 'customerMobile' ? widget(f, f.key, form.customer.mobile, (v) => setCust({ mobile: String(v) }), errors['customer.mobile'])
                    : f.key === 'customerPincode' ? widget(f, f.key, form.customer.pincode, (v) => setCust({ pincode: String(v) }), errors['customer.pincode'])
                      : null,
            )}
          </div>
          {sortedFields.some((f) => f.key === 'customerAddress') && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              {sortedFields.filter((f) => f.key === 'customerAddress').map((f) => widget(f, f.key, form.customer.address, (v) => setCust({ address: String(v) }), errors['customer.address'], true))}
            </div>
          )}
          {(sortedFields.some((f) => ['customerCity', 'customerState'].includes(String(f.key)))) && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              {sortedFields.filter((f) => ['customerCity', 'customerState'].includes(String(f.key))).map((f) =>
                f.key === 'customerCity'
                  ? widget(f, f.key, form.customer.city, (v) => setCust({ city: String(v) }), undefined)
                  : widget(f, f.key, form.customer.state, (v) => setCust({ state: String(v) }), undefined),
              )}
            </div>
          )}
          {!byKey.get('customerName') && (
            <p className="hint">The “Customer Name” field was removed from your field configuration — re-add it (Fields & Columns) to collect customer names.</p>
          )}
        </div>
      </div>

      {/* --- Products --- */}
      <div className="section-card">
        <div className="sec-head"><span className="idx">3</span>Products {activeProducts.length === 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— add products first (Products page)</span>}</div>
        <div className="sec-body">
          <div className="row row-wrap" style={{ gap: 8, marginBottom: 12 }}>
            {activeProducts
              .filter((p) => !form.selected.some((r) => r.productId === p.id))
              .map((p) => (
                <button key={p.id} type="button" className="pill-btn" onClick={() => addProduct(p)}>
                  <IconPlus width={12} /> {p.labelName || p.name} {p.price > 0 && <span className="muted">· {formatMoney(p.price)}</span>}
                </button>
              ))}
            {activeProducts.length === 0 && <span className="hint">No active products found.</span>}
          </div>
          {form.selected.length === 0 ? (
            <div className="empty" style={{ padding: '16px', border: '1px dashed var(--border-strong)', borderRadius: 9 }}>
              <div style={{ fontSize: 13 }}>No products selected yet — tap a product above (or in Settings → Products add your catalogue).</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 9 }}>
              <table className="tbl">
                <thead>
                  <tr><th style={{ width: 46 }}>#</th><th>Product</th><th style={{ width: 110 }} className="num">Price</th><th style={{ width: 130 }}>Quantity</th><th style={{ width: 130 }} className="num">Amount</th><th style={{ width: 44 }} /></tr>
                </thead>
                <tbody>
                  {form.selected.map((row, i) => {
                    const product = products.find((p) => p.id === row.productId);
                    const qty = Number(row.qty) || 0;
                    return (
                      <tr key={row.productId}>
                        <td className="muted small">{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Select value={row.productId} onChange={(e) => {
                              const p = products.find((x) => x.id === e.target.value);
                              if (p) set({ selected: form.selected.map((r, ri) => ri === i ? { ...r, productId: p.id, productName: p.name, price: p.price } : r) });
                            }}>
                              {products.filter((p) => p.active || p.id === row.productId).map((p) => <option key={p.id} value={p.id}>{p.labelName || p.name}</option>)}
                              {!products.some((p) => p.id === row.productId) && <option value={row.productId}>{row.productName} (deleted)</option>}
                            </Select>
                            {!product && <span className="badge red">deleted</span>}
                          </div>
                        </td>
                        <td className="num">{formatMoney(row.price)}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <Button size="sm" variant="outline" onClick={() => set({ selected: form.selected.map((r, ri) => ri === i ? { ...r, qty: String(Math.max(1, (Number(r.qty) || 1) - 1)) } : r) })}>−</Button>
                            <Input type="number" min={1} value={row.qty} invalid={Boolean(errors[`qty.${row.productId}`])}
                              onChange={(e) => set({ selected: form.selected.map((r, ri) => ri === i ? { ...r, qty: e.target.value } : r) })}
                              style={{ width: 66, textAlign: 'center', padding: '5px 4px' }} />
                            <Button size="sm" variant="outline" onClick={() => set({ selected: form.selected.map((r, ri) => ri === i ? { ...r, qty: String((Number(r.qty) || 0) + 1) } : r) })}>+</Button>
                          </div>
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>{formatMoney(qty * row.price)}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeProduct(i)} title="Remove"><IconTrash width={14} style={{ color: 'var(--danger)' }} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({form.selected.reduce((s, r) => s + (Number(r.qty) || 0), 0)} items)</td>
                    <td className="num" style={{ fontWeight: 800 }}>{formatMoney(total.productTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {form.selected.length > 0 && (
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" onClick={clearProducts}><IconX width={13} /> Clear Products</Button>
            </div>
          )}
        </div>
      </div>

      {/* --- Payment & status --- */}
      {(byKey.get('paymentStatus') || byKey.get('paymentMethod') || byKey.get('paymentAmount') || byKey.get('transactionId')) && (
        <div className="section-card">
          <div className="sec-head"><span className="idx">4</span>Payment Information</div>
          <div className="sec-body">
            <div className="form-grid">
              {byKey.get('paymentStatus') && widget(byKey.get('paymentStatus')!, '', form.paymentStatus, (v) => set({ paymentStatus: String(v), paymentMethod: String(v) === 'COD' && !form.paymentMethod ? 'COD' : form.paymentMethod }))}
              {byKey.get('paymentMethod') && (
                <Field label={byKey.get('paymentMethod')!.name} required={byKey.get('paymentMethod')!.required}>
                  <Select value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              )}
              {byKey.get('paymentAmount') && widget(byKey.get('paymentAmount')!, '', form.paymentAmount, (v) => set({ paymentAmount: String(v) }))}
              {byKey.get('transactionId') && widget(byKey.get('transactionId')!, '', form.transactionId, (v) => set({ transactionId: String(v) }))}
              {byKey.get('orderStatus') && widget(byKey.get('orderStatus')!, '', form.orderStatus, (v) => set({ orderStatus: String(v) }))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {hasDeliverySettings(settings.delivery)
                ? 'The delivery charge (from Settings → Delivery rules) is added automatically. Subtotal + Delivery = Grand Total is written to the spreadsheet.'
                : byKey.get('paymentAmount')
                  ? 'Payment Amount: leave blank to use the product total.'
                  : `Order total ${formatMoney(total.productTotal)} is always written to the Total column.`}
            </p>
          </div>
        </div>
      )}

      {/* --- Notes / custom fields --- */}
      {sortedFields.some((f) => f.key === 'notes' || String(f.key) === 'custom') && (
        <div className="section-card">
          <div className="sec-head"><span className="idx">5</span>Additional Information</div>
          <div className="sec-body">
            <div className="form-grid">
              {sortedFields.filter((f) => f.key === 'notes').map((f) => widget(f, 'notes', form.notes, (v) => set({ notes: String(v) })))}
              {sortedFields.filter((f) => String(f.key) === 'custom').map((f) => widget(f, f.id, form.custom[f.id] ?? '', (v) => set({ custom: { ...form.custom, [f.id]: v } }), errors[`custom.${f.id}`], f.type === 'textarea'))}
            </div>
          </div>
        </div>
      )}

      {/* --- Clipboard import --- */}
      {settings.clipboardParsing && (
        <div className="row" style={{ marginBottom: 14 }}>
          <Button size="sm" variant="ghost" onClick={() => setPasteOpen(!pasteOpen)}>📋 Import from WhatsApp clipboard</Button>
        </div>
      )}
      {pasteOpen && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <b>Paste a WhatsApp order</b>
            <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}><IconX width={13} /></Button>
          </div>
          <TextArea rows={4} placeholder={'Example:\nCustomer: Rahul Patel\nPhone: 9876543210\nAddress: Ahmedabad\nProduct: Night Cream x2\nPayment: Paid'} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="primary" onClick={() => {
              void import('../../lib/whatsappParser').then(async ({ parseWhatsAppMessage }) => {
                const parsed = parseWhatsAppMessage(pasteText);
                if (parsed.customer?.name || parsed.customer?.whatsapp || parsed.products?.length) {
                  const patch: Partial<FormState> = {};
                  const cust = { ...form.customer };
                  if (parsed.customer?.name) cust.name = parsed.customer.name;
                  if (parsed.customer?.whatsapp) { cust.whatsapp = parsed.customer.whatsapp; if (!form.customer.mobile) cust.mobile = parsed.customer.whatsapp; }
                  if (parsed.customer?.mobile) cust.mobile = parsed.customer.mobile;
                  if (parsed.customer?.address) cust.address = parsed.customer.address;
                  if (parsed.customer?.city) cust.city = parsed.customer.city;
                  if (parsed.customer?.state) cust.state = parsed.customer.state;
                  if (parsed.customer?.pincode) cust.pincode = parsed.customer.pincode;
                  patch.customer = cust;
                  let selected = form.selected;
                  for (const prod of parsed.products ?? []) {
                    const match = products.find((p) => p.name.toLowerCase() === prod.name.toLowerCase() || (p.labelName ?? '').toLowerCase() === prod.name.toLowerCase() || p.name.toLowerCase().includes(prod.name.toLowerCase()) || prod.name.toLowerCase().includes(p.name.toLowerCase()));
                    if (match && !selected.some((r) => r.productId === match.id)) {
                      selected = [...selected, { productId: match.id, productName: match.name, price: match.price, qty: String(prod.quantity) }];
                    } else if (match) {
                      selected = selected.map((r) => r.productId === match.id ? { ...r, qty: String((Number(r.qty) || 0) + prod.quantity) } : r);
                    }
                  }
                  patch.selected = selected;
                  if (parsed.payment?.status) { patch.paymentStatus = parsed.payment.status as FormState['paymentStatus']; if (parsed.payment.status === 'COD') patch.paymentMethod = 'COD'; }
                  if (parsed.payment?.method) patch.paymentMethod = parsed.payment.method as FormState['paymentMethod'];
                  if (parsed.payment?.amount) patch.paymentAmount = parsed.payment.amount;
                  if (parsed.payment?.txnId) patch.transactionId = parsed.payment.txnId;
                  if (parsed.orderNumber) patch.orderNumber = parsed.orderNumber;
                  set(patch as Partial<FormState>);
                  setPasteOpen(false);
                  toast('success', `Imported ${parsed.matched.length ? parsed.matched.join(', ') : 'details'}`, { message: 'Review the fields, then save the order.' });
                } else {
                  toast('info', 'Could not recognize an order in that text', { message: 'Use labels like Customer:, Address:, Product name x2, Paid.' });
                }
              });
            }}>
              Import into form
            </Button>
          </div>
        </div>
      )}

      {/* --- Submit bar --- */}
      <div className="row" style={{ gap: 10, margin: '18px 0 8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {hasDeliverySettings(settings.delivery) ? (
            <>
              <span className="hint">Subtotal: <b style={{ color: 'var(--text)', fontSize: 15 }}>{formatMoney(total.productTotal)}</b></span>
              <span className="hint">Delivery: <b style={{ color: 'var(--text)', fontSize: 15 }}>{formatMoney(total.delivery)}</b></span>
              <span className="hint" style={{ fontWeight: 700 }}>Grand Total: <b style={{ color: 'var(--primary)', fontSize: 16 }}>{formatMoney(total.grandTotal)}</b></span>
            </>
          ) : (
            <span className="hint">Total: <b style={{ color: 'var(--text)', fontSize: 15 }}>{formatMoney(total.productTotal)}</b></span>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="outline" onClick={() => go('orders')}>Cancel</Button>
          <Button variant="primary" size="lg" icon={<IconPrinter width={15} />} disabled={saving} onClick={() => void submit(false)}>
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Save Order'}
          </Button>
        </div>
      </div>

      {/* Duplicate dialog (order number) */}
      <Modal open={Boolean(duplicate)} onClose={() => setDuplicate(null)} title={`Order ${duplicate?.orderNumber ?? ''} already exists`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDuplicate(null)}>Go Back</Button>
            {duplicate && <>
              <Button variant="outline" onClick={() => { const id = duplicate.id; setDuplicate(null); go(`edit/${id}`); }}>View Existing Order</Button>
              <Button variant="primary" onClick={() => { setDuplicate(null); void submit(true); }}>Continue Anyway</Button>
            </>}
          </>
        }>
        <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <p>An order with the number <b>{duplicate?.orderNumber}</b> already exists ({duplicate?.customer.name ?? 'unknown customer'}).</p>
          <p className="muted">Saving again would create a duplicate spreadsheet row. Choose what you want to do.</p>
        </div>
      </Modal>

      {/* Matching/duplicate rule dialog */}
      {matchHits && (
        <Modal open onClose={() => setMatchHits(null)}
          title={matchHits.length === 1 ? `Matching ${matchHits[0].fieldName} Found` : 'Duplicate Matches Found'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setMatchHits(null)}>Go Back</Button>
              {matchHits[0]?.orders[0] && (
                <Button variant="outline" onClick={() => { const id = matchHits[0].orders[0].id; setMatchHits(null); go(`edit/${id}`); }}>View Existing Order</Button>
              )}
              <Button variant="primary" onClick={() => { setMatchHits(null); void submit(true, true); }}>Continue Anyway</Button>
            </>
          }>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {matchHits.map((h) => (
              <p key={h.rule.id} style={{ marginBottom: 8 }}>
                <b>{h.fieldName}</b> “{h.value}” already exists in order{' '}
                <b className="mono">{h.orders.slice(0, 3).map((o) => o.orderNumber).join(', ')}</b>
                {h.orders.length > 3 ? ` and ${h.orders.length - 3} more` : ''}.
              </p>
            ))}
            <p className="muted">This looks like a duplicate. Choose what you want to do — duplicates are never saved silently.</p>
          </div>
        </Modal>
      )}

      {/* Label preview after save */}
      {savedOrder && !editId && (
        <LabelPreviewModal
          order={savedOrder}
          onClose={() => setSavedOrder(null)}
          onNew={() => {
            setSavedOrder(null);
            setSelectedOld(null);
            void nextCounter().then((n) => {
              setForm(emptyForm(settings, n, fields));
              toast('success', 'Ready for the next order');
            });
          }}
        />
      )}
    </div>
  );
}
