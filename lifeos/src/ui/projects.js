/*
 * projects.js — the level where a deadline stops being a wish.
 *
 * A goal has a date somebody hoped for. A project has a date, a list of open
 * estimates, and a calendar that says how many usable hours are left between
 * here and there. Those three numbers can be compared, which is the whole
 * reason this screen exists.
 *
 * THE FEASIBILITY BLOCK IS THE SCREEN (§41).
 *
 * Everything else here — progress, milestones, tasks — is bookkeeping that
 * other screens could show. The one thing only this screen can say is "you are
 * seven hours short", and the moment it says that it owes four ways out, each
 * carrying the number that makes it a decision rather than a suggestion: the
 * date that would work, the tasks that would have to go and how much they free,
 * the extra minutes per day, and the way back to the priorities. An app that
 * announces a shortfall and then goes quiet has only added anxiety.
 *
 * The health grouping on the list follows the same rule. Projects in trouble
 * come first not because red is exciting but because a list sorted by name
 * hides the two that need a decision behind eleven that do not.
 */

import {
  h, replace, emptyState, confirmDestructive, dialog, field, chipGroup,
  progressBar, popupMenu, checkbox, announce,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo, toastError } from '../core/toast.js';
import { go, href } from '../core/router.js';
import { formatDate, formatDuration } from '../core/time.js';
import { explainHealth } from '../engine/explain.js';
import { scopeCutCandidates } from '../engine/deadline.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import { projects as projectsService, milestones as milestonesService } from '../services/structure.js';
import * as ai from '../ai/provider.js';
import {
  pageHeader, projectCard, healthChip, areaChip, progressLabel,
  taskRow, taskList, taskMenu,
} from './components.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';
import { startFocusFor } from './focus.js';
import { openPreview } from './preview.js';

/* at_risk and blocked share a heading: both mean "decide something today", and
 * splitting them makes two short lists nobody reads instead of one. */
const HEALTH_GROUPS = [
  { label: 'projects.groupAtRisk', match: (x) => x === 'at_risk' || x === 'blocked' },
  { label: 'projects.status.needs_attention', match: (x) => x === 'needs_attention' },
  { label: 'projects.status.on_track', match: (x) => x === 'on_track' },
  { label: 'projects.status.paused', match: (x) => x === 'idle' },
];

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

function cardGrid(cards) {
  return h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: 'var(--sp-3)',
    },
  }, cards);
}

/** A label over something that is not a single focusable control. */
function labelled(label, control, hint) {
  return h('div.field',
    h('div.field-label', label),
    control,
    hint ? h('p.field-hint', hint) : null);
}

/** A section that builds its contents the first time it is opened. */
function collapsible(title, summary, build, sub) {
  const body = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });
  body.hidden = true;
  let built = false;

  const chevron = h('span.shrink0', icon('chevronDown', { size: 14 }));
  const toggle = h('button.btn.btn-ghost.btn-sm', {
    type: 'button',
    'aria-expanded': 'false',
    onclick: () => {
      const open = body.hidden;
      if (open && !built) { built = true; replace(body, build()); }
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      replace(chevron, icon(open ? 'chevronUp' : 'chevronDown', { size: 14 }));
    },
  }, summary, chevron);

  return h('section.section',
    h('div.section-head', h(sub ? 'h3.section-title' : 'h2.section-title', title), toggle),
    body);
}

function byDueThenTitle(a, b) {
  const da = a.project.dueDate || '9999-12-31';
  const db = b.project.dueDate || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return a.project.title.localeCompare(b.project.title, 'he');
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
 * The project form
 * ------------------------------------------------------------------ */

function openProjectEditor(projectId, refresh) {
  const existing = projectId ? projectsService.byId(projectId) : null;
  if (projectId && !existing) { toastError(t('errors.notFound')); return null; }

  const snap = snapshot();
  const form = {
    title: existing ? existing.title : '',
    description: existing ? existing.description || '' : '',
    goalId: existing ? existing.goalId || null : null,
    areaId: existing ? existing.areaId || null : null,
    dueDate: existing ? existing.dueDate || null : null,
    priority: existing ? existing.priority : 3,
    /* Zero is the schema's "not estimated", and an input showing 0 reads as a
     * project somebody claimed takes no time. */
    estimatedMinutes: existing && existing.estimatedMinutes ? String(existing.estimatedMinutes) : '',
  };
  let errors = {};

  const gap = { style: { marginBlockStart: 'var(--sp-4)' } };
  const hosts = { title: h('div'), due: h('div', gap), estimate: h('div', gap) };

  function paintTitle() {
    replace(hosts.title, field({
      label: t('projects.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '140',
        placeholder: t('projects.titlePlaceholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }

  function paintDue() {
    replace(hosts.due, field({
      label: t('projects.dueDate'),
      optional: true,
      error: errorText(errors.dueDate),
      control: h('input', {
        type: 'date',
        value: form.dueDate || '',
        onchange: (e) => { form.dueDate = e.target.value || null; },
      }),
    }));
  }

  function paintEstimate() {
    replace(hosts.estimate, field({
      label: t('projects.estimate'),
      optional: true,
      hint: t('projects.estimateHint'),
      error: errorText(errors.estimatedMinutes),
      control: h('input', {
        type: 'number',
        min: '0',
        step: '15',
        value: form.estimatedMinutes,
        oninput: (e) => { form.estimatedMinutes = e.target.value; },
      }),
    }));
  }

  paintTitle();
  paintDue();
  paintEstimate();

  function save() {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      goalId: form.goalId || null,
      areaId: form.areaId || null,
      dueDate: form.dueDate || null,
      priority: form.priority,
      estimatedMinutes: form.estimatedMinutes === '' ? 0 : Number(form.estimatedMinutes),
    };

    const result = existing
      ? projectsService.update(existing.id, payload)
      : projectsService.create(payload);

    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      paintDue();
      paintEstimate();
      if (errors['']) toastError(errorText(errors['']));
      return false;
    }

    toast(existing ? t('projects.updated') : t('projects.created'), { tone: 'ok' });
    refresh();
    return true;
  }

  return dialog({
    title: existing ? t('projects.editProject') : t('projects.newProject'),
    wide: true,
    initialFocus: 'input',
    body: [
      hosts.title,
      h('div', gap, field({
        label: t('tasks.description'),
        optional: true,
        control: h('textarea', {
          rows: '2',
          maxlength: '2000',
          placeholder: t('tasks.descriptionPlaceholder'),
          oninput: (e) => { form.description = e.target.value; },
        }, form.description),
      })),
      h('div', gap, field({
        label: t('projects.goal'),
        optional: true,
        control: h('select', {
          onchange: (e) => { form.goalId = e.target.value || null; },
        },
        h('option', { value: '' }, t('common.unassigned')),
        snap.goals.filter((g) => g.status === 'active' || g.id === form.goalId)
          .map((g) => h('option', { value: g.id, selected: g.id === form.goalId }, g.title))),
      })),
      h('div', gap, field({
        label: t('areas.one'),
        optional: true,
        control: h('select', {
          onchange: (e) => { form.areaId = e.target.value || null; },
        },
        h('option', { value: '' }, t('common.unassigned')),
        snap.areas.map((a) => h('option', { value: a.id, selected: a.id === form.areaId }, a.title))),
      })),
      hosts.due,
      h('div', gap, labelled(t('goals.priority'), chipGroup({
        label: t('goals.priority'),
        value: form.priority,
        options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`tasks.scale.${n}`) })),
        onChange: (value) => { form.priority = value; },
      }))),
      hosts.estimate,
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('common.save'), kind: 'primary', onClick: save },
    ],
  });
}

async function deleteProject(project) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteProjectTitle'),
    note: t('confirm.deleteProjectNote'),
  });
  if (!yes) return;
  projectsService.remove(project.id);
  toast(t('projects.deleted'));
  go('/projects');
}

function setProjectDone(project, done) {
  const result = projectsService.update(project.id, { status: done ? 'done' : 'active' });
  if (!result.ok) { toastError(t('errors.generic')); return; }
  toast(done ? t('projects.completed') : t('projects.updated'), { tone: 'ok' });
  rerender();
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

export function renderProjects(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const container = h('div', pageHeader(t('projects.title'), {
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openProjectEditor(null, rerender),
      }, icon('plus', { size: 16 }), t('projects.newProject')),
    ],
  }));

  if (!snap.projects.length) {
    container.appendChild(emptyState({
      icon: 'project',
      title: t('projects.emptyTitle'),
      note: t('projects.emptyNote'),
      action: { label: t('projects.newProject'), onClick: () => openProjectEditor(null, rerender) },
    }));
    return container;
  }

  const details = snap.projects.map((p) => projectsService.detail(p.id)).filter(Boolean);
  const done = details.filter((d) => d.health.health === 'done').sort(byDueThenTitle);

  for (const group of HEALTH_GROUPS) {
    const rows = details.filter((d) => group.match(d.health.health)).sort(byDueThenTitle);
    if (!rows.length) continue;
    container.appendChild(h('section.section',
      h('div.section-head',
        h('h2.section-title', t(group.label)),
        h('span.section-note', plural('count.projects', rows.length))),
      cardGrid(rows.map((d) => projectCard(d)))));
  }

  if (done.length) {
    container.appendChild(collapsible(
      t('projects.status.done'),
      plural('count.projects', done.length),
      () => cardGrid(done.map((d) => projectCard(d))),
    ));
  }

  return container;
}

/* ------------------------------------------------------------------ *
 * Feasibility — §41
 * ------------------------------------------------------------------ */

/** The two numbers the verdict is derived from, always shown next to it. */
function feasibilityFacts(feas) {
  return h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
    h('span.chip', `${t('projects.remainingWork')}: ${formatDuration(feas.needed)}`),
    feas.available === null
      ? null
      : h('span.chip', `${t('projects.timeAvailable')}: ${formatDuration(feas.available)}`));
}

/**
 * Which open tasks would have to go, as a preview rather than a decision.
 *
 * scopeCutCandidates stops as soon as the gap is closed, so the list is the
 * shortest one that actually works — and when even all of them are not enough,
 * it says so instead of implying the problem is solved.
 */
function openCutScope(detail) {
  const feas = detail.feasibility;
  const candidates = scopeCutCandidates(detail.openTasks, feas.shortfall);
  if (!candidates.tasks.length) { toast(t('common.nothingHere')); return null; }

  return openPreview({
    title: t('projects.cutScopeTitle'),
    lead: candidates.enough ? t('projects.cutScopeLead') : t('projects.cutScopeNotEnough'),
    groups: [{
      title: t('nav.tasks'),
      items: candidates.tasks.map((task) => ({
        id: task.id,
        label: task.title,
        note: task.estimatedMinutes ? formatDuration(task.estimatedMinutes) : '',
      })),
    }],
    onApply: (selection) => {
      let cancelled = 0;
      for (const group of selection) {
        for (const id of group.ids) {
          const result = tasksService.update(id, { status: 'cancelled' });
          if (result.ok) cancelled += 1;
        }
      }
      if (!cancelled) { toastError(t('errors.generic')); return; }
      toast(t('projects.cutScopeApplied'), { tone: 'ok' });
      rerender();
    },
  });
}

function moveDeadline(project, option) {
  const previous = project.dueDate;
  const result = projectsService.update(project.id, { dueDate: option.newDate });
  if (!result.ok) { toastError(t('errors.generic')); return; }
  toastUndo(t('projects.updated'), () => {
    projectsService.update(project.id, { dueDate: previous });
    rerender();
  });
  rerender();
}

function shortfallOptionsBlock(detail) {
  const project = detail.project;
  const buttons = [];
  let addTime = null;

  for (const option of detail.options) {
    switch (option.code) {
      case 'moveDeadline':
        /* Without a usable daily rate there is no date to propose, and a button
         * labelled "move the deadline" with nowhere to move it is a dead end. */
        if (!option.newDate) break;
        buttons.push(h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => moveDeadline(project, option),
        }, icon('calendar', { size: 14 }),
        `${t('projects.feasibleMoveDeadline')} · ${formatDate(option.newDate)}`));
        break;

      case 'cutScope':
        buttons.push(h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => openCutScope(detail),
        }, icon('minus', { size: 14 }),
        `${t('projects.feasibleCutScope')} · ${formatDuration(option.minutes)}`));
        break;

      case 'addTime':
        /* The only option the app cannot carry out for anybody: it is a
         * decision about the person's own evenings, so it is stated as a
         * number and left alone. */
        addTime = h('p.tiny', { style: { marginBlockStart: '10px', color: 'var(--ink-2)' } },
          h('strong', `${t('projects.feasibleAddTime')}: `),
          t('projects.feasibleAddTimeNote', { time: formatDuration(option.minutesPerDay) }));
        break;

      case 'reprioritise':
        buttons.push(h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => go('/tasks'),
        }, icon('scale', { size: 14 }), t('projects.feasibleReprioritize')));
        break;

      default:
        break;
    }
  }

  return h('div',
    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } }, buttons),
    addTime);
}

function feasibilitySection(detail) {
  const feas = detail.feasibility;

  if (feas.ok === null) {
    return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('div.eyebrow', t('projects.feasibleTitle')),
      h('p.tiny.quiet', { style: { marginBlockStart: '6px' } }, t('projects.feasibleNoDeadline')),
      feasibilityFacts(feas));
  }

  if (feas.ok === true) {
    return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('div.eyebrow', t('projects.feasibleTitle')),
      h('p', { style: { marginBlockStart: '6px', color: 'var(--ink-2)' } },
        t('projects.feasibleOk', { time: formatDuration(feas.surplus) })),
      feasibilityFacts(feas));
  }

  /* A deadline that has already passed with no work left behind it is not a
   * shortfall — offering to free zero minutes would be arithmetic nobody
   * asked for. The date is the whole news. */
  if (feas.shortfall <= 0) {
    return h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-5)' } },
      h('div.eyebrow', t('projects.feasibleTitle')),
      h('p.tiny.quiet', { style: { marginBlockStart: '6px' } }, t('errors.pastDate')),
      feasibilityFacts(feas));
  }

  return h('div.notice.notice-warn', { style: { marginBlockStart: 'var(--sp-5)' } },
    h('div.row',
      icon('alert', { size: 16 }),
      h('strong', t('projects.feasibleTitle'))),
    feas.code === 'past'
      ? h('p', { style: { marginBlockStart: '6px' } }, t('errors.pastDate'))
      : null,
    h('p', { style: { marginBlockStart: '6px' } },
      t('projects.feasibleShort', { time: formatDuration(feas.shortfall) })),
    feasibilityFacts(feas),
    shortfallOptionsBlock(detail));
}

/* ------------------------------------------------------------------ *
 * Milestones
 * ------------------------------------------------------------------ */

function openMilestoneEditor(projectId, milestoneId, refresh) {
  const existing = milestoneId ? milestonesService.byId(milestoneId) : null;
  if (milestoneId && !existing) { toastError(t('errors.notFound')); return null; }

  const form = {
    title: existing ? existing.title : '',
    targetDate: existing ? existing.targetDate || null : null,
  };
  let errors = {};

  const titleHost = h('div');

  function paintTitle() {
    replace(titleHost, field({
      label: t('projects.milestone'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '140',
        placeholder: t('projects.milestonePlaceholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }
  paintTitle();

  function save() {
    const payload = { title: form.title.trim(), targetDate: form.targetDate || null };
    const result = existing
      ? milestonesService.update(existing.id, payload)
      : milestonesService.create(Object.assign({ projectId }, payload));

    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      if (!Object.keys(errors).length) toastError(t('errors.generic'));
      return false;
    }
    toast(t('common.saved'), { tone: 'ok' });
    refresh();
    return true;
  }

  return dialog({
    title: existing ? t('projects.editMilestone') : t('projects.newMilestone'),
    initialFocus: 'input',
    body: [
      titleHost,
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, field({
        label: t('goals.targetDate'),
        optional: true,
        control: h('input', {
          type: 'date',
          value: form.targetDate || '',
          onchange: (e) => { form.targetDate = e.target.value || null; },
        }),
      })),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t('common.save'), kind: 'primary', onClick: save },
    ],
  });
}

async function deleteMilestone(milestone) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteMilestoneTitle'),
    note: t('confirm.deleteMilestoneNote'),
  });
  if (!yes) return;
  milestonesService.remove(milestone.id);
  rerender();
}

function milestoneRow(milestone, index) {
  const done = !!milestone.completedAt;

  return h('li.trow', { class: done ? 'trow-done' : null },
    checkbox(done, {
      label: milestone.title,
      title: done ? t('tasks.uncomplete') : t('tasks.complete'),
      onChange: (next) => {
        milestonesService.setComplete(milestone.id, next);
        if (next) {
          announce(t('projects.milestoneDone'));
          toast(t('projects.milestoneDone'), { tone: 'ok' });
        }
        rerender();
      },
    }),
    h('button.trow-body', {
      type: 'button',
      onclick: () => openMilestoneEditor(milestone.projectId, milestone.id, rerender),
    },
    h('div.trow-title',
      /* The ordinal is written rather than left to a list marker: milestones
       * are a sequence, and the number has to survive next to a checkbox. */
      h('span.num.quiet', { style: { marginInlineEnd: '8px' } }, String(index + 1)),
      milestone.title),
    milestone.targetDate
      ? h('div.trow-meta', h('span.chip', icon('calendar', { size: 12 }), formatDate(milestone.targetDate)))
      : null),
    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('common.actions'),
      onclick: (e) => popupMenu(e.currentTarget, [
        {
          label: t('common.edit'),
          icon: 'edit',
          onClick: () => openMilestoneEditor(milestone.projectId, milestone.id, rerender),
        },
        { separator: true },
        {
          label: t('common.delete'),
          icon: 'trash',
          danger: true,
          onClick: () => deleteMilestone(milestone),
        },
      ]),
    }, icon('more')));
}

function milestonesSection(detail) {
  const list = detail.milestones;
  const doneCount = list.filter((m) => m.completedAt).length;

  const addButton = h('button.btn.btn-sm.btn-secondary', {
    type: 'button',
    onclick: () => openMilestoneEditor(detail.project.id, null, rerender),
  }, icon('plus', { size: 14 }), t('projects.newMilestone'));

  return h('section.section',
    h('div.section-head',
      h('div',
        h('h2.section-title', t('projects.milestones')),
        h('p.section-note', t('projects.milestoneNote'))),
      h('div.row.shrink0',
        list.length
          ? h('span.tiny.quiet.num',
            t('projects.milestonesProgress', { done: doneCount, total: list.length }))
          : null,
        addButton)),
    list.length
      ? h('ol.card.card-flat', {
        style: { overflow: 'hidden', listStyle: 'none', paddingInlineStart: '0' },
      }, list.map((m, i) => milestoneRow(m, i)))
      : h('div.card.card-pad', h('p.quiet.tiny', t('projects.milestonesEmpty'))));
}

/* ------------------------------------------------------------------ *
 * Tasks and the breakdown
 * ------------------------------------------------------------------ */

function applyBreakdown(project, proposed, selection, origin, refresh) {
  const actor = origin === 'model' ? 'AI' : 'USER';
  let created = 0;

  for (const group of selection) {
    for (const id of group.ids) {
      const parts = /^([mt])(\d+)$/.exec(id);
      if (!parts) continue;
      const index = Number(parts[2]);

      if (parts[1] === 'm') {
        const milestone = proposed.milestones[index];
        if (!milestone) continue;
        const done = milestonesService.create({ projectId: project.id, title: milestone.title });
        if (done.ok) created += 1;
        continue;
      }

      const task = proposed.tasks[index];
      if (!task) continue;
      const done = tasksService.create({
        title: task.title,
        projectId: project.id,
        goalId: project.goalId || null,
        areaId: project.areaId || null,
        status: 'ready',
        estimatedMinutes: task.estimatedMinutes || 30,
        energyLevel: task.energyLevel || 'normal',
        _actor: actor,
      });
      if (done.ok) created += 1;
    }
  }

  if (!created) { toastError(t('errors.generic')); return; }
  toast(t('goals.breakdownCreated'), { tone: 'ok' });
  refresh();
}

async function openBreakdown(project, refresh) {
  let plan = null;
  try {
    plan = await ai.breakDownProject(project);
  } catch (e) {
    plan = null;
  }

  const proposed = {
    milestones: (plan && plan.milestones) || [],
    tasks: (plan && plan.tasks) || [],
  };
  /* A failed request still leaves the local proposal, so reaching here means
   * there was genuinely nothing to suggest. */
  if (!proposed.milestones.length && !proposed.tasks.length) {
    toast(t('projects.breakdownEmpty'));
    return null;
  }

  const groups = [
    {
      title: t('projects.milestones'),
      items: proposed.milestones.map((m, i) => ({ id: `m${i}`, label: m.title })),
    },
    {
      title: t('nav.tasks'),
      items: proposed.tasks.map((task, i) => ({
        id: `t${i}`,
        label: task.title,
        note: task.estimatedMinutes ? formatDuration(task.estimatedMinutes) : '',
      })),
    },
  ];

  return openPreview({
    title: t('goals.breakdownTitle'),
    lead: t('projects.breakdownLead'),
    origin: plan.origin,
    groups,
    onApply: (selection) => applyBreakdown(project, proposed, selection, plan.origin, refresh),
  });
}

function breakdownButton(project) {
  const button = h('button.btn.btn-sm.btn-secondary', {
    type: 'button',
    async onclick() {
      button.disabled = true;
      replace(button, icon('sparkle', { size: 14 }), t('ai.thinking'));
      try {
        await openBreakdown(project, rerender);
      } finally {
        button.disabled = false;
        replace(button, icon('sparkle', { size: 14 }), t('projects.breakdown'));
      }
    },
  }, icon('sparkle', { size: 14 }), t('projects.breakdown'));
  return button;
}

function tasksSection(detail, snap) {
  const project = detail.project;
  const open = detail.openTasks;
  const done = detail.doneTasks;
  const opts = Object.assign(handlers(), { showProject: false, showScheduled: true, showEstimate: true });

  const addButton = h('button.btn.btn-sm.btn-secondary', {
    type: 'button',
    onclick: () => openTaskEditor(null, rerender, { projectId: project.id }),
  }, icon('plus', { size: 14 }), t('tasks.addTask'));

  const section = h('section.section',
    h('div.section-head',
      h('h2.section-title', t('projects.tasksTitle')),
      h('div.row.shrink0', breakdownButton(project), addButton)));

  if (!detail.tasks.length) {
    section.appendChild(emptyState({
      icon: 'tasks',
      title: t('projects.noTasksTitle'),
      note: t('projects.noTasksNote'),
      action: {
        label: t('tasks.addTask'),
        onClick: () => openTaskEditor(null, rerender, { projectId: project.id }),
      },
    }));
    return section;
  }

  section.appendChild(open.length
    ? taskList(open.map((task) => taskRow(tasksService.decorate(task, snap), opts)))
    : h('div.card.card-pad', h('p.quiet.tiny', t('tasks.emptyTitle'))));

  if (done.length) {
    section.appendChild(collapsible(
      t('projects.tasksDone'),
      plural('count.tasksDone', done.length),
      () => taskList(done.map((task) => taskRow(
        tasksService.decorate(task, snap),
        Object.assign(handlers(), { showProject: false }),
      ))),
      true,
    ));
  }

  return section;
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

/* ------------------------------------------------------------------ *
 * The detail screen
 * ------------------------------------------------------------------ */

export function renderProjectDetail(onRerender, params) {
  rerender = onRerender;

  const detail = projectsService.detail(params && params.id);
  if (!detail) {
    return h('div', emptyState({
      icon: 'project',
      title: t('errors.notFound'),
      note: t('errors.notFoundNote'),
      action: { label: t('projects.backToList'), onClick: () => go('/projects') },
    }));
  }

  const snap = snapshot();
  const project = detail.project;
  const isDone = detail.health.health === 'done';

  const container = h('div', pageHeader(project.title, {
    actions: [
      h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => openProjectEditor(project.id, rerender),
      }, icon('edit', { size: 15 }), t('common.edit')),
      h('button.btn-icon', {
        type: 'button',
        'aria-label': t('common.actions'),
        onclick: (e) => popupMenu(e.currentTarget, [
          { label: t('common.edit'), icon: 'edit', onClick: () => openProjectEditor(project.id, rerender) },
          {
            label: isDone ? t('tasks.uncomplete') : t('tasks.complete'),
            icon: isDone ? 'history' : 'check',
            onClick: () => setProjectDone(project, !isDone),
          },
          { separator: true },
          { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => deleteProject(project) },
        ]),
      }, icon('more')),
    ],
  }));

  container.appendChild(h('div.row.wrap-flex',
    detail.goal
      ? h('a.chip', { href: href(`/goals/${detail.goal.id}`) },
        icon('goal', { size: 12 }), detail.goal.title)
      : null,
    areaChip(detail.area),
    healthChip(detail.health),
    /* The date in full rather than dueChip's "ביום שני": the feasibility block
     * below is about this date, and the two have to be talking about something
     * a reader can see. The tone is a second signal, never the only one. */
    project.dueDate
      ? h('span.chip', { class: !isDone && project.dueDate < snap.today ? 'chip-risk' : null },
        icon('calendar', { size: 12 }),
        `${t('projects.dueDate')}: ${formatDate(project.dueDate)}`)
      : null,
    h('span.chip', `${t('goals.priority')}: ${t(`tasks.scale.${project.priority}`)}`)));

  if (project.description) {
    container.appendChild(h('div.card.card-sunk.card-pad', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('p', { style: { color: 'var(--ink-2)' } }, project.description)));
  }

  container.appendChild(h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-5)' } },
    h('div.row-between',
      h('span.eyebrow', t('goals.progress')),
      h('span.tiny.quiet.num', `${detail.progress.pct}%`)),
    h('div', { style: { marginBlockStart: '10px' } },
      progressBar(detail.progress.pct, { label: t('goals.progress') })),
    h('p.tiny.quiet', { style: { marginBlockStart: '8px' } }, progressLabel(detail.progress))));

  /* Why the chip says what it says. The chip alone is a verdict; this is the
   * evidence, in the same two sentences the health engine used to decide. */
  const why = explainHealth(detail.health.reasons);
  if (why) {
    container.appendChild(h('div.card.card-pad', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('div.eyebrow', t('projects.healthTitle')),
      h('p.why', { style: { marginBlockStart: '8px' } }, why)));
  }

  /* Nothing to be feasible about once it is finished. */
  if (!isDone) container.appendChild(feasibilitySection(detail));
  container.appendChild(milestonesSection(detail));
  container.appendChild(tasksSection(detail, snap));
  container.appendChild(notesSection(detail) || h('span'));

  return container;
}
