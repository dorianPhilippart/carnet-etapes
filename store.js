import { configured, session, listRows, writeRow, disconnect } from './cloud.js';
import { demoTrip } from './demo.js';

const listeners = new Set();
const snapshots = new WeakMap();
const userId = () => session()?.user.id;
let owner = userId();
let rows = new Map();
let epoch = 0;
let state = 'idle';
let lastSync = null;
let queue = Promise.resolve();

function notify() {
  for (const listener of listeners) listener();
  document.dispatchEvent(new Event('escale-sync'));
}
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getTrips() {
  if (!navigator.onLine) return [];
  if (!owner) return [structuredClone(demoTrip)];
  return [...rows.values()].map(row => {
    const trip = structuredClone(row.payload);
    snapshots.set(trip, { owner, revision: row.revision });
    return trip;
  });
}
export function syncInfo() {
  return { configured, user: session()?.user, online: navigator.onLine, state, lastSync, pending: 0 };
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

function run(operation) {
  const ticket = epoch;
  function check() {
    if (!userId()) throw new Error('Connectez-vous pour modifier votre carnet.');
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire.');
    if (epoch !== ticket) throw new Error('Le compte actif ou la connexion a changé.');
  }
  const result = queue.then(async () => {
    check();
    state = 'syncing';
    notify();
    try {
      const value = await operation(check);
      check();
      state = 'idle';
      lastSync = new Date();
      return value;
    } catch (error) {
      if (epoch === ticket) {
        rows.clear();
        lastSync = null;
        state = error.status === 401 || /refresh_token/.test(error.code || '') ? 'reauth' : 'error';
      }
      throw error;
    } finally { notify(); }
  });
  queue = result.catch(() => {});
  return result;
}

async function reload(check) {
  const list = await listRows(userId());
  check();
  if (list.some(row => row.id !== row.payload?.id || !validTrip(row.payload))) {
    throw new Error('Un voyage reçu présente un format invalide.');
  }
  rows = new Map(list.map(row => [row.id, row]));
}

export function synchronize() {
  if (!userId() || !navigator.onLine) return Promise.resolve();
  return run(reload).catch(() => {});
}

// jsonb may reorder object keys when returning a previously imported document.
function sameDocument(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(key => Object.hasOwn(b, key) && sameDocument(a[key], b[key]));
}

async function mutate(id, trip, original) {
  const snapshot = original && snapshots.get(original);
  if (original && (!snapshot || snapshot.owner !== userId() || original.id !== id)) {
    throw new Error('Le compte actif a changé. Rouvrez le voyage.');
  }
  const epochAtStart = epoch;
  try {
    return await run(async check => {
      const change = { id, trip, base: snapshot?.revision ?? null, revision: crypto.randomUUID() };
      let accepted;
      try { accepted = await writeRow(userId(), change); }
      catch (error) {
        // If the response was lost, check the revision before declaring failure.
        await reload(check);
        const stored = rows.get(id);
        if (trip ? stored?.revision !== change.revision : stored !== undefined) throw error;
        return id;
      }
      check();
      if (!accepted && !original && trip) {
        await reload(check);
        if (sameDocument(rows.get(id)?.payload, trip)) return id;
      }
      if (!accepted) throw new Error('Ce voyage a changé. Rouvrez sa dernière version avant de le modifier.');
      if (trip) rows.set(id, { id, payload: structuredClone(trip), revision: change.revision });
      else rows.delete(id);
      return id;
    });
  } catch (error) {
    if (epoch === epochAtStart && userId() && navigator.onLine) await synchronize();
    throw error;
  }
}
export async function saveTrip(trip, original) {
  if (!validTrip(trip)) throw new Error('Le format de ce voyage est invalide.');
  if (new Blob([JSON.stringify(trip)]).size > 900000) throw new Error('Ce voyage dépasse la taille maximale.');
  return mutate(trip.id, trip, original);
}
export async function deleteTrip(id, original) {
  if (!original) throw new Error('Rouvrez le voyage avant de le supprimer.');
  return mutate(id, null, original);
}
export async function signOut() {
  if (userId()) await disconnect(userId());
}
function reset() {
  epoch++;
  rows.clear();
  state = 'idle';
  lastSync = null;
  owner = userId();
  notify();
}
window.addEventListener('escale-session', () => {
  if (owner !== userId()) { reset(); void synchronize(); }
});
window.addEventListener('offline', reset);
window.addEventListener('online', () => { reset(); void synchronize(); });
window.addEventListener('focus', () => void synchronize());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void synchronize(); });
setInterval(() => { if (!document.hidden) void synchronize(); }, 45000);
