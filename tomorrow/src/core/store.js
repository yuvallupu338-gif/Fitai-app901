/*
 * store.js — the app's state, its persistence and a small pub/sub.
 *
 * Everything TomorrowAI knows lives under one key. The adapter underneath is
 * swappable, so the day this grows a backend the only file that changes is
 * storage/adapter.js and every call site here keeps working.
 *
 * This is the browser side of the line. The engine never imports it: engine
 * modules take their inputs as arguments and return values, which is what
 * makes them testable in plain Node and what makes the what-if simulator
 * incapable of touching anything real. If you find yourself wanting to import
 * this file from src/engine/, the function you are writing belongs here or the
 * data belongs in its arguments.
 */

import { migrate, SCHEMA_VERSION } from '../storage/migrate.js';
import { pickAdapter, persists as adapterPersists } from '../storage/adapter.js';
import { makeItem, makeDayPlan, makeRecord, normalizeRoot } from '../storage/schema.js';
import { isValidKey } from './time.js';

const KEY = 'tomorrowai.v1';

/* Separate on purpose — see the API key section below. */
const API_KEY = 'tomorrowai.key.v1';

const adapter = pickAdapter();

let state = migrate(adapter.read(KEY));
const subs = new Set();

/*
 * Writes are the only thing here that can fail, and they fail quietly: a full
 * quota or a private window throws on setItem and there is nothing useful to
 * do about it mid-gesture. What matters is that the app stops claiming the
 * evening ritual was saved. persists() carries that answer to the UI, which
 * says it out loud before somebody spends a minute on a plan they are about to
 * lose. The FitAI store in this repo learned that the expensive way.
 */
function write() {
  return adapter.write(KEY, state);
}

function emit() {
  for (const fn of subs) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export function get() {
  return state;
}

export function set(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = normalizeRoot(Object.assign({}, state, next), new Date().toISOString());
  write();
  emit();
  return state;
}

/** Mutate in place then persist — for deep edits where a patch is clumsy. */
export function update(fn) {
  fn(state);
  write();
  emit();
  return state;
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function reset() {
  state = migrate(null);
  adapter.remove(KEY);
  adapter.remove(API_KEY);
  emit();
  return state;
}

/* ------------------------------------------------------------------ *
 * The model API key
 *
 * Kept under its own storage key rather than inside the document, for one
 * reason: exportJson() serialises the document. A person who backs up their
 * data and mails it to themselves must not be mailing a live credential, and
 * the safest way to guarantee that is for the exporter to have nothing to
 * exclude. normalizeRoot() strips a key out of any imported file for the same
 * reason.
 *
 * It is still plain text in localStorage, on an origin shared with the other
 * apps in this repository. Anything that can run script on this origin can read
 * it. The settings screen says so in as many words rather than leaving somebody
 * to assume otherwise.
 * ------------------------------------------------------------------ */

/** The stored API key, or '' when there is none. */
export function apiKey() {
  const raw = adapter.read(API_KEY);
  return raw && typeof raw.k === 'string' ? raw.k : '';
}

/** Store or clear the API key. Passing '' removes it. */
export function setApiKey(value) {
  const k = String(value || '').trim();
  if (!k) {
    adapter.remove(API_KEY);
    emit();
    return false;
  }
  const ok = adapter.write(API_KEY, { k });
  emit();
  return ok;
}

/** Replace the whole world — used by demo mode and by import. */
export function replace(root) {
  state = normalizeRoot(root, new Date().toISOString());
  write();
  emit();
  return state;
}

export function persists() {
  return adapterPersists();
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

/**
 * Everything on one day, in the order it will be read: scheduled items by
 * start time, then the unscheduled ones the user has not placed yet.
 *
 * Sorting happens here rather than in each view because three screens show the
 * same day and two of them once disagreed about where an unscheduled task
 * belonged. Ties break on id so the order is stable across renders — an
 * unstable sort makes cards visibly swap places when nothing changed.
 */
export function itemsOn(date) {
  return Object.values(state.items)
    .filter((i) => i.date === date)
    .sort((a, b) => {
      if (a.start === null && b.start === null) return a.id < b.id ? -1 : 1;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      if (a.start !== b.start) return a.start - b.start;
      return a.id < b.id ? -1 : 1;
    });
}

export function itemsBetween(from, to) {
  return Object.values(state.items)
    .filter((i) => i.date >= from && i.date <= to)
    .sort((a, b) => (a.date === b.date ? (a.start || 0) - (b.start || 0) : a.date < b.date ? -1 : 1));
}

export function itemById(id) {
  return state.items[id] || null;
}

export function putItem(patch) {
  const item = makeItem(patch, new Date().toISOString());
  update((s) => { s.items[item.id] = item; });
  return item;
}

export function patchItem(id, patch) {
  const existing = state.items[id];
  if (!existing) return null;
  const next = Object.assign({}, existing, patch, { id });
  update((s) => { s.items[id] = next; });
  return next;
}

export function removeItem(id) {
  if (!state.items[id]) return false;
  update((s) => {
    delete s.items[id];
    // A deleted task must not stay on tomorrow's list of important things, or
    // the goals factor keeps scoring a task that no longer exists.
    for (const d of Object.values(s.days)) {
      const at = d.topPriorities.indexOf(id);
      if (at >= 0) d.topPriorities.splice(at, 1);
    }
  });
  return true;
}

/** Replace every item on one day at once — how Apply Changes lands. */
export function replaceDayItems(date, items) {
  update((s) => {
    for (const [id, it] of Object.entries(s.items)) if (it.date === date) delete s.items[id];
    for (const it of items) s.items[it.id] = it;
  });
  return itemsOn(date);
}

/* ------------------------------------------------------------------ *
 * Days and records
 * ------------------------------------------------------------------ */

export function dayPlan(date) {
  if (!isValidKey(date)) throw new Error(`dayPlan: bad date ${date}`);
  if (!state.days[date]) {
    const plan = makeDayPlan(date, state.profile);
    update((s) => { s.days[date] = plan; });
  }
  return state.days[date];
}

export function putDayPlan(date, patch) {
  const base = dayPlan(date);
  const next = Object.assign({}, base, patch, { date });
  update((s) => { s.days[date] = next; });
  return next;
}

export function record(date) {
  if (!state.records[date]) {
    const rec = makeRecord(date);
    update((s) => { s.records[date] = rec; });
  }
  return state.records[date];
}

export function putRecord(date, patch) {
  const base = record(date);
  const next = Object.assign({}, base, patch, { date });
  update((s) => { s.records[date] = next; });
  return next;
}

/** Most recent first, which is the order every learning function expects. */
export function recentRecords(n) {
  return Object.values(state.records)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n || 90);
}

export function pushFeedback(kind, payload) {
  update((s) => {
    s.feedback.push({ at: new Date().toISOString(), kind, payload: payload || {} });
    // Feedback is an append-only log that nothing prunes, and localStorage is
    // about five megabytes for the whole origin — three apps share it here.
    if (s.feedback.length > 400) s.feedback.splice(0, s.feedback.length - 400);
  });
}

export function pushChat(role, text) {
  update((s) => {
    s.chat.push({ role, text, at: new Date().toISOString() });
    if (s.chat.length > 120) s.chat.splice(0, s.chat.length - 120);
  });
}

export function setProfile(patch) {
  update((s) => { s.profile = Object.assign({}, s.profile, patch); });
  return state.profile;
}

export function setUi(patch) {
  update((s) => { s.ui = Object.assign({}, s.ui, patch); });
  return state.ui;
}

export function setLearning(learning) {
  update((s) => { s.learning = learning; });
  return state.learning;
}

/* ------------------------------------------------------------------ *
 * Backup
 * ------------------------------------------------------------------ */

/*
 * The backup. It cannot contain the API key, because the key was never in the
 * document to begin with — see setApiKey() above.
 */
export function exportJson() {
  return JSON.stringify(state, null, 2);
}

/*
 * Restore from a backup, without letting any JSON file become the app's state.
 *
 * The naive version of this — parse, merge over the empty state, reload — will
 * happily accept somebody's shopping list, write it to storage and erase every
 * day of history behind a button that sounds safe. Throwing on a file that is
 * not a TomorrowAI backup is the point: the caller shows the error and the
 * existing state is still there to go back to.
 */
export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('לא קובץ גיבוי של TomorrowAI');
  }
  const looksLikeBackup = ['profile', 'items', 'days', 'records', 'learning', 'schemaVersion']
    .some((k) => k in parsed);
  if (!looksLikeBackup) throw new Error('לא קובץ גיבוי של TomorrowAI');
  return replace(migrate(parsed));
}

export { SCHEMA_VERSION };
