// build.mjs embeds the revision and integrity digest of each public asset here.
const release = {"revision":"ecf6dda57fd50d84281131307c5fbb31490c5fcbf2ba223e966fd883f012d75f","assets":[{"path":"index.html","integrity":"sha256-RaMoPq9BVZ1pi+wzqv1mow8uRE+4e2HDvKLVU3JBPfU="},{"path":"styles.css","integrity":"sha256-xEMLPPMi9dbNN3sLgPglx8fQRAUOPtbFznQd3kzaYx4="},{"path":"account.css","integrity":"sha256-KdU/qLPuRFnoiMfUSfkOdt60MlRSk333+PsUU2U74pw="},{"path":"ui.js","integrity":"sha256-yaAAZahiZUFjspQxNkFW7TR79UsitdVFby8gB+6hvfk="},{"path":"icons.js","integrity":"sha256-hDOh4uyIGaJgwcRBvLRIeGw0IMxecsRis8t3Pe6DAvk="},{"path":"store.js","integrity":"sha256-dxkaYAyjG6J28C76CVZVN1jQDT7AkCbTuby1O/XOqFE="},{"path":"cloud.js","integrity":"sha256-JS140NxuHL35IkbkOfGzKQyvBp5QVeu4FKqTYK/qMe0="},{"path":"account.js","integrity":"sha256-fpSl+M2yWQ3CnC8+hyonw4839PSsFuewkAw30lsp/m0="},{"path":"demo.js","integrity":"sha256-BkZK58EzBhzJv2ZtrutTnWOgGY1+u5pRE59Aqfs5OHI="},{"path":"config.js","integrity":"sha256-ZKs8xir99atoekb2zdppoY9fMr1MDmqqjcobgkkiXgM="},{"path":"register.js","integrity":"sha256-BSDUNkLfYZH+xEChiNH/e+HEWzOL5mxmQs9fIty+Gec="},{"path":"manifest.webmanifest","integrity":"sha256-hCzpr+DJpGqQPOJ33CUdf+5tNW6jld9N2IsK+cnJD24="},{"path":"assets/japon.webp","integrity":"sha256-DQwEC6QXOeon6/5yq+3z8EcVGhRvbQioGJN+1Rr9bXI="},{"path":"assets/icon-192.png","integrity":"sha256-ckAJmx8/rgwp55E9kcKg7fJj3qqAqmuhoN6o8U5ht6Y="},{"path":"assets/icon-512.png","integrity":"sha256-mPwb86VmL34KNKvAYl9RjOxvLfr8/PMfoAW1ZhyugDc="},{"path":"assets/icon-maskable.png","integrity":"sha256-TfI9n4ypJrurLl3kVdY+MpdMJ9itPHckGgWTmSe6LJs="}]};

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
