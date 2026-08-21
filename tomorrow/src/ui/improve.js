/*
 * improve.js — "Improve Tomorrow", the moment the product exists for.
 *
 * The engine finds the changes; this file has one job, which is to make them
 * legible before anybody commits to them. A panel that says "84" with an Apply
 * button underneath is asking for trust it has not earned. So the sheet shows
 * the current day beside the proposed one, every change spelled out in a line
 * of Hebrew, and the reasons the score moved — and only then the button.
 *
 * Apply writes to the store for real, and Undo puts it back exactly. Both
 * matter: a suggestion nobody can reverse is a suggestion nobody will accept.
 */

import { h, sheet, announce } from '../core/dom.js';
import { replaceDayItems, putDayPlan, pushFeedback, patchItem, itemsOn, dayPlan } from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { addDays } from '../core/time.js';
import { improve } from '../engine/optimize.js';
import { empty, icon, ICONS, delta } from './parts.js';
import { animateFrom } from './scoreanim.js';

/*
 * What the day looked like before Apply.
 *
 * Held in module scope rather than in the store because it is not part of the
 * user's data — it is the last thing this screen did, and it stops mattering
 * the moment they navigate away or reload. Persisting it would mean an Undo
 * button reappearing tomorrow morning for a change made last night, which is
 * worse than not offering one.
 */
let previous = null;

export function openImprove(ctx) {
  const result = improve(ctx.input, {});

  if (!result) {
    return sheet(empty({
      mark: icon(ICONS.check, { class: 'empty-icon' }),
      title: 'לא מצאתי מה לשפר',
      text: 'ניסיתי להזיז משימות, להוסיף הפסקה, להקדים שינה ולדחות את מה שפחות דחוף — שום שינוי לא העלה את הציון בצורה משמעותית. היום מסודר טוב כמו שהוא.',
    }), { title: 'שיפור מחר', label: 'אין שיפור זמין' });
  }

  const body = h('div.stack');
  const close = sheet(body, { title: 'שיפור מחר', label: 'הצעת שיפור ליום מחר' });
  renderProposal(body, ctx, result, close);
  return close;
}

function renderProposal(body, ctx, result, close) {
  body.textContent = '';

  body.appendChild(h('div.compare', null,
    scoreBox('כרגע', result.before.score, ''),
    icon(ICONS.chevron, { class: 'compare-arrow' }),
    scoreBox('אחרי השינוי', result.after.score, 'good')));

  body.appendChild(h('p.center.compare-delta', null,
    delta(result.delta, 'נקודות בתחזית')));

  body.appendChild(h('div.divider'));

  body.appendChild(h('h3.card-title', { text: 'מה משתנה' }));
  body.appendChild(h('ol.change-list', null,
    result.changes.map((c) => h('li', null,
      h('span.change-kind', { text: kindLabel(c.kind) }),
      h('span', { text: c.label })))));

  if (result.reasons.length) {
    body.appendChild(h('h3.card-title', { text: 'למה זה עדיף' }));
    body.appendChild(h('ul.why-list', null,
      result.reasons.map((r) => h('li', { text: r }))));
  }

  body.appendChild(h('div.sheet-actions', null,
    h('button.btn.primary', {
      type: 'button', 'data-t': 'improve-apply',
      onclick: () => {
        apply(ctx, result);
        renderApplied(body, ctx, result, close);
      },
    }, icon(ICONS.check), 'החל את השינויים'),
    h('button.btn.ghost', {
      type: 'button', 'data-t': 'improve-keep', onclick: () => close(),
    }, 'להשאיר כמו שזה')));
}

/*
 * After Apply the sheet stays open and becomes the receipt.
 *
 * Closing it immediately and dropping a toast was the first version, and it
 * meant the Undo lived for three seconds at the bottom of the screen. Somebody
 * who has just let an app rearrange their evening deserves longer than that to
 * change their mind.
 */
function renderApplied(body, ctx, result, close) {
  body.textContent = '';

  body.appendChild(h('div.applied-mark', { 'aria-hidden': 'true' }, icon(ICONS.check, { weight: '2.4' })));
  body.appendChild(h('h3.card-title.center', { text: 'מחר עודכן' }));
  body.appendChild(h('p.sub.center', {
    text: `הציון עלה מ-${result.before.score} ל-${result.after.score}. אפשר להחזיר את זה לאחור בכל רגע.`,
  }));

  body.appendChild(h('ul.why-list', null,
    result.changes.map((c) => h('li', { text: c.label }))));

  body.appendChild(h('div.sheet-actions', null,
    h('button.btn.ghost', {
      type: 'button', 'data-t': 'improve-undo',
      onclick: () => { undo(ctx); close(); },
    }, icon(ICONS.undo), 'בטל את השינוי'),
    h('button.btn.primary', { type: 'button', onclick: () => close() }, 'סגירה')));
}

function scoreBox(label, value, tone) {
  return h('div.compare-box', null,
    h('span.compare-label', { text: label }),
    h('span', { class: `compare-score ${tone}`.trim(), text: String(value) }));
}

const KIND_LABEL = {
  move: 'הזזה', bedtime: 'שינה', break: 'הפסקה',
  defer: 'דחייה', shorten: 'משך', swap: 'החלפה',
};

function kindLabel(kind) {
  return KIND_LABEL[kind] || 'שינוי';
}

/* ------------------------------------------------------------------ *
 * Applying and undoing
 * ------------------------------------------------------------------ */

function apply(ctx, result) {
  const date = ctx.date;
  previous = {
    date,
    items: itemsOn(date).map((i) => Object.assign({}, i)),
    plan: Object.assign({}, dayPlan(date)),
    score: result.before.score,
  };

  /*
   * A deferred task moves to the next day; it is not deleted. "Push it to
   * another day" has to actually mean that, or the feature quietly loses
   * somebody's work in exchange for a better number.
   *
   * The order matters. replaceDayItems() clears every item on this date before
   * writing the new list, so the deferred ones are re-dated first and are no
   * longer on this day by the time it runs.
   */
  const kept = new Set(result.items.map((i) => i.id));
  const moved = previous.items.filter((i) => !kept.has(i.id));
  for (const it of moved) patchItem(it.id, { date: addDays(date, 1), start: null });

  replaceDayItems(date, result.items);
  putDayPlan(date, { nextBedtime: result.plan.nextBedtime, appliedPlanId: result.id });
  pushFeedback('improve_applied', {
    date, id: result.id, before: result.before.score, after: result.after.score,
    changes: result.changes.map((c) => c.kind),
    deferred: moved.map((i) => i.id),
  });

  invalidate();
  animateFrom(result.before.score);
  ctx.refresh();
  announce(`מחר עודכן. הציון עלה ל-${result.after.score}.`);
}

function undo(ctx) {
  if (!previous) return;
  const { date, items, plan, score } = previous;
  /* Anything Apply pushed to the next day comes home too, otherwise Undo
   * restores the schedule but leaves the deferred task sitting on Thursday. */
  for (const it of items) patchItem(it.id, { date });
  replaceDayItems(date, items);
  putDayPlan(date, { nextBedtime: plan.nextBedtime, appliedPlanId: null });
  pushFeedback('improve_undone', { date });
  previous = null;

  invalidate();
  animateFrom(score);
  ctx.refresh();
  ctx.toast('השינוי בוטל', 'good');
}
