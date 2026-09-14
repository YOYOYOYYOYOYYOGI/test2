// ---------------------------------------------------------------------------
// Driver selection + offline sync orchestration
// ---------------------------------------------------------------------------
import type { Settings } from '../types';
import { DemoDriver } from './spreadsheet/demoDriver';
import { GoogleSheetsDriver } from './google/googleDriver';
import type { DriverLike } from './spreadsheet/types';

export function engineForSettings(settings: Settings): DriverLike | null {
  if (settings.demoMode) return new DemoDriver(settings);
  if (settings.spreadsheet?.connected && settings.spreadsheet.connection) {
    return new GoogleSheetsDriver(settings.spreadsheet.connection);
  }
  return null;
}

export function driverKind(settings: Settings): 'google' | 'demo' | null {
  if (settings.demoMode) return 'demo';
  if (settings.spreadsheet?.connected) return 'google';
  return null;
}
