// ---------------------------------------------------------------------------
// Old customer/order file parsing — CSV/TSV text + real .xlsx workbooks.
//
// Pure functions, no storage/DOM. The xlsx reader is a tiny ZIP + XML reader
// (browser-native DecompressionStream for the deflate entries) — no library.
// ---------------------------------------------------------------------------
import type { OldOrderRecord } from '../types';
import { makeId } from './constants';
import { normalizeOrderNumber, normalizePhone, normalizePhoneText } from './normalizePhone';

export interface ColumnScan {
  /** canonical column name → index in the header row */
  index: Record<string, number>;
  /** every non-empty header name (for error messages / extra columns) */
  headers: string[];
}

const HEADER_KEY = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '');

// canonical slot -> accepted header spellings (normalized with HEADER_KEY)
const CANONICAL_ALIASES: Record<string, string[]> = {
  orderNumber: ['order number', 'order no', 'order no.', 'order num', 'order id', 'order'],
  name: ['name', 'customer name', 'client name', 'party name'],
  address: ['address', 'customer address', 'full address', 'shipping address'],
  // WhatsApp-only spellings — a file that ONLY has a phone-ish column still
  // maps that column to WhatsApp (see scanHeaders promotion below).
  whatsapp: ['whatsapp number', 'whatsapp no', 'whatsapp no.', 'whatsapp', 'wa number', 'customer whatsapp'],
  // Separate Mobile Number column (kept distinct from WhatsApp; optional).
  mobile: [
    'mobile number', 'mobile no', 'mobile no.', 'mobile', 'mobile num',
    'phone', 'phone number', 'phone no', 'phone num', 'contact', 'contact number',
    'customer mobile', 'telephone',
  ],
};

function canonicalOf(header: string): string | null {
  const k = HEADER_KEY(header);
  if (!k) return null;
  for (const [canon, aliases] of Object.entries(CANONICAL_ALIASES)) {
    if (aliases.some((a) => HEADER_KEY(a) === k)) return canon;
  }
  return null;
}

/** Map header names of the first row into canonical slots (+ extras). When a
 *  file has no WhatsApp column at all, its first phone-ish column (e.g.
 *  "Mobile Number") is promoted to the WhatsApp slot so those files keep
 *  importing exactly as before. Files with BOTH columns keep them separate. */
export function scanHeaders(rows: string[][]): ColumnScan {
  const header = rows[0] ?? [];
  const index: Record<string, number> = {};
  const headers: string[] = [];
  header.forEach((raw, i) => {
    const h = (raw ?? '').trim();
    if (!h) return;
    const canon = canonicalOf(h);
    const key = canon ?? HEADER_KEY(h);
    if (key && !(key in index)) index[key] = i;
    headers.push(h);
  });
  if (!('whatsapp' in index) && 'mobile' in index) {
    index.whatsapp = index.mobile;
    delete index.mobile;
  }
  return { index, headers };
}

/** Canonical display name used in "Required column missing: X" messages. */
export const REQUIRED_COLUMNS: { key: string; label: string }[] = [
  { key: 'orderNumber', label: 'Order Number' },
  { key: 'name', label: 'Name' },
  { key: 'address', label: 'Address' },
  { key: 'whatsapp', label: 'Whatsapp Number' },
];

export function missingRequiredColumns(scan: ColumnScan): string[] {
  const missing: string[] = [];
  for (const c of REQUIRED_COLUMNS) if (!(c.key in scan.index)) missing.push(c.label);
  return missing;
}

const cell = (v: unknown) => String(v ?? '').trim();

/** Convert data rows into old-order records. Empty rows and rows without an
 *  order number or whatsapp number are skipped. Duplicate rows (same
 *  order number + whatsapp + name + address) inside the file are skipped.
 *  Records are unique per old order number/row — the same WhatsApp number can
 *  legitimately appear many times. */
export function rowsToOldRecords(rows: string[][], scan: ColumnScan, now = Date.now()): { records: OldOrderRecord[]; skipped: number } {
  const records: OldOrderRecord[] = [];
  let skipped = 0;
  const seenRows = new Set<string>();
  const dataRows = rows.slice(1);
  // raw extras headers (columns beyond the canonical ones — incl. the
  // separate Mobile Number column, which is NOT an extra)
  const extraHeaders: { key: string; idx: number; label: string }[] = [];
  (rows[0] ?? []).forEach((raw, idx) => {
    const h = (raw ?? '').trim();
    if (!h) return;
    if (!canonicalOf(h)) extraHeaders.push({ key: HEADER_KEY(h), idx, label: h });
  });

  const get = (row: string[], idx: number | undefined) => (idx === undefined ? '' : cell(row[idx]));
  dataRows.forEach((row, ri) => {
    const isEmpty = (row ?? []).every((c) => !String(c ?? '').trim());
    if (isEmpty) { skipped += 1; return; }
    // Identifiers are ALWAYS strings — normalize scientific notation
    // (8.347034843E9 → 8347034843) and trailing ".0" (3542.0 → 3542) NOW.
    const orderNumber = normalizeOrderNumber(get(row, scan.index.orderNumber));
    const whatsapp = normalizePhone(get(row, scan.index.whatsapp));
    if (!orderNumber || !whatsapp) { skipped += 1; return; }
    const name = get(row, scan.index.name);
    const address = get(row, scan.index.address);
    // separate Mobile Number column — stored as TEXT, blank stays blank
    // (never copied from WhatsApp); scientific noise cleaned before storing
    const mobile = normalizePhoneText(get(row, scan.index.mobile)) || undefined;
    const dedupeKey = `${orderNumber.toLowerCase()}|${whatsapp.toLowerCase()}|${name.toLowerCase()}|${address.toLowerCase()}`;
    if (seenRows.has(dedupeKey)) { skipped += 1; return; }
    seenRows.add(dedupeKey);
    const extras: Record<string, string> = {};
    for (const e of extraHeaders) {
      const v = get(row, e.idx);
      if (v) extras[e.label] = v;
    }
    records.push({
      id: makeId(),
      orderNumber,
      name,
      address,
      whatsapp,
      mobile,
      extras: Object.keys(extras).length ? extras : undefined,
      sourceRow: ri + 2, // header = row 1
      importedAt: now,
    });
  });
  return { records, skipped };
}

// ---------------------------------------------------------------------------
// CSV / TSV parsing (quotes, embedded newlines, BOM)
// ---------------------------------------------------------------------------
export function parseDelimitedText(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  // strip trailing empty line
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const first = lines.find((l) => l.trim() !== '') ?? '';
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const delim = tabs > commas ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const flushField = () => { row.push(field); field = ''; };
  const flushRow = () => { flushField(); rows.push(row); row = []; };
  for (const line of lines) {
    let i = 0;
    const end = line.length;
    while (i < end) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += ch; i += 1; continue;
      }
      if (ch === '"') { inQuotes = true; i += 1; continue; }
      if (ch === delim) { flushField(); i += 1; continue; }
      field += ch; i += 1;
    }
    if (inQuotes) {
      // multiline quoted field — keep going
      field += '\n';
    } else {
      flushRow();
    }
  }
  if (field || row.length) flushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// ---------------------------------------------------------------------------
// Minimal .xlsx (OOXML zip) reader
// ---------------------------------------------------------------------------
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function u16(v: DataView, o: number): number { return v.getUint16(o, true); }
function u32(v: DataView, o: number): number { return v.getUint32(o, true); }

function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function unzipEntries(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const len = buf.byteLength;
  let eocd = -1;
  const min = Math.max(0, len - 22 - 65536);
  for (let i = len - 22; i >= min; i -= 1) {
    if (u32(v, i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid .xlsx file (no ZIP end record).');
  const count = u16(v, eocd + 10);
  let off = u32(v, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n += 1) {
    if (u32(v, off) !== SIG_CENTRAL) throw new Error('Corrupt .xlsx archive.');
    const method = u16(v, off + 10);
    const csize = u32(v, off + 20);
    const nameLen = u16(v, off + 28);
    const extraLen = u16(v, off + 30);
    const commentLen = u16(v, off + 32);
    const lho = u32(v, off + 42);
    const name = utf8(new Uint8Array(buf, off + 46, nameLen));
    // local header: 30 bytes + name + extra
    const lName = u16(v, lho + 26);
    const lExtra = u16(v, lho + 28);
    const dataStart = lho + 30 + lName + lExtra;
    const comp = new Uint8Array(buf, dataStart, csize);
    let data: Uint8Array;
    if (method === 0) data = comp;
    else if (method === 8) data = await inflateRaw(comp);
    else { off += 46 + nameLen + extraLen + commentLen; continue; } // unsupported — skip
    entries.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** inner texts of every <t>…</t> in an XML fragment (plain + rich runs) */
function textsOfTag(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(decodeXml(m[1]));
  return out;
}

function colIndexFromRef(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref ?? '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Regex-based OOXML reader (works everywhere — no DOMParser dependency). */
export async function parseXlsxRows(buf: ArrayBuffer): Promise<string[][]> {
  const entries = await unzipEntries(buf);
  const sheetNames = [...entries.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
  if (sheetNames.length === 0) throw new Error('No worksheet found in the .xlsx file.');

  // shared strings
  const sst: string[] = [];
  const sharedRaw = entries.get('xl/sharedStrings.xml');
  if (sharedRaw) {
    const xml = utf8(sharedRaw);
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml)) !== null) sst.push(textsOfTag(m[1], 't').join(''));
  }

  const sheetXml = utf8(entries.get(sheetNames[0])!);
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml)) !== null) {
    const rowBody = rm[1];
    const row: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowBody)) !== null) {
      const attrs = cm[1];
      const inner = cm[2];
      const idx = colIndexFromRef(/r="([^"]*)"/.exec(attrs)?.[1] ?? '');
      if (idx < 0) continue;
      const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? 'n';
      const vRaw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      const raw = decodeXml(vRaw);
      let value: string;
      if (type === 's') value = sst[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textsOfTag(inner, 't').join('');
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else value = raw; // numbers / strings / errors
      row[idx] = value;
    }
    // trim empty trailing cells
    while (row.length && (row[row.length - 1] ?? '') === '') row.pop();
    if (row.some((x) => String(x ?? '').trim() !== '')) rows.push(row);
  }
  return rows;
}

/** Read an uploaded file: .xlsx (magic bytes) → OOXML parse; otherwise CSV/TSV text. */
export async function fileToRows(file: Blob): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const head = new DataView(buf);
  const isZip = buf.byteLength > 4 && head.getUint32(0, true) === SIG_LOCAL;
  if (isZip) return parseXlsxRows(buf);
  const text = new TextDecoder('utf-8').decode(buf);
  if (!text.trim()) return [];
  return parseDelimitedText(text);
}
