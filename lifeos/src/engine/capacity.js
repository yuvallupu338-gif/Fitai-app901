/*
 * capacity.js — how much of a day is actually free, and what is already in it.
 *
 * Everything the planner does rests on this file, and everything this file
 * does rests on one refusal: it never assumes a day is 1440 minutes long, and
 * it never assumes the gap between 08:00 and 22:00 is 840 minutes. Twice a
 * year in Israel those assumptions are wrong by an hour, and the resulting bug
 * is invisible — a day quietly overbooked or underfilled, on a date nobody
 * will connect to daylight saving. realMinutesBetween() asks the calendar.
 *
 * WHAT COUNTS AS BUSY.
 *
 * Calendar events, always. Time blocks, always — including the ones the
 * planner itself created, which is what stops a second planning pass from
 * double-booking the slots the first one filled. All-day events, never: an
 * all-day event in practice means "this is happening today", not "every minute
 * today is spoken for", and treating it as the latter empties the day.
 *
 * BUFFER IS SUBTRACTED FROM CAPACITY, NOT ADDED TO ESTIMATES.
 *
 * The two are arithmetically similar and behaviourally different. Padding each
 * task's estimate makes the app lie about how long things take, and that lie
 * ends up in the estimate-accuracy statistics. Reserving a percentage of the
 * day leaves the estimates honest and puts the slack where it belongs — as
 * unassigned time a person can spend on the thing that always comes up.
 */

import {
  instantAt, subtractIntervals, mergeIntervals, totalMinutes, dayOfWeek,
  today as todayIso, nowMinutes, isoDay,
} from '../core/time.js';

/**
 * Wall-clock minutes between two times on a given day, as they will actually
 * elapse. 840 on a normal day for 08:00–22:00; 780 or 900 on the two days a
 * year when the clocks move inside that range.
 */
export function realMinutesBetween(dayIso, startMinutes, endMinutes) {
  const a = instantAt(dayIso, startMinutes);
  const b = instantAt(dayIso, endMinutes);
  if (a === null || b === null) return Math.max(0, endMinutes - startMinutes);
  return Math.max(0, Math.round((b - a) / 60000));
}

/** The working window for a day, from preferences. */
export function dayBounds(prefs) {
  const start = prefs && prefs.workStartMinutes !== null && prefs.workStartMinutes !== undefined
    ? prefs.workStartMinutes : 8 * 60;
  const end = prefs && prefs.workEndMinutes !== null && prefs.workEndMinutes !== undefined
    ? prefs.workEndMinutes : 22 * 60;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function isRestDay(dayIso, prefs) {
  const rest = (prefs && prefs.restDays) || [];
  return rest.includes(dayOfWeek(dayIso));
}

/**
 * Everything already committed on a day, as merged minute intervals.
 * Pass `ignoreBlockIds` when replanning, so the blocks being reconsidered do
 * not count as obstacles to their own rescheduling.
 */
export function busyIntervals(dayIso, ctx) {
  const out = [];

  for (const e of ctx.events || []) {
    if (e.date !== dayIso || e.allDay) continue;
    out.push({ start: e.startMinutes, end: e.endMinutes, kind: 'event', id: e.id, title: e.title });
  }

  const ignore = ctx.ignoreBlockIds ? new Set(ctx.ignoreBlockIds) : null;
  for (const b of ctx.blocks || []) {
    if (b.date !== dayIso) continue;
    if (ignore && ignore.has(b.id)) continue;
    out.push({ start: b.startMinutes, end: b.endMinutes, kind: 'block', id: b.id, blockKind: b.kind, title: b.title });
  }

  return out.filter((i) => i.end > i.start);
}

/**
 * The gaps left in the working window.
 *
 * `fromMinutes` clips the past away — asked for "what is free today" at 14:30,
 * an answer that includes this morning is not an answer. Windows shorter than
 * minBlockMinutes are dropped: a seven-minute gap between two lessons is not
 * time anyone is going to start a task in, and offering it is how a plan stops
 * being believable.
 */
export function freeWindows(dayIso, ctx) {
  const prefs = ctx.preferences || {};
  if (!ctx.includeRestDays && isRestDay(dayIso, prefs)) return [];

  const bounds = dayBounds(prefs);
  const floor = ctx.fromMinutes === undefined || ctx.fromMinutes === null
    ? bounds.start
    : Math.max(bounds.start, ctx.fromMinutes);
  if (floor >= bounds.end) return [];

  const busy = busyIntervals(dayIso, ctx);
  const windows = subtractIntervals({ start: floor, end: bounds.end }, busy);

  const minBlock = prefs.minBlockMinutes || 15;
  return windows
    .map((w) => Object.assign({}, w, { minutes: realMinutesBetween(dayIso, w.start, w.end) }))
    .filter((w) => w.minutes >= minBlock);
}

/** How much work is already scheduled into the day, in minutes. */
export function plannedMinutes(dayIso, ctx) {
  let total = 0;
  for (const b of ctx.blocks || []) {
    if (b.date !== dayIso) continue;
    total += realMinutesBetween(dayIso, b.startMinutes, b.endMinutes);
  }
  /* Tasks scheduled to a day without a block — the flexible planning style
   * produces these — count against capacity too, or "plan the day" would
   * cheerfully add eight hours on top of them. */
  for (const t of ctx.tasks || []) {
    if (t.scheduledDate !== dayIso) continue;
    if (t.status === 'done' || t.status === 'cancelled') continue;
    const hasBlock = (ctx.blocks || []).some((b) => b.taskId === t.id && b.date === dayIso);
    if (!hasBlock) total += t.estimatedMinutes || 0;
  }
  return total;
}

/**
 * The full picture for one day.
 *
 *   freeMinutes   — gaps in the working window, before any reservation
 *   bufferMinutes — the share held back on purpose
 *   usableMinutes — what the planner is allowed to fill
 *   plannedMinutes— what is already committed
 *   overloadMinutes — how far past usable the commitments already go
 */
export function dayCapacity(dayIso, ctx) {
  const prefs = ctx.preferences || {};
  const windows = freeWindows(dayIso, ctx);
  const free = totalMinutes(windows.map((w) => ({ start: 0, end: w.minutes })));

  const bufferPct = Math.max(0, Math.min(50, prefs.bufferPct === undefined ? 15 : prefs.bufferPct));
  const buffer = Math.round(free * (bufferPct / 100));
  const usable = Math.max(0, free - buffer);

  /* The daily capacity setting is a ceiling on top of the calendar, not a
   * replacement for it. Someone with a wide-open Sunday and a 3-hour capacity
   * means three hours, and someone with a 3-hour capacity whose day is full of
   * lessons has less than three hours, not three. */
  const declared = prefs.dailyCapacityMinutes || null;
  const capped = declared ? Math.min(usable, declared) : usable;

  const planned = plannedMinutes(dayIso, ctx);

  return {
    date: dayIso,
    windows,
    freeMinutes: free,
    bufferMinutes: buffer,
    usableMinutes: capped,
    plannedMinutes: planned,
    remainingMinutes: Math.max(0, capped - planned),
    overloadMinutes: Math.max(0, planned - capped),
    isRestDay: isRestDay(dayIso, prefs),
    longestWindow: windows.reduce((max, w) => Math.max(max, w.minutes), 0),
  };
}

/** Capacity across a range, for feasibility checks and the weekly view. */
export function rangeCapacity(fromIso, toIso, ctx) {
  const days = [];
  let cursor = fromIso;
  let guard = 0;
  while (cursor <= toIso && guard < 400) {
    days.push(dayCapacity(cursor, ctx));
    cursor = addOneDay(cursor);
    guard += 1;
  }
  return {
    days,
    totalUsable: days.reduce((s, d) => s + d.usableMinutes, 0),
    totalPlanned: days.reduce((s, d) => s + d.plannedMinutes, 0),
    totalRemaining: days.reduce((s, d) => s + d.remainingMinutes, 0),
  };
}

function addOneDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * What is free between now and the end of today.
 * The question behind the "what should I do right now" button.
 */
export function remainingToday(ctx) {
  const day = ctx.today || todayIso();
  const from = ctx.nowMinutes === undefined ? nowMinutes() : ctx.nowMinutes;
  const windows = freeWindows(day, Object.assign({}, ctx, { fromMinutes: from }));
  return {
    date: day,
    fromMinutes: from,
    windows,
    minutes: totalMinutes(windows.map((w) => ({ start: 0, end: w.minutes }))),
    /* The window someone is standing in right now, if any. Its length is the
     * constraint on what can be suggested — not the day's total. */
    currentWindow: windows.find((w) => w.start <= from + 1) || windows[0] || null,
  };
}

/**
 * Conflicts worth telling somebody about.
 *
 * Overlap detection runs on raw intervals rather than merged ones, because the
 * point is to name both parties. Merging is right for arithmetic and wrong for
 * explanation.
 */
export function findConflicts(dayIso, ctx) {
  const items = busyIntervals(dayIso, ctx).slice().sort((a, b) => a.start - b.start);
  const conflicts = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[j].start >= items[i].end) break;
      conflicts.push({ kind: 'overlap', a: items[i], b: items[j] });
    }
  }

  const prefs = ctx.preferences || {};
  const bounds = dayBounds(prefs);
  for (const item of items) {
    if (item.start < bounds.start || item.end > bounds.end) {
      conflicts.push({ kind: 'outsideHours', a: item });
    }
  }

  if (isRestDay(dayIso, prefs) && items.some((i) => i.kind === 'block')) {
    conflicts.push({ kind: 'restDay', a: items.find((i) => i.kind === 'block') });
  }

  const cap = dayCapacity(dayIso, ctx);
  if (cap.overloadMinutes > 0) {
    conflicts.push({ kind: 'overload', minutes: cap.overloadMinutes, capacity: cap });
  }

  return conflicts;
}

/** Does this task fit in this window? Used by the fitting pass and the UI. */
export function fitsInWindow(task, window, dayIso) {
  const need = Math.max(5, task.estimatedMinutes || 25);
  const have = window.minutes !== undefined
    ? window.minutes
    : realMinutesBetween(dayIso, window.start, window.end);
  return have >= need;
}

export { totalMinutes, mergeIntervals, isoDay };
