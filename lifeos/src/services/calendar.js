/*
 * calendar.js — events and time blocks.
 *
 * TWO KINDS OF THING ON ONE GRID, AND THEY ARE NOT THE SAME KIND.
 *
 * An event is something that is happening: a lesson, a meeting, a train. It
 * exists whether or not this app knows about it, and the app's job is to work
 * around it.
 *
 * A block is an intention: "I am going to work on the navigation from 17:00 to
 * 17:45". It exists because somebody decided it, and it can be reconsidered.
 *
 * Conflating them is the mistake that makes a planner untrustworthy — it moves
 * a lesson, once, and nobody presses the button again. So they are separate
 * collections with separate rules, and the planner may only ever touch the
 * second, filtered further by the fixed/flexible/preferred distinction the
 * person controls.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { EventSchema, BlockSchema } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import {
  today as todayIso, weekDays, monthGrid, startOfWeek, addDays, formatTimeRange,
} from '../core/time.js';
import { freeWindows, dayCapacity, findConflicts, busyIntervals } from '../engine/capacity.js';

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export const events = {
  all() { return db.list('events'); },
  byId(id) { return db.get('events', id); },
  forDay(dayIso) {
    return db.list('events', (e) => e.date === dayIso)
      .sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.startMinutes - b.startMinutes);
  },
  forRange(fromIso, toIso) {
    return db.list('events', (e) => e.date >= fromIso && e.date <= toIso);
  },

  create(input) {
    const parsed = EventSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    const value = parsed.value;
    if (!value.allDay && value.endMinutes <= value.startMinutes) {
      return { ok: false, errors: { endMinutes: { code: 'endBeforeStart' } } };
    }
    const event = db.batch(() => {
      const created = db.insert('events', value);
      db.logEvent('EVENT_CREATED', { eventId: created.id, title: created.title });
      return created;
    });
    return { ok: true, event };
  },

  update(id, patch) {
    const existing = db.get('events', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = EventSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    if (!parsed.value.allDay && parsed.value.endMinutes <= parsed.value.startMinutes) {
      return { ok: false, errors: { endMinutes: { code: 'endBeforeStart' } } };
    }
    return { ok: true, event: db.update('events', id, parsed.value) };
  },

  remove(id) { return db.remove('events', id); },
};

/* ------------------------------------------------------------------ *
 * Time blocks
 * ------------------------------------------------------------------ */

export const blocks = {
  all() { return db.list('blocks'); },
  byId(id) { return db.get('blocks', id); },
  forDay(dayIso) {
    return db.list('blocks', (b) => b.date === dayIso).sort((a, b) => a.startMinutes - b.startMinutes);
  },
  forRange(fromIso, toIso) {
    return db.list('blocks', (b) => b.date >= fromIso && b.date <= toIso);
  },
  forTask(taskId) { return db.list('blocks', (b) => b.taskId === taskId); },

  create(input) {
    const parsed = BlockSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    const value = parsed.value;
    if (value.endMinutes <= value.startMinutes) {
      return { ok: false, errors: { endMinutes: { code: 'endBeforeStart' } } };
    }
    if (value.taskId && !db.get('tasks', value.taskId)) return { ok: false, code: 'notFound' };

    const block = db.batch(() => {
      const created = db.insert('blocks', value);
      /* A block for a task is also a schedule for that task. Keeping them in
       * step here means the task list and the calendar can never disagree
       * about when something is happening. */
      if (created.taskId) {
        const task = db.get('tasks', created.taskId);
        if (task) {
          db.update('tasks', created.taskId, {
            scheduledDate: created.date,
            scheduledStart: created.startMinutes,
            scheduledEnd: created.endMinutes,
            status: task.status === 'inbox' ? 'planned' : task.status,
          });
        }
      }
      db.logEvent('BLOCK_CREATED', {
        blockId: created.id,
        taskId: created.taskId || null,
        title: created.title || (created.taskId ? (db.get('tasks', created.taskId) || {}).title : ''),
      }, input.createdBy || 'USER');
      return created;
    });
    return { ok: true, block };
  },

  update(id, patch) {
    const existing = db.get('blocks', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = BlockSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    if (parsed.value.endMinutes <= parsed.value.startMinutes) {
      return { ok: false, errors: { endMinutes: { code: 'endBeforeStart' } } };
    }

    return db.batch(() => {
      const block = db.update('blocks', id, parsed.value);
      if (block.taskId) {
        db.update('tasks', block.taskId, {
          scheduledDate: block.date,
          scheduledStart: block.startMinutes,
          scheduledEnd: block.endMinutes,
        });
      }
      return { ok: true, block };
    });
  },

  remove(id, opts) {
    const o = opts || {};
    const block = db.get('blocks', id);
    if (!block) return false;
    return db.batch(() => {
      /* Removing a block un-schedules its task unless the caller is moving it,
       * in which case the new block is about to set the schedule again and
       * clearing it in between would flicker the task out of the day. */
      if (block.taskId && !o.keepTaskSchedule) {
        const task = db.get('tasks', block.taskId);
        if (task && task.scheduledDate === block.date && task.scheduledStart === block.startMinutes) {
          db.update('tasks', block.taskId, { scheduledStart: null, scheduledEnd: null });
        }
      }
      return db.remove('blocks', id);
    });
  },

  /** Drag a task onto the grid. The one gesture that creates most blocks. */
  scheduleTask(taskId, dayIso, startMinutes, opts) {
    const o = opts || {};
    const task = db.get('tasks', taskId);
    if (!task) return { ok: false, code: 'notFound' };

    const minutes = o.minutes || Math.max(5, task.estimatedMinutes || 25);
    const start = Math.max(0, Math.min(1440 - minutes, startMinutes));

    return db.batch(() => {
      /* One block per task per day. Dragging a task that already has a slot
       * moves it rather than creating a second one — two blocks for one task
       * double-count against capacity and look like a bug. */
      for (const existing of db.list('blocks', (b) => b.taskId === taskId && b.date === dayIso)) {
        blocks.remove(existing.id, { keepTaskSchedule: true });
      }
      return blocks.create({
        date: dayIso,
        startMinutes: start,
        endMinutes: start + minutes,
        taskId,
        kind: o.kind || 'flexible',
        createdBy: o.createdBy || 'USER',
      });
    });
  },
};

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */

/** Everything on one day, ordered, ready to draw. */
export function day(dayIso) {
  const snap = snapshot();
  const dayEvents = events.forDay(dayIso);
  const dayBlocks = blocks.forDay(dayIso);

  const entries = [];
  for (const e of dayEvents) {
    if (e.allDay) continue;
    entries.push({
      kind: 'event',
      id: e.id,
      title: e.title,
      start: e.startMinutes,
      end: e.endMinutes,
      source: e,
    });
  }
  for (const b of dayBlocks) {
    const task = b.taskId ? snap.tasksById.get(b.taskId) : null;
    const habit = b.habitId ? snap.habits.find((x) => x.id === b.habitId) : null;
    const routine = b.routineId ? snap.routines.find((x) => x.id === b.routineId) : null;
    entries.push({
      kind: 'block',
      id: b.id,
      title: b.title || (task && task.title) || (habit && habit.title) || (routine && routine.title) || '',
      start: b.startMinutes,
      end: b.endMinutes,
      blockKind: b.kind,
      task,
      done: task ? task.status === 'done' : false,
      source: b,
    });
  }
  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    date: dayIso,
    allDayEvents: dayEvents.filter((e) => e.allDay),
    entries,
    capacity: dayCapacity(dayIso, snap),
    freeWindows: freeWindows(dayIso, snap),
    conflicts: findConflicts(dayIso, snap),
    /* Tasks scheduled to the day but not placed on the grid — the flexible
     * planning style produces these, and they belong in an unscheduled strip
     * above the grid rather than nowhere. */
    unplaced: snap.tasks.filter((t) => t.scheduledDate === dayIso
      && t.status !== 'done' && t.status !== 'cancelled'
      && !dayBlocks.some((b) => b.taskId === t.id)),
  };
}

export function week(anchorIso, weekStartsOn) {
  const days = weekDays(anchorIso, weekStartsOn === undefined ? 0 : weekStartsOn);
  return { days: days.map((d) => day(d)), from: days[0], to: days[6] };
}

export function month(anchorIso, weekStartsOn) {
  const snap = snapshot();
  const grid = monthGrid(anchorIso, weekStartsOn === undefined ? 0 : weekStartsOn);
  const from = grid[0];
  const to = grid[grid.length - 1];

  const eventsByDay = new Map();
  for (const e of events.forRange(from, to)) {
    if (!eventsByDay.has(e.date)) eventsByDay.set(e.date, []);
    eventsByDay.get(e.date).push(e);
  }
  const blocksByDay = new Map();
  for (const b of blocks.forRange(from, to)) {
    if (!blocksByDay.has(b.date)) blocksByDay.set(b.date, []);
    blocksByDay.get(b.date).push(b);
  }
  const tasksByDay = new Map();
  for (const t of snap.tasks) {
    if (!t.scheduledDate || t.scheduledDate < from || t.scheduledDate > to) continue;
    if (!tasksByDay.has(t.scheduledDate)) tasksByDay.set(t.scheduledDate, []);
    tasksByDay.get(t.scheduledDate).push(t);
  }

  return {
    days: grid.map((d) => ({
      date: d,
      events: (eventsByDay.get(d) || []).sort((a, b) => a.startMinutes - b.startMinutes),
      blocks: (blocksByDay.get(d) || []).sort((a, b) => a.startMinutes - b.startMinutes),
      tasks: tasksByDay.get(d) || [],
    })),
    from,
    to,
  };
}

/** The agenda view — only days with something on them. */
export function agenda(fromIso, days) {
  const out = [];
  for (let i = 0; i < (days || 14); i += 1) {
    const d = addDays(fromIso, i);
    const info = day(d);
    if (info.entries.length || info.allDayEvents.length || info.unplaced.length) out.push(info);
  }
  return out;
}

export { formatTimeRange, startOfWeek, todayIso, busyIntervals };
