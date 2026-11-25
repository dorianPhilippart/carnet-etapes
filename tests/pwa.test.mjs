import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { compileWorker } from '../build.mjs';

const template = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const fixtures = [
  { path: 'index.html', content: '<html lang="fr">Carnet d’étapes</html>' },
  { path: 'ui.js', content: 'export {}' },
];

function worker(scope, files = fixtures) {
  const listeners = {};
  const stores = new Map();
  const installed = [];
  let online = true;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          const responses = requests.map(request => {
            const file = files.find(item => new URL(item.path, scope).href === request.url);
            assert.equal(request.integrity, 'sha256-' + createHash('sha256').update(file.content).digest('base64'));
            assert.equal(request.redirect, 'error');
            installed.push(request.url);
            return [request.url, file.content];
          });
          for (const [url, body] of responses) store.set(url, body);
        },
        async match(url) { return store.get(url); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    registration: { scope },
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  vm.runInNewContext(compileWorker(template, files), {
    self, caches, URL, Request,
    fetch() {
      if (!online) throw new Error('Hors ligne');
      return 'network response';
    },
  });
  return {
    stores, installed,
    offline() { online = false; },
    lifecycle(name) {
      let work;
      listeners[name]({ waitUntil(promise) { work = promise; } });
      return work;
    },
    request(path, options = {}) {
      let response;
      const request = {
        url: new URL(path, scope).href, headers: new Headers(), method: 'GET', mode: 'cors',
        ...options,
      };
      listeners.fetch({ request, respondWith(promise) { response = promise; } });
      return response;
    },
  };
}

for (const scope of ['https://travel.test/', 'https://travel.test/escale/']) {
  test('Démarrage hors ligne sous ' + scope, async () => {
    const app = worker(scope);
    await app.lifecycle('install');
    assert.deepEqual(app.installed, fixtures.map(file => new URL(file.path, scope).href));
    app.offline();
    assert.equal(await app.request('./', { mode: 'navigate' }), fixtures[0].content);
    assert.equal(await app.request('index.html?date=2026-12-10', { mode: 'navigate' }), fixtures[0].content);
    assert.equal(await app.request('ui.js'), fixtures[1].content);
  });
}

test("Les requêtes de compte, d’API et les écritures échappent au cache", async () => {
  const app = worker('https://travel.test/escale/');
  await app.lifecycle('install');
  for (const url of ['https://project.supabase.co/rest/v1/trips', 'rest/v1/trips', '../ui.js', 'ui.js?account=10']) {
    assert.equal(app.request(url), undefined);
    assert.equal(app.request(url, { mode: 'navigate' }), undefined);
  }
  assert.equal(app.request('ui.js', { headers: new Headers({ Authorization: 'Bearer test' }) }), undefined);
  assert.equal(app.request('ui.js', { method: 'POST' }), undefined);
});

test('Une mise à jour retire uniquement les anciennes versions de sa propre installation', async () => {
  const scope = 'https://travel.test/escale/';
  const old = worker(scope, [{ path: 'index.html', content: 'version précédente' }]);
  const current = worker(scope);
  const neighbor = worker('https://travel.test/other/');
  await Promise.all([old.lifecycle('install'), current.lifecycle('install'), neighbor.lifecycle('install')]);
  const [previousKey] = old.stores.keys();
  const [currentKey] = current.stores.keys();
  const [neighborKey] = neighbor.stores.keys();
  assert.notEqual(previousKey, currentKey);
  current.stores.set(previousKey, old.stores.get(previousKey));
  current.stores.set(neighborKey, neighbor.stores.get(neighborKey));
  current.stores.set('application-independante', new Map());
  await current.lifecycle('activate');
  assert.deepEqual([...current.stores.keys()].sort(), [currentKey, neighborKey, 'application-independante'].sort());
});
