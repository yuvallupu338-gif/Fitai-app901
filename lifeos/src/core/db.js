/*
 * db.js — collections, ownership, and the write path.
 *
 * The shape is a document store held in memory and serialised to one blob per
 * account. Reads are synchronous array scans over a few hundred records, which
 * is faster than any index would be at this size and does not need
 * invalidating; the one exception is lookup-by-id, which the whole app does
 * constantly and which gets a Map.
 *
 * OWNERSHIP IS CHECKED ON EVERY OPERATION, NOT ASSUMED FROM THE FILENAME.
 *
 * The data is already stored under a per-account key, so in principle a record
 * in the loaded blob belongs to the account that loaded it. In principle. The
 * check below runs anyway, on every read and every write, because "the file it
 * came from proves who owns it" is precisely the assumption that stops holding
 * the day an import, a migration, or a demo seed writes a record with somebody
 * else's id in it — and the failure mode then is silent cross-account leakage
 * rather than an exception. It costs a string comparison.
 */

import * as store from './store.js';
import { requireUserId } from './session.js';
import { emit, EV } from './bus.js';

export const SCHEMA_VERSION = 1;

/* Every collection in the app. A name not on this list is a typo, and asking
 * for it throws rather than silently returning an empty array forever. */
export const COLLECTIONS = [
  'areas',
  'goals',
  'projects',
  'milestones',
  'tasks',
  'taskDependencies',
  'habits',
  'habitCompletions',
  'routines',
  'events',
  'blocks',
  'focusSessions',
  'notes',
  'reviews',
  'recommendations',
  'memories',
  'activity',
  'aiInteractions',
];

const COLLECTION_SET = new Set(COLLECTIONS);

/* The activity log is the one collection that grows without bound — every
 * completed task appends to it forever. Two thousand events is roughly a year
 * of heavy use and about 200 KB, comfortably inside a 5 MB budget; older
 * entries are dropped from the head. The analytics screens read at most the
 * last ninety days, so nothing that is displayed is ever lost to this. */
const ACTIVITY_CAP = 2000;

function emptyBlob() {
  const collections = {};
  for (const name of COLLECTIONS) collections[name] = [];
  return {
    version: SCHEMA_VERSION,
    profile: null,
    preferences: null,
    collections,
  };
}

/* ------------------------------------------------------------------ *
 * The in-memory copy
 * ------------------------------------------------------------------ */

let loadedFor = null;
let blob = null;
let idIndex = null;
let lastWriteOk = true;

function buildIndex() {
  idIndex = new Map();
  for (const name of COLLECTIONS) {
    const map = new Map();
    for (const record of blob.collections[name]) map.set(record.id, record);
    idIndex.set(name, map);
  }
}

function migrate(data) {
  const out = Object.assign(emptyBlob(), data || {});
  out.collections = Object.assign(emptyBlob().collections, (data && data.collections) || {});
  /* A collection added in a later version is missing from an older blob. Fill
   * it rather than let every read of it throw. */
  for (const name of COLLECTIONS) {
    if (!Array.isArray(out.collections[name])) out.collections[name] = [];
  }
  out.version = SCHEMA_VERSION;
  return out;
}

/** Load (or reload) the signed-in account's data into memory. */
export function load() {
  const userId = requireUserId();
  if (loadedFor === userId && blob) return blob;
  blob = migrate(store.readData(userId));
  loadedFor = userId;
  buildIndex();
  return blob;
}

/** Drop the cache — after sign-out, or after an import replaced everything. */
export function unload() {
  loadedFor = null;
  blob = null;
  idIndex = null;
}

function data() {
  const userId = requireUserId();
  if (loadedFor !== userId || !blob) load();
  return blob;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

let batchDepth = 0;
let batchDirty = false;

function flush() {
  if (batchDepth > 0) { batchDirty = true; return; }
  const userId = requireUserId();
  lastWriteOk = store.writeData(userId, blob);
  if (!lastWriteOk) emit(EV.STORAGE_FAILED, null);
  emit(EV.DATA_CHANGED, null);
}

/**
 * Run several mutations as one write.
 *
 * A day plan schedules six tasks, creates six blocks and appends an activity
 * event; without this that is thirteen serialisations of the whole blob, and
 * thirteen DATA_CHANGED events causing thirteen re-renders of the same screen.
 * Nested calls are counted, so a service can batch without knowing whether its
 * caller already did.
 */
export function batch(fn) {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && batchDirty) {
      batchDirty = false;
      flush();
    }
  }
}

export function writeSucceeded() {
  return lastWriteOk;
}

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

let counter = 0;

export function newId(prefix) {
  counter += 1;
  return `${prefix || 'x'}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ *
 * Collection access
 * ------------------------------------------------------------------ */

function assertCollection(name) {
  if (!COLLECTION_SET.has(name)) throw new Error(`unknown collection: ${name}`);
}

function owns(record, userId) {
  return !!record && record.userId === userId;
}

/**
 * Every record in a collection that belongs to the signed-in account.
 * `filter` is applied after the ownership check, never instead of it.
 */
export function list(name, filter) {
  assertCollection(name);
  const userId = requireUserId();
  const all = data().collections[name];
  const mine = all.filter((r) => owns(r, userId));
  return filter ? mine.filter(filter) : mine;
}

export function get(name, id) {
  assertCollection(name);
  if (!id) return null;
  const userId = requireUserId();
  data();
  const record = idIndex.get(name).get(id);
  /* A record that exists but belongs to somebody else is reported as absent,
   * not as forbidden. Telling a caller "that id exists, just not for you" is
   * itself a leak. */
  return owns(record, userId) ? record : null;
}

export function getMany(name, ids) {
  return (ids || []).map((id) => get(name, id)).filter(Boolean);
}

export function count(name, filter) {
  return list(name, filter).length;
}

export function insert(name, record) {
  assertCollection(name);
  const userId = requireUserId();
  const now = Date.now();
  const full = Object.assign({}, record, {
    id: record.id || newId(name.slice(0, 3)),
    /* Stamped from the session, never taken from the argument. A caller that
     * passes a userId has it overwritten rather than honoured. */
    userId,
    createdAt: record.createdAt || now,
    updatedAt: now,
  });
  data().collections[name].push(full);
  idIndex.get(name).set(full.id, full);
  flush();
  return full;
}

export function insertMany(name, records) {
  return batch(() => records.map((r) => insert(name, r)));
}

export function update(name, id, patch) {
  assertCollection(name);
  const existing = get(name, id);
  if (!existing) return null;
  const next = typeof patch === 'function' ? patch(existing) : patch;
  Object.assign(existing, next, {
    id: existing.id,
    userId: existing.userId,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  });
  flush();
  return existing;
}

export function remove(name, id) {
  assertCollection(name);
  const existing = get(name, id);
  if (!existing) return false;
  const arr = data().collections[name];
  const i = arr.indexOf(existing);
  if (i >= 0) arr.splice(i, 1);
  idIndex.get(name).delete(id);
  flush();
  return true;
}

export function removeWhere(name, filter) {
  assertCollection(name);
  const doomed = list(name, filter);
  if (!doomed.length) return 0;
  return batch(() => {
    for (const r of doomed) remove(name, r.id);
    return doomed.length;
  });
}

/* ------------------------------------------------------------------ *
 * Activity log
 * ------------------------------------------------------------------ */

/**
 * Append an event. `actor` is one of USER, AI, SYSTEM, SYNC — recorded because
 * "who moved this task" is a question people ask about an app that moves
 * tasks, and answering it after the fact is impossible without the field.
 */
export function logEvent(type, payload, actor) {
  const entry = insert('activity', {
    type,
    actor: actor || 'USER',
    at: Date.now(),
    payload: payload || {},
  });
  const arr = data().collections.activity;
  if (arr.length > ACTIVITY_CAP) {
    const dropped = arr.splice(0, arr.length - ACTIVITY_CAP);
    for (const d of dropped) idIndex.get('activity').delete(d.id);
  }
  return entry;
}

/* ------------------------------------------------------------------ *
 * Profile and preferences — singletons rather than collections
 * ------------------------------------------------------------------ */

export function getProfile() {
  return data().profile;
}

export function setProfile(patch) {
  const d = data();
  d.profile = Object.assign({}, d.profile || {}, patch, { updatedAt: Date.now() });
  flush();
  return d.profile;
}

export function getPreferences() {
  return data().preferences;
}

export function setPreferences(patch) {
  const d = data();
  d.preferences = Object.assign({}, d.preferences || {}, patch, { updatedAt: Date.now() });
  flush();
  return d.preferences;
}

/* ------------------------------------------------------------------ *
 * Whole-account operations
 * ------------------------------------------------------------------ */

/** Everything for the signed-in account, for export. Never includes API keys. */
export function exportAll() {
  const d = data();
  return JSON.parse(JSON.stringify({
    version: d.version,
    exportedAt: Date.now(),
    profile: d.profile,
    preferences: d.preferences,
    collections: d.collections,
  }));
}

/**
 * Replace everything for the signed-in account.
 *
 * Re-stamps every incoming record's userId from the session. An export from
 * another profile on the same device carries that profile's ids, and importing
 * it without this would write records the current account cannot read — data
 * that exists, occupies quota, and is invisible.
 */
export function importAll(payload) {
  const userId = requireUserId();
  const incoming = migrate(payload);
  for (const name of COLLECTIONS) {
    incoming.collections[name] = incoming.collections[name]
      .filter((r) => r && typeof r === 'object' && r.id)
      .map((r) => Object.assign({}, r, { userId }));
  }
  blob = incoming;
  loadedFor = userId;
  buildIndex();
  flush();
  return true;
}

export function wipe() {
  const userId = requireUserId();
  blob = emptyBlob();
  loadedFor = userId;
  buildIndex();
  flush();
}

/** Test seam: the raw blob, for assertions. Not used by the app. */
export function _raw() {
  return data();
}
