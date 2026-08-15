/*
 * focus.js — focus sessions, and the timer that survives a reload.
 *
 * THE RUNNING SESSION IS A RECORD, NOT A VARIABLE.
 *
 * The obvious implementation holds the start time in memory and writes a
 * session when the timer stops. Then somebody reloads the tab forty minutes
 * into a deep-work block and the forty minutes are gone — and those are
 * exactly the forty minutes that mattered, because they are the ones that
 * feed the estimate calibration and the time-allocation chart.
 *
 * So a session is inserted the moment it starts, with endedAt null, and the
 * elapsed time is derived from startedAt on every read. A reload picks it back
 * up. A tab closed and never reopened leaves an unfinished session, which
 * resume() finds and offers to close at its real elapsed length.
 *
 * Pauses are stored as intervals rather than by adjusting startedAt, because
 * adjusting startedAt makes "when did you work on this" a lie, and that field
 * is what productiveWindows() reads to work out when somebody's good hours
 * are.
 */

import * as db from '../core/db.js';
import { snapshot } from './core.js';
import { FocusSessionSchema } from '../domain/schema.js';
import { today as todayIso, isoDay, minutesOfDay } from '../core/time.js';
import { emit, EV } from '../core/bus.js';

/* A session left running longer than this was almost certainly a tab that got
 * closed, not four hours of unbroken concentration. Offered at its planned
 * length rather than its wall-clock length, so a forgotten timer cannot inject
 * a fictional afternoon into the statistics. */
const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

export function running() {
  const open = db.list('focusSessions', (s) => !s.endedAt);
  if (!open.length) return null;
  /* More than one open session means a second was started somewhere without
   * closing the first. The newest is the real one. */
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** Sessions that were left open long enough to be abandonment rather than work. */
export function stale() {
  const s = running();
  if (!s) return null;
  return Date.now() - s.startedAt > ABANDONED_AFTER_MS ? s : null;
}

/**
 * Elapsed working milliseconds, excluding time spent paused.
 * Derived rather than stored, so it is right after any interruption.
 */
export function elapsedMs(session, nowMs) {
  if (!session) return 0;
  const now = nowMs === undefined ? Date.now() : nowMs;
  const end = session.endedAt || now;
  let paused = 0;
  for (const p of session.pauses || []) {
    paused += (p.until || now) - p.from;
  }
  return Math.max(0, end - session.startedAt - paused);
}

export function isPaused(session) {
  if (!session || !session.pauses || !session.pauses.length) return false;
  return !session.pauses[session.pauses.length - 1].until;
}

export function remainingMs(session, nowMs) {
  if (!session) return 0;
  return (session.plannedMinutes * 60000) - elapsedMs(session, nowMs);
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export function start(opts) {
  const o = opts || {};
  const task = o.taskId ? db.get('tasks', o.taskId) : null;
  if (o.taskId && !task) return { ok: false, code: 'notFound' };

  const existing = running();
  if (existing) return { ok: false, code: 'alreadyRunning', session: existing };

  const planned = Math.max(1, Math.min(480, o.minutes || (task ? Math.max(5, task.estimatedMinutes || 25) : 25)));

  const parsed = FocusSessionSchema.coerce({
    taskId: o.taskId || null,
    habitId: o.habitId || null,
    routineId: o.routineId || null,
    title: o.title || (task ? task.title : ''),
    kind: o.kind || (task && task.energyLevel === 'light' ? 'light' : 'deep'),
    plannedMinutes: planned,
    actualMinutes: 0,
    startedAt: Date.now(),
    endedAt: null,
    date: todayIso(),
  });

  const session = db.batch(() => {
    const created = db.insert('focusSessions', Object.assign(parsed, {
      pauses: [],
      /* Recorded at start, in the app's timezone, because that is what the
       * "when do you work well" analysis needs and deriving it later from a
       * UTC timestamp would apply the wrong zone. */
      startMinutes: minutesOfDay(Date.now()),
    }));
    if (task && task.status !== 'in_progress' && task.status !== 'done') {
      db.update('tasks', task.id, { status: 'in_progress' });
    }
    db.logEvent('FOCUS_STARTED', {
      taskId: o.taskId || null, title: created.title, planned,
    });
    return created;
  });

  return { ok: true, session };
}

export function pause() {
  const session = running();
  if (!session || isPaused(session)) return { ok: false, code: 'notRunning' };
  const pauses = (session.pauses || []).concat([{ from: Date.now(), until: null }]);
  const updated = db.update('focusSessions', session.id, { pauses });
  return { ok: true, session: updated };
}

export function resume() {
  const session = running();
  if (!session || !isPaused(session)) return { ok: false, code: 'notPaused' };
  const pauses = session.pauses.slice();
  pauses[pauses.length - 1] = Object.assign({}, pauses[pauses.length - 1], { until: Date.now() });
  const updated = db.update('focusSessions', session.id, { pauses });
  return { ok: true, session: updated };
}

/**
 * End the session and record what came of it.
 *
 * The outcome question (§52) is asked because it is the only reliable signal
 * about whether the time was useful, and because "נתקעתי" is the input that
 * turns into a suggestion to split the task rather than another identical
 * session tomorrow.
 */
export function finish(opts) {
  const o = opts || {};
  const session = running();
  if (!session) return { ok: false, code: 'notRunning' };

  const minutes = Math.max(0, Math.round(elapsedMs(session) / 60000));

  return db.batch(() => {
    const closed = db.update('focusSessions', session.id, {
      endedAt: Date.now(),
      actualMinutes: o.minutes === undefined ? minutes : o.minutes,
      outcome: o.outcome || 'progress',
      note: o.note || '',
      date: isoDay(session.startedAt),
    });

    if (session.taskId) {
      const task = db.get('tasks', session.taskId);
      if (task) {
        const total = (task.actualMinutes || 0) + closed.actualMinutes;
        if (o.outcome === 'done') {
          db.update('tasks', session.taskId, {
            actualMinutes: total, status: 'done', completedAt: Date.now(),
          });
          db.logEvent('TASK_COMPLETED', {
            taskId: task.id,
            title: task.title,
            projectId: task.projectId || null,
            goalId: task.goalId || null,
            minutes: closed.actualMinutes,
          });
        } else if (o.outcome === 'stuck') {
          /* Stuck is a state, not a failure. It moves the task to waiting only
           * when the person named what they are waiting for; otherwise it goes
           * back to ready and the stuck-task detector picks it up if it keeps
           * happening. */
          db.update('tasks', session.taskId, {
            actualMinutes: total,
            status: o.waitingFor ? 'waiting' : 'ready',
            waitingFor: o.waitingFor || '',
          });
        } else {
          db.update('tasks', session.taskId, { actualMinutes: total, status: 'in_progress' });
        }
      }
    }

    db.logEvent('FOCUS_COMPLETED', {
      taskId: session.taskId || null,
      title: closed.title,
      minutes: closed.actualMinutes,
      outcome: closed.outcome,
    });

    emit(EV.FOCUS_ENDED, closed);
    return { ok: true, session: closed, minutes: closed.actualMinutes };
  });
}

/** Throw the session away without recording it. Used by "לצאת בלי לשמור". */
export function abandon() {
  const session = running();
  if (!session) return { ok: false, code: 'notRunning' };
  return db.batch(() => {
    if (session.taskId) {
      const task = db.get('tasks', session.taskId);
      if (task && task.status === 'in_progress') {
        db.update('tasks', session.taskId, { status: task.scheduledDate ? 'planned' : 'ready' });
      }
    }
    db.remove('focusSessions', session.id);
    return { ok: true };
  });
}

/** Close a session that was left running by a closed tab, at its planned length. */
export function closeStale() {
  const session = stale();
  if (!session) return { ok: false, code: 'none' };
  return db.batch(() => {
    const closed = db.update('focusSessions', session.id, {
      endedAt: session.startedAt + session.plannedMinutes * 60000,
      actualMinutes: session.plannedMinutes,
      outcome: 'progress',
      date: isoDay(session.startedAt),
    });
    if (session.taskId) {
      const task = db.get('tasks', session.taskId);
      if (task && task.status === 'in_progress') {
        db.update('tasks', session.taskId, {
          status: task.scheduledDate ? 'planned' : 'ready',
          actualMinutes: (task.actualMinutes || 0) + closed.actualMinutes,
        });
      }
    }
    return { ok: true, session: closed };
  });
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export function completed() {
  return db.list('focusSessions', (s) => !!s.endedAt);
}

export function forDay(dayIso) {
  const day = dayIso || todayIso();
  return db.list('focusSessions', (s) => s.endedAt && (s.date || isoDay(s.startedAt)) === day);
}

export function minutesOn(dayIso) {
  return forDay(dayIso).reduce((sum, s) => sum + (s.actualMinutes || 0), 0);
}

export function minutesInRange(fromIso, toIso) {
  return db.list('focusSessions', (s) => {
    if (!s.endedAt) return false;
    const day = s.date || isoDay(s.startedAt);
    return day >= fromIso && day <= toIso;
  }).reduce((sum, s) => sum + (s.actualMinutes || 0), 0);
}

/** Tasks that can be focused on, ranked — what the picker shows. */
export function focusableTasks() {
  const snap = snapshot();
  return snap.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'
    && t.status !== 'blocked' && !t.someday);
}

export { snapshot };
