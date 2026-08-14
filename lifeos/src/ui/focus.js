/*
 * focus.js — the timer, and the screen that reports on it.
 *
 * THE TIMER IS A SURFACE, NOT A MODAL.
 *
 * A modal is something you look past: the sidebar is still there, the badges
 * still count, the task list is still readable behind the scrim, and every one
 * of them is an invitation to leave. Focus mode takes the whole screen and puts
 * four things on it — what you are doing, how long you have been doing it, how
 * much of the block is left, and the two ways out. There is nothing else to
 * click, which is the entire feature.
 *
 * ELAPSED IS DERIVED, NEVER ACCUMULATED.
 *
 * Every tick asks the service how long the session has been running instead of
 * adding a second to a counter. A backgrounded tab throttles setInterval to
 * once a minute and a sleeping laptop stops it altogether, so a counter comes
 * back short by exactly the length of the interruption — and a timer that
 * quietly loses twenty minutes is worse than no timer, because the number it
 * shows still looks like a fact.
 *
 * THE OUTCOME QUESTION IS THE POINT OF THE SESSION.
 *
 * "How did it go" costs one tap and is the only honest signal about whether the
 * time was useful. נתקעתי is the one that earns its place: it is what turns
 * into a waiting-for, and later into a suggestion to split the task, rather
 * than into another identical session tomorrow.
 */

import {
  h, replace, dialog, field, chipGroup, confirmDestructive, emptyState,
  announce, reduceMotion, qs,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { go, currentRoute } from '../core/router.js';
import { formatDuration, formatAgo, isoDay } from '../core/time.js';
import { FOCUS_KINDS, FOCUS_OUTCOMES } from '../domain/schema.js';
import { snapshot } from '../services/core.js';
import * as focusService from '../services/focus.js';
import * as tasksService from '../services/tasks.js';
import { weekBounds } from '../services/insights.js';
import {
  pageHeader, stat, statGrid, durationChip, dueChip,
} from './components.js';
import { openCapture } from './capture.js';

/* The three blocks people actually pick, plus a way out of them. Longer than an
 * hour is available through 'מותאם' and deliberately not offered as a preset. */
const DURATIONS = [25, 45, 60];

const OUTCOME_META = {
  done: { label: 'focus.endDone', tone: 'chip-ok', icon: 'check' },
  progress: { label: 'focus.endProgress', tone: null, icon: null },
  stuck: { label: 'focus.endStuck', tone: 'chip-warn', icon: 'alert' },
  more_time: { label: 'focus.endMoreTime', tone: 'chip-info', icon: 'clock' },
};

const RING_SIZE = 168;
const RING_STROKE = 9;

let rerender = () => {};
/* Set while the full-screen surface is mounted, so the dialogs it opens can
 * tear it down without reaching for the DOM. */
let closeTimer = null;

/**
 * The timer can be started from any screen, so its refresh is the route
 * itself — re-resolving the current path rebuilds whatever is underneath.
 */
function refreshRoute() {
  go(currentRoute().path);
}

/** h() builds HTML elements; an <svg> needs its own namespace or it renders as nothing. */
function svgEl(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

/** A label over something that is not a single focusable control. */
function labelled(label, control) {
  return h('div.field', h('div.field-label', label), control);
}

function sessionTitle(session) {
  return (session && session.title) || t('common.untitled');
}

/* Minutes and seconds, with an hour in front once there is one — a block over
 * an hour reading "78:12" is a number people have to stop and divide. */
function clockFace(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/* ------------------------------------------------------------------ *
 * The running timer
 * ------------------------------------------------------------------ */

function openTimer() {
  if (closeTimer) return;
  const session = focusService.running();
  if (!session) return;

  const previous = document.activeElement;
  let ticker = null;

  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringGeometry = {
    cx: RING_SIZE / 2, cy: RING_SIZE / 2, r: radius, fill: 'none', 'stroke-width': RING_STROKE,
  };

  const ringFill = svgEl('circle', Object.assign({
    class: 'focus-ring-fill',
    'stroke-linecap': 'round',
    'stroke-dasharray': circumference,
    'stroke-dashoffset': circumference,
  }, ringGeometry));
  /* The ring animates between whole seconds to look continuous. With reduced
   * motion it still updates every second — it just jumps there. */
  if (reduceMotion.matches) ringFill.style.transition = 'none';

  const ring = svgEl('svg', {
    width: RING_SIZE, height: RING_SIZE, viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
    /* The clock above says the same thing in words a reader can act on. */
    'aria-hidden': 'true',
  });
  ring.appendChild(svgEl('circle', Object.assign({ class: 'focus-ring-track' }, ringGeometry)));
  ring.appendChild(ringFill);

  const clock = h('div.focus-clock', { role: 'timer' }, clockFace(0));
  const statusHost = h('div.row.wrap-flex', {
    style: { justifyContent: 'center', minHeight: '30px' },
  });

  const pauseButton = h('button.btn.btn-secondary.btn-lg', { type: 'button', onclick: togglePause });
  const finishButton = h('button.btn.btn-primary.btn-lg', {
    type: 'button',
    onclick: () => openEndDialog(),
  }, icon('check', { size: 17 }), t('common.finish'));

  const screen = h('div.focus-screen', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('focus.mode'),
    tabindex: '-1',
  },
  h('div.focus-label', t('focus.mode')),
  h('div.focus-task', sessionTitle(session)),
  clock,
  h('div.focus-ring', ring),
  statusHost,
  h('div.focus-actions', pauseButton, finishButton));

  let lastPaused = null;
  let lastStatus = null;
  let announcedOvertime = false;

  function tick() {
    const live = focusService.running();
    /* Finished in another tab, or closed as stale from the screen underneath.
     * There is nothing left to count. */
    if (!live) { close(); refreshRoute(); return; }

    const elapsed = focusService.elapsedMs(live);
    const planned = live.plannedMinutes * 60000;
    clock.textContent = clockFace(elapsed);

    const progress = planned > 0 ? Math.min(1, elapsed / planned) : 1;
    ringFill.setAttribute('stroke-dashoffset', String(circumference * (1 - progress)));

    const paused = focusService.isPaused(live);
    if (paused !== lastPaused) {
      lastPaused = paused;
      screen.classList.toggle('focus-paused', paused);
      replace(pauseButton,
        icon(paused ? 'play' : 'pause', { size: 17 }),
        t(paused ? 'focus.resume' : 'focus.pause'));
    }

    /* Past the planned end the session keeps running and starts reporting how
     * far past it is — stopping the clock there would throw away real work. */
    const over = elapsed >= planned;
    const minutes = Math.max(0, Math.round((over ? elapsed - planned : planned - elapsed) / 60000));
    const key = `${paused}|${over}|${minutes}`;
    if (key !== lastStatus) {
      lastStatus = key;
      replace(statusHost,
        paused ? h('span.chip', icon('pause', { size: 12 }), t('focus.paused')) : null,
        over
          ? h('span.chip.chip-warn', icon('alert', { size: 12 }), t('focus.overtime'))
          : h('span.chip', icon('clock', { size: 12 }),
            `${t('focus.remaining')} ${formatDuration(minutes)}`),
        over && minutes > 0 ? h('span.chip', formatDuration(minutes)) : null);
    }

    if (over && !announcedOvertime) {
      announcedOvertime = true;
      announce(t('focus.overtime'));
    }
  }

  function togglePause() {
    const live = focusService.running();
    if (!live) { close(); refreshRoute(); return; }
    if (focusService.isPaused(live)) focusService.resume();
    else focusService.pause();
    tick();
  }

  async function askExit() {
    const yes = await confirmDestructive({
      title: t('focus.exitConfirm'),
      cancelLabel: t('focus.keepGoing'),
      confirmLabel: t('common.finish'),
    });
    if (yes) openEndDialog();
  }

  function onKey(e) {
    /* A dialog on top owns the keyboard — its own handler closes it, and this
     * one must not answer the same Escape by asking to leave. */
    if (qs('.scrim')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      askExit();
      return;
    }
    /* Nothing behind this surface is reachable, so nothing behind it is
     * tabbable either. Two controls make the whole cycle. */
    if (e.key === 'Tab') {
      const stops = [pauseButton, finishButton];
      const i = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length].focus();
    }
  }

  function close() {
    if (!screen.isConnected) return;
    if (ticker) { clearInterval(ticker); ticker = null; }
    document.removeEventListener('keydown', onKey, true);
    screen.remove();
    document.body.style.overflow = '';
    closeTimer = null;
    if (previous && previous.focus && document.contains(previous)) previous.focus();
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(screen);
  document.body.style.overflow = 'hidden';
  closeTimer = close;

  /* The first tick can find the session already gone and tear all of this back
   * down, in which case there is nothing left to start an interval for. */
  tick();
  if (!screen.isConnected) return;

  ticker = setInterval(tick, 1000);
  /* The container rather than a button: landing on סיום means one stray Enter
   * ends the session. */
  screen.focus();
}

/* ------------------------------------------------------------------ *
 * Ending a session
 * ------------------------------------------------------------------ */

function openEndDialog(opts) {
  const o = opts || {};
  const session = focusService.running();
  if (!session) return null;

  let outcome = 'progress';
  const minutes = Math.max(0, Math.round(focusService.elapsedMs(session) / 60000));

  const noteInput = h('textarea', { rows: '3', placeholder: t('focus.endNotePlaceholder') });
  const waitingInput = h('input', { type: 'text', placeholder: t('focus.stuckPlaceholder') });
  const stuckHost = h('div');

  /* Only נתקעתי produces a waitingFor. Asking what blocked you after "סיימתי"
   * is a question with no answer, and an empty field people learn to skip. */
  function paintStuck() {
    replace(stuckHost, outcome === 'stuck'
      ? field({ label: t('focus.stuckWhat'), control: waitingInput, optional: true })
      : null);
    if (outcome === 'stuck') waitingInput.focus();
  }

  function doFinish() {
    const live = focusService.running();
    if (!live) return true;

    const result = focusService.finish({
      outcome,
      note: noteInput.value.trim(),
      waitingFor: outcome === 'stuck' ? waitingInput.value.trim() : '',
    });
    if (!result.ok) { toastError(t('errors.generic')); return false; }

    toast(t('focus.savedWith', {
      time: formatDuration(result.minutes),
      task: sessionTitle(live),
    }), { tone: 'ok' });

    /* Closed here rather than by returning true, because the overlay restores
     * focus on the way out and whatever opens next has to win that race. */
    d.close();
    if (closeTimer) closeTimer();
    refreshRoute();
    if (o.onFinished) o.onFinished();
    return true;
  }

  async function askAbandon() {
    const yes = await confirmDestructive({
      title: t('focus.abandonConfirm'),
      note: t('focus.abandonNote'),
      confirmLabel: t('focus.abandon'),
    });
    if (!yes) return;
    focusService.abandon();
    d.close();
    if (closeTimer) closeTimer();
    refreshRoute();
  }

  const d = dialog({
    title: t('focus.endTitle'),
    note: t('focus.savedWith', { time: formatDuration(minutes), task: sessionTitle(session) }),
    body: [
      chipGroup({
        label: t('focus.endTitle'),
        value: outcome,
        options: FOCUS_OUTCOMES.map((value) => ({ value, label: t(OUTCOME_META[value].label) })),
        onChange: (value) => { outcome = value; paintStuck(); },
      }),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
        stuckHost,
        field({ label: t('focus.endNote'), control: noteInput, optional: true })),
    ],
    actions: [
      { label: t('focus.abandon'), onClick: () => { askAbandon(); return false; } },
      { label: t('common.finish'), kind: 'primary', onClick: doFinish },
    ],
  });

  return d;
}

/* ------------------------------------------------------------------ *
 * Starting
 * ------------------------------------------------------------------ */

/**
 * A second session cannot silently replace the first — the first one is
 * somebody's real elapsed time, and dropping it on the floor is the failure
 * mode that makes people stop trusting the timer.
 */
function askRunningFirst(existing, onAfterFinish) {
  const d = dialog({
    title: t('focus.alreadyRunning'),
    note: t('focus.alreadyRunningNote', { task: sessionTitle(existing) }),
    actions: [
      {
        label: t('focus.backToSession'),
        onClick: () => { d.close(); openTimer(); return true; },
      },
      {
        label: t('common.finish'),
        kind: 'primary',
        onClick: () => {
          d.close();
          openEndDialog({ onFinished: onAfterFinish });
          return true;
        },
      },
    ],
  });
  return d;
}

export function startFocusFor(taskId) {
  const existing = focusService.running();
  if (existing) {
    /* Already focusing on this exact task: this is "take me back", not a
     * request for a second session. */
    if (existing.taskId === taskId) { openTimer(); return; }
    askRunningFirst(existing, () => startFocusFor(taskId));
    return;
  }

  const result = focusService.start({ taskId });
  if (!result.ok) {
    toastError(result.code === 'notFound' ? t('errors.notFound') : t('errors.generic'));
    return;
  }
  openTimer();
}

function defaultKind(task) {
  return task && task.energyLevel === 'light' ? 'light' : 'deep';
}

function defaultMinutes(task) {
  if (!task || !task.estimatedMinutes) return 25;
  return Math.max(1, Math.min(480, task.estimatedMinutes));
}

export function openFocusPicker(onStarted) {
  const existing = focusService.running();
  if (existing) { askRunningFirst(existing, () => openFocusPicker(onStarted)); return null; }

  const snap = snapshot();
  /* focusableTasks() decides what may be focused on; ranked() decides what to
   * offer first. Neither answers the other's question. */
  const allowed = new Set(focusService.focusableTasks().map((task) => task.id));
  const tasks = tasksService.ranked().filter((task) => allowed.has(task.id));

  if (!tasks.length) {
    const empty = dialog({
      title: t('focus.pick'),
      body: emptyState({
        icon: 'focus',
        title: t('focus.emptyTitle'),
        note: t('focus.emptyNote'),
        action: {
          label: t('tasks.addTask'),
          onClick: () => {
            empty.close();
            openCapture({ onSaved: () => refreshRoute() });
          },
        },
      }),
    });
    return empty;
  }

  let selected = tasks[0];
  let minutes = defaultMinutes(selected);
  let custom = !DURATIONS.includes(minutes);
  let kind = defaultKind(selected);

  const listHost = h('div.card.card-flat', {
    role: 'radiogroup',
    'aria-label': t('focus.pickTask'),
    style: { maxHeight: '34vh', overflowY: 'auto' },
  });
  const durationHost = h('div');
  const kindHost = h('div');

  const customInput = h('input', {
    type: 'number', min: '1', max: '480', step: '5', value: String(minutes),
  });

  function paintList() {
    replace(listHost, tasks.map((task) => {
      const on = task.id === selected.id;
      const project = task.projectId ? snap.projectsById.get(task.projectId) : null;
      const meta = [
        project ? h('span.chip', icon('project', { size: 12 }), project.title) : null,
        durationChip(task.estimatedMinutes),
        dueChip(task.dueDate),
      ].filter(Boolean);

      return h('div.trow', { style: on ? { background: 'var(--accent-wash)' } : null },
        h('button.trow-body', {
          type: 'button',
          role: 'radio',
          'aria-checked': on ? 'true' : 'false',
          onclick: () => {
            selected = task;
            /* A different task is a different question, so the answers that
             * were derived from the last one do not carry over. */
            minutes = defaultMinutes(task);
            custom = !DURATIONS.includes(minutes);
            customInput.value = String(minutes);
            kind = defaultKind(task);
            paintList();
            paintDuration();
            paintKind();
          },
        },
        h('div.trow-title.ellipsis', task.title),
        meta.length ? h('div.trow-meta', meta) : null),
        /* Not the background alone — a tinted row and an untinted one are the
         * same row to a lot of readers. */
        on ? h('span.shrink0', { style: { color: 'var(--accent)' } }, icon('check', { size: 17 })) : null);
    }));
  }

  function paintDuration() {
    replace(durationHost,
      chipGroup({
        label: t('focus.duration'),
        value: custom ? 'custom' : minutes,
        options: DURATIONS.map((n) => ({ value: n, label: formatDuration(n) }))
          .concat([{ value: 'custom', label: t('tasks.estimateCustom') }]),
        onChange: (value) => {
          custom = value === 'custom';
          if (!custom) minutes = value;
          paintDuration();
          if (custom) customInput.focus();
        },
      }),
      custom
        ? h('div', { style: { marginBlockStart: 'var(--sp-3)' } },
          field({ label: t('tasks.estimateCustomLabel'), control: customInput }))
        : null);
  }

  function paintKind() {
    replace(kindHost, chipGroup({
      label: t('focus.kind'),
      value: kind,
      options: FOCUS_KINDS.map((value) => ({ value, label: t(`focus.kinds.${value}`) })),
      onChange: (value) => { kind = value; },
    }));
  }

  function start() {
    const planned = custom
      ? Math.max(1, Math.min(480, Math.round(Number(customInput.value) || minutes)))
      : minutes;

    const result = focusService.start({ taskId: selected.id, minutes: planned, kind });
    if (!result.ok) {
      /* Something started a session while this dialog was open — another tab,
       * or a shortcut behind it. Theirs is the one that is running. */
      if (result.code === 'alreadyRunning') { d.close(); openTimer(); return true; }
      toastError(t('errors.generic'));
      return false;
    }

    d.close();
    openTimer();
    if (onStarted) onStarted();
    return true;
  }

  const d = dialog({
    title: t('focus.pick'),
    body: [
      labelled(t('focus.pickTask'), listHost),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, labelled(t('focus.duration'), durationHost)),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, labelled(t('focus.kind'), kindHost)),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('focus.start'), kind: 'primary', onClick: start },
    ],
  });

  paintList();
  paintDuration();
  paintKind();

  return d;
}

/* ------------------------------------------------------------------ *
 * The /focus screen
 * ------------------------------------------------------------------ */

function staleNotice(session) {
  return h('div.notice.notice-warn', { style: { marginBlockEnd: 'var(--sp-4)' } },
    h('div.row-between',
      h('div.grow',
        h('strong', t('focus.staleTitle')),
        h('div', { style: { marginBlockStart: '4px' } },
          t('focus.staleNote', {
            task: sessionTitle(session),
            time: formatDuration(session.plannedMinutes),
          }))),
      h('div.row.shrink0',
        h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => {
            const result = focusService.closeStale();
            if (result.ok) toast(t('focus.saved'), { tone: 'ok' });
            rerender();
          },
        }, t('focus.staleClose')),
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => openTimer(),
        }, t('focus.backToSession')))));
}

function runningCard(session) {
  const paused = focusService.isPaused(session);
  const minutes = Math.round(focusService.elapsedMs(session) / 60000);

  return h('div.card-hero.card-pad-lg',
    h('div.eyebrow', t(paused ? 'focus.paused' : 'focus.running')),
    h('h2', { style: { marginBlockStart: '8px', fontSize: 'var(--t-xl)' } }, sessionTitle(session)),
    h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
      h('span.chip.chip-accent', icon('clock', { size: 12 }),
        `${t('focus.elapsed')} ${formatDuration(minutes)}`),
      h('span.chip', `${t('focus.duration')} ${formatDuration(session.plannedMinutes)}`),
      h('span.chip', t(`focus.kinds.${session.kind}`))),
    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openTimer(),
      }, icon('focus', { size: 16 }), t('focus.backToSession')),
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => openEndDialog(),
      }, t('common.finish'))));
}

function startCard() {
  return h('div.card-hero.card-pad-lg',
    h('div.eyebrow', t('focus.mode')),
    h('h2', { style: { marginBlockStart: '8px', fontSize: 'var(--t-xl)' } }, t('focus.pick')),
    h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-primary.btn-lg', {
        type: 'button',
        onclick: () => openFocusPicker(rerender),
      }, icon('play', { size: 18 }), t('focus.start'))));
}

function sessionRow(session) {
  const meta = OUTCOME_META[session.outcome] || OUTCOME_META.progress;
  return h('div.trow',
    h('div.grow.ellipsis',
      h('div.trow-title.ellipsis', sessionTitle(session)),
      h('div.trow-meta',
        h('span.chip', { class: meta.tone },
          meta.icon ? icon(meta.icon, { size: 12 }) : null,
          t(meta.label)),
        h('span.tiny.quiet', formatAgo(session.startedAt)))),
    h('span.tiny.quiet.num.shrink0', formatDuration(session.actualMinutes || 0)));
}

export function renderFocusScreen(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const container = h('div');
  container.appendChild(pageHeader(t('focus.title')));

  const staleSession = focusService.stale();
  const runningSession = focusService.running();
  const done = snap.focusSessions.filter((s) => s.endedAt);

  /* A session older than a few hours is a closed tab, not concentration, so it
   * is offered for closing rather than presented as work in progress. */
  if (staleSession) {
    container.appendChild(staleNotice(staleSession));
  } else if (runningSession) {
    container.appendChild(runningCard(runningSession));
  } else if (focusService.focusableTasks().length) {
    container.appendChild(startCard());
  } else {
    container.appendChild(emptyState({
      icon: 'focus',
      title: t('focus.emptyTitle'),
      note: t('focus.emptyNote'),
      action: {
        label: t('tasks.addTask'),
        onClick: () => openCapture({ onSaved: () => rerender() }),
      },
    }));
  }

  /* Nothing has ever been recorded: two zeroes and an empty list say less than
   * the empty state already above them. */
  if (!done.length) return container;

  const week = weekBounds(snap.today, snap.profile.weekStartsOn);
  const weekSessions = done.filter((s) => {
    const day = s.date || isoDay(s.startedAt);
    return day >= week.from && day <= week.to;
  });

  container.appendChild(h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
    statGrid([
      stat(formatDuration(focusService.minutesOn(snap.today)), t('focus.todayTotal')),
      stat(formatDuration(focusService.minutesInRange(week.from, week.to)), t('focus.weekTotal'),
        { note: plural('count.sessions', weekSessions.length) }),
    ])));

  const recent = done.slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 8);

  container.appendChild(h('section.section',
    h('div.section-head', h('h2.section-title', t('focus.recent'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } }, recent.map(sessionRow))));

  return container;
}
