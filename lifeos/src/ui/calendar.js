/*
 * calendar.js — where the plan meets the clock.
 *
 * FOUR VIEWS, ONE ANCHOR.
 *
 * The anchor is a single day. Every view is a function of it — the month it
 * falls in, the week it belongs to, the fourteen days that follow it — so the
 * arrows, the "today" button and a click on a month cell all move the same one
 * number, and switching views never loses the reader's place.
 *
 * A BLOCK IS NOT AN EVENT, AND THE GRID SAYS SO.
 *
 * Events are things that are happening and get the info colour; blocks are
 * intentions and get the accent; a fixed block reads like an event because that
 * is what "fixed" means. The distinction is the calendar service's, and it is
 * repeated here in colour AND in the menu each entry opens, because an entry
 * whose only difference is a shade is an entry nobody can tell apart.
 *
 * DRAGGING IS THE FAST PATH, NOT THE ONLY PATH.
 *
 * Dropping a task onto a column is the gesture that creates most blocks, and it
 * is unavailable to anyone on a keyboard or a screen reader. So the same
 * operation is in the row's menu, as a dialog with a date and a time, and both
 * ends land in blocks.scheduleTask — one code path, two ways in.
 */

import {
  h, replace, dialog, field, switchRow, confirmDestructive, popupMenu,
  emptyState, sectionHead, announce,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, toastUndo, toastError } from '../core/toast.js';
import {
  today as todayIso, nowMinutes, addDays, addMonths, daysBetween, dayOfWeek,
  startOfMonth, startOfWeek, endOfWeek, formatTime, formatTimeRange, parseTimeInput,
  formatDate, formatDateWithDay, dayName, formatMonthYear, formatDuration, isValidIso,
} from '../core/time.js';
import { preferences, snapshot } from '../services/core.js';
import { events, blocks, day, week, month, agenda } from '../services/calendar.js';
import * as tasksService from '../services/tasks.js';
import { taskRow } from './components.js';
import { openTaskEditor } from './taskeditor.js';
import { startFocusFor } from './focus.js';

const VIEWS = ['day', 'week', 'month', 'agenda'];

/* Must match .cal-slot in layout.css. An hour is 52 pixels tall in both
 * directions — the rail draws them, this file positions against them, and a
 * disagreement between the two shows up as entries that float off their hour. */
const HOUR_PX = 52;

const SNAP_MINUTES = 15;
const AGENDA_DAYS = 14;
const MONTH_PIPS = 3;
const STRIP_MAX = 8;

/* The drop indicator shows where a block will START. Its length is unknown
 * until the drop — the payload is a task id and dataTransfer will not hand over
 * its data before then — so it draws a half hour rather than guessing. */
const HINT_MINUTES = 30;

let view = 'week';
let anchor = null;
let paramDate = null;
let rerender = () => {};

/* ------------------------------------------------------------------ *
 * Small shared helpers
 * ------------------------------------------------------------------ */

function dayOfMonth(iso) {
  return daysBetween(startOfMonth(iso), iso) + 1;
}

function entryTitle(entry) {
  return entry.title || t('common.untitled');
}

function workBounds() {
  const prefs = preferences();
  const a = prefs.workStartMinutes;
  const b = prefs.workEndMinutes;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function errorText(err) {
  if (!err) return null;
  switch (err.code) {
    case 'required': return t('errors.required');
    case 'min': return t('errors.tooShort');
    case 'max': return t('errors.tooLong', { n: err.max });
    case 'date': return t('errors.invalidDate');
    case 'time': return t('errors.invalidTime');
    case 'endBeforeStart': return t('errors.endBeforeStart');
    default: return t('errors.generic');
  }
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function periodLabel() {
  if (view === 'month') return formatMonthYear(anchor);
  if (view === 'day') return formatDateWithDay(anchor);
  const from = view === 'week' ? startOfWeek(anchor, 0) : anchor;
  const to = view === 'week' ? endOfWeek(anchor, 0) : addDays(anchor, AGENDA_DAYS - 1);
  /* Not direction-isolated: in an RTL line the earlier date lands on the right,
   * which is the order it is read in. */
  return `${formatDate(from, { short: true })} – ${formatDate(to, { short: true })}`;
}

function shifted(direction) {
  switch (view) {
    case 'day': return addDays(anchor, direction);
    case 'week': return addDays(anchor, direction * 7);
    case 'month': return addMonths(anchor, direction);
    default: return addDays(anchor, direction * AGENDA_DAYS);
  }
}

function goTo(iso, nextView) {
  anchor = iso;
  if (nextView) view = nextView;
  rerender();
}

function header() {
  const segmented = h('div.segmented', { role: 'group', 'aria-label': t('calendar.title') },
    VIEWS.map((name) => h('button', {
      type: 'button',
      'aria-pressed': name === view ? 'true' : 'false',
      onclick: () => { view = name; rerender(); },
    }, t(`calendar.${name}`))));

  const nav = h('div.row',
    h('button.btn-icon', {
      type: 'button',
      'aria-label': t('calendar.prevPeriod'),
      onclick: () => goTo(shifted(-1)),
    }, icon('prev')),
    h('button.btn.btn-sm.btn-secondary', {
      type: 'button',
      onclick: () => goTo(todayIso()),
    }, t('calendar.today')),
    h('button.btn-icon', {
      type: 'button',
      'aria-label': t('calendar.nextPeriod'),
      onclick: () => goTo(shifted(1)),
    }, icon('next')));

  return h('div', { style: { marginBlockEnd: '18px' } },
    h('div.row-between.wrap-flex',
      h('h1', { style: { fontSize: 'var(--t-xl)' } }, periodLabel()),
      h('div.row.wrap-flex',
        segmented,
        nav,
        h('button.btn.btn-sm.btn-primary', {
          type: 'button',
          onclick: () => openEventDialog(null, anchor),
        }, icon('plus', { size: 15 }), t('calendar.newEvent')))));
}

/* ------------------------------------------------------------------ *
 * Month
 * ------------------------------------------------------------------ */

function monthPips(dayData, snap) {
  const items = [];
  for (const event of dayData.events) {
    items.push({
      start: event.allDay ? -1 : event.startMinutes,
      event: true,
      label: event.allDay ? event.title : `${formatTime(event.startMinutes)} ${event.title}`,
    });
  }
  for (const block of dayData.blocks) {
    const task = block.taskId ? snap.tasksById.get(block.taskId) : null;
    items.push({
      start: block.startMinutes,
      event: false,
      label: `${formatTime(block.startMinutes)} ${block.title || (task && task.title) || t('calendar.block')}`,
    });
  }
  /* A task scheduled to the day without a block has no time of its own, so it
   * sorts last and shows as a bare title. */
  for (const task of dayData.tasks) {
    if (task.status === 'done' || task.status === 'cancelled') continue;
    if (dayData.blocks.some((b) => b.taskId === task.id)) continue;
    items.push({ start: 1441, event: false, label: task.title });
  }
  return items.sort((a, b) => a.start - b.start);
}

function monthView() {
  const snap = snapshot();
  const data = month(anchor, 0);
  const rest = preferences().restDays || [];
  const currentMonth = startOfMonth(anchor);
  const grid = h('div.cal-grid.cal-month');

  for (let i = 0; i < 7; i += 1) {
    grid.appendChild(h('div.cal-dow', dayName(data.days[i].date, true)));
  }

  for (const dayData of data.days) {
    const iso = dayData.date;
    const items = monthPips(dayData, snap);
    const classes = [
      startOfMonth(iso) !== currentMonth ? 'cal-day-out' : null,
      iso === todayIso() ? 'cal-today' : null,
      rest.includes(dayOfWeek(iso)) ? 'cal-day-rest' : null,
    ].filter(Boolean);

    grid.appendChild(h('button.cal-day', {
      type: 'button',
      class: classes.length ? classes.join(' ') : null,
      'aria-label': formatDateWithDay(iso),
      'aria-current': iso === todayIso() ? 'date' : null,
      onclick: () => goTo(iso, 'day'),
    },
    h('div.cal-daynum', String(dayOfMonth(iso))),
    items.slice(0, MONTH_PIPS).map((item) => h('div.cal-pip', {
      class: item.event ? 'cal-pip-event' : null,
      title: item.label,
    }, item.label)),
    items.length > MONTH_PIPS
      ? h('div.cal-pip.cal-pip-more', t('common.showMore', { n: items.length - MONTH_PIPS }))
      : null));
  }

  return grid;
}

/* ------------------------------------------------------------------ *
 * Day and week — the time grid
 * ------------------------------------------------------------------ */

/**
 * The hours the rail draws.
 *
 * It starts from the working window, because that is the part of the day a
 * person asked to see. It is then widened to cover anything already on the day:
 * a lesson at 06:00 outside the window is still happening, and a grid that
 * quietly cropped it would be lying about the morning.
 */
function railBounds(infos) {
  const bounds = workBounds();
  let from = bounds.start;
  let to = bounds.end;
  for (const info of infos) {
    for (const entry of info.entries) {
      from = Math.min(from, entry.start);
      to = Math.max(to, entry.end);
    }
  }
  const startHour = Math.max(0, Math.floor(from / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(to / 60)));
  return { origin: startHour * 60, hours: endHour - startHour };
}

function yFor(minutes, rail) {
  return ((minutes - rail.origin) / 60) * HOUR_PX;
}

/**
 * Side-by-side lanes for entries that overlap.
 *
 * Without this, a block dropped over a lesson hides it completely and the
 * calendar shows a day that does not exist. Lanes are counted per overlapping
 * cluster rather than per day, so one collision at 09:00 does not make the
 * afternoon narrow.
 */
function layoutEntries(entries) {
  const placed = [];
  let group = [];
  let groupEnd = -1;

  function close() {
    const laneEnds = [];
    for (const item of group) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > item.entry.start) lane += 1;
      laneEnds[lane] = item.entry.end;
      item.lane = lane;
    }
    for (const item of group) item.lanes = laneEnds.length;
    for (const item of group) placed.push(item);
    group = [];
    groupEnd = -1;
  }

  for (const entry of entries) {
    if (group.length && entry.start >= groupEnd) close();
    group.push({ entry, lane: 0, lanes: 1 });
    groupEnd = Math.max(groupEnd, entry.end);
  }
  if (group.length) close();
  return placed;
}

function entryNode(item, rail) {
  const entry = item.entry;
  const height = Math.max(18, ((entry.end - entry.start) / 60) * HOUR_PX);
  const style = { insetBlockStart: `${yFor(entry.start, rail)}px`, height: `${height}px` };

  if (item.lanes > 1) {
    /* Both insets come from the stylesheet; setting a width on top of them is
     * over-constrained, and which inset the browser drops depends on direction.
     * Releasing the end inset explicitly keeps it the same in RTL and LTR. */
    style.insetInlineStart = `calc(3px + (100% - 6px) * ${item.lane} / ${item.lanes})`;
    style.insetInlineEnd = 'auto';
    style.width = `calc((100% - 6px) / ${item.lanes})`;
  }

  const classes = [
    entry.kind === 'event' ? 'cal-entry-event' : null,
    entry.blockKind === 'fixed' ? 'cal-entry-fixed' : null,
    entry.done ? 'cal-entry-done' : null,
  ].filter(Boolean);

  const node = h('button.cal-entry', {
    type: 'button',
    class: classes.length ? classes.join(' ') : null,
    style,
    title: `${formatTimeRange(entry.start, entry.end)} · ${entryTitle(entry)}`,
    onclick: (e) => openEntry(entry, e.currentTarget),
  },
  h('div.cal-entry-title', entryTitle(entry)),
  height >= 34 ? h('div.cal-entry-time', formatTimeRange(entry.start, entry.end)) : null);

  return node;
}

function openEntry(entry, anchorEl) {
  if (entry.kind === 'event') { openEventDialog(entry.source, entry.source.date); return; }
  if (entry.task) { openTaskEditor(entry.task.id, rerender); return; }
  blockMenu(anchorEl, entry.source);
}

/** A block with no task behind it — a habit, a routine, or one somebody drew. */
function blockMenu(anchorEl, block) {
  popupMenu(anchorEl, [
    {
      label: t('common.delete'),
      icon: 'trash',
      danger: true,
      onClick: () => {
        blocks.remove(block.id);
        toastUndo(t('calendar.blockDeleted'), () => {
          blocks.create({
            date: block.date,
            startMinutes: block.startMinutes,
            endMinutes: block.endMinutes,
            title: block.title || '',
            kind: block.kind,
            habitId: block.habitId || null,
            routineId: block.routineId || null,
          });
          rerender();
        });
        rerender();
      },
    },
  ]);
}

function columnHead(iso, opts) {
  const o = opts || {};
  const body = [h('div', dayName(iso, true)), h('div.num', String(dayOfMonth(iso)))];

  /* The rail has to start at the same y as the columns, and the heads are
   * inside the columns so they can stick while the grid scrolls. An identical
   * head, hidden, is the only spacer guaranteed to be exactly as tall. */
  if (o.spacer) {
    return h('div.cal-col-head', { 'aria-hidden': 'true', style: { visibility: 'hidden' } }, body);
  }

  const isToday = iso === todayIso();
  return h('button.cal-col-head', {
    type: 'button',
    'aria-current': isToday ? 'date' : null,
    'aria-label': formatDateWithDay(iso),
    style: isToday ? { color: 'var(--accent)' } : null,
    onclick: () => goTo(iso, 'day'),
  }, body);
}

function minuteAt(clientY, inner, rail) {
  const box = inner.getBoundingClientRect();
  const y = Math.max(0, Math.min(box.height, clientY - box.top));
  const raw = rail.origin + (y / HOUR_PX) * 60;
  return Math.max(0, Math.min(1440 - SNAP_MINUTES, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES));
}

function attachDrop(col, inner, dayIso, rail) {
  let hint = null;

  function clearHint() {
    col.classList.remove('drop-live');
    if (hint) { hint.remove(); hint = null; }
  }

  col.addEventListener('dragover', (e) => {
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes('text/lifeos-task')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drop-live');
    if (!hint) { hint = h('div.cal-drop-hint'); inner.appendChild(hint); }
    hint.style.insetBlockStart = `${yFor(minuteAt(e.clientY, inner, rail), rail)}px`;
    hint.style.height = `${(HINT_MINUTES / 60) * HOUR_PX}px`;
  });

  /* dragleave also fires when the cursor crosses onto a child, which would
   * strobe the highlight over every entry in the column. */
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) clearHint();
  });

  col.addEventListener('drop', (e) => {
    const taskId = e.dataTransfer.getData('text/lifeos-task');
    if (!taskId) { clearHint(); return; }
    e.preventDefault();
    const minutes = minuteAt(e.clientY, inner, rail);
    clearHint();
    scheduleTaskAt(taskId, dayIso, minutes);
  });
}

function dayColumn(info, rail) {
  const inner = h('div', {
    style: { position: 'relative', height: `${rail.hours * HOUR_PX}px` },
  });

  for (let i = 0; i < rail.hours; i += 1) inner.appendChild(h('div.cal-slot'));
  for (const item of layoutEntries(info.entries)) inner.appendChild(entryNode(item, rail));

  if (info.date === todayIso()) {
    const now = nowMinutes();
    if (now >= rail.origin && now <= rail.origin + rail.hours * 60) {
      inner.appendChild(h('div.cal-now', {
        'aria-hidden': 'true',
        style: { insetBlockStart: `${yFor(now, rail)}px` },
      }));
    }
  }

  const col = h('div.cal-col', columnHead(info.date), inner);
  attachDrop(col, inner, info.date, rail);
  return col;
}

function timeGrid(infos) {
  const rail = railBounds(infos);

  const hours = h('div.cal-hours', columnHead(infos[0].date, { spacer: true }));
  for (let i = 0; i < rail.hours; i += 1) {
    hours.appendChild(h('div.cal-hour', formatTime(rail.origin + i * 60)));
  }

  const cols = h('div.cal-cols', {
    style: { gridTemplateColumns: `repeat(${infos.length}, 1fr)` },
  }, infos.map((info) => dayColumn(info, rail)));

  return h('div.card', { style: { overflow: 'hidden' } },
    h('div.cal-time', hours, cols));
}

/* ------------------------------------------------------------------ *
 * The pieces around the grid
 * ------------------------------------------------------------------ */

function allDayStrip(infos) {
  const chips = [];
  for (const info of infos) {
    for (const event of info.allDayEvents) {
      chips.push(h('button.chip.chip-info', {
        type: 'button',
        onclick: () => openEventDialog(event, event.date),
      },
      icon('calendar', { size: 12 }),
      infos.length > 1 ? `${dayName(event.date, true)} · ${event.title}` : event.title));
    }
  }
  if (!chips.length) return null;

  return h('div.row.wrap-flex', { style: { marginBlockEnd: 'var(--sp-3)' } },
    h('span.tiny.quiet', t('calendar.allDay')),
    chips);
}

function emptyDayNotice() {
  return h('div.notice.notice-info', { style: { marginBlockEnd: 'var(--sp-3)' } },
    h('div.row-between',
      h('div.grow',
        h('strong', t('calendar.emptyTitle')),
        h('div', { style: { marginBlockStart: '4px' } }, t('calendar.emptyNote'))),
      h('button.btn.btn-sm.btn-secondary.shrink0', {
        type: 'button',
        onclick: () => openEventDialog(null, anchor),
      }, t('calendar.newEvent'))));
}

function intervalTitle(item, snap) {
  if (!item) return t('common.untitled');
  if (item.kind === 'block') {
    const block = snap.blocks.find((b) => b.id === item.id);
    if (block) {
      const task = block.taskId ? snap.tasksById.get(block.taskId) : null;
      const habit = block.habitId ? snap.habits.find((x) => x.id === block.habitId) : null;
      const routine = block.routineId ? snap.routines.find((x) => x.id === block.routineId) : null;
      return block.title || (task && task.title) || (habit && habit.title)
        || (routine && routine.title) || t('calendar.block');
    }
  }
  return item.title || t('common.untitled');
}

function conflictLine(conflict, snap) {
  switch (conflict.kind) {
    case 'overlap':
      return {
        tone: 'notice-warn',
        text: t('calendar.conflictOverlap', {
          a: intervalTitle(conflict.a, snap),
          b: intervalTitle(conflict.b, snap),
        }),
      };
    case 'outsideHours':
      return {
        tone: 'notice-info',
        text: t('calendar.conflictOutsideHours', { title: intervalTitle(conflict.a, snap) }),
      };
    case 'restDay':
      return {
        tone: 'notice-info',
        text: t('calendar.conflictRestDay', { title: intervalTitle(conflict.a, snap) }),
      };
    case 'overload':
      return {
        tone: 'notice-warn',
        text: t('calendar.conflictOverload', {
          planned: formatDuration(conflict.capacity.plannedMinutes),
          available: formatDuration(conflict.capacity.usableMinutes),
        }),
      };
    default:
      return null;
  }
}

/**
 * A task planned into a day whose longest gap is shorter than the task.
 *
 * The capacity engine reports the day as overloaded but not which task cannot
 * possibly fit, and that is the one a person can act on.
 */
function tooBigLines(info) {
  const longest = info.capacity.longestWindow;
  if (!longest) return [];
  return info.unplaced
    .filter((task) => (task.estimatedMinutes || 0) > longest)
    .map((task) => ({
      tone: 'notice-warn',
      text: t('calendar.conflictTooBig', {
        title: task.title,
        need: formatDuration(task.estimatedMinutes),
        have: formatDuration(longest),
      }),
    }));
}

function conflictsSection(infos, snap) {
  const rows = [];
  for (const info of infos) {
    const lines = info.conflicts.map((c) => conflictLine(c, snap))
      .filter(Boolean)
      .concat(tooBigLines(info));
    for (const line of lines) {
      rows.push(h('div.notice', { class: line.tone },
        h('div.row',
          icon(line.tone === 'notice-warn' ? 'alert' : 'info', { size: 14 }),
          h('span.grow', infos.length > 1 ? `${dayName(info.date)}: ${line.text}` : line.text))));
    }
  }

  const windowsNote = infos.length === 1
    ? h('p.tiny.quiet', { style: { marginBlockStart: rows.length ? 'var(--sp-3)' : '0' } },
      infos[0].freeWindows.length
        ? `${t('calendar.freeWindows')}: ${infos[0].freeWindows.map((w) => formatTimeRange(w.start, w.end)).join(' · ')}`
        : t('calendar.noFreeWindows'))
    : null;

  if (!rows.length && !windowsNote) return null;

  return h('section.section',
    sectionHead(t('calendar.conflictsTitle'),
      rows.length ? null : h('span.section-note', t('calendar.noConflicts'))),
    h('div.stack-tight', rows),
    windowsNote);
}

/* ------------------------------------------------------------------ *
 * The unscheduled strip — the drag source, and its keyboard equivalent
 * ------------------------------------------------------------------ */

function stripMenu(anchorEl, task, dayIso) {
  popupMenu(anchorEl, [
    { label: t('tasks.schedule'), icon: 'calendar', onClick: () => openScheduleDialog(task, dayIso) },
    { label: t('common.edit'), icon: 'edit', onClick: () => openTaskEditor(task.id, rerender) },
    { label: t('tasks.startFocus'), icon: 'focus', onClick: () => startFocusFor(task.id) },
    { separator: true },
    {
      label: t('tasks.moveToTomorrow'),
      icon: 'next',
      onClick: () => {
        tasksService.moveToTomorrow(task.id);
        toast(t('tasks.movedTo', { date: t('time.tomorrow') }));
        rerender();
      },
    },
    task.scheduledDate
      ? {
        label: t('tasks.unschedule'),
        icon: 'x',
        onClick: () => { tasksService.unschedule(task.id); rerender(); },
      }
      : null,
  ].filter(Boolean));
}

function unscheduledStrip(info) {
  const snap = snapshot();
  const seen = new Set();
  const list = [];

  /* The day's own leftovers first — a task planned for today that never got a
   * slot is more urgent than one with no date at all. */
  for (const task of info.unplaced) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    list.push(task);
  }
  for (const task of tasksService.ranked((x) => !x.scheduledDate)) {
    if (list.length >= STRIP_MAX) break;
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    list.push(task);
  }

  if (!list.length) return null;

  const rows = list.map((task) => taskRow(tasksService.decorate(task, snap), {
    draggable: true,
    showEstimate: true,
    showScheduled: true,
    onToggle(x, next) {
      const result = tasksService.setComplete(x.id, next);
      if (!result.ok && result.code === 'blocked') {
        toastError(t('tasks.blockedCannotComplete'));
        return;
      }
      if (next) announce(t('tasks.completed'));
      rerender();
    },
    onBlocked(x, blockers) {
      toastError(`${t('tasks.blockedBy')}: ${blockers.map((b) => b.title).join(', ')}`);
    },
    onOpen(x) { openTaskEditor(x.id, rerender); },
    onMenu(x, anchorEl) { stripMenu(anchorEl, x, info.date); },
  }));

  return h('section.section',
    sectionHead(t('calendar.unscheduledTitle'),
      h('span.section-note', t('calendar.dragHint'))),
    h('div.card.card-flat', { style: { overflow: 'hidden' } }, rows));
}

/* ------------------------------------------------------------------ *
 * Scheduling
 * ------------------------------------------------------------------ */

function scheduleTaskAt(taskId, dayIso, minutes) {
  const task = tasksService.byId(taskId);
  if (!task) { toastError(t('errors.notFound')); return; }

  const result = blocks.scheduleTask(taskId, dayIso, minutes);
  if (!result.ok) { toastError(t('errors.generic')); return; }

  const block = result.block;
  toastUndo(
    t('calendar.dropScheduled', { title: task.title, time: formatTime(block.startMinutes) }),
    () => { blocks.remove(block.id); rerender(); },
  );
  rerender();
}

/** Where a block would most sensibly start on a day: its first real gap. */
function suggestedStart(iso) {
  const info = day(iso);
  if (info.freeWindows.length) return info.freeWindows[0].start;
  return workBounds().start;
}

function openScheduleDialog(task, dayIso) {
  const form = { date: dayIso || anchor, minutes: suggestedStart(dayIso || anchor) };
  const errorHost = h('div');

  const dateInput = h('input', {
    type: 'date',
    value: form.date,
    onchange: (e) => { form.date = e.target.value || ''; },
  });
  const timeInput = h('input', {
    type: 'time',
    value: formatTime(form.minutes),
    onchange: (e) => { form.minutes = parseTimeInput(e.target.value); },
  });

  dialog({
    title: t('tasks.schedule'),
    note: task.title,
    body: [
      field({ label: t('tasks.scheduled'), control: dateInput }),
      field({ label: t('calendar.starts'), control: timeInput, hint: t('calendar.scheduleHint') }),
      errorHost,
    ],
    actions: [
      { label: t('common.cancel') },
      {
        label: t('common.save'),
        kind: 'primary',
        onClick: () => {
          if (!isValidIso(form.date)) {
            replace(errorHost, h('p.field-error', { role: 'alert' }, t('errors.invalidDate')));
            return false;
          }
          if (form.minutes === null || form.minutes === undefined) {
            replace(errorHost, h('p.field-error', { role: 'alert' }, t('errors.invalidTime')));
            return false;
          }
          scheduleTaskAt(task.id, form.date, form.minutes);
          return true;
        },
      },
    ],
  });
}

/* ------------------------------------------------------------------ *
 * The event editor
 * ------------------------------------------------------------------ */

function defaultEventStart(iso) {
  const bounds = workBounds();
  if (iso !== todayIso()) return bounds.start;
  /* Starting an event "now" almost always means the next round half hour. */
  const next = Math.ceil(nowMinutes() / 30) * 30;
  return Math.min(Math.max(next, bounds.start), 23 * 60);
}

function openEventDialog(event, dateIso) {
  const start = event ? event.startMinutes : defaultEventStart(dateIso || anchor);
  const form = {
    title: event ? event.title : '',
    date: event ? event.date : (dateIso || anchor),
    startMinutes: start,
    endMinutes: event ? event.endMinutes : Math.min(1440, start + 60),
    allDay: event ? !!event.allDay : false,
    location: event ? (event.location || '') : '',
  };

  let errors = {};
  let dlg = null;
  const body = h('div');

  function paint() {
    const startInput = h('input', {
      type: 'time',
      disabled: form.allDay,
      value: formatTime(form.startMinutes),
      onchange: (e) => {
        const parsed = parseTimeInput(e.target.value);
        if (parsed !== null) form.startMinutes = parsed;
      },
    });
    const endInput = h('input', {
      type: 'time',
      disabled: form.allDay,
      value: formatTime(form.endMinutes),
      onchange: (e) => {
        const parsed = parseTimeInput(e.target.value);
        if (parsed !== null) form.endMinutes = parsed;
      },
    });

    replace(body,
      field({
        label: t('calendar.eventTitle'),
        error: errorText(errors.title),
        control: h('input', {
          type: 'text',
          value: form.title,
          oninput: (e) => { form.title = e.target.value; },
        }),
      }),
      field({
        label: t('tasks.scheduled'),
        error: errorText(errors.date),
        control: h('input', {
          type: 'date',
          value: form.date,
          onchange: (e) => { form.date = e.target.value || ''; },
        }),
      }),
      h('div.field-row',
        field({ label: t('calendar.starts'), error: errorText(errors.startMinutes), control: startInput }),
        field({ label: t('calendar.ends'), error: errorText(errors.endMinutes), control: endInput })),
      switchRow({
        label: t('calendar.allDay'),
        checked: form.allDay,
        onChange: (next) => {
          form.allDay = next;
          startInput.disabled = next;
          endInput.disabled = next;
        },
      }),
      field({
        label: t('calendar.location'),
        optional: true,
        error: errorText(errors.location),
        control: h('input', {
          type: 'text',
          value: form.location,
          oninput: (e) => { form.location = e.target.value; },
        }),
      }));
  }

  function save() {
    const payload = {
      title: form.title.trim(),
      date: form.date,
      startMinutes: form.startMinutes,
      endMinutes: form.endMinutes,
      allDay: form.allDay,
      location: form.location.trim(),
    };
    const result = event ? events.update(event.id, payload) : events.create(payload);
    if (!result.ok) {
      errors = result.errors || {};
      if (!Object.keys(errors).length) toastError(t('errors.generic'));
      paint();
      return false;
    }
    toast(event ? t('common.saved') : t('calendar.eventCreated'), { tone: 'ok' });
    rerender();
    return true;
  }

  async function destroy() {
    const yes = await confirmDestructive({ title: t('confirm.deleteEventTitle') });
    if (!yes) return;
    events.remove(event.id);
    toast(t('calendar.eventDeleted'));
    if (dlg) dlg.close();
    rerender();
  }

  paint();

  dlg = dialog({
    title: event ? t('calendar.editEvent') : t('calendar.newEvent'),
    body,
    actions: [
      /* Returning false keeps the dialog open while the confirmation runs on
       * top of it; destroy() closes it once the answer is yes. */
      event ? { label: t('common.delete'), kind: 'danger', onClick: () => { destroy(); return false; } } : null,
      { label: t('common.cancel') },
      { label: event ? t('common.save') : t('common.create'), kind: 'primary', onClick: save },
    ].filter(Boolean),
  });

  return dlg;
}

/* ------------------------------------------------------------------ *
 * Agenda
 * ------------------------------------------------------------------ */

function agendaEntryRow(entry) {
  return h('button.trow', {
    type: 'button',
    style: { width: '100%' },
    onclick: (e) => openEntry(entry, e.currentTarget),
  },
  h('div.shrink0.num', {
    style: { width: '96px', color: 'var(--ink-3)', fontSize: 'var(--t-xs)' },
  }, formatTimeRange(entry.start, entry.end)),
  h('div.grow.ellipsis',
    h('div.trow-title.ellipsis', {
      style: entry.done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : null,
    }, entryTitle(entry))),
  entry.kind === 'event'
    ? h('span.chip.chip-info.shrink0', icon('calendar', { size: 12 }), t('calendar.event'))
    : entry.blockKind === 'fixed'
      ? h('span.chip.shrink0', icon('lock', { size: 12 }), t('calendar.blockKinds.fixed'))
      : null);
}

function agendaView() {
  const days = agenda(anchor, AGENDA_DAYS);

  if (!days.length) {
    return emptyState({
      icon: 'calendar',
      title: t('calendar.emptyTitle'),
      note: t('calendar.emptyNote'),
      action: { label: t('calendar.newEvent'), onClick: () => openEventDialog(null, anchor) },
    });
  }

  return h('div.card.card-pad', days.map((info) => h('div.agenda-day', {
    class: info.date === todayIso() ? 'agenda-today' : null,
  },
  h('button.agenda-date', {
    type: 'button',
    'aria-label': formatDateWithDay(info.date),
    onclick: () => goTo(info.date, 'day'),
  },
  h('div.agenda-dow', dayName(info.date)),
  h('div.agenda-num', String(dayOfMonth(info.date)))),
  h('div.grow',
    info.allDayEvents.map((event) => h('button.trow', {
      type: 'button',
      style: { width: '100%' },
      onclick: () => openEventDialog(event, event.date),
    },
    h('div.shrink0.num', {
      style: { width: '96px', color: 'var(--ink-3)', fontSize: 'var(--t-xs)' },
    }, t('calendar.allDay')),
    h('div.grow.ellipsis', h('div.trow-title.ellipsis', event.title)))),
    info.entries.map(agendaEntryRow),
    info.unplaced.map((task) => h('button.trow', {
      type: 'button',
      style: { width: '100%' },
      onclick: () => openTaskEditor(task.id, rerender),
    },
    h('div.shrink0', { style: { width: '96px' } },
      h('span.chip', t('tasks.filterUnscheduled'))),
    h('div.grow.ellipsis', h('div.trow-title.ellipsis', task.title))))))));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

function timeView() {
  const snap = snapshot();
  const infos = view === 'week' ? week(anchor, 0).days : [day(anchor)];
  const out = h('div');

  const strip = allDayStrip(infos);
  if (strip) out.appendChild(strip);

  /* In week view the strip and the schedule dialog still belong to the day the
   * anchor names, not to the Sunday the week happens to start on. */
  const focused = infos.find((info) => info.date === anchor) || infos[0];
  if (view === 'day' && !focused.entries.length && !focused.allDayEvents.length
    && !focused.unplaced.length) {
    out.appendChild(emptyDayNotice());
  }

  out.appendChild(timeGrid(infos));
  out.appendChild(unscheduledStrip(focused) || h('span'));
  out.appendChild(conflictsSection(infos, snap) || h('span'));

  return out;
}

export function renderCalendar(onRerender, params) {
  rerender = onRerender || (() => {});

  /* A route param names a day once. After that the arrows own the anchor, and
   * a re-render must not drag the view back to whatever is in the URL. */
  const routeDate = params && params.date;
  if (routeDate && routeDate !== paramDate) {
    paramDate = routeDate;
    if (isValidIso(routeDate)) { anchor = routeDate; view = 'day'; }
  }
  if (!anchor) anchor = todayIso();

  const container = h('div', header());

  if (view === 'month') container.appendChild(monthView());
  else if (view === 'agenda') container.appendChild(agendaView());
  else container.appendChild(timeView());

  return container;
}
