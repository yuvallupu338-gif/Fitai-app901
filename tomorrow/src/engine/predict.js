/*
 * predict.js — the one function the interface calls to learn about a day.
 *
 * Everything else in src/engine/ models one thing well: energy.js draws a
 * curve, risk.js finds what could go wrong, scoring.js turns the lot into a
 * number. This file is the order they run in and the shape they come back as,
 * and it is deliberately thin. When a forecast is wrong the bug is almost
 * always in one of the models; keeping this file free of its own arithmetic is
 * what makes that true.
 *
 * forecast() is pure and must stay pure. Same input, same output, byte for
 * byte — the validator calls it twice and diffs the JSON. That is not a
 * stylistic preference: the what-if simulator runs it on cloned state and the
 * optimiser runs it a few hundred times inside one click, and neither is safe
 * if a call can leave a mark.
 */

import { sleepWindow, bedtimeAbs } from '../core/time.js';
import { personalWeight } from './learning.js';
import { energyCurve } from './energy.js';
import { focusCurve, bestWindows } from './focus.js';
import { assessRisks } from './risk.js';
import { scoreDay } from './scoring.js';
import { assess } from './confidence.js';
import { findInsights } from './insights.js';

const NOON = 720;
const DAY = 1440;

/** The stretch of the day the user is awake for, in absolute minutes. */
function awakeWindow(plan) {
  const from = plan.wake;
  const to = bedtimeAbs(plan.nextBedtime);
  return { from, to, minutes: Math.max(0, to - from) };
}

/*
 * Booked minutes, counted as a union rather than a sum.
 *
 * Two overlapping items are a problem the conflict risk reports; they are not
 * two hours of work in a one-hour slot. Summing durations here made an
 * overlapping day look busier than any day could physically be, which fed a
 * free-time factor of zero and a score that could not be improved by anything
 * the optimiser tried.
 */
function bookedMinutes(items, win) {
  const spans = items
    .filter((i) => i.start !== null && i.status !== 'skipped')
    .map((i) => [Math.max(win.from, i.start), Math.min(win.to, i.start + i.duration)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let openFrom = null;
  let openTo = null;
  for (const [a, b] of spans) {
    if (openTo === null || a > openTo) {
      if (openTo !== null) total += openTo - openFrom;
      openFrom = a;
      openTo = b;
    } else if (b > openTo) {
      openTo = b;
    }
  }
  if (openTo !== null) total += openTo - openFrom;
  return total;
}

function totalsFor(plan, items) {
  const win = awakeWindow(plan);
  const night = sleepWindow(plan.bedtime, plan.wake);
  const load = bookedMinutes(items, win);
  return {
    loadMinutes: load,
    freeMinutes: Math.max(0, win.minutes - load),
    sleepMinutes: night.minutes,
    awakeMinutes: win.minutes,
    taskCount: items.filter((i) => i.kind === 'task').length,
    doneCount: items.filter((i) => i.status === 'done').length,
    topCount: (plan.topPriorities || []).length,
    from: win.from,
    to: win.to,
  };
}

/* ------------------------------------------------------------------ *
 * Peaks
 * ------------------------------------------------------------------ */

/*
 * The high and low points, read off the curve rather than assumed.
 *
 * The dip is searched only in the afternoon stretch — from four hours after
 * waking to the early evening. Without that bound the lowest energy of any day
 * is the last sample before bed, which is true, useless, and not what "when
 * will I flag" means to somebody planning an afternoon.
 */
function peakOf(curve) {
  return curve.points.reduce((best, p) => (p.value > best.value ? p : best), curve.points[0]);
}

function dipOf(curve, wake) {
  /*
   * Bounded to the afternoon on purpose — four to nine hours after waking.
   *
   * Without the upper bound the lowest energy of any day is the last sample
   * before bed, which is true, useless, and not what "when will I flag" means
   * to somebody planning an afternoon. The evening decline is a fact about
   * bedtime; the post-lunch trough is a fact about the day, and it is the one
   * worth marking on a timeline.
   */
  const inAfternoon = curve.points.filter((p) => p.minute >= wake + 240 && p.minute <= wake + 540);
  const pool = inAfternoon.length ? inAfternoon : curve.points;
  return pool.reduce((low, p) => (p.value < low.value ? p : low), pool[0]);
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

function valueAt(curve, minute) {
  if (!curve.points.length) return null;
  let best = curve.points[0];
  for (const p of curve.points) if (Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p;
  return Math.round(best.value);
}

/*
 * The day read top to bottom: waking, each item, the moments worth knowing
 * about, and going to sleep.
 *
 * Peaks, dips and risks are interleaved with the items rather than listed
 * separately, because the question the timeline answers is "what is this part
 * of the day like", and an energy dip at 13:45 only means something next to
 * the task sitting on top of it.
 */
function buildTimeline(ctx, energy, focus, focusWindows, risks, totals) {
  const { plan, items } = ctx;
  const out = [];

  out.push({
    minute: plan.wake, kind: 'wake', title: 'קימה',
    detail: `אנרגיה משוערת ${valueAt(energy, plan.wake)}`,
    itemId: null, energy: valueAt(energy, plan.wake), tone: 'plain',
  });

  for (const it of items) {
    if (it.start === null) continue;
    out.push({
      minute: it.start, kind: 'item', title: it.title,
      detail: it.notes || '', itemId: it.id,
      energy: valueAt(energy, it.start),
      tone: it.status === 'done' ? 'good' : 'plain',
    });
  }

  const peak = focusWindows.length ? focusWindows[0] : null;
  if (peak) {
    out.push({
      minute: peak.start, kind: 'peak', title: 'חלון הריכוז החזק ביותר',
      detail: 'זמן טוב למשימה שדורשת ראש צלול',
      itemId: null, energy: valueAt(energy, peak.start), tone: 'good',
    });
  }

  const dip = dipOf(energy, plan.wake);
  if (dip && (!peak || Math.abs(dip.minute - peak.start) > 45)) {
    out.push({
      minute: dip.minute, kind: 'dip', title: 'ירידה צפויה באנרגיה',
      detail: 'עדיף להימנע כאן ממשימות שדורשות ריכוז גבוה',
      itemId: null, energy: Math.round(dip.value), tone: 'warn',
    });
  }

  for (const r of risks) {
    if (!r.window) continue;
    out.push({
      minute: r.window.start, kind: 'risk', title: r.title,
      detail: r.suggestion, itemId: null,
      energy: valueAt(energy, r.window.start), tone: 'warn',
    });
  }

  out.push({
    minute: totals.to, kind: 'sleep', title: 'שינה מתוכננת',
    detail: '', itemId: null, energy: valueAt(energy, totals.to), tone: 'plain',
  });

  // Ties break on kind then title so two things at the same minute never swap
  // places between renders. An unstable sort here makes cards visibly jump.
  const order = { wake: 0, peak: 1, item: 2, dip: 3, risk: 4, gap: 5, sleep: 6 };
  return out.sort((a, b) => (a.minute !== b.minute ? a.minute - b.minute
    : order[a.kind] !== order[b.kind] ? order[a.kind] - order[b.kind]
      : a.title < b.title ? -1 : 1));
}

/* ------------------------------------------------------------------ *
 * The forecast
 * ------------------------------------------------------------------ */

/**
 * Everything the app knows about one day.
 *
 * It does NOT compute the highest-impact recommendation.
 *
 * That lives in optimize.js, which finds it by scoring candidate days — and
 * scoring a day means calling this function. Importing it here made
 * predict → optimize → predict, a cycle that real ES modules tolerate through
 * hoisting and live bindings, so the served app never noticed. Flattened into
 * one file it is fatal: whichever module the bundler emits second destructures
 * from a registry entry that does not exist yet, and the whole app is a blank
 * page. core/forecast.js composes the two instead, which is the right shape
 * anyway — the prediction engine has no business depending on the thing that
 * searches over its output.
 */
export function forecast(input) {
  const ctx = {
    date: input.date,
    profile: input.profile,
    plan: input.plan,
    items: input.items || [],
    learning: input.learning,
    history: input.history || [],
    now: input.now,
    morning: input.morning || null,
  };
  ctx.personalWeight = personalWeight(ctx.learning);

  const totals = totalsFor(ctx.plan, ctx.items);
  const energy = energyCurve(Object.assign({}, ctx, { totals }));
  const focus = focusCurve(Object.assign({}, ctx, { totals }), energy);
  const focusWindows = bestWindows(focus, { minMinutes: 45, plan: ctx.plan, items: ctx.items });

  const risks = assessRisks(Object.assign({}, ctx, { energy, focus, focusWindows, totals }));

  const scored = scoreDay({
    date: ctx.date, profile: ctx.profile, plan: ctx.plan, items: ctx.items,
    learning: ctx.learning, history: ctx.history,
    energy, focus, focusWindows, risks, totals,
  });

  const confidence = assess(ctx.learning, ctx.history, Object.assign({}, ctx, { totals }));

  /*
   * Insights come from the whole history, then get filtered to the handful
   * that say something about tomorrow specifically. Showing all of them here
   * turns the home screen into the insights screen; showing none wastes the
   * one place the user is actually looking.
   */
  const insights = findInsights(ctx.learning, ctx.history, ctx.items).slice(0, 3);

  const out = {
    date: ctx.date,
    score: scored.score,
    label: scored.label,
    band: scored.band,
    /* False when the day has too little in it for the score to be a verdict on
     * anything — see scoring.js. The hero says so instead of grading it. */
    judged: scored.judged,
    factors: scored.factors,
    reasons: scored.reasons,
    energy,
    focus,
    focusWindows,
    energyPeak: { minute: peakOf(energy).minute, value: Math.round(peakOf(energy).value) },
    energyDip: { minute: dipOf(energy, ctx.plan.wake).minute, value: Math.round(dipOf(energy, ctx.plan.wake).value) },
    focusPeak: { minute: peakOf(focus).minute, value: Math.round(peakOf(focus).value) },
    risks,
    timeline: buildTimeline(ctx, energy, focus, focusWindows, risks, totals),
    confidence,
    recommendation: null,
    insights,
    totals: {
      loadMinutes: totals.loadMinutes,
      freeMinutes: totals.freeMinutes,
      sleepMinutes: totals.sleepMinutes,
      awakeMinutes: totals.awakeMinutes,
      taskCount: totals.taskCount,
      doneCount: totals.doneCount,
      topCount: totals.topCount,
    },
    meta: {
      personalWeight: ctx.personalWeight,
      samples: (ctx.learning && ctx.learning.samples && ctx.learning.samples.days) || 0,
      generatedFor: ctx.date,
    },
  };

  return out;
}

/*
 * The history-sized version of a forecast.
 *
 * A DayRecord keeps what was predicted so the end-of-day review can compare it
 * against what happened, and the app keeps a year of them. The full object is
 * mostly two curves at fifteen-minute resolution and a timeline, which is tens
 * of kilobytes a day and would fill the whole origin's storage inside a few
 * months. The hourly curves are enough to answer "was the afternoon dip real",
 * which is the only question the review asks of them.
 */
export function snapshot(f) {
  return {
    date: f.date,
    score: f.score,
    label: f.label,
    band: f.band,
    judged: f.judged,
    factors: f.factors.map((x) => ({ key: x.key, score: x.score })),
    energy: { hourly: f.energy.hourly },
    focus: { hourly: f.focus.hourly },
    focusWindows: f.focusWindows.map((w) => ({ start: w.start, end: w.end, score: w.score })),
    risks: f.risks.map((r) => ({ key: r.key, severity: r.severity, score: r.score })),
    confidence: { overall: f.confidence.overall, level: f.confidence.level },
    totals: f.totals,
  };
}
