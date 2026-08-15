/*
 * taskeditor.js — the one form that writes a task, and the split dialog.
 *
 * Every screen reaches this: Today, the task list, a project, the calendar, the
 * command palette. That is the reason it is a dialog and not a route — nobody
 * loses their place to change an estimate — and the reason it is one file
 * rather than a "quick add" and a "full edit" that drift apart until the quick
 * one silently drops the field somebody just set.
 *
 * THE FORM IS STATE, THE DOM IS A VIEW OF IT.
 *
 * Every control writes into `form`, and the pieces that depend on other pieces
 * — the milestone select, the waiting-for field, the score — are repainted from
 * it. Text inputs are never repainted while typing, which is why the painters
 * are per-field rather than one paint() for the whole body.
 *
 * WHY THE SCORE IS ON THIS SCREEN.
 *
 * The ranking decides what the app offers first, so a person who disagrees with
 * it needs somewhere to see how it was reached and which input to change. The
 * five contributions are shown next to the fields that produce them; that is
 * the whole argument for putting a number on a form.
 */

import {
  h, replace, dialog, field, chipGroup, switchRow, checkbox, confirmDestructive,
  skeletonLines, progressBar, ltr,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { formatDuration, formatTime, parseTimeInput } from '../core/time.js';
import { ESTIMATE_PRESETS, ENERGY_LEVELS } from '../domain/schema.js';
import { scoreTask } from '../engine/priority.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import { projects as projectsService, milestones as milestonesService } from '../services/structure.js';
import * as ai from '../ai/provider.js';
import { originNote } from './components.js';
import { startFocusFor } from './focus.js';

/* 'blocked' is derived from the dependency graph and 'cancelled' is what a
 * split leaves behind — neither is something to pick from a menu. They appear
 * only when the task is already in them, so the form never misreports. */
const STATUS_CHOICES = ['inbox', 'planned', 'ready', 'in_progress', 'waiting', 'done'];

const SCALE_VALUES = [1, 2, 3, 4, 5];

const PRIORITY_PARTS = [
  ['importance', 'tasks.importance'],
  ['urgency', 'tasks.urgency'],
  ['goalImpact', 'tasks.goalImpact'],
  ['deadlinePressure', 'settings.weightDeadline'],
  ['unlockPotential', 'settings.weightUnlock'],
];

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'min': return t('errors.tooShort');
    case 'max': return t('errors.tooLong', { n: err.max });
    case 'date': return t('errors.invalidDate');
    case 'time': return t('errors.invalidTime');
    case 'type': return t('errors.invalidNumber');
    case 'notFound': return t('errors.notFound');
    default: return t('errors.generic');
  }
}

/** A label over something that is not a single focusable control. */
function labelled(label, control, hint) {
  return h('div.field',
    h('div.field-label', label),
    control,
    hint ? h('p.field-hint', hint) : null);
}

function draftFrom(task, defaults) {
  const base = {
    title: '',
    description: '',
    projectId: null,
    areaId: null,
    milestoneId: null,
    status: 'ready',
    importance: 3,
    urgency: 3,
    goalImpact: 3,
    energyLevel: 'normal',
    estimatedMinutes: 25,
    dueDate: null,
    scheduledDate: null,
    scheduledStart: null,
    waitingFor: '',
    tags: [],
    someday: false,
  };
  const current = task ? {
    title: task.title,
    description: task.description || '',
    projectId: task.projectId || null,
    areaId: task.areaId || null,
    milestoneId: task.milestoneId || null,
    status: task.status,
    importance: task.importance,
    urgency: task.urgency,
    goalImpact: task.goalImpact,
    energyLevel: task.energyLevel,
    estimatedMinutes: task.estimatedMinutes,
    dueDate: task.dueDate || null,
    scheduledDate: task.scheduledDate || null,
    scheduledStart: task.scheduledStart === undefined ? null : task.scheduledStart,
    waitingFor: task.waitingFor || '',
    tags: (task.tags || []).slice(),
    someday: !!task.someday,
  } : {};
  return Object.assign(base, current, defaults || {});
}

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

/**
 * Create or edit a task.
 * `defaults` seeds a new task — {projectId, scheduledDate, ...} from wherever
 * the person pressed the button.
 */
export function openTaskEditor(taskId, rerender, defaults) {
  const refresh = rerender || (() => {});
  const existing = taskId ? tasksService.byId(taskId) : null;
  if (taskId && !existing) {
    toastError(t('errors.notFound'));
    return null;
  }

  const form = draftFrom(existing, defaults);
  let errors = {};
  let dirty = false;
  let dlg = null;

  /* The score the rest of the app ranked this task by. Shown until the form is
   * touched, after which the draft is scored instead — otherwise the block
   * would explain a number that no longer matches the fields on screen. */
  const rankedEntry = taskId ? tasksService.ranked((x) => x.id === taskId)[0] : null;

  /* Each field lives in its own host so it can be repainted alone. That breaks
   * the `.field + .field` rule the stylesheet uses for spacing — the hosts are
   * what sit next to each other — so the gap moves onto the host, where
   * adjacent margins collapse and a hidden field costs nothing. */
  const gap = { style: { marginBlockStart: 'var(--sp-4)' } };
  const hosts = {
    title: h('div'),
    description: h('div', gap),
    project: h('div', gap),
    area: h('div', gap),
    milestone: h('div', gap),
    dates: h('div', gap),
    estimate: h('div', gap),
    estimateCustom: h('div', gap),
    status: h('div', gap),
    waiting: h('div', gap),
    tags: h('div', gap),
    deps: h('div'),
    priority: h('div'),
  };

  /* ---------------- fields ---------------- */

  function paintTitle() {
    replace(hosts.title, field({
      label: t('tasks.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '200',
        placeholder: t('tasks.titlePlaceholder'),
        oninput: (e) => { form.title = e.target.value; dirty = true; },
      }),
    }));
  }

  function paintDescription() {
    replace(hosts.description, field({
      label: t('tasks.description'),
      optional: true,
      error: errorText(errors.description),
      control: h('textarea', {
        rows: '3',
        placeholder: t('tasks.descriptionPlaceholder'),
        oninput: (e) => { form.description = e.target.value; dirty = true; },
      }, form.description),
    }));
  }

  function paintProject() {
    const list = projectsService.active();
    const select = h('select', {
      onchange: (e) => {
        form.projectId = e.target.value || null;
        form.milestoneId = null;
        dirty = true;
        paintMilestone();
        paintArea();
        paintPriority();
      },
    },
    h('option', { value: '' }, t('common.unassigned')),
    list.map((p) => h('option', { value: p.id, selected: p.id === form.projectId }, p.title)));

    replace(hosts.project, field({
      label: t('tasks.project'),
      optional: true,
      error: errorText(errors.projectId),
      control: select,
    }));
  }

  function paintArea() {
    const snap = snapshot();
    const project = form.projectId ? snap.projectsById.get(form.projectId) : null;
    /* A project owns the area of everything in it (normaliseTask enforces it),
     * so the control says so rather than accepting a value that will be
     * overwritten on save. */
    const owned = !!(project && project.areaId);
    if (owned) form.areaId = project.areaId;

    const select = h('select', {
      disabled: owned,
      onchange: (e) => { form.areaId = e.target.value || null; dirty = true; },
    },
    h('option', { value: '' }, t('common.unassigned')),
    snap.areas.map((a) => h('option', { value: a.id, selected: a.id === form.areaId }, a.title)));

    replace(hosts.area, field({
      label: t('tasks.area'),
      optional: true,
      hint: owned ? t('tasks.areaFromProject') : null,
      control: select,
    }));
  }

  function paintMilestone() {
    const list = form.projectId ? milestonesService.forProject(form.projectId) : [];
    if (!list.length) { replace(hosts.milestone); return; }

    const select = h('select', {
      onchange: (e) => { form.milestoneId = e.target.value || null; dirty = true; },
    },
    h('option', { value: '' }, t('common.none')),
    list.map((m) => h('option', { value: m.id, selected: m.id === form.milestoneId }, m.title)));

    replace(hosts.milestone, field({
      label: t('projects.milestone'),
      optional: true,
      control: select,
    }));
  }

  function paintDates() {
    const due = field({
      label: t('tasks.due'),
      optional: true,
      error: errorText(errors.dueDate),
      control: h('input', {
        type: 'date',
        value: form.dueDate || '',
        onchange: (e) => { form.dueDate = e.target.value || null; dirty = true; paintPriority(); },
      }),
    });

    const scheduled = field({
      label: t('tasks.scheduled'),
      optional: true,
      error: errorText(errors.scheduledDate),
      control: h('input', {
        type: 'date',
        value: form.scheduledDate || '',
        onchange: (e) => {
          form.scheduledDate = e.target.value || null;
          if (!form.scheduledDate) form.scheduledStart = null;
          dirty = true;
          paintDates();
        },
      }),
    });

    /* A time without a day is not a schedule, so the control is unavailable
     * until there is a day to hang it on. */
    const start = field({
      label: t('calendar.starts'),
      optional: true,
      error: errorText(errors.scheduledStart),
      control: h('input', {
        type: 'time',
        disabled: !form.scheduledDate,
        value: form.scheduledStart === null || form.scheduledStart === undefined
          ? '' : formatTime(form.scheduledStart),
        onchange: (e) => {
          form.scheduledStart = e.target.value ? parseTimeInput(e.target.value) : null;
          dirty = true;
        },
      }),
    });

    replace(hosts.dates, due, h('div.field-row', { style: { marginBlockStart: 'var(--sp-4)' } }, scheduled, start));
  }

  function estimateChoice() {
    if (!form.estimatedMinutes) return 0;
    return ESTIMATE_PRESETS.includes(form.estimatedMinutes) ? form.estimatedMinutes : 'custom';
  }

  function paintEstimateCustom(show) {
    if (!show) { replace(hosts.estimateCustom); return; }
    replace(hosts.estimateCustom, field({
      label: t('tasks.estimateCustomLabel'),
      error: errorText(errors.estimatedMinutes),
      control: h('input', {
        type: 'number',
        min: '0',
        max: '1440',
        step: '5',
        value: String(form.estimatedMinutes || ''),
        oninput: (e) => {
          form.estimatedMinutes = Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0)));
          dirty = true;
        },
      }),
    }));
  }

  function paintEstimate() {
    const choice = estimateChoice();
    const group = chipGroup({
      label: t('tasks.estimate'),
      value: choice,
      options: [{ value: 0, label: t('tasks.noEstimate') }]
        .concat(ESTIMATE_PRESETS.map((m) => ({ value: m, label: formatDuration(m) })))
        .concat([{ value: 'custom', label: t('tasks.estimateCustom') }]),
      onChange: (value) => {
        dirty = true;
        if (value === 'custom') { paintEstimateCustom(true); return; }
        form.estimatedMinutes = value;
        paintEstimateCustom(false);
      },
    });
    replace(hosts.estimate, labelled(t('tasks.estimate'), group), hosts.estimateCustom);
    paintEstimateCustom(choice === 'custom');
  }

  function paintStatus() {
    const choices = STATUS_CHOICES.includes(form.status)
      ? STATUS_CHOICES
      : STATUS_CHOICES.concat([form.status]);

    const select = h('select', {
      onchange: (e) => { form.status = e.target.value; dirty = true; paintWaiting(); },
    }, choices.map((s) => h('option', {
      value: s,
      selected: s === form.status,
    }, t(`tasks.status.${s}`))));

    replace(hosts.status, field({
      label: t('tasks.statusField'),
      error: errorText(errors.status),
      control: select,
    }));
  }

  function paintWaiting() {
    if (form.status !== 'waiting') { replace(hosts.waiting); return; }
    replace(hosts.waiting, field({
      label: t('tasks.waitingFor'),
      error: errorText(errors.waitingFor),
      control: h('input', {
        type: 'text',
        value: form.waitingFor,
        maxlength: '140',
        placeholder: t('tasks.waitingForPlaceholder'),
        oninput: (e) => { form.waitingFor = e.target.value; dirty = true; },
      }),
    }));
  }

  function paintTags() {
    replace(hosts.tags, field({
      label: t('tasks.tags'),
      optional: true,
      hint: t('tasks.tagsHint'),
      error: errorText(errors.tags),
      control: h('input', {
        type: 'text',
        value: form.tags.join(', '),
        oninput: (e) => {
          form.tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
          dirty = true;
        },
      }),
    }));
  }

  /* ---------------- dependencies ---------------- */

  function paintDeps() {
    if (!taskId) return;
    const snap = snapshot();
    const deps = tasksService.dependencies(taskId);
    const taken = new Set(deps.map((d) => d.dependsOnId));
    const candidates = tasksService.open().filter((x) => x.id !== taskId && !taken.has(x.id));

    const rows = deps.map((d) => {
      const blocker = snap.tasksById.get(d.dependsOnId);
      return h('div.trow',
        h('div.grow.ellipsis',
          h('div.trow-title.ellipsis', blocker ? blocker.title : t('errors.notFound')),
          blocker && blocker.status === 'done'
            ? h('div.tiny.quiet', t('tasks.status.done'))
            : null),
        h('button.btn-icon.shrink0', {
          type: 'button',
          'aria-label': t('common.remove'),
          onclick: () => {
            tasksService.removeDependency(taskId, d.dependsOnId);
            paintDeps();
            paintPriority();
            refresh();
          },
        }, icon('x')));
    });

    let picked = candidates.length ? candidates[0].id : null;
    const picker = candidates.length
      ? h('div.row', { style: { marginBlockStart: 'var(--sp-3)' } },
        h('select.grow', {
          'aria-label': t('tasks.dependenciesAdd'),
          onchange: (e) => { picked = e.target.value || null; },
        }, candidates.map((c) => h('option', { value: c.id }, c.title))),
        h('button.btn.btn-sm.btn-secondary.shrink0', {
          type: 'button',
          onclick: () => {
            if (!picked) return;
            const result = tasksService.addDependency(taskId, picked);
            if (!result.ok) {
              toastError(result.code === 'cycle' ? t('tasks.cycleRejected') : t('errors.generic'));
              return;
            }
            paintDeps();
            paintPriority();
            refresh();
          },
        }, icon('plus', { size: 14 }), t('tasks.dependenciesAdd')))
      : null;

    replace(hosts.deps,
      labelled(t('tasks.dependencies'),
        rows.length
          ? h('div.card.card-flat', { style: { overflow: 'hidden' } }, rows)
          : h('p.tiny.quiet', t('tasks.dependenciesNone'))),
      picker);
  }

  /* ---------------- the score ---------------- */

  function currentPriority() {
    if (!dirty && rankedEntry) return rankedEntry._priority;
    const snap = snapshot();
    const project = form.projectId ? snap.projectsById.get(form.projectId) : null;
    const goal = project && project.goalId ? snap.goalsById.get(project.goalId) : null;
    return scoreTask({
      id: taskId || null,
      importance: form.importance,
      urgency: form.urgency,
      goalImpact: form.goalImpact,
      dueDate: form.dueDate,
    }, {
      weights: snap.preferences.weights,
      today: snap.today,
      graph: snap.graph,
      goalPriority: goal ? goal.priority : 3,
    });
  }

  function paintPriority() {
    const priority = currentPriority();
    replace(hosts.priority, h('div.card.card-sunk.card-pad',
      h('div.row-between',
        h('div.eyebrow', t('tasks.priorityWhy')),
        h('span.chip.chip-accent', { title: t('tasks.priorityScore') },
          ltr(String(priority.score)))),
      h('div.stack-tight', { style: { marginBlockStart: '10px' } },
        PRIORITY_PARTS.map(([key, labelKey]) => h('div.row',
          h('span.tiny.grow', t(labelKey)),
          h('span.shrink0', { style: { width: '90px' } },
            progressBar(priority.parts[key] * 100, { small: true, label: t(labelKey) })),
          h('span.tiny.quiet.shrink0', { style: { width: '46px', textAlign: 'end' } },
            ltr((Math.round(priority.contributions[key] * 1000) / 10).toFixed(1)))))),
      priority.goalMultiplier !== 1
        ? h('p.tiny.quiet', { style: { marginBlockStart: '8px' } },
          t('tasks.priorityGoalFactor', { factor: priority.goalMultiplier }))
        : null));
  }

  /* ---------------- saving ---------------- */

  function collect() {
    const payload = {
      title: form.title.trim(),
      description: form.description,
      projectId: form.projectId || null,
      areaId: form.areaId || null,
      milestoneId: form.milestoneId || null,
      status: form.status,
      importance: form.importance,
      urgency: form.urgency,
      goalImpact: form.goalImpact,
      energyLevel: form.energyLevel,
      estimatedMinutes: form.estimatedMinutes,
      dueDate: form.dueDate || null,
      scheduledDate: form.scheduledDate || null,
      scheduledStart: form.scheduledDate ? form.scheduledStart : null,
      waitingFor: form.status === 'waiting' ? form.waitingFor.trim() : '',
      tags: form.tags,
      someday: form.someday,
    };
    /* The end of a block is start + estimate, and only normaliseTask should
     * decide it. Clearing it when either input moved stops a block keeping the
     * length it had before somebody halved the estimate. */
    if (!existing
      || existing.scheduledStart !== payload.scheduledStart
      || existing.estimatedMinutes !== payload.estimatedMinutes) {
      payload.scheduledEnd = null;
    }
    return payload;
  }

  function showErrors(map) {
    errors = map || {};
    paintTitle();
    paintDescription();
    paintProject();
    paintDates();
    paintEstimate();
    paintStatus();
    paintWaiting();
    paintTags();
    if (errors['']) toastError(errorText(errors['']));
    const invalid = dlg && dlg.body.querySelector('[aria-invalid="true"]');
    if (invalid) invalid.focus();
  }

  function save() {
    const payload = collect();

    if (!taskId) {
      const result = tasksService.create(payload);
      if (!result.ok) { showErrors(result.errors); return false; }
      toast(t('tasks.created'), { tone: 'ok' });
      refresh();
      return true;
    }

    /* Completion is not an ordinary field write: it is refused for a blocked
     * task and it writes the activity log, so it goes through setComplete in
     * both directions and the rest of the form follows. */
    const wasDone = existing.status === 'done';
    const wantsDone = payload.status === 'done';
    if (wantsDone && !wasDone) {
      const done = tasksService.setComplete(taskId, true);
      if (!done.ok) {
        toastError(done.code === 'blocked'
          ? t('tasks.blockedCannotComplete')
          : t('errors.generic'));
        return false;
      }
    } else if (!wantsDone && wasDone) {
      tasksService.setComplete(taskId, false);
    }

    const result = tasksService.update(taskId, payload);
    if (!result.ok) { showErrors(result.errors); return false; }
    toast(t('tasks.updated'), { tone: 'ok' });
    refresh();
    return true;
  }

  /* ---------------- assembly ---------------- */

  paintTitle();
  paintDescription();
  paintProject();
  paintArea();
  paintMilestone();
  paintDates();
  paintEstimate();
  paintStatus();
  paintWaiting();
  paintTags();
  paintDeps();
  paintPriority();

  const energyField = labelled(t('tasks.energy'), chipGroup({
    label: t('tasks.energy'),
    value: form.energyLevel,
    options: ENERGY_LEVELS.map((level) => ({
      value: level,
      label: t(`tasks.energyLevel.${level}`),
      note: t(`tasks.energyNote.${level}`),
    })),
    onChange: (value) => { form.energyLevel = value; dirty = true; },
  }));

  function scaleField(labelKey, key) {
    return labelled(t(labelKey), chipGroup({
      label: t(labelKey),
      value: form[key],
      options: SCALE_VALUES.map((n) => ({ value: n, label: t(`tasks.scale.${n}`) })),
      onChange: (value) => { form[key] = value; dirty = true; paintPriority(); },
    }));
  }

  const somedayField = switchRow({
    label: t('someday.title'),
    note: t('someday.lead'),
    checked: form.someday,
    onChange: (value) => { form.someday = value; dirty = true; },
  });

  const extraActions = taskId
    ? h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('button.btn.btn-sm.btn-secondary', {
        type: 'button',
        onclick: () => { dlg.close(); startFocusFor(taskId); },
      }, icon('play', { size: 14 }), t('tasks.startFocus')),
      h('button.btn.btn-sm.btn-secondary', {
        type: 'button',
        onclick: () => { dlg.close(); openSplitDialog(taskId, refresh); },
      }, icon('split', { size: 14 }), t('tasks.split')),
      h('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        async onclick() {
          const yes = await confirmDestructive({
            title: t('confirm.deleteTaskTitle'),
            note: t('confirm.deleteTaskNote'),
          });
          if (!yes) return;
          tasksService.remove(taskId);
          toast(t('tasks.deleted'));
          dlg.close();
          refresh();
        },
      }, icon('trash', { size: 14 }), t('common.delete')))
    : null;

  dlg = dialog({
    title: taskId ? t('tasks.editTask') : t('tasks.newTask'),
    wide: true,
    initialFocus: 'input',
    body: [
      hosts.title,
      hosts.description,
      hosts.project,
      hosts.area,
      hosts.milestone,
      hosts.dates,
      hosts.estimate,
      h('div', gap, energyField),
      /* Stacked rather than paired: five chips reading "נמוך מאוד" do not fit
       * half a phone's width without wrapping into an unreadable block. */
      h('div', gap, scaleField('tasks.importance', 'importance')),
      h('div', gap, scaleField('tasks.urgency', 'urgency')),
      h('div', gap, scaleField('tasks.goalImpact', 'goalImpact')),
      hosts.status,
      hosts.waiting,
      hosts.tags,
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, somedayField),
      taskId ? h('div', { style: { marginBlockStart: 'var(--sp-5)' } }, hosts.deps) : null,
      h('div', { style: { marginBlockStart: 'var(--sp-5)' } }, hosts.priority),
      extraActions,
    ],
    actions: [
      { label: t('common.cancel') },
      { label: taskId ? t('common.save') : t('common.create'), kind: 'primary', onClick: save },
    ],
  });

  return dlg;
}

/* ------------------------------------------------------------------ *
 * Split
 * ------------------------------------------------------------------ */

/**
 * Replace one task with the steps it is really made of.
 *
 * The steps are a proposal, not a result: every row is editable and every row
 * can be dropped before anything is written. tasksService.split chains them in
 * order and cancels the original.
 */
export function openSplitDialog(taskId, rerender) {
  const refresh = rerender || (() => {});
  const task = tasksService.byId(taskId);
  if (!task) {
    toastError(t('errors.notFound'));
    return null;
  }

  const steps = [];
  const listHost = h('div');
  const originHost = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });

  function stepRow(step) {
    const checkHost = h('div.shrink0');
    function paintCheck() {
      replace(checkHost, checkbox(step.include, {
        label: step.title || t('common.untitled'),
        onChange: (next) => { step.include = next; paintCheck(); },
      }));
    }
    paintCheck();

    return h('div.row', { style: { marginBlockStart: '8px' } },
      checkHost,
      h('input.grow', {
        type: 'text',
        value: step.title,
        maxlength: '200',
        'aria-label': t('routines.stepPlaceholder'),
        placeholder: t('routines.stepPlaceholder'),
        oninput: (e) => { step.title = e.target.value; },
      }),
      h('input.shrink0', {
        type: 'number',
        min: '5',
        max: '240',
        step: '5',
        value: String(step.minutes),
        'aria-label': t('routines.stepMinutes'),
        style: { width: '84px' },
        oninput: (e) => {
          step.minutes = Math.max(5, Math.min(240, Math.round(Number(e.target.value) || 5)));
        },
      }));
  }

  function addStep(values) {
    const step = Object.assign({ title: '', minutes: 20, include: true }, values || {});
    steps.push(step);
    listHost.appendChild(stepRow(step));
    return step;
  }

  function fill(list) {
    replace(listHost);
    steps.length = 0;
    for (const s of list) {
      addStep({
        title: String(s.title || ''),
        minutes: Math.max(5, Math.min(240, Math.round(Number(s.estimatedMinutes) || 20))),
      });
    }
  }

  function apply() {
    const chosen = steps.filter((s) => s.include && s.title.trim());
    if (chosen.length < 2) {
      toastError(t('tasks.splitNeedTwo'));
      return false;
    }
    const result = tasksService.split(taskId, chosen.map((s) => ({
      title: s.title.trim(),
      estimatedMinutes: s.minutes,
      energyLevel: task.energyLevel,
    })));
    if (!result.ok) {
      toastError(result.code === 'tooFew' ? t('tasks.splitNeedTwo') : t('errors.generic'));
      return false;
    }
    toast(t('tasks.splitDone'), { tone: 'ok' });
    refresh();
    return true;
  }

  const dlg = dialog({
    title: t('tasks.splitTitle'),
    note: t('tasks.splitLead'),
    body: [
      h('div.card.card-sunk.card-pad', h('div.trow-title', task.title)),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, listHost),
      h('div', { style: { marginBlockStart: 'var(--sp-3)' } },
        h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => addStep(),
        }, icon('plus', { size: 14 }), t('tasks.splitAdd'))),
      originHost,
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('tasks.splitApply'), kind: 'primary', onClick: apply },
    ],
  });

  /*
   * The rules split resolves in a microtask, so waiting for it costs nothing
   * and shows nothing. A model call is the only case worth a skeleton, and
   * status().usable is exactly the case where one is about to be made.
   */
  if (ai.status().usable) listHost.appendChild(skeletonLines(4));

  ai.splitTask(task).then((result) => {
    if (!listHost.isConnected) return;
    const list = (result && result.steps) || [];
    if (!list.length) { replace(listHost); addStep(); addStep(); return; }
    fill(list);
    replace(originHost, originNote(result.origin));
  }).catch(() => {
    if (!listHost.isConnected) return;
    /* Nothing to propose is still a usable dialog: two empty rows and the
     * person writes the steps. */
    replace(listHost);
    addStep();
    addStep();
  });

  return dlg;
}
