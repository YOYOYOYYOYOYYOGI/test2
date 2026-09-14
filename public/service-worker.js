/* Order Label Manager PWA shell cache.
 * Google Sheets remains an online service; order writes are still preserved in
 * the application's local queue and synced when a connection is available. */
const CACHE = 'olm-pwa-shell-v1';
const APP_SHELL = ['./', './index.html', './app.webmanifest', './icons/icon192.png', './icons/icon512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('olm-pwa-') && key !== CACHE)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell/navigation is network-first so a deployment is picked up
  // promptly, with the cached shell as the useful offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }

  // Vite's immutable asset filenames make cache-first safe. Runtime assets are
  // added after first use so offline reopen still has the rendered app shell.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && (url.pathname.includes('/assets/') || /\.(?:js|css|png|svg|woff2?)$/.test(url.pathname))) {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
