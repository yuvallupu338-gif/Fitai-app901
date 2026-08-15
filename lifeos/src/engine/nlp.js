/*
 * nlp.js — reading a task out of a sentence somebody typed in Hebrew.
 *
 *     "מחר ב־17:00 ללמוד מתמטיקה 45 דקות"
 *        ↓
 *     title: ללמוד מתמטיקה   date: מחר   time: 17:00   duration: 45
 *
 * NO MODEL. This runs on every keystroke in the capture box, it has to work
 * offline and with no API key, and the grammar of "tomorrow at five for forty
 * minutes" is small enough to write down. A model here would be slower, would
 * cost money per keystroke, and would occasionally hallucinate a date — for a
 * problem that regular expressions solve exactly.
 *
 * WHAT MAKES HEBREW HARDER THAN ENGLISH HERE.
 *
 * Prepositions are prefixes, not words. "at 17:00" is three tokens with a
 * space to anchor on; "ב־17:00" is one token, and it is also written "ב17:00",
 * "ב-17:00", and "בשעה 17:00". The same ב prefixes day names — "ביום ראשון",
 * "בראשון" — and the same letter starts ordinary words, so a pattern that
 * matches a bare ב will eat the first letter of somebody's task.
 *
 * There is a second trap in the numbers. "45 דקות" is a duration and "ב־5"
 * is a time, but "5 דקות" after "ב" is still a duration, so the time patterns
 * have to refuse a number that a duration word follows. Getting that backwards
 * turns "ללמוד 45 דקות" into a task scheduled for 45 minutes past midnight.
 *
 * AND THE TRAP THAT CAUGHT THIS FILE FIRST TIME ROUND: \b DOES NOT WORK.
 *
 * JavaScript's word-boundary assertion is defined on [A-Za-z0-9_]. Every
 * Hebrew letter is a non-word character to it, so /\bמחר\b/ asks for a
 * transition that never happens and quietly matches nothing — at the start of
 * a string, in the middle, anywhere. The patterns all looked right and the
 * parser found dates in none of them.
 *
 * The fix is a captured leading boundary rather than a lookbehind, because
 * lookbehind is still missing from Safari before 16.4 and this app has to run
 * on a phone somebody has not updated. findWord() below matches
 * `(^|[^letter])keyword(?!letter)` and then adds the captured prefix's length
 * back to the index, so callers get the offset of the keyword itself.
 *
 * EVERYTHING IS A GUESS, AND THE GUESS IS SHOWN.
 *
 * The parser returns what it matched, where, and how confident it is. The
 * capture UI renders that as a preview a person confirms — which is what makes
 * an aggressive parser safe. Nothing here writes anything.
 */

import { today as todayIso, addDays, dayOfWeek, isValidIso } from '../core/time.js';

const DAY_NAMES = [
  ['ראשון', 'א'],
  ['שני', 'ב'],
  ['שלישי', 'ג'],
  ['רביעי', 'ד'],
  ['חמישי', 'ה'],
  ['שישי', 'ו'],
  ['שבת', 'ש'],
];

/* The maqaf (־, U+05BE) is a Hebrew punctuation mark, not a hyphen, and people
 * type both — plus a bare prefix, plus nothing at all. */
const SEP = '[\\u05be\\-]?\\s*';

/* Hebrew letters (including the five final forms, which sit inside this range)
 * plus Latin word characters. This is what "part of a word" means here. */
const LETTER = '\\u05d0-\\u05ea\\w';

function pad2(n) { return n < 10 ? `0${n}` : String(n); }

/**
 * Match `source` as a whole word, Hebrew included.
 *
 * The leading boundary is a capture group rather than a lookbehind, for the
 * Safari reason above. Inner capture groups therefore start at index 2, and
 * the returned `index` already has the prefix length added back so callers
 * never have to know about any of this.
 */
function findWord(text, source, flags) {
  const re = new RegExp(`(^|[^${LETTER}])(?:${source})(?![${LETTER}])`, flags);
  const m = re.exec(text);
  if (!m) return null;
  const lead = m[1].length;
  return {
    index: m.index + lead,
    end: m.index + m[0].length,
    matched: m[0].slice(lead),
    groups: m.slice(2),
  };
}

/** Remove a matched span without leaving a double space behind. */
function cut(text, start, end) {
  return `${text.slice(0, start)} ${text.slice(end)}`.replace(/\s{2,}/g, ' ');
}

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

/* Longest first: "שעה וחצי" has to be tried before "שעה", or the first match
 * takes the hour and leaves "וחצי" sitting in the task title. */
const DURATION_PATTERNS = [
  { source: 'שלושת\\s+רבעי\\s+שעה', minutes: () => 45 },
  { source: 'שעתיים\\s+ו?חצי', minutes: () => 150 },
  { source: 'שעה\\s+ו?חצי', minutes: () => 90 },
  { source: 'חצי\\s+שעה', minutes: () => 30 },
  { source: 'רבע\\s+שעה', minutes: () => 15 },
  { source: 'שעתיים', minutes: () => 120 },
  {
    source: '(\\d+(?:[.,]\\d+)?)\\s*(?:שעות|שעה|שע[\'׳]?)',
    minutes: (g) => Math.round(parseFloat(String(g[0]).replace(',', '.')) * 60),
  },
  {
    source: '(\\d+)\\s*(?:דקות|דקה|דק[\'׳]?)',
    minutes: (g) => parseInt(g[0], 10),
  },
  /*
   * A bare "שעה", last so the numeric forms above claim "3 שעות" first.
   *
   * It is safe next to the time patterns for a reason worth stating: the
   * boundary in findWord requires a non-letter before the match, and "בשעה
   * 17:00" has ב immediately before it. So the preposition form used to
   * introduce a clock time can never be read as a sixty-minute duration.
   */
  { source: 'שעה', minutes: () => 60 },
];

export function parseDuration(text) {
  for (const p of DURATION_PATTERNS) {
    const found = findWord(text, p.source);
    if (!found) continue;
    const minutes = p.minutes(found.groups);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) continue;
    return { minutes, start: found.index, end: found.end, matched: found.matched };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Time of day
 * ------------------------------------------------------------------ */

/* Words that mean the number before them was a duration, not a clock time. */
const DURATION_TAIL = /^\s*(?:דקות|דקה|דק['׳]?|שעות|שעה|שע['׳]?|ימים|יום|שבועות|שבוע)/;

export function parseTime(text) {
  /* 17:00, 17.00, ב־17:00, בשעה 17:00. The preposition is swallowed with the
   * number so that removing the match does not leave a stranded "ב־" in the
   * title — which is exactly what the first version of this did. */
  const withMinutes = findWord(text, `(?:בשעה\\s+|ב${SEP})?(\\d{1,2})[:.](\\d{2})(?![\\d:])`);
  if (withMinutes) {
    const hour = Number(withMinutes.groups[0]);
    const minute = Number(withMinutes.groups[1]);
    if (hour <= 23 && minute <= 59) {
      return {
        minutes: hour * 60 + minute,
        start: withMinutes.index,
        end: withMinutes.end,
        matched: withMinutes.matched,
        exact: true,
      };
    }
  }

  /* ב־5, בשעה 5. Only with the preposition — a bare "5" in a sentence is far
   * more likely to be part of the task than a time. */
  const hourOnly = findWord(text, `(?:בשעה\\s+|ב${SEP})(\\d{1,2})(?![\\d:.])`);
  if (hourOnly) {
    const rest = text.slice(hourOnly.end);
    if (DURATION_TAIL.test(rest)) return null;
    const hour = Number(hourOnly.groups[0]);
    if (hour <= 23) {
      /* "ב־5" almost always means the afternoon in a planning context. Below 7
       * is read as PM; the preview shows the resolved time, so a person who
       * meant 05:00 sees 17:00 and fixes it before saving. */
      const resolved = hour < 7 ? hour + 12 : hour;
      return {
        minutes: resolved * 60,
        start: hourOnly.index,
        end: hourOnly.end,
        matched: hourOnly.matched,
        exact: false,
        assumedAfternoon: hour < 7,
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Date
 * ------------------------------------------------------------------ */

export function parseDate(text, fromIso) {
  const base = fromIso || todayIso();

  /* Longest first again: מחרתיים contains מחר. */
  const relative = [
    { source: 'מחרתיים', days: 2 },
    { source: 'מחר', days: 1 },
    { source: 'היום', days: 0 },
    { source: 'שלשום', days: -2 },
    { source: 'אתמול', days: -1 },
  ];
  for (const r of relative) {
    const found = findWord(text, r.source);
    if (found) {
      return {
        date: addDays(base, r.days), start: found.index, end: found.end, matched: found.matched, kind: 'relative',
      };
    }
  }

  /* בעוד יומיים / בעוד 3 ימים / בעוד שבוע / בעוד שבועיים */
  const inN = findWord(text, 'בעוד\\s+(?:(\\d+)\\s*)?(ימים|יומיים|יום|שבועיים|שבועות|שבוע|חודשיים|חודש)');
  if (inN) {
    const explicit = inN.groups[0] ? parseInt(inN.groups[0], 10) : null;
    const word = inN.groups[1];
    let days;
    if (word === 'יומיים') days = 2;
    else if (word === 'שבועיים') days = 14;
    else if (word === 'חודשיים') days = 60;
    else if (word === 'שבוע' || word === 'שבועות') days = (explicit || 1) * 7;
    else if (word === 'חודש') days = (explicit || 1) * 30;
    else days = explicit || 1;
    return { date: addDays(base, days), start: inN.index, end: inN.end, matched: inN.matched, kind: 'relative' };
  }

  /* ביום ראשון / יום ראשון / בראשון / ביום א׳ — the next such day, not today
   * even when today matches, because "ביום ראשון" said on a Sunday means the
   * next one.
   *
   * A bare day letter is too weak to accept on its own: ב is a preposition and
   * ה is the definite article, so "בא׳" would fire on ordinary text. The
   * letter form is only honoured behind an explicit יום. */
  for (let i = 0; i < DAY_NAMES.length; i += 1) {
    const [full, letter] = DAY_NAMES[i];
    const found = findWord(text, `(?:ב?יום\\s+ב?(?:${full}|${letter}['׳])|ב?${full})`);
    if (!found) continue;
    const current = dayOfWeek(base);
    let delta = (i - current + 7) % 7;
    if (delta === 0) delta = 7;
    return {
      date: addDays(base, delta), start: found.index, end: found.end, matched: found.matched, kind: 'dayName',
    };
  }

  /* 14.8 / 14/8 / 14.08.2026 — day first, always. An Israeli writing 3.4 means
   * the third of April, and there is no configuration that changes that here. */
  const numeric = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : null;
    if (year !== null && year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const baseYear = Number(base.slice(0, 4));
      if (year === null) {
        year = baseYear;
        const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
        /* No year given and the date has passed — they mean next year. */
        if (candidate < base) year = baseYear + 1;
      }
      const iso = `${year}-${pad2(month)}-${pad2(day)}`;
      if (isValidIso(iso)) {
        return { date: iso, start: numeric.index, end: numeric.index + numeric[0].length, matched: numeric[0], kind: 'numeric' };
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Recurrence, priority, tags
 * ------------------------------------------------------------------ */

export function parseRecurrence(text) {
  /* A named day must be tried before the generic "כל יום", or "כל יום ראשון"
   * is read as daily and the day name is left in the title. */
  for (let i = 0; i < DAY_NAMES.length; i += 1) {
    const found = findWord(text, `כל\\s+(?:יום\\s+)?${DAY_NAMES[i][0]}`);
    if (found) {
      return { recurrence: 'weekly', days: [i], start: found.index, end: found.end, matched: found.matched };
    }
  }

  /* Only the explicit "כל X" forms. The bare adjectives יומי and שבועי were
   * here and had to go: "דוח שבועי" is the name of a report, not an
   * instruction to repeat the task every week, and there is no way to tell
   * those apart without understanding the sentence. */
  const table = [
    { source: 'כל\\s+יום', recurrence: 'daily' },
    { source: 'כל\\s+שבוע', recurrence: 'weekly' },
    { source: 'כל\\s+חודש', recurrence: 'monthly' },
  ];
  for (const row of table) {
    const found = findWord(text, row.source);
    if (found) {
      return { recurrence: row.recurrence, start: found.index, end: found.end, matched: found.matched };
    }
  }
  return null;
}

export function parseUrgency(text) {
  const found = findWord(text, '(דחוף|בדחיפות|חשוב)');
  if (found) {
    const word = found.groups[0];
    const urgent = word === 'דחוף' || word === 'בדחיפות';
    return {
      urgency: urgent ? 5 : 3,
      importance: urgent ? 4 : 5,
      start: found.index,
      end: found.end,
      matched: found.matched,
    };
  }

  /* Trailing bangs. Not word-bounded — they are punctuation. */
  const bangs = /(!{1,3})\s*$/.exec(text);
  if (bangs) {
    return {
      urgency: bangs[1].length >= 2 ? 5 : 4,
      importance: bangs[1].length >= 3 ? 5 : 4,
      start: bangs.index,
      end: bangs.index + bangs[0].length,
      matched: bangs[0],
    };
  }
  return null;
}

export function parseTags(text) {
  const tags = [];
  const spans = [];
  const re = /(?:^|\s)#([\wא-ת-]{1,24})/g;
  let m = re.exec(text);
  while (m) {
    tags.push(m[1]);
    spans.push({ start: m.index + m[0].indexOf('#'), end: m.index + m[0].length });
    m = re.exec(text);
  }
  return tags.length ? { tags, spans } : null;
}

/* ------------------------------------------------------------------ *
 * The whole sentence
 * ------------------------------------------------------------------ */

/**
 * Parse a captured line into task fields.
 *
 * Order is deliberate: duration before time, because "45 דקות" contains a
 * number that the time patterns would otherwise be tempted by, and removing it
 * first means the time pattern never sees it. Date before both, because a
 * date like "14.8" contains digits and a separator that the 17.00 time form
 * would match.
 */
export function parseCapture(text, opts) {
  const o = opts || {};
  const original = String(text || '').trim();
  if (!original) {
    return { ok: false, title: '', original, matched: [], confidence: 0 };
  }

  let rest = original;
  const matched = [];

  const spans = [];
  function take(result, kind) {
    if (!result) return null;
    spans.push({ start: result.start, end: result.end, kind, matched: result.matched });
    matched.push({ kind, text: result.matched });
    return result;
  }

  /* Recurrence first. "כל יום ראשון" contains a day name, and letting the date
   * parser reach it first turns a weekly rule into a one-off next Sunday and
   * leaves a stray "כל" in the title — which is exactly what it did. */
  const recurrence = take(parseRecurrence(rest), 'recurrence');
  if (recurrence) rest = cut(rest, recurrence.start, recurrence.end);

  const date = take(parseDate(rest, o.today), 'date');
  if (date) rest = cut(rest, date.start, date.end);

  const duration = take(parseDuration(rest), 'duration');
  if (duration) rest = cut(rest, duration.start, duration.end);

  const time = take(parseTime(rest), 'time');
  if (time) rest = cut(rest, time.start, time.end);

  const urgency = take(parseUrgency(rest), 'urgency');
  if (urgency) rest = cut(rest, urgency.start, urgency.end);

  const tags = parseTags(rest);
  if (tags) {
    for (const span of tags.spans.slice().reverse()) rest = cut(rest, span.start, span.end);
    matched.push({ kind: 'tags', text: tags.tags.join(', ') });
  }

  /* Clean the leftovers. Removing "17:00" from "מחר ב־17:00 ללמוד" leaves a
   * stranded "ב־" — the preposition belonged to the number that is gone. Any
   * one-letter Hebrew preposition standing alone as a token, with or without a
   * maqaf, is debris and goes. */
  let title = rest
    .replace(/(^|\s)[בלמהוכש][־-]?(?=\s|$)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,،.\-־]+/, '')
    .replace(/[\s,،.\-־]+$/, '')
    .trim();

  /* Nothing recognisable left. Better to keep the whole line as the title than
   * to produce a task called "ב". */
  if (title.length < 2) {
    title = original;
    matched.length = 0;
  }

  /*
   * A time means a plan; a date alone means a deadline.
   *
   * "מחר ב־17:00 ללמוד מתמטיקה" is somebody deciding when to do something, and
   * writing a due date from it manufactures a deadline nobody set — which then
   * drives the urgency term in the priority engine and pushes real deadlines
   * down the list. "14.9 להגיש עבודה" is a deadline, and it is also a
   * reasonable day to plan the work, so it sets both.
   */
  const fields = {};
  if (time) {
    fields.scheduledStart = time.minutes;
    fields.scheduledEnd = Math.min(1440, time.minutes + (duration ? duration.minutes : 25));
    /* A time with no date means today — or tomorrow, if that time has already
     * passed, which is what a person means at 22:00 typing "ב־9". */
    if (date) {
      fields.scheduledDate = date.date;
    } else {
      const nowM = o.nowMinutes === undefined ? -1 : o.nowMinutes;
      const day = o.today || todayIso();
      fields.scheduledDate = (nowM >= 0 && time.minutes < nowM) ? addDays(day, 1) : day;
    }
  } else if (date) {
    fields.dueDate = date.date;
    fields.scheduledDate = date.date;
  }
  if (duration) fields.estimatedMinutes = duration.minutes;
  if (recurrence) {
    fields.recurrence = recurrence.recurrence;
    if (recurrence.days) fields.recurrenceDays = recurrence.days;
  }
  if (urgency) {
    fields.urgency = urgency.urgency;
    fields.importance = urgency.importance;
  }
  if (tags) fields.tags = tags.tags;

  /* Confidence is about how much of the line was understood, not about whether
   * the task is any good. It drives one decision: whether the capture box saves
   * silently or shows a preview first. */
  const understood = spans.reduce((sum, s) => sum + (s.end - s.start), 0);
  const confidence = matched.length === 0
    ? 0
    : Math.min(1, 0.4 + (understood / Math.max(1, original.length)) * 0.6);

  return {
    ok: true,
    original,
    title,
    fields,
    matched,
    confidence,
    /* A person should confirm when the parser did something non-obvious —
     * assumed an afternoon hour, or read a bare number as a date. */
    needsConfirmation: !!(time && !time.exact) || (confidence > 0 && confidence < 0.55),
  };
}

/**
 * Which project a captured line probably belongs to.
 *
 * Word overlap against project titles, nothing cleverer. It suggests; it never
 * assigns. Two shared words in a title of four is a strong signal; one shared
 * word is not, which is why the threshold is a ratio rather than a count.
 */
export function guessProject(title, projects) {
  const words = tokenise(title);
  if (words.size < 1) return null;

  let best = null;
  for (const project of projects || []) {
    if (project.status === 'done') continue;
    const projectWords = tokenise(project.title);
    if (!projectWords.size) continue;
    let shared = 0;
    for (const w of words) if (projectWords.has(w)) shared += 1;
    if (!shared) continue;
    const score = shared / Math.min(words.size, projectWords.size);
    if (!best || score > best.score) best = { project, score, shared };
  }

  return best && best.score >= 0.4 ? best : null;
}

function tokenise(text) {
  const out = new Set();
  for (const raw of String(text || '').toLowerCase().split(/[\s,.\-־"'()]+/)) {
    /* Hebrew's one-letter prefixes (ב, ל, ה, ו, מ, כ, ש) attach to nouns, so
     * "לאתר" and "אתר" are the same word for matching purposes. Stripping one
     * leading letter from a word of four or more is crude and works. */
    const word = raw.length >= 4 && /^[בלהומכש]/.test(raw) ? raw.slice(1) : raw;
    if (word.length >= 3) out.add(word);
  }
  return out;
}
