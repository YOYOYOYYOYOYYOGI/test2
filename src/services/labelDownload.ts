// ---------------------------------------------------------------------------
// Download Label — saves ONE order's label as a PDF (e.g. ORD-1001-label.pdf)
// sized to the configured label (default 4×6", A6 supported).
//
// SINGLE RENDERING SYSTEM: this uses the exact same code paths as the label
// preview and the print page:
//     buildLabelModel(order, settings, fields)
//     → <LabelSheetComponent> (the one and only label renderer)
// so the downloaded label visually matches preview/print — same logo, same
// fonts, same fields, same everything.
//
// Pipeline (no large libraries):
//   1. Render <LabelSheetComponent> off-screen at true label size.
//      - flushSync commits synchronously (fixes "Label did not render." —
//        React 18's root.render commits asynchronously, so the DOM node used
//        to not exist yet when we serialized).
//   2. Wait for fonts (document.fonts.ready, raced) and for QR / barcode /
//      logo <img>s (all data: URLs → the canvas is never tainted).
//      - any optional image that cannot load is OMITTED from the output
//        (QR / barcode / logo) instead of breaking the whole label.
//   3. Serialize the rendered DOM to XML and place it inside an SVG
//      <foreignObject> WITH the XHTML namespace on the root (fixes blank SVG:
//      without xmlns="http://www.w3.org/1999/xhtml" Chromium does not lay out
//      HTML inside an SVG image). XMLSerializer performs all escaping
//      (& < > " ' ₹ emoji, long text…).
//   4. Rasterize the SVG on a canvas at ~288 dpi.
//      - if decoding fails once, retry once with all optional <img> elements
//        removed (the "don't let one element break the download" fallback).
//   5. Encode as JPEG and wrap it in a minimal one-page PDF (mm-exact size)
//      via lib/pdf.ts — real PDF, correct aspect ratio, nothing stretched.
//
// Every failure surfaces as a technical code + a friendly message via
// labelDownloadErrorMessage() — never as "failedsvg".
// ---------------------------------------------------------------------------
import type { Order, OrderField, Settings } from '../types';
import { downloadBlob } from './excelExport';
import { pdfWithJpegImage } from '../lib/pdf';

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVGNS = 'http://www.w3.org/2000/svg';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** "ORD-1001/A" → "ORD-1001-A"; strips characters illegal in filenames. */
export function safeFileNamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'label';
}

/** Friendly message for normal users (technical detail goes to console). */
export function labelDownloadErrorMessage(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  console.error('[label download] technical detail:', e);
  // Normal users get one simple sentence — never raw codes.
  if (code === 'label-dom-missing') return 'The label could not be rendered. Please try again.';
  return 'Unable to download the label. Please try again.';
}

/** Wait for every <img> inside root to load, up to a deadline. */
async function waitForImages(root: HTMLElement, deadlineMs = 4000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const imgs = Array.from(root.querySelectorAll('img'));
    if (imgs.every((img) => img.complete && img.naturalWidth > 0)) return;
    if (Date.now() > deadline) return;
    await delay(40);
  }
}

/** Race document fonts with a cap so rasterization is not held up forever. */
async function waitForFonts(capMs = 1500): Promise<void> {
  try {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await Promise.race([(document as Document & { fonts: FontFaceSet }).fonts.ready, delay(capMs)]);
    }
  } catch { /* non-fatal */ }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/**
 * Serialize a rendered label DOM node into an <svg><foreignObject> document.
 * Exported for tests. `omitFailedImages` strips any <img> that has not
 * decoded yet (or all images when force-stripping in the fallback attempt) —
 * optional QR/barcode/logo must never break the download.
 */
export function labelDomToSvg(node: HTMLElement, widthPx: number, heightPx: number, imgMode: 'keep' | 'failed-only' | 'all' = 'failed-only'): string {
  const clone = node.cloneNode(true) as HTMLElement;
  // re-root in the XHTML namespace: without xmlns Chromium won't lay out HTML
  // content inside an SVG image (the blank/failed-svg bug)
  clone.setAttribute('xmlns', XHTML);
  clone.style.margin = '0';
  clone.style.width = `${widthPx}px`;
  clone.style.minHeight = `${heightPx}px`;
  clone.style.boxSizing = 'border-box';

  const imgs = Array.from(clone.querySelectorAll('img'));
  const originals = Array.from(node.querySelectorAll('img'));
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const orig = originals[i];
    const failed = !orig || !orig.complete || orig.naturalWidth === 0;
    if (imgMode === 'all' || (imgMode === 'failed-only' && failed)) {
      if (orig && (orig.getAttribute('data-label-logo') === '1' || orig.alt === 'logo')) {
        console.warn('[label download] logo image could not be loaded and was omitted from the download.');
      }
      img.remove();
    }
  }

  const xml = new XMLSerializer().serializeToString(clone);
  return (
    `<svg xmlns="${SVGNS}" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">` +
    `<foreignObject width="100%" height="100%">${xml}</foreignObject>` +
    `</svg>`
  );
}

/** Rasterize an SVG document string to a canvas (promise wrapper). */
export function svgToCanvas(svg: string, pxWidth: number, pxHeight: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pxWidth;
        canvas.height = pxHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas-2d-unavailable')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pxWidth, pxHeight);
        ctx.drawImage(img, 0, 0, pxWidth, pxHeight);
        resolve(canvas);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error('svg-image-decode-failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.93): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg-encode-failed'))), 'image/jpeg', quality);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export interface LabelDownloadResult {
  filename: string;
}

/**
 * Download one order's label as a PDF file.
 * Throws with a technical message; UI maps it through labelDownloadErrorMessage.
 */
export async function downloadOrderLabelPdf(order: Order, settings: Settings, fields: OrderField[]): Promise<LabelDownloadResult> {
  if (typeof document === 'undefined') throw new Error('no-document');
  const [{ buildLabelModel }, { LabelSheetComponent, labelSizePx }, { createRoot }, { flushSync }, React] = await Promise.all([
    import('../components/label/labelModel'),
    import('../components/label/LabelSheet'),
    import('react-dom/client'),
    import('react-dom'),
    import('react'),
  ]);

  const model = buildLabelModel(order, settings, fields);
  const { width, height } = labelSizePx(settings);
  const scale = 3; // 96dpi label × 3 ≈ 288dpi

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;background:#fff;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    // 1) render + force the commit to actually hit the DOM (fixes
    //    "Label did not render." — root.render() alone is async)
    flushSync(() => {
      root.render(React.createElement(LabelSheetComponent, { model, settings }));
    });
    // 2) passive effects (QR/barcode/logo state) need a beat
    await nextFrame();
    await delay(30);

    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error('label-dom-missing');

    // 3) let optional images + fonts finish (with caps)
    await waitForImages(node);
    await waitForFonts();

    // 4) DOM → SVG/foreignObject (XHTML namespace; failed optionals dropped)
    let svg: string;
    try {
      svg = labelDomToSvg(node, width, height, 'failed-only');
    } catch (e) {
      throw new Error(`svg-serialize-failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5) SVG → canvas (≈288 dpi); on decode failure retry once with ALL
    //    optional images removed so one element can never kill the download
    let canvas: HTMLCanvasElement;
    try {
      canvas = await svgToCanvas(svg, Math.round(width * scale), Math.round(height * scale));
    } catch {
      console.warn('[label download] full-label rasterization failed; retrying without optional images.');
      try {
        svg = labelDomToSvg(node, width, height, 'all');
        canvas = await svgToCanvas(svg, Math.round(width * scale), Math.round(height * scale));
      } catch (e2) {
        throw new Error(`svg-rasterize-failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
      }
    }

    // 6) canvas → JPEG → PDF at exact configured label size
    const jpeg = await canvasToJpeg(canvas);
    const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
    const pdfBytes = pdfWithJpegImage(jpegBytes, {
      widthMm: settings.labels.widthMm ?? 101.6,
      heightMm: settings.labels.heightMm ?? 152.4,
    });
    const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });

    const filename = `${safeFileNamePart(order.orderNumber)}-label.pdf`;
    downloadBlob(filename, pdfBlob);
    return { filename };
  } finally {
    try { root.unmount(); } catch { /* noop */ }
    host.remove();
  }
}
