/*
 * markdown.js — the same document as plain text.
 *
 * The HTML file is what you send. This is what you paste: into a CV, a LinkedIn
 * "about", a README, an email to somebody who asked what you have been working
 * on. It exists because the moment a portfolio is only a rendered page, every
 * one of those turns into retyping.
 *
 * The photographs do not come. A base64 image in a Markdown file is a screenful
 * of noise wherever it is opened and a broken picture wherever it is pasted, so
 * the captions are listed and the file says where the pictures are.
 *
 * User text is not escaped inline, and that is a decision rather than an
 * oversight: this is a text format, the words are the person's own, and a
 * backslash in front of every asterisk in somebody's CV is a worse outcome than
 * an accidental italic. What is escaped is the start of a line — a paragraph
 * that happens to begin with "##" or "-" would otherwise stop being a paragraph
 * and start being a heading, which changes the shape of the document rather
 * than the look of a word.
 *
 * Two exceptions, and both are the same mistake found twice: an accidental
 * italic is cosmetic, and these are not.
 *
 * A bare "<" is escaped, because most Markdown renderers pass raw HTML through
 * to their output. Leaving it alone would mean the .md carries a promise the
 * .html does not — that a "<script>" somebody typed is text — and breaks it
 * quietly, in whatever the file is rendered by later.
 *
 * A link label is escaped harder than any other text, because it sits inside
 * "[…](…)" where a "]" ends the label and the next "(" opens a destination.
 * A label of "לאתר](javascript:alert(1))[x" therefore ships a working
 * javascript: link out of a file whose URLs were all checked — the allowlist in
 * schema.js is the whole security model for links, and this was the way around
 * it. The destination is written inside angle brackets for the same reason:
 * safeUrl already refuses "<", ">" and spaces, so "(<url>)" cannot be closed
 * early by a stray bracket in the address.
 */

import { buildDocument } from './document.js';

/*
 * The two shapes a line can start with that would stop it being a line.
 *
 * They are escaped differently because Markdown only honours a backslash before
 * punctuation: "\-" and "\#" are the escaped characters, but "\1." is a literal
 * backslash followed by a list — the digit is not escapable, so the full stop
 * after it is the one to reach for, and "1\." is an ordinary sentence again.
 */
const BLOCK_MARK = /^(\s*)([#>|~=+*-])/;
const BLOCK_NUMBER = /^(\s*)(\d+)([.)])/;

function block(text) {
  return String(text || '')
    .replace(/</g, '\\<')
    .split('\n')
    .map((line) => {
      if (BLOCK_NUMBER.test(line)) return line.replace(BLOCK_NUMBER, '$1$2\\$3');
      if (BLOCK_MARK.test(line)) return line.replace(BLOCK_MARK, '$1\\$2');
      return line;
    })
    .join('\n');
}

/* Inside "[…]" a bracket or a backslash is structure, not text. */
function linkLabel(text) {
  return inline(String(text || '').replace(/([\\[\]])/g, '\\$1'));
}

/** One line of text, with its newlines folded — headings and list items live on one. */
function inline(text) {
  return block(String(text || '').replace(/\n+/g, ' ')).trim();
}

export function toMarkdown(portfolio, opts) {
  const doc = buildDocument(portfolio, opts);
  const out = [];

  out.push('# ' + inline(doc.name || 'תיק עבודות'));
  if (doc.headline) out.push('', '_' + inline(doc.headline) + '_');
  if (doc.contacts.length) out.push('', doc.contacts.map((c) => inline(c.text)).join(' · '));
  for (const p of doc.about) out.push('', block(p));
  if (doc.skills.length) out.push('', '**כלים:** ' + doc.skills.map(inline).join(', '));

  doc.works.forEach((w, i) => {
    out.push('', '---', '');
    out.push('## ' + (i + 1) + '. ' + inline(w.title));
    if (w.facts.length) out.push('', w.facts.map((f) => inline(f.value)).join(' · '));
    if (w.opening.length) out.push('', block(w.opening.join(' ')));

    for (const s of w.sections) {
      out.push('', '### ' + inline(s.label));
      if (s.type === 'list') {
        out.push('');
        for (const item of s.items) out.push('- ' + inline(item));
      } else {
        out.push('', block(s.text));
      }
    }

    if (w.tools.length) out.push('', '**כלים:** ' + w.tools.map(inline).join(', '));
    if (w.links.length) {
      out.push('', '**קישורים:** ' + w.links
        .map((l) => '[' + linkLabel(l.label || l.url) + '](<' + l.url + '>)').join(' · '));
    }
    if (w.images.length) {
      const captions = w.images.map((im) => inline(im.caption)).filter(Boolean);
      out.push('', '**תמונות:** ' + (captions.length ? captions.join(' · ') + ' — ' : '')
        + 'בקובץ ה-HTML.');
    }
  });

  if (doc.generatedOn) out.push('', '---', '', 'עודכן ב' + doc.generatedOn);
  out.push('');
  return out.join('\n');
}
