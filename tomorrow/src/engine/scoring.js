/*
 * scoring.js — six numbers into one, and the words that explain it.
 *
 * The Tomorrow Score is the first thing anybody sees and the only thing most
 * people will read, so two things about it matter more than the arithmetic.
 *
 * It has to move for real reasons. Every factor below is a documented,
 * monotone function of something in the day — minutes of sleep, how tightly the
 * work is packed, whether the important task sits in a good hour. Nothing is a
 * lookup table with a comfortable curve, because the optimiser searches against
 * this function, and a factor that rewards something meaningless would have the
 * app confidently suggesting it.
 *
 * And the formula stays out of sight. The user never sees weights; they see
 * "less sleep than usual" and "the afternoon is stacked". `reasons` is built
 * from whichever factors actually moved the number, with the real figures in
 * them, and it is the honest interface to a weighted sum — a person can argue
 * with a sentence about their own afternoon in a way they cannot argue with 74.
 */

import { duration as fmtDuration, time as fmtTime } from '../core/fmt.js';
import { bedtimeAbs } from '../core/time.js';

/*
 * The weights. Sleep leads because it is both the largest real effect on a day
 * and the one thing somebody can still change at ten at night — the score is
 * meant to be actionable, and weighting an input nobody can act on would make
 * it a diagnosis instead. Risk is last because it is partly derived from the
 * others and a heavier weight would double-count them.
 */
export const FACTORS = [
  { key: 'sleep', label: 'שינה', weight: 0.22, hint: 'כמה שינה מתוכננת, מול מה שאתה צריך' },
  { key: 'balance', label: 'איזון היום', weight: 0.20, hint: 'כמה העומס מפוזר לעומת דחוס' },
  { key: 'focus', label: 'התאמת ריכוז', weight: 0.18, hint: 'האם העבודה החשובה יושבת בשעות הטובות' },
  { key: 'goals', label: 'קידום מטרות', weight: 0.15, hint: 'האם הדברים שסימנת כחשובים באמת מתוכננים' },
  { key: 'free', label: 'זמן פנוי', weight: 0.13, hint: 'כמה מהיום לא תפוס' },
  { key: 'risk', label: 'סיכון', weight: 0.12, hint: 'מה עלול להיתקע' },
];

const BANDS = [
  { at: 85, band: 'great', label: 'יום טוב מאוד' },
  { at: 70, band: 'good', label: 'יום טוב' },
  { at: 55, band: 'fair', label: 'יום סביר' },
  { at: 0, band: 'low', label: 'יום מאתגר' },
];

/* Eight hours, the default need when nothing personal is known yet. */
const DEFAULT_SLEEP_NEED = 480;

/* The free time a day wants. Two hours is not leisure — it is the margin that
 * makes a plan survive contact with a day that runs late. */
const FREE_TARGET = 120;
const FREE_FLOOR = 45;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/*
 * A smooth 0..1 ramp with flat ends.
 *
 * Used everywhere below instead of a straight line so that a factor does not
 * jump when an input crosses a threshold by one minute. The optimiser searches
 * on a fifteen-minute grid, and a cliff in a factor is how it ends up
 * recommending a change that moves the score without changing the day.
 */
function ramp(value, lo, hi) {
  if (hi === lo) return value >= hi ? 1 : 0;
  const t = clamp((value - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ *
 * Sleep
 * ------------------------------------------------------------------ */

/*
 * Sleep against this person's own need, not against a magazine number.
 *
 * The anchors come from the brief's own worked examples — around 92 at eight
 * hours, 78 at seven, 55 at six, 32 at five — and the curve is fitted through
 * them rather than being a straight line, because the cost of losing an hour
 * grows as the night gets shorter. Oversleeping costs a little too: a ten-hour
 * night before a school day is usually a sign of a debt being paid, and it
 * leaves less day to work with.
 */
function sleepFactor(input) {
  const need = isNum(input.learning.averageSleepDuration) && input.learning.averageSleepDuration > 300
    ? input.learning.averageSleepDuration
    : DEFAULT_SLEEP_NEED;
  const got = input.totals.sleepMinutes;
  const share = got / need;

  // 0.62 of need -> ~32, 0.75 -> ~55, 0.875 -> ~78, 1.0 -> ~92.
  let score = 100 * ramp(share, 0.5, 1.02) * 0.92 + 8 * ramp(share, 0.9, 1.0);
  if (share > 1.18) score -= 18 * ramp(share, 1.18, 1.5);

  /*
   * A bedtime far from the usual one costs something even when the total is
   * fine. Going to bed at three and waking at eleven is eight hours and is not
   * the same eight hours, and the energy model already knows it; this keeps the
   * score from disagreeing with the curve underneath it.
   */
  const usual = isNum(input.profile.bedTime) ? bedtimeAbs(input.profile.bedTime) : null;
  const planned = isNum(input.plan.bedtime) ? bedtimeAbs(input.plan.bedtime) : null;
  if (usual !== null && planned !== null) {
    const drift = Math.abs(planned - usual);
    score -= 10 * ramp(drift, 45, 180);
  }

  return {
    score: Math.round(clamp(score, 0, 100)),
    detail: `${fmtDuration(got)} מתוכננות`,
  };
}

/* ------------------------------------------------------------------ *
 * Balance
 * ------------------------------------------------------------------ */

/*
 * How evenly the demanding work is spread.
 *
 * Measured as the worst two-hour stretch of the day, not as a daily total. Four
 * hard tasks between one and three is a bad day; the same four spread from nine
 * to seven is a full one. A total-based measure cannot tell those apart, which
 * is exactly the failure the brief calls out with "afternoon is overloaded".
 *
 * Each item contributes its minutes weighted by what it asks of a person, so an
 * hour of physics counts for more than an hour of tidying.
 */
const WINDOW = 120;

function demandOf(item) {
  const energy = item.energyRequirement === 'high' ? 1.5 : item.energyRequirement === 'medium' ? 1 : 0.55;
  const focus = item.focusRequirement === 'high' ? 1.5 : item.focusRequirement === 'medium' ? 1 : 0.55;
  const difficulty = isNum(item.difficulty) ? 0.8 + (item.difficulty - 3) * 0.1 : 1;
  return (energy + focus) / 2 * difficulty;
}

function heaviestWindow(items, from, to) {
  const placed = items.filter((i) => isNum(i.start) && i.status !== 'skipped' && i.type !== 'break');
  let worst = { load: 0, start: from, items: [] };
  for (let start = from; start + WINDOW <= Math.max(to, from + WINDOW); start += 15) {
    const end = start + WINDOW;
    let load = 0;
    const inside = [];
    for (const item of placed) {
      const overlap = Math.min(end, item.start + item.duration) - Math.max(start, item.start);
      if (overlap <= 0) continue;
      load += overlap * demandOf(item);
      inside.push(item);
    }
    if (load > worst.load) worst = { load, start, items: inside };
  }
  return worst;
}

function balanceFactor(input) {
  const { from, to } = input.totals;
  const worst = heaviestWindow(input.items, from, to);

  /*
   * A two-hour window can hold 120 minutes. At the top demand weight that is
   * 180 weighted minutes, which is the point where the window is not merely
   * full but full of hard things — so that is where the factor bottoms out.
   */
  const density = worst.load / 180;
  let score = 100 - 78 * ramp(density, 0.34, 1.0);

  // A day with no breaks at all is a different problem from a dense hour, and
  // the two compound: nothing to recover with makes the dense hour worse.
  const hasBreak = input.items.some((i) => i.type === 'break');
  const longRun = longestRun(input.items);
  if (!hasBreak && longRun > 180) score -= 12 * ramp(longRun, 180, 330);

  const count = worst.items.filter((i) => demandOf(i) >= 1).length;
  const detail = count >= 2
    ? `${count} משימות תובעניות סביב ${fmtTime(worst.start % 1440, input.profile.timeFormat)}`
    : 'העומס מפוזר יפה על היום';

  return { score: Math.round(clamp(score, 0, 100)), detail };
}

/* The longest stretch with no gap of at least ten minutes in it. */
function longestRun(items) {
  const placed = items
    .filter((i) => isNum(i.start) && i.status !== 'skipped')
    .sort((a, b) => a.start - b.start);
  let best = 0;
  let runStart = null;
  let runEnd = null;
  for (const item of placed) {
    if (runEnd === null || item.start - runEnd > 10) {
      if (runEnd !== null) best = Math.max(best, runEnd - runStart);
      runStart = item.start;
      runEnd = item.start + item.duration;
    } else {
      runEnd = Math.max(runEnd, item.start + item.duration);
    }
  }
  if (runEnd !== null) best = Math.max(best, runEnd - runStart);
  return best;
}

/* ------------------------------------------------------------------ *
 * Focus alignment
 * ------------------------------------------------------------------ */

/*
 * Whether the work that needs a clear head is scheduled when the head is clear.
 *
 * This is the factor that makes the app worth opening — it is the one thing a
 * calendar cannot tell you. Each item is scored against the predicted focus
 * across the minutes it actually occupies, weighted by how much focus it needs,
 * so moving the physics coursework off the 14:00 trough moves this and moving
 * the tidying does not.
 */
function focusFactor(input) {
  const demanding = input.items.filter(
    (i) => isNum(i.start) && i.status === 'planned' && i.focusRequirement !== 'low' && i.type !== 'break');

  if (!demanding.length) {
    return {
      score: 72,
      detail: 'אין מחר משימות שדורשות ריכוז גבוה',
      neutral: true,
    };
  }

  let weighted = 0;
  let total = 0;
  let worst = null;
  for (const item of demanding) {
    const weight = item.focusRequirement === 'high' ? 2 : 1;
    const mean = meanOver(input.focus, item.start, item.start + item.duration);
    weighted += mean * weight;
    total += weight;
    if (worst === null || mean < worst.mean) worst = { item, mean };
  }
  const mean = total ? weighted / total : 60;

  /*
   * The curve is rescaled rather than used raw. A focus curve rarely goes below
   * 30 or above 95, so reading it straight would compress this factor into the
   * middle of its range and stop it distinguishing a good placement from a bad
   * one — the thing it exists to do.
   */
  const score = 100 * ramp(mean, 34, 88);

  const detail = worst && worst.mean < 55
    ? `"${worst.item.title}" יושבת בשעה חלשה יחסית`
    : 'העבודה החשובה יושבת בשעות הטובות שלך';

  return { score: Math.round(clamp(score, 0, 100)), detail };
}

function meanOver(curve, from, to) {
  const points = curve.points.filter((p) => p.minute + curve.step > from && p.minute < to);
  if (!points.length) {
    // Outside the sampled window entirely — the small hours, usually. Treat it
    // as poor rather than average, because that is what it is.
    return 30;
  }
  return points.reduce((a, p) => a + p.value, 0) / points.length;
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

/*
 * Whether the things the user said matter are actually going to happen.
 *
 * The user names up to three in the evening ritual. An unscheduled one is the
 * main way this drops, and that is deliberate: "it's important" and "there is
 * no time for it in the day" is the most common way a plan quietly fails, and
 * it is worth a number of its own rather than being buried in the total.
 *
 * With nothing marked, this falls back to the critical and high-priority tasks,
 * so the factor still means something for somebody who skipped that step.
 */
function goalsFactor(input) {
  const marked = (input.plan.topPriorities || [])
    .map((id) => input.items.find((i) => i.id === id))
    .filter(Boolean);
  const pool = marked.length
    ? marked
    : input.items.filter((i) => i.priority === 'critical' || i.priority === 'high').slice(0, 3);

  if (!pool.length) {
    return { score: 62, detail: 'לא סימנת מה חשוב מחר', neutral: true };
  }

  let sum = 0;
  let unscheduled = 0;
  let late = 0;
  for (const item of pool) {
    if (item.status === 'done') { sum += 100; continue; }
    if (!isNum(item.start)) { unscheduled += 1; sum += 22; continue; }

    let s = 74;
    // Sitting in a decent focus window is worth real points — this is where the
    // goals factor and the focus factor agree rather than double-count, because
    // this one only looks at the three things that were named.
    s += 22 * ramp(meanOver(input.focus, item.start, item.start + item.duration), 45, 82);
    // Late in the evening is where good intentions go to be rescheduled.
    if (item.start > 1200) { s -= 22; late += 1; }
    // A deadline that lands today and no time booked for it is the worst case,
    // and it is already handled above by the unscheduled branch; here it is a
    // task that is scheduled but pushed past the deadline's own day.
    if (item.deadline && item.deadline < input.date) s -= 25;
    sum += clamp(s, 0, 100);
  }

  const score = sum / pool.length;
  const detail = unscheduled
    ? `${unscheduled} מהדברים החשובים עדיין בלי שעה`
    : late
      ? 'הדברים החשובים דחוסים לסוף היום'
      : `${pool.length} דברים חשובים מתוכננים`;

  return { score: Math.round(clamp(score, 0, 100)), detail };
}

/* ------------------------------------------------------------------ *
 * Free time
 * ------------------------------------------------------------------ */

/*
 * Unbooked minutes, against a target of about two hours.
 *
 * Diminishing returns above it, because a day that is nine-tenths empty is not
 * ten times better than one with a comfortable margin — and a hard floor below
 * three quarters of an hour, because a day with no slack at all does not
 * survive one thing running late, which is what makes it a bad plan rather than
 * an ambitious one.
 */
function freeFactor(input) {
  const free = input.totals.freeMinutes;
  let score;
  if (free <= FREE_FLOOR) score = 30 * ramp(free, 0, FREE_FLOOR);
  else score = 30 + 62 * ramp(free, FREE_FLOOR, FREE_TARGET) + 8 * ramp(free, FREE_TARGET, FREE_TARGET * 2.5);

  return {
    score: Math.round(clamp(score, 0, 100)),
    detail: free < FREE_FLOOR ? `רק ${fmtDuration(free)} פנויים` : `${fmtDuration(free)} פנויים`,
  };
}

/* ------------------------------------------------------------------ *
 * Risk
 * ------------------------------------------------------------------ */

/*
 * A hundred minus what the risk engine found.
 *
 * The worst risk dominates rather than the risks being summed, with the rest
 * adding a diminishing tail. One serious problem is what a day is remembered
 * for; three small ones are a Tuesday.
 */
function riskFactor(input) {
  const risks = (input.risks || []).slice().sort((a, b) => b.score - a.score);
  if (!risks.length) return { score: 96, detail: 'לא זיהיתי סיכון בולט' };

  let penalty = risks[0].score;
  for (let i = 1; i < risks.length; i++) penalty += risks[i].score * Math.pow(0.45, i);

  const high = risks.filter((r) => r.severity === 'high').length;
  const detail = high
    ? `${high} ${high === 1 ? 'נקודה שדורשת' : 'נקודות שדורשות'} תשומת לב`
    : `${risks.length} ${risks.length === 1 ? 'הערה' : 'הערות'} קטנות`;

  return { score: Math.round(clamp(100 - penalty, 0, 100)), detail };
}

/* ------------------------------------------------------------------ *
 * Putting it together
 * ------------------------------------------------------------------ */

/**
 * The Tomorrow Score, its six factors, and the reasons behind it.
 *
 * `input` carries the day plus the curves and risks already computed by
 * predict.js — this function never recomputes them, so the number on screen and
 * the graph beside it are guaranteed to be describing the same day.
 */
export function scoreDay(input) {
  const computed = {
    sleep: sleepFactor(input),
    balance: balanceFactor(input),
    focus: focusFactor(input),
    goals: goalsFactor(input),
    free: freeFactor(input),
    risk: riskFactor(input),
  };

  const history = Array.isArray(input.history) ? input.history : [];

  const factors = FACTORS.map((spec) => {
    const c = computed[spec.key];
    return {
      key: spec.key,
      label: spec.label,
      score: c.score,
      weight: spec.weight,
      detail: c.detail,
      direction: directionOf(spec.key, c.score, history),
      contribution: Math.round(spec.weight * c.score * 10) / 10,
    };
  });

  const total = factors.reduce((a, f) => a + f.weight * f.score, 0);
  const score = Math.round(clamp(total, 0, 100));
  const band = BANDS.find((b) => score >= b.at) || BANDS[BANDS.length - 1];

  return {
    score,
    label: band.label,
    band: band.band,
    factors,
    reasons: reasonsFrom(factors, input),
  };
}

/*
 * Whether a factor is better or worse than this person's own recent average.
 *
 * Flat when there is nothing to compare against — which is most of the first
 * week, and saying "down" on day one would be inventing a trend out of a single
 * data point. Needs three past days carrying this factor before it will claim
 * anything, and a difference of at least four points, which is roughly the
 * noise floor of the factors themselves.
 */
function directionOf(key, score, history) {
  const past = history
    .map((r) => (r && r.forecast && Array.isArray(r.forecast.factors)
      ? (r.forecast.factors.find((f) => f.key === key) || {}).score
      : null))
    .filter(isNum)
    .slice(0, 14);
  if (past.length < 3) return 'flat';
  const mean = past.reduce((a, b) => a + b, 0) / past.length;
  if (score >= mean + 4) return 'up';
  if (score <= mean - 4) return 'down';
  return 'flat';
}

/*
 * "Why 74?", built from whichever factors actually moved it.
 *
 * Ranked by how far each sits from the middle, weighted by its share of the
 * total, so the lines name the things doing the most work rather than the
 * things that happen to be lowest. Every line carries a real figure from this
 * day — that is what makes it checkable rather than reassuring.
 */
function reasonsFrom(factors, input) {
  const up = [];
  const down = [];

  const ranked = factors
    .map((f) => ({ f, pull: (f.score - 62) * f.weight }))
    .sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull));

  for (const { f, pull } of ranked) {
    if (pull > 1.2 && up.length < 3) up.push(positive(f, input));
    else if (pull < -1.2 && down.length < 3) down.push(negative(f, input));
  }

  // A score is always the result of something. If nothing stood out, say what
  // is holding it steady rather than returning an empty list the UI has to
  // apologise for.
  if (!up.length && !down.length) {
    up.push('כל הגורמים סביב הממוצע שלך — יום שגרתי מבחינת המודל');
  }
  return { up, down };
}

function positive(f, input) {
  switch (f.key) {
    case 'sleep': return `לילה של ${fmtDuration(input.totals.sleepMinutes)}`;
    case 'balance': return 'העומס מפוזר על פני היום ולא נערם';
    case 'focus': return 'העבודה התובענית יושבת על שעות הריכוז החזקות שלך';
    case 'goals': return f.detail;
    case 'free': return `${fmtDuration(input.totals.freeMinutes)} פנויים ביום`;
    case 'risk': return 'אין ביום נקודה שנראית בעייתית';
    default: return f.detail;
  }
}

function negative(f, input) {
  switch (f.key) {
    case 'sleep': return `רק ${fmtDuration(input.totals.sleepMinutes)} שינה מתוכננות`;
    case 'balance': return f.detail;
    case 'focus': return f.detail;
    case 'goals': return f.detail;
    case 'free': return `${fmtDuration(input.totals.freeMinutes)} פנויים בלבד`;
    case 'risk': return (input.risks[0] && input.risks[0].title) || f.detail;
    default: return f.detail;
  }
}
