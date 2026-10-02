// The ONLY file that touches localStorage / sessionStorage.
// Each collection is one key holding an array of flat, Mongo-shaped documents.
// To move to a real backend, replace the read/commit functions with fetch() calls.
import { AppError, ERR } from '../utils/errors';

export const SCHEMA_VERSION = 1;
export const COLLECTIONS = ['users', 'tasks', 'comments', 'timelogs', 'history', 'notifications'];
const PREFIX = 'tms_';
const DEFAULT_META = { schemaVersion: SCHEMA_VERSION, nextTaskNumber: 101 };

function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

function pick(name) {
  try {
    const s = window[name];
    const probe = '__tms_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    // Storage blocked (private mode, disabled cookies): keep working in memory for this session.
    return memoryStore();
  }
}
const local = pick('localStorage');
const session = pick('sessionStorage');

function safeParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function readCollection(name) {
  const data = safeParse(local.getItem(PREFIX + name), []);
  return Array.isArray(data) ? data.filter((x) => x && typeof x === 'object') : [];
}

export function readMeta() {
  const meta = safeParse(local.getItem(PREFIX + 'meta'), null);
  if (!meta || typeof meta !== 'object' || !Number.isInteger(meta.nextTaskNumber) || meta.nextTaskNumber < 1) {
    return { ...DEFAULT_META };
  }
  return { ...DEFAULT_META, ...meta };
}

// Writes several keys as one unit. If any write fails (for example the quota is exceeded)
// every key is put back to what it was, so data never ends up half-updated.
export function commit(changes) {
  const keys = Object.keys(changes);
  for (const k of keys) {
    if (k !== 'meta' && !COLLECTIONS.includes(k)) throw new AppError(ERR.STORAGE, `Unknown collection "${k}".`);
  }
  const snapshot = keys.map((k) => [k, local.getItem(PREFIX + k)]);
  try {
    for (const k of keys) local.setItem(PREFIX + k, JSON.stringify(changes[k]));
  } catch {
    for (const [k, raw] of snapshot) {
      try {
        if (raw === null) local.removeItem(PREFIX + k);
        else local.setItem(PREFIX + k, raw);
      } catch {
        /* nothing more we can do */
      }
    }
    throw new AppError(ERR.STORAGE, 'Could not save. Browser storage may be full or blocked. Nothing was changed.');
  }
}

export function readAllData() {
  const data = {};
  for (const c of COLLECTIONS) data[c] = readCollection(c);
  data.meta = readMeta();
  return data;
}

export function hasAnyUsers() {
  return readCollection('users').length > 0;
}

export function storageUsage() {
  let bytes = 0;
  for (const c of [...COLLECTIONS, 'meta']) bytes += (local.getItem(PREFIX + c) || '').length * 2;
  return bytes;
}

// Session: per tab, cleared on logout. Never touches the data keys.
export function readSession() {
  const s = safeParse(session.getItem(PREFIX + 'session'), null);
  return s && typeof s.userId === 'string' ? s : null;
}
export function writeSession(value) {
  try {
    session.setItem(PREFIX + 'session', JSON.stringify(value));
  } catch {
    /* session is best-effort */
  }
}
export function clearSession() {
  try {
    session.removeItem(PREFIX + 'session');
  } catch {
    /* ignore */
  }
}

export function getPref(key, fallback) {
  return safeParse(local.getItem(PREFIX + 'pref_' + key), fallback);
}
export function setPref(key, value) {
  try {
    local.setItem(PREFIX + 'pref_' + key, JSON.stringify(value));
  } catch {
    /* preferences are best-effort */
  }
}
