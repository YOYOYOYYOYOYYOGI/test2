// ---------------------------------------------------------------------------
// Download Label — saves one order's shipping label as a PNG image file.
//
// Approach (no extra libraries): render the exact <LabelSheetComponent> DOM
// off-screen, serialize it into an SVG <foreignObject>, rasterize that SVG on
// a canvas, and download the PNG. QR/barcode/business logo are data: URLs so
// the canvas is never tainted. This does NOT touch print/label preview flows.
// ---------------------------------------------------------------------------
import type { Order, OrderField, Settings } from '../types';
import { downloadBlob } from './excelExport';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** "ORD-1001/A" -> "ORD-1001-A" so it is safe in file names. */
export function safeFileNamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'label';
}

function dataUrlToBlob(url: string): Promise<Blob> {
  return fetch(url).then((r) => r.blob());
}

export async function downloadOrderLabelPng(order: Order, settings: Settings, fields: OrderField[]): Promise<void> {
  if (typeof document === 'undefined') throw new Error('Downloading labels needs a browser page.');
  const [{ buildLabelModel }, { LabelSheetComponent, labelSizePx }, { createRoot }, React] = await Promise.all([
    import('../components/label/labelModel'),
    import('../components/label/LabelSheet'),
    import('react-dom/client'),
    import('react'),
  ]);

  const model = buildLabelModel(order, settings, fields);
  const { width, height } = labelSizePx(settings);
  const scale = 3; // crisp PNG (96dpi label * 3 ≈ 288dpi)

  // 1) off-screen render of the true-size label
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-20000px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(React.createElement(LabelSheetComponent, { model, settings }));
    // 2) wait until QR/barcode/logo images decoded (they are data: URLs)
    const deadline = Date.now() + 2500;
    for (;;) {
      const imgs = Array.from(host.querySelectorAll('img'));
      const ready = imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
      if (ready) break;
      if (Date.now() > deadline) break; // export what we have rather than hang
      await delay(40);
    }

    // 3) serialize label DOM into an SVG foreignObject
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error('Label did not render.');
    const xml = new XMLSerializer().serializeToString(node);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    // 4) rasterize
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Label image could not be rasterized.'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) throw new Error('Canvas is not available in this browser.');
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, canvas.width, canvas.height);
    ctx2.scale(scale, scale);
    ctx2.drawImage(img, 0, 0, width, height);

    const blob: Blob = await new Promise((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png');
      } else {
        dataUrlToBlob(canvas.toDataURL('image/png')).then(resolve).catch(reject);
      }
    });
    downloadBlob(`label-${safeFileNamePart(order.orderNumber)}.png`, blob);
  } finally {
    root.unmount();
    host.remove();
  }
}
