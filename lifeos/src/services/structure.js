/*
 * structure.js — areas, goals, projects and milestones.
 *
 * The four levels above a task, in one service because they are one idea:
 *
 *     area (never ends)  →  goal (a result)  →  project (start and finish)
 *                                                   →  milestone (a real step)
 *
 * DELETING SOMETHING WITH CHILDREN IS THE INTERESTING PART.
 *
 * Three different answers, and each one is the answer a person expects for
 * that level rather than a uniform policy:
 *
 *   Delete an area  — everything under it survives, unfiled. An area is a
 *                     label for the same work seen from a different angle;
 *                     losing the label should not lose the work.
 *   Delete a goal   — its projects survive, detached. Somebody who abandons
 *                     "learn React" has not decided the half-built app should
 *                     vanish.
 *   Delete a project— its tasks and milestones go with it. This is the one
 *                     case where the children have no independent meaning, and
 *                     the confirmation says so in as many words before it
 *                     happens.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import {
  AreaSchema, GoalSchema, ProjectSchema, MilestoneSchema, AREA_COLORS,
} from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import { goalProgress, projectProgress } from '../engine/progress.js';
import { projectHealth } from '../engine/health.js';
import { feasibility, shortfallOptions } from '../engine/deadline.js';
import { today as todayIso } from '../core/time.js';

/* ------------------------------------------------------------------ *
 * Areas
 * ------------------------------------------------------------------ */

export const areas = {
  all() {
    return db.list('areas', (a) => !a.archived).sort((a, b) => a.order - b.order);
  },

  byId(id) { return db.get('areas', id); },

  create(input) {
    const parsed = AreaSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    const existing = db.list('areas');
    /* Pick the next unused colour rather than always the first, so two areas
     * created in a row are distinguishable without anybody choosing. */
    if (!input.color) {
      const used = new Set(existing.map((a) => a.color));
      parsed.value.color = AREA_COLORS.find((c) => !used.has(c)) || AREA_COLORS[existing.length % AREA_COLORS.length];
    }
    parsed.value.order = existing.length;
    return { ok: true, area: db.insert('areas', parsed.value) };
  },

  update(id, patch) {
    const existing = db.get('areas', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = AreaSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    return { ok: true, area: db.update('areas', id, parsed.value) };
  },

  remove(id) {
    return db.batch(() => {
      /* Detach, do not cascade. */
      for (const g of db.list('goals', (x) => x.areaId === id)) db.update('goals', g.id, { areaId: null });
      for (const p of db.list('projects', (x) => x.areaId === id)) db.update('projects', p.id, { areaId: null });
      for (const t of db.list('tasks', (x) => x.areaId === id)) db.update('tasks', t.id, { areaId: null });
      for (const hb of db.list('habits', (x) => x.areaId === id)) db.update('habits', hb.id, { areaId: null });
      return db.remove('areas', id);
    });
  },

  /** Areas with their counts, for the sidebar and the areas screen. */
  withCounts() {
    const snap = snapshot();
    return this.all().map((area) => ({
      area,
      goals: snap.goals.filter((g) => g.areaId === area.id && g.status === 'active').length,
      projects: snap.projects.filter((p) => p.areaId === area.id && p.status !== 'done').length,
      tasks: snap.tasks.filter((t) => t.areaId === area.id && t.status !== 'done' && t.status !== 'cancelled').length,
    }));
  },
};

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const goals = {
  all() { return db.list('goals'); },
  active() { return db.list('goals', (g) => g.status === 'active'); },
  byId(id) { return db.get('goals', id); },

  create(input) {
    const parsed = GoalSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    const goal = db.batch(() => {
      const created = db.insert('goals', parsed.value);
      db.logEvent('GOAL_CREATED', { goalId: created.id, title: created.title }, input._actor || 'USER');
      return created;
    });
    return { ok: true, goal };
  },

  update(id, patch) {
    const existing = db.get('goals', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = GoalSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

    const wasAchieved = existing.status === 'achieved';
    const value = parsed.value;
    if (value.status === 'achieved' && !wasAchieved) value.completedAt = Date.now();
    if (value.status !== 'achieved') value.completedAt = null;

    const goal = db.update('goals', id, value);
    db.logEvent(value.status === 'achieved' && !wasAchieved ? 'GOAL_ACHIEVED' : 'GOAL_UPDATED',
      { goalId: id, title: goal.title });
    return { ok: true, goal };
  },

  remove(id) {
    return db.batch(() => {
      for (const p of db.list('projects', (x) => x.goalId === id)) db.update('projects', p.id, { goalId: null });
      for (const t of db.list('tasks', (x) => x.goalId === id)) db.update('tasks', t.id, { goalId: null });
      return db.remove('goals', id);
    });
  },

  progress(goal) {
    return goalProgress(goal, snapshot());
  },

  /** A goal with everything the detail screen needs, computed once. */
  detail(id) {
    const snap = snapshot();
    const goal = snap.goalsById.get(id);
    if (!goal) return null;
    const projects = snap.projects.filter((p) => p.goalId === id);
    const projectIds = new Set(projects.map((p) => p.id));
    return {
      goal,
      area: goal.areaId ? snap.areasById.get(goal.areaId) : null,
      progress: goalProgress(goal, snap),
      projects: projects.map((p) => ({
        project: p,
        health: snap.health.get(p.id),
        progress: projectProgress(
          p,
          snap.tasks.filter((t) => t.projectId === p.id),
          snap.milestones.filter((m) => m.projectId === p.id),
        ),
      })),
      tasks: snap.tasks.filter((t) => t.goalId === id || projectIds.has(t.projectId)),
      notes: snap.notes.filter((n) => n.goalId === id),
    };
  },
};

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export const projects = {
  all() { return db.list('projects'); },
  active() { return db.list('projects', (p) => p.status !== 'done'); },
  byId(id) { return db.get('projects', id); },
  forGoal(goalId) { return db.list('projects', (p) => p.goalId === goalId); },

  create(input) {
    const parsed = ProjectSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

    /* A project under a goal inherits the goal's area unless told otherwise —
     * otherwise every project needs the same two fields set by hand and the
     * area filters end up half empty. */
    if (parsed.value.goalId && !parsed.value.areaId) {
      const goal = db.get('goals', parsed.value.goalId);
      if (goal && goal.areaId) parsed.value.areaId = goal.areaId;
    }
    parsed.value.order = db.list('projects').length;

    const project = db.batch(() => {
      const created = db.insert('projects', parsed.value);
      db.logEvent('PROJECT_CREATED', { projectId: created.id, title: created.title }, input._actor || 'USER');
      return created;
    });
    return { ok: true, project };
  },

  update(id, patch) {
    const existing = db.get('projects', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = ProjectSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

    const value = parsed.value;
    const wasDone = existing.status === 'done';
    if (value.status === 'done' && !wasDone) value.completedAt = Date.now();
    if (value.status !== 'done') value.completedAt = null;

    return db.batch(() => {
      const project = db.update('projects', id, value);

      /* The project owns its children's goal and area. Changing it here and
       * not on the tasks would leave the task list and the project screen
       * disagreeing about which goal the work serves. */
      if (existing.goalId !== project.goalId || existing.areaId !== project.areaId) {
        for (const t of db.list('tasks', (x) => x.projectId === id)) {
          db.update('tasks', t.id, { goalId: project.goalId, areaId: project.areaId });
        }
      }

      db.logEvent(value.status === 'done' && !wasDone ? 'PROJECT_COMPLETED' : 'PROJECT_UPDATED',
        { projectId: id, title: project.title });
      return { ok: true, project };
    });
  },

  /** Cascading delete — the one place children go with the parent. */
  remove(id) {
    return db.batch(() => {
      const taskIds = db.list('tasks', (t) => t.projectId === id).map((t) => t.id);
      const idSet = new Set(taskIds);
      db.removeWhere('taskDependencies', (d) => idSet.has(d.taskId) || idSet.has(d.dependsOnId));
      db.removeWhere('blocks', (b) => idSet.has(b.taskId));
      db.removeWhere('tasks', (t) => t.projectId === id);
      db.removeWhere('milestones', (m) => m.projectId === id);
      for (const n of db.list('notes', (x) => x.projectId === id)) db.update('notes', n.id, { projectId: null });
      return db.remove('projects', id);
    });
  },

  health(project) {
    return projectHealth(project, snapshot());
  },

  /** Everything the project screen shows, computed from one snapshot. */
  detail(id) {
    const snap = snapshot();
    const project = snap.projectsById.get(id);
    if (!project) return null;

    const tasks = snap.tasks.filter((t) => t.projectId === id);
    const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    const milestones = snap.milestones.filter((m) => m.projectId === id)
      .sort((a, b) => a.order - b.order);

    const feas = feasibility({
      dueDate: project.dueDate,
      tasks: openTasks,
      today: snap.today,
      context: snap,
    });

    return {
      project,
      goal: project.goalId ? snap.goalsById.get(project.goalId) : null,
      area: project.areaId ? snap.areasById.get(project.areaId) : null,
      tasks,
      openTasks,
      doneTasks: tasks.filter((t) => t.status === 'done'),
      milestones,
      progress: projectProgress(project, tasks, milestones),
      health: snap.health.get(id) || projectHealth(project, snap),
      feasibility: feas,
      options: feas.ok === false ? shortfallOptions(feas, { today: snap.today, dueDate: project.dueDate, context: snap }) : [],
      notes: snap.notes.filter((n) => n.projectId === id),
    };
  },
};

/* ------------------------------------------------------------------ *
 * Milestones
 * ------------------------------------------------------------------ */

export const milestones = {
  forProject(projectId) {
    return db.list('milestones', (m) => m.projectId === projectId).sort((a, b) => a.order - b.order);
  },

  byId(id) { return db.get('milestones', id); },

  create(input) {
    const parsed = MilestoneSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    if (!db.get('projects', parsed.value.projectId)) return { ok: false, code: 'notFound' };
    parsed.value.order = this.forProject(parsed.value.projectId).length;
    return { ok: true, milestone: db.insert('milestones', parsed.value) };
  },

  update(id, patch) {
    const existing = db.get('milestones', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = MilestoneSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    return { ok: true, milestone: db.update('milestones', id, parsed.value) };
  },

  setComplete(id, done) {
    const existing = db.get('milestones', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const milestone = db.update('milestones', id, { completedAt: done ? Date.now() : null });
    if (done) {
      db.logEvent('MILESTONE_COMPLETED', {
        milestoneId: id, title: milestone.title, projectId: milestone.projectId,
      });
    }
    return { ok: true, milestone };
  },

  remove(id) {
    return db.batch(() => {
      for (const t of db.list('tasks', (x) => x.milestoneId === id)) db.update('tasks', t.id, { milestoneId: null });
      return db.remove('milestones', id);
    });
  },

  reorder(projectId, orderedIds) {
    return db.batch(() => {
      orderedIds.forEach((id, i) => {
        const m = db.get('milestones', id);
        if (m && m.projectId === projectId) db.update('milestones', id, { order: i });
      });
      return true;
    });
  },
};

export { todayIso };
