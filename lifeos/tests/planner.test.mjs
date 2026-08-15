/*
 * planner.test.mjs — §174's list, one scenario per case.
 *
 *   no free windows · a task too big for any window · three urgent tasks ·
 *   a conflict · a deadline tomorrow · an overloaded day · a fixed event
 *
 * Plus the two properties that matter more than any individual case: the
 * planner never proposes work it cannot place, and replanning never moves
 * something a person fixed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyPlan, suggestNextAction, eligibleTasks, fitTasksToWindows } from '../src/engine/planner.js';
import { replanDay, CHANGE, inverseOf } from '../src/engine/replan.js';
import { buildGraph } from '../src/engine/deps.js';
import { DEFAULT_WEIGHTS } from '../src/domain/schema.js';
import { explainNextAction, explainReasons } from '../src/engine/explain.js';

const TODAY = '2026-08-17'; /* a Monday, so no weekend rest-day interference */

const PREFS = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 22 * 60,
  focusWindowStart: 16 * 60,
  focusWindowEnd: 19 * 60,
  breakMinutes: 10,
  maxDeepWorkMinutes: 180,
  bufferPct: 15,
  minBlockMinutes: 15,
  dailyCapacityMinutes: 480,
  restDays: [],
  weights: DEFAULT_WEIGHTS,
};

function task(over) {
  return Object.assign({
    id: `t${Math.random().toString(36).slice(2, 9)}`,
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

function ctx(over) {
  const base = Object.assign({
    today: TODAY,
    date: TODAY,
    nowMinutes: 8 * 60,
    preferences: PREFS,
    tasks: [],
    dependencies: [],
    goals: [],
    projects: [],
    milestones: [],
    events: [],
    blocks: [],
    focusSessions: [],
  }, over);
  base.graph = buildGraph(base.tasks, base.dependencies);
  base.goalsById = new Map(base.goals.map((g) => [g.id, g]));
  base.projectsById = new Map(base.projects.map((p) => [p.id, p]));
  base.milestonesById = new Map(base.milestones.map((m) => [m.id, m]));
  return base;
}

/* ------------------------------------------------------------------ *
 * §174 scenarios
 * ------------------------------------------------------------------ */

describe('planner scenarios', () => {
  test('no free windows: nothing is placed and nothing is promised', () => {
    const plan = buildDailyPlan(ctx({
      tasks: [task({ title: 'משימה' })],
      events: [{ id: 'e', title: 'כל היום', date: TODAY, startMinutes: 8 * 60, endMinutes: 22 * 60, allDay: false }],
    }));
    assert.equal(plan.placements.length, 0);
    assert.equal(plan.mainFocus, null, 'no focus rather than an unplaceable one');
    assert.equal(plan.mustDo.length, 0);
  });

  test('a rest day plans nothing', () => {
    const plan = buildDailyPlan(ctx({
      preferences: Object.assign({}, PREFS, { restDays: [1] }),
      tasks: [task({})],
    }));
    assert.equal(plan.placements.length, 0);
    assert.equal(plan.capacity.isRestDay, true);
  });

  test('a task too big for every window is left unplaced, with a reason', () => {
    /* The capacity ceiling is raised out of the way so the binding constraint
     * is genuinely the window size — otherwise this would pass for the wrong
     * reason, reporting 'budget' when the point is window fragmentation. */
    const plan = buildDailyPlan(ctx({
      nowMinutes: 8 * 60,
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 900, bufferPct: 0 }),
      tasks: [task({ title: 'ענקית', estimatedMinutes: 300 })],
      events: [
        { id: 'a', date: TODAY, startMinutes: 10 * 60, endMinutes: 11 * 60, allDay: false },
        { id: 'b', date: TODAY, startMinutes: 13 * 60, endMinutes: 14 * 60, allDay: false },
        { id: 'c', date: TODAY, startMinutes: 17 * 60, endMinutes: 18 * 60, allDay: false },
      ],
    }));
    assert.equal(plan.placements.length, 0);
    assert.equal(plan.unplaced.length, 1);
    assert.equal(plan.unplaced[0].why, 'noWindow', 'no single gap is 300 minutes long');
  });

  test('undated work is planned for tomorrow but not for three weeks out', () => {
    /* The rule that decides this used to require a due date for any day other
     * than today, which made "plan tomorrow" return nothing for anybody whose
     * tasks had no deadlines. */
    const tomorrow = buildDailyPlan(ctx({
      date: '2026-08-18',
      nowMinutes: 20 * 60,
      tasks: [task({ estimatedMinutes: 60 })],
    }));
    assert.equal(tomorrow.placements.length, 1);

    const farOff = buildDailyPlan(ctx({
      date: '2026-09-10',
      tasks: [task({ estimatedMinutes: 60 })],
    }));
    assert.equal(farOff.placements.length, 0, 'the backlog is not dragged three weeks ahead');
  });

  test('three urgent tasks: at most three must-do, and the cap is not a display limit', () => {
    const plan = buildDailyPlan(ctx({
      tasks: [
        task({ title: 'א', dueDate: TODAY, importance: 5, urgency: 5 }),
        task({ title: 'ב', dueDate: TODAY, importance: 5, urgency: 5 }),
        task({ title: 'ג', dueDate: TODAY, importance: 5, urgency: 5 }),
        task({ title: 'ד', dueDate: TODAY, importance: 5, urgency: 5 }),
        task({ title: 'ה', dueDate: TODAY, importance: 5, urgency: 5 }),
      ],
    }));
    assert.equal(plan.mustDo.length, 3);
  });

  test('overdue work outranks everything and reaches must-do first', () => {
    const plan = buildDailyPlan(ctx({
      tasks: [
        task({ title: 'ישנה', dueDate: '2026-08-10' }),
        task({ title: 'חדשה', importance: 5, urgency: 5, goalImpact: 5 }),
      ],
    }));
    assert.equal(plan.mustDo[0].task.title, 'ישנה');
    assert.ok(plan.mustDo[0].reasons.some((r) => r.code === 'overdue'));
  });

  test('a deadline tomorrow is explained as such', () => {
    const plan = buildDailyPlan(ctx({
      tasks: [task({ title: 'מחר', dueDate: '2026-08-18' })],
    }));
    const reasons = plan.mainFocus.reasons;
    const soon = reasons.find((r) => r.code === 'dueSoon');
    assert.ok(soon);
    assert.equal(soon.days, 1);
    assert.match(explainReasons(reasons), /מחר/);
  });

  test('a fixed event is planned around, never over', () => {
    const plan = buildDailyPlan(ctx({
      tasks: [task({ estimatedMinutes: 60 }), task({ estimatedMinutes: 60 }), task({ estimatedMinutes: 60 })],
      events: [{ id: 'e', title: 'שיעור', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60 + 30, allDay: false }],
    }));
    for (const placement of plan.placements) {
      const clashes = placement.startMinutes < 19 * 60 + 30 && placement.endMinutes > 18 * 60;
      assert.equal(clashes, false, `${placement.task.title} overlaps the lesson`);
    }
  });

  test('an overloaded day reports the overload rather than hiding it', () => {
    const plan = buildDailyPlan(ctx({
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 120 }),
      tasks: [task({ id: 'x', scheduledDate: TODAY, estimatedMinutes: 300 })],
    }));
    assert.ok(plan.capacity.overloadMinutes > 0);
    assert.ok(plan.conflicts.some((c) => c.kind === 'overload'));
  });

  test('blocked tasks are never planned', () => {
    const a = task({ id: 'a', title: 'עיצוב' });
    const b = task({ id: 'b', title: 'פיתוח' });
    const plan = buildDailyPlan(ctx({
      tasks: [a, b],
      dependencies: [{ taskId: 'b', dependsOnId: 'a' }],
    }));
    assert.ok(!plan.placements.some((p) => p.taskId === 'b'), 'a blocked task cannot be started');
    assert.ok(plan.placements.some((p) => p.taskId === 'a'));
  });

  test('waiting and someday are out of scope', () => {
    const eligible = eligibleTasks(TODAY, ctx({
      tasks: [
        task({ id: 'w', status: 'waiting', waitingFor: 'דנה' }),
        task({ id: 's', someday: true }),
        task({ id: 'ok' }),
      ],
    }));
    assert.deepEqual(eligible.map((t) => t.id), ['ok']);
  });

  test('nothing is planned into the past', () => {
    const plan = buildDailyPlan(ctx({
      nowMinutes: 15 * 60,
      tasks: [task({ estimatedMinutes: 30 }), task({ estimatedMinutes: 30 })],
    }));
    for (const p of plan.placements) {
      assert.ok(p.startMinutes >= 15 * 60, `placed at ${p.startMinutes}, before now`);
    }
  });

  test('planning a future day uses the whole day, not from now', () => {
    const plan = buildDailyPlan(ctx({
      date: '2026-08-18',
      nowMinutes: 20 * 60,
      tasks: [task({ estimatedMinutes: 60 })],
    }));
    assert.equal(plan.placements.length, 1);
    assert.ok(plan.placements[0].startMinutes < 20 * 60, 'tomorrow morning is available');
  });

  test('the buffer is not spent', () => {
    const plan = buildDailyPlan(ctx({
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 10000 }),
      tasks: Array.from({ length: 30 }, () => task({ estimatedMinutes: 60 })),
    }));
    const placedMinutes = plan.placements.reduce((s, p) => s + p.minutes, 0);
    assert.ok(placedMinutes <= plan.capacity.usableMinutes,
      `placed ${placedMinutes} into ${plan.capacity.usableMinutes} usable`);
    assert.ok(plan.capacity.bufferMinutes > 0);
  });

  test('deep work is not stacked past the daily ceiling', () => {
    const plan = buildDailyPlan(ctx({
      preferences: Object.assign({}, PREFS, { maxDeepWorkMinutes: 120, dailyCapacityMinutes: 600 }),
      tasks: Array.from({ length: 6 }, (u, i) => task({ id: `d${i}`, energyLevel: 'deep', estimatedMinutes: 60 })),
    }));
    const deepMinutes = plan.placements
      .filter((p) => p.task.energyLevel === 'deep')
      .reduce((s, p) => s + p.minutes, 0);
    assert.ok(deepMinutes <= 120, `${deepMinutes} minutes of deep work placed`);
  });

  test('low energy excludes what needs concentration', () => {
    const plan = buildDailyPlan(ctx({
      energy: 'light',
      tasks: [task({ id: 'deep', energyLevel: 'deep' }), task({ id: 'light', energyLevel: 'light' })],
    }));
    assert.ok(!plan.placements.some((p) => p.taskId === 'deep'));
    assert.ok(plan.placements.some((p) => p.taskId === 'light'));
  });

  test('the main focus is always something that was actually placed', () => {
    for (let i = 0; i < 20; i += 1) {
      const plan = buildDailyPlan(ctx({
        nowMinutes: 8 * 60 + i * 30,
        tasks: Array.from({ length: 5 }, (u, k) => task({
          id: `t${k}`,
          estimatedMinutes: [15, 45, 90, 30, 120][k],
          importance: (k % 5) + 1,
          dueDate: k === 2 ? TODAY : null,
        })),
        events: [{ id: 'e', date: TODAY, startMinutes: 12 * 60, endMinutes: 13 * 60, allDay: false }],
      }));
      if (!plan.mainFocus) continue;
      const placed = plan.placements.some((p) => p.taskId === plan.mainFocus.task.id);
      assert.ok(placed, 'the headline task must have a slot');
    }
  });

  test('placements never overlap each other', () => {
    const plan = buildDailyPlan(ctx({
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 600 }),
      tasks: Array.from({ length: 10 }, (u, i) => task({ id: `t${i}`, estimatedMinutes: 30 + i * 5 })),
    }));
    const sorted = plan.placements.slice().sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].startMinutes >= sorted[i - 1].endMinutes,
        `${sorted[i - 1].task.title} and ${sorted[i].task.title} overlap`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Next action
 * ------------------------------------------------------------------ */

describe('next action', () => {
  test('never suggests something that does not fit the window', () => {
    const result = suggestNextAction(ctx({
      nowMinutes: 17 * 60,
      tasks: [task({ title: 'ארוכה', estimatedMinutes: 120, importance: 5, urgency: 5 })],
      events: [{ id: 'e', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60, allDay: false }],
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'nothingFits');
    assert.equal(result.shortfall, 60, 'and it says by how much');
  });

  test('picks the best thing that does fit', () => {
    const result = suggestNextAction(ctx({
      nowMinutes: 17 * 60,
      tasks: [
        task({ id: 'big', estimatedMinutes: 120, importance: 5 }),
        task({ id: 'fits', estimatedMinutes: 45, importance: 4, dueDate: TODAY }),
      ],
      events: [{ id: 'e', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60, allDay: false }],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.task.id, 'fits');
    assert.ok(result.suggestedMinutes <= result.availableMinutes);
  });

  test('outside working hours it says so rather than inventing a window', () => {
    const result = suggestNextAction(ctx({
      nowMinutes: 23 * 60 + 30,
      tasks: [task({})],
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'noWindow');
    assert.equal(result.outsideHours, true);
  });

  test('the sentence names the duration, the window and a real reason', () => {
    const result = suggestNextAction(ctx({
      nowMinutes: 16 * 60,
      tasks: [
        task({ id: 'nav', title: 'לתקן את הניווט', estimatedMinutes: 35, importance: 4 }),
        task({ id: 'tests', title: 'בדיקות', estimatedMinutes: 60 }),
      ],
      dependencies: [{ taskId: 'tests', dependsOnId: 'nav' }],
      events: [{ id: 'e', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60, allDay: false }],
    }));
    assert.equal(result.ok, true);
    const sentence = explainNextAction(result);
    assert.match(sentence, /לתקן את הניווט/);
    assert.match(sentence, /35 דק׳/);
    assert.match(sentence, /חוסמת|בדיקות/, 'the blocking relationship is the reason');
    assert.doesNotMatch(sentence, /[a-zA-Z]{3,}/, 'no stray English');
  });

  test('an alternative is offered when there is one', () => {
    const result = suggestNextAction(ctx({
      nowMinutes: 10 * 60,
      tasks: [task({ id: 'a', importance: 5 }), task({ id: 'b', importance: 4 })],
    }));
    assert.ok(result.alternative);
    assert.equal(result.alternative.task.id, 'b');
  });
});

/* ------------------------------------------------------------------ *
 * Replanning
 * ------------------------------------------------------------------ */

describe('replan', () => {
  test('a fixed block is never moved', () => {
    const t = task({ id: 'a', scheduledDate: TODAY });
    const result = replanDay(ctx({
      nowMinutes: 8 * 60,
      tasks: [t],
      blocks: [{
        id: 'b1', date: TODAY, startMinutes: 10 * 60, endMinutes: 11 * 60,
        taskId: 'a', kind: 'fixed', createdBy: 'USER',
      }],
    }));
    assert.ok(!result.changes.some((c) => c.blockId === 'b1' && c.selected),
      'a fixed block produced a selected change');
  });

  test("a person's preferred block is left alone", () => {
    const t = task({ id: 'a', scheduledDate: TODAY });
    const result = replanDay(ctx({
      tasks: [t],
      blocks: [{
        id: 'b1', date: TODAY, startMinutes: 10 * 60, endMinutes: 11 * 60,
        taskId: 'a', kind: 'preferred', createdBy: 'USER',
      }],
    }));
    assert.ok(!result.changes.some((c) => c.blockId === 'b1' && c.selected));
  });

  test('a block already under way today is not rescheduled', () => {
    const t = task({ id: 'a', scheduledDate: TODAY });
    const result = replanDay(ctx({
      nowMinutes: 14 * 60,
      tasks: [t],
      blocks: [{
        id: 'b1', date: TODAY, startMinutes: 13 * 60, endMinutes: 15 * 60,
        taskId: 'a', kind: 'flexible', createdBy: 'SYSTEM',
      }],
    }));
    assert.ok(!result.changes.some((c) => c.blockId === 'b1'), 'the past is not replannable');
  });

  test('a deadline keeps a task on its day rather than pushing it out', () => {
    const t = task({ id: 'a', scheduledDate: TODAY, dueDate: TODAY, estimatedMinutes: 300 });
    const result = replanDay(ctx({
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 30 }),
      tasks: [t],
      blocks: [{
        id: 'b1', date: TODAY, startMinutes: 10 * 60, endMinutes: 15 * 60,
        taskId: 'a', kind: 'flexible', createdBy: 'SYSTEM',
      }],
    }));
    const moved = result.changes.find((c) => c.taskId === 'a' && c.type === CHANGE.MOVE_DAY && c.selected);
    assert.ok(!moved, 'a task due today must not be moved to tomorrow');
  });

  test('an already-sensible day produces no changes', () => {
    const result = replanDay(ctx({ tasks: [], blocks: [] }));
    assert.equal(result.nothingToDo, true);
    assert.equal(result.summary.total, 0);
  });

  test('nothing is ever deleted', () => {
    const result = replanDay(ctx({
      preferences: Object.assign({}, PREFS, { dailyCapacityMinutes: 15 }),
      tasks: [
        task({ id: 'a', scheduledDate: TODAY, estimatedMinutes: 120 }),
        task({ id: 'b', scheduledDate: TODAY, estimatedMinutes: 120 }),
      ],
      blocks: [
        { id: 'b1', date: TODAY, startMinutes: 9 * 60, endMinutes: 11 * 60, taskId: 'a', kind: 'flexible', createdBy: 'SYSTEM' },
        { id: 'b2', date: TODAY, startMinutes: 11 * 60, endMinutes: 13 * 60, taskId: 'b', kind: 'flexible', createdBy: 'SYSTEM' },
      ],
    }));
    for (const change of result.changes) {
      assert.notEqual(change.type, 'delete');
      assert.ok(['schedule', 'move', 'moveDay', 'unschedule'].includes(change.type));
    }
  });

  test('the inverse is captured before anything is applied', () => {
    const result = replanDay(ctx({
      nowMinutes: 8 * 60,
      tasks: [task({ id: 'a', scheduledDate: TODAY, estimatedMinutes: 60 })],
      blocks: [{
        id: 'b1', date: TODAY, startMinutes: 20 * 60, endMinutes: 21 * 60,
        taskId: 'a', kind: 'flexible', createdBy: 'SYSTEM',
      }],
    }));
    const undo = inverseOf(result.changes);
    for (const item of undo) {
      assert.ok(item.taskId);
      assert.ok(item.restore || item.wasUnscheduled, 'every undo entry knows where to put it back');
    }
  });

  test('fixed commitments are reported so the preview can show what was untouched', () => {
    const result = replanDay(ctx({
      tasks: [task({ id: 'a' })],
      events: [{ id: 'e', title: 'שיעור', date: TODAY, startMinutes: 18 * 60, endMinutes: 19 * 60, allDay: false }],
    }));
    assert.ok(result.fixed.some((f) => f.title === 'שיעור'));
  });
});

/* ------------------------------------------------------------------ *
 * Fitting, directly
 * ------------------------------------------------------------------ */

describe('fitting', () => {
  test('a task is never split across two windows', () => {
    const result = fitTasksToWindows(
      [task({ id: 'a', estimatedMinutes: 90 })],
      [{ start: 480, end: 510, minutes: 30 }, { start: 600, end: 660, minutes: 60 }],
      { date: TODAY, preferences: PREFS },
    );
    assert.equal(result.placements.length, 0, 'two windows totalling 90 minutes is not a 90-minute window');
    assert.equal(result.unplaced[0].why, 'noWindow');
  });

  test('a break is left between consecutive tasks', () => {
    const result = fitTasksToWindows(
      [task({ id: 'a', estimatedMinutes: 30 }), task({ id: 'b', estimatedMinutes: 30 })],
      [{ start: 480, end: 720, minutes: 240 }],
      { date: TODAY, preferences: PREFS },
    );
    assert.equal(result.placements.length, 2);
    const gap = result.placements[1].startMinutes - result.placements[0].endMinutes;
    assert.equal(gap, PREFS.breakMinutes);
  });

  test('deep work prefers the declared focus window', () => {
    const result = fitTasksToWindows(
      [task({ id: 'deep', energyLevel: 'deep', estimatedMinutes: 60 })],
      [{ start: 8 * 60, end: 12 * 60, minutes: 240 }, { start: 16 * 60, end: 19 * 60, minutes: 180 }],
      { date: TODAY, preferences: PREFS },
    );
    assert.ok(result.placements[0].startMinutes >= 16 * 60,
      'concentration work went to the morning instead of the focus window');
  });

  test('the budget is respected', () => {
    const result = fitTasksToWindows(
      Array.from({ length: 5 }, (u, i) => task({ id: `t${i}`, estimatedMinutes: 60 })),
      [{ start: 480, end: 1320, minutes: 840 }],
      { date: TODAY, preferences: PREFS, budgetMinutes: 120 },
    );
    const total = result.placements.reduce((s, p) => s + p.minutes, 0);
    assert.ok(total <= 120);
  });
});
