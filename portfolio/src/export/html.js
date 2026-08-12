/*
 * html.js — the file itself.
 *
 * This is the artefact the whole app exists to produce: one HTML document with
 * the styling inside it and the photographs inside it, which opens off a USB
 * stick, an email attachment or a phone's downloads folder, with no server, no
 * network and no fonts to fetch. Somebody's portfolio should not stop working
 * because a CDN did.
 *
 * Three rules hold it together, and each of them is a thing that could go wrong
 * in a document a person sends to an employer.
 *
 * It carries no script. Not a handler, not an inline `onclick`, nothing — so
 * the receiver's browser has nothing to run, and the "do you want to allow
 * blocked content" bar that makes a document look broken never appears.
 *
 * Every value that came from a human is escaped on the way in. The five
 * characters below are the whole of it, applied by one function that everything
 * goes through, because a second escaper is how one of them ends up missing a
 * case.
 *
 * It prints. Not as an afterthought: a portfolio is asked for as a PDF at least
 * as often as it is opened in a browser, and Ctrl+P on this file is the whole
 * PDF pipeline — which is why the palette is ink on white rather than the app's
 * own dark chrome, and why headings are told not to end a page alone.
 */

import { buildDocument } from './document.js';
import { attachPrefix } from '../engine/write.js';

/** The five characters that can end an attribute or open a tag. */
export function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
 * The anchor is the work's position, not its id.
 *
 * Rebuilding it out of the id's legal characters looked safer and was worse:
 * `\w` is ASCII-only, so ids that are Hebrew — which a hand-edited backup may
 * well carry, and backups are documented as text files people edit — all
 * collapsed to the same `work-x`. Three articles then shared one id and every
 * line of the contents list jumped to the first work. A position cannot
 * collide, and it is the number the Markdown already prints beside the title.
 */
function anchorAt(index) {
  return 'work-' + (index + 1);
}

const CSS = `
:root {
  color-scheme: light;
  --ink: #182231;
  --soft: #56647b;
  --line: #e3e8f0;
  --wash: #f7f9fc;
  --accent: #9c5a10;
  --accent-wash: #fdf4e6;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: #fff;
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.75;
}
img { max-width: 100%; }
a { color: var(--accent); }
.page { max-width: 780px; margin: 0 auto; padding: 52px 24px 72px; }

header h1 { font-size: clamp(28px, 6vw, 40px); line-height: 1.15; font-weight: 700; letter-spacing: -.01em; }
.headline { margin-top: 8px; font-size: 18px; color: var(--soft); }
.contacts { margin-top: 14px; font-size: 14px; color: var(--soft); }
.contacts span + span::before { content: "·"; margin: 0 8px; color: var(--line); }
.about { margin-top: 24px; }
.about p + p { margin-top: 10px; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 18px; }
.chip {
  border: 1px solid var(--line); background: var(--wash); border-radius: 999px;
  padding: 3px 12px; font-size: 13px; color: var(--soft);
}

.toc { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 20px; }
.toc h2 { font-size: 13px; letter-spacing: .08em; color: var(--soft); font-weight: 700; }
.toc ol { margin-top: 10px; padding-inline-start: 20px; }
.toc li { margin-top: 6px; }
.toc a { text-decoration: none; font-weight: 600; }
.toc .lead { display: block; font-size: 13.5px; color: var(--soft); }

.work { margin-top: 44px; border-top: 1px solid var(--line); padding-top: 26px; }
.work h2 { font-size: clamp(22px, 4.4vw, 27px); line-height: 1.25; font-weight: 700; }
.facts { margin-top: 8px; font-size: 13px; color: var(--soft); }
.facts span + span::before { content: "·"; margin: 0 8px; color: var(--line); }
.opening { margin-top: 14px; font-size: 17px; }
.sec { margin-top: 18px; }
.sec h3 {
  font-size: 12.5px; letter-spacing: .07em; font-weight: 700;
  color: var(--accent); text-transform: none;
}
.sec p { margin-top: 4px; white-space: pre-line; }
.sec ul { margin-top: 6px; padding-inline-start: 20px; }
.sec li { margin-top: 3px; }

.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 20px; }
.shots figure { margin: 0; }
.shots img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; display: block; }
.shots figcaption { margin-top: 6px; font-size: 13px; color: var(--soft); }

.links { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.links a {
  border: 1px solid var(--accent-wash); background: var(--accent-wash);
  border-radius: 8px; padding: 5px 12px; font-size: 14px; text-decoration: none;
  /* An address is Latin text in a right-to-left paragraph. Left to the
     paragraph it is laid out from the wrong end, and a label that IS the
     address — or a printed "(https://…)" — then shows a hostname the link does
     not go to. Isolated, it reads as itself. */
  direction: ltr; unicode-bidi: isolate;
}
footer { margin-top: 52px; border-top: 1px solid var(--line); padding-top: 14px; font-size: 13px; color: var(--soft); }

@media print {
  @page { margin: 16mm; }
  .page { max-width: none; padding: 0; }
  a { color: inherit; }
  /* A heading that lands at the foot of a page has orphaned its own section. */
  h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
  figure, .facts, .toc, .chips { break-inside: avoid; page-break-inside: avoid; }
  .work { margin-top: 30px; }
  /* On paper a link is only its text, so the address has to be printed too —
     but only for the web ones. safeUrl allows three schemes here, and the other
     two are addresses a reader acts on rather than copies: printing
     "(tel:0521234567)" after a phone number is noise on a page nobody clicks. */
  .links a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 11px; color: #666; word-break: break-all;
  }
}
`;

/**
 * The document, as one string.
 *
 * `opts` is handed straight to `buildDocument` — see the note there about the
 * clock being an argument rather than a global.
 */
export function toHtml(portfolio, opts) {
  const doc = buildDocument(portfolio, opts);
  const out = [];

  out.push('<!DOCTYPE html>');
  out.push('<html lang="he" dir="rtl">');
  out.push('<head>');
  out.push('<meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  out.push('<meta name="color-scheme" content="light">');
  out.push('<title>' + esc(doc.title) + '</title>');
  if (doc.headline) out.push('<meta name="description" content="' + esc(doc.headline) + '">');
  out.push('<style>' + CSS + '</style>');
  out.push('</head>');
  out.push('<body>');
  out.push('<div class="page">');

  out.push('<header>');
  out.push('<h1>' + esc(doc.name || 'תיק עבודות') + '</h1>');
  if (doc.headline) out.push('<p class="headline">' + esc(doc.headline) + '</p>');
  if (doc.contacts.length) {
    out.push('<p class="contacts">' + doc.contacts.map(contactHtml).join('') + '</p>');
  }
  out.push('</header>');

  if (doc.about.length) {
    out.push('<div class="about">' + doc.about.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>');
  }
  if (doc.skills.length) out.push(chipsHtml(doc.skills));

  if (doc.contents.length) {
    out.push('<nav class="toc">');
    out.push('<h2>מה יש כאן</h2>');
    out.push('<ol>');
    doc.contents.forEach((c, i) => {
      out.push('<li><a href="#' + esc(anchorAt(i)) + '">' + esc(c.title) + '</a>'
        + (c.lead ? '<span class="lead">' + esc(c.lead) + '</span>' : '') + '</li>');
    });
    out.push('</ol>');
    out.push('</nav>');
  }

  out.push('<main>');
  doc.works.forEach((w, i) => out.push(workHtml(w, i)));
  out.push('</main>');

  if (doc.generatedOn) {
    out.push('<footer>עודכן ' + esc(attachPrefix('ב', doc.generatedOn)) + '</footer>');
  }

  out.push('</div>');
  out.push('</body>');
  out.push('</html>');
  return out.join('\n');
}

/*
 * Each contact is wrapped in a `bdi`, and a phone number is the reason.
 *
 * "052-123-4567" survives an RTL paragraph because a hyphen keeps the digits in
 * one run. A space does not: "052 123 4567" resolves to the paragraph's own
 * direction and is laid out right to left, so the reader is shown "4567 123
 * 052" — a wrong phone number, in a document sent to an employer. `bdi` isolates
 * each value and picks its own direction, which is LTR for an address or a
 * number and RTL for "תל אביב", so one wrapper covers all four kinds.
 */
function contactHtml(c) {
  const body = '<bdi>' + esc(c.text) + '</bdi>';
  if (!c.url) return '<span>' + body + '</span>';
  return '<span><a href="' + esc(c.url) + '">' + body + '</a></span>';
}

function chipsHtml(items) {
  return '<div class="chips">' + items.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>';
}

function workHtml(w, index) {
  const out = [];
  out.push('<article class="work" id="' + esc(anchorAt(index)) + '">');
  out.push('<h2>' + esc(w.title) + '</h2>');
  if (w.facts.length) {
    out.push('<p class="facts">' + w.facts.map((f) => '<span>' + esc(f.value) + '</span>').join('') + '</p>');
  }
  if (w.opening.length) out.push('<p class="opening">' + esc(w.opening.join(' ')) + '</p>');

  for (const s of w.sections) {
    out.push('<section class="sec">');
    out.push('<h3>' + esc(s.label) + '</h3>');
    if (s.type === 'list') {
      out.push('<ul>' + s.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>');
    } else {
      out.push('<p>' + esc(s.text) + '</p>');
    }
    out.push('</section>');
  }

  if (w.tools.length) out.push(chipsHtml(w.tools));

  if (w.images.length) {
    out.push('<div class="shots">');
    for (const img of w.images) {
      out.push('<figure><img src="' + esc(img.src) + '" alt="' + esc(img.caption || w.title) + '">'
        + (img.caption ? '<figcaption>' + esc(img.caption) + '</figcaption>' : '')
        + '</figure>');
    }
    out.push('</div>');
  }

  if (w.links.length) {
    out.push('<p class="links">' + w.links.map((l) => '<a href="' + esc(l.url)
      + '" target="_blank" rel="noopener noreferrer">' + esc(l.label || l.url) + '</a>').join('') + '</p>');
  }

  out.push('</article>');
  return out.join('\n');
}
