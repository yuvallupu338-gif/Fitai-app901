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
import { buildDocument, fileNameFor } from '../export/document.js';
import { downloadText, printHtml } from '../export/download.js';
import { paintSaveError } from './savewarn.js';

export function renderFile(root) {
  const view = h('section');
  root.appendChild(view);
  const notice = h('div');
  const pdfNote = h('p.help');

  /*
   * "הורדה כ-PDF" goes through the browser's print dialog, and that is not a
   * shortcut — it is the only way a page with no server and no libraries writes
   * a PDF at all. A PDF written by hand here would have to carry an embedded
   * Hebrew font and do the right-to-left shaping itself, which is a large
   * amount of code to arrive at a worse file: what the print dialog produces
   * has real text in it, so the document is searchable, selectable and
   * copy-pastable, and an employer's ATS can read it.
   *
   * What the button owes the person is the one instruction that is not obvious:
   * the dialog's destination has to be set to "Save as PDF" rather than a
   * printer. It is written on the screen before the dialog opens, because a
   * modal dialog is exactly when nobody reads the page behind it.
   */
  function toPdf(html) {
    clear(pdfNote);
    pdfNote.appendChild(h('b', 'נפתח חלון הדפסה. '));
    pdfNote.appendChild(document.createTextNode(
      'ביעד ההדפסה בוחרים "שמירה כ-PDF" (Save as PDF) ואז "שמירה". זה הקובץ עצמו, '
      + 'עם טקסט אמיתי שאפשר לחפש ולהעתיק — לא צילום מסך שלו.'));
    announce('נפתח חלון הדפסה. בחרו שמירה כ-PDF.');
    printHtml(html);
  }

  function draw() {
    clear(view);
    view.appendChild(notice);

    const st = store.get();
    const now = new Date();
    const html = toHtml(st, { now });
    const bytes = new Blob([html]).size;
    const named = fileNameFor(st.owner.name, 'html', now);
    /*
     * Counted off the document rather than the store, because they disagree: a
     * work with no name is dropped on the way into the file. Saying "עבודה אחת"
     * on the card above a preview that says the portfolio is empty is the app
     * contradicting itself in the space of one screen.
     */
    const inFile = buildDocument(st, { now }).works.length;

    if (!inFile) {
      view.appendChild(h('div.warnbox', 'אין עדיין עבודות בקובץ, אז הוא יצא כמעט ריק. אפשר להוריד אותו בכל מקרה.'));
    }
    if (inFile < st.works.length) {
      view.appendChild(h('div.warnbox', countLabel(st.works.length - inFile)
        + ' בלי שם, אז הן לא נכנסות לקובץ. שם העבודה הוא מה שהופך אותה לפרק במסמך.'));
    }
    if (!st.owner.name) {
      view.appendChild(h('div.warnbox', 'אין שם בלשונית "פרטים", אז בראש הקובץ לא יופיע שם.'));
    }

    view.appendChild(h('div.filecard', [
      h('div.filemeta', [
        h('b', named),
        /* A number and a Latin unit with a space between them resolve to the
         * paragraph's direction, which prints "KB 245". */
        h('span.fact', { dir: 'ltr' }, formatSize(bytes)),
        h('span.fact', countLabel(inFile)),
      ]),
      h('div.toolbar', [
        h('button.btn.primary', {
          onclick: () => {
            downloadText(named, html, 'text/html');
            announce('הקובץ ירד');
          },
        }, 'הורדת הקובץ'),
        h('button.btn', { onclick: () => toPdf(html) }, 'הורדה כ-PDF'),
        h('button.btn', {
          onclick: () => {
            downloadText(fileNameFor(st.owner.name, 'md', now), toMarkdown(st, { now }), 'text/markdown');
            announce('הטקסט ירד');
          },
        }, 'הורדת טקסט (Markdown)'),
      ]),
      h('p.help', 'הקובץ עומד בפני עצמו: העיצוב והתמונות בתוכו, והוא נפתח בלי אינטרנט ובלי האפליקציה הזאת.'),
      pdfNote,
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
        /*
         * "It did not throw" is not "it was saved". importJson writes and
         * discards whether the write worked, so a restore onto a full device
         * used to report success, redraw the preview from memory to prove it,
         * and then be gone on the next reload.
         */
        if (paintSaveError(notice, store.saveError())) {
          announce('הגיבוי נטען אבל לא נשמר');
        } else {
          announce('הגיבוי נטען');
          notice.appendChild(h('div.callout.good', 'הגיבוי נטען.'));
        }
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
      h('p.lead', st.works.length
        ? 'זה מוחק ' + countLabel(st.works.length) + ' ואת הפרטים, מהמכשיר הזה, בלי לשאול שוב.'
        : 'זה מוחק את הפרטים מהמכשיר הזה, בלי לשאול שוב.'),
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

/* The numerals decline, and write.js already knows how — see countPhrase.
 * Nothing is counted as "אפס עבודות", which is arithmetic rather than Hebrew. */
function countLabel(n) {
  return n === 0 ? 'אין עבודות' : countPhrase(n, 'עבודה', 'עבודות', 'f');
}
