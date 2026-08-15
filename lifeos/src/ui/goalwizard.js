/*
 * goalwizard.js — five questions, one at a time, and the plan that follows.
 *
 * §12 asks for a wizard rather than a form, and the difference is not
 * decoration. A goal form with eight fields gets a title typed into it and
 * everything else left at its default, because filling in "איך תדע שהצלחת?"
 * while looking at seven other boxes feels like paperwork. Asked on its own,
 * with nothing else on screen, it is a question somebody actually answers —
 * and that answer is what every later "is this going anywhere?" is measured
 * against.
 *
 * So: one question per step, the next button dark until the step is answered,
 * and no way to get to the end without having thought about the middle.
 *
 * A GOAL MUST NOT LAND EMPTY.
 *
 * The moment after "יצירה" is the only moment when somebody is still holding
 * the whole goal in their head, and it is the cheapest moment to turn it into
 * projects and first steps. So the breakdown is offered immediately, from the
 * same code the goal screen's button uses — as a proposal with checkboxes,
 * never as something already written (§110).
 */

import {
  h, replace, qs, dialog, field, chipGroup, switchRow,
} from '../core/dom.js';
import { t } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { formatDuration } from '../core/time.js';
import { GOAL_TYPES } from '../domain/schema.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import {
  goals as goalsService, projects as projectsService, milestones as milestonesService,
} from '../services/structure.js';
import * as ai from '../ai/provider.js';
import { openPreview } from './preview.js';

const STEP_COUNT = 5;

/* ------------------------------------------------------------------ *
 * The breakdown — shared with the goal screen's button
 * ------------------------------------------------------------------ */

/**
 * Turn a preview selection into real records.
 *
 * The item ids carry their position in the proposal (`p0:t3`), so a selection
 * that dropped a whole group still maps back to the right project without the
 * preview having to know anything about goals.
 */
function applyBreakdown(goal, proposed, selection, origin, refresh) {
  const chosen = new Map();

  for (const group of selection) {
    for (const id of group.ids) {
      const parts = /^p(\d+):([mt])(\d+)$/.exec(id);
      if (!parts) continue;
      const index = Number(parts[1]);
      let bucket = chosen.get(index);
      if (!bucket) { bucket = { milestones: [], tasks: [] }; chosen.set(index, bucket); }
      (parts[2] === 'm' ? bucket.milestones : bucket.tasks).push(Number(parts[3]));
    }
  }

  /* The project is not a checkbox of its own: it is the container for whatever
   * survived, so it gets created exactly when something under it did. */
  const actor = origin === 'model' ? 'AI' : 'USER';
  let created = 0;

  for (const [index, bucket] of Array.from(chosen.entries()).sort((a, b) => a[0] - b[0])) {
    const source = proposed[index];
    if (!source) continue;

    const result = projectsService.create({
      title: source.title,
      goalId: goal.id,
      areaId: goal.areaId || null,
      priority: goal.priority,
      dueDate: source.dueDate || goal.targetDate || null,
      _actor: actor,
    });
    if (!result.ok) continue;
    created += 1;

    const projectId = result.project.id;

    for (const i of bucket.milestones) {
      const milestone = (source.milestones || [])[i];
      if (!milestone) continue;
      const done = milestonesService.create({
        projectId,
        title: milestone.title,
        targetDate: milestone.targetDate || null,
      });
      if (done.ok) created += 1;
    }

    for (const i of bucket.tasks) {
      const task = (source.tasks || [])[i];
      if (!task) continue;
      const done = tasksService.create({
        title: task.title,
        projectId,
        goalId: goal.id,
        areaId: goal.areaId || null,
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

/**
 * Ask for a plan, then show it as a proposal.
 *
 * Resolves once the preview is on screen — the caller keeps its button in a
 * pending state until then, because a model call is the one thing here that
 * can take a visible second.
 */
export async function openGoalBreakdown(goal, onRerender) {
  const refresh = onRerender || (() => {});

  let plan = null;
  try {
    plan = await ai.generateGoalPlan(goal);
  } catch (e) {
    plan = null;
  }

  const proposed = (plan && plan.projects) || [];
  /* A failed request still leaves the local proposal, so the only case that
   * reaches here is genuinely having nothing to suggest. */
  if (!proposed.length) { toast(t('goals.breakdownEmpty')); return null; }

  const groups = proposed.map((project, index) => ({
    title: project.title,
    items: (project.milestones || []).map((milestone, i) => ({
      id: `p${index}:m${i}`,
      label: milestone.title,
      note: t('projects.milestone'),
    })).concat((project.tasks || []).map((task, i) => ({
      id: `p${index}:t${i}`,
      label: task.title,
      note: task.estimatedMinutes ? formatDuration(task.estimatedMinutes) : '',
    }))),
  }));

  return openPreview({
    title: t('goals.breakdownTitle'),
    lead: t('goals.breakdownLead'),
    origin: plan.origin,
    groups,
    onApply: (selection) => applyBreakdown(goal, proposed, selection, plan.origin, refresh),
  });
}

/* ------------------------------------------------------------------ *
 * The wizard
 * ------------------------------------------------------------------ */

function draftFrom(defaults) {
  return Object.assign({
    title: '',
    type: 'outcome',
    areaId: null,
    motivation: '',
    targetDate: null,
    noTarget: false,
    successDefinition: '',
    metricTarget: '',
    metricUnit: '',
    priority: 3,
  }, defaults || {});
}

/** A label over something that is not a single focusable control. */
function labelled(label, control) {
  return h('div.field', h('div.field-label', label), control);
}

/**
 * Create a goal, one question at a time.
 * `defaults` seeds the draft — {areaId} from an area screen, {title} from a
 * captured line.
 */
export function openGoalWizard(onRerender, defaults) {
  const refresh = onRerender || (() => {});
  const draft = draftFrom(defaults);

  let step = 0;
  let backButton = null;
  let nextButton = null;

  const pips = h('div.steps', { 'aria-hidden': 'true' },
    Array.from({ length: STEP_COUNT }, () => h('div.step-pip')));
  const counter = h('p.tiny.quiet', { style: { marginBlockEnd: 'var(--sp-4)' } });
  const bodyHost = h('div');

  function valid() {
    switch (step) {
      case 0: return !!draft.title.trim();
      /* An explicit "no target date" is an answer; leaving the step untouched
       * is not, and that distinction is the whole point of the opt-out. */
      case 2: return draft.noTarget || !!draft.targetDate;
      case 3: return draft.type !== 'metric' || Number(draft.metricTarget) > 0;
      default: return true;
    }
  }

  function syncFooter() {
    if (!backButton || !nextButton) return;
    backButton.textContent = step === 0 ? t('common.cancel') : t('common.back');
    nextButton.textContent = step === STEP_COUNT - 1 ? t('common.create') : t('common.next');
    nextButton.disabled = !valid();
  }

  function advance() {
    if (!valid() || step >= STEP_COUNT - 1) return;
    step += 1;
    paint();
  }

  function onEnterNext(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    advance();
  }

  /* ---------------- the steps ---------------- */

  function stepTitle() {
    let showingError = false;

    const errorHost = h('div');
    const input = h('input', {
      type: 'text',
      value: draft.title,
      maxlength: '140',
      placeholder: t('goals.step1Placeholder'),
      'aria-label': t('goals.step1'),
      oninput: (e) => {
        draft.title = e.target.value;
        if (showingError && draft.title.trim()) paintError(false);
        syncFooter();
      },
      /* The error appears on leaving an empty field rather than on every
       * keystroke — nobody needs to be told a box is empty while they are
       * still walking towards it. */
      onblur: () => paintError(!draft.title.trim()),
      onkeydown: onEnterNext,
    });

    function paintError(show) {
      showingError = show;
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
      replace(errorHost, show ? h('p.field-error', { role: 'alert' }, t('errors.required')) : null);
    }

    const snap = snapshot();

    return h('div',
      h('div.field',
        input,
        h('p.field-hint', t('goals.step1Hint')),
        errorHost),

      h('div', { style: { marginBlockStart: 'var(--sp-5)' } },
        labelled(t('goals.type'), chipGroup({
          label: t('goals.type'),
          value: draft.type,
          options: GOAL_TYPES.map((type) => ({
            value: type,
            label: t(`goals.types.${type}`),
            note: t(`goals.typeNotes.${type}`),
          })),
          onChange: (value) => { draft.type = value; },
        }))),

      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, field({
        label: t('areas.one'),
        optional: true,
        control: h('select', {
          onchange: (e) => { draft.areaId = e.target.value || null; },
        },
        h('option', { value: '' }, t('common.unassigned')),
        snap.areas.map((area) => h('option', {
          value: area.id,
          selected: area.id === draft.areaId,
        }, area.title))),
      })));
  }

  function stepMotivation() {
    return h('div.field',
      h('textarea', {
        rows: '3',
        maxlength: '400',
        placeholder: t('goals.step2Placeholder'),
        'aria-label': t('goals.step2'),
        oninput: (e) => { draft.motivation = e.target.value; },
      }, draft.motivation),
      h('p.field-hint', t('goals.step2Hint')));
  }

  function stepTargetDate() {
    const dateHost = h('div.field');

    function paintDate() {
      replace(dateHost,
        h('input', {
          type: 'date',
          value: draft.targetDate || '',
          disabled: draft.noTarget,
          'aria-label': t('goals.step3'),
          onchange: (e) => { draft.targetDate = e.target.value || null; syncFooter(); },
          onkeydown: onEnterNext,
        }),
        h('p.field-hint', t('goals.step3Hint')));
    }
    paintDate();

    return h('div',
      dateHost,
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, switchRow({
        label: t('goals.step3None'),
        checked: draft.noTarget,
        onChange: (value) => {
          draft.noTarget = value;
          if (value) draft.targetDate = null;
          paintDate();
          syncFooter();
        },
      })));
  }

  function stepSuccess() {
    const success = h('div.field',
      h('textarea', {
        rows: '3',
        maxlength: '400',
        placeholder: t('goals.step4Placeholder'),
        'aria-label': t('goals.step4'),
        oninput: (e) => { draft.successDefinition = e.target.value; },
      }, draft.successDefinition),
      h('p.field-hint', t('goals.step4Hint')));

    /* A metric goal answers "how will you know" with a number, so the number
     * is asked for here rather than as a sixth step nobody else would see. */
    if (draft.type !== 'metric') return success;

    return h('div', success,
      h('div.field-row', { style: { marginBlockStart: 'var(--sp-4)' } },
        field({
          label: t('goals.metricTarget'),
          control: h('input', {
            type: 'number',
            min: '1',
            step: '1',
            value: draft.metricTarget,
            oninput: (e) => { draft.metricTarget = e.target.value; syncFooter(); },
            onkeydown: onEnterNext,
          }),
        }),
        field({
          label: t('goals.metricUnit'),
          optional: true,
          control: h('input', {
            type: 'text',
            value: draft.metricUnit,
            maxlength: '24',
            placeholder: t('goals.metricUnitPlaceholder'),
            oninput: (e) => { draft.metricUnit = e.target.value; },
            onkeydown: onEnterNext,
          }),
        })));
  }

  function stepPriority() {
    return h('div',
      chipGroup({
        label: t('goals.step5'),
        value: draft.priority,
        options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`tasks.scale.${n}`) })),
        onChange: (value) => { draft.priority = value; },
      }),
      h('p.field-hint', t('goals.step5Hint')));
  }

  const STEPS = [
    { question: 'goals.step1', build: stepTitle },
    { question: 'goals.step2', build: stepMotivation },
    { question: 'goals.step3', build: stepTargetDate },
    { question: 'goals.step4', build: stepSuccess },
    { question: 'goals.step5', build: stepPriority },
  ];

  /* ---------------- painting ---------------- */

  function paint() {
    const current = STEPS[step];

    Array.from(pips.children).forEach((pip, i) => {
      pip.classList.toggle('step-pip-on', i <= step);
    });
    counter.textContent = t('onboarding.step', { n: step + 1, total: STEP_COUNT });

    replace(bodyHost,
      h('h3', { style: { fontSize: 'var(--t-lg)' } }, t(current.question)),
      h('div', { style: { marginBlockStart: 'var(--sp-4)' } }, current.build()));

    syncFooter();

    /* Focus follows the question. Without this, pressing "הבא" leaves focus on
     * the footer and the step that just appeared is read to nobody. */
    const first = qs('input,textarea,select', bodyHost);
    if (first) first.focus();
  }

  /* ---------------- finishing ---------------- */

  function finish() {
    const isMetric = draft.type === 'metric';
    const result = goalsService.create({
      title: draft.title.trim(),
      areaId: draft.areaId || null,
      type: draft.type,
      priority: draft.priority,
      targetDate: draft.noTarget ? null : draft.targetDate,
      motivation: draft.motivation.trim(),
      successDefinition: draft.successDefinition.trim(),
      progressSource: isMetric ? 'metric' : 'milestones',
      metricTarget: isMetric ? Number(draft.metricTarget) : null,
      metricUnit: isMetric ? draft.metricUnit.trim() : '',
    });

    if (!result.ok) {
      const errors = result.errors || {};
      if (errors.title) { step = 0; paint(); }
      toastError(errors.title ? t('errors.required') : t('errors.generic'));
      return false;
    }

    toast(t('goals.created'), { tone: 'ok' });
    refresh();

    /* Straight into the proposal, while the goal is still a live thought. */
    openGoalBreakdown(result.goal, refresh).catch(() => { /* the goal exists */ });
    return true;
  }

  const dlg = dialog({
    title: t('goals.wizardTitle'),
    wide: true,
    body: [pips, counter, bodyHost],
    actions: [
      {
        label: t('common.cancel'),
        onClick: () => {
          if (step === 0) return true;
          step -= 1;
          paint();
          return false;
        },
      },
      {
        label: t('common.next'),
        kind: 'primary',
        onClick: () => {
          if (step < STEP_COUNT - 1) { advance(); return false; }
          return finish();
        },
      },
    ],
  });

  /* The footer is built by dialog(), so its buttons are reached through the box
   * — they are the one part of this dialog whose label changes per step. */
  const footButtons = dlg.body.parentNode.querySelectorAll('.modal-foot .btn');
  backButton = footButtons[0];
  nextButton = footButtons[1];

  paint();

  return dlg;
}
