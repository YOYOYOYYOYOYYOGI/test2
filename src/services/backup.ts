// ---------------------------------------------------------------------------
// Full backup & restore — Settings → Backup & Restore.
//
// One JSON file contains ALL important extension data:
//   orders (order numbers, previous order number, customer info incl.
//     WhatsApp/Mobile, custom field values, payment, delivery, status),
//   imported historical old data, products, field configuration, delivery
//   rules, matching rules, order-number settings (prefix/start/current
//   counter) and every other setting (label design incl. the logo data URL,
//   business info, spreadsheet column mappings …).
//
// The file is versioned (backupVersion: 1) so future versions can migrate
// older backups. Restore REPLACES the current local data with the backup
// only after the user confirms. Live connection tokens are deliberately not
// carried over by restore — the spreadsheet connection is device/account
// specific; the Google account is re-connected once on the new computer.
// ---------------------------------------------------------------------------
import type { OldOrderRecord, Order, OrderField, Product, Settings } from '../types';
import { LS, storage } from './storage';

export const BACKUP_VERSION = 1;
export const BACKUP_APP = 'order-label-manager';

export interface BackupData {
  settings: Settings;
  fields: OrderField[];
  products: Product[];
  orders: Order[];
  oldOrders: OldOrderRecord[];
  /** next auto counter (order-number settings: current counter/next number) */
  nextOrderNumber: number;
  setupDone: boolean;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  backupVersion: number;
  exportedAt: string;
  data: BackupData;
}

/** User-facing file name: order-manager-backup-YYYY-MM-DD.json */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `order-manager-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** Collect every important key of the local store into one JSON string. */
export async function buildFullBackup(): Promise<string> {
  const s = await storage.loadAll();
  const file: BackupFile = {
    app: BACKUP_APP,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: s.settings,
      fields: s.fields,
      products: s.products,
      orders: s.orders,
      oldOrders: s.oldOrders,
      nextOrderNumber: s.nextOrderNumber,
      setupDone: s.setupDone,
    },
  };
  return JSON.stringify(file, null, 2);
}

export interface ParseResult {
  ok: true;
  file: BackupFile;
}
export interface ParseFailure {
  ok: false;
  /** user-facing message for an invalid file */
  message: string;
}

/** Validate a full-backup file. Never throws — invalid files produce a
 *  friendly message and never crash or touch stored data. */
export function parseBackupFile(text: string): ParseResult | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  const obj = parsed as { app?: unknown; backupVersion?: unknown; exportedAt?: unknown; data?: unknown };
  if (!obj || typeof obj !== 'object') {
    return { ok: false, message: 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  if (obj.app !== BACKUP_APP) {
    return { ok: false, message: 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  if (obj.backupVersion !== BACKUP_VERSION) {
    const num = typeof obj.backupVersion === 'number' ? obj.backupVersion : null;
    return { ok: false, message: num !== null
      ? `Invalid backup file. This backup uses file version ${num}, but this version of the extension reads version ${BACKUP_VERSION}. Please export a fresh backup and try again.`
      : 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  const d = obj.data as Partial<BackupData> | null | undefined;
  if (!d || typeof d !== 'object' || !d.settings || typeof d.settings !== 'object') {
    return { ok: false, message: 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  if (!Array.isArray(d.orders) || !Array.isArray(d.fields) || !Array.isArray(d.products)) {
    return { ok: false, message: 'Invalid backup file. Please select a valid Order Manager backup.' };
  }
  const oldOrders = Array.isArray(d.oldOrders) ? d.oldOrders : [];
  const nextOrderNumber = typeof d.nextOrderNumber === 'number' && Number.isFinite(d.nextOrderNumber) && d.nextOrderNumber > 0
    ? d.nextOrderNumber
    : undefined;
  const data: BackupData = {
    settings: d.settings as Settings,
    fields: d.fields as OrderField[],
    products: d.products as Product[],
    orders: d.orders as Order[],
    oldOrders: oldOrders as OldOrderRecord[],
    nextOrderNumber: nextOrderNumber ?? (d.settings as Settings).order?.startNumber ?? 1001,
    setupDone: d.setupDone === undefined ? true : Boolean(d.setupDone),
  };
  return { ok: true, file: { app: obj.app, backupVersion: obj.backupVersion, exportedAt: String(obj.exportedAt ?? ''), data } };
}

/**
 * Replace the current local data with the backup (called only after the user
 * confirms). Spreadsheet connection tokens and transient sync caches are not
 * restored — the Google account is re-connected once on this computer.
 * Pending offline ops are dropped so restored orders can never be written to
 * the sheet twice.
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const data = file.data;
  // keep the live spreadsheet connection (device/account specific) when one
  // is connected — everything else comes from the backup
  const curSettings = await storage.getState<Settings | undefined>(LS.settings);
  const settings = { ...data.settings };
  if (curSettings?.spreadsheet?.connection && curSettings.spreadsheet.provider === 'google') {
    settings.spreadsheet = {
      ...settings.spreadsheet,
      connection: curSettings.spreadsheet.connection,
      connected: Boolean(curSettings.spreadsheet.connected),
    };
  }
  await storage.setMany({
    [LS.settings]: settings,
    [LS.fields]: data.fields,
    [LS.products]: data.products,
    [LS.orders]: data.orders,
    [LS.oldOrders]: data.oldOrders,
    [LS.nextOrderNumber]: data.nextOrderNumber,
    [LS.setupDone]: data.setupDone,
  });
  // transient derived data must not survive a restore
  await storage.remove([LS.pendingOps, LS.sheetHeaders, LS.lastRow, LS.sheetCachedOrders]);
}
