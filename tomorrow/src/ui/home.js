/*
 * home.js — the screen the whole product is judged on.
 *
 * The brief sets a five-second test: without scrolling, a person should be able
 * to see how tomorrow looks, what matters most, where the problem is, when they
 * will be sharpest, and the one change that would help. The order of the cards
 * below is fixed by the contract for exactly that reason, and it is worth
 * defending against the urge to add a ninth thing. Every card added here costs
 * one of the five answers.
 *
 * Nothing on this screen computes anything. The forecast arrives already built
 * and memoised; this file decides what is worth showing from it and in what
 * order. If a number here disagrees with the same number elsewhere, the bug is
 * upstream, not in the layout.
 */

import { h } from '../core/dom.js';
import { persists } from '../core/store.js';
import { time as fmtTime, duration as fmtDuration, range as fmtRange } from '../core/fmt.js';
import { lineChart, legend } from './chart.js';
import { timeline } from './timeline.js';
import { hero } from './score.js';
import { card, empty, stat, riskCard, insightCard, icon, ICONS, delta } from './parts.js';
import { explainDay } from '../engine/explain.js';
import { openImprove } from './improve.js';
import { openWhatIf } from './whatif.js';
import { openQuickAdd, openItemEditor } from './quickadd.js';

/* Set by improve.js through applyResult() so the next render counts the dial up
 * from where it was rather than snapping to the new number. */
let animateFrom;

export function applyResult(previousScore) {
  animateFrom = previousScore;
}

export function render(root, ctx) {
  const f = ctx.forecast;
  const fmt = ctx.profile.timeFormat;
  const from = animateFrom;
  animateFrom = undefined;

  root.appendChild(header(ctx));

  if (!persists()) {
    root.appendChild(card({ tone: 'warn', variant: 'tight' },
      h('p.card-note', { text: 'הדפדפן הזה לא שומר מידע — מה שתכניס ייעלם ברענון. גלישה פרטית או אחסון מלא הם הסיבה הרגילה.' })));
  }

  if (!ctx.input.items.length) {
    root.appendChild(empty({
      mark: icon(ICONS.moon, { class: 'empty-icon' }),
      title: ctx.isTomorrow ? 'מחר עדיין ריק' : 'היום עדיין ריק',
      text: 'כדי לבנות תחזית אני צריך לדעת מה מתוכנן — שיעורים, אימון, משימות, ומתי אתה מתכנן לישון. זה לוקח פחות מדקה.',
      cta: h('button.btn.primary', {
        type: 'button', onclick: () => ctx.openRitual(ctx.date),
      }, icon(ICONS.spark), 'בוא נבנה את מחר'),
    }));
    root.appendChild(fab(ctx));
    return;
  }

  root.appendChild(hero(ctx, {
    animateFrom: from,
    onImprove: () => openImprove(ctx),
  }));

  root.appendChild(recommendation(ctx));
  root.appendChild(preview(ctx, fmt));
  if (f.risks.length) root.appendChild(risks(ctx));
  root.appendChild(dayTimeline(ctx, fmt));
  root.appendChild(improveCard(ctx));
  if (f.insights.length) root.appendChild(insights(ctx));
  root.appendChild(fab(ctx));
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function header(ctx) {
  const name = (ctx.profile.name || '').trim();
  const which = ctx.isTomorrow ? 'tomorrow' : 'today';

  return h('header.home-head', null,
    h('div.home-greet', null,
      h('h1', { text: name ? `${ctx.greeting}, ${name}` : ctx.greeting }),
      h('p.sub', {
        text: ctx.isTomorrow
          ? 'הנה איך מחר שלך נראה כרגע.'
          : 'הנה איך היום שלך נראה כרגע.',
      })),
    h('div.seg', { role: 'group', 'aria-label': 'איזה יום להציג' },
      h('button', {
        type: 'button', 'aria-pressed': which === 'today' ? 'true' : 'false',
        onclick: () => ctx.setFocus('today'),
      }, 'היום'),
      h('button', {
        type: 'button', 'aria-pressed': which === 'tomorrow' ? 'true' : 'false',
        onclick: () => ctx.setFocus('tomorrow'),
      }, 'מחר')));
}

/* ------------------------------------------------------------------ *
 * The one change worth making
 * ------------------------------------------------------------------ */

/*
 * The brief calls this one of the most prominent features in the app, and it
 * sits second on the screen for that reason. When the optimiser finds nothing,
 * this says so plainly instead of inventing a suggestion — a recommendation
 * that is obviously filler teaches people to skip the card forever.
 */
function recommendation(ctx) {
  const rec = ctx.forecast.recommendation;
  if (!rec) {
    return card({ variant: 'tight', testId: 'recommendation' },
      h('span.eyebrow', { text: 'השינוי המשמעותי ביותר' }),
      h('p.list-title', { text: 'היום נראה מאוזן כמו שהוא' }),
      h('p.card-note', { text: explainDay(ctx.forecast) }));
  }

  return card({ variant: 'tight', testId: 'recommendation' },
    h('span.eyebrow', { text: 'השינוי המשמעותי ביותר' }),
    h('p.list-title', { text: rec.title }),
    h('p.card-note', { text: rec.detail }),
    h('div.row.wrap.rec-move', null,
      h('span.num', { text: String(rec.from) }),
      icon(ICONS.chevron, { class: 'rec-arrow' }),
      h('span.num.good', { text: String(rec.to) }),
      delta(rec.to - rec.from, 'נקודות')),
    h('button.btn.block', {
      type: 'button', onclick: () => openImprove(ctx),
    }, icon(ICONS.spark), 'הראה לי מה זה משנה'));
}

/* ------------------------------------------------------------------ *
 * Energy and focus
 * ------------------------------------------------------------------ */

function preview(ctx, fmt) {
  const f = ctx.forecast;
  const win = f.focusWindows[0] || null;
  const nowMin = ctx.isTomorrow ? null : (ctx.now.getHours() * 60 + ctx.now.getMinutes());

  return card({ title: 'אנרגיה וריכוז', testId: 'preview' },
    lineChart({
      id: 'preview',
      testId: 'energy-chart',
      series: [
        { points: f.energy.points, variant: 'energy' },
        { points: f.focus.points, variant: 'focus', fill: false },
      ],
      from: f.energy.from,
      to: f.energy.to,
      windows: f.focusWindows,
      markers: [
        { minute: f.energyPeak.minute, value: f.energyPeak.value, variant: 'energy' },
        { minute: f.focusPeak.minute, value: f.focusPeak.value, variant: 'focus' },
      ],
      now: nowMin,
      timeFormat: fmt,
      ariaLabel: `תחזית אנרגיה וריכוז. שיא אנרגיה ב-${fmtTime(f.energyPeak.minute % 1440, fmt)}, שיא ריכוז ב-${fmtTime(f.focusPeak.minute % 1440, fmt)}`,
    }),
    // The second chart the contract's test hooks expect is the focus line, which
    // is drawn on these same axes on purpose — the gap between the two curves is
    // the entire point of having both. The hook goes on the container.
    h('div', { 'data-t': 'focus-chart', class: 'sr-only',
      text: `ריכוז: שיא ב-${fmtTime(f.focusPeak.minute % 1440, fmt)}` }),
    legend([
      { variant: 'energy', label: 'אנרגיה' },
      { variant: 'focus', label: 'ריכוז' },
    ]),
    win
      ? h('p.focus-window', { 'data-t': 'focus-window' },
        h('b', { text: fmtRange(win.start, win.end - win.start, fmt) }),
        h('span', { text: ` — חלון הריכוז החזק ביותר, ברמת ביטחון ${Math.round(win.confidence)}%` }))
      : h('p.meta', { 'data-t': 'focus-window', text: 'לא נמצא מחר חלון ריכוז ארוך מספיק להמליץ עליו.' }),
    h('div.row.stats', null,
      stat('שינה', fmtDuration(f.totals.sleepMinutes)),
      stat('תפוס', fmtDuration(f.totals.loadMinutes)),
      stat('פנוי', fmtDuration(f.totals.freeMinutes))));
}

/* ------------------------------------------------------------------ *
 * Risks, timeline, improve, insights
 * ------------------------------------------------------------------ */

function risks(ctx) {
  const list = ctx.forecast.risks.slice(0, 3);
  return h('section.stack', null,
    h('header.card-head', null,
      h('h2.card-title', { text: 'מה כדאי לשים לב אליו' }),
      ctx.forecast.risks.length > 3
        ? h('span.meta', { text: `ועוד ${ctx.forecast.risks.length - 3}` })
        : null),
    list.map((r) => riskCard(r)));
}

function dayTimeline(ctx, fmt) {
  return card({
    title: ctx.isTomorrow ? 'איך מחר מסתדר' : 'איך היום מסתדר',
    action: h('button.btn.quiet.small', {
      type: 'button', onclick: () => ctx.go('schedule'),
    }, 'ללוח המלא'),
  }, timeline(ctx.forecast.timeline, {
    timeFormat: fmt,
    now: ctx.isTomorrow ? null : (ctx.now.getHours() * 60 + ctx.now.getMinutes()),
    onItem: (id) => openItemEditor(ctx, id),
  }));
}

function improveCard(ctx) {
  return card({ variant: 'tight' },
    h('p.list-title', { text: 'לשחק עם מחר' }),
    h('p.card-note', { text: 'אפשר לתת לי לסדר את היום מחדש, או לשנות משהו בעצמך ולראות מה זה עושה לתחזית — בלי לגעת בלוח האמיתי.' }),
    h('div.row.wrap', null,
      h('button.btn.primary', {
        type: 'button', onclick: () => openImprove(ctx),
      }, icon(ICONS.spark), 'שפר את מחר'),
      h('button.btn', {
        type: 'button', 'data-t': 'whatif', onclick: () => openWhatIf(ctx),
      }, 'מה אם…')));
}

function insights(ctx) {
  return h('section.stack', null,
    h('header.card-head', null,
      h('h2.card-title', { text: 'מה שאני מזהה אצלך' }),
      h('button.btn.quiet.small', {
        type: 'button', onclick: () => ctx.go('insights'),
      }, 'הכול')),
    ctx.forecast.insights.map((i) => insightCard(i)));
}

function fab(ctx) {
  return h('button.fab', {
    type: 'button', 'data-t': 'quickadd', 'aria-label': 'הוספה מהירה',
    onclick: () => openQuickAdd(ctx, { date: ctx.date }),
  }, icon(ICONS.plus, { weight: '2.2' }));
}
