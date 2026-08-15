/*
 * today.js — the screen the app is judged on.
 *
 * It has to answer, in the time it takes to read it: what am I doing now?
 *
 * THE ORDER IS THE ARGUMENT.
 *
 *   1. one thing            — the main focus, with why, and a button to start
 *   2. what cannot slip     — at most three
 *   3. the shape of the day — the timeline, with the fixed things in it
 *   4. if there is room     — everything else, folded away
 *
 * A person who reads only the first card has been served. A person who reads
 * the whole screen has not been overwhelmed, because the whole screen is
 * about a dozen rows. Forty open tasks do not appear here; that is what the
 * tasks screen is for, and mixing the two produces a screen that answers
 * neither question.
 *
 * RENDER LOCAL FIRST, THEN LET A MODEL IMPROVE IT.
 *
 * The plan is computed synchronously and painted immediately — no spinner, no
 * skeleton, no waiting on a network. If an assistant is configured, its
 * phrasing arrives afterwards and replaces the explanation in place. Nothing
 * about the plan changes; only the sentence does. That ordering is why the
 * screen is instant with or without a key, and why a failed request is
 * invisible rather than an error state.
 */

import { h, emptyState, announce, confirmDestructive } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo, toastError } from '../core/toast.js';
import { go, href } from '../core/router.js';
import {
  formatDuration, formatTimeRange, formatTime, formatDateWithDay,
  today as todayIso, partOfDay, nowMinutes, addDays,
} from '../core/time.js';
import { explainReasons, explainBrief, explainWrapUp } from '../engine/explain.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import * as planning from '../services/planning.js';
import { habits as habitsService } from '../services/rituals.js';
import { dayWrapUp } from '../services/insights.js';
import * as ai from '../ai/provider.js';
import { currentUser } from '../core/session.js';
import {
  taskRow, taskMenu, whyBlock, originNote, dueChip, durationChip, areaDot,
} from './components.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';
import { startFocusFor } from './focus.js';
import { openReplanPreview } from './replan.js';
import { openNextAction } from './nextaction.js';

const GREETINGS = { morning: 'today.goodMorning', afternoon: 'today.goodAfternoon', evening: 'today.goodEvening', night: 'today.goodNight' };

let rerender = () => {};

/* ------------------------------------------------------------------ *
 * Shared task handlers — every list on this screen uses them
 * ------------------------------------------------------------------ */

function handlers() {
  return {
    onToggle(task, next) {
      const result = tasksService.setComplete(task.id, next);
      if (!result.ok && result.code === 'blocked') {
        toastError(t('tasks.blockedCannotComplete'));
        return;
      }
      if (next) {
        announce(t('tasks.completed'));
        if (result.recurred) {
          toast(t('tasks.completed'), { tone: 'ok' });
        } else {
          toastUndo(t('tasks.completed'), () => {
            tasksService.setComplete(task.id, false);
            rerender();
          });
        }
      }
      rerender();
    },
    onBlocked(task, blockers) {
      toastError(`${t('tasks.blockedBy')}: ${blockers.map((b) => b.title).join(', ')}`);
    },
    onOpen(task) { openTaskEditor(task.id, rerender); },
    onMenu(task, anchor) {
      taskMenu(anchor, task, {
        onEdit: (x) => openTaskEditor(x.id, rerender),
        onFocus: (x) => startFocusFor(x.id),
        onTomorrow: (x) => {
          tasksService.moveToTomorrow(x.id);
          toastUndo(t('tasks.movedTo', { date: t('time.tomorrow') }), () => {
            tasksService.schedule(x.id, x.scheduledDate, x.scheduledStart, x.scheduledEnd);
            rerender();
          });
          rerender();
        },
        onUnschedule: (x) => { tasksService.unschedule(x.id); rerender(); },
        onSplit: (x) => openSplitDialog(x.id, rerender),
        onSomeday: (x) => { tasksService.markSomeday(x.id); rerender(); },
        onActivate: (x) => { tasksService.activateFromSomeday(x.id); rerender(); },
        async onDelete(x) {
          const yes = await confirmDestructive({
            title: t('confirm.deleteTaskTitle'),
            note: t('confirm.deleteTaskNote'),
          });
          if (!yes) return;
          tasksService.remove(x.id);
          toast(t('tasks.deleted'));
          rerender();
        },
      });
    },
  };
}

function rowsFor(tasks, snap, opts) {
  const hs = handlers();
  return tasks.map((task) => taskRow(
    tasksService.decorate(task, snap),
    Object.assign({}, hs, opts),
  ));
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function greeting() {
  const user = currentUser();
  const key = GREETINGS[partOfDay()] || 'today.goodMorning';
  const text = user && user.displayName
    ? t('today.greetingNamed', { greeting: t(key), name: user.displayName.split(' ')[0] })
    : t(key);

  return h('div', { style: { marginBlockEnd: 'var(--sp-5)' } },
    h('h1', text),
    h('p.quiet', { style: { marginBlockStart: '4px' } }, formatDateWithDay(todayIso())));
}

/**
 * The one card that is allowed to be louder than everything else.
 * If there is no main focus, this says why rather than disappearing.
 */
function mainFocusCard(plan, snap) {
  if (!plan.mainFocus) {
    return h('div.card.card-pad-lg',
      h('div.eyebrow', t('today.mainFocus')),
      h('h3', { style: { marginBlockStart: '6px' } }, t('today.mainFocusNone')),
      h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
        plan.capacity.isRestDay ? t('planning.restDay')
          : plan.windows.length === 0 ? t('planning.noWindows')
            : plan.facts.eligibleCount === 0 ? t('today.emptyNote')
              : t('today.mainFocusNoneNote')),
      h('div.row', { style: { marginBlockStart: 'var(--sp-4)' } },
        h('button.btn.btn-secondary', {
          type: 'button',
          onclick: () => openTaskEditor(null, rerender),
        }, icon('plus', { size: 16 }), t('tasks.addTask')),
        plan.windows.length
          ? h('button.btn.btn-ghost', { type: 'button', onclick: () => doReplan() }, t('today.replan'))
          : null));
  }

  const { task, placement } = plan.mainFocus;
  const decorated = tasksService.decorate(task, snap);
  const why = plan.mainFocus.sentence || explainReasons(plan.mainFocus.reasons);

  const card = h('div.card-hero.card-pad-lg',
    h('div.eyebrow', t('today.mainFocus')),
    h('h2', { style: { marginBlockStart: '8px', fontSize: 'var(--t-xl)' } }, task.title),

    h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
      h('span.chip.chip-accent', icon('clock', { size: 12 }),
        formatDuration(task.estimatedMinutes || 25)),
      placement
        ? h('span.chip', icon('calendar', { size: 12 }),
          formatTimeRange(placement.startMinutes, placement.endMinutes))
        : null,
      decorated.project
        ? h('a.chip', { href: href(`/projects/${decorated.project.id}`) },
          icon('project', { size: 12 }), decorated.project.title)
        : null,
      dueChip(task.dueDate)),

    whyBlock(why, { origin: plan.origin }),

    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => startFocusFor(task.id),
      }, icon('play', { size: 16 }), t('today.startFocus')),
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => openTaskEditor(task.id, rerender),
      }, t('common.details'))));

  return card;
}

function mustDoSection(plan, snap) {
  if (!plan.mustDo.length) return null;
  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('today.mustDo')),
      h('span.section-note', t('today.mustDoNote'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      rowsFor(plan.mustDo.map((m) => m.task), snap, { showScheduled: true })));
}

function timelineSection(plan, snap) {
  const day = plan.date;
  const entries = [];

  for (const e of snap.events.filter((x) => x.date === day && !x.allDay)) {
    entries.push({ start: e.startMinutes, end: e.endMinutes, title: e.title, kind: 'event' });
  }
  for (const b of snap.blocks.filter((x) => x.date === day)) {
    const task = b.taskId ? snap.tasksById.get(b.taskId) : null;
    entries.push({
      start: b.startMinutes,
      end: b.endMinutes,
      title: b.title || (task ? task.title : ''),
      kind: 'block',
      done: task ? task.status === 'done' : false,
      taskId: b.taskId,
    });
  }
  entries.sort((a, b) => a.start - b.start);

  if (!entries.length) {
    return h('section.section',
      h('div.section-head', h('h2.section-title', t('today.timeline'))),
      h('div.card.card-pad',
        h('p.quiet.tiny', t('today.timelineEmpty')),
        plan.windows.length
          ? h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
            `${t('calendar.freeWindows')}: ${plan.windows.map((w) => formatTimeRange(w.start, w.end)).join(' · ')}`)
          : null));
  }

  const now = nowMinutes();

  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('today.timeline')),
      h('a.section-note', { href: href('/calendar') }, t('nav.calendar'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      entries.map((entry) => {
        const past = entry.end <= now;
        return h('div.trow', { style: past ? { opacity: '.55' } : null },
          h('div.shrink0.num', {
            style: { width: '96px', color: 'var(--ink-3)', fontSize: 'var(--t-xs)' },
          }, formatTimeRange(entry.start, entry.end)),
          h('div.grow.ellipsis',
            h('div.trow-title.ellipsis', {
              style: entry.done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : null,
            }, entry.title || t('common.untitled')),
            h('div.tiny.quiet',
              entry.kind === 'event' ? t('calendar.newEvent').replace(t('common.new'), '').trim() || 'אירוע' : t('calendar.block'))),
          entry.kind === 'event'
            ? h('span.chip', icon('lock', { size: 12 }), t('calendar.blockKinds.fixed'))
            : entry.taskId && !entry.done
              ? h('button.btn.btn-sm.btn-ghost', {
                type: 'button',
                onclick: () => startFocusFor(entry.taskId),
              }, icon('play', { size: 13 }))
              : null);
      })));
}

function ifTimeSection(plan, snap) {
  if (!plan.ifTime.length && !plan.quickWins.length) return null;

  return h('section.section',
    plan.ifTime.length
      ? h('div',
        h('div.section-head', h('h2.section-title', t('today.ifTime'))),
        h('div.card.card-flat', { style: { overflow: 'hidden' } },
          rowsFor(plan.ifTime, snap, { showScheduled: true })))
      : null,
    plan.quickWins.length
      ? h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
        h('div.section-head',
          h('h2.section-title', t('today.quickWins')),
          h('span.section-note', t('today.quickWinsNote'))),
        h('div.card.card-flat', { style: { overflow: 'hidden' } },
          rowsFor(plan.quickWins, snap, { showEstimate: true })))
      : null);
}

function habitsSection() {
  const rows = habitsService.forToday();
  if (!rows.length) return null;

  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('nav.habits')),
      h('a.section-note', { href: href('/habits') }, t('common.showAll'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      rows.map((row) => h('div.trow',
        h('button.tcheck', {
          type: 'button',
          role: 'checkbox',
          'aria-checked': row.done ? 'true' : 'false',
          'aria-label': row.habit.title,
          onclick: () => {
            habitsService.complete(row.habit.id, { minimum: false });
            rerender();
          },
        }, icon('check', { weight: 3 })),
        h('div.grow',
          h('div.trow-title', row.habit.title),
          h('div.trow-meta',
            row.entry && row.entry.minimum
              ? h('span.chip.chip-accent', t('habits.completedMinimum'))
              : null,
            row.stats.streak > 0
              ? h('span.chip', icon('flame', { size: 12 }), plural('count.daysStreak', row.stats.streak))
              : null,
            h('span.chip', `${row.stats.rate7.pct}% · ${t('habits.rate7')}`),
            row.remainingThisWeek !== null && row.remainingThisWeek > 0
              ? h('span.chip', `${t('habits.target')}: ${row.remainingThisWeek}`)
              : null)),
        /* §45 — on a full day, offer the smaller version rather than the
         * silence that turns into a missed day. */
        row.offerMinimum
          ? h('button.btn.btn-sm.btn-secondary.shrink0', {
            type: 'button',
            title: t('habits.busyDayOffer'),
            onclick: () => {
              habitsService.complete(row.habit.id, { minimum: true });
              toast(t('habits.completedMinimum'), { tone: 'ok' });
              rerender();
            },
          }, t('habits.doMinimum'))
          : null))));
}

function overloadNotice(plan) {
  if (plan.capacity.overloadMinutes <= 0) return null;
  return h('div.notice.notice-warn', { style: { marginBlockEnd: 'var(--sp-4)' } },
    h('div.row-between',
      h('div.grow',
        h('strong', t('planning.overloadTitle')),
        h('div', { style: { marginBlockStart: '4px' } },
          t('planning.overloadBy', { time: formatDuration(plan.capacity.overloadMinutes) }))),
      h('div.row.shrink0',
        h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => doRelieve(plan.date),
        }, t('planning.overloadMove')),
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => doReplan(),
        }, t('planning.overloadReplan')))));
}

/** The morning brief, shown before the day has really started. */
function briefCard(plan, snap) {
  if (partOfDay() !== 'morning') return null;
  const lines = explainBrief(plan, { events: snap.events, tasks: snap.tasks });
  return h('div.card.card-pad', { style: { marginBlockEnd: 'var(--sp-4)' } },
    h('div.eyebrow', t('today.briefTitle')),
    h('div', { style: { marginBlockStart: '8px' } },
      lines.map((line) => h('p.tiny', { style: { color: 'var(--ink-2)' } }, line))));
}

/** The evening wrap-up. Same data, different question. */
function wrapUpCard() {
  const part = partOfDay();
  if (part !== 'evening' && part !== 'night') return null;
  const wrap = dayWrapUp();
  const lines = explainWrapUp({
    completedCount: wrap.completedCount,
    movedCount: wrap.movedCount,
    focusMinutes: wrap.focusMinutes,
    topProjectTitle: wrap.topProject ? wrap.topProject.title : null,
    tomorrowFocus: wrap.tomorrowFocus ? wrap.tomorrowFocus.title : null,
  });

  return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-6)' } },
    h('div.eyebrow', t('today.wrapTitle')),
    h('div', { style: { marginBlockStart: '8px' } },
      lines.map((line) => h('p.tiny', { style: { color: 'var(--ink-2)' } }, line))),
    h('div.row', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('button.btn.btn-sm.btn-secondary', {
        type: 'button',
        onclick: () => planTomorrow(),
      }, t('today.wrapPlanTomorrow'))));
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function doReplan() {
  openReplanPreview(todayIso(), rerender);
}

function doRelieve(dayIso) {
  const result = planning.relieveOverload(dayIso);
  if (!result.moved) { toast(t('planning.replanNothing')); return; }
  toastUndo(plural('count.movedToTomorrow', result.moved), () => {
    planning.undoRelieve(result.items);
    rerender();
  });
  rerender();
}

function planTomorrow() {
  const plan = planning.tomorrow();
  const result = planning.applyPlan(plan);
  if (!result.created) {
    toast(t('planning.replanNothing'));
    return;
  }
  toast(plural('count.changes', result.created), { tone: 'ok' });
  go('/calendar');
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderToday(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const plan = planning.today();

  const container = h('div');

  /* Nothing at all yet — a new account before onboarding created anything, or
   * one that has been emptied. */
  if (!snap.tasks.length && !snap.goals.length && !snap.projects.length) {
    container.appendChild(greeting());
    container.appendChild(emptyState({
      icon: 'today',
      title: t('today.emptyTitle'),
      note: t('today.emptyNote'),
      action: { label: t('tasks.addTask'), onClick: () => openTaskEditor(null, rerender) },
    }));
    return container;
  }

  container.appendChild(greeting());
  container.appendChild(overloadNotice(plan) || h('span'));
  container.appendChild(briefCard(plan, snap) || h('span'));

  const focusHost = h('div');
  focusHost.appendChild(mainFocusCard(plan, snap));
  container.appendChild(focusHost);

  /* The other question this screen exists to answer, one tap away. */
  container.appendChild(h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('button.btn.btn-secondary', {
      type: 'button',
      onclick: () => openNextAction(rerender),
    }, icon('target', { size: 16 }), t('today.whatNow')),
    h('button.btn.btn-ghost', {
      type: 'button',
      onclick: () => doReplan(),
    }, icon('routine', { size: 16 }), t('today.replan'))));

  container.appendChild(mustDoSection(plan, snap) || h('span'));
  container.appendChild(timelineSection(plan, snap));
  container.appendChild(habitsSection() || h('span'));
  container.appendChild(ifTimeSection(plan, snap) || h('span'));
  container.appendChild(wrapUpCard() || h('span'));

  /*
   * Now, and only now, ask a model to phrase it better.
   *
   * The screen is already complete and interactive. If this resolves, the
   * focus card is replaced with an identical one carrying a better sentence;
   * if it fails, or there is no key, nothing happens and nobody sees an error
   * for a request they did not make.
   */
  if (ai.status().usable) {
    ai.generateDailyPlan().then((improved) => {
      if (!improved || improved.origin !== 'model' || !improved.mainFocus) return;
      if (!focusHost.isConnected) return;
      focusHost.replaceChildren(mainFocusCard(improved, snap));
    }).catch(() => { /* the local plan is already on screen */ });
  }

  return container;
}

export { addDays, formatTime, originNote, durationChip, areaDot };
