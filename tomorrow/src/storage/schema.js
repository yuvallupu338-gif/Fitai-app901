/*
 * schema.js — the shape of a TomorrowAI document, and the only place that
 * builds one.
 *
 * Two jobs live here. The factories — emptyRoot, defaultProfile, emptyLearning,
 * makeItem, makeDayPlan, makeRecord — return objects with every field of §3
 * present, never `undefined`. The engine reads those fields without checking
 * for them, and one missing number turns into NaN, which then propagates
 * silently through a curve, a score and a ring until the user is looking at a
 * blank dial with no idea why. Filling the shape here is cheaper than
 * defending against it in nine engine files.
 *
 * The other job is normalizeRoot, which is total: it takes anything at all —
 * null, a string, an array, a half-written document, a file somebody picked by
 * mistake, an item map full of junk — and returns a valid Root. It never
 * throws and it never returns a partial object. Storage that can crash the app
 * on load is storage that loses the app, and the one moment a user cannot
 * recover from is the one where opening it shows nothing at all.
 *
 * The file is pure: no clock, no DOM, no randomness. Every timestamp is passed
 * in. tools/tomorrow-validate.mjs imports it in Node and compares two runs of
 * the same input byte for byte.
 */

import { isValidKey, clampMinutes, diffDays } from '../core/time.js';
import {
  ITEM_TYPES, CATEGORIES, PRIORITIES, ENERGY_LEVELS, FOCUS_LEVELS,
  PREFERRED_TIMES, PRIORITY_AREAS, REVIEW_TAGS, isToken,
} from '../data/catalog.js';

const MINUTES_IN_DAY = 1440;
const LAST_MINUTE = MINUTES_IN_DAY - 1;

/*
 * The scheduler works on a five-minute grid and the day timeline needs a block
 * it can actually label, so anything shorter than five minutes is rounded up
 * rather than drawn as a hairline. The ceiling of ten hours is the same number
 * validateItem refuses: past that it is not one item.
 */
const MIN_DURATION = 5;
const MAX_DURATION = 600;
const DEFAULT_DURATION = 30;

/* 07:00 and 23:00 — an eight hour night, which is also the default sleep need
 * the energy model falls back to before it has learned anything. */
const DEFAULT_WAKE = 420;
const DEFAULT_BED = 1380;

const KINDS = ['task', 'event'];
const STATUSES = ['planned', 'done', 'skipped'];
const FOCUS_PREFERENCES = ['morning', 'afternoon', 'evening', 'unsure'];
const TIME_FORMATS = ['24h', '12h'];
const THEMES = ['dark', 'light'];
const HISTORY_RANGES = [7, 30, 90, 365];
const INSIGHTS_MODES = ['insights', 'history'];
const FOCUS_MODES = ['', 'today', 'tomorrow', 'other'];
const SCHEDULE_MODES = ['day', 'week'];
const CHAT_ROLES = ['user', 'ai'];

/*
 * A default category for an item that arrived without one.
 *
 * 'other' would be the honest answer to "we were not told", but it is the
 * wrong one for learning: estimationErrorByCategory only becomes useful when
 * comparable items land in the same bucket, and a quick-add flow that never
 * asks for a category would drop every workout, lecture and stand-up into one
 * pile. The type already says most of it.
 */
const CATEGORY_BY_TYPE = {
  task: 'other',
  event: 'personal',
  workout: 'fitness',
  study: 'study',
  meeting: 'work',
  break: 'personal',
  sleep: 'personal',
  custom: 'other',
};

/* ------------------------------------------------------------------ *
 * Coercion helpers
 * ------------------------------------------------------------------ */

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/*
 * Number() says 0 for null, for '' and for [], which is how a field nobody
 * filled in becomes midnight, or a zero-minute task. Only a number or a
 * non-blank string counts as an answer here; everything else is absent and
 * takes the fallback.
 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function intOr(value, min, max, fallback) {
  const n = toNumber(value);
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
}

function numOr(value, min, max, fallback) {
  const n = toNumber(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function intOrNull(value, min, max) {
  const n = toNumber(value);
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : null;
}

function numOrNull(value, min, max) {
  const n = toNumber(value);
  return Number.isFinite(n) ? clamp(n, min, max) : null;
}

function oneOf(list, value, fallback) {
  return list.indexOf(value) >= 0 ? value : fallback;
}

function tokenOr(list, value, fallback) {
  return isToken(list, value) ? value : fallback;
}

function keyOr(value, fallback) {
  return typeof value === 'string' && isValidKey(value) ? value : fallback;
}

/** A stored ISO timestamp, or '' when there is not one. Never parsed here. */
function stamp(value, fallback) {
  const s = str(value, '');
  return s || fallback;
}

function stampOrNull(value) {
  const s = str(value, '');
  return s || null;
}

/* ------------------------------------------------------------------ *
 * Ids without a clock and without randomness
 * ------------------------------------------------------------------ */

/*
 * makeItem has to mint an id, and the two usual sources are both closed to it:
 * this file is imported by the deterministic validator, so Math.random() and
 * Date.now() would both fail the build the first time a factory is called
 * twice on the same input. What is left is the content of the item and a
 * count of how many have been made.
 *
 * `hash36` is FNV-1a over the fields that describe the item plus the createdAt
 * string the caller passed in. `seq` counts calls since this module loaded.
 * The hash separates two different items made in the same instant; the counter
 * separates two identical ones, so a user who types "לקרוא" twice in a row
 * gets two rows rather than one row that quietly ate the other.
 *
 * Two documents built in two different browsers could in principle collide:
 * same content, same createdAt to the millisecond, same position in the
 * session. Nothing in the MVP merges two documents, and normalizeRoot re-keys
 * a duplicate instead of dropping it, so the cost of that collision is an ugly
 * id rather than a lost item. A sync backend would hand out its own ids and
 * none of this would matter.
 */
let seq = 0;

function hash36(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function itemId(patch, nowIso, seed) {
  const parts = [
    str(patch.title, ''),
    str(patch.date, ''),
    String(patch.start),
    String(patch.duration),
    str(patch.type, ''),
    str(nowIso, ''),
  ];
  return `itm_${hash36(parts.join('|'))}${seed.toString(36)}`;
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function defaultProfile(nowIso) {
  return {
    name: '',
    wakeTime: DEFAULT_WAKE,
    bedTime: DEFAULT_BED,
    priorities: [],
    focusPreference: 'unsure',
    weekStart: 0,
    timeFormat: '24h',
    theme: 'dark',
    reduceMotion: false,
    // 21:00 for the evening ritual, 07:30 for the morning check-in: both sit
    // inside the default night rather than on its edge, so a user who never
    // touches them still gets asked at a time they are awake.
    notifications: { evening: true, morning: true, eveningAt: 1260, morningAt: 450 },
    // Left empty on purpose. The IANA zone comes from
    // Intl.DateTimeFormat().resolvedOptions().timeZone, which is ambient, and
    // reading it here would make a pure module answer differently in Node than
    // in the browser. Onboarding fills it. It is informational only (§1), so
    // an empty string costs nothing until then.
    timezone: '',
    createdAt: stamp(nowIso, ''),
  };
}

export function emptyLearning() {
  return {
    samples: { days: 0, mornings: 0, durations: 0, completions: 0, reviews: 0 },
    averageWakeTime: null,
    averageSleepDuration: null,
    averageSleepQuality: null,
    morningEnergy: null,
    afternoonEnergy: null,
    eveningEnergy: null,
    focusPeakHour: null,
    energyPeakHour: null,
    bestDayOfWeek: null,
    lowestEnergyDay: null,
    averageTaskCompletionRate: null,
    averageEstimationError: null,
    estimationErrorByCategory: {},
    procrastinationRate: null,
    preferredTaskDuration: null,
    breakEffectiveness: null,
    sleepEnergyCorrelation: null,
    sleepFocusCorrelation: null,
    workloadStressCorrelation: null,
    // The one number that is not nullable (§3.5). Zero means "nothing
    // repeatable has been observed", which is exactly what personalWeight()
    // should read on day one — it holds the personal blend down to its floor
    // rather than letting a single day speak for the user.
    consistency: 0,
    updatedAt: null,
  };
}

export function emptyRoot(nowIso) {
  const now = stamp(nowIso, '');
  return {
    schemaVersion: 1,
    // The id is local and exists to tag an export and to give a future sync
    // something to key on. Derived from createdAt so it needs no randomness;
    // a real backend would assign its own and overwrite this.
    user: { id: `usr_${hash36(now)}`, createdAt: now, onboarded: false, demo: false },
    profile: defaultProfile(now),
    items: {},
    days: {},
    records: {},
    learning: emptyLearning(),
    feedback: [],
    chat: [],
    settings: { firstRun: true, lastSeenDate: null },
    ui: { view: 'tomorrow', historyRange: 7, scheduleMode: 'day', insightsMode: 'insights', focus: '', focusDate: null },
  };
}

/*
 * One item, complete, from whatever the caller had.
 *
 * It does not throw and it does not reject. The UI calls validateItem first
 * and shows the Hebrew problems; makeItem is what runs afterwards, and it also
 * runs over stored data during normalizeRoot, where throwing would mean losing
 * the rest of the document over one bad row. So everything repairable is
 * repaired — a duration of 900 is clamped, a start of 2000 is clamped, a
 * 'sleep' type is demoted — and the two things that cannot be repaired, an
 * empty title and a missing date, come back empty for normalizeRoot to drop.
 */
export function makeItem(patch, nowIso) {
  const p = isObject(patch) ? patch : {};
  const now = stamp(nowIso, '');

  const rawStart = toNumber(p.start);
  const start = Number.isFinite(rawStart) ? clampMinutes(Math.round(rawStart)) : null;

  let kind = oneOf(KINDS, p.kind, 'task');
  /*
   * An event is a thing that happens at a time; §3.2 says one without a start
   * is invalid. Inventing a start would be worse than the invalid state,
   * because the scheduler treats a locked event as fact and would build the
   * whole day around a time nobody chose. Coming back as an unscheduled task
   * is what it honestly is, and validateItem has already said so.
   */
  if (kind === 'event' && start === null) kind = 'task';

  let type = tokenOr(ITEM_TYPES, p.type, kind === 'event' ? 'event' : 'task');
  // Sleep is a property of the day, never a row in it (§3.3). Stored data that
  // says otherwise came from somewhere we do not control: keep the row, drop
  // the claim.
  if (type === 'sleep') type = 'custom';

  /*
   * `duration` is what the app schedules and `estimatedDuration` is what the
   * user believes, so they seed each other when only one was given and neither
   * is ever computed from the other again. §3.2 is explicit that learning may
   * raise `duration` and must never touch `estimatedDuration` — that is the
   * number the estimation error is measured against.
   */
  const hasDuration = Number.isFinite(toNumber(p.duration));
  const hasEstimate = Number.isFinite(toNumber(p.estimatedDuration));
  const duration = hasDuration
    ? intOr(p.duration, MIN_DURATION, MAX_DURATION, DEFAULT_DURATION)
    : intOr(p.estimatedDuration, MIN_DURATION, MAX_DURATION, DEFAULT_DURATION);
  const estimatedDuration = hasEstimate
    ? intOr(p.estimatedDuration, MIN_DURATION, MAX_DURATION, duration)
    : duration;

  const status = oneOf(STATUSES, p.status, 'planned');
  let completedAt = stampOrNull(p.completedAt);
  if (status === 'done' && !completedAt) completedAt = now || null;
  // A row that is not done cannot carry a completion time. Leaving a stale one
  // there makes the history screen show a task finishing on a day it was never
  // finished.
  if (status !== 'done') completedAt = null;

  let id = str(p.id, '').trim();
  if (!id) {
    seq += 1;
    id = itemId(p, now, seq);
  }

  return {
    id,
    kind,
    type,
    title: str(p.title, '').trim(),
    notes: str(p.notes, ''),
    date: keyOr(p.date, ''),
    start,
    duration,
    locked: bool(p.locked, kind === 'event'),

    category: tokenOr(CATEGORIES, p.category, CATEGORY_BY_TYPE[type] || 'other'),
    priority: tokenOr(PRIORITIES, p.priority, kind === 'event' ? 'high' : 'medium'),
    deadline: keyOr(p.deadline, null),
    estimatedDuration,
    actualDuration: intOrNull(p.actualDuration, 0, MINUTES_IN_DAY),
    difficulty: intOr(p.difficulty, 1, 5, 3),
    energyRequirement: tokenOr(ENERGY_LEVELS, p.energyRequirement, 'medium'),
    focusRequirement: tokenOr(FOCUS_LEVELS, p.focusRequirement, 'medium'),
    preferredTime: tokenOr(PREFERRED_TIMES, p.preferredTime, 'any'),
    status,
    isTop: bool(p.isTop, false),

    createdAt: stamp(p.createdAt, now),
    completedAt,
  };
}

export function makeDayPlan(date, profile) {
  const p = isObject(profile) ? profile : {};
  const wake = intOr(p.wakeTime, 0, LAST_MINUTE, DEFAULT_WAKE);
  const bed = intOr(p.bedTime, 0, LAST_MINUTE, DEFAULT_BED);
  return {
    date: keyOr(date, ''),
    wake,
    // Both bedtimes start at the profile's usual one: `bedtime` closed the
    // night before this date and `nextBedtime` closes this date. They only
    // diverge once the user reports a real bedtime or the optimiser moves one
    // of them, which is the whole point of storing them separately.
    bedtime: bed,
    nextBedtime: bed,
    eveningState: null,
    topPriorities: [],
    preparedAt: null,
    appliedPlanId: null,
  };
}

export function makeRecord(date) {
  return {
    date: keyOr(date, ''),
    forecast: null,
    morning: null,
    checkpoints: [],
    actual: null,
    review: null,
    accuracy: null,
  };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/*
 * The Hebrew problems with a patch, in the order a form reads top to bottom.
 * Empty means it is fine.
 *
 * It takes a raw patch, not an Item, because the caller is a form where every
 * field may be missing, blank or a string. It only complains about what was
 * actually said: a task with no start is unscheduled, which is legal and
 * common, so a missing start is silent — while a start of 1500 is not.
 *
 * The deadline is compared against the item's own date rather than against
 * today, because there is no clock in this file and because the question the
 * user is actually asking is "can this be done on the day I put it on".
 */
export function validateItem(patch) {
  const p = isObject(patch) ? patch : {};
  const problems = [];

  if (!str(p.title, '').trim()) problems.push('צריך שם לפריט.');

  const date = str(p.date, '');
  if (!date || !isValidKey(date)) problems.push('התאריך של הפריט אינו תקין.');

  const duration = toNumber(p.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    problems.push('משך הפריט צריך להיות לפחות דקה אחת.');
  } else if (duration > MAX_DURATION) {
    problems.push('משך של יותר מ-10 שעות ברצף הוא כנראה יותר מפריט אחד. אפשר לפצל אותו.');
  }

  const startGiven = p.start !== null && p.start !== undefined && p.start !== '';
  const start = toNumber(p.start);
  if (startGiven && (!Number.isFinite(start) || start < 0 || start > LAST_MINUTE)) {
    problems.push('שעת ההתחלה צריכה להיות בין 00:00 ל-23:59.');
  }
  if (oneOf(KINDS, p.kind, 'task') === 'event' && !startGiven) {
    problems.push('לאירוע צריך זמן התחלה.');
  }
  if (startGiven && Number.isFinite(start) && start >= 0 && start <= LAST_MINUTE
      && Number.isFinite(duration) && duration > 0 && start + duration > MINUTES_IN_DAY) {
    problems.push('הפריט חוצה את חצות. אפשר לקצר אותו או להתחיל אותו מוקדם יותר.');
  }

  const deadline = str(p.deadline, '');
  if (deadline) {
    if (!isValidKey(deadline)) {
      problems.push('תאריך היעד אינו תקין.');
    } else if (isValidKey(date) && diffDays(deadline, date) < 0) {
      problems.push('תאריך היעד מוקדם מהיום שבו הפריט מתוכנן.');
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

function normalizeProfile(raw, nowIso) {
  const base = defaultProfile(nowIso);
  if (!isObject(raw)) return base;
  const notifications = isObject(raw.notifications) ? raw.notifications : {};

  const priorities = [];
  if (Array.isArray(raw.priorities)) {
    for (const value of raw.priorities) {
      if (isToken(PRIORITY_AREAS, value) && priorities.indexOf(value) < 0) priorities.push(value);
    }
  }

  return {
    name: str(raw.name, '').trim(),
    wakeTime: intOr(raw.wakeTime, 0, LAST_MINUTE, base.wakeTime),
    bedTime: intOr(raw.bedTime, 0, LAST_MINUTE, base.bedTime),
    priorities,
    focusPreference: oneOf(FOCUS_PREFERENCES, raw.focusPreference, base.focusPreference),
    weekStart: intOr(raw.weekStart, 0, 1, base.weekStart),
    timeFormat: oneOf(TIME_FORMATS, raw.timeFormat, base.timeFormat),
    theme: oneOf(THEMES, raw.theme, base.theme),
    reduceMotion: bool(raw.reduceMotion, base.reduceMotion),
    notifications: {
      evening: bool(notifications.evening, base.notifications.evening),
      morning: bool(notifications.morning, base.notifications.morning),
      eveningAt: intOr(notifications.eveningAt, 0, LAST_MINUTE, base.notifications.eveningAt),
      morningAt: intOr(notifications.morningAt, 0, LAST_MINUTE, base.notifications.morningAt),
    },
    timezone: str(raw.timezone, base.timezone),
    createdAt: stamp(raw.createdAt, base.createdAt),
  };
}

/*
 * The item map, repaired.
 *
 * The map is keyed by id, so when a row has lost its own `id` field the key it
 * was filed under is the id — that is the common shape of a hand-edited or
 * half-written document and it costs nothing to honour. Only when there is no
 * key either, which happens when the items arrived as an array, does an id get
 * derived, and then from the position rather than from the module counter so
 * that normalizing the same document twice produces the same ids.
 *
 * A row with no title or no usable date is dropped. Those are the two fields
 * nothing downstream can work around: an item with no name is a blank line in
 * the timeline, and one with no day cannot be placed anywhere at all.
 */
function normalizeItems(raw, nowIso) {
  const out = {};
  let index = 0;
  let entries = [];
  if (Array.isArray(raw)) entries = raw.map((value) => ['', value]);
  else if (isObject(raw)) entries = Object.keys(raw).map((key) => [key, raw[key]]);

  for (const [key, value] of entries) {
    index += 1;
    if (!isObject(value)) continue;
    const given = str(value.id, '').trim() || str(key, '').trim() || itemId(value, nowIso, index);
    const item = makeItem(Object.assign({}, value, { id: given }), nowIso);
    if (!item.title || !item.date) continue;
    // Two rows claiming one id would silently erase each other. Re-key the
    // second by its position instead; an ugly id is recoverable, a missing
    // afternoon is not.
    if (Object.prototype.hasOwnProperty.call(out, item.id)) {
      item.id = `${item.id}_${index.toString(36)}`;
    }
    out[item.id] = item;
  }
  return out;
}

function normalizeEveningState(raw) {
  if (!isObject(raw)) return null;
  return {
    energy: intOr(raw.energy, 1, 5, 3),
    mood: intOr(raw.mood, 1, 5, 3),
    stress: intOr(raw.stress, 1, 5, 3),
  };
}

function normalizeDayPlan(raw, date, profile, items) {
  const base = makeDayPlan(date, profile);
  if (!isObject(raw)) return base;

  const topPriorities = [];
  if (Array.isArray(raw.topPriorities)) {
    for (const id of raw.topPriorities) {
      // A top priority pointing at a deleted item draws an empty row in the
      // most prominent card on the home screen, so the reference is dropped
      // with the item rather than kept as a ghost.
      if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(items, id)
          && topPriorities.indexOf(id) < 0) topPriorities.push(id);
    }
  }

  return {
    date: base.date,
    wake: intOr(raw.wake, 0, LAST_MINUTE, base.wake),
    bedtime: intOr(raw.bedtime, 0, LAST_MINUTE, base.bedtime),
    nextBedtime: intOr(raw.nextBedtime, 0, LAST_MINUTE, base.nextBedtime),
    eveningState: normalizeEveningState(raw.eveningState),
    topPriorities: topPriorities.slice(0, 3),
    preparedAt: stampOrNull(raw.preparedAt),
    appliedPlanId: str(raw.appliedPlanId, '').trim() || null,
  };
}

function normalizeDays(raw, profile, items) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (!isValidKey(key)) continue;
    out[key] = normalizeDayPlan(raw[key], key, profile, items);
  }
  return out;
}

function normalizeRecord(raw, date) {
  const base = makeRecord(date);
  if (!isObject(raw)) return base;

  const morning = isObject(raw.morning) ? {
    energy: intOr(raw.morning.energy, 1, 5, 3),
    mood: intOr(raw.morning.mood, 1, 5, 3),
    sleepQuality: intOr(raw.morning.sleepQuality, 1, 5, 3),
    at: stamp(raw.morning.at, ''),
  } : null;

  const checkpoints = [];
  if (Array.isArray(raw.checkpoints)) {
    for (const c of raw.checkpoints) {
      if (!isObject(c)) continue;
      const minute = intOrNull(c.minute, 0, LAST_MINUTE);
      if (minute === null) continue;
      checkpoints.push({ minute, energy: intOr(c.energy, 1, 5, 3), at: stamp(c.at, '') });
    }
    checkpoints.sort((a, b) => a.minute - b.minute);
  }

  const actual = isObject(raw.actual) ? {
    dayScore: intOrNull(raw.actual.dayScore, 0, 100),
    completed: intOr(raw.actual.completed, 0, 999, 0),
    planned: intOr(raw.actual.planned, 0, 999, 0),
    focusMinutes: intOr(raw.actual.focusMinutes, 0, MINUTES_IN_DAY, 0),
    sleepMinutes: intOrNull(raw.actual.sleepMinutes, 0, MINUTES_IN_DAY),
  } : null;

  const review = isObject(raw.review) ? {
    tags: Array.isArray(raw.review.tags)
      ? raw.review.tags.filter((t, i, all) => isToken(REVIEW_TAGS, t) && all.indexOf(t) === i)
      : [],
    note: str(raw.review.note, ''),
    at: stamp(raw.review.at, ''),
  } : null;

  const accuracy = isObject(raw.accuracy) ? {
    overall: numOr(raw.accuracy.overall, 0, 100, 0),
    energy: numOrNull(raw.accuracy.energy, 0, 100),
    duration: numOrNull(raw.accuracy.duration, 0, 100),
    completion: numOrNull(raw.accuracy.completion, 0, 100),
  } : null;

  return {
    date: base.date,
    /*
     * The stored forecast snapshot is kept as it was written and not
     * re-validated against §6. It was produced by whatever build of the engine
     * was running that evening, and it is the only surviving record of what
     * the app actually predicted — rebuilding it against today's shape would
     * quietly rewrite history, and dropping it for a field that moved would
     * erase the thing accuracy.js exists to measure. accuracy.js already
     * treats every missing part as null.
     */
    forecast: isObject(raw.forecast) ? raw.forecast : null,
    morning,
    checkpoints,
    actual,
    review,
    accuracy,
  };
}

function normalizeRecords(raw) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (!isValidKey(key)) continue;
    out[key] = normalizeRecord(raw[key], key);
  }
  return out;
}

function normalizeLearning(raw) {
  const base = emptyLearning();
  if (!isObject(raw)) return base;
  const samples = isObject(raw.samples) ? raw.samples : {};

  const byCategory = {};
  if (isObject(raw.estimationErrorByCategory)) {
    for (const key of Object.keys(raw.estimationErrorByCategory)) {
      if (!isToken(CATEGORIES, key)) continue;
      const entry = raw.estimationErrorByCategory[key];
      if (!isObject(entry)) continue;
      const ratio = numOrNull(entry.ratio, 0.1, 10);
      const n = intOr(entry.n, 0, 100000, 0);
      // A ratio with no observations behind it is not a measurement, and
      // estimateDuration() would apply it as though it were.
      if (ratio === null || n <= 0) continue;
      byCategory[key] = { ratio, n };
    }
  }

  return {
    samples: {
      days: intOr(samples.days, 0, 100000, 0),
      mornings: intOr(samples.mornings, 0, 100000, 0),
      durations: intOr(samples.durations, 0, 100000, 0),
      completions: intOr(samples.completions, 0, 100000, 0),
      reviews: intOr(samples.reviews, 0, 100000, 0),
    },
    averageWakeTime: intOrNull(raw.averageWakeTime, 0, LAST_MINUTE),
    averageSleepDuration: numOrNull(raw.averageSleepDuration, 0, MINUTES_IN_DAY),
    averageSleepQuality: numOrNull(raw.averageSleepQuality, 1, 5),
    morningEnergy: numOrNull(raw.morningEnergy, 0, 100),
    afternoonEnergy: numOrNull(raw.afternoonEnergy, 0, 100),
    eveningEnergy: numOrNull(raw.eveningEnergy, 0, 100),
    focusPeakHour: intOrNull(raw.focusPeakHour, 0, 23),
    energyPeakHour: intOrNull(raw.energyPeakHour, 0, 23),
    bestDayOfWeek: intOrNull(raw.bestDayOfWeek, 0, 6),
    lowestEnergyDay: intOrNull(raw.lowestEnergyDay, 0, 6),
    averageTaskCompletionRate: numOrNull(raw.averageTaskCompletionRate, 0, 1),
    averageEstimationError: numOrNull(raw.averageEstimationError, 0.1, 10),
    estimationErrorByCategory: byCategory,
    procrastinationRate: numOrNull(raw.procrastinationRate, 0, 1),
    preferredTaskDuration: intOrNull(raw.preferredTaskDuration, MIN_DURATION, MAX_DURATION),
    breakEffectiveness: numOrNull(raw.breakEffectiveness, 0, 1),
    sleepEnergyCorrelation: numOrNull(raw.sleepEnergyCorrelation, -1, 1),
    sleepFocusCorrelation: numOrNull(raw.sleepFocusCorrelation, -1, 1),
    workloadStressCorrelation: numOrNull(raw.workloadStressCorrelation, -1, 1),
    consistency: numOr(raw.consistency, 0, 1, 0),
    updatedAt: stampOrNull(raw.updatedAt),
  };
}

function normalizeFeedback(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const kind = str(entry.kind, '').trim();
    if (!kind) continue;
    out.push({
      at: stamp(entry.at, ''),
      kind,
      payload: isObject(entry.payload) ? entry.payload : {},
    });
  }
  return out;
}

/*
 * A line whose role is neither 'user' nor 'ai' is dropped rather than
 * defaulted. There are only two speakers, so a third value is corrupt, and
 * guessing puts one of them's words in the other's mouth — a transcript that
 * shows the engine's answer as something the user said is worse than a
 * transcript with a line missing. If a role is ever renamed, the rename
 * belongs in migrate.js where it can be done knowingly.
 */
function normalizeChat(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const text = str(entry.text, '');
    if (!text || CHAT_ROLES.indexOf(entry.role) < 0) continue;
    out.push({ role: entry.role, text, at: stamp(entry.at, '') });
  }
  return out;
}

/*
 * Anything at all, in; a valid Root, out.
 *
 * There is no input this is allowed to refuse. The value it is handed came off
 * a device where a browser extension, a half-finished write, a shared origin
 * or a user with the console open could all have touched it, and the failure
 * mode of getting that wrong is not a wrong number on a card — it is a white
 * screen with the whole history behind it, which no user can get out of.
 *
 * The order matters in one place: items are normalized before days, because a
 * day's topPriorities are checked against the surviving items.
 */
export function normalizeRoot(raw, nowIso) {
  const now = stamp(nowIso, '');
  const root = emptyRoot(now);
  // A string, an array, a number, null: none of them is a document, and there
  // is nothing in them worth trying to salvage field by field.
  if (!isObject(raw)) return root;

  const user = isObject(raw.user) ? raw.user : {};
  root.user = {
    id: str(user.id, '').trim() || root.user.id,
    createdAt: stamp(user.createdAt, root.user.createdAt),
    onboarded: bool(user.onboarded, false),
    demo: bool(user.demo, false),
  };

  root.profile = normalizeProfile(raw.profile, now);
  root.items = normalizeItems(raw.items, now);
  root.days = normalizeDays(raw.days, root.profile, root.items);
  root.records = normalizeRecords(raw.records);
  root.learning = normalizeLearning(raw.learning);
  root.feedback = normalizeFeedback(raw.feedback);
  root.chat = normalizeChat(raw.chat);

  const settings = isObject(raw.settings) ? raw.settings : {};
  root.settings = {
    firstRun: bool(settings.firstRun, !root.user.onboarded),
    lastSeenDate: keyOr(settings.lastSeenDate, null),
  };

  const ui = isObject(raw.ui) ? raw.ui : {};
  root.ui = {
    // Any string, per §4.1 — the shell owns the list of destinations and adding
    // one there should not need a change here. A blank one falls back to the
    // home view rather than mounting nothing.
    view: str(ui.view, '').trim() || root.ui.view,
    historyRange: oneOf(HISTORY_RANGES, intOr(ui.historyRange, 7, 365, 7), 7),
    scheduleMode: oneOf(SCHEDULE_MODES, ui.scheduleMode, 'day'),
    insightsMode: oneOf(INSIGHTS_MODES, ui.insightsMode, 'insights'),
    /*
     * Which day the app is looking at. Empty means "decide from the clock",
     * which is the default and the right answer almost always: before the
     * evening the useful day is today, after it, tomorrow. The other two values
     * are an explicit choice the user made in the header, and 'other' is any
     * date they navigated to from the schedule.
     */
    focus: oneOf(FOCUS_MODES, ui.focus, ''),
    focusDate: keyOr(ui.focusDate, null),
  };

  // The version is stamped, not carried: a Root returned from here is a v1
  // document by definition. Deciding what to do about a stored version that is
  // not 1 happens in migrate.js, before this function is ever reached.
  root.schemaVersion = 1;
  return root;
}
