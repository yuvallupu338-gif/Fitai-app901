/*
 * insights.js — patterns, and the refusal to invent them.
 *
 * This is the file where an app like this earns or loses its credibility. A
 * sentence about somebody's own life is a strong claim, and the temptation is
 * always to make one from whatever is lying around — two days, a coincidence, a
 * difference well inside the noise. That produces an app which is occasionally
 * uncanny and frequently wrong, and people cannot tell which they are looking
 * at, so they discount all of it.
 *
 * So the gates here are hard, and they are per-detector rather than per-app:
 * each pattern counts the samples that support *it*, not the total number of
 * days on record. Fewer than three and nothing is said at all. Three or four is
 * an early signal, five to nine an emerging pattern, ten or more a real one —
 * and the strength is shown, always, next to the claim.
 *
 * Every insight also carries the count behind it. "You finish 28% more before
 * 11:00" is a claim to be believed; "based on 12 comparable days" is a claim
 * that can be argued with, and only the second kind is honest.
 */

import { duration as fmtDuration } from '../core/fmt.js';
import { dayOfWeek } from '../core/time.js';

const MIN_SAMPLES = 3;
const EMERGING = 5;
const STRONG = 10;

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function strengthOf(samples) {
  return samples >= STRONG ? 'strong' : samples >= EMERGING ? 'emerging' : 'early';
}

function evidenceFor(samples, noun) {
  return `על סמך ${samples} ${noun || (samples === 1 ? 'יום' : 'ימים')}`;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function mean(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

/*
 * Everything a detector needs, read once.
 *
 * Only days that were actually lived — a record exists for tomorrow the moment
 * a forecast is stored, and counting it would let a pattern be built from days
 * that have not happened.
 */
function prepare(records, items) {
  const byDate = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    if (!item || !item.date) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }

  return (Array.isArray(records) ? records : [])
    .filter((r) => r && r.date && (r.actual || r.morning || r.review))
    .map((r) => {
      const dayItems = byDate.get(r.date) || [];
      const tasks = dayItems.filter((i) => i.kind === 'task' && i.type !== 'break');
      return {
        date: r.date,
        dow: dayOfWeek(r.date),
        tasks,
        done: tasks.filter((i) => i.status === 'done'),
        morning: r.morning || null,
        sleepMinutes: r.actual && isNum(r.actual.sleepMinutes) ? r.actual.sleepMinutes : null,
        dayScore: r.actual && isNum(r.actual.dayScore) ? r.actual.dayScore : null,
        hadBreak: dayItems.some((i) => i.type === 'break'),
      };
    });
}

/* ------------------------------------------------------------------ *
 * Detectors
 *
 * Each returns an Insight or null. Each counts its own evidence. None of them
 * may reach for the total day count as a shortcut.
 * ------------------------------------------------------------------ */

/*
 * Work started before a threshold against work started after it.
 *
 * The brief's own headline example, and the most useful thing this app can
 * notice about somebody, because it is directly actionable: it changes where
 * tomorrow's hardest task goes.
 */
function morningAdvantage(days) {
  const early = [];
  const late = [];
  for (const day of days) {
    for (const item of day.tasks) {
      if (!isNum(item.start)) continue;
      if (item.focusRequirement === 'low') continue;
      (item.start < 11 * 60 ? early : late).push(item.status === 'done' ? 1 : 0);
    }
  }
  if (early.length < MIN_SAMPLES || late.length < MIN_SAMPLES) return null;

  const e = mean(early);
  const l = mean(late);
  if (l < 0.05) return null;
  const lift = (e - l) / l;
  // Under a fifth is inside the noise for samples this size; claiming it would
  // be reading a difference the data cannot support.
  if (Math.abs(lift) < 0.2) return null;

  const samples = Math.min(early.length, late.length);
  const earlier = lift > 0;
  return {
    key: 'morning_advantage',
    text: earlier
      ? `אתה משלים ${Math.round(lift * 100)}% יותר משימות שדורשות ריכוז כשהן מתחילות לפני 11:00.`
      : `דווקא משימות שמתחילות אחרי 11:00 מסתיימות אצלך ${Math.round(-lift * 100)}% יותר.`,
    evidence: evidenceFor(early.length + late.length, 'משימות'),
    samples,
    strength: strengthOf(samples),
    metric: 'completion_by_hour',
    delta: Math.round(lift * 100),
  };
}

/*
 * What a short night costs the next morning.
 *
 * Measured against this person's own median rather than a fixed seven or eight
 * hours, because "short" is relative to what they normally get — six hours is a
 * disaster for one person and unremarkable for another.
 */
function shortNightCost(days) {
  const withBoth = days.filter((d) => isNum(d.sleepMinutes) && d.morning && isNum(d.morning.energy));
  if (withBoth.length < EMERGING) return null;

  const sorted = withBoth.map((d) => d.sleepMinutes).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const short = withBoth.filter((d) => d.sleepMinutes < median - 25);
  const long = withBoth.filter((d) => d.sleepMinutes >= median + 15);
  if (short.length < MIN_SAMPLES || long.length < MIN_SAMPLES) return null;

  const shortEnergy = mean(short.map((d) => d.morning.energy));
  const longEnergy = mean(long.map((d) => d.morning.energy));
  const gap = longEnergy - shortEnergy;
  if (gap < 0.4) return null;

  const samples = Math.min(short.length, long.length);
  const points = Math.round(gap * 17.5);   // the 1..5 scale mapped to 0..100
  return {
    key: 'short_night_cost',
    text: `אחרי לילה קצר מ-${fmtDuration(Math.round(median))} אתה מדווח על אנרגיה נמוכה בכ-${points} נקודות בבוקר שאחרי.`,
    evidence: evidenceFor(short.length + long.length),
    samples,
    strength: strengthOf(samples),
    metric: 'sleep_energy',
    delta: points,
  };
}

/*
 * How far off the estimates are, per category.
 *
 * The most directly useful thing in the whole list — it is the number the
 * scheduler already acts on, and saying it out loud is what turns an invisible
 * correction into something the user can agree or disagree with.
 */
function estimationBias(learning) {
  const byCategory = learning.estimationErrorByCategory || {};
  let best = null;
  for (const key of Object.keys(byCategory).sort()) {
    const entry = byCategory[key];
    if (!entry || !isNum(entry.ratio) || entry.n < MIN_SAMPLES) continue;
    const off = Math.abs(entry.ratio - 1);
    if (off < 0.15) continue;
    if (!best || off > Math.abs(best.entry.ratio - 1)) best = { key, entry };
  }
  if (!best) return null;

  const over = best.entry.ratio > 1;
  const percent = Math.round(Math.abs(best.entry.ratio - 1) * 100);
  const label = CATEGORY_LABEL[best.key] || best.key;
  return {
    key: `estimation_${best.key}`,
    text: over
      ? `משימות ${label} לוקחות לך בדרך כלל כ-${percent}% יותר זמן ממה שאתה מעריך.`
      : `משימות ${label} לוקחות לך בדרך כלל כ-${percent}% פחות זמן ממה שאתה מעריך.`,
    evidence: evidenceFor(best.entry.n, 'משימות'),
    samples: best.entry.n,
    strength: strengthOf(best.entry.n),
    metric: 'estimation_ratio',
    delta: over ? percent : -percent,
  };
}

const CATEGORY_LABEL = {
  work: 'עבודה', study: 'לימודים', fitness: 'כושר', personal: 'אישיות',
  errand: 'סידורים', social: 'חברתיות', health: 'בריאות', other: 'אחרות',
};

/*
 * Work parked late in the evening, and how much of it happens.
 *
 * The brief's second worked example. It is worth its own detector rather than
 * being folded into the morning one, because the actionable advice is different:
 * that one says move it earlier, this one says do not plan it at all.
 */
function lateEveningCompletion(days) {
  const late = [];
  for (const day of days) {
    for (const item of day.tasks) {
      if (!isNum(item.start) || item.start < 20.5 * 60) continue;
      late.push(item.status === 'done' ? 1 : 0);
    }
  }
  if (late.length < EMERGING) return null;
  const rate = mean(late);
  if (rate > 0.7) return null;

  return {
    key: 'late_evening',
    text: `משימות שאתה קובע אחרי 20:30 מסתיימות ב-${Math.round(rate * 100)}% מהמקרים בלבד.`,
    evidence: evidenceFor(late.length, 'משימות'),
    samples: late.length,
    strength: strengthOf(late.length),
    metric: 'late_completion',
    delta: Math.round(rate * 100),
  };
}

/* The best and worst weekday, once each has been seen enough times. */
function weekdayPattern(days) {
  const buckets = new Map();
  for (const day of days) {
    if (!isNum(day.dayScore)) continue;
    if (!buckets.has(day.dow)) buckets.set(day.dow, []);
    buckets.get(day.dow).push(day.dayScore);
  }
  const usable = [];
  for (const dow of Array.from(buckets.keys()).sort((a, b) => a - b)) {
    const list = buckets.get(dow);
    if (list.length < MIN_SAMPLES) continue;
    usable.push({ dow, mean: mean(list), n: list.length });
  }
  if (usable.length < 2) return null;

  const best = usable.reduce((a, b) => (b.mean > a.mean ? b : a));
  const worst = usable.reduce((a, b) => (b.mean < a.mean ? b : a));
  const gap = best.mean - worst.mean;
  if (gap < 8) return null;

  const samples = Math.min(best.n, worst.n);
  return {
    key: 'weekday',
    text: `ימי ${DAY_NAMES[best.dow]} יוצאים לך בממוצע ${Math.round(gap)} נקודות טובים יותר מימי ${DAY_NAMES[worst.dow]}.`,
    evidence: evidenceFor(best.n + worst.n),
    samples,
    strength: strengthOf(samples),
    metric: 'weekday_score',
    delta: Math.round(gap),
  };
}

/* Whether a break in the day is worth the time it costs. */
function breakValue(days) {
  const withBreak = [];
  const without = [];
  for (const day of days) {
    if (!day.tasks.length) continue;
    const rate = day.done.length / day.tasks.length;
    (day.hadBreak ? withBreak : without).push(rate);
  }
  if (withBreak.length < MIN_SAMPLES || without.length < MIN_SAMPLES) return null;
  const lift = mean(withBreak) - mean(without);
  if (Math.abs(lift) < 0.1) return null;

  const samples = Math.min(withBreak.length, without.length);
  return {
    key: 'break_value',
    text: lift > 0
      ? `בימים שבהם היתה לך הפסקה מתוכננת השלמת ${Math.round(lift * 100)}% יותר ממה שתכננת.`
      : `דווקא בימים בלי הפסקה מתוכננת השלמת יותר — כנראה שאלה ימים עמוסים פחות מלכתחילה.`,
    evidence: evidenceFor(withBreak.length + without.length),
    samples,
    strength: strengthOf(samples),
    metric: 'break_effect',
    delta: Math.round(lift * 100),
  };
}

/* Which kind of work slips most often. */
function weakestCategory(days) {
  const buckets = new Map();
  for (const day of days) {
    for (const item of day.tasks) {
      const key = item.category || 'other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item.status === 'done' ? 1 : 0);
    }
  }
  const usable = [];
  for (const key of Array.from(buckets.keys()).sort()) {
    const list = buckets.get(key);
    if (list.length < EMERGING) continue;
    usable.push({ key, rate: mean(list), n: list.length });
  }
  if (usable.length < 2) return null;

  const worst = usable.reduce((a, b) => (b.rate < a.rate ? b : a));
  const rest = usable.filter((u) => u.key !== worst.key);
  const others = mean(rest.map((u) => u.rate));
  if (others - worst.rate < 0.18) return null;

  return {
    key: `weak_${worst.key}`,
    text: `משימות ${CATEGORY_LABEL[worst.key] || worst.key} נשארות פתוחות אצלך יותר מכל השאר — ${Math.round(worst.rate * 100)}% מהן מסתיימות.`,
    evidence: evidenceFor(worst.n, 'משימות'),
    samples: worst.n,
    strength: strengthOf(worst.n),
    metric: 'category_completion',
    delta: Math.round((worst.rate - others) * 100),
  };
}

/* ------------------------------------------------------------------ *
 * All of them
 * ------------------------------------------------------------------ */

const STRENGTH_RANK = { strong: 3, emerging: 2, early: 1 };

/**
 * Everything that can be said with evidence, strongest first.
 *
 * Ordered by strength and then by effect size, because a weak claim about a big
 * difference and a strong claim about a small one are both worth showing, and
 * the one backed by more days should be read first.
 */
export function findInsights(learning, records, items) {
  const l = learning || {};
  const days = prepare(records, items);

  return [
    morningAdvantage(days),
    estimationBias(l),
    lateEveningCompletion(days),
    shortNightCost(days),
    weekdayPattern(days),
    breakValue(days),
    weakestCategory(days),
  ]
    .filter(Boolean)
    .filter((i) => i.samples >= MIN_SAMPLES)
    .sort((a, b) => (STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength])
      || (Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
      || (a.key < b.key ? -1 : 1));
}
