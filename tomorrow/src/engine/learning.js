/*
 * learning.js — the part that makes this more than a form.
 *
 * Everything else in the engine models a day. This models the person, from the
 * only evidence there is: what they planned, what they actually did, how long
 * it really took, and how they said they felt. Three ideas run through it.
 *
 * Recent evidence counts for more. A habit that changed last week has to beat
 * one from last month, so every average here is weighted with a half-life of
 * about seven observations rather than being a flat mean over everything ever
 * recorded. A flat mean is why apps like this feel stuck: six weeks in, nothing
 * you do this week can move a number any more.
 *
 * Consistency is separate from quantity. Twenty days of wildly different
 * behaviour do not make a model of a person; they make a wide distribution. So
 * the blend between the default model and the personal one is scaled by how
 * repeatable the observations actually are, and confidence.js leans on the same
 * measure. This is the honest reading of "the system should get more personal
 * over time" — it gets more personal as it earns the right to.
 *
 * A field with no observations stays null. Null means "no signal", never zero.
 * An average wake time of 00:00 for somebody who has never recorded one is the
 * kind of number that ends up on screen.
 *
 * Pure: no clock, no randomness, no DOM, and nothing here writes to its
 * arguments.
 */

import { dayOfWeek } from '../core/time.js';

/*
 * How fast old observations stop mattering.
 *
 * Seven is a week of daily use, and it is chosen for what it does at the edges:
 * with a half-life of 7, the most recent observation carries about 9% of the
 * total weight, the last week carries roughly half, and anything past a month
 * contributes under a tenth. That is fast enough that a genuine change of
 * routine shows up within days, and slow enough that one bad Tuesday does not
 * redraw the model.
 */
const HALF_LIFE = 7;

/* Below this there is not enough to say anything, per contract §11's gates. */
const MIN_SAMPLES = 3;

/* A learned duration ratio is clamped to this band. Outside it the evidence is
 * more likely to be a mis-recorded task than a real habit, and scheduling four
 * times somebody's estimate would make the app useless in one bad week. */
const RATIO_MIN = 0.5;
const RATIO_MAX = 2.5;

/* ------------------------------------------------------------------ *
 * Small tools
 * ------------------------------------------------------------------ */

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * An exponential moving average step.
 *
 * `alpha` is the weight of the new observation. Kept as its own export because
 * three modules want the same smoothing and a second implementation would drift
 * from this one.
 */
export function ema(prev, next, alpha) {
  if (!isNum(prev)) return isNum(next) ? next : null;
  if (!isNum(next)) return prev;
  const a = clamp(isNum(alpha) ? alpha : 0.3, 0, 1);
  return prev * (1 - a) + next * a;
}

/**
 * One weight per observation, newest first, summing to 1.
 *
 * The caller hands observations most-recent-first — which is the order the
 * store returns records in — and gets back weights in the same order, so
 * position 0 is today. Halving every `halfLife` steps is what makes "last week
 * outweighs last month" arithmetic rather than a claim.
 */
export function recencyWeights(n, halfLife) {
  const count = Math.max(0, Math.floor(n));
  if (!count) return [];
  const hl = isNum(halfLife) && halfLife > 0 ? halfLife : HALF_LIFE;
  const raw = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const w = Math.pow(0.5, i / hl);
    raw.push(w);
    total += w;
  }
  return raw.map((w) => w / total);
}

/** A recency-weighted mean over [{ value }], newest first. Null when empty. */
function weightedMean(values) {
  const usable = values.filter(isNum);
  if (!usable.length) return null;
  const w = recencyWeights(usable.length, HALF_LIFE);
  let sum = 0;
  for (let i = 0; i < usable.length; i++) sum += usable[i] * w[i];
  return sum;
}

/*
 * How repeatable a set of observations is, on a 0..1 scale.
 *
 * The coefficient of variation — spread divided by level — rather than raw
 * spread, because the same 40-minute standard deviation means something very
 * different for a bedtime than for a night's length. A CV at or above `wide` is
 * scored 0; a perfectly repeatable series is 1. Fewer than two observations has
 * no spread to measure and returns null rather than a flattering 1.
 */
function repeatability(values, wide) {
  const usable = values.filter(isNum);
  if (usable.length < 2) return null;
  const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
  if (Math.abs(mean) < 1e-9) return null;
  const variance = usable.reduce((a, b) => a + (b - mean) * (b - mean), 0) / usable.length;
  const cv = Math.sqrt(variance) / Math.abs(mean);
  return clamp(1 - cv / (isNum(wide) ? wide : 0.5), 0, 1);
}

/*
 * Pearson correlation over paired observations, or null when there is not
 * enough to say. Used for the sleep/energy and workload/stress relationships,
 * which are the only claims in this file that assert one thing causes another —
 * and which the UI is careful to word as an association.
 */
function correlate(pairs) {
  const usable = pairs.filter((p) => isNum(p[0]) && isNum(p[1]));
  if (usable.length < MIN_SAMPLES + 1) return null;
  const n = usable.length;
  const mx = usable.reduce((a, p) => a + p[0], 0) / n;
  const my = usable.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of usable) {
    num += (x - mx) * (y - my);
    dx += (x - mx) * (x - mx);
    dy += (y - my) * (y - my);
  }
  if (dx < 1e-9 || dy < 1e-9) return null;
  return clamp(num / Math.sqrt(dx * dy), -1, 1);
}

/* ------------------------------------------------------------------ *
 * How much of the personal model to trust
 * ------------------------------------------------------------------ */

/**
 * The share of the forecast that comes from this person rather than the
 * defaults, between 0 and 0.8.
 *
 * The count term is n/(n+9), which gives roughly 10% on day one, 44% after a
 * week and 77% after a month — the shape the brief describes. It is then scaled
 * by 0.6 + 0.4 × consistency, so somebody whose days are all over the place
 * stays nearer the defaults however long they have been using the app. That is
 * deliberate and it is the honest reading of the requirement: the model should
 * become more personal as it learns the person, and it has not learned anybody
 * from twenty contradictory days.
 *
 * The ceiling of 0.8 is not arithmetic shyness. The default model carries the
 * physiology — sleep pressure, the circadian shape — that a few weeks of
 * self-reported energy readings cannot replace, and a person who logs one
 * unusual fortnight should not be able to delete it.
 */
export function personalWeight(learning) {
  const l = learning || {};
  const n = (l.samples && isNum(l.samples.days)) ? l.samples.days : 0;
  if (n <= 0) return 0;
  const base = Math.min(0.8, n / (n + 9));
  const consistency = isNum(l.consistency) ? clamp(l.consistency, 0, 1) : 0;
  return clamp(base * (0.6 + 0.4 * consistency), 0, 0.8);
}

/* ------------------------------------------------------------------ *
 * Duration learning — the headline
 * ------------------------------------------------------------------ */

/**
 * How long this task will really take, as opposed to how long it was estimated
 * to take.
 *
 * The single most useful thing the app measures. People are consistently and
 * predictably wrong about task length, they are wrong by roughly the same
 * factor each time, and they do not correct for it — which is exactly the shape
 * of error a machine can fix. A schedule built on the optimistic number falls
 * apart by mid-afternoon; one built on the observed number holds.
 *
 * `basis` says which evidence was used, and the UI shows it. Per-category first,
 * because "essays run long" and "errands run short" are different facts about
 * the same person and averaging them loses both. It never silently rewrites the
 * user's own estimate: the interface offers the learned number and the user
 * accepts it. Their estimate has to stay theirs, or there is nothing left to
 * measure the error against.
 */
export function estimateDuration(item, learning) {
  const l = learning || {};
  const stated = isNum(item && item.estimatedDuration) && item.estimatedDuration > 0
    ? item.estimatedDuration
    : (isNum(item && item.duration) ? item.duration : 30);

  const byCategory = l.estimationErrorByCategory || {};
  const entry = item && item.category ? byCategory[item.category] : null;

  if (entry && isNum(entry.ratio) && entry.n >= MIN_SAMPLES) {
    const ratio = clamp(entry.ratio, RATIO_MIN, RATIO_MAX);
    return {
      minutes: Math.round(stated * ratio),
      ratio,
      basis: 'category',
      // Confidence rises with samples and never reaches certainty: twenty
      // observations of a habit still describe a habit, not a law.
      confidence: Math.round(clamp(entry.n / (entry.n + 4), 0, 0.92) * 100),
    };
  }

  const global = l.averageEstimationError;
  if (isNum(global) && l.samples && l.samples.durations >= MIN_SAMPLES) {
    const ratio = clamp(global, RATIO_MIN, RATIO_MAX);
    return {
      minutes: Math.round(stated * ratio),
      ratio,
      basis: 'global',
      confidence: Math.round(clamp(l.samples.durations / (l.samples.durations + 6), 0, 0.85) * 100),
    };
  }

  return { minutes: stated, ratio: 1, basis: 'default', confidence: 0 };
}

/* ------------------------------------------------------------------ *
 * Building the profile
 * ------------------------------------------------------------------ */

/*
 * Everything this function reads out of one day, in one pass.
 *
 * Records arrive newest first and stay that way, because every weighted mean
 * below assumes position 0 is the most recent observation.
 */
function readDay(rec, itemsByDate) {
  const items = itemsByDate.get(rec.date) || [];
  const tasks = items.filter((i) => i.kind === 'task' && i.type !== 'break');
  const done = tasks.filter((i) => i.status === 'done');

  const sleepMinutes = rec.actual && isNum(rec.actual.sleepMinutes)
    ? rec.actual.sleepMinutes
    : null;

  return {
    date: rec.date,
    dow: dayOfWeek(rec.date),
    morning: rec.morning || null,
    sleepMinutes,
    sleepQuality: rec.morning && isNum(rec.morning.sleepQuality) ? rec.morning.sleepQuality : null,
    dayScore: rec.actual && isNum(rec.actual.dayScore) ? rec.actual.dayScore : null,
    completion: tasks.length ? done.length / tasks.length : null,
    tasks,
    done,
    load: items.reduce((a, i) => a + (isNum(i.duration) ? i.duration : 0), 0),
    review: rec.review || null,
  };
}

/*
 * Estimation ratios, per category and overall.
 *
 * Only tasks that were actually finished and carry both numbers count. A task
 * marked done with no recorded actual duration tells us nothing about how long
 * it took, and counting it as "exactly as estimated" would drag every ratio
 * toward 1 — which would look like the user getting better at estimating and is
 * really the app failing to measure.
 */
function estimationRatios(days) {
  const global = [];
  const byCategory = new Map();

  for (const day of days) {
    for (const item of day.done) {
      const est = item.estimatedDuration;
      const actual = item.actualDuration;
      if (!isNum(est) || !isNum(actual) || est <= 0 || actual <= 0) continue;
      const ratio = clamp(actual / est, RATIO_MIN, RATIO_MAX);
      global.push(ratio);
      const key = item.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(ratio);
    }
  }

  const out = { global: weightedMean(global), count: global.length, byCategory: {} };
  // Sorted so the object's key order is stable — two runs over the same data
  // must serialise identically for the determinism check to mean anything.
  for (const key of Array.from(byCategory.keys()).sort()) {
    const list = byCategory.get(key);
    out.byCategory[key] = { ratio: weightedMean(list), n: list.length };
  }
  return out;
}

/*
 * Reported energy, bucketed by the part of the day it belongs to.
 *
 * The morning check-in is the only direct reading there is, so it anchors
 * `morningEnergy`. Afternoon and evening are inferred from how the day actually
 * went — completion rate and load — rather than invented: a day where most of
 * the afternoon's work got done is evidence of an afternoon with something left
 * in it. That is a weaker signal than a direct report and it is treated as one,
 * blended toward the neutral 60 rather than taken at face value.
 */
function energyBuckets(days) {
  const morning = [];
  const afternoon = [];
  const evening = [];

  for (const day of days) {
    if (day.morning && isNum(day.morning.energy)) {
      morning.push(20 + (day.morning.energy - 1) * 17.5);   // 1..5 -> 20..90
    }
    const afternoonTasks = day.tasks.filter((i) => isNum(i.start) && i.start >= 720 && i.start < 1080);
    if (afternoonTasks.length) {
      const rate = afternoonTasks.filter((i) => i.status === 'done').length / afternoonTasks.length;
      afternoon.push(60 + (rate - 0.65) * 40);
    }
    const eveningTasks = day.tasks.filter((i) => isNum(i.start) && i.start >= 1080);
    if (eveningTasks.length) {
      const rate = eveningTasks.filter((i) => i.status === 'done').length / eveningTasks.length;
      evening.push(52 + (rate - 0.55) * 40);
    }
  }

  return {
    morning: morning.length >= MIN_SAMPLES ? clamp(weightedMean(morning), 0, 100) : null,
    afternoon: afternoon.length >= MIN_SAMPLES ? clamp(weightedMean(afternoon), 0, 100) : null,
    evening: evening.length >= MIN_SAMPLES ? clamp(weightedMean(evening), 0, 100) : null,
  };
}

/*
 * The hour work actually gets finished in, weighted by how demanding it was.
 *
 * Completion is the observable; focus is not. Weighting by the task's own focus
 * requirement is what keeps "answered some messages at nine in the evening" from
 * counting as much as "finished the physics coursework at ten in the morning".
 */
function peakHours(days) {
  const focusHours = new Map();
  const energyHours = new Map();

  for (const day of days) {
    for (const item of day.done) {
      if (!isNum(item.start)) continue;
      const hour = Math.floor(item.start / 60) % 24;
      const focusWeight = item.focusRequirement === 'high' ? 3 : item.focusRequirement === 'medium' ? 1.5 : 0.5;
      const energyWeight = item.energyRequirement === 'high' ? 3 : item.energyRequirement === 'medium' ? 1.5 : 0.5;
      focusHours.set(hour, (focusHours.get(hour) || 0) + focusWeight);
      energyHours.set(hour, (energyHours.get(hour) || 0) + energyWeight);
    }
  }

  const best = (map, minTotal) => {
    let total = 0;
    for (const v of map.values()) total += v;
    if (total < minTotal) return null;
    let bestHour = null;
    let bestScore = -1;
    // Ascending, and strictly greater, so the earliest hour wins a tie and the
    // result does not depend on Map iteration order.
    for (const hour of Array.from(map.keys()).sort((a, b) => a - b)) {
      if (map.get(hour) > bestScore) { bestScore = map.get(hour); bestHour = hour; }
    }
    return bestHour;
  };

  return { focus: best(focusHours, 9), energy: best(energyHours, 9) };
}

/*
 * The best and worst weekday, once each has been seen enough times to mean
 * anything. Three showings of a Tuesday is the least that can distinguish a
 * pattern from a coincidence, and it is the same gate the insights use.
 */
function weekdayExtremes(days) {
  const buckets = new Map();
  for (const day of days) {
    if (!isNum(day.dayScore)) continue;
    if (!buckets.has(day.dow)) buckets.set(day.dow, []);
    buckets.get(day.dow).push(day.dayScore);
  }
  const means = [];
  for (const dow of Array.from(buckets.keys()).sort((a, b) => a - b)) {
    const list = buckets.get(dow);
    if (list.length < MIN_SAMPLES) continue;
    means.push({ dow, mean: weightedMean(list) });
  }
  if (means.length < 2) return { best: null, worst: null };
  const best = means.reduce((a, b) => (b.mean > a.mean ? b : a));
  const worst = means.reduce((a, b) => (b.mean < a.mean ? b : a));
  return { best: best.dow, worst: worst.dow };
}

/*
 * How much a break is worth to this person, 0..1.
 *
 * Measured as the difference in completion rate between days that contained a
 * real break and days that did not. It falls back to null rather than to a
 * default, because the energy model uses it to decide how much a gap restores
 * and an invented 0.5 would put a fabricated recovery into every forecast.
 */
function breakEffect(days) {
  const withBreak = [];
  const without = [];
  for (const day of days) {
    if (day.completion === null) continue;
    const items = day.tasks.concat(day.done);
    const hasBreak = (day.tasks.length !== items.length) || day.tasks.some((i) => i.type === 'break');
    (hasBreak ? withBreak : without).push(day.completion);
  }
  if (withBreak.length < MIN_SAMPLES || without.length < MIN_SAMPLES) return null;
  const lift = weightedMean(withBreak) - weightedMean(without);
  // A lift of a quarter of the whole completion range is as much as this is
  // allowed to claim; beyond that the difference is more likely to be which
  // days were busy than what the break did.
  return clamp(0.5 + lift * 2, 0, 1);
}

/*
 * How often planned work slides rather than getting done.
 *
 * Only tasks that were given a time count. An unscheduled task that never
 * happened was never really planned, and counting it would make somebody who
 * keeps a long someday list look chronically avoidant.
 */
function procrastination(days) {
  let planned = 0;
  let missed = 0;
  for (const day of days) {
    for (const item of day.tasks) {
      if (!isNum(item.start)) continue;
      planned += 1;
      if (item.status !== 'done') missed += 1;
    }
  }
  if (planned < MIN_SAMPLES * 2) return null;
  return clamp(missed / planned, 0, 1);
}

/**
 * Rebuild the whole learning profile from the record history.
 *
 * Pure and total: it returns a new profile, reads nothing outside its
 * arguments, and never throws on a partial or malformed record — history is the
 * one collection that accumulates for a year and is most likely to contain
 * something odd from an older version.
 *
 * `records` must be newest first, which is what store.recentRecords() returns.
 */
export function updateLearning(learning, records, items, opts) {
  const o = opts || {};
  const prev = learning || {};
  const base = {
    samples: { days: 0, mornings: 0, durations: 0, completions: 0, reviews: 0 },
    averageWakeTime: null, averageSleepDuration: null, averageSleepQuality: null,
    morningEnergy: null, afternoonEnergy: null, eveningEnergy: null,
    focusPeakHour: null, energyPeakHour: null,
    bestDayOfWeek: null, lowestEnergyDay: null,
    averageTaskCompletionRate: null, averageEstimationError: null,
    estimationErrorByCategory: {}, procrastinationRate: null,
    preferredTaskDuration: null, breakEffectiveness: null,
    sleepEnergyCorrelation: null, sleepFocusCorrelation: null,
    workloadStressCorrelation: null, consistency: 0,
    updatedAt: prev.updatedAt || null,
  };

  const list = Array.isArray(records) ? records.filter((r) => r && r.date) : [];
  if (!list.length) return base;

  const itemsByDate = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    if (!item || !item.date) continue;
    if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
    itemsByDate.get(item.date).push(item);
  }

  /*
   * Only days that were actually lived. A record for tomorrow exists the moment
   * a forecast is stored, and counting it as an observation would let the model
   * learn from a day that has not happened — inflating the sample count, which
   * is the number confidence is built on.
   */
  const lived = list
    .filter((r) => r.actual || r.morning || r.review)
    .map((r) => readDay(r, itemsByDate));

  if (!lived.length) return base;

  /*
   * When the day really started, inferred from the first thing on it.
   *
   * There is no "what time did you get up" question anywhere in this app and
   * there is not going to be one — it is the sort of thing that gets answered
   * accurately twice and then guessed. An hour before the first commitment is a
   * rough proxy, it is consistent from day to day, and consistency is most of
   * what this measure is used for.
   */
  const plannedWakes = list
    .filter((r) => r.actual || r.morning)
    .map((r) => {
      const dayItems = itemsByDate.get(r.date) || [];
      const first = dayItems.filter((i) => isNum(i.start)).sort((a, b) => a.start - b.start)[0];
      return first ? first.start - 60 : null;
    })
    .filter(isNum);

  const sleeps = lived.map((d) => d.sleepMinutes).filter(isNum);
  const qualities = lived.map((d) => d.sleepQuality).filter(isNum);
  const completions = lived.map((d) => d.completion).filter(isNum);
  const ratios = estimationRatios(lived);
  const buckets = energyBuckets(lived);
  const peaks = peakHours(lived);
  const extremes = weekdayExtremes(lived);

  const durations = [];
  for (const day of lived) for (const item of day.done) if (isNum(item.actualDuration)) durations.push(item.actualDuration);

  /*
   * One consistency number for the whole profile, from the three things a
   * person is either regular about or is not: when they sleep, how long they
   * sleep, and how much of their plan they finish. It is the average of
   * whichever of those there is evidence for.
   */
  const parts = [
    repeatability(sleeps, 0.35),
    repeatability(plannedWakes, 0.25),
    repeatability(completions.map((c) => c + 0.5), 0.6),
  ].filter(isNum);
  const consistency = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;

  return {
    samples: {
      days: lived.length,
      mornings: lived.filter((d) => d.morning).length,
      durations: ratios.count,
      completions: completions.length,
      reviews: lived.filter((d) => d.review).length,
    },
    averageWakeTime: plannedWakes.length >= MIN_SAMPLES ? Math.round(weightedMean(plannedWakes)) : null,
    averageSleepDuration: sleeps.length >= MIN_SAMPLES ? Math.round(weightedMean(sleeps)) : null,
    averageSleepQuality: qualities.length >= MIN_SAMPLES ? round2(weightedMean(qualities)) : null,

    morningEnergy: buckets.morning === null ? null : Math.round(buckets.morning),
    afternoonEnergy: buckets.afternoon === null ? null : Math.round(buckets.afternoon),
    eveningEnergy: buckets.evening === null ? null : Math.round(buckets.evening),

    focusPeakHour: peaks.focus,
    energyPeakHour: peaks.energy,
    bestDayOfWeek: extremes.best,
    lowestEnergyDay: extremes.worst,

    averageTaskCompletionRate: completions.length >= MIN_SAMPLES ? round2(weightedMean(completions)) : null,
    averageEstimationError: ratios.count >= MIN_SAMPLES ? round2(ratios.global) : null,
    estimationErrorByCategory: roundRatios(ratios.byCategory),
    procrastinationRate: procrastination(lived),
    preferredTaskDuration: durations.length >= MIN_SAMPLES ? Math.round(weightedMean(durations)) : null,
    breakEffectiveness: breakEffect(lived),

    sleepEnergyCorrelation: correlate(lived.map((d) => [d.sleepMinutes, d.morning ? d.morning.energy : null])),
    sleepFocusCorrelation: correlate(lived.map((d) => [d.sleepMinutes, d.completion])),
    workloadStressCorrelation: correlate(lived.map((d) => [d.load, d.morning ? 6 - d.morning.mood : null])),

    consistency: round2(clamp(consistency, 0, 1)),
    updatedAt: typeof o.at === 'string' ? o.at : (prev.updatedAt || null),
  };
}

/* Two decimals everywhere, so a profile serialises identically on two runs and
 * the determinism check compares something meaningful. */
function round2(v) {
  return isNum(v) ? Math.round(v * 100) / 100 : null;
}

function roundRatios(map) {
  const out = {};
  for (const key of Object.keys(map).sort()) {
    const entry = map[key];
    if (!isNum(entry.ratio)) continue;
    out[key] = { ratio: round2(entry.ratio), n: entry.n };
  }
  return out;
}
