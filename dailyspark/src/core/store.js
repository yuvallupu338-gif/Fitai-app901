/*
 * store.js — everything the app knows, in one localStorage key, with a tiny
 * pub/sub on top.
 *
 * There is no server. That is a product decision and not a shortcut: the mood
 * check-ins and the personal notes in this app are the kind of data that is
 * cheapest to protect by never collecting it centrally. The consequence is that
 * this file is the entire persistence layer, so it carries the migration logic
 * and the honest answer to "is anything actually being saved".
 */

import { dayKey } from './day.js';
import { CATEGORY_KEYS } from '../data/taxonomy.js';

const KEY = 'dailyspark.v1';
const VERSION = 1;

const memory = { data: null };
let storageWorks = true;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to memory */ }
  return memory.data;
}

function write(data) {
  memory.data = data;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    storageWorks = false;
    return false;
  }
}

/*
 * Asked once at load rather than discovered on the first write.
 *
 * The app tells people their book is kept on their device. In private mode, or
 * from a file:// build on some browsers, that is false — and the place to say
 * so is before someone spends four screens on onboarding and a month on a
 * streak, not after a reload eats both.
 */
(function probeStorage() {
  try {
    const k = `${KEY}.probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
  } catch (e) {
    storageWorks = false;
  }
}());

/** False when nothing in this session will survive a reload. */
export function persists() {
  return storageWorks;
}

function emptyInterests() {
  /* Everything starts at "מעניין". Starting at zero would make the first
   * retrieval pass return an empty pool for anyone who skipped onboarding. */
  const out = {};
  for (const k of CATEGORY_KEYS) out[k] = 1;
  return out;
}

const EMPTY = {
  version: VERSION,
  stage: 'onboarding',        // 'onboarding' | 'app'
  onboardingStep: 0,
  createdAt: null,

  profile: {
    goals: [],                // GOALS keys
    customGoal: '',
    interests: null,          // category key -> 0 | 1 | 2
    habits: [],               // [{ id, label, cadence }]
    tone: 'practical',
    budgetMinutes: 5,
    blocked: [],              // category keys the user never wants to see
  },

  /* dayKey -> delivery record. The single source of truth for the home screen,
   * the book, the streak and every feature the ranker learns from. */
  days: {},

  streak: {
    current: 0,
    longest: 0,
    lastDay: null,            // last day the app was opened (not completed)
    freezesLeft: 2,
    freezeMonth: null,        // 'YYYY-MM', so the allowance resets monthly
    frozenDays: [],           // days a freeze covered, for the "streak kept" note
  },

  /* Bandit posterior. Stored as plain arrays because JSON has no typed arrays,
   * and re-hydrated on load. */
  model: { mu: null, sigma: null, updates: 0 },

  /* Per-topic affinity, learned from what actually gets done. */
  topics: null,               // plain array, TOPICS.length long

  /* Beta posteriors over the six candidate notification slots. */
  sendTime: { alpha: null, beta: null, lastSlot: null },

  collections: [],            // [{ id, name, items: [dayKey] }]

  settings: {
    theme: 'system',          // 'system' | 'light' | 'dark'
    moodPrompt: true,
    notify: {
      enabled: false,
      mode: 'auto',           // 'auto' (bandit picks) | 'fixed'
      hour: 8,
      minute: 30,
      ladder: 0,              // 0 daily … 5 off, see notify.js
      quietStart: 22,
      quietEnd: 7,
      lastSentDay: null,
      unopenedRun: 0,         // consecutive ignored notifications
    },
  },

  seen: [],                   // spark ids already delivered, newest last
};

function normalize(raw) {
  const s = Object.assign({}, EMPTY, raw || {});
  s.profile = Object.assign({}, EMPTY.profile, s.profile);
  s.settings = Object.assign({}, EMPTY.settings, s.settings);
  s.settings.notify = Object.assign({}, EMPTY.settings.notify, s.settings.notify);
  s.streak = Object.assign({}, EMPTY.streak, s.streak);
  s.model = Object.assign({}, EMPTY.model, s.model);
  s.sendTime = Object.assign({}, EMPTY.sendTime, s.sendTime);

  if (!s.profile.interests) s.profile.interests = emptyInterests();
  else {
    /* A category added in a later release must not be missing from a profile
     * saved by an earlier one, or its sparks become unreachable forever. */
    for (const k of CATEGORY_KEYS) {
      if (typeof s.profile.interests[k] !== 'number') s.profile.interests[k] = 1;
    }
  }
  if (!Array.isArray(s.profile.goals)) s.profile.goals = [];
  if (!Array.isArray(s.profile.habits)) s.profile.habits = [];
  if (!Array.isArray(s.profile.blocked)) s.profile.blocked = [];
  if (!s.days || typeof s.days !== 'object') s.days = {};
  if (!Array.isArray(s.collections)) s.collections = [];
  if (!Array.isArray(s.seen)) s.seen = [];
  if (!Array.isArray(s.streak.frozenDays)) s.streak.frozenDays = [];
  if (!s.createdAt) s.createdAt = dayKey();
  s.version = VERSION;
  return s;
}

let state = normalize(read());
const subs = new Set();

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
 * Day records
 * ------------------------------------------------------------------ */

export function dayEntry(key) {
  return state.days[key || dayKey()] || null;
}

export function putDay(key, entry) {
  update((s) => {
    s.days[key] = Object.assign({}, s.days[key], entry);
  });
  return state.days[key];
}

/** Day keys, newest first. */
export function dayKeysDesc() {
  return Object.keys(state.days).sort((a, b) => b.localeCompare(a));
}

export function markSeen(sparkId) {
  update((s) => {
    if (!s.seen.includes(sparkId)) s.seen.push(sparkId);
    /* A year of history is what the no-repeat rule needs; beyond that the list
     * is just localStorage weight. */
    if (s.seen.length > 500) s.seen = s.seen.slice(-500);
  });
}

/* ------------------------------------------------------------------ *
 * Backup
 * ------------------------------------------------------------------ */

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

/*
 * Restore from a backup — refusing anything that is not one.
 *
 * A plain parse-and-merge would accept any JSON file at all and overwrite a
 * year of history from the button that sounds like the safe one. The shape
 * check below is the difference between "import failed, nothing changed" and a
 * silently emptied book.
 */
export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('לא קובץ גיבוי של DailySpark');
  }
  const looksRight = ['days', 'profile', 'streak', 'seen', 'version'].some((k) => k in parsed);
  if (!looksRight) throw new Error('לא קובץ גיבוי של DailySpark');
  state = normalize(parsed);
  write(state);
  emit();
  return state;
}
