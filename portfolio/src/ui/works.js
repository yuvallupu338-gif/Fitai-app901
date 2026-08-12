/*
 * works.js — the list of works, and the way into one.
 *
 * The list is the app's home screen in every sense that matters: it is what a
 * person comes back to next week with one more thing to add. So it shows, for
 * each work, the two things that decide whether it needs attention — what the
 * document will call it, and what is still missing from it — and nothing else.
 *
 * The editor takes over this same tab rather than opening over it. A modal
 * would have to be dismissed to see the list, and a work is edited for ten
 * minutes at a time, which is not what a modal is for.
 */

import { h, clear, announce } from '../../../src/core/dom.js';
import * as store from '../core/store.js';
import { emptyWork, gapsInWork } from '../data/schema.js';
import { factsFor } from '../engine/write.js';
import { renderEditor } from './editor.js';

export function renderWorks(root, opts) {
  const o = opts || {};
  const view = h('section');
  root.appendChild(view);
  let editor = null;

  function closeEditor() {
    if (editor && editor.release) editor.release();
    editor = null;
  }

  function openEditor(id) {
    store.setUi({ editing: id });
    draw();
  }

  function draw() {
    closeEditor();
    clear(view);
    const st = store.get();

    if (st.ui.editing && store.workById(st.ui.editing)) {
      editor = renderEditor(view, st.ui.editing, {
        onClose: () => { store.setUi({ editing: null }); draw(); },
      });
      return;
    }

    view.appendChild(h('div.toolbar', [
      h('button.btn.primary', {
        onclick: () => {
          const w = store.addWork(emptyWork());
          announce('נוספה עבודה');
          openEditor(w.id);
        },
      }, '+ עבודה חדשה'),
    ]));

    if (!st.works.length) {
      view.appendChild(h('p.empty', 'עוד אין כאן עבודות. הראשונה היא בדרך כלל הכי קשה להתחיל ולוקחת חמש דקות.'));
      return;
    }

    const list = h('div.list');
    st.works.forEach((w, i) => list.appendChild(row(w, i, st.works.length)));
    view.appendChild(list);

    view.appendChild(h('div.toolbar', [
      h('button.btn', { onclick: () => o.onDone && o.onDone() }, 'לקובץ ←'),
    ]));
  }

  function row(work, i, total) {
    const gaps = gapsInWork(work);
    const facts = factsFor(work).map((f) => f.value).join(' · ');
    return h('div.workrow', [
      h('div.workmain', [
        h('button.namebtn', { onclick: () => openEditor(work.id) }, work.title || 'עבודה בלי שם'),
        h('p.facts', facts),
        gaps.length
          ? h('p.gapline', 'חסר: ' + gaps.map((g) => g.label).join(', '))
          : h('p.gapline.ok', 'מלאה'),
      ]),
      h('div.workacts', [
        h('button.iconbtn', {
          'aria-label': 'העלאה למעלה ברשימה',
          disabled: i === 0 ? true : null,
          onclick: () => { store.moveWork(work.id, -1); draw(); },
        }, '↑'),
        h('button.iconbtn', {
          'aria-label': 'הורדה למטה ברשימה',
          disabled: i === total - 1 ? true : null,
          onclick: () => { store.moveWork(work.id, 1); draw(); },
        }, '↓'),
        h('button.btn', { onclick: () => openEditor(work.id) }, 'עריכה'),
      ]),
    ]);
  }

  draw();
  return { redraw: draw, release: closeEditor };
}
