// ---------------------------------------------------------------------------
// Messaging protocol between extension pages (app/popup/print) and the MV3
// background service worker. Only auth/sheet/sync operations need the worker
// (chrome.identity must run there); everything else uses chrome.storage.
// ---------------------------------------------------------------------------
import type { OrderField, Order, Product, Settings, SpreadsheetConnection } from '../types';

export type SheetOp =
  | { kind: 'ensureSchema'; fields: OrderField[]; products: Product[]; settings: Settings }
  | { kind: 'appendOrder'; order: Order; fields: OrderField[]; products: Product[]; settings: Settings }
  | { kind: 'updateOrder'; order: Order; rowIndex: number; fields: OrderField[]; products: Product[]; settings: Settings };

export type Msg =
  | { type: 'AUTH_STATUS' }
  | { type: 'AUTH_CONNECT' }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_FLOW_RESULT'; payload: { status: string; detail: string } }
  | { type: 'CONNECTION_GET' }
  | { type: 'CONNECTION_SAVE'; payload: { spreadsheetId: string; spreadsheetName: string; worksheetName: string } }
  | { type: 'SHEET_LIST' }
  | { type: 'WORKSHEET_LIST'; payload: { spreadsheetId: string } }
  | { type: 'SHEET_OP'; payload: SheetOp }
  | { type: 'SYNC_PENDING_ORDERS' }
  | { type: 'GET_SETUP_STATE' };

export type MsgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; code?: string; technical?: string };

export function message<T = MsgResponse>(msg: Msg, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      reject(new Error('Not running inside the Chrome extension.'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('The extension background service is not responding. Try reloading the extension.')), timeoutMs);
    chrome.runtime.sendMessage(msg, (res: MsgResponse | undefined) => {
      clearTimeout(timer);
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || 'Extension messaging failed.'));
        return;
      }
      if (!res) {
        reject(new Error('No response from the extension background service.'));
        return;
      }
      if (!res.ok) {
        const err = new Error(res.error || 'Operation failed.') as Error & { code?: string; technical?: string };
        err.code = res.code;
        err.technical = res.technical;
        reject(err);
        return;
      }
      resolve(res.data as T);
    });
  });
}

export type AuthStatusData = { signedIn: boolean; email?: string | null };

export interface ConnectionSaveInput {
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
}

export interface SheetsListData {
  spreadsheets: { id: string; name: string }[];
}

export async function bgAuthConnect(): Promise<{ email: string | null; connection?: SpreadsheetConnection }> {
  return message({ type: 'AUTH_CONNECT' });
}

export async function bgAuthStatus(): Promise<AuthStatusData> {
  return message({ type: 'AUTH_STATUS' });
}

export async function bgAuthLogout(): Promise<{ ok: boolean }> {
  return message({ type: 'AUTH_LOGOUT' });
}

export async function bgGetConnection(): Promise<SpreadsheetConnection | null> {
  return message({ type: 'CONNECTION_GET' });
}

export async function bgSaveConnection(input: ConnectionSaveInput): Promise<SpreadsheetConnection | null> {
  return message({ type: 'CONNECTION_SAVE', payload: input });
}

export async function bgListSpreadsheets(): Promise<SheetsListData['spreadsheets']> {
  return message({ type: 'SHEET_LIST' });
}

export async function bgListWorksheets(spreadsheetId: string): Promise<string[]> {
  return message({ type: 'WORKSHEET_LIST', payload: { spreadsheetId } });
}

export async function bgRunSheetOp(op: SheetOp): Promise<unknown> {
  return message({ type: 'SHEET_OP', payload: op });
}

export async function bgSyncPendingOrders(): Promise<{ synced: number; failed: number; remaining?: number }> {
  return message({ type: 'SYNC_PENDING_ORDERS' });
}
