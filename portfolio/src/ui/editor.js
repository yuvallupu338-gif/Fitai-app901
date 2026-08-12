/*
 * editor.js — one work, and the explanation being written from it as you answer.
 *
 * The panel at the bottom is the whole argument of this screen. A form that
 * collects answers and shows the result later is a form somebody fills in
 * defensively, in the shortest words that will do; a form that shows the
 * paragraph forming as they type is a form they add a sentence to. So the
 * explanation redraws on every keystroke, and the fields do not redraw at all.
 *
 * Saving is separate from both. The draft is written to storage on a short
 * delay rather than on every character, because the works carry photographs and
 * serialising several megabytes of base64 between two keystrokes is felt on the
 * keyboard. Leaving the screen flushes whatever is pending, so nothing waits on
 * a timer that a navigation could outrun.
 */

import { h, clear, announce } from '../../../src/core/dom.js';
import * as store from '../core/store.js';
import { WORK_FIELDS, KINDS, CONTEXTS, TEAMS, contextById, cleanPeriod } from '../data/schema.js';
import { explainWork } from '../engine/write.js';
import { field, textInput, textArea, picker, chipsInput, periodInput, linksInput, imagesInput } from './fields.js';

const SAVE_DELAY = 400;

export function renderEditor(root, workId, opts) {
  const o = opts || {};
  const view = h('section');
  root.appendChild(view);

  const stored = store.workById(workId);
  if (!stored) {
    view.appendChild(h('p.empty', 'העבודה הזאת כבר לא כאן.'));
    view.appendChild(h('button.btn', { onclick: () => o.onClose && o.onClose() }, 'חזרה לרשימה'));
    return { redraw: () => {} };
  }

  /* The draft is the caller's, not the store's, so a keystroke does not have to
   * survive a round trip through normalisation before it is on the screen. */
  const draft = Object.assign({}, stored);
  let timer = null;
  let dirty = false;

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    store.saveWork(workId, draft);
    dirty = false;
    const err = store.saveError();
    if (err) paintSaveError(err);
  }

  function touch() {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
    paintExplain();
  }

  const set = (key) => (value) => { draft[key] = value; touch(); };

  const explainBox = h('div.explain');
  const errorBox = h('div');

  function paintSaveError(kind) {
    clear(errorBox);
    errorBox.appendChild(h('div.warnbox.hot', kind === 'quota'
      ? 'אין מקום לשמור את זה במכשיר — כנראה בגלל התמונות. מחקו תמונה, או הורידו גיבוי מהלשונית "הקובץ" לפני שתסגרו.'
      : 'הדפדפן הזה לא נותן לשמור. הקובץ עדיין ייבנה, אבל אל תסגרו את הלשונית לפני שהורדתם אותו.'));
  }

  /*
   * The explanation, redrawn from the draft.
   *
   * It shows the derived paragraph and the list of what is still missing, and
   * nothing else — the user's own answers are already on the screen, in the
   * boxes they were typed into, and reprinting them here would be a preview of
   * the typing rather than of the document.
   */
  function paintExplain() {
    /*
     * The period is cleaned for the panel, because it is the one field where
     * the stored value can differ from what was typed — an end date before its
     * start is dropped on the way in — and a panel that shows a period the file
     * will not print is a panel that lies about the file.
     */
    const e = explainWork(Object.assign({}, draft, { period: cleanPeriod(draft.period) }));
    clear(explainBox);
    explainBox.appendChild(h('p.eyebrow', 'ההסבר שייכתב בקובץ'));
    explainBox.appendChild(h('p.opening', e.opening.join(' ')));
    if (e.facts.length) {
      explainBox.appendChild(h('p.facts', e.facts.map((f) => h('span.fact', f.value))));
    }
    if (e.sections.length) {
      explainBox.appendChild(h('p.lead', 'ואחריו: ' + e.sections.map((s) => s.label).join(' · ') + '.'));
    }
    if (e.gaps.length) {
      explainBox.appendChild(h('div.gaps', [
        h('b', 'מה שעוד חסר: '),
        e.gaps.map((g) => g.label).join(', '),
        h('p.help', 'אפשר גם בלי. ההסבר פשוט יהיה קצר יותר.'),
      ]));
    }
  }

  function fieldFor(f) {
    if (f.key === 'kind') return field(f.label, picker(KINDS, draft.kind, set('kind')), f.hint);
    if (f.key === 'context') {
      return field(f.label, picker(CONTEXTS, draft.context, (v) => {
        draft.context = v;
        touch();
        paintClientName();
      }), f.hint);
    }
    if (f.key === 'clientName') return null; /* painted by paintClientName, which owns its label */
    if (f.key === 'team') return field(f.label, picker(TEAMS, draft.team, set('team')), f.hint);
    if (f.key === 'period') return field(f.label, periodInput(draft.period, set('period')), f.hint);
    if (f.key === 'tools') return field(f.label, chipsInput(draft.tools, set('tools')), f.hint);
    if (f.key === 'links') return field(f.label, linksInput(draft.links, set('links')), f.hint);
    if (f.key === 'images') {
      return field(f.label, imagesInput(draft.images, set('images'), (msg) => {
        clear(errorBox);
        errorBox.appendChild(h('div.warnbox', msg));
      }), f.hint);
    }
    /* The hint is written once. A textarea that carries it as a placeholder and
     * again as the line underneath says the same sentence twice, and loses the
     * placeholder half the moment somebody types — so the line stays and the
     * placeholder goes. */
    if (f.type === 'para' || f.type === 'lines') {
      return field(f.label, textArea(draft[f.key], set(f.key), {
        rows: f.type === 'lines' ? 5 : 4,
        maxlength: String(f.max),
      }), f.hint);
    }
    return field(f.label, textInput(draft[f.key], set(f.key), {
      maxlength: String(f.max),
      placeholder: f.hint || '',
    }), null);
  }

  const clientSlot = h('div');
  function paintClientName() {
    clear(clientSlot);
    const ctx = contextById(draft.context);
    if (!ctx || !ctx.nameLabel) return;
    clientSlot.appendChild(field(ctx.nameLabel, textInput(draft.clientName, set('clientName'), {
      maxlength: '120',
      placeholder: ctx.needsName ? '' : 'לא חובה',
    }), ctx.needsName ? 'אפשר להשאיר ריק אם זה לא לפרסום — ההסבר ייכתב בלי השם.' : null));
  }

  view.appendChild(h('div.toolbar', [
    h('button.btn.ghost', {
      onclick: () => { flush(); if (o.onClose) o.onClose(); },
    }, '→ חזרה לרשימה'),
  ]));

  view.appendChild(errorBox);

  const form = h('div.formcard');
  for (const f of WORK_FIELDS) {
    const node = fieldFor(f);
    if (node) form.appendChild(node);
    if (f.key === 'context') form.appendChild(clientSlot);
  }
  paintClientName();
  view.appendChild(form);
  view.appendChild(explainBox);
  paintExplain();

  view.appendChild(h('div.toolbar', [
    h('button.btn.primary', {
      onclick: () => {
        flush();
        announce('נשמר');
        if (o.onClose) o.onClose();
      },
    }, 'שמירה וחזרה'),
    h('button.btn.danger', {
      onclick: () => {
        if (timer) { clearTimeout(timer); timer = null; }
        dirty = false;
        store.removeWork(workId);
        announce('העבודה נמחקה');
        if (o.onClose) o.onClose();
      },
    }, 'מחיקת העבודה'),
  ]));

  /*
   * A tab switch, a reload or a phone locking the screen all end the session
   * without a click on "שמירה". The delayed write is at most a few hundred
   * milliseconds behind, and this is what makes that true rather than usually
   * true.
   */
  const onHide = () => flush();
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);

  return {
    redraw: () => {},
    flush,
    release: () => {
      flush();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    },
  };
}
