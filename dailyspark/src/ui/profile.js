/*
 * profile.js — personalisation, settings and data.
 *
 * The framing matters: this screen is the person's control panel over the
 * engine, not a form. Every change says, in words, when it takes effect —
 * "הניצוץ של מחר כבר יביא את זה בחשבון" — because the alternative is a toggle
 * that seems to do nothing for twenty-four hours and gets flipped back.
 *
 * The data section is deliberately blunt. Export is one tap, delete is two, and
 * neither is hidden behind a retention flow. An app that holds a year of
 * somebody's private notes has to be obviously easy to leave.
 */

import { h, clear, sheet, toast, haptic, ltr } from '../core/dom.js';
import * as store from '../core/store.js';
import { GOALS, CATEGORIES, BUDGETS, TONES, categoryLabel } from '../data/taxonomy.js';
import { librarySize } from '../data/sparks.index.js';
import { selectSpark } from '../engine/select.js';
import * as streak from '../core/streak.js';
import * as notify from './notify.js';
import { LADDER } from './notify.js';

const MAX_GOALS = 3;

export function renderProfile(root, ctx) {
  const state = store.get();
  const st = streak.summary();
  const days = Object.keys(state.days);
  const done = days.filter((k) => state.days[k].status === 'completed').length;

  clear(root);

  root.appendChild(h('header.screen-head',
    h('h1.screen-title', 'הפרופיל שלך'),
    h('p.screen-lede', `${days.length} ימים · ${done} ניצוצות בוצעו`)));

  root.appendChild(h('section.card.stat-strip',
    stat('רצף', st.current),
    stat('שיא', st.longest),
    stat('הקפאות', st.freezesLeft)));

  root.appendChild(goalsCard(root, ctx));
  root.appendChild(interestsCard(root, ctx));
  root.appendChild(shapeCard(root, ctx));
  root.appendChild(notifyCard(root, ctx));
  root.appendChild(appearanceCard(root, ctx));
  root.appendChild(dataCard(root, ctx));
  root.appendChild(aboutCard());
}

function stat(label, value) {
  return h('div.stat', h('dt', label), h('dd', ltr(value)));
}

function saved() {
  toast('עודכן. הניצוץ של מחר כבר יביא את זה בחשבון.');
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

function goalsCard(root, ctx) {
  const state = store.get();
  const chosen = new Set(state.profile.goals);

  return h('section.card',
    h('h2.card-title', 'מטרות'),
    h('p.card-lede', 'עד שלוש. אלה מה שהמנוע מכוון אליו קודם כל.'),
    h('div.chip-grid', GOALS.map((g) => {
      const on = chosen.has(g.key);
      return h(`button.chip${on ? '.is-on' : ''}`, {
        'aria-pressed': String(on),
        onclick: () => {
          store.update((s) => {
            const at = s.profile.goals.indexOf(g.key);
            if (at >= 0) s.profile.goals.splice(at, 1);
            else if (s.profile.goals.length < MAX_GOALS) s.profile.goals.push(g.key);
            else { haptic('warn'); return; }
          });
          haptic('select');
          saved();
          renderProfile(root, ctx);
        },
      }, g.he);
    })),
    h('label.field',
      h('span.field-label', 'מטרה משלך'),
      h('input.input', {
        type: 'text', value: state.profile.customGoal || '', maxlength: '60',
        placeholder: 'למשל: לחזור לנגן',
        onchange: (e) => {
          store.update((s) => { s.profile.customGoal = e.target.value.trim(); });
          saved();
        },
      })));
}

/* ------------------------------------------------------------------ *
 * Interests — three states, because two is not enough
 * ------------------------------------------------------------------ */

/*
 * "חשוב לי" / "מעניין" / "לא" rather than a like/dislike toggle.
 *
 * With two states everything a person is willing to see becomes indistinguishable,
 * and the ranker has nothing to order by. The third state also gives "לא" a real
 * meaning: it is a hard filter in retrieval, not a preference — which is what
 * people expect when they say no to a subject.
 */
function interestsCard(root, ctx) {
  const state = store.get();
  const label = { 2: 'חשוב לי', 1: 'מעניין', 0: 'לא' };

  return h('section.card',
    h('h2.card-title', 'תחומי עניין'),
    h('p.card-lede', 'הקש כדי לעבור בין שלושת המצבים. "לא" חוסם את התחום לגמרי.'),
    h('div.interest-grid', CATEGORIES.map((c) => {
      const value = state.profile.interests[c.key];
      const btn = h(`button.interest.lvl-${value}`, {
        'aria-label': `${c.he}: ${label[value]}`,
        onclick: () => {
          store.update((s) => {
            const next = (s.profile.interests[c.key] + 2) % 3;   // 2 → 1 → 0 → 2
            s.profile.interests[c.key] = next;
            const blocked = new Set(s.profile.blocked);
            if (next === 0) blocked.add(c.key); else blocked.delete(c.key);
            s.profile.blocked = Array.from(blocked);
          });
          haptic('select');
          renderProfile(root, ctx);
        },
      }, h('span.interest-name', c.he), h('span.interest-state', label[value]));
      return btn;
    })));
}

/* ------------------------------------------------------------------ *
 * Tone and size, with a live preview
 * ------------------------------------------------------------------ */

/*
 * The preview runs the real selector against the real profile with the
 * candidate settings, so what is shown is what tomorrow would actually bring.
 * A hand-written sample would be a mock-up of the app's own behaviour, and
 * mock-ups drift.
 */
function shapeCard(root, ctx) {
  const state = store.get();
  const preview = h('div.preview');

  function refresh() {
    const picked = selectSpark(store.get(), { ignoreArc: true });
    clear(preview);
    if (!picked) return;
    preview.append(
      h('span.preview-label', 'ככה ייראה ניצוץ בהגדרות האלה'),
      h('p.preview-title', picked.framed.title),
      h('p.preview-action', picked.framed.action),
    );
  }

  const card = h('section.card',
    h('h2.card-title', 'זמן וטון'),
    h('div.field',
      h('span.field-label', 'כמה זמן יש לך ביום'),
      h('div.seg', BUDGETS.map((b) => h(
        `button.seg-item${state.profile.budgetMinutes === b.minutes ? '.is-on' : ''}`,
        {
          onclick: () => {
            store.update((s) => { s.profile.budgetMinutes = b.minutes; });
            haptic('select');
            saved();
            renderProfile(root, ctx);
          },
        }, b.he,
      )))),
    h('div.field',
      h('span.field-label', 'איך לדבר אליך'),
      h('div.chip-grid.chip-grid-tight', TONES.map((t) => h(
        `button.chip${state.profile.tone === t.key ? '.is-on' : ''}`,
        {
          onclick: () => {
            store.update((s) => { s.profile.tone = t.key; s.profile.toneQuestioned = 0; });
            haptic('select');
            saved();
            renderProfile(root, ctx);
          },
        }, t.he,
      )))),
    preview);

  refresh();
  return card;
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

function notifyCard(root, ctx) {
  const state = store.get();
  const cfg = state.settings.notify;
  const perm = notify.permission();

  const rows = [];

  if (perm === 'unsupported') {
    rows.push(h('p.card-lede', 'הדפדפן הזה לא תומך בהתראות.'));
  } else if (perm === 'denied') {
    rows.push(h('p.card-lede', 'ההתראות חסומות ברמת הדפדפן. אפשר לשנות את זה בהגדרות האתר.'));
  } else if (perm === 'default') {
    rows.push(h('button.btn.btn-primary', {
      onclick: async () => {
        const r = await notify.requestPermission();
        if (r === 'granted') { notify.schedule(); toast('נשלח לך ניצוץ אחד ביום.'); }
        renderProfile(root, ctx);
      },
    }, 'הפעל תזכורת יומית'));
  } else {
    rows.push(
      h('p.card-lede', `הבאה: ${notify.nextText()}`),

      h('div.field',
        h('span.field-label', 'תדירות'),
        h('div.ladder', LADDER.map((rung) => h(
          `button.ladder-step${cfg.ladder === rung.level ? '.is-on' : ''}`,
          {
            onclick: () => {
              store.update((s) => {
                s.settings.notify.ladder = rung.level;
                s.settings.notify.autoSteppedDown = false;
              });
              notify.schedule();
              haptic('select');
              renderProfile(root, ctx);
            },
          }, rung.label,
        )))),

      h('div.field',
        h('span.field-label', 'שעה'),
        h('div.seg',
          h(`button.seg-item${cfg.mode === 'auto' ? '.is-on' : ''}`, {
            onclick: () => {
              store.update((s) => { s.settings.notify.mode = 'auto'; });
              notify.schedule();
              renderProfile(root, ctx);
            },
          }, 'תן לאפליקציה לבחור'),
          h(`button.seg-item${cfg.mode === 'fixed' ? '.is-on' : ''}`, {
            onclick: () => {
              store.update((s) => { s.settings.notify.mode = 'fixed'; });
              notify.schedule();
              renderProfile(root, ctx);
            },
          }, 'אני קובע')),
        cfg.mode === 'fixed' ? h('input.input.time', {
          type: 'time',
          value: `${String(cfg.hour).padStart(2, '0')}:${String(cfg.minute).padStart(2, '0')}`,
          onchange: (e) => {
            const [hh, mm] = e.target.value.split(':').map(Number);
            store.update((s) => {
              s.settings.notify.hour = hh || 8;
              s.settings.notify.minute = mm || 0;
            });
            notify.schedule();
            saved();
          },
        }) : null),

      h('button.btn.btn-ghost', {
        onclick: async () => {
          const ok = await notify.sendTest();
          toast(ok ? 'שלחנו אחת לדוגמה' : 'לא הצלחנו לשלוח');
        },
      }, 'שלח התראת בדיקה'),
    );

    if (cfg.autoSteppedDown) {
      rows.push(h('p.notice', 'שלוש התראות לא נפתחו, אז הורדנו את התדירות. אפשר להחזיר אותה מכאן בכל רגע.'));
    }
  }

  /*
   * The honest paragraph.
   *
   * Reminders only fire while a tab of this app is alive, because a purely
   * local web app has no way to be woken at a chosen time. Saying so here is
   * the difference between a limitation and a broken promise.
   */
  rows.push(h('p.card-foot', 'הערה: זו אפליקציית ווב ללא שרת, ולכן תזכורת נשלחת רק כשהאפליקציה פתוחה או ברקע בלשונית חיה. משלוח אמיתי ברקע דורש שרת Push.'));

  return h('section.card', h('h2.card-title', 'התראות'), rows);
}

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

function appearanceCard(root, ctx) {
  const state = store.get();
  const themes = [
    { key: 'system', he: 'לפי המערכת' },
    { key: 'light', he: 'בהיר' },
    { key: 'dark', he: 'כהה' },
  ];

  return h('section.card',
    h('h2.card-title', 'מראה'),
    h('div.field',
      h('span.field-label', 'ערכת נושא'),
      h('div.seg', themes.map((t) => h(
        `button.seg-item${state.settings.theme === t.key ? '.is-on' : ''}`,
        {
          onclick: () => {
            store.update((s) => { s.settings.theme = t.key; });
            ctx.applyTheme();
            haptic('select');
            renderProfile(root, ctx);
          },
        }, t.he,
      )))),
    toggle('לשאול על מצב רגשי כל בוקר', state.settings.moodPrompt, (v) => {
      store.update((s) => { s.settings.moodPrompt = v; });
      renderProfile(root, ctx);
    }));
}

function toggle(label, value, onChange) {
  const input = h('input', {
    type: 'checkbox', class: 'switch-input',
    onchange: (e) => { haptic('select'); onChange(e.target.checked); },
  });
  input.checked = !!value;
  return h('label.switch', input, h('span.switch-track', h('span.switch-thumb')), h('span.switch-label', label));
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

function dataCard(root, ctx) {
  return h('section.card',
    h('h2.card-title', 'הנתונים שלך'),
    h('p.card-lede', 'הכל נשמר במכשיר הזה בלבד. אין חשבון, אין שרת, ואין מקום אחר שבו זה קיים.'),
    h('div.row-actions',
      h('button.btn', { onclick: exportData }, 'יצוא גיבוי'),
      h('button.btn', { onclick: () => importData(root, ctx) }, 'שחזור מגיבוי')),
    h('button.btn.btn-danger', {
      onclick: () => confirmReset(root, ctx),
    }, 'מחיקת הכל'),
    store.persists() ? null : h('p.notice.notice-warn', 'שים לב: הדפדפן הזה לא שומר נתונים (גלישה פרטית או הרשאות). כל מה שתעשה ייעלם ברענון.'));
}

function exportData() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `dailyspark-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('הגיבוי ירד');
}

function importData(root, ctx) {
  const input = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJson(String(reader.result));
        toast('שוחזר');
        ctx.rerender();
      } catch (e) {
        toast(e.message || 'הקובץ לא נראה כמו גיבוי');
      }
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
  input.remove();
}

/*
 * Deletion asks once and then does it.
 *
 * No "are you sure you want to lose your 47-day streak", no offer of a pause
 * instead. Making it hard to leave is the cheapest possible way to lose the
 * trust that the local-only storage was there to earn.
 */
function confirmReset(root, ctx) {
  const close = sheet(h('div',
    h('p.sheet-lede', 'זה ימחק את הספר, את הרצף ואת מה שהמנוע למד. אין דרך לשחזר אלא מגיבוי.'),
    h('div.sheet-actions',
      h('button.btn.btn-danger', {
        onclick: () => {
          store.reset();
          close();
          ctx.rerender();
        },
      }, 'כן, מחק הכל'),
      h('button.btn.btn-ghost', { onclick: () => close() }, 'ביטול'))), {
    label: 'מחיקת כל הנתונים', title: 'למחוק הכל?',
  });
}

function aboutCard() {
  return h('section.card.about',
    h('h2.card-title', 'על האפליקציה'),
    h('dl.model-list',
      h('div', h('dt', 'ניצוצות בספרייה'), h('dd', ltr(librarySize()))),
      h('div', h('dt', 'גרסה'), h('dd', ltr('1.0')))),
    h('p.card-foot', 'הבחירה היומית נעשית על ידי מנוע שרץ במכשיר שלך: סינון לפי מה שהגדרת, דירוג לפי מה שאתה מסמן, ושכבת בטיחות שחוסמת תוכן שלא מתאים ליום קשה. שום דבר לא נשלח לשום מקום.'),
    h('p.card-foot', 'הטקסטים נכתבו ונבדקו מראש. האפליקציה לא מייצרת תוכן חדש בזמן אמת ולא נותנת ייעוץ רפואי או נפשי.'));
}
