/*
 * engine.test.mjs — the deterministic logic, tested without a browser.
 *
 * Everything here is a pure function of data passed in, which is the whole
 * reason the engines take a context object rather than reaching for a
 * database. §173's list, in order: priority, dependencies, project health,
 * goal progress, deadline risk, recurrence, memory deduplication.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { scoreTask, rankTasks, deadlinePressure, unlockPotential, priorityBand } from '../src/engine/priority.js';
import {
  buildGraph, blockers, isBlocked, dependents, unlockInfo, wouldCreateCycle,
  topologicalOrder, effectiveStatus,
} from '../src/engine/deps.js';
import { dayCapacity, freeWindows, findConflicts, realMinutesBetween, isRestDay } from '../src/engine/capacity.js';
import { feasibility, deadlineRisk, remainingWork, scopeCutCandidates } from '../src/engine/deadline.js';
import { projectHealth } from '../src/engine/health.js';
import { goalProgress, projectProgress, taskProgress, milestoneProgress } from '../src/engine/progress.js';
import { nextOccurrence, habitStats, habitDueOn, advanceAfterCompletion } from '../src/engine/recurrence.js';
import { estimateCalibration, stuckTasks, findingsToMemories } from '../src/engine/learn.js';
import { goalAlignment, timeByArea, projectLoadAdvice } from '../src/engine/alignment.js';
import { DEFAULT_WEIGHTS } from '../src/domain/schema.js';

const TODAY = '2026-08-14';

function task(over) {
  return Object.assign({
    id: `t${Math.random().toString(36).slice(2, 8)}`,
    title: 'משימה',
    status: 'ready',
    importance: 3, urgency: 3, goalImpact: 3, difficulty: 3,
    energyLevel: 'normal',
    estimatedMinutes: 30,
    actualMinutes: 0,
    dueDate: null, scheduledDate: null, scheduledStart: null, scheduledEnd: null,
    someday: false, postponeCount: 0, tags: [],
  }, over);
}

const PREFS = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 22 * 60,
  focusWindowStart: 16 * 60,
  focusWindowEnd: 19 * 60,
  breakMinutes: 10,
  maxDeepWorkMinutes: 180,
  bufferPct: 15,
  minBlockMinutes: 15,
  dailyCapacityMinutes: 300,
  restDays: [],
  weights: DEFAULT_WEIGHTS,
};

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

describe('priority', () => {
  test('deadline pressure decays and never inverts', () => {
    assert.equal(deadlinePressure(null, TODAY), 0, 'no deadline is no pressure, not a little');
    assert.equal(deadlinePressure('2026-08-10', TODAY), 1, 'overdue is maximal');
    assert.equal(deadlinePressure('2026-08-14', TODAY), 1, 'due today is maximal');

    const tomorrow = deadlinePressure('2026-08-15', TODAY);
    const threeDays = deadlinePressure('2026-08-17', TODAY);
    const twoWeeks = deadlinePressure('2026-08-28', TODAY);
    assert.ok(tomorrow > threeDays && threeDays > twoWeeks, 'monotonically decreasing');
    assert.ok(tomorrow - threeDays > twoWeeks - 0, 'the near-term gap is the large one');
  });

  test('a task due today outranks an identical one due in a month', () => {
    const soon = task({ dueDate: TODAY });
    const later = task({ dueDate: '2026-09-20' });
    const ctx = { weights: DEFAULT_WEIGHTS, today: TODAY };
    assert.ok(scoreTask(soon, ctx).score > scoreTask(later, ctx).score);
  });

  test('the score decomposes into exactly the five documented terms', () => {
    const result = scoreTask(task({ dueDate: TODAY }), { weights: DEFAULT_WEIGHTS, today: TODAY });
    assert.deepEqual(
      Object.keys(result.contributions).sort(),
      ['deadlinePressure', 'goalImpact', 'importance', 'unlockPotential', 'urgency'],
    );
    /* Every displayed part must be a real number, or the explanation screen
     * shows NaN to somebody asking why a task was ranked first. */
    for (const key of Object.keys(result.parts)) {
      assert.ok(Number.isFinite(result.parts[key]), `${key} is not finite`);
    }
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  test('weights are normalised, so dragging every slider up expresses nothing', () => {
    const t = task({ importance: 5, urgency: 1, dueDate: null });
    const normal = scoreTask(t, { weights: DEFAULT_WEIGHTS, today: TODAY }).score;
    const allMax = scoreTask(t, {
      weights: {
        importance: 1, urgency: 1, goalImpact: 1, deadlinePressure: 1, unlockPotential: 1,
      },
      today: TODAY,
    }).score;
    const allMaxScaled = scoreTask(t, {
      weights: {
        importance: 10, urgency: 10, goalImpact: 10, deadlinePressure: 10, unlockPotential: 10,
      },
      today: TODAY,
    }).score;
    assert.equal(allMax, allMaxScaled, 'scale-invariant');
    assert.ok(normal !== allMax, 'but the shape of the weights still matters');
  });

  test('all-zero weights fall back rather than dividing by zero', () => {
    const result = scoreTask(task({}), {
      weights: {
        importance: 0, urgency: 0, goalImpact: 0, deadlinePressure: 0, unlockPotential: 0,
      },
      today: TODAY,
    });
    assert.ok(Number.isFinite(result.score));
  });

  test('goal priority tilts the ranking without overturning it', () => {
    const ctx = { weights: DEFAULT_WEIGHTS, today: TODAY };
    const low = scoreTask(task({}), Object.assign({ goalPriority: 1 }, ctx)).score;
    const high = scoreTask(task({}), Object.assign({ goalPriority: 5 }, ctx)).score;
    assert.ok(high > low);
    assert.ok(high / low < 1.5, 'a multiplier, not a takeover');

    /* An urgent task under a low-priority goal still beats a trivial one under
     * the top goal. */
    const urgentLowGoal = scoreTask(
      task({ importance: 5, urgency: 5, dueDate: TODAY }),
      Object.assign({ goalPriority: 1 }, ctx),
    ).score;
    const trivialTopGoal = scoreTask(
      task({ importance: 1, urgency: 1 }),
      Object.assign({ goalPriority: 5 }, ctx),
    ).score;
    assert.ok(urgentLowGoal > trivialTopGoal);
  });

  test('ranking is stable — equal tasks do not swap between calls', () => {
    const list = [task({ id: 'b' }), task({ id: 'a' }), task({ id: 'c' })];
    const first = rankTasks(list, { weights: DEFAULT_WEIGHTS, today: TODAY }).map((t) => t.id);
    const second = rankTasks(list.slice().reverse(), { weights: DEFAULT_WEIGHTS, today: TODAY }).map((t) => t.id);
    assert.deepEqual(first, second);
  });

  test('bands', () => {
    assert.equal(priorityBand(80), 'high');
    assert.equal(priorityBand(50), 'medium');
    assert.equal(priorityBand(10), 'low');
  });
});

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

describe('dependencies', () => {
  /* עיצוב → פיתוח → בדיקות → השקה */
  function chain() {
    const design = task({ id: 'design', title: 'עיצוב' });
    const build = task({ id: 'build', title: 'פיתוח' });
    const test_ = task({ id: 'test', title: 'בדיקות' });
    const ship = task({ id: 'ship', title: 'השקה' });
    const deps = [
      { taskId: 'build', dependsOnId: 'design' },
      { taskId: 'test', dependsOnId: 'build' },
      { taskId: 'ship', dependsOnId: 'test' },
    ];
    return { tasks: [design, build, test_, ship], deps };
  }

  test('a task with an open blocker is blocked', () => {
    const { tasks, deps } = chain();
    const graph = buildGraph(tasks, deps);
    assert.equal(isBlocked(graph, 'design'), false);
    assert.equal(isBlocked(graph, 'build'), true);
    assert.equal(blockers(graph, 'build')[0].title, 'עיצוב');
  });

  test('completing a blocker releases exactly the next step', () => {
    const { tasks, deps } = chain();
    tasks[0].status = 'done';
    const graph = buildGraph(tasks, deps);
    assert.equal(isBlocked(graph, 'build'), false);
    assert.equal(isBlocked(graph, 'test'), true, 'two steps down is still blocked');
  });

  test('a cancelled blocker does not block forever', () => {
    const { tasks, deps } = chain();
    tasks[0].status = 'cancelled';
    const graph = buildGraph(tasks, deps);
    assert.equal(isBlocked(graph, 'build'), false);
  });

  test('unlock info separates immediate from downstream', () => {
    const { tasks, deps } = chain();
    const graph = buildGraph(tasks, deps);
    const info = unlockInfo(graph, 'design');
    assert.equal(info.immediateCount, 1, 'only פיתוח becomes workable');
    assert.equal(info.downstream, 3, 'but three things are behind it');
  });

  test('a task with two blockers unlocks nothing until both are done', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const c = task({ id: 'c' });
    const graph = buildGraph([a, b, c], [
      { taskId: 'c', dependsOnId: 'a' },
      { taskId: 'c', dependsOnId: 'b' },
    ]);
    assert.equal(unlockInfo(graph, 'a').immediateCount, 0, 'b still blocks c');

    a.status = 'done';
    const after = buildGraph([a, b, c], [
      { taskId: 'c', dependsOnId: 'a' },
      { taskId: 'c', dependsOnId: 'b' },
    ]);
    assert.equal(unlockInfo(after, 'b').immediateCount, 1);
  });

  test('unlock potential is bounded and rewards immediate release', () => {
    const { tasks, deps } = chain();
    const graph = buildGraph(tasks, deps);
    const value = unlockPotential(graph, 'design');
    assert.ok(value > 0 && value <= 1);
    assert.ok(unlockPotential(graph, 'ship') === 0, 'the last step releases nothing');
  });

  test('cycles are refused', () => {
    const { tasks, deps } = chain();
    const graph = buildGraph(tasks, deps);
    assert.equal(wouldCreateCycle(graph, 'design', 'ship'), true, 'closing the loop');
    assert.equal(wouldCreateCycle(graph, 'design', 'design'), true, 'self');
    assert.equal(wouldCreateCycle(graph, 'design', 'build'), true, 'one step back');
    const extra = task({ id: 'extra' });
    const wider = buildGraph(tasks.concat([extra]), deps);
    assert.equal(wouldCreateCycle(wider, 'design', 'extra'), false, 'unrelated is fine');
  });

  test('topological order puts blockers first', () => {
    const { tasks, deps } = chain();
    const graph = buildGraph(tasks, deps);
    const order = topologicalOrder(graph, ['ship', 'test', 'design', 'build']);
    assert.deepEqual(order, ['design', 'build', 'test', 'ship']);
  });

  test('imported data with a cycle still returns every task', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const graph = buildGraph([a, b], [
      { taskId: 'a', dependsOnId: 'b' },
      { taskId: 'b', dependsOnId: 'a' },
    ]);
    assert.equal(topologicalOrder(graph, ['a', 'b']).length, 2);
  });

  test('effective status overrides a stale stored status', () => {
    const { tasks, deps } = chain();
    tasks[1].status = 'ready';
    const graph = buildGraph(tasks, deps);
    assert.equal(effectiveStatus(graph, tasks[1]), 'blocked', 'stored ready, actually blocked');
  });

  test('an edge to a deleted task does not block', () => {
    const a = task({ id: 'a' });
    const graph = buildGraph([a], [{ taskId: 'a', dependsOnId: 'gone' }]);
    assert.equal(isBlocked(graph, 'a'), false);
  });
});

/* ------------------------------------------------------------------ *
 * Capacity
 * ------------------------------------------------------------------ */

describe('capacity', () => {
  const base = {
    today: TODAY,
    preferences: PREFS,
    events: [],
    blocks: [],
    tasks: [],
  };

  test('an empty day is the whole working window', () => {
    const cap = dayCapacity(TODAY, base);
    assert.equal(cap.freeMinutes, 840, '08:00-22:00');
    assert.equal(cap.bufferMinutes, 126, '15% held back');
    assert.equal(cap.usableMinutes, 300, 'capped by the declared daily capacity');
  });

  test('an event carves a hole', () => {
    const ctx = Object.assign({}, base, {
      events: [{ id: 'e', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60, allDay: false }],
    });
    const windows = freeWindows(TODAY, ctx);
    assert.equal(windows.length, 2);
    assert.equal(windows[0].end, 18 * 60);
    assert.equal(windows[1].start, 19 * 60);
  });

  test('an all-day event does not empty the day', () => {
    const ctx = Object.assign({}, base, {
      events: [{ id: 'e', date: TODAY, startMinutes: 0, endMinutes: 1440, allDay: true }],
    });
    assert.ok(dayCapacity(TODAY, ctx).freeMinutes > 800);
  });

  test('a gap shorter than the minimum block is not offered', () => {
    const ctx = Object.assign({}, base, {
      events: [
        { id: 'a', date: TODAY, startMinutes: 8 * 60, endMinutes: 12 * 60, allDay: false },
        { id: 'b', date: TODAY, startMinutes: 12 * 60 + 7, endMinutes: 22 * 60, allDay: false },
      ],
    });
    assert.equal(freeWindows(TODAY, ctx).length, 0, 'seven minutes is not a window');
  });

  test('a rest day has no windows', () => {
    const ctx = Object.assign({}, base, { preferences: Object.assign({}, PREFS, { restDays: [5] }) });
    assert.equal(isRestDay(TODAY, ctx.preferences), true, '2026-08-14 is a Friday');
    assert.equal(freeWindows(TODAY, ctx).length, 0);
  });

  test('fromMinutes clips the morning away', () => {
    const windows = freeWindows(TODAY, Object.assign({}, base, { fromMinutes: 14 * 60 }));
    assert.equal(windows[0].start, 14 * 60);
  });

  test('scheduled tasks without a block still count against capacity', () => {
    const ctx = Object.assign({}, base, {
      tasks: [task({ id: 'x', scheduledDate: TODAY, estimatedMinutes: 120 })],
    });
    assert.equal(dayCapacity(TODAY, ctx).plannedMinutes, 120);
  });

  test('overload is reported, not hidden', () => {
    const ctx = Object.assign({}, base, {
      blocks: [{ id: 'b', date: TODAY, startMinutes: 8 * 60, endMinutes: 20 * 60, kind: 'flexible' }],
    });
    const cap = dayCapacity(TODAY, ctx);
    assert.ok(cap.overloadMinutes > 0);
  });

  test('overlapping commitments are named as a conflict', () => {
    const ctx = Object.assign({}, base, {
      events: [
        { id: 'a', title: 'שיעור', date: TODAY, startMinutes: 600, endMinutes: 700, allDay: false },
        { id: 'b', title: 'פגישה', date: TODAY, startMinutes: 650, endMinutes: 720, allDay: false },
      ],
    });
    const overlap = findConflicts(TODAY, ctx).find((c) => c.kind === 'overlap');
    assert.ok(overlap);
    assert.equal(overlap.a.title, 'שיעור');
    assert.equal(overlap.b.title, 'פגישה');
  });

  test('window length is measured in real minutes', () => {
    assert.equal(realMinutesBetween(TODAY, 8 * 60, 22 * 60), 840);
    assert.equal(realMinutesBetween('2026-03-27', 8 * 60, 22 * 60), 840, 'transition is outside the window');
  });
});

/* ------------------------------------------------------------------ *
 * Deadlines
 * ------------------------------------------------------------------ */

describe('deadlines', () => {
  const ctx = { today: TODAY, preferences: PREFS, events: [], blocks: [], tasks: [] };

  test('no deadline returns null, not true', () => {
    const feas = feasibility({ dueDate: null, tasks: [task({})], today: TODAY, context: ctx });
    assert.equal(feas.ok, null, 'there is a difference between "fine" and "nothing to check"');
    assert.equal(deadlineRisk(feas).level, 'none');
  });

  test('remaining work counts only open tasks', () => {
    assert.equal(remainingWork([
      task({ estimatedMinutes: 60 }),
      task({ estimatedMinutes: 30, status: 'done' }),
      task({ estimatedMinutes: 30, status: 'cancelled' }),
    ]), 60);
  });

  test('twelve hours of work with five hours available is short by seven', () => {
    /* One day, capacity capped at 300 minutes, needing 720. */
    const feas = feasibility({
      dueDate: TODAY,
      tasks: [task({ estimatedMinutes: 720 })],
      today: TODAY,
      context: ctx,
    });
    assert.equal(feas.ok, false);
    assert.equal(feas.needed, 720);
    assert.equal(feas.available, 300);
    assert.equal(feas.shortfall, 420, 'seven hours');
    assert.equal(deadlineRisk(feas).level, 'over');
  });

  test('a comfortable deadline says so', () => {
    const feas = feasibility({
      dueDate: '2026-08-28',
      tasks: [task({ estimatedMinutes: 120 })],
      today: TODAY,
      context: ctx,
    });
    assert.equal(feas.ok, true);
    assert.ok(feas.surplus > 0);
    assert.equal(deadlineRisk(feas).level, 'comfortable');
  });

  test('a passed deadline is over, not merely tight', () => {
    const feas = feasibility({
      dueDate: '2026-08-10',
      tasks: [task({ estimatedMinutes: 60 })],
      today: TODAY,
      context: ctx,
    });
    assert.equal(feas.code, 'past');
    assert.equal(feas.overdueBy, 4);
  });

  test('scope cutting stops as soon as the gap closes', () => {
    const tasks = [
      task({ id: 'a', estimatedMinutes: 60, importance: 1 }),
      task({ id: 'b', estimatedMinutes: 60, importance: 2 }),
      task({ id: 'c', estimatedMinutes: 60, importance: 5 }),
    ];
    const cut = scopeCutCandidates(tasks, 90);
    assert.equal(cut.tasks.length, 2, 'two is enough; it does not list all three');
    assert.equal(cut.enough, true);
    assert.equal(cut.tasks[0].importance, 1, 'least important first');
  });
});

/* ------------------------------------------------------------------ *
 * Project health
 * ------------------------------------------------------------------ */

describe('project health', () => {
  function ctxWith(over) {
    return Object.assign({
      today: TODAY,
      preferences: PREFS,
      events: [], blocks: [], tasks: [], milestones: [], focusSessions: [],
      graph: buildGraph([], []),
    }, over);
  }

  test('a finished project is done and says nothing else', () => {
    const health = projectHealth({ id: 'p', status: 'done', completedAt: Date.now() }, ctxWith({}));
    assert.equal(health.health, 'done');
    assert.equal(health.progress.pct, 100);
  });

  test('a project whose every open task is blocked is blocked', () => {
    const a = task({ id: 'a', projectId: 'p' });
    const b = task({ id: 'b', projectId: 'p' });
    const tasks = [a, b];
    const deps = [{ taskId: 'a', dependsOnId: 'z' }, { taskId: 'b', dependsOnId: 'z' }];
    const blocker = task({ id: 'z', projectId: 'other' });
    const graph = buildGraph(tasks.concat([blocker]), deps);
    const health = projectHealth(
      { id: 'p', status: 'active', dueDate: null },
      ctxWith({ tasks: tasks.concat([blocker]), graph }),
    );
    assert.equal(health.health, 'blocked');
    assert.equal(health.reasons[0].code, 'blockedTasks');
  });

  test('a project that cannot finish in time is at risk, with the shortfall named', () => {
    const health = projectHealth(
      { id: 'p', status: 'active', dueDate: '2026-08-16' },
      ctxWith({ tasks: [task({ id: 'a', projectId: 'p', estimatedMinutes: 3000 })] }),
    );
    assert.equal(health.health, 'at_risk');
    const behind = health.reasons.find((r) => r.code === 'behind');
    assert.ok(behind && behind.shortfall > 0);
  });

  test('an untouched project with open work goes idle, not at risk', () => {
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const health = projectHealth(
      { id: 'p', status: 'active', dueDate: null },
      ctxWith({ tasks: [task({ id: 'a', projectId: 'p', updatedAt: old, estimatedMinutes: 30 })] }),
    );
    assert.equal(health.health, 'idle');
    assert.equal(health.reasons[0].code, 'stale');
  });

  test('a healthy project explains why it is healthy', () => {
    const health = projectHealth(
      { id: 'p', status: 'active', dueDate: '2026-10-01' },
      ctxWith({ tasks: [task({ id: 'a', projectId: 'p', estimatedMinutes: 60, updatedAt: Date.now() })] }),
    );
    assert.equal(health.health, 'on_track');
    assert.ok(health.reasons.length > 0, 'never a bare verdict');
  });

  test('a project with no open tasks needs attention rather than looking fine', () => {
    const health = projectHealth(
      { id: 'p', status: 'active', dueDate: '2026-09-01' },
      ctxWith({ tasks: [task({ id: 'a', projectId: 'p', status: 'done' })] }),
    );
    assert.equal(health.health, 'needs_attention');
    assert.ok(health.reasons.some((r) => r.code === 'noTasks'));
  });
});

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

describe('progress', () => {
  test('task progress weights by size, not by count', () => {
    const p = taskProgress([
      task({ status: 'done', estimatedMinutes: 10 }),
      task({ status: 'done', estimatedMinutes: 10 }),
      task({ status: 'ready', estimatedMinutes: 100 }),
    ]);
    assert.equal(p.done, 2);
    assert.equal(p.total, 3);
    assert.ok(p.pct < 50, 'two small ones are not most of the work');
  });

  test('cancelled tasks leave the denominator', () => {
    const p = taskProgress([
      task({ status: 'done', estimatedMinutes: 30 }),
      task({ status: 'cancelled', estimatedMinutes: 300 }),
    ]);
    assert.equal(p.pct, 100);
  });

  test('milestone progress counts checkpoints', () => {
    const p = milestoneProgress([
      { completedAt: 1 }, { completedAt: 1 }, { completedAt: null }, { completedAt: null },
    ]);
    assert.equal(p.pct, 50);
    assert.equal(p.basis, 'milestones');
  });

  test('a goal reports the basis it used, so the label can match', () => {
    const ctx = { projects: [], tasks: [], milestones: [] };
    const manual = goalProgress({
      id: 'g', progressSource: 'manual', progressManual: 40, status: 'active',
    }, ctx);
    assert.equal(manual.pct, 40);
    assert.equal(manual.basis, 'manual');

    const metric = goalProgress({
      id: 'g', progressSource: 'metric', metricCurrent: 5, metricTarget: 12,
      metricUnit: 'ספרים', status: 'active',
    }, ctx);
    assert.equal(metric.pct, 42);
    assert.equal(metric.unit, 'ספרים');
  });

  test('milestone progress rolls up across projects rather than averaging them', () => {
    const ctx = {
      projects: [{ id: 'p1', goalId: 'g' }, { id: 'p2', goalId: 'g' }],
      tasks: [],
      milestones: [
        { projectId: 'p1', completedAt: null }, { projectId: 'p1', completedAt: null },
        { projectId: 'p1', completedAt: null }, { projectId: 'p1', completedAt: null },
        { projectId: 'p2', completedAt: 1 },
      ],
    };
    const p = goalProgress({ id: 'g', progressSource: 'milestones', status: 'active' }, ctx);
    assert.equal(p.pct, 20, 'one of five, not the average of 0% and 100%');
  });

  test('a project with milestones prefers them over its task count', () => {
    const p = projectProgress(
      { id: 'p', status: 'active' },
      [task({ status: 'done' }), task({ status: 'done' })],
      [{ completedAt: null }, { completedAt: null }],
    );
    assert.equal(p.basis, 'milestones');
    assert.equal(p.pct, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Recurrence and habits
 * ------------------------------------------------------------------ */

describe('recurrence', () => {
  test('daily recurs from the given day', () => {
    assert.equal(nextOccurrence({ recurrence: 'daily' }, TODAY), TODAY);
  });

  test('weekly finds the next named day', () => {
    /* 2026-08-14 is a Friday; the next Sunday is the 16th. */
    assert.equal(nextOccurrence({ recurrence: 'weekly', recurrenceDays: [0] }, TODAY), '2026-08-16');
  });

  test('monthly clamps to the length of the month', () => {
    const t = { recurrence: 'monthly', scheduledDate: '2026-01-31' };
    assert.equal(nextOccurrence(t, '2026-02-01'), '2026-02-28');
  });

  test('a series past its end date stops', () => {
    assert.equal(nextOccurrence({ recurrence: 'daily', recurrenceUntil: '2026-08-01' }, TODAY), null);
  });

  test('completing a recurring task rolls it forward and clears the postpone count', () => {
    const patch = advanceAfterCompletion(
      { recurrence: 'weekly', recurrenceDays: [0], scheduledDate: '2026-08-16', postponeCount: 4 },
      '2026-08-16',
    );
    assert.equal(patch.scheduledDate, '2026-08-23');
    assert.equal(patch.postponeCount, 0, 'a rollover is not avoidance');
    assert.equal(patch.completedAt, null);
  });

  test('a habit due only on some days is not missed on the others', () => {
    const habit = { id: 'h', status: 'active', frequency: 'specific_days', days: [0, 2] };
    assert.equal(habitDueOn(habit, '2026-08-16'), true, 'Sunday');
    assert.equal(habitDueOn(habit, '2026-08-17'), false, 'Monday');
  });

  test('a streak survives a day the habit was not due', () => {
    const habit = { id: 'h', status: 'active', frequency: 'specific_days', days: [0, 2], estimatedMinutes: 30 };
    const completions = [
      { habitId: 'h', date: '2026-08-09' },
      { habitId: 'h', date: '2026-08-11' },
    ];
    const stats = habitStats(habit, completions, { today: '2026-08-12', createdOn: '2026-08-01' });
    assert.ok(stats.streak >= 2, 'Monday is not a break in a Sunday/Tuesday habit');
  });

  test('the minimum version counts as done', () => {
    const habit = { id: 'h', status: 'active', frequency: 'daily', estimatedMinutes: 30 };
    const stats = habitStats(habit, [
      { habitId: 'h', date: '2026-08-13', minimum: true },
      { habitId: 'h', date: '2026-08-14', minimum: false },
    ], { today: '2026-08-14', createdOn: '2026-08-13' });
    assert.equal(stats.totalDone, 2);
    assert.equal(stats.minimumCount, 1);
    assert.equal(stats.doneToday, true);
  });

  test('a trend is not reported without enough observations', () => {
    const habit = { id: 'h', status: 'active', frequency: 'daily', estimatedMinutes: 30 };
    const stats = habitStats(habit, [{ habitId: 'h', date: '2026-08-14' }], {
      today: '2026-08-14', createdOn: '2026-08-13',
    });
    assert.equal(stats.trend, 'unknown', 'one data point is not a trend');
  });

  test('days before the habit existed are not counted as misses', () => {
    const habit = { id: 'h', status: 'active', frequency: 'daily', estimatedMinutes: 30 };
    const stats = habitStats(habit, [{ habitId: 'h', date: '2026-08-14' }], {
      today: '2026-08-14', createdOn: '2026-08-14',
    });
    assert.equal(stats.rate7.pct, 100);
  });
});

/* ------------------------------------------------------------------ *
 * Learning
 * ------------------------------------------------------------------ */

describe('learning', () => {
  function calibrationSet(ratio, n) {
    const tasks = [];
    const sessions = [];
    for (let i = 0; i < n; i += 1) {
      const id = `t${i}`;
      tasks.push(task({ id, status: 'done', estimatedMinutes: 30 }));
      sessions.push({ taskId: id, actualMinutes: Math.round(30 * ratio), endedAt: 1, date: TODAY });
    }
    return { tasks, focusSessions: sessions };
  }

  test('no claim below the evidence threshold', () => {
    const result = estimateCalibration(calibrationSet(1.4, 3));
    assert.equal(result.ok, false);
    assert.equal(result.sampleSize, 3);
    assert.ok(result.needed > 3);
  });

  test('a consistent overrun is reported with its sample size', () => {
    const result = estimateCalibration(calibrationSet(1.4, 12));
    assert.equal(result.ok, true);
    assert.equal(result.verdict, 'over');
    assert.equal(result.driftPct, 40);
    assert.equal(result.sampleSize, 12);
  });

  test('a small drift is called accurate rather than dramatised', () => {
    assert.equal(estimateCalibration(calibrationSet(1.08, 12)).verdict, 'accurate');
  });

  test('one catastrophic afternoon does not move the median', () => {
    const set = calibrationSet(1.0, 12);
    set.focusSessions[0].actualMinutes = 600;
    assert.equal(estimateCalibration(set).verdict, 'accurate');
  });

  test('unfinished tasks contribute nothing', () => {
    const set = calibrationSet(1.4, 12);
    for (const t of set.tasks) t.status = 'in_progress';
    assert.equal(estimateCalibration(set).ok, false);
  });

  test('stuck tasks are the ones that keep sliding', () => {
    const stuck = stuckTasks([
      task({ id: 'a', postponeCount: 6 }),
      task({ id: 'b', postponeCount: 2 }),
      task({ id: 'c', postponeCount: 9, status: 'done' }),
    ]);
    assert.equal(stuck.length, 1);
    assert.equal(stuck[0].id, 'a');
  });

  test('findings become memory candidates only when they are real', () => {
    const thin = findingsToMemories(Object.assign({ areas: [] }, calibrationSet(1.4, 3)));
    assert.equal(thin.length, 0);
    const solid = findingsToMemories(Object.assign({ areas: [] }, calibrationSet(1.4, 14)));
    assert.ok(solid.length >= 1);
    assert.equal(solid[0].key, 'estimation.global', 'keyed by subject, so it can update in place');
    assert.ok(solid[0].evidenceCount >= 14);
  });
});

/* ------------------------------------------------------------------ *
 * Alignment
 * ------------------------------------------------------------------ */

describe('alignment', () => {
  test('nothing is claimed below a real amount of recorded time', () => {
    const result = goalAlignment({
      today: TODAY,
      goals: [{ id: 'g', status: 'active', priority: 5 }],
      projects: [], tasks: [], focusSessions: [], habits: [], habitCompletions: [],
      period: 'month',
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'notEnoughData');
  });

  test('a high-priority goal with almost no time is flagged', () => {
    const result = goalAlignment({
      today: TODAY,
      goals: [
        { id: 'hot', status: 'active', priority: 5 },
        { id: 'cold', status: 'active', priority: 2 },
      ],
      projects: [],
      tasks: [
        task({ id: 'a', goalId: 'hot', status: 'done', completedAt: Date.UTC(2026, 7, 10), estimatedMinutes: 20 }),
        task({ id: 'b', goalId: 'cold', status: 'done', completedAt: Date.UTC(2026, 7, 10), estimatedMinutes: 480 }),
      ],
      focusSessions: [], habits: [], habitCompletions: [],
      period: 'month',
    });
    assert.equal(result.ok, true);
    assert.equal(result.misaligned, true);
    assert.equal(result.starved[0].goal.id, 'hot');
  });

  test('a crowded slate advises waiting', () => {
    const advice = projectLoadAdvice({
      projects: [
        { id: '1', status: 'active' }, { id: '2', status: 'active' },
        { id: '3', status: 'active' }, { id: '4', status: 'active' },
      ],
      tasks: [], weekCapacityMinutes: 600,
    });
    assert.equal(advice.verdict, 'wait');
    assert.equal(advice.activeProjects, 4);
  });

  test('habit time lands in its area', () => {
    const minutes = timeByArea({
      fromDate: '2026-08-01', toDate: TODAY,
      tasks: [], projects: [], goals: [], focusSessions: [],
      habits: [{ id: 'h', areaId: 'fitness', estimatedMinutes: 45 }],
      habitCompletions: [{ habitId: 'h', date: '2026-08-10', minutes: 45 }],
    });
    assert.equal(minutes.get('fitness'), 45);
  });
});
