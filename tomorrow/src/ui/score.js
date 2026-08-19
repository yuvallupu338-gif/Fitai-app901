/*
 * score.js — the Tomorrow Score, and the answer to "why that number".
 *
 * The dial is the first thing on the screen and the only thing most people will
 * read, so it carries three things and no more: the number, what it means in
 * words, and the single change that would move it. Everything else about the
 * score lives one tap away in the breakdown.
 *
 * The breakdown never shows the formula. It shows the six factors as they
 * stand, each with the real figure behind it, and then the two or three things
 * that actually moved the number in either direction — which is what somebody
 * means when they ask why it is 74.
 */

import { h, sheet } from '../core/dom.js';
import { countTo } from '../core/motion.js';
import { ring, setRing, barRow } from './chart.js';
import { card, confidenceBadge, icon, ICONS } from './parts.js';
import { explainFactor, explainScore } from '../engine/explain.js';

/**
 * The hero card.
 *
 * opts: { onImprove, animateFrom }
 *
 * `animateFrom` is how the 74 → 86 moment happens: Apply re-renders the home
 * screen and passes the old score, and the number counts up to the new one
 * instead of swapping. It is the one animation in this app carrying information
 * rather than decorating a transition, and countTo() skips it outright for
 * anybody who has asked for less movement.
 */
export function hero(ctx, opts) {
  const o = opts || {};
  const f = ctx.forecast;

  const value = h('div.ring-value', { 'data-t': 'score', text: String(f.score) });
  const dial = ring({ value: f.score, band: f.band, ariaLabel: `ציון מחר ${f.score} מתוך 100, ${f.label}` });
  const wrap = h('div.ring-wrap', null, dial, value);

  if (o.animateFrom !== undefined && o.animateFrom !== f.score) {
    setRing(dial, o.animateFrom);
    value.textContent = String(o.animateFrom);
    countTo(o.animateFrom, f.score, 900, (n) => {
      value.textContent = String(n);
      setRing(dial, n);
    });
  }

  /*
   * A day with nothing much in it gets told what its score is standing on
   * rather than what would improve it. Offering to optimise a day that has one
   * item on it is the app talking past the person: the useful next move is to
   * tell it what is actually happening tomorrow.
   */
  const rec = f.recommendation;
  const subtext = !f.judged
    ? 'עוד אין מספיק ביום הזה כדי לשפוט אותו — הציון מבוסס בעיקר על השינה.'
    : rec
      ? `שינוי אחד יכול להעלות את הציון ל-${rec.to}.`
      : 'לא מצאתי שינוי אחד שישפר את מחר בצורה משמעותית.';

  return card({ variant: 'hero', testId: 'score-hero' },
    h('div.hero-top', null,
      h('span.eyebrow', { text: ctx.isTomorrow ? 'ציון מחר' : 'ציון היום' }),
      confidenceBadge(f.confidence)),
    wrap,
    h('p.ring-caption', { 'data-t': 'score-label', text: f.label }),
    h('p.sub.center', { text: subtext }),
    h('div.hero-actions', null,
      h('button.btn.primary', {
        type: 'button', 'data-t': 'improve',
        onclick: () => o.onImprove && o.onImprove(),
      }, icon(ICONS.spark), 'שפר את מחר'),
      h('button.btn.quiet', {
        type: 'button', 'data-t': 'score-why',
        onclick: () => openBreakdown(ctx),
      }, `למה ${f.score}?`)));
}

/**
 * The breakdown sheet: six factors, then why the number is where it is.
 *
 * Selecting a factor swaps its explanation into the panel below rather than
 * opening a second sheet on top of the first. Stacking dialogs on a phone is
 * how somebody ends up unable to find the way back.
 */
export function openBreakdown(ctx) {
  const f = ctx.forecast;
  const detail = h('p.factor-explain', { text: 'בחר גורם כדי לראות מה עומד מאחוריו.' });
  const rows = [];

  for (const factor of f.factors) {
    const row = barRow({
      label: factor.label,
      value: factor.score,
      direction: factor.direction,
      testId: `factor-${factor.key}`,
      onclick: () => {
        detail.textContent = `${factor.detail} ${explainFactor(factor, f)}`.trim();
        for (const other of rows) other.classList.toggle('is-on', other === row);
      },
    });
    rows.push(row);
  }

  return sheet(h('div.stack', null,
    h('p.lead', { text: `${f.score} מתוך 100 — ${f.label}.` }),
    h('div.bars', null, rows),
    detail,
    h('div.divider'),
    h('h3.card-title', { text: `למה ${f.score}?` }),
    h('ul.why-list', null, explainScore(f).map((line) => h('li', { text: line }))),
    h('div.divider'),
    h('div.row.wrap', null,
      confidenceBadge(f.confidence),
      h('span.meta', { text: (f.confidence.reasons || [])[0] || '' }))),
  { title: 'מה מרכיב את הציון', label: 'פירוט הציון' });
}
