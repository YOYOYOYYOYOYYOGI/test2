// Builds the shipping label (HTML + CSS), renders the live preview,
// and provides Print (browser print layout) and Download (PDF) actions.
import type { CustomField, Order, Settings } from '../types';
import { esc, money } from '../utils';
import { code39 } from './barcode';
import { saveOrder } from './store';

export const LABEL_CSS = `
.label{width:384px;height:576px;background:#fff;color:#0F172A;padding:20px 22px;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;font-family:InterVariable,Inter,system-ui,-apple-system,sans-serif}
.label.a6{width:397px;height:559px;padding:16px 18px}
.l-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.l-brand{display:flex;gap:9px;align-items:center;min-width:0}
.l-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;flex:none}
.l-biz{font-size:16.5px;font-weight:800;letter-spacing:-.01em;line-height:1.15;word-break:break-word}
.l-sub{font-size:9.5px;color:#5a6b85;margin-top:2px}
.l-onum{text-align:right;flex:none}
.l-on{font-size:15px;font-weight:800;color:#F66916;white-space:nowrap}
.l-od{font-size:9.5px;color:#5a6b85;margin-top:2px}
.l-rule{height:2.5px;background:#0F172A;border-radius:2px;margin:10px 0}
.l-chip{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.12em;background:#F1F5F9;color:#334155;padding:3px 8px;border-radius:4px}
.l-addr{margin-top:7px;font-size:11.5px;line-height:1.5}
.l-cname{font-size:16px;font-weight:800;margin-bottom:2px}
.l-lab{color:#5a6b85;font-weight:600}
.l-items{width:100%;border-collapse:collapse;margin-top:12px}
.l-items th{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#5a6b85;text-align:left;padding:4px 0;border-bottom:1px solid #e3e9f2;font-weight:700}
.l-items td{font-size:11px;padding:5px 0;border-bottom:1px solid #eef2f7}
.l-items .r,.l-items th.r{text-align:right}
.l-bottom{margin-top:auto}
.l-totrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:10px}
.l-pay{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.06em;border:1.5px solid currentColor;border-radius:5px;padding:2px 8px}
.l-pay.b-paid{color:#15803d}.l-pay.b-cod{color:#c2540a}.l-pay.b-pending{color:#a16207}.l-pay.b-failed{color:#b91c1c}
.l-amt{font-size:12px;color:#334155}.l-amt b{font-size:14.5px;color:#0F172A}
.l-gst{font-size:9.5px;color:#5a6b85;margin-top:6px}
.l-bar{margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:3px}
.barcode{max-width:272px;height:36px}
.label.a6 .barcode{height:30px}
.l-bct{font-size:10px;letter-spacing:.18em;font-weight:600}
.l-foot{margin-top:10px;border-top:1px solid #e3e9f2;padding-top:7px;font-size:9px;color:#5a6b85;text-align:center}
.label-host{width:-moz-fit-content;width:fit-content;border-radius:10px;overflow:hidden;border:1px solid #e3e9f2;box-shadow:0 10px 30px rgba(15,23,42,.12)}
`;

function fontFace(cssUrl: string): string {
  return `@font-face{font-family:InterVariable;src:url(${cssUrl}) format('woff2-variations');font-weight:100 900;font-display:swap}`;
}

const fontUrl = (): string =>
  typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('fonts/InterVariable.woff2') : '/fonts/InterVariable.woff2';

export const FONT_FACE_CSS = (): string => fontFace(fontUrl());

let fontData: string | null = null;
async function fontDataUrl(): Promise<string> {
  if (fontData !== null) return fontData;
  try {
    const buf = await (await fetch(fontUrl())).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    fontData = 'data:font/woff2;base64,' + btoa(bin);
  } catch {
    fontData = '';
  }
  return fontData;
}

/** The complete label markup (no <html> wrapper) — used for preview and rasterizing. */
export function labelHTML(order: Order, s: Settings, fields: CustomField[]): string {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const shown = s.labelFields === null ? fields : (s.labelFields.map((id) => byId.get(id)).filter(Boolean) as CustomField[]);
  const val = (id: string) => (order.customerData[id] || '').trim();
  const has = (re: RegExp) => shown.find((f) => re.test(f.name));
  const name = shown.find((f) => /name|customer/i.test(f.name));
  const phone = shown.find((f) => f.type === 'phone') || has(/phone|mobile|whatsapp/i);
  const address = shown.find((f) => f.type === 'textarea' && /address/i.test(f.name)) || has(/address|street/i);
  const city = has(/city|town/i);
  const state = has(/state|province/i);
  const pin = has(/pin|zip|postal/i);
  const others = shown.filter((f) => ![name, phone, address, city, state, pin].includes(f) && val(f.id));

  const nameVal = name ? val(name.id) : '';
  const addrLines = address ? val(address.id).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const region = [city && val(city.id), state && val(state.id)].filter((x): x is string => !!x).map((x) => esc(x)).join(', ');
  const pinVal = pin ? val(pin.id) : '';
  const regionLine = [region, pinVal].filter(Boolean).join(' - ');

  const sub = [s.phone, s.website].filter((x): x is string => !!x).map((x) => esc(x)).join('  ·  ');
  const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const ex = s.labelExtras;

  const itemsRows = order.items
    .map(
      (i) =>
        `<tr><td>${esc(i.name)}${i.sku ? ` <span class="l-lab">(${esc(i.sku)})</span>` : ''}</td>${ex.quantity ? `<td class="r">${i.qty}</td>` : ''}${
          ex.amount ? `<td class="r">${money(i.price * i.qty)}</td>` : ''
        }</tr>`
    )
    .join('');

  return `<div class="label ${s.labelSize === 'a6' ? 'a6' : ''}">
  <div class="l-top">
    <div class="l-brand">${s.logo ? `<img class="l-logo" src="${s.logo}" alt="">` : ''}<div><div class="l-biz">${esc(s.businessName)}</div>${sub ? `<div class="l-sub">${sub}</div>` : ''}</div></div>
    <div class="l-onum">${ex.orderNumber ? `<div class="l-on">${esc(order.orderNumber)}</div>` : ''}<div class="l-od">${esc(dateStr)}</div></div>
  </div>
  <div class="l-rule"></div>
  <div><span class="l-chip">DELIVER TO</span></div>
  <div class="l-addr">
    ${nameVal ? `<div class="l-cname">${esc(nameVal)}</div>` : ''}
    ${phone && val(phone.id) ? `<div><span class="l-lab">Mobile:</span> ${esc(val(phone.id))}</div>` : ''}
    ${addrLines.map((l) => `<div>${l}</div>`).join('')}
    ${regionLine ? `<div>${regionLine}</div>` : ''}
    ${others.map((f) => `<div><span class="l-lab">${esc(f.name)}:</span> ${esc(val(f.id))}</div>`).join('')}
  </div>
  <div class="l-bottom">
    ${ex.products && order.items.length > 0 ? `<table class="l-items"><thead><tr><th>Product</th>${ex.quantity ? '<th class="r">Qty</th>' : ''}${ex.amount ? '<th class="r">Amount</th>' : ''}</tr></thead><tbody>${itemsRows}</tbody></table>` : ''}
    <div class="l-totrow">
      ${ex.payment ? `<span class="l-pay b-${esc(order.paymentStatus.toLowerCase())}">${esc(order.paymentStatus.toUpperCase())}</span>` : '<span></span>'}
      ${ex.amount ? `<span class="l-amt">Total <b>${money(order.total)}</b></span>` : ''}
    </div>
    ${ex.gst && s.gst ? `<div class="l-gst">GSTIN: ${esc(s.gst)}</div>` : ''}
    ${ex.barcode ? `<div class="l-bar">${code39(order.orderNumber)}<div class="l-bct">${esc(order.orderNumber)}</div></div>` : ''}
    <div class="l-foot">${esc(s.footer || 'Thank you for your order!')}</div>
  </div>
</div>`;
}

/** Live label preview inside a shadow root (style isolation from the app UI). */
export function mountLabelPreview(container: HTMLElement, order: Order, s: Settings, fields: CustomField[]): { el: HTMLElement } {
  const host = document.createElement('div');
  host.className = 'label-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${FONT_FACE_CSS()}${LABEL_CSS}</style>${labelHTML(order, s, fields)}`;
  container.innerHTML = '';
  container.appendChild(host);
  return { el: root.querySelector('.label') as HTMLElement };
}

/** Full standalone document for the print window / hidden print frame. */
export async function labelDocument(order: Order, s: Settings, fields: CustomField[]): Promise<string> {
  const font = await fontDataUrl();
  const page = s.labelSize === 'a6' ? '105mm 148mm' : '4in 6in';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(order.orderNumber)} — Label</title><style>${fontFace(font || fontUrl())}${LABEL_CSS}
body{margin:0;background:#eef1f6;display:flex;align-items:flex-start;justify-content:center;padding:16px}
.toolbar{position:fixed;top:12px;right:14px;display:flex;gap:8px}
.toolbar button{font:600 13px InterVariable,Inter,system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
.toolbar button:hover{background:#f8fafc}
.toolbar button.pri{background:#F66916;border-color:#F66916;color:#fff}
.toolbar button.pri:hover{background:#e05a0e}
@media print{.toolbar{display:none}body{background:#fff;padding:0}}
@page{size:${page};margin:0}
</style></head><body>
<div class="toolbar"><button class="pri" onclick="window.print()">Print Label</button></div>
${labelHTML(order, s, fields)}
</body></html>`;
}

/** Open the browser print layout for one order's label (buttons/UI hidden via @media print). */
export async function printOrderLabel(order: Order, s: Settings, fields: CustomField[]): Promise<void> {
  const html = await labelDocument(order, s, fields);
  let w: Window | null = null;
  try {
    w = window.open('', '_blank');
  } catch { /* popup blocked */ }
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    const p = w;
    (p.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(() => p.print(), 60));
    return;
  }
  // Fallback: hidden iframe print (no separate window)
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;';
  f.srcdoc = html;
  document.body.appendChild(f);
  setTimeout(() => {
    try {
      f.contentWindow?.focus();
      f.contentWindow?.print();
    } catch { /* ignore */ }
  }, 600);
  setTimeout(() => f.remove(), 120000);
}

/** Download the individual customer's label as a PDF: ORD-1001-label.pdf */
export async function downloadOrderLabel(order: Order, s: Settings, fields: CustomField[]): Promise<void> {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(wrap);
  try {
    const { el } = mountLabelPreview(wrap, order, s, fields);
    if (!el) throw new Error('Label preview is not ready.');
    const { jpeg, w, h } = await rasterize(el);
    const [pw, ph] = s.labelSize === 'a6' ? [297.64, 419.53] : [288, 432];
    const blob = pdfDocument(pw, ph, jpeg, w, h);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.orderNumber}-label.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } finally {
    wrap.remove();
  }
}

/** Rasterize the label DOM to a high-resolution JPEG (used for the PDF download). */
async function rasterize(el: HTMLElement): Promise<{ jpeg: Uint8Array; w: number; h: number }> {
  const rect = el.getBoundingClientRect();
  const scale = 3;
  const w = Math.max(1, Math.round(rect.width * scale));
  const h = Math.max(1, Math.round(rect.height * scale));
  const clone = el.cloneNode(true) as HTMLElement;
  const liveSvg = el.querySelector('svg.barcode') as SVGSVGElement | null;
  if (liveSvg) {
    const box = liveSvg.getBoundingClientRect();
    const svg = clone.querySelector('svg.barcode') as SVGSVGElement | null;
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(liveSvg));
    img.style.width = box.width + 'px';
    img.style.height = box.height + 'px';
    img.style.display = 'block';
    if (svg) svg.replaceWith(img);
  }
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONT_FACE_CSS()}${LABEL_CSS}body{margin:0;background:#fff}</style></head><body>${new XMLSerializer().serializeToString(clone)}</body></html>`;
  const image = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Label download failed. Please try again.'));
    i.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(doc);
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Label download failed. Please try again.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const jpegUrl = canvas.toDataURL('image/jpeg', 0.94);
  const bin = atob(jpegUrl.slice(jpegUrl.indexOf(',') + 1));
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
  return { jpeg, w, h };
}

/** Minimal single-page PDF writer (one full-bleed JPEG image, no dependencies). */
export function pdfDocument(pw: number, ph: number, jpeg: Uint8Array, iw: number, ih: number): Blob {
  const parts: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const s = (str: string) => { parts.push(str); pos += str.length; };
  const b = (bytes: Uint8Array) => { parts.push(bytes); pos += bytes.length; };
  const obj = (body: string) => { offsets.push(pos); s(body); };

  s('%PDF-1.4\n');
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
  offsets.push(pos);
  s(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  b(jpeg);
  s('\nendstream\nendobj\n');
  offsets.push(pos);
  s(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xref = pos;
  let x = `xref\n0 6\n0000000000 65535 f \n`;
  for (const o of offsets) x += String(o).padStart(10, '0') + ' 00000 n \n';
  s(x);
  s(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Mark a label as printed/downloaded (drives the "Pending Labels" stat). */
export async function markLabelPrinted(order: Order): Promise<void> {
  if (order.labelPrinted) return;
  order.labelPrinted = true;
  order.updatedAt = new Date().toISOString();
  await saveOrder(order);
}
