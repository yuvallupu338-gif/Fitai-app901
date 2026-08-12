/*
 * store.js — the portfolio, kept on the device.
 *
 * One localStorage key, same as the other app in this repo, and nothing else:
 * no account, no sync, no server. What that buys is that a person can write
 * down what they did at a job they have not left yet, with the client's name in
 * it, and nothing about that leaves the machine unless they press a download
 * button themselves.
 *
 * What it costs is the two failure modes handled below. Storage can be refused
 * outright — private browsing, a file:// page, a locked-down browser — and it
 * can fill up, which here is not a theoretical limit: localStorage holds a few
 * megabytes and a single phone photograph is several, so the quota is reachable
 * with about six pictures. Both are reported rather than thrown, because the
 * work in the form at that moment is worth more than the invariant.
 */

import { normalisePortfolio, normaliseWork } from '../data/schema.js';

const KEY = 'portfolio.v1';

/* The in-memory fallback. A session that cannot save is still a session that
 * can build a document and download it, which is the actual point of the app. */
const memory = { data: null };
let storageWorks = true;
let lastError = '';

const EMPTY = {
  version: 1,
  owner: { name: '', headline: '', about: '', email: '', phone: '', site: '', location: '' },
  works: [],
  ui: { tab: 'owner', editing: null },
};

function normalize(raw) {
  const base = Object.assign({}, EMPTY, raw || {});
  const clean = normalisePortfolio(base);
  base.owner = clean.owner;
  base.works = clean.works;
  base.ui = Object.assign({}, EMPTY.ui, base.ui || {});
  base.version = 1;
  return base;
}

/*
 * localStorage, or nothing.
 *
 * Reaching for it by name throws rather than returning undefined where a
 * browser has switched it off, and this module is also loaded by Node — where
 * it does not exist at all — every time a check imports something that imports
 * something that imports it. Asking once, in a place that cannot throw, is what
 * keeps the rest of the file readable.
 */
function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    return null;
  }
}

function read() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/*
 * Writes, and says whether it worked.
 *
 * The quota error is separated from every other failure because it is the only
 * one with an answer a person can act on — remove a photograph — and telling
 * somebody "אין מקום" when the real problem is that storage is off entirely
 * sends them to delete work that was never the cause.
 */
function write(data) {
  const store = storage();
  if (!store) {
    storageWorks = false;
    lastError = 'blocked';
    memory.data = data;
    return false;
  }
  try {
    store.setItem(KEY, JSON.stringify(data));
    lastError = '';
    return true;
  } catch (e) {
    console.error(e);
    storageWorks = false;
    lastError = isQuota(e) ? 'quota' : 'blocked';
    memory.data = data;
    return false;
  }
}

function isQuota(e) {
  if (!e) return false;
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return e.code === 22 || e.code === 1014;
}

/*
 * Asked once at load rather than waited for, because the first thing this app
 * does is ask somebody to type their name and the warning belongs before that,
 * not after they have filled in six works. Writes and removes its own key so it
 * cannot disturb a stored portfolio.
 */
(function probeStorage() {
  const store = storage();
  if (!store) { storageWorks = false; return; }
  try {
    store.setItem(KEY + '.probe', '1');
    store.removeItem(KEY + '.probe');
  } catch (e) {
    storageWorks = false;
    lastError = 'blocked';
  }
}());

let state = normalize(memory.data || read());
const subs = [];

function emit() {
  for (const fn of subs) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

/** False when nothing typed into this app will survive a reload. */
export function persists() {
  return storageWorks;
}

/** '', 'quota' or 'blocked' — what stopped the last save, if anything did. */
export function saveError() {
  return lastError;
}

export function get() {
  return state;
}

export function set(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = normalize(Object.assign({}, state, next));
  write(state);
  emit();
  return state;
}

export function update(fn) {
  fn(state);
  state = normalize(state);
  write(state);
  emit();
  return state;
}

export function subscribe(fn) {
  subs.push(fn);
  return function unsubscribe() {
    const i = subs.indexOf(fn);
    if (i >= 0) subs.splice(i, 1);
  };
}

export function reset() {
  state = normalize(null);
  const store = storage();
  if (store) {
    try { store.removeItem(KEY); } catch (e) { /* nothing to remove */ }
  }
  memory.data = null;
  lastError = '';
  emit();
  return state;
}

export function setOwner(patch) {
  return set({ owner: Object.assign({}, state.owner, patch) });
}

export function workById(id) {
  return state.works.find((w) => w.id === id) || null;
}

/**
 * Adds a work and returns it — with its id, which the caller needs in order to
 * open the editor on the thing it just created.
 */
export function addWork(work) {
  const w = normaliseWork(Object.assign({}, work, { id: '' }), state.works.length);
  set({ works: state.works.concat([w]) });
  /* Re-read it: normalize() runs again on the way in and may have settled a
   * clash between the new id and an imported one. */
  return state.works[state.works.length - 1];
}

export function saveWork(id, patch) {
  return set({
    works: state.works.map((w) => (w.id === id ? normaliseWork(Object.assign({}, w, patch, { id: w.id })) : w)),
  });
}

export function removeWork(id) {
  return set({ works: state.works.filter((w) => w.id !== id) });
}

/**
 * Moves a work one place up or down.
 *
 * Order is the one thing about a portfolio nobody agrees on — newest first,
 * best first, story order — so it is the person's, not a sort. Two buttons
 * rather than dragging, because dragging on a phone fights the scroll.
 */
export function moveWork(id, delta) {
  const works = state.works.slice();
  const i = works.findIndex((w) => w.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= works.length) return state;
  works.splice(j, 0, works.splice(i, 1)[0]);
  return set({ works });
}

export function setUi(patch) {
  return set({ ui: Object.assign({}, state.ui, patch) });
}

export function exportJson() {
  return JSON.stringify({ version: state.version, owner: state.owner, works: state.works }, null, 2);
}

/*
 * A backup coming back in.
 *
 * It is checked before anything is replaced, and the check is for the two keys
 * this app's own export always writes. A JSON file with neither is somebody's
 * shopping list, and merging it would silently empty a portfolio that took an
 * evening to write. Everything that survives the check still goes through
 * `normalisePortfolio`, which is the same suspicion the form gets — a backup is
 * a text file a person can edit, and it arrives with a data URL field that this
 * app is about to put in an `img` tag.
 */
export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('הקובץ הזה לא גיבוי של תיק עבודות');
  }
  if (!('works' in parsed) && !('owner' in parsed)) {
    throw new Error('הקובץ הזה לא גיבוי של תיק עבודות: אין בו עבודות ואין בו פרטים');
  }
  state = normalize({ owner: parsed.owner, works: parsed.works, ui: state.ui });
  write(state);
  emit();
  return state;
}
