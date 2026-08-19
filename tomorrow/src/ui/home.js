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
import { lineChart } from './chart.js';
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

/*
 * Two charts, not one with two lines.
 *
 * The brief is explicit that focus gets its own graph, and it is right for a
 * reason worth stating: overlaying them makes a handsome picture in which the
 * two curves are constantly compared, and the comparison is not the point. The
 * question energy answers is "will I have anything left at four"; the question
 * focus answers is "when is my head actually clear". Stacked, each gets read on
 * its own terms, each gets its own peak marked, and the focus chart gets the
 * best window shaded under it — which is the thing the user is here for.
 */
function preview(ctx, fmt) {
  const f = ctx.forecast;
  const win = f.focusWindows[0] || null;
  const nowMin = ctx.isTomorrow ? null : (ctx.now.getHours() * 60 + ctx.now.getMinutes());
  const span = { from: f.energy.from, to: f.energy.to, timeFormat: fmt, now: nowMin };

  return card({ title: 'אנרגיה וריכוז', testId: 'preview' },
    h('div.curve', null,
      h('div.curve-head', null,
        h('span.legend-item', null,
          h('i.legend-dot.energy', { 'aria-hidden': 'true' }),
          h('span', { text: 'אנרגיה' })),
        h('span.meta', { text: `שיא סביב ${fmtTime(f.energyPeak.minute % 1440, fmt)}` })),
      lineChart(Object.assign({
        id: 'energy', testId: 'energy-chart',
        series: [{ points: f.energy.points, variant: 'energy' }],
        markers: [{ minute: f.energyPeak.minute, value: f.energyPeak.value, variant: 'energy' }],
        ariaLabel: `תחזית אנרגיה למחר. השיא צפוי סביב ${fmtTime(f.energyPeak.minute % 1440, fmt)}, והירידה סביב ${fmtTime(f.energyDip.minute % 1440, fmt)}`,
      }, span))),

    h('div.curve', null,
      h('div.curve-head', null,
        h('span.legend-item', null,
          h('i.legend-dot.focus', { 'aria-hidden': 'true' }),
          h('span', { text: 'ריכוז' })),
        h('span.meta', { text: `שיא סביב ${fmtTime(f.focusPeak.minute % 1440, fmt)}` })),
      lineChart(Object.assign({
        id: 'focus', testId: 'focus-chart',
        series: [{ points: f.focus.points, variant: 'focus' }],
        windows: f.focusWindows,
        markers: [{ minute: f.focusPeak.minute, value: f.focusPeak.value, variant: 'focus' }],
        ariaLabel: `תחזית ריכוז למחר. החלון החזק ביותר ${win ? fmtRange(win.start, win.end - win.start, fmt) : 'לא נמצא'}`,
      }, span))),

    win
      ? h('p.focus-window', { 'data-t': 'focus-window' },
        h('b', { text: fmtRange(win.start, win.end - win.start, fmt) }),
        h('span', { text: ` — חלון הריכוז החזק ביותר, ברמת ביטחון ${Math.round(win.confidence)}%` }))
      : h('p.meta', { 'data-t': 'focus-window', text: 'לא נמצא מחר חלון ריכוז ארוך מספיק כדי להמליץ עליו.' }),

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
