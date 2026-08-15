/*
 * planning.js — the service that turns a computed plan into blocks on a
 * calendar, and can put them back.
 *
 * The engine decides; this applies. Keeping those apart is what makes the
 * preview screen a rendering of a value rather than a dry run of a mutation,
 * and it is what makes undo exact: the inverse is captured from the same
 * change list that is about to be applied, before anything is written.
 *
 * APPLYING IS ONE WRITE.
 *
 * A replan that schedules four tasks and moves two touches twelve records. As
 * twelve separate writes that is twelve serialisations of the account blob and
 * twelve re-renders of the screen doing the asking — and, worse, twelve
 * moments at which a browser killed mid-way leaves half a plan. db.batch()
 * collapses it to one.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { buildDailyPlan, suggestNextAction } from '../engine/planner.js';
import { replanDay, inverseOf, CHANGE } from '../engine/replan.js';
import { blocks } from './calendar.js';
import { today as todayIso, addDays } from '../core/time.js';

/* ------------------------------------------------------------------ *
 * Reading a plan
 * ------------------------------------------------------------------ */

/** The plan for a day. Pure — nothing is written. */
export function planFor(dayIso, opts) {
  const o = opts || {};
  const snap = snapshot();
  return buildDailyPlan(Object.assign({}, snap, {
    date: dayIso || snap.today,
    energy: o.energy || null,
    nowMinutes: o.nowMinutes === undefined ? snap.nowMinutes : o.nowMinutes,
  }));
}

export function today(opts) {
  return planFor(todayIso(), opts);
}

export function tomorrow(opts) {
  /* Planning tomorrow starts from the beginning of tomorrow, not from now.
   * Passing the current clock time through would clip tomorrow morning out of
   * the available windows. */
  return planFor(addDays(todayIso(), 1), Object.assign({}, opts, { nowMinutes: null }));
}

/** One task, for the "what should I do right now" button. */
export function nextAction(opts) {
  const o = opts || {};
  const snap = snapshot();
  return suggestNextAction(Object.assign({}, snap, {
    energy: o.energy || null,
    nowMinutes: o.nowMinutes === undefined ? snap.nowMinutes : o.nowMinutes,
  }));
}

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

/**
 * Write a plan's placements to the calendar as blocks.
 *
 * Only placements that do not already exist. Re-applying the same plan is a
 * no-op rather than a duplicate set of blocks, which matters because "plan my
 * day" is a button people press twice.
 */
export function applyPlan(plan, opts) {
  const o = opts || {};
  if (!plan || !plan.placements.length) return { ok: true, created: 0 };

  return db.batch(() => {
    let created = 0;
    const madeBlockIds = [];

    for (const placement of plan.placements) {
      const existing = db.list('blocks', (b) => b.taskId === placement.taskId
        && b.date === placement.date
        && b.startMinutes === placement.startMinutes);
      if (existing.length) continue;

      const result = blocks.scheduleTask(placement.taskId, placement.date, placement.startMinutes, {
        minutes: placement.minutes,
        kind: 'flexible',
        createdBy: o.actor || 'SYSTEM',
      });
      if (result.ok) { created += 1; madeBlockIds.push(result.block.id); }
    }

    if (created) {
      db.logEvent('PLAN_GENERATED', { date: plan.date, placed: created }, o.actor || 'SYSTEM');
    }
    return { ok: true, created, blockIds: madeBlockIds };
  });
}

/* ------------------------------------------------------------------ *
 * Replanning
 * ------------------------------------------------------------------ */

/** Compute what would change. Nothing is written. */
export function previewReplan(dayIso, opts) {
  const o = opts || {};
  const snap = snapshot();
  return replanDay(Object.assign({}, snap, {
    date: dayIso || snap.today,
    nowMinutes: o.nowMinutes === undefined ? snap.nowMinutes : o.nowMinutes,
  }));
}

/**
 * Apply a set of changes and return the undo token.
 *
 * `changes` is the list from previewReplan with `selected` toggled by the
 * person — which is what makes partial application (§159) free rather than a
 * second code path.
 */
export function applyReplan(result, opts) {
  const o = opts || {};
  const selected = (result.changes || []).filter((c) => c.selected);
  if (!selected.length) return { ok: true, applied: 0, undo: null };

  const undo = inverseOf(selected);

  db.batch(() => {
    for (const change of selected) {
      switch (change.type) {
        case CHANGE.SCHEDULE:
          blocks.scheduleTask(change.taskId, change.to.date, change.to.start, {
            minutes: change.to.end - change.to.start,
            createdBy: o.actor || 'SYSTEM',
          });
          break;

        case CHANGE.MOVE:
          if (change.keptForDeadline) break;
          if (change.blockId) blocks.remove(change.blockId, { keepTaskSchedule: true });
          blocks.scheduleTask(change.taskId, change.to.date, change.to.start, {
            minutes: change.to.end - change.to.start,
            createdBy: o.actor || 'SYSTEM',
          });
          break;

        case CHANGE.MOVE_DAY: {
          if (change.blockId) blocks.remove(change.blockId, { keepTaskSchedule: true });
          const task = db.get('tasks', change.taskId);
          if (task) {
            db.update('tasks', change.taskId, {
              scheduledDate: change.to.date,
              scheduledStart: null,
              scheduledEnd: null,
              postponeCount: (task.postponeCount || 0) + 1,
            });
            db.logEvent('TASK_RESCHEDULED', {
              taskId: change.taskId, title: task.title, from: change.from.date, to: change.to.date,
            }, o.actor || 'SYSTEM');
          }
          break;
        }

        case CHANGE.UNSCHEDULE:
          if (change.blockId) blocks.remove(change.blockId);
          db.update('tasks', change.taskId, { scheduledDate: null, scheduledStart: null, scheduledEnd: null });
          break;

        default:
          break;
      }
    }
    db.logEvent('PLAN_APPLIED', { date: result.date, changes: selected.length }, o.actor || 'SYSTEM');
  });

  return { ok: true, applied: selected.length, undo };
}

/**
 * Put it back.
 *
 * Reverses in the order the changes were captured. Blocks made by the apply
 * are removed by task-and-day rather than by id, because scheduleTask creates
 * new records and the ids in the undo token refer to the old ones.
 */
export function undoReplan(undo) {
  if (!undo || !undo.length) return { ok: true, restored: 0 };

  return db.batch(() => {
    let restored = 0;
    for (const item of undo) {
      const task = db.get('tasks', item.taskId);
      if (!task) continue;

      /* Clear whatever the apply left behind for this task. */
      for (const b of db.list('blocks', (x) => x.taskId === item.taskId)) {
        db.remove('blocks', b.id);
      }

      if (item.wasUnscheduled || !item.restore) {
        db.update('tasks', item.taskId, { scheduledDate: null, scheduledStart: null, scheduledEnd: null });
      } else {
        db.insert('blocks', {
          date: item.restore.date,
          startMinutes: item.restore.start,
          endMinutes: item.restore.end,
          taskId: item.taskId,
          kind: 'flexible',
          createdBy: 'USER',
        });
        db.update('tasks', item.taskId, {
          scheduledDate: item.restore.date,
          scheduledStart: item.restore.start,
          scheduledEnd: item.restore.end,
          /* The postpone counter was incremented by the move; putting the task
           * back has to put that back too, or an undone replan still counts
           * against the task in the stuck-task detector. */
          postponeCount: Math.max(0, (task.postponeCount || 0) - 1),
        });
      }
      restored += 1;
    }
    return { ok: true, restored };
  });
}

/* ------------------------------------------------------------------ *
 * Overload
 * ------------------------------------------------------------------ */

/** Is the day over-committed, and by how much. */
export function overload(dayIso) {
  const snap = snapshot();
  const plan = planFor(dayIso || snap.today);
  return {
    date: plan.date,
    overloadMinutes: plan.capacity.overloadMinutes,
    plannedMinutes: plan.capacity.plannedMinutes,
    usableMinutes: plan.capacity.usableMinutes,
    isOverloaded: plan.capacity.overloadMinutes > 0,
  };
}

/**
 * Move the least important scheduled work off a day until it fits.
 * Used by the "העבר למחר" action on the overload notice.
 */
export function relieveOverload(dayIso, opts) {
  const o = opts || {};
  const snap = snapshot();
  const day = dayIso || snap.today;
  const cap = snap.preferences;

  const scheduled = snap.tasks.filter((t) => t.scheduledDate === day
    && t.status !== 'done' && t.status !== 'cancelled');
  if (!scheduled.length) return { ok: true, moved: 0 };

  const plan = planFor(day);
  let excess = plan.capacity.overloadMinutes;
  if (excess <= 0) return { ok: true, moved: 0 };

  /* Lowest priority first, and never something due today or overdue. */
  const ranked = plan.ranked.slice().reverse()
    .filter((t) => t.scheduledDate === day)
    .filter((t) => !t.dueDate || t.dueDate > day);

  const moved = [];
  db.batch(() => {
    for (const task of ranked) {
      if (excess <= 0) break;
      for (const b of db.list('blocks', (x) => x.taskId === task.id && x.date === day)) {
        db.remove('blocks', b.id);
      }
      db.update('tasks', task.id, {
        scheduledDate: addDays(day, 1),
        scheduledStart: null,
        scheduledEnd: null,
        postponeCount: (task.postponeCount || 0) + 1,
      });
      db.logEvent('TASK_RESCHEDULED', {
        taskId: task.id, title: task.title, from: day, to: addDays(day, 1),
      }, o.actor || 'SYSTEM');
      excess -= task.estimatedMinutes || 0;
      moved.push({ taskId: task.id, title: task.title, from: day });
    }
  });

  return { ok: true, moved: moved.length, items: moved, bufferPct: cap.bufferPct };
}

/** Undo a relieve — the toast's button. */
export function undoRelieve(items) {
  if (!items || !items.length) return { ok: true };
  return db.batch(() => {
    for (const item of items) {
      const task = db.get('tasks', item.taskId);
      if (!task) continue;
      db.update('tasks', item.taskId, {
        scheduledDate: item.from,
        postponeCount: Math.max(0, (task.postponeCount || 0) - 1),
      });
    }
    return { ok: true };
  });
}
