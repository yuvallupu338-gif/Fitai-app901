/*
 * review.js — the sit-down at the end of a week, and at the end of a month.
 *
 * THE NUMBERS ARE READ-ONLY AND THE WORDS ARE NOT.
 *
 * Everything above the fold is recomputed from the event log every time this
 * screen opens — insights.js recomputes rather than stores, so a review of a
 * week from a month ago tells the truth about that week even after tasks were
 * deleted or durations corrected. What gets saved is only what a person wrote:
 * the reflection, the focus for next period, the decisions. Those are facts
 * about them, and there is nothing to recompute them from.
 *
 * WHY THE ASSISTANT IS A BUTTON AND NOT A SPINNER.
 *
 * The summary is written locally the moment the screen paints, from the same
 * numbers shown above it. If an assistant is configured, one button re-phrases
 * it — and the result lands as a proposal next to a copy button, never straight
 * into the reflection field. A person's own review is not something an app gets
 * to fill in for them; it is allowed to offer a draft.
 *
 * The period comes from the route (/review/week, /review/month). Which week is
 * being looked at does not: it is module state, because a person navigating
 * back through four weeks is browsing, not addressing.
 */

import { h, replace, qsa, emptyState, field, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import { toast, toastError } from '../core/toast.js';
import { go, href } from '../core/router.js';
import {
  today as todayIso, addDays, addMonths, formatDate, formatDuration,
  formatMonthYear, formatAgo, dayName,
} from '../core/time.js';
import { snapshot } from '../services/core.js';
import * as insights from '../services/insights.js';
import { summarizeWeek as localSummary } from '../ai/rules.js';
import * as ai from '../ai/provider.js';
import {
  pageHeader, statGrid, stat, healthChip, originNote,
} from './components.js';
import { openTaskEditor, openSplitDialog } from './taskeditor.js';

let anchor = null;
let anchorPeriod = null;
let rerender = () => {};

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

const gap = { style: { marginBlockStart: 'var(--sp-4)' } };

function section(title, note, body) {
  return h('section.section',
    h('div.section-head',
      h('h2.section-title', title),
      note ? h('span.section-note', note) : null),
    body);
}

/** Bar heights in pixels: the columns are not stretched, so a percentage has
 * no parent height to resolve against and every bar would sit at its minimum. */
function barChart(items) {
  const max = items.reduce((m, item) => Math.max(m, item.value), 0);
  return h('div.chart-bars', items.map((item) => h('div.chart-bar-col', {
    role: 'img',
    'aria-label': item.title,
    title: item.title,
  },
  h('div.chart-bar', {
    class: item.value > 0 ? null : 'chart-bar-quiet',
    style: { height: `${max > 0 ? Math.max(2, Math.round((item.value / max) * 92)) : 2}px` },
  }),
  h('div.chart-bar-label', item.label))));
}

function areaColor(area) {
  return area ? `var(--${area.color})` : 'var(--ink-3)';
}

function areaTitle(area) {
  return area ? area.title : t('common.unassigned');
}

function errorText(errors) {
  const first = errors ? Object.keys(errors).map((k) => errors[k])[0] : null;
  if (!first) return t('errors.saveFailed');
  if (first.code === 'max') return t('errors.tooLong', { n: first.max });
  return t('errors.generic');
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function periodLabel(period, bounds) {
  if (period === 'month') return formatMonthYear(bounds.from);
  /* Not direction-isolated: in an RTL line the earlier date lands on the right,
   * which is the order it is read in. */
  return `${formatDate(bounds.from, { short: true })} – ${formatDate(bounds.to, { short: true })}`;
}

function header(period, bounds, isCurrent) {
  const segmented = h('div.segmented', { role: 'group', 'aria-label': t('review.period') },
    [
      { key: 'week', label: 'review.weekly' },
      { key: 'month', label: 'review.monthly' },
    ].map((option) => h('button', {
      type: 'button',
      'aria-pressed': period === option.key ? 'true' : 'false',
      onclick: () => go(`/review/${option.key}`),
    }, t(option.label))));

  const nav = h('div.row',
    h('button.btn-icon', {
      type: 'button',
      'aria-label': t('calendar.prevPeriod'),
      onclick: () => {
        anchor = period === 'month' ? addMonths(anchor, -1) : addDays(anchor, -7);
        rerender();
      },
    }, icon('prev')),
    isCurrent
      ? null
      : h('button.btn.btn-sm.btn-secondary', {
        type: 'button',
        onclick: () => { anchor = todayIso(); rerender(); },
      }, t(period === 'month' ? 'time.thisMonth' : 'time.thisWeek')),
    /* Forward stops at the period being lived through: there is nothing to
     * review about a week that has not happened. */
    h('button.btn-icon', {
      type: 'button',
      'aria-label': t('calendar.nextPeriod'),
      disabled: isCurrent,
      onclick: () => {
        anchor = period === 'month' ? addMonths(anchor, 1) : addDays(anchor, 7);
        rerender();
      },
    }, icon('next')));

  return h('div', { style: { marginBlockEnd: '18px' } },
    h('div.row-between.wrap-flex',
      h('div',
        h('h1', { style: { fontSize: 'var(--t-xl)' } },
          t(period === 'month' ? 'review.yourMonth' : 'review.yourWeek')),
        h('p.tiny.quiet', { style: { marginBlockStart: '4px' } }, periodLabel(period, bounds))),
      h('div.row.wrap-flex', segmented, nav)));
}

/* ------------------------------------------------------------------ *
 * The numbers
 * ------------------------------------------------------------------ */

function statsGrid(stats, extra) {
  const tiles = [
    stat(stats.tasksCompleted, t('review.tasksCompleted')),
    stat(formatDuration(stats.focusMinutes), t('review.focusTime'), {
      note: plural('count.sessions', stats.focusSessions),
    }),
    stat(stats.milestonesCompleted, t('review.milestonesHit')),
  ];

  if (extra) tiles.push(extra);

  tiles.push(stat(`${stats.calendarLoad}%`, t('review.calendarLoad')));

  if (stats.deadlinesDue > 0) {
    tiles.push(stat(
      t('projects.milestonesProgress', { done: stats.deadlinesMet, total: stats.deadlinesDue }),
      t('review.deadlinesMet'),
    ));
  }
  if (stats.habitRate !== null) {
    tiles.push(stat(`${stats.habitRate}%`, t('review.habitsRate')));
  }

  return statGrid(tiles);
}

function daysChart(stats, period) {
  const total = stats.byDay.reduce((sum, day) => sum + day.completed, 0);
  if (total === 0) return null;

  const items = stats.byDay.map((day, index) => ({
    /* A month has too many columns for a label under each one, so only every
     * fifth day is named and the rest keep their place with a blank. */
    label: period === 'month'
      ? (index % 5 === 0 ? String(Number(day.date.slice(8))) : ' ')
      : dayName(day.date, true),
    value: day.completed,
    title: `${formatDate(day.date, { noYear: true })} · ${plural('count.tasksDone', day.completed)}`,
  }));

  return section(t('progress.tasksByDay'), null, h('div.card.card-pad', barChart(items)));
}

function biggestMoveCard(move) {
  if (!move) return null;
  return h('div.card.card-pad',
    h('div.eyebrow', t('progress.biggestMove')),
    h('a.card-click', {
      href: href(`/projects/${move.project.id}`),
      style: { display: 'block', marginBlockStart: '6px' },
    }, h('h4', move.project.title)),
    h('div.row.wrap-flex', { style: { marginBlockStart: '8px' } },
      move.tasks > 0 ? h('span.chip', icon('check', { size: 12 }), plural('count.tasks', move.tasks)) : null,
      move.milestones > 0
        ? h('span.chip', icon('flag', { size: 12 }), plural('count.milestones', move.milestones))
        : null,
      move.minutes > 0 ? h('span.chip', icon('clock', { size: 12 }), formatDuration(move.minutes)) : null));
}

function attentionCard(rows) {
  if (!rows || !rows.length) return null;
  return h('div.card.card-pad',
    h('div.eyebrow', t('progress.needsAttention')),
    h('div.stack-tight', { style: { marginBlockStart: '8px' } },
      rows.map((row) => h('div.row-between',
        h('a.grow.ellipsis', { href: href(`/projects/${row.project.id}`) }, row.project.title),
        healthChip(row.health)))));
}

/**
 * Time against declared priority.
 *
 * Only for the period being lived through: goalAlignment measures from today
 * backwards, so pinning it under a review of a month ago would put this
 * month's answer under last month's heading.
 */
function alignmentCard(alignment, isCurrent) {
  if (!isCurrent || !alignment || !alignment.ok || !alignment.misaligned) return null;
  const periodWord = t(alignment.period === 'week' ? 'goals.alignmentPeriodWeek' : 'goals.alignmentPeriodMonth');

  return h('div.card.card-pad',
    h('div.eyebrow', t('goals.alignmentTitle')),
    h('div.stack-tight', { style: { marginBlockStart: '8px' } },
      alignment.starved.map((row) => h('div',
        h('a', { href: href(`/goals/${row.goal.id}`) }, row.goal.title),
        h('p.tiny.quiet', { style: { marginBlockStart: '3px' } },
          row.minutes > 0
            ? t('goals.alignmentLow', { period: periodWord })
            : t('goals.alignmentNone', { period: periodWord })),
        row.minutes > 0
          ? h('div.row', { style: { marginBlockStart: '4px' } },
            h('span.chip', icon('clock', { size: 12 }), formatDuration(row.minutes)))
          : null))));
}

/**
 * Tasks that keep getting pushed.
 *
 * Read from the tasks as they stand rather than from the period, so it only
 * belongs under the week being lived through — "this one is stuck" is a fact
 * about now, and printing it under a review of July would date it wrongly.
 */
function stuckSection(tasks, isCurrent) {
  if (!isCurrent || !tasks || !tasks.length) return null;
  return section(t('tasks.stuckTitle'), null,
    h('div.card.card-flat', { style: { overflow: 'hidden' } },
      tasks.map((task) => h('div.trow',
        h('div.grow',
          h('div.trow-title', task.title),
          h('div.tiny.quiet', { style: { marginBlockStart: '3px' } },
            t('tasks.stuckNote', {
              postponed: plural('count.postponed', task.postponeCount || 0),
            }))),
        h('div.row.shrink0',
          h('button.btn.btn-sm.btn-ghost', {
            type: 'button',
            onclick: () => openSplitDialog(task.id, rerender),
          }, t('tasks.stuckSplit')),
          h('button.btn.btn-sm.btn-secondary', {
            type: 'button',
            onclick: () => openTaskEditor(task.id, rerender),
          }, t('common.details')))))));
}

function allocationCard(stats, snap) {
  const rows = [];
  let total = 0;
  for (const [areaId, minutes] of stats.timeByArea) {
    if (minutes <= 0) continue;
    total += minutes;
    rows.push({ area: snap.areasById.get(areaId) || null, minutes });
  }
  if (total === 0) return h('div.card.card-pad', h('p.quiet', t('progress.noTimeData')));

  rows.sort((a, b) => b.minutes - a.minutes);
  for (const row of rows) row.pct = Math.round((row.minutes / total) * 100);

  return h('div.card.card-pad',
    h('p.tiny.quiet', { style: { marginBlockEnd: '10px' } },
      t('routines.totalTime', { time: formatDuration(total) })),
    h('div.bar-stack', { role: 'img', 'aria-label': t('progress.timeAllocation') },
      rows.map((row) => h('div.bar-seg', {
        style: { width: `${row.pct}%`, background: areaColor(row.area) },
        title: `${areaTitle(row.area)} · ${formatDuration(row.minutes)}`,
      }))),
    h('div.legend', { style: { marginBlockStart: 'var(--sp-3)' } },
      rows.map((row) => h('span.legend-item',
        h('span.dot', { style: { background: areaColor(row.area) } }),
        `${areaTitle(row.area)} · ${row.pct}%`))));
}

function calibrationCard(calibration) {
  const text = calibration.ok === false
    ? t('progress.estimateNotEnough')
    : calibration.verdict === 'over'
      ? t('progress.estimateOver', { pct: calibration.driftPct })
      : calibration.verdict === 'under'
        ? t('progress.estimateUnder', { pct: calibration.driftPct })
        : t('progress.estimateAccurate');

  return h('div.card.card-pad',
    h('div.eyebrow', t('progress.estimateAccuracy')),
    h('p', { style: { marginBlockStart: '8px' } }, text),
    h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
      t('progress.basedOn', { n: plural('count.sessions', calibration.sampleSize) })));
}

function goalMovementCard(title, rows) {
  if (!rows.length) return null;
  return h('div.card.card-pad',
    h('div.eyebrow', title),
    h('div.stack-tight', { style: { marginBlockStart: '8px' } },
      rows.map((row) => h('div.row-between.wrap-flex',
        h('a.grow.ellipsis', { href: href(`/goals/${row.goal.id}`) }, row.goal.title),
        h('div.row.wrap-flex.shrink0',
          row.movement.tasksDone > 0
            ? h('span.chip', icon('check', { size: 12 }), plural('count.tasks', row.movement.tasksDone))
            : null,
          row.movement.milestonesDone > 0
            ? h('span.chip', icon('flag', { size: 12 }), plural('count.milestones', row.movement.milestonesDone))
            : null,
          row.movement.focusMinutes > 0
            ? h('span.chip', icon('focus', { size: 12 }), formatDuration(row.movement.focusMinutes))
            : null,
          h('span.chip.quiet.num', `${row.progress.pct}%`))))));
}

function projectsDoneCard(projects) {
  if (!projects.length) return null;
  return h('div.card.card-pad',
    h('div.eyebrow', t('progress.projectsDone')),
    h('div.stack-tight', { style: { marginBlockStart: '8px' } },
      projects.map((project) => h('a.row', { href: href(`/projects/${project.id}`) },
        icon('check', { size: 14 }),
        h('span.grow.ellipsis', project.title)))));
}

/* ------------------------------------------------------------------ *
 * The written part — the only thing on this screen that is stored
 * ------------------------------------------------------------------ */

function writtenSection(review, period) {
  const stored = review.stored;

  const reflection = h('textarea', {
    rows: '5',
    maxlength: '4000',
    placeholder: t('review.reflectionPlaceholder'),
  }, stored ? stored.reflection || '' : '');

  const nextFocus = h('input', {
    type: 'text',
    maxlength: '300',
    value: stored ? stored.nextFocus || '' : '',
  });

  const decisionsHost = h('div.stack-tight');
  let decisions = stored && stored.decisions ? stored.decisions.slice() : [];

  /* The fields are the state. Reading them back before every rebuild is what
   * keeps a half-typed decision alive when the row above it is removed. */
  function readDecisions() {
    decisions = qsa('input', decisionsHost).map((input) => input.value);
    return decisions;
  }

  function paintDecisions(focusLast) {
    replace(decisionsHost, decisions.map((text, index) => h('div.row',
      h('input.grow', {
        type: 'text',
        maxlength: '300',
        value: text,
        'aria-label': t('review.decisions'),
      }),
      h('button.btn-icon.shrink0', {
        type: 'button',
        'aria-label': t('common.remove'),
        onclick: () => { readDecisions().splice(index, 1); paintDecisions(false); },
      }, icon('x')))));

    if (!focusLast) return;
    const inputs = qsa('input', decisionsHost);
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  paintDecisions(false);

  function save() {
    const result = insights.saveReview(period, review.bounds, {
      reflection: reflection.value.trim(),
      nextFocus: nextFocus.value.trim(),
      decisions: readDecisions().map((d) => d.trim()).filter(Boolean),
    });
    if (!result.ok) {
      toastError(errorText(result.errors));
      return;
    }
    toast(t('review.saved'), { tone: 'ok' });
    rerender();
  }

  /** Used by the summary card: a draft is added to what is already written,
   * never over it. */
  function applyText(text) {
    if (!text) return;
    const existing = reflection.value.trim();
    reflection.value = existing ? `${existing}\n${text}` : text;
    reflection.focus();
    toast(t('common.copied'));
  }

  /* No heading over this card: the first field's label already says what it is,
   * and repeating it turns the top of the card into the same words twice. */
  const node = h('section.section',
    h('div.card.card-pad',
      field({ label: t('review.reflection'), control: reflection }),
      h('div', gap, field({
        label: t(period === 'month' ? 'review.nextFocusMonth' : 'review.nextFocus'),
        control: nextFocus,
      })),
      h('div', gap,
        h('div.field-label', t('review.decisions')),
        decisionsHost,
        h('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          style: { marginBlockStart: 'var(--sp-2)' },
          onclick: () => { readDecisions().push(''); paintDecisions(true); },
        }, icon('plus', { size: 14 }), t('common.add'))),
      h('div.row-between', { style: { marginBlockStart: 'var(--sp-5)' } },
        h('button.btn.btn-primary', { type: 'button', onclick: save }, t('common.save')),
        stored
          ? h('span.tiny.quiet', `${t('common.saved')} · ${formatAgo(stored.updatedAt)}`)
          : null)));

  return { node, applyText };
}

/* ------------------------------------------------------------------ *
 * The summary — local first, a model only when asked
 * ------------------------------------------------------------------ */

/**
 * The monthly review carries different fields from the weekly one, and both the
 * rules summariser and the provider read the weekly shape. Filling in the two
 * missing keys here is cheaper than a second summariser that would drift.
 */
function summaryInput(review, snap) {
  if (review.period === 'week') return review;
  return Object.assign({}, review, {
    biggestMove: review.stats.projectMovement[0] || null,
    needsAttention: snap.projects
      .filter((p) => p.status !== 'done')
      .map((p) => ({ project: p, health: snap.health.get(p.id) }))
      .filter((row) => row.health && (row.health.health === 'at_risk' || row.health.health === 'blocked'))
      .slice(0, 3),
  });
}

function summaryCard(input, written) {
  const host = h('div');

  function draftText(result) {
    return [
      result.headline,
      ...(result.lines || []),
      result.nextFocus ? `${t('review.nextFocus')}: ${result.nextFocus}` : null,
    ].filter(Boolean).join('\n');
  }

  function generateButton(origin) {
    if (!ai.status().usable) return null;
    const button = h('button.btn.btn-sm.btn-ghost', {
      type: 'button',
      onclick: async () => {
        button.disabled = true;
        button.textContent = t('ai.thinking');
        try {
          const result = await ai.summarizeWeek(input);
          if (!host.isConnected) return;
          if (!result || result.error) {
            toastError(t('ai.errGeneric'));
            /* The local summary is still correct, so repaint it rather than
             * leaving a disabled button over a half-updated card. */
            paint(localSummary(input));
            return;
          }
          paint(result);
          announce(t('ai.suggestion'));
        } catch (e) {
          if (!host.isConnected) return;
          toastError(t('ai.errGeneric'));
          paint(localSummary(input));
        }
      },
    }, icon('sparkle', { size: 14 }), t(origin === 'model' ? 'review.regenerate' : 'review.generate'));
    return button;
  }

  function paint(result) {
    const draft = draftText(result);
    replace(host,
      result.headline
        ? h('p', { style: { fontWeight: '500' } }, result.headline)
        : null,
      (result.lines || []).map((line) => h('p.tiny', {
        style: { color: 'var(--ink-2)', marginBlockStart: '4px' },
      }, line)),
      result.attention
        ? h('p.tiny.quiet', { style: { marginBlockStart: '6px' } }, result.attention)
        : null,
      result.nextFocus
        ? h('p.tiny', { style: { marginBlockStart: '6px' } },
          `${t('review.nextFocus')}: ${result.nextFocus}`)
        : null,
      originNote(result.origin),
      h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
        draft
          ? h('button.btn.btn-sm.btn-secondary', {
            type: 'button',
            onclick: () => written.applyText(draft),
          }, icon('copy', { size: 14 }), t('common.copy'))
          : null,
        generateButton(result.origin)));
  }

  paint(localSummary(input));

  return h('div.card.card-pad', host);
}

/* ------------------------------------------------------------------ *
 * The two reviews
 * ------------------------------------------------------------------ */

function weeklyBody(review, snap, isCurrent) {
  const stats = review.stats;
  const written = writtenSection(review, 'week');

  if (stats.empty) {
    return [
      h('div.notice', t('review.nothingThisWeek')),
      alignmentCard(review.alignment, isCurrent),
      stuckSection(review.stuck, isCurrent),
      written.node,
    ];
  }

  return [
    statsGrid(stats),
    h('div.stack', { style: { marginBlockStart: 'var(--sp-5)' } },
      biggestMoveCard(review.biggestMove),
      attentionCard(review.needsAttention),
      alignmentCard(review.alignment, isCurrent)),
    stuckSection(review.stuck, isCurrent),
    daysChart(stats, 'week'),
    section(t('review.weekly'), null, summaryCard(summaryInput(review, snap), written)),
    written.node,
  ];
}

function monthlyBody(review, snap, isCurrent) {
  const stats = review.stats;
  const written = writtenSection(review, 'month');

  if (stats.empty) {
    return [
      h('div.notice', t('review.nothingThisMonth')),
      alignmentCard(review.alignment, isCurrent),
      written.node,
    ];
  }

  return [
    statsGrid(stats, stat(review.projectsCompleted.length, t('progress.projectsDone'))),
    h('div.stack', { style: { marginBlockStart: 'var(--sp-5)' } },
      goalMovementCard(t('progress.goalsMoved'), review.goalsMoved),
      goalMovementCard(t('progress.goalsStuck'), review.goalsStuck),
      projectsDoneCard(review.projectsCompleted)),
    section(t('progress.timeAllocation'), null, allocationCard(stats, snap)),
    h('div.stack',
      calibrationCard(review.calibration),
      alignmentCard(review.alignment, isCurrent)),
    daysChart(stats, 'month'),
    section(t('review.monthly'), null, summaryCard(summaryInput(review, snap), written)),
    written.node,
  ];
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderReview(onRerender, params) {
  rerender = onRerender || (() => {});

  const period = params && params.period === 'month' ? 'month' : 'week';
  /* Switching week↔month returns to the current period: the anchor from four
   * weeks ago names a month nobody asked to look at. */
  if (period !== anchorPeriod || !anchor) {
    anchor = todayIso();
    anchorPeriod = period;
  }

  const snap = snapshot();
  const review = period === 'month' ? insights.monthlyReview(anchor) : insights.weeklyReview(anchor);
  const today = todayIso();
  const isCurrent = today >= review.bounds.from && today <= review.bounds.to;

  const container = h('div');

  /* An account with nothing in it yet: a period summary of zeroes says less
   * than one sentence about why it is empty. */
  if (!snap.tasks.length && !snap.projects.length && !snap.goals.length && !snap.focusSessions.length) {
    container.appendChild(pageHeader(t('review.title')));
    container.appendChild(emptyState({
      icon: 'review',
      title: t('review.emptyTitle'),
      note: t('review.emptyNote'),
    }));
    return container;
  }

  container.appendChild(header(period, review.bounds, isCurrent));
  for (const node of (period === 'month'
    ? monthlyBody(review, snap, isCurrent)
    : weeklyBody(review, snap, isCurrent))) {
    if (node) container.appendChild(node);
  }

  return container;
}
