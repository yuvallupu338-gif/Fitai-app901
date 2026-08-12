/*
 * write.js — turns the answers about a work into the explanation that goes in
 * the file.
 *
 * The division of labour here is the whole design, and it is worth stating
 * plainly: this module writes the sentences it can derive from the fields the
 * user picked, and it frames — never rewrites — the sentences the user typed.
 *
 * The derived half is real writing. "זה אתר שבניתי ללקוח מספרת רון, במרץ–מאי
 * 2024. התפקיד שלי בו היה עיצוב ופיתוח. עבדתי עליו לבד." is four facts from
 * four closed fields, assembled with the agreement Hebrew needs — and nobody
 * types that paragraph about their own work, which is exactly why a portfolio
 * usually opens with a title and then a wall of "אז ככה".
 *
 * The typed half is left alone. A paraphrase of a sentence this module cannot
 * read is a guess about somebody's job, printed in a document they will send to
 * an employer, and there is no version of that which is worth the risk. So the
 * text a person wrote appears under a heading that says what it answers, in
 * their words, and the app's contribution is having asked the right question.
 *
 * Everything here is a pure function of its arguments — no clock, no storage,
 * no DOM. The same portfolio produces the same file every time, which is what
 * makes `tools/portfolio-audit.mjs` able to assert anything at all.
 */

import {
  MONTHS,
  kindById,
  contextById,
  teamById,
  gapsInWork,
  hasPeriod,
} from '../data/schema.js';

/*
 * Pronouns that have to agree with the kind of work.
 *
 * Four words, and getting them wrong is the difference between a document that
 * reads as written and one that reads as filled in. "אפליקציה" is feminine, so
 * it is "זו אפליקציה", "התפקיד שלי בה", "עבדתי עליה" — and an app that says
 * "עבדתי עליו" about an אפליקציה has told the reader, in one letter, that no
 * person looked at this page.
 */
const PRONOUNS = {
  m: { dem: 'זה', in: 'בו', on: 'עליו' },
  f: { dem: 'זו', in: 'בה', on: 'עליה' },
};

/* Hebrew numerals decline for gender, and only up to ten are words at all. */
const NUM_M = ['', 'אחד', 'שני', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה', 'עשרה'];
const NUM_F = ['', 'אחת', 'שתי', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר'];

/*
 * A one-letter prefix — ב, מ, ו, ל — glued onto the next word.
 *
 * In Hebrew the prefix is part of the word: "במרץ", "ופיתוח". Against a word
 * that is not Hebrew it cannot be, because "בReact" is not readable in either
 * direction, and the convention every Hebrew publication settled on is a maqaf:
 * "ב-React", "מ-2019". So the rule is about the first character of the word,
 * not about the language of the sentence.
 */
export function attachPrefix(prefix, word) {
  const s = String(word || '');
  if (!s) return '';
  return isHebrewLetter(s[0]) ? prefix + s : prefix + '-' + s;
}

function isHebrewLetter(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x05d0 && c <= 0x05ea;
}

/** "עיצוב, פיתוח ואפיון" — the last item carries the ו, by the same rule. */
export function joinHe(list) {
  const items = (list || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  return items.slice(0, -1).join(', ') + ' ' + attachPrefix('ו', last);
}

/**
 * "עבודה אחת", "שתי עבודות", "12 עבודות".
 *
 * One is the case that breaks a naive `${n} ${plural}`: Hebrew puts the numeral
 * after the noun and in the singular, so "1 עבודות" and even "אחת עבודה" are
 * both wrong. Past ten the numerals are written as digits by convention.
 */
export function countPhrase(n, singular, plural, gender) {
  const words = gender === 'f' ? NUM_F : NUM_M;
  if (n === 1) return singular + ' ' + words[1];
  if (n >= 2 && n <= 10) return words[n] + ' ' + plural;
  return n + ' ' + plural;
}

/** The period as it appears in a facts row: "מרץ–מאי 2024", "2019–2021", "מ-2024 ועד היום". */
export function formatPeriod(period) {
  const p = period || {};
  if (!hasPeriod(p)) return '';
  const fromMonth = p.fromMonth ? MONTHS[p.fromMonth - 1] : '';

  if (p.ongoing) {
    const from = fromMonth ? fromMonth + ' ' + p.fromYear : String(p.fromYear);
    return attachPrefix('מ', from) + ' ועד היום';
  }

  if (p.toYear === null || p.toYear === undefined) {
    return fromMonth ? fromMonth + ' ' + p.fromYear : String(p.fromYear);
  }

  const toMonth = p.toMonth ? MONTHS[p.toMonth - 1] : '';

  /*
   * A range is written right-to-left and that is correct — a Hebrew reader
   * meets "מרץ–מאי" and reads March first, May second. dom.js has the long
   * version of this note; the short version is that the two endpoints stay
   * whole, so nothing here needs an LTR wrapper.
   */
  if (p.fromYear === p.toYear) {
    if (fromMonth && toMonth) {
      return fromMonth === toMonth ? fromMonth + ' ' + p.fromYear : fromMonth + '–' + toMonth + ' ' + p.fromYear;
    }
    /* One month and not the other still names a month. Falling through to the
     * bare year here threw away a dropdown the person had answered. */
    const known = fromMonth || toMonth;
    return known ? known + ' ' + p.fromYear : String(p.fromYear);
  }
  const ends = endpoints(p);
  /* Spaces around the dash only when an endpoint is two words, so "2019–2021"
   * stays tight and "מרץ 2024 – ינואר 2025" does not run together. */
  return fromMonth || toMonth ? ends.start + ' – ' + ends.end : ends.start + '–' + ends.end;
}

/* The two ends of a finished period, each as much of a date as is known. */
function endpoints(period) {
  const p = period || {};
  const fromMonth = p.fromMonth ? MONTHS[p.fromMonth - 1] : '';
  const toMonth = p.toMonth ? MONTHS[p.toMonth - 1] : '';
  return {
    start: fromMonth ? fromMonth + ' ' + p.fromYear : String(p.fromYear),
    end: toMonth ? toMonth + ' ' + p.toYear : String(p.toYear),
  };
}

/**
 * The same period inside a sentence, where it needs its preposition.
 *
 * A range and a point take different ones. "ב-2019–2021" is what you get from
 * prefixing the facts-row string and it reads as a typo; the sentence form of a
 * range in Hebrew is "בין 2019 ל-2021", and when both ends sit in one year the
 * year is said once: "בין מרץ למאי 2024".
 */
export function periodInSentence(period) {
  const p = period || {};
  if (!hasPeriod(p)) return '';
  /* "מ… ועד היום" already carries its preposition; a second would double it. */
  if (p.ongoing) return formatPeriod(p);

  if (p.toYear === null || p.toYear === undefined) return attachPrefix('ב', formatPeriod(p));

  const fromMonth = p.fromMonth ? MONTHS[p.fromMonth - 1] : '';
  const toMonth = p.toMonth ? MONTHS[p.toMonth - 1] : '';
  if (p.fromYear === p.toYear) {
    if (!fromMonth || !toMonth || fromMonth === toMonth) return attachPrefix('ב', formatPeriod(p));
    return 'בין ' + fromMonth + ' ' + attachPrefix('ל', toMonth) + ' ' + p.fromYear;
  }
  const ends = endpoints(p);
  return 'בין ' + ends.start + ' ' + attachPrefix('ל', ends.end);
}

/*
 * The lead-in shown in the contents list, and nowhere else.
 *
 * It prefers the first sentence of what the user wrote about the task, because
 * that is the sentence they chose to open with. Only when there is none does it
 * fall back to the derived one, which always exists.
 */
function leadFor(work, opening) {
  const brief = String(work.brief || '').trim();
  if (brief) {
    const m = /^[^\n]{1,150}?[.!?]/.exec(brief);
    const first = m ? m[0] : brief.split('\n')[0];
    return first.length > 150 ? first.slice(0, 147).trim() + '…' : first;
  }
  return opening.length ? opening[0] : '';
}

/**
 * The facts row: kind, role, who for, when, alone or with others.
 *
 * Kept as label/value pairs rather than a formatted string because the HTML
 * file draws them as chips, the Markdown draws them as a line, and a string
 * built here would have to be unpicked by one of them.
 */
export function factsFor(work) {
  const kind = kindById(work.kind);
  const ctx = contextById(work.context);
  const team = teamById(work.team);
  const facts = [{ label: 'סוג', value: kind.he }];
  if (work.role) facts.push({ label: 'תפקיד', value: work.role });
  if (ctx) facts.push({ label: 'בשביל', value: ctx.he + (nameFor(work, ctx) ? ': ' + nameFor(work, ctx) : '') });
  const period = formatPeriod(work.period);
  if (period) facts.push({ label: 'מתי', value: period });
  if (team) facts.push({ label: 'עבודה', value: team.he });
  return facts;
}

/*
 * The derived paragraph, one sentence at a time.
 *
 * Each sentence is pushed only when every field it needs is present, so a work
 * with two answers gets a true two-sentence paragraph rather than a template
 * with holes in it. There is no sentence here that can come out half-built.
 */
export function openingFor(work) {
  const kind = kindById(work.kind);
  const g = PRONOUNS[kind.gender] || PRONOUNS.m;
  const ctx = contextById(work.context);
  const team = teamById(work.team);
  const out = [];

  let first = g.dem + ' ' + kind.he + ' ש' + kind.verb;
  if (ctx) {
    first += ' ' + ctx.phrase;
    const name = nameFor(work, ctx);
    if (name) first += ' ' + attachPrefix(ctx.namePrefix, name);
  }
  const when = periodInSentence(work.period);
  if (when) first += ', ' + when;
  out.push(first + '.');

  if (work.role) out.push('התפקיד שלי ' + g.in + ' היה ' + stripFinalStop(work.role) + '.');
  if (team) out.push('עבדתי ' + g.on + ' ' + team.phrase + '.');
  return out;
}

/*
 * The name of whoever the work was for, but only where that context has one.
 *
 * Two of the six do not: a personal project and a portfolio piece are for
 * nobody, and there is no field on the screen for them. The value can still be
 * there — somebody chose "ללקוח", typed the client's name, then changed their
 * mind about what this work was — and it is kept rather than deleted, so that
 * changing back does not cost them the typing. What it must not do is reach the
 * sentence: "זה אתר שבניתי כפרויקט אישי מספרת רון" is a client credited on a
 * project they had nothing to do with.
 */
function nameFor(work, ctx) {
  return ctx && ctx.nameLabel ? work.clientName || '' : '';
}

/*
 * A role typed as "עיצוב ופיתוח." would otherwise end the sentence twice.
 * Only a trailing full stop is taken — a question or exclamation mark is
 * something the person meant, and a comma is the middle of a list.
 */
function stripFinalStop(text) {
  return String(text || '').trim().replace(/\.$/, '');
}

/**
 * The user's own answers, each under the question it answers.
 *
 * `did` becomes a list when it was typed as more than one line, and a paragraph
 * when it was typed as one. Turning a single sentence into a one-bullet list is
 * how a document starts looking like a form.
 */
export function sectionsFor(work) {
  const out = [];
  if (work.brief) out.push({ key: 'brief', label: 'מה היה צריך', type: 'para', text: work.brief });
  if (work.constraints) out.push({ key: 'constraints', label: 'המגבלות', type: 'para', text: work.constraints });
  if (work.did) {
    const lines = String(work.did).split('\n').map(cleanBullet).filter(Boolean);
    if (lines.length > 1) out.push({ key: 'did', label: 'מה עשיתי', type: 'list', items: lines });
    else if (lines.length === 1) out.push({ key: 'did', label: 'מה עשיתי', type: 'para', text: lines[0] });
  }
  if (work.result) out.push({ key: 'result', label: 'מה יצא מזה', type: 'para', text: work.result });
  if (work.learned) out.push({ key: 'learned', label: 'מה למדתי', type: 'para', text: work.learned });
  return out;
}

/*
 * People type bullets with bullets in them. Stripping a leading "-", "*" or "•"
 * is not editing what they wrote, it is not printing the marker twice.
 */
function cleanBullet(line) {
  return String(line || '').trim().replace(/^[-*•·]\s*/, '').trim();
}

/** Everything the document needs about one work. */
export function explainWork(work) {
  const opening = openingFor(work);
  return {
    id: work.id,
    title: work.title,
    facts: factsFor(work),
    opening,
    sections: sectionsFor(work),
    tools: (work.tools || []).slice(),
    links: (work.links || []).slice(),
    images: (work.images || []).slice(),
    lead: leadFor(work, opening),
    gaps: gapsInWork(work),
  };
}

/**
 * Tools across the whole portfolio, most-used first.
 *
 * Ties break by first appearance rather than alphabetically, so the list keeps
 * the order the person entered their own work in and does not reshuffle itself
 * when a tool is added to a work at the bottom.
 */
export function deriveSkills(works) {
  const counts = new Map();
  const firstSeen = new Map();
  let i = 0;
  for (const w of works || []) {
    for (const t of w.tools || []) {
      const key = t.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!firstSeen.has(key)) { firstSeen.set(key, { order: i, label: t }); }
      i += 1;
    }
  }
  return Array.from(counts.keys())
    .sort((a, b) => (counts.get(b) - counts.get(a)) || (firstSeen.get(a).order - firstSeen.get(b).order))
    .slice(0, 24)
    .map((k) => firstSeen.get(k).label);
}

/*
 * The paragraph about the person, counted off the works themselves.
 *
 * It is the one place in the file that says something the user did not answer a
 * question about, and every clause in it is arithmetic: how many works, which
 * years they span, what kinds they are, which tools recur. Nothing is inferred
 * about the person — a portfolio that told an employer its owner is "creative
 * and detail-oriented" on the evidence of six form fields would be lying with
 * the app's voice, and the app has no standing to do that.
 */
export function writeAbout(portfolio) {
  const works = (portfolio && portfolio.works) || [];
  const owner = (portfolio && portfolio.owner) || {};
  const paragraphs = [];
  if (owner.about) paragraphs.push(owner.about);
  if (!works.length) {
    paragraphs.push('התיק הזה עדיין ריק.');
    return paragraphs;
  }

  let s = 'בתיק הזה ' + countPhrase(works.length, 'עבודה', 'עבודות', 'f');

  const years = works.map((w) => (w.period || {}).fromYear).filter((y) => typeof y === 'number');
  const ends = works.map((w) => ((w.period || {}).ongoing ? null : (w.period || {}).toYear))
    .filter((y) => typeof y === 'number');
  if (years.length) {
    const min = Math.min.apply(null, years);
    const max = Math.max.apply(null, ends.concat(years));
    const ongoing = works.some((w) => (w.period || {}).ongoing);
    /* One year takes no comma. "בתיק הזה עבודה אחת, מ-2024" reads as a list
     * that lost its second half; "בתיק הזה עבודה אחת מ-2024" is a sentence. */
    if (ongoing) s += ', ' + attachPrefix('מ', String(min)) + ' ועד היום';
    else if (min === max) s += ' ' + attachPrefix('מ', String(min));
    else s += ', ' + attachPrefix('מ', String(min)) + ' עד ' + max;
  }

  /* With one work the kinds clause repeats the count in different words —
   * "עבודה אחת — אפליקציה אחת" — so it is only written from two up. */
  if (works.length > 1) {
    const byKind = new Map();
    for (const w of works) {
      const k = kindById(w.kind);
      byKind.set(k.id, { kind: k, n: (byKind.get(k.id) ? byKind.get(k.id).n : 0) + 1 });
    }
    const kinds = Array.from(byKind.values()).sort((a, b) => b.n - a.n).slice(0, 3);
    s += ' — ' + joinHe(kinds.map((e) => countPhrase(e.n, e.kind.he, e.kind.plural, e.kind.gender)));
  }
  paragraphs.push(s + '.');

  const skills = deriveSkills(works);
  if (skills.length) {
    const recurring = skills.filter((t) => works.filter((w) => hasTool(w, t)).length > 1);
    const list = (recurring.length ? recurring : skills).slice(0, 6);
    paragraphs.push((recurring.length ? 'הכלים שחוזרים בהן: ' : 'הכלים: ') + joinHe(list) + '.');
  }

  return paragraphs;
}

function hasTool(work, tool) {
  const t = String(tool).toLowerCase();
  return (work.tools || []).some((x) => String(x).toLowerCase() === t);
}
