/*
 * goals.js — the level the rest of the app is supposed to be serving.
 *
 * A goal screen is easy to make useless: a title, a bar, and a number that
 * nobody can act on. What makes this one worth opening is that every element
 * on it either answers "how is this actually going" or offers the next move.
 *
 * THE ALIGNMENT NOTICE IS THE ONE THING NOBODY CAN SEE FOR THEMSELVES.
 *
 * Everyone knows which goal they said mattered. Almost nobody knows where last
 * month went. §130 and §131 are about the tone of saying so: a fact about the
 * calendar, stated once, with a way into the goal — no score, no grade, no red
 * X. Sometimes the honest answer is that the priority was wrong rather than the
 * month, and an app that assumes otherwise is nagging on the strength of a
 * number somebody typed once.
 *
 * WHY THE DETAIL SCREEN DOES NOT LIST EVERY TASK UNDER THE GOAL.
 *
 * The projects are already summarised as cards with their own progress. Adding
 * their thirty tasks underneath turns this into a second, worse task list.
 * Only work hanging directly off the goal — with no project to belong to —
 * appears as rows, because that is the work no other screen accounts for.
 */

import {
  h, replace, emptyState, confirmDestructive, dialog, field, chipGroup,
  progressBar, announce,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo, toastError } from '../core/toast.js';
import { go, href } from '../core/router.js';
import { formatDate } from '../core/time.js';
import { GOAL_TYPES, GOAL_STATUS, GOAL_PROGRESS_SOURCES } from '../domain/schema.js';
import { goalAlignment } from '../engine/alignment.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import { goals as goalsService } from '../services/structure.js';
import {
  pageHeader, goalCard, projectCard, progressLabel, areaChip,
  taskRow, taskList, taskMenu,
} from './components.js';
import { openGoalWizard, openGoalBreakdown } from './goalwizard.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';
import { startFocusFor } from './focus.js';

const INACTIVE_ORDER = ['paused', 'achieved', 'dropped'];

let rerender = () => {};

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'max': return t('errors.tooLong', { n: err.max });
    case 'date': return t('errors.invalidDate');
    case 'type': return t('errors.invalidNumber');
    default: return t('errors.generic');
  }
}

/** Cards that reflow from one column on a phone to three on a desktop. */
function cardGrid(cards) {
  return h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: 'var(--sp-3)',
    },
  }, cards);
}

function isOpen(task) {
  return task.status !== 'done' && task.status !== 'cancelled';
}

/* ------------------------------------------------------------------ *
 * Shared task handlers — identical to Today's, deliberately
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
        if (!result.recurred) {
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

/* ------------------------------------------------------------------ *
 * The goal form
 * ------------------------------------------------------------------ */

/**
 * Edit an existing goal.
 *
 * The wizard asks five questions one at a time because a new goal is a thought
 * being formed. Changing a target date afterwards is not, so editing is one
 * plain form.
 */
function openGoalEditor(goalId, refresh) {
  const existing = goalsService.byId(goalId);
  if (!existing) { toastError(t('errors.notFound')); return null; }

  const snap = snapshot();
  const form = {
    title: existing.title,
    areaId: existing.areaId || null,
    type: existing.type,
    status: existing.status,
    priority: existing.priority,
    targetDate: existing.targetDate || null,
    motivation: existing.motivation || '',
    successDefinition: existing.successDefinition || '',
    progressSource: existing.progressSource,
    metricTarget: existing.metricTarget === null || existing.metricTarget === undefined
      ? '' : String(existing.metricTarget),
    metricUnit: existing.metricUnit || '',
    confidence: existing.confidence,
  };
  let errors = {};

  const gap = { style: { marginBlockStart: 'var(--sp-4)' } };
  const hosts = { title: h('div'), source: h('div', gap), metric: h('div', gap) };

  function paintTitle() {
    replace(hosts.title, field({
      label: t('goals.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '140',
        placeholder: t('goals.step1Placeholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }

  function paintMetric() {
    if (form.progressSource !== 'metric') { replace(hosts.metric); return; }
    replace(hosts.metric, h('div.field-row',
      field({
        label: t('goals.metricTarget'),
        error: errorText(errors.metricTarget),
        control: h('input', {
          type: 'number',
          min: '0',
          step: '1',
          value: form.metricTarget,
          oninput: (e) => { form.metricTarget = e.target.value; },
        }),
      }),
      field({
        label: t('goals.metricUnit'),
        optional: true,
        error: errorText(errors.metricUnit),
        control: h('input', {
          type: 'text',
          value: form.metricUnit,
          maxlength: '24',
          placeholder: t('goals.metricUnitPlaceholder'),
          oninput: (e) => { form.metricUnit = e.target.value; },
        }),
      })));
  }

  function paintSource() {
    replace(hosts.source, field({
      label: t('goals.progressSource'),
      control: h('select', {
        onchange: (e) => { form.progressSource = e.target.value; paintMetric(); },
      }, GOAL_PROGRESS_SOURCES.map((s) => h('option', {
        value: s,
        selected: s === form.progressSource,
      }, t(`goals.progressSources.${s}`)))),
    }));
  }

  /* A label over something that is not a single focusable control. */
  function labelled(label, control) {
    return h('div.field', h('div.field-label', label), control);
  }

  paintTitle();
  paintSource();
  paintMetric();

  const confidenceValue = h('span.tiny.quiet.num', `${form.confidence}%`);
  const confidence = h('input', {
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(form.confidence),
    'aria-label': t('goals.confidence'),
    oninput: (e) => {
      form.confidence = Number(e.target.value);
      confidenceValue.textContent = `${form.confidence}%`;
    },
  });

  function save() {
    const payload = {
      title: form.title.trim(),
      areaId: form.areaId || null,
      type: form.type,
      status: form.status,
      priority: form.priority,
      targetDate: form.targetDate || null,
      motivation: form.motivation.trim(),
      successDefinition: form.successDefinition.trim(),
      progressSource: form.progressSource,
      metricUnit: form.metricUnit.trim(),
      confidence: form.confidence,
    };
    /* An empty metric target is "not set", not zero — sending 0 would make a
     * metric goal read as 100% of nothing. */
    if (form.progressSource === 'metric') {
      payload.metricTarget = form.metricTarget === '' ? null : Number(form.metricTarget);
    }

    const result = goalsService.update(goalId, payload);
    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      paintMetric();
      if (errors['']) toastError(errorText(errors['']));
      return false;
    }
    toast(t('goals.updated'), { tone: 'ok' });
    refresh();
    return true;
  }

  return dialog({
    title: t('goals.editGoal'),
    wide: true,
    initialFocus: 'input',
    body: [
      hosts.title,
      h('div', gap, field({
        label: t('areas.one'),
        optional: true,
        control: h('select', {
          onchange: (e) => { form.areaId = e.target.value || null; },
        },
        h('option', { value: '' }, t('common.unassigned')),
        snap.areas.map((a) => h('option', {
          value: a.id, selected: a.id === form.areaId,
        }, a.title))),
      })),
      h('div', gap, labelled(t('goals.type'), chipGroup({
        label: t('goals.type'),
        value: form.type,
        options: GOAL_TYPES.map((type) => ({
          value: type,
          label: t(`goals.types.${type}`),
          note: t(`goals.typeNotes.${type}`),
        })),
        onChange: (value) => { form.type = value; },
      }))),
      h('div', gap, labelled(t('goals.priority'), chipGroup({
        label: t('goals.priority'),
        value: form.priority,
        options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`tasks.scale.${n}`) })),
        onChange: (value) => { form.priority = value; },
      }))),
      h('div', gap, field({
        label: t('goals.targetDate'),
        optional: true,
        error: errorText(errors.targetDate),
        control: h('input', {
          type: 'date',
          value: form.targetDate || '',
          onchange: (e) => { form.targetDate = e.target.value || null; },
        }),
      })),
      h('div', gap, field({
        label: t('goals.motivation'),
        optional: true,
        control: h('textarea', {
          rows: '2',
          maxlength: '400',
          placeholder: t('goals.step2Placeholder'),
          oninput: (e) => { form.motivation = e.target.value; },
        }, form.motivation),
      })),
      h('div', gap, field({
        label: t('goals.successDefinition'),
        optional: true,
        control: h('textarea', {
          rows: '2',
          maxlength: '400',
          placeholder: t('goals.step4Placeholder'),
          oninput: (e) => { form.successDefinition = e.target.value; },
        }, form.successDefinition),
      })),
      hosts.source,
      hosts.metric,
      h('div', gap, field({
        label: t('goals.statusField'),
        control: h('select', {
          onchange: (e) => { form.status = e.target.value; },
        }, GOAL_STATUS.map((s) => h('option', {
          value: s, selected: s === form.status,
        }, t(`goals.status.${s}`)))),
      })),
      h('div', gap, labelled(
        t('goals.confidence'),
        h('div.row', confidence, confidenceValue),
      )),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('common.save'), kind: 'primary', onClick: save },
    ],
  });
}

async function deleteGoal(goal) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteGoalTitle'),
    note: t('confirm.deleteGoalNote'),
  });
  if (!yes) return;
  goalsService.remove(goal.id);
  toast(t('goals.deleted'));
  go('/goals');
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/**
 * §130 — declared priority against recorded time, stated once and calmly.
 *
 * Only the starved goals are named, and each one is a link rather than an
 * instruction: giving it time and lowering what it is worth are both answers,
 * and both live on the goal's own screen.
 */
function alignmentNotice(snap) {
  const result = goalAlignment(Object.assign({}, snap, { period: 'month' }));
  if (!result.ok || !result.misaligned) return null;

  return h('div.notice.notice-info', { style: { marginBlockEnd: 'var(--sp-5)' } },
    h('strong', t('goals.alignmentTitle')),
    h('p.tiny', { style: { marginBlockStart: '4px' } }, t('goals.alignmentLead')),
    result.starved.map((row) => h('a', {
      href: href(`/goals/${row.goal.id}`),
      style: { display: 'block', marginBlockStart: 'var(--sp-3)' },
    },
    h('div.trow-title.ellipsis', row.goal.title),
    h('div.tiny.quiet', { style: { marginBlockStart: '2px' } },
      t('goals.alignmentLow', { period: t('goals.alignmentPeriodMonth') })))));
}

/** Goals that are over, paused or abandoned — present, but not in the way. */
function inactiveSection(inactive) {
  const body = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });
  body.hidden = true;
  let built = false;

  const chevron = h('span.shrink0', icon('chevronDown', { size: 14 }));
  const toggle = h('button.btn.btn-ghost.btn-sm', {
    type: 'button',
    'aria-expanded': 'false',
    onclick: () => {
      const open = body.hidden;
      if (open && !built) {
        built = true;
        replace(body, cardGrid(inactive.map((g) => goalCard(goalsService.detail(g.id)))));
      }
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      replace(chevron, icon(open ? 'chevronUp' : 'chevronDown', { size: 14 }));
    },
  }, plural('count.goals', inactive.length), chevron);

  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('goals.inactiveTitle')),
      toggle),
    body);
}

function nothingActive(titleKey) {
  return emptyState({
    icon: 'goal',
    title: t(titleKey),
    note: t('goals.emptyNote'),
    action: { label: t('goals.newGoal'), onClick: () => openGoalWizard(rerender) },
  });
}

export function renderGoals(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const container = h('div', pageHeader(t('goals.title'), {
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openGoalWizard(rerender),
      }, icon('plus', { size: 16 }), t('goals.newGoal')),
    ],
  }));

  if (!snap.goals.length) {
    container.appendChild(nothingActive('goals.emptyTitle'));
    return container;
  }

  const active = snap.goals.filter((g) => g.status === 'active')
    .sort((a, b) => (b.priority || 3) - (a.priority || 3) || a.title.localeCompare(b.title, 'he'));
  const inactive = snap.goals.filter((g) => g.status !== 'active')
    .sort((a, b) => INACTIVE_ORDER.indexOf(a.status) - INACTIVE_ORDER.indexOf(b.status)
      || a.title.localeCompare(b.title, 'he'));

  const notice = alignmentNotice(snap);
  if (notice) container.appendChild(notice);

  container.appendChild(active.length
    /* Paused and achieved goals still exist, so the empty state here says that
     * none are running rather than that there are none. */
    ? cardGrid(active.map((g) => goalCard(goalsService.detail(g.id))))
    : nothingActive('goals.noneActive'));

  if (inactive.length) container.appendChild(inactiveSection(inactive));

  return container;
}

/* ------------------------------------------------------------------ *
 * The detail screen
 * ------------------------------------------------------------------ */

function textBlock(labelKey, text) {
  if (!text) return null;
  return h('div.card.card-sunk.card-pad', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('div.eyebrow', t(labelKey)),
    h('p', { style: { marginBlockStart: '6px', color: 'var(--ink-2)' } }, text));
}

/** The number a metric goal is actually measured by, editable in place. */
function metricControl(goal) {
  const input = h('input.shrink0', {
    type: 'number',
    min: '0',
    step: '1',
    value: String(goal.metricCurrent || 0),
    'aria-label': t('goals.metricCurrent'),
    style: { width: '110px' },
  });

  return h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('span.tiny.quiet.grow', t('goals.metricCurrent')),
    input,
    h('button.btn.btn-sm.btn-secondary.shrink0', {
      type: 'button',
      onclick: () => {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) { toastError(t('errors.invalidNumber')); return; }
        const result = goalsService.update(goal.id, { metricCurrent: value });
        if (!result.ok) { toastError(t('errors.generic')); return; }
        toast(t('goals.updated'), { tone: 'ok' });
        rerender();
      },
    }, t('common.save')));
}

/**
 * The slider for goals an app cannot measure.
 *
 * Written on `change` rather than `input` — a rerender halfway through a drag
 * would take the slider out from under the thumb.
 */
function manualControl(goal) {
  const value = h('span.tiny.quiet.num.shrink0', { style: { width: '46px', textAlign: 'end' } },
    `${goal.progressManual || 0}%`);

  const range = h('input.grow', {
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(goal.progressManual || 0),
    'aria-label': t('goals.progress'),
    oninput: (e) => { value.textContent = `${e.target.value}%`; },
    onchange: (e) => {
      const result = goalsService.update(goal.id, { progressManual: Number(e.target.value) });
      if (!result.ok) { toastError(t('errors.generic')); return; }
      rerender();
    },
  });

  return h('div.row', { style: { marginBlockStart: 'var(--sp-4)' } }, range, value);
}

function progressCard(detail) {
  const goal = detail.goal;
  const progress = detail.progress;

  return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-5)' } },
    h('div.row-between',
      h('span.eyebrow', t('goals.progress')),
      h('span.tiny.quiet.num', `${progress.pct}%`)),
    h('div', { style: { marginBlockStart: '10px' } },
      progressBar(progress.pct, { label: t('goals.progress') })),
    h('p.tiny.quiet', { style: { marginBlockStart: '8px' } }, progressLabel(progress)),

    goal.progressSource === 'metric' ? metricControl(goal) : null,
    goal.progressSource === 'manual' ? manualControl(goal) : null,

    /* Confidence is a judgement, not a measurement, so it sits under the bar
     * with its own label rather than colouring the bar itself. */
    h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('div.row-between',
        h('span.tiny.quiet', t('goals.confidence')),
        h('span.tiny.quiet.num', `${goal.confidence}%`)),
      h('div', { style: { marginBlockStart: '6px' } },
        progressBar(goal.confidence, { small: true, label: t('goals.confidence') }))));
}

function breakdownButton(goal) {
  const button = h('button.btn.btn-sm.btn-secondary', {
    type: 'button',
    async onclick() {
      button.disabled = true;
      replace(button, icon('sparkle', { size: 14 }), t('ai.thinking'));
      try {
        await openGoalBreakdown(goal, rerender);
      } finally {
        button.disabled = false;
        replace(button, icon('sparkle', { size: 14 }), t('goals.breakdownGenerate'));
      }
    },
  }, icon('sparkle', { size: 14 }), t('goals.breakdownGenerate'));
  return button;
}

function projectsSection(detail) {
  const cards = detail.projects.map((entry) => projectCard({
    project: entry.project,
    /* The goal is the page — repeating its title on every card is noise. */
    goal: null,
    health: entry.health,
    progress: entry.progress,
    openTasks: detail.tasks.filter((x) => x.projectId === entry.project.id && isOpen(x)),
  }));

  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('projects.title')),
      breakdownButton(detail.goal)),
    cards.length
      ? cardGrid(cards)
      : h('div.card.card-pad', h('p.quiet.tiny', t('goals.noProjects'))));
}

function tasksSection(detail, snap) {
  const direct = detail.tasks.filter((x) => !x.projectId && isOpen(x));
  if (!direct.length) return null;

  const opts = Object.assign(handlers(), { showScheduled: true, showEstimate: true });
  return h('section.section',
    h('div.section-head',
      h('h2.section-title', t('nav.tasks')),
      h('span.section-note', plural('count.tasks', direct.length))),
    taskList(direct.map((task) => taskRow(tasksService.decorate(task, snap), opts))));
}

function notesSection(detail) {
  if (!detail.notes.length) return null;
  return h('section.section',
    h('div.section-head', h('h2.section-title', t('notes.title'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      detail.notes.map((note) => h('a.trow', { href: href(`/notes/${note.id}`) },
        h('div.grow.ellipsis',
          h('div.trow-title.ellipsis', note.title || t('common.untitled')),
          note.body
            ? h('div.tiny.quiet.clamp-2', { style: { marginBlockStart: '3px' } }, note.body)
            : null),
        h('span.chip.shrink0', t(`notes.types.${note.type}`))))));
}

export function renderGoalDetail(onRerender, params) {
  rerender = onRerender;

  const detail = goalsService.detail(params && params.id);
  if (!detail) {
    return h('div', emptyState({
      icon: 'goal',
      title: t('errors.notFound'),
      note: t('errors.notFoundNote'),
      action: { label: t('goals.backToList'), onClick: () => go('/goals') },
    }));
  }

  const snap = snapshot();
  const goal = detail.goal;

  const container = h('div', pageHeader(goal.title, {
    actions: [
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => openGoalEditor(goal.id, rerender),
      }, icon('edit', { size: 15 }), t('common.edit')),
      h('button.btn-icon', {
        type: 'button',
        'aria-label': t('common.delete'),
        onclick: () => deleteGoal(goal),
      }, icon('trash')),
    ],
  }));

  container.appendChild(h('div.row.wrap-flex',
    areaChip(detail.area),
    h('span.chip', { title: t(`goals.typeNotes.${goal.type}`) }, t(`goals.types.${goal.type}`)),
    /* The date in full rather than dueChip's "מחר": a goal's target is usually
     * months out, and this is the one screen where the actual day is the
     * answer. The tone is a second signal, never the only one. */
    goal.targetDate
      ? h('span.chip', {
        class: goal.status === 'active' && goal.targetDate < snap.today ? 'chip-warn' : null,
      }, icon('calendar', { size: 12 }),
      `${t('goals.targetDate')}: ${formatDate(goal.targetDate)}`)
      : null,
    h('span.chip', `${t('goals.priority')}: ${t(`tasks.scale.${goal.priority}`)}`),
    goal.status !== 'active'
      ? h('span.chip', { class: goal.status === 'achieved' ? 'chip-ok' : null },
        goal.status === 'achieved' ? icon('check', { size: 12 }) : null,
        t(`goals.status.${goal.status}`))
      : null));

  container.appendChild(textBlock('goals.motivation', goal.motivation) || h('span'));
  container.appendChild(textBlock('goals.successDefinition', goal.successDefinition) || h('span'));
  container.appendChild(progressCard(detail));
  container.appendChild(projectsSection(detail));
  container.appendChild(tasksSection(detail, snap) || h('span'));
  container.appendChild(notesSection(detail) || h('span'));

  return container;
}
