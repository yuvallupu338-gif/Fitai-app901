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
import { toPdf } from '../export/pdf.js';
import { preparePdfImages } from '../export/pdfimages.js';
import { downloadText, downloadBytes, printHtml } from '../export/download.js';
import { paintSaveError } from './savewarn.js';

export function renderFile(root) {
  const view = h('section');
  root.appendChild(view);
  const notice = h('div');
  const pdfNote = h('p.help');
  let busy = false;

  /*
   * The PDF is written by this app, not by the print dialog.
   *
   * It is the same document — `export/pdf.js` lays out the model the HTML
   * exporter lays out — with a Hebrew font embedded in the file, so the text in
   * it is text: searchable, selectable, and readable by the software that reads
   * a CV before a person does. Rasterising the page would have been a tenth of
   * the code and would have produced a picture of a portfolio.
   *
   * The pictures are the one asynchronous part, because decoding and
   * re-encoding them needs a canvas, so the button says what it is doing rather
   * than appearing to have done nothing.
   */
  async function downloadPdf(st, now) {
    if (busy) return;
    busy = true;
    clear(pdfNote);
    pdfNote.appendChild(h('b', 'בונה את ה-PDF…'));
    announce('בונה את הקובץ');
    try {
      const images = await preparePdfImages(st);
      const bytes = toPdf(st, { now, images });
      downloadBytes(fileNameFor(st.owner.name, 'pdf', now), bytes, 'application/pdf');
      clear(pdfNote);
      pdfNote.appendChild(h('b', 'ה-PDF ירד. '));
      pdfNote.appendChild(document.createTextNode(
        'הטקסט בתוכו הוא טקסט — אפשר לחפש בו ולהעתיק ממנו, וגם מערכת שסורקת קורות חיים יודעת לקרוא אותו.'));
      announce('ה-PDF ירד');
    } catch (e) {
      console.error(e);
      clear(pdfNote);
      pdfNote.appendChild(h('b', 'לא הצלחתי לבנות את ה-PDF. '));
      pdfNote.appendChild(document.createTextNode(
        'אפשר להוריד את קובץ ה-HTML ולהדפיס אותו מהדפדפן — בחלון ההדפסה בוחרים "שמירה כ-PDF".'));
    } finally {
      busy = false;
    }
  }

  /* The browser's own route to a PDF, kept because its rendering is the one the
   * person is looking at, and because a print dialog is also how somebody
   * prints on paper. */
  function print(html) {
    clear(pdfNote);
    pdfNote.appendChild(document.createTextNode(
      'נפתח חלון הדפסה. אם רוצים משם PDF — ביעד ההדפסה בוחרים "שמירה כ-PDF".'));
    announce('נפתח חלון הדפסה');
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
        h('button.btn', { onclick: () => downloadPdf(st, now) }, 'הורדה כ-PDF'),
        h('button.btn.ghost', { onclick: () => print(html) }, 'הדפסה'),
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
