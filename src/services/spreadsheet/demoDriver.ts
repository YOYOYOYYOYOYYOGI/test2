// ---------------------------------------------------------------------------
// Demo mode driver — simulates a spreadsheet entirely in memory so the whole
// flow (fields → columns, orders → rows, labels, printing) can be tried
// without a Google account.
// ---------------------------------------------------------------------------
import { DEMO_COLUMNS, defaultSettings } from '../../lib/constants';
import type { Settings } from '../../types';
import type { DriverLike, SheetHeader } from './types';
import { uniqueHeaders } from './values';

const DEMO_SPREADSHEET_ID = 'demo-spreadsheet';
const DEMO_WORKSHEET = 'Orders';

/** Demo sheets share one in-memory grid so the app, tests and background see
 *  the same “spreadsheet”. resetDemoGrid() clears it (used by tests). */
let sharedGrid: string[][] | null = null;

export class DemoDriver implements DriverLike {
  readonly kind = 'demo' as const;
  /** in-memory grid; row 0 is the header row */
  private grid: string[][];
  private settings: Settings;

  constructor(settings?: Settings, seedHeaders?: string[]) {
    this.settings = settings ?? defaultSettings();
    if (seedHeaders) {
      this.grid = [seedHeaders.slice()];
    } else {
      if (!sharedGrid) sharedGrid = [DEMO_COLUMNS.slice()];
      this.grid = sharedGrid;
    }
  }

  static resetDemoGrid(): void {
    sharedGrid = null;
  }

  private colIndexOf(name: string): number {
    const header = this.grid[0];
    return header.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());
  }

  private ensureHeaderCount(n: number): void {
    for (const row of this.grid) {
      while (row.length < n) row.push('');
    }
  }

  async listSpreadsheets() {
    return [{ spreadsheetId: DEMO_SPREADSHEET_ID, spreadsheetName: 'My Business Orders (Demo)', worksheetName: DEMO_WORKSHEET }];
  }

  async listWorksheets() {
    return [DEMO_WORKSHEET];
  }

  async getHeaders(): Promise<SheetHeader[]> {
    return this.grid[0]
      .map((name, index) => ({ name, index }))
      .filter((h) => h.name.trim() !== '');
  }

  async getGrid(): Promise<string[][]> {
    return this.grid.map((r) => r.slice());
  }

  async getRow(_state: { worksheetName?: string }, rowIndex: number, width: number): Promise<string[]> {
    const row = this.grid[rowIndex - 1] ?? [];
    return Array.from({ length: width }, (_, i) => row[i] ?? '');
  }

  async ensureColumns(_state: { worksheetName?: string }, columns: string[]): Promise<SheetHeader[]> {
    const existing = this.grid[0].filter((h) => h.trim() !== '');
    const existingLower = new Set(existing.map((h) => h.trim().toLowerCase()));
    const missing = uniqueHeaders(
      columns.filter((c) => !existingLower.has(c.trim().toLowerCase())),
      existing,
    );
    if (missing.length) {
      this.grid[0].push(...missing);
    }
    this.ensureHeaderCount(this.grid[0].length);
    return this.getHeaders();
  }

  async appendRow(state: { worksheetName?: string; lastRow?: number }, values: string[]): Promise<{ row: number; range: string }> {
    // Never overwrite: append below any tracked row (even after a restart)
    this.ensureHeaderCount(Math.max(values.length, this.grid[0]?.length ?? 0));
    const blank = () => Array.from({ length: this.grid[0]?.length ?? values.length }, () => '');
    const target = Math.max(this.grid.length + 1, (state.lastRow ?? 0) + 1);
    while (this.grid.length < target - 1) this.grid.push(blank());
    this.grid[target - 1] = values.slice();
    return { row: target, range: `A${target}` };
  }

  async updateRow(_state: { worksheetName?: string }, rowIndex: number, values: string[]): Promise<void> {
    this.ensureHeaderCount(Math.max(values.length, this.grid[0]?.length ?? 0));
    if (rowIndex >= 2 && rowIndex <= this.grid.length) {
      for (let i = 0; i < values.length; i += 1) {
        if (this.grid[rowIndex - 1]) this.grid[rowIndex - 1][i] = values[i] ?? '';
      }
    }
  }

  async appendBlankRow(): Promise<number> {
    this.grid.push(Array.from({ length: this.grid[0].length }, () => ''));
    return this.grid.length;
  }
}
