/*
 * progress.js — weight log, weekly adherence and the week-by-week note.
 * Everything here is stored on the device only.
 */

import { h, clear, announce, signedNum } from '../core/dom.js';
import { weeklyPlanNote, progressionModel } from '../engine/progression.js';
import { withholdsBodyNumbers } from '../engine/age.js';
import { retestCard, retestSummary } from './retest.js';
import * as store from '../core/store.js';

export function renderProgress(root, program, profile, opts) {
  const view = h('section');
  const o = opts || {};
  root.appendChild(view);

  /* Survives a redraw so the "what changed" line is still there after the
     numbers are saved and the card has gone. */
  let lastMoved = null;

  /*
   * The profile can change under this screen without a rebuild. A re-test whose
   * numbers moved no levels updates the stamp and nothing else — deliberately,
   * so measuring and finding out you are where you were does not tear down the
   * week. But draw() closes over the profile it was handed, so reading that one
   * meant the card the trainee had just answered was still on screen, still
   * saying the numbers were four weeks old.
   */
  let live = profile;

  function draw() {
    clear(view);
    const st = store.get();
    const week = store.currentWeek();
    const model = safe(() => progressionModel(live), null);
    const isDeload = model && model.deloadEveryWeeks
      ? week % model.deloadEveryWeeks === 0 : false;

    // The nutrition tab tells a trainee under 16 not to weigh weekly, and says
    // why: they are still growing, so the number is supposed to rise. This tab
    // used to open with the opposite instruction and hand them a button for it.
    // Same plan, same screen-full, two contradicting answers.
    const noBodyNumbers = withholdsBodyNumbers(live);

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

    /* ---- four-week re-test ---- */
    /*
     * A rebuild re-runs renderApp from scratch, so a local variable cannot
     * carry the result of the submit across it. The moved list is parked in
     * ui, read once and cleared — the trainee measured, and the screen has to
     * say what it bought rather than silently swap their exercises.
     */
    if (lastMoved === null && st.ui.retestMoved) {
      lastMoved = st.ui.retestMoved;
      store.set({ ui: Object.assign({}, store.get().ui, { retestMoved: null }) });
    }
    if (lastMoved) view.appendChild(retestSummary(lastMoved));

    const card = safe(() => retestCard(live, st.ui, {
      onApply: (next, moved) => {
        /*
         * Nothing is rebuilt when nothing moved. The commonest honest result
         * of a re-test is "the same numbers", and an app that tears down the
         * week to announce that is an app that charges you for measuring.
         */
        if (!moved.length) {
          lastMoved = [];
          live = next;
          if (o.onProfileChange) o.onProfileChange(next);
          draw();
          return;
        }
        store.set({ ui: Object.assign({}, store.get().ui, { retestMoved: moved }) });
        /* Said here, before the rebuild, because rebuild() announces its own
           generic line and a polite region rewritten milliseconds later speaks
           only the last one. One combined sentence, once. */
        announce(`המספרים עודכנו. ${moved.length} דפוסי תנועה זזים רמה, התוכנית נבנית מחדש.`);
        if (o.onRebuild) o.onRebuild(next, { keepTab: true });
      },
      onSnooze: () => {
        store.set({ ui: Object.assign({}, store.get().ui, { retestSnoozeAt: new Date().toISOString() }) });
        draw();
      },
    }), null);
    if (card) view.appendChild(card);

    const note = safe(() => weeklyPlanNote(live, week), '');
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
        placeholder: String(live.weightKg || ''),
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
        view.appendChild(sparkline(st.weights, live.targetWeightKg));
        const first = st.weights[0];
        const last = st.weights[st.weights.length - 1];
        const delta = last.kg - first.kg;
        view.appendChild(h('p.lead',
          `${st.weights.length} שקילות · שינוי כולל `,
          signedNum(`${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}`),
          ` ק״ג מאז ${formatDate(first.date)}.`));
      } else {
        view.appendChild(h('p.empty', 'שתי שקילות ומעלה — ויופיע כאן גרף מגמה.'));
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
    view.appendChild(h('p.lead', store.persists()
      ? 'הכול נשמר במכשיר הזה בלבד — לא נשלח לשום שרת. גיבוי הוא באחריותך.'
      : 'הדפדפן הזה לא מרשה לשמור מידע, כנראה גלישה פרטית. שום דבר כאן לא ישרוד רענון — '
        + 'אם אתה רוצה לשמור את התוכנית, ייצא גיבוי עכשיו ופתח אותו בחלון רגיל.'));
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
            /*
             * Restoring replaces everything: profile, programme, ticks, logged
             * sets, weight history. It asked for none of that — and the button
             * two places along that says "start over" does ask. The one that
             * sounds safe was the one that wiped a year without a word.
             *
             * The failure was screen-reader only too, through announce(), so a
             * sighted user who picked the wrong file saw the page do nothing at
             * all and had no way to know whether it had worked.
             */
            const hasWork = st.program || (st.weights || []).length
              || Object.keys(st.done || {}).length || Object.keys(st.logs || {}).length;
            if (hasWork && !window.confirm(
              'שחזור מגיבוי מחליף את כל מה שיש כאן — התוכנית, הסימונים, הסטים שרשמת וההיסטוריה. '
              + 'אי אפשר לבטל. להמשיך?')) return;

            f.text().then((t) => {
              try { store.importJson(t); location.reload(); }
              catch (e) {
                announce('הקובץ לא תקין');
                const box = h('p.err', { role: 'alert' },
                  'הקובץ הזה הוא לא גיבוי של FitAI, ולכן שום דבר לא השתנה. '
                  + 'קובץ גיבוי נוצר מהכפתור "ייצוא גיבוי" ליד.');
                const holder = view.querySelector('.toolbar') || view;
                const old = holder.querySelector('.err');
                if (old) old.remove();
                holder.appendChild(box);
              }
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
