/**
 * ReelForge — shared client state (cached settings, current project handle).
 */

import { loadSettings } from '../../shared/core/storage.js';

export const state = {
  settings: null,
  project: null, // currently open project (full record)
};

export async function refreshSettings() {
  state.settings = await loadSettings();
  return state.settings;
}

export function settingsOrThrow() {
  if (!state.settings) throw new Error('Settings not loaded yet');
  return state.settings;
}
