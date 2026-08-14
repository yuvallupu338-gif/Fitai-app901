/*
 * deadline.js — will this finish in time, and if not, by how much.
 *
 * The specification puts it plainly: if five hours remain before the deadline
 * and the work needs twelve, the app should say
 *
 *     "לפי ההערכות הנוכחיות חסרות לך בערך 7 שעות כדי לסיים בזמן."
 *
 * That sentence is only worth saying if both numbers are real. The right-hand
 * side is the sum of the open estimates, which is as honest as the estimates
 * are — and that is exactly why learn.js exists, so the app can eventually say
 * "your estimates run 40% light" instead of repeating them back with a
 * confidence they have not earned.
 *
 * The left-hand side is the harder number and the one usually got wrong.
 * "Hours until the deadline" is the wrong quantity: nobody works 24 hours a
 * day, and a deadline eight days out with two of them blocked by exams does
 * not have 192 hours in it. What goes in is the sum of the *usable* capacity
 * of each remaining day — working hours, minus what is already committed,
 * minus the buffer, minus rest days. That is a number a person recognises.
 */

import { today as todayIso, daysBetween, addDays } from '../core/time.js';
import { rangeCapacity } from './capacity.js';

const OPEN = (t) => t.status !== 'done' && t.status !== 'cancelled';

/** Estimated minutes of work still open in a set of tasks. */
export function remainingWork(tasks) {
  return (tasks || []).filter(OPEN).reduce((sum, t) => sum + Math.max(0, t.estimatedMinutes || 0), 0);
}

/**
 * Feasibility of finishing a body of work by a date.
 *
 * Returns `ok: null` when there is no deadline — not `true`. There is a real
 * difference between "will make it" and "there is nothing to make", and a UI
 * that renders the second as a green tick is lying quietly.
 */
export function feasibility(opts) {
  const { dueDate, tasks } = opts;
  const from = opts.today || todayIso();

  const needed = remainingWork(tasks);

  if (!dueDate) {
    return { ok: null, code: 'noDeadline', needed, available: null, shortfall: 0, daysLeft: null };
  }

  const daysLeft = daysBetween(from, dueDate);

  if (daysLeft < 0) {
    return {
      ok: false, code: 'past', needed, available: 0, shortfall: needed, daysLeft, overdueBy: Math.abs(daysLeft),
    };
  }

  /* Capacity from today through the deadline, inclusive. Excluding the
   * deadline day itself is a common off-by-one that costs a working day at
   * exactly the moment it is most needed. */
  const capacity = rangeCapacity(from, dueDate, opts.context || {});
  const available = capacity.totalRemaining;

  const shortfall = Math.max(0, needed - available);
  const ratio = available > 0 ? needed / available : (needed > 0 ? Infinity : 0);

  return {
    ok: shortfall === 0,
    code: shortfall === 0 ? 'fits' : 'short',
    needed,
    available,
    shortfall,
    surplus: Math.max(0, available - needed),
    ratio,
    daysLeft,
    capacity,
  };
}

/**
 * Deadline pressure as a 0–1 risk, for the health calculation.
 *
 *   < 0.6  comfortable — more than a third of the remaining capacity is spare
 *   < 0.85 tight
 *   < 1.0  very tight
 *   ≥ 1.0  does not fit
 *
 * The bands matter more than the number: "tight" and "very tight" call for
 * different sentences, and a single float leaves the interface to invent
 * thresholds of its own.
 */
export function deadlineRisk(feas) {
  if (!feas || feas.ok === null) return { level: 'none', ratio: 0 };
  if (feas.code === 'past') return { level: 'over', ratio: Infinity };
  const r = feas.ratio;
  if (r >= 1) return { level: 'over', ratio: r };
  if (r >= 0.85) return { level: 'veryTight', ratio: r };
  if (r >= 0.6) return { level: 'tight', ratio: r };
  return { level: 'comfortable', ratio: r };
}

/**
 * The four ways out of a shortfall, with the arithmetic already done.
 *
 * Offering "move the deadline" without saying to when, or "cut scope" without
 * saying how much, is offering somebody the same problem in a menu. Each
 * option here carries the number that makes it actionable.
 */
export function shortfallOptions(feas, opts) {
  if (!feas || feas.ok !== false) return [];
  const context = (opts && opts.context) || {};
  const from = (opts && opts.today) || todayIso();
  const out = [];

  /* How many more days at the current daily rate would close the gap. */
  const days = Math.max(1, feas.daysLeft || 1);
  const perDay = feas.available > 0 ? feas.available / days : 0;
  if (perDay > 0) {
    const extraDays = Math.ceil(feas.shortfall / perDay);
    out.push({
      code: 'moveDeadline',
      extraDays,
      newDate: addDays(feas.daysLeft >= 0 ? (opts && opts.dueDate) || from : from, extraDays),
    });
  } else {
    out.push({ code: 'moveDeadline', extraDays: null, newDate: null });
  }

  out.push({ code: 'cutScope', minutes: feas.shortfall });

  /* Extra time per remaining day, if the person is willing to work longer. */
  out.push({
    code: 'addTime',
    minutesPerDay: Math.ceil(feas.shortfall / days),
    days,
  });

  out.push({ code: 'reprioritise', minutes: feas.shortfall, context: !!context });

  return out;
}

/**
 * Which open tasks to drop first to close a shortfall.
 *
 * Lowest priority first, and it stops the moment the gap is closed rather than
 * listing everything that could go. A suggestion to cut nine tasks when three
 * would do is a suggestion nobody acts on.
 */
export function scopeCutCandidates(tasks, shortfallMinutes, rankFn) {
  const open = (tasks || []).filter(OPEN);
  const ordered = rankFn ? rankFn(open).slice().reverse() : open.slice().sort(
    (a, b) => (a.importance || 3) - (b.importance || 3),
  );

  const chosen = [];
  let freed = 0;
  for (const task of ordered) {
    if (freed >= shortfallMinutes) break;
    chosen.push(task);
    freed += Math.max(0, task.estimatedMinutes || 0);
  }
  return { tasks: chosen, minutesFreed: freed, enough: freed >= shortfallMinutes };
}
