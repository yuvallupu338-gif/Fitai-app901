/*
 * risk.js — what could go wrong, said calmly.
 *
 * The register here is the feature. An app that opens with "DANGER: OVERLOAD"
 * gets ignored inside a week, and an app that says nothing is no use at all.
 * Every risk below is phrased as a possibility, names the actual numbers that
 * produced it, and ends with one thing the person could do — because a warning
 * without an action is just a worry handed over.
 *
 * The wording rule from contract §0 applies with particular force here. These
 * are the sentences most likely to sound like predictions of fact, and they are
 * the least entitled to: a risk is a shape in the data, not a forecast of a bad
 * afternoon.
 */

import { duration as fmtDuration, time as fmtTime, range as fmtRange } from '../core/fmt.js';

export const RISK_KEYS = ['overload', 'conflict', 'low_energy', 'procrastination', 'no_free_time', 'sleep'];

/*
 * Severity thresholds, shared by every detector so that "high" means the same
 * thing across all six. Without this each one grows its own scale and a medium
 * conflict ends up sitting above a high sleep risk in the list.
 */
const HIGH = 62;
const MEDIUM = 34;

function severityOf(score) {
  return score >= HIGH ? 'high' : score >= MEDIUM ? 'medium' : 'low';
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function ramp(value, lo, hi) {
  if (hi === lo) return value >= hi ? 1 : 0;
  const t = clamp((value - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

function demandOf(item) {
  const energy = item.energyRequirement === 'high' ? 1.5 : item.energyRequirement === 'medium' ? 1 : 0.5;
  const focus = item.focusRequirement === 'high' ? 1.5 : item.focusRequirement === 'medium' ? 1 : 0.5;
  return (energy + focus) / 2;
}

function placed(items) {
  return items
    .filter((i) => isNum(i.start) && i.status !== 'skipped' && i.type !== 'break')
    .sort((a, b) => (a.start - b.start) || (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------------ *
 * Overload
 * ------------------------------------------------------------------ */

/*
 * Too much demanding work inside too short a stretch.
 *
 * The measure is the tightest span that contains three or more demanding items,
 * which is what the brief's own example describes: "4 demanding tasks are
 * scheduled within 2h 20m". A whole-day total cannot express that, and it is the
 * single most common way a plan that looks reasonable in a calendar turns out
 * not to be.
 */
function overloadRisk(ctx) {
  const demanding = placed(ctx.items).filter((i) => demandOf(i) >= 1 && i.status === 'planned');
  if (demanding.length < 3) return null;

  let tightest = null;
  for (let i = 0; i + 2 < demanding.length; i++) {
    for (let j = i + 2; j < demanding.length; j++) {
      const span = (demanding[j].start + demanding[j].duration) - demanding[i].start;
      const count = j - i + 1;
      const load = demanding.slice(i, j + 1).reduce((a, x) => a + x.duration * demandOf(x), 0);
      // Density per hour of the span, so three tasks in ninety minutes beats
      // five spread over six hours.
      const density = load / Math.max(60, span);
      if (!tightest || density > tightest.density) {
        tightest = { density, span, count, from: demanding[i].start, to: demanding[j].start + demanding[j].duration, items: demanding.slice(i, j + 1) };
      }
    }
  }
  if (!tightest) return null;

  /*
   * A density of 1.0 means the whole span is full of average-demand work. 1.35
   * means it is full of hard work with nothing between. Below 0.72 the stretch
   * has real air in it and is not worth mentioning.
   */
  const score = Math.round(100 * ramp(tightest.density, 0.72, 1.35));
  if (score < 18) return null;

  return {
    key: 'overload',
    severity: severityOf(score),
    score,
    title: 'ייתכן עומס בחלק מהיום',
    reason: `${tightest.count} משימות תובעניות מתוכננות בתוך ${fmtDuration(tightest.span)}, בין ${fmtRange(tightest.from, tightest.to - tightest.from, ctx.profile.timeFormat)}.`,
    suggestion: `אפשר להזיז אחת מהן לחלק אחר של היום, או לפתוח ביניהן הפסקה קצרה.`,
    window: { start: tightest.from, end: tightest.to },
    itemIds: tightest.items.map((i) => i.id),
  };
}

/* ------------------------------------------------------------------ *
 * Conflict
 * ------------------------------------------------------------------ */

/*
 * Two things at the same time.
 *
 * Reported, never resolved. Sometimes an overlap is exactly what the day is —
 * a call during a commute — and an app that silently moved one of them would be
 * making a decision that was not its to make.
 */
function conflictRisk(ctx) {
  const list = placed(ctx.items);
  const clashes = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const overlap = Math.min(a.start + a.duration, b.start + b.duration) - Math.max(a.start, b.start);
      if (overlap > 0) clashes.push({ a, b, overlap });
    }
  }
  if (!clashes.length) return null;

  const worst = clashes.reduce((x, y) => (y.overlap > x.overlap ? y : x));
  // An overlap is a hard fact rather than a tendency, so it starts high and
  // grows with how much of the shorter item is buried.
  const shorter = Math.min(worst.a.duration, worst.b.duration);
  const score = Math.round(clamp(46 + 50 * (worst.overlap / Math.max(15, shorter)), 40, 100));

  return {
    key: 'conflict',
    severity: severityOf(score),
    score,
    title: 'שני דברים חופפים בלוח',
    reason: `"${worst.a.title}" ו"${worst.b.title}" חופפים ב-${fmtDuration(worst.overlap)}${clashes.length > 1 ? `, ויש עוד ${clashes.length - 1} חפיפות ביום` : ''}.`,
    suggestion: 'כדאי להזיז אחד מהם, או לקצר את הראשון כך שייגמר לפני שהשני מתחיל.',
    window: { start: Math.max(worst.a.start, worst.b.start), end: Math.min(worst.a.start + worst.a.duration, worst.b.start + worst.b.duration) },
    itemIds: [worst.a.id, worst.b.id],
  };
}

/* ------------------------------------------------------------------ *
 * Low energy
 * ------------------------------------------------------------------ */

/*
 * Demanding work sitting in a predicted trough.
 *
 * The clearest example of something only this app can see: the calendar shows a
 * perfectly ordinary two o'clock, and the model knows that two o'clock, for this
 * person, after this much sleep, is the worst hour of the day.
 */
function lowEnergyRisk(ctx) {
  const demanding = placed(ctx.items).filter((i) => i.status === 'planned'
    && (i.energyRequirement === 'high' || i.focusRequirement === 'high'));
  if (!demanding.length) return null;

  let worst = null;
  for (const item of demanding) {
    const points = ctx.energy.points.filter((p) => p.minute + ctx.energy.step > item.start && p.minute < item.start + item.duration);
    if (!points.length) continue;
    const mean = points.reduce((a, p) => a + p.value, 0) / points.length;
    if (!worst || mean < worst.mean) worst = { item, mean };
  }
  if (!worst) return null;

  // Below 40 is a genuine trough; above 62 there is nothing to say.
  const score = Math.round(100 * ramp(62 - worst.mean, 0, 26));
  if (score < 20) return null;

  return {
    key: 'low_energy',
    severity: severityOf(score),
    score,
    title: 'משימה תובענית בשעה חלשה',
    reason: `לפי הדפוס שלך, האנרגיה סביב ${fmtTime(worst.item.start % 1440, ctx.profile.timeFormat)} צפויה להיות בערך ${Math.round(worst.mean)} מתוך 100, ושם מתוכננת "${worst.item.title}".`,
    suggestion: 'שווה להזיז אותה לחלון שבו הריכוז שלך צפוי להיות גבוה יותר.',
    window: { start: worst.item.start, end: worst.item.start + worst.item.duration },
    itemIds: [worst.item.id],
  };
}

/* ------------------------------------------------------------------ *
 * Procrastination
 * ------------------------------------------------------------------ */

/*
 * Work that this person, historically, does not get to.
 *
 * The structural half — a hard, low-priority task parked late in the evening —
 * is available on day one. The personal half needs history, and when there is
 * none the reason says so rather than implying the app has observed something it
 * has not.
 */
function procrastinationRisk(ctx) {
  const late = placed(ctx.items).filter((i) => i.status === 'planned'
    && i.start >= 20 * 60 && demandOf(i) >= 1);
  if (!late.length) return null;

  const rate = ctx.learning.procrastinationRate;
  const known = isNum(rate) && ctx.learning.samples && ctx.learning.samples.completions >= 5;

  const structural = 30 + 22 * ramp(late.length, 1, 3)
    + 18 * ramp(late.reduce((a, i) => Math.max(a, i.start), 0), 20 * 60, 22.5 * 60);
  const personal = known ? 46 * ramp(rate, 0.2, 0.65) : 0;
  const score = Math.round(clamp(structural + personal, 0, 100));
  if (score < 24) return null;

  const first = late[0];
  return {
    key: 'procrastination',
    severity: severityOf(score),
    score,
    title: 'משימה שעלולה להידחות',
    reason: known
      ? `${Math.round(rate * 100)}% מהמשימות שקבעת בעבר לא הושלמו, ו"${first.title}" מתוכננת ל-${fmtTime(first.start % 1440, ctx.profile.timeFormat)}.`
      : `"${first.title}" מתוכננת ל-${fmtTime(first.start % 1440, ctx.profile.timeFormat)}, וזו שעה שבה קשה להתחיל משהו תובעני. עוד אין לי מספיק היסטוריה שלך כדי לדעת אם זה באמת דפוס אצלך.`,
    suggestion: 'אם זה חשוב, עדיף להקדים אותה לשעות שבהן קל לך יותר להתחיל.',
    window: { start: first.start, end: first.start + first.duration },
    itemIds: late.map((i) => i.id),
  };
}

/* ------------------------------------------------------------------ *
 * No free time
 * ------------------------------------------------------------------ */

/*
 * A day booked past the point where anything can run late.
 *
 * Contract §7 rule 5 says the scheduler must never fill past 80% of the waking
 * day; this is the same line, applied to a day the user built themselves. The
 * problem is not that the day is full — it is that a full day has no way to
 * absorb the first thing that overruns, and something always does.
 */
function noFreeTimeRisk(ctx) {
  const { awakeMinutes, freeMinutes } = ctx.totals;
  if (awakeMinutes <= 0) return null;
  const share = freeMinutes / awakeMinutes;
  const score = Math.round(100 * ramp(0.22 - share, 0, 0.2));
  if (score < 20) return null;

  return {
    key: 'no_free_time',
    severity: severityOf(score),
    score,
    title: 'כמעט אין אוויר ביום',
    reason: `מתוך ${fmtDuration(awakeMinutes)} ערים, נשארים ${fmtDuration(freeMinutes)} לא תפוסים. מספיק שדבר אחד יימשך יותר מהצפוי כדי שכל השאר יזוז.`,
    suggestion: 'שווה לדחות משהו אחד ליום אחר, או לקצר את מה שאפשר.',
    window: null,
    itemIds: [],
  };
}

/* ------------------------------------------------------------------ *
 * Sleep
 * ------------------------------------------------------------------ */

/*
 * A night well short of what this person needs, or one the day makes impossible.
 *
 * The second half matters more than it sounds. A bedtime of 23:00 with something
 * running until 23:30 is not a short night, it is a plan that has not noticed
 * itself — and it is the kind of thing somebody only sees at 23:20.
 */
function sleepRisk(ctx) {
  const need = isNum(ctx.learning.averageSleepDuration) && ctx.learning.averageSleepDuration > 300
    ? ctx.learning.averageSleepDuration
    : 480;
  const got = ctx.totals.sleepMinutes;

  const lastEnd = ctx.items.reduce((m, i) => (isNum(i.start) ? Math.max(m, i.start + i.duration) : m), 0);
  const bedtime = ctx.plan.nextBedtime >= 720 ? ctx.plan.nextBedtime : ctx.plan.nextBedtime + 1440;
  const impossible = lastEnd > bedtime - 15;

  const shortfall = Math.max(0, need - got);
  let score = Math.round(100 * ramp(shortfall, 25, 150));
  if (impossible) score = Math.max(score, 58);
  if (score < 20) return null;

  return {
    key: 'sleep',
    severity: severityOf(score),
    score,
    title: impossible ? 'שעת השינה לא מסתדרת עם היום' : 'לילה קצר מהרגיל',
    reason: impossible
      ? `הדבר האחרון ביום נגמר ב-${fmtTime(lastEnd % 1440, ctx.profile.timeFormat)}, ושעת השינה שסימנת היא ${fmtTime(ctx.plan.nextBedtime, ctx.profile.timeFormat)}.`
      : `מתוכננות ${fmtDuration(got)}, בערך ${fmtDuration(shortfall)} פחות ממה שאתה בדרך כלל צריך.`,
    suggestion: impossible
      ? 'אפשר להזיז את מה שנגמר מאוחר, או לעדכן את שעת השינה למשהו ריאלי.'
      : 'הקדמה של חצי שעה בשינה היא בדרך כלל השינוי הכי משתלם ביום.',
    window: null,
    itemIds: [],
  };
}

/* ------------------------------------------------------------------ *
 * All of them
 * ------------------------------------------------------------------ */

/**
 * Every risk this day carries, worst first.
 *
 * Ordering is by severity and then by score, with the key as the final
 * tie-break so two equally serious risks never swap places between renders —
 * the timeline reads them in this order and a list that reshuffles itself is
 * a list nobody trusts.
 */
export function assessRisks(ctx) {
  const rank = { high: 3, medium: 2, low: 1 };
  return [
    overloadRisk(ctx),
    conflictRisk(ctx),
    lowEnergyRisk(ctx),
    procrastinationRisk(ctx),
    noFreeTimeRisk(ctx),
    sleepRisk(ctx),
  ]
    .filter(Boolean)
    .sort((a, b) => (rank[b.severity] - rank[a.severity])
      || (b.score - a.score)
      || (a.key < b.key ? -1 : 1));
}
