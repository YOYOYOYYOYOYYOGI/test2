// Excel (.xlsx) export — minimal Office Open XML writer using uncompressed
// (STORED) ZIP entries, so it needs zero dependencies. Opens directly in
// Excel, Google Sheets and LibreOffice.
import type { Order } from '../types';
import { colA1 } from './google';
import { buildRow, STD_COLS } from './sheets-data';
import { getFields, getProducts } from './store';
import { todayStr } from '../utils';

const XMLHEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

const escXml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* ---------- minimal ZIP (stored) ---------- */
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

const u16 = (v: number) => new Uint8Array([v & 255, (v >>> 8) & 255]);
const u32 = (v: number) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);

function part(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    locals.push(
      part(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0),
        name, f.data
      )
    );
    centrals.push(
      part(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
        name
      )
    );
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = part(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0));
  return new Blob([...locals, ...centrals, eocd] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- worksheet XML ---------- */
function sheetXml(headers: string[], rows: string[][]): string {
  const numeric = new Set(headers.map((h, i) => (h === 'Amount' || h.endsWith(' Qty') ? i : -1)).filter((i) => i >= 0));
  const cell = (r: number, c: number, v: string): string => {
    if (v === '') return '';
    const ref = `${colA1(c)}${r}`;
    if (numeric.has(c) && !Number.isNaN(Number(v))) return `<c r="${ref}"><v>${Number(v)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escXml(v)}</t></is></c>`;
  };
  const rowXml = (vals: string[], r: number, style?: string) =>
    `<row r="${r}"${style ? ` s="${style}" customFormat="1"` : ''}>${vals.map((v, c) => cell(r, c, v)).join('')}</row>`;
  return (
    XMLHEAD +
    `<worksheet xmlns="${NS_MAIN}"><cols><col min="1" max="${Math.max(headers.length, 1)}" width="22" customWidth="1"/></cols><sheetData>` +
    rowXml(headers, 1, '1') +
    rows.map((vals, i) => rowXml(vals, i + 2)).join('') +
    '</sheetData></worksheet>'
  );
}

const CONTENT_TYPES =
  XMLHEAD +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS =
  XMLHEAD +
  `<Relationships xmlns="${NS_PKG}">` +
  `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK =
  XMLHEAD +
  `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS =
  XMLHEAD +
  `<Relationships xmlns="${NS_PKG}">` +
  `<Relationship Id="rId1" Type="${NS_R}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`;

const STYLES =
  XMLHEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
  `<cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

/** Build an .xlsx file with a bold header row; Amount/Qty columns become real numbers. */
export function ordersToXlsx(headers: string[], rows: string[][]): Blob {
  const enc = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(WORKBOOK) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml(headers, rows)) },
  ];
  return zipStore(files);
}

/** Same layout as the Google Sheet: standard columns + custom fields + per-product qty. */
export function excelLayout(): string[] {
  return [...STD_COLS, ...getFields().map((f) => f.name), ...getProducts().map((p) => `${p.name} Qty`)];
}

/** Build and download the Excel file for a set of orders. */
export function downloadOrdersExcel(orders: Order[], kind: 'today' | 'all'): void {
  const headers = excelLayout();
  const rows = orders.map((o) => buildRow(o, headers));
  const url = URL.createObjectURL(ordersToXlsx(headers, rows));
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'today' ? `orders-today-${todayStr()}.xlsx` : `orders-all-${todayStr()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
