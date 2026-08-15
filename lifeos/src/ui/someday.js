/*
 * someday.js — the list that is deliberately not in the way.
 *
 * Everything here was a real intention once, which is why it was not deleted,
 * and none of it is happening now, which is why it does not appear on Today, in
 * the plan, or in any count of open work. That exclusion is the whole feature:
 * a "someday" list that leaks into the active lists is just a backlog with a
 * softer name, and the reason people stop trusting the active lists.
 *
 * So there is exactly one action that matters here, and it is the one that
 * moves an item back across that line.
 */

import { h, emptyState, confirmDestructive } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo } from '../core/toast.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import { pageHeader, taskRow, taskMenu } from './components.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';
import { startFocusFor } from './focus.js';

let rerender = () => {};

function activate(task) {
  tasksService.activateFromSomeday(task.id);
  toastUndo(t('someday.activated'), () => {
    tasksService.markSomeday(task.id);
    rerender();
  });
  rerender();
}

function menu(anchor, task) {
  return taskMenu(anchor, task, {
    onEdit: (x) => openTaskEditor(x.id, rerender),
    onFocus: (x) => startFocusFor(x.id),
    onTomorrow: (x) => {
      /* Scheduling a parked item is also a decision to un-park it — leaving it
       * on 'someday' would put a task on tomorrow that no list will show. */
      tasksService.activateFromSomeday(x.id);
      tasksService.moveToTomorrow(x.id);
      toast(t('tasks.movedTo', { date: t('time.tomorrow') }));
      rerender();
    },
    onUnschedule: (x) => { tasksService.unschedule(x.id); rerender(); },
    onSplit: (x) => openSplitDialog(x.id, rerender),
    onSomeday: (x) => { tasksService.markSomeday(x.id); rerender(); },
    onActivate: (x) => activate(x),
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
}

function somedayRow(task, snap) {
  const row = taskRow(tasksService.decorate(task, snap), {
    actions: false,
    showArea: true,
    onToggle(x, next) {
      tasksService.setComplete(x.id, next);
      if (next) {
        toastUndo(t('tasks.completed'), () => {
          tasksService.setComplete(x.id, false);
          rerender();
        });
      }
      rerender();
    },
    onOpen(x) { openTaskEditor(x.id, rerender); },
  });

  row.appendChild(h('button.btn.btn-sm.btn-secondary.shrink0', {
    type: 'button',
    onclick: () => activate(task),
  }, icon('play', { size: 13 }), t('someday.activate')));

  row.appendChild(h('button.btn-icon.shrink0', {
    type: 'button',
    'aria-label': t('common.actions'),
    onclick: (e) => menu(e.currentTarget, task),
  }, icon('more')));

  return row;
}

export function renderSomeday(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  /* Oldest first: something parked eleven months ago is the item most worth a
   * decision, and sorting by recency would bury it under this week's ideas. */
  const list = tasksService.someday().slice().sort((a, b) => a.createdAt - b.createdAt);

  const container = h('div', pageHeader(t('someday.title'), {
    subtitle: t('someday.lead'),
    actions: list.length ? [h('span.chip', plural('count.tasks', list.length))] : null,
  }));

  if (!list.length) {
    container.appendChild(emptyState({
      icon: 'someday',
      title: t('someday.emptyTitle'),
      note: t('someday.emptyNote'),
    }));
    return container;
  }

  container.appendChild(h('div.card.card-flat', { style: { overflow: 'hidden' } },
    list.map((task) => somedayRow(task, snap))));

  return container;
}
