/*
 * owner.js — who the portfolio belongs to.
 *
 * Seven fields, one of them required, and the required one is the name. The
 * rest are the difference between a document somebody can act on and a document
 * they can only admire: an employer who has read the whole thing and cannot
 * find an email address has been given a nice PDF and no way to answer it.
 *
 * The paragraph under the form is the one the app writes about the person, and
 * it is shown here rather than only in the file so that the sentence "בתיק הזה
 * שלוש עבודות" is something they saw before a stranger did.
 */

import { h, clear } from '../../../src/core/dom.js';
import * as store from '../core/store.js';
import { OWNER_FIELDS, isEmail } from '../data/schema.js';
import { writeAbout } from '../engine/write.js';
import { field, textInput, textArea } from './fields.js';

const SAVE_DELAY = 400;

export function renderOwner(root, opts) {
  const o = opts || {};
  const view = h('section');
  root.appendChild(view);

  const draft = Object.assign({}, store.get().owner);
  let timer = null;

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    store.setOwner(draft);
    paintAbout();
  }

  function touch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
    paintAbout();
  }

  const aboutBox = h('div.explain');

  /*
   * Rebuilt from the draft and the works already stored, so the count in it is
   * the real one. It says nothing about the person that was not counted — see
   * the note in write.js about why.
   */
  function paintAbout() {
    const paragraphs = writeAbout({ owner: draft, works: store.get().works });
    clear(aboutBox);
    aboutBox.appendChild(h('p.eyebrow', 'מה שייכתב בראש הקובץ'));
    aboutBox.appendChild(h('h3', draft.name || 'השם שלך'));
    if (draft.headline) aboutBox.appendChild(h('p.lead', draft.headline));
    for (const p of paragraphs) aboutBox.appendChild(h('p', p));
    const contacts = [draft.email, draft.phone, draft.site, draft.location].filter(Boolean);
    if (contacts.length) aboutBox.appendChild(h('p.facts', contacts.map((c) => h('span.fact', c))));
  }

  const form = h('div.formcard');
  for (const f of OWNER_FIELDS) {
    const set = (v) => { draft[f.key] = v; touch(); };
    if (f.type === 'para') {
      form.appendChild(field(f.label, textArea(draft[f.key], set, {
        rows: 4, maxlength: String(f.max),
      }), f.hint));
      continue;
    }
    const attrs = { maxlength: String(f.max), placeholder: f.hint || '' };
    /* Latin-only fields are typed left to right whatever the page direction is,
     * and an address that renders with its scheme at the wrong end looks broken
     * to the person typing it. */
    if (f.type === 'email' || f.type === 'url') attrs.dir = 'ltr';
    if (f.type === 'email') attrs.type = 'email';
    const control = textInput(draft[f.key], set, attrs);
    const help = f.key === 'email'
      ? 'זה מה שנכנס לקישור "צור קשר" בקובץ.'
      : f.hint;
    form.appendChild(field(f.label, control, help));
  }
  view.appendChild(form);

  const warn = h('div');
  view.appendChild(warn);
  view.appendChild(aboutBox);
  paintAbout();

  view.appendChild(h('div.toolbar', [
    h('button.btn.primary', {
      onclick: () => {
        flush();
        clear(warn);
        if (draft.email && !isEmail(draft.email)) {
          warn.appendChild(h('div.warnbox', 'האימייל לא נראה כמו אימייל, אז הוא לא ייכנס לקובץ. אפשר להמשיך בלעדיו.'));
        }
        if (o.onDone) o.onDone();
      },
    }, 'לעבודות ←'),
  ]));

  /* Leaving the tab is one of the ways this form is finished with, so it saves
   * on the way out rather than waiting for a timer nobody is watching. */
  return { redraw: paintAbout, flush, release: flush };
}
