// @vitest-environment happy-dom
// Unit tests for the label PDF download helpers + minimal PDF writer.
import { describe, expect, it } from 'vitest';
import { pdfWithJpegImage, jpegSize } from '../src/lib/pdf';
import { labelDownloadErrorMessage, safeFileNamePart, labelDomToSvg } from '../src/services/labelDownload';
import { LABEL_FONT_FAMILIES, LABEL_FONT_KEYS, labelFontFamily, labelFontStack, labelFontSize, labelGlobalFontSize } from '../src/components/label/labelStyle';
import type { LabelConfig } from '../src/types';

describe('safeFileNamePart', () => {
  it('keeps plain order numbers and strips illegal characters', () => {
    expect(safeFileNamePart('ORD-1001')).toBe('ORD-1001');
    expect(safeFileNamePart('ORD-1001/A')).toBe('ORD-1001-A');
    expect(safeFileNamePart('1001')).toBe('1001');
    expect(safeFileNamePart('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(safeFileNamePart('///')).toBe('label');
  });
});

describe('labelDownloadErrorMessage', () => {
  it('always returns a friendly message, never raw codes ("failedsvg" never leaks)', () => {
    expect(labelDownloadErrorMessage(new Error('svg-image-decode-failed'))).toBe('Unable to download the label. Please try again.');
    expect(labelDownloadErrorMessage('anything-raw')).toBe('Unable to download the label. Please try again.');
    expect(labelDownloadErrorMessage(new Error('label-dom-missing'))).toBe('The label could not be rendered. Please try again.');
  });
});

describe('labelDomToSvg', () => {
  it('re-roots the label in the XHTML namespace and embeds it in an SVG foreignObject', () => {
    const el = document.createElement('div');
    el.setAttribute('style', 'font-size:13px');
    el.innerHTML = 'Rahul &amp; Sons < ₹1,200 > "ok" \'fine\'';
    const svg = labelDomToSvg(el, 384, 576);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(svg).toContain('Rahul &amp; Sons');
    expect(svg).toContain('₹1,200');
    expect(svg).toContain('width="384" height="576"');
  });

  it('drops failed optional images when asked (QR/barcode/logo never break the download)', () => {
    const el = document.createElement('div');
    el.innerHTML = '<img alt="logo" src="data:image/png;base64,xx" /><img alt="QR" /><span>text</span>';
    // happy-dom: imgs are not "complete" → failed-only mode removes them
    const svg = labelDomToSvg(el, 100, 100, 'failed-only');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('text');
  });
});

describe('label typography helpers (single source for preview/print/pdf)', () => {
  const base = (labels?: Partial<LabelConfig>): LabelConfig =>
    ({ sizeId: '4x6', widthMm: 101.6, heightMm: 152.4, showBusinessHeader: true, showCustomer: true, showAddress: true, showProducts: true, showPayment: true, showOrderNumber: true, showQrCode: true, showBarcode: false, showFooter: true, footerText: 'x', fontSize: 13, fontFamily: 'Inter', fontSizes: {}, ...labels });

  it('global default is 13px and is clamped to 8–30', () => {
    expect(labelGlobalFontSize(base())).toBe(13);
    expect(labelGlobalFontSize(base({ fontSize: 2 }))).toBe(8);
    expect(labelGlobalFontSize(base({ fontSize: 99 }))).toBe(30);
  });

  it('parts follow the global size unless overridden; overrides clamp to 6–72', () => {
    const cfg = base({ fontSize: 15 });
    for (const k of LABEL_FONT_KEYS) expect(labelFontSize(cfg, k)).toBe(15);
    const over = base({ fontSizes: { customerName: 20, footer: 1, address: 500 } });
    expect(labelFontSize(over, 'customerName')).toBe(20);
    expect(labelFontSize(over, 'footer')).toBe(6);
    expect(labelFontSize(over, 'address')).toBe(72);
    expect(labelFontSize(over, 'productName')).toBe(13); // untouched → global
  });

  it('font family is restricted to the safe list with fallback stack', () => {
    expect(labelFontFamily(base({ fontFamily: 'Roboto' }))).toBe('Roboto');
    expect(labelFontFamily(base({ fontFamily: 'Wingdings' }))).toBe('Inter'); // fallback
    expect(labelFontFamily(base({ fontFamily: '' }))).toBe('Inter');
    expect(labelFontStack(base({ fontFamily: 'Arial' }))).toContain("'Arial'");
    expect(labelFontStack(base({ fontFamily: 'Inter' }))).toContain("'Inter'");
    expect(LABEL_FONT_FAMILIES).toContain('sans-serif');
  });
});

describe('minimal PDF writer', () => {
  function fakeJpeg(pxWidth: number, pxHeight: number): Uint8Array {
    // minimal valid-ish stream containing a SOF0 marker so jpegSize can parse
    const bytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xc0, // SOF0
      0x00, 0x11, // length
      0x08, // precision
      (pxHeight >> 8) & 0xff, pxHeight & 0xff,
      (pxWidth >> 8) & 0xff, pxWidth & 0xff,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
      0xff, 0xd9, // EOI
    ]);
    return bytes;
  }

  it('reads JPEG pixel size from the SOF marker', () => {
    expect(jpegSize(fakeJpeg(640, 480))).toEqual({ pxWidth: 640, pxHeight: 480 });
  });

  it('builds a parseable PDF with a 4×6 inch (101.6×152.4 mm) MediaBox', () => {
    const pdf = pdfWithJpegImage(fakeJpeg(300, 450), { widthMm: 101.6, heightMm: 152.4 });
    const dec = new TextDecoder();
    const text = dec.decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 288 432]'); // exact inches → pt
    expect(text).toContain('/Width 300 /Height 450');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain('startxref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    // xref offsets are BYTE offsets — slice bytes, then decode (TextDecoder
    // would shift offsets because the binary header comment is multi-byte)
    const m = text.match(/startxref\n(\d+)\n%%EOF/);
    expect(m).toBeTruthy();
    const xrefStart = Number(m![1]);
    const xrefBlock = dec.decode(pdf.subarray(xrefStart));
    expect(xrefBlock.startsWith('xref')).toBe(true);
    for (let n = 1; n <= 5; n++) {
      // xref lines: ['xref', '0 6', free-entry, obj1, obj2, ...]
      const off = parseInt(xrefBlock.split('\n')[n + 2].slice(0, 10), 10);
      expect(dec.decode(pdf.subarray(off, off + `${n} 0 obj`.length))).toBe(`${n} 0 obj`);
    }
  });

  it('A6 (105×148 mm) gives a 297.64×419.53 pt page', () => {
    const pdf = pdfWithJpegImage(fakeJpeg(10, 10), { widthMm: 105, heightMm: 148 });
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain('/MediaBox [0 0 297.64 419.53]');
  });
});
