/*
 * nutrition.js — the eating view. Mirrors the reference document: plate rule,
 * meal-by-meal with swappable alternatives, eating out, and how to know it works.
 */

import { h, clear, announce } from '../core/dom.js';
import * as store from '../core/store.js';

export function renderNutrition(root, plan, profile) {
  const view = h('section');
  root.appendChild(view);

  function draw() {
    clear(view);
    const st = store.get();
    const rest = !!st.ui.restDayMeals;

    view.appendChild(h('h3', 'אכילה'));

    if (plan.strategy) {
      view.appendChild(h('p.lead', plan.strategy.basis));
      view.appendChild(h('div.macros',
        h('span.fact', 'קלוריות ', h('b', String(plan.strategy.kcal))),
        h('span.fact', 'חלבון ', h('b', `${plan.strategy.proteinG} ג׳`)),
        h('span.fact', 'פחמימה ', h('b', `${plan.strategy.carbsG} ג׳`)),
        h('span.fact', 'שומן ', h('b', `${plan.strategy.fatG} ג׳`)),
        h('span.fact', plan.strategy.deltaKcal >= 0 ? 'עודף ' : 'גירעון ',
          h('b', `${Math.abs(plan.strategy.deltaKcal)} קק״ל`)),
      ));
    } else {
      view.appendChild(h('p.lead',
        'בלי ספירת קלוריות ובלי מאקרו. בגיל הזה המטרה היא הרגלים, לא מספרים — הגוף עוד גדל, והוא צריך חומר גלם קבוע.'));
    }

    if (plan.plate && plan.plate.length) {
      view.appendChild(h('h4', { style: { fontFamily: 'var(--display)', fontWeight: '400', fontSize: '17px', margin: '22px 0 10px' } },
        '1 · כלל הצלחת'));
      view.appendChild(h('div.cards', plan.plate.map((c) => h('div.card',
        c.k ? h('span.k', c.k) : null, h('h4', c.title), h('p', c.body)))));
    }

    view.appendChild(h('h4', { style: { fontFamily: 'var(--display)', fontWeight: '400', fontSize: '17px', margin: '26px 0 10px' } },
      '2 · היום שלך, ארוחה־ארוחה'));
    view.appendChild(h('p.lead',
      'לכל ארוחה יש חלופות. אותו כפתור ⇄ כמו בתרגילים — לוחץ, מקבל אופציה אחרת עם אותו תפקיד ביום.'));

    view.appendChild(h('div.daytoggle',
      h('button.btn' + (rest ? '' : '.on'), {
        type: 'button',
        onclick: () => { setRest(false); draw(); },
      }, 'יום אימון'),
      h('button.btn' + (rest ? '.on' : ''), {
        type: 'button',
        onclick: () => { setRest(true); draw(); },
      }, 'יום מנוחה'),
      h('button.btn', {
        type: 'button',
        onclick: () => {
          store.update((s) => {
            plan.meals.forEach((m, i) => {
              s.picks[`meal:${i}`] = ((s.picks[`meal:${i}`] || 0) + 1) % m.variants.length;
            });
          });
          draw();
          announce('כל הארוחות הוחלפו');
        },
      }, h('span.ico', '⟳'), 'החלף הכל'),
    ));

    const list = h('div.list');
    plan.meals.forEach((m, i) => {
      if (rest && m.trainingOnly) return;
      list.appendChild(mealCard(m, i, draw));
    });
    view.appendChild(list);

    if (plan.eatingOut && plan.eatingOut.length) {
      view.appendChild(h('h4', { style: { fontFamily: 'var(--display)', fontWeight: '400', fontSize: '17px', margin: '26px 0 8px' } },
        '3 · אוכל בחוץ'));
      view.appendChild(h('div.table-scroll', h('table',
        h('thead', h('tr', h('th', 'במקום'), h('th', 'תבחר'))),
        h('tbody', plan.eatingOut.map((r) => h('tr',
          h('td', r.where),
          h('td', { style: { color: 'var(--dim)' } }, r.pick)))))));
    }

    if (plan.checkins && plan.checkins.length) {
      view.appendChild(h('h4', { style: { fontFamily: 'var(--display)', fontWeight: '400', fontSize: '17px', margin: '26px 0 10px' } },
        '4 · איך יודעים שזה עובד'));
      view.appendChild(h('div.cards', plan.checkins.map((c) => h('div.card',
        c.k ? h('span.k', c.k) : null, h('h4', c.title), h('p', c.body)))));
    }

    if (plan.warnings && plan.warnings.length) {
      view.appendChild(h('div.warnbox', { style: { marginTop: '22px' } },
        h('h4', profile.age < 18 ? 'דברים שלא מתפשרים עליהם' : 'שווה לדעת'),
        h('ul', plan.warnings.map((w) => h('li', w)))));
    }
  }

  draw();
  return { redraw: draw };
}

function setRest(v) {
  store.set({ ui: Object.assign({}, store.get().ui, { restDayMeals: v }) });
}

function mealCard(meal, index, redraw) {
  const key = `meal:${index}`;
  const pick = (store.get().picks[key] || 0) % meal.variants.length;
  const o = meal.variants[pick];

  const card = h('div.ex.meal',
    h('span.num.mtime', meal.time),
    h('div.body-col',
      h('span.slotlbl', meal.slot + (meal.trainingOnly ? ' · ימי אימון' : '')),
      h('div.name', o.n),
      h('p.items', o.i),
      meal.job ? h('p.note', meal.job) : null,
      h('div.lev',
        h('span.lbl', 'אופציה'),
        h('span.of.big', `${pick + 1} מתוך ${meal.variants.length}`)),
    ),
    h('div.acts',
      h('button.iconbtn.swap', {
        type: 'button', title: 'החלף ארוחה', 'aria-label': `החלף ארוחה: ${o.n}`,
        onclick: () => {
          store.update((s) => { s.picks[key] = (pick + 1) % meal.variants.length; });
          const fresh = mealCard(meal, index, redraw);
          fresh.classList.add('flash');
          card.replaceWith(fresh);
          setTimeout(() => fresh.classList.remove('flash'), 550);
        },
      }, '⇄'),
    ),
  );
  return card;
}
