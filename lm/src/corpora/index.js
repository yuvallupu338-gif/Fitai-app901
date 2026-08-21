/*
 * index.js — the four texts the page can train on, and how each one arrives.
 *
 * Three of them were written for this by a hundred agents working in parallel:
 * seventy-five wrote code, twenty-five wrote Hebrew questions and answers, one
 * slice each. They are shipped as ES modules rather than as .txt files on
 * purpose — this page runs under `connect-src 'none'`, so it cannot fetch
 * anything, but it can import a module, because that is script-src and
 * script-src is 'self'. The security posture stays exactly where it was and the
 * corpora still load.
 *
 * They load on demand. Together they are the better part of a megabyte, and
 * paying for that on first paint to show a text nobody has asked for yet would
 * be the wrong trade on a phone.
 */

import { buildCorpus } from '../corpus.js';
import { makeRng } from '../rng.js';
import { MANIFEST } from './manifest.js';

const thousands = (n) => `${Math.round(n / 1000).toLocaleString('he-IL')}k תווים`;
const writers = (n) => `${n} ${n === 1 ? 'מאמן' : 'מאמנים'}`;

/**
 * Shuffle the slices, deterministically, before joining them.
 *
 * The writers were given one language or one subject each, so the slices arrive
 * grouped: twenty of JavaScript, eighteen of Python, and at the end the three
 * config formats. The trainer holds out the last tenth of the text, which in
 * that order is not a sample of the corpus — it is whichever two languages
 * happen to be last.
 *
 * Measured on this corpus at 800 steps, grouped order gives a training loss of
 * 4.28 against 5.23 held out — worse than the 4.90 of random guessing, because
 * the model was being examined in a language nobody taught it. One shuffle with
 * a fixed seed gives 4.32 against 4.40, and the two now move together.
 *
 * Fixed seed, so it stays reproducible. And note what the shuffle does and does
 * not do: a slice still lands wholly on one side of the split — the tail is now
 * a random tenth of the writers instead of the last two languages, which is
 * enough to make it a sample of the corpus, but no writer's work is on both
 * sides. The page and the command line always build the same text.
 */
const mix = (parts, seed) => {
  const rng = makeRng(seed);
  const out = parts.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const JOIN = '\n\n';

/* One loader per module, each caching what it imported: switching back and
 * forth between corpora should not re-parse half a megabyte each time. */
const cache = {};
const partsOf = async (name) => {
  if (!cache[name]) {
    const mod = name === 'code' ? await import('./code.js')
      : name === 'general' ? await import('./general.js')
        : name === 'chat' ? await import('./chat.js')
          : await import('./pictures.js');
    cache[name] = mod.PARTS;
  }
  return cache[name];
};

const one = (name, seed) => async () => mix(await partsOf(name), seed).join(JOIN);

const many = (names, seed) => async () => {
  const all = await Promise.all(names.map(partsOf));
  return mix(all.flat(), seed).join(JOIN);
};

const note = (...names) => {
  const writers = names.reduce((n, k) => n + (MANIFEST[k] ? MANIFEST[k].writers : 0), 0);
  const characters = names.reduce((n, k) => n + (MANIFEST[k] ? MANIFEST[k].characters : 0), 0);
  return `${writers} ${writers === 1 ? 'מאמן' : 'מאמנים'} · ${thousands(characters)}`;
};

export const CORPORA = [
  {
    id: 'log',
    label: 'יומן אימונים',
    note: 'נוצר כאן במקום · 33k תווים',
    hint: 'טקסט קצר וחזרתי מאוד, ולכן הכי קל ללמידה — טוב בשביל לראות את העקומה יורדת מהר.',
    load: async () => buildCorpus(),
  },
  {
    id: 'code',
    label: 'קוד',
    note: note('code'),
    hint: 'קוד בעשרות שפות. סוגריים, הזחה ושמות משתנים — מבנה שמודל תווים לומד יפה.',
    load: one('code', 101),
  },
  {
    id: 'general',
    label: 'שאלות ותשובות',
    note: note('general'),
    hint: 'עברית חופשית בפורמט קבוע של ש: ות:. הכי קשה מהשלושה, כי עברית לא חוזרת על עצמה.',
    load: one('general', 202),
  },
  {
    id: 'chat',
    label: 'שיחה',
    note: note('chat'),
    hint: 'חילופי דברים קצרים באותו פורמט — זה מה שגורם לתיבת הצ׳אט לענות במשהו שנראה כמו תשובה.',
    load: one('chat', 404),
  },
  {
    id: 'pictures',
    label: 'ציורים',
    note: note('pictures'),
    hint: 'ציורי תווים תחת [שם] ו־SVG קטן תחת הערה. זה מה שהופך את "צייר" למשהו שיוצא ממנו.',
    load: one('pictures', 505),
  },
  {
    id: 'both',
    label: 'הכל ביחד',
    note: note('code', 'general', 'chat', 'pictures'),
    hint: 'ארבע מערכות כתב ושני אלפביתים בבת אחת. אוצר המילים הכי גדול, וההפסד יישאר גבוה יותר — זה מה שערבוב עולה, וזה מה שהמודל שנשלח אומן עליו.',
    load: many(['code', 'general', 'chat', 'pictures'], 303),
  },
  {
    id: 'custom',
    label: 'טקסט משלך',
    note: 'מה שהדבקת או טענת',
    hint: 'כל טקסט עובד. ככל שהוא יותר ארוך ויותר עקבי, כך יש יותר ללמוד ממנו.',
    load: null,
  },
];

export const corpusById = (id) => CORPORA.find((c) => c.id === id) || CORPORA[0];
