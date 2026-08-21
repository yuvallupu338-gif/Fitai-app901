/*
 * insights.js — what the app has learned, and how well it has been doing.
 *
 * Two halves behind one control, because they answer two halves of the same
 * question. Insights is what the app thinks it knows about you; History is
 * whether it has been right. Putting them on separate screens lets the first
 * one make claims the second one would embarrass.
 *
 * Every claim carries its evidence, and every number that has nothing behind it
 * prints a dash rather than a zero. That is the whole ethic of this screen: an
 * app that tells somebody a pattern about their own life had better be able to
 * say how it knows, and had better be willing to say when it does not.
 */

import { h } from '../core/dom.js';
import { get, setUi, recentRecords } from '../core/store.js';
import { addDays } from '../core/time.js';
import {
  pct, duration as fmtDuration, dateLabel, dayShort, time as fmtTime,
} from '../core/fmt.js';
import { findInsights } from '../engine/insights.js';
import { compare, rollingAccuracy } from '../engine/accuracy.js';
import { sparkline, barRow } from './chart.js';
import { card, empty, stat, insightCard, confidenceBadge, icon, ICONS } from './parts.js';

const RANGES = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 יום' },
  { days: 90, label: '90 יום' },
  { days: 365, label: 'שנה' },
];

export function render(root, ctx) {
  const mode = ctx.root.ui.insightsMode === 'history' ? 'history' : 'insights';

  root.appendChild(h('header.home-head', null,
    h('div', null,
      h('h1', { text: 'תובנות' }),
      h('p.sub', { text: 'מה שאני מזהה אצלך, ועד כמה התחזיות שלי מדויקות.' })),
    h('div.seg', { role: 'group', 'aria-label': 'תצוגה' },
      h('button', {
        type: 'button', 'aria-pressed': mode === 'insights' ? 'true' : 'false',
        onclick: () => { setUi({ insightsMode: 'insights' }); ctx.refresh(); },
      }, 'דפוסים'),
      h('button', {
        type: 'button', 'aria-pressed': mode === 'history' ? 'true' : 'false',
        onclick: () => { setUi({ insightsMode: 'history' }); ctx.refresh(); },
      }, 'היסטוריה'))));

  if (mode === 'history') renderHistory(root, ctx);
  else renderInsights(root, ctx);
}

/* ------------------------------------------------------------------ *
 * Patterns
 * ------------------------------------------------------------------ */

function renderInsights(root, ctx) {
  const rootState = get();
  const records = recentRecords(365);
  const insights = findInsights(rootState.learning, records, Object.values(rootState.items));
  const conf = ctx.forecast.confidence;

  root.appendChild(card({ variant: 'tight' },
    h('div.row.wrap', null,
      h('span.grow', null,
        h('span.label', { text: 'כמה אני כבר מכיר אותך' }),
        h('p.card-note', { text: conf.reasons[0] || '' })),
      confidenceBadge(conf)),
    /*
     * A part with no evidence renders as a dash and an empty bar, never as
     * zero. Math.round(null) is 0, and a flat zero next to "past accuracy"
     * reads as "this app has been wrong every time" rather than "nobody has
     * checked yet" — which is the difference the whole engine is careful about.
     */
    h('div.bars', null,
      Object.entries(conf.parts).map(([key, value]) => (value === null
        ? h('div.bar-row', null,
          h('span.bar-label', { text: PART_LABEL[key] || key }),
          h('span.bar-track', { 'aria-hidden': 'true' }),
          h('span.bar-value.dim', { text: '—', title: 'אין עדיין מה למדוד' }))
        : barRow({ label: PART_LABEL[key] || key, value: Math.round(value) }))))));

  if (!insights.length) {
    root.appendChild(empty({
      mark: icon(ICONS.spark, { class: 'empty-icon' }),
      title: 'עוד אין דפוסים',
      text: 'אני צריך כמה ימים שהושלמו עד שאפשר יהיה לזהות דפוס אמין. עד אז אני מעדיף לא להמציא.',
      cta: h('button.btn.primary', {
        type: 'button', onclick: () => ctx.openRitual(ctx.tomorrow),
      }, icon(ICONS.spark), 'להכין את מחר'),
    }));
    return;
  }

  root.appendChild(h('div.stack', null, insights.map((i) => insightCard(i))));

  const learning = rootState.learning;
  root.appendChild(card({ title: 'הפרופיל שנבנה ממך' },
    h('div.row.stats.wrap', null,
      profileStat('שעת קימה ממוצעת', learning.averageWakeTime, (v) => fmtTime(Math.round(v), ctx.profile.timeFormat)),
      profileStat('שינה ממוצעת', learning.averageSleepDuration, (v) => fmtDuration(Math.round(v))),
      profileStat('שיא ריכוז', learning.focusPeakHour, (v) => `${String(Math.round(v)).padStart(2, '0')}:00`),
      profileStat('שיא אנרגיה', learning.energyPeakHour, (v) => `${String(Math.round(v)).padStart(2, '0')}:00`),
      profileStat('השלמת משימות', learning.averageTaskCompletionRate, (v) => pct(v * 100)),
      profileStat('הערכת זמן', learning.averageEstimationError,
        (v) => (v >= 1 ? `+${Math.round((v - 1) * 100)}%` : `−${Math.round((1 - v) * 100)}%`)))));
}

const PART_LABEL = {
  history: 'כמות נתונים',
  consistency: 'עקביות',
  recency: 'טריות',
  accuracy: 'דיוק עבר',
  completeness: 'שלמות המידע',
};

/*
 * A stat with nothing behind it prints a dash.
 *
 * Not a zero and not a plausible default. "Average sleep: 0h" and "focus peak:
 * 00:00" are both lies that look like data, and one of them will be screenshotted.
 */
function profileStat(label, value, format) {
  return stat(label, value === null || value === undefined ? '—' : format(value));
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function renderHistory(root, ctx) {
  const range = ctx.root.ui.historyRange || 7;
  const since = addDays(ctx.today, -range);
  const records = recentRecords(400).filter((r) => r.date >= since && r.date <= ctx.today);
  const ordered = records.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

  root.appendChild(h('div.seg', { 'data-t': 'history-range', role: 'group', 'aria-label': 'טווח זמן' },
    RANGES.map((r) => h('button', {
      type: 'button', 'aria-pressed': range === r.days ? 'true' : 'false',
      onclick: () => { setUi({ historyRange: r.days }); ctx.refresh(); },
    }, r.label))));

  if (!ordered.length) {
    root.appendChild(empty({
      mark: icon(ICONS.clock, { class: 'empty-icon' }),
      title: 'אין עדיין היסטוריה בטווח הזה',
      text: 'כל יום שאתה מכין ומסכם נכנס לכאן, ומשם אני לומד.',
    }));
    return;
  }

  const predicted = ordered.map((r) => (r.forecast ? r.forecast.score : null));
  const actual = ordered.map((r) => (r.actual ? r.actual.dayScore : null));
  const accuracy = rollingAccuracy(records, range);

  root.appendChild(card({ title: 'ציון מחר מול היום בפועל' },
    sparkline({
      values: predicted.filter((v) => v !== null), variant: 'energy',
      ariaLabel: 'מגמת ציון התחזית',
    }),
    sparkline({
      values: actual.filter((v) => v !== null), variant: 'focus',
      ariaLabel: 'מגמת הציון בפועל',
    }),
    h('div.legend', null,
      h('span.legend-item', null, h('i.legend-dot.energy', { 'aria-hidden': 'true' }), 'תחזית'),
      h('span.legend-item', null, h('i.legend-dot.focus', { 'aria-hidden': 'true' }), 'בפועל')),
    h('div.row.stats', null,
      stat('דיוק ממוצע', accuracy === null ? '—' : pct(accuracy)),
      stat('ימים בטווח', String(ordered.length)),
      stat('הושלמו', completionOf(ordered)))));

  root.appendChild(card({ title: 'יום אחרי יום' },
    h('div.history-rows', null, ordered.slice().reverse().map((r) => historyRow(r, ctx)))));
}

function completionOf(records) {
  const done = records.reduce((a, r) => a + (r.actual ? r.actual.completed : 0), 0);
  const planned = records.reduce((a, r) => a + (r.actual ? r.actual.planned : 0), 0);
  return planned ? pct(Math.round((done / planned) * 100)) : '—';
}

function historyRow(r, ctx) {
  const cmp = compare(r);
  return h('div.history-row', null,
    h('span.history-day', { text: dayShort(r.date) }),
    h('span.history-date', { text: dateLabel(r.date, ctx.now) }),
    h('span.history-pair', null,
      h('b', { text: cmp.predicted === null ? '—' : String(cmp.predicted) }),
      h('span.dim', { text: ' → ' }),
      h('b', { text: cmp.actual === null ? '—' : String(cmp.actual) })),
    h('span.history-acc', {
      class: cmp.accuracy === null ? 'history-acc dim'
        : cmp.accuracy >= 80 ? 'history-acc good'
          : cmp.accuracy >= 60 ? 'history-acc' : 'history-acc warn',
      text: cmp.accuracy === null ? '—' : pct(cmp.accuracy),
    }),
    h('span.history-sleep', {
      text: r.actual && r.actual.sleepMinutes ? fmtDuration(r.actual.sleepMinutes) : '—',
    }));
}
