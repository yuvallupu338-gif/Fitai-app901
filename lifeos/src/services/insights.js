/*
 * insights.js — reviews and analytics.
 *
 * EVERY NUMBER ON THESE SCREENS IS RECOMPUTED FROM THE EVENT LOG.
 *
 * Not stored on the review record, not cached, not summarised at write time.
 * The reason is §199 — "אין מספרים מומצאים" — and the failure mode it is
 * guarding against is subtle: a stored statistic becomes a second source of
 * truth, and the moment somebody deletes a task or corrects a duration, the
 * review says one thing and the data says another. There is no way for a
 * person to tell which is wrong, so they stop trusting both.
 *
 * What IS stored on a review is what a person wrote — the reflection, the
 * decisions, the focus for next week. Those are facts about them, not
 * derivations, and recomputing them is not possible.
 *
 * WHY COMPLETIONS COME FROM THE LOG AND NOT FROM completedAt.
 *
 * A task completed, reopened and completed again has one completedAt and two
 * completions. A task completed last Tuesday and deleted on Friday has no
 * completedAt at all. "18 משימות הושלמו השבוע" is a claim about what happened,
 * and only an append-only log records what happened.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { ReviewSchema } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import {
  today as todayIso, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, daysInRange, isoDay, daysBetween,
} from '../core/time.js';
import { timeByArea, timeByGoal, goalAlignment } from '../engine/alignment.js';
import { estimateCalibration, stuckTasks, productiveWindows } from '../engine/learn.js';
import { goalProgress, goalMovement } from '../engine/progress.js';
import { habitStats } from '../engine/recurrence.js';
import { dayCapacity } from '../engine/capacity.js';

function instantOf(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Activity within a day range, as records. */
export function activityBetween(fromIso, toIso, types) {
  const snap = snapshot();
  const wanted = types ? new Set(types) : null;
  return snap.activity.filter((e) => {
    const day = isoDay(e.at);
    if (day < fromIso || day > toIso) return false;
    return !wanted || wanted.has(e.type);
  }).sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------------ *
 * Period statistics
 * ------------------------------------------------------------------ */

/**
 * The numbers behind a review. Pure derivation from the log plus the records.
 */
export function periodStats(fromIso, toIso) {
  const snap = snapshot();
  const days = daysInRange(fromIso, toIso);
  const events = activityBetween(fromIso, toIso);

  const completedEvents = events.filter((e) => e.type === 'TASK_COMPLETED');
  const focusEvents = events.filter((e) => e.type === 'FOCUS_COMPLETED');
  const milestoneEvents = events.filter((e) => e.type === 'MILESTONE_COMPLETED');
  const rescheduleEvents = events.filter((e) => e.type === 'TASK_RESCHEDULED');

  /* A task completed twice in the period counts once; the log has both, and
   * "18 tasks" should mean eighteen tasks. */
  const completedTaskIds = new Set(completedEvents.map((e) => e.payload.taskId).filter(Boolean));

  const focusMinutes = db.list('focusSessions', (s) => {
    if (!s.endedAt) return false;
    const day = s.date || isoDay(s.startedAt);
    return day >= fromIso && day <= toIso;
  }).reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

  /* Per-day series for the charts. Zero-filled, because a bar chart with
   * missing days silently redraws the week narrower and reads as a good week. */
  const byDay = days.map((day) => {
    const dayEvents = events.filter((e) => isoDay(e.at) === day);
    return {
      date: day,
      completed: new Set(
        dayEvents.filter((e) => e.type === 'TASK_COMPLETED').map((e) => e.payload.taskId),
      ).size,
      focusMinutes: db.list('focusSessions', (s) => s.endedAt && (s.date || isoDay(s.startedAt)) === day)
        .reduce((sum, s) => sum + (s.actualMinutes || 0), 0),
    };
  });

  /* Calendar load: how much of the available time was committed. */
  let capacityTotal = 0;
  let plannedTotal = 0;
  for (const day of days) {
    const cap = dayCapacity(day, snap);
    capacityTotal += cap.usableMinutes;
    plannedTotal += cap.plannedMinutes;
  }

  /* Deadlines that fell in the period, and whether they were met. */
  const dueInPeriod = snap.tasks.filter((t) => t.dueDate && t.dueDate >= fromIso && t.dueDate <= toIso);
  const metOnTime = dueInPeriod.filter(
    (t) => t.status === 'done' && t.completedAt && isoDay(t.completedAt) <= t.dueDate,
  );

  const habitRows = snap.habits.filter((hb) => hb.status === 'active').map((hb) => ({
    habit: hb,
    stats: habitStats(hb, snap.habitCompletions, { today: toIso, createdOn: isoDay(hb.createdAt) }),
    doneInPeriod: snap.habitCompletions.filter(
      (c) => c.habitId === hb.id && c.date >= fromIso && c.date <= toIso,
    ).length,
  }));

  return {
    from: fromIso,
    to: toIso,
    days: days.length,

    tasksCompleted: completedTaskIds.size,
    tasksRescheduled: rescheduleEvents.length,
    milestonesCompleted: milestoneEvents.length,
    focusMinutes,
    focusSessions: focusEvents.length,

    byDay,
    calendarLoad: capacityTotal > 0 ? Math.round((plannedTotal / capacityTotal) * 100) : 0,
    capacityMinutes: capacityTotal,
    plannedMinutes: plannedTotal,

    deadlinesDue: dueInPeriod.length,
    deadlinesMet: metOnTime.length,

    habits: habitRows,
    habitRate: habitRows.length
      ? Math.round(habitRows.reduce((s, r) => s + r.stats.rate7.pct, 0) / habitRows.length)
      : null,

    timeByArea: timeByArea(Object.assign({}, snap, { fromDate: fromIso, toDate: toIso })),
    timeByGoal: timeByGoal(Object.assign({}, snap, { fromDate: fromIso, toDate: toIso })),

    /* Which project moved most, by completed work rather than by percentage —
     * a project with two tasks jumping to 50% is not "the biggest move". */
    projectMovement: projectMovement(fromIso, toIso, snap),
    goalMovement: snap.goals.filter((g) => g.status === 'active').map((g) => ({
      goal: g,
      progress: goalProgress(g, snap),
      movement: goalMovement(g, snap.activity, instantOf(fromIso), snap),
    })),

    empty: completedTaskIds.size === 0 && focusMinutes === 0 && milestoneEvents.length === 0,
  };
}

function projectMovement(fromIso, toIso, snap) {
  const byProject = new Map();
  for (const e of snap.activity) {
    const day = isoDay(e.at);
    if (day < fromIso || day > toIso) continue;
    const pid = e.payload && e.payload.projectId;
    if (!pid) continue;
    const row = byProject.get(pid) || { projectId: pid, tasks: 0, milestones: 0, minutes: 0 };
    if (e.type === 'TASK_COMPLETED') { row.tasks += 1; row.minutes += e.payload.minutes || 0; }
    if (e.type === 'MILESTONE_COMPLETED') row.milestones += 1;
    byProject.set(pid, row);
  }
  return Array.from(byProject.values())
    .map((row) => Object.assign(row, { project: snap.projectsById.get(row.projectId) }))
    .filter((row) => row.project)
    .sort((a, b) => (b.milestones * 3 + b.tasks) - (a.milestones * 3 + a.tasks));
}

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

export function weekBounds(anchorIso, weekStartsOn) {
  const anchor = anchorIso || todayIso();
  const start = weekStartsOn === undefined ? 0 : weekStartsOn;
  return { from: startOfWeek(anchor, start), to: endOfWeek(anchor, start) };
}

export function monthBounds(anchorIso) {
  const anchor = anchorIso || todayIso();
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** The whole weekly review — statistics plus whatever was written. */
export function weeklyReview(anchorIso) {
  const snap = snapshot();
  const bounds = weekBounds(anchorIso, snap.profile.weekStartsOn);
  const stats = periodStats(bounds.from, bounds.to);
  const stored = db.list('reviews', (r) => r.period === 'week' && r.fromDate === bounds.from)[0] || null;

  return {
    period: 'week',
    bounds,
    stats,
    stored,
    needsAttention: snap.projects
      .filter((p) => p.status !== 'done')
      .map((p) => ({ project: p, health: snap.health.get(p.id) }))
      .filter((row) => row.health && (row.health.health === 'at_risk' || row.health.health === 'blocked'))
      .slice(0, 3),
    biggestMove: stats.projectMovement[0] || null,
    stuck: stuckTasks(snap.tasks).slice(0, 3),
    alignment: goalAlignment(Object.assign({}, snap, { period: 'week', weekStartsOn: snap.profile.weekStartsOn })),
  };
}

export function monthlyReview(anchorIso) {
  const snap = snapshot();
  const bounds = monthBounds(anchorIso);
  const stats = periodStats(bounds.from, bounds.to);
  const stored = db.list('reviews', (r) => r.period === 'month' && r.fromDate === bounds.from)[0] || null;

  return {
    period: 'month',
    bounds,
    stats,
    stored,
    goalsMoved: stats.goalMovement.filter((row) => row.movement.moved),
    goalsStuck: stats.goalMovement.filter((row) => !row.movement.moved),
    projectsCompleted: snap.projects.filter(
      (p) => p.completedAt && isoDay(p.completedAt) >= bounds.from && isoDay(p.completedAt) <= bounds.to,
    ),
    alignment: goalAlignment(Object.assign({}, snap, { period: 'month' })),
    calibration: estimateCalibration(snap),
  };
}

/** Save the written parts of a review. */
export function saveReview(period, bounds, input) {
  const parsed = ReviewSchema.parse(Object.assign({
    period, fromDate: bounds.from, toDate: bounds.to,
  }, input), '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

  const existing = db.list('reviews', (r) => r.period === period && r.fromDate === bounds.from)[0];
  const review = existing
    ? db.update('reviews', existing.id, parsed.value)
    : db.batch(() => {
      const created = db.insert('reviews', parsed.value);
      db.logEvent('REVIEW_CREATED', { reviewId: created.id, period, from: bounds.from });
      return created;
    });
  return { ok: true, review };
}

/* ------------------------------------------------------------------ *
 * Progress screen
 * ------------------------------------------------------------------ */

export function timeAllocation(period) {
  const snap = snapshot();
  const bounds = period === 'month' ? monthBounds() : weekBounds(null, snap.profile.weekStartsOn);
  const minutes = timeByArea(Object.assign({}, snap, { fromDate: bounds.from, toDate: bounds.to }));

  const rows = [];
  let total = 0;
  for (const [areaId, mins] of minutes) {
    if (mins <= 0) continue;
    total += mins;
    rows.push({ areaId, area: snap.areasById.get(areaId) || null, minutes: mins });
  }
  rows.sort((a, b) => b.minutes - a.minutes);
  for (const row of rows) row.pct = total > 0 ? Math.round((row.minutes / total) * 100) : 0;

  return { bounds, rows, totalMinutes: total, empty: total === 0 };
}

/** The activity feed, grouped by day. */
export function activityFeed(days) {
  const snap = snapshot();
  const from = addDays(snap.today, -(days || 14));
  const events = activityBetween(from, snap.today);

  const byDay = new Map();
  for (const e of events) {
    const day = isoDay(e.at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, events: list }));
}

/** What the app has noticed about estimates, for the progress screen. */
export function estimateAccuracy() {
  return estimateCalibration(snapshot());
}

export function focusPatterns() {
  return productiveWindows(snapshot());
}

/* ------------------------------------------------------------------ *
 * The evening wrap-up
 * ------------------------------------------------------------------ */

export function dayWrapUp(dayIso) {
  const snap = snapshot();
  const day = dayIso || snap.today;
  const events = activityBetween(day, day);

  const completedIds = new Set(
    events.filter((e) => e.type === 'TASK_COMPLETED').map((e) => e.payload.taskId),
  );
  const moved = events.filter((e) => e.type === 'TASK_RESCHEDULED' && e.payload.to && e.payload.to > day);
  const focusMinutes = db.list('focusSessions', (s) => s.endedAt && (s.date || isoDay(s.startedAt)) === day)
    .reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

  const movement = projectMovement(day, day, snap);

  const tomorrow = addDays(day, 1);
  const tomorrowTasks = snap.tasks
    .filter((t) => t.scheduledDate === tomorrow && t.status !== 'done' && t.status !== 'cancelled')
    .sort((a, b) => (a.scheduledStart || 9999) - (b.scheduledStart || 9999));

  return {
    date: day,
    completedCount: completedIds.size,
    movedCount: moved.length,
    focusMinutes,
    topProject: movement[0] ? movement[0].project : null,
    tomorrowFocus: tomorrowTasks[0] || null,
    tomorrowCount: tomorrowTasks.length,
  };
}

export { daysBetween, goalAlignment, stuckTasks };
