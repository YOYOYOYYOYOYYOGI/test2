/**
 * ReelForge — background service worker (Manifest V3).
 *
 * Responsibilities are intentionally small and real:
 *  - first-run: open the dashboard so the user can connect providers
 *  - badge hygiene
 *  - a minimal, authenticated message router (open the dashboard)
 *
 * All heavy work (AI calls, rendering, storage) happens in the dashboard page
 * so long-running jobs are never killed by service-worker idle timeouts.
 * Clicks on the toolbar icon are handled by the default popup (manifest.action).
 */

const DASHBOARD = chrome.runtime.getURL('src/dashboard/index.html');

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: `${DASHBOARD}#/home` });
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
  await chrome.action.setBadgeText({ text: '' });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'openDashboard') {
    chrome.tabs.create({ url: msg.path ? `${DASHBOARD}${msg.path}` : DASHBOARD });
    sendResponse({ ok: true });
  }
  return false; // no async response
});
