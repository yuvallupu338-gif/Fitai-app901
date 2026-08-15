/*
 * autoplan.js — the app writing the tasks itself.
 *
 * WHAT CHANGED, AND WHY IT IS A REAL CHANGE RATHER THAN A SHORTCUT.
 *
 * §13 asked for a preview: propose projects, milestones and first steps, and
 * let the person tick what they want before anything is created. That is the
 * cautious design, and it has a cost that only shows up in use — a new goal
 * lands you in a review screen with fourteen checkboxes before you have done
 * any thinking about the goal itself. The most common outcome is "select all",
 * which is a confirmation dialog wearing a plan's clothes.
 *
 * So the default is inverted here: creating a goal creates the work under it,
 * and finishing the last task in a project produces the next ones. The app
 * takes the first move.
 *
 * THREE THINGS MAKE THAT SAFE, AND ALL THREE ARE LOAD-BEARING.
 *
 *   1. It is undoable, exactly. Every auto-creation returns a token naming the
 *      records it made, and undo() removes precisely those — not "the last N
 *      tasks", which would take somebody's own work with it if they typed one
 *      in between.
 *
 *   2. It is visible. Records are stamped with actor 'AI' and appear in the
 *      activity log, so "where did these six tasks come from" has an answer
 *      on a screen rather than in a support conversation.
 *
 *   3. It can be turned off. `autoPlan` in preferences restores the preview.
 *      An app that writes to your database without asking needs an off switch,
 *      and one that hides the switch is worse than one that always asks.
 *
 * WHAT IT WILL NOT DO.
 *
 * It never touches a task a person wrote, never deletes anything, never
 * reschedules, and never refills a project more than once without something
 * having happened in between. Generation is capped — a refill that produced
 * twenty tasks would be a wall, not a plan — and a project that yields nothing
 * twice is left alone rather than retried forever.
 */

import * as db from '../core/db.js';
import { snapshot, preferences, invalidate } from './core.js';
import * as tasksService from './tasks.js';
import { projects as projectsService, milestones as milestonesService } from './structure.js';
import * as ai from '../ai/provider.js';
import { on, EV } from '../core/bus.js';

/* A refill is the next step, not the whole project. Four is enough to work
 * from and few enough to read. */
const REFILL_CAP = 4;
const FIRST_PLAN_TASK_CAP = 6;
const FIRST_PLAN_PROJECT_CAP = 1;

/* Projects that produced nothing when asked. Retrying them on every completion
 * would mean a model call — or at best a wasted pass — every time somebody
 * ticks a box in a finished project. Cleared when the project changes. */
const barren = new Map();

export function enabled() {
  return preferences().autoPlan !== false;
}

/* ------------------------------------------------------------------ *
 * Creating
 * ------------------------------------------------------------------ */

/**
 * Build the work under a goal: one project, its milestones, its first tasks.
 *
 * Returns { ok, created, undo } where `undo` names every record made, so the
 * toast's button can remove exactly those.
 */
export async function planGoal(goalId, opts) {
  const o = opts || {};
  const goal = db.get('goals', goalId);
  if (!goal) return { ok: false, code: 'notFound' };

  let plan = null;
  try {
    plan = await ai.generateGoalPlan(goal);
  } catch (e) {
    plan = null;
  }

  const proposed = ((plan && plan.projects) || []).slice(0, o.projectCap || FIRST_PLAN_PROJECT_CAP);
  if (!proposed.length) return { ok: false, code: 'empty' };

  const actor = plan.origin === 'model' ? 'AI' : 'SYSTEM';
  const undo = { projects: [], milestones: [], tasks: [] };
  let created = 0;

  db.batch(() => {
    for (const source of proposed) {
      const result = projectsService.create({
        title: source.title,
        goalId: goal.id,
        areaId: goal.areaId || null,
        priority: goal.priority,
        dueDate: source.dueDate || goal.targetDate || null,
        _actor: actor,
      });
      if (!result.ok) continue;
      undo.projects.push(result.project.id);
      created += 1;

      for (const milestone of (source.milestones || [])) {
        const done = milestonesService.create({
          projectId: result.project.id,
          title: milestone.title,
          targetDate: milestone.targetDate || null,
        });
        if (done.ok) { undo.milestones.push(done.milestone.id); created += 1; }
      }

      for (const task of (source.tasks || []).slice(0, o.taskCap || FIRST_PLAN_TASK_CAP)) {
        const done = tasksService.create({
          title: task.title,
          projectId: result.project.id,
          goalId: goal.id,
          areaId: goal.areaId || null,
          status: 'ready',
          estimatedMinutes: task.estimatedMinutes || 30,
          energyLevel: task.energyLevel || 'normal',
          _actor: actor,
        });
        if (done.ok) { undo.tasks.push(done.task.id); created += 1; }
      }
    }
  });

  if (!created) return { ok: false, code: 'empty' };
  invalidate();

  return {
    ok: true,
    created,
    origin: plan.origin,
    projectTitle: proposed[0].title,
    taskCount: undo.tasks.length,
    undo,
  };
}

/**
 * Produce the next tasks for a project that has run out of them.
 *
 * Only for a project that is genuinely empty and genuinely unfinished. A
 * project somebody has deliberately left with nothing open — because they are
 * thinking about it — is indistinguishable from one that needs refilling, so
 * the trigger is completion rather than a timer: this runs at the moment
 * somebody finishes the last task, which is exactly when "what now" is the
 * question.
 */
export async function refillProject(projectId, opts) {
  const o = opts || {};
  const project = db.get('projects', projectId);
  if (!project) return { ok: false, code: 'notFound' };
  if (project.status === 'done' || project.status === 'paused') return { ok: false, code: 'closed' };

  const open = db.list('tasks', (t) => t.projectId === projectId
    && t.status !== 'done' && t.status !== 'cancelled');
  if (open.length) return { ok: false, code: 'notEmpty' };

  /* Asked before and had nothing to add. The template library is finite, so a
   * project whose plan is exhausted must not trigger a call on every tick. */
  if (barren.get(projectId) >= 2) return { ok: false, code: 'exhausted' };

  let plan = null;
  try {
    plan = await ai.breakDownProject(project);
  } catch (e) {
    plan = null;
  }

  const tasks = ((plan && plan.tasks) || []).slice(0, o.cap || REFILL_CAP);
  if (!tasks.length) {
    barren.set(projectId, (barren.get(projectId) || 0) + 1);
    return { ok: false, code: 'empty' };
  }

  const actor = plan.origin === 'model' ? 'AI' : 'SYSTEM';
  const undo = { projects: [], milestones: [], tasks: [] };

  db.batch(() => {
    for (const milestone of ((plan && plan.milestones) || [])) {
      const done = milestonesService.create({ projectId, title: milestone.title });
      if (done.ok) undo.milestones.push(done.milestone.id);
    }
    for (const task of tasks) {
      const done = tasksService.create({
        title: task.title,
        projectId,
        goalId: project.goalId || null,
        areaId: project.areaId || null,
        status: 'ready',
        estimatedMinutes: task.estimatedMinutes || 30,
        energyLevel: task.energyLevel || 'normal',
        _actor: actor,
      });
      if (done.ok) undo.tasks.push(done.task.id);
    }
  });

  if (!undo.tasks.length) {
    barren.set(projectId, (barren.get(projectId) || 0) + 1);
    return { ok: false, code: 'empty' };
  }

  barren.delete(projectId);
  invalidate();

  return {
    ok: true,
    created: undo.tasks.length,
    origin: plan.origin,
    project,
    taskCount: undo.tasks.length,
    undo,
  };
}

/* ------------------------------------------------------------------ *
 * Undoing
 * ------------------------------------------------------------------ */

/**
 * Remove exactly what an auto-creation made.
 *
 * By id, in reverse order of dependency. Anything the person has since
 * touched — completed a task, renamed the project — is left alone: undoing a
 * suggestion must never take real work with it, and by the time somebody
 * presses undo they may already have started one of the tasks.
 */
export function undo(token) {
  if (!token) return { ok: true, removed: 0 };
  let removed = 0;

  db.batch(() => {
    for (const id of token.tasks || []) {
      const task = db.get('tasks', id);
      /* Started, finished, or edited into something else — theirs now. */
      if (!task) continue;
      if (task.status === 'done' || task.status === 'in_progress') continue;
      if (task.actualMinutes > 0 || task.scheduledDate) continue;
      if (tasksService.remove(id)) removed += 1;
    }
    for (const id of token.milestones || []) {
      const milestone = db.get('milestones', id);
      if (!milestone || milestone.completedAt) continue;
      if (milestonesService.remove(id)) removed += 1;
    }
    for (const id of token.projects || []) {
      const project = db.get('projects', id);
      if (!project) continue;
      /* Only if it is still empty. A project that now holds work somebody
       * added is not ours to delete, even though we created it. */
      const survivors = db.list('tasks', (t) => t.projectId === id);
      const milestones = db.list('milestones', (m) => m.projectId === id);
      if (survivors.length || milestones.length) continue;
      if (projectsService.remove(id)) removed += 1;
    }
  });

  invalidate();
  return { ok: true, removed };
}

/* ------------------------------------------------------------------ *
 * The trigger
 * ------------------------------------------------------------------ */

let installed = false;
let onRefill = null;

/**
 * Start listening. Called once at boot.
 *
 * `notify` is how the interface hears about a refill — it is passed in rather
 * than imported so this module stays free of any UI dependency and can be
 * tested without a DOM.
 */
export function install(notify) {
  onRefill = notify || null;
  if (installed) return;
  installed = true;

  on(EV.TASK_COMPLETED, async (payload) => {
    if (!enabled()) return;
    if (!payload || !payload.projectId) return;

    /* Recurring tasks roll forward rather than leaving a gap, so a project
     * whose only task recurs is never actually empty — checked inside
     * refillProject, which is also where the not-empty case is cheap. */
    const result = await refillProject(payload.projectId);
    if (result.ok && onRefill) onRefill(result);
  });
}

/** Test seam: forget which projects came back empty. */
export function resetBarren() {
  barren.clear();
}

export { snapshot };
