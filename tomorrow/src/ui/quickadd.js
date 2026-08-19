/*
 * quickadd.js — adding and editing the things a day is made of.
 *
 * Two doors into the same editor. The floating button opens it empty with a
 * natural-language box on top; a row in the schedule opens it on an existing
 * item. Sharing the form matters more than it sounds: an app where "add" and
 * "edit" are different screens is an app where the two drift, and the second
 * one quietly stops offering half the fields.
 *
 * The natural-language box never saves anything by itself. It fills the form in
 * front of the user and says what it could not read, and then the user presses
 * save like they would have anyway. Parsing Hebrew dates from free text is
 * exactly the kind of feature that is right nine times out of ten, and the
 * tenth time silently books a meeting on the wrong day.
 */

import { h, sheet, qs } from '../core/dom.js';
import { putItem, patchItem, removeItem, itemById, dayPlan, putDayPlan } from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { fromMinutes, toMinutes, addDays } from '../core/time.js';
import { dateLabel, duration as fmtDuration } from '../core/fmt.js';
import { validateItem } from '../storage/schema.js';
import { parseQuickAdd } from '../engine/nlp.js';
import { suggestSlot } from '../engine/scheduler.js';
import { estimateDuration } from '../engine/learning.js';
import {
  ITEM_TYPES, CATEGORIES, PRIORITIES, ENERGY_LEVELS, FOCUS_LEVELS, labelOf,
} from '../data/catalog.js';
import { icon, ICONS } from './parts.js';

export function openQuickAdd(ctx, opts) {
  return openEditor(ctx, null, opts || {});
}

export function openItemEditor(ctx, itemId) {
  const item = itemById(itemId);
  if (!item) return null;
  return openEditor(ctx, item, {});
}

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

function openEditor(ctx, existing, opts) {
  const draft = existing
    ? Object.assign({}, existing)
    : {
      kind: 'task', type: 'task', title: '', notes: '',
      date: opts.date || ctx.date, start: opts.start === undefined ? null : opts.start,
      duration: 30, locked: false, category: 'personal', priority: 'medium',
      deadline: null, estimatedDuration: 30, difficulty: 3,
      energyRequirement: 'medium', focusRequirement: 'medium', preferredTime: 'any',
      status: 'planned', isTop: false,
    };

  const body = h('div.stack');
  const close = sheet(body, {
    title: existing ? 'עריכת פריט' : 'הוספה מהירה',
    label: existing ? 'עריכת פריט' : 'הוספת פריט חדש',
  });

  const paint = () => { body.textContent = ''; build(body, ctx, draft, existing, close, paint); };
  paint();
  return close;
}

function build(body, ctx, draft, existing, close, repaint) {
  const errors = h('div.field-error', { hidden: true, role: 'alert' });

  if (!existing) body.appendChild(naturalLanguage(ctx, draft, repaint));

  body.appendChild(field('מה זה?', h('input.input', {
    type: 'text', 'data-t': 'item-title', value: draft.title, maxlength: '120',
    placeholder: 'שיעורי בית, אימון, פגישה…',
    oninput: (e) => { draft.title = e.target.value; },
  })));

  body.appendChild(field('סוג', chipGroup(ITEM_TYPES, draft.type, (v) => {
    draft.type = v;
    /* An event is something that happens to you at a time; a task is something
     * you choose when to do. The scheduler is allowed to move one and not the
     * other, so picking the type here is picking that, not picking an icon. */
    draft.kind = (v === 'event' || v === 'meeting') ? 'event' : 'task';
    draft.locked = draft.kind === 'event';
    repaint();
  })));

  body.appendChild(h('div.grid-2', null,
    field('תאריך', h('select.select', {
      'aria-label': 'תאריך',
      onchange: (e) => { draft.date = e.target.value; },
    }, dateOptions(ctx, draft.date))),
    field('שעת התחלה', h('input.time-input', {
      type: 'time', 'data-t': 'item-start',
      value: draft.start === null ? '' : fromMinutes(draft.start),
      oninput: (e) => { draft.start = toMinutes(e.target.value); },
    }))));

  body.appendChild(field('משך', h('div.row.wrap.dur-row', null,
    [15, 30, 45, 60, 90, 120].map((m) => h('button.chip', {
      type: 'button', class: draft.duration === m ? 'chip is-on' : 'chip',
      'aria-pressed': draft.duration === m ? 'true' : 'false',
      onclick: () => { draft.duration = m; draft.estimatedDuration = m; repaint(); },
    }, fmtDuration(m))),
    h('input.input.small', {
      type: 'number', min: '5', max: '600', step: '5', value: String(draft.duration),
      'data-t': 'item-duration', 'aria-label': 'משך בדקות',
      oninput: (e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) { draft.duration = n; draft.estimatedDuration = n; }
      },
    }))));

  /*
   * What the history says this will really take.
   *
   * Shown as a note next to the estimate rather than silently overwriting it.
   * Being told "you usually need about 40% longer than this" is useful; having
   * the number changed underneath you is not, and it makes the estimate stop
   * being yours — which is the thing the learning depends on measuring.
   */
  const learned = estimateDuration(draft, ctx.root.learning);
  if (learned.basis !== 'default' && Math.abs(learned.minutes - draft.duration) >= 10) {
    body.appendChild(h('p.field-hint', null,
      h('span', { text: `לפי ההיסטוריה שלך, משימות כאלה לוקחות בערך ${fmtDuration(Math.round(learned.minutes / 5) * 5)}. ` }),
      h('button.btn.quiet.small', {
        type: 'button',
        onclick: () => { draft.duration = Math.round(learned.minutes / 5) * 5; repaint(); },
      }, 'להשתמש בזה')));
  }

  if (draft.kind === 'task') {
    body.appendChild(h('details.more', null,
      h('summary', { text: 'עוד פרטים' }),
      h('div.stack', null,
        field('קטגוריה', chipGroup(CATEGORIES, draft.category, (v) => { draft.category = v; repaint(); })),
        field('עדיפות', chipGroup(PRIORITIES, draft.priority, (v) => { draft.priority = v; repaint(); })),
        field('כמה אנרגיה זה דורש', chipGroup(ENERGY_LEVELS, draft.energyRequirement, (v) => { draft.energyRequirement = v; repaint(); })),
        field('כמה ריכוז זה דורש', chipGroup(FOCUS_LEVELS, draft.focusRequirement, (v) => { draft.focusRequirement = v; repaint(); })),
        field('דדליין', h('input.input', {
          type: 'date', value: draft.deadline || '',
          oninput: (e) => { draft.deadline = e.target.value || null; },
        })),
        field('הערות', h('textarea.textarea', {
          rows: '2', value: draft.notes,
          oninput: (e) => { draft.notes = e.target.value; },
        })))));
  }

  body.appendChild(errors);

  /*
   * "Find me a slot" is the scheduler's front door. It only appears when the
   * item has no time yet, because offering to place something that is already
   * placed invites the question of what happened to the time you chose.
   */
  if (draft.start === null && draft.title.trim()) {
    body.appendChild(h('button.btn.block', {
      type: 'button',
      onclick: () => {
        const slot = suggestSlot(Object.assign({ id: draft.id || 'itm_draft' }, draft), ctx.input);
        if (!slot) { ctx.toast('לא מצאתי מקום פנוי מתאים ביום הזה', 'warn'); return; }
        draft.start = slot.start;
        repaint();
        ctx.toast(slot.reason);
      },
    }, icon(ICONS.clock), 'תמצא לי שעה מתאימה'));
  }

  body.appendChild(h('div.sheet-actions', null,
    h('button.btn.primary', {
      type: 'button', 'data-t': 'quickadd-save',
      onclick: () => {
        const problems = validateItem(draft);
        if (problems.length) {
          errors.hidden = false;
          errors.textContent = problems.join(' ');
          const first = qs('[data-t="item-title"]', body);
          if (first) first.focus();
          return;
        }
        save(ctx, draft, existing);
        close();
      },
    }, existing ? 'שמירה' : 'הוספה'),
    existing
      ? h('button.btn.danger.ghost', {
        type: 'button', 'data-t': 'item-delete',
        onclick: () => { remove(ctx, existing.id); close(); },
      }, icon(ICONS.trash), 'מחיקה')
      : h('button.btn.ghost', { type: 'button', onclick: () => close() }, 'ביטול')));
}

/* ------------------------------------------------------------------ *
 * Natural language
 * ------------------------------------------------------------------ */

function naturalLanguage(ctx, draft, repaint) {
  const readout = h('p.parsed', { 'data-t': 'quickadd-parsed', hidden: true });

  const input = h('input.input', {
    type: 'text', 'data-t': 'quickadd-nl',
    placeholder: 'מחר ב-17:00 יש לי אימון של שעה',
    'aria-label': 'תיאור חופשי',
    oninput: (e) => {
      const text = e.target.value.trim();
      if (text.length < 3) { readout.hidden = true; return; }
      const parsed = parseQuickAdd(text, { today: ctx.today, now: ctx.now, profile: ctx.profile });
      if (!parsed.ok) { readout.hidden = true; return; }

      Object.assign(draft, parsed.item);
      readout.hidden = false;
      readout.textContent = '';
      readout.appendChild(h('span.badge.accent', { text: 'הבנתי' }));
      readout.appendChild(h('span', { text: ` ${summarise(ctx, draft)}` }));
      if (parsed.note) readout.appendChild(h('span.meta', { text: ` ${parsed.note}` }));
    },
    onchange: () => repaint(),
  });

  return h('div.field.nl', null,
    h('span.label', { text: 'לכתוב את זה במשפט' }),
    input,
    readout,
    h('p.field-hint', { text: 'אני אמלא את מה שהבנתי ואשאיר לך לתקן את השאר. שום דבר לא נשמר לפני שתאשר.' }));
}

function summarise(ctx, draft) {
  const bits = [labelOf(ITEM_TYPES, draft.type), `"${draft.title}"`, dateLabel(draft.date, ctx.now)];
  if (draft.start !== null) bits.push(`בשעה ${fromMinutes(draft.start)}`);
  bits.push(fmtDuration(draft.duration));
  return bits.filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function field(label, control) {
  return h('label.field', null, h('span.label', { text: label }), control);
}

function chipGroup(list, value, onPick) {
  return h('div.chip-row', { role: 'group' }, list.map((opt) => h('button.chip', {
    type: 'button', class: opt.token === value ? 'chip is-on' : 'chip',
    'aria-pressed': opt.token === value ? 'true' : 'false',
    onclick: () => onPick(opt.token),
  }, opt.label)));
}

function dateOptions(ctx, selected) {
  const out = [];
  for (let i = -1; i <= 13; i++) {
    const key = addDays(ctx.today, i);
    out.push(h('option', { value: key, selected: key === selected ? true : null },
      dateLabel(key, ctx.now)));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

function save(ctx, draft, existing) {
  if (existing) patchItem(existing.id, draft);
  else putItem(draft);
  invalidate();
  ctx.refresh();
  ctx.toast(existing ? 'הפריט עודכן' : 'נוסף ליום', 'good');
}

function remove(ctx, id) {
  removeItem(id);
  invalidate();
  ctx.refresh();
  ctx.toast('הפריט נמחק');
}

/*
 * The bedtime picker, which lives here because it is the same sheet-with-a-time
 * shape and the profile, the ritual and the schedule all need it.
 */
export function openBedtime(ctx, date, onDone) {
  const plan = dayPlan(date);
  let minutes = plan.nextBedtime;

  const close = sheet(h('div.stack', null,
    h('p.sub', { text: 'מתי אתה מתכנן ללכת לישון בסוף היום הזה?' }),
    h('input.time-input.big', {
      type: 'time', 'data-t': 'bedtime', value: fromMinutes(minutes),
      'aria-label': 'שעת שינה',
      oninput: (e) => { const m = toMinutes(e.target.value); if (m !== null) minutes = m; },
    }),
    h('div.sheet-actions', null,
      h('button.btn.primary', {
        type: 'button',
        onclick: () => {
          putDayPlan(date, { nextBedtime: minutes });
          invalidate(date);
          if (onDone) onDone();
          else ctx.refresh();
          close();
        },
      }, 'שמירה'))),
  { title: 'שעת שינה', label: 'בחירת שעת שינה' });
  return close;
}
