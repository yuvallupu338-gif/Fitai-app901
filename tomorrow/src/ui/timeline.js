/*
 * timeline.js — the day read top to bottom.
 *
 * The engine decides what belongs on it and in what order; this file only draws
 * that list. Keeping the decision in predict.js and the drawing here is what
 * lets the same timeline appear on the home screen, inside the what-if
 * comparison and in the end-of-day review without three versions of the rule
 * about where an energy dip goes relative to the task sitting on top of it.
 */

import { h } from '../core/dom.js';
import { time as fmtTime } from '../core/fmt.js';
import { icon, ICONS } from './parts.js';

const KIND_ICON = {
  wake: 'M12 17a5 5 0 0 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  peak: ICONS.spark,
  dip: 'M4 7l6 6 4-4 6 6',
  risk: 'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0z',
  sleep: ICONS.moon,
  item: null,
  gap: null,
};

/**
 * Draw a forecast's timeline.
 *
 * opts: { timeFormat, now, onItem, limit }
 *
 * `onItem` makes the item rows into buttons that open the editor. When it is
 * absent the rows are plain — the review screen shows a day that has already
 * happened and there is nothing there to edit.
 */
export function timeline(entries, opts) {
  const o = Object.assign({ timeFormat: '24h', now: null, onItem: null, limit: 0 }, opts);
  const list = o.limit ? entries.slice(0, o.limit) : entries;

  return h('div.timeline', { 'data-t': 'timeline' }, list.map((e) => {
    const glyph = KIND_ICON[e.kind];
    const isNow = o.now !== null && Math.abs(o.now - e.minute) < 8;
    const classes = ['timeline-entry'];
    if (e.tone && e.tone !== 'plain') classes.push(`tone-${e.tone}`);
    if (isNow) classes.push('is-now');

    const body = h('div.timeline-body', null,
      h('span.timeline-title', null,
        glyph ? icon(glyph, { class: 'timeline-glyph' }) : null,
        h('span', { text: e.title })),
      e.detail ? h('span.timeline-detail', { text: e.detail }) : null);

    const time = h('span.timeline-time', { text: fmtTime(e.minute % 1440, o.timeFormat) });

    if (e.itemId && o.onItem) {
      return h('button', {
        class: classes.join(' '), 'data-t': 'timeline-entry', type: 'button',
        onclick: () => o.onItem(e.itemId),
        'aria-label': `${fmtTime(e.minute % 1440, o.timeFormat)} ${e.title}. עריכה`,
      }, time, body);
    }
    return h('div', { class: classes.join(' '), 'data-t': 'timeline-entry' }, time, body);
  }));
}
