// ---------------------------------------------------------------------------
// Spreadsheet engine — the single entry point the order service uses.
// Guarantees the "fields = columns / orders = rows" business rule:
//   1. read existing headers
//   2. compare with configured fields
//   3. create ONLY missing columns
//   4. reuse existing columns
//   5. append each new order as ONE new row
// ---------------------------------------------------------------------------
import type { Order, OrderField, Product, Settings } from '../../types';
import { LS, storage } from '../storage';
import type { DriverLike, SheetHeader } from './types';
import { buildRowForHeaders, desiredColumns, uniqueHeaders } from './values';

export interface EngineContext {
  driver: DriverLike;
  spreadsheetId: string;
  worksheetName: string;
  accessToken?: string;
}

export interface HeadersResult {
  headers: SheetHeader[];
  names: string[];
  lastRow: number;
}

export class SpreadsheetError extends Error {
  code: string;
  technical?: string;
  constructor(message: string, code = 'spreadsheet_error', technical?: string) {
    super(message);
    this.code = code;
    this.technical = technical;
  }
}

export function friendlySheetsError(e: unknown, fallback = 'Unable to update the spreadsheet. Please try again.'): SpreadsheetError {
  const err = e as { code?: string; message?: string; status?: number; error?: { code?: number; message?: string } };
  const status = err?.error?.code ?? err?.status;
  const rawMsg = err?.error?.message ?? err?.message ?? '';
  if (status === 401 || status === 403) {
    return new SpreadsheetError(
      'Google permission was denied or the session expired. Please reconnect your Google account.',
      'auth_required',
      rawMsg,
    );
  }
  if (status === 404) {
    return new SpreadsheetError(
      'The spreadsheet or worksheet was not found. It may have been deleted or renamed.',
      'not_found',
      rawMsg,
    );
  }
  if (status === 429) {
    return new SpreadsheetError(
      'Google Sheets is busy (rate limit). Please wait a moment and try again.',
      'rate_limit',
      rawMsg,
    );
  }
  if (/network|fetch|failed to fetch|offline|ERR_/i.test(rawMsg)) {
    return new SpreadsheetError(
      'Unable to reach Google Sheets. Please check your internet connection.',
      'network',
      rawMsg,
    );
  }
  return new SpreadsheetError(fallback, 'spreadsheet_error', rawMsg || String(e));
}

function ctxState(ctx: EngineContext, lastRow?: number) {
  return { accessToken: ctx.accessToken ?? '', spreadsheetId: ctx.spreadsheetId, worksheetName: ctx.worksheetName, lastRow };
}

export class SpreadsheetEngine {
  private async readHeaders(ctx: EngineContext): Promise<HeadersResult> {
    const headers = await ctx.driver.getHeaders(ctxState(ctx));
    const cachedLastRow = (await storage.getState<number>(LS.lastRow)) ?? 0;
    // Prefer the tracked last appended row; fall back to the sheet's own count.
    const lastRow = cachedLastRow > 0 ? cachedLastRow : headers.length ? 1 : 0;
    return { headers, names: headers.map((h) => h.name), lastRow };
  }

  /**
   * Ensure the sheet contains every configured column. Never deletes or
   * renames existing columns. Returns the final header list.
   */
  async ensureSchema(
    ctx: EngineContext,
    fields: OrderField[],
    products: Product[],
    settings: Settings,
  ): Promise<{ headers: SheetHeader[]; created: string[] }> {
    const want = desiredColumns(fields, products, settings);
    const { headers: existing } = await this.readHeaders(ctx);
    const existingNames = existing.map((h) => h.name);
    const existingLower = new Set(existingNames.map((n) => n.trim().toLowerCase()));

    const missing = uniqueHeaders(
      want.filter((n) => !existingLower.has(n.trim().toLowerCase())),
      existingNames,
    );
    let headers = existing;
    if (missing.length > 0) {
      headers = await ctx.driver.ensureColumns(ctxState(ctx), missing);
    }
    // Cache headers for the mapping UI + offline preview
    const finalNames = headers.map((h) => h.name);
    const map: Record<string, number> = {};
    finalNames.forEach((n, i) => {
      if (n && !(n.toLowerCase() in map)) map[n] = i;
    });
    await storage.setMany({ [LS.sheetHeaders]: map });
    return { headers, created: missing };
  }

  /**
   * Append a single new order as one new row.
   * Returns the 1-based row index.
   */
  async appendOrder(
    ctx: EngineContext,
    order: Order,
    fields: OrderField[],
    products: Product[],
    settings: Settings,
  ): Promise<number> {
    const { headers } = await this.ensureSchema(ctx, fields, products, settings);
    const names = headers.map((h) => h.name);
    const row = buildRowForHeaders(names, order, { fields, products, settings });
    const state = ctxState(ctx);
    const cachedLastRow = (await storage.getState<number>(LS.lastRow)) ?? 0;
    if (cachedLastRow > 0) state.lastRow = cachedLastRow;
    const result = await ctx.driver.appendRow(state, row);
    await storage.set(LS.lastRow, result.row);
    // Trim the cached header map to actual headers only
    const map: Record<string, number> = {};
    names.forEach((n, i) => { if (n) map[n] = i; });
    await storage.set(LS.sheetHeaders, map);
    return result.row;
  }

  /**
   * Update an existing order IN PLACE (same row). Reads the current row,
   * merges mapped values and writes it back — never creates a new row.
   */
  async updateOrder(
    ctx: EngineContext,
    order: Order,
    rowIndex: number,
    fields: OrderField[],
    products: Product[],
    settings: Settings,
  ): Promise<void> {
    const { headers } = await this.ensureSchema(ctx, fields, products, settings);
    const names = headers.map((h) => h.name);
    const desired = buildRowForHeaders(names, order, { fields, products, settings });
    const width = Math.max(names.length, desired.length);
    const current = await ctx.driver.getRow(ctxState(ctx), rowIndex, width);
    const merged = current.map((cell, i) => {
      // only replace cells whose column we manage; keep the rest untouched
      const name = names[i];
      if (name) {
        const lower = name.trim().toLowerCase();
        if (desired[i] !== undefined) {
          // For product qty columns and system columns we always own the cell.
          const owned =
            lower === 'total' || lower === 'delivery charge' || lower === 'previous order number' ||
            lower === 'label status' || lower === 'printed at' || lower === 'created at' || lower === 'updated at' ||
            / qty$/.test(lower) || desired[i] !== '';
          if (owned) return desired[i];
        }
      }
      return cell;
    });
    // Apply every desired value to its aligned position (fields mapping), only
    // for cells we manage (desired non-empty, or product/system column).
    for (let i = 0; i < names.length; i += 1) {
      const lower = (names[i] || '').trim().toLowerCase();
      const ownedCol =
        lower === 'total' || lower === 'delivery charge' || lower === 'previous order number' ||
        lower === 'label status' || lower === 'printed at' || lower === 'created at' || lower === 'updated at' ||
        / qty$/.test(lower);
      if (ownedCol) merged[i] = desired[i] ?? merged[i];
      else if (desired[i] !== '' && merged[i] !== desired[i]) merged[i] = desired[i]!;
    }
    await ctx.driver.updateRow(ctxState(ctx), rowIndex, merged);
  }

  /** Peek at the last rows for verification/preview. */
  async readRecentRows(ctx: EngineContext, count: number): Promise<string[][]> {
    const lastRow = (await storage.getState<number>(LS.lastRow)) ?? 0;
    if (lastRow <= 1) return [];
    const start = Math.max(2, lastRow - count + 1);
    return ctx.driver.getGrid(ctxState(ctx, lastRow)).then((grid) =>
      grid.filter((_, i) => i + 1 >= start && i + 1 <= lastRow).map((r) => r.slice(0, 40)),
    );
  }

  async lastRow(ctx: EngineContext): Promise<number> {
    const { lastRow } = await this.readHeaders(ctx);
    return lastRow;
  }
}

export async function getSheetHeadersCached(): Promise<Record<string, number>> {
  return (await storage.getState<Record<string, number>>(LS.sheetHeaders)) ?? {};
}
