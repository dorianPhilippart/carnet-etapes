// Keep the original worker URL so previous installations also receive this migration.
const scope = self.registration.scope;
const legacyPrefix = 'escale-public-' + encodeURIComponent(scope) + ':';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(legacyPrefix)).map(key => caches.delete(key)));
    // Existing pages get fresh resources on their next navigation. Do not interrupt open forms.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method === 'GET' && request.url.startsWith(scope)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
