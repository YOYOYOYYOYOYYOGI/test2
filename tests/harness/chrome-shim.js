/*
 * TEST-ONLY minimal chrome.* implementation (this file is never shipped in the
 * extension package). It lets the REAL extension pages/modules run inside a
 * normal Chromium tab during automated testing:
 *
 *   - chrome.storage.local      -> localStorage-backed (shared across tabs)
 *   - chrome.storage.onChanged  -> change events (same tab + cross-tab)
 *   - chrome.permissions        -> always granted (host grants are test-manifest only)
 *   - chrome.runtime.sendMessage('rf:fetch') -> the REAL net-relay.js module
 *     (identical to what the MV3 service worker runs), so every request still
 *     passes the genuine URL/method/body validation and uses real fetch().
 */
(function shimChrome() {
  const AREA_KEY = '__reelforge_storage_area__';

  function readArea() {
    try { return JSON.parse(localStorage.getItem(AREA_KEY) || '{}'); } catch { return {}; }
  }
  function writeArea(area) {
    localStorage.setItem(AREA_KEY, JSON.stringify(area));
  }

  const changeListeners = [];

  function notify(changes, areaName) {
    for (const fn of changeListeners) {
      try { fn(changes, areaName); } catch (err) { console.error('storage listener error', err); }
    }
  }

  const storage = {
    local: {
      get(keys) {
        const area = readArea();
        let result = {};
        if (keys === undefined || keys === null) result = { ...area };
        else if (typeof keys === 'string') result = keys in area ? { [keys]: area[keys] } : {};
        else if (Array.isArray(keys)) {
          for (const k of keys) if (k in area) result[k] = area[k];
        } else if (typeof keys === 'object') {
          for (const [k, fallback] of Object.entries(keys)) result[k] = k in area ? area[k] : fallback;
        }
        return Promise.resolve(result);
      },
      set(obj) {
        const area = readArea();
        const changes = {};
        for (const [k, v] of Object.entries(obj || {})) {
          changes[k] = { newValue: structuredClone(v), oldValue: k in area ? structuredClone(area[k]) : undefined };
          area[k] = v;
        }
        writeArea(area);
        notify(changes, 'local');
        return Promise.resolve();
      },
      remove(keys) {
        const area = readArea();
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const k of list) {
          if (k in area) changes[k] = { oldValue: structuredClone(area[k]) };
          delete area[k];
        }
        writeArea(area);
        notify(changes, 'local');
        return Promise.resolve();
      },
      clear() {
        const old = readArea();
        localStorage.removeItem(AREA_KEY);
        const changes = {};
        for (const k of Object.keys(old)) changes[k] = { oldValue: old[k] };
        notify(changes, 'local');
        return Promise.resolve();
      },
    },
    onChanged: { addListener(fn) { changeListeners.push(fn); } },
  };

  // Cross-tab change events.
  window.addEventListener('storage', (event) => {
    if (event.key !== AREA_KEY || event.newValue === null) return;
    const oldArea = safeJson(event.oldValue) || {};
    const newArea = safeJson(event.newValue) || {};
    const changes = {};
    for (const k of new Set([...Object.keys(oldArea), ...Object.keys(newArea)])) {
      if (JSON.stringify(oldArea[k]) !== JSON.stringify(newArea[k])) {
        changes[k] = { newValue: newArea[k], oldValue: oldArea[k] };
      }
    }
    notify(changes, 'local');
  });
  function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

  let relayPromise;
  function relay() {
    if (!relayPromise) relayPromise = import('/ext/scripts/net-relay.js');
    return relayPromise;
  }

  const runtime = {
    id: 'reelforgetestextensionid',
    lastError: null,
    getURL(path) { return `/ext/${String(path).replace(/^\//, '')}`; },
    openOptionsPage() {
      window.open('/ext/settings/settings.html', '_blank', 'noopener');
      return Promise.resolve();
    },
    sendMessage(message, callback) {
      if (message && message.type === 'rf:fetch') {
        relay()
          .then(({ relayFetch }) => relayFetch(message.request))
          .then((data) => callback && callback({ ok: true, data }))
          .catch((err) => callback && callback({ ok: false, error: { name: err.name || 'Error', message: err.message || 'Request failed' } }));
        return;
      }
      if (callback) callback(null);
    },
  };

  const permissions = {
    contains(desc) {
      const origins = desc?.origins || [];
      return Promise.resolve(origins.map(() => true));
    },
    request() { return Promise.resolve(true); },
    remove() { return Promise.resolve(true); },
  };

  globalThis.chrome = {
    runtime,
    storage,
    permissions,
  };
  window.__reelforgeShim = true;
})();
