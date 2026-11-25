import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://travel.test/carnet-etapes/';

function install({ cacheNames = [], fetch } = {}) {
  const handlers = {};
  const names = new Set(cacheNames);
  let claimed = false;
  let activated = false;
  vm.runInNewContext(worker, {
    self: {
      registration: { scope },
      addEventListener(name, handler) { handlers[name] = handler; },
      async skipWaiting() { activated = true; },
      clients: { async claim() { claimed = true; } }
    },
    caches: { async keys() { return [...names]; }, async delete(key) { return names.delete(key); } },
    fetch
  });
  return {
    names,
    async activate() {
      for (const stage of ['install', 'activate']) {
        let pending;
        handlers[stage]({ waitUntil(promise) { pending = promise; } });
        await pending;
      }
      assert.ok(claimed && activated);
    },
    request(url, method = 'GET') {
      let response;
      handlers.fetch({ request: {url, method}, respondWith(promise) { response = promise; } });
      return response;
    }
  };
}

test('La mise à jour supprime les caches de cette installation uniquement', async () => {
  const prefix = 'escale-public-' + encodeURIComponent(scope) + ':';
  const neighbor = 'escale-public-' + encodeURIComponent('https://travel.test/other/') + ':1';
  const app = install({ cacheNames: [prefix+'1', prefix+'2', neighbor, 'independent'] });
  await app.activate();
  assert.deepEqual([...app.names], [neighbor, 'independent']);
});

test('Les navigations utilisent le réseau et ne se replient sur aucun cache', async () => {
  const app = install({ fetch: async (request, options) => {
    assert.equal(options.cache, 'no-store');
    throw Error('Hors ligne');
  } });
  await assert.rejects(app.request(scope), /Hors ligne/);
  await assert.rejects(app.request(scope + 'ui.js'), /Hors ligne/);
  assert.equal(app.request('https://project.supabase.co/rest/v1/trips'), undefined);
  assert.equal(app.request('https://travel.test/other/'), undefined);
  assert.equal(app.request(scope + 'other', 'POST'), undefined);
});
