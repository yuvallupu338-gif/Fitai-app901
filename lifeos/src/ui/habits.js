/*
 * habits.js — the screen that is not allowed to become a scoreboard.
 *
 * Every habit tracker ever built ends up saying the same thing: here is how
 * many times you failed. It happens by accident. You put the streak at the top
 * because it is the biggest number, you colour the missed days red because red
 * is what "not done" looks like, and within a month the screen's only message
 * is that the person reading it is not the person they meant to be.
 *
 * So the order here is deliberate, and it is the whole design:
 *
 *   1. what the habit is         — title, area, and the schedule in words
 *   2. what actually happened    — seven cells, one per day, all editable
 *   3. how it is going           — rate over 7 and 30 days, weekly average,
 *                                  direction of travel
 *   4. the streak                — last, quiet, and carrying the sentence that
 *                                  explains why it is only one number
 *
 * A missed day is an empty cell. It is not red, it does not carry a word, and
 * nothing anywhere counts it. The one sentence this screen will say about a
 * day that did not happen looks forward — see missedNote below.
 *
 * The minimum version is why the data model has an extra boolean, and it earns
 * it here: a day done small is a filled cell, not a gap.
 */

import {
  h, replace, dialog, field, chipGroup, confirmDestructive, popupMenu,
  emptyState, clockText,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import {
  weekDays, addDays, dayName, formatDate, formatTime, parseTimeInput,
} from '../core/time.js';
import { HABIT_FREQUENCIES } from '../domain/schema.js';
import { habitDueOn } from '../engine/recurrence.js';
import { snapshot } from '../services/core.js';
import { habits as habitsService } from '../services/rituals.js';
import { pageHeader, areaChip, durationChip } from './components.js';

const TREND_KEY = { up: 'habits.trendUp', flat: 'habits.trendFlat', down: 'habits.trendDown' };

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
 * Reading a habit
 * ------------------------------------------------------------------ */

/**
 * The schedule as a person would say it.
 *
 * `week` is a Sunday-first run of seven dates, so week[d] is the day whose
 * weekday number is d — which is exactly how `days` is stored.
 */
function frequencyWords(habit, week) {
  if (habit.frequency === 'weekly') return plural('count.timesPerWeek', habit.target || 7);
  if (habit.frequency === 'specific_days') {
    const days = (habit.days || []).slice().sort((a, b) => a - b);
    if (!days.length) return t('habits.frequencies.specific_days');
    return days.map((d) => dayName(week[d])).join(', ');
  }
  return t('habits.frequencies.daily');
}

/**
 * Seven cells, one per day of the current week.
 *
 * Each one is a real button: the fastest way to fix a day you forgot to tick
 * is to tick it where you noticed it was missing. Days that have not arrived
 * are disabled rather than merely dimmed, because a habit you cannot have done
 * yet is not a habit you failed to do.
 */
function weekStrip(habit, byDate, week, todayDate) {
  return h('div.habit-week', { role: 'group', 'aria-label': t('time.thisWeek') },
    week.map((day) => {
      const entry = byDate.get(day);
      const future = day > todayDate;
      const state = entry
        ? (entry.minimum ? t('habits.completedMinimum') : t('habits.completedToday'))
        : null;

      return h('button.habit-cell', {
        type: 'button',
        class: entry
          ? (entry.minimum ? 'habit-cell-min' : 'habit-cell-done')
          : (future ? 'habit-cell-future' : null),
        disabled: future,
        'aria-pressed': entry ? 'true' : 'false',
        'aria-label': dayName(day),
        title: state
          ? `${formatDate(day, { noYear: true })} · ${state}`
          : formatDate(day, { noYear: true }),
        /* Passing back the kind that is already there makes the service treat
         * the click as un-ticking, so every cell is a plain toggle rather than
         * a three-step cycle through the minimum version. */
        onclick: () => {
          habitsService.complete(habit.id, { minimum: !!(entry && entry.minimum), date: day });
          rerender();
        },
      },
      /* Fill alone would leave "done" and "done small" separated by colour and
       * nothing else, so each recorded state gets its own glyph and the day
       * letter stays in place while there is nothing to show. */
      entry
        ? icon(entry.minimum ? 'minus' : 'check', { size: 13, weight: 3 })
        : dayName(day, true));
    }));
}

/**
 * The only sentence on this screen about a day that did not happen, and it is
 * about today rather than yesterday.
 *
 * A weekly-target habit is exempt: "not yesterday" means nothing when the
 * target is a count across the week, and saying it anyway would be inventing
 * the guilt this file exists to avoid.
 */
function missedNote(habit, byDate, todayDate) {
  if (habit.frequency === 'weekly') return null;
  const yesterday = addDays(todayDate, -1);
  if (!habitDueOn(habit, yesterday)) return null;
  if (byDate.has(yesterday) || byDate.has(todayDate)) return null;
  return h('p.tiny.quiet', { style: { marginBlockStart: '10px' } }, t('habits.missedNote'));
}

function metricsRow(stats) {
  const trend = stats.trend === 'unknown'
    ? t('habits.notEnoughData')
    : `${t('habits.trend')}: ${t(TREND_KEY[stats.trend])}`;

  return h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('span.chip', `${stats.rate7.pct}% · ${t('habits.rate7')}`),
    h('span.chip', `${stats.rate30.pct}% · ${t('habits.rate30')}`),
    h('span.chip', `${stats.weeklyAverage} · ${t('habits.weeklyAvg')}`),
    h('span.chip', trend),
    /* Last, quiet, and only when there is one — "0 ימים ברצף" is a sentence
     * with no use except to disappoint, and the note explains in one line why
     * this number is not the headline. */
    stats.streak > 0
      ? h('span.chip.quiet', { title: t('habits.streakNote') },
        icon('flame', { size: 12 }), plural('count.daysStreak', stats.streak))
      : null);
}

function todayActions(habit, stats) {
  const entry = stats.todayEntry;

  if (stats.doneToday) {
    return [
      h('span.chip.chip-ok', icon('check', { size: 12 }),
        entry && entry.minimum ? t('habits.completedMinimum') : t('habits.doneToday')),
      h('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        onclick: () => {
          habitsService.complete(habit.id, { minimum: !!(entry && entry.minimum) });
          rerender();
        },
      }, t('habits.undoToday')),
    ];
  }

  return [
    h('button.btn.btn-sm.btn-secondary', {
      type: 'button',
      onclick: () => {
        habitsService.complete(habit.id, { minimum: false });
        toast(t('habits.completedToday'), { tone: 'ok' });
        rerender();
      },
    }, icon('check', { size: 14 }), t('habits.markDone')),
    habit.minimumVersion
      ? h('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        title: habit.minimumVersion,
        onclick: () => {
          habitsService.complete(habit.id, { minimum: true });
          toast(t('habits.completedMinimum'), { tone: 'ok' });
          rerender();
        },
      }, t('habits.doMinimum'))
      : null,
  ];
}

function habitMenu(habit, anchor) {
  popupMenu(anchor, [
    { label: t('common.edit'), icon: 'edit', onClick: () => openHabitEditor(habit.id) },
    { separator: true },
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => removeHabit(habit) },
  ]);
}

function habitCard(detail, week, todayDate) {
  const habit = detail.habit;
  const stats = detail.stats;
  const byDate = new Map(detail.completions.map((c) => [c.date, c]));

  return h('div.card.card-pad',
    h('div.row-between',
      h('div.grow.ellipsis',
        h('h4.ellipsis', habit.title),
        habit.regularVersion
          ? h('p.tiny.quiet.ellipsis', { style: { marginBlockStart: '3px' } }, habit.regularVersion)
          : null,
        h('div.row.wrap-flex', { style: { marginBlockStart: '8px' } },
          areaChip(detail.area),
          h('span.chip', icon('habit', { size: 12 }), frequencyWords(habit, week)),
          habit.preferredTime === null || habit.preferredTime === undefined
            ? null
            : h('span.chip', icon('clock', { size: 12 }), clockText(formatTime(habit.preferredTime))),
          durationChip(habit.estimatedMinutes))),
      h('button.btn-icon.shrink0', {
        type: 'button',
        'aria-label': t('common.actions'),
        onclick: (e) => habitMenu(habit, e.currentTarget),
      }, icon('more'))),

    h('div', { style: { marginBlockStart: 'var(--sp-4)' } },
      weekStrip(habit, byDate, week, todayDate)),

    missedNote(habit, byDate, todayDate),
    metricsRow(stats),

    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
      todayActions(habit, stats)));
}

/* ------------------------------------------------------------------ *
 * The habit form
 * ------------------------------------------------------------------ */

function openHabitEditor(habitId) {
  const existing = habitId ? habitsService.byId(habitId) : null;
  if (habitId && !existing) { toastError(t('errors.notFound')); return null; }

  const snap = snapshot();
  const week = weekDays(snap.today, 0);

  const form = {
    title: existing ? existing.title : '',
    areaId: existing ? existing.areaId || null : null,
    frequency: existing ? existing.frequency : 'daily',
    target: existing && existing.target ? existing.target : 3,
    days: existing ? (existing.days || []).slice() : [],
    preferredTime: existing ? existing.preferredTime : null,
    regularVersion: existing ? existing.regularVersion || '' : '',
    minimumVersion: existing ? existing.minimumVersion || '' : '',
    estimatedMinutes: existing ? existing.estimatedMinutes : 15,
  };
  let errors = {};

  const gap = { style: { marginBlockStart: 'var(--sp-4)' } };
  const hosts = { title: h('div'), target: h('div'), days: h('div') };

  function labelled(label, control) {
    return h('div.field', h('div.field-label', label), control);
  }

  function paintTitle() {
    replace(hosts.title, field({
      label: t('habits.titleField'),
      error: errorText(errors.title),
      control: h('input', {
        type: 'text',
        value: form.title,
        maxlength: '100',
        placeholder: t('habits.titlePlaceholder'),
        oninput: (e) => { form.title = e.target.value; },
      }),
    }));
  }

  /* A weekly habit is "four times this week"; a specific-days habit is "Sunday
   * and Wednesday". Only one of the two questions is ever the right one to
   * ask, so only one of them is on screen. */
  function paintTarget() {
    if (form.frequency !== 'weekly') { replace(hosts.target); return; }
    replace(hosts.target, h('div', gap, field({
      label: t('habits.target'),
      error: errorText(errors.target),
      control: h('input', {
        type: 'number',
        min: '1',
        max: '7',
        step: '1',
        value: String(form.target),
        oninput: (e) => {
          const n = Number(e.target.value);
          form.target = Number.isFinite(n) ? n : 0;
        },
      }),
    })));
  }

  function paintDays() {
    if (form.frequency !== 'specific_days') { replace(hosts.days); return; }
    const group = h('div.row.wrap-flex', { role: 'group', 'aria-label': t('habits.days') },
      /* The week runs Sunday-first, so the array index is the weekday number
       * the record stores — no lookup table between the two. */
      week.map((day, index) => {
        const toggle = h('button.chip.chip-select', {
          type: 'button',
          'aria-pressed': form.days.includes(index) ? 'true' : 'false',
          onclick: () => {
            const at = form.days.indexOf(index);
            if (at === -1) form.days.push(index); else form.days.splice(at, 1);
            toggle.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
          },
        }, dayName(day));
        return toggle;
      }));
    replace(hosts.days, h('div', gap, labelled(t('habits.days'), group)));
  }

  paintTitle();
  paintTarget();
  paintDays();

  function save() {
    const payload = {
      title: form.title.trim(),
      areaId: form.areaId || null,
      frequency: form.frequency,
      target: form.frequency === 'weekly' ? form.target : 7,
      /* Carrying a stale day list across a frequency change would leave the
       * record claiming a schedule the screen no longer shows. */
      days: form.frequency === 'specific_days' ? form.days.slice().sort((a, b) => a - b) : [],
      preferredTime: form.preferredTime,
      regularVersion: form.regularVersion.trim(),
      minimumVersion: form.minimumVersion.trim(),
      estimatedMinutes: form.estimatedMinutes,
      status: existing ? existing.status : 'active',
    };

    const result = existing
      ? habitsService.update(existing.id, payload)
      : habitsService.create(payload);

    if (!result.ok) {
      errors = result.errors || {};
      paintTitle();
      paintTarget();
      /* Only two fields repaint with an inline message, so anything else the
       * schema objected to is said out loud rather than swallowed. */
      const other = errors['']
        || Object.keys(errors).filter((k) => k !== 'title' && k !== 'target').map((k) => errors[k])[0];
      if (other) toastError(errorText(other));
      return false;
    }
    toast(t(existing ? 'habits.updated' : 'habits.created'), { tone: 'ok' });
    rerender();
    return true;
  }

  return dialog({
    title: t(existing ? 'habits.editHabit' : 'habits.newHabit'),
    wide: true,
    initialFocus: 'input',
    body: [
      hosts.title,
      h('div', gap, field({
        label: t('areas.one'),
        optional: true,
        control: h('select', {
          onchange: (e) => { form.areaId = e.target.value || null; },
        },
        h('option', { value: '' }, t('common.unassigned')),
        snap.areas.map((a) => h('option', {
          value: a.id, selected: a.id === form.areaId,
        }, a.title))),
      })),
      h('div', gap, labelled(t('habits.frequency'), chipGroup({
        label: t('habits.frequency'),
        value: form.frequency,
        options: HABIT_FREQUENCIES.map((f) => ({
          value: f, label: t(`habits.frequencies.${f}`),
        })),
        onChange: (value) => { form.frequency = value; paintTarget(); paintDays(); },
      }))),
      hosts.target,
      hosts.days,
      h('div', gap, field({
        label: t('habits.preferredTime'),
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
      h('div', gap, field({
        label: t('habits.regular'),
        optional: true,
        control: h('input', {
          type: 'text',
          value: form.regularVersion,
          maxlength: '120',
          placeholder: t('habits.regularPlaceholder'),
          oninput: (e) => { form.regularVersion = e.target.value; },
        }),
      })),
      h('div', gap, field({
        label: t('habits.minimum'),
        optional: true,
        hint: t('habits.minimumHint'),
        control: h('input', {
          type: 'text',
          value: form.minimumVersion,
          maxlength: '120',
          placeholder: t('habits.minimumPlaceholder'),
          oninput: (e) => { form.minimumVersion = e.target.value; },
        }),
      })),
      h('div', gap, field({
        label: t('tasks.estimateCustomLabel'),
        control: h('input', {
          type: 'number',
          min: '0',
          max: '480',
          step: '5',
          value: String(form.estimatedMinutes),
          oninput: (e) => {
            const n = Number(e.target.value);
            form.estimatedMinutes = Number.isFinite(n) ? n : 0;
          },
        }),
      })),
    ],
    actions: [
      { label: t('common.cancel') },
      { label: t(existing ? 'common.save' : 'common.create'), kind: 'primary', onClick: save },
    ],
  });
}

async function removeHabit(habit) {
  const yes = await confirmDestructive({
    title: t('confirm.deleteHabitTitle'),
    note: t('confirm.deleteHabitNote'),
  });
  if (!yes) return;
  habitsService.remove(habit.id);
  toast(t('habits.deleted'));
  rerender();
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderHabits(onRerender) {
  rerender = onRerender;

  const snap = snapshot();
  /* Sunday-first regardless of the planning week start: the strip is read as a
   * shape, and a shape is only comparable between two habits when the columns
   * mean the same day on every card. */
  const week = weekDays(snap.today, 0);
  const list = habitsService.active();

  const container = h('div', pageHeader(t('habits.title'), {
    actions: [
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openHabitEditor(null),
      }, icon('plus', { size: 16 }), t('habits.newHabit')),
    ],
  }));

  if (!list.length) {
    container.appendChild(emptyState({
      icon: 'habit',
      title: t('habits.emptyTitle'),
      note: t('habits.emptyNote'),
      action: { label: t('habits.newHabit'), onClick: () => openHabitEditor(null) },
    }));
    return container;
  }

  container.appendChild(h('div.stack',
    list.map((habit) => habitCard(habitsService.detail(habit.id), week, snap.today))));

  return container;
}
