/*
 * confidence.js — how much any of this is worth.
 *
 * The number this file produces is what separates a forecast from a horoscope,
 * and the rule it exists to enforce is a single sentence from the brief:
 * **confidence must not rise on day count alone.** An app that grows more sure
 * of itself simply because time has passed is describing its own age, not its
 * knowledge of a person. Twenty contradictory days are less evidence about
 * somebody than seven consistent ones, and the arithmetic below is arranged so
 * that comes out true — consistency carries the largest single weight, and a
 * person whose days do not repeat cannot reach a high score however long they
 * stay.
 *
 * Five parts, each answering a different way of being wrong:
 *
 *   history       is there enough of it
 *   consistency   does it repeat, or is it noise
 *   recency       is it still about who this person is now
 *   accuracy      when this model has predicted before, was it right
 *   completeness  how much of *this* day is actually known
 *
 * The last one is the one people forget. A model with a year of perfect history
 * still cannot say much about a tomorrow nobody has told it about.
 */

import { diffDays, isValidKey } from '../core/time.js';

/*
 * Weights. Consistency is the largest by a clear margin, and that margin is the
 * rule being enforced rather than a preference: at 0.34 against history's 0.18,
 * twenty contradictory days score around 52 while twenty consistent ones score
 * around 80, so quantity alone cannot buy its way out of the "low" band. An
 * earlier split of 0.30/0.22 put the inconsistent case at 55 — nominally
 * "medium", which is exactly the claim the brief says must not be reachable by
 * accumulating days. Completeness is
 * smallest because it is the one the user can fix in thirty seconds, and it
 * would be perverse for the app to report low confidence in a forecast when the
 * remedy is one more tap.
 */
const WEIGHTS = {
  consistency: 0.34,
  history: 0.18,
  accuracy: 0.20,
  recency: 0.15,
  completeness: 0.13,
};

const LEVELS = [
  { at: 75, level: 'high' },
  { at: 55, level: 'medium' },
  { at: 30, level: 'low' },
];

/* Below either of these the app says out loud that it is still learning. */
const LEARNING_BELOW = 45;
const LEARNING_SAMPLES = 3;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/*
 * How much history there is, on a curve rather than a line.
 *
 * n/(n+8) means the first week buys a great deal and the sixth week buys very
 * little, which is the right shape: the difference between two days and nine is
 * enormous, and the difference between fifty days and fifty-seven is nothing.
 * It also cannot reach 100, because no amount of history makes a model of a
 * person certain.
 */
function historyPart(learning) {
  const n = (learning.samples && isNum(learning.samples.days)) ? learning.samples.days : 0;
  return clamp((n / (n + 8)) * 100, 0, 92);
}

function consistencyPart(learning) {
  return isNum(learning.consistency) ? clamp(learning.consistency * 100, 0, 100) : 0;
}

/*
 * Whether the evidence is still current.
 *
 * Full marks for anything up to about four days old, then a slide to nothing
 * over a month. Somebody who used the app for a fortnight in March and came back
 * in June has a profile describing a person who may no longer exist, and it
 * would be worse than useless to present June's forecast with March's certainty.
 */
function recencyPart(records, date) {
  if (!records.length || !isValidKey(date)) return 0;
  let newest = null;
  for (const r of records) {
    if (!r || !isValidKey(r.date)) continue;
    if (newest === null || r.date > newest) newest = r.date;
  }
  if (newest === null) return 0;
  const age = Math.max(0, diffDays(date, newest));
  if (age <= 4) return 100;
  if (age >= 32) return 0;
  return clamp(100 * (1 - (age - 4) / 28), 0, 100);
}

/*
 * How the model has actually done, when there is anything to check against.
 *
 * Returns null rather than a neutral 50 when no day has been reviewed. That
 * distinction matters: an unmeasured model and a mediocre one are not the same
 * thing, and blending in a made-up 50 would let a brand new profile inherit a
 * middling track record it has not earned. When it is null the weight is
 * redistributed across the parts that do have evidence.
 */
function accuracyPart(records) {
  const scored = records.filter((r) => r && r.accuracy && isNum(r.accuracy.overall));
  if (scored.length < 2) return null;
  // Recent performance counts more, same as everywhere else in the engine.
  const sorted = scored.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = Math.pow(0.5, i / 7);
    sum += sorted[i].accuracy.overall * w;
    weight += w;
  }
  return clamp(sum / weight, 0, 100);
}

/*
 * How much of this particular day the app has been told about.
 *
 * Everything here is something the user could supply and has not. It is scored
 * separately from the rest precisely so the interface can say "I am unsure
 * about tomorrow because I do not know when you are going to sleep" instead of
 * a vague low number.
 */
function completenessPart(ctx) {
  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const plan = ctx.plan || {};
  let score = 0;

  // A day with nothing on it is a day nothing can be said about.
  if (items.length >= 1) score += 22;
  if (items.length >= 3) score += 14;

  // A bedtime is the single most load-bearing input in the whole model.
  if (isNum(plan.nextBedtime)) score += 20;
  if (isNum(plan.wake)) score += 12;

  if (plan.eveningState) score += 14;
  if (Array.isArray(plan.topPriorities) && plan.topPriorities.length) score += 10;
  if (ctx.morning) score += 8;

  return clamp(score, 0, 100);
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

/**
 * How much to trust today's forecast.
 *
 * `ctx` is the forecast input — the profile, the plan, the items and the
 * morning check-in if there is one.
 */
export function assess(learning, history, ctx) {
  const l = learning || {};
  const records = Array.isArray(history) ? history.filter(Boolean) : [];
  const c = ctx || {};

  const parts = {
    history: Math.round(historyPart(l)),
    consistency: Math.round(consistencyPart(l)),
    recency: Math.round(recencyPart(records, c.date)),
    accuracy: accuracyPart(records),
    completeness: Math.round(completenessPart(c)),
  };

  /*
   * Redistribute rather than substitute. When accuracy has no evidence its
   * weight is spread across the parts that do, so a profile is never scored
   * against a number nobody measured — and never quietly rewarded for it either.
   */
  let total = 0;
  let used = 0;
  for (const key of ['consistency', 'history', 'accuracy', 'recency', 'completeness']) {
    const value = parts[key];
    if (value === null) continue;
    total += WEIGHTS[key] * value;
    used += WEIGHTS[key];
  }
  const overall = used > 0 ? Math.round(clamp(total / used, 0, 100)) : 0;

  const samples = (l.samples && isNum(l.samples.days)) ? l.samples.days : 0;
  const learningMode = overall < LEARNING_BELOW || samples < LEARNING_SAMPLES;
  const level = learningMode ? 'learning'
    : (LEVELS.find((x) => overall >= x.at) || { level: 'low' }).level;

  return {
    overall,
    level,
    parts: {
      history: parts.history,
      consistency: parts.consistency,
      recency: parts.recency,
      accuracy: parts.accuracy === null ? null : Math.round(parts.accuracy),
      completeness: parts.completeness,
    },
    reasons: reasonsFor(parts, samples, learningMode, c),
    learningMode,
  };
}

/*
 * Why the number is where it is, naming the weakest link first.
 *
 * The point is to be actionable. "Still learning" tells somebody nothing;
 * "your days vary a lot, so I am careful about predicting them" tells them what
 * the app is actually doing and lets them disagree with it.
 */
function reasonsFor(parts, samples, learningMode, ctx) {
  const out = [];

  if (samples < LEARNING_SAMPLES) {
    out.push(samples === 0
      ? 'עוד אין לי אף יום שלם שאפשר ללמוד ממנו, אז התחזית הזו מבוססת על מודל כללי.'
      : `יש לי ${samples} ימים בלבד — עוד מוקדם לדבר על דפוסים אישיים.`);
  }

  const ranked = [
    ['consistency', parts.consistency, 'הימים שלך משתנים הרבה אחד מהשני, אז אני זהיר יותר בתחזית.'],
    ['recency', parts.recency, 'המידע שיש לי כבר לא ממש טרי, וייתכן שהשגרה שלך השתנתה מאז.'],
    ['completeness', parts.completeness, 'חסר לי מידע על היום הזה עצמו — ככל שתמלא יותר, התחזית מתחדדת.'],
    ['history', parts.history, 'עוד לא אספתי מספיק ימים כדי להיות בטוח.'],
    ['accuracy', parts.accuracy, 'התחזיות הקודמות שלי לא היו מדויקות במיוחד, אז אני מוריד את רמת הביטחון.'],
  ].filter((r) => r[1] !== null && r[1] < 60).sort((a, b) => a[1] - b[1]);

  for (const [, , text] of ranked.slice(0, 2)) out.push(text);

  if (!out.length) {
    out.push('יש לי מספיק ימים עקביים כדי לתת לתחזית הזו משקל אמיתי.');
  }

  // A missing bedtime is worth naming on its own: it is one tap and it moves
  // the whole model more than anything else the user could tell it.
  if (ctx.plan && !ctx.plan.eveningState) {
    out.push('לא סיפרת לי איך אתה מרגיש הערב, וזה אחד הדברים שהכי עוזרים לי לכייל את מחר.');
  }

  return out;
}
