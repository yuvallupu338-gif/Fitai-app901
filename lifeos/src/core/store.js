/*
 * store.js — the persistence adapter, and the only file that talks to
 * localStorage.
 *
 * WHY AN ADAPTER AND NOT JUST localStorage CALLS.
 *
 * Two reasons, and the second is the one that matters. The first is that
 * storage refuses in private browsing and when a quota is full, and an app
 * that pretends otherwise loses a person's afternoon. The second is that this
 * is the seam where a server goes. Everything above this file — db.js, the
 * services, the whole app — asks for "the data blob for this account" and
 * writes it back. Swapping that for an HTTP call against a real backend with
 * real server-side authorization is a change to this file and to session.js,
 * not to the twenty modules that use them.
 *
 * WHAT THIS IS NOT.
 *
 * It is not a security boundary. Anything in localStorage is readable by
 * anyone at the keyboard and by any script that runs on the origin. The
 * account separation below is a real separation of *data* — one account cannot
 * read another's through the app's own API — but it is not protection against
 * someone with the device. The README says this in as many words, and so does
 * the sign-in screen, because a person deciding what to write in a note
 * deserves to know which of the two they have.
 *
 * ONE BLOB PER ACCOUNT.
 *
 * Not one key per record. A day plan touches tasks, blocks, events and the
 * activity log together, and localStorage has no transaction — so a
 * record-per-key layout can tear, leaving a task scheduled into a block that
 * was never written. A single serialised write per account cannot.
 */

const PREFIX = 'lifeos.v1';
const K_ACCOUNTS = `${PREFIX}.accounts`;
const K_SESSION = `${PREFIX}.session`;
const K_DEVICE = `${PREFIX}.device`;
const K_DATA = (userId) => `${PREFIX}.data.${userId}`;

/* When localStorage refuses, everything still works for the session out of
 * this map. The app degrades to "works now, gone on reload" rather than to
 * "throws on first keystroke", and says which it is. */
const memory = new Map();

let storageWorks = true;
let storageChecked = false;

function backing() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}

/*
 * Asked once, at load, with a key of its own so it can never disturb stored
 * data. It has to be answered before the first write rather than discovered at
 * it: the sign-in screen warns about private browsing, and that warning is
 * worth nothing after somebody has already spent ten minutes in the app.
 */
export function probeStorage() {
  if (storageChecked) return storageWorks;
  storageChecked = true;
  const ls = backing();
  if (!ls) { storageWorks = false; return false; }
  try {
    const probe = `${PREFIX}.probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    storageWorks = true;
  } catch (e) {
    storageWorks = false;
  }
  return storageWorks;
}

/** Whether this device is actually keeping anything. */
export function persists() {
  if (!storageChecked) probeStorage();
  return storageWorks;
}

function readRaw(key) {
  if (memory.has(key)) return memory.get(key);
  const ls = backing();
  if (!ls || !storageWorks) return null;
  try {
    return ls.getItem(key);
  } catch (e) {
    return null;
  }
}

/** Returns false when the value could not be persisted to disk. */
function writeRaw(key, value) {
  memory.set(key, value);
  const ls = backing();
  if (!ls) { storageWorks = false; return false; }
  try {
    ls.setItem(key, value);
    return true;
  } catch (e) {
    /* Quota. The in-memory copy above already holds the value, so the session
     * continues; what changes is that the app now knows to say so. */
    storageWorks = false;
    return false;
  }
}

function removeRaw(key) {
  memory.delete(key);
  const ls = backing();
  if (!ls) return;
  try { ls.removeItem(key); } catch (e) { /* nothing useful to do */ }
}

function readJson(key, fallback) {
  const raw = readRaw(key);
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch (e) {
    /* Corrupt entry — a half-written value from a browser killed mid-write, or
     * something else on the origin using our prefix. Falling back loses the
     * key rather than bricking the app on every load. */
    return fallback;
  }
}

function writeJson(key, value) {
  return writeRaw(key, JSON.stringify(value));
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export function readAccounts() {
  const list = readJson(K_ACCOUNTS, []);
  return Array.isArray(list) ? list : [];
}

export function writeAccounts(accounts) {
  return writeJson(K_ACCOUNTS, accounts);
}

/* ------------------------------------------------------------------ *
 * Session pointer
 * ------------------------------------------------------------------ */

export function readSession() {
  const s = readJson(K_SESSION, null);
  return s && typeof s === 'object' && s.userId ? s : null;
}

export function writeSession(session) {
  if (!session) { removeRaw(K_SESSION); return true; }
  return writeJson(K_SESSION, session);
}

/* ------------------------------------------------------------------ *
 * Per-account data
 * ------------------------------------------------------------------ */

export function readData(userId) {
  if (!userId) return null;
  return readJson(K_DATA(userId), null);
}

export function writeData(userId, data) {
  if (!userId) return false;
  return writeJson(K_DATA(userId), data);
}

export function dropData(userId) {
  if (!userId) return;
  removeRaw(K_DATA(userId));
}

/* ------------------------------------------------------------------ *
 * Device-level settings — theme and the like, shared across accounts
 * because they belong to the screen rather than to the person.
 * ------------------------------------------------------------------ */

export function readDevice() {
  const d = readJson(K_DEVICE, {});
  return d && typeof d === 'object' ? d : {};
}

export function writeDevice(patch) {
  return writeJson(K_DEVICE, Object.assign(readDevice(), patch));
}

/* ------------------------------------------------------------------ *
 * Provider keys — deliberately outside the account blob
 *
 * An export must never carry an API key, and switching accounts on a shared
 * laptop must not hand over the key with it... except that the key belongs to
 * the device's owner, not to a profile, so it lives at device scope and the
 * export routine simply never reads from here.
 * ------------------------------------------------------------------ */

export function readProviderKey(providerId) {
  return readRaw(`${PREFIX}.key.${providerId}`) || '';
}

export function writeProviderKey(providerId, key) {
  const clean = String(key || '').trim();
  if (!clean) { removeRaw(`${PREFIX}.key.${providerId}`); return true; }
  return writeRaw(`${PREFIX}.key.${providerId}`, clean);
}

/* ------------------------------------------------------------------ *
 * Housekeeping
 * ------------------------------------------------------------------ */

/** Roughly how many bytes this app is using, for the settings screen. */
export function approximateBytes() {
  const ls = backing();
  if (!ls) return 0;
  let total = 0;
  try {
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key && key.startsWith(PREFIX)) {
        const v = ls.getItem(key);
        total += key.length + (v ? v.length : 0);
      }
    }
  } catch (e) { return total; }
  /* UTF-16 in every engine that implements the spec faithfully. */
  return total * 2;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} בייט`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ק״ב`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`;
}

/** Wipe everything this app owns. Used by the tests and by account deletion. */
export function dropEverything() {
  const ls = backing();
  memory.clear();
  if (!ls) return;
  try {
    const keys = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    for (const k of keys) ls.removeItem(k);
  } catch (e) { /* nothing useful to do */ }
}

export const STORAGE_PREFIX = PREFIX;
