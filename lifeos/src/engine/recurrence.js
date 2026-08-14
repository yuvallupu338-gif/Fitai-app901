/*
 * recurrence.js — repeating tasks and habit schedules.
 *
 * NOTHING IS MATERIALISED IN ADVANCE.
 *
 * The obvious implementation of "every Sunday" is to write a year of task
 * records at creation time. It is also the implementation that turns editing
 * the title into editing fifty-two rows, makes "delete this one" and "delete
 * the series" indistinguishable, and puts several thousand rows into a five
 * megabyte store for a person who set up eight recurring tasks.
 *
 * Instead a recurring task is one record with a rule. The next occurrence is
 * computed when it is needed, and a concrete record is created only at the
 * moment one is completed — so history is real and the future is a function.
 *
 * A HABIT IS NOT A RECURRING TASK, AND THE DIFFERENCE IS NOT COSMETIC.
 *
 * "לשלוח דוח כל יום ראשון" is a recurring task: it has an occurrence, the
 * occurrence can be late, and missing it leaves something undone. "לקרוא" is a
 * habit: there is no backlog of unread days, and yesterday's miss does not
 * become today's overdue item. They live in different collections because
 * treating a habit as a task manufactures guilt out of nothing, which is
 * exactly what §46 is about.
 */

import { addDays, addMonths, dayOfWeek, today as todayIso, parseIso } from '../core/time.js';

/**
 * The first occurrence on or after `fromIso`.
 * Returns null for a non-recurring task or one whose series has ended.
 */
export function nextOccurrence(task, fromIso) {
  const from = fromIso || todayIso();
  if (!task.recurrence || task.recurrence === 'none') return null;
  if (task.recurrenceUntil && from > task.recurrenceUntil) return null;

  const anchor = task.scheduledDate || task.dueDate || task.createdAtDate || from;
  let candidate;

  switch (task.recurrence) {
    case 'daily':
      candidate = from;
      break;

    case 'weekly': {
      const days = (task.recurrenceDays && task.recurrenceDays.length)
        ? task.recurrenceDays.slice().sort((a, b) => a - b)
        : [dayOfWeek(anchor)];
      const current = dayOfWeek(from);
      let best = null;
      for (const d of days) {
        const delta = (d - current + 7) % 7;
        if (best === null || delta < best) best = delta;
      }
      candidate = addDays(from, best === null ? 0 : best);
      break;
    }

    case 'monthly': {
      const anchorDay = parseIso(anchor) ? parseIso(anchor).day : parseIso(from).day;
      const f = parseIso(from);
      /* Clamp to the month's length: a task set for the 31st recurs on the
       * 28th in February rather than skipping the month, which is what a
       * person setting up a month-end task means. */
      const lastThis = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
      const thisMonth = `${f.year}-${pad2(f.month)}-${pad2(Math.min(anchorDay, lastThis))}`;
      candidate = thisMonth >= from ? thisMonth : clampedNextMonth(from, anchorDay);
      break;
    }

    default:
      return null;
  }

  if (task.recurrenceUntil && candidate > task.recurrenceUntil) return null;
  return candidate;
}

function pad2(n) { return n < 10 ? `0${n}` : String(n); }

function clampedNextMonth(fromIso, anchorDay) {
  const next = addMonths(`${fromIso.slice(0, 8)}01`, 1);
  const p = parseIso(next);
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return `${p.year}-${pad2(p.month)}-${pad2(Math.min(anchorDay, last))}`;
}

/** Occurrences in a range, capped so a daily rule over a year cannot run away. */
export function occurrencesBetween(task, fromIso, toIso, cap) {
  const limit = cap || 200;
  const out = [];
  let cursor = fromIso;
  let guard = 0;
  while (cursor && cursor <= toIso && out.length < limit && guard < 500) {
    const next = nextOccurrence(task, cursor);
    if (!next || next > toIso) break;
    out.push(next);
    cursor = addDays(next, 1);
    guard += 1;
  }
  return out;
}

/**
 * Advance a completed recurring task to its next occurrence.
 *
 * Returns the patch to apply, or null when the series is over. The completed
 * instance is recorded separately by the caller, so the history keeps a real
 * record of each time it was done rather than a counter.
 */
export function advanceAfterCompletion(task, completedOnIso) {
  const from = addDays(completedOnIso || todayIso(), 1);
  const next = nextOccurrence(task, from);
  if (!next) return null;
  return {
    status: task.scheduledDate ? 'planned' : 'ready',
    completedAt: null,
    scheduledDate: task.scheduledDate ? next : null,
    dueDate: task.dueDate ? next : null,
    /* The postpone counter measures avoidance, and a recurrence rolling over
     * is not avoidance. Resetting it stops the stuck-task detector from
     * flagging every long-running weekly task as abandoned. */
    postponeCount: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Habit schedules
 * ------------------------------------------------------------------ */

/** Is this habit meant to happen on this day? */
export function habitDueOn(habit, dayIso) {
  if (habit.status !== 'active') return false;
  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'specific_days':
      return (habit.days || []).includes(dayOfWeek(dayIso));
    case 'weekly':
      /* A weekly target is "four times this week", not "on Tuesdays". Every day
       * is a candidate; whether it is still needed depends on how many have
       * already been done, which is the caller's question. */
      return true;
    default:
      return false;
  }
}

/** How many more times this week a weekly-target habit still needs doing. */
export function habitRemainingThisWeek(habit, completions, weekDaysIso) {
  if (habit.frequency !== 'weekly') return null;
  const done = new Set(
    completions
      .filter((c) => c.habitId === habit.id && weekDaysIso.includes(c.date))
      .map((c) => c.date),
  );
  return Math.max(0, (habit.target || 7) - done.size);
}

/* ------------------------------------------------------------------ *
 * Habit statistics
 *
 * §47 is explicit that a streak is one metric among several, and the reason
 * matters: a streak is the metric that punishes. Somebody who reads six days
 * out of seven for a year has an excellent habit and a streak of one. The rate
 * over 7 and 30 days, the weekly average and the trend all describe that
 * person accurately; only the streak calls them a failure.
 * ------------------------------------------------------------------ */

export function habitStats(habit, completions, opts) {
  const o = opts || {};
  const end = o.today || todayIso();
  const byDate = new Map();
  for (const c of completions) {
    if (c.habitId !== habit.id) continue;
    /* A day done both ways keeps the fuller one. */
    const prev = byDate.get(c.date);
    if (!prev || (prev.minimum && !c.minimum)) byDate.set(c.date, c);
  }

  function rate(days) {
    let expected = 0;
    let done = 0;
    for (let i = 0; i < days; i += 1) {
      const day = addDays(end, -i);
      /* Days before the habit existed are not misses. */
      if (o.createdOn && day < o.createdOn) continue;
      if (habit.frequency === 'weekly') expected += (habit.target || 7) / 7;
      else if (habitDueOn(habit, day)) expected += 1;
      if (byDate.has(day)) done += 1;
    }
    return { expected: Math.round(expected), done, pct: expected > 0 ? Math.round((done / expected) * 100) : 0 };
  }

  const r7 = rate(7);
  const r30 = rate(30);

  /* Current streak, counting only days the habit was actually due. A habit due
   * on Sundays does not break its streak on a Monday. */
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const day = addDays(end, -i);
    if (o.createdOn && day < o.createdOn) break;
    if (habit.frequency !== 'weekly' && !habitDueOn(habit, day)) continue;
    if (byDate.has(day)) streak += 1;
    else if (i === 0) continue; /* today is not a miss until it is over */
    else break;
  }

  let best = 0;
  let run = 0;
  const dates = Array.from(byDate.keys()).sort();
  for (let i = 0; i < dates.length; i += 1) {
    if (i > 0 && addDays(dates[i - 1], 1) === dates[i]) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }

  /* Trend compares the last fortnight to the fortnight before it. Below eight
   * observations there is no trend, only noise, and saying so is better than
   * drawing an arrow. */
  const recent = rate(14);
  let previous = { done: 0, expected: 0 };
  {
    let expected = 0;
    let done = 0;
    for (let i = 14; i < 28; i += 1) {
      const day = addDays(end, -i);
      if (o.createdOn && day < o.createdOn) continue;
      if (habit.frequency === 'weekly') expected += (habit.target || 7) / 7;
      else if (habitDueOn(habit, day)) expected += 1;
      if (byDate.has(day)) done += 1;
    }
    previous = { done, expected: Math.round(expected) };
  }

  let trend = 'unknown';
  if (recent.done + previous.done >= 8 && previous.expected > 0 && recent.expected > 0) {
    const a = recent.done / recent.expected;
    const b = previous.done / previous.expected;
    if (a > b + 0.12) trend = 'up';
    else if (a < b - 0.12) trend = 'down';
    else trend = 'flat';
  }

  const weeklyAverage = r30.done > 0 ? Math.round((r30.done / 30) * 7 * 10) / 10 : 0;

  return {
    rate7: r7,
    rate30: r30,
    streak,
    bestStreak: best,
    weeklyAverage,
    trend,
    totalDone: byDate.size,
    minimumCount: Array.from(byDate.values()).filter((c) => c.minimum).length,
    doneToday: byDate.has(end),
    todayEntry: byDate.get(end) || null,
  };
}
