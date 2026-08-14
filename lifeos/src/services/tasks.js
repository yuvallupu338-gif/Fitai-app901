/*
 * tasks.js — the task service. Capture, edit, complete, schedule, depend.
 *
 * Everything that writes a task goes through here, for two reasons that both
 * matter.
 *
 * The first is normalisation. A task's project, goal and area have to agree,
 * its completion timestamp has to match its status, and a scheduled time
 * without a scheduled date is meaningless. Those invariants are in
 * normaliseTask() and they are applied on every write, so there is no path
 * that produces a task in an impossible state.
 *
 * The second is the activity log. "18 משימות הושלמו השבוע" comes from the
 * event log, not from counting tasks with a completedAt in range — because
 * completedAt is overwritten when a task is completed twice, and a deleted
 * task takes its history with it. An append-only log of what happened is the
 * only structure that answers "what did I do last Tuesday" correctly, and it
 * is only correct if every mutation writes to it, which means every mutation
 * goes through one place.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { TaskSchema, normaliseTask, pickEditable, TASK_EDITABLE } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import { today as todayIso, addDays, isoDay } from '../core/time.js';
import { wouldCreateCycle, buildGraph, blockers, isBlocked, effectiveStatus } from '../engine/deps.js';
import { advanceAfterCompletion } from '../engine/recurrence.js';
import { parseCapture, guessProject } from '../engine/nlp.js';
import { rankTasks } from '../engine/priority.js';

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export function all() {
  return db.list('tasks');
}

export function byId(id) {
  return db.get('tasks', id);
}

export function open() {
  return db.list('tasks', (t) => t.status !== 'done' && t.status !== 'cancelled');
}

export function inbox() {
  return db.list('tasks', (t) => t.status === 'inbox' && !t.someday)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function someday() {
  return db.list('tasks', (t) => t.someday && t.status !== 'done' && t.status !== 'cancelled');
}

export function forProject(projectId) {
  return db.list('tasks', (t) => t.projectId === projectId);
}

export function forDay(dayIso) {
  return db.list('tasks', (t) => t.scheduledDate === dayIso);
}

export function overdue(refIso) {
  const ref = refIso || todayIso();
  return db.list('tasks', (t) => t.dueDate && t.dueDate < ref
    && t.status !== 'done' && t.status !== 'cancelled' && !t.someday);
}

/** Open tasks in priority order — the shared ordering the whole app displays. */
export function ranked(filter) {
  const snap = snapshot();
  const list = snap.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'
    && !t.someday && (!filter || filter(t)));
  return rankTasks(list, {
    weights: snap.preferences.weights,
    today: snap.today,
    graph: snap.graph,
    goalsById: snap.goalsById,
  });
}

/** The derived view of a task: real status, what blocks it, its score. */
export function decorate(task, snap) {
  const s = snap || snapshot();
  const status = effectiveStatus(s.graph, task);
  return {
    task,
    status,
    blocked: status === 'blocked',
    blockers: blockers(s.graph, task.id),
    area: task.areaId ? s.areasById.get(task.areaId) : null,
    project: task.projectId ? s.projectsById.get(task.projectId) : null,
    goal: task.goalId ? s.goalsById.get(task.goalId) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

function normalise(fields) {
  const snap = snapshot();
  const project = fields.projectId ? snap.projectsById.get(fields.projectId) : null;
  const goal = fields.goalId ? snap.goalsById.get(fields.goalId) : null;
  return normaliseTask(fields, project, goal);
}

/**
 * Create a task.
 * Returns {ok, task} or {ok:false, errors} — the shape a form binds to.
 */
export function create(input) {
  const parsed = TaskSchema.parse(Object.assign({ status: 'inbox' }, input), '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

  const task = db.batch(() => {
    const created = db.insert('tasks', normalise(parsed.value));
    db.logEvent('TASK_CREATED', { taskId: created.id, title: created.title }, input._actor || 'USER');
    return created;
  });

  return { ok: true, task };
}

export function update(id, patch) {
  const existing = byId(id);
  if (!existing) return { ok: false, errors: { '': { code: 'notFound' } } };

  const merged = Object.assign({}, existing, pickEditable(patch, TASK_EDITABLE));
  const parsed = TaskSchema.parse(merged, '');
  if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

  const next = normalise(parsed.value);
  const task = db.update('tasks', id, next);
  return { ok: true, task };
}

/**
 * Complete or reopen.
 *
 * A blocked task cannot be completed. That is enforced here rather than only
 * in the interface, because the command palette, the focus screen and a
 * keyboard shortcut all reach this function and each of them would otherwise
 * need its own copy of the rule.
 */
export function setComplete(id, done, opts) {
  const o = opts || {};
  const task = byId(id);
  if (!task) return { ok: false, code: 'notFound' };

  const snap = snapshot();
  if (done && isBlocked(snap.graph, id)) {
    return { ok: false, code: 'blocked', blockers: blockers(snap.graph, id) };
  }

  return db.batch(() => {
    if (!done) {
      const reopened = db.update('tasks', id, normalise(Object.assign({}, task, {
        status: task.scheduledDate ? 'planned' : 'ready',
        completedAt: null,
      })));
      db.logEvent('TASK_REOPENED', { taskId: id, title: task.title }, o.actor || 'USER');
      return { ok: true, task: reopened };
    }

    const completedOn = o.date || todayIso();
    const completed = db.update('tasks', id, normalise(Object.assign({}, task, {
      status: 'done',
      completedAt: Date.now(),
    })));
    db.logEvent('TASK_COMPLETED', {
      taskId: id,
      title: task.title,
      projectId: task.projectId || null,
      goalId: task.goalId || null,
      minutes: task.estimatedMinutes || 0,
    }, o.actor || 'USER');

    /*
     * A recurring task rolls forward rather than staying done.
     *
     * The completed instance is kept as a separate record so the history is
     * real — "you sent the report eleven Sundays running" is a fact about
     * eleven records, not a counter — and the live task moves to its next
     * occurrence.
     */
    if (task.recurrence && task.recurrence !== 'none') {
      const advance = advanceAfterCompletion(task, completedOn);
      if (advance) {
        db.insert('tasks', normalise(Object.assign({}, task, {
          id: undefined,
          status: 'done',
          completedAt: Date.now(),
          recurrence: 'none',
          recurrenceDays: [],
          recurrenceParentId: task.id,
          scheduledDate: completedOn,
        })));
        const rolled = db.update('tasks', id, normalise(Object.assign({}, task, advance)));
        return { ok: true, task: rolled, recurred: true, nextDate: advance.scheduledDate || advance.dueDate };
      }
    }

    return { ok: true, task: completed };
  });
}

export function remove(id) {
  const task = byId(id);
  if (!task) return false;
  return db.batch(() => {
    /* Dependencies pointing at a deleted task would keep other tasks blocked
     * on something that no longer exists — a dead end with no way out from the
     * interface, because there is nothing left to tick. */
    db.removeWhere('taskDependencies', (d) => d.taskId === id || d.dependsOnId === id);
    db.removeWhere('blocks', (b) => b.taskId === id);
    db.logEvent('TASK_DELETED', { taskId: id, title: task.title });
    return db.remove('tasks', id);
  });
}

/* ------------------------------------------------------------------ *
 * Scheduling
 * ------------------------------------------------------------------ */

export function schedule(id, dayIso, startMinutes, endMinutes) {
  const task = byId(id);
  if (!task) return { ok: false, code: 'notFound' };

  const wasScheduled = task.scheduledDate;
  const pushedBack = wasScheduled && dayIso && dayIso > wasScheduled;

  const result = update(id, {
    scheduledDate: dayIso,
    scheduledStart: startMinutes === undefined ? task.scheduledStart : startMinutes,
    scheduledEnd: endMinutes === undefined ? task.scheduledEnd : endMinutes,
    status: task.status === 'inbox' ? 'planned' : task.status,
  });
  if (!result.ok) return result;

  /* Pushing a task to a later day is the signal the stuck-task detector reads.
   * Counting every reschedule would flag somebody who moved a task earlier,
   * which is the opposite of avoidance. */
  if (pushedBack) {
    db.update('tasks', id, { postponeCount: (task.postponeCount || 0) + 1 });
  }

  db.logEvent('TASK_RESCHEDULED', {
    taskId: id, title: task.title, from: wasScheduled || null, to: dayIso || null,
  });

  return { ok: true, task: byId(id) };
}

export function unschedule(id) {
  return update(id, { scheduledDate: null, scheduledStart: null, scheduledEnd: null });
}

export function moveToTomorrow(id, fromIso) {
  const base = fromIso || todayIso();
  return schedule(id, addDays(base, 1), null, null);
}

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

export function dependencies(taskId) {
  return db.list('taskDependencies', (d) => d.taskId === taskId);
}

export function addDependency(taskId, dependsOnId) {
  if (taskId === dependsOnId) return { ok: false, code: 'self' };
  if (!byId(taskId) || !byId(dependsOnId)) return { ok: false, code: 'notFound' };

  const existing = db.list('taskDependencies', (d) => d.taskId === taskId && d.dependsOnId === dependsOnId);
  if (existing.length) return { ok: true, dependency: existing[0] };

  const graph = buildGraph(db.list('tasks'), db.list('taskDependencies'));
  if (wouldCreateCycle(graph, taskId, dependsOnId)) return { ok: false, code: 'cycle' };

  return { ok: true, dependency: db.insert('taskDependencies', { taskId, dependsOnId }) };
}

export function removeDependency(taskId, dependsOnId) {
  return db.removeWhere('taskDependencies', (d) => d.taskId === taskId && d.dependsOnId === dependsOnId) > 0;
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

/**
 * Parse a captured line without saving it. The capture box calls this on every
 * keystroke to render the preview.
 */
export function previewCapture(text) {
  const snap = snapshot();
  const parsed = parseCapture(text, { today: snap.today, nowMinutes: snap.nowMinutes });
  if (!parsed.ok) return parsed;

  const guess = guessProject(parsed.title, snap.projects);
  return Object.assign({}, parsed, {
    projectGuess: guess ? { project: guess.project, score: guess.score } : null,
  });
}

/**
 * Save a captured line.
 *
 * Lands in the inbox unless the parse produced a schedule, which is a strong
 * signal that the person has already decided when — and putting a task they
 * just scheduled into a "needs sorting" pile is asking them to sort it twice.
 */
export function capture(text, opts) {
  const o = opts || {};
  const parsed = previewCapture(text);
  if (!parsed.ok || !parsed.title) return { ok: false, code: 'empty' };

  const fields = Object.assign({ title: parsed.title }, parsed.fields);
  if (o.projectId) fields.projectId = o.projectId;
  else if (o.acceptGuess && parsed.projectGuess) fields.projectId = parsed.projectGuess.project.id;
  if (o.areaId) fields.areaId = o.areaId;
  if (o.someday) fields.someday = true;

  fields.status = fields.scheduledDate ? 'planned' : 'inbox';

  const result = create(fields);
  return result.ok ? { ok: true, task: result.task, parsed } : result;
}

/* ------------------------------------------------------------------ *
 * Splitting
 * ------------------------------------------------------------------ */

/**
 * Replace one task with several, keeping the original's context.
 *
 * The original is cancelled rather than deleted so the activity log still
 * refers to something real, and the new tasks are chained in order — the
 * second waits for the first — because a split task is almost always a
 * sequence, and discovering afterwards that they can be done in any order is
 * cheaper than discovering they cannot.
 */
export function split(id, steps, opts) {
  const o = opts || {};
  const task = byId(id);
  if (!task) return { ok: false, code: 'notFound' };
  const clean = (steps || []).map((s) => (typeof s === 'string' ? { title: s } : s))
    .filter((s) => s.title && s.title.trim());
  if (clean.length < 2) return { ok: false, code: 'tooFew' };

  return db.batch(() => {
    const created = [];
    let previousId = null;

    for (const step of clean) {
      const result = create({
        title: step.title.trim(),
        description: step.description || '',
        projectId: task.projectId,
        goalId: task.goalId,
        areaId: task.areaId,
        milestoneId: task.milestoneId,
        importance: task.importance,
        urgency: task.urgency,
        goalImpact: task.goalImpact,
        energyLevel: step.energyLevel || task.energyLevel,
        estimatedMinutes: step.estimatedMinutes
          || Math.max(5, Math.round((task.estimatedMinutes || 25) / clean.length)),
        dueDate: task.dueDate,
        status: 'ready',
        _actor: o.actor || 'USER',
      });
      if (!result.ok) continue;
      created.push(result.task);
      if (o.chain !== false && previousId) addDependency(result.task.id, previousId);
      previousId = result.task.id;
    }

    /* Anything that was waiting for the original now waits for the last step. */
    if (created.length) {
      const last = created[created.length - 1];
      for (const dep of db.list('taskDependencies', (d) => d.dependsOnId === id)) {
        addDependency(dep.taskId, last.id);
      }
    }

    db.removeWhere('taskDependencies', (d) => d.taskId === id || d.dependsOnId === id);
    db.update('tasks', id, { status: 'cancelled' });
    db.logEvent('TASK_SPLIT', { taskId: id, title: task.title, into: created.length });

    return { ok: true, tasks: created, original: task };
  });
}

/* ------------------------------------------------------------------ *
 * Inbox processing
 * ------------------------------------------------------------------ */

export function fileToProject(taskId, projectId) {
  return update(taskId, { projectId, status: 'ready' });
}

export function markSomeday(taskId) {
  return update(taskId, { someday: true, status: 'inbox' });
}

export function activateFromSomeday(taskId) {
  return update(taskId, { someday: false, status: 'ready' });
}

export { isoDay };
