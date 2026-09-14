// ---------------------------------------------------------------------------
// Print page — renders the selected labels at exact physical size, then
// invokes the Chrome print dialog. Auto-closes after printing.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, OrderField, Settings } from '../types';
import { LS, storage } from '../services/storage';
import { buildLabelModel } from '../components/label/labelModel';
import { LabelSheetComponent } from '../components/label/LabelSheet';

function parseParams(): { ids: string[]; statuses: string[]; mark: boolean; auto: boolean; keep: boolean } {
  const p = new URLSearchParams(window.location.search);
  return {
    ids: (p.get('ids') ?? '').split(',').filter(Boolean),
    statuses: (p.get('statuses') ?? '').split(',').filter(Boolean),
    mark: p.get('mark') === '1',
    auto: p.get('auto') === '1',
    keep: p.get('keep') === '1',
  };
}

export function PrintPage() {
  const params = useMemo(parseParams, []);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fields, setFields] = useState<OrderField[]>([]);
  const [msg, setMsg] = useState('Loading labels…');
  const printedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const st = await storage.loadAll();
      const conf = await storage.getState<Order[]>(LS.orders);
      const all = conf ?? [];
      const picked = params.ids.length
        ? all.filter((o) => params.ids.includes(o.id))
        : params.statuses.length
          ? all.filter((o) => params.statuses.includes(o.orderStatus) && o.printed !== 'Printed')
          : params.ids.length === 0 && params.statuses.length === 0
            ? all.filter((o) => o.orderStatus === 'New' && o.printed !== 'Printed')
            : all.slice(0, 1);
      setSettings(st.settings);
      setFields(st.fields);
      if (picked.length === 0) {
        setMsg('No labels to print — select orders on the Orders page first.');
        setOrders([]);
        return;
      }
      // mark printed BEFORE the dialog opens (per "Print New Orders → mark as Printed")
      if (params.mark) {
        try {
          const svc = await import('../services/orders');
          for (const o of picked) {
            if (o.printed !== 'Printed') await svc.markPrinted(o, { settings: st.settings, fields: st.fields, products: st.products });
          }
        } catch { /* non-fatal */ }
      }
      setOrders(picked);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-print only after everything is truly ready: fonts loaded, then the
  // logo / QR / barcode images decoded. If an expected image never loads, warn
  // (console) but still print — one optional image must not block printing.
  useEffect(() => {
    if (!orders || !settings) return;
    let cancelled = false;

    const waitFonts = (capMs: number) =>
      Promise.race([
        ('fonts' in document ? document.fonts.ready : Promise.resolve()),
        new Promise((r) => setTimeout(r, capMs)),
      ]);

    const waitImages = async (deadlineMs = 4000) => {
      const deadline = Date.now() + deadlineMs;
      for (;;) {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-stack img'));
        const ready = imgs.every((img) => img.complete && img.naturalWidth > 0);
        if (ready) return;
        if (Date.now() > deadline) {
          const stuck = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
          stuck.forEach((img) => {
            const isLogo = img.getAttribute('data-label-logo') === '1' || img.alt === 'logo';
            if (isLogo) console.warn('[print] The business logo could not be loaded before printing — it may be missing from the printed label.');
            else console.warn('[print] An optional label image could not be loaded before printing:', img.alt || 'image');
          });
          return;
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    };

    void (async () => {
      await waitFonts(1200);
      await waitImages(4000);
      if (cancelled || printedRef.current) return;
      printedRef.current = true;
      // small settle delay so the layout is fully painted before the dialog
      setTimeout(() => { if (!cancelled) window.print(); }, 400);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, settings]);

  useEffect(() => {
    const onAfterPrint = () => { if (!params.keep) window.close(); };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [params.keep]);

  const sheetStyle = useMemo(() => {
    if (!settings) return '';
    const w = settings.labels.widthMm ?? 101.6;
    const h = settings.labels.heightMm ?? 152.4;
    return `@page { size: ${w}mm ${h}mm; margin: 0; }`;
  }, [settings]);

  if (!orders || !settings) {
    return <div style={{ padding: 40, fontFamily: 'var(--font)' }}><span className="spinner" /> {msg}</div>;
  }

  const models = orders.map((o) => ({ order: o, model: buildLabelModel(o, settings, fields) }));

  return (
    <>
      <style>{sheetStyle}</style>
      <div className="print-toolbar no-print">
        <a className="back" href="javascript:history.back()">← Back</a>
        <div className="spacer">
          <strong>{orders.length} label{orders.length > 1 ? 's' : ''}</strong>
          <span style={{ color: '#64748b', fontSize: 12.5 }}>
            {settings.labels.widthMm} × {settings.labels.heightMm} mm · {settings.business.name?.trim() || 'My Business'}
          </span>
          {params.mark && <span style={{ fontSize: 12, color: '#16a34a' }}>will be marked as Printed</span>}
        </div>
        <button className="btn primary" onClick={() => window.print()}>🖨 Print {orders.length > 1 ? `(${orders.length})` : ''}</button>
      </div>
      <div className="print-stack">
        {orders.length === 0 ? (
          <div style={{ padding: 60, background: '#fff', borderRadius: 12, textAlign: 'center', color: '#64748b', minWidth: 420 }}>
            {msg}
            <div style={{ marginTop: 14 }}><a href="javascript:history.back()">← go back</a></div>
          </div>
        ) : (
          models.map(({ model, order }) => (
            <div key={order.id} className="print-label-page">
              <LabelSheetComponent model={model} settings={settings} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
