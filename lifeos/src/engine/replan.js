/*
 * replan.js — rebuilding a day that reality has already changed.
 *
 * THE FOUR RULES, AND WHY EACH ONE IS ABSOLUTE.
 *
 *   Fixed events do not move.  A lesson at 18:00 is at 18:00. An app that
 *   proposes moving it has misunderstood what the calendar is for, and the one
 *   time it does that is the last time anyone presses this button.
 *
 *   Nothing is deleted.  Replanning may unschedule a task, push it to
 *   tomorrow, or leave it alone. It never decides work does not need doing.
 *   That decision belongs to a person and there is a separate screen for it.
 *
 *   Deadlines are respected.  A task due tomorrow is not moved past tomorrow,
 *   even when moving it would produce a tidier day. A tidy plan that misses a
 *   deadline is not a better plan.
 *
 *   Buffer survives.  Replanning is the exact moment the temptation to reclaim
 *   the slack appears — the day is already over-full, and there is 15% sitting
 *   right there. Taking it produces a plan that is full to the minute on a day
 *   that has already demonstrated it does not go to plan.
 *
 * OUTPUT IS A DIFF, NOT A NEW WORLD.
 *
 * The function returns a list of changes, each one individually selectable and
 * each one carrying its before and after. Three things fall out of that: the
 * preview screen is a rendering of the return value rather than a second
 * implementation; partial application is free; and undo is a matter of
 * replaying the diff backwards, which is what makes applying it directly —
 * with a toast rather than a confirmation dialog — a reasonable thing to do.
 */

import { today as todayIso, nowMinutes as nowMin, addDays, formatTime } from '../core/time.js';
import { buildDailyPlan } from './planner.js';

export const CHANGE = {
  SCHEDULE: 'schedule',
  MOVE: 'move',
  MOVE_DAY: 'moveDay',
  UNSCHEDULE: 'unschedule',
};

/** Blocks the planner is permitted to reconsider. */
function movableBlocks(blocks, dayIso) {
  return (blocks || []).filter((b) => {
    if (b.date !== dayIso) return false;
    /* Fixed is fixed, whoever made it. A person who marked a block fixed has
     * said something the planner does not get to overrule. */
    if (b.kind === 'fixed') return false;
    /* Preferred blocks a person placed are theirs; only the planner's own and
     * explicitly flexible ones are fair game. */
    if (b.kind === 'preferred' && b.createdBy === 'USER') return false;
    return true;
  });
}

/**
 * Recompute the day and return what would change.
 *
 * `ctx` is the same context the planner takes. Nothing here writes.
 */
export function replanDay(ctx) {
  const day = ctx.date || ctx.today || todayIso();
  const nowMinutes = ctx.nowMinutes === undefined ? nowMin() : ctx.nowMinutes;
  const isToday = day === (ctx.today || todayIso());

  const movable = movableBlocks(ctx.blocks, day);

  /* A block whose time has already started today is not movable either — it is
   * either happening or it has happened, and rescheduling the past is how a
   * planner produces a day nobody can act on. */
  const reconsider = movable.filter((b) => !isToday || b.startMinutes >= nowMinutes);
  const reconsiderIds = new Set(reconsider.map((b) => b.id));

  const before = new Map();
  for (const b of reconsider) {
    if (!b.taskId) continue;
    before.set(b.taskId, { blockId: b.id, date: b.date, start: b.startMinutes, end: b.endMinutes });
  }

  /* Replan with those blocks lifted, so their tasks can land somewhere else —
   * including back where they were, which produces no change at all and is the
   * correct outcome for a day that is already sensible. */
  const plan = buildDailyPlan(Object.assign({}, ctx, {
    date: day,
    ignoreBlockIds: Array.from(reconsiderIds),
    nowMinutes,
  }));

  const changes = [];
  const placedIds = new Set();

  for (const placement of plan.placements) {
    placedIds.add(placement.taskId);
    const prev = before.get(placement.taskId);

    if (!prev) {
      changes.push({
        id: `c_${placement.taskId}_sched`,
        type: CHANGE.SCHEDULE,
        taskId: placement.taskId,
        title: placement.task.title,
        to: { date: day, start: placement.startMinutes, end: placement.endMinutes },
        from: null,
        selected: true,
      });
      continue;
    }

    if (prev.start !== placement.startMinutes || prev.end !== placement.endMinutes) {
      changes.push({
        id: `c_${placement.taskId}_move`,
        type: CHANGE.MOVE,
        taskId: placement.taskId,
        title: placement.task.title,
        blockId: prev.blockId,
        from: { date: prev.date, start: prev.start, end: prev.end },
        to: { date: day, start: placement.startMinutes, end: placement.endMinutes },
        selected: true,
      });
    }
    /* Unchanged placements produce nothing. A diff that lists everything is a
     * diff nobody reads. */
  }

  /* Anything that had a slot and no longer fits. Pushed to the next day it can
   * be worked, unless its deadline forbids that — in which case it stays put
   * and the overload is surfaced instead of being quietly hidden by a move. */
  for (const [taskId, prev] of before) {
    if (placedIds.has(taskId)) continue;
    const task = (ctx.tasks || []).find((t) => t.id === taskId);
    if (!task) continue;

    const tomorrow = addDays(day, 1);
    const deadlineForbids = task.dueDate && task.dueDate < tomorrow;

    if (deadlineForbids) {
      changes.push({
        id: `c_${taskId}_keep`,
        type: CHANGE.MOVE,
        taskId,
        title: task.title,
        blockId: prev.blockId,
        from: { date: prev.date, start: prev.start, end: prev.end },
        to: { date: prev.date, start: prev.start, end: prev.end },
        keptForDeadline: true,
        selected: false,
      });
      continue;
    }

    changes.push({
      id: `c_${taskId}_day`,
      type: CHANGE.MOVE_DAY,
      taskId,
      title: task.title,
      blockId: prev.blockId,
      from: { date: prev.date, start: prev.start, end: prev.end },
      to: { date: tomorrow, start: null, end: null },
      selected: true,
    });
  }

  const moved = changes.filter((c) => c.type === CHANGE.MOVE_DAY && c.selected).length;

  return {
    date: day,
    plan,
    changes: changes.filter((c) => !(c.type === CHANGE.MOVE && c.keptForDeadline && !c.selected) || true),
    /* Untouched, so the preview can say "אירוע קבוע — ללא שינוי" next to the
     * things it did not move rather than silently omitting them. */
    fixed: (ctx.blocks || [])
      .filter((b) => b.date === day && !reconsiderIds.has(b.id))
      .concat((ctx.events || []).filter((e) => e.date === day)),
    summary: {
      total: changes.filter((c) => c.selected).length,
      scheduled: changes.filter((c) => c.type === CHANGE.SCHEDULE && c.selected).length,
      moved: changes.filter((c) => c.type === CHANGE.MOVE && c.selected).length,
      movedToNextDay: moved,
      keptForDeadline: changes.filter((c) => c.keptForDeadline).length,
      overloadMinutes: plan.capacity.overloadMinutes,
    },
    nothingToDo: changes.filter((c) => c.selected).length === 0,
  };
}

/**
 * The inverse of a change list, computed before anything is written.
 *
 * Capturing it up front rather than reconstructing it later is the difference
 * between an undo that restores the day and an undo that restores whatever the
 * day looked like by the time somebody pressed it.
 */
export function inverseOf(changes) {
  return changes.filter((c) => c.selected).map((c) => ({
    taskId: c.taskId,
    blockId: c.blockId || null,
    restore: c.from,
    hadBlock: !!c.blockId,
    wasUnscheduled: !c.from,
  }));
}

/** A one-line description of a change, in reason-code form. */
export function describeChange(change) {
  switch (change.type) {
    case CHANGE.SCHEDULE:
      return { key: 'planning.changes.schedule', params: { title: change.title, time: formatTime(change.to.start) } };
    case CHANGE.MOVE:
      return {
        key: 'planning.changes.move',
        params: { title: change.title, from: formatTime(change.from.start), to: formatTime(change.to.start) },
      };
    case CHANGE.MOVE_DAY:
      return { key: 'planning.changes.moveDay', params: { title: change.title, date: change.to.date } };
    case CHANGE.UNSCHEDULE:
      return { key: 'planning.changes.unschedule', params: { title: change.title } };
    default:
      return { key: 'planning.changes.schedule', params: { title: change.title, time: '' } };
  }
}
