// OBI-ISM service worker: cache only safe public static assets.
// Never cache /api/*, licensed reader content, authenticated pages, or book data.
const CACHE = 'obi-ism-static-v1';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-48.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API, reader content endpoints, auth/account flows, or HTML pages.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/reader' || url.pathname === '/login' || url.pathname === '/forgot-password' || url.pathname === '/security' || url.pathname === '/verify-email' || url.pathname === '/redeem' || url.pathname === '/bulk-redeem' || url.pathname === '/bulk' || url.pathname === '/bulk-confirmation' || url.pathname === '/gift-confirmation' || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;
  if (request.mode === 'navigate') return;
  const isStatic = url.pathname.startsWith('/assets/') || STATIC_ASSETS.includes(url.pathname);
  if (!isStatic) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
