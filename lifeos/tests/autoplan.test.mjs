/*
 * autoplan.test.mjs — the app writing tasks by itself.
 *
 * The feature is one sentence and the risk is all in the edges: something that
 * creates records without being asked has to be undoable exactly, has to stop
 * when there is nothing left to add, and must never touch work a person has
 * started. Each of those is a test here, because each of them is a way for
 * this to become the feature somebody turns off on their first day.
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { freshApp } from './harness.mjs';

let db;
let core;
let tasksService;
let structure;
let autoplan;
let bus;

before(async () => {
  await freshApp({ email: 'auto@example.com' });
  db = await import('../src/core/db.js');
  core = await import('../src/services/core.js');
  tasksService = await import('../src/services/tasks.js');
  structure = await import('../src/services/structure.js');
  autoplan = await import('../src/services/autoplan.js');
  bus = await import('../src/core/bus.js');
});

beforeEach(() => {
  db.wipe();
  core.invalidate();
  core.updatePreferences({ autoPlan: true });
  autoplan.resetBarren();
});

function makeGoal(title) {
  const goal = structure.goals.create({
    title: title || 'להשיק אתר תיק עבודות', priority: 5, targetDate: '2026-10-01',
  }).goal;
  core.invalidate();
  return goal;
}

/* ------------------------------------------------------------------ *
 * Creating
 * ------------------------------------------------------------------ */

describe('planning a goal', () => {
  test('a new goal gets a project, milestones and real first tasks', async () => {
    const goal = makeGoal();
    const result = await autoplan.planGoal(goal.id);
    core.invalidate();

    assert.equal(result.ok, true);
    const projects = structure.projects.forGoal(goal.id);
    assert.equal(projects.length, 1, 'one project, not a wall of them');

    const tasks = tasksService.forProject(projects[0].id);
    assert.ok(tasks.length >= 3, `only ${tasks.length} tasks — not enough to start from`);
    assert.ok(structure.milestones.forProject(projects[0].id).length > 0);

    for (const t of tasks) {
      assert.ok(t.title.length > 2);
      assert.ok(t.estimatedMinutes > 0, 'a task with no estimate cannot be planned into a day');
      assert.equal(t.status, 'ready');
      assert.doesNotMatch(t.title, /[a-zA-Z]{4,}/, 'the generated task is in English');
    }
  });

  test('the tasks inherit the goal and its area, so they are plannable', async () => {
    const area = structure.areas.create({ title: 'פרויקטים אישיים' }).area;
    const goal = structure.goals.create({ title: 'לבנות אתר', areaId: area.id, priority: 5 }).goal;
    core.invalidate();

    await autoplan.planGoal(goal.id);
    core.invalidate();

    const tasks = tasksService.all();
    assert.ok(tasks.length > 0);
    for (const t of tasks) {
      assert.equal(t.goalId, goal.id);
      assert.equal(t.areaId, area.id);
    }
  });

  test('what it created is attributed, so "where did these come from" has an answer', async () => {
    const goal = makeGoal();
    await autoplan.planGoal(goal.id);
    core.invalidate();

    const created = db.list('activity', (e) => e.type === 'TASK_CREATED');
    assert.ok(created.length > 0);
    assert.ok(created.every((e) => e.actor === 'AI' || e.actor === 'SYSTEM'),
      'auto-created tasks are indistinguishable from ones the person typed');
  });

  test('the whole plan is one write, not twenty', async () => {
    const goal = makeGoal();
    let changes = 0;
    const off = bus.on(bus.EV.DATA_CHANGED, () => { changes += 1; });
    await autoplan.planGoal(goal.id);
    off();
    assert.ok(changes <= 2, `${changes} writes for one plan`);
  });

  test('a goal that yields nothing reports it rather than throwing', async () => {
    const result = await autoplan.planGoal('no-such-goal');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'notFound');
  });
});

/* ------------------------------------------------------------------ *
 * Undo
 * ------------------------------------------------------------------ */

describe('undo', () => {
  test('removes exactly what was created', async () => {
    const goal = makeGoal();
    const result = await autoplan.planGoal(goal.id);
    core.invalidate();
    assert.ok(tasksService.all().length > 0);

    autoplan.undo(result.undo);
    core.invalidate();

    assert.equal(tasksService.all().length, 0);
    assert.equal(structure.projects.forGoal(goal.id).length, 0);
    assert.ok(structure.goals.byId(goal.id), 'undo took the goal with it');
  });

  test('does not take a task the person typed in between', async () => {
    const goal = makeGoal();
    const result = await autoplan.planGoal(goal.id);
    core.invalidate();

    const project = structure.projects.forGoal(goal.id)[0];
    const mine = tasksService.create({ title: 'משהו שכתבתי בעצמי', projectId: project.id }).task;
    core.invalidate();

    autoplan.undo(result.undo);
    core.invalidate();

    assert.ok(tasksService.byId(mine.id), 'undo deleted work the person wrote');
    assert.ok(structure.projects.byId(project.id),
      'the project was removed while it still held their task');
  });

  test('does not take a task already started or finished', async () => {
    const goal = makeGoal();
    const result = await autoplan.planGoal(goal.id);
    core.invalidate();

    const tasks = tasksService.all();
    const started = tasks[0];
    const finished = tasks[1];
    tasksService.update(started.id, { status: 'in_progress' });
    tasksService.setComplete(finished.id, true);
    core.invalidate();

    autoplan.undo(result.undo);
    core.invalidate();

    assert.ok(tasksService.byId(started.id), 'undo discarded work in progress');
    assert.ok(tasksService.byId(finished.id), 'undo discarded a completed task');
  });

  test('does not take a task that has been scheduled', async () => {
    const goal = makeGoal();
    const result = await autoplan.planGoal(goal.id);
    core.invalidate();

    const task = tasksService.all()[0];
    tasksService.schedule(task.id, '2026-09-01', 10 * 60);
    core.invalidate();

    autoplan.undo(result.undo);
    core.invalidate();
    assert.ok(tasksService.byId(task.id), 'undo removed something already placed in the day');
  });

  test('is safe to call twice, and safe with nothing', () => {
    assert.equal(autoplan.undo(null).ok, true);
    assert.equal(autoplan.undo({ tasks: ['gone'], projects: ['gone'], milestones: [] }).ok, true);
  });
});

/* ------------------------------------------------------------------ *
 * Refilling
 * ------------------------------------------------------------------ */

describe('refilling a project that ran out', () => {
  test('finishing the last task produces the next ones', async () => {
    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    const task = tasksService.create({ title: 'הצעד היחיד', projectId: project.id }).task;
    core.invalidate();

    tasksService.setComplete(task.id, true);
    core.invalidate();

    const result = await autoplan.refillProject(project.id);
    core.invalidate();

    assert.equal(result.ok, true);
    const open = tasksService.forProject(project.id)
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    assert.ok(open.length > 0, 'the project is still empty');
    assert.ok(open.length <= 4, `${open.length} tasks is a wall, not a next step`);
  });

  test('a project that still has work is left alone', async () => {
    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    tasksService.create({ title: 'א', projectId: project.id });
    tasksService.create({ title: 'ב', projectId: project.id });
    core.invalidate();

    const result = await autoplan.refillProject(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'notEmpty');
  });

  test('a finished or paused project is never refilled', async () => {
    const done = structure.projects.create({ title: 'גמור' }).project;
    structure.projects.update(done.id, { status: 'done' });
    core.invalidate();
    assert.equal((await autoplan.refillProject(done.id)).code, 'closed');

    const paused = structure.projects.create({ title: 'מושהה' }).project;
    structure.projects.update(paused.id, { status: 'paused' });
    core.invalidate();
    assert.equal((await autoplan.refillProject(paused.id)).code, 'closed');
  });

  test('a project whose plan is exhausted stops being asked', async () => {
    /* The template library is finite. Without this, every tick in a project
     * that has nothing left to add costs a generation pass — or a paid model
     * call — forever. */
    const project = structure.projects.create({ title: 'משהו בלי תבנית מתאימה כלל' }).project;
    core.invalidate();

    /* Drain it: keep refilling and completing until it yields nothing. */
    for (let i = 0; i < 6; i += 1) {
      const result = await autoplan.refillProject(project.id);
      core.invalidate();
      if (!result.ok) break;
      for (const t of tasksService.forProject(project.id)) {
        if (t.status !== 'done') tasksService.setComplete(t.id, true);
      }
      core.invalidate();
    }

    const first = await autoplan.refillProject(project.id);
    const second = await autoplan.refillProject(project.id);
    const third = await autoplan.refillProject(project.id);
    assert.equal(third.ok, false);
    assert.ok(['empty', 'exhausted'].includes(third.code));
    assert.equal(second.ok, false, 'it kept generating after running dry');
    assert.equal(first.ok, false);
  });

  test('a refill never duplicates what is already in the project', async () => {
    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    core.invalidate();

    const first = await autoplan.refillProject(project.id);
    core.invalidate();
    assert.equal(first.ok, true);

    const titles = tasksService.forProject(project.id).map((t) => t.title);
    assert.equal(new Set(titles).size, titles.length, 'the first refill duplicated itself');

    for (const t of tasksService.forProject(project.id)) tasksService.setComplete(t.id, true);
    core.invalidate();

    const second = await autoplan.refillProject(project.id);
    core.invalidate();
    if (second.ok) {
      const all = tasksService.forProject(project.id).map((t) => t.title);
      assert.equal(new Set(all).size, all.length, 'the refill proposed a task that already existed');
    }
  });

  test('the refill can be undone', async () => {
    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    core.invalidate();
    const result = await autoplan.refillProject(project.id);
    core.invalidate();
    assert.equal(result.ok, true);

    autoplan.undo(result.undo);
    core.invalidate();
    const open = tasksService.forProject(project.id)
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    assert.equal(open.length, 0);
    assert.ok(structure.projects.byId(project.id), 'undo removed a project it did not create');
  });
});

/* ------------------------------------------------------------------ *
 * The switch
 * ------------------------------------------------------------------ */

describe('the setting', () => {
  test('is on by default', () => {
    assert.equal(autoplan.enabled(), true);
  });

  test('turning it off stops the automatic refill', async () => {
    core.updatePreferences({ autoPlan: false });
    core.invalidate();
    assert.equal(autoplan.enabled(), false);

    /* The listener is what the setting gates; calling the function directly
     * still works, because the goal screen's explicit button uses it. */
    let notified = 0;
    autoplan.install(() => { notified += 1; });

    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    const task = tasksService.create({ title: 'אחת', projectId: project.id }).task;
    core.invalidate();

    tasksService.setComplete(task.id, true);
    core.invalidate();
    await new Promise((r) => { setTimeout(r, 60); });

    assert.equal(notified, 0, 'it refilled with the setting off');
  });
});

/* ------------------------------------------------------------------ *
 * The trigger, end to end
 * ------------------------------------------------------------------ */

describe('the completion trigger', () => {
  test('completing the last task in a project refills it, without being asked', async () => {
    core.updatePreferences({ autoPlan: true });
    core.invalidate();

    const results = [];
    autoplan.install((r) => results.push(r));

    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    const task = tasksService.create({ title: 'הצעד האחרון', projectId: project.id }).task;
    core.invalidate();

    tasksService.setComplete(task.id, true);
    /* The listener is async; give the microtask queue and the generation a
     * moment. Nothing here is timing-sensitive beyond that. */
    await new Promise((r) => { setTimeout(r, 120); });
    core.invalidate();

    assert.equal(results.length, 1, 'no refill happened');
    assert.ok(results[0].taskCount > 0);

    const open = tasksService.forProject(project.id)
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    assert.ok(open.length > 0);
  });

  test('completing a task in a project that still has work does nothing', async () => {
    const results = [];
    autoplan.install((r) => results.push(r));

    const project = structure.projects.create({ title: 'בניית אתר' }).project;
    const a = tasksService.create({ title: 'א', projectId: project.id }).task;
    tasksService.create({ title: 'ב', projectId: project.id });
    core.invalidate();

    tasksService.setComplete(a.id, true);
    await new Promise((r) => { setTimeout(r, 120); });

    assert.equal(results.length, 0);
  });

  test('a task with no project never triggers anything', async () => {
    const results = [];
    autoplan.install((r) => results.push(r));

    const loose = tasksService.create({ title: 'בלי פרויקט' }).task;
    core.invalidate();
    tasksService.setComplete(loose.id, true);
    await new Promise((r) => { setTimeout(r, 120); });

    assert.equal(results.length, 0);
  });
});
