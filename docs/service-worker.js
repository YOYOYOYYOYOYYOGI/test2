/* Order Label Manager PWA shell cache.
 * Google Sheets remains an online service; order writes are still preserved in
 * the application's local queue and synced when a connection is available. */
const CACHE = 'olm-pwa-shell-v1.0.10';
const APP_SHELL = ["./","./index.html","./app.webmanifest","./icons/icon192.png","./icons/icon512.png","./assets/ErrorBoundary-DtVpCmyA.js","./assets/JsBarcode-B3PtyuG6.js","./assets/Shell-BSrb8aDZ.js","./assets/Shell-Cu4RKyXf.css","./assets/app.js","./assets/browser-BXdiCFWD.js","./assets/inter-cyrillic-400-normal-HOLc17fK.woff","./assets/inter-cyrillic-400-normal-obahsSVq.woff2","./assets/inter-cyrillic-500-normal-BasfLYem.woff2","./assets/inter-cyrillic-500-normal-CxZf_p3X.woff","./assets/inter-cyrillic-600-normal-4D_pXhcN.woff","./assets/inter-cyrillic-600-normal-CWCymEST.woff2","./assets/inter-cyrillic-700-normal-CjBOestx.woff2","./assets/inter-cyrillic-700-normal-DrXBdSj3.woff","./assets/inter-cyrillic-800-normal-C7MGvYyJ.woff2","./assets/inter-cyrillic-800-normal-CCHyn08d.woff","./assets/inter-cyrillic-ext-400-normal-BQZuk6qB.woff2","./assets/inter-cyrillic-ext-400-normal-DQukG94-.woff","./assets/inter-cyrillic-ext-500-normal-B0yAr1jD.woff2","./assets/inter-cyrillic-ext-500-normal-BmqWE9Dz.woff","./assets/inter-cyrillic-ext-600-normal-Bcila6Z-.woff","./assets/inter-cyrillic-ext-600-normal-Dfes3d0z.woff2","./assets/inter-cyrillic-ext-700-normal-BjwYoWNd.woff2","./assets/inter-cyrillic-ext-700-normal-LO58E6JB.woff","./assets/inter-cyrillic-ext-800-normal-BZOjs1Xv.woff2","./assets/inter-cyrillic-ext-800-normal-Ca-gJeZY.woff","./assets/inter-greek-400-normal-B4URO6DV.woff2","./assets/inter-greek-400-normal-q2sYcFCs.woff","./assets/inter-greek-500-normal-BIZE56-Y.woff2","./assets/inter-greek-500-normal-Xzm54t5V.woff","./assets/inter-greek-600-normal-BZpKdvQh.woff","./assets/inter-greek-600-normal-plRanbMR.woff2","./assets/inter-greek-700-normal-BUv2fZ6O.woff","./assets/inter-greek-700-normal-C3JjAnD8.woff2","./assets/inter-greek-800-normal-BU00tryP.woff","./assets/inter-greek-800-normal-CLIouy3y.woff2","./assets/inter-greek-ext-400-normal-DGGRlc-M.woff2","./assets/inter-greek-ext-400-normal-KugGGMne.woff","./assets/inter-greek-ext-500-normal-2j5mBUwD.woff","./assets/inter-greek-ext-500-normal-C4iEst2y.woff2","./assets/inter-greek-ext-600-normal-B8X0CLgF.woff","./assets/inter-greek-ext-600-normal-DRtmH8MT.woff2","./assets/inter-greek-ext-700-normal-BoQ6DsYi.woff","./assets/inter-greek-ext-700-normal-qfdV9bQt.woff2","./assets/inter-greek-ext-800-normal-B--PVpEC.woff2","./assets/inter-greek-ext-800-normal-DUe57HfS.woff","./assets/inter-latin-400-normal-C38fXH4l.woff2","./assets/inter-latin-400-normal-CyCys3Eg.woff","./assets/inter-latin-500-normal-BL9OpVg8.woff","./assets/inter-latin-500-normal-Cerq10X2.woff2","./assets/inter-latin-600-normal-CiBQ2DWP.woff","./assets/inter-latin-600-normal-LgqL8muc.woff2","./assets/inter-latin-700-normal-BLAVimhd.woff","./assets/inter-latin-700-normal-Yt3aPRUw.woff2","./assets/inter-latin-800-normal-BYj_oED-.woff2","./assets/inter-latin-800-normal-D1mf63XC.woff","./assets/inter-latin-ext-400-normal-77YHD8bZ.woff","./assets/inter-latin-ext-400-normal-C1nco2VV.woff2","./assets/inter-latin-ext-500-normal-BxGbmqWO.woff","./assets/inter-latin-ext-500-normal-CV4jyFjo.woff2","./assets/inter-latin-ext-600-normal-CIVaiw4L.woff","./assets/inter-latin-ext-600-normal-D2bJ5OIk.woff2","./assets/inter-latin-ext-700-normal-Ca8adRJv.woff2","./assets/inter-latin-ext-700-normal-TidjK2hL.woff","./assets/inter-latin-ext-800-normal-BOMpwxm3.woff","./assets/inter-latin-ext-800-normal-DZJjya6U.woff2","./assets/inter-vietnamese-400-normal-Bbgyi5SW.woff","./assets/inter-vietnamese-400-normal-DMkecbls.woff2","./assets/inter-vietnamese-500-normal-DOriooB6.woff2","./assets/inter-vietnamese-500-normal-mJboJaSs.woff","./assets/inter-vietnamese-600-normal-BuLX-rYi.woff","./assets/inter-vietnamese-600-normal-Cc8MFFhd.woff2","./assets/inter-vietnamese-700-normal-BZaoP0fm.woff","./assets/inter-vietnamese-700-normal-DlLaEgI2.woff2","./assets/inter-vietnamese-800-normal-Cm7tD1pz.woff2","./assets/inter-vietnamese-800-normal-DDlpr_Ee.woff","./assets/orders-DXCXETbm.js","./assets/popup.js","./assets/print-CjoRvj0e.css","./assets/print.js","./assets/whatsappParser-CL-C0ApF.js"];

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
