/*
 * book.js — the history screen.
 *
 * Called "the book" everywhere in the product, including in the copy, because
 * that framing is the difference between a log and an object someone owns. A
 * log is something an app keeps about you; a book is something you have.
 *
 * Three views over the same data: a timeline, a year heat map, and the saved
 * ones. The heat map is the one that carries the emotional weight — a year of
 * small marks is an argument that you did more than you remember.
 */

import { h, clear, sheet, toast, haptic, ltr } from '../core/dom.js';
import * as store from '../core/store.js';
import { dayKey, humanDate, monthName, WEEKDAY_SHORT, weekdayOf, shiftKey, daysBetween } from '../core/day.js';
import { sparkById } from '../data/sparks.index.js';
import { CATEGORIES, categoryLabel } from '../data/taxonomy.js';
import * as streak from '../core/streak.js';
import { shareEntry } from './share.js';
import { topicsFromText } from '../engine/vector.js';

const VIEWS = [
  { key: 'timeline', he: 'ציר זמן' },
  { key: 'year', he: 'שנה' },
  { key: 'saved', he: 'שמורים' },
];

const STATUS_MARK = {
  completed: { glyph: '✓', label: 'בוצע', cls: 'is-done' },
  deferred: { glyph: '⏳', label: 'לא היום', cls: 'is-later' },
  rejected: { glyph: '✕', label: 'הוחלף', cls: 'is-skipped' },
  delivered: { glyph: '·', label: 'נמסר', cls: 'is-open' },
};

/* View state lives here rather than in the store: which tab of the book you
 * were on is not worth persisting, and persisting it means restoring somebody
 * into a filtered view they set three weeks ago and forgot. */
const ui = { view: 'timeline', category: null, query: '' };

export function renderBook(root) {
  const state = store.get();
  const keys = Object.keys(state.days).sort((a, b) => b.localeCompare(a));

  clear(root);
  root.appendChild(h('header.screen-head',
    h('h1.screen-title', 'הספר שלך'),
    h('p.screen-lede', keys.length
      ? `${keys.length} ניצוצות · ${countDone(state)} בוצעו`
      : 'כאן ייבנה הספר שלך.')));

  if (!keys.length) {
    root.appendChild(h('section.card.empty',
      h('h2', 'עוד לא נאסף כלום.'),
      h('p', 'הניצוץ של היום כבר בפנים. עוד 364 בדרך.')));
    return;
  }

  root.appendChild(h('div.seg.seg-wide', { role: 'tablist' }, VIEWS.map((v) => h(
    `button.seg-item${ui.view === v.key ? '.is-on' : ''}`,
    {
      role: 'tab', 'aria-selected': String(ui.view === v.key),
      onclick: () => { ui.view = v.key; haptic('select'); renderBook(root); },
    }, v.he,
  ))));

  if (ui.view === 'timeline') timeline(root, state, keys);
  else if (ui.view === 'year') year(root, state);
  else saved(root, state, keys);
}

function countDone(state) {
  return Object.values(state.days).filter((d) => d.status === 'completed').length;
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

function timeline(root, state, keys) {
  root.appendChild(filters(root, state));

  let filtered = keys.filter((k) => matches(state.days[k], k, null));
  let bySense = false;
  if (ui.query && !filtered.length) {
    const ids = semanticMatches(state, keys, ui.query);
    if (ids) {
      filtered = keys.filter((k) => matches(state.days[k], k, ids));
      bySense = filtered.length > 0;
    }
  }

  if (!filtered.length) {
    root.appendChild(h('section.card.empty',
      h('h2', 'לא מצאנו.'),
      h('p', 'נסה מילה אחרת, או עיין לפי קטגוריה.')));
    return;
  }
  if (bySense) {
    root.appendChild(h('p.search-note', 'לא נמצאה התאמה מדויקת, אז חיפשנו לפי נושא.'));
  }

  let lastMonth = null;
  const list = h('ol.timeline');
  for (const key of filtered) {
    const month = key.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      list.appendChild(h('li.timeline-month', `${monthName(key)} ${key.slice(0, 4)}`));
    }
    list.appendChild(row(state.days[key], key));
  }
  root.appendChild(list);
}

/*
 * Search is literal first, and falls back to the topic space.
 *
 * Substring matching answers "where was that thing about the drawer", which is
 * what most searches are. But "משהו על להתחיל כשאין כוח" matches no substring
 * anywhere and is exactly the search a person makes on the day they need it —
 * so when the literal pass finds nothing, the query is mapped into the same
 * topic vector the ranker uses and the book is searched by meaning instead.
 *
 * The fallback is deliberately not blended into the literal pass: mixing them
 * makes an exact-match search return three vaguely-related items alongside the
 * one that was actually wanted.
 */
function matches(entry, key, semanticIds) {
  if (!entry) return false;
  if (ui.category) {
    const spark = sparkById(entry.sparkId);
    if (!spark || spark.category !== ui.category) return false;
  }
  if (ui.query) {
    if (semanticIds) return semanticIds.has(entry.sparkId);
    const hay = `${entry.title} ${entry.body} ${entry.action} ${entry.note || ''}`;
    if (!hay.includes(ui.query)) return false;
  }
  return true;
}

/*
 * Spark ids in this book whose topics overlap the query's.
 *
 * The query is run through the same keyword-to-topic map the profile uses for
 * free-text goals, so "משהו על להתחיל כשאין כוח" becomes {starting, courage}
 * and matches the sparks tagged that way. Overlap is scored as a fraction of
 * the spark's own tags, so a two-tag spark that matches both ranks above a
 * six-tag spark that matches one.
 */
function semanticMatches(state, keys, query) {
  const topics = topicsFromText(query);
  if (!topics.length) return null;

  const scored = [];
  for (const key of keys) {
    const spark = sparkById(state.days[key].sparkId);
    if (!spark) continue;
    const overlap = spark.topics.filter((t) => topics.includes(t)).length;
    if (overlap) scored.push({ id: spark.id, score: overlap / spark.topics.length });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return new Set(scored.map((x) => x.id));
}

function filters(root, state) {
  const search = h('input.input.search', {
    type: 'search', value: ui.query, placeholder: 'חיפוש בספר',
    'aria-label': 'חיפוש בספר',
    oninput: (e) => {
      ui.query = e.target.value.trim();
      /* Re-render on a short debounce so typing does not rebuild a year of
       * rows on every keystroke. */
      clearTimeout(search._t);
      search._t = setTimeout(() => renderBook(root), 180);
    },
  });

  /* Only categories that actually appear in this person's history. A filter bar
   * offering twelve options when the book contains four is a filter bar that
   * mostly returns nothing. */
  const present = new Set();
  for (const key of Object.keys(state.days)) {
    const spark = sparkById(state.days[key].sparkId);
    if (spark) present.add(spark.category);
  }

  return h('div.filters',
    search,
    h('div.chip-row',
      h(`button.chip.chip-sm${ui.category ? '' : '.is-on'}`, {
        onclick: () => { ui.category = null; renderBook(root); },
      }, 'הכל'),
      CATEGORIES.filter((c) => present.has(c.key)).map((c) => h(
        `button.chip.chip-sm${ui.category === c.key ? '.is-on' : ''}`,
        { onclick: () => { ui.category = c.key; renderBook(root); } },
        c.he,
      ))));
}

function row(entry, key) {
  const mark = STATUS_MARK[entry.status] || STATUS_MARK.delivered;
  const spark = sparkById(entry.sparkId);
  return h(`li.tl-row.${mark.cls}`, {
    tabindex: '0', role: 'button',
    'aria-label': `${humanDate(key)}: ${entry.title}, ${mark.label}`,
    onclick: () => openEntry(entry, key),
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(entry, key); }
    },
  },
  h('span.tl-mark', { 'aria-hidden': 'true' }, mark.glyph),
  h('div.tl-body',
    h('span.tl-title', entry.title),
    h('span.tl-meta', `${humanDate(key)}${spark ? ` · ${categoryLabel(spark.category)}` : ''}`)),
  entry.saved ? h('span.tl-saved', { 'aria-label': 'שמור' }, '★') : null);
}

function openEntry(entry, key) {
  const spark = sparkById(entry.sparkId);
  const close = sheet(h('div.detail',
    h('p.detail-date', humanDate(key)),
    h('p.spark-body', entry.body),
    h('p.spark-action', entry.action),
    entry.why ? h('p.detail-why', entry.why) : null,
    entry.note ? h('blockquote.detail-note', entry.note) : null,
    h('div.sheet-actions',
      h('button.btn', {
        onclick: () => {
          const saved = !entry.saved;
          store.putDay(key, { saved });
          toast(saved ? 'נשמר' : 'הוסר');
          close();
        },
      }, entry.saved ? 'הסר מהשמורים' : 'שמור'),
      h('button.btn', { onclick: () => shareEntry(entry, spark) }, 'שתף'),
      store.get().collections.length
        ? h('button.btn', { onclick: () => pickCollections(key) }, 'הוסף לאוסף')
        : null,
      h('button.btn.btn-ghost', { onclick: () => close() }, 'סגור'))), {
    label: entry.title, title: entry.title,
  });
}

/* Which collections this day belongs to, as a list of toggles. */
function pickCollections(key) {
  const rows = store.get().collections.map((c) => {
    const on = c.items.includes(key);
    const btn = h(`button.reason${on ? ' is-on' : ''}`, {
      onclick: () => {
        const nowIn = store.toggleInCollection(c.id, key);
        btn.classList.toggle('is-on', nowIn);
        haptic('select');
      },
    }, c.name);
    return btn;
  });
  sheet(h('div', h('div.reason-list', rows)), { label: 'אוספים', title: 'הוסף לאוסף' });
}

/* ------------------------------------------------------------------ *
 * Year heat map
 * ------------------------------------------------------------------ */

/*
 * Fifty-three weeks of small squares.
 *
 * The grid itself runs left-to-right — oldest column on the left, today on the
 * right — inside an RTL page. That is deliberate: it is the direction every
 * contribution calendar uses, a horizontal axis of *time* is not text, and an
 * RTL scroll container reports scrollLeft differently across browsers, so
 * flipping it would make "open on today" a per-browser guess. Instead the
 * wrapper is scrolled to its end after render, which lands on today everywhere.
 *
 * Four states, and "frozen" is one of them: a day a freeze covered is drawn
 * differently from a day that was simply missed. That is the visual half of the
 * no-guilt promise — the calendar shows the gap was handled, not that it was a
 * failure.
 */
function year(root, state) {
  const st = streak.summary();
  const today = dayKey();
  const start = shiftKey(today, -364);

  const grid = h('div.heat', { role: 'img', 'aria-label': 'לוח השנה שלך' });
  const firstDow = weekdayOf(start);
  for (let i = 0; i < firstDow; i += 1) grid.appendChild(h('span.heat-cell.is-pad'));

  let done = 0;
  for (let i = 0; i <= daysBetween(start, today); i += 1) {
    const key = shiftKey(start, i);
    const entry = state.days[key];
    let cls = 'is-none';
    let label = 'לא נמסר';
    if (entry && entry.status === 'completed') { cls = 'is-done'; label = 'בוצע'; done += 1; }
    else if (entry && entry.status === 'deferred') { cls = 'is-later'; label = 'לא היום'; }
    else if (entry) { cls = 'is-open'; label = 'נמסר'; }
    else if (st.frozen.has(key)) { cls = 'is-frozen'; label = 'יום הקפאה'; }
    grid.appendChild(h(`span.heat-cell.${cls}`, { title: `${humanDate(key)} — ${label}` }));
  }

  /* Weekday labels are a column, not a row: in a column-flow grid the days of
   * the week are the seven rows, and a horizontal key underneath would be
   * labelling the wrong axis. */
  const days = h('div.heat-days', { 'aria-hidden': 'true' },
    WEEKDAY_SHORT.map((d) => h('span', d)));

  const wrap = h('div.heat-wrap', grid);

  root.appendChild(h('section.card.year',
    h('div.year-stats',
      stat('בוצעו השנה', done),
      stat('הרצף הארוך ביותר', st.longest),
      stat('רצף נוכחי', st.current)),
    /* Grid first so it takes the right-hand (leading) side of the RTL row and
     * the weekday column lands on the left, at the start of the LTR time axis. */
    h('div.heat-frame', wrap, days),
    h('div.heat-legend',
      h('span.heat-cell.is-none'), h('span', 'לא נמסר'),
      h('span.heat-cell.is-open'), h('span', 'נמסר'),
      h('span.heat-cell.is-frozen'), h('span', 'הקפאה'),
      h('span.heat-cell.is-done'), h('span', 'בוצע'))));

  /* After layout, so scrollWidth is real. Today is the last column, and a year
   * grid that opens on last August is a year grid nobody scrolls. */
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
}

function stat(label, value) {
  return h('div.stat', h('dt', label), h('dd', ltr(value)));
}

/* ------------------------------------------------------------------ *
 * Saved
 * ------------------------------------------------------------------ */

/*
 * Saved items, and the named collections built out of them.
 *
 * Collections are lists a person makes for a purpose — "בוקר", "כשאני תקוע" —
 * and they are the one place in the app where somebody organises their own
 * content. That is why they are here rather than in settings: they belong next
 * to the material they organise.
 */
function saved(root, state, keys) {
  const rerender = () => renderBook(root);
  const starred = keys.filter((k) => state.days[k].saved);

  root.appendChild(h('div.collections-head',
    h('button.btn.btn-ghost', { onclick: () => newCollection(rerender) }, '+ אוסף חדש'),
    starred.length ? h('button.btn.btn-ghost', { onclick: () => printBook(state) }, '⎙ הדפס ספר') : null));

  for (const c of state.collections) {
    const items = c.items.filter((k) => state.days[k]);
    root.appendChild(h('section.card.collection',
      h('div.collection-head',
        h('h2.card-title', c.name),
        h('span.collection-count', ltr(items.length))),
      items.length
        ? h('ol.timeline', items
          .sort((a, b) => b.localeCompare(a))
          .map((k) => row(state.days[k], k)))
        : h('p.card-lede', 'ריק. אפשר להוסיף ניצוצות מתוך כל פריט בספר.'),
      h('button.btn.btn-ghost.collection-del', {
        onclick: () => { store.removeCollection(c.id); toast('האוסף נמחק'); rerender(); },
      }, 'מחק אוסף')));
  }

  if (!starred.length) {
    root.appendChild(h('section.card.empty',
      h('h2', 'עוד לא שמרת כלום.'),
      h('p', 'הכוכב מתחת לניצוץ שומר אותו לכאן — לימים שבהם אתה צריך משהו שכבר עבד.')));
    return;
  }

  root.appendChild(h('h2.section-label', 'שמורים'));
  const ol = h('ol.timeline');
  for (const key of starred) ol.appendChild(row(state.days[key], key));
  root.appendChild(ol);
}

function newCollection(rerender) {
  const input = h('input.input', { type: 'text', maxlength: '30', placeholder: 'למשל: כשאני תקוע' });
  const close = sheet(h('div',
    h('p.sheet-lede', 'אוסף הוא רשימה שאתה בונה למטרה — בוקר, ימים קשים, עבודה.'),
    input,
    h('div.sheet-actions',
      h('button.btn.btn-primary', {
        onclick: () => {
          const name = input.value.trim();
          if (!name) { close(); return; }
          store.addCollection(name);
          close();
          rerender();
        },
      }, 'צור'),
      h('button.btn.btn-ghost', { onclick: () => close() }, 'ביטול'))), {
    label: 'אוסף חדש', title: 'אוסף חדש',
  });
}

/*
 * The printed book.
 *
 * Builds a plain, chrome-free document in a hidden container and hands it to
 * the browser's own print dialogue — which on every platform can also "save as
 * PDF". That is the whole feature: no library, no server, no export format to
 * maintain, and the result is something a person can actually put on a shelf.
 *
 * Only completed and saved days are included. A printed book of things you did
 * not do would be a strange gift to give somebody, including yourself.
 */
function printBook(state) {
  const keys = Object.keys(state.days)
    .filter((k) => state.days[k].status === 'completed' || state.days[k].saved)
    .sort();

  const doc = h('div.print-book',
    h('header.print-head',
      h('h1', 'ספר הניצוצות'),
      h('p', `${keys.length} ניצוצות · ${keys.length ? `${humanDate(keys[0])} — ${humanDate(keys[keys.length - 1])}` : ''}`)),
    keys.map((k) => {
      const e = state.days[k];
      return h('article.print-entry',
        h('span.print-date', humanDate(k)),
        h('h2', e.title),
        h('p.print-body', e.body),
        h('p.print-action', e.action),
        e.note ? h('blockquote.print-note', e.note) : null);
    }));

  document.body.appendChild(doc);
  document.body.classList.add('is-printing');
  const cleanup = () => {
    document.body.classList.remove('is-printing');
    doc.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  /* Safari never fires afterprint in some versions, so there is a backstop —
   * a leftover hidden document would break the next screen render. */
  setTimeout(cleanup, 60000);
}
