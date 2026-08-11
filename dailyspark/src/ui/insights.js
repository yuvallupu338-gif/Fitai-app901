/*
 * insights.js — the weekly read on what is actually working.
 *
 * Two rules shape this screen.
 *
 * It refuses to speak too early. With fewer than four days of data every
 * "pattern" is noise, and an app that confidently reports noise back to
 * somebody as a fact about themselves is doing real harm to its own
 * credibility. The empty state says how many days are missing and stops there.
 *
 * It ends with exactly one action. A dashboard that reports six findings and
 * asks the reader to draw conclusions has moved the work onto them. One button
 * that changes one setting is the entire point of having noticed anything.
 */

import { h, clear, toast, haptic, ltr } from '../core/dom.js';
import * as store from '../core/store.js';
import { dayKey, shiftKey, WEEKDAY_SHORT, weekdayOf, PART_LABEL } from '../core/day.js';
import { sparkById } from '../data/sparks.index.js';
import { categoryLabel, TONES } from '../data/taxonomy.js';
import { SLOTS } from '../engine/bandit.js';
import { journeysSection } from './journeys.js';

const MIN_DAYS = 4;

export function renderInsights(root) {
  const rerender = () => renderInsights(root);
  const state = store.get();
  const days = last(state, 7);
  const withData = days.filter((d) => d.entry);

  clear(root);
  root.appendChild(h('header.screen-head',
    h('h1.screen-title', 'תובנות'),
    h('p.screen-lede', 'מה עבד השבוע, ומה כדאי לשנות.')));

  if (withData.length < MIN_DAYS) {
    const missing = MIN_DAYS - withData.length;
    root.appendChild(h('section.card.empty',
      h('h2', `עוד ${missing} ${missing === 1 ? 'יום' : 'ימים'}.`),
      h('p', 'אנחנו צריכים קצת יותר נתונים לפני שנגיד לך משהו אמיתי. עד אז, כל מה שנאמר כאן יהיה ניחוש שנשמע כמו עובדה.')));
    /* Journeys do not need a week of history to be worth offering, so they are
     * shown even while the insight itself is still holding its tongue. */
    root.appendChild(journeysSection(rerender));
    return;
  }

  const done = withData.filter((d) => d.entry.status === 'completed');
  root.appendChild(h('section.card',
    h('p.insight-narrative', narrative(withData, done)),
    weekBars(days),
    partBreakdown(withData, done),
    topCategories(withData)));

  const action = suggestion(state, withData, done);
  if (action) {
    root.appendChild(h('section.card.suggest',
      h('h2.suggest-title', 'הצעה אחת'),
      h('p.suggest-body', action.text),
      h('button.btn.btn-primary', {
        onclick: () => {
          action.apply();
          haptic('success');
          toast('עודכן. הניצוץ של מחר כבר יביא את זה בחשבון.');
          renderInsights(root);
        },
      }, action.label)));
  }

  root.appendChild(journeysSection(rerender));
  root.appendChild(modelCard(state));
}

function last(state, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const key = shiftKey(dayKey(), -i);
    out.push({ key, entry: state.days[key] || null });
  }
  return out;
}

/*
 * The sentence at the top.
 *
 * Assembled from the numbers rather than picked from a bank of encouragements,
 * so it can say something unflattering when that is what happened. "ביצעת אחד
 * מתוך שבעה" is a more useful thing to read than "כל התחלה חשובה".
 */
function narrative(withData, done) {
  const parts = [`ביצעת ${done.length} מתוך ${withData.length}.`];

  const byPart = {};
  for (const d of done) {
    const p = (d.entry.context && d.entry.context.part) || 'morning';
    byPart[p] = (byPart[p] || 0) + 1;
  }
  const best = Object.keys(byPart).sort((a, b) => byPart[b] - byPart[a])[0];
  if (best && byPart[best] >= 2 && done.length >= 2) {
    parts.push(`רובם ב${PART_LABEL[best]}.`);
  }

  const skipped = withData.filter((d) => d.entry.status !== 'completed');
  if (skipped.length >= 3) {
    const sizes = skipped.map((d) => {
      const s = sparkById(d.entry.sparkId);
      return s ? s.size : null;
    }).filter(Boolean);
    const big = sizes.filter((s) => s !== 'micro').length;
    if (big >= Math.ceil(sizes.length * 0.6)) {
      parts.push('הימים שדילגת עליהם היו ברובם הגדולים יותר.');
    }
  }

  if (done.length === withData.length) parts.push('שבוע מלא.');
  return parts.join(' ');
}

/* Seven bars. Height encodes status, and a title attribute carries the same
 * information for anyone who cannot see the height. */
function weekBars(days) {
  return h('div.chart',
    h('h3.chart-title', 'השבוע'),
    h('div.bars', days.map((d) => {
      const status = d.entry ? d.entry.status : 'none';
      const cls = status === 'completed' ? 'is-done'
        : status === 'deferred' ? 'is-later'
          : d.entry ? 'is-open' : 'is-none';
      return h('div.bar-col',
        h(`div.bar.${cls}`, { title: `${d.key} — ${statusHe(status)}` }),
        h('span.bar-label', WEEKDAY_SHORT[weekdayOf(d.key)]));
    })));
}

function statusHe(status) {
  return { completed: 'בוצע', deferred: 'לא היום', rejected: 'הוחלף', delivered: 'נמסר' }[status] || 'לא נמסר';
}

function partBreakdown(withData, done) {
  const rows = ['morning', 'midday', 'evening'].map((p) => {
    const shown = withData.filter((d) => (d.entry.context || {}).part === p).length;
    const acted = done.filter((d) => (d.entry.context || {}).part === p).length;
    return { p, shown, acted };
  }).filter((r) => r.shown);

  if (rows.length < 2) return null;
  return h('div.chart',
    h('h3.chart-title', 'לפי שעה ביום'),
    h('ul.ratio-list', rows.map((r) => h('li.ratio',
      h('span.ratio-label', PART_LABEL[r.p]),
      h('span.ratio-track', h('span.ratio-fill', {
        style: { width: `${Math.round((r.acted / r.shown) * 100)}%` },
      })),
      h('span.ratio-value', ltr(`${r.acted}/${r.shown}`))))));
}

function topCategories(withData) {
  const tally = {};
  for (const d of withData) {
    const spark = sparkById(d.entry.sparkId);
    if (!spark) continue;
    const t = tally[spark.category] || { shown: 0, done: 0 };
    t.shown += 1;
    if (d.entry.status === 'completed') t.done += 1;
    tally[spark.category] = t;
  }
  const rows = Object.keys(tally)
    .sort((a, b) => (tally[b].done / tally[b].shown) - (tally[a].done / tally[a].shown))
    .slice(0, 3);
  if (!rows.length) return null;

  return h('div.chart',
    h('h3.chart-title', 'תחומים'),
    h('ul.ratio-list', rows.map((c) => h('li.ratio',
      h('span.ratio-label', categoryLabel(c)),
      h('span.ratio-track', h('span.ratio-fill', {
        style: { width: `${Math.round((tally[c].done / tally[c].shown) * 100)}%` },
      })),
      h('span.ratio-value', ltr(`${tally[c].done}/${tally[c].shown}`))))));
}

/*
 * Pick the single most useful change, in a fixed order of priority.
 *
 * Ordered by how much the change is likely to be worth, not by how confident
 * the app is: moving the reminder to the hour someone actually acts is worth
 * more than nudging a category weight, so it is checked first.
 */
function suggestion(state, withData, done) {
  /* 1. Reminder is set to an hour that is not the hour they act in. */
  const byPart = {};
  for (const d of done) {
    const p = (d.entry.context && d.entry.context.part) || 'morning';
    byPart[p] = (byPart[p] || 0) + 1;
  }
  const bestPart = Object.keys(byPart).sort((a, b) => byPart[b] - byPart[a])[0];
  const cfg = state.settings.notify;
  if (bestPart && byPart[bestPart] >= 2 && cfg.mode === 'fixed') {
    const target = { morning: 8, midday: 12, evening: 17 }[bestPart];
    if (Math.abs(cfg.hour - target) >= 3) {
      return {
        text: `אתה מבצע בעיקר ב${PART_LABEL[bestPart]}, וההתראה מוגדרת לשעה ${cfg.hour}:00.`,
        label: 'תן ל‑DailySpark לבחור את השעה',
        apply: () => store.update((s) => { s.settings.notify.mode = 'auto'; }),
      };
    }
  }

  /* 2. Consistently skipping the larger sizes. */
  const skipped = withData.filter((d) => d.entry.status !== 'completed');
  if (skipped.length >= 3 && state.profile.budgetMinutes > 1) {
    const bigSkips = skipped.filter((d) => {
      const s = sparkById(d.entry.sparkId);
      return s && s.size !== 'micro';
    }).length;
    if (bigSkips >= 3) {
      const next = state.profile.budgetMinutes === 15 ? 5 : 1;
      return {
        text: 'הניצוצות הגדולים לא מתבצעים. אפשר להוריד את תקציב הזמן ולראות אם זה משנה.',
        label: `הורד ל‑${next === 1 ? 'דקה' : `${next} דקות`} ליום`,
        apply: () => store.update((s) => { s.profile.budgetMinutes = next; }),
      };
    }
  }

  /* 3. A category that keeps being rejected. */
  const rejects = {};
  for (const d of withData) {
    if (d.entry.status !== 'rejected') continue;
    const s = sparkById(d.entry.sparkId);
    if (s) rejects[s.category] = (rejects[s.category] || 0) + 1;
  }
  const worst = Object.keys(rejects).sort((a, b) => rejects[b] - rejects[a])[0];
  if (worst && rejects[worst] >= 2) {
    return {
      text: `החלפת פעמיים ניצוצות של ${categoryLabel(worst)} השבוע.`,
      label: `הפחת ${categoryLabel(worst)}`,
      apply: () => store.update((s) => { s.profile.interests[worst] = 0; }),
    };
  }

  /* 4. Tone was questioned in the reject sheet. */
  if ((state.profile.toneQuestioned || 0) >= 2) {
    const current = state.profile.tone;
    const next = (TONES.find((t) => t.key !== current) || TONES[0]).key;
    return {
      text: 'סימנת פעמיים שהטון לא מתאים.',
      label: 'שנה את הטון בהתאמה אישית',
      apply: () => {
        store.update((s) => { s.profile.toneQuestioned = 0; });
        location.hash = '#profile';
      },
      next,
    };
  }

  return null;
}

/*
 * What the engine has learned so far, stated plainly.
 *
 * This is here because the app claims to learn, and a claim like that should be
 * checkable by the person it is about. It shows the number of observations and
 * the chosen send-time slot — small, unglamorous facts that make the difference
 * between "it says it personalises" and "I can see what it has."
 */
function modelCard(state) {
  const updates = (state.model && state.model.updates) || 0;
  const slot = state.sendTime && state.sendTime.lastSlot;
  const rows = [
    ['תגובות שנלמדו', ltr(updates)],
    ['ימים בספר', ltr(Object.keys(state.days).length)],
  ];
  if (slot !== null && slot !== undefined && SLOTS[slot]) {
    rows.push(['שעת שליחה נבחרת', ltr(`${SLOTS[slot].hour}:${String(SLOTS[slot].minute).padStart(2, '0')}`)]);
  }
  return h('section.card.model-card',
    h('h2.chart-title', 'מה המנוע יודע'),
    h('dl.model-list', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v)))),
    h('p.model-note', updates < 8
      ? 'עדיין מוקדם. בשלב הזה הוא בעיקר מנסה דברים כדי ללמוד מה עובד עליך.'
      : 'מכאן והלאה הוא נשען יותר על מה שאתה מסמן ופחות על מה שסימנת באונבורדינג.'));
}
