/*
 * review.js — the end of the day, where a prediction becomes a measurement.
 *
 * This is the screen that closes the loop the whole product runs on. Everything
 * else is the app talking; this is the app being marked. It shows what it said
 * yesterday, what actually happened, how close that was, and then asks one
 * question about the gap.
 *
 * The accuracy number is deliberately unflattering. compare() returns null
 * rather than a comfortable default when there is nothing to compare, and this
 * screen prints a dash and says so. An app that reports 95% accuracy on its
 * third day has told you exactly how much its other numbers are worth.
 */

import { h } from '../core/dom.js';
import {
  putRecord, record, itemsOn, dayPlan, get, setLearning, recentRecords, pushFeedback,
} from '../core/store.js';
import { invalidate } from '../core/forecast.js';
import { dateLabel, pct, duration as fmtDuration } from '../core/fmt.js';
import { scoreActualDay, compare } from '../engine/accuracy.js';
import { updateLearning } from '../engine/learning.js';
import { REVIEW_TAGS } from '../data/catalog.js';
import { icon, ICONS } from './parts.js';

export function runReview(ctx, date, onDone) {
  const day = date || ctx.today;
  const chosen = new Set();

  return ctx.flow((host, close) => {
    const items = itemsOn(day);
    const plan = dayPlan(day);
    const rec = record(day);

    /*
     * Score the day before showing it, so the comparison is against a real
     * measurement rather than an empty slot. Stored on the record because the
     * history screen and the learning engine both read it afterwards.
     */
    const dayScore = scoreActualDay(rec, items, plan);
    const done = items.filter((i) => i.status === 'done').length;
    const planned = items.filter((i) => i.kind === 'task').length;
    const focusMinutes = items
      .filter((i) => i.status === 'done' && i.focusRequirement !== 'low')
      .reduce((a, i) => a + (i.actualDuration || i.duration), 0);

    putRecord(day, {
      actual: {
        dayScore, completed: done, planned, focusMinutes,
        sleepMinutes: rec.actual ? rec.actual.sleepMinutes : null,
      },
    });

    const result = compare(record(day));
    const body = h('div.flow-body');

    host.appendChild(h('div.flow-inner', { 'data-t': 'review' },
      h('header.flow-head', null,
        h('div', null,
          h('h1.flow-title', { text: 'סיכום היום' }),
          h('p.sub', { text: dateLabel(day, ctx.now) }))),
      body));

    body.appendChild(h('div.compare', null,
      h('div.compare-box', null,
        h('span.compare-label', { text: 'מה שציפיתי' }),
        h('span.compare-score', { text: result.predicted === null ? '—' : String(result.predicted) })),
      icon(ICONS.chevron, { class: 'compare-arrow' }),
      h('div.compare-box', null,
        h('span.compare-label', { text: 'איך היה בפועל' }),
        h('span.compare-score', { text: String(dayScore) }))));

    body.appendChild(h('div.row.stats', null,
      h('div.stat', null,
        h('span.stat-value', { text: result.accuracy === null ? '—' : pct(result.accuracy) }),
        h('span.stat-label', { text: 'דיוק התחזית' })),
      h('div.stat', null,
        h('span.stat-value', { text: `${done}/${planned}` }),
        h('span.stat-label', { text: 'משימות שהושלמו' })),
      h('div.stat', null,
        h('span.stat-value', { text: fmtDuration(focusMinutes) }),
        h('span.stat-label', { text: 'עבודה ממוקדת' }))));

    body.appendChild(h('p.field-hint', { text: result.note }));

    body.appendChild(h('div.divider'));
    body.appendChild(h('h2.card-title', { text: 'מה היה שונה?' }));
    body.appendChild(h('div.chip-row', null, REVIEW_TAGS.map((tag) => h('button.chip', {
      type: 'button', 'aria-pressed': 'false',
      onclick: (e) => {
        const on = chosen.has(tag.token);
        /*
         * "Everything was accurate" is not compatible with "tasks took longer",
         * so picking it clears the rest and picking anything else clears it.
         * Letting both stand would feed the learning engine a contradiction it
         * has no way to resolve.
         */
        if (!on && tag.token === 'accurate') {
          chosen.clear();
          for (const b of e.currentTarget.parentElement.children) {
            b.classList.remove('is-on');
            b.setAttribute('aria-pressed', 'false');
          }
        } else if (!on) {
          chosen.delete('accurate');
          for (const b of e.currentTarget.parentElement.children) {
            if (b.dataset.token === 'accurate') {
              b.classList.remove('is-on');
              b.setAttribute('aria-pressed', 'false');
            }
          }
        }
        if (on) chosen.delete(tag.token); else chosen.add(tag.token);
        e.currentTarget.classList.toggle('is-on', chosen.has(tag.token));
        e.currentTarget.setAttribute('aria-pressed', chosen.has(tag.token) ? 'true' : 'false');
      },
      'data-token': tag.token,
    }, tag.label))));

    body.appendChild(h('div.flow-actions', null,
      h('button.btn.primary', {
        type: 'button', 'data-t': 'review-submit',
        onclick: () => {
          putRecord(day, {
            review: { tags: Array.from(chosen), note: '', at: new Date().toISOString() },
            accuracy: result.accuracy === null ? null : {
              overall: result.accuracy,
              energy: result.parts.energy,
              duration: result.parts.duration,
              completion: result.parts.completion,
            },
          });
          pushFeedback('day_review', { date: day, tags: Array.from(chosen), dayScore });

          const root = get();
          setLearning(updateLearning(root.learning, recentRecords(120), Object.values(root.items), { at: new Date().toISOString() }));
          invalidate();
          close();
          if (onDone) onDone();
          ctx.toast('נרשם. מחר אני כבר יודע קצת יותר.', 'good');
        },
      }, 'שמירה'),
      h('button.btn.ghost', { type: 'button', onclick: () => close() }, 'לא עכשיו')));
  }, { testId: 'review-flow', label: 'סיכום היום' });
}
