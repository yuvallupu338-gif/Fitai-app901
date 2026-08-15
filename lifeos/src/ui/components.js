/*
 * components.js — the pieces that appear on more than one screen.
 *
 * A task row shows up on Today, in Tasks, inside a project, in search results
 * and in a planning preview. Five copies of it drift within a fortnight: one
 * of them forgets that a blocked task's checkbox is not tickable, another
 * shows a due date in a different format, and the interface stops feeling like
 * one thing. So it lives here, once, with the variations as options.
 *
 * Everything here returns a DOM node and takes plain data. No screen state, no
 * subscriptions — a screen re-renders by rebuilding its subtree, and these are
 * the leaves.
 */

import { h, checkbox, ltr, progressBar, popupMenu } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import {
  formatDuration, formatTime, formatTimeRange, relativeDay, today as todayIso,
  daysBetween, formatDate,
} from '../core/time.js';
import { href } from '../core/router.js';

/* ------------------------------------------------------------------ *
 * Small indicators
 * ------------------------------------------------------------------ */

/** An area's colour dot. Carries the name for screen readers. */
export function areaDot(area) {
  if (!area) return null;
  return h('span.dot', {
    style: { background: `var(--${area.color})` },
    role: 'img',
    'aria-label': area.title,
    title: area.title,
  });
}

export function areaChip(area) {
  if (!area) return null;
  return h('span.chip', areaDot(area), area.title);
}

const STATUS_TONE = {
  blocked: 'chip-risk',
  waiting: 'chip-warn',
  in_progress: 'chip-accent',
  done: 'chip-ok',
  cancelled: '',
};

export function statusChip(status, opts) {
  const o = opts || {};
  if (status === 'ready' || status === 'planned' || status === 'inbox') return null;
  return h('span.chip', { class: STATUS_TONE[status] || null },
    status === 'blocked' ? icon('blocked', { size: 12 }) : null,
    t(`tasks.${o.short ? 'statusShort' : 'status'}.${status}`));
}

const HEALTH_TONE = {
  on_track: 'chip-ok',
  needs_attention: 'chip-warn',
  at_risk: 'chip-risk',
  blocked: 'chip-risk',
  idle: '',
  done: 'chip-ok',
};

const HEALTH_LABEL = {
  on_track: 'projects.status.on_track',
  needs_attention: 'projects.status.needs_attention',
  at_risk: 'projects.status.needs_attention',
  blocked: 'projects.status.blocked',
  idle: 'projects.status.paused',
  done: 'projects.status.done',
};

export function healthChip(health) {
  if (!health) return null;
  return h('span.chip', { class: HEALTH_TONE[health.health] || null },
    /* Not colour alone: each state also gets its own glyph, because a red chip
     * and an amber chip are the same chip to a large minority of readers. */
    health.health === 'at_risk' || health.health === 'blocked' ? icon('alert', { size: 12 })
      : health.health === 'needs_attention' ? icon('clock', { size: 12 })
        : health.health === 'done' ? icon('check', { size: 12 }) : null,
    t(HEALTH_LABEL[health.health] || 'projects.status.active'));
}

/** A due date, coloured by how close it is, always with the words as well. */
export function dueChip(dueDate, refIso) {
  if (!dueDate) return null;
  const ref = refIso || todayIso();
  const days = daysBetween(ref, dueDate);
  const tone = days < 0 ? 'chip-risk' : days === 0 ? 'chip-warn' : null;
  return h('span.chip', { class: tone, title: formatDate(dueDate) },
    icon('clock', { size: 12 }),
    days < 0 ? t('tasks.filterOverdue') : relativeDay(dueDate, ref));
}

export function durationChip(minutes) {
  if (!minutes) return null;
  return h('span.chip', formatDuration(minutes));
}

export function energyChip(level) {
  if (!level || level === 'normal') return null;
  return h('span.chip', {
    class: level === 'deep' ? 'chip-info' : null,
    title: t(`tasks.energyNote.${level}`),
  },
  level === 'deep' ? icon('zap', { size: 12 }) : null,
  t(`tasks.energyLevel.${level}`));
}

export function scheduledChip(task) {
  if (!task.scheduledDate) return null;
  if (task.scheduledStart === null || task.scheduledStart === undefined) {
    return h('span.chip', icon('calendar', { size: 12 }), relativeDay(task.scheduledDate));
  }
  return h('span.chip', icon('calendar', { size: 12 }),
    ltr(formatTimeRange(task.scheduledStart, task.scheduledEnd)));
}

/* ------------------------------------------------------------------ *
 * Task row
 * ------------------------------------------------------------------ */

/**
 * The single most repeated element in the app.
 *
 * `decorated` is {task, status, blocked, blockers, project, area} from
 * tasks.decorate — passed in rather than computed here, because a list of
 * forty rows would otherwise rebuild the dependency graph forty times.
 */
export function taskRow(decorated, opts) {
  const o = opts || {};
  const task = decorated.task;
  const done = decorated.status === 'done';

  const meta = [];
  if (o.showProject !== false && decorated.project) {
    meta.push(h('a.chip', {
      href: href(`/projects/${decorated.project.id}`),
      onclick: (e) => e.stopPropagation(),
    }, icon('project', { size: 12 }), decorated.project.title));
  }
  if (o.showArea && decorated.area) meta.push(areaChip(decorated.area));
  if (!done) {
    const status = statusChip(decorated.status, { short: true });
    if (status) meta.push(status);
    const due = dueChip(task.dueDate);
    if (due) meta.push(due);
    if (o.showScheduled) {
      const sched = scheduledChip(task);
      if (sched) meta.push(sched);
    }
    if (o.showEstimate !== false && task.estimatedMinutes) meta.push(durationChip(task.estimatedMinutes));
    if (o.showEnergy) {
      const energy = energyChip(task.energyLevel);
      if (energy) meta.push(energy);
    }
    if (o.showPriority && task._priority) {
      meta.push(h('span.chip', { title: t('tasks.priorityScore') },
        ltr(String(Math.round(task._priority.score)))));
    }
  }

  const row = h('div.trow', { class: done ? 'trow-done' : null, data: { taskId: task.id } });

  row.appendChild(checkbox(done, {
    disabled: decorated.blocked,
    label: task.title,
    title: decorated.blocked
      ? plural('count.blocked', decorated.blockers.length)
      : (done ? t('tasks.uncomplete') : t('tasks.complete')),
    onChange: (next) => o.onToggle && o.onToggle(task, next),
    onBlocked: () => o.onBlocked && o.onBlocked(task, decorated.blockers),
  }));

  row.appendChild(h('button.trow-body', {
    type: 'button',
    onclick: () => o.onOpen && o.onOpen(task),
  },
  h('div.trow-title', task.title),
  /* A blocked task says what is blocking it, by name. "חסום" alone is a dead
   * end — there is nothing on the screen to act on. */
  decorated.blocked && decorated.blockers.length
    ? h('div.tiny.quiet', { style: { marginBlockStart: '3px' } },
      `${t('tasks.blockedBy')}: ${decorated.blockers.map((b) => b.title).join(', ')}`)
    : null,
  task.status === 'waiting' && task.waitingFor
    ? h('div.tiny.quiet', { style: { marginBlockStart: '3px' } },
      t('tasks.waitingLabel', { what: ` ${task.waitingFor}` }))
    : null,
  meta.length ? h('div.trow-meta', meta) : null));

  if (o.actions !== false) {
    row.appendChild(h('button.btn-icon.shrink0', {
      type: 'button',
      'aria-label': t('common.actions'),
      onclick: (e) => {
        e.stopPropagation();
        o.onMenu && o.onMenu(task, e.currentTarget);
      },
    }, icon('more')));
  }

  if (o.draggable) {
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/lifeos-task', task.id);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  }

  return row;
}

/** A card wrapping a list of task rows. */
export function taskList(rows, opts) {
  const o = opts || {};
  if (!rows.length) return o.empty || null;
  return h('div.card.card-flat', { style: { overflow: 'hidden' } }, rows);
}

/* ------------------------------------------------------------------ *
 * Menus
 * ------------------------------------------------------------------ */

/** The action menu shared by every task row in the app. */
export function taskMenu(anchor, task, handlers) {
  return popupMenu(anchor, [
    { label: t('common.edit'), icon: 'edit', onClick: () => handlers.onEdit(task) },
    { label: t('tasks.startFocus'), icon: 'focus', onClick: () => handlers.onFocus(task) },
    { separator: true },
    { label: t('tasks.moveToTomorrow'), icon: 'next', onClick: () => handlers.onTomorrow(task) },
    task.scheduledDate
      ? { label: t('tasks.unschedule'), icon: 'calendar', onClick: () => handlers.onUnschedule(task) }
      : null,
    { label: t('tasks.split'), icon: 'split', onClick: () => handlers.onSplit(task) },
    task.someday
      ? { label: t('someday.activate'), icon: 'play', onClick: () => handlers.onActivate(task) }
      : { label: t('someday.add'), icon: 'someday', onClick: () => handlers.onSomeday(task) },
    { separator: true },
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => handlers.onDelete(task) },
  ].filter(Boolean));
}

/* ------------------------------------------------------------------ *
 * Cards for the bigger objects
 * ------------------------------------------------------------------ */

export function projectCard(detail, opts) {
  const o = opts || {};
  const p = detail.project;
  return h('a.card.card-pad.card-click', { href: href(`/projects/${p.id}`) },
    h('div.row-between',
      h('div.grow.ellipsis',
        h('h4.ellipsis', p.title),
        detail.goal ? h('div.tiny.quiet.ellipsis', detail.goal.title) : null),
      healthChip(detail.health)),
    h('div', { style: { marginBlockStart: '12px' } },
      progressBar(detail.progress.pct, { label: t('goals.progress') })),
    h('div.row-between', { style: { marginBlockStart: '8px' } },
      h('span.tiny.quiet',
        detail.progress.basis === 'milestones'
          ? t('projects.milestonesProgress', { done: detail.progress.done, total: detail.progress.total })
          : plural('count.tasks', detail.openTasks ? detail.openTasks.length : 0)),
      h('span.tiny.quiet.num', `${detail.progress.pct}%`)),
    o.footer || null);
}

export function goalCard(detail) {
  const g = detail.goal;
  const progress = detail.progress;
  return h('a.card.card-pad.card-click', { href: href(`/goals/${g.id}`) },
    h('div.row-between',
      h('div.grow.ellipsis',
        h('h4.ellipsis', g.title),
        h('div.row', { style: { marginBlockStart: '4px' } },
          detail.area ? areaChip(detail.area) : null,
          g.targetDate ? dueChip(g.targetDate) : null)),
      h('span.chip', t(`goals.types.${g.type}`))),
    h('div', { style: { marginBlockStart: '12px' } }, progressBar(progress.pct)),
    h('div.row-between', { style: { marginBlockStart: '8px' } },
      h('span.tiny.quiet', progressLabel(progress)),
      h('span.tiny.quiet.num', `${progress.pct}%`)));
}

/** The words under a progress bar — never a bare percentage. */
export function progressLabel(progress) {
  switch (progress.basis) {
    case 'milestones':
      return t('projects.milestonesProgress', { done: progress.done, total: progress.total });
    case 'metric':
      return t('goals.metricProgress', {
        current: progress.current, target: progress.target, unit: progress.unit || '',
      });
    case 'tasks':
      return `${progress.done} ${t('common.of')} ${progress.total} ${t('nav.tasks')}`;
    case 'manual':
      return t('goals.progressSources.manual');
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ *
 * Page furniture
 * ------------------------------------------------------------------ */

export function pageHeader(title, opts) {
  const o = opts || {};
  return h('div.section-head', { style: { marginBlockEnd: '18px' } },
    h('div',
      h('h1', { style: { fontSize: 'var(--t-xl)' } }, title),
      o.subtitle ? h('p.tiny.quiet', { style: { marginBlockStart: '4px' } }, o.subtitle) : null),
    o.actions ? h('div.row', o.actions) : null);
}

/** A "why" block — the explanation under a recommendation. */
export function whyBlock(text, opts) {
  const o = opts || {};
  if (!text) return null;
  return h('div', { style: { marginBlockStart: '12px' } },
    h('div.tiny.quiet', { style: { marginBlockEnd: '4px' } }, t('today.whyThis')),
    h('p.why', text),
    o.origin ? originNote(o.origin) : null);
}

/**
 * Who wrote this — a local computation or a model.
 *
 * Shown on anything an assistant may have phrased. §7 and §162 both point at
 * the same thing from different angles: a person should be able to tell how
 * much weight a sentence deserves, and "a rule computed this from your data"
 * and "a language model wrote this" deserve different amounts.
 */
export function originNote(origin) {
  return h('div.tiny.quiet', { style: { marginBlockStart: '8px' } },
    origin === 'model' ? icon('sparkle', { size: 11 }) : null,
    ' ',
    t(origin === 'model' ? 'ai.computedByModel' : 'ai.computedLocally'));
}

/** A stat tile. Number large, label small, never a fabricated trend arrow. */
export function stat(value, label, opts) {
  const o = opts || {};
  return h('div.card.card-pad',
    h('div.num', {
      style: { fontSize: 'var(--t-xl)', fontWeight: '500', color: o.tone ? `var(--${o.tone})` : 'var(--ink)' },
    }, String(value)),
    h('div.tiny.quiet', { style: { marginBlockStart: '2px' } }, label),
    o.note ? h('div.tiny.quiet', { style: { marginBlockStart: '4px' } }, o.note) : null);
}

export function statGrid(tiles) {
  return h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 'var(--sp-3)',
    },
  }, tiles);
}

export { formatDuration, formatTime, formatTimeRange, relativeDay, href, icon };
