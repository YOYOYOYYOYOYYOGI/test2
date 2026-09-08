// ---------------------------------------------------------------------------
// Minimal real .xlsx writer — zero dependencies (~200 lines).
//
// An .xlsx file is a ZIP (STORE method) of OOXML parts. We generate exactly
// the parts Excel needs:
//   [Content_Types].xml, _rels/.rels, xl/workbook.xml,
//   xl/_rels/workbook.xml.rels, xl/styles.xml (bold header font),
//   xl/worksheets/sheet1.xml (inline strings, frozen header row, col widths)
//
// Output opens in Excel / LibreOffice / Google Sheets as a genuine workbook —
// NOT a renamed CSV.
// ---------------------------------------------------------------------------
export type XlsxCell = string | number | boolean | null | undefined;

export interface XlsxOptions {
  /** Sheet tab name (default "Orders") */
  sheetName?: string;
  /** Freeze the first row (default true) */
  freezeHeader?: boolean;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'
  ));
}

/** Strip characters that are illegal inside XML 1.0 text. */
function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[\r\n\t]+/g, ' ');
}

function cellRef(col: number, row: number): string {
  let c = '';
  let n = col + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    c = String.fromCharCode(65 + m) + c;
    n = Math.floor((n - 1) / 26);
  }
  return `${c}${row + 1}`;
}

function numCellText(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  // Whole numbers (order counts, 10-digit phone numbers) are written exactly —
  // never through a float-noise trimmer, which mangles integers ≥ ~9e9 when
  // multiplied by 1e9 (beyond 2^53).
  if (Number.isInteger(v)) {
    // JS would use exponent notation past 1e21; Excel <v> cannot parse "1e+21".
    return abs >= 1e15 ? Math.round(v).toFixed(0) : String(v);
  }
  return String(Math.round(v * 1e6) / 1e6); // trim float noise on prices/amounts
}

// ---------------------------------------------------------------------------
// Sheet XML
// ---------------------------------------------------------------------------
function buildSheetXml(rows: XlsxCell[][], freeze: boolean): string {
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 1);
  // measure display width per column (for <cols> auto-size)
  const widths = Array.from({ length: colCount }, () => 0);
  const bump = (ci: number, v: XlsxCell) => {
    if (v === undefined || v === null) return;
    const len = typeof v === 'boolean' ? 4 : String(v).length;
    if (len > widths[ci]) widths[ci] = len;
  };
  rows.forEach((r) => r.forEach((v, ci) => bump(ci, v)));

  const colsXml = widths
    .map((w, i) => {
      const width = Math.min(Math.max(w + 2.5, 8.5), 60);
      return `<col min="${i + 1}" max="${i + 1}" width="${width.toFixed(2)}" customWidth="1"/>`;
    })
    .join('');

  const rowsXml = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = cellRef(ci, ri);
          if (v === undefined || v === null || v === '') return `<c r="${ref}"/>`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${numCellText(v)}</v></c>`;
          if (typeof v === 'boolean') {
            return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'Yes' : 'No'}</t></is></c>`;
          }
          const text = esc(cleanText(String(v)));
          const style = ri === 0 ? ' s="1"' : '';
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');

  const pane = freeze
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    pane +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (colCount ? `<cols>${colsXml}</cols>` : '') +
    `<sheetData>${rowsXml}</sheetData>` +
    '</worksheet>'
  );
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbookXml(sheetName: string): string {
  const name = cleanText(sheetName || 'Orders').slice(0, 31) || 'Orders';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// font 0 = regular, font 1 = bold; cellXfs 0 = default, 1 = bold
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

// ---------------------------------------------------------------------------
// Tiny ZIP writer (STORE method, no compression needed for XML)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

const enc = new TextEncoder();

function buildZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const [time, date] = dosDateTime();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const entry of entries) {
    const nameB = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameB.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed = size (store)
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameB.length, true);
    lv.setUint16(28, 0, true); // extra len
    local.set(nameB, 30);
    chunks.push(local, entry.data);

    const cen = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cen.set(nameB, 46);
    central.push(cen);
    offset += local.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralSize + eocd.length);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function xlsxBytes(rows: XlsxCell[][], options: XlsxOptions = {}): Uint8Array {
  const sheetName = options.sheetName ?? 'Orders';
  const freeze = options.freezeHeader !== false;
  const parts: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(sheetName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(buildSheetXml(rows, freeze)) },
  ];
  return buildZip(parts);
}

/** Convert the workbook bytes to a downloadable Blob. */
export function xlsxBlob(rows: XlsxCell[][], options: XlsxOptions = {}): Blob {
  const bytes = xlsxBytes(rows, options);
  return new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
