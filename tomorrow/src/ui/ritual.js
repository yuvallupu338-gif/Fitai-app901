/*
 * ritual.js — the evening flow: five screens, under a minute, and then a
 * forecast.
 *
 * This is the habit the product is built to create, so the cost of each screen
 * matters more than what it could theoretically collect. Four questions, in the
 * order somebody can actually answer them: what is on tomorrow, how you feel
 * right now, when you plan to sleep, and which of it matters. Anything else the
 * app wants to know it can learn by watching.
 *
 * The last screen is the analysis. A note on that, because it is the one place
 * this app could easily start lying: the stages shown are real work being done
 * in order, not a spinner dressed up as thinking. The forecast is computed
 * between the first stages and the recommendation search — which genuinely is
 * the slow part — runs behind the last one. What is added is a floor of about
 * a fifth of a second per stage so the words can be read on a fast phone, and
 * that floor is dropped entirely for anybody who has asked for less motion.
 * Real work, paced to be legible; not invented latency.
 */

import { h, announce } from '../core/dom.js';
import { itemsOn, putDayPlan, dayPlan } from '../core/store.js';
import { invalidate, inputFor } from '../core/forecast.js';
import { forecast } from '../engine/predict.js';
import { fromMinutes, toMinutes } from '../core/time.js';
import {
  dateLabel, duration as fmtDuration, range as fmtRange, time as fmtTime,
} from '../core/fmt.js';
import { reduced } from '../core/motion.js';
import { icon, ICONS, empty } from './parts.js';
import { openQuickAdd, openItemEditor } from './quickadd.js';

const STAGES = [
  'קורא את הלוח שלך',
  'מעריך אנרגיה',
  'מחפש חלונות ריכוז',
  'בודק עומס',
  'מזהה סיכונים',
  'מחפש מה אפשר לשפר',
];

export function runRitual(ctx, date, onDone) {
  const plan = dayPlan(date);
  const draft = {
    /*
     * The ritual runs tonight and plans tomorrow, so the sleep it asks about is
     * the night that ends on the forecast date — plan.bedtime. That is the one
     * the energy model runs on and the one "sleep earlier" can still change.
     */
    bedtime: plan.bedtime,
    state: plan.eveningState || { energy: 3, mood: 3, stress: 3 },
    top: plan.topPriorities.slice(0, 3),
  };
  let step = 1;

  return ctx.flow((host, close) => {
    const body = h('div.flow-body');
    const head = h('header.flow-head');
    const foot = h('div.flow-actions');
    host.appendChild(h('div.flow-inner', { 'data-t': 'ritual' }, head, body, foot));

    const paint = () => {
      head.textContent = '';
      body.textContent = '';
      foot.textContent = '';

      if (step <= 4) {
        head.appendChild(h('div.ritual-progress', { 'aria-hidden': 'true' },
          Array.from({ length: 4 }, (_, i) => h('i', { class: i < step ? 'on' : '' }))));
        head.appendChild(h('p.eyebrow', { text: `שלב ${step} מתוך 4 · ${dateLabel(date, ctx.now)}` }));
      }

      const screen = h('div', { 'data-t': `ritual-step-${step}` });
      body.appendChild(screen);

      if (step === 1) screenSchedule(screen, ctx, date);
      else if (step === 2) screenFeel(screen, draft);
      else if (step === 3) screenSleep(screen, draft, ctx);
      else if (step === 4) screenPriorities(screen, ctx, date, draft);
      else { screenAnalysis(screen, ctx, date, draft, close, onDone); return; }

      foot.appendChild(h('button.btn.primary', {
        type: 'button', 'data-t': 'ritual-next',
        onclick: () => { step += 1; commitStep(ctx, date, draft); paint(); },
      }, step === 4 ? 'לבנות את מחר' : 'הבא'));

      if (step > 1) {
        foot.appendChild(h('button.btn.ghost', {
          type: 'button', 'data-t': 'ritual-back',
          onclick: () => { step -= 1; paint(); },
        }, 'חזרה'));
      } else {
        foot.appendChild(h('button.btn.ghost', { type: 'button', onclick: () => close() }, 'לא עכשיו'));
      }
    };

    paint();
  }, { testId: 'ritual-flow', label: 'הכנת מחר', dismissible: true });
}

/*
 * Each step writes as it is left, rather than everything landing at the end.
 *
 * Somebody who gets three screens in and closes the app should not lose the
 * bedtime they just set. The forecast is only built at the end, but the answers
 * are theirs from the moment they give them.
 */
function commitStep(ctx, date, draft) {
  putDayPlan(date, {
    bedtime: draft.bedtime,
    eveningState: draft.state,
    topPriorities: draft.top,
  });
  invalidate(date);
}

/* ------------------------------------------------------------------ *
 * 1 — what is on tomorrow
 * ------------------------------------------------------------------ */

function screenSchedule(root, ctx, date) {
  const items = itemsOn(date);
  const fmt = ctx.profile.timeFormat;

  root.appendChild(h('h1.flow-title', { text: 'מה יש לך מחר?' }));
  root.appendChild(h('p.sub', { text: 'אפשר להוסיף, לשנות או להוריד. ככל שזה מדויק יותר, התחזית שווה יותר.' }));

  if (!items.length) {
    root.appendChild(empty({
      title: 'עדיין ריק',
      text: 'אפילו שני דברים מספיקים בשביל תחזית ראשונה.',
    }));
  } else {
    root.appendChild(h('div.list', null, items.map((item) => h('div.list-row', {
      class: `list-row accent-${item.category}`,
    },
    h('span.list-time', { text: item.start === null ? '—' : fmtRange(item.start, item.duration, fmt) }),
    h('div.list-body', null,
      h('span.list-title', { text: item.title }),
      h('span.list-meta', { text: fmtDuration(item.duration) })),
    h('button.btn.icon', {
      type: 'button', 'data-t': 'item-edit', 'aria-label': `עריכת ${item.title}`,
      onclick: () => openItemEditor(ctx, item.id),
    }, icon(ICONS.edit))))));
  }

  root.appendChild(h('button.btn.block', {
    type: 'button', onclick: () => openQuickAdd(ctx, { date }),
  }, icon(ICONS.plus), 'להוסיף משהו'));
}

/* ------------------------------------------------------------------ *
 * 2 — how you feel now
 * ------------------------------------------------------------------ */

/*
 * Asked in the evening, about the evening.
 *
 * It is not a question about tomorrow — nobody can answer that — but tonight's
 * state is one of the better predictors of it, and it is the only reading the
 * app can take at the moment it is being used. The energy model treats it as a
 * level shift, not a forecast.
 */
function screenFeel(root, draft) {
  root.appendChild(h('h1.flow-title', { text: 'איך אתה מרגיש עכשיו?' }));
  root.appendChild(h('p.sub', { text: 'זה עוזר לי לכייל את התחזית של מחר. אין תשובה נכונה.' }));

  root.appendChild(slider('אנרגיה', ['מרוקן', 'נמוכה', 'בסדר', 'טובה', 'מלא כוח'],
    draft.state.energy, (v) => { draft.state.energy = v; }));
  root.appendChild(slider('מצב רוח', ['ירוד', 'לא משהו', 'סביר', 'טוב', 'מצוין'],
    draft.state.mood, (v) => { draft.state.mood = v; }));
  root.appendChild(slider('לחץ', ['רגוע', 'קצת', 'בינוני', 'לחוץ', 'מוצף'],
    draft.state.stress, (v) => { draft.state.stress = v; }));
}

function slider(label, labels, value, onChange) {
  const readout = h('span.slider-value', { text: labels[value - 1] });
  return h('div.slider-row', null,
    h('div.row', null, h('span.label.grow', { text: label }), readout),
    h('input.slider', {
      type: 'range', min: '1', max: '5', step: '1', value: String(value),
      'aria-label': label, 'aria-valuetext': labels[value - 1],
      oninput: (e) => {
        const v = Number(e.target.value);
        readout.textContent = labels[v - 1];
        e.target.setAttribute('aria-valuetext', labels[v - 1]);
        onChange(v);
      },
    }),
    h('div.scale', null, labels.map((l) => h('span', { text: l }))));
}

/* ------------------------------------------------------------------ *
 * 3 — sleep
 * ------------------------------------------------------------------ */

function screenSleep(root, draft, ctx) {
  const wake = ctx.plan.wake;
  const readout = h('p.timepick-note');

  const update = () => {
    const mins = draft.bedtime >= 720 ? (1440 - draft.bedtime) + wake : wake - draft.bedtime;
    readout.textContent = mins > 0
      ? `זה ${fmtDuration(mins)} שינה, אם תקום ב-${fmtTime(wake, ctx.profile.timeFormat)}.`
      : 'השעה הזו לא משאירה זמן לישון לפני הקימה.';
  };

  root.appendChild(h('h1.flow-title', { text: 'מתי אתה מתכנן לישון?' }));
  root.appendChild(h('p.sub', { text: 'זה הדבר היחיד שכמעט תמיד משנה את התחזית של מחר.' }));
  root.appendChild(h('div.timepick', null,
    h('input.time-input.big', {
      type: 'time', 'data-t': 'bedtime', value: fromMinutes(draft.bedtime),
      'aria-label': 'שעת שינה מתוכננת',
      oninput: (e) => { const m = toMinutes(e.target.value); if (m !== null) { draft.bedtime = m; update(); } },
    }),
    readout));

  root.appendChild(h('div.chip-row', null, [-60, -30, -15, 15, 30].map((d) => h('button.chip', {
    type: 'button',
    onclick: () => {
      draft.bedtime = (draft.bedtime + d + 1440) % 1440;
      const input = root.querySelector('input[type="time"]');
      if (input) input.value = fromMinutes(draft.bedtime);
      update();
    },
  }, d < 0 ? `${Math.abs(d)} דק׳ מוקדם יותר` : `${d} דק׳ מאוחר יותר`))));

  update();
}

/* ------------------------------------------------------------------ *
 * 4 — what matters
 * ------------------------------------------------------------------ */

function screenPriorities(root, ctx, date, draft) {
  const items = itemsOn(date).filter((i) => i.kind === 'task' && i.type !== 'break');

  root.appendChild(h('h1.flow-title', { text: 'מה הכי חשוב מחר?' }));
  root.appendChild(h('p.sub', { text: 'עד שלושה. אני אוודא שהם מקבלים את השעות הטובות של היום.' }));

  if (!items.length) {
    root.appendChild(empty({
      title: 'אין מחר משימות לבחור מהן',
      text: 'אירועים נעולים כמו בית ספר או פגישה קורים בכל מקרה — הבחירה הזו היא על מה שתלוי בך.',
    }));
    return;
  }

  root.appendChild(h('div.list', null, items.map((item) => {
    const on = draft.top.includes(item.id);
    return h('button.check-row', {
      type: 'button', 'aria-pressed': on ? 'true' : 'false',
      class: on ? 'check-row is-on' : 'check-row',
      onclick: (e) => {
        if (on) draft.top = draft.top.filter((id) => id !== item.id);
        else if (draft.top.length < 3) draft.top = draft.top.concat([item.id]);
        else { ctx.toast('אפשר לבחור עד שלושה', 'warn'); return; }
        // Re-mark in place rather than repainting the whole step, so the list
        // does not jump under the thumb that just tapped it.
        for (const btn of root.querySelectorAll('.check-row')) {
          const isOn = draft.top.includes(btn.dataset.id);
          btn.classList.toggle('is-on', isOn);
          btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        }
      },
      'data-id': item.id,
    },
    h('span.grow', null,
      h('span.list-title', { text: item.title }),
      h('span.list-meta', { text: fmtDuration(item.duration) })),
    icon(ICONS.check, { class: 'check-mark' }));
  })));
}

/* ------------------------------------------------------------------ *
 * 5 — building tomorrow
 * ------------------------------------------------------------------ */

function screenAnalysis(root, ctx, date, draft, close, onDone) {
  commitStep(ctx, date, draft);

  root.appendChild(h('h1.flow-title.center', { text: 'בונה את מחר' }));
  const list = h('ol.stages', null, STAGES.map((s) => h('li', null,
    h('i.stage-dot', { 'aria-hidden': 'true' }),
    h('span', { text: s }))));
  root.appendChild(list);
  announce('בונה את התחזית של מחר');

  const nodes = Array.from(list.children);
  const floor = reduced() ? 0 : 200;
  let i = 0;

  const advance = () => {
    if (i > 0) nodes[i - 1].classList.add('done');
    if (i >= nodes.length) { finish(); return; }
    nodes[i].classList.add('active');

    /*
     * The real work, split where it actually splits. Everything up to the risk
     * pass is one forecast; the recommendation search behind the last stage is
     * dozens more, and is the reason this screen exists at all rather than the
     * result simply appearing.
     */
    const work = i === 1
      ? () => forecast(Object.assign({}, inputFor(date, ctx.now), { withRecommendation: false }))
      : i === nodes.length - 1
        ? () => forecast(inputFor(date, ctx.now))
        : null;

    i += 1;
    window.setTimeout(() => {
      if (work) work();
      advance();
    }, floor);
  };

  const finish = () => {
    putDayPlan(date, { preparedAt: new Date().toISOString() });
    invalidate(date);
    close();
    if (onDone) onDone();
    ctx.toast('התחזית של מחר מוכנה', 'good');
  };

  advance();
}
