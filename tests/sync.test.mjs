import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Each fixture runs the production client in an isolated module graph. The REST
// double implements only the Auth and PostgREST operations that the client uses.
async function device(t) {
  const root = await mkdtemp(join(tmpdir(), 'escale-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['cloud.js', 'store.js', 'demo.js']) {
    await copyFile(new URL('../' + name, import.meta.url), join(root, name));
  }
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'config.js'), `export const SUPABASE_URL = 'https://project.test';
    export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';`);

  globalThis.window = new EventTarget();
  globalThis.location = new URL('https://travel.test/escale/');
  globalThis.document = new EventTarget();
  const data = new Map([['escale:session:https://project.test', 'old-token']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  const rows = new Map();
  const users = new Map();
  const urlFor = name => pathToFileURL(join(root, name)).href;
  let beforeWrite;
  let loseAcknowledgement = false;
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

  globalThis.fetch = async (address, options) => {
    await nextTurn();
    assert.equal(new URL(address).origin, 'https://project.test');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    if (!navigator.onLine) throw new TypeError('Hors ligne');
    const { pathname, searchParams } = new URL(address);
    const body = options.body && JSON.parse(options.body);
    if (pathname === '/auth/v1/token') {
      const { email } = body;
      if (!users.has(email)) users.set(email, crypto.randomUUID());
      const id = users.get(email);
      return response({ user: { id, email }, expires_in: 3600, access_token: id, refresh_token: 'refresh-' + id });
    }
    if (pathname === '/auth/v1/logout') return response({});
    assert.equal(pathname, '/rest/v1/trips');
    const owner = options.headers.Authorization.slice('Bearer '.length);
    assert.ok([...users.values()].includes(owner));
    const id = searchParams.get('id')?.slice(3);
    const key = owner + '/' + (body?.id ?? id);
    if (options.method === 'POST') {
      assert.equal(body.user_id, owner);
      if (rows.has(key)) return response({ code: '23505' }, 409);
      rows.set(key, body);
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new TypeError("La connexion a été interrompue après l’enregistrement.");
      }
      return response([body], 201);
    }
    assert.equal(searchParams.get('user_id'), 'eq.' + owner);
    if (options.method === 'GET') {
      // One row per page also exercises the server's configured pagination limit.
      const page = [...rows.values()].filter(row => row.user_id === owner && (!id || row.id > id))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 1);
      return response(page);
    }
    const row = rows.get(key);
    if (beforeWrite) {
      const callback = beforeWrite;
      beforeWrite = undefined;
      callback(row);
    }
    if (!row || searchParams.get('revision') !== 'eq.' + row.revision) return response([]);
    if (options.method === 'DELETE') rows.delete(key);
    else {
      assert.equal(options.method, 'PATCH');
      Object.assign(row, body);
    }
    return response([row]);
  };

  const interval = globalThis.setInterval;
  globalThis.setInterval = (...args) => interval(...args).unref();
  let store;
  try { store = await import(urlFor('store.js')); }
  finally { globalThis.setInterval = interval; }
  const cloud = await import(urlFor('cloud.js'));
  async function settled() {
    await store.synchronize();
    // A compare-and-swap miss schedules a second reconciliation.
    for (let i = 0; i < 1000; i++) {
      await nextTurn();
      const { state, pending } = store.syncInfo();
      if (state === 'idle' && pending === 0) return;
      assert.notEqual(state, 'error', 'La synchronisation a échoué');
    }
    assert.fail('La synchronisation reste en attente');
  }

  return {
    store, rows, users, settled, data,
    async login(email) { await cloud.authenticate(email, 'motdepasse-fictif', false); await settled(); },
    network(onLine) { navigator.onLine = onLine; window.dispatchEvent(new Event(onLine ? 'online' : 'offline')); },
    beforeWrite(callback) { beforeWrite = callback; },
    loseNextAcknowledgement() { loseAcknowledgement = true; },
  };
}

test('La session et le voyage restent en mémoire, les mutations exigent un compte en ligne', async t => {
  const d = await device(t);
  const [trip] = d.store.getTrips();
  assert.equal(d.data.size, 0);
  await assert.rejects(d.store.saveTrip(trip), /Connectez/);
  await d.login('alice@example.test');
  await d.store.saveTrip(trip);
  const [original] = d.store.getTrips();
  d.network(false);
  assert.deepEqual(d.store.getTrips(), []);
  await assert.rejects(d.store.deleteTrip(trip.id, original), /Internet/);
  d.network(true);
  await d.settled();
  assert.deepEqual(d.store.getTrips(), [trip]);
  await d.store.deleteTrip(trip.id, d.store.getTrips()[0]);
  assert.equal(d.rows.size, 0);
  assert.equal(d.data.size, 0);
});

test('Une modification concurrente conserve la version déjà enregistrée', async t => {
  const d = await device(t);
  const [trip] = d.store.getTrips();
  await d.login('alice@example.test');
  await d.store.saveTrip(trip);
  const [original] = d.store.getTrips();
  d.beforeWrite(row => {
    row.revision = crypto.randomUUID();
    row.payload = { ...row.payload, title: 'Nouvelle version' };
  });
  await assert.rejects(d.store.saveTrip({ ...trip, title: 'Autre' }, original), /a changé/);
  assert.equal(d.store.getTrips()[0].title, 'Nouvelle version');
});

test('Le carnet du compte précédent reste inaccessible', async t => {
  const d = await device(t);
  const [trip] = d.store.getTrips();
  await d.login('alice@example.test');
  await d.store.saveTrip(trip);
  const [original] = d.store.getTrips();
  await d.store.signOut();
  await d.login('bob@example.test');
  assert.deepEqual(d.store.getTrips(), []);
  await assert.rejects(d.store.saveTrip(original, original), /compte actif/);
});

test('La révision confirme une écriture malgré la perte de sa réponse', async t => {
  const d = await device(t);
  const [trip] = d.store.getTrips();
  await d.login('alice@example.test');
  d.loseNextAcknowledgement();
  await d.store.saveTrip(trip);
  assert.deepEqual(d.store.getTrips(), [trip]);
  assert.equal(d.rows.size, 1);
});

test('Un ancien voyage importé deux fois garde une seule copie sans écraser une modification', async t => {
  const d = await device(t);
  const [trip] = d.store.getTrips();
  await d.login('alice@example.test');
  assert.equal(await d.store.saveTrip(trip), trip.id);
  assert.equal(await d.store.saveTrip({ ...trip }), trip.id);
  await assert.rejects(d.store.saveTrip({ ...trip, title: 'Autre' }), /a changé/);
  assert.equal(d.rows.size, 1);
  assert.deepEqual(d.store.getTrips(), [trip]);
});
