/*
 * bidi.js — putting a Hebrew line in the order it is drawn.
 *
 * A PDF has no idea what direction anything is. It draws glyphs left to right
 * from a point, and that is the whole model — which means the reordering a
 * browser does for `dir="rtl"` has to happen here, before anything is drawn.
 * Get it wrong and the file looks like a portfolio in a mirror.
 *
 * This is the Unicode bidirectional algorithm with its middle taken out. The
 * real one resolves twenty-odd character classes through five phases; this
 * resolves four classes through two, because the text it gets is Hebrew prose
 * with Latin words, numbers and punctuation in it, and every rule it drops is
 * one about a case that cannot occur here — explicit embedding controls (which
 * `schema.js` strips on the way in), paragraph direction detection (this app is
 * Hebrew, the base direction is a constant), and Arabic shaping (a different
 * script, and one this would be wrong for).
 *
 * What it does implement is the part that shows: a Latin or numeric run inside
 * Hebrew stays left to right and sits in the right place, punctuation between
 * two runs of the same direction goes with them, punctuation between runs that
 * disagree goes with the paragraph, and brackets are mirrored — "(2024)" opens
 * on the side a Hebrew reader opens it.
 *
 * The order it produces is checked against a browser rather than against a
 * reading of the specification: `tools/portfolio-smoke.mjs` lays each of these
 * lines out in Chromium, measures where every character landed, and asserts
 * this file put them in the same order. A bidi implementation that agrees with
 * the thing everybody's text is read in is worth more than one that agrees with
 * my reading of Annex #9.
 *
 * Mirroring happens at the glyph, not at the character — the character stays
 * where the browser puts it and is drawn with its mirror image, which is what
 * the standard says and what keeps the order identical. The cost is one small
 * known imperfection: copying a bracket out of an RTL line of the PDF gives its
 * mirror, because the file has no way to say "this glyph, that character".
 *
 * Hebrew has no cursive joining, so there is no shaping step at all: a glyph is
 * the same glyph wherever it stands in the word. That is the single reason this
 * file is a hundred lines rather than a project.
 */

/* The three classes worth telling apart, and everything else. */
const RTL = /[֐-׿יִ-ﭏ]/;
const LTR = /[A-Za-zÀ-ɏͰ-֏Ⱡ-Ɀ]/;
const NUM = /[0-9°]/;

/* Only the pairs that turn up in this document. A mirrored character is drawn
 * as its partner in a right-to-left run — otherwise "(שנתיים)" comes out with
 * the brackets pointing the wrong way, which reads as a typo. */
export const MIRROR = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
  '<': '>', '>': '<', '«': '»', '»': '«', '‹': '›', '›': '‹',
};

export function classOf(ch) {
  if (RTL.test(ch)) return 'R';
  if (NUM.test(ch)) return 'N';
  if (LTR.test(ch)) return 'L';
  return '-';
}

/**
 * Splits a line into the runs to draw, in the order to draw them — left to
 * right on the page.
 *
 * Each run comes back with its text already in drawing order: a right-to-left
 * run is reversed and mirrored here, so the caller has nothing left to decide
 * and simply emits glyphs one after another.
 */
export function visualRuns(line, baseRtl) {
  const chars = Array.from(String(line === null || line === undefined ? '' : line));
  if (!chars.length) return [];
  const base = baseRtl === false ? 2 : 1;

  /*
   * Level 1 is the right-to-left flow, level 2 is a left-to-right island inside
   * it. Numbers are islands too — "3 עבודות" is read with the 3 on the left of
   * the noun, not reversed into something else.
   */
  const levels = chars.map((ch) => {
    const c = classOf(ch);
    if (c === 'R') return 1;
    if (c === 'L' || c === 'N') return 2;
    return 0; /* undecided, resolved below */
  });

  /* Neutrals take the level of what surrounds them when both sides agree, and
   * the paragraph's otherwise. This is the rule that keeps a comma between two
   * Latin words inside the Latin island, and the space before a Hebrew word
   * outside it. */
  for (let i = 0; i < levels.length; i += 1) {
    if (levels[i] !== 0) continue;
    let j = i;
    while (j < levels.length && levels[j] === 0) j += 1;
    const before = i > 0 ? levels[i - 1] : 0;
    const after = j < levels.length ? levels[j] : 0;
    const resolved = before && before === after ? before : base;
    for (let k = i; k < j; k += 1) levels[k] = resolved;
    i = j - 1;
  }

  /* Runs of one level. */
  const runs = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i += 1) {
    if (i === chars.length || levels[i] !== levels[start]) {
      runs.push({ level: levels[start], text: chars.slice(start, i).join('') });
      start = i;
    }
  }

  /* Trailing spaces of a line belong to the margin, not to the text — a line
   * that ends in a space would otherwise start with one. */
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, '');

  const ordered = base === 1 ? runs.slice().reverse() : runs;
  return ordered
    .filter((r) => r.text.length)
    .map((r) => ({
      rtl: r.level === 1,
      text: r.level === 1 ? Array.from(r.text).reverse().join('') : r.text,
    }));
}

/** The glyph to draw for a character in a run of this direction. */
export function drawnChar(ch, rtl) {
  return rtl && MIRROR[ch] ? MIRROR[ch] : ch;
}

/**
 * The width of a string in points, at a size, for a parsed font.
 *
 * Measured in the font's own units and scaled once at the end, which keeps the
 * rounding in one place — measuring per character and summing points is how a
 * line ends up a pixel wider than the box it was measured for.
 */
export function widthOf(text, font, size) {
  let units = 0;
  for (const ch of String(text)) units += font.advance(font.gidFor(ch.codePointAt(0)));
  return (units * size) / font.unitsPerEm;
}

/**
 * Breaks a paragraph into lines that fit a width.
 *
 * Words are kept whole; a single word longer than the line is cut, because the
 * alternative is a line that runs off the page. Breaking happens on the logical
 * text, before any reordering — a line is what gets reordered, and reordering
 * first would break words across directions.
 */
export function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text === null || text === undefined ? '' : text).split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (widthOf(candidate, font, size) <= maxWidth || !line) {
        if (widthOf(candidate, font, size) > maxWidth && !line) {
          /* One word, too long for the line: cut it where it stops fitting. */
          let cut = '';
          for (const ch of word) {
            if (widthOf(cut + ch, font, size) > maxWidth && cut) {
              lines.push(cut);
              cut = ch;
            } else {
              cut += ch;
            }
          }
          line = cut;
          continue;
        }
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
