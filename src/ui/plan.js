/*
 * plan.js — the training view: week strip, session header, warm-up, exercises.
 * Visual language follows the reference program document.
 */

import { h, clear, announce } from '../core/dom.js';
import { exerciseCard, releaseAll } from './exercise.js';
import { restDayTasks, restNote } from '../engine/restday.js';
import * as store from '../core/store.js';

const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const TIME_HE = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב' };

export function renderPlan(root, program, profile) {
  const view = h('section');
  root.appendChild(view);

  function draw() {
    releaseAll();
    clear(view);

    const st = store.get();
    const active = Math.min(st.ui.activeDay || 0, program.days.length - 1);
    const day = program.days[active];
    const trainDays = new Set(program.days.map((d) => d.dayIndex));
    const activeRest = Number.isInteger(st.ui.activeRest) && !trainDays.has(st.ui.activeRest)
      ? st.ui.activeRest : null;

    view.appendChild(weekStrip(program, active, activeRest, (i) => {
      store.set({ ui: Object.assign({}, store.get().ui, { activeDay: i, activeRest: null }) });
      draw();
    }, (wd) => {
      store.set({ ui: Object.assign({}, store.get().ui, { activeRest: wd }) });
      draw();
    }));

    view.appendChild(weekFoot(program, profile));

    if (activeRest !== null) {
      view.appendChild(restDayView(program, profile, activeRest, draw));
      return;
    }

    view.appendChild(h('div.whead',
      h('h2', day.title),
      h('span.meta', [
        `יום ${NAMES[day.dayIndex] || '—'}`,
        TIME_HE[profile.timeOfDay] || '',
        `${day.durationMin} דק׳`,
        `${day.slots.length} תרגילים`,
      ].filter(Boolean).join(' · ')),
    ));
    if (day.focus) view.appendChild(h('p.focus', day.focus));

    const partner = program.meta && program.meta.partner;
    if (partner) {
      view.appendChild(h('div.partnerbar',
        h('span.pbadge', partner.together
          ? `ביחד${partner.name ? ` עם ${partner.name}` : ''}`
          : 'כל אחד לחוד'),
        h('span', partner.note)));
    }

    if (program.warmup && program.warmup.length) {
      view.appendChild(h('details.warm',
        h('summary', 'חימום — לפני כל אימון', h('span', `${Math.round(program.warmup.length * 1.4)} דק׳`)),
        h('div.inner', h('ol', program.warmup.map((w) => h('li',
          h('b', w.name), w.prescription ? ` — ${w.prescription}` : '',
          w.note ? h('div', { style: { fontSize: '12.5px', color: 'var(--dimmer)' } }, w.note) : null,
        )))),
      ));
    }

    const list = h('div.list');
    day.slots.forEach((slot, i) => list.appendChild(exerciseCard(day, slot, i + 1, refreshChrome)));
    view.appendChild(list);

    view.appendChild(h('div.toolbar',
      h('button.btn', {
        type: 'button',
        onclick: () => {
          for (const slot of day.slots) {
            if (slot.variants.length > 1) {
              store.setPick(day.id, slot.key, (store.pickOf(day.id, slot.key) + 1) % slot.variants.length);
            }
          }
          draw();
          announce('כל התרגילים הוחלפו');
        },
      }, h('span.ico', '⟳'), 'החלף את כל התרגילים'),
      h('button.btn', {
        type: 'button',
        onclick: () => {
          store.update((s) => {
            for (const slot of day.slots) {
              delete s.picks[`${day.id}:${slot.key}`];
              delete s.overrides[`${day.id}:${slot.key}`];
              delete s.done[`${store.weekKey()}:${day.id}:${slot.key}`];
            }
          });
          draw();
          announce('היום אופס');
        },
      }, h('span.ico', '↺'), 'אפס יום'),
    ));

    if (program.cooldown && program.cooldown.length) {
      view.appendChild(h('details.warm',
        h('summary', 'שחרור — בסוף האימון', h('span', '5 דק׳')),
        h('div.inner', h('ol', program.cooldown.map((c) => h('li',
          h('b', c.name), c.prescription ? ` — ${c.prescription}` : '')))),
      ));
    }

    view.appendChild(restSection(program, profile, draw));

    if (program.notes && program.notes.length) {
      view.appendChild(h('div.warnbox', { style: { marginTop: '20px' } },
        h('h4', 'שים לב'),
        h('ul', program.notes.map((n) => h('li', n)))));
    }

    function refreshChrome() {
      const strip = view.querySelector('.week');
      if (strip) strip.replaceWith(weekStrip(program, active, (i) => {
        store.set({ ui: Object.assign({}, store.get().ui, { activeDay: i }) });
        draw();
      }));
    }
  }

  draw();
  return { redraw: draw };
}

function weekStrip(program, active, activeRest, onPick, onRest) {
  const byWeekday = new Map(program.days.map((d, i) => [d.dayIndex, { day: d, i }]));
  const strip = h('nav.week', { 'aria-label': 'בחירת יום אימון' });

  for (let wd = 0; wd < 7; wd++) {
    const hit = byWeekday.get(wd);
    const isTrain = !!hit;
    const on = isTrain && hit.i === active;

    const bar = h('span.bar');
    if (isTrain) {
      const total = hit.day.slots.length || 1;
      const done = hit.day.slots.filter((s) => store.isDone(hit.day.id, s.key)).length;
      if (done) bar.appendChild(h('span.fill', { style: { height: `${Math.round((done / total) * 100)}%` } }));
    }

    /*
     * Rest cells are buttons too. They used to be inert divs, so a week strip
     * that invited a tap on four days quietly ignored the other three — and the
     * rest day's task, its stretches and its (different) meals had no way in.
     */
    const restOn = !isTrain && activeRest === wd;
    const cell = h(isTrain ? 'button.daycell.train' : 'button.daycell.restcell', {
      type: 'button',
      'aria-pressed': (on || restOn) ? 'true' : 'false',
      'aria-label': isTrain ? `${NAMES[wd]} · ${hit.day.title}` : `${NAMES[wd]} · יום מנוחה`,
      onclick: () => (isTrain ? onPick(hit.i) : onRest(wd)),
    },
    h('span.tag', isTrain ? shortTag(hit.day) : 'מנוחה'),
    bar,
    h('span.letter', LETTERS[wd]));

    if (on || restOn) cell.classList.add('on');
    strip.appendChild(cell);
  }
  return strip;
}

function shortTag(day) {
  const t = day.title || '';
  if (t.length <= 7) return t;
  return `${t.slice(0, 6)}…`;
}


/*
 * Rest days, with something small to do on them.
 *
 * Ticked through the same store as an exercise, keyed on a synthetic day id, so
 * they reset with the week exactly like sets do. Days with no task are still
 * listed — the point is partly to show that a rest day IS a rest day, and that
 * the empty ones are deliberate rather than forgotten.
 */

/*
 * A rest day, opened from the week strip.
 *
 * Deliberately shaped like a training day — heading, one focus line, then the
 * content — because the point of the change is that a rest day is a day in the
 * plan rather than a gap between days. What differs is what is on it: the small
 * task, the stretches, and the fact that the day's meals are not the same as a
 * training day's.
 */
function restDayView(program, profile, wd, redraw) {
  const wrap = h('div');
  const trainDays = new Set(program.days.map((d) => d.dayIndex));
  const restIdx = [];
  for (let i = 0; i < 7; i++) if (!trainDays.has(i)) restIdx.push(i);
  const task = restDayTasks(profile, restIdx).find((t) => t.dayIndex === wd) || null;
  const dayId = `rest${wd}`;

  wrap.appendChild(h('div.whead',
    h('h2', 'יום מנוחה'),
    h('span.meta', [`יום ${NAMES[wd]}`, task ? task.title : 'בלי משימה'].join(' · '))));
  wrap.appendChild(h('p.focus', task
    ? 'ההתאוששות היא חלק מהתוכנית, לא הפסקה ממנה. מה שכאן נועד להשאיר אותך רענן יותר, לא עייף.'
    : 'היום באמת פנוי. אין משימה, וזה בכוונה — שבוע שממלא את כל שבעת הימים הוא שבוע שנוטשים.'));

  if (task) {
    const done = store.isDone(dayId, 'task');
    wrap.appendChild(h('div.list', { style: { marginTop: '14px' } },
      h('div.ex.restrow' + (done ? '.done' : ''),
        h('span.num', '01'),
        h('div.body-col',
          h('div.name', task.title),
          h('div.prescr', h('span.chip' + (task.load === 'moderate' ? '' : '.rest'),
            task.load === 'moderate' ? 'תובעני יותר' : 'קל')),
          h('div.cues', h('span', task.body))),
        h('div.acts', h('button.iconbtn' + (done ? '.on' : ''), {
          type: 'button',
          title: done ? 'בטל סימון' : 'סמן שבוצע',
          'aria-pressed': done ? 'true' : 'false',
          onclick: () => {
            store.setDone(dayId, 'task', !done);
            announce(done ? 'הסימון בוטל' : `${task.title} — בוצע`);
            redraw();
          },
        }, '✓')))));
  }

  // The same stretches the training days close with. On a rest day they are the
  // whole of it rather than a cool-down, so they open by default.
  if (program.cooldown && program.cooldown.length) {
    wrap.appendChild(h('details.warm', { open: true },
      h('summary', 'מתיחות ליום מנוחה', h('span', '5 דק׳')),
      h('div.inner', h('ol', program.cooldown.map((c) => h('li',
        h('b', c.name), c.prescription ? ` — ${c.prescription}` : ''))))));
  }

  /*
   * Meals differ on a rest day — the pre-workout meal has nothing to sit before
   * — and the nutrition tab already knew that, behind a toggle nobody arriving
   * from here would think to flip. Opening it from this button sets the toggle,
   * so the tab shows the day you are actually looking at.
   */
  wrap.appendChild(h('div.toolbar', { style: { marginTop: '18px' } },
    h('button.btn', {
      type: 'button',
      onclick: () => {
        store.set({ ui: Object.assign({}, store.get().ui, { restDayMeals: true, tab: 'nutrition' }) });
        location.reload();
      },
    }, h('span.ico', '🍽'), 'התזונה של יום מנוחה')));
  wrap.appendChild(h('p.lead', { style: { marginTop: '8px' } },
    'בימי מנוחה אין ארוחה שלפני אימון, והשאר נשאר כפי שהוא.'));

  return wrap;
}

function restSection(program, profile, redraw) {
  const trainDays = new Set(program.days.map((d) => d.dayIndex));
  const restIdx = [];
  for (let i = 0; i < 7; i++) if (!trainDays.has(i)) restIdx.push(i);
  if (!restIdx.length) return h('div');

  const tasks = restDayTasks(profile, restIdx);
  const byDay = new Map(tasks.map((t) => [t.dayIndex, t]));

  const rows = restIdx.map((i) => {
    const t = byDay.get(i);
    if (!t) {
      return h('div.ex.restrow.free',
        h('span.num', LETTERS[i]),
        h('div.body-col',
          h('div.name', `יום ${NAMES[i]}`),
          h('div.prescr', h('span.chip.rest', 'מנוחה מלאה'))));
    }
    const dayId = `rest${i}`;
    const done = store.isDone(dayId, 'task');
    return h('div.ex.restrow' + (done ? '.done' : ''),
      h('span.num', LETTERS[i]),
      h('div.body-col',
        h('div.name', t.title),
        h('div.name-en', `יום ${NAMES[i]}`),
        h('div.prescr',
          h('span.chip' + (t.load === 'moderate' ? '' : '.rest'),
            t.load === 'moderate' ? 'תובעני יותר' : 'קל'),
        ),
        h('div.cues', h('span', t.body))),
      h('div.acts', h('button.iconbtn' + (done ? '.on' : ''), {
        type: 'button',
        title: done ? 'בטל סימון' : 'סמן שבוצע',
        'aria-pressed': done ? 'true' : 'false',
        onclick: () => {
          store.setDone(dayId, 'task', !done);
          announce(done ? 'הסימון בוטל' : `${t.title} — בוצע`);
          redraw();
        },
      }, '✓')));
  });

  return h('div', { style: { marginTop: '26px' } },
    h('h3', 'ימי מנוחה'),
    h('p.lead', restNote(profile, tasks, restIdx.length)),
    h('div.list', { style: { marginTop: '12px' } }, rows));
}

function weekFoot(program, profile) {
  const trainDays = new Set(program.days.map((d) => d.dayIndex));
  const rest = [];
  const restIdx = [];
  for (let i = 0; i < 7; i++) if (!trainDays.has(i)) { rest.push(LETTERS[i]); restIdx.push(i); }

  const total = program.days.reduce((n, d) => n + d.slots.length, 0);
  const done = program.days.reduce((n, d) => n + d.slots.filter((s) => store.isDone(d.id, s.key)).length, 0);

  return h('div.weekfoot',
    // One sentence about rest days, from the same place the section below uses,
    // so the footer cannot promise something the list does not show.
    h('span', rest.length
      ? `ימי ${rest.join('׳, ')}׳ — ${restNote(profile, restDayTasks(profile, restIdx), rest.length)}`
      : 'שבוע מלא. שים לב להתאוששות.'),
    h('span', { style: { fontFamily: 'var(--mono)', color: done === total && total ? 'var(--cyan)' : 'var(--dim)' } },
      `${done}/${total} השבוע`),
  );
}

export { LETTERS, NAMES };
