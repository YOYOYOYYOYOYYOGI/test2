// ---------------------------------------------------------------------------
// Spreadsheet provider abstraction.
// Implementations: GoogleSheetsDriver (OAuth + Google Sheets API) and
// DemoDriver (local sample sheet). Excel/OneDrive can be added later by
// implementing the same interface.
// ---------------------------------------------------------------------------
export interface SheetHeader {
  name: string;
  index: number; // 0-based column index
}

export interface SheetMetadata {
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  url?: string;
}

export interface AppendResult {
  /** 1-based row index of the appended row */
  row: number;
  /** full range that was written, e.g. A1:Z24 */
  range: string;
}

export interface DriverState {
  accessToken: string;
  spreadsheetId: string;
  worksheetName: string;
  /** 1-based row index of last row with data (0 = empty sheet) */
  lastRow?: number;
}

export interface SpreadsheetDriver {
  readonly kind: 'google' | 'excel' | 'demo';

  listSpreadsheets(): Promise<SheetMetadata[]>;
  listWorksheets(spreadsheetId: string): Promise<string[]>;

  /** Read the header row (first row). Returns [] for an empty sheet. */
  getHeaders(state: DriverState): Promise<SheetHeader[]>;

  /** Get the full A1:ZZ<lastRow> grid (for previews/editing). */
  getGrid(state: DriverState, lastRow?: number): Promise<string[][]>;

  /** Read a single row: returns `width` cells starting at column A (blank-padded). */
  getRow(state: DriverState, rowIndex: number, width: number): Promise<string[]>;

  /** Ensure the given columns exist after the last used header (returns final header order). */
  ensureColumns(state: DriverState, columns: string[]): Promise<SheetHeader[]>;

  /** Append a single row after lastRow. Returns the new 1-based row index. */
  appendRow(state: DriverState, values: string[]): Promise<AppendResult>;

  /** Update an existing row by 1-based row index. */
  updateRow(state: DriverState, rowIndex: number, values: string[]): Promise<void>;

  /** Fill an empty (placeholder) row so headers won't be confused with data. */
  appendBlankRow(state: DriverState): Promise<number>;

  disconnect?(): Promise<void>;
}

export interface DriverLike {
  listSpreadsheets(): Promise<SheetMetadata[]>;
  listWorksheets(spreadsheetId: string): Promise<string[]>;
  getHeaders(state: DriverState): Promise<SheetHeader[]>;
  getGrid(state: DriverState, lastRow?: number): Promise<string[][]>;
  getRow(state: DriverState, rowIndex: number, width: number): Promise<string[]>;
  ensureColumns(state: DriverState, columns: string[]): Promise<SheetHeader[]>;
  appendRow(state: DriverState, values: string[]): Promise<AppendResult>;
  updateRow(state: DriverState, rowIndex: number, values: string[]): Promise<void>;
  appendBlankRow(state: DriverState): Promise<number>;
}

export interface SheetColumnLookup {
  /** column name (normalized lower-case) -> 0-based index */
  byLowerName: Map<string, number>;
  /** original headers in order */
  headers: string[];
}

export function indexHeaders(headers: string[]): SheetColumnLookup {
  const byLowerName = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = String(h ?? '').trim().toLowerCase();
    if (key && !byLowerName.has(key)) byLowerName.set(key, i);
  });
  return { byLowerName, headers: headers.slice() };
}

export function colNameToA1(colIndex: number): string {
  let s = '';
  let n = colIndex + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function rowRangeA1(startCol: number, endCol: number, rowIndex: number): string {
  return `${colNameToA1(startCol)}${rowIndex}:${colNameToA1(endCol)}${rowIndex}`;
}
