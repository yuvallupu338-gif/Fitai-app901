/*
 * layout.js — the document, arranged on pages.
 *
 * This is the part a browser normally does. It walks the same document model
 * the HTML exporter walks — the one `export/document.js` builds — and turns it
 * into positioned text, which is the only thing a PDF understands.
 *
 * It is deliberately the same document rather than a rendering of the HTML.
 * Rasterising the page would have been less code and would have produced a
 * picture of a portfolio: no selectable text, no search, nothing an employer's
 * software can read, and four megabytes. Laying it out again costs this file
 * and gives a document made of words.
 *
 * The measurements are the ones from the HTML, converted: 780px of content
 * becomes A4's text column, and the sizes keep their relationships rather than
 * their numbers, because a point is not a pixel and a page is not a screen.
 */

import { visualRuns, widthOf, wrap } from './bidi.js';
import { encodeGlyphs, op, readJpeg } from './writer.js';

/* A4 in points, and a margin wide enough that a printer's unprintable edge
 * never eats a line. */
const PAGE = { width: 595.28, height: 841.89, margin: 56 };

const INK = [0.094, 0.133, 0.192];
const SOFT = [0.337, 0.392, 0.482];
const ACCENT = [0.612, 0.353, 0.063];
const RULE = [0.89, 0.91, 0.94];
const WASH = [0.965, 0.973, 0.984];

const SIZE = {
  name: 25,
  headline: 12.5,
  contact: 10,
  body: 11,
  lead: 10,
  title: 17,
  facts: 9,
  label: 9,
  section: 10.5,
  chip: 9,
  caption: 9,
  foot: 8.5,
};

/**
 * Turns a document into pages of drawing operations.
 *
 * @param {Object} doc      what `buildDocument` returns
 * @param {Object} fonts    { regular, bold } — parsed by ttf.js
 * @param {Map} images      src -> JPEG bytes, prepared by the caller
 * @returns {{ pages: Array, imageList: Array }}
 */
export function layoutDocument(doc, fonts, images) {
  const painter = newPainter(fonts, images);

  /* ---- who this is ---- */

  painter.paragraph(doc.name || 'תיק עבודות', { size: SIZE.name, bold: true, gap: 4 });
  if (doc.headline) painter.paragraph(doc.headline, { size: SIZE.headline, colour: SOFT, gap: 2 });
  if (doc.contacts.length) {
    painter.paragraph(doc.contacts.map((c) => c.text).join('  ·  '), {
      size: SIZE.contact, colour: ACCENT, gap: 10,
    });
  }
  for (const p of doc.about) painter.paragraph(p, { size: SIZE.body, gap: 4 });
  if (doc.skills.length) painter.chips(doc.skills);

  /* ---- what is in here ---- */

  if (doc.contents.length) {
    painter.rule();
    painter.paragraph('מה יש כאן', { size: SIZE.label, bold: true, colour: SOFT, gap: 6 });
    doc.contents.forEach((c, i) => {
      painter.paragraph((i + 1) + '. ' + c.title, { size: SIZE.body, bold: true, colour: ACCENT, gap: 1 });
      if (c.lead) painter.paragraph(c.lead, { size: SIZE.lead, colour: SOFT, gap: 6, indent: 14 });
    });
  }

  /* ---- the works ---- */

  for (const work of doc.works) {
    painter.rule({ before: 20, after: 14, keepWith: 60 });
    painter.paragraph(work.title, { size: SIZE.title, bold: true, gap: 4, keepWith: 24 });
    if (work.facts.length) {
      painter.paragraph(work.facts.map((f) => f.value).join('  ·  '), {
        size: SIZE.facts, colour: SOFT, gap: 8,
      });
    }
    if (work.opening.length) painter.paragraph(work.opening.join(' '), { size: SIZE.body, gap: 8 });

    for (const section of work.sections) {
      painter.paragraph(section.label, { size: SIZE.label, bold: true, colour: ACCENT, gap: 3, keepWith: 20 });
      if (section.type === 'list') {
        for (const item of section.items) painter.bullet(item);
        painter.space(6);
      } else {
        painter.paragraph(section.text, { size: SIZE.section, gap: 8 });
      }
    }

    if (work.tools.length) painter.chips(work.tools);
    for (const image of work.images) painter.image(image);
    if (work.links.length) {
      painter.paragraph(work.links.map((l) => (l.label ? l.label + ' — ' + l.url : l.url)).join('   '), {
        size: SIZE.caption, colour: ACCENT, gap: 6,
      });
    }
  }

  if (doc.generatedOn) {
    painter.space(6);
    painter.paragraph('עודכן ב-' + doc.generatedOn, { size: SIZE.foot, colour: SOFT });
  }

  return painter.finish();
}

/*
 * The painter.
 *
 * It holds a cursor that only ever moves down, and every block asks for the
 * room it needs before it takes any — which is what makes a page break happen
 * between two blocks rather than through the middle of one. `keepWith` is the
 * widow rule: a heading asks for its own height plus the first line of whatever
 * follows it, so a section title can never be the last thing on a page.
 */
function newPainter(fonts, images) {
  const pages = [];
  const imageList = [];
  const seenImages = new Map();
  let ops = null;
  let y = 0;

  const right = PAGE.width - PAGE.margin;
  const left = PAGE.margin;
  const columnWidth = right - left;

  function newPage() {
    ops = [];
    pages.push({ width: PAGE.width, height: PAGE.height, ops });
    y = PAGE.height - PAGE.margin;
  }

  function need(height) {
    if (!ops) newPage();
    else if (y - height < PAGE.margin + 18) newPage();
  }

  function fontFor(bold) {
    return bold ? fonts.bold : fonts.regular;
  }

  /*
   * One line of text, placed against the right margin.
   *
   * The runs come back from `bidi.js` in drawing order, so all this does is
   * measure the whole line, start it at `right - width`, and walk left to right
   * — which is the direction a PDF draws in whatever the language is.
   */
  function line(text, style) {
    const font = fontFor(style.bold);
    const size = style.size;
    const runs = visualRuns(text);
    if (!runs.length) return;
    const width = runs.reduce((sum, run) => sum + widthOf(run.text, font, size), 0);
    const indent = style.indent || 0;
    let x = right - indent - width;
    /* A line wider than the column can only happen when a single word is wider
     * than the page; let it start at the left margin rather than off the page. */
    if (x < left) x = left;

    ops.push(op.fill(style.colour || INK));
    for (const run of runs) {
      const hex = encodeGlyphs(font, run.text, run.rtl);
      if (hex) ops.push(op.text(x, y, style.bold ? 'F2' : 'F1', size, hex));
      x += widthOf(run.text, font, size);
    }
  }

  return {
    paragraph(text, style) {
      const s = style || {};
      const size = s.size || SIZE.body;
      const font = fontFor(s.bold);
      const lines = wrap(text, font, size, columnWidth - (s.indent || 0));
      const leading = size * 1.5;
      lines.forEach((text_, i) => {
        need(leading + (i === 0 ? (s.keepWith || 0) : 0));
        y -= leading;
        line(text_, { size, bold: s.bold, colour: s.colour, indent: s.indent });
      });
      y -= s.gap === undefined ? 6 : s.gap;
    },

    /* A dot at the right margin, and the text indented past it. */
    bullet(text) {
      const size = SIZE.section;
      const font = fontFor(false);
      const indent = 14;
      const lines = wrap(text, font, size, columnWidth - indent);
      lines.forEach((text_, i) => {
        need(size * 1.5);
        y -= size * 1.5;
        if (i === 0) {
          ops.push(op.fill(SOFT));
          ops.push(op.rect(right - 5, y + size * 0.32, 2.4, 2.4));
        }
        line(text_, { size, indent });
      });
      y -= 2;
    },

    /*
     * Chips, laid out right to left and wrapped.
     *
     * They are the one place the PDF draws a shape behind text, and the reason
     * is the same as in the document on screen: a list of tools reads as a list
     * of tools, and as a sentence it reads as a sentence about tools.
     */
    chips(items) {
      const size = SIZE.chip;
      const font = fontFor(false);
      const padding = 7;
      const height = size * 1.9;
      need(height + 8);
      y -= height;
      let x = right;
      for (const item of items) {
        const width = widthOf(item, font, size) + padding * 2;
        if (x - width < left) {
          y -= height + 4;
          need(0);
          x = right;
        }
        ops.push(op.fill(WASH));
        ops.push(op.roundedRect(x - width, y, width, height, height / 2));
        const runs = visualRuns(item);
        let textX = x - width + padding;
        ops.push(op.fill(SOFT));
        for (const run of runs) {
          const hex = encodeGlyphs(font, run.text, run.rtl);
          if (hex) ops.push(op.text(textX, y + height * 0.32, 'F1', size, hex));
          textX += widthOf(run.text, font, size);
        }
        x -= width + 5;
      }
      y -= 10;
    },

    /*
     * A photograph, at the width of the column or its own, whichever is smaller.
     *
     * Nothing is re-encoded: the JPEG the app already made goes into the file as
     * it is. What is decided here is only how big it is drawn, and that it does
     * not straddle a page break.
     */
    image(picture) {
      const jpeg = images.get(picture.src);
      if (!jpeg) return;
      const parsed = readJpeg(jpeg);
      if (!parsed) return;

      let id = seenImages.get(picture.src);
      if (!id) {
        id = 'Im' + (imageList.length + 1);
        seenImages.set(picture.src, id);
        imageList.push({ id, jpeg: parsed });
      }

      const width = Math.min(columnWidth, 360);
      const height = Math.min((width * parsed.height) / parsed.width, 300);
      const drawnWidth = (height * parsed.width) / parsed.height;
      const caption = picture.caption ? SIZE.caption * 1.6 : 0;
      need(height + caption + 12);
      y -= height;
      ops.push(op.image(id, right - drawnWidth, y, drawnWidth, height));
      y -= 6;
      if (picture.caption) {
        y -= SIZE.caption * 1.4;
        line(picture.caption, { size: SIZE.caption, colour: SOFT });
      }
      y -= 8;
    },

    rule(style) {
      const s = style || {};
      y -= s.before === undefined ? 12 : s.before;
      need((s.after === undefined ? 10 : s.after) + (s.keepWith || 0));
      ops.push(op.stroke(RULE));
      ops.push(op.line(left, y, right, y, 0.7));
      y -= s.after === undefined ? 10 : s.after;
    },

    space(height) {
      y -= height;
    },

    /*
     * Page numbers, written after the fact because "of how many" is not known
     * until the last page exists. Only ever more than one page in, since "עמוד 1
     * מתוך 1" is a line about nothing.
     */
    finish() {
      if (!pages.length) newPage();
      if (pages.length > 1) {
        pages.forEach((page, i) => {
          const label = 'עמוד ' + (i + 1) + ' מתוך ' + pages.length;
          const font = fonts.regular;
          const runs = visualRuns(label);
          const width = runs.reduce((sum, run) => sum + widthOf(run.text, font, SIZE.foot), 0);
          let x = (PAGE.width - width) / 2;
          page.ops.push(op.fill(SOFT));
          for (const run of runs) {
            const hex = encodeGlyphs(font, run.text, run.rtl);
            if (hex) page.ops.push(op.text(x, PAGE.margin - 22, 'F1', SIZE.foot, hex));
            x += widthOf(run.text, font, SIZE.foot);
          }
        });
      }
      return { pages, imageList };
    },
  };
}
