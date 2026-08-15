/*
 * progress.js — how far along a goal or a project is.
 *
 * A PERCENTAGE HAS TO COME FROM SOMEWHERE NAMEABLE.
 *
 * Every number this file returns carries the basis it was computed from, and
 * the interface shows it: "4 מתוך 7 אבני דרך", not a bare 57% that a person
 * has to take on faith. That constraint is what keeps the progress bar honest.
 * It is trivially easy to produce a plausible-looking percentage from a
 * weighted blend of four signals; it is also useless, because when it says 60%
 * and the person feels 20%, there is no way to find out which of them is wrong.
 *
 * A goal declares which basis it uses, because different goals genuinely
 * measure differently:
 *
 *   milestones — the default. Meaningful checkpoints, unevenly sized, which
 *                is fine: five milestones is five real steps.
 *   tasks      — for goals where the work is a flat list. Counts by estimated
 *                minutes rather than by task count, so finishing eight
 *                five-minute tasks does not read as more progress than
 *                finishing the four-hour one.
 *   metric     — "12 ספרים". The only one where progress is not an inference.
 *   manual     — a slider. For goals whose progress a person can judge and an
 *                app cannot, like "להשתפר במתמטיקה".
 */

const OPEN = (t) => t.status !== 'done' && t.status !== 'cancelled';
const DONE = (t) => t.status === 'done';

/** Weight a task by its size, with a floor so an unestimated task still counts. */
function weightOf(task) {
  return Math.max(5, task.estimatedMinutes || 25);
}

export function taskProgress(tasks) {
  const relevant = tasks.filter((t) => t.status !== 'cancelled');
  if (!relevant.length) return { pct: 0, basis: 'tasks', done: 0, total: 0, minutesDone: 0, minutesTotal: 0 };

  const total = relevant.reduce((s, t) => s + weightOf(t), 0);
  const done = relevant.filter(DONE).reduce((s, t) => s + weightOf(t), 0);

  return {
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    basis: 'tasks',
    done: relevant.filter(DONE).length,
    total: relevant.length,
    minutesDone: done,
    minutesTotal: total,
  };
}

export function milestoneProgress(milestones) {
  const total = milestones.length;
  if (!total) return { pct: 0, basis: 'milestones', done: 0, total: 0 };
  const done = milestones.filter((m) => !!m.completedAt).length;
  return { pct: Math.round((done / total) * 100), basis: 'milestones', done, total };
}

/**
 * A project's progress.
 *
 * Milestones when it has them, tasks otherwise. Milestones win because a
 * project with milestones has had someone think about what its real stages
 * are, and that judgement beats counting checkboxes.
 */
export function projectProgress(project, tasks, milestones) {
  if (project.status === 'done') {
    return { pct: 100, basis: milestones.length ? 'milestones' : 'tasks', done: 0, total: 0, complete: true };
  }
  if (milestones && milestones.length) return milestoneProgress(milestones);
  return taskProgress(tasks || []);
}

/**
 * A goal's progress, by whichever basis it declares.
 *
 * The milestones basis rolls up every milestone across every project under the
 * goal, rather than averaging per-project percentages. Averaging percentages
 * over unequal projects is the classic way to report that a goal is 50% done
 * when one project of nine milestones is untouched and one project of one
 * milestone is finished.
 */
export function goalProgress(goal, ctx) {
  const projects = (ctx.projects || []).filter((p) => p.goalId === goal.id);
  const projectIds = new Set(projects.map((p) => p.id));
  const tasks = (ctx.tasks || []).filter((t) => t.goalId === goal.id || projectIds.has(t.projectId));
  const milestones = (ctx.milestones || []).filter((m) => projectIds.has(m.projectId));

  if (goal.status === 'achieved') {
    return { pct: 100, basis: goal.progressSource, complete: true, projects: projects.length };
  }

  switch (goal.progressSource) {
    case 'manual':
      return {
        pct: Math.max(0, Math.min(100, goal.progressManual || 0)),
        basis: 'manual',
        projects: projects.length,
      };

    case 'metric': {
      const target = Number(goal.metricTarget) || 0;
      const current = Number(goal.metricCurrent) || 0;
      return {
        pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
        basis: 'metric',
        current,
        target,
        unit: goal.metricUnit || '',
        projects: projects.length,
      };
    }

    case 'tasks': {
      const p = taskProgress(tasks);
      return Object.assign(p, { projects: projects.length });
    }

    case 'milestones':
    default: {
      if (milestones.length) {
        const p = milestoneProgress(milestones);
        return Object.assign(p, { projects: projects.length });
      }
      /* Declared milestones, has none yet. Falling back to tasks is better
       * than reporting a flat zero for a goal somebody has been working on,
       * and the returned basis says which was used so the label matches. */
      const p = taskProgress(tasks);
      return Object.assign(p, { projects: projects.length, fellBack: true });
    }
  }
}

/**
 * Did this goal move in the period?
 *
 * Read from the event log rather than by diffing stored percentages, because
 * nothing stores a percentage history and adding one would mean a second
 * source of truth that can disagree with the first.
 */
export function goalMovement(goal, activity, sinceMs, ctx) {
  const projects = (ctx.projects || []).filter((p) => p.goalId === goal.id);
  const projectIds = new Set(projects.map((p) => p.id));
  const taskIds = new Set((ctx.tasks || [])
    .filter((t) => t.goalId === goal.id || projectIds.has(t.projectId))
    .map((t) => t.id));

  let tasksDone = 0;
  let milestonesDone = 0;
  let focusMinutes = 0;

  for (const e of activity || []) {
    if (e.at < sinceMs) continue;
    const p = e.payload || {};
    if (e.type === 'TASK_COMPLETED' && taskIds.has(p.taskId)) tasksDone += 1;
    if (e.type === 'MILESTONE_COMPLETED' && projectIds.has(p.projectId)) milestonesDone += 1;
    if (e.type === 'FOCUS_COMPLETED' && taskIds.has(p.taskId)) focusMinutes += p.minutes || 0;
  }

  return {
    tasksDone,
    milestonesDone,
    focusMinutes,
    moved: tasksDone > 0 || milestonesDone > 0 || focusMinutes > 0,
  };
}

export { OPEN, DONE };
