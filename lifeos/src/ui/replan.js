/*
 * replan.js — "the day stopped matching the plan. Here is what I would change."
 *
 * The screen is a rendering of what previewReplan() returned, and nothing more.
 * The engine already produced a diff with a before and an after on every entry
 * and a `selected` flag on each one, so this file toggles booleans on that
 * value and hands the same object back to applyReplan(). No second opinion is
 * formed here — a preview that computes its own version of the change list is a
 * preview that can disagree with what the button does.
 *
 * TWO LISTS, NOT ONE.
 *
 * What would move comes first, ticked, because that is the decision. What was
 * left alone comes second and quiet — the fixed events, the blocks already in
 * progress, the work a deadline pinned in place. A planner that shows only its
 * own changes is asking to be trusted about the things it does not mention; a
 * person about to press "apply" wants to see the 18:00 lesson still sitting
 * there before they do.
 */

import { h, dialog, replace } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo } from '../core/toast.js';
import { formatTimeRange, formatDuration } from '../core/time.js';
import { explainChange } from '../engine/explain.js';
import { snapshot } from '../services/core.js';
import * as planning from '../services/planning.js';

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

/**
 * One proposed change, as a checkbox.
 *
 * The whole row is the control rather than a box beside a sentence: on a phone
 * the sentence is the part big enough to hit, and two controls that do the same
 * thing are two things for a screen reader to read out.
 */
function changeRow(change, onToggle) {
  const row = h('button.trow', {
    type: 'button',
    role: 'checkbox',
    onclick: () => { change.selected = !change.selected; paint(); onToggle(); },
  });

  function paint() {
    row.setAttribute('aria-checked', change.selected ? 'true' : 'false');
    replace(row,
      h('span.tcheck', {
        'aria-hidden': 'true',
        'aria-checked': change.selected ? 'true' : 'false',
      }, icon('check', { weight: 3 })),
      h('div.trow-body', h('div.trow-title', explainChange(change))));
  }

  paint();
  return row;
}

/**
 * A change the planner wanted to make and a deadline forbade.
 *
 * No checkbox. applyReplan() skips these however they are flagged, so a box
 * here would be a control that reports having done something it did not. It is
 * on screen because "why is this still at 16:00" is exactly the question the
 * preview exists to answer.
 */
function keptRow(change) {
  return h('div.trow',
    h('span.shrink0', { style: { marginBlockStart: '2px', color: 'var(--ink-3)' } },
      icon('lock', { size: 15 })),
    h('div.grow',
      h('div.trow-title', explainChange(change))));
}

/** Something the replan did not touch: a fixed event, or a block already under way. */
function untouchedRow(entry, snap) {
  const task = entry.taskId ? snap.tasksById.get(entry.taskId) : null;
  const title = entry.title || (task ? task.title : t('common.untitled'));

  return h('div.trow',
    h('div.shrink0.num', {
      style: { inlineSize: '92px', color: 'var(--ink-3)', fontSize: 'var(--t-xs)' },
    }, entry.allDay ? t('calendar.allDay') : formatTimeRange(entry.startMinutes, entry.endMinutes)),
    h('div.grow.ellipsis',
      h('div.trow-title.ellipsis', title)),
    /* Events carry no `kind` — and an event is fixed by definition, which is
     * the honest label for it here. */
    h('span.chip.shrink0', icon('lock', { size: 12 }),
      t(`calendar.blockKinds.${entry.kind || 'fixed'}`)));
}

/* ------------------------------------------------------------------ *
 * The dialog
 * ------------------------------------------------------------------ */

export function openReplanPreview(dayIso, rerender) {
  const refresh = rerender || (() => {});
  const result = planning.previewReplan(dayIso);

  if (result.nothingToDo) {
    /* "Nothing to move" and "the day is still over-full" are both true at once
     * whenever a deadline pinned the thing that does not fit. Saying only the
     * first would be the app calling a plan reasonable while the numbers on the
     * same screen say it is not. */
    return dialog({
      title: t('planning.replanTitle'),
      body: [
        h('p.muted', t('planning.replanNothing')),
        result.summary.overloadMinutes > 0
          ? h('div.notice.notice-warn', { style: { marginBlockStart: 'var(--sp-4)' } },
            t('planning.overloadBy', { time: formatDuration(result.summary.overloadMinutes) }))
          : null,
      ],
      actions: [{ label: t('common.close'), kind: 'primary' }],
    });
  }

  const snap = snapshot();
  const changes = result.changes.filter((c) => !c.keptForDeadline);
  const kept = result.changes.filter((c) => c.keptForDeadline);
  const countHost = h('div.tiny.quiet', { style: { marginBlockStart: 'var(--sp-4)' } });
  let applyButton = null;

  function selectedCount() {
    return changes.filter((c) => c.selected).length;
  }

  function sync() {
    const n = selectedCount();
    /* Bare digits on the partial case: "2 מתוך 4" is what a person says, and
     * "2 מתוך 4 שינויים" pairs a numeral with a noun that already agreed with
     * a different number. */
    replace(countHost, n === 0
      ? t('planning.previewNone')
      : n === changes.length
        ? plural('count.changes', n)
        : `${n} ${t('common.of')} ${changes.length}`);
    if (applyButton) applyButton.disabled = n === 0;
  }

  const allHost = h('div.shrink0');
  const rows = changes.map((change) => changeRow(change, () => { sync(); paintAll(); }));

  function paintAll() {
    const all = changes.every((c) => c.selected);
    replace(allHost, h('button.btn.btn-sm.btn-ghost', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': all ? 'true' : 'false',
      onclick: () => {
        for (const change of changes) change.selected = !all;
        /* The rows own their own paint, so rebuilding them is the cheapest way
         * to get every checkbox back in step with the data. */
        replace(list, changes.map((change) => changeRow(change, () => { sync(); paintAll(); })));
        paintAll();
        sync();
      },
    }, icon(all ? 'check' : 'plus', { size: 14 }), t('planning.previewSelectAll')));
  }

  const list = h('div.card.card-flat', { style: { overflow: 'hidden' } }, rows);
  paintAll();

  const dlg = dialog({
    title: t('planning.replanTitle'),
    note: t('planning.replanFound', { changes: plural('count.changes', changes.length) }),
    wide: true,
    body: [
      result.summary.overloadMinutes > 0
        ? h('div.notice.notice-warn',
          t('planning.overloadBy', { time: formatDuration(result.summary.overloadMinutes) }))
        : null,

      h('section.section',
        h('div.section-head',
          h('h3.section-title', t('planning.previewTitle')),
          allHost),
        list),

      kept.length
        ? h('section.section',
          h('div.section-head', h('h3.section-title', t('planning.replanKept'))),
          h('div.card.card-sunk', { style: { overflow: 'hidden' } }, kept.map(keptRow)))
        : null,

      result.fixed.length
        ? h('section.section',
          h('div.section-head', h('h3.section-title', t('planning.fixedUnchanged'))),
          h('div.card.card-sunk', { style: { overflow: 'hidden' } },
            result.fixed
              .slice()
              /* An all-day event has a start time in the record that means
               * nothing; sorting it by that number drops it into the middle of
               * the afternoon. */
              .sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0)
                || a.startMinutes - b.startMinutes)
              .map((entry) => untouchedRow(entry, snap))))
        : null,

      countHost,
    ],
    actions: [
      { label: t('common.cancel') },
      {
        label: t('planning.replanApply'),
        kind: 'primary',
        onClick: () => {
          if (!selectedCount()) return false;
          const applied = planning.applyReplan(result);
          /* The undo token is captured by applyReplan before it writes, so the
           * toast can put the day back exactly as it was rather than as it
           * looks by the time somebody reaches for the button. */
          toastUndo(t('planning.replanApplied'), () => {
            planning.undoReplan(applied.undo);
            toast(t('planning.replanReverted'));
            refresh();
          });
          refresh();
          return true;
        },
      },
    ],
  });

  applyButton = dlg.body.parentNode.querySelector('.modal-foot .btn-primary');
  sync();

  return dlg;
}
