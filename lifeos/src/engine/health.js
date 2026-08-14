/*
 * health.js — whether a project is in trouble, and why.
 *
 * NOT A MODEL'S OPINION. The specification is explicit about this and it is
 * the right call: a health indicator that a model assigns is a health
 * indicator that can change when nothing changed, and one nobody can argue
 * with. Six inputs, all of them facts, all of them nameable:
 *
 *   1. time remaining until the deadline
 *   2. work remaining, from the open estimates
 *   3. how many tasks are blocked
 *   4. how much calendar time is actually allocated to it
 *   5. when anything last happened in it
 *   6. how many milestones are done
 *
 * The output carries the reasons, and the interface prints them. "דורש תשומת
 * לב" on its own is an anxiety generator; "דורש תשומת לב — לא הייתה פעילות
 * שבועיים ואין זמן מוקצה בלוח" is something a person can act on in ten
 * seconds.
 *
 * ORDER MATTERS MORE THAN SCORE. These states are not points on a line. A
 * blocked project and a behind-schedule project need different actions, so
 * the checks run in severity order and the first one that fires wins, rather
 * than being blended into a number that loses which was which.
 */

import { today as todayIso, daysBetween } from '../core/time.js';
import { feasibility, deadlineRisk, remainingWork } from './deadline.js';
import { milestoneProgress, projectProgress } from './progress.js';
import { isBlocked } from './deps.js';

const IDLE_DAYS = 14;
const STALE_DAYS = 7;

export const HEALTH_REASONS = {
  DONE: 'done',
  NO_TASKS: 'noTasks',
  BLOCKED_TASKS: 'blockedTasks',
  BEHIND: 'behind',
  TIGHT_WINDOW: 'tightWindow',
  NO_DEADLINE: 'noDeadline',
  ON_SCHEDULE: 'onSchedule',
  STALE: 'stale',
  NO_CAPACITY: 'noCapacity',
  RECENT_PROGRESS: 'recentProgress',
};

/** When anything last happened in this project, as an ISO day or null. */
export function lastActivityDate(projectId, ctx) {
  let latest = 0;

  const taskIds = new Set((ctx.tasks || []).filter((t) => t.projectId === projectId).map((t) => t.id));

  for (const t of ctx.tasks || []) {
    if (t.projectId !== projectId) continue;
    if (t.completedAt && t.completedAt > latest) latest = t.completedAt;
    if (t.updatedAt && t.updatedAt > latest) latest = t.updatedAt;
  }
  for (const s of ctx.focusSessions || []) {
    if (!taskIds.has(s.taskId)) continue;
    if (s.endedAt && s.endedAt > latest) latest = s.endedAt;
  }
  for (const m of ctx.milestones || []) {
    if (m.projectId !== projectId) continue;
    if (m.completedAt && m.completedAt > latest) latest = m.completedAt;
  }

  return latest || null;
}

/** Minutes of calendar time allocated to this project in the coming week. */
export function allocatedMinutes(projectId, ctx, fromIso, toIso) {
  const taskIds = new Set((ctx.tasks || []).filter((t) => t.projectId === projectId).map((t) => t.id));
  let total = 0;
  for (const b of ctx.blocks || []) {
    if (!b.taskId || !taskIds.has(b.taskId)) continue;
    if (fromIso && b.date < fromIso) continue;
    if (toIso && b.date > toIso) continue;
    total += Math.max(0, b.endMinutes - b.startMinutes);
  }
  /* Tasks scheduled to a day without a block still represent an intention to
   * work on it, which is what this is measuring. */
  for (const t of ctx.tasks || []) {
    if (t.projectId !== projectId || !t.scheduledDate) continue;
    if (t.status === 'done' || t.status === 'cancelled') continue;
    if (fromIso && t.scheduledDate < fromIso) continue;
    if (toIso && t.scheduledDate > toIso) continue;
    const hasBlock = (ctx.blocks || []).some((b) => b.taskId === t.id);
    if (!hasBlock) total += t.estimatedMinutes || 0;
  }
  return total;
}

/**
 * The health of one project.
 *
 * `ctx` carries the whole account's data. That is deliberate — health depends
 * on the calendar and on the dependency graph, neither of which lives on the
 * project record, and passing a project alone would produce a function that
 * has to guess.
 */
export function projectHealth(project, ctx) {
  const today = ctx.today || todayIso();
  const reasons = [];

  if (project.status === 'done' || project.completedAt) {
    return { health: 'done', reasons: [{ code: HEALTH_REASONS.DONE }], progress: { pct: 100 } };
  }

  const tasks = (ctx.tasks || []).filter((t) => t.projectId === project.id);
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const milestones = (ctx.milestones || []).filter((m) => m.projectId === project.id);
  const progress = projectProgress(project, tasks, milestones);

  if (project.status === 'paused') {
    return { health: 'idle', reasons: [{ code: HEALTH_REASONS.STALE, days: null }], progress };
  }

  /* --- 3. blocked ------------------------------------------------ */
  const graph = ctx.graph;
  const blockedTasks = graph ? openTasks.filter((t) => isBlocked(graph, t.id)) : [];
  const allBlocked = openTasks.length > 0 && blockedTasks.length === openTasks.length;

  /* --- 1 & 2. deadline versus remaining work --------------------- */
  const feas = feasibility({
    dueDate: project.dueDate,
    tasks: openTasks,
    today,
    context: ctx,
  });
  const risk = deadlineRisk(feas);

  /* --- 5. staleness ---------------------------------------------- */
  const lastAt = lastActivityDate(project.id, ctx);
  const daysSince = lastAt ? Math.abs(daysBetween(isoOf(lastAt), today)) : null;

  /* --- 4. allocation --------------------------------------------- */
  const weekAhead = addDaysIso(today, 7);
  const allocated = allocatedMinutes(project.id, ctx, today, weekAhead);

  /* --- 6. milestones --------------------------------------------- */
  const ms = milestoneProgress(milestones);

  /* Severity order. First match wins. */

  if (allBlocked) {
    reasons.push({ code: HEALTH_REASONS.BLOCKED_TASKS, count: blockedTasks.length });
    return { health: 'blocked', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (risk.level === 'over') {
    reasons.push({ code: HEALTH_REASONS.BEHIND, shortfall: feas.shortfall, daysLeft: feas.daysLeft });
    if (blockedTasks.length) reasons.push({ code: HEALTH_REASONS.BLOCKED_TASKS, count: blockedTasks.length });
    return { health: 'at_risk', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (risk.level === 'veryTight') {
    reasons.push({ code: HEALTH_REASONS.TIGHT_WINDOW, needed: feas.needed, available: feas.available });
    if (!allocated) reasons.push({ code: HEALTH_REASONS.NO_CAPACITY });
    return { health: 'needs_attention', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (openTasks.length && daysSince !== null && daysSince >= IDLE_DAYS) {
    reasons.push({ code: HEALTH_REASONS.STALE, days: daysSince });
    return { health: 'idle', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (blockedTasks.length) {
    reasons.push({ code: HEALTH_REASONS.BLOCKED_TASKS, count: blockedTasks.length });
  }

  if (!openTasks.length) {
    reasons.push({ code: HEALTH_REASONS.NO_TASKS });
    return { health: 'needs_attention', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (project.dueDate && !allocated && (feas.daysLeft !== null && feas.daysLeft <= STALE_DAYS)) {
    reasons.push({ code: HEALTH_REASONS.NO_CAPACITY });
    return { health: 'needs_attention', reasons, progress, feasibility: feas, milestones: ms, allocatedMinutes: allocated };
  }

  if (daysSince !== null && daysSince <= STALE_DAYS) {
    reasons.push({ code: HEALTH_REASONS.RECENT_PROGRESS, days: daysSince });
  }
  if (project.dueDate) reasons.push({ code: HEALTH_REASONS.ON_SCHEDULE });
  else reasons.push({ code: HEALTH_REASONS.NO_DEADLINE });

  return {
    health: blockedTasks.length ? 'needs_attention' : 'on_track',
    reasons,
    progress,
    feasibility: feas,
    milestones: ms,
    allocatedMinutes: allocated,
  };
}

/** Health for every project at once, and the set that needs attention. */
export function healthReport(ctx) {
  const byProject = new Map();
  const atRisk = new Set();
  for (const project of ctx.projects || []) {
    const h = projectHealth(project, ctx);
    byProject.set(project.id, h);
    if (h.health === 'at_risk' || h.health === 'blocked' || h.health === 'needs_attention') atRisk.add(project.id);
  }
  return { byProject, atRisk };
}

/* Local helpers — kept private so this module has no import cycle with time.js
 * beyond the two functions it actually uses. */
function isoOf(ms) {
  const d = new Date(ms);
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  /* Deliberately UTC-based: this is only ever compared against another day
   * string produced the same way, for a "days since" count where an hour of
   * timezone skew cannot change the answer. */
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (x) => (x < 10 ? `0${x}` : String(x));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export { remainingWork };
