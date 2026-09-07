// ---------------------------------------------------------------------------
// LabelSheet — THE single label renderer. Used by:
//   • Label preview  (LabelPreviewModal)
//   • Print page     (print.html — exact physical size)
//   • PDF download   (labelDownload.ts rasterizes THIS component)
// One design, one source of truth: any change here updates all three.
// ---------------------------------------------------------------------------
import { forwardRef, useEffect, useState } from 'react';
import type { LabelConfig, Settings } from '../../types';
import type { LabelFontKey } from '../../types';
import type { LabelModel, LabelProductLine } from './labelModel';
import { labelFontSize, labelFontStack, labelGlobalFontSize } from './labelStyle';

const MM_TO_PX = 96 / 25.4;

function mmPx(mm: number): number {
  return Math.round(mm * MM_TO_PX * 10) / 10;
}

export function labelSizePx(settings: Settings): { width: number; height: number } {
  const s = settings.labels;
  const w = s.widthMm ?? (s.sizeId === 'a4' ? 210 : 101.6);
  const h = s.heightMm ?? (s.sizeId === 'a4' ? 297 : 152.4);
  return { width: mmPx(w), height: mmPx(h) };
}

function useQrDataUrl(text: string, enabled: boolean, size: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !text) { setUrl(null); return; }
    let alive = true;
    import('qrcode').then((mod) => {
      mod.default
        .toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
        .then((d) => { if (alive) setUrl(d); })
        .catch(() => { if (alive) setUrl(null); });
    });
    return () => { alive = false; };
  }, [text, enabled, size]);
  return url;
}

function useBarcodeSvg(text: string, enabled: boolean): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !text) { setSvg(null); return; }
    let alive = true;
    import('jsbarcode').then((mod) => {
      try {
        // draw into our own namespaced <svg> so the serialized markup is valid
        const ns = 'http://www.w3.org/2000/svg';
        const host = document.createElementNS(ns, 'svg');
        mod.default(host, text, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 15,
          font: 'monospace',
          margin: 1,
          background: '#ffffff',
          lineColor: '#000000',
        });
        host.setAttribute('xmlns', ns);
        const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(host))}`;
        if (alive) setSvg(data);
      } catch {
        if (alive) setSvg(null); // optional element — never breaks the label
      }
    });
    return () => { alive = false; };
  }, [text, enabled]);
  return svg;
}

export function LabelSheetComponent({ model, settings }: { model: LabelModel; settings: Settings }) {
  const { width, height } = labelSizePx(settings);
  const b = model.business;
  const cfg: Pick<LabelConfig, 'fontFamily' | 'fontSize' | 'fontSizes'> = settings.labels;
  const px = (k: LabelFontKey) => labelFontSize(cfg, k);
  const globalPx = labelGlobalFontSize(cfg);

  const logoUrl = b.logoDataUrl;
  const showLogo = settings.labels.showLogo !== false && Boolean(logoUrl);
  const logoWidth = Math.min(320, Math.max(24, settings.labels.logoWidth ?? 96));
  const logoBoxH = Math.min(logoWidth, 84);

  const qrEnabled = settings.labels.showQrCode;
  const qr = useQrDataUrl(model.qrText, qrEnabled, 240);
  const bar = useBarcodeSvg(model.orderNumber, settings.labels.showBarcode);

  const showBiz = settings.labels.showBusinessHeader && Boolean(b.name || b.phone || b.gst || b.email || b.address || showLogo);
  const showAddress = settings.labels.showAddress && model.address.length > 0;
  const showProducts = settings.labels.showProducts && model.products.length > 0;
  const showPayStrip = settings.labels.showPayment && model.payment.status;
  const showFooter = settings.labels.showFooter && settings.labels.footerText;

  const qrPx = Math.min(mmPx(21), Math.round(width * 0.24));
  const contactLabelW = Math.min(78, Math.round(width * 0.42));
  const smallCaps = (n: number) => Math.max(8, Math.round(n * 0.8));

  return (
    <div
      data-label
      style={{
        width: `${width}px`,
        minHeight: `${height}px`,
        background: '#fff',
        color: '#000',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 18px',
        fontFamily: labelFontStack(settings.labels),
        fontSize: globalPx,
        lineHeight: 1.45,
      }}
    >
      {/* ---- Business header: [logo] [name/contact/address ....] [QR] ---- */}
      {showBiz && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {showLogo && (
            <div style={{ flex: '0 0 auto', width: logoWidth, height: logoBoxH, overflow: 'hidden' }}>
              {/* 100%×100% + object-fit contain → aspect ratio always kept */}
              <img
                src={logoUrl}
                alt="logo"
                data-label-logo="1"
                style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center' }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {b.name && (
              <div style={{ fontWeight: 800, fontSize: px('businessName'), letterSpacing: '.3px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.name}
              </div>
            )}
            <div style={{ fontSize: px('customerDetails'), color: '#111', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {b.phone && <span>📞 {b.phone}</span>}
              {b.whatsapp && <span>📱 {b.whatsapp}</span>}
              {b.gst && <span>GST: {b.gst}</span>}
              {b.email && <span>{b.email}</span>}
            </div>
            {b.address && <div style={{ fontSize: px('customerDetails'), color: '#111' }}>{b.address}</div>}
          </div>
          {qr && <img src={qr} alt="QR" style={{ width: qrPx, height: qrPx, flex: '0 0 auto', border: '1px solid #ccc' }} />}
        </div>
      )}
      {!showBiz && qr && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <img src={qr} alt="QR" style={{ width: qrPx, height: qrPx }} />
        </div>
      )}

      {/* ---- Order number ---- */}
      {settings.labels.showOrderNumber && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 6, paddingBottom: 5, borderBottom: '2px solid #000' }}>
          <div style={{ fontWeight: 800, fontSize: px('orderNumber'), letterSpacing: '.4px' }}>ORDER: {model.orderNumber}</div>
        </div>
      )}

      {/* ---- Customer name + contact/extra lines ---- */}
      {settings.labels.showCustomer && model.customerName !== '—' && (
        <div style={{ fontWeight: 800, fontSize: px('customerName'), marginTop: 7 }}>{model.customerName}</div>
      )}
      {model.lines.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {model.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: px('customerDetails'), lineHeight: 1.4 }}>
              <span style={{ color: '#333', fontWeight: 700, flex: `0 0 ${contactLabelW}px`, textTransform: 'uppercase', fontSize: smallCaps(px('customerDetails')) }}>{l.label}</span>
              <span style={{ whiteSpace: 'pre-line', wordBreak: 'break-word', fontWeight: 500 }}>{l.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Address ---- */}
      {showAddress && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, fontSize: smallCaps(px('address')), letterSpacing: '.1em', textTransform: 'uppercase', borderBottom: '1px solid #999', paddingBottom: 2, marginBottom: 3 }}>Ship To</div>
          <div style={{ fontSize: px('address'), lineHeight: 1.45, whiteSpace: 'pre-line', fontWeight: 500 }}>{model.address.join('\n')}</div>
        </div>
      )}

      {/* ---- Products ---- */}
      {showProducts && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: smallCaps(px('productName')), letterSpacing: '.1em', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 2 }}>Products</div>
          {model.products.map((p: LabelProductLine, i) => (
            <div key={`${p.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '2.5px 0', borderBottom: i < model.products.length - 1 ? '1px dashed #ddd' : 'none' }}>
              <span style={{ flex: 1, fontWeight: 500, fontSize: px('productName'), wordBreak: 'break-word' }}>{p.name}</span>
              <span style={{ fontWeight: 800, whiteSpace: 'nowrap', fontSize: px('productQty') }}>Qty: {p.quantity}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Payment ---- */}
      {showPayStrip && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, borderTop: '1.5px solid #000', paddingTop: 4 }}>
          <span style={{ fontWeight: 800, fontSize: smallCaps(px('payment')), letterSpacing: '.1em', textTransform: 'uppercase' }}>Payment</span>
          <span style={{ fontWeight: 800, fontSize: px('payment') }}>{model.payment.status}</span>
          {model.payment.method && <span style={{ fontSize: px('payment'), color: '#222' }}>· {model.payment.method}</span>}
          {model.payment.transactionId && <span style={{ fontSize: px('payment'), color: '#333', marginLeft: 'auto' }}>TXN: {model.payment.transactionId}</span>}
        </div>
      )}
      {model.payment.amount && (
        <div style={{ marginTop: 3, textAlign: 'right', fontWeight: 800, fontSize: px('amount') }}>Total: {model.payment.amount}</div>
      )}

      {/* ---- Footer / barcode ---- */}
      {(bar || showFooter) && (
        <div style={{ marginTop: 'auto', textAlign: 'center', paddingTop: 8 }}>
          {bar && <img src={bar} alt="order barcode" style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }} />}
          {showFooter && <div style={{ fontSize: px('footer'), color: '#222', marginTop: bar ? 4 : 0 }}>{settings.labels.footerText}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Printable sheet (static, single label). Wrapped with forwardRef so the print
 * host can measure it.
 */
export const LabelSheet = forwardRef<HTMLDivElement, { model: LabelModel; settings: Settings }>(function LabelSheetInner(props, ref) {
  return (
    <div ref={ref}>
      <LabelSheetComponent {...props} />
    </div>
  );
});
