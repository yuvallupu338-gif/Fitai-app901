/*
 * priority.js — the score that decides what gets offered first.
 *
 * DETERMINISTIC, AND DELIBERATELY SO.
 *
 * No model ranks tasks in this app. Not because a model would rank them badly,
 * but because the ranking has to be the same on Tuesday as it was on Monday
 * for a list nobody edited, and it has to be explainable in one sentence to
 * somebody who disagrees with it. A score you can decompose into five
 * contributions is a score you can argue with; a model's opinion is a score you
 * can only accept or ignore. The model's job in this app is to phrase the
 * explanation, not to produce the number.
 *
 *     priorityScore =
 *       importance        × 0.30
 *     + urgency           × 0.25
 *     + goalImpact        × 0.20
 *     + deadlinePressure  × 0.15
 *     + unlockPotential   × 0.10
 *
 * The first three are 1–5 values a person set. The last two are computed —
 * which is the point of having them, because they are the two a person cannot
 * keep current by hand. A deadline moves closer every day whether or not
 * anyone re-rates the task, and how many other tasks are waiting behind this
 * one changes every time the graph changes.
 *
 * The weights are settings, and they normalise. Someone who drags every slider
 * to maximum has expressed no preference at all, so the sum is divided out
 * rather than left to inflate every score equally.
 */

import { daysBetween } from '../core/time.js';
import { unlockInfo } from './deps.js';
import { DEFAULT_WEIGHTS } from '../domain/schema.js';

/**
 * How hard the deadline is pushing, 0–1.
 *
 * A hyperbola rather than a straight ramp: the difference between due-today and
 * due-tomorrow should be large, and the difference between three weeks out and
 * four weeks out should be almost nothing. A linear countdown gets that
 * backwards, and produces the familiar failure where a task three weeks away
 * quietly outranks one due this afternoon because its owner rated it a 5.
 *
 *   overdue → 1.0    today → 1.0    tomorrow → 0.75    +3d → 0.50
 *   +7d → 0.30       +14d → 0.18    +30d → 0.09        none → 0
 *
 * No deadline means no deadline pressure. Not a small amount — none. The other
 * four terms are what rank a task nobody has dated.
 */
export function deadlinePressure(dueDate, todayIso) {
  if (!dueDate) return 0;
  const days = daysBetween(todayIso, dueDate);
  if (days <= 0) return 1;
  return 1 / (1 + days / 3);
}

/**
 * How much finishing this releases, 0–1.
 *
 * A task that immediately frees two others is worth far more than one that
 * eventually frees six, so immediate unlocks count fully and the rest of the
 * downstream chain counts at a third. Three immediate unlocks saturates the
 * term; beyond that the task is already going to be ranked first and more
 * signal changes nothing.
 */
export function unlockPotential(graph, taskId) {
  if (!graph) return 0;
  const info = unlockInfo(graph, taskId);
  const weighted = info.immediateCount + Math.max(0, info.downstream - info.immediateCount) * 0.33;
  return Math.min(1, weighted / 3);
}

function normaliseWeights(weights) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
  const keys = Object.keys(DEFAULT_WEIGHTS);
  let sum = 0;
  for (const k of keys) {
    w[k] = Math.max(0, Number(w[k]) || 0);
    sum += w[k];
  }
  if (sum <= 0) return Object.assign({}, DEFAULT_WEIGHTS);
  const out = {};
  for (const k of keys) out[k] = w[k] / sum;
  return out;
}

/* 1–5 → 0–1. A 3 is the middle and lands at 0.5. */
function scale5(n) {
  return (Math.max(1, Math.min(5, Number(n) || 3)) - 1) / 4;
}

/**
 * The score, plus the decomposition behind it.
 *
 * The parts are returned rather than logged because the interface shows them:
 * a person who thinks the ranking is wrong gets to see which term drove it and
 * change the input, instead of concluding the app is arbitrary.
 */
export function scoreTask(task, ctx) {
  const weights = normaliseWeights(ctx && ctx.weights);
  const todayIso = (ctx && ctx.today) || null;
  const graph = ctx && ctx.graph;

  const parts = {
    importance: scale5(task.importance),
    urgency: scale5(task.urgency),
    goalImpact: scale5(task.goalImpact),
    deadlinePressure: deadlinePressure(task.dueDate, todayIso),
    unlockPotential: unlockPotential(graph, task.id),
  };

  const contributions = {};
  let total = 0;
  for (const key of Object.keys(weights)) {
    contributions[key] = parts[key] * weights[key];
    total += contributions[key];
  }

  /*
   * Goal priority is a multiplier rather than a sixth term.
   *
   * As a term it would be diluted by the weights and a task under an
   * abandoned goal would still rank respectably on its own merits. As a
   * multiplier it does what a person means when they say a goal matters more:
   * everything under it moves together. The range is deliberately narrow —
   * 0.85 to 1.15 — because a goal's priority should tilt the ranking, not
   * overturn it.
   */
  const goalPriority = ctx && ctx.goalPriority ? ctx.goalPriority : 3;
  const goalMultiplier = 0.85 + (scale5(goalPriority) * 0.3);
  total *= goalMultiplier;

  return {
    score: Math.round(Math.max(0, Math.min(1, total)) * 1000) / 10,
    parts,
    contributions,
    weights,
    goalMultiplier: Math.round(goalMultiplier * 100) / 100,
  };
}

/**
 * Score a list, with the goal lookup done once.
 * Returns the tasks decorated with `_priority`, sorted highest first.
 */
export function rankTasks(tasks, ctx) {
  const goalsById = (ctx && ctx.goalsById) || new Map();
  const scored = tasks.map((task) => {
    const goal = task.goalId ? goalsById.get(task.goalId) : null;
    const result = scoreTask(task, Object.assign({}, ctx, {
      goalPriority: goal ? goal.priority : 3,
    }));
    return Object.assign({}, task, { _priority: result });
  });

  scored.sort((a, b) => {
    if (b._priority.score !== a._priority.score) return b._priority.score - a._priority.score;
    /* Ties broken by the nearer deadline, then by the shorter task. Two tasks
     * with identical scores should not swap places between renders, and a
     * stable tiebreak is cheaper than remembering an order. */
    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (a.estimatedMinutes !== b.estimatedMinutes) return a.estimatedMinutes - b.estimatedMinutes;
    return a.id < b.id ? -1 : 1;
  });

  return scored;
}

/** The single term that contributed most, for the one-line explanation. */
export function dominantFactor(priority) {
  let best = null;
  for (const key of Object.keys(priority.contributions)) {
    if (!best || priority.contributions[key] > priority.contributions[best]) best = key;
  }
  return best;
}

/* Named bands, for a chip that says "גבוהה" rather than "73.4". The interface
 * shows the band; the number is available in the detail view for anyone who
 * wants to see how it was reached. */
export function priorityBand(score) {
  if (score >= 62) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
