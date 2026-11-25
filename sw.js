// build.mjs embeds the revision and integrity digest of each public asset here.
const release = /* PRECACHE */ null;

if (release) {
  const scope = self.registration.scope;
  const cachePrefix = 'escale-public-' + encodeURIComponent(scope) + ':';
  const cacheName = cachePrefix + release.revision;
  const entry = new URL('index.html', scope).href;
  const assets = new Map(release.assets.map(({ path, integrity }) => [
    new URL(path, scope).href, integrity,
  ]));

  self.addEventListener('install', event => {
    // If any fetch fails or belongs to a different release, addAll fails atomically.
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      const requests = Array.from(assets, ([url, integrity]) =>
        new Request(url, { cache: 'reload', redirect: 'error', integrity }));
      await cache.addAll(requests);
    })());
  });

  self.addEventListener('activate', event => {
    // The normal waiting phase lets open tabs finish with their existing release.
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names
        .filter(name => name.startsWith(cachePrefix) && name !== cacheName)
        .map(name => caches.delete(name)));
    })());
  });

  self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || request.headers.has('authorization')) return;
    const url = new URL(request.url);
    // The document accepts query parameters. Store only its static, parameter-free shell.
    let key = url.href;
    if (request.mode === 'navigate') {
      url.search = '';
      if (url.href !== scope && url.href !== entry) return;
      key = entry;
    }
    if (!assets.has(key)) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(key)) || fetch(request);
    })());
  });
}
