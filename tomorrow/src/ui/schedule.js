/*
 * schedule.js — the day and the week, and the only place items get rearranged.
 *
 * Two modes behind one segmented control. The day is a list because a list is
 * what a phone can show honestly: a proportional grid at 390px either squeezes
 * a 15-minute task into four pixels or scrolls for a screen and a half between
 * lunch and the evening. The week is a grid because the question it answers —
 * which day is the bad one — is a comparison, and a comparison wants columns.
 *
 * There is no drag and drop. The contract allows starting with an edit-time
 * modal and it turns out to be the better answer on a touch screen anyway:
 * dragging a block onto a 15-minute boundary with a thumb is a coordination
 * test, and every drag needs the same modal afterwards to fix what it missed.
 * The times are typed, the scheduler offers a slot, and both work with a
 * keyboard.
 */

import { h } from '../core/dom.js';
import { itemsOn, patchItem, setUi } from '../core/store.js';
import { weekForecast, invalidate } from '../core/forecast.js';
import { addDays, weekKeys } from '../core/time.js';
import {
  time as fmtTime, duration as fmtDuration, dateLabel, dayShort, range as fmtRange,
} from '../core/fmt.js';
import { conflicts } from '../engine/scheduler.js';
import { card, empty, stat, icon, ICONS } from './parts.js';
import { openQuickAdd, openItemEditor, openBedtime } from './quickadd.js';

export function render(root, ctx) {
  const mode = ctx.root.ui.scheduleMode === 'week' ? 'week' : 'day';

  root.appendChild(h('header.home-head', null,
    h('div', null,
      h('h1', { text: 'הלוח שלי' }),
      h('p.sub', { text: mode === 'day' ? dateLabel(ctx.date, ctx.now) : 'השבוע הקרוב' })),
    h('div.seg', { role: 'group', 'aria-label': 'תצוגה' },
      h('button', {
        type: 'button', 'aria-pressed': mode === 'day' ? 'true' : 'false',
        onclick: () => { setUi({ scheduleMode: 'day' }); ctx.refresh(); },
      }, 'יום'),
      h('button', {
        type: 'button', 'aria-pressed': mode === 'week' ? 'true' : 'false',
        onclick: () => { setUi({ scheduleMode: 'week' }); ctx.refresh(); },
      }, 'שבוע'))));

  if (mode === 'week') renderWeek(root, ctx);
  else renderDay(root, ctx);

  root.appendChild(h('button.fab', {
    type: 'button', 'data-t': 'quickadd', 'aria-label': 'הוספה מהירה',
    onclick: () => openQuickAdd(ctx, { date: ctx.date }),
  }, icon(ICONS.plus, { weight: '2.2' })));
}

/* ------------------------------------------------------------------ *
 * Day
 * ------------------------------------------------------------------ */

function renderDay(root, ctx) {
  const items = itemsOn(ctx.date);
  const scheduled = items.filter((i) => i.start !== null);
  const loose = items.filter((i) => i.start === null);
  const clashes = conflicts(items);
  const fmt = ctx.profile.timeFormat;

  root.appendChild(h('div.day-nav', null,
    h('button.btn.quiet', {
      type: 'button', 'aria-label': 'היום הקודם',
      onclick: () => hop(ctx, -1),
    }, icon(ICONS.chevron, { class: 'flip' })),
    h('span.day-nav-label', { text: dateLabel(ctx.date, ctx.now) }),
    h('button.btn.quiet', {
      type: 'button', 'aria-label': 'היום הבא',
      onclick: () => hop(ctx, 1),
    }, icon(ICONS.chevron))));

  root.appendChild(h('div.row.stats.day-stats', null,
    stat('תפוס', fmtDuration(ctx.forecast.totals.loadMinutes)),
    stat('פנוי', fmtDuration(ctx.forecast.totals.freeMinutes)),
    stat('פריטים', String(items.length))));

  /*
   * Overlaps are reported, never silently resolved. Two things at the same time
   * is sometimes exactly what the day is, and an app that quietly moves one of
   * them has made a decision that was not its to make.
   */
  if (clashes.length) {
    root.appendChild(card({ tone: 'warn', variant: 'tight' },
      h('p.list-title', { text: 'יש חפיפה בלוח' }),
      h('ul.why-list', null, clashes.map((c) => h('li', {
        text: `"${c.a.title}" ו"${c.b.title}" חופפים ב-${fmtDuration(c.minutes)}`,
      })))));
  }

  if (!items.length) {
    root.appendChild(empty({
      mark: icon(ICONS.clock, { class: 'empty-icon' }),
      title: 'אין כלום ביום הזה',
      text: 'אפשר להוסיף שיעור, אימון, פגישה או משימה — ואני אבנה מזה תחזית.',
      cta: h('button.btn.primary', {
        type: 'button', onclick: () => openQuickAdd(ctx, { date: ctx.date }),
      }, icon(ICONS.plus), 'להוסיף משהו'),
    }));
    return;
  }

  root.appendChild(h('div.list', null, scheduled.map((item) => row(ctx, item, fmt))));

  if (loose.length) {
    root.appendChild(card({ title: 'בלי שעה', note: 'דברים שרצית לעשות ביום הזה ועוד לא קבעת מתי.' },
      h('div.list', null, loose.map((item) => row(ctx, item, fmt)))));
  }

  root.appendChild(card({ variant: 'tight' },
    h('div.row.wrap', null,
      h('span.grow', null,
        h('span.label', { text: 'שעת שינה' }),
        h('b.num', { text: fmtTime(ctx.plan.nextBedtime, fmt) })),
      h('button.btn', {
        type: 'button', onclick: () => openBedtime(ctx, ctx.date, () => ctx.refresh()),
      }, icon(ICONS.moon), 'שינוי'))));
}

function row(ctx, item, fmt) {
  const done = item.status === 'done';
  return h('div.list-row', {
    'data-t': 'item',
    class: `list-row accent-${item.category}${done ? ' is-done' : ''}`,
  },
  h('span.list-time', {
    text: item.start === null ? '—' : fmtRange(item.start, item.duration, fmt),
  }),
  h('div.list-body', null,
    h('span.list-title', { 'data-t': 'item-title-text', text: item.title }),
    h('span.list-meta', {
      text: [
        fmtDuration(item.duration),
        item.locked ? 'נעול' : null,
        item.isTop ? 'חשוב במיוחד' : null,
      ].filter(Boolean).join(' · '),
    })),
  h('div.list-actions', null,
    h('button.btn.icon', {
      type: 'button', 'aria-label': done ? `לסמן את ${item.title} כלא בוצע` : `לסמן את ${item.title} כבוצע`,
      class: done ? 'btn icon is-on' : 'btn icon',
      onclick: () => toggleDone(ctx, item),
    }, icon(ICONS.check)),
    h('button.btn.icon', {
      type: 'button', 'data-t': 'item-edit', 'aria-label': `עריכת ${item.title}`,
      onclick: () => openItemEditor(ctx, item.id),
    }, icon(ICONS.edit))));
}

/*
 * Marking something done records how long it actually took.
 *
 * This is the single most valuable measurement the app makes, and it is the
 * reason the tick is on the row rather than buried in the editor. Without an
 * actual duration there is nothing for the learning engine to compare an
 * estimate against, and the whole "this usually takes you 40% longer" story
 * never gets off the ground. The planned length is used as the actual one,
 * which is a real assumption and a documented one — the end-of-day review is
 * where somebody can say it ran long.
 */
function toggleDone(ctx, item) {
  const done = item.status === 'done';
  patchItem(item.id, done
    ? { status: 'planned', completedAt: null, actualDuration: null }
    : { status: 'done', completedAt: new Date().toISOString(), actualDuration: item.actualDuration || item.duration });
  invalidate();
  ctx.refresh();
}

function hop(ctx, days) {
  const target = addDays(ctx.date, days);
  setUi({ focus: target === ctx.today ? 'today' : target === ctx.tomorrow ? 'tomorrow' : 'other', focusDate: target });
  ctx.refresh();
}

/* ------------------------------------------------------------------ *
 * Week
 * ------------------------------------------------------------------ */

/*
 * The week forecast.
 *
 * Seven light forecasts — no recommendation search, because the grid shows a
 * score and a headline risk and neither needs one. Selecting a day switches the
 * day view to it rather than opening a second detail screen; there is already a
 * screen that shows one day well.
 */
function renderWeek(root, ctx) {
  const days = weekKeys(ctx.date, ctx.profile.weekStart);
  const forecasts = weekForecast(days, ctx.now);
  const best = forecasts.reduce((a, b) => (b.score > a.score ? b : a), forecasts[0]);

  root.appendChild(h('div.week-grid', null, days.map((date, i) => {
    const f = forecasts[i];
    const risk = f.risks[0] || null;
    const isToday = date === ctx.today;
    return h('button.week-day', {
      type: 'button', 'data-t': 'week-day',
      class: `week-day band-${f.band}${isToday ? ' is-today' : ''}${f === best ? ' is-best' : ''}`,
      'aria-label': `${dateLabel(date, ctx.now)}, ציון ${f.score}`,
      onclick: () => {
        setUi({ scheduleMode: 'day', focus: date === ctx.today ? 'today' : date === ctx.tomorrow ? 'tomorrow' : 'other', focusDate: date });
        ctx.refresh();
      },
    },
    h('span.week-dow', { text: dayShort(date) }),
    h('span.week-score', { text: String(f.score) }),
    h('span.week-bar', { 'aria-hidden': 'true' },
      h('i', { style: { height: `${Math.max(6, f.score)}%` } })),
    h('span.week-meta', { text: fmtDuration(f.totals.loadMinutes) }),
    risk ? h('span.week-risk', { class: `week-risk sev-${risk.severity}`, text: risk.title }) : null);
  })));

  root.appendChild(card({ title: 'מה בולט השבוע' },
    h('ul.why-list', null,
      h('li', { text: `היום הכי טוב בתחזית: ${dateLabel(days[forecasts.indexOf(best)], ctx.now)} (${best.score}).` }),
      weekNote(forecasts, days, ctx))));
}

function weekNote(forecasts, days, ctx) {
  const worst = forecasts.reduce((a, b) => (b.score < a.score ? b : a), forecasts[0]);
  const out = [h('li', {
    text: `היום שדורש הכי הרבה תשומת לב: ${dateLabel(days[forecasts.indexOf(worst)], ctx.now)} (${worst.score}).`,
  })];
  const risky = forecasts.filter((f) => f.risks.some((r) => r.severity === 'high'));
  if (risky.length) {
    out.push(h('li', { text: `${risky.length} ימים עם סיכון גבוה אחד לפחות.` }));
  }
  const totalFree = forecasts.reduce((a, f) => a + f.totals.freeMinutes, 0);
  out.push(h('li', { text: `סך הזמן הפנוי בשבוע: ${fmtDuration(totalFree)}.` }));
  return out;
}
