/*
 * pdf.js — the portfolio as a PDF the app writes itself.
 *
 * The other route to a PDF is the browser's print dialog, and it is still
 * there. This one exists because "הורדה כ-PDF" should download a PDF: no
 * dialog, no destination to choose, no chance of ending up with a printer.
 *
 * What it costs is the three modules under `src/pdf/` — a font reader, a
 * bidirectional reordering and a PDF writer — and what it buys, besides the one
 * click, is that the result is the app's own document rather than a screenshot
 * of a web page. The text is text: searchable, selectable, and readable by the
 * software that reads CVs before a person does.
 *
 * It is a pure function of the portfolio, the date and the pictures. The
 * pictures arrive already decoded because turning a stored data URL into JPEG
 * bytes is a job for a canvas, and a canvas is a browser — see `pdfimages.js`,
 * which is the only part of this path that cannot run in a checking script.
 */

import { buildDocument } from './document.js';
import { parseTtf, decodeBase64 } from '../pdf/ttf.js';
import { ASSISTANT_400, ASSISTANT_700 } from '../pdf/font.assistant.js';
import { layoutDocument } from '../pdf/layout.js';
import { buildPdf } from '../pdf/writer.js';

/**
 * Builds the file.
 *
 * @param {Object} portfolio  owner + works, as stored
 * @param {Object} [opts]     { now, images } — `images` maps an image src to its JPEG bytes
 * @returns {Uint8Array}
 */
export function toPdf(portfolio, opts) {
  const o = opts || {};
  const doc = buildDocument(portfolio, o);

  /*
   * A fresh parse per document, because the parsed font carries the map of
   * which glyphs this document used — and a font reused across two documents
   * would put the first one's glyph list in the second one's file.
   */
  const fonts = {
    regular: parseTtf(decodeBase64(ASSISTANT_400)),
    bold: parseTtf(decodeBase64(ASSISTANT_700)),
  };

  const { pages, imageList } = layoutDocument(doc, fonts, o.images || new Map());

  return buildPdf({
    title: doc.title,
    lang: 'he-IL',
    fonts: [
      { id: 'F1', name: 'Assistant', font: fonts.regular },
      { id: 'F2', name: 'Assistant-Bold', font: fonts.bold, bold: true },
    ],
    images: imageList,
    pages,
  });
}
