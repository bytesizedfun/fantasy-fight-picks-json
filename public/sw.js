// sw.js — one-time cache nuke + self-unregister
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsArr) client.navigate(client.url);
    } catch (e) {}
  })());
});
self.addEventListener('fetch', (e) => {
  // passthrough
});
