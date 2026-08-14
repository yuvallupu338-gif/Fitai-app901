/*
 * services.test.mjs — the data layer, user isolation, and the core loop.
 *
 * §177 is the one that matters most here: user A must not be able to reach
 * user B's data. In an app with no server that is not a claim about attackers
 * — anyone with the device can read the storage — but it IS a claim about the
 * app's own API, and it is the claim the whole service layer is built to make
 * true. If it fails, two people sharing a laptop see each other's goals.
 *
 * §178's flow runs at the bottom, end to end: sign up, goal, project, task,
 * schedule, focus, complete, and every derived number moving as a result.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { freshApp, addAccount, switchTo, freezeToday } from './harness.mjs';

let db;
let session;
let core;
let tasksService;
let structure;
let calendarService;
let planning;
let rituals;
let focusService;
let notesService;
let insights;
let memoryService;
let account;
let demo;

before(async () => {
  await freshApp({ email: 'a@example.com', displayName: 'ראשון' });
  db = await import('../src/core/db.js');
  session = await import('../src/core/session.js');
  core = await import('../src/services/core.js');
  tasksService = await import('../src/services/tasks.js');
  structure = await import('../src/services/structure.js');
  calendarService = await import('../src/services/calendar.js');
  planning = await import('../src/services/planning.js');
  rituals = await import('../src/services/rituals.js');
  focusService = await import('../src/services/focus.js');
  notesService = await import('../src/services/notes.js');
  insights = await import('../src/services/insights.js');
  memoryService = await import('../src/services/memory.js');
  account = await import('../src/services/account.js');
  demo = await import('../src/services/demo.js');
});

/* ------------------------------------------------------------------ *
 * Ownership — §177
 * ------------------------------------------------------------------ */

describe('user isolation', () => {
  test('a second account cannot see the first account\'s data', async () => {
    const created = tasksService.create({ title: 'סוד של הראשון' });
    assert.equal(created.ok, true);
    const secretId = created.task.id;
    assert.equal(tasksService.all().length >= 1, true);

    await addAccount('b@example.com', 'שני');

    /* A fresh account starts empty. */
    assert.equal(tasksService.all().length, 0, 'the second account inherited data');

    /* And cannot reach the first account's record by id — which is the check
     * that matters, because an id is guessable in a way a list is not. */
    assert.equal(tasksService.byId(secretId), null, 'reached another account\'s task by id');
    assert.equal(db.get('tasks', secretId), null);

    /* Nor mutate it. */
    assert.equal(tasksService.update(secretId, { title: 'נחטף' }).ok, false);
    assert.equal(tasksService.remove(secretId), false);
    assert.equal(tasksService.setComplete(secretId, true).ok, false);

    /* Back on the first account it is untouched. */
    await switchTo('a@example.com');
    const still = tasksService.byId(secretId);
    assert.ok(still, 'the original account lost its own task');
    assert.equal(still.title, 'סוד של הראשון');
  });

  test('a record cannot be written with somebody else\'s user id', async () => {
    await switchTo('a@example.com');
    const mine = session.currentUserId();
    const created = tasksService.create({ title: 'ניסיון', userId: 'u_someone_else' });
    assert.equal(created.ok, true);
    assert.equal(created.task.userId, mine, 'a userId in the payload was honoured');
  });

  test('an import re-stamps ownership rather than writing invisible records', async () => {
    await switchTo('a@example.com');
    const mine = session.currentUserId();
    db.importAll({
      version: 1,
      collections: { tasks: [{ id: 'imported1', userId: 'u_other', title: 'מיובאת', status: 'ready' }] },
    });
    core.invalidate();
    const found = db.get('tasks', 'imported1');
    assert.ok(found, 'the imported record is invisible to the account that imported it');
    assert.equal(found.userId, mine);
  });

  test('signing out leaves nothing readable', async () => {
    await switchTo('a@example.com');
    session.signOut();
    assert.equal(session.currentUserId(), null);
    assert.throws(() => tasksService.all(), /not_signed_in/);
    await switchTo('a@example.com');
  });
});

/* ------------------------------------------------------------------ *
 * Authentication
 * ------------------------------------------------------------------ */

describe('authentication', () => {
  test('the password is not stored', () => {
    const raw = globalThis.window.localStorage.getItem('lifeos.v1.accounts');
    assert.ok(raw);
    assert.equal(raw.includes('password123'), false, 'the plaintext password is in storage');
  });

  test('a wrong password is refused', async () => {
    await assert.rejects(() => session.signIn('a@example.com', 'wrongwrong'), /bad_credentials/);
  });

  test('an unknown address gives the same error as a wrong password', async () => {
    await assert.rejects(() => session.signIn('nobody@example.com', 'password123'), /bad_credentials/);
  });

  test('a duplicate address is refused', async () => {
    await assert.rejects(
      () => session.signUp({ displayName: 'שוב', email: 'a@example.com', password: 'password123' }),
      /email_taken/,
    );
  });

  test('a short password is refused', async () => {
    await assert.rejects(
      () => session.signUp({ displayName: 'קצר', email: 'c@example.com', password: 'short' }),
      /password_short/,
    );
  });

  test('a malformed address is refused', async () => {
    await assert.rejects(
      () => session.signUp({ displayName: 'רע', email: 'not-an-email', password: 'password123' }),
      /email_invalid/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

describe('tasks', () => {
  before(async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
  });

  test('a task without a title is refused with a field error', () => {
    const result = tasksService.create({ title: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.title, 'the error is attached to the field the form can highlight');
  });

  test('a blocked task cannot be completed', () => {
    const a = tasksService.create({ title: 'עיצוב' }).task;
    const b = tasksService.create({ title: 'פיתוח' }).task;
    tasksService.addDependency(b.id, a.id);

    const attempt = tasksService.setComplete(b.id, true);
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, 'blocked');
    assert.equal(attempt.blockers[0].title, 'עיצוב');

    tasksService.setComplete(a.id, true);
    assert.equal(tasksService.setComplete(b.id, true).ok, true);
  });

  test('a dependency cycle is refused', () => {
    const a = tasksService.create({ title: 'א' }).task;
    const b = tasksService.create({ title: 'ב' }).task;
    tasksService.addDependency(b.id, a.id);
    const cycle = tasksService.addDependency(a.id, b.id);
    assert.equal(cycle.ok, false);
    assert.equal(cycle.code, 'cycle');
  });

  test('deleting a task removes the edges that pointed at it', () => {
    const a = tasksService.create({ title: 'ילך' }).task;
    const b = tasksService.create({ title: 'יישאר' }).task;
    tasksService.addDependency(b.id, a.id);
    tasksService.remove(a.id);
    core.invalidate();
    assert.equal(tasksService.dependencies(b.id).length, 0);
    /* And the survivor is workable again rather than blocked forever. */
    assert.equal(tasksService.setComplete(b.id, true).ok, true);
  });

  test('completing writes an activity event, and reopening writes another', () => {
    const t = tasksService.create({ title: 'למדידה' }).task;
    tasksService.setComplete(t.id, true);
    tasksService.setComplete(t.id, false);
    const types = db.list('activity', (e) => e.payload && e.payload.taskId === t.id).map((e) => e.type);
    assert.ok(types.includes('TASK_CREATED'));
    assert.ok(types.includes('TASK_COMPLETED'));
    assert.ok(types.includes('TASK_REOPENED'));
  });

  test('a project owns the goal and area of its tasks', () => {
    const area = structure.areas.create({ title: 'תכנות' }).area;
    const goal = structure.goals.create({ title: 'מטרה', areaId: area.id }).goal;
    const project = structure.projects.create({ title: 'פרויקט', goalId: goal.id }).project;
    core.invalidate();
    const t = tasksService.create({ title: 'משימה', projectId: project.id }).task;
    assert.equal(t.goalId, goal.id);
    assert.equal(t.areaId, area.id, 'the area came down from the goal via the project');
  });

  test('moving a task to a later day counts as a postponement, earlier does not', () => {
    const t = tasksService.create({ title: 'נדחית', scheduledDate: '2026-08-20' }).task;
    tasksService.schedule(t.id, '2026-08-22');
    assert.equal(tasksService.byId(t.id).postponeCount, 1);
    tasksService.schedule(t.id, '2026-08-21');
    assert.equal(tasksService.byId(t.id).postponeCount, 1, 'pulling work forward is not avoidance');
  });

  test('splitting replaces one task with a chain and keeps its context', () => {
    const project = structure.projects.all()[0];
    const big = tasksService.create({
      title: 'משימה גדולה', projectId: project.id, estimatedMinutes: 120,
    }).task;
    const result = tasksService.split(big.id, ['שלב א', 'שלב ב', 'שלב ג']);
    assert.equal(result.ok, true);
    assert.equal(result.tasks.length, 3);
    assert.equal(tasksService.byId(big.id).status, 'cancelled', 'the original is cancelled, not deleted');
    for (const t of result.tasks) assert.equal(t.projectId, project.id);
    core.invalidate();
    /* Chained: the second waits for the first. */
    assert.equal(tasksService.dependencies(result.tasks[1].id)[0].dependsOnId, result.tasks[0].id);
  });

  test('capture reads a Hebrew sentence into fields', () => {
    const restore = freezeToday('2026-08-17');
    try {
      const result = tasksService.capture('מחר ב־17:00 ללמוד מתמטיקה 45 דקות');
      assert.equal(result.ok, true);
      assert.equal(result.task.title, 'ללמוד מתמטיקה');
      assert.equal(result.task.scheduledDate, '2026-08-18');
      assert.equal(result.task.scheduledStart, 17 * 60);
      assert.equal(result.task.estimatedMinutes, 45);
      assert.equal(result.task.status, 'planned', 'a scheduled capture skips the inbox');
    } finally { restore(); }
  });

  test('a plain capture lands in the inbox', () => {
    const result = tasksService.capture('לבדוק משהו');
    assert.equal(result.task.status, 'inbox');
    assert.ok(tasksService.inbox().some((t) => t.id === result.task.id));
  });
});

/* ------------------------------------------------------------------ *
 * Structure
 * ------------------------------------------------------------------ */

describe('structure', () => {
  before(async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
  });

  test('deleting an area detaches its children instead of destroying them', () => {
    const area = structure.areas.create({ title: 'תחום' }).area;
    const goal = structure.goals.create({ title: 'מטרה', areaId: area.id }).goal;
    structure.areas.remove(area.id);
    core.invalidate();
    assert.ok(structure.goals.byId(goal.id), 'the goal went with the area');
    assert.equal(structure.goals.byId(goal.id).areaId, null);
  });

  test('deleting a goal keeps its projects', () => {
    const goal = structure.goals.create({ title: 'מטרה' }).goal;
    const project = structure.projects.create({ title: 'פרויקט', goalId: goal.id }).project;
    structure.goals.remove(goal.id);
    core.invalidate();
    assert.ok(structure.projects.byId(project.id));
    assert.equal(structure.projects.byId(project.id).goalId, null);
  });

  test('deleting a project takes its tasks and milestones with it', () => {
    const project = structure.projects.create({ title: 'ילך' }).project;
    const t = tasksService.create({ title: 'משימה', projectId: project.id }).task;
    const m = structure.milestones.create({ projectId: project.id, title: 'אבן דרך' }).milestone;
    structure.projects.remove(project.id);
    core.invalidate();
    assert.equal(tasksService.byId(t.id), null);
    assert.equal(structure.milestones.byId(m.id), null);
  });

  test('a milestone completion is logged for the weekly review to count', () => {
    const project = structure.projects.create({ title: 'פרויקט' }).project;
    const m = structure.milestones.create({ projectId: project.id, title: 'שלב' }).milestone;
    structure.milestones.setComplete(m.id, true);
    assert.ok(db.list('activity', (e) => e.type === 'MILESTONE_COMPLETED').length > 0);
  });

  test('project detail carries feasibility and health together', () => {
    const project = structure.projects.create({
      title: 'צפוף', dueDate: '2026-08-18', priority: 5,
    }).project;
    tasksService.create({ title: 'הרבה עבודה', projectId: project.id, estimatedMinutes: 1400 });
    core.invalidate();
    const detail = structure.projects.detail(project.id);
    assert.equal(detail.feasibility.ok, false);
    assert.ok(detail.options.length > 0, 'a shortfall must come with ways out');
    assert.ok(['at_risk', 'needs_attention'].includes(detail.health.health));
  });
});

/* ------------------------------------------------------------------ *
 * Calendar and planning
 * ------------------------------------------------------------------ */

describe('calendar and planning', () => {
  before(async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
  });

  test('scheduling a task onto the grid keeps the task and the block in step', () => {
    const t = tasksService.create({ title: 'לתזמן', estimatedMinutes: 45 }).task;
    const result = calendarService.blocks.scheduleTask(t.id, '2026-08-18', 17 * 60);
    assert.equal(result.ok, true);
    core.invalidate();
    const after = tasksService.byId(t.id);
    assert.equal(after.scheduledDate, '2026-08-18');
    assert.equal(after.scheduledStart, 17 * 60);
    assert.equal(after.scheduledEnd, 17 * 60 + 45);
  });

  test('dragging the same task again moves it rather than duplicating it', () => {
    const t = tasksService.create({ title: 'זזה', estimatedMinutes: 30 }).task;
    calendarService.blocks.scheduleTask(t.id, '2026-08-18', 10 * 60);
    calendarService.blocks.scheduleTask(t.id, '2026-08-18', 14 * 60);
    core.invalidate();
    const blocks = calendarService.blocks.forTask(t.id);
    assert.equal(blocks.length, 1, 'two blocks for one task double-count against capacity');
    assert.equal(blocks[0].startMinutes, 14 * 60);
  });

  test('an event ending before it starts is refused', () => {
    const result = calendarService.events.create({
      title: 'הפוך', date: '2026-08-18', startMinutes: 600, endMinutes: 500,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.endMinutes);
  });

  test('a plan can be applied and re-applied without duplicating blocks', () => {
    db.wipe();
    core.invalidate();
    tasksService.create({ title: 'א', estimatedMinutes: 30 });
    tasksService.create({ title: 'ב', estimatedMinutes: 30 });
    core.invalidate();

    const plan = planning.today();
    const first = planning.applyPlan(plan);
    assert.ok(first.created > 0);
    core.invalidate();
    const before = calendarService.blocks.forDay(plan.date).length;

    planning.applyPlan(planning.today());
    core.invalidate();
    assert.equal(calendarService.blocks.forDay(plan.date).length, before, 'pressing twice made duplicates');
  });

  test('a replan can be undone exactly', () => {
    db.wipe();
    core.invalidate();
    const t = tasksService.create({ title: 'לזוז', estimatedMinutes: 60 }).task;
    calendarService.blocks.scheduleTask(t.id, core.snapshot().today, 21 * 60, { minutes: 60 });
    core.invalidate();

    const beforeStart = tasksService.byId(t.id).scheduledStart;
    const preview = planning.previewReplan(core.snapshot().today, { nowMinutes: 8 * 60 });
    if (preview.nothingToDo) return;

    const applied = planning.applyReplan(preview);
    core.invalidate();
    planning.undoReplan(applied.undo);
    core.invalidate();

    assert.equal(tasksService.byId(t.id).scheduledStart, beforeStart, 'undo did not restore the time');
  });

  test('relieving an overload moves the least important work and can be undone', () => {
    db.wipe();
    core.invalidate();
    core.updatePreferences({ dailyCapacityMinutes: 60 });
    const today = core.snapshot().today;
    const keep = tasksService.create({
      title: 'חשובה', estimatedMinutes: 60, importance: 5, urgency: 5, scheduledDate: today,
    }).task;
    const drop = tasksService.create({
      title: 'פחות', estimatedMinutes: 120, importance: 1, urgency: 1, scheduledDate: today,
    }).task;
    core.invalidate();

    const result = planning.relieveOverload(today);
    core.invalidate();
    assert.ok(result.moved > 0);
    assert.equal(tasksService.byId(keep.id).scheduledDate, today, 'the important one stayed');
    assert.notEqual(tasksService.byId(drop.id).scheduledDate, today);

    planning.undoRelieve(result.items);
    core.invalidate();
    assert.equal(tasksService.byId(drop.id).scheduledDate, today, 'undo did not put it back');
    core.updatePreferences({ dailyCapacityMinutes: 240 });
  });
});

/* ------------------------------------------------------------------ *
 * Habits, focus, notes
 * ------------------------------------------------------------------ */

describe('habits and focus', () => {
  before(async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
  });

  test('ticking a habit twice on the same day un-ticks it', () => {
    const habit = rituals.habits.create({ title: 'לקרוא', frequency: 'daily' }).habit;
    rituals.habits.complete(habit.id, {});
    assert.equal(rituals.habits.completions(habit.id).length, 1);
    const second = rituals.habits.complete(habit.id, {});
    assert.equal(second.removed, true);
    assert.equal(rituals.habits.completions(habit.id).length, 0);
  });

  test('a minimum completion upgrades rather than duplicating', () => {
    const habit = rituals.habits.create({
      title: 'ללמוד', frequency: 'daily', minimumVersion: 'עשר דקות',
    }).habit;
    rituals.habits.complete(habit.id, { minimum: true });
    const upgraded = rituals.habits.complete(habit.id, { minimum: false });
    assert.equal(upgraded.upgraded, true);
    assert.equal(rituals.habits.completions(habit.id).length, 1);
    assert.equal(rituals.habits.completions(habit.id)[0].minimum, false);
  });

  test('a focus session survives a reload because it is a record, not a variable', () => {
    const t = tasksService.create({ title: 'להתמקד', estimatedMinutes: 25 }).task;
    focusService.start({ taskId: t.id, minutes: 25 });
    core.invalidate();

    /* Simulate a reload: drop the in-memory cache entirely. */
    db.unload();
    db.load();
    core.invalidate();

    const running = focusService.running();
    assert.ok(running, 'the running session was lost on reload');
    assert.equal(running.taskId, t.id);
    focusService.abandon();
  });

  test('finishing with "done" completes the task and records the time', () => {
    const t = tasksService.create({ title: 'תסתיים', estimatedMinutes: 25 }).task;
    focusService.start({ taskId: t.id, minutes: 25 });
    const result = focusService.finish({ outcome: 'done', minutes: 30 });
    core.invalidate();
    assert.equal(result.ok, true);
    const after = tasksService.byId(t.id);
    assert.equal(after.status, 'done');
    assert.equal(after.actualMinutes, 30);
  });

  test('finishing "stuck" with a reason parks the task rather than failing it', () => {
    const t = tasksService.create({ title: 'נתקעת' }).task;
    focusService.start({ taskId: t.id, minutes: 25 });
    focusService.finish({ outcome: 'stuck', waitingFor: 'תשובה מדנה' });
    core.invalidate();
    const after = tasksService.byId(t.id);
    assert.equal(after.status, 'waiting');
    assert.equal(after.waitingFor, 'תשובה מדנה');
  });

  test('two sessions cannot run at once', () => {
    const t = tasksService.create({ title: 'אחת' }).task;
    focusService.start({ taskId: t.id });
    const second = focusService.start({ taskId: t.id });
    assert.equal(second.ok, false);
    assert.equal(second.code, 'alreadyRunning');
    focusService.abandon();
  });

  test('search reaches every kind of record', () => {
    db.wipe();
    core.invalidate();
    tasksService.create({ title: 'לתקן את הניווט' });
    structure.projects.create({ title: 'אתר תיק עבודות' });
    notesService.create({ title: 'הערה על הניווט', body: 'משהו' });
    core.invalidate();

    const results = notesService.search('ניווט');
    const kinds = new Set(results.map((r) => r.kind));
    assert.ok(kinds.has('task'));
    assert.ok(kinds.has('note'));
    assert.ok(notesService.search('תיק').some((r) => r.kind === 'project'));
  });
});

/* ------------------------------------------------------------------ *
 * Storage failure
 * ------------------------------------------------------------------ */

describe('storage', () => {
  test('export carries the data and never an API key', async () => {
    await switchTo('a@example.com');
    const store = await import('../src/core/store.js');
    store.writeProviderKey('anthropic', 'sk-ant-secret-key-value-1234567890');
    const file = account.exportJson();
    assert.ok(file.text.includes('collections'));
    assert.equal(file.text.includes('sk-ant-secret'), false, 'the export leaked the API key');
    store.writeProviderKey('anthropic', '');
  });

  test('a round trip through export and import preserves the data', async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
    tasksService.create({ title: 'לשרוד ייצוא' });
    core.invalidate();

    const file = account.exportJson();
    db.wipe();
    core.invalidate();
    assert.equal(tasksService.all().length, 0);

    const result = account.importJson(file.text);
    assert.equal(result.ok, true);
    core.invalidate();
    assert.equal(tasksService.all().length, 1);
    assert.equal(tasksService.all()[0].title, 'לשרוד ייצוא');
  });

  test('an unusable file is reported rather than throwing', () => {
    assert.equal(account.importJson('this is not json').ok, false);
    assert.equal(account.importJson('{"nope":true}').code, 'shape');
  });

  test('the CSV is quoted correctly and carries a BOM for Excel', async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();
    tasksService.create({ title: 'כותרת, עם פסיק ו"מרכאות"' });
    core.invalidate();
    const file = account.exportCsv();
    assert.equal(file.text.charCodeAt(0), 0xfeff, 'no BOM: Excel renders Hebrew as mojibake');
    assert.ok(file.text.includes('"כותרת, עם פסיק ו""מרכאות"""'));
  });
});

/* ------------------------------------------------------------------ *
 * The core loop — §178 and §204, end to end
 * ------------------------------------------------------------------ */

describe('the core loop', () => {
  test('goal to project to task to focus to progress, with every number moving', async () => {
    await switchTo('a@example.com');
    db.wipe();
    core.invalidate();

    /* ORGANIZE — a goal and the work under it. */
    const area = structure.areas.create({ title: 'פרויקטים אישיים' }).area;
    const goal = structure.goals.create({
      title: 'להשיק אתר תיק עבודות',
      areaId: area.id,
      priority: 5,
      progressSource: 'milestones',
      targetDate: '2026-09-30',
    }).goal;
    const project = structure.projects.create({
      title: 'אתר תיק עבודות', goalId: goal.id, priority: 5,
    }).project;
    const m1 = structure.milestones.create({ projectId: project.id, title: 'העיצוב הושלם' }).milestone;
    structure.milestones.create({ projectId: project.id, title: 'הפיתוח הושלם' });
    core.invalidate();

    assert.equal(structure.goals.progress(goal).pct, 0, 'nothing done yet');

    /* CAPTURE */
    const captured = tasksService.capture('לתקן את הניווט במובייל 35 דקות');
    assert.equal(captured.ok, true);
    tasksService.update(captured.task.id, { projectId: project.id, status: 'ready' });
    core.invalidate();
    const t = tasksService.byId(captured.task.id);
    assert.equal(t.goalId, goal.id, 'the capture inherited the goal through the project');

    /* PLAN */
    const plan = planning.today();
    assert.ok(plan.mainFocus, 'the planner found nothing to do');
    assert.equal(plan.mainFocus.task.id, t.id);
    const applied = planning.applyPlan(plan);
    assert.ok(applied.created > 0);
    core.invalidate();
    assert.ok(tasksService.byId(t.id).scheduledDate, 'applying the plan did not schedule anything');

    /* FOCUS and COMPLETE */
    focusService.start({ taskId: t.id, minutes: 35 });
    focusService.finish({ outcome: 'done', minutes: 50 });
    core.invalidate();
    assert.equal(tasksService.byId(t.id).status, 'done');

    /* LEARN — the derived numbers all moved. */
    assert.equal(focusService.minutesOn(core.snapshot().today), 50);

    structure.milestones.setComplete(m1.id, true);
    core.invalidate();
    assert.equal(structure.goals.progress(goal).pct, 50, 'one of two milestones');

    const stats = insights.periodStats(core.snapshot().today, core.snapshot().today);
    assert.equal(stats.tasksCompleted, 1);
    assert.equal(stats.focusMinutes, 50);
    assert.equal(stats.milestonesCompleted, 1);

    const allocation = insights.timeAllocation('week');
    assert.equal(allocation.empty, false, 'the time chart is empty after real work');
    assert.ok(allocation.rows.some((r) => r.area && r.area.id === area.id));

    /* ADAPT — the next action is now something else. */
    const next = planning.nextAction();
    if (next.ok) assert.notEqual(next.task.id, t.id, 'a finished task was suggested again');
  });

  test('the demo seed produces analytics that are not empty', async () => {
    await addAccount('demo@example.com', 'אלכס');
    demo.seedDemo({ replace: true });
    core.invalidate();

    const snap = core.snapshot();
    assert.ok(snap.goals.length >= 3);
    assert.ok(snap.projects.length >= 3);
    assert.ok(snap.tasks.length > 20);

    const bounds = insights.weekBounds();
    const stats = insights.periodStats(bounds.from, bounds.to);
    assert.equal(stats.empty, false, 'a week of seeded history produced an empty review');
    assert.ok(stats.focusMinutes > 0);

    const allocation = insights.timeAllocation('month');
    assert.equal(allocation.empty, false);
    assert.ok(allocation.rows.length >= 2, 'time should be spread across areas');

    /* The estimate calibration is seeded to run light, and learn.js has to
     * find that itself rather than being told. */
    const calibration = insights.estimateAccuracy();
    assert.equal(calibration.ok, true, 'not enough seeded sessions to calibrate');
    assert.equal(calibration.verdict, 'over');
    assert.ok(calibration.driftPct > 15);

    /* And a project that genuinely cannot finish reports as such. */
    const exam = snap.projects.find((p) => p.title.includes('מבחן'));
    const health = snap.health.get(exam.id);
    assert.ok(['at_risk', 'needs_attention'].includes(health.health),
      `the crowded project reported ${health.health}`);

    /* The memories were derived, not written. */
    assert.ok(memoryService.all().length > 0, 'nothing was learned from a fortnight of history');
    assert.ok(memoryService.all().every((m) => m.content.length > 5));

    /* Today has something to show. */
    const plan = planning.today();
    assert.ok(plan.ranked.length > 0);
  });
});
