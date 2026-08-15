/*
 * progress.js — the screen that reports, and does not flatter.
 *
 * Six questions, six tabs, and every number on all of them is recomputed by
 * insights.js at the moment the tab is painted. Nothing here keeps a statistic
 * of its own, and nothing here invents one: if a tab has no data it says so in
 * a sentence.
 *
 * AN EMPTY CHART IS NOT AN HONEST RENDERING OF NO DATA.
 *
 * Fourteen zero-height bars read as a bad fortnight, which is a claim about a
 * person. "עוד לא נרשם זמן" is the true statement, and it is also the one that
 * says what would fill the chart. So every chart checks its own dataset first.
 *
 * The active tab lives in module state rather than in the route: coming back
 * here after opening a project from the projects tab should land on the
 * projects tab, and that is not worth a URL anybody would want to paste.
 */

import { h, replace, qsa, emptyState, progressBar } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, plural } from '../core/i18n.js';
import {
  formatDuration, formatDate, formatDateWithDay, formatAgo, dayName, lastNDays,
} from '../core/time.js';
import { projectProgress } from '../engine/progress.js';
import { snapshot } from '../services/core.js';
import { habits as habitsService } from '../services/rituals.js';
import * as insights from '../services/insights.js';
import {
  pageHeader, projectCard, goalCard, areaChip, stat, statGrid,
} from './components.js';

const TABS = [
  { key: 'goals', label: 'progress.tabGoals' },
  { key: 'projects', label: 'progress.tabProjects' },
  { key: 'time', label: 'progress.tabTime' },
  { key: 'habits', label: 'progress.tabHabits' },
  { key: 'focus', label: 'progress.tabFocus' },
  { key: 'activity', label: 'progress.tabActivity' },
];

/* at_risk and needs_attention share a label everywhere else in the app, so they
 * share a group here too — two sections under the same heading would read as a
 * bug rather than as a distinction. */
const HEALTH_GROUPS = [
  { members: ['blocked'], label: 'projects.status.blocked' },
  { members: ['at_risk', 'needs_attention'], label: 'projects.status.needs_attention' },
  { members: ['on_track'], label: 'projects.status.on_track' },
  { members: ['idle'], label: 'projects.status.paused' },
  { members: ['done'], label: 'projects.status.done' },
];

const ACCENT_EVENTS = new Set([
  'TASK_COMPLETED', 'MILESTONE_COMPLETED', 'PROJECT_COMPLETED', 'GOAL_ACHIEVED',
]);

const TREND_KEY = { up: 'habits.trendUp', flat: 'habits.trendFlat', down: 'habits.trendDown' };

const DAY_EVENT_LIMIT = 20;

let tab = 'goals';
let timePeriod = 'week';
let bodyHost = null;

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

function section(title, note, body) {
  return h('section.section',
    h('div.section-head',
      h('h2.section-title', title),
      note ? h('span.section-note', note) : null),
    body);
}

function cardGrid(cards) {
  return h('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: 'var(--sp-3)',
    },
  }, cards);
}

/**
 * A column chart from real values.
 *
 * The bar heights are in pixels rather than percentages because the columns are
 * not stretched by the flex container, so a percentage would resolve against a
 * height nothing has declared and every bar would collapse to its minimum.
 */
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

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

function movementChips(movement) {
  const chips = [];
  if (movement.tasksDone > 0) {
    chips.push(h('span.chip', icon('check', { size: 12 }), plural('count.tasks', movement.tasksDone)));
  }
  if (movement.milestonesDone > 0) {
    chips.push(h('span.chip', icon('flag', { size: 12 }), plural('count.milestones', movement.milestonesDone)));
  }
  if (movement.focusMinutes > 0) {
    chips.push(h('span.chip', icon('focus', { size: 12 }), formatDuration(movement.focusMinutes)));
  }
  return chips;
}

function goalTile(row, snap) {
  const goal = row.goal;
  const card = goalCard({
    goal,
    area: goal.areaId ? snap.areasById.get(goal.areaId) : null,
    progress: row.progress,
  });
  const chips = movementChips(row.movement);
  if (chips.length) {
    card.appendChild(h('div.row.wrap-flex', { style: { marginBlockStart: '10px' } }, chips));
  }
  return card;
}

function goalsTab() {
  const snap = snapshot();
  /* The monthly review is where "did this move" is computed, from the event log
   * since the first of the month. Reading it here keeps one definition of
   * movement instead of a second one that drifts. */
  const monthly = insights.monthlyReview();
  const rows = monthly.stats.goalMovement;

  if (!rows.length) {
    return emptyState({
      icon: 'goal',
      title: t('goals.emptyTitle'),
      note: t('goals.emptyNote'),
    });
  }

  return h('div',
    statGrid([
      stat(rows.length, t('progress.goalsActive')),
      stat(monthly.goalsMoved.length, t('progress.goalsMoved'), { note: t('time.thisMonth') }),
      stat(monthly.goalsStuck.length, t('progress.goalsStuck'), { note: t('time.thisMonth') }),
    ]),
    monthly.goalsMoved.length
      ? section(t('progress.goalsMoved'), t('time.thisMonth'),
        cardGrid(monthly.goalsMoved.map((row) => goalTile(row, snap))))
      : null,
    monthly.goalsStuck.length
      ? section(t('progress.goalsStuck'), t('time.thisMonth'),
        cardGrid(monthly.goalsStuck.map((row) => goalTile(row, snap))))
      : h('p.tiny.quiet', { style: { marginBlockStart: 'var(--sp-5)' } }, t('progress.nothingStuck')));
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

function projectDetailFor(project, snap) {
  const tasks = snap.tasks.filter((x) => x.projectId === project.id);
  const milestones = snap.milestones.filter((m) => m.projectId === project.id);
  return {
    project,
    goal: project.goalId ? snap.goalsById.get(project.goalId) : null,
    health: snap.health.get(project.id),
    progress: projectProgress(project, tasks, milestones),
    openTasks: tasks.filter((x) => x.status !== 'done' && x.status !== 'cancelled'),
  };
}

function projectsTab() {
  const snap = snapshot();
  if (!snap.projects.length) {
    return emptyState({
      icon: 'project',
      title: t('projects.emptyTitle'),
      note: t('projects.emptyNote'),
    });
  }

  const details = snap.projects.map((p) => projectDetailFor(p, snap));

  return h('div', HEALTH_GROUPS.map((group) => {
    const rows = details.filter((d) => d.health && group.members.includes(d.health.health));
    if (!rows.length) return null;
    return section(t(group.label), plural('count.projects', rows.length),
      cardGrid(rows.map((detail) => projectCard(detail))));
  }));
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

function allocationView(data) {
  if (data.empty) {
    return h('div.card.card-pad', h('p.quiet', t('progress.noTimeData')));
  }

  const bar = h('div.bar-stack', {
    role: 'img',
    'aria-label': t('progress.timeAllocation'),
  }, data.rows.map((row) => h('div.bar-seg', {
    style: { width: `${row.pct}%`, background: areaColor(row.area) },
    title: `${areaTitle(row.area)} · ${formatDuration(row.minutes)}`,
  })));

  const legend = h('div.legend', { style: { marginBlockStart: 'var(--sp-3)' } },
    data.rows.map((row) => h('span.legend-item',
      h('span.dot', { style: { background: areaColor(row.area) } }),
      `${areaTitle(row.area)} · ${row.pct}%`)));

  const table = h('table', { style: { marginBlockStart: 'var(--sp-4)' } },
    h('thead', h('tr',
      h('th', t('areas.one')),
      h('th', t('projects.actualTime')),
      h('th', t('progress.share')))),
    h('tbody', data.rows.map((row) => h('tr',
      h('td',
        h('span.row', h('span.dot', { style: { background: areaColor(row.area) } }), areaTitle(row.area))),
      h('td', formatDuration(row.minutes)),
      h('td.num', `${row.pct}%`)))));

  return h('div.card.card-pad',
    h('p.tiny.quiet', { style: { marginBlockEnd: '10px' } },
      t('routines.totalTime', { time: formatDuration(data.totalMinutes) })),
    bar,
    legend,
    table);
}

function timeTab() {
  const host = h('div', { style: { marginBlockStart: 'var(--sp-4)' } });

  const switcher = h('div.segmented', {
    role: 'group',
    'aria-label': t('progress.timeAllocation'),
  }, [
    { key: 'week', label: 'progress.timeThisWeek' },
    { key: 'month', label: 'progress.timeThisMonth' },
  ].map((option) => h('button', {
    type: 'button',
    'aria-pressed': timePeriod === option.key ? 'true' : 'false',
    data: { period: option.key },
    /* Only the chart is repainted, so the button keeps focus and the keyboard
     * stays where it was. */
    onclick: () => {
      timePeriod = option.key;
      for (const b of qsa('button', switcher)) {
        b.setAttribute('aria-pressed', b.dataset.period === timePeriod ? 'true' : 'false');
      }
      replace(host, allocationView(insights.timeAllocation(timePeriod)));
    },
  }, t(option.label))));

  replace(host, allocationView(insights.timeAllocation(timePeriod)));

  return h('div',
    h('div.row-between.wrap-flex',
      h('h2.section-title', t('progress.timeAllocation')),
      switcher),
    host);
}

/* ------------------------------------------------------------------ *
 * Habits
 * ------------------------------------------------------------------ */

function habitCard(detail) {
  const habit = detail.habit;
  const stats = detail.stats;

  return h('div.card.card-pad',
    h('div.row-between',
      h('div.grow.ellipsis',
        h('h4.ellipsis', habit.title),
        detail.area
          ? h('div.row', { style: { marginBlockStart: '4px' } }, areaChip(detail.area))
          : null),
      h('span.tiny.quiet.num', `${stats.rate7.pct}%`)),

    h('div', { style: { marginBlockStart: '10px' } },
      progressBar(stats.rate7.pct, { label: t('habits.rate7') })),
    h('div.row-between', { style: { marginBlockStart: '8px' } },
      h('span.tiny.quiet', t('habits.rate7')),
      h('span.tiny.quiet',
        t('projects.milestonesProgress', { done: stats.rate7.done, total: stats.rate7.expected }))),

    h('div.row.wrap-flex', { style: { marginBlockStart: 'var(--sp-4)' } },
      h('span.chip', `${stats.rate30.pct}% · ${t('habits.rate30')}`),
      h('span.chip', `${stats.weeklyAverage} · ${t('habits.weeklyAvg')}`),
      h('span.chip', stats.trend === 'unknown'
        ? t('habits.notEnoughData')
        : `${t('habits.trend')}: ${t(TREND_KEY[stats.trend])}`)));
}

function habitsTab() {
  const list = habitsService.active();
  if (!list.length) {
    return emptyState({
      icon: 'habit',
      title: t('habits.emptyTitle'),
      note: t('habits.emptyNote'),
    });
  }
  return h('div.stack', list.map((habit) => habitCard(habitsService.detail(habit.id))));
}

/* ------------------------------------------------------------------ *
 * Focus
 * ------------------------------------------------------------------ */

function focusChart(stats) {
  const total = stats.byDay.reduce((sum, day) => sum + day.focusMinutes, 0);
  if (total === 0) {
    return h('div.card.card-pad', h('p.quiet', t('focus.noSessions')));
  }

  return h('div.card.card-pad',
    barChart(stats.byDay.map((day) => ({
      label: dayName(day.date, true),
      value: day.focusMinutes,
      title: `${formatDate(day.date, { noYear: true })} · ${formatDuration(day.focusMinutes)}`,
    }))),
    h('p.tiny.quiet', { style: { marginBlockStart: 'var(--sp-3)' } },
      `${formatDuration(total)} · ${plural('count.sessions', stats.focusSessions)}`));
}

function estimateCard() {
  const calibration = insights.estimateAccuracy();
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

/** Only when there is a real gap between the best window and the worst one. */
function patternsCard() {
  const windows = insights.focusPatterns();
  if (!windows.ok || !windows.meaningful) return null;
  return h('div.card.card-pad',
    h('div.eyebrow', t('focus.title')),
    h('p', { style: { marginBlockStart: '8px' } },
      t('progress.focusBestWindow', { part: t(`progress.partIn.${windows.best.key}`) })),
    h('p.tiny.quiet', { style: { marginBlockStart: '6px' } },
      t('progress.basedOn', { n: plural('count.sessions', windows.sampleSize) })));
}

function focusTab() {
  const days = lastNDays(14);
  const stats = insights.periodStats(days[0], days[days.length - 1]);

  return h('div',
    section(t('progress.focusByDay'), null, focusChart(stats)),
    h('div.stack', estimateCard(), patternsCard()));
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

function eventLine(entry, now) {
  const key = `activity.events.${entry.type}`;
  const text = t(key, entry.payload || {});
  /* An event type with no sentence in the catalogue gets no invented one. */
  if (text === key) return null;
  return h('div.tl-item', { class: ACCENT_EVENTS.has(entry.type) ? 'tl-item-accent' : null },
    h('div.tl-time', formatAgo(entry.at, now)),
    h('div', text));
}

function dayTimeline(day, now) {
  const host = h('div.timeline');
  const lines = day.events.map((entry) => eventLine(entry, now)).filter(Boolean);
  const shown = lines.slice(0, DAY_EVENT_LIMIT);
  const rest = lines.length - shown.length;

  host.appendChild(h('div', shown));
  if (rest > 0) {
    const more = h('button.btn.btn-sm.btn-ghost', {
      type: 'button',
      onclick: () => {
        host.replaceChildren(h('div', lines));
      },
    }, t('common.showMore', { n: rest }));
    host.appendChild(more);
  }
  return host;
}

function activityTab() {
  const feed = insights.activityFeed(14);
  if (!feed.length) {
    return h('div.card.card-pad', h('p.quiet', t('progress.noActivity')));
  }

  const now = Date.now();
  return h('div', feed.map((day) => section(
    formatDateWithDay(day.date),
    plural('count.items', day.events.length),
    h('div.card.card-pad', dayTimeline(day, now)),
  )));
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

function tabBody() {
  switch (tab) {
    case 'projects': return projectsTab();
    case 'time': return timeTab();
    case 'habits': return habitsTab();
    case 'focus': return focusTab();
    case 'activity': return activityTab();
    default: return goalsTab();
  }
}

function paintBody() {
  if (!bodyHost) return;
  const current = TABS.find((item) => item.key === tab) || TABS[0];
  bodyHost.setAttribute('aria-label', t(current.label));
  replace(bodyHost, tabBody());
}

function tabsBar() {
  const bar = h('div.tabs', { role: 'tablist', 'aria-label': t('progress.title') });
  for (const item of TABS) {
    bar.appendChild(h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': tab === item.key ? 'true' : 'false',
      'aria-controls': 'progress-panel',
      data: { tab: item.key },
      onclick: () => {
        tab = item.key;
        for (const b of qsa('button', bar)) {
          b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
        }
        paintBody();
      },
    }, t(item.label)));
  }
  return bar;
}

/* Nothing on this screen writes, so the rebuild function the router hands over
 * is not needed: every control here repaints its own subtree from a fresh
 * snapshot. */
export function renderProgress() {
  const container = h('div', pageHeader(t('progress.title')));
  container.appendChild(tabsBar());

  bodyHost = h('div#progress-panel', {
    role: 'tabpanel',
    tabindex: '0',
    style: { marginBlockStart: 'var(--sp-5)' },
  });
  container.appendChild(bodyHost);
  paintBody();

  return container;
}
