// Fantasy Fight Picks — Service Worker (PWA)
const CACHE_NAME = 'ffp-cache-v1';
const ASSETS = [
  '/',                 // if your server serves index.html at /
  '/index.html',
  '/style.css',
  '/script.js',
  // Icons (root filenames)
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  '/favicon-64.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/android-chrome-maskable-192x192.png',
  '/android-chrome-maskable-512x512.png',
  '/safari-pinned-tab.svg',
  '/mstile-150x150.png',
  '/mstile-310x310.png',
  '/mstile-310x150.png',
  '/site.webmanifest',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // HTML navigations: network first, fallback to cache, else offline page
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone());
        return net;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('/offline.html');
      }
    })());
    return;
  }

  // Cache-first for our ASSETS
  const url = new URL(req.url);
  if (ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const net = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone());
      return net;
    })());
    return;
  }

  // Default: network with cache fallback
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.destination === 'image') {
        return new Response(new Blob(), { headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
