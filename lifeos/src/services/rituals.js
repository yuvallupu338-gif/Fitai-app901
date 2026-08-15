/*
 * rituals.js — habits and routines.
 *
 * WHAT §46 IS ACTUALLY ASKING FOR.
 *
 * "אל תבנה מנגנון אשמה." That is not a copy instruction, it is a data model
 * instruction. An app that stores only "done / not done" per day has no way to
 * say anything except how many times you failed, because that is the only fact
 * it kept.
 *
 * So a completion records whether it was the full version or the minimum one,
 * and both count as done. Somebody who read for five minutes on their worst
 * Tuesday did not break anything, and the grid shows a partial fill rather
 * than a gap. That single extra boolean is the difference between a tracker
 * that records what happened and one that keeps score against you.
 *
 * The streak is computed but deliberately demoted — one number among five, and
 * never the headline. See recurrence.js for why.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { HabitSchema, HabitCompletionSchema, RoutineSchema } from '../domain/schema.js';
import { errorMap } from '../domain/validate.js';
import { today as todayIso, weekDays, addDays, isoDay } from '../core/time.js';
import { habitStats, habitDueOn, habitRemainingThisWeek } from '../engine/recurrence.js';
import { dayCapacity } from '../engine/capacity.js';

/* ------------------------------------------------------------------ *
 * Habits
 * ------------------------------------------------------------------ */

export const habits = {
  all() { return db.list('habits').sort((a, b) => a.order - b.order); },
  active() { return db.list('habits', (hb) => hb.status === 'active').sort((a, b) => a.order - b.order); },
  byId(id) { return db.get('habits', id); },

  create(input) {
    const parsed = HabitSchema.parse(input, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    parsed.value.order = db.list('habits').length;
    return { ok: true, habit: db.insert('habits', parsed.value) };
  },

  update(id, patch) {
    const existing = db.get('habits', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const parsed = HabitSchema.parse(Object.assign({}, existing, patch), '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    return { ok: true, habit: db.update('habits', id, parsed.value) };
  },

  remove(id) {
    return db.batch(() => {
      db.removeWhere('habitCompletions', (c) => c.habitId === id);
      db.removeWhere('blocks', (b) => b.habitId === id);
      return db.remove('habits', id);
    });
  },

  completions(habitId) {
    return db.list('habitCompletions', (c) => c.habitId === habitId);
  },

  /**
   * Record a completion. `minimum` marks the five-minute version.
   * Calling it twice on the same day toggles rather than duplicating.
   */
  complete(habitId, opts) {
    const o = opts || {};
    const habit = db.get('habits', habitId);
    if (!habit) return { ok: false, code: 'notFound' };
    const date = o.date || todayIso();

    const existing = db.list('habitCompletions', (c) => c.habitId === habitId && c.date === date);

    return db.batch(() => {
      /* Same day, same kind → they are un-ticking it. Same day, different kind
       * → they are upgrading a minimum to a full one, which is a change rather
       * than a removal. */
      if (existing.length) {
        const current = existing[0];
        if (!!current.minimum === !!o.minimum) {
          for (const c of existing) db.remove('habitCompletions', c.id);
          return { ok: true, removed: true, habit };
        }
        for (const c of existing.slice(1)) db.remove('habitCompletions', c.id);
        const updated = db.update('habitCompletions', current.id, {
          minimum: !!o.minimum,
          minutes: o.minutes || (o.minimum ? Math.min(5, habit.estimatedMinutes) : habit.estimatedMinutes),
        });
        return { ok: true, completion: updated, habit, upgraded: true };
      }

      const parsed = HabitCompletionSchema.parse({
        habitId,
        date,
        minimum: !!o.minimum,
        minutes: o.minutes || (o.minimum ? Math.min(5, habit.estimatedMinutes) : habit.estimatedMinutes),
      }, '');
      if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };

      const completion = db.insert('habitCompletions', parsed.value);
      db.logEvent(o.minimum ? 'HABIT_MINIMUM' : 'HABIT_COMPLETED', {
        habitId, title: habit.title, date,
      });
      return { ok: true, completion, habit };
    });
  },

  /** A habit with its statistics and today's state. */
  detail(id) {
    const snap = snapshot();
    const habit = snap.habits.find((hb) => hb.id === id);
    if (!habit) return null;
    return {
      habit,
      area: habit.areaId ? snap.areasById.get(habit.areaId) : null,
      stats: habitStats(habit, snap.habitCompletions, {
        today: snap.today,
        createdOn: isoDay(habit.createdAt),
      }),
      completions: snap.habitCompletions.filter((c) => c.habitId === id),
    };
  },

  /**
   * Today's habits, with the busy-day offer attached.
   *
   * §45: on a full day the app suggests the minimum version rather than
   * silently expecting the full one. "Full" is decided by the same capacity
   * arithmetic everything else uses, not by a guess.
   */
  forToday(dayIso) {
    const snap = snapshot();
    const day = dayIso || snap.today;
    const capacity = dayCapacity(day, snap);
    const busy = capacity.remainingMinutes < 60 || capacity.overloadMinutes > 0;
    const week = weekDays(day, snap.profile.weekStartsOn);

    return snap.habits
      .filter((hb) => hb.status === 'active')
      .filter((hb) => habitDueOn(hb, day))
      .map((hb) => {
        const stats = habitStats(hb, snap.habitCompletions, {
          today: day,
          createdOn: isoDay(hb.createdAt),
        });
        const remaining = habitRemainingThisWeek(hb, snap.habitCompletions, week);
        return {
          habit: hb,
          stats,
          done: stats.doneToday,
          entry: stats.todayEntry,
          remainingThisWeek: remaining,
          /* Only offer the smaller version when there is one to offer and the
           * day genuinely has no room. */
          offerMinimum: busy && !stats.doneToday && !!hb.minimumVersion,
        };
      })
      /* A weekly-target habit that has already hit its target this week is not
       * outstanding, and showing it as undone every remaining day is exactly
       * the manufactured guilt this file exists to avoid. */
      .filter((row) => !(row.habit.frequency === 'weekly' && row.remainingThisWeek === 0 && !row.done));
  },
};

/* ------------------------------------------------------------------ *
 * Routines
 * ------------------------------------------------------------------ */

export const routines = {
  all() { return db.list('routines').sort((a, b) => a.order - b.order); },
  byId(id) { return db.get('routines', id); },

  create(input) {
    const value = Object.assign({}, input);
    value.steps = (value.steps || []).map((s, i) => Object.assign({
      id: s.id || `s${i}_${Math.random().toString(36).slice(2, 7)}`,
    }, s));
    const parsed = RoutineSchema.parse(value, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    parsed.value.order = db.list('routines').length;
    return { ok: true, routine: db.insert('routines', parsed.value) };
  },

  update(id, patch) {
    const existing = db.get('routines', id);
    if (!existing) return { ok: false, code: 'notFound' };
    const value = Object.assign({}, existing, patch);
    value.steps = (value.steps || []).map((s, i) => Object.assign({
      id: s.id || `s${i}_${Math.random().toString(36).slice(2, 7)}`,
    }, s));
    const parsed = RoutineSchema.parse(value, '');
    if (!parsed.ok) return { ok: false, errors: errorMap(parsed.errors) };
    return { ok: true, routine: db.update('routines', id, parsed.value) };
  },

  remove(id) {
    return db.batch(() => {
      db.removeWhere('blocks', (b) => b.routineId === id);
      return db.remove('routines', id);
    });
  },

  totalMinutes(routine) {
    return (routine.steps || []).reduce((sum, s) => sum + (s.minutes || 0), 0);
  },

  /**
   * Record a run.
   *
   * A routine is not a task and does not produce one; what it produces is a
   * focus session, because that is what actually happened — time spent, on a
   * named thing, ending at a known moment. That also means routine time shows
   * up in the time-allocation chart without a second accounting path.
   */
  recordRun(id, opts) {
    const o = opts || {};
    const routine = db.get('routines', id);
    if (!routine) return { ok: false, code: 'notFound' };

    const minutes = o.minutes === undefined ? routines.totalMinutes(routine) : o.minutes;
    const session = db.insert('focusSessions', {
      routineId: id,
      title: routine.title,
      kind: 'review',
      plannedMinutes: routines.totalMinutes(routine) || minutes,
      actualMinutes: minutes,
      startedAt: o.startedAt || (Date.now() - minutes * 60000),
      endedAt: Date.now(),
      outcome: o.skippedCount ? 'progress' : 'done',
      date: o.date || todayIso(),
    });
    db.logEvent('FOCUS_COMPLETED', {
      routineId: id, title: routine.title, minutes,
    });
    return { ok: true, session };
  },
};

export { addDays };
