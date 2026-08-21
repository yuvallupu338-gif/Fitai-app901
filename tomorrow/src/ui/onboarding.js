/*
 * onboarding.js — four questions and a way in.
 *
 * The brief is blunt about this and it is right: do not ask thirty questions
 * before letting somebody see the app. Everything here is either something the
 * engine genuinely cannot start without — when you wake, when you sleep — or
 * something that saves the model a week of guessing, like which part of the day
 * you think you focus best in. That last one is a starting prior and nothing
 * more; the moment there is real data, learning.focusPeakHour overrules it.
 *
 * The demo sits on the first screen rather than at the end. Somebody who wants
 * to see what this is before typing their bedtime into it is asking a fair
 * question, and the answer is one tap away.
 */

import { h } from '../core/dom.js';
import { setProfile, replace, update } from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { fromMinutes, toMinutes } from '../core/time.js';
import { demoRoot } from '../data/demo.js';
import { PRIORITY_AREAS, PREFERRED_TIMES } from '../data/catalog.js';
import { icon, ICONS } from './parts.js';

export function runOnboarding(ctx, onDone) {
  const draft = {
    name: '',
    wakeTime: ctx.profile.wakeTime,
    bedTime: ctx.profile.bedTime,
    priorities: [],
    focusPreference: 'unsure',
  };
  let step = 0;

  const SCREENS = [welcome, name, sleep, priorities, focus];

  return ctx.flow((host, close) => {
    const body = h('div.flow-body');
    const head = h('header.flow-head');
    const foot = h('div.flow-actions');
    host.appendChild(h('div.flow-inner', { 'data-t': 'onboarding' }, head, body, foot));

    const paint = () => {
      head.textContent = '';
      body.textContent = '';
      foot.textContent = '';

      if (step > 0) {
        head.appendChild(h('div.ritual-progress', { 'aria-hidden': 'true' },
          Array.from({ length: SCREENS.length - 1 }, (_, i) => h('i', { class: i < step ? 'on' : '' }))));
      }

      SCREENS[step](body, draft, ctx, { next, finish, demo: () => startDemo(ctx, close, onDone) });

      if (step > 0) {
        foot.appendChild(h('button.btn.primary', {
          type: 'button', 'data-t': 'onboarding-next',
          onclick: () => (step === SCREENS.length - 1 ? finish() : next()),
        }, step === SCREENS.length - 1 ? 'לבנות את מחר הראשון' : 'הבא'));
      }
      if (step > 1) {
        foot.appendChild(h('button.btn.ghost', {
          type: 'button', onclick: () => { step -= 1; paint(); },
        }, 'חזרה'));
      }
    };

    function next() { step += 1; paint(); }

    function finish() {
      setProfile({
        name: draft.name.trim(),
        wakeTime: draft.wakeTime,
        bedTime: draft.bedTime,
        priorities: draft.priorities,
        focusPreference: draft.focusPreference,
        timezone: resolveTimezone(),
      });
      update((s) => {
        s.user.onboarded = true;
        s.settings.firstRun = false;
      });
      invalidate();
      close();
      if (onDone) onDone();
    }

    paint();
  }, { testId: 'onboarding-flow', label: 'הגדרה ראשונה', dismissible: false });
}

/*
 * Stored for a future sync, never used to shift a calculation. Reading it here
 * rather than in schema.js keeps the storage layer free of anything that varies
 * by machine, which is what lets the validator pin it down.
 */
function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (e) {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function welcome(body, draft, ctx, nav) {
  body.appendChild(h('div.welcome', null,
    h('span.eyebrow', { text: 'TomorrowAI' }),
    h('h1.flow-title', { text: 'מחר לא חייב להיות הפתעה' }),
    h('p.sub', {
      text: 'אני לומד איך היום שלך באמת עובד — מתי יש לך אנרגיה, מתי אתה מרוכז, כמה זמן דברים באמת לוקחים לך — ומראה לך איך מחר צפוי להיראות לפני שהוא מתחיל. ואז מה אפשר לשנות.',
    }),
    h('ul.why-list', null,
      h('li', { text: 'ציון אחד שאומר איך מחר נראה, ולמה.' }),
      h('li', { text: 'החלון שבו הריכוז שלך צפוי להיות הכי גבוה.' }),
      h('li', { text: 'שינוי אחד קונקרטי שישפר את היום.' })),
    h('p.field-hint', { text: 'הכול נשאר במכשיר שלך. שום דבר לא נשלח לשום מקום.' })));

  body.appendChild(h('div.flow-actions', null,
    h('button.btn.primary', {
      type: 'button', 'data-t': 'onboarding-next', onclick: () => nav.next(),
    }, 'בוא נתחיל'),
    h('button.btn.ghost', {
      type: 'button', 'data-t': 'demo-start', onclick: () => nav.demo(),
    }, icon(ICONS.spark), 'להסתכל על דמו')));
}

function name(body, draft) {
  body.appendChild(h('h1.flow-title', { text: 'איך לקרוא לך?' }));
  body.appendChild(h('p.sub', { text: 'רק בשביל לפתוח את המסך בבוקר. אפשר גם לדלג.' }));
  body.appendChild(h('label.field', null,
    h('span.label', { text: 'שם' }),
    h('input.input', {
      type: 'text', value: draft.name, maxlength: '40', autocomplete: 'given-name',
      placeholder: 'השם שלך',
      oninput: (e) => { draft.name = e.target.value; },
    })));
}

function sleep(body, draft, ctx) {
  const note = h('p.field-hint');
  const update = () => {
    const mins = draft.bedTime >= 720
      ? (1440 - draft.bedTime) + draft.wakeTime
      : draft.wakeTime - draft.bedTime;
    note.textContent = mins > 0
      ? `זה בערך ${Math.floor(mins / 60)} שעות ו-${mins % 60} דקות בלילה.`
      : 'השעות האלה לא משאירות זמן לישון — כדאי לבדוק אותן.';
  };

  body.appendChild(h('h1.flow-title', { text: 'מתי היום שלך מתחיל ונגמר?' }));
  body.appendChild(h('p.sub', { text: 'ביום רגיל. זה הבסיס לכל תחזית האנרגיה, ואפשר לשנות את זה לכל יום בנפרד.' }));

  body.appendChild(h('label.field', null,
    h('span.label', { text: 'שעת קימה רגילה' }),
    h('input.time-input', {
      type: 'time', value: fromMinutes(draft.wakeTime),
      oninput: (e) => { const m = toMinutes(e.target.value); if (m !== null) { draft.wakeTime = m; update(); } },
    })));

  body.appendChild(h('label.field', null,
    h('span.label', { text: 'שעת שינה רגילה' }),
    h('input.time-input', {
      type: 'time', 'data-t': 'bedtime', value: fromMinutes(draft.bedTime),
      oninput: (e) => { const m = toMinutes(e.target.value); if (m !== null) { draft.bedTime = m; update(); } },
    })));

  body.appendChild(note);
  update();
}

function priorities(body, draft) {
  body.appendChild(h('h1.flow-title', { text: 'מה הכי חשוב לך עכשיו?' }));
  body.appendChild(h('p.sub', { text: 'אפשר לבחור כמה שרוצים. זה משפיע על מה שאני אציע לך לשנות.' }));
  body.appendChild(h('div.chip-row', { role: 'group' }, PRIORITY_AREAS.map((area) => h('button.chip', {
    type: 'button', role: 'radio',
    'aria-checked': draft.priorities.includes(area.token) ? 'true' : 'false',
    class: draft.priorities.includes(area.token) ? 'chip is-on' : 'chip',
    onclick: (e) => {
      const on = draft.priorities.includes(area.token);
      draft.priorities = on
        ? draft.priorities.filter((t) => t !== area.token)
        : draft.priorities.concat([area.token]);
      e.currentTarget.classList.toggle('is-on', !on);
      e.currentTarget.setAttribute('aria-checked', !on ? 'true' : 'false');
    },
  }, area.label))));
}

function focus(body, draft) {
  body.appendChild(h('h1.flow-title', { text: 'מתי אתה בדרך כלל הכי מרוכז?' }));
  body.appendChild(h('p.sub', {
    text: 'זו רק נקודת התחלה. ברגע שיהיו לי כמה ימים אמיתיים, אני אלך לפי מה שקורה בפועל ולא לפי מה שנראה לך.',
  }));
  body.appendChild(h('div.chip-row', { role: 'radiogroup' }, PREFERRED_TIMES.map((t) => h('button.chip', {
    type: 'button', role: 'radio',
    'aria-checked': draft.focusPreference === t.token ? 'true' : 'false',
    class: draft.focusPreference === t.token ? 'chip is-on' : 'chip',
    onclick: (e) => {
      draft.focusPreference = t.token;
      for (const b of e.currentTarget.parentElement.children) {
        const on = b === e.currentTarget;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    },
  }, t.label))));
}

/* ------------------------------------------------------------------ *
 * Demo
 * ------------------------------------------------------------------ */

/*
 * Loading the demo replaces the whole document, which is safe here and only
 * here: this runs on first launch, before anybody has typed anything worth
 * keeping. The demo flag on the user record is what lets the profile screen
 * offer to clear it later.
 */
function startDemo(ctx, close, onDone) {
  const now = new Date();
  replace(demoRoot(now.toISOString(), now));
  invalidate();
  close();
  if (onDone) onDone();
}
