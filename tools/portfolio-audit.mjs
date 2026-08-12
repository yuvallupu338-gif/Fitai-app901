#!/usr/bin/env node
/*
 * portfolio-audit.mjs — proves the portfolio app writes Hebrew that agrees with
 * itself, and that nothing a person types can put executable content into the
 * file they are about to send somebody.
 *
 * Both halves are things a browser check cannot do well. The first is grammar:
 * a screenshot of "זה אפליקציה שבניתי" looks exactly as correct as "זו
 * אפליקציה שבניתי" to anything that is not reading it, so the cases are named
 * here, one per kind of work, with the answer written out. They are written out
 * rather than derived from `schema.js` on purpose — a check that asks the same
 * table its subject asks can only ever confirm the two agree.
 *
 * The second is containment. The exported document is a file that leaves this
 * machine and is opened by a stranger from their downloads folder, where it is
 * a local file with a local file's trust. It carries no script by design, and
 * "by design" is worth exactly as much as the assertion that goes with it. So
 * every free-text field, every link and every image URL is fed the things that
 * break documents — a closing script tag, an event handler, a `javascript:`
 * URL, an SVG data URL, a bidi override — and the output is checked for what
 * came out the other side.
 *
 * What this does not cover is whether a browser agrees. `tools/portfolio-smoke.mjs`
 * opens the exported file in Chromium and asserts the same things against a
 * real DOM, which is where a mistake in the assertions below would show.
 *
 * Usage: node tools/portfolio-audit.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(resolve(ROOT, rel)).href);

const schema = await load('portfolio/src/data/schema.js');
const write = await load('portfolio/src/engine/write.js');
const doc = await load('portfolio/src/export/document.js');
const html = await load('portfolio/src/export/html.js');
const md = await load('portfolio/src/export/markdown.js');
const store = await load('portfolio/src/core/store.js');

const problems = [];
let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) problems.push(m); };

const FIXED_DATE = new Date('2026-08-12T09:00:00Z');
const AT = { now: FIXED_DATE };

const workOf = (patch) => schema.normaliseWork(Object.assign({
  title: 'עבודה', kind: 'site', context: 'client', team: 'alone',
}, patch), 0);

/* ------------------------------------------------------------------ *
 * 1. Agreement — the four words that decline
 * ------------------------------------------------------------------ */

/*
 * One line per kind, with the demonstrative and the two pronouns spelled out.
 * A new kind added to the app with the wrong gender fails here and nowhere
 * else: it renders, it reads as machine output, and no other check can tell.
 */
const AGREEMENT = [
  { kind: 'site', dem: 'זה', in: 'בו', on: 'עליו', verb: 'בניתי' },
  { kind: 'app', dem: 'זו', in: 'בה', on: 'עליה', verb: 'בניתי' },
  { kind: 'software', dem: 'זו', in: 'בה', on: 'עליה', verb: 'כתבתי' },
  { kind: 'design', dem: 'זו', in: 'בה', on: 'עליה', verb: 'עשיתי' },
  { kind: 'brand', dem: 'זה', in: 'בו', on: 'עליו', verb: 'עשיתי' },
  { kind: 'illustration', dem: 'זה', in: 'בו', on: 'עליו', verb: 'ציירתי' },
  { kind: 'photo', dem: 'זו', in: 'בה', on: 'עליה', verb: 'עשיתי' },
  { kind: 'video', dem: 'זה', in: 'בו', on: 'עליו', verb: 'עשיתי' },
  { kind: 'audio', dem: 'זו', in: 'בה', on: 'עליה', verb: 'עשיתי' },
  { kind: 'writing', dem: 'זה', in: 'בו', on: 'עליו', verb: 'כתבתי' },
  { kind: 'research', dem: 'זה', in: 'בו', on: 'עליו', verb: 'עשיתי' },
  { kind: 'product', dem: 'זה', in: 'בו', on: 'עליו', verb: 'פיתחתי' },
  { kind: 'event', dem: 'זה', in: 'בו', on: 'עליו', verb: 'הפקתי' },
  { kind: 'teaching', dem: 'זו', in: 'בה', on: 'עליה', verb: 'העברתי' },
  { kind: 'other', dem: 'זה', in: 'בו', on: 'עליו', verb: 'עשיתי' },
];

ok(AGREEMENT.length === schema.KINDS.length,
  `a kind was added or removed without a line in this check (${schema.KINDS.length} kinds, ${AGREEMENT.length} cases)`);

for (const c of AGREEMENT) {
  const w = workOf({ kind: c.kind, role: 'עיצוב', team: 'team' });
  const text = write.openingFor(w).join(' ');
  ok(text.startsWith(c.dem + ' '), `${c.kind}: opens "${text.split(' ')[0]}" where Hebrew wants "${c.dem}"`);
  ok(text.includes('ש' + c.verb), `${c.kind}: does not say "${c.verb}" — "${text}"`);
  ok(text.includes('התפקיד שלי ' + c.in + ' היה'), `${c.kind}: the role sentence disagrees — "${text}"`);
  ok(text.includes('עבדתי ' + c.on + ' '), `${c.kind}: the team sentence disagrees — "${text}"`);
  const wrong = c.dem === 'זה' ? 'זו' : 'זה';
  ok(!text.startsWith(wrong + ' '), `${c.kind}: opens with "${wrong}"`);
}

/*
 * A name left over from a context that has since been changed.
 *
 * The field disappears from the form when the work stops being for somebody,
 * and the value behind it is deliberately kept — but a client credited on
 * somebody's personal project is a false statement about a third party, in a
 * document that goes to strangers.
 */
{
  const leftover = workOf({ context: 'personal', clientName: 'מספרת רון' });
  const opening = write.openingFor(leftover).join(' ');
  ok(!opening.includes('מספרת רון'), `a stale client name reached the sentence — "${opening}"`);
  ok(write.openingFor(leftover)[0] === 'זה אתר שבניתי כפרויקט אישי.',
    `the personal-project opening reads "${write.openingFor(leftover)[0]}"`);
  const facts = write.factsFor(leftover).map((f) => f.value).join(' · ');
  ok(!facts.includes('מספרת רון'), `a stale client name reached the facts row — "${facts}"`);
  /* And the value is still there, so changing back does not cost the typing. */
  ok(schema.normaliseWork(leftover, 0).clientName === 'מספרת רון',
    'the client name was deleted rather than left alone');
  const back = write.openingFor(workOf({ context: 'client', clientName: 'מספרת רון' })).join(' ');
  ok(back.includes('ללקוח מספרת רון'), `changing back did not bring the name with it — "${back}"`);
}

/* Both the opening and the sentence that is never written when a field is blank. */
{
  const bare = write.openingFor(workOf({ kind: 'site', role: '', team: '', context: '' }));
  ok(bare.length === 1, `a work with only a kind produced ${bare.length} sentences, not one`);
  ok(bare[0] === 'זה אתר שבניתי.', `the shortest opening came out "${bare[0]}"`);
  ok(!bare.join(' ').includes('undefined'), 'a missing field reached the page as "undefined"');
}

/* ------------------------------------------------------------------ *
 * 2. Numerals, prefixes and dates
 * ------------------------------------------------------------------ */

const NUMERALS = [
  [1, 'עבודה', 'עבודות', 'f', 'עבודה אחת'],
  [2, 'עבודה', 'עבודות', 'f', 'שתי עבודות'],
  [3, 'עבודה', 'עבודות', 'f', 'שלוש עבודות'],
  [1, 'אתר', 'אתרים', 'm', 'אתר אחד'],
  [2, 'אתר', 'אתרים', 'm', 'שני אתרים'],
  [3, 'אתר', 'אתרים', 'm', 'שלושה אתרים'],
  [10, 'אתר', 'אתרים', 'm', 'עשרה אתרים'],
  [11, 'אתר', 'אתרים', 'm', '11 אתרים'],
];
for (const [n, one, many, gender, expected] of NUMERALS) {
  const got = write.countPhrase(n, one, many, gender);
  ok(got === expected, `countPhrase(${n}, ${gender}) = "${got}", expected "${expected}"`);
}

const PREFIXES = [
  ['ב', 'מרץ', 'במרץ'],
  ['ב', '2024', 'ב-2024'],
  ['ב', 'Google', 'ב-Google'],
  ['ו', 'פיתוח', 'ופיתוח'],
  ['ו', 'CSS', 'ו-CSS'],
  ['מ', 'יולי', 'מיולי'],
];
for (const [p, word, expected] of PREFIXES) {
  const got = write.attachPrefix(p, word);
  ok(got === expected, `attachPrefix('${p}', '${word}') = "${got}", expected "${expected}"`);
}

ok(write.joinHe(['עיצוב', 'פיתוח']) === 'עיצוב ופיתוח', 'two items should join with a bare ו');
ok(write.joinHe(['Figma', 'HTML', 'CSS']) === 'Figma, HTML ו-CSS', 'a Latin last item needs the maqaf');
ok(write.joinHe([]) === '', 'an empty list should produce nothing');

const PERIODS = [
  [{ fromYear: 2024, fromMonth: 3, toYear: 2024, toMonth: 5 }, 'מרץ–מאי 2024', 'בין מרץ למאי 2024'],
  [{ fromYear: 2024, fromMonth: 3, toYear: 2025, toMonth: 1 }, 'מרץ 2024 – ינואר 2025', 'בין מרץ 2024 לינואר 2025'],
  [{ fromYear: 2019, toYear: 2021 }, '2019–2021', 'בין 2019 ל-2021'],
  [{ fromYear: 2024, ongoing: true }, 'מ-2024 ועד היום', 'מ-2024 ועד היום'],
  [{ fromYear: 2024, fromMonth: 7, ongoing: true }, 'מיולי 2024 ועד היום', 'מיולי 2024 ועד היום'],
  [{ fromYear: 2024 }, '2024', 'ב-2024'],
  [{ fromYear: 2024, fromMonth: 5, toYear: 2024, toMonth: 5 }, 'מאי 2024', 'במאי 2024'],
];
for (const [raw, label, sentence] of PERIODS) {
  const p = schema.cleanPeriod(raw);
  ok(write.formatPeriod(p) === label, `formatPeriod ${JSON.stringify(raw)} = "${write.formatPeriod(p)}", expected "${label}"`);
  ok(write.periodInSentence(p) === sentence,
    `periodInSentence ${JSON.stringify(raw)} = "${write.periodInSentence(p)}", expected "${sentence}"`);
}

/* An end before its start is a typo. The repair is to drop the end, not to swap
 * the two — swapping invents a period the person never claimed. */
{
  const p = schema.cleanPeriod({ fromYear: 2024, toYear: 2019 });
  ok(p.toYear === null, 'a backwards period kept its end date');
  ok(write.formatPeriod(p) === '2024', `a backwards period formatted as "${write.formatPeriod(p)}"`);
}

ok(doc.formatHeDate(FIXED_DATE) === '12 באוגוסט 2026', `the date came out "${doc.formatHeDate(FIXED_DATE)}"`);

/* ------------------------------------------------------------------ *
 * 3. Nothing a person typed goes missing
 * ------------------------------------------------------------------ */

const FULL = {
  owner: {
    name: 'נועה בר',
    headline: 'מעצבת מוצר',
    about: 'שבע שנים בממשקים.',
    email: 'noa@example.com',
    phone: '052-1234567',
    site: 'noabar.co.il',
    location: 'חיפה',
  },
  works: [
    {
      title: 'אתר תדמית למספרה', kind: 'site', role: 'עיצוב ופיתוח', context: 'client',
      clientName: 'מספרת רון', team: 'alone',
      period: { fromYear: 2024, fromMonth: 3, toYear: 2024, toMonth: 5 },
      brief: 'למספרה לא היה שום דבר באינטרנט.',
      did: 'אפיינתי את המבנה\nעיצבתי בפיגמה\nבניתי בלי תלויות',
      constraints: 'שבועיים, בלי תקציב לצילום.',
      tools: ['Figma', 'HTML', 'CSS'],
      result: 'רוב התורים נקבעים דרך האתר.',
      learned: 'שטופס קצר עדיף על טופס נכון.',
      links: [{ label: 'לאתר', url: 'ronbarber.co.il' }],
      images: [{ src: pngPixel(), caption: 'עמוד הבית' }],
    },
    { title: 'אפליקציית מתכונים', kind: 'app', context: 'personal', team: 'team', period: { fromYear: 2023, ongoing: true }, tools: ['Figma', 'React'] },
    { title: 'מיתוג לכנס', kind: 'brand', context: 'work', clientName: 'Google', period: { fromYear: 2019, toYear: 2021 }, role: 'ניהול אמנותי' },
  ],
};

const full = schema.normalisePortfolio(FULL);
const fullHtml = html.toHtml(full, AT);
const fullMd = md.toMarkdown(full, AT);

const MUST_APPEAR = [
  'אתר תדמית למספרה', 'מספרת רון', 'למספרה לא היה שום דבר באינטרנט.',
  'אפיינתי את המבנה', 'עיצבתי בפיגמה', 'בניתי בלי תלויות',
  'שבועיים, בלי תקציב לצילום.', 'רוב התורים נקבעים דרך האתר.',
  'שטופס קצר עדיף על טופס נכון.', 'Figma', 'עמוד הבית',
  'אפליקציית מתכונים', 'מיתוג לכנס', 'נועה בר', 'מעצבת מוצר', 'חיפה',
];
for (const needle of MUST_APPEAR) {
  ok(fullHtml.includes(needle), `the file lost "${needle}"`);
  ok(fullMd.includes(needle), `the Markdown lost "${needle}"`);
}

ok(fullHtml.includes('בין מרץ למאי 2024'), 'the derived sentence is missing from the file');
ok((fullHtml.match(/<article class="work"/g) || []).length === 3,
  'the file does not have one article per work');
ok(fullHtml.includes('<nav class="toc">'), 'three works should get a contents list');
ok(!html.toHtml(schema.normalisePortfolio({ owner: FULL.owner, works: FULL.works.slice(0, 2) }), AT).includes('<nav class="toc">'),
  'two works should not get a contents list');
ok(fullHtml.includes('mailto:noa@example.com'), 'the email is not linked');
ok(fullHtml.includes('tel:0521234567'), 'the phone is not linked, or kept its dashes in the tel: URL');
ok(fullHtml.includes('https://ronbarber.co.il'), 'a bare domain was not given a scheme');
ok(fullHtml.includes('עודכן ב12 באוגוסט 2026'), 'the file is not dated');
ok(fullHtml.includes(pngPixel()), 'the photograph did not make it into the file');
ok(!fullMd.includes(pngPixel()), 'the Markdown carries base64 image data');
ok(fullMd.includes('בקובץ ה-HTML'), 'the Markdown does not say where the pictures are');

/*
 * The paragraph the app writes about the person, which is the only place it
 * says anything nobody typed. Every clause in it is arithmetic, so every clause
 * is checkable.
 */
{
  const oneWork = schema.normalisePortfolio({
    owner: { name: 'א' },
    works: [{ title: 'עבודה', kind: 'app', context: 'personal', period: { fromYear: 2024, toYear: 2024 } }],
  });
  const sentence = write.writeAbout(oneWork)[0];
  ok(sentence === 'בתיק הזה עבודה אחת מ-2024.', `one work reads "${sentence}"`);

  const spread = write.writeAbout(full)[1];
  ok(spread === 'בתיק הזה שלוש עבודות, מ-2019 ועד היום — אתר אחד, אפליקציה אחת ומיתוג אחד.',
    `three works read "${spread}"`);

  const ended = write.writeAbout(schema.normalisePortfolio({
    owner: {},
    works: [
      { title: 'א', kind: 'site', context: 'client', period: { fromYear: 2019, toYear: 2020 } },
      { title: 'ב', kind: 'site', context: 'client', period: { fromYear: 2022, toYear: 2023 } },
    ],
  }))[0];
  ok(ended === 'בתיק הזה שתי עבודות, מ-2019 עד 2023 — שני אתרים.', `two finished works read "${ended}"`);
}

/* The empty portfolio still produces a document rather than an exception. */
{
  const empty = html.toHtml(schema.normalisePortfolio({}), AT);
  ok(empty.includes('<!DOCTYPE html>'), 'an empty portfolio did not produce a document');
  ok(empty.includes('התיק הזה עדיין ריק'), 'an empty portfolio does not say so');
  ok(!empty.includes('<article'), 'an empty portfolio produced a work');
}

/* ------------------------------------------------------------------ *
 * 4. The same answers produce the same file
 * ------------------------------------------------------------------ */

ok(html.toHtml(full, AT) === fullHtml, 'the HTML export is not deterministic');
ok(md.toMarkdown(full, AT) === fullMd, 'the Markdown export is not deterministic');

/*
 * Called without a date, the exporters produce an undated document rather than
 * today's. That is what makes every assertion in this file stable, and it is
 * the one property that a comparison of two runs cannot prove on its own — two
 * calls to `new Date()` a millisecond apart agree with each other.
 */
ok(!html.toHtml(full, {}).includes('עודכן'), 'the HTML exporter read a clock of its own');
ok(!md.toMarkdown(full, {}).includes('עודכן'), 'the Markdown exporter read a clock of its own');
ok(html.toHtml(full, {}) === html.toHtml(full, {}), 'two undated exports of one portfolio differ');
ok(JSON.stringify(schema.normalisePortfolio(full)) === JSON.stringify(full),
  'normalisePortfolio is not idempotent — a saved portfolio changes every time it is loaded');
ok(JSON.stringify(write.deriveSkills(full.works)) === JSON.stringify(['Figma', 'HTML', 'CSS', 'React']),
  `skills came out ${JSON.stringify(write.deriveSkills(full.works))} — most-used first, then first seen`);

/* ------------------------------------------------------------------ *
 * 5. Containment — what a hostile answer cannot do to the file
 * ------------------------------------------------------------------ */

const RLO = String.fromCharCode(0x202e);
const LRE = String.fromCharCode(0x202a);

const NASTY = [
  '<script>alert(1)</script>',
  '"><script src="http://evil/x.js"></script>',
  "'><img src=x onerror=alert(1)>",
  '</style><style>body{display:none}</style>',
  '</title><meta http-equiv="refresh" content="0;url=http://evil">',
  '</h2><iframe src="http://evil"></iframe><h2>',
  'javascript:alert(document.domain)',
  RLO + 'gnp.exe',
  '</textarea></form>',
  '<!--</p>-->',
];

for (const nasty of NASTY) {
  const hostile = schema.normalisePortfolio({
    owner: { name: nasty, headline: nasty, about: nasty, email: nasty, phone: nasty, site: nasty, location: nasty },
    works: [{
      title: nasty, kind: 'site', role: nasty, context: 'client', clientName: nasty,
      brief: nasty, did: nasty, constraints: nasty, result: nasty, learned: nasty,
      tools: [nasty], links: [{ label: nasty, url: nasty }],
      images: [{ src: pngPixel(), caption: nasty }],
    }],
  });
  const out = html.toHtml(hostile, AT);
  const label = JSON.stringify(nasty).slice(0, 46);

  ok(!/<script/i.test(out), `${label}: a script tag reached the file`);
  ok(!/<iframe/i.test(out), `${label}: an iframe reached the file`);
  ok(!/<meta http-equiv/i.test(out), `${label}: a meta refresh reached the file`);
  ok(!out.includes(RLO) && !out.includes(LRE), `${label}: a bidi override survived into the file`);

  /*
   * Counting tags is the assertion that generalises. "No `onerror`" is not one:
   * an answer containing the word `onerror` is escaped into an alt attribute
   * and is still, correctly, the word — the question was never whether those
   * characters appear, it is whether the user's text minted an element. This
   * work has exactly one picture and is exactly one article, whatever was
   * typed into it.
   */
  ok(tagCount(out, 'img') === 1, `${label}: the file has ${tagCount(out, 'img')} img elements, not 1`);
  ok(tagCount(out, 'article') === 1, `${label}: the file has ${tagCount(out, 'article')} articles, not 1`);
  ok(tagCount(out, 'style') === 1, `${label}: a second style block reached the file`);
  ok(tagCount(out, 'h2') === 1, `${label}: the file has ${tagCount(out, 'h2')} h2 elements, not 1`);

  /* Every address in the finished document, checked against what a document is
   * allowed to point at — including the in-page anchors it writes itself. */
  for (const href of attrValues(out, 'href')) {
    ok(/^(https?:\/\/|mailto:|tel:|#work-)/.test(href), `${label}: the file links to "${href.slice(0, 40)}"`);
  }
  for (const src of attrValues(out, 'src')) {
    ok(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]*$/.test(src),
      `${label}: the file loads "${src.slice(0, 40)}"`);
  }

  /* The whole point of escaping is that the text is still there, unchanged, as
   * text. A check that only looks for what is absent would pass on a file that
   * silently dropped the field. */
  const asText = nasty.replace(RLO, '');
  if (asText) {
    ok(out.includes(html.esc(asText)), `${label}: the answer was dropped rather than escaped`);
  }
}

/* Links and images: the allowlists, one case per decision. */
const URLS = [
  ['javascript:alert(1)', ''],
  ['JaVaScRiPt:alert(1)', ''],
  [' javascript:alert(1)', ''],
  ['data:text/html;base64,PHNjcmlwdD4=', ''],
  ['vbscript:msgbox(1)', ''],
  ['file:///etc/passwd', ''],
  ['ftp://example.com/x', ''],
  ['https://example.com/x?a=1', 'https://example.com/x?a=1'],
  ['http://example.com', 'http://example.com'],
  ['mailto:a@b.co', 'mailto:a@b.co'],
  ['tel:0521234567', 'tel:0521234567'],
  ['example.com/work', 'https://example.com/work'],
  ['example.com"onmouseover="alert(1)', ''],
];
for (const [input, expected] of URLS) {
  const got = schema.safeUrl(input);
  ok(got === expected, `safeUrl(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

const IMAGES = [
  ['data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=', ''],
  ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', ''],
  ['data:image/png;base64,iVBORw0KGgo=', 'data:image/png;base64,iVBORw0KGgo='],
  ['data:image/jpeg;base64,/9j/4AA=', 'data:image/jpeg;base64,/9j/4AA='],
  ['https://example.com/photo.jpg', ''],
  ['data:image/png;base64,<script>', ''],
];
for (const [input, expected] of IMAGES) {
  const got = schema.safeImageUrl(input);
  ok(got === expected, `safeImageUrl(${JSON.stringify(input).slice(0, 48)}) = ${JSON.stringify(got).slice(0, 48)}`);
}

/* Markdown has its own way of being broken: a paragraph that starts with "##"
 * stops being a paragraph. */
{
  const tricky = schema.normalisePortfolio({
    owner: { name: 'א' },
    works: [{
      title: 'עבודה', kind: 'site', context: 'personal',
      brief: '## לא כותרת\n- לא רשימה\n> לא ציטוט\n1. לא ממוספר\n=== לא כותרת setext',
    }],
  });
  const text = md.toMarkdown(tricky, AT);
  ok(text.includes('\\## לא כותרת'), 'a heading marker in an answer became a heading');
  ok(text.includes('\\- לא רשימה'), 'a dash in an answer became a list item');
  ok(text.includes('\\> לא ציטוט'), 'a chevron in an answer became a quote');
  ok(text.includes('\\=== לא כותרת setext'), 'an underline in an answer became a heading');
  /* The digit cannot be escaped, so the full stop after it is. */
  ok(text.includes('1\\. לא ממוספר'), 'a numbered line in an answer became a numbered list');
  ok(!text.includes('\\1.'), 'the number was escaped in the one way Markdown does not honour');
}

/* File names are chosen by this app and typed by nobody, but the name in them is. */
const NAMES = [
  ['נועה בר', 'portfolio-2026-08-12.html'],
  ['Noa Bar', 'portfolio-Noa-Bar.html'],
  ['../../etc/passwd', 'portfolio-2026-08-12.html'],
  ['a/b\\c:d*e?f"g<h>i|j', 'portfolio-2026-08-12.html'],
  ['', 'portfolio-2026-08-12.html'],
];
for (const [name, expected] of NAMES) {
  const got = doc.fileNameFor(name, 'html', FIXED_DATE);
  ok(got === expected, `fileNameFor(${JSON.stringify(name)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  ok(/^[\x20-\x7e]+$/.test(got), `fileNameFor(${JSON.stringify(name)}) is not ASCII: ${JSON.stringify(got)}`);
}
ok(doc.fileNameFor('', 'html') === 'portfolio.html', 'a name with no date should still be a name');

/* ------------------------------------------------------------------ *
 * 6. The backup a person can edit in a text editor
 * ------------------------------------------------------------------ */

{
  store.reset();
  store.setOwner(FULL.owner);
  for (const w of FULL.works) store.addWork(w);
  const backup = store.exportJson();
  const beforeHtml = html.toHtml(store.get(), AT);

  store.reset();
  ok(store.get().works.length === 0, 'reset left works behind');

  store.importJson(backup);
  ok(store.get().works.length === 3, `the backup restored ${store.get().works.length} works, not 3`);
  ok(html.toHtml(store.get(), AT) === beforeHtml, 'a portfolio is not the same document after a backup round trip');

  let threw = '';
  try { store.importJson('{"shopping":["milk"]}'); } catch (e) { threw = String(e.message || e); }
  ok(threw.length > 0, 'a JSON file that is not a backup was accepted');
  ok(store.get().works.length === 3, 'a rejected import damaged the portfolio that was already there');

  /* A hand-edited backup is exactly as trusted as a form. */
  store.importJson(JSON.stringify({
    owner: { name: 'x', site: 'javascript:alert(1)' },
    works: [{ title: 'y', kind: 'site', context: 'client', images: [{ src: 'data:image/svg+xml;base64,PHN2Zz4=' }], links: [{ url: 'javascript:alert(1)' }] }],
  }));
  const after = html.toHtml(store.get(), AT);
  ok(!after.includes('javascript:'), 'a hand-edited backup put a javascript: URL in the file');
  ok(!after.includes('svg+xml'), 'a hand-edited backup put an SVG in the file');
  store.reset();
}

/* ------------------------------------------------------------------ *
 * 7. What the app tells a person is missing
 * ------------------------------------------------------------------ */

{
  const bare = workOf({ title: 'עבודה' });
  const keys = schema.gapsInWork(bare).map((g) => g.key).sort();
  ok(JSON.stringify(keys) === JSON.stringify(['brief', 'clientName', 'did', 'period', 'result', 'role']),
    `a bare work reports gaps ${JSON.stringify(keys)}`);
  ok(schema.gapsInWork(schema.normaliseWork(FULL.works[0], 0)).length === 0,
    'a fully answered work still reports a gap');
  /* The name is only asked for where the sentence needs one. */
  ok(!schema.gapsInWork(workOf({ context: 'personal' })).some((g) => g.key === 'clientName'),
    'a personal project was asked for a client name');
}

/* ------------------------------------------------------------------ *
 * 8. Storage that refuses
 * ------------------------------------------------------------------ */

/*
 * The two ways saving fails, told apart.
 *
 * They have different answers — one is "delete a photograph", the other is
 * "this browser will not remember anything, download the file before you close
 * the tab" — and giving the first answer to somebody with the second problem
 * sends them to delete work that was never the cause. Node has no localStorage,
 * so the failures are handed to the store directly.
 */
{
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const fake = (fail) => ({
    getItem: () => null,
    removeItem: () => {},
    setItem: () => { if (fail) throw fail; },
  });

  /* The store logs the reason it could not save, which is right in a browser
   * console and is noise in a passing check — so it is captured here, and the
   * fact that it was logged at all is one of the things asserted. */
  const logged = [];
  const realError = console.error;
  console.error = (e) => logged.push(e);

  const quota = new Error('exceeded');
  quota.name = 'QuotaExceededError';
  globalThis.localStorage = fake(quota);
  store.reset();
  store.setOwner({ name: 'מי שאין לו מקום' });
  ok(store.saveError() === 'quota', `a full device reports "${store.saveError()}"`);
  ok(store.get().owner.name === 'מי שאין לו מקום',
    'a save that failed also lost the answer — the work in the form is worth more than the invariant');
  ok(!store.persists(), 'a device that cannot save still claims it can');

  globalThis.localStorage = fake(new Error('SecurityError: storage is disabled'));
  store.reset();
  store.addWork(schema.emptyWork());
  ok(store.saveError() === 'blocked', `a browser with storage switched off reports "${store.saveError()}"`);
  ok(store.get().works.length === 1, 'a blocked save lost the work as well');
  ok(html.toHtml(store.get(), AT).includes('<!DOCTYPE html>'),
    'a portfolio that could not be saved can no longer be exported — which is the one thing left to do with it');

  store.reset();
  console.error = realError;
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete globalThis.localStorage;

  ok(logged.length >= 2, `${logged.length} failed saves were logged — a save that fails silently is the worst kind`);
}

/* ------------------------------------------------------------------ */

/* Opening tags of one name — `<a ` and `<a>` count, `<article` does not. */
function tagCount(source, name) {
  return (source.match(new RegExp('<' + name + '[\\s>]', 'gi')) || []).length;
}

/* Every value of one attribute, as the browser would read it: quoted, and the
 * entities left encoded — an href of "&#39;" points at that, not at a quote. */
function attrValues(source, attr) {
  return Array.from(source.matchAll(new RegExp(attr + '="([^"]*)"', 'g'))).map((m) => m[1]);
}

function pngPixel() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

console.log(`portfolio checks: ${checks}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);
