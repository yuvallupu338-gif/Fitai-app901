/*
 * alignment.js — does the time actually go where the priorities say it should.
 *
 * This is the question the specification builds towards in §129–131, and it is
 * the one thing a system like this can tell somebody that they cannot easily
 * tell themselves. Everyone knows what they said mattered. Almost nobody knows
 * where last month went.
 *
 *     goal A — priority 5 — 30 minutes this month
 *     goal B — priority 2 — 8 hours this month
 *
 * The observation is worth making. The tone is the whole design problem.
 *
 * TONE, DELIBERATELY.
 *
 * There is no score, no grade, and no red X. A misalignment is reported as a
 * fact about the calendar — "הזמן שהקדשת החודש לא ממש תואם לעדיפויות שהגדרת" —
 * and then it stops talking. Sometimes the honest answer is that the priority
 * was wrong, not the week; an app that assumes otherwise is nagging on the
 * strength of a number somebody typed once. Both actions offered are
 * symmetrical: give it time, or change what it is worth.
 *
 * Nothing here fires below a real amount of recorded time. Telling somebody
 * their week was misaligned when the week contains forty minutes of data is
 * noise dressed as insight.
 */

import { addDays, today as todayIso, isoDay, startOfWeek, startOfMonth } from '../core/time.js';

const MIN_TOTAL_MINUTES = 120;

/**
 * Minutes spent per goal in a period, from focus sessions and completed tasks.
 *
 * Focus sessions are the strong signal — real recorded time. Completed tasks
 * with no session contribute their estimate, because a task finished without
 * the timer running still happened, and excluding it would systematically
 * under-count anyone who does not use focus mode.
 */
export function timeByGoal(opts) {
  const from = opts.fromDate;
  const to = opts.toDate || todayIso();

  const tasksById = new Map((opts.tasks || []).map((t) => [t.id, t]));
  const projectsById = new Map((opts.projects || []).map((p) => [p.id, p]));

  function goalOf(task) {
    if (!task) return null;
    if (task.goalId) return task.goalId;
    const project = task.projectId ? projectsById.get(task.projectId) : null;
    return project ? project.goalId : null;
  }

  const minutes = new Map();
  const counted = new Set();

  for (const s of opts.focusSessions || []) {
    const day = s.date || (s.endedAt ? isoDay(s.endedAt) : null);
    if (!day || day < from || day > to) continue;
    const task = s.taskId ? tasksById.get(s.taskId) : null;
    const goalId = goalOf(task);
    if (!goalId) continue;
    minutes.set(goalId, (minutes.get(goalId) || 0) + (s.actualMinutes || 0));
    if (s.taskId) counted.add(s.taskId);
  }

  for (const task of opts.tasks || []) {
    if (task.status !== 'done' || !task.completedAt) continue;
    if (counted.has(task.id)) continue;
    const day = isoDay(task.completedAt);
    if (day < from || day > to) continue;
    const goalId = goalOf(task);
    if (!goalId) continue;
    minutes.set(goalId, (minutes.get(goalId) || 0) + (task.estimatedMinutes || 0));
  }

  return minutes;
}

/** The same, per area — what the time-allocation chart draws. */
export function timeByArea(opts) {
  const from = opts.fromDate;
  const to = opts.toDate || todayIso();

  const tasksById = new Map((opts.tasks || []).map((t) => [t.id, t]));
  const projectsById = new Map((opts.projects || []).map((p) => [p.id, p]));
  const goalsById = new Map((opts.goals || []).map((g) => [g.id, g]));

  function areaOf(task) {
    if (!task) return null;
    if (task.areaId) return task.areaId;
    const project = task.projectId ? projectsById.get(task.projectId) : null;
    if (project && project.areaId) return project.areaId;
    const goal = task.goalId ? goalsById.get(task.goalId) : (project ? goalsById.get(project.goalId) : null);
    return goal ? goal.areaId : null;
  }

  const minutes = new Map();
  const counted = new Set();

  for (const s of opts.focusSessions || []) {
    const day = s.date || (s.endedAt ? isoDay(s.endedAt) : null);
    if (!day || day < from || day > to) continue;
    const areaId = areaOf(s.taskId ? tasksById.get(s.taskId) : null) || '_none';
    minutes.set(areaId, (minutes.get(areaId) || 0) + (s.actualMinutes || 0));
    if (s.taskId) counted.add(s.taskId);
  }

  for (const task of opts.tasks || []) {
    if (task.status !== 'done' || !task.completedAt) continue;
    if (counted.has(task.id)) continue;
    const day = isoDay(task.completedAt);
    if (day < from || day > to) continue;
    const areaId = areaOf(task) || '_none';
    minutes.set(areaId, (minutes.get(areaId) || 0) + (task.estimatedMinutes || 0));
  }

  /* Habits are time too, and leaving them out makes the fitness area look
   * empty for somebody who trains four times a week. */
  const habitsById = new Map((opts.habits || []).map((hb) => [hb.id, hb]));
  for (const c of opts.habitCompletions || []) {
    if (c.date < from || c.date > to) continue;
    const habit = habitsById.get(c.habitId);
    if (!habit || !habit.areaId) continue;
    const spent = c.minutes || habit.estimatedMinutes || 0;
    minutes.set(habit.areaId, (minutes.get(habit.areaId) || 0) + spent);
  }

  return minutes;
}

/**
 * Compare declared priority against recorded time.
 *
 * `period` is 'week' or 'month' and only affects the window and the wording
 * key the interface uses.
 */
export function goalAlignment(opts) {
  const today = opts.today || todayIso();
  const period = opts.period || 'month';
  const from = period === 'week'
    ? startOfWeek(today, opts.weekStartsOn === undefined ? 0 : opts.weekStartsOn)
    : startOfMonth(today);

  const minutes = timeByGoal(Object.assign({}, opts, { fromDate: from, toDate: today }));
  const total = Array.from(minutes.values()).reduce((s, m) => s + m, 0);

  const goals = (opts.goals || []).filter((g) => g.status === 'active');
  if (!goals.length) return { ok: false, code: 'noGoals', period, from, total };
  if (total < MIN_TOTAL_MINUTES) {
    return { ok: false, code: 'notEnoughData', period, from, total, needed: MIN_TOTAL_MINUTES };
  }

  /* Expected share: a goal's priority as a fraction of all active priorities.
   * Crude on purpose — the alternative is a model of how much time a goal
   * "should" take, which nobody has and which would be wrong. */
  const prioritySum = goals.reduce((s, g) => s + (g.priority || 3), 0);

  const rows = goals.map((goal) => {
    const spent = minutes.get(goal.id) || 0;
    const expectedShare = (goal.priority || 3) / prioritySum;
    const actualShare = total > 0 ? spent / total : 0;
    return {
      goal,
      minutes: spent,
      expectedShare,
      actualShare,
      /* Positive = more time than its priority implies. */
      delta: actualShare - expectedShare,
    };
  });

  /* Flag only high-priority goals that got very little. A low-priority goal
   * absorbing time is usually a person choosing to do something enjoyable,
   * and that is not a defect worth a notification. */
  const starved = rows
    .filter((r) => (r.goal.priority || 3) >= 4)
    .filter((r) => r.actualShare < r.expectedShare * 0.4)
    .sort((a, b) => a.actualShare - b.actualShare);

  return {
    ok: true,
    period,
    from,
    to: today,
    total,
    rows: rows.sort((a, b) => b.minutes - a.minutes),
    starved,
    misaligned: starved.length > 0,
  };
}

/**
 * §132 — should I start another project?
 *
 * Facts, then one sentence of advice. The facts are the answer; the sentence
 * is a courtesy. A person who reads "יש לך כרגע 4 פרויקטים פעילים, והזמן הפנוי
 * השבוע הוא 6 שעות מול 14 שעות שכבר התחייבת אליהן" does not need to be told
 * what to do.
 */
export function projectLoadAdvice(opts) {
  const projects = (opts.projects || []).filter(
    (p) => p.status !== 'done' && p.status !== 'paused',
  );

  const openTasks = (opts.tasks || []).filter(
    (t) => t.status !== 'done' && t.status !== 'cancelled' && !t.someday,
  );
  const committedMinutes = openTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);

  const weekCapacity = opts.weekCapacityMinutes || 0;

  /* Four is not a magic number; it is where a person stops being able to hold
   * the state of every project in their head, which is when projects start
   * going stale rather than getting finished. Combined with the capacity
   * comparison, not instead of it. */
  const crowded = projects.length >= 4;
  const overCommitted = weekCapacity > 0 && committedMinutes > weekCapacity * 3;

  return {
    activeProjects: projects.length,
    committedMinutes,
    weekCapacityMinutes: weekCapacity,
    crowded,
    overCommitted,
    verdict: crowded || overCommitted ? 'wait' : 'ok',
    atRisk: projects.filter((p) => opts.atRiskProjectIds && opts.atRiskProjectIds.has(p.id)).length,
  };
}

export { addDays };
