/**
 * ReelForge — background service worker (Manifest V3).
 *
 * Responsibilities are intentionally small and real:
 *  - first-run: open the dashboard so the user can connect providers
 *  - action click: open the studio
 *  - installation badge / uninstall hygiene
 *
 * All heavy work (AI calls, rendering, storage) happens in the dashboard page
 * so long-running jobs are never killed by service-worker idle timeouts.
 */

const DASHBOARD = chrome.runtime.getURL('src/dashboard/index.html');

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: `${DASHBOARD}#/home` });
  }
  void chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
  void chrome.action.setBadgeText({ text: '' });
});

chrome.action.onClicked?.addListener?.(() => {
  chrome.tabs.create({ url: DASHBOARD });
});

// Message router — kept minimal and real.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'openDashboard') {
    chrome.tabs.create({ url: msg.path ? `${DASHBOARD}${msg.path}` : DASHBOARD });
    sendResponse({ ok: true });
  }
  return false; // no async response
});
