/*
 * document.js — the portfolio as a finished document, before anything renders it.
 *
 * Two exporters draw from this: the standalone HTML file and the Markdown. They
 * disagree about almost everything — one embeds photographs, the other cannot;
 * one has a contents list, the other has headings that are already an outline —
 * but they must not disagree about the content itself. Whatever the file says
 * about a work, the Markdown says too, because the day they drift is the day
 * somebody sends a client the wrong one of the two.
 *
 * So the wording is decided here, once, and each exporter is left with nothing
 * to do but mark it up.
 */

import { MONTHS, isEmail, safeUrl } from '../data/schema.js';
import { explainWork, writeAbout, deriveSkills } from '../engine/write.js';

/** "12 באוגוסט 2026" — the day the file was made, in the way a person writes it. */
export function formatHeDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getDate() + ' ' + 'ב' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/*
 * Contacts, each already checked into a scheme the document is willing to link.
 *
 * The phone is the one that needs both forms: "052-123-4567" is what a person
 * reads and `tel:0521234567` is what a phone dials, and a `tel:` URL with a
 * dash in it is not wrong so much as it is untested on somebody else's handset.
 */
export function contactsOf(owner) {
  const o = owner || {};
  const out = [];
  if (o.email && isEmail(o.email)) out.push({ key: 'email', text: o.email, url: 'mailto:' + o.email });
  if (o.phone) {
    const digits = String(o.phone).replace(/[^\d+]/g, '');
    out.push({ key: 'phone', text: o.phone, url: digits.length >= 6 ? 'tel:' + digits : '' });
  }
  if (o.site) {
    const url = safeUrl(o.site);
    if (url) out.push({ key: 'site', text: url.replace(/^https?:\/\//, ''), url });
  }
  if (o.location) out.push({ key: 'location', text: o.location, url: '' });
  return out;
}

/**
 * The whole document.
 *
 * `opts.now` is passed in rather than read off the clock, so that two runs of
 * the audit an hour apart compare byte for byte. The app hands it a real date;
 * the checks hand it a fixed one.
 */
export function buildDocument(portfolio, opts) {
  const o = opts || {};
  const owner = (portfolio && portfolio.owner) || {};
  const works = ((portfolio && portfolio.works) || []).filter((w) => w && w.title);
  const explained = works.map(explainWork);

  return {
    name: owner.name || '',
    headline: owner.headline || '',
    title: owner.name ? owner.name + ' — תיק עבודות' : 'תיק עבודות',
    contacts: contactsOf(owner),
    about: writeAbout({ owner, works }),
    skills: deriveSkills(works),
    works: explained,
    /* A contents list is worth its space from three works up. Below that it is a
     * list of the two headings the reader can already see. */
    contents: explained.length >= 3 ? explained.map((w) => ({ id: w.id, title: w.title, lead: w.lead })) : [],
    generatedOn: o.now ? formatHeDate(o.now) : '',
  };
}

/**
 * A file name for the download.
 *
 * This one is ASCII, and it is the only string in the app that is, so the
 * reason is worth writing down. A `download` attribute holding Hebrew is not
 * merely displayed differently on a machine whose locale is not UTF-8 —
 * Chromium discards the whole name and saves the file as `download`, with no
 * extension, which is a portfolio that does not open when double-clicked.
 * Measured, not assumed: the browser check in `tools/portfolio-smoke.mjs` runs
 * on exactly such a machine, and that is where it turned up.
 *
 * So the name is built from what survives everywhere: a Latin name if the
 * person has one, otherwise the date. Their name is still on the document — it
 * is the first line of it, and the title in the browser tab.
 */
export function fileNameFor(name, ext, now) {
  const raw = String(name || '').trim();
  const latin = /^[A-Za-z0-9 ._-]+$/.test(raw) ? raw.replace(/[\s_.]+/g, '-').replace(/-+/g, '-') : '';
  const stamp = now ? isoDay(now) : '';
  const parts = ['portfolio'];
  if (latin) parts.push(latin.replace(/^-|-$/g, ''));
  else if (stamp) parts.push(stamp);
  return parts.join('-') + '.' + ext;
}

function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
