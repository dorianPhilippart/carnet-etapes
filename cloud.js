import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const origin = SUPABASE_URL.replace(/\/+$/, '');
const publicKey = SUPABASE_PUBLISHABLE_KEY.trim();
function isPublicKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const claims = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role === 'anon';
  } catch { return false; }
}

export const configured = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) && isPublicKey(publicKey);
const sessionKey = 'escale:session:' + origin;

export class ApiError extends Error {
  constructor(status, code) {
    super('Le service de synchronisation a refusé la requête.');
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  if (!configured) throw new Error('La synchronisation Supabase est désactivée.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: publicKey, ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', signal: controller.signal
    });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : null;
    if (!response.ok) throw new ApiError(response.status, data?.error_code || data?.code || '');
    return data;
  } finally { clearTimeout(timer); }
}

// Older releases persisted this credential. Never resume or retain it on disk.
try { localStorage.removeItem(sessionKey); } catch { /* Browser storage may be disabled. */ }
let currentSession = null;
export function session() { return currentSession; }

function saveSession(value) {
  const record = {
    user: { id: value.user.id, email: value.user.email },
    access_token: value.access_token, refresh_token: value.refresh_token,
    expires_at: value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in
  };
  currentSession = record;
  window.dispatchEvent(new Event('escale-session'));
  return record;
}

export function withLock(name, work) {
  return navigator.locks ? navigator.locks.request('escale:' + name, work) : work();
}

export async function authenticate(email, password, register) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  const path = register ? '/auth/v1/signup?redirect_to=' + redirect : '/auth/v1/token?grant_type=password';
  const result = await request(path, { method: 'POST', body: { email, password } });
  if (!result?.access_token) return false;
  await withLock(sessionKey, () => saveSession(result));
  return true;
}

export async function accessToken(userId, previousToken) {
  return withLock(sessionKey, async () => {
    const current = session();
    if (!current || current.user.id !== userId) throw new Error('Le compte actif a changé.');
    if (current.expires_at > Date.now() / 1000 + 60 && current.access_token !== previousToken) {
      return current.access_token;
    }
    const result = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: current.refresh_token }
    });
    if (session()?.refresh_token !== current.refresh_token || result.user?.id !== userId) {
      throw new Error('Le compte actif a changé.');
    }
    return saveSession(result).access_token;
  });
}

export async function disconnect(expectedUserId) {
  await withLock(sessionKey, async () => {
    const current = session();
    if (current?.user.id !== expectedUserId) return;
    currentSession = null;
    window.dispatchEvent(new Event('escale-session'));
    // Local sign-out also works offline; request revocation for this device when reachable.
    try { await request('/auth/v1/logout?scope=local', { method: 'POST', token: current.access_token }); }
    catch { /* Local credentials have already been removed. */ }
  });
}

async function rest(userId, query, options = {}) {
  const path = '/rest/v1/trips?' + new URLSearchParams(query);
  const token = await accessToken(userId);
  try { return await request(path, { ...options, token }); }
  catch (error) {
    if (error.status !== 401) throw error;
    return request(path, { ...options, token: await accessToken(userId, token) });
  }
}

export async function listRows(userId) {
  // Keyset pagination is independent of the API's configured row limit.
  const rows = [];
  let cursor;
  for (;;) {
    const page = await rest(userId, { select: 'id,payload,revision', user_id: 'eq.' + userId,
      order: 'id.asc', limit: '200', ...(cursor ? { id: 'gt.' + cursor } : {}) });
    if (!page.length) return rows;
    rows.push(...page);
    cursor = page[page.length - 1].id;
  }
}

export async function writeRow(userId, change) {
  const { trip, id, revision, base } = change;
  const filters = { user_id: 'eq.' + userId, id: 'eq.' + id, revision: 'eq.' + base };
  const headers = { Prefer: 'return=representation' };
  if (!base) {
    if (!trip) return true;
    try {
      await rest(userId, {}, { method: 'POST', headers, body: { user_id: userId, id, payload: trip, revision } });
      return true;
    } catch (error) {
      if (error.status === 409 && error.code === '23505') return false;
      throw error;
    }
  }
  const result = await rest(userId, filters, {
    method: trip ? 'PATCH' : 'DELETE', headers,
    ...(trip ? { body: { payload: trip, revision } } : {})
  });
  return result.length === 1;
}
