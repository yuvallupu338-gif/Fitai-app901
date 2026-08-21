/*
 * parts.js — the small pieces every screen builds out of.
 *
 * Not a component framework. These are the four or five shapes that showed up
 * in three views each and were drifting apart: a card with a heading, an empty
 * state, a risk, an insight, a confidence badge. Each is a plain function that
 * returns a node, so a view composes them and owns the result.
 *
 * The rule for anything in here is that it must appear in at least two places.
 * A one-off belongs in the view that uses it, where it can be read next to the
 * thing it is part of.
 */

import { h, svg, signedNum } from '../core/dom.js';
import { pct } from '../core/fmt.js';

export function card(opts, ...children) {
  const o = opts || {};
  const head = (o.title || o.action)
    ? h('header.card-head', null,
      o.title ? h('h2.card-title', { text: o.title }) : h('span'),
      o.action || null)
    : null;
  return h('section', {
    class: ['card', o.tone ? `tone-${o.tone}` : '', o.variant || ''].filter(Boolean).join(' '),
    'data-t': o.testId || null,
  }, head, o.note ? h('p.card-note', { text: o.note }) : null, children);
}

export function sectionTitle(text, action) {
  return h('header.card-head', null, h('h2.card-title', { text }), action || null);
}

/*
 * An empty state that says what to do next.
 *
 * The brief is specific about this and it is worth honouring literally: "no
 * patterns yet" plus a sentence explaining what the app is still waiting for
 * plus the button that gets it there. An empty list with no explanation reads
 * as a broken screen, and this app has a lot of screens that are legitimately
 * empty for the first week.
 */
export function empty(opts) {
  const o = opts || {};
  return h('div.empty', { 'data-t': 'empty' },
    o.mark ? h('div.empty-mark', { 'aria-hidden': 'true' }, o.mark) : null,
    h('p.empty-title', { text: o.title }),
    o.text ? h('p.empty-text', { text: o.text }) : null,
    o.cta || null);
}

export function stat(label, value, opts) {
  const o = opts || {};
  return h('div.stat', { 'data-t': o.testId || null },
    h('span.stat-value', { class: o.tone ? `stat-value ${o.tone}` : 'stat-value' }, value),
    h('span.stat-label', { text: label }));
}

const SEVERITY_TONE = { high: 'risk', medium: 'warn', low: '' };
const SEVERITY_LABEL = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' };

/**
 * One risk, with its severity, its cause and the one thing to do about it.
 *
 * All three, always. A risk without a cause is an accusation and a risk without
 * a suggestion is a worry — the brief asks for severity, reason and action
 * together, and the calm register is part of the contract rather than a
 * stylistic preference.
 */
export function riskCard(risk, opts) {
  const o = opts || {};
  return h('article', {
    class: `card tight tone-${SEVERITY_TONE[risk.severity] || ''}`.trim(),
    'data-t': 'risk',
  },
  h('header.card-head', null,
    h('h3.card-title', { text: risk.title }),
    h('span', { class: `badge ${SEVERITY_TONE[risk.severity] || ''}`.trim(),
      text: SEVERITY_LABEL[risk.severity] })),
  h('p.card-note', { text: risk.reason }),
  h('p.meta', { text: risk.suggestion }),
  o.action || null);
}

const STRENGTH_LABEL = { early: 'סימן מוקדם', emerging: 'דפוס מתגבש', strong: 'דפוס ברור' };

/**
 * One insight, and the evidence under it.
 *
 * The evidence line is not decoration. An app that says "you focus better in
 * the morning" without saying how it knows is asking to be believed; one that
 * says "based on 12 comparable days" can be argued with, which is the only way
 * a claim about somebody's own life earns trust.
 */
export function insightCard(insight) {
  return h('article.card.tight', { 'data-t': 'insight' },
    h('p.list-title', { text: insight.text }),
    h('p.evidence', null,
      h('span.badge.soon', { text: STRENGTH_LABEL[insight.strength] || '' }),
      h('span', { text: insight.evidence })));
}

/*
 * How much the app trusts what it just said.
 *
 * Shown next to the number it qualifies rather than buried in a settings
 * screen, because a forecast at 31% confidence and the same forecast at 88% are
 * different claims, and the difference is the honest part.
 */
export function confidenceBadge(confidence) {
  const tone = confidence.learningMode ? 'soon'
    : confidence.level === 'high' ? 'good'
      : confidence.level === 'medium' ? 'accent' : 'warn';
  const text = confidence.learningMode
    ? `עדיין לומד · ביטחון ${pct(confidence.overall)}`
    : `ביטחון ${pct(confidence.overall)}`;
  return h('span', { class: `badge ${tone}`, text, title: (confidence.reasons || []).join(' · ') });
}

/** A signed delta for use inside Hebrew prose. See dom.js on why this exists. */
export function delta(n, suffix) {
  const s = n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
  return h('span', { class: n > 0 ? 'good' : n < 0 ? 'bad' : 'dim' },
    signedNum(s), suffix ? ` ${suffix}` : '');
}

export function icon(path, opts) {
  const o = opts || {};
  return svg('svg', {
    viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
    fill: 'none', stroke: 'currentColor', 'stroke-width': o.weight || '1.7',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    class: o.class || null,
  }, svg('path', { d: path }));
}

export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  spark: 'M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M4 12.5 9 17.5 20 6.5',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  chevron: 'M9 6l6 6-6 6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};
