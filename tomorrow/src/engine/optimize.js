/*
 * optimize.js — "Improve Tomorrow", and the single change worth making.
 *
 * The rule this file exists to obey is the one in the brief: a better score has
 * to come from a real change to the day. Nothing here invents a number. Every
 * candidate is a concrete edit — a task moved to a particular minute, a bedtime
 * pulled earlier, a break inserted — and every score attached to one comes from
 * running the actual forecast over the actual edited day. The validator applies
 * the returned changes and re-forecasts them; if the promised score is not the
 * score the changed day really has, the build fails. That check is the whole
 * point of the feature.
 *
 * The search is a plain greedy hill-climb over an ordered candidate list. It is
 * not clever and it does not need to be: the move set is small, the scoring
 * function is the real one, and being deterministic matters more than being
 * optimal. Two people looking at the same evening must be offered the same
 * suggestion, and the same person must be offered it again after a reload.
 */

import { forecast } from './predict.js';
import { freeSlots } from './scheduler.js';
import { estimateDuration } from './learning.js';
import { fromMinutes } from '../core/time.js';
import { duration as fmtDuration } from '../core/fmt.js';

const STEP = 15;
const MAX_CHANGES = 4;
const MIN_GAIN = 1;
/*
 * A ceiling on how many candidate days get scored in one round. Every candidate
 * is a full forecast — two curves, a risk pass and a scoring pass — and this
 * runs inside a button press. Eighty is roughly forty milliseconds on a phone
 * and is more than the move set ever needs; the cap is here so that a day with
 * thirty unscheduled tasks cannot quietly turn one tap into a two-second freeze.
 */
const MAX_CANDIDATES = 80;

const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/* A stable id for a set of changes, so the same suggestion keeps the same
 * identity across renders and an Apply can be matched to an Undo. */
function hashOf(changes) {
  const text = JSON.stringify(changes.map((c) => [c.kind, c.itemId, c.from, c.to]));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `imp_${(h >>> 0).toString(36)}`;
}

function scoreOf(input, items, plan) {
  return forecast(Object.assign({}, input, { items, plan, withRecommendation: false }));
}

/* ------------------------------------------------------------------ *
 * Candidate moves
 *
 * Each generator returns { change, items, plan } with fresh arrays. The order
 * of this list is the tie-break order: when two candidates gain exactly the
 * same number of points the earlier one wins, which is why bedtime comes first
 * — it is the change with the fewest side effects on the rest of the day.
 * ------------------------------------------------------------------ */

function bedtimeCandidates(input) {
  const out = [];
  const plan = input.plan;
  for (const earlier of [15, 30, 45, 60]) {
    const next = plan.nextBedtime - earlier;
    // Pulling the bedtime before the last thing on the calendar is not a plan,
    // it is a contradiction. Leave twenty minutes to actually get to bed.
    const lastEnd = input.items.reduce((m, i) => (i.start === null ? m : Math.max(m, i.start + i.duration)), 0);
    if (next < lastEnd + 20) continue;
    if (next < 20 * 60) continue;
    out.push({
      change: {
        kind: 'bedtime', itemId: null, from: plan.nextBedtime, to: next,
        label: `שינה ב-${fromMinutes(next)} במקום ב-${fromMinutes(plan.nextBedtime)}`,
      },
      items: input.items,
      plan: Object.assign({}, plan, { nextBedtime: next }),
    });
  }
  return out;
}

function moveCandidates(input, energyCtx) {
  const out = [];
  const movable = input.items
    .filter((i) => !i.locked && i.status !== 'done')
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const item of movable) {
    const others = input.items.filter((i) => i.id !== item.id);
    const slots = freeSlots(others, input.plan, { minMinutes: item.duration });
    const starts = [];
    for (const slot of slots) {
      for (let s = Math.ceil(slot.start / STEP) * STEP; s + item.duration <= slot.end; s += STEP) {
        if (s !== item.start) starts.push(s);
      }
    }
    // Thin an over-long list evenly rather than taking the first few, so a
    // late-evening slot is still reachable on a day with a wide open afternoon.
    const picked = starts.length <= 6 ? starts
      : Array.from({ length: 6 }, (_, k) => starts[Math.floor(k * (starts.length - 1) / 5)]);

    for (const start of picked) {
      const items = input.items.map((i) => (i.id === item.id ? Object.assign({}, i, { start }) : i));
      out.push({
        change: {
          kind: 'move', itemId: item.id, from: item.start, to: start,
          label: item.start === null
            ? `"${item.title}" נקבע ל-${fromMinutes(start)}`
            : `"${item.title}" עובר ל-${fromMinutes(start)}`,
        },
        items,
        plan: input.plan,
      });
    }
  }
  return out;
}

/*
 * A break in the densest run of work.
 *
 * Densest, not longest: three back-to-back tasks in the middle of the afternoon
 * is where a break buys the most, and it is also the run the energy model
 * punishes hardest. The break is a real item with a real id — it appears on the
 * timeline, it takes up minutes, and Apply puts it in the schedule like
 * anything else.
 */
function breakCandidates(input) {
  const scheduled = input.items
    .filter((i) => i.start !== null && i.type !== 'break')
    .sort((a, b) => a.start - b.start);
  if (scheduled.length < 2) return [];

  let bestGapAt = -1;
  let bestDensity = 0;
  for (let i = 0; i < scheduled.length - 1; i++) {
    const a = scheduled[i];
    const b = scheduled[i + 1];
    const gap = b.start - (a.start + a.duration);
    if (gap < 0 || gap >= 20) continue;
    const density = a.duration + b.duration
      + (a.energyRequirement === 'high' ? 30 : 0) + (b.energyRequirement === 'high' ? 30 : 0);
    if (density > bestDensity) { bestDensity = density; bestGapAt = i; }
  }
  if (bestGapAt < 0) return [];

  const after = scheduled[bestGapAt];
  const at = after.start + after.duration;
  const out = [];
  for (const mins of [15, 20, 30]) {
    // Everything downstream of the break shifts by the part of it the existing
    // gap does not already absorb.
    const gap = scheduled[bestGapAt + 1].start - at;
    const push = Math.max(0, mins - gap);
    const items = input.items.map((i) => {
      if (i.start === null || i.start < scheduled[bestGapAt + 1].start || i.locked) return i;
      return Object.assign({}, i, { start: i.start + push });
    });
    const lastEnd = items.reduce((m, i) => (i.start === null ? m : Math.max(m, i.start + i.duration)), 0);
    if (lastEnd + 20 > input.plan.nextBedtime) continue;
    items.push({
      id: `itm_brk${at}x${mins}`, kind: 'task', type: 'break', title: 'הפסקה',
      notes: '', date: input.date, start: at, duration: mins, locked: false,
      category: 'personal', priority: 'low', deadline: null,
      estimatedDuration: mins, actualDuration: null, difficulty: 1,
      energyRequirement: 'low', focusRequirement: 'low', preferredTime: 'any',
      status: 'planned', isTop: false, createdAt: after.createdAt, completedAt: null,
    });
    out.push({
      change: {
        kind: 'break', itemId: null, from: null, to: at,
        label: `הפסקה של ${fmtDuration(mins)} ב-${fromMinutes(at)}`,
      },
      items,
      plan: input.plan,
    });
  }
  return out;
}

/*
 * Move the least important thing off the day entirely.
 *
 * Only ever the lowest-priority unlocked task, never something the user marked
 * as one of tomorrow's three important things, and never anything with a
 * deadline that lands tomorrow. Deferring work the user said mattered is not an
 * improvement, however much it flatters the number.
 */
function deferCandidates(input) {
  const droppable = input.items
    .filter((i) => !i.locked && !i.isTop && i.status === 'planned' && i.type !== 'break')
    .filter((i) => !i.deadline || i.deadline > input.date)
    .sort((a, b) => (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]
      ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      : a.id < b.id ? -1 : 1));
  if (!droppable.length) return [];
  const item = droppable[0];
  return [{
    change: {
      kind: 'defer', itemId: item.id, from: item.start, to: null,
      label: `"${item.title}" נדחה ליום אחר`,
    },
    items: input.items.filter((i) => i.id !== item.id),
    plan: input.plan,
  }];
}

/*
 * Give a task the length it actually takes.
 *
 * This is where duration learning shows up as a visible change to the day. When
 * the history says this kind of task runs forty per cent over, a schedule built
 * on the optimistic number is a schedule that falls apart by mid-afternoon; the
 * honest length is the improvement, even though it books more time.
 */
function lengthCandidates(input) {
  const out = [];
  for (const item of input.items) {
    if (item.locked || item.start === null || item.status !== 'planned') continue;
    const est = estimateDuration(item, input.learning);
    if (est.basis === 'default') continue;
    const want = Math.round(est.minutes / 5) * 5;
    if (Math.abs(want - item.duration) < 10) continue;
    const items = input.items.map((i) => (i.id === item.id ? Object.assign({}, i, { duration: want }) : i));
    out.push({
      change: {
        kind: 'shorten', itemId: item.id, from: item.duration, to: want,
        label: want > item.duration
          ? `"${item.title}" מקבל ${fmtDuration(want)} — כמה שזה באמת לוקח לך`
          : `"${item.title}" מקוצר ל-${fmtDuration(want)}`,
      },
      items,
      plan: input.plan,
    });
  }
  return out;
}

function candidates(input) {
  const all = [].concat(
    bedtimeCandidates(input),
    lengthCandidates(input),
    breakCandidates(input),
    moveCandidates(input),
    deferCandidates(input),
  );
  return all.slice(0, MAX_CANDIDATES);
}

/* ------------------------------------------------------------------ *
 * The search
 * ------------------------------------------------------------------ */

/**
 * Find a better version of this day, or admit there isn't one.
 *
 * Returning null is a real answer and the interface says so plainly. A day that
 * is already well arranged should not be handed a shuffle dressed up as an
 * improvement — that is the fastest way for the feature to stop being believed.
 */
export function improve(input, opts) {
  const o = opts || {};
  const maxChanges = o.maxChanges || MAX_CHANGES;
  const minGain = o.minGain === undefined ? MIN_GAIN : o.minGain;

  const start = scoreOf(input, input.items, input.plan);
  let items = input.items;
  let plan = input.plan;
  let current = start;
  const changes = [];

  for (let round = 0; round < maxChanges; round++) {
    const pool = candidates(Object.assign({}, input, { items, plan }));
    let best = null;
    for (const c of pool) {
      const f = scoreOf(input, c.items, c.plan);
      // Strictly greater, so an equal-scoring candidate never displaces an
      // earlier one. That is what keeps the result stable across runs.
      if (!best || f.score > best.forecast.score) best = { candidate: c, forecast: f };
    }
    if (!best || best.forecast.score - current.score < minGain) break;
    items = best.candidate.items;
    plan = best.candidate.plan;
    current = best.forecast;
    changes.push(best.candidate.change);
  }

  if (!changes.length) return null;

  const sorted = items.slice().sort((a, b) => {
    if (a.start === null && b.start === null) return a.id < b.id ? -1 : 1;
    if (a.start === null) return 1;
    if (b.start === null) return -1;
    return a.start !== b.start ? a.start - b.start : (a.id < b.id ? -1 : 1);
  });

  return {
    id: hashOf(changes),
    before: { score: start.score, factors: start.factors },
    after: { score: current.score, factors: current.factors },
    delta: current.score - start.score,
    changes,
    reasons: reasonsFor(start, current, changes),
    items: clone(sorted),
    plan: clone(plan),
  };
}

/*
 * Why the new day is better, said in terms of what actually moved.
 *
 * Read off the factor scores rather than written per change, because the point
 * of the explanation is the effect, not the edit. "The project moved to 18:30"
 * is already on the change list; what the user wants to know here is that the
 * afternoon stopped being stacked.
 */
function reasonsFor(before, after, changes) {
  const out = [];
  const byKey = (f) => Object.fromEntries(f.map((x) => [x.key, x.score]));
  const b = byKey(before.factors);
  const a = byKey(after.factors);
  const said = {
    sleep: 'לילה ארוך יותר',
    balance: 'פחות עומס דחוס בחלק אחד של היום',
    focus: 'העבודה החשובה יושבת על חלון ריכוז חזק יותר',
    goals: 'הדברים החשובים של מחר מקבלים מקום',
    free: 'נשאר יותר אוויר ביום',
    risk: 'פחות נקודות שעלולות להיתקע',
  };
  const moved = Object.keys(a)
    .map((k) => ({ k, d: a[k] - b[k] }))
    .filter((x) => x.d >= 3)
    .sort((x, y) => y.d - x.d);
  for (const m of moved.slice(0, 3)) out.push(said[m.k]);
  if (!out.length && changes.length) out.push('היום מסודר קצת אחרת, והתחזית משתפרת');
  return out;
}

/* ------------------------------------------------------------------ *
 * The one change worth making
 * ------------------------------------------------------------------ */

/**
 * The single highest-impact change, which the home screen leads with.
 *
 * Deliberately not "the first change improve() would make". improve() is greedy
 * and its first pick is whatever gains most in isolation; this is the same
 * search stopped after one step, which happens to be the same thing — but
 * written separately because the two are allowed to diverge, and because this
 * one runs on every render and must stay cheap.
 */
export function primaryRecommendation(input) {
  const base = scoreOf(input, input.items, input.plan);
  const pool = candidates(input);
  let best = null;
  for (const c of pool) {
    const f = scoreOf(input, c.items, c.plan);
    if (!best || f.score > best.score) best = { change: c.change, score: f.score };
  }
  if (!best || best.score - base.score < MIN_GAIN) return null;

  return {
    key: best.change.kind,
    title: titleFor(best.change),
    detail: detailFor(best.change, base, best.score),
    from: base.score,
    to: best.score,
    change: best.change,
    confidence: base.confidence.overall,
  };
}

function titleFor(change) {
  switch (change.kind) {
    case 'bedtime': return `ללכת לישון ${fmtDuration(change.from - change.to)} מוקדם יותר`;
    case 'move': return change.label;
    case 'break': return `להוסיף הפסקה ב-${fromMinutes(change.to)}`;
    case 'defer': return change.label;
    case 'shorten': return change.label;
    default: return change.label;
  }
}

function detailFor(change, base, next) {
  const gain = next - base.score;
  const worth = `לפי המודל זה שווה בערך ${gain} נקודות בתחזית של מחר`;
  switch (change.kind) {
    case 'bedtime':
      return `לילה ארוך יותר מרים את כל עקומת האנרגיה של מחר. ${worth}.`;
    case 'move':
      return `המיקום החדש מתאים יותר לרמת הריכוז הצפויה שלך באותה שעה. ${worth}.`;
    case 'break':
      return `רצף ארוך של משימות נשחק מהר יותר ממה שנדמה. ${worth}.`;
    case 'defer':
      return `היום עמוס מספיק בלי זה, וזה גם לא אחד הדברים שסימנת כחשובים. ${worth}.`;
    case 'shorten':
      return `לפי ההיסטוריה שלך זה הזמן שמשימה כזו באמת לוקחת. ${worth}.`;
    default:
      return worth;
  }
}
