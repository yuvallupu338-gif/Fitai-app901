/*
 * scheduler.js — where a task should go, and where it may not.
 *
 * Seven rules from contract §7, each written as its own named predicate rather
 * than folded into one loop. That is deliberate: when the optimiser produces a
 * placement somebody objects to, the useful question is *which rule allowed
 * this*, and it should be answerable by reading a function name rather than by
 * unpicking a chain of conditions.
 *
 * The rules exist because a scheduler that only avoids collisions produces days
 * that are technically valid and humanly impossible — back-to-back demanding
 * work, no transition after a meeting, every minute spoken for. Avoiding
 * overlap is the easy half; leaving room is the half that makes the output
 * usable.
 *
 * Everything here returns new arrays. The optimiser and the what-if sandbox
 * both call place() on cloned state hundreds of times, and a single mutation
 * would leak a scenario into the real day.
 */

import { estimateDuration } from './learning.js';
import { bedtimeAbs } from '../core/time.js';

/* Rule 2: nothing starts on top of the thing before it. */
const BUFFER = 10;
const BUFFER_DEMANDING = 15;

/* Rule 7: a meeting, a workout or an event needs getting to and getting back. */
const TRANSITION = 10;

/* Rule 6: nothing in the first twenty minutes of being awake. */
const WAKE_GRACE = 20;

/* Rule 5: keep a fifth of the waking day unbooked. */
const MAX_BOOKED_SHARE = 0.8;

const GRID = 15;
const MIN_SLOT = 15;

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isDemanding(item) {
  return item.energyRequirement === 'high' || item.focusRequirement === 'high';
}

function needsTransition(item) {
  return item.type === 'meeting' || item.type === 'workout' || item.type === 'event';
}

/* How much clear time an item needs on each side of it. */
function padBefore(item) {
  return needsTransition(item) ? TRANSITION : 0;
}

function padAfter(item) {
  return needsTransition(item) ? TRANSITION : 0;
}

function scheduled(items) {
  return items
    .filter((i) => isNum(i.start) && i.status !== 'skipped')
    .sort((a, b) => (a.start - b.start) || (a.id < b.id ? -1 : 1));
}

function dayBounds(plan) {
  const from = (isNum(plan.wake) ? plan.wake : 420) + WAKE_GRACE;
  const to = bedtimeAbs(isNum(plan.nextBedtime) ? plan.nextBedtime : 1380);
  return { from, to: Math.max(from + 60, to) };
}

/* ------------------------------------------------------------------ *
 * The seven rules, one predicate each
 * ------------------------------------------------------------------ */

/** Rule 1 — never overlap anything already on the day. */
function rule1NoOverlap(item, start, others) {
  const end = start + item.duration;
  return !others.some((o) => start < o.start + o.duration && o.start < end);
}

/** Rule 2 — leave a buffer, wider when both sides are demanding. */
function rule2Buffer(item, start, others) {
  const end = start + item.duration;
  for (const o of others) {
    const oEnd = o.start + o.duration;
    const gap = start >= oEnd ? start - oEnd : (o.start >= end ? o.start - end : 0);
    if (gap === 0) continue;
    const want = (isDemanding(item) && isDemanding(o)) ? BUFFER_DEMANDING : BUFFER;
    // Only the immediate neighbours matter; a distant item's gap is irrelevant.
    const adjacent = (start >= oEnd && start - oEnd < want) || (o.start >= end && o.start - end < want);
    if (adjacent && gap < want) return false;
  }
  return true;
}

/** Rule 4 — a locked item is immovable, and a deadline is not negotiable. */
function rule4Deadlines(item, start, date) {
  if (!item.deadline) return true;
  if (item.deadline < date) return false;
  return true;
}

/** Rule 5 — never book past four fifths of the waking day. */
function rule5KeepAir(item, others, plan) {
  const { from, to } = dayBounds(plan);
  const awake = Math.max(1, to - from);
  const booked = others.reduce((a, o) => a + o.duration, 0) + item.duration;
  return booked / awake <= MAX_BOOKED_SHARE;
}

/** Rule 6 — inside the waking day only, and not in the first twenty minutes. */
function rule6InsideDay(item, start, plan) {
  const { from, to } = dayBounds(plan);
  return start >= from && start + item.duration <= to;
}

/** Rule 7 — a meeting, workout or event needs room to get to and from. */
function rule7Transitions(item, start, others) {
  const end = start + item.duration;
  for (const o of others) {
    const oEnd = o.start + o.duration;
    const need = Math.max(padAfter(o) + padBefore(item), padAfter(item) + padBefore(o));
    if (need === 0) continue;
    if (start >= oEnd && start - oEnd < need) return false;
    if (o.start >= end && o.start - end < need) return false;
  }
  return true;
}

/* All the hard rules together. Rule 3 is a preference, not a prohibition — see
 * scoreSlot below — because refusing to place a task at all when every focus
 * window is taken would be worse than placing it somewhere honest. */
function allowed(item, start, others, plan, date) {
  return rule1NoOverlap(item, start, others)
    && rule2Buffer(item, start, others)
    && rule4Deadlines(item, start, date)
    && rule6InsideDay(item, start, plan)
    && rule7Transitions(item, start, others)
    && rule5KeepAir(item, others, plan);
}

/* ------------------------------------------------------------------ *
 * Free time
 * ------------------------------------------------------------------ */

/**
 * The usable gaps in a day.
 *
 * Usable, not merely empty: each gap already has the buffers and transitions of
 * its neighbours subtracted, so a caller can place something at the start of one
 * without re-deriving the rules.
 */
export function freeSlots(items, plan, opts) {
  const o = opts || {};
  const min = isNum(o.minMinutes) ? Math.max(MIN_SLOT, o.minMinutes) : MIN_SLOT;
  const { from, to } = dayBounds(plan);
  const list = scheduled(items);

  const out = [];
  let cursor = from;

  for (const item of list) {
    const blockStart = item.start - Math.max(BUFFER, padBefore(item));
    if (blockStart > cursor) {
      const start = cursor;
      const end = Math.min(blockStart, to);
      if (end - start >= min) out.push({ start, end, minutes: end - start });
    }
    cursor = Math.max(cursor, item.start + item.duration + Math.max(BUFFER, padAfter(item)));
  }

  if (to - cursor >= min) out.push({ start: cursor, end: to, minutes: to - cursor });
  return out;
}

/** Every overlapping pair on a day, with how many minutes they share. */
export function conflicts(items) {
  const list = scheduled(items);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const minutes = Math.min(a.start + a.duration, b.start + b.duration) - Math.max(a.start, b.start);
      if (minutes > 0) out.push({ a, b, minutes });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Choosing a slot
 * ------------------------------------------------------------------ */

function meanOver(curve, from, to) {
  if (!curve || !Array.isArray(curve.points) || !curve.points.length) return 60;
  const step = curve.step || GRID;
  const points = curve.points.filter((p) => p.minute + step > from && p.minute < to);
  if (!points.length) return 30;
  return points.reduce((a, p) => a + p.value, 0) / points.length;
}

/*
 * How good a start time is, and why.
 *
 * The reason is built alongside the score rather than after it, so the sentence
 * the user reads names the term that actually won. A "reason" reverse-engineered
 * from the winning slot is how an app ends up explaining a decision it did not
 * make.
 */
function scoreSlot(item, start, ctx, others) {
  const end = start + item.duration;
  const parts = [];
  let score = 50;

  /* Rule 3, as a preference. A high-focus task in a focus window is the single
   * strongest signal this scheduler has, and it is the reason the app exists. */
  if (item.focusRequirement === 'high') {
    const window = (ctx.focusWindows || []).find((w) => start >= w.start - GRID && start < w.end);
    if (window) {
      score += 30;
      parts.push({ weight: 30, text: 'זה חופף לחלון הריכוז החזק ביותר שלך' });
    } else {
      const focus = meanOver(ctx.focus, start, end);
      const gain = (focus - 55) * 0.5;
      score += gain;
      if (gain > 6) parts.push({ weight: gain, text: `הריכוז שלך צפוי להיות טוב יחסית בשעה הזו` });
    }
  } else if (item.focusRequirement === 'medium') {
    score += (meanOver(ctx.focus, start, end) - 55) * 0.25;
  }

  if (item.energyRequirement === 'high') {
    const energy = meanOver(ctx.energy, start, end);
    const gain = (energy - 55) * 0.4;
    score += gain;
    if (gain > 6) parts.push({ weight: gain, text: 'האנרגיה שלך צפויה להיות גבוהה בשעה הזו' });
  } else if (item.energyRequirement === 'low') {
    // Low-demand work is worth putting where the good hours are not, so it does
    // not spend a focus window on tidying.
    const energy = meanOver(ctx.energy, start, end);
    score += (60 - energy) * 0.12;
  }

  const prefer = item.preferredTime;
  if (prefer && prefer !== 'any') {
    const hour = Math.floor((start % 1440) / 60);
    const inBand = (prefer === 'morning' && hour < 12)
      || (prefer === 'afternoon' && hour >= 12 && hour < 17)
      || (prefer === 'evening' && hour >= 17);
    if (inBand) {
      score += 12;
      parts.push({ weight: 12, text: 'זה בחלק של היום שביקשת' });
    } else score -= 10;
  }

  /* A deadline tomorrow pulls work earlier — the later it sits, the less room
   * there is for it to slip and still get done. */
  if (item.deadline && item.deadline === ctx.date) {
    const lateness = (start - ctx.plan.wake) / Math.max(60, dayBounds(ctx.plan).to - ctx.plan.wake);
    score -= lateness * 18;
    if (lateness < 0.4) parts.push({ weight: 8, text: 'הדדליין הוא היום, אז עדיף מוקדם' });
  }

  /* Keep demanding work apart. Two hard things separated by twenty minutes is
   * technically legal and is the arrangement people actually fail at. */
  if (isDemanding(item)) {
    for (const o of others) {
      if (!isDemanding(o)) continue;
      const gap = start >= o.start + o.duration ? start - (o.start + o.duration)
        : (o.start >= end ? o.start - end : 0);
      if (gap > 0 && gap < 45) score -= (45 - gap) * 0.25;
    }
  }

  /* Don't split a long open stretch down the middle. Two ninety-minute gaps are
   * worth much less than one three-hour one, and the day only has so many. */
  const slot = (ctx.__slots || []).find((s) => start >= s.start && end <= s.end);
  if (slot) {
    const before = start - slot.start;
    const after = slot.end - end;
    if (before > 20 && after > 20) score -= 8;
    if (before <= 20) score += 4;
  }

  parts.sort((a, b) => b.weight - a.weight);
  return { score, reason: parts.length ? parts[0].text : 'זה החלון הפנוי שמתאים ביותר למשימה הזו' };
}

/**
 * Where this should go, or null if nowhere honest is available.
 *
 * Returning null is a real answer. A day with no room should say so — the
 * interface offers to move something instead — rather than being handed the
 * least-bad slot dressed up as a recommendation.
 */
export function suggestSlot(item, ctx) {
  const others = scheduled((ctx.items || []).filter((i) => i.id !== item.id));
  const plan = ctx.plan;
  const date = ctx.date;

  /* Schedule the honest length, not the optimistic one. This is where duration
   * learning reaches the calendar: if this kind of task runs forty per cent
   * long, the slot it needs is forty per cent longer. */
  const learned = estimateDuration(item, ctx.learning || {});
  const want = Object.assign({}, item, {
    duration: Math.max(item.duration, Math.round(learned.minutes / 5) * 5),
  });

  const slots = freeSlots(others, plan, { minMinutes: want.duration });
  if (!slots.length) return null;

  const scoring = Object.assign({}, ctx, { __slots: slots });
  let best = null;

  for (const slot of slots) {
    const first = Math.ceil(slot.start / GRID) * GRID;
    for (let start = first; start + want.duration <= slot.end; start += GRID) {
      if (!allowed(want, start, others, plan, date)) continue;
      const { score, reason } = scoreSlot(want, start, scoring, others);
      // Strictly greater, so an equally good earlier slot wins. Earlier is the
      // right tie-break: it leaves more of the day behind it.
      if (!best || score > best.score) best = { start, score, reason };
    }
  }

  if (!best) return null;
  return {
    start: best.start,
    score: Math.round(best.score),
    reason: best.reason,
    confidence: Math.round(clamp(40 + best.score * 0.5, 0, 95)),
    minutes: want.duration,
  };
}

/**
 * Put an item on the day, returning a new list.
 *
 * `placed` is false when there was nowhere for it; the item comes back in the
 * list unscheduled rather than being dropped, because losing somebody's task to
 * a full afternoon would be the worst possible outcome of asking for help.
 */
export function place(items, item, ctx) {
  const rest = items.filter((i) => i.id !== item.id).map((i) => Object.assign({}, i));
  const slot = suggestSlot(item, Object.assign({}, ctx, { items: rest }));
  const next = Object.assign({}, item, slot ? { start: slot.start } : { start: null });
  const out = rest.concat([next]).sort((a, b) => {
    if (a.start === null && b.start === null) return a.id < b.id ? -1 : 1;
    if (a.start === null) return 1;
    if (b.start === null) return -1;
    return (a.start - b.start) || (a.id < b.id ? -1 : 1);
  });
  return { items: out, placed: !!slot };
}

/**
 * What is wrong with putting this item exactly here, in Hebrew.
 *
 * Used by the editor when somebody types a time themselves. It reports rather
 * than refuses — the user is allowed to overlap two things on purpose — so the
 * strings are phrased as observations, not rejections.
 */
export function validatePlacement(items, item) {
  const out = [];
  if (!isNum(item.start)) return out;
  const others = scheduled(items.filter((i) => i.id !== item.id));
  const end = item.start + item.duration;

  for (const o of others) {
    const overlap = Math.min(end, o.start + o.duration) - Math.max(item.start, o.start);
    if (overlap > 0) out.push(`חופף ל"${o.title}" ב-${overlap} דקות`);
  }
  if (end > 1440) out.push('הפריט חוצה את חצות');

  for (const o of others) {
    if (!isDemanding(item) || !isDemanding(o)) continue;
    const gap = item.start >= o.start + o.duration ? item.start - (o.start + o.duration)
      : (o.start >= end ? o.start - end : -1);
    if (gap >= 0 && gap < BUFFER_DEMANDING) {
      out.push(`כמעט אין רווח בין זה לבין "${o.title}" — שתיהן משימות תובעניות`);
      break;
    }
  }
  return out;
}
