/*
 * progress.js — weight log, weekly adherence and the week-by-week note.
 * Everything here is stored on the device only.
 */

import { h, clear, announce } from '../core/dom.js';
import { weeklyPlanNote, progressionModel } from '../engine/progression.js';
import { withholdsBodyNumbers } from '../engine/age.js';
import * as store from '../core/store.js';

export function renderProgress(root, program, profile) {
  const view = h('section');
  root.appendChild(view);

  function draw() {
    clear(view);
    const st = store.get();
    const week = store.currentWeek();
    const model = safe(() => progressionModel(profile), null);
    const isDeload = model && model.deloadEveryWeeks
      ? week % model.deloadEveryWeeks === 0 : false;

    // The nutrition tab tells a trainee under 16 not to weigh weekly, and says
    // why: they are still growing, so the number is supposed to rise. This tab
    // used to open with the opposite instruction and hand them a button for it.
    // Same plan, same screen-full, two contradicting answers.
    const noBodyNumbers = withholdsBodyNumbers(profile);

    view.appendChild(h('h3', 'מעקב'));
    view.appendChild(h('p.lead', noBodyNumbers
      ? 'מה שנמדד כאן זה מה שקורה באימון — חזרות, משקלים והתמדה. לא המספר על המאזניים: '
        + 'בגיל הזה הוא אמור לעלות, ומעקב שבועי אחריו מלמד לקרוא גדילה ככישלון.'
      : 'שקילה אחת בשבוע. אותו יום, בבוקר, אחרי שירותים, לפני שאתה אוכל. משקל יומי קופץ קילו בין בוקר לערב ולא אומר כלום.'));

    // These four are the point of the screen rather than a list of profile
    // facts, so they get the card treatment: number first, label under it.
    const stat = (value, label, hot) => h('div.statcard' + (hot ? '.hot' : ''),
      h('b', String(value)), h('span', label));
    view.appendChild(h('div.statgrid',
      stat(week, 'שבוע'),
      stat(`${doneDays(program)}/${program.days.length}`, 'אימונים השבוע'),
      (!noBodyNumbers && st.weights.length)
        ? stat(`${st.weights[st.weights.length - 1].kg}`, 'משקל אחרון · ק״ג') : null,
      isDeload ? stat('דילואד', 'סוג השבוע', true) : null,
    ));

    const note = safe(() => weeklyPlanNote(profile, week), '');
    if (note) view.appendChild(h('p.focus', { style: { marginTop: '18px' } }, note));

    /* ---- weight entry ---- */
    // Withheld under 16 rather than merely discouraged. Leaving the field on
    // screen under a paragraph explaining not to use it is an invitation with a
    // disclaimer, and the disclaimer loses.
    if (!noBodyNumbers) {
      view.appendChild(h('div.rule'));
      view.appendChild(h('h3', 'משקל'));

      const input = h('input', {
        type: 'number', inputmode: 'decimal', step: '0.1', min: '20', max: '300',
        placeholder: String(profile.weightKg || ''),
      });
      view.appendChild(h('div.logrow', { style: { marginTop: '10px' } },
        input,
        h('button.btn', {
          type: 'button',
          onclick: () => {
            const kg = Number(input.value);
            if (!kg || kg < 20 || kg > 300) { input.focus(); return; }
            store.addWeight(kg);
            input.value = '';
            draw();
            announce('המשקל נשמר');
          },
        }, h('span.ico', '+'), 'רשום שקילה'),
      ));

      if (st.weights.length >= 2) {
        view.appendChild(sparkline(st.weights, profile.targetWeightKg));
        const first = st.weights[0];
        const last = st.weights[st.weights.length - 1];
        const delta = last.kg - first.kg;
        view.appendChild(h('p.lead',
          `${st.weights.length} שקילות · שינוי כולל ${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10} ק״ג מאז ${formatDate(first.date)}.`));
      } else {
        view.appendChild(h('p.empty', 'שתי שקילות ומעלה — ותופיע כאן גרף מגמה.'));
      }
    }

    /* ---- adherence ---- */
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'ביצוע השבוע'));
    view.appendChild(h('div.list', program.days.map((d) => {
      const total = d.slots.length || 1;
      const done = d.slots.filter((s) => store.isDone(d.id, s.key)).length;
      const pct = Math.round((done / total) * 100);
      return h('div.ex',
        h('span.num', `${pct}%`),
        h('div.body-col',
          h('div.name', d.title),
          h('div.prescr',
            h('span.chip' + (done === total ? '' : '.rest'), `${done}/${total} תרגילים`),
            done === total ? h('span.chip.time', 'הושלם') : null),
        ),
        h('div.acts'));
    })));

    /* ---- data controls ---- */
    view.appendChild(h('div.rule'));
    view.appendChild(h('h3', 'הנתונים שלך'));
    view.appendChild(h('p.lead', 'הכול נשמר במכשיר הזה בלבד — לא נשלח לשום שרת. גיבוי הוא באחריותך.'));
    view.appendChild(h('div.toolbar',
      h('button.btn', {
        type: 'button',
        onclick: () => {
          const blob = new Blob([store.exportJson()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `fitai-${store.todayKey()}.json` });
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
        },
      }, h('span.ico', '↓'), 'ייצוא גיבוי'),
      h('button.btn', {
        type: 'button',
        onclick: () => {
          const file = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
          file.addEventListener('change', () => {
            const f = file.files && file.files[0];
            if (!f) return;
            f.text().then((t) => {
              try { store.importJson(t); location.reload(); }
              catch (e) { announce('הקובץ לא תקין'); }
            });
          });
          document.body.appendChild(file);
          file.click();
          setTimeout(() => file.remove(), 1000);
        },
      }, h('span.ico', '↑'), 'שחזור מגיבוי'),
      h('button.btn.danger', {
        type: 'button',
        onclick: () => {
          if (window.confirm('למחוק את כל הנתונים ולהתחיל מחדש? אין דרך חזרה.')) {
            store.reset();
            location.reload();
          }
        },
      }, h('span.ico', '✕'), 'התחל מחדש'),
    ));
  }

  draw();
  return { redraw: draw };
}

function doneDays(program) {
  return program.days.filter((d) => d.slots.length && d.slots.every((s) => store.isDone(d.id, s.key))).length;
}

function sparkline(weights, target) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 300;
  const H = 64;
  const pad = 4;

  const values = weights.map((w) => w.kg);
  if (target) values.push(target);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;

  const x = (i) => pad + (i / Math.max(1, weights.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `מגמת משקל: ${weights.length} שקילות`);

  if (target) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('class', 'grid');
    line.setAttribute('x1', pad); line.setAttribute('x2', W - pad);
    line.setAttribute('y1', y(target)); line.setAttribute('y2', y(target));
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);
  }

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', weights.map((w, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(w.kg).toFixed(1)}`).join(' '));
  svg.appendChild(path);

  const last = document.createElementNS(NS, 'circle');
  last.setAttribute('cx', x(weights.length - 1));
  last.setAttribute('cy', y(weights[weights.length - 1].kg));
  last.setAttribute('r', '2.6');
  svg.appendChild(last);

  return svg;
}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { console.error(e); return fallback; }
}

function formatDate(d) {
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}` : d;
}
