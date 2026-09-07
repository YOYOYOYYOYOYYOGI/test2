// ---------------------------------------------------------------------------
// Google Sheets API driver (v4) — fetches JSON, no SDK needed, works in the
// MV3 service worker and in pages with a valid access token.
// ---------------------------------------------------------------------------
import { ensureFreshConnection } from './oauth';
import type { SpreadsheetConnection } from '../../types';
import type {
  AppendResult,
  DriverLike,
  SheetHeader,
  SheetMetadata,
} from '../spreadsheet/types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetState { worksheetName?: string; lastRow?: number }

function esc(value: string): string {
  return String(value).replace(/'/g, "\\'");
}

function a1Col(n: number): string {
  let s = '';
  let i = n + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function sheetRange(sheet: string, a1: string): string {
  return `'${esc(sheet)}'!${a1}`;
}

export class GoogleSheetsDriver implements DriverLike {
  readonly kind = 'google' as const;
  private connection: SpreadsheetConnection;

  constructor(connection: SpreadsheetConnection) {
    this.connection = connection;
  }

  private async headers(): Promise<Record<string, string>> {
    const fresh = await ensureFreshConnection(this.connection);
    this.connection = fresh;
    return {
      Authorization: `Bearer ${fresh.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const h = await this.headers();
    const res = await fetch(`${API}/${path}`, {
      ...init,
      headers: { ...h, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let payload: unknown = null;
      try { payload = await res.json(); } catch { /* ignore */ }
      const e = payload as { error?: { code?: number; message?: string; status?: string } };
      const err = new Error(e?.error?.message || `Google Sheets API error (${res.status})`) as Error & {
        status?: number; error?: { code?: number; message?: string };
      };
      err.status = res.status;
      err.error = e?.error;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  private encodeRange(sheet: string, range: string): string {
    return sheetRange(sheet, range);
  }

  async listSpreadsheets(): Promise<SheetMetadata[]> {
    // Drive API: list sheets the user owns/opened (file mimeType filter).
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      )}&fields=files(id,name)&pageSize=100&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const h = await this.headers();
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      throw new Error(`Unable to list spreadsheets (${res.status})`);
    }
    const data = (await res.json()) as { files?: { id: string; name: string }[] };
    return (data.files ?? []).map((f) => ({
      spreadsheetId: f.id,
      spreadsheetName: f.name,
      worksheetName: 'Sheet1',
    }));
  }

  async listWorksheets(spreadsheetId: string): Promise<string[]> {
    const data = await this.request<{ sheets?: { properties?: { title?: string } }[] }>(
      `${spreadsheetId}?fields=sheets.properties.title`,
    );
    return (data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
  }

  private async values(sheet: string, range: string, opts?: { majorDimension?: string }): Promise<unknown[][]> {
    const suffix = opts?.majorDimension ? `&majorDimension=${opts.majorDimension}` : '';
    const data = await this.request<{ values?: unknown[][] }>(
      `${this.connection.spreadsheetId}/values/${encodeURIComponent(this.encodeRange(sheet, range))}${suffix}`,
    );
    return data.values ?? [];
  }

  async getHeaders(): Promise<SheetHeader[]> {
    const rows = await this.values(this.connection.worksheetName, 'A1:1');
    const headerRow = rows[0] ?? [];
    // stop at first fully empty cell (Google Sheets omits trailing empties)
    return headerRow
      .map((v, index) => ({ name: String(v ?? ''), index }))
      .filter((h) => h.name.trim() !== '');
  }

  async getGrid(state: SheetState, lastRow?: number): Promise<string[][]> {
    const sheet = state?.worksheetName ?? this.connection.worksheetName;
    const maxRow = lastRow ?? 500;
    const rows = await this.values(sheet, `A1:${a1Col(40)}${maxRow}`);
    return rows.map((r) => r.map((v) => String(v ?? '')));
  }

  async getRow(state: SheetState, rowIndex: number, width: number): Promise<string[]> {
    const sheet = state?.worksheetName ?? this.connection.worksheetName;
    const rows = await this.values(sheet, `A${rowIndex}:${a1Col(Math.max(width, 1))}${rowIndex}`);
    const row = rows[0] ?? [];
    const out = Array.from({ length: width }, (_, i) => String(row[i] ?? ''));
    return out;
  }

  async ensureColumns(
    state: { worksheetName?: string },
    columns: string[],
  ): Promise<SheetHeader[]> {
    const sheet = state?.worksheetName ?? this.connection.worksheetName;
    const existing = await this.getHeaders();
    const lower = new Set(existing.map((h) => h.name.trim().toLowerCase()));
    const toCreate = columns.filter((c) => !lower.has(c.trim().toLowerCase()));
    if (toCreate.length > 0) {
      // append after the right-most existing header cell (handles gaps)
      const lastIdx = existing.reduce((max, h) => Math.max(max, h.index), -1);
      const startCol = lastIdx + 1;
      const range = `${a1Col(startCol)}1:${a1Col(startCol + toCreate.length - 1)}1`;
      const body = { values: [toCreate], majorDimension: 'ROWS' };
      const resp = await this.request<{ updatedCells?: number }>(
        `${this.connection.spreadsheetId}/values/${encodeURIComponent(this.encodeRange(sheet, range))}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', body: JSON.stringify(body) },
      );
      if (!resp.updatedCells) {
        throw new Error('Google Sheets did not confirm the new columns were written.');
      }
    }
    return this.getHeaders();
  }

  /** Last populated row (1-based) within the given scan limit. */
  private async findLastRow(limit = 400): Promise<number> {
    const sheet = this.connection.worksheetName;
    let from = 1;
    while (from <= limit) {
      const to = Math.min(from + 399, limit);
      const rows = await this.values(sheet, `A${from}:ZZ${to}`);
      const lastInChunk = rows.length ? from + rows.length - 1 : 0;
      if (rows.length < to - from + 1 || to >= limit) {
        return Math.max(lastInChunk, from - 1);
      }
      from = to + 1;
    }
    return limit;
  }

  async appendRow(state: SheetState, values: string[]): Promise<AppendResult> {
    const sheet = state?.worksheetName ?? this.connection.worksheetName;
    let appendAt = 0;
    const cached = state.lastRow ?? 0;
    if (cached > 0) {
      const probe = await this.getRow(state, cached + 1, Math.max(values.length, 1));
      appendAt = probe.some((c) => c !== '') ? (await this.findLastRow()) + 1 : cached + 1;
    } else {
      appendAt = (await this.findLastRow()) + 1;
    }
    const width = Math.max(values.length, 1);
    const range = `A${appendAt}:${a1Col(width)}${appendAt}`;
    const body = { values: [values], majorDimension: 'ROWS' };
    const resp = await this.request<{ updatedCells?: number }>(
      `${this.connection.spreadsheetId}/values/${encodeURIComponent(this.encodeRange(sheet, range))}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    if (!resp.updatedCells) {
      throw new Error('Google Sheets did not confirm the row was written.');
    }
    return { row: appendAt, range };
  }

  async updateRow(state: SheetState, rowIndex: number, values: string[]): Promise<void> {
    const sheet = state?.worksheetName ?? this.connection.worksheetName;
    const range = `A${rowIndex}:${a1Col(Math.max(values.length, 1))}${rowIndex}`;
    await this.request<unknown>(
      `${this.connection.spreadsheetId}/values/${encodeURIComponent(this.encodeRange(sheet, range))}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ values: [values], majorDimension: 'ROWS' }) },
    );
  }

  async appendBlankRow(): Promise<number> {
    const blank = Array.from({ length: 20 }, () => '');
    const r = await this.appendRow({ worksheetName: this.connection.worksheetName }, blank);
    return r.row;
  }

  /** Write headers if the sheet is empty */
  async initEmptySheet(headers: string[]): Promise<void> {
    const existing = await this.getHeaders();
    if (existing.length > 0) return;
    await this.ensureColumns({ worksheetName: this.connection.worksheetName }, headers);
  }
}
