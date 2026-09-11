/*
 * ReelForge service worker (Manifest V3, ES module).
 *
 * All outbound network requests from extension pages are funnelled here so
 * there is ONE auditable chokepoint. The actual validation/fetch logic lives
 * in scripts/net-relay.js so it can be exercised by the automated tests; the
 * worker only wires that same logic to chrome.runtime messaging.
 *
 * The worker loads NO remote code, writes no cookies, reads no tabs or browsing
 * history, and performs no tracking.
 */

import { relayFetch } from '../scripts/net-relay.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || message.type !== 'rf:fetch') return false;
  relayFetch(message.request)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({
      ok: false,
      // Errors crossing the messaging boundary must be structured-cloneable.
      error: { name: err.name || 'Error', message: err.message || 'Request failed' },
    }));
  return true; // async response
});

chrome.runtime.onInstalled.addListener(() => {
  // No remote calls; defaults are created lazily by the storage layer on first open.
});
