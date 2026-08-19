/*
 * profile.js — the settings, and the honest bits about where the data lives.
 *
 * Two things here are worth defending. The first is that the reminder switches
 * are visibly unavailable rather than switches that do nothing: this app has no
 * service worker and no server, so it cannot wake a phone at nine in the
 * evening, and a toggle that silently fails to remind somebody is worse than no
 * toggle at all. The contract calls that a dead button.
 *
 * The second is that export is a real file and import can genuinely refuse. A
 * backup nobody can restore is a backup in name only, and an import that merges
 * any JSON it is handed is a way to lose a year of history to a mistyped
 * filename.
 */

import { h, sheet } from '../core/dom.js';
import {
  get, setProfile, reset, exportJson, importJson, persists, recentRecords,
} from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { fromMinutes, toMinutes } from '../core/time.js';
import { SCHEMA_VERSION } from '../storage/migrate.js';
import { PRIORITY_AREAS, PREFERRED_TIMES } from '../data/catalog.js';
import { card, icon, ICONS, stat } from './parts.js';

export function render(root, ctx) {
  const p = ctx.profile;
  const state = get();

  root.appendChild(h('header.home-head', null,
    h('div', null,
      h('h1', { text: 'הפרופיל שלי' }),
      h('p.sub', { text: 'הבסיס שממנו כל תחזית מתחילה.' }))));

  if (!persists()) {
    root.appendChild(card({ tone: 'risk', variant: 'tight' },
      h('p.list-title', { text: 'הדפדפן הזה לא שומר מידע' }),
      h('p.card-note', { text: 'גלישה פרטית או אחסון מלא. האפליקציה תעבוד עד לרענון הבא ואז תתחיל מאפס. ייצוא גיבוי לא יעזור כאן — כדאי לפתוח אותה בחלון רגיל.' })));
  }

  if (state.user.demo) {
    root.appendChild(card({ tone: 'warn', variant: 'tight' },
      h('p.list-title', { text: 'אתה מסתכל על נתוני דמו' }),
      h('p.card-note', { text: 'ההיסטוריה כאן שייכת למשתמש לדוגמה. אפשר להתחיל מדף חלק בכל רגע.' }),
      h('button.btn', { type: 'button', onclick: () => startFresh(ctx) }, 'להתחיל מהנתונים שלי')));
  }

  /* -------------------------------------------------- the day */

  root.appendChild(card({ title: 'היום שלי' },
    labelled('שם', h('input.input', {
      type: 'text', value: p.name, maxlength: '40',
      oninput: (e) => save(ctx, { name: e.target.value }),
    })),
    labelled('שעת קימה רגילה', h('input.time-input', {
      type: 'time', value: fromMinutes(p.wakeTime),
      onchange: (e) => { const m = toMinutes(e.target.value); if (m !== null) save(ctx, { wakeTime: m }); },
    })),
    labelled('שעת שינה רגילה', h('input.time-input', {
      type: 'time', 'data-t': 'bedtime', value: fromMinutes(p.bedTime),
      onchange: (e) => { const m = toMinutes(e.target.value); if (m !== null) save(ctx, { bedTime: m }); },
    })),
    labelled('מתי אני הכי מרוכז', h('div.chip-row', { role: 'radiogroup' },
      PREFERRED_TIMES.map((t) => h('button.chip', {
        type: 'button', role: 'radio',
        'aria-checked': p.focusPreference === t.token ? 'true' : 'false',
        class: p.focusPreference === t.token ? 'chip is-on' : 'chip',
        onclick: () => { save(ctx, { focusPreference: t.token }); ctx.refresh(); },
      }, t.label)))),
    h('p.field-hint', {
      text: state.learning.focusPeakHour === null
        ? 'עדיין אין לי מספיק ימים כדי לבדוק את זה בעצמי, אז אני הולך לפי מה שסימנת.'
        : `לפי הימים שלך בפועל, השיא נוטה להיות סביב ${String(Math.round(state.learning.focusPeakHour)).padStart(2, '0')}:00 — וזה מה שאני משתמש בו.`,
    }),
    labelled('מה חשוב לי', h('div.chip-row', { role: 'group' },
      PRIORITY_AREAS.map((a) => h('button.chip', {
        type: 'button',
        'aria-pressed': p.priorities.includes(a.token) ? 'true' : 'false',
        class: p.priorities.includes(a.token) ? 'chip is-on' : 'chip',
        onclick: () => {
          const on = p.priorities.includes(a.token);
          save(ctx, {
            priorities: on ? p.priorities.filter((t) => t !== a.token) : p.priorities.concat([a.token]),
          });
          ctx.refresh();
        },
      }, a.label))))));

  /* -------------------------------------------------- appearance */

  root.appendChild(card({ title: 'תצוגה' },
    labelled('ערכת נושא', segmented([
      { token: 'dark', label: 'כהה' }, { token: 'light', label: 'בהיר' },
    ], p.theme, (v) => {
      save(ctx, { theme: v });
      document.documentElement.setAttribute('data-theme', v);
    })),
    labelled('שעון', segmented([
      { token: '24h', label: '24 שעות' }, { token: '12h', label: '12 שעות' },
    ], p.timeFormat, (v) => { save(ctx, { timeFormat: v }); ctx.refresh(); })),
    labelled('תחילת שבוע', segmented([
      { token: 0, label: 'ראשון' }, { token: 1, label: 'שני' },
    ], p.weekStart, (v) => { save(ctx, { weekStart: v }); ctx.refresh(); })),
    toggle('פחות תנועה', p.reduceMotion,
      'מבטל אנימציות גם אם המערכת שלך לא מבקשת את זה.',
      (v) => { save(ctx, { reduceMotion: v }); ctx.refresh(); })));

  /* -------------------------------------------------- reminders */

  root.appendChild(card({ title: 'תזכורות' },
    h('div.row.wrap', null,
      h('span.grow', null,
        h('span.label', { text: 'תזכורת ערב ובוקר' }),
        h('p.card-note', { text: 'האפליקציה רצה כולה בדפדפן, בלי שרת ובלי רקע, ולכן אין לה דרך אמיתית להעיר את הטלפון שלך בשעה מסוימת. אני מעדיף לא לתת מתג שנראה כאילו הוא עובד.' })),
      h('span.badge.soon', { text: 'בקרוב' }))));

  /* -------------------------------------------------- data */

  const records = recentRecords(400);
  root.appendChild(card({ title: 'הנתונים שלי' },
    h('div.row.stats', null,
      stat('ימים שנרשמו', String(records.length)),
      stat('פריטים', String(Object.keys(state.items).length)),
      stat('גרסת נתונים', `v${SCHEMA_VERSION}`)),
    h('p.card-note', { text: 'הכול נשמר במכשיר הזה בלבד. שום בקשה לא יוצאת מהדף — אפשר לבדוק את זה, מדיניות האבטחה של העמוד חוסמת חיבורים החוצה לגמרי.' }),
    h('div.row.wrap', null,
      h('button.btn', { type: 'button', onclick: () => download(ctx) }, 'ייצוא גיבוי'),
      h('button.btn', { type: 'button', onclick: () => upload(ctx) }, 'שחזור מגיבוי'),
      h('button.btn.danger.ghost', { type: 'button', onclick: () => confirmReset(ctx) },
        icon(ICONS.trash), 'מחיקת הכול'))));

  root.appendChild(h('p.meta.center.about', {
    text: `TomorrowAI · מנוע תחזית מקומי · נתונים בגרסה ${SCHEMA_VERSION}`,
  }));
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function labelled(label, control) {
  return h('label.field', null, h('span.label', { text: label }), control);
}

function segmented(options, value, onPick) {
  return h('div.seg', { role: 'group' }, options.map((o) => h('button', {
    type: 'button', 'aria-pressed': o.token === value ? 'true' : 'false',
    onclick: () => onPick(o.token),
  }, o.label)));
}

function toggle(label, value, hint, onChange) {
  return h('div.field', null,
    h('label.row.wrap', null,
      h('span.grow', null,
        h('span.label', { text: label }),
        hint ? h('p.card-note', { text: hint }) : null),
      h('input', {
        type: 'checkbox', class: 'switch', checked: value ? true : null,
        onchange: (e) => onChange(e.target.checked),
      })));
}

function save(ctx, patch) {
  setProfile(patch);
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Backup
 * ------------------------------------------------------------------ */

/*
 * A download built from a Blob rather than a data: URL.
 *
 * The page's own Content-Security-Policy has no data: in its default-src, and a
 * year of history is far past the length a data URL survives in some browsers
 * anyway. The object URL is revoked on the next tick — leaving it alive pins the
 * whole document in memory for as long as the tab is open.
 */
function download(ctx) {
  const blob = new Blob([exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `tomorrowai-${ctx.today}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  ctx.toast('הגיבוי ירד למכשיר', 'good');
}

function upload(ctx) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only' });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(String(reader.result));
        invalidate();
        ctx.refresh();
        ctx.toast('הגיבוי שוחזר', 'good');
      } catch (e) {
        // importJson throws on anything that is not a TomorrowAI backup, and
        // the existing state is untouched, so this is safe to simply report.
        ctx.toast(e.message || 'הקובץ הזה לא נראה כמו גיבוי של TomorrowAI', 'warn');
      }
      input.remove();
    };
    reader.onerror = () => { ctx.toast('לא הצלחתי לקרוא את הקובץ', 'warn'); input.remove(); };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
}

function confirmReset(ctx) {
  const close = sheet(h('div.stack', null,
    h('p.lead', { text: 'למחוק את כל מה שנאסף?' }),
    h('p.card-note', { text: 'הפרופיל, כל הימים, כל ההיסטוריה ומה שהמנוע למד עליך. אי אפשר לבטל את זה, אז אם יש שם משהו ששווה — כדאי לייצא גיבוי קודם.' }),
    h('div.sheet-actions', null,
      h('button.btn.danger', {
        type: 'button',
        onclick: () => {
          reset();
          invalidate();
          close();
          window.location.reload();
        },
      }, 'כן, למחוק הכול'),
      h('button.btn.ghost', { type: 'button', onclick: () => close() }, 'ביטול'))),
  { title: 'מחיקת הנתונים', label: 'אישור מחיקה' });
}

function startFresh(ctx) {
  reset();
  invalidate();
  window.location.reload();
}
