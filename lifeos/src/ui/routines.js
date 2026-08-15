/*
 * routines.js — a sequence you stop deciding about.
 *
 * A routine is not a project and not a checklist of tasks. Its whole value is
 * that once it is written down you never again spend attention on what comes
 * next, so the two things this screen owes a person are: the steps in order,
 * and a way to be walked through them without holding the list in your head.
 *
 * THE RUNNER SHOWS ONE STEP.
 *
 * Showing all six with checkboxes would be easier to build and would defeat the
 * point — reading a list is the work the routine was supposed to remove. One
 * step, its length, and the way forward. Optional steps get a skip button
 * because a routine you can only complete perfectly is a routine you abandon in
 * the first bad week, and a skip is recorded as a skip rather than a failure.
 *
 * WHAT GETS RECORDED IS WHAT HAPPENED.
 *
 * A finished run stores the wall-clock time it actually took, not the sum of
 * the minutes typed into the editor. That is the only way the estimate in the
 * editor ever gets corrected, and it means routine time lands in the same
 * focus-session history as everything else rather than in a private counter.
 */

import {
  h, replace, qs, qsa, dialog, field, confirmDestructive, popupMenu,
  emptyState, clockText,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { formatDuration, formatTime, parseTimeInput } from '../core/time.js';
import { routines as routinesService } from '../services/rituals.js';
import { pageHeader, durationChip } from './components.js';

let rerender = () => {};

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'max': return t('errors.tooLong', { n: err.max });
    case 'type': return t('errors.invalidNumber');
    default: return t('errors.generic');
  }
}

/* ------------------------------------------------------------------ *
 * The runner
 * ------------------------------------------------------------------ */

function openRunner(routine) {
  const steps = routine.steps || [];
  if (!steps.length) return;

  const startedAt = Date.now();
  let index = 0;
  let skipped = 0;
  let dlg = null;
  const body = h('div');

  function finish() {
    const minutes = Math.round((Date.now() - startedAt) / 60000);
    routinesService.recordRun(routine.id, { minutes, skippedCount: skipped, startedAt });
    toast(t('routines.finished'), { tone: 'ok' });
    if (dlg) dlg.close();
    rerender();
  }

  function advance(wasSkipped) {
    if (wasSkipped) skipped += 1;
    if (index >= steps.length - 1) { finish(); return; }
    index += 1;
    paint();
  }

  function paint() {
    const step = steps[index];
    const last = index === steps.length - 1;

    replace(body,
      h('div.steps', { role: 'presentation' },
        steps.map((unused, i) => h('div.step-pip', { class: i <= index ? 'step-pip-on' : null }))),
      h('div.eyebrow', t('routines.stepOf', { n: index + 1, total: steps.length })),
      h('h3', { style: { marginBlockStart: '8px' } }, step.title),
      h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
        durationChip(step.minutes),
        step.optional ? h('span.chip', t('routines.stepOptional')) : null),

      h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-6)' } },
        last ? null : h('button.btn.btn-primary', {
          type: 'button',
          onclick: () => advance(false),
        }, t('routines.nextStep'), icon('next', { size: 16 })),
        /* Only where skipping is something the routine already said was fine —
         * offering it everywhere turns every step into a negotiation. */
        step.optional
          ? h('button.btn.btn-secondary', {
            type: 'button',
            onclick: () => advance(true),
          }, t('routines.skipStep'))
          : null,
        h('button.btn', {
          class: last ? 'btn-primary' : 'btn-ghost',
          type: 'button',
          onclick: finish,
        }, icon('check', { size: 16 }), t('routines.finish'))));
  }

  paint();

  dlg = dialog({
    title: routine.title,
    note: t('routines.running'),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

function routineMenu(routine, anchor) {
  popupMenu(anchor, [
    { label: t('common.edit'), icon: 'edit', onClick: () => openRoutineEditor(routine.id) },
    { separator: true },
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => removeRoutine(routine) },
  ]);
}

function routineCard(routine) {
  const steps = routine.steps || [];

  return h('div.card.card-pad',
    h('div.row-between',
      h('div.grow.ellipsis',
        h('h4.ellipsis', routine.title),
        h('div.row.wrap-flex', { style: { marginBlockStart: '8px' } },
          h('span.chip', icon('clock', { size: 12 }),
            t('routines.totalTime', { time: formatDuration(routinesService.totalMinutes(routine)) })),
          routine.preferredTime === null || routine.preferredTime === undefined
            ? null
            : h('span.chip', icon('calendar', { size: 12 }),
              clockText(formatTime(routine.preferredTime))))),
      h('div.row.shrink0',
        /* No steps, no runner — a button that opens an empty walkthrough is
         * worse than no button. */
        steps.length
          ? h('button.btn.btn-sm.btn-secondary', {
            type: 'button',
            onclick: () => openRunner(routine),
          }, icon('play', { size: 14 }), t('routines.run'))
          : null,
        h('button.btn-icon', {
          type: 'button',
          'aria-label': t('common.actions'),
          onclick: (e) => routineMenu(routine, e.currentTarget),
        }, icon('more')))),

    steps.length
      ? h('ol', {
        style: { marginBlockStart: 'var(--sp-4)', listStyle: 'none', paddingInlineStart: '0' },
      }, steps.map((step, i) => h('li.row', { style: { marginBlockStart: i ? '8px' : '0' } },
        h('span.tiny.quiet.num.shrink0', { style: { width: '20px' } }, String(i + 1)),
        h('span.grow.ellipsis', step.title),
        step.optional ? h('span.chip.shrink0', t('routines.stepOptional')) : null,
        step.minutes
          ? h('span.tiny.quiet.shrink0', formatDuration(step.minutes))
          : null)))
      : h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => openRoutineEditor(routine.id),
        }, icon('plus', { size: 14 }), t('routines.stepAdd'))));
}

/* ------------------------------------------------------------------ *
 * The routine form
 * ------------------------------------------------------------------ */

function openRoutineEditor(routineId) {
  const existing = routineId ? routinesService.byId(routineId) : null;
  if (routineId && !existing) { toastError(t('errors.notFound')); return null; }

  const form = {
    title: existing ? existing.title : '',
    preferredTime: existing ? existing.preferredTime : null,
    steps: existing
      ? (existing.steps || []).map((s) => ({
        id: s.id, title: s.title, minutes: s.minutes, optional: !!s.optional,
      }))
      : [],
  };
  let errors = {};

  const gap = { style: { marginBlockStart: 'var(--sp-4)' } };
  const titleHost = h('div');
  const stepsHost = h('div');
  const totalNode = h('span.section-note');

  function updateTotal() {
    const sum = form.steps.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
    totalNode.textContent = t('routines.totalTime', { time: formatDuration(sum) });
  }

  function paintTitle() {
    replace(titleHost, field({
      label: t('routines.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '100',
        placeholder: t('routines.titlePlaceholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }

  function move(from, to, direction) {
    if (to < 0 || to >= form.steps.length) return;
    const [item] = form.steps.splice(from, 1);
    form.steps.splice(to, 0, item);
    paintSteps(`${to}-${direction}`);
  }

  function paintSteps(focusKey) {
    replace(stepsHost, form.steps.map((step, i) => h('div.row', {
      style: { marginBlockStart: i ? '8px' : '0' },
    },
    h('input.grow', {
      type: 'text',
      value: step.title,
      maxlength: '120',
      placeholder: t('routines.stepPlaceholder'),
      'aria-label': t('routines.stepPlaceholder'),
      oninput: (e) => { step.title = e.target.value; },
    }),
    h('input.shrink0', {
      type: 'number',
      min: '0',
      max: '240',
      step: '5',
      value: String(step.minutes),
      'aria-label': t('routines.stepMinutes'),
      style: { width: '78px' },
      oninput: (e) => {
        step.minutes = Number(e.target.value) || 0;
        updateTotal();
      },
    }),
    h('button.chip.chip-select.shrink0', {
      type: 'button',
      'aria-pressed': step.optional ? 'true' : 'false',
      onclick: (e) => {
        step.optional = !step.optional;
        e.currentTarget.setAttribute('aria-pressed', step.optional ? 'true' : 'false');
      },
    }, t('routines.stepOptional')),
    /* chevronUp/chevronDown rather than the mirroring arrows: the list runs
     * down the page in every writing direction, and an arrow that flipped with
     * the text would point at the wrong neighbour. */
    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('routines.stepUp'),
      disabled: i === 0,
      data: { focus: `${i}-up` },
      onclick: () => move(i, i - 1, 'up'),
    }, icon('chevronUp', { size: 16 })),
    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('routines.stepDown'),
      disabled: i === form.steps.length - 1,
      data: { focus: `${i}-down` },
      onclick: () => move(i, i + 1, 'down'),
    }, icon('chevronDown', { size: 16 })),
    h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('common.remove'),
      onclick: () => { form.steps.splice(i, 1); paintSteps(); updateTotal(); },
    }, icon('trash', { size: 16 })))));

    updateTotal();

    /* Reordering rebuilds every row, so somebody moving a step with the
     * keyboard would otherwise be dropped back at the top of the dialog. When
     * the step lands at an end its own button is disabled, and focus goes to
     * the one still able to move it. */
    if (!focusKey) return;
    const target = qs(`[data-focus="${focusKey}"]`, stepsHost);
    if (!target) return;
    const landing = target.disabled
      ? (focusKey.endsWith('-up') ? target.nextElementSibling : target.previousElementSibling)
      : target;
    if (landing && !landing.disabled) landing.focus();
  }

  function addStep() {
    form.steps.push({ title: '', minutes: 5, optional: false });
    paintSteps();
    const inputs = qsa('input[type="text"]', stepsHost);
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  paintTitle();
  paintSteps();

  function save() {
    /* A row left blank is a row somebody added and thought better of. Dropping
     * it is friendlier than refusing to save the whole routine over it. */
    const kept = form.steps.filter((s) => s.title.trim().length > 0);

    const steps = kept.map((s) => {
      const step = {
        title: s.title.trim(),
        minutes: Number(s.minutes) || 0,
        optional: !!s.optional,
      };
      /* The service fills in an id for a step that has none, and it does so
       * with Object.assign — so an absent id has to stay absent rather than be
       * present and undefined, which would overwrite the generated one. */
      if (s.id) step.id = s.id;
      return step;
    });

    const payload = { title: form.title.trim(), preferredTime: form.preferredTime, steps };
    const result = existing
      ? routinesService.update(existing.id, payload)
      : routinesService.create(payload);

    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      /* The title is the only field with an inline message, so a complaint
       * about anything else is said out loud rather than swallowed. */
      const other = errors[''] || Object.keys(errors).filter((k) => k !== 'title').map((k) => errors[k])[0];
      if (other) toastError(errorText(other));
      return false;
    }
    toast(t(existing ? 'routines.updated' : 'routines.created'), { tone: 'ok' });
    rerender();
    return true;
  }

  return dialog({
    title: t(existing ? 'routines.editRoutine' : 'routines.newRoutine'),
    wide: true,
    initialFocus: 'input',
    body: [
      titleHost,
      h('div', gap, field({
        label: t('routines.preferredTime'),
        optional: true,
        control: h('input', {
          type: 'time',
          value: form.preferredTime === null || form.preferredTime === undefined
            ? '' : formatTime(form.preferredTime),
          onchange: (e) => {
            form.preferredTime = e.target.value ? parseTimeInput(e.target.value) : null;
          },
        }),
      })),
      h('div', gap,
        h('div.section-head', h('div.field-label', t('routines.steps')), totalNode),
        stepsHost,
        h('div', { style: { marginBlockStart: '12px' } },
          h('button.btn.btn-sm.btn-secondary', {
            type: 'button',
            onclick: addStep,
          }, icon('plus', { size: 14 }), t('routines.stepAdd')))),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t(existing ? 'common.save' : 'common.create'), kind: 'primary', onClick: save },
    ],
  });
}

async function removeRoutine(routine) {
  const yes = await confirmDestructive({ title: t('confirm.deleteRoutineTitle') });
  if (!yes) return;
  routinesService.remove(routine.id);
  toast(t('routines.deleted'));
  rerender();
}

/**
 * The starter.
 *
 * The hardest routine to write is the first one, because nobody has an opinion
 * about step lengths until they have run one. This creates a real, editable
 * routine from the catalogue's three evening steps and leaves the minutes to
 * the schema's default rather than inventing numbers for somebody's evening.
 */
function addEveningPreset() {
  /* The catalogue holds these as an array of three; t() resolves an index like
   * any other path, and asking for a fourth would register a missing string in
   * the Hebrew audit. */
  const titles = [0, 1, 2].map((i) => t(`routines.presetEveningSteps.${i}`));

  const result = routinesService.create({
    title: t('routines.presetEvening'),
    steps: titles.map((title) => ({ title })),
  });
  if (!result.ok) { toastError(t('errors.generic')); return; }
  toast(t('routines.created'), { tone: 'ok' });
  rerender();
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderRoutines(onRerender) {
  rerender = onRerender;

  const list = routinesService.all();

  const container = h('div', pageHeader(t('routines.title'), {
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openRoutineEditor(null),
      }, icon('plus', { size: 16 }), t('routines.newRoutine')),
    ],
  }));

  if (!list.length) {
    container.appendChild(emptyState({
      icon: 'routine',
      title: t('routines.emptyTitle'),
      note: t('routines.emptyNote'),
      action: { label: t('routines.newRoutine'), onClick: () => openRoutineEditor(null) },
    }));
    container.appendChild(h('div.row', {
      style: { justifyContent: 'center', marginBlockStart: 'var(--sp-4)' },
    },
    h('button.btn.btn-sm.btn-ghost', {
      type: 'button',
      onclick: addEveningPreset,
    }, icon('plus', { size: 14 }), t('routines.presetAdd'))));
    return container;
  }

  container.appendChild(h('div.stack', list.map((routine) => routineCard(routine))));

  return container;
}
