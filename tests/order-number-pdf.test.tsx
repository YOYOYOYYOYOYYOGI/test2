// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// PDF acceptance: exercise the real PDF download function with browser API
// shims, verify it renders a valid PDF and keeps the complete final order
// number in the downloaded filename. The label component itself is shared by
// preview, print and this PDF path.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import type { Order } from '../src/types';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { downloadOrderLabelPdf } from '../src/services/labelDownload';

const finalNumber = '15001-7000-3214-1234';

function sampleOrder(): Order {
  return {
    id: 'pdf-order',
    orderNumber: finalNumber,
    orderDate: '2026-09-07',
    previousOrderNumber: '7000-3214-1234',
    customer: { name: 'PDF Customer', whatsapp: '6352808571', mobile: '', address: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: {},
    paymentStatus: 'Pending', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New', notes: '',
    totalAmount: 0, printed: 'Not Printed', printedAt: null, createdAt: 1, updatedAt: 1, customFields: {},
  };
}

function fakeJpeg(): Blob {
  // Minimal SOF0-bearing JPEG bytes: sufficient for the real PDF writer to
  // determine image dimensions after the canvas shim calls toBlob().
  return new Blob([new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x64,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
  ])], { type: 'image/jpeg' });
}

describe('automatic order number PDF download', () => {
  it('creates a real PDF download with the complete final number in its filename', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.labels = { ...settings.labels, showQrCode: false, showBarcode: false, showLogo: false };

    const canvasProto = HTMLCanvasElement.prototype;
    const originalContext = canvasProto.getContext;
    const originalToBlob = canvasProto.toBlob;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const originalCreateUrl = URL.createObjectURL;
    const originalRevokeUrl = URL.revokeObjectURL;
    let downloaded: Blob | null = null;
    const clicked: string[] = [];

    Object.defineProperty(canvasProto, 'getContext', {
      configurable: true,
      value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
    });
    Object.defineProperty(canvasProto, 'toBlob', {
      configurable: true,
      value: (callback: (blob: Blob | null) => void) => callback(fakeJpeg()),
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => { downloaded = blob; return 'blob:order-label-test'; },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download); };

    try {
      const result = await downloadOrderLabelPdf(sampleOrder(), settings, fields);
      expect(result.filename).toBe(`${finalNumber}-label.pdf`);
      expect(clicked).toEqual([`${finalNumber}-label.pdf`]);
      expect(downloaded).toBeTruthy();
      const bytes = new Uint8Array(await downloaded!.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF-1.4');
    } finally {
      Object.defineProperty(canvasProto, 'getContext', { configurable: true, value: originalContext });
      Object.defineProperty(canvasProto, 'toBlob', { configurable: true, value: originalToBlob });
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateUrl });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeUrl });
    }
  });
});
