/*
 * file.js — the tab where the portfolio becomes a file.
 *
 * The preview is not a rendering of the portfolio; it is the exported document
 * itself, in a frame. Whatever is on this screen is byte for byte what the
 * download button writes to disk, because a preview built by a second code path
 * is a preview that can be right while the file is wrong — and the file is the
 * thing somebody sends to an employer.
 *
 * The frame is sandboxed with no permissions at all. The document has no script
 * in it to run, and saying so in the markup means the browser enforces it
 * rather than this app promising it.
 */

import { h, clear, modal, announce } from '../../../src/core/dom.js';
import * as store from '../core/store.js';
import { countPhrase } from '../engine/write.js';
import { toHtml } from '../export/html.js';
import { toMarkdown } from '../export/markdown.js';
import { fileNameFor } from '../export/document.js';
import { downloadText, printHtml } from '../export/download.js';

export function renderFile(root) {
  const view = h('section');
  root.appendChild(view);
  const notice = h('div');

  function draw() {
    clear(view);
    view.appendChild(notice);

    const st = store.get();
    const now = new Date();
    const html = toHtml(st, { now });
    const bytes = new Blob([html]).size;
    const named = fileNameFor(st.owner.name, 'html', now);

    if (!st.works.length) {
      view.appendChild(h('div.warnbox', 'אין עדיין עבודות, אז הקובץ יצא כמעט ריק. אפשר להוריד אותו בכל מקרה.'));
    }
    if (!st.owner.name) {
      view.appendChild(h('div.warnbox', 'אין שם בלשונית "פרטים", אז בראש הקובץ לא יופיע שם.'));
    }

    view.appendChild(h('div.filecard', [
      h('div.filemeta', [
        h('b', named),
        h('span.fact', formatSize(bytes)),
        h('span.fact', countLabel(st.works.length)),
      ]),
      h('div.toolbar', [
        h('button.btn.primary', {
          onclick: () => {
            downloadText(named, html, 'text/html');
            announce('הקובץ ירד');
          },
        }, 'הורדת הקובץ'),
        h('button.btn', { onclick: () => printHtml(html) }, 'הדפסה / PDF'),
        h('button.btn', {
          onclick: () => {
            downloadText(fileNameFor(st.owner.name, 'md', now), toMarkdown(st, { now }), 'text/markdown');
            announce('הטקסט ירד');
          },
        }, 'הורדת טקסט (Markdown)'),
      ]),
      h('p.help', 'הקובץ עומד בפני עצמו: העיצוב והתמונות בתוכו, והוא נפתח בלי אינטרנט ובלי האפליקציה הזאת. '
        + '"הדפסה / PDF" פותחת את חלון ההדפסה של הדפדפן — משם בוחרים "שמירה כ-PDF".'),
    ]));

    const frame = h('iframe.preview', {
      title: 'תצוגה מקדימה של הקובץ',
      sandbox: '',
      loading: 'lazy',
    });
    view.appendChild(frame);
    /* Set as a property, not an attribute: the document contains quotes and
     * newlines, and `srcdoc="…"` would need it escaped a second time. */
    frame.srcdoc = html;

    view.appendChild(h('div.rule'));

    view.appendChild(h('div.filecard', [
      h('h3', 'גיבוי'),
      h('p.help', 'הקובץ שלמעלה מיועד לקריאה. הגיבוי הוא כדי לחזור ולערוך — במכשיר אחר, או אחרי שהדפדפן ניקה את הזיכרון.'),
      h('div.toolbar', [
        h('button.btn', {
          onclick: () => {
            downloadText(fileNameFor(st.owner.name, 'json', new Date()), store.exportJson(), 'application/json');
            announce('הגיבוי ירד');
          },
        }, 'הורדת גיבוי'),
        h('label.btn.ghost', { class: 'filebtn' }, [
          'שחזור מגיבוי',
          h('input', {
            type: 'file',
            accept: 'application/json,.json',
            onchange: (e) => restore(e.target),
          }),
        ]),
        h('button.btn.danger', { onclick: confirmReset }, 'מחיקת הכל'),
      ]),
    ]));
  }

  function restore(input) {
    const file = (input.files || [])[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      clear(notice);
      try {
        store.importJson(String(reader.result));
        announce('הגיבוי נטען');
        notice.appendChild(h('div.callout.good', 'הגיבוי נטען.'));
      } catch (e) {
        console.error(e);
        notice.appendChild(h('div.warnbox.hot', String(e && e.message ? e.message : e)));
      }
      input.value = '';
      draw();
    };
    reader.onerror = () => {
      clear(notice);
      notice.appendChild(h('div.warnbox.hot', 'לא הצלחתי לקרוא את הקובץ.'));
      input.value = '';
    };
    reader.readAsText(file);
  }

  /*
   * Deleting everything is two taps, and the second one names what is about to
   * go. The offer to download a backup first is in the same box because that is
   * the moment it is worth anything.
   */
  function confirmReset() {
    const st = store.get();
    const close = modal(h('div', [
      h('h3', 'למחוק את הכל?'),
      h('p.lead', 'זה מוחק ' + countLabel(st.works.length) + ' ואת הפרטים, מהמכשיר הזה, בלי לשאול שוב.'),
      h('div.modal-actions', [
        h('button.btn', {
          onclick: () => downloadText(fileNameFor(st.owner.name, 'json', new Date()), store.exportJson(), 'application/json'),
        }, 'קודם גיבוי'),
        h('button.btn.danger', {
          onclick: () => {
            store.reset();
            close();
            announce('הכל נמחק');
            draw();
          },
        }, 'כן, למחוק'),
        h('button.btn.ghost', { onclick: () => close() }, 'ביטול'),
      ]),
    ]), { label: 'אישור מחיקה' });
  }

  draw();
  return { redraw: draw };
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' בייט';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (Math.round(bytes / 1024 / 102.4) / 10) + ' MB';
}

/* The numerals decline, and write.js already knows how — see countPhrase. */
function countLabel(n) {
  return n === 0 ? 'אפס עבודות' : countPhrase(n, 'עבודה', 'עבודות', 'f');
}
