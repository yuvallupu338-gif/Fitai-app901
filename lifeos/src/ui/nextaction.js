/*
 * nextaction.js — the answer to "מה כדאי לי לעשות עכשיו".
 *
 * One task. Not a shortlist, not a filtered view of the backlog — a person who
 * opens this has already decided they do not want to choose, and handing them
 * three options hands the decision straight back.
 *
 * BOUNDED BY THE WINDOW, NOT BY THE DAY.
 *
 * The suggestion comes from the engine, which will not propose ninety minutes
 * of work when the next fixed thing is in twenty. That is why the failure modes
 * here are specific rather than an empty state: "there is no window right now"
 * and "there is a window and nothing fits in it" are different problems with
 * different answers, and the second one names how much too long the nearest
 * task is so the person can shorten it instead of shrugging.
 *
 * ENERGY IS ASKED, NEVER INFERRED.
 *
 * The chips at the top are a question, and the planner only narrows on the
 * honest end of it: asking for the low-energy list drops the work that needs
 * concentration. The other two recompute and may well return the same task,
 * which is the truthful outcome — nothing about a click rate tells this app how
 * anybody feels.
 *
 * The local sentence is painted first and a model, if there is one, replaces
 * only that sentence afterwards. The task, the time and the buttons never
 * change underneath a reader's hand.
 */

import { h, dialog, replace, chipGroup } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toastError, toastUndo, toast } from '../core/toast.js';
import { href } from '../core/router.js';
import { formatDuration, formatTimeRange } from '../core/time.js';
import { explainNextAction, explainReasons } from '../engine/explain.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import * as planning from '../services/planning.js';
import * as ai from '../ai/provider.js';
import { taskRow, whyBlock, dueChip, durationChip } from './components.js';
import { openTaskEditor } from './taskeditor.js';
import { startFocusFor } from './focus.js';

const ENERGIES = [
  { value: 'light', label: 'ai.lowEnergy', note: 'ai.lowEnergyNote' },
  { value: 'normal', label: 'ai.normalEnergy', note: null },
  { value: 'deep', label: 'ai.highEnergy', note: null },
];

export function openNextAction(rerender) {
  const refresh = rerender || (() => {});

  let energy = 'normal';
  /* Bumped on every repaint. A model reply that arrives after the energy chips
   * moved is an answer to a question nobody is asking any more. */
  let generation = 0;

  const bodyHost = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });

  const dlg = dialog({
    title: t('today.whatNow'),
    wide: true,
    body: [
      chipGroup({
        label: t('tasks.energy'),
        value: energy,
        options: ENERGIES.map((e) => ({
          value: e.value,
          label: t(e.label),
          note: e.note ? t(e.note) : null,
        })),
        onChange: (value) => { energy = value; paint(); },
      }),
      bodyHost,
    ],
    actions: [{ label: t('common.dismiss') }],
  });

  /* ---------------------------------------------------------------- *
   * Handlers shared by every task this dialog can put on screen
   * ---------------------------------------------------------------- */

  function focusOn(taskId) {
    dlg.close();
    startFocusFor(taskId);
  }

  function open(taskId) {
    /* Closed first: a task editor stacked on top of this dialog is two focus
     * traps arguing over the same Escape key. */
    dlg.close();
    openTaskEditor(taskId, refresh);
  }

  function complete(task, next) {
    const result = tasksService.setComplete(task.id, next);
    if (!result.ok && result.code === 'blocked') {
      toastError(t('tasks.blockedCannotComplete'));
      return;
    }
    if (next && !result.recurred) {
      toastUndo(t('tasks.completed'), () => {
        tasksService.setComplete(task.id, false);
        refresh();
        paint();
      });
    } else if (next) {
      toast(t('tasks.completed'), { tone: 'ok' });
    }
    refresh();
    paint();
  }

  function rowsFor(tasks, snap) {
    return tasks.map((task) => taskRow(tasksService.decorate(task, snap), {
      onToggle: complete,
      onOpen: (x) => open(x.id),
      onBlocked: (x, blockers) => toastError(
        `${t('tasks.blockedBy')}: ${blockers.map((b) => b.title).join(', ')}`,
      ),
      showEstimate: true,
      showEnergy: true,
      /* No kebab menu inside a modal — the popup escapes the dialog's focus
       * trap, and everything in it is one screen away through the editor. */
      actions: false,
    }));
  }

  /* ---------------------------------------------------------------- *
   * The two shapes of answer
   * ---------------------------------------------------------------- */

  function suggestionCard(suggestion, snap, token) {
    const task = suggestion.task;
    const decorated = tasksService.decorate(task, snap);

    const whyHost = h('div', whyBlock(explainNextAction(suggestion), { origin: 'rules' }));

    if (ai.status().usable) {
      ai.suggestNextAction({ energy }).then((improved) => {
        if (token !== generation || !whyHost.isConnected) return;
        if (!improved || improved.origin !== 'model' || !improved.sentence) return;
        if (!improved.task || improved.task.id !== task.id) return;
        replace(whyHost, whyBlock(improved.sentence, { origin: 'model' }));
      }).catch(() => { /* the local sentence is already on screen */ });
    }

    return h('div.card-hero.card-pad-lg',
      h('div.eyebrow', t('today.whatNowTitle')),
      h('h2', { style: { marginBlockStart: '8px', fontSize: 'var(--t-xl)' } }, task.title),

      h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
        h('span.chip.chip-accent', icon('clock', { size: 12 }),
          formatDuration(suggestion.suggestedMinutes)),
        h('span.chip', icon('calendar', { size: 12 }),
          formatTimeRange(suggestion.window.start, suggestion.window.end)),
        decorated.project
          ? h('a.chip', { href: href(`/projects/${decorated.project.id}`) },
            icon('project', { size: 12 }), decorated.project.title)
          : null,
        dueChip(task.dueDate)),

      whyHost,

      h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-5)' } },
        h('button.btn.btn-primary', {
          type: 'button',
          onclick: () => focusOn(task.id),
        }, icon('play', { size: 16 }), t('today.startFocus')),
        h('button.btn.btn-secondary', {
          type: 'button',
          onclick: () => open(task.id),
        }, t('common.details'))));
  }

  /** The runner-up, deliberately quieter — it is context, not a second decision. */
  function alternativeCard(alternative) {
    const task = alternative.task;
    const why = explainReasons(alternative.reasons);
    return h('div.card.card-sunk.card-pad', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('div.eyebrow', t('today.whatNowAlt')),
      h('div.row-between', { style: { marginBlockStart: '8px' } },
        h('div.grow.ellipsis',
          h('div.trow-title.ellipsis', task.title),
          h('div.trow-meta',
            durationChip(task.estimatedMinutes),
            dueChip(task.dueDate)),
          why ? h('p.tiny.quiet', { style: { marginBlockStart: '6px' } }, why) : null),
        h('button.btn.btn-sm.btn-secondary.shrink0', {
          type: 'button',
          onclick: () => focusOn(task.id),
        }, icon('play', { size: 13 }), t('today.startFocus'))));
  }

  function noSuggestion(suggestion, snap) {
    const noWindow = suggestion.code === 'noWindow';

    const head = noWindow
      ? h('div.card.card-pad',
        h('h3', t('today.whatNowNoTime')),
        suggestion.outsideHours
          ? h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
            t('planning.outsideWorkHours'))
          : null)
      : h('div.card.card-pad',
        h('h3', t('today.whatNowNothing')),
        h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } },
          h('span.chip', icon('clock', { size: 12 }),
            formatDuration(suggestion.availableMinutes)),
          h('span.chip', icon('calendar', { size: 12 }),
            formatTimeRange(suggestion.window.start, suggestion.window.end))),
        h('p.tiny.quiet', { style: { marginBlockStart: '10px' } },
          t('today.whatNowNothingNote')),
        /* Naming the gap is what turns this from a dead end into something to
         * do: shorten that task, or split it. */
        suggestion.shortfall > 0 && suggestion.nearest
          ? h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
            t('today.whatNowShortfall', {
              title: suggestion.nearest.title,
              time: formatDuration(suggestion.shortfall),
            }))
          : null);

    const listHost = h('div');
    const actions = h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } });

    if (suggestion.alternatives && suggestion.alternatives.length) {
      /* Folded away rather than shown: the honest answer was "nothing fits",
       * and putting the list underneath it immediately would contradict that
       * before anyone has read it. */
      const anyway = h('button.btn.btn-secondary', {
        type: 'button',
        onclick: () => {
          replace(listHost,
            h('section.section',
              h('div.section-head', h('h3.section-title', t('ai.suggestions'))),
              h('div.card.card-flat', { style: { overflow: 'hidden' } },
                rowsFor(suggestion.alternatives, snap))));
          anyway.remove();
        },
      }, t('today.whatNowAnyway'));
      actions.appendChild(anyway);
    }

    actions.appendChild(h('button.btn.btn-ghost', {
      type: 'button',
      onclick: () => open(null),
    }, icon('plus', { size: 16 }), t('tasks.addTask')));

    return [head, actions, listHost];
  }

  function paint() {
    generation += 1;
    const token = generation;
    const snap = snapshot();
    const suggestion = planning.nextAction({ energy });

    replace(bodyHost, suggestion.ok
      ? [
        suggestionCard(suggestion, snap, token),
        suggestion.alternative ? alternativeCard(suggestion.alternative) : null,
      ]
      : noSuggestion(suggestion, snap));
  }

  paint();
  return dlg;
}
