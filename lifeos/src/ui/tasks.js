/*
 * tasks.js — everything, on purpose.
 *
 * Today answers "what am I doing now" and refuses to show more than a dozen
 * rows. This screen is the other half of that bargain: the place where all
 * forty open tasks are visible at once, because a person who cannot see the
 * whole list stops trusting the short one.
 *
 * A list that long is only usable if it can be cut, so the toolbar is the
 * screen: a filter that decides what is in, a grouping that decides what the
 * headings are, and a sort that decides the order inside them. Three
 * independent choices rather than a dozen preset "views", because the useful
 * combination is always the one nobody thought to name.
 *
 * THE TOOLBAR STATE LIVES IN THIS MODULE, NOT IN THE URL.
 *
 * It survives a rerender — completing a task must not throw somebody back to
 * "all tasks, ungrouped" — and it does not survive a link. A URL is a promise
 * that what you send is what the other person sees, and there is nobody else
 * here: this is a single-device app with one account. Putting a transient view
 * choice in the address bar would fill the back button with states nobody
 * navigated to, which is the actual cost.
 */

import {
  h, qsa, emptyState, dialog, field, sectionHead, announce, confirmDestructive,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastUndo, toastError } from '../core/toast.js';
import {
  today as todayIso, startOfWeek, endOfWeek, relativeDay, isValidIso,
} from '../core/time.js';
import { stuckTasks } from '../engine/learn.js';
import { priorityBand } from '../engine/priority.js';
import { snapshot } from '../services/core.js';
import * as tasksService from '../services/tasks.js';
import { pageHeader, taskRow, taskMenu } from './components.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';
import { startFocusFor } from './focus.js';

const FILTERS = ['all', 'today', 'week', 'overdue', 'unscheduled', 'blocked', 'done'];

const FILTER_LABEL = {
  all: 'tasks.filterAll',
  today: 'tasks.filterToday',
  week: 'tasks.filterWeek',
  overdue: 'tasks.filterOverdue',
  unscheduled: 'tasks.filterUnscheduled',
  blocked: 'tasks.filterBlocked',
  done: 'tasks.filterDone',
};

const GROUPS = [
  { value: 'project', label: 'tasks.groupProject' },
  { value: 'area', label: 'tasks.groupArea' },
  { value: 'due', label: 'tasks.groupDue' },
  { value: 'priority', label: 'tasks.groupPriority' },
  { value: 'none', label: 'tasks.groupNone' },
];

const SORTS = [
  { value: 'priority', label: 'tasks.sortPriority' },
  { value: 'due', label: 'tasks.sortDue' },
  { value: 'created', label: 'tasks.sortCreated' },
  { value: 'title', label: 'tasks.sortTitle' },
];

const DUE_BUCKETS = ['overdue', 'today', 'week', 'later', 'none'];

const DUE_BUCKET_LABEL = {
  overdue: 'tasks.filterOverdue',
  today: 'time.today',
  week: 'time.thisWeek',
  later: 'tasks.groupLater',
  none: 'tasks.groupNoDue',
};

const BAND_LABEL = { high: 'tasks.bandHigh', medium: 'tasks.bandMedium', low: 'tasks.bandLow' };

const view = { filter: 'all', group: 'none', sort: 'priority', query: '' };

/* Notices a person has already answered with "leave it". Session-scoped on
 * purpose: the postponement count is a fact and does not get rewritten just
 * because somebody dismissed a card once. */
const dismissedStuck = new Set();

let rerender = () => {};
let listHost = null;

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

/* ------------------------------------------------------------------ *
 * Selecting, sorting, grouping
 * ------------------------------------------------------------------ */

function contextFor(snap) {
  const ws = snap.profile.weekStartsOn;
  return {
    today: snap.today,
    weekFrom: startOfWeek(snap.today, ws),
    weekTo: endOfWeek(snap.today, ws),
  };
}

function inRange(iso, from, to) {
  return !!iso && iso >= from && iso <= to;
}

/**
 * The candidate set before the filter runs.
 *
 * ranked() is the only source of `_priority`, so it is used whenever a score is
 * about to be displayed or grouped on — and it excludes done tasks, which is
 * why the done filter always reads the snapshot instead.
 */
function pool(snap) {
  if (view.filter === 'done') return snap.tasks.filter((task) => task.status === 'done');
  if (view.sort === 'priority' || view.group === 'priority') return tasksService.ranked();
  return snap.tasks.filter((task) => task.status !== 'done'
    && task.status !== 'cancelled' && !task.someday);
}

function matches(decorated, ctx) {
  const task = decorated.task;
  switch (view.filter) {
    case 'today':
      /* Overdue counts as today: a task that was due on Monday is not somebody
       * else's problem on Wednesday. */
      return task.scheduledDate === ctx.today || (!!task.dueDate && task.dueDate <= ctx.today);
    case 'week':
      return inRange(task.scheduledDate, ctx.weekFrom, ctx.weekTo)
        || inRange(task.dueDate, ctx.weekFrom, ctx.weekTo);
    case 'overdue':
      return !!task.dueDate && task.dueDate < ctx.today;
    case 'unscheduled':
      return !task.scheduledDate;
    case 'blocked':
      return decorated.blocked;
    default:
      return true;
  }
}

function scoreOf(decorated) {
  return decorated.task._priority ? decorated.task._priority.score : -1;
}

function comparator() {
  switch (view.sort) {
    case 'due':
      /* Undated tasks sort last rather than first — an empty due date is the
       * absence of a deadline, not a deadline in the year zero. */
      return (a, b) => {
        const x = a.task.dueDate || '9999-12-31';
        const y = b.task.dueDate || '9999-12-31';
        if (x !== y) return x < y ? -1 : 1;
        return a.task.title.localeCompare(b.task.title, 'he');
      };
    case 'created':
      return (a, b) => b.task.createdAt - a.task.createdAt;
    case 'title':
      return (a, b) => a.task.title.localeCompare(b.task.title, 'he');
    default:
      return (a, b) => scoreOf(b) - scoreOf(a)
        || (b.task.completedAt || b.task.createdAt) - (a.task.completedAt || a.task.createdAt);
  }
}

function dueBucket(task, ctx) {
  if (!task.dueDate) return 'none';
  if (task.dueDate < ctx.today) return 'overdue';
  if (task.dueDate === ctx.today) return 'today';
  if (task.dueDate <= ctx.weekTo) return 'week';
  return 'later';
}

/** {key, title, rank} — rank orders the sections, title breaks ties. */
function groupKey(decorated, ctx) {
  switch (view.group) {
    case 'project':
      return decorated.project
        ? { key: `p:${decorated.project.id}`, title: decorated.project.title, rank: 0 }
        : { key: 'p:', title: t('common.unassigned'), rank: 1 };
    case 'area':
      return decorated.area
        ? { key: `a:${decorated.area.id}`, title: decorated.area.title, rank: decorated.area.order || 0 }
        : { key: 'a:', title: t('common.unassigned'), rank: 1e6 };
    case 'due': {
      const bucket = dueBucket(decorated.task, ctx);
      return {
        key: `d:${bucket}`,
        title: t(DUE_BUCKET_LABEL[bucket]),
        rank: DUE_BUCKETS.indexOf(bucket),
      };
    }
    default: {
      /* Done tasks carry no score, so they group under "ללא" rather than
       * being assigned a band the app never computed. */
      const score = scoreOf(decorated);
      if (score < 0) return { key: 'b:', title: t('common.none'), rank: 3 };
      const band = priorityBand(score);
      return { key: `b:${band}`, title: t(BAND_LABEL[band]), rank: ['high', 'medium', 'low'].indexOf(band) };
    }
  }
}

function grouped(rows, ctx) {
  if (view.group === 'none') {
    return [{ key: 'all', title: t(FILTER_LABEL[view.filter]), rows }];
  }

  const buckets = new Map();
  for (const decorated of rows) {
    const g = groupKey(decorated, ctx);
    let bucket = buckets.get(g.key);
    if (!bucket) {
      bucket = { key: g.key, title: g.title, rank: g.rank, rows: [] };
      buckets.set(g.key, bucket);
    }
    bucket.rows.push(decorated);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'he'));
}

/* ------------------------------------------------------------------ *
 * Stuck tasks — §137
 * ------------------------------------------------------------------ */

function openReschedule(task) {
  const input = h('input', {
    type: 'date',
    value: task.scheduledDate || task.dueDate || todayIso(),
    min: todayIso(),
  });

  dialog({
    title: t('tasks.stuckReschedule'),
    note: task.title,
    body: field({ label: t('tasks.scheduled'), control: input }),
    actions: [
      { label: t('common.cancel') },
      {
        label: t('common.save'),
        kind: 'primary',
        onClick: () => {
          if (!isValidIso(input.value)) return false;
          tasksService.schedule(task.id, input.value, null, null);
          /* Picking a date is the answer the notice was asking for, so it stops
           * asking — even though the move itself is one more postponement in
           * the history, which is where it belongs. */
          dismissedStuck.add(task.id);
          toast(t('tasks.movedTo', { date: relativeDay(input.value) }));
          rerender();
          return true;
        },
      },
    ],
  });
}

async function dropTask(task) {
  const yes = await confirmDestructive({
    title: t('tasks.dropConfirmTitle'),
    note: t('tasks.dropConfirmNote'),
    confirmLabel: t('tasks.stuckDrop'),
  });
  if (!yes) return;

  /* Cancelled, not deleted: the activity log still refers to a real record, and
   * an undo has somewhere to put the task back. */
  const previous = task.status;
  tasksService.update(task.id, { status: 'cancelled' });
  toastUndo(t('tasks.dropped'), () => {
    tasksService.update(task.id, { status: previous });
    rerender();
  });
  rerender();
}

function stuckNotice(task) {
  return h('div.notice.notice-warn',
    h('div.row-between.wrap-flex',
      h('div.grow',
        h('strong', t('tasks.stuckTitle')),
        h('div.ellipsis', { style: { marginBlockStart: '2px' } }, task.title),
        h('div.tiny.quiet', { style: { marginBlockStart: '4px' } },
          t('tasks.stuckNote', { postponed: plural('count.postponed', task.postponeCount || 0) }))),
      h('div.row.wrap-flex.shrink0',
        h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => openSplitDialog(task.id, rerender),
        }, icon('split', { size: 13 }), t('tasks.stuckSplit')),
        h('button.btn.btn-sm.btn-secondary', {
          type: 'button',
          onclick: () => openReschedule(task),
        }, t('tasks.stuckReschedule')),
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => dropTask(task),
        }, t('tasks.stuckDrop')),
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => { dismissedStuck.add(task.id); rerender(); },
        }, t('tasks.stuckKeep')))));
}

function stuckSection(snap) {
  const list = stuckTasks(snap.tasks).filter((task) => !dismissedStuck.has(task.id));
  if (!list.length) return null;
  /* All of them, not a capped three: five postponements is already a rare
   * event, and every notice carries the button that makes it go away. */
  return h('div.stack-tight', { style: { marginBlockEnd: 'var(--sp-5)' } },
    list.map(stuckNotice));
}

/* ------------------------------------------------------------------ *
 * Toolbar
 * ------------------------------------------------------------------ */

function picker(label, options, current, onChange) {
  const select = h('select', {
    style: { width: 'auto' },
    onchange: (e) => onChange(e.target.value),
  }, options.map((o) => h('option', {
    value: o.value,
    selected: o.value === current,
  }, t(o.label))));

  /* A wrapping <label> is the association — no id to invent, and the visible
   * word is the accessible name. */
  return h('label.row.shrink0',
    h('span.tiny.quiet.shrink0', label),
    select);
}

function toolbar() {
  const segmented = h('div.segmented', { role: 'group', 'aria-label': t('common.filter') });
  for (const key of FILTERS) {
    segmented.appendChild(h('button', {
      type: 'button',
      'aria-pressed': view.filter === key ? 'true' : 'false',
      data: { filter: key },
      onclick: () => {
        view.filter = key;
        for (const b of qsa('button', segmented)) {
          b.setAttribute('aria-pressed', b.dataset.filter === key ? 'true' : 'false');
        }
        paintList(true);
      },
    }, t(FILTER_LABEL[key])));
  }

  const search = h('input', {
    type: 'search',
    value: view.query,
    placeholder: t('common.searchPlaceholder'),
    'aria-label': t('common.search'),
    autocomplete: 'off',
    /* Only the list is repainted, never the toolbar — rebuilding the input
     * under a person's cursor loses the caret and half the word. */
    oninput: (e) => { view.query = e.target.value; paintList(false); },
  });

  return h('div', { style: { marginBlockEnd: 'var(--sp-5)' } },
    h('div', { style: { overflowX: 'auto' } }, segmented),
    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-3)' } },
      h('div.grow', { style: { minWidth: '160px' } }, search),
      picker(t('tasks.groupBy'), GROUPS, view.group, (value) => {
        view.group = value;
        paintList(true);
      }),
      picker(t('common.sort'), SORTS, view.sort, (value) => {
        view.sort = value;
        paintList(true);
      })));
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

function rowOptions() {
  return Object.assign(handlers(), {
    /* The heading already names the project; repeating it on every row turns a
     * grouped section into a column of the same chip. */
    showProject: view.group !== 'project',
    showScheduled: true,
    showEstimate: true,
    showPriority: view.sort === 'priority' || view.group === 'priority',
  });
}

function section(group, opts) {
  return h('section.section',
    sectionHead(group.title, h('span.section-note', plural('count.tasks', group.rows.length))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      group.rows.map((decorated) => taskRow(decorated, opts))));
}

function resetFilter() {
  view.filter = 'all';
  view.query = '';
  rerender();
}

function paintList(announceCount) {
  if (!listHost) return;

  const snap = snapshot();
  const ctx = contextFor(snap);
  const query = view.query.trim().toLowerCase();

  const rows = pool(snap)
    .map((task) => tasksService.decorate(task, snap))
    .filter((decorated) => matches(decorated, ctx))
    .filter((decorated) => !query || decorated.task.title.toLowerCase().includes(query));
  rows.sort(comparator());

  listHost.replaceChildren();

  if (!rows.length) {
    const narrowed = view.filter !== 'all' || query;
    listHost.appendChild(emptyState({
      icon: 'tasks',
      title: narrowed ? t('tasks.emptyFiltered') : t('tasks.emptyTitle'),
      note: narrowed ? null : t('tasks.emptyNote'),
      action: narrowed
        ? { label: t('common.showAll'), onClick: () => resetFilter() }
        : { label: t('tasks.addTask'), onClick: () => openTaskEditor(null, rerender) },
    }));
  } else {
    const opts = rowOptions();
    for (const group of grouped(rows, ctx)) listHost.appendChild(section(group, opts));
  }

  /* The controls are above the list, so a change made with the keyboard moves
   * nothing a screen reader would notice on its own. */
  if (announceCount) announce(plural('count.tasks', rows.length));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderTasks(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  const container = h('div', pageHeader(t('tasks.title'), {
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openTaskEditor(null, rerender),
      }, icon('plus', { size: 16 }), t('tasks.addTask')),
    ],
  }));

  /* Nothing has ever been captured. A filter bar over an empty list is furniture
   * for a room with nothing in it. */
  if (!snap.tasks.length) {
    listHost = null;
    container.appendChild(emptyState({
      icon: 'tasks',
      title: t('tasks.emptyTitle'),
      note: t('tasks.emptyNote'),
      action: { label: t('tasks.addTask'), onClick: () => openTaskEditor(null, rerender) },
    }));
    return container;
  }

  const stuck = stuckSection(snap);
  if (stuck) container.appendChild(stuck);

  container.appendChild(toolbar());

  listHost = h('div');
  container.appendChild(listHost);
  paintList(false);

  return container;
}
