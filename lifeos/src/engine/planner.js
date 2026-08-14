/*
 * planner.js — turning a list of tasks into a day somebody can actually work.
 *
 * THE PIPELINE.
 *
 *     collect constraints
 *        ↓
 *     find free windows          (capacity.js)
 *        ↓
 *     rank eligible tasks        (priority.js)
 *        ↓
 *     fit tasks into windows     (here)
 *        ↓
 *     reserve buffer             (capacity.js, by subtraction)
 *        ↓
 *     validate
 *        ↓
 *     explain
 *
 * No model is involved in any step. A model is handed the finished plan and
 * asked to phrase it; if there is no model, the local sentences are used and
 * the plan is identical. That ordering is the load-bearing decision of the
 * whole AI design: the planner is the product, and the model is a better
 * writer of the same plan.
 *
 * WHY THE OUTPUT IS SHAPED THE WAY IT IS.
 *
 * A day screen that lists forty tasks has answered no question. The shape here
 * is the answer to four different questions a person actually has, in the
 * order they have them:
 *
 *   mainFocus  — "what is the one thing?"          exactly one, or none
 *   mustDo     — "what can't slip today?"          at most three, ever
 *   ifTime     — "and if I get through that?"      the next few
 *   quickWins  — "I have eleven minutes"           ≤15 minutes each
 *
 * The cap of three on mustDo is not a display limit that can be raised. Four
 * things that must happen today is a list of four things that might happen
 * today, and a person reading it learns nothing about which to start.
 */

import {
  today as todayIso, nowMinutes as nowMin, addDays, daysBetween, formatTime,
} from '../core/time.js';
import { dayCapacity, remainingToday, findConflicts, realMinutesBetween } from './capacity.js';
import { rankTasks } from './priority.js';
import { buildGraph, isBlocked, unlockInfo, effectiveStatus } from './deps.js';

const QUICK_WIN_MAX = 15;
const MUST_DO_CAP = 3;

/* Reason codes rather than sentences. The engine runs in node during tests,
 * where there is no interface to render into, and the same reason is phrased
 * differently in a card, a tooltip and a model prompt. explain.js turns these
 * into Hebrew. */
export const REASONS = {
  OVERDUE: 'overdue',
  DUE_TODAY: 'dueToday',
  DUE_SOON: 'dueSoon',
  BLOCKS_OTHERS: 'blocksOthers',
  TOP_GOAL: 'topGoal',
  TOP_PROJECT: 'topProject',
  NEXT_MILESTONE: 'nextMilestone',
  FITS_WINDOW: 'fitsWindow',
  ONLY_FIT: 'onlyFit',
  QUICK: 'quick',
  LOW_ENERGY: 'lowEnergy',
  IN_PROGRESS: 'inProgress',
  PROJECT_AT_RISK: 'projectAtRisk',
};

/* ------------------------------------------------------------------ *
 * Eligibility
 * ------------------------------------------------------------------ */

/**
 * Tasks that could legitimately be worked on this day.
 *
 * Blocked and waiting tasks are excluded here rather than ranked low, because
 * a blocked task is not a low-priority task — it is a task that cannot be
 * started, and putting it in a plan at any position is a plan that cannot be
 * executed.
 */
/* How far ahead undated work is still fair game. Planning tomorrow should
 * behave much like planning today; planning a Thursday three weeks out should
 * not drag in the entire backlog, because a plan made that far ahead against
 * work with no deadline is a plan that will be wrong by the time it matters. */
const UNDATED_HORIZON_DAYS = 7;

export function eligibleTasks(dayIso, ctx) {
  const graph = ctx.graph || buildGraph(ctx.tasks || [], ctx.dependencies || []);
  const today = ctx.today || todayIso();
  const daysAhead = daysBetween(today, dayIso);

  return (ctx.tasks || []).filter((task) => {
    if (task.status === 'done' || task.status === 'cancelled') return false;
    if (task.someday) return false;
    if (task.status === 'waiting') return false;
    if (isBlocked(graph, task.id)) return false;

    /* Already placed on another day by a person — leave it there. Placed on
     * THIS day, of course it is eligible. */
    if (task.scheduledDate && task.scheduledDate !== dayIso) return false;
    if (task.scheduledDate === dayIso) return true;

    /* Overdue by the day being planned. That is what overdue means. */
    if (task.dueDate && task.dueDate <= dayIso) return true;

    /*
     * Undated work within the horizon.
     *
     * The rule here used to require a due date for any day that was not today,
     * which quietly made "תכנן את מחר" return an empty plan for anybody whose
     * tasks had no deadlines — which is most people, and is the normal way to
     * use this app. A day inside the horizon takes undated work; beyond it,
     * only work whose deadline is actually approaching.
     */
    if (daysAhead >= 0 && daysAhead <= UNDATED_HORIZON_DAYS) return true;
    return daysBetween(dayIso, task.dueDate || '9999-12-31') <= 14;
  });
}

/* ------------------------------------------------------------------ *
 * Fitting
 * ------------------------------------------------------------------ */

/**
 * Place ranked tasks into free windows.
 *
 * Greedy, first-fit-decreasing by rank rather than by size. Optimal packing is
 * a knapsack problem and the optimal answer is the wrong one anyway: filling
 * a two-hour window with five small tasks because they tessellate, while the
 * thing that actually matters waits for tomorrow, is a correct solution to a
 * question nobody asked.
 *
 * Two refinements that are worth their complexity:
 *
 *   Deep work prefers the declared focus window. A task that needs
 *   concentration placed at 21:40 will not be done at 21:40.
 *
 *   A task is never split across windows. Half an hour of something now and
 *   half in four hours is two context switches sold as one task.
 */
export function fitTasksToWindows(rankedTasks, windows, opts) {
  const o = opts || {};
  const dayIso = o.date;
  const prefs = o.preferences || {};
  const breakMinutes = prefs.breakMinutes === undefined ? 10 : prefs.breakMinutes;
  const focusStart = prefs.focusWindowStart;
  const focusEnd = prefs.focusWindowEnd;
  const maxDeep = prefs.maxDeepWorkMinutes || 180;

  /* Mutable cursors, one per window. */
  const slots = windows.map((w) => ({ start: w.start, end: w.end, cursor: w.start }));
  const placements = [];
  const unplaced = [];
  let deepUsed = 0;
  let budget = o.budgetMinutes === undefined ? Infinity : o.budgetMinutes;

  function overlapsFocusWindow(start, end) {
    if (focusStart === null || focusStart === undefined) return false;
    return start < focusEnd && focusEnd !== null && end > focusStart;
  }

  for (const task of rankedTasks) {
    const need = Math.max(5, task.estimatedMinutes || 25);
    if (need > budget) { unplaced.push({ task, why: 'budget' }); continue; }
    if (task.energyLevel === 'deep' && deepUsed + need > maxDeep) {
      unplaced.push({ task, why: 'deepLimit' });
      continue;
    }

    /* Candidate slots that can hold it, best first. */
    const candidates = [];
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const available = realMinutesBetween(dayIso, slot.cursor, slot.end);
      if (available < need) continue;
      const start = slot.cursor;
      const end = start + need;
      let rank = 0;
      /* Prefer the focus window for deep work, and prefer to avoid it for
       * light work so the good hours are not spent on admin. */
      if (task.energyLevel === 'deep' && overlapsFocusWindow(start, end)) rank -= 100;
      if (task.energyLevel === 'light' && overlapsFocusWindow(start, end)) rank += 40;
      /* Prefer earlier, all else equal — a plan that leaves the morning empty
       * and stacks the evening is not a plan anyone follows. */
      rank += start / 60;
      /* Prefer a snug fit, so a 15-minute task does not eat the only two-hour
       * window in the day. */
      rank += Math.max(0, available - need) / 120;
      candidates.push({ index: i, start, end, rank });
    }

    if (!candidates.length) { unplaced.push({ task, why: 'noWindow' }); continue; }
    candidates.sort((a, b) => a.rank - b.rank);
    const chosen = candidates[0];
    const slot = slots[chosen.index];

    placements.push({
      taskId: task.id,
      task,
      date: dayIso,
      startMinutes: chosen.start,
      endMinutes: chosen.end,
      minutes: need,
    });

    slot.cursor = Math.min(slot.end, chosen.end + breakMinutes);
    budget -= need;
    if (task.energyLevel === 'deep') deepUsed += need;
  }

  return { placements, unplaced, deepUsed };
}

/* ------------------------------------------------------------------ *
 * Explanation
 * ------------------------------------------------------------------ */

/**
 * Why this task, in reason codes, strongest first.
 *
 * Every reason here is a fact from the data — a date, a count, a name. There
 * is no "this seems important". A recommendation whose justification cannot be
 * traced to a field is a recommendation the person has no way to evaluate, and
 * after two of those they stop reading the justifications at all.
 */
export function reasonsFor(task, ctx) {
  const out = [];
  const day = ctx.day || ctx.today || todayIso();
  const graph = ctx.graph;

  if (task.dueDate) {
    const delta = daysBetween(day, task.dueDate);
    if (delta < 0) out.push({ code: REASONS.OVERDUE, days: Math.abs(delta) });
    else if (delta === 0) out.push({ code: REASONS.DUE_TODAY });
    else if (delta <= 3) out.push({ code: REASONS.DUE_SOON, days: delta, date: task.dueDate });
  }

  if (graph) {
    const info = unlockInfo(graph, task.id);
    if (info.immediateCount > 0) {
      out.push({ code: REASONS.BLOCKS_OTHERS, count: info.immediateCount, titles: info.immediate.map((t) => t.title) });
    }
  }

  if (task.status === 'in_progress') out.push({ code: REASONS.IN_PROGRESS });

  const project = task.projectId && ctx.projectsById ? ctx.projectsById.get(task.projectId) : null;
  if (project) {
    if (ctx.topProjectId && project.id === ctx.topProjectId) {
      out.push({ code: REASONS.TOP_PROJECT, title: project.title });
    }
    if (ctx.atRiskProjectIds && ctx.atRiskProjectIds.has(project.id)) {
      out.push({ code: REASONS.PROJECT_AT_RISK, title: project.title });
    }
  }

  const goal = task.goalId && ctx.goalsById ? ctx.goalsById.get(task.goalId) : null;
  if (goal && goal.priority >= 4) out.push({ code: REASONS.TOP_GOAL, title: goal.title });

  if (task.milestoneId && ctx.milestonesById) {
    const milestone = ctx.milestonesById.get(task.milestoneId);
    if (milestone && !milestone.completedAt) out.push({ code: REASONS.NEXT_MILESTONE, title: milestone.title });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

/**
 * Build a day plan. Pure — reads the context, writes nothing.
 *
 * The caller decides whether to apply it. That separation is what makes the
 * preview screen possible, and what makes the planner testable without a
 * database.
 */
export function buildDailyPlan(ctx) {
  const day = ctx.date || ctx.today || todayIso();
  const isToday = day === (ctx.today || todayIso());
  const prefs = ctx.preferences || {};

  const graph = ctx.graph || buildGraph(ctx.tasks || [], ctx.dependencies || []);
  const goalsById = ctx.goalsById || new Map((ctx.goals || []).map((g) => [g.id, g]));
  const projectsById = ctx.projectsById || new Map((ctx.projects || []).map((p) => [p.id, p]));
  const milestonesById = ctx.milestonesById || new Map((ctx.milestones || []).map((m) => [m.id, m]));

  const capacity = dayCapacity(day, ctx);

  /* When planning today, the past is not available. When planning tomorrow,
   * the whole day is. */
  const fromMinutes = isToday
    ? (ctx.nowMinutes === undefined ? nowMin() : ctx.nowMinutes)
    : null;
  const windows = isToday
    ? remainingToday(Object.assign({}, ctx, { today: day, nowMinutes: fromMinutes })).windows
    : capacity.windows;

  const eligible = eligibleTasks(day, Object.assign({}, ctx, { graph }));

  /* Energy filter. Asked for explicitly by the person, and never inferred —
   * this app does not diagnose anybody's state from their click rate. */
  const energyFilter = ctx.energy || null;
  const filtered = energyFilter === 'light'
    ? eligible.filter((t) => t.energyLevel !== 'deep')
    : eligible;

  const ranked = rankTasks(filtered, {
    weights: prefs.weights,
    today: ctx.today || todayIso(),
    graph,
    goalsById,
  });

  const budget = Math.max(0, capacity.usableMinutes - capacity.plannedMinutes);
  const { placements, unplaced } = fitTasksToWindows(ranked, windows, {
    date: day,
    preferences: prefs,
    budgetMinutes: budget,
  });

  /* Which project is carrying the most weight right now, for the explanation.
   * Highest-priority open project with open work in it. */
  const topProjectId = pickTopProject(ranked, projectsById);
  const atRiskProjectIds = ctx.atRiskProjectIds || new Set();

  const reasonCtx = {
    day, graph, goalsById, projectsById, milestonesById, topProjectId, atRiskProjectIds,
    today: ctx.today || todayIso(),
  };

  /* The main focus is the top-ranked task that was actually placed. Ranking a
   * task first and then not scheduling it — because nothing it fits in was
   * free — and still calling it the day's focus is how a plan loses somebody's
   * trust in one screen. */
  const placedIds = new Set(placements.map((p) => p.taskId));
  const mainFocusTask = ranked.find((t) => placedIds.has(t.id) && t.estimatedMinutes >= 20)
    || ranked.find((t) => placedIds.has(t.id))
    || null;

  const mustDo = pickMustDo(ranked, day, placedIds);
  const mustDoIds = new Set(mustDo.map((t) => t.id));

  const ifTime = ranked
    .filter((t) => !mustDoIds.has(t.id) && (!mainFocusTask || t.id !== mainFocusTask.id))
    .filter((t) => t.estimatedMinutes > QUICK_WIN_MAX)
    .slice(0, 4);

  const quickWins = ranked
    .filter((t) => t.estimatedMinutes <= QUICK_WIN_MAX)
    .filter((t) => !mustDoIds.has(t.id) && (!mainFocusTask || t.id !== mainFocusTask.id))
    .slice(0, 5);

  return {
    date: day,
    isToday,
    capacity,
    windows,
    mainFocus: mainFocusTask
      ? {
        task: mainFocusTask,
        placement: placements.find((p) => p.taskId === mainFocusTask.id) || null,
        reasons: reasonsFor(mainFocusTask, reasonCtx),
      }
      : null,
    mustDo: mustDo.map((task) => ({
      task,
      placement: placements.find((p) => p.taskId === task.id) || null,
      reasons: reasonsFor(task, reasonCtx),
    })),
    ifTime,
    quickWins,
    placements,
    unplaced,
    ranked,
    conflicts: findConflicts(day, ctx),
    topProjectId,
    /* Facts the interface states rather than a paragraph the interface prints.
     * Sentences are assembled where the strings live. */
    facts: {
      eligibleCount: eligible.length,
      placedCount: placements.length,
      unplacedCount: unplaced.length,
      overloadMinutes: capacity.overloadMinutes,
      freeMinutes: capacity.freeMinutes,
      usableMinutes: capacity.usableMinutes,
      plannedMinutes: capacity.plannedMinutes,
      longestWindow: windows.reduce((max, w) => Math.max(max, w.minutes || (w.end - w.start)), 0),
      bestWindow: windows.length
        ? windows.slice().sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0]
        : null,
    },
  };
}

/**
 * At most three, and they have to earn it.
 *
 * Overdue first, then due today, then whatever ranks highest — but only if it
 * was placed, because a "must do today" that has nowhere to happen is a
 * sentence that makes the app wrong rather than the day full.
 */
function pickMustDo(ranked, dayIso, placedIds) {
  const overdue = ranked.filter((t) => t.dueDate && t.dueDate < dayIso);
  const dueToday = ranked.filter((t) => t.dueDate === dayIso);
  const rest = ranked.filter((t) => placedIds.has(t.id) && (!t.dueDate || t.dueDate > dayIso));

  const out = [];
  const seen = new Set();
  for (const list of [overdue, dueToday, rest]) {
    for (const task of list) {
      if (out.length >= MUST_DO_CAP) return out;
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      out.push(task);
    }
  }
  return out;
}

function pickTopProject(rankedTasks, projectsById) {
  const scoreByProject = new Map();
  for (const task of rankedTasks) {
    if (!task.projectId) continue;
    const project = projectsById.get(task.projectId);
    if (!project || project.status === 'done' || project.status === 'paused') continue;
    const prev = scoreByProject.get(project.id) || 0;
    scoreByProject.set(project.id, prev + (task._priority ? task._priority.score : 0));
  }
  let best = null;
  for (const [id, score] of scoreByProject) {
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : null;
}

/* ------------------------------------------------------------------ *
 * The other question: what right now
 * ------------------------------------------------------------------ */

/**
 * One task, for the "what should I do now" button.
 *
 * Different from the day plan in one important way: it is bounded by the
 * window a person is standing in, not by the day. Being told to start
 * something that needs ninety minutes when the next thing on the calendar is
 * in twenty is worse than being told nothing.
 */
export function suggestNextAction(ctx) {
  const day = ctx.today || todayIso();
  const from = ctx.nowMinutes === undefined ? nowMin() : ctx.nowMinutes;
  const prefs = ctx.preferences || {};

  const graph = ctx.graph || buildGraph(ctx.tasks || [], ctx.dependencies || []);
  const goalsById = ctx.goalsById || new Map((ctx.goals || []).map((g) => [g.id, g]));
  const projectsById = ctx.projectsById || new Map((ctx.projects || []).map((p) => [p.id, p]));

  const remaining = remainingToday(Object.assign({}, ctx, { today: day, nowMinutes: from }));
  const window = remaining.currentWindow;

  const eligible = eligibleTasks(day, Object.assign({}, ctx, { graph }))
    .filter((t) => effectiveStatus(graph, t) !== 'blocked');

  const byEnergy = ctx.energy === 'light'
    ? eligible.filter((t) => t.energyLevel !== 'deep')
    : eligible;

  const ranked = rankTasks(byEnergy, {
    weights: prefs.weights, today: day, graph, goalsById,
  });

  const availableMinutes = window ? window.minutes : 0;
  const fits = ranked.filter((t) => (t.estimatedMinutes || 25) <= availableMinutes);

  const reasonCtx = {
    day, graph, goalsById, projectsById,
    topProjectId: pickTopProject(ranked, projectsById),
    atRiskProjectIds: ctx.atRiskProjectIds || new Set(),
    today: day,
  };

  if (!window) {
    return {
      ok: false,
      code: 'noWindow',
      window: null,
      availableMinutes: 0,
      outsideHours: from < (prefs.workStartMinutes || 0) || from >= (prefs.workEndMinutes || 1440),
      alternatives: ranked.slice(0, 3),
    };
  }

  if (!fits.length) {
    /* Nothing fits, but something might if it were shorter. Saying which is
     * more useful than an empty state. */
    const nearest = ranked[0] || null;
    return {
      ok: false,
      code: 'nothingFits',
      window,
      availableMinutes,
      nearest,
      shortfall: nearest ? Math.max(0, (nearest.estimatedMinutes || 25) - availableMinutes) : 0,
      alternatives: ranked.slice(0, 3),
    };
  }

  const best = fits[0];
  const reasons = reasonsFor(best, reasonCtx);
  if (!reasons.length) reasons.push({ code: REASONS.FITS_WINDOW, have: availableMinutes, need: best.estimatedMinutes });
  if (fits.length === 1) reasons.push({ code: REASONS.ONLY_FIT });

  return {
    ok: true,
    task: best,
    window,
    availableMinutes,
    suggestedMinutes: Math.min(best.estimatedMinutes || 25, availableMinutes),
    startsAt: Math.max(from, window.start),
    endsAt: Math.max(from, window.start) + Math.min(best.estimatedMinutes || 25, availableMinutes),
    reasons,
    alternative: fits[1]
      ? { task: fits[1], reasons: reasonsFor(fits[1], reasonCtx) }
      : null,
  };
}

export { formatTime, addDays };
