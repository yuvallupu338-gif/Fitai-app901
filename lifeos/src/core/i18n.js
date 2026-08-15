/*
 * i18n.js — string lookup.
 *
 * Not because LifeOS is going to be translated. Because a Hebrew interface
 * written with the strings inline is a Hebrew interface nobody can audit: you
 * cannot grep for "every sentence the user might see" when the sentences are
 * scattered through forty render functions, and the English placeholder that
 * slipped into a validation message stays there forever.
 *
 * One catalogue means tools/lifeos-hebrew.mjs can read all of it at once and
 * fail the build on a Latin-script string that was never meant to ship.
 *
 * HEBREW COUNTING IS NOT ENGLISH COUNTING.
 *
 * English needs two forms, one and many. Hebrew needs three, and which three
 * depends on the gender of the noun being counted: one task is "משימה אחת",
 * two are "שתי משימות", three are "3 משימות" — while one day is "יום אחד" and
 * two are "שני ימים". There is no rule that derives "שתי" from "שני" without
 * knowing the noun, so plural entries carry all three forms explicitly and the
 * catalogue, not this file, holds the gender knowledge.
 */

import { HE } from '../locales/he.js';

const CATALOGUE = HE;

/* Every key asked for that did not exist. The Hebrew audit tool reads this
 * after walking the app, so a missing string is a test failure rather than a
 * "tasks.foo" that shows up in the interface. */
const missing = new Set();

function lookup(key) {
  let node = CATALOGUE;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/* {name} → params.name. Values are inserted as text by the caller (h() never
 * parses HTML), so there is nothing to escape here. */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  ));
}

/**
 * t('tasks.title') → 'משימות'
 * t('today.greeting', { name: 'אלכס' })
 *
 * A key that does not resolve returns the key itself. Loudly wrong beats
 * silently blank: an empty string in the interface looks like a layout bug and
 * gets reported as one, six weeks later.
 */
export function t(key, params) {
  const value = lookup(key);
  if (typeof value === 'string') return interpolate(value, params);
  missing.add(key);
  return key;
}

/**
 * Counted nouns. Pass the three forms under one key:
 *   { one: 'משימה אחת', two: 'שתי משימות', many: '{n} משימות' }
 *
 * Zero takes `none` when the catalogue provides one — "אין משימות" reads far
 * better than "0 משימות" — and falls back to the many form otherwise.
 */
export function plural(key, n, params) {
  const forms = lookup(key);
  if (!forms || typeof forms !== 'object') {
    missing.add(key);
    return key;
  }
  const count = Math.abs(Number(n) || 0);
  let form;
  if (count === 0 && forms.none) form = forms.none;
  else if (count === 1) form = forms.one;
  else if (count === 2) form = forms.two;
  else form = forms.many;
  if (typeof form !== 'string') {
    missing.add(key);
    return key;
  }
  return interpolate(form, Object.assign({ n: count }, params));
}

/** Does this key exist? Used by the enum helpers, which map over statuses. */
export function has(key) {
  return typeof lookup(key) === 'string' || typeof lookup(key) === 'object';
}

/** Keys asked for and not found, for the audit tool. */
export function missingKeys() {
  return Array.from(missing).sort();
}

/** The whole catalogue, for the audit tool to walk. */
export function catalogue() {
  return CATALOGUE;
}
