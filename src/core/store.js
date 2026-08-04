/*
 * store.js — persistent app state with a tiny pub/sub.
 *
 * Everything lives under one localStorage key. If storage is unavailable
 * (private mode, file://, quota) we degrade to an in-memory copy so the app
 * still works for the session instead of throwing.
 */

const KEY = 'fitai.v1';

const memory = { data: null };

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return memory.data;
}

function write(data) {
  memory.data = data;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

const EMPTY = {
  version: 1,
  stage: 'welcome',      // 'welcome' | 'intake' | 'plan'
  step: 0,               // intake step index
  profile: null,
  program: null,
  nutrition: null,
  ui: {
    activeDay: 0,        // index into program.days
    restDayMeals: false,
    tab: 'plan',         // 'plan' | 'nutrition' | 'progress' | 'guide'
  },
  picks: {},             // "dayId:slotKey" -> variant index
  overrides: {},         // "dayId:slotKey" -> Prescription, from "too easy"/"too hard"
  done: {},              // "YYYY-Www:dayId:slotKey" -> 1
  logs: {},              // "YYYY-MM-DD:dayId:slotKey" -> [{reps, weight, rpe}]
  weights: [],           // [{date:'YYYY-MM-DD', kg:Number}]
  startedAt: null,
};

let state = normalize(read());
const subs = new Set();

function normalize(raw) {
  const s = Object.assign({}, EMPTY, raw || {});
  s.ui = Object.assign({}, EMPTY.ui, s.ui);
  for (const k of ['picks', 'done', 'logs', 'overrides']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  if (!Array.isArray(s.weights)) s.weights = [];
  return s;
}

export function get() {
  return state;
}

export function set(patch) {
  state = normalize(Object.assign({}, state, typeof patch === 'function' ? patch(state) : patch));
  write(state);
  emit();
  return state;
}

/** Mutate in place then persist — for deep edits where a patch is clumsy. */
export function update(fn) {
  fn(state);
  write(state);
  emit();
  return state;
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit() {
  for (const fn of subs) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export function reset() {
  state = normalize(null);
  try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  memory.data = null;
  emit();
}

/* ------------------------------------------------------------------ *
 * Derived keys
 * ------------------------------------------------------------------ */

/** ISO-ish week stamp, e.g. "2026-W31". Used to scope completion ticks. */
export function weekKey(d) {
  const date = d ? new Date(d) : new Date();
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function todayKey(d) {
  const date = d ? new Date(d) : new Date();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

/** Which program week are we in (1-based), based on startedAt. */
export function currentWeek() {
  if (!state.startedAt) return 1;
  const ms = Date.now() - new Date(state.startedAt).getTime();
  return Math.max(1, Math.floor(ms / (7 * 86400000)) + 1);
}

/* ------------------------------------------------------------------ *
 * Common operations
 * ------------------------------------------------------------------ */

export function pickOf(dayId, slotKey) {
  return state.picks[`${dayId}:${slotKey}`] || 0;
}

export function setPick(dayId, slotKey, v) {
  update((s) => { s.picks[`${dayId}:${slotKey}`] = v; });
}

export function overrideOf(dayId, slotKey) {
  return state.overrides[`${dayId}:${slotKey}`] || null;
}

export function setOverride(dayId, slotKey, prescription) {
  update((s) => {
    const k = `${dayId}:${slotKey}`;
    if (prescription) s.overrides[k] = prescription;
    else delete s.overrides[k];
  });
}

export function isDone(dayId, slotKey) {
  return !!state.done[`${weekKey()}:${dayId}:${slotKey}`];
}

export function setDone(dayId, slotKey, v) {
  update((s) => {
    const k = `${weekKey()}:${dayId}:${slotKey}`;
    if (v) s.done[k] = 1; else delete s.done[k];
  });
}

export function logSet(dayId, slotKey, entry) {
  update((s) => {
    const k = `${todayKey()}:${dayId}:${slotKey}`;
    if (!s.logs[k]) s.logs[k] = [];
    s.logs[k].push(entry);
  });
}

export function logsFor(dayId, slotKey, date) {
  return state.logs[`${todayKey(date)}:${dayId}:${slotKey}`] || [];
}

export function addWeight(kg, date) {
  update((s) => {
    const d = todayKey(date);
    const existing = s.weights.find((w) => w.date === d);
    if (existing) existing.kg = kg;
    else s.weights.push({ date: d, kg });
    s.weights.sort((a, b) => a.date.localeCompare(b.date));
  });
}

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  state = normalize(parsed);
  write(state);
  emit();
  return state;
}
