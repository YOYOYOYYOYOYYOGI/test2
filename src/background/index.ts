// MV3 service worker. The extension does its Google Sheets work directly in the
// UI pages (chrome.identity + fetch), so the worker stays minimal on purpose.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type === 'PING') sendResponse({ ok: true });
  return false;
});
