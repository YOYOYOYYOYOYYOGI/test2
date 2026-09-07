// ---------------------------------------------------------------------------
// Minimal single-page PDF writer — embeds one JPEG image sized to the label
// dimensions (mm → pt). Zero dependencies (~120 lines).
//
// A label is rendered to a canvas → JPEG (DCTDecode needs no extra encoding),
// then wrapped in a real PDF: catalog → pages → page → image XObject with the
// exact MediaBox of the configured label size, so nothing is stretched.
// ---------------------------------------------------------------------------
const MM_TO_PT = 72 / 25.4;

function fmt(n: number): string {
  return Math.round(n * 100) / 100 + '';
}

export interface PdfPageSpec {
  widthMm: number;
  heightMm: number;
}

/**
 * Read JPEG SOF markers for pixel dimensions (baseline + progressive).
 * Returns 1×1 as a safe fallback.
 */
export function jpegSize(bytes: Uint8Array): { pxWidth: number; pxHeight: number } {
  let i = 2;
  const len = bytes.length;
  while (i + 9 < len) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        pxHeight: (bytes[i + 5] << 8) | bytes[i + 6],
        pxWidth: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }
    i += 2 + segLen;
  }
  return { pxWidth: 1, pxHeight: 1 };
}

/**
 * Build a one-page PDF whose page is exactly `widthMm × heightMm` and whose
 * only content is the given JPEG image (already in the same aspect ratio).
 */
export function pdfWithJpegImage(jpeg: Uint8Array, spec: PdfPageSpec): Uint8Array {
  const widthPt = fmt(spec.widthMm * MM_TO_PT);
  const heightPt = fmt(spec.heightMm * MM_TO_PT);
  const { pxWidth, pxHeight } = jpegSize(jpeg);
  const enc = new TextEncoder();

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  const contentStream = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${pxWidth} /Height ${pxHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    `<< /Length ${enc.encode(contentStream).length} >>\nstream\n${contentStream}`,
  ];

  const parts: Uint8Array[] = [];
  /** marks[i] = object number whose head starts at parts index i */
  const marks: Array<{ num: number; at: number }> = [];

  const push = (b: Uint8Array) => { parts.push(b); };

  const emit = (num: number, content: string, tail?: Uint8Array) => {
    marks.push({ num, at: parts.length });
    push(enc.encode(`${num} 0 obj\n${content}`));
    if (tail) push(tail);
    push(enc.encode(tail ? '\nendstream\nendobj\n' : '\nendobj\n'));
  };

  push(enc.encode(header));
  emit(1, objects[0]);
  emit(2, objects[1]);
  emit(3, objects[2]);
  emit(4, objects[3], jpeg); // image XObject: dictionary + raw JPEG bytes
  emit(5, objects[4] + 'endstream');

  // Derive every object offset from the real parts (no arithmetic drift).
  const offsets: Record<number, number> = {};
  let pos = 0;
  let mi = 0;
  for (let i = 0; i < parts.length; i++) {
    while (mi < marks.length && marks[mi].at === i) {
      offsets[marks[mi].num] = pos;
      mi++;
    }
    pos += parts[i].length;
  }
  const xrefStart = pos;

  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  const xrefBytes = enc.encode(xref);
  const trailerBytes = enc.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(pos + xrefBytes.length + trailerBytes.length);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  out.set(xrefBytes, p); p += xrefBytes.length;
  out.set(trailerBytes, p);
  return out;
}
