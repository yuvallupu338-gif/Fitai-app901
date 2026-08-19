/*
 * morning.js — the check-in, and the moment the forecast stops being a guess.
 *
 * Three sliders and a skip button. That is the whole budget: this runs while
 * somebody is still holding a toothbrush, and a check-in that takes longer than
 * the answer is worth is a check-in nobody does twice.
 *
 * What comes back matters more than what goes in. Reporting low energy on a
 * morning the model expected a good one is the single most useful correction
 * the app ever receives, so the screen closes by saying what actually moved —
 * the focus window shifting by half an hour is a real, checkable claim, and
 * seeing it move is what teaches people the check-in is worth doing.
 */

import { h } from '../core/dom.js';
import { putRecord, setLearning, get, recentRecords } from '../core/store.js';
import { invalidate, forecastFor } from '../core/forecast.js';
import { todayKey } from '../core/time.js';
import { time as fmtTime, range as fmtRange } from '../core/fmt.js';
import { updateLearning } from '../engine/learning.js';
import { icon, ICONS, delta } from './parts.js';

const LABELS = {
  energy: ['מרוקן', 'נמוכה', 'בסדר', 'טובה', 'מלא כוח'],
  mood: ['ירוד', 'לא משהו', 'סביר', 'טוב', 'מצוין'],
  sleepQuality: ['נורא', 'לא טובה', 'סבירה', 'טובה', 'מצוינת'],
};

export function runMorning(ctx, onDone) {
  const date = todayKey(ctx.now);
  const draft = { energy: 3, mood: 3, sleepQuality: 3 };

  return ctx.flow((host, close) => {
    const body = h('div.flow-body');
    host.appendChild(h('div.flow-inner', { 'data-t': 'morning' },
      h('header.flow-head', null,
        h('div', null,
          h('h1.flow-title', {
            text: ctx.profile.name ? `בוקר טוב, ${ctx.profile.name}` : 'בוקר טוב',
          }),
          h('p.sub', { text: 'התחזית שלך נבנתה אתמול. בוא נראה איך היום באמת מתחיל.' }))),
      body));

    const ask = () => {
      body.textContent = '';
      body.appendChild(slider('אנרגיה', LABELS.energy, draft.energy, (v) => { draft.energy = v; }));
      body.appendChild(slider('מצב רוח', LABELS.mood, draft.mood, (v) => { draft.mood = v; }));
      body.appendChild(slider('איך ישנת', LABELS.sleepQuality, draft.sleepQuality, (v) => { draft.sleepQuality = v; }));
      body.appendChild(h('div.flow-actions', null,
        h('button.btn.primary', {
          type: 'button', 'data-t': 'morning-submit',
          onclick: () => submit(),
        }, 'זה המצב'),
        h('button.btn.ghost', {
          type: 'button', 'data-t': 'morning-skip', onclick: () => close(),
        }, 'לדלג')));
    };

    const submit = () => {
      const before = forecastFor(date, ctx.now);
      const beforeWindow = before.focusWindows[0] || null;
      const beforeScore = before.score;

      putRecord(date, { morning: Object.assign({ at: new Date().toISOString() }, draft) });
      relearn();
      invalidate(date);

      const after = forecastFor(date, ctx.now);
      showChange(body, ctx, beforeScore, beforeWindow, after, close, onDone);
    };

    ask();
  }, { testId: 'morning-flow', label: 'צ׳ק-אין בוקר' });
}

/*
 * What the check-in changed, said in terms somebody can check.
 *
 * "Your energy is lower than predicted, so the focus window moved to 10:45" is
 * a claim about the world. "Forecast updated" is not, and it is the version
 * that makes people stop bothering.
 */
function showChange(body, ctx, beforeScore, beforeWindow, after, close, onDone) {
  const fmt = ctx.profile.timeFormat;
  const win = after.focusWindows[0] || null;
  const moved = beforeWindow && win && Math.abs(win.start - beforeWindow.start) >= 15;
  const scoreMoved = after.score - beforeScore;

  body.textContent = '';
  body.appendChild(h('div.applied-mark', { 'aria-hidden': 'true' }, icon(ICONS.check, { weight: '2.4' })));
  body.appendChild(h('h2.card-title.center', { text: 'עדכנתי את התחזית' }));

  const lines = [];
  if (scoreMoved !== 0) {
    lines.push(h('li', null,
      h('span', { text: `ציון היום ${beforeScore} ← ${after.score} ` }),
      delta(scoreMoved)));
  }
  if (moved) {
    lines.push(h('li', {
      text: `חלון הריכוז זז מ-${fmtTime(beforeWindow.start, fmt)} ל-${fmtRange(win.start, win.end - win.start, fmt)}.`,
    }));
  } else if (win) {
    lines.push(h('li', {
      text: `חלון הריכוז נשאר ${fmtRange(win.start, win.end - win.start, fmt)}.`,
    }));
  }
  if (!lines.length) lines.push(h('li', { text: 'מה שדיווחת תואם למה שציפיתי — התחזית נשארת כמו שהיא.' }));

  body.appendChild(h('ul.why-list', null, lines));
  body.appendChild(h('div.flow-actions', null,
    h('button.btn.primary', {
      type: 'button', onclick: () => { close(); if (onDone) onDone(); },
    }, 'קדימה')));
}

/*
 * Fold the new observation into the learning profile straight away.
 *
 * Waiting until the end of the day would mean today's forecast is built from a
 * model that has not seen this morning, which is the one thing the check-in was
 * for.
 */
function relearn() {
  const root = get();
  setLearning(updateLearning(root.learning, recentRecords(120), Object.values(root.items), {}));
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
