// Read only the previous version's keys. Rewrites only remove old records.
import { SUPABASE_URL } from './config.js';

const guestKey = 'escale:data:v1:guest';
const prefix = 'escale:data:v1:' + SUPABASE_URL + ':';
const ownerKey = id => prefix + id;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function records(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Ancien carnet illisible.');
  return data;
}

function removeMatching(key, predicate) {
  const data = records(key);
  const entries = Object.entries(data);
  const retained = entries.filter(([id, row]) => !predicate(row, id));
  if (!retained.length) localStorage.removeItem(key);
  else if (retained.length !== entries.length) localStorage.setItem(key, JSON.stringify(Object.fromEntries(retained)));
}

export function pruneSynced() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && uuid.test(key.slice(prefix.length))) {
        try { removeMatching(key, row => row?.dirty === false && Boolean(row.base)); } catch { /* Keep unreadable records. */ }
      }
    }
  } catch { /* New sessions also work without persistent storage. */ }
}

export function legacyGroups(owner) {
  const keys = owner && uuid.test(owner) ? [guestKey, ownerKey(owner)] : [guestKey];
  return keys.flatMap(key => {
    try {
      if (localStorage.getItem(key) === null) return [];
      const rows = Object.values(records(key));
      if (!rows.length) { localStorage.removeItem(key); return []; }
      return [{ key, guest: key === guestKey, trips: rows.filter(r => r?.trip).length, total: rows.length }];
    } catch {
      try { return localStorage.getItem(key) === null ? [] : [{key, guest:key === guestKey, trips:0, total:1}]; }
      catch { return []; }
    }
  });
}

function assertScope(key, owner, currentUser) {
  if (!owner || owner !== currentUser() || (key !== guestKey && key !== ownerKey(owner))) {
    throw Error('Reconnectez-vous au compte concerné.');
  }
}

// A stable ID makes recovery idempotent if a response or a tab is lost after INSERT.
async function recoveryId(owner, key, row) {
  const input = JSON.stringify([owner, key, row.id, row.revision, row.trip]);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0,16), b => b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function recoverGroup(key, owner, currentUser, saveTrip) {
  assertScope(key, owner, currentUser);
  for (const [id, row] of Object.entries(records(key))) {
    if (!row?.trip) continue; // Never replay stale deletion requests.
    const trip = {...row.trip, id: await recoveryId(owner,key,row)};
    assertScope(key, owner, currentUser);
    await saveTrip(trip);
    assertScope(key, owner, currentUser);
    removeMatching(key, (current, currentId) => currentId === id && JSON.stringify(current) === JSON.stringify(row));
  }
}

export function discardGroup(key, owner, currentUser) {
  assertScope(key, owner, currentUser);
  localStorage.removeItem(key);
}
