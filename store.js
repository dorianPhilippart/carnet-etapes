import { configured, session, withLock, listRows, writeRow, disconnect } from './cloud.js';
import { SUPABASE_URL } from './config.js';
import { demoTrip } from './demo.js';

const GUEST = 'guest';
const prefix = 'escale:data:v1:' + (SUPABASE_URL || 'local') + ':';
const storageKey = scope => scope === GUEST ? 'escale:data:v1:guest' : prefix + scope;
const listeners = new Set();
const owners = new WeakMap();
const activeOwner = () => session()?.user.id || GUEST;
let owner = activeOwner();
let status = { state: 'idle', lastSync: null, conflict: false };
let currentSync;
let again = false;

function notify() {
  for (const listener of listeners) listener();
  document.dispatchEvent(new Event('escale-sync'));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(scope) {
  let raw = null;
  try { raw = localStorage.getItem(storageKey(scope)); }
  catch { /* Reading the example remains possible with browser storage disabled. */ }
  if (raw !== null) return JSON.parse(raw);
  if (scope !== GUEST) return {};
  return { [demoTrip.id]: { id: demoTrip.id, trip: demoTrip, base: null, revision: null, dirty: false } };
}

export function getTrips() {
  const scope = activeOwner();
  return Object.values(read(scope)).filter(record => record.trip).map(({ trip }) => {
    const snapshot = structuredClone(trip);
    owners.set(snapshot, scope);
    return snapshot;
  });
}

function pending(scope) {
  return Object.values(read(scope)).filter(record => record.dirty).length;
}

export function syncInfo() {
  const scope = activeOwner();
  return { ...status, configured, user: session()?.user, online: navigator.onLine,
    pending: scope === GUEST ? 0 : pending(scope) };
}

function change(scope, edit) {
  return withLock(storageKey(scope), () => {
    if (activeOwner() !== scope) throw new Error('Le compte actif a changé. Rouvrez le voyage.');
    const records = read(scope);
    const previous = JSON.stringify(records);
    const result = edit(records);
    const raw = JSON.stringify(records);
    if (raw !== previous) {
      try { localStorage.setItem(storageKey(scope), raw); }
      catch { throw new Error('Le stockage de cet appareil est plein ou indisponible.'); }
      notify();
    }
    return result;
  });
}

function recordFor(trip, scope, base = null) {
  return { id: trip.id, trip, base, revision: crypto.randomUUID(), dirty: scope !== GUEST };
}

// PostgreSQL jsonb can change object-key order without changing a trip.
function sameDocument(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameDocument(a[key], b[key]));
}

function copyOf(trip) {
  return { ...trip, id: crypto.randomUUID(), title: trip.title.slice(0, 130) + ' (copie locale)' };
}

function verifyOwner(original, scope) {
  if (original && owners.has(original) && owners.get(original) !== scope) {
    throw new Error('Le compte actif a changé. Rouvrez le voyage.');
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value + 'T');
}

function validTrip(trip) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return trip && uuid.test(trip.id) && typeof trip.title === 'string' && trip.title.trim() &&
    typeof trip.destination === 'string' && validDate(trip.startDate) && validDate(trip.endDate) &&
    trip.startDate <= trip.endDate && Array.isArray(trip.stops) && trip.stops.every(stop =>
      stop && typeof stop.id === 'string' && typeof stop.title === 'string' && validDate(stop.date) &&
      stop.date >= trip.startDate && stop.date <= trip.endDate && (!stop.time || typeof stop.time === 'string'));
}

export async function saveTrip(trip, original) {
  const scope = activeOwner();
  verifyOwner(original, scope);
  if (!validTrip(trip)) {
    throw new Error('Le format de ce voyage est invalide.');
  }
  if (new Blob([JSON.stringify(trip)]).size > 900_000) throw new Error('Ce voyage dépasse la taille maximale.');
  const id = await change(scope, records => {
    let updated = structuredClone(trip);
    if (original && !sameDocument(original, records[trip.id]?.trip)) {
      updated = copyOf(updated);
      status.conflict = true;
    }
    records[updated.id] = recordFor(updated, scope, records[updated.id]?.base);
    return updated.id;
  });
  void synchronize();
  return id;
}

export async function deleteTrip(id, original) {
  const scope = activeOwner();
  verifyOwner(original, scope);
  await change(scope, records => {
    const record = records[id];
    if (!record) return;
    if (original && !sameDocument(original, record.trip)) {
      throw new Error('Ce voyage a changé. Vérifiez sa version actuelle avant de le supprimer.');
    }
    if (scope === GUEST) delete records[id];
    else records[id] = { ...record, trip: null, dirty: true, revision: crypto.randomUUID() };
  });
  void synchronize();
}

export function guestTrips() {
  return Object.values(read(GUEST)).filter(row => row.trip).map(row => row.trip);
}

export async function importGuest() {
  const scope = activeOwner();
  if (scope === GUEST) return;
  await change(scope, records => {
    for (const trip of guestTrips()) {
      const existing = records[trip.id];
      if (sameDocument(existing?.trip, trip)) continue;
      const candidate = existing ? copyOf(trip) : trip;
      records[candidate.id] = recordFor(candidate, scope);
    }
  });
  void synchronize();
}

function clean(row) {
  return { id: row.id, trip: row.payload, base: row.revision, revision: row.revision, dirty: false };
}

// Reconcile against a complete server snapshot. A divergent local edit gets a new
// identity so that another device's version and an offline traveller's work both survive.
function reconcile(records, rows, scope) {
  const remote = new Map(rows.map(row => [row.id, row]));
  for (const id of new Set([...Object.keys(records), ...remote.keys()])) {
    const local = records[id];
    const row = remote.get(id);
    if (local?.dirty) {
      if (local.trip && local.revision === row?.revision) {
        records[id] = clean(row);
        continue;
      }
      if (!local.trip && !row) {
        delete records[id];
        continue;
      }
      if (local.base === (row?.revision ?? null)) continue;
      if (local.trip) {
        const duplicate = copyOf(local.trip);
        records[duplicate.id] = recordFor(duplicate, scope);
      }
      status.conflict = true;
    }
    if (row) records[id] = clean(row);
    else delete records[id];
  }
  return Object.values(records).filter(record => record.dirty);
}

async function syncOnce(scope) {
  if (scope !== activeOwner() || !navigator.onLine) return;
  status.state = 'syncing';
  document.dispatchEvent(new Event('escale-sync'));
  try {
    const rows = await listRows(scope);
    if (rows.some(row => row.id !== row.payload?.id || !validTrip(row.payload))) {
      throw new Error('Un voyage reçu présente un format invalide.');
    }
    const changes = await change(scope, records => reconcile(records, rows, scope));
    for (const entry of changes) {
      if (activeOwner() !== scope) return;
      if (!await writeRow(scope, entry)) {
        again = true;
        continue;
      }
      await change(scope, records => {
        const current = records[entry.id];
        if (!current) return;
        if (current.revision !== entry.revision) {
          // An edit was made while this HTTP request was in flight.
          current.base = entry.trip ? entry.revision : null;
          again = true;
        } else if (entry.trip) {
          current.base = entry.revision;
          current.dirty = false;
        } else delete records[entry.id];
      });
    }
    if (activeOwner() === scope) {
      status.state = 'idle';
      status.lastSync = new Date();
    }
  } catch (error) {
    if (activeOwner() === scope) {
      status.state = error.status === 401 || /refresh_token/.test(error.code || '') ? 'reauth' : 'error';
    }
    again = false;
  } finally {
    document.dispatchEvent(new Event('escale-sync'));
  }
}

export function synchronize() {
  const scope = activeOwner();
  if (scope === GUEST || !configured || !navigator.onLine) return Promise.resolve();
  if (currentSync) {
    again = true;
    return currentSync;
  }
  currentSync = Promise.resolve(withLock('sync:' + prefix + scope, () => syncOnce(scope)))
    .finally(() => {
      currentSync = undefined;
      if (again) { again = false; queueMicrotask(() => void synchronize()); }
    });
  return currentSync;
}

export async function signOut() {
  const scope = activeOwner();
  if (scope === GUEST) return;
  // Hide and clear this account's cached itineraries on this device.
  await disconnect(scope);
  await withLock(storageKey(scope), () => {
    if (activeOwner() !== scope) localStorage.removeItem(storageKey(scope));
  });
  notify();
}

window.addEventListener('escale-session', () => {
  const next = activeOwner();
  if (owner === next) return;
  owner = next;
  status = { state: 'idle', lastSync: null, conflict: false };
  notify();
  void synchronize();
});
window.addEventListener('storage', event => {
  if (!event.key || event.key === storageKey(activeOwner())) notify();
});
window.addEventListener('online', () => { notify(); void synchronize(); });
window.addEventListener('offline', notify);
window.addEventListener('focus', () => void synchronize());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void synchronize();
});
setInterval(() => { if (!document.hidden) void synchronize(); }, 45_000);
queueMicrotask(() => void synchronize());
