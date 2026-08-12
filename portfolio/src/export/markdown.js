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
 */

import { buildDocument } from './document.js';

const BLOCK_START = /^(\s*)([#>|]|[-*+]\s|\d+[.)]\s)/;

function block(text) {
  return String(text || '')
    .split('\n')
    .map((line) => (BLOCK_START.test(line) ? line.replace(BLOCK_START, '$1\\$2') : line))
    .join('\n');
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
        .map((l) => '[' + inline(l.label || l.url) + '](' + l.url + ')').join(' · '));
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
