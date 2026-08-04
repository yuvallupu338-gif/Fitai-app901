/*
 * plan.js — the training view: week strip, session header, warm-up, exercises.
 * Visual language follows the reference program document.
 */

import { h, clear, announce } from '../core/dom.js';
import { exerciseCard, releaseAll } from './exercise.js';
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

    view.appendChild(weekStrip(program, active, (i) => {
      store.set({ ui: Object.assign({}, store.get().ui, { activeDay: i }) });
      draw();
    }));

    view.appendChild(weekFoot(program, profile));

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

function weekStrip(program, active, onPick) {
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

    const cell = h(isTrain ? 'button.daycell.train' : 'div.daycell', isTrain ? {
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': `${NAMES[wd]} · ${hit.day.title}`,
      onclick: () => onPick(hit.i),
    } : null,
    h('span.tag', isTrain ? shortTag(hit.day) : ''),
    bar,
    h('span.letter', LETTERS[wd]));

    if (on) cell.classList.add('on');
    strip.appendChild(cell);
  }
  return strip;
}

function shortTag(day) {
  const t = day.title || '';
  if (t.length <= 7) return t;
  return `${t.slice(0, 6)}…`;
}

function weekFoot(program, profile) {
  const trainDays = new Set(program.days.map((d) => d.dayIndex));
  const rest = [];
  for (let i = 0; i < 7; i++) if (!trainDays.has(i)) rest.push(LETTERS[i]);

  const total = program.days.reduce((n, d) => n + d.slots.length, 0);
  const done = program.days.reduce((n, d) => n + d.slots.filter((s) => store.isDone(d.id, s.key)).length, 0);

  return h('div.weekfoot',
    h('span', rest.length
      ? `ימי ${rest.join('׳, ')}׳ — מנוחה. הליכה ומתיחות קלות זה מצוין.`
      : 'שבוע מלא. שים לב להתאוששות.'),
    h('span', { style: { fontFamily: 'var(--mono)', color: done === total && total ? 'var(--cyan)' : 'var(--dim)' } },
      `${done}/${total} השבוע`),
  );
}

export { LETTERS, NAMES };
