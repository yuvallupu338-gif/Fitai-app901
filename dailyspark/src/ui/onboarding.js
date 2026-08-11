/*
 * onboarding.js — four screens, all skippable, no account, no permissions.
 *
 * The order is the product decision here. Everything that costs the person
 * something — the notification prompt, and in a server version the account —
 * happens *after* the first spark, not before it. Asking for a permission
 * before delivering any value is the single most common way this category of
 * app throws away its opt-in rate, and on iOS the system prompt can only be
 * shown once, so spending it early is spending it for good.
 *
 * Every step can be skipped. Someone who skips all four still gets a working
 * app: the profile falls back to a neutral segment and the ranker's high
 * initial variance does the rest within a week. Skipping beats abandoning.
 */

import { h, clear, haptic } from '../core/dom.js';
import * as store from '../core/store.js';
import { GOALS, CATEGORIES, BUDGETS, TONES, categoryLabel } from '../data/taxonomy.js';

const MAX_GOALS = 3;

/* Live sample lines for the tone picker. Showing the voice beats naming it —
 * "סטואי" means very little until you have read one. */
const TONE_SAMPLE = {
  gentle: 'בלי יעד ובלי מרחק. פשוט לצאת מהדלת ולחזור.',
  direct: 'ארבע דקות. עכשיו, לא אחר כך.',
  humorous: 'המעלית תמיד תהיה שם. היא מאוד סבלנית.',
  stoic: 'מה שבידיים שלך היום זה קטן מאוד. וזה מספיק.',
  practical: 'הבוקר הוא הזמן שהכי סביר שתעשה את זה.',
};

export function renderOnboarding(root, onDone) {
  const state = store.get();
  const draft = {
    goals: state.profile.goals.slice(),
    customGoal: state.profile.customGoal || '',
    important: new Set(
      Object.keys(state.profile.interests).filter((k) => state.profile.interests[k] === 2),
    ),
    budgetMinutes: state.profile.budgetMinutes,
    tone: state.profile.tone,
  };
  let step = 0;

  const STEPS = [welcome, goals, interests, shape];

  function commit() {
    store.update((s) => {
      s.profile.goals = draft.goals.slice(0, MAX_GOALS);
      s.profile.customGoal = draft.customGoal.trim();
      s.profile.budgetMinutes = draft.budgetMinutes;
      s.profile.tone = draft.tone;
      for (const cat of CATEGORIES) {
        s.profile.interests[cat.key] = draft.important.has(cat.key) ? 2 : 1;
      }
      s.stage = 'app';
      s.onboardingStep = STEPS.length;
    });
    onDone();
  }

  function go(next) {
    if (next >= STEPS.length) { commit(); return; }
    step = Math.max(0, next);
    store.update((s) => { s.onboardingStep = step; });
    draw();
  }

  function progress() {
    return h('div.ob-progress', { 'aria-hidden': 'true' },
      STEPS.map((_, i) => h(`span.ob-dot${i <= step ? '.is-on' : ''}`)));
  }

  function footer(primaryLabel, opts) {
    const o = opts || {};
    return h('div.ob-footer',
      h('button.btn.btn-primary', {
        onclick: () => { haptic('light'); go(step + 1); },
        disabled: o.disabled || false,
      }, primaryLabel),
      o.hideSkip ? null : h('button.btn.btn-ghost', {
        onclick: () => { haptic('light'); go(step + 1); },
      }, step === STEPS.length - 1 ? 'דלג וסיים' : 'דלג'));
  }

  /* ---------------------------------------------------------------- step 1 */
  function welcome() {
    return h('section.ob-step.ob-welcome',
      h('div.ob-mark', { 'aria-hidden': 'true' }, sparkMark()),
      h('h1.ob-title', 'ניצוץ אחד ביום.'),
      h('p.ob-lede', 'לא פיד, לא רשימה, לא עוד אפליקציה שתדרוש ממך זמן. פריט אחד, קטן מספיק כדי באמת לעשות אותו.'),
      h('ul.ob-points',
        h('li', 'פחות מדקה כדי לקרוא. לרוב פחות מחמש כדי לעשות.'),
        h('li', 'לומד ממך — מה שאתה מסמן היום קובע מה תקבל מחר.'),
        h('li', 'הכל נשמר במכשיר שלך. אין חשבון ואין שרת.')),
      footer('בוא נתחיל', { hideSkip: true }));
  }

  /* ---------------------------------------------------------------- step 2 */
  function goals() {
    const count = () => h('span.ob-count', `${draft.goals.length}/${MAX_GOALS}`);
    const counter = count();

    function toggle(key, btn) {
      const at = draft.goals.indexOf(key);
      if (at >= 0) draft.goals.splice(at, 1);
      else if (draft.goals.length < MAX_GOALS) draft.goals.push(key);
      else { haptic('warn'); return; }
      haptic('select');
      btn.classList.toggle('is-on', draft.goals.includes(key));
      btn.setAttribute('aria-pressed', String(draft.goals.includes(key)));
      counter.textContent = `${draft.goals.length}/${MAX_GOALS}`;
    }

    return h('section.ob-step',
      h('h2.ob-title', 'מה מביא אותך לכאן?'),
      h('p.ob-lede', 'עד שלוש. אפשר לשנות מתי שתרצה.', counter),
      h('div.chip-grid', GOALS.map((g) => {
        const on = draft.goals.includes(g.key);
        const btn = h(`button.chip${on ? '.is-on' : ''}`, {
          type: 'button', 'aria-pressed': String(on),
          onclick: () => toggle(g.key, btn),
        }, g.he);
        return btn;
      })),
      h('label.field',
        h('span.field-label', 'או משהו משלך'),
        h('input.input', {
          type: 'text', value: draft.customGoal, maxlength: '60',
          placeholder: 'למשל: לחזור לנגן',
          oninput: (e) => { draft.customGoal = e.target.value; },
        })),
      footer('הלאה'));
  }

  /* ---------------------------------------------------------------- step 3 */
  function interests() {
    return h('section.ob-step',
      h('h2.ob-title', 'מה מעניין אותך?'),
      h('p.ob-lede', 'סמן את מה שחשוב לך. מה שלא סימנת עדיין יופיע לפעמים — רק פחות.'),
      h('div.chip-grid', CATEGORIES.map((c) => {
        const on = draft.important.has(c.key);
        const btn = h(`button.chip${on ? '.is-on' : ''}`, {
          type: 'button', 'aria-pressed': String(on),
          onclick: () => {
            if (draft.important.has(c.key)) draft.important.delete(c.key);
            else draft.important.add(c.key);
            haptic('select');
            const nowOn = draft.important.has(c.key);
            btn.classList.toggle('is-on', nowOn);
            btn.setAttribute('aria-pressed', String(nowOn));
          },
        }, c.he);
        return btn;
      })),
      footer('הלאה'));
  }

  /* ---------------------------------------------------------------- step 4 */
  function shape() {
    const sample = h('p.tone-sample', TONE_SAMPLE[draft.tone]);

    return h('section.ob-step',
      h('h2.ob-title', 'כמה זמן, ובאיזה טון'),
      h('p.ob-lede', 'זה קובע את גודל הניצוץ ואת איך שהוא מנוסח.'),

      h('div.field',
        h('span.field-label', 'כמה זמן יש לך ביום'),
        h('div.seg', { role: 'radiogroup', 'aria-label': 'תקציב זמן' },
          BUDGETS.map((b) => {
            const on = draft.budgetMinutes === b.minutes;
            return h(`button.seg-item${on ? '.is-on' : ''}`, {
              type: 'button', role: 'radio', 'aria-checked': String(on),
              onclick: (e) => {
                draft.budgetMinutes = b.minutes;
                haptic('select');
                for (const el of e.target.parentNode.children) {
                  el.classList.remove('is-on');
                  el.setAttribute('aria-checked', 'false');
                }
                e.target.classList.add('is-on');
                e.target.setAttribute('aria-checked', 'true');
              },
            }, b.he);
          }))),

      h('div.field',
        h('span.field-label', 'איך לדבר אליך'),
        h('div.chip-grid.chip-grid-tight', TONES.map((t) => {
          const on = draft.tone === t.key;
          const btn = h(`button.chip${on ? '.is-on' : ''}`, {
            type: 'button', 'aria-pressed': String(on),
            onclick: () => {
              draft.tone = t.key;
              haptic('select');
              for (const el of btn.parentNode.children) {
                el.classList.remove('is-on');
                el.setAttribute('aria-pressed', 'false');
              }
              btn.classList.add('is-on');
              btn.setAttribute('aria-pressed', 'true');
              sample.textContent = TONE_SAMPLE[draft.tone];
            },
          }, t.he);
          return btn;
        })),
        sample),

      footer('בנה לי ניצוץ', { hideSkip: false }));
  }

  function draw() {
    clear(root);
    root.appendChild(h('div.ob',
      progress(),
      STEPS[step](),
      step > 0 ? h('button.ob-back', {
        type: 'button', 'aria-label': 'חזרה',
        onclick: () => go(step - 1),
      }, '→ חזרה') : null));
    const heading = root.querySelector('h1,h2');
    if (heading) heading.setAttribute('tabindex', '-1');
    if (heading && step > 0) heading.focus();
  }

  draw();
}

/*
 * The mark: an asymmetric four-point spark. Drawn rather than imported so the
 * single-file build has no asset to lose, and asymmetric so it reads as a
 * spark rather than as a sparkle emoji.
 */
export function sparkMark(size) {
  const s = size || 44;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(s));
  svg.setAttribute('height', String(s));
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M17.2 2.4c.3 6 1.9 9.1 6.7 10.6-4.4 1.1-6.2 3.5-7.3 8.6-.9-4.6-2.4-6.9-6.1-8.1 3.9-1.4 5.6-4.1 6.7-11.1zM9.4 19.6c.5 3.4 1.3 4.8 3.6 5.6-2.2.7-3 1.9-3.6 4.4-.4-2.4-1.2-3.6-3-4.3 2-.7 2.7-1.9 3-5.7z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/** Name of a category, re-exported so screens do not all import taxonomy. */
export { categoryLabel };
