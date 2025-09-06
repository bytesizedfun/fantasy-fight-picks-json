// === sw.js v24 ===
const VERSION = "v24";
const STATIC_CACHE = `ffp-static-${VERSION}`;
const STATIC_ASSETS = [
  "/", "/index.html",
  "/style.css?v=21",
  "/script.js?v=24",
  "/logo_fighter.png",
  "/favicon.ico?v=19",
  "/favicon-64.png?v=19",
  "/favicon-48.png?v=19",
  "/favicon-32.png?v=19",
  "/favicon-16.png?v=19",
  "/apple-touch-icon.png?v=19",
  "/site.webmanifest?v=19",
  "/safari-pinned-tab.svg?v=19",
  "/mstile-150x150.png?v=19",
  "/browserconfig.xml?v=19"
];

// Treat API endpoints as network-only (no caching)
function isApiRequest(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/api")) return true;
    if (u.pathname === "/fights" || u.pathname === "/leaderboard" || u.pathname === "/picks" || u.pathname === "/champion" || u.pathname === "/hall") return true;
    if (u.hostname.includes("script.google.com") && u.pathname.includes("/macros/s/")) return true;
  } catch (_) {}
  return false;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== STATIC_CACHE ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

// Network-only for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Don’t touch non-GET
  if (request.method !== "GET") {
    if (isApiRequest(request.url)) {
      event.respondWith(fetch(request));
    }
    return;
  }

  if (isApiRequest(request.url)) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: "offline" }), { status: 503 })));
    return;
  }

  // Static: cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return resp;
      });
    })
  );
});

// Manual cache clear hook (optional)
self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
