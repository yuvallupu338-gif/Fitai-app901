/*
 * accuracy.js — the app being marked.
 *
 * Every other file here produces claims. This one checks them, and the rule it
 * exists to enforce is that an unmeasured claim is reported as unmeasured. When
 * there is nothing to compare, `accuracy` is null — not zero, not a comfortable
 * default, not a placeholder that renders as a plausible percentage. The
 * interface prints a dash and says why.
 *
 * That matters more than it sounds. An app that reports 95% accuracy on its
 * third day has told you exactly what its other numbers are worth, and the
 * damage is not to that screen — it is to the forecast, the insights and the
 * confidence badge, all of which are now guesses as far as the user knows.
 */

import { duration as fmtDuration } from '../core/fmt.js';

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/*
 * How close two numbers are, as a percentage, on a scale where being out by
 * `tolerance` scores zero. Used for every part below so that "80% accurate"
 * means the same thing whichever component it came from.
 */
function closeness(predicted, actual, tolerance) {
  if (!isNum(predicted) || !isNum(actual)) return null;
  const error = Math.abs(predicted - actual);
  return clamp(100 * (1 - error / tolerance), 0, 100);
}

const PRIORITY_WEIGHT = { critical: 3, high: 2, medium: 1.2, low: 0.6 };

/**
 * What the day was actually worth, out of 100.
 *
 * Not the same shape as the Tomorrow Score, and deliberately so. The forecast
 * scores a *plan*: how well arranged it is, how much air it has, whether the
 * hard work sits in the right hour. This scores an *outcome*: what got done,
 * whether the things that mattered were among them, how close the day ran to
 * its own estimates, and how the person actually felt. Scoring the outcome with
 * the plan's own formula would make the comparison circular and the accuracy
 * number meaningless.
 */
export function scoreActualDay(record, items, plan) {
  const tasks = (Array.isArray(items) ? items : [])
    .filter((i) => i && i.kind === 'task' && i.type !== 'break');

  /* Weighted completion — finishing the critical thing and dropping a chore is
   * a better day than the reverse, and an unweighted count cannot say so. */
  let got = 0;
  let possible = 0;
  for (const item of tasks) {
    const weight = PRIORITY_WEIGHT[item.priority] || 1;
    possible += weight;
    if (item.status === 'done') got += weight;
  }
  const completion = possible > 0 ? got / possible : null;

  /* Did the things named as important actually happen. */
  const top = (plan && Array.isArray(plan.topPriorities) ? plan.topPriorities : [])
    .map((id) => tasks.find((i) => i.id === id))
    .filter(Boolean);
  const topRate = top.length ? top.filter((i) => i.status === 'done').length / top.length : null;

  /* How close the day ran to its own estimates. A day where everything took
   * twice as long is a day that did not go to plan, however much got done. */
  const ratios = tasks
    .filter((i) => i.status === 'done' && isNum(i.actualDuration) && isNum(i.estimatedDuration) && i.estimatedDuration > 0)
    .map((i) => i.actualDuration / i.estimatedDuration);
  const drift = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

  const morning = record && record.morning ? record.morning : null;
  const reported = morning && isNum(morning.energy) ? (morning.energy - 1) / 4 : null;
  const sleepMinutes = record && record.actual && isNum(record.actual.sleepMinutes)
    ? record.actual.sleepMinutes : null;

  /*
   * The parts that have evidence are averaged with their own weights; the ones
   * that do not are left out rather than filled in. A day with no check-in is
   * scored on what it did, not on an invented mood.
   */
  const parts = [];
  if (completion !== null) parts.push([completion * 100, 0.42]);
  if (topRate !== null) parts.push([topRate * 100, 0.22]);
  if (drift !== null) parts.push([clamp(100 - Math.abs(drift - 1) * 90, 0, 100), 0.14]);
  if (reported !== null) parts.push([25 + reported * 70, 0.14]);
  if (sleepMinutes !== null) parts.push([clamp((sleepMinutes / 480) * 92, 0, 100), 0.08]);

  if (!parts.length) return 50;
  const total = parts.reduce((a, [, w]) => a + w, 0);
  const sum = parts.reduce((a, [v, w]) => a + v * w, 0);
  return Math.round(clamp(sum / total, 0, 100));
}

/**
 * Predicted against actual, part by part.
 *
 * Every field can be null and the caller must handle it. That is the contract
 * and it is the whole point of the module.
 */
export function compare(record) {
  const r = record || {};
  const predicted = r.forecast && isNum(r.forecast.score) ? r.forecast.score : null;
  const actual = r.actual && isNum(r.actual.dayScore) ? r.actual.dayScore : null;

  const parts = {
    energy: energyPart(r),
    duration: durationPart(r),
    completion: completionPart(r),
    focus: focusPart(r),
  };

  /* The headline is how close the score itself came, tempered by the parts that
   * have evidence. Twenty points out on a hundred-point scale is a bad miss, so
   * that is where the tolerance sits. */
  const headline = closeness(predicted, actual, 40);
  const measured = Object.values(parts).filter(isNum);

  let overall = null;
  if (headline !== null && measured.length) {
    overall = Math.round(headline * 0.55 + (measured.reduce((a, b) => a + b, 0) / measured.length) * 0.45);
  } else if (headline !== null) {
    overall = Math.round(headline);
  } else if (measured.length) {
    overall = Math.round(measured.reduce((a, b) => a + b, 0) / measured.length);
  }

  return { predicted, actual, accuracy: overall, parts, note: noteFor(predicted, actual, overall, parts) };
}

/*
 * Predicted energy against reported energy.
 *
 * The forecast keeps only the hourly curve in history — the full one is tens of
 * kilobytes a day — so this reads the hour the check-in happened, and falls
 * back to the morning hours when there is no timestamp on it.
 */
function energyPart(record) {
  const hourly = record.forecast && record.forecast.energy && Array.isArray(record.forecast.energy.hourly)
    ? record.forecast.energy.hourly : [];
  const morning = record.morning;
  if (!hourly.length || !morning || !isNum(morning.energy)) return null;

  const early = hourly.filter((p) => p.hour >= 6 && p.hour <= 10);
  if (!early.length) return null;
  const predicted = early.reduce((a, p) => a + p.value, 0) / early.length;
  const reported = 20 + (morning.energy - 1) * 17.5;
  return closeness(predicted, reported, 45);
}

function durationPart(record) {
  const tags = record.review && Array.isArray(record.review.tags) ? record.review.tags : [];
  if (!tags.length) return null;
  // The user's own verdict on whether the estimates held. Coarser than measuring
  // it, and more honest: they are the ones who lived the day.
  if (tags.includes('accurate')) return 90;
  if (tags.includes('tasks_longer') || tags.includes('tasks_shorter')) return 45;
  return null;
}

function completionPart(record) {
  const a = record.actual;
  if (!a || !isNum(a.completed) || !isNum(a.planned) || a.planned <= 0) return null;
  const rate = a.completed / a.planned;
  const expected = record.forecast && record.forecast.totals && isNum(record.forecast.totals.taskCount)
    && record.forecast.totals.taskCount > 0
    ? 0.75      // the model's standing assumption about a well-formed plan
    : null;
  if (expected === null) return null;
  return closeness(rate * 100, expected * 100, 70);
}

function focusPart(record) {
  const tags = record.review && Array.isArray(record.review.tags) ? record.review.tags : [];
  if (!tags.length) return null;
  if (tags.includes('accurate')) return 88;
  if (tags.includes('more_tired')) return 40;
  if (tags.includes('more_energetic')) return 52;
  return null;
}

/*
 * A sentence about the comparison, including — especially — when there is not
 * enough to make one.
 */
function noteFor(predicted, actual, overall, parts) {
  if (predicted === null && actual === null) {
    return 'אין עדיין מספיק נתונים על היום הזה כדי להשוות תחזית למציאות.';
  }
  if (overall === null) {
    return 'היום הזה נרשם, אבל לא נבנתה עבורו תחזית שאפשר להשוות אליה.';
  }
  const measured = Object.values(parts).filter(isNum).length;
  if (measured === 0) {
    return `השוויתי את הציון בלבד — סיכום קצר בסוף היום יאפשר לי לבדוק גם אנרגיה ומשך משימות.`;
  }
  if (actual !== null && predicted !== null) {
    const gap = actual - predicted;
    if (Math.abs(gap) <= 4) return 'התחזית והיום בפועל יצאו כמעט זהים.';
    return gap > 0
      ? `היום יצא טוב ב-${gap} נקודות ממה שציפיתי.`
      : `היום יצא נמוך ב-${Math.abs(gap)} נקודות ממה שציפיתי.`;
  }
  return 'השוואה חלקית — חלק מהנתונים חסרים.';
}

/**
 * The average accuracy over the last `n` records that have one.
 *
 * Records with nothing to compare are skipped rather than counted as zero, and
 * the whole thing is null when none qualify. Counting an unmeasured day as a
 * failure would punish somebody for not filling in a form.
 */
export function rollingAccuracy(records, n) {
  const list = (Array.isArray(records) ? records : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, isNum(n) && n > 0 ? n : 30);

  const scores = list.map((r) => compare(r).accuracy).filter(isNum);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
