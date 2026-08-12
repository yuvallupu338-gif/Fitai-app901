/*
 * schema.js — what a work is, and what the writer is allowed to assume.
 *
 * Everything the app stores passes through here. The point is not validation
 * for its own sake: the writer downstream builds Hebrew sentences out of these
 * fields, and a Hebrew sentence needs to know things a free-text box cannot
 * tell it — whether a noun is masculine or feminine, whether a period is a
 * range or a single date, whether "לבד" means there is nobody else to credit.
 * So the fields that carry grammar are closed lists with the grammar attached,
 * and the fields that carry meaning are free text that nothing here pretends to
 * understand.
 */

/*
 * Kinds of work.
 *
 * `he` is the noun as it appears mid-sentence, `gender` is what agrees with it.
 * Hebrew has no neuter: "אתר שבניתי" and "אפליקציה שבניתי" are both fine, but
 * "האתר הזה" / "האפליקציה הזאת" and "התפקיד שלי בו" / "בה" are not
 * interchangeable, and getting it wrong reads as machine text immediately.
 * `article` is the same noun with the definite article, because "ה" + a noun is
 * not always a straight concatenation to a reader's eye and spelling it out
 * here keeps the writer free of string surgery.
 *
 * `verb` is the first-person past tense that goes with that noun — "אתר
 * שבניתי", "טקסט שכתבתי", "אירוע שהפקתי". First person past is the one Hebrew
 * tense that does not decline for the speaker's gender: "בניתי" is what a man
 * and a woman both write. Every generated sentence in this app is built in it,
 * which is why nothing here asks the user whether to say "עשיתי" or "עשיתה" and
 * nothing has to guess.
 */
export const KINDS = [
  { id: 'site', he: 'אתר', article: 'האתר', plural: 'אתרים', gender: 'm', verb: 'בניתי' },
  { id: 'app', he: 'אפליקציה', article: 'האפליקציה', plural: 'אפליקציות', gender: 'f', verb: 'בניתי' },
  { id: 'software', he: 'תוכנה', article: 'התוכנה', plural: 'תוכנות', gender: 'f', verb: 'כתבתי' },
  { id: 'design', he: 'עבודת עיצוב', article: 'עבודת העיצוב', plural: 'עבודות עיצוב', gender: 'f', verb: 'עשיתי' },
  { id: 'brand', he: 'מיתוג', article: 'המיתוג', plural: 'עבודות מיתוג', gender: 'm', verb: 'עשיתי' },
  { id: 'illustration', he: 'איור', article: 'האיור', plural: 'איורים', gender: 'm', verb: 'ציירתי' },
  { id: 'photo', he: 'עבודת צילום', article: 'עבודת הצילום', plural: 'עבודות צילום', gender: 'f', verb: 'עשיתי' },
  { id: 'video', he: 'סרטון', article: 'הסרטון', plural: 'סרטונים', gender: 'm', verb: 'עשיתי' },
  { id: 'audio', he: 'עבודת סאונד', article: 'עבודת הסאונד', plural: 'עבודות סאונד', gender: 'f', verb: 'עשיתי' },
  { id: 'writing', he: 'טקסט', article: 'הטקסט', plural: 'טקסטים', gender: 'm', verb: 'כתבתי' },
  { id: 'research', he: 'מחקר', article: 'המחקר', plural: 'מחקרים', gender: 'm', verb: 'עשיתי' },
  { id: 'product', he: 'מוצר', article: 'המוצר', plural: 'מוצרים', gender: 'm', verb: 'פיתחתי' },
  { id: 'event', he: 'אירוע', article: 'האירוע', plural: 'אירועים', gender: 'm', verb: 'הפקתי' },
  { id: 'teaching', he: 'הדרכה', article: 'ההדרכה', plural: 'הדרכות', gender: 'f', verb: 'העברתי' },
  { id: 'other', he: 'פרויקט', article: 'הפרויקט', plural: 'פרויקטים', gender: 'm', verb: 'עשיתי' },
];

/*
 * Who the work was for.
 *
 * `phrase` slots into "…שבניתי ___" and therefore carries its own preposition;
 * a bare list of nouns would force the writer to guess between "ל", "ב" and
 * "עבור". `needsName` marks the two that read as unfinished without one — "עבודה
 * שעשיתי ללקוח" is a sentence about nobody.
 */
export const CONTEXTS = [
  { id: 'client', he: 'ללקוח', phrase: 'ללקוח', namePrefix: '', needsName: true, nameLabel: 'שם הלקוח' },
  { id: 'work', he: 'במקום עבודה', phrase: 'במסגרת העבודה', namePrefix: 'ב', needsName: true, nameLabel: 'שם המקום' },
  { id: 'study', he: 'בלימודים', phrase: 'במסגרת הלימודים', namePrefix: 'ב', needsName: false, nameLabel: 'שם המוסד' },
  { id: 'personal', he: 'פרויקט אישי', phrase: 'כפרויקט אישי', namePrefix: '', needsName: false, nameLabel: '' },
  { id: 'volunteer', he: 'התנדבות', phrase: 'בהתנדבות', namePrefix: 'ב', needsName: false, nameLabel: 'שם העמותה' },
  { id: 'spec', he: 'עבודה לתיק', phrase: 'כעבודה לתיק העבודות', namePrefix: '', needsName: false, nameLabel: '' },
];

/* How the work was staffed. `alone` decides whether a team sentence is written at all. */
export const TEAMS = [
  { id: 'alone', he: 'לבד', alone: true, phrase: 'לבד' },
  { id: 'small', he: 'בצוות קטן', alone: false, phrase: 'בצוות קטן' },
  { id: 'team', he: 'בצוות', alone: false, phrase: 'בצוות' },
  { id: 'lead', he: 'בהובלת צוות', alone: false, phrase: 'בראש צוות' },
];

export const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/* Bounds. The year floor is not a guess about people, it is what a date input accepts. */
export const YEAR_MIN = 1970;
export const YEAR_MAX = 2100;
export const MAX_IMAGES_PER_WORK = 6;
export const MAX_LINKS_PER_WORK = 6;

/*
 * The questions asked about a work, in the order they are asked.
 *
 * The order is the interview, not the storage layout: title first because it is
 * the only one nobody hesitates on, `brief` and `did` in the middle because they
 * are the two that actually become the explanation, and `learned` last because
 * it is the one people skip and skipping it should cost nothing.
 *
 * `weight` is how much the writer misses this field. `required` fields block a
 * work from being written at all; `weight: 'high'` fields produce a named gap
 * the app shows the user; the rest are silent when absent.
 */
export const WORK_FIELDS = [
  { key: 'title', type: 'text', label: 'שם העבודה', hint: 'איך היית קורא לה בשיחה', required: true, max: 120 },
  { key: 'kind', type: 'enum', label: 'סוג העבודה', options: KINDS, required: true },
  { key: 'role', type: 'text', label: 'התפקיד שלי', hint: 'עיצוב, פיתוח, צילום, ניהול…', weight: 'high', max: 120 },
  { key: 'context', type: 'enum', label: 'בשביל מי', options: CONTEXTS, required: true },
  { key: 'clientName', type: 'text', label: 'שם', hint: 'אפשר להשאיר ריק אם זה לא לפרסום', max: 120 },
  { key: 'period', type: 'period', label: 'מתי', weight: 'high' },
  { key: 'team', type: 'enum', label: 'לבד או בצוות', options: TEAMS },
  { key: 'brief', type: 'para', label: 'מה היה צריך', hint: 'הבעיה, המשימה, מה ביקשו', weight: 'high', max: 1200 },
  { key: 'did', type: 'lines', label: 'מה עשיתי', hint: 'שורה לכל דבר שעשית', weight: 'high', max: 2000 },
  { key: 'tools', type: 'chips', label: 'כלים וטכנולוגיות', hint: 'Figma, React, מצלמה…', max: 20 },
  { key: 'constraints', type: 'para', label: 'מגבלות', hint: 'זמן, תקציב, ציוד, מה שהיה חייב להישאר', max: 600 },
  { key: 'result', type: 'para', label: 'מה יצא מזה', hint: 'מה קרה בסוף, ואם יש מספר — המספר', weight: 'high', max: 800 },
  { key: 'learned', type: 'para', label: 'מה למדתי', hint: 'לא חובה', max: 600 },
  { key: 'links', type: 'links', label: 'קישורים', hint: 'לעבודה עצמה, למאמר, לחנות' },
  { key: 'images', type: 'images', label: 'תמונות', hint: `עד ${MAX_IMAGES_PER_WORK}` },
];

export const OWNER_FIELDS = [
  { key: 'name', type: 'text', label: 'שם', required: true, max: 80 },
  { key: 'headline', type: 'text', label: 'במשפט אחד', hint: 'מעצבת מוצר · מפתח פרונט · צלם אירועים', max: 120 },
  { key: 'about', type: 'para', label: 'משהו עלייך', hint: 'לא חובה — יש פסקה שנכתבת מהעבודות', max: 900 },
  { key: 'email', type: 'email', label: 'אימייל', max: 160 },
  { key: 'phone', type: 'text', label: 'טלפון', max: 40 },
  { key: 'site', type: 'url', label: 'אתר או פרופיל', hint: 'לינקדאין, בהאנס, גיטהאב', max: 300 },
  { key: 'location', type: 'text', label: 'איפה', hint: 'עיר', max: 80 },
];

export function kindById(id) {
  return KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];
}

export function contextById(id) {
  return CONTEXTS.find((c) => c.id === id) || null;
}

export function teamById(id) {
  return TEAMS.find((t) => t.id === id) || null;
}

/*
 * Text coming out of a form, on its way into storage.
 *
 * Two things are removed and nothing else. Carriage returns, so that a line
 * count does not depend on which machine typed the text; and the bidi override
 * controls U+202A–U+202E and U+2066–U+2069, which are invisible, survive
 * copy-paste from a PDF or a chat, and can reorder every line after them in a
 * document that is already right-to-left. LRM and RLM (U+200E/200F) are left
 * alone: those are the marks a person uses on purpose to keep a phone number or
 * a file name reading the right way round.
 */
export function cleanText(value, max) {
  let s = String(value === null || value === undefined ? '' : value);
  s = s.replace(/\r\n?/g, '\n').replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  if (max && s.length > max) s = s.slice(0, max).trim();
  return s;
}

/* Free text on one line — the same cleaning, with newlines folded to spaces. */
export function cleanLine(value, max) {
  return cleanText(String(value === null || value === undefined ? '' : value).replace(/\n+/g, ' '), max)
    .replace(/\s{2,}/g, ' ');
}

/*
 * A link the app is willing to put in a document it hands to somebody else.
 *
 * The exported file is opened by a stranger — a client, an employer — from
 * their downloads folder, where it is a local file with a file:// origin and
 * whatever trust that carries. So the scheme list is the whole security model
 * for links, and it is a list of four, not a blocklist of the dangerous ones:
 * `javascript:` is the obvious one, but `data:text/html` is a document that can
 * carry script too, and a blocklist that has heard of one has usually not heard
 * of the other. Anything not on the list is dropped rather than repaired,
 * because a repaired URL is a guess at what somebody meant to type.
 */
const LINK_SCHEME = /^(https?:\/\/|mailto:|tel:)/i;

export function safeUrl(value) {
  const s = cleanLine(value, 2000);
  if (!s) return '';
  if (/[\u0000- "<>\\^`{|}]/.test(s)) return '';
  if (LINK_SCHEME.test(s)) return s;
  /* A bare domain is what people paste. It is only a scheme away from usable. */
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
  return '';
}

/*
 * An image the app is willing to embed.
 *
 * Images live in the document as data URLs — there is no server here to host a
 * file on, and a portfolio that only works while a folder of JPEGs sits next to
 * it is not a portfolio you can email. So the check is on the URL itself: an
 * image MIME type from a closed list, base64, and a payload that contains only
 * base64 characters. `data:image/svg+xml` is not on the list and that is the
 * whole reason the list is closed — an SVG is a document with script in it.
 */
const IMAGE_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export function safeImageUrl(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  return IMAGE_URL.test(s) ? s : '';
}

export function isEmail(value) {
  const s = cleanLine(value, 160);
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}

/*
 * A period is either a range of months, a single month, or nothing.
 *
 * It is stored as four numbers rather than two Date objects because a Date is a
 * point in time and this is not one — "מרץ 2024" is a month, and the moment it
 * becomes a Date somebody has to decide what happens at midnight on the first,
 * in which timezone, and that decision has no right answer and one wrong one
 * that moves the month back by one for half the planet.
 */
export function cleanPeriod(period) {
  const p = period || {};
  const out = {
    fromYear: yearOrNull(p.fromYear),
    fromMonth: monthOrNull(p.fromMonth),
    toYear: yearOrNull(p.toYear),
    toMonth: monthOrNull(p.toMonth),
    ongoing: p.ongoing === true,
  };
  if (out.fromYear === null) { out.fromMonth = null; }
  if (out.toYear === null) { out.toMonth = null; }
  if (out.ongoing) { out.toYear = null; out.toMonth = null; }
  /* An end before its start is a typo, and the honest repair is to drop the end. */
  if (out.fromYear !== null && out.toYear !== null && cmpMonth(out, 'to', 'from') < 0) {
    out.toYear = null;
    out.toMonth = null;
  }
  return out;
}

function cmpMonth(p, a, b) {
  const ay = p[a + 'Year'];
  const by = p[b + 'Year'];
  if (ay !== by) return ay - by;
  return (p[a + 'Month'] === null ? 0 : p[a + 'Month']) - (p[b + 'Month'] === null ? 0 : p[b + 'Month']);
}

function yearOrNull(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

function monthOrNull(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

export function hasPeriod(period) {
  const p = period || {};
  return p.fromYear !== null && p.fromYear !== undefined;
}

/*
 * Everything above, applied to one work.
 *
 * This runs on the way in from the form and again on the way in from an
 * imported backup, and it is the same function on purpose: a backup file is
 * something a person can edit in a text editor, so it deserves exactly as much
 * suspicion as a form does.
 */
export function normaliseWork(raw, index) {
  const w = raw && typeof raw === 'object' ? raw : {};
  const kind = kindById(cleanLine(w.kind, 40));
  const context = contextById(cleanLine(w.context, 40));
  const team = teamById(cleanLine(w.team, 40));
  return {
    id: cleanLine(w.id, 40) || 'w' + (index === undefined ? 0 : index) + '-' + Math.random().toString(36).slice(2, 8),
    title: cleanLine(w.title, 120),
    kind: kind.id,
    role: cleanLine(w.role, 120),
    context: context ? context.id : '',
    clientName: cleanLine(w.clientName, 120),
    period: cleanPeriod(w.period),
    team: team ? team.id : '',
    brief: cleanText(w.brief, 1200),
    did: cleanText(w.did, 2000),
    tools: cleanChips(w.tools, 20),
    constraints: cleanText(w.constraints, 600),
    result: cleanText(w.result, 800),
    learned: cleanText(w.learned, 600),
    links: cleanLinks(w.links),
    images: cleanImages(w.images),
  };
}

export function cleanChips(value, max) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = cleanLine(item, 40);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= (max || 20)) break;
  }
  return out;
}

function cleanLinks(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    const url = safeUrl(item && item.url);
    if (!url) continue;
    out.push({ label: cleanLine(item.label, 80), url });
    if (out.length >= MAX_LINKS_PER_WORK) break;
  }
  return out;
}

function cleanImages(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    const src = safeImageUrl(item && item.src);
    if (!src) continue;
    out.push({ src, caption: cleanLine(item.caption, 160) });
    if (out.length >= MAX_IMAGES_PER_WORK) break;
  }
  return out;
}

export function normaliseOwner(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const email = cleanLine(o.email, 160);
  return {
    name: cleanLine(o.name, 80),
    headline: cleanLine(o.headline, 120),
    about: cleanText(o.about, 900),
    email: isEmail(email) ? email : '',
    phone: cleanLine(o.phone, 40),
    site: safeUrl(o.site),
    location: cleanLine(o.location, 80),
  };
}

export function normalisePortfolio(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const works = (Array.isArray(p.works) ? p.works : []).map(normaliseWork);
  const seen = new Set();
  for (const w of works) {
    while (seen.has(w.id)) w.id += 'x';
    seen.add(w.id);
  }
  return { owner: normaliseOwner(p.owner), works };
}

export function emptyWork() {
  return normaliseWork({ kind: 'site', context: 'client', team: 'alone' }, 0);
}

/*
 * What a work is still missing, by name.
 *
 * The app shows this list instead of grading the work out of ten. A score says
 * "not good enough" and leaves the reader to guess at what; a list of two field
 * names is a thing somebody can go and do in a minute.
 */
export function gapsInWork(work) {
  const gaps = [];
  for (const f of WORK_FIELDS) {
    if (!f.required && f.weight !== 'high') continue;
    const v = work[f.key];
    const empty = f.type === 'period' ? !hasPeriod(v) : !(typeof v === 'string' ? v.trim() : v);
    if (empty) gaps.push({ key: f.key, label: f.label, required: !!f.required });
  }
  const ctx = contextById(work.context);
  if (ctx && ctx.needsName && !work.clientName) {
    gaps.push({ key: 'clientName', label: ctx.nameLabel, required: false });
  }
  return gaps;
}

export function isWorkWritable(work) {
  return !!(work && work.title && work.kind);
}
