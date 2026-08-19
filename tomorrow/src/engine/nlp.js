/*
 * nlp.js — reading "מחר ב-17:00 יש לי אימון של שעה".
 *
 * A real parser, and an honest one. It handles the phrasings people actually
 * type — relative days, weekday names, clock times in three or four shapes,
 * durations, the words that name a kind of activity — and everything it cannot
 * read comes back as null with a sentence saying so.
 *
 * The honesty is the whole design. A parser that guesses silently is right nine
 * times in ten and, on the tenth, books a meeting on the wrong day without
 * mentioning it — and the user has no way to know which kind of result they are
 * looking at. So `matched` reports field by field what was actually understood,
 * the interface shows the parse before anything is saved, and nothing here ever
 * writes.
 *
 * No language model is involved and none is needed. This is a bounded problem
 * with a small vocabulary, and a few hundred lines of rules beat a network round
 * trip on every axis that matters here: it is instant, it works offline, it is
 * deterministic, and when it is wrong it is wrong in ways somebody can see.
 */

import { addDays, isValidKey, dayOfWeek } from '../core/time.js';

/*
 * Word boundaries that actually work in Hebrew.
 *
 * JavaScript's \b is defined against \w, which is [A-Za-z0-9_] and contains no
 * Hebrew at all. So /\bמחר\b/ asks for a transition between a word character
 * and a non-word one, finds two non-word characters on either side of the word,
 * and never matches — silently, on every pattern in this file. Every date, time
 * and duration came back null and the whole sentence fell through to the title.
 *
 * These are negative lookarounds instead: "not preceded by, and not followed by,
 * a letter or a digit in any script". They are zero-width, so capture group
 * numbering and match.index are unaffected, which matters because cut() slices
 * on both.
 */
const LB = '(?<![\\u0590-\\u05FFA-Za-z0-9])';
const LA = '(?![\\u0590-\\u05FFA-Za-z0-9])';

/** Build a boundary-safe pattern from a source string. */
function rx(source, flags) {
  return new RegExp(LB + source + LA, flags);
}

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

const WEEKDAYS = [
  { day: 0, words: ['ראשון', 'א׳', "א'"] },
  { day: 1, words: ['שני', 'ב׳', "ב'"] },
  { day: 2, words: ['שלישי', 'ג׳', "ג'"] },
  { day: 3, words: ['רביעי', 'ד׳', "ד'"] },
  { day: 4, words: ['חמישי', 'ה׳', "ה'"] },
  { day: 5, words: ['שישי', 'ו׳', "ו'"] },
  { day: 6, words: ['שבת', 'ש׳'] },
];

/* Hebrew number words, up to twelve — past that people type digits. */
const NUMBER_WORDS = {
  'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שנים': 2,
  'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
  'עשר': 10, 'עשרה': 10, 'אחת עשרה': 11, 'שתים עשרה': 12,
};

const TYPES = [
  { type: 'workout', category: 'fitness', energy: 'high', focus: 'low', words: ['אימון', 'ריצה', 'חדר כושר', 'שחייה', 'אימונים', 'כושר', 'יוגה'] },
  { type: 'meeting', category: 'work', energy: 'medium', focus: 'medium', words: ['פגישה', 'פגישת', 'ישיבה', 'שיחה עם', 'זום', 'ראיון'] },
  { type: 'study', category: 'study', energy: 'medium', focus: 'high', words: ['ללמוד', 'לימודים', 'שיעור', 'שיעורי בית', 'מבחן', 'להתכונן', 'תרגול', 'הרצאה'] },
  { type: 'break', category: 'personal', energy: 'low', focus: 'low', words: ['הפסקה', 'לנוח', 'מנוחה'] },
  { type: 'event', category: 'personal', energy: 'medium', focus: 'low', words: ['אירוע', 'יום הולדת', 'חתונה', 'הופעה'] },
  { type: 'task', category: 'personal', energy: 'medium', focus: 'medium', words: ['משימה', 'לעשות', 'לסדר', 'לכתוב', 'לקרוא'] },
];

/* Words that carry no meaning once the fields are extracted, and would otherwise
 * be left stranded in the title: "יש לי אימון" -> "אימון". */
const FILLER = ['יש לי', 'צריך', 'צריכה', 'אני', 'רוצה', 'לי', 'את', 'של', 'בשעה', 'בערך', 'בסביבות'];

const PERIODS = [
  { words: ['בבוקר', 'בוקר'], min: 5, max: 11, add: 0 },
  { words: ['בצהריים', 'צהריים'], min: 12, max: 14, add: 12 },
  { words: ['אחה"צ', 'אחהצ', 'אחר הצהריים', 'אחרי הצהריים'], min: 12, max: 18, add: 12 },
  { words: ['בערב', 'ערב'], min: 17, max: 23, add: 12 },
  { words: ['בלילה', 'לילה'], min: 20, max: 23, add: 12 },
];

/* ------------------------------------------------------------------ *
 * Small tools
 * ------------------------------------------------------------------ */

/** Cut a matched phrase out of the working text so it cannot be read twice. */
function cut(text, match) {
  if (!match) return text;
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Date
 * ------------------------------------------------------------------ */

/*
 * A weekday name means the next one that has not happened yet.
 *
 * "ביום שלישי" said on a Tuesday means next Tuesday, not today — if somebody
 * meant today they would say היום. Seven days ahead rather than zero.
 */
function nextWeekday(today, target) {
  const current = dayOfWeek(today);
  let delta = (target - current + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, delta);
}

function readDate(text, today) {
  const relatives = [
    { re: rx('מחרתיים'), days: 2 },
    { re: rx('בעוד\\s+יומיים'), days: 2 },
    { re: rx('בעוד\\s+(\\d+)\\s+ימים'), days: null },
    { re: rx('מחר'), days: 1 },
    { re: rx('היום'), days: 0 },
  ];

  for (const r of relatives) {
    const m = r.re.exec(text);
    if (!m) continue;
    const days = r.days === null ? Number(m[1]) : r.days;
    if (!Number.isFinite(days) || days < 0 || days > 365) continue;
    return { date: addDays(today, days), text: cut(text, m) };
  }

  for (const wd of WEEKDAYS) {
    for (const word of wd.words) {
      const re = rx(`ב?יום\\s+${word}|ב${word}`);
      const m = re.exec(text);
      if (m) return { date: nextWeekday(today, wd.day), text: cut(text, m) };
    }
  }

  // An explicit date, day-first as everything in Hebrew is written.
  const dm = rx('(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?').exec(text);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : Number(today.slice(0, 4));
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isValidKey(key)) return { date: key, text: cut(text, dm) };
  }

  return { date: null, text };
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/*
 * Turning a bare hour into a real one.
 *
 * "ב-8" is eight in the morning or eight in the evening depending on what else
 * is in the sentence, and when nothing else is, on what people mean: a bare 1
 * through 7 is almost always the afternoon or evening, because nobody schedules
 * anything at four in the morning without saying so. Anything from 8 to 12 is
 * read as written. This is a guess, and it is recorded as one — the interface
 * shows the parsed time before saving precisely so it can be corrected.
 */
function disambiguateHour(hour, text) {
  for (const p of PERIODS) {
    for (const word of p.words) {
      if (!text.includes(word)) continue;
      if (hour >= 1 && hour <= 11 && p.add === 12) return hour + 12;
      return hour;
    }
  }
  if (hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function readTime(text) {
  /*
   * Each pattern swallows the preposition that introduces it — "ב-", "בשעה" —
   * so the whole phrase leaves the working text together. Cutting only the
   * digits left a stranded "ב" in every title, which is how "מחר ב-17:00 אימון"
   * came out named "מחר ב אימון".
   */

  // 17:00, 9:30
  const hm = rx('(?:ב-?\\s*|בשעה\\s+)?(\\d{1,2}):(\\d{2})').exec(text);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h < 24 && m < 60) return { minutes: h * 60 + m, text: cut(text, hm), exact: true };
  }

  // "ב-8 וחצי", "בשמונה וחצי", "בשעה 9 וחצי"
  const fractional = rx('(?:ב-?\\s*|בשעה\\s+)?([\\u0590-\\u05FF]+|\\d{1,2})\\s+ו(חצי|רבע)').exec(text);
  if (fractional) {
    const hour = toHour(fractional[1]);
    if (hour !== null) {
      const extra = fractional[2] === 'חצי' ? 30 : 15;
      return { minutes: disambiguateHour(hour, text) * 60 + extra, text: cut(text, fractional), exact: true };
    }
  }

  // "רבע לתשע", "עשרה לשמונה"
  const quarterTo = rx('רבע\\s+ל([\\u0590-\\u05FF]+|\\d{1,2})').exec(text);
  if (quarterTo) {
    const hour = toHour(quarterTo[1]);
    if (hour !== null) return { minutes: disambiguateHour(hour, text) * 60 - 15, text: cut(text, quarterTo), exact: true };
  }

  // "בשעה 8", "ב-17", "ב8", "בשמונה"
  const bare = firstMatch(text, [
    rx('בשעה\\s+([\\u0590-\\u05FF]+|\\d{1,2})'),
    rx('ב-\\s*(\\d{1,2})'),
    rx('ב(\\d{1,2})'),
    rx('ב([\\u0590-\\u05FF]{3,})'),
  ]);
  if (bare) {
    const hour = toHour(bare[1]);
    if (hour !== null && hour >= 0 && hour < 24) {
      return { minutes: disambiguateHour(hour, text) * 60, text: cut(text, bare), exact: false };
    }
  }

  return { minutes: null, text, exact: false };
}

function toHour(token) {
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return n >= 0 && n < 24 ? n : null;
  }
  const clean = token.replace(/^ב/, '');
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, clean)) return NUMBER_WORDS[clean];
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) return NUMBER_WORDS[token];
  return null;
}

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

function readDuration(text) {
  /*
   * "של" is swallowed with the number where it appears, so "אימון של שעה"
   * leaves "אימון" rather than "אימון של". Ordered longest-phrase-first: "שעה
   * וחצי" has to be tried before "שעה", or every hour and a half becomes an
   * hour with a stray "וחצי" in its name.
   */
  const patterns = [
    { re: rx('(?:של\\s+)?שעתיים\\s+ו?חצי'), minutes: 150 },
    { re: rx('(?:של\\s+)?שעה\\s+ו?חצי'), minutes: 90 },
    { re: rx('(?:של\\s+)?שעתיים'), minutes: 120 },
    { re: rx('(?:של\\s+)?חצי\\s+שעה'), minutes: 30 },
    { re: rx('(?:של\\s+)?רבע\\s+שעה'), minutes: 15 },
    { re: rx('(?:של\\s+)?(\\d{1,3})\\s*(?:דק|דק\'|דקות|דקה)'), minutes: null, group: 1 },
    { re: rx('(?:של\\s+)?(\\d{1,2})\\s*שעות'), minutes: null, group: 1, scale: 60 },
    { re: rx('(?:של\\s+)?([\\u0590-\\u05FF]+)\\s+שעות'), minutes: null, group: 1, words: true, scale: 60 },
    { re: rx('(?:של\\s+)?שעה'), minutes: 60 },
  ];

  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    let value;
    if (p.minutes !== null) value = p.minutes;
    else if (p.words) {
      const n = toHour(m[p.group]);
      value = n === null ? NaN : n * (p.scale || 1);
    } else value = Number(m[p.group]) * (p.scale || 1);
    if (!Number.isFinite(value) || value < 5 || value > 600) continue;
    return { minutes: value, text: cut(text, m) };
  }
  return { minutes: null, text };
}

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ */

function readType(text) {
  for (const spec of TYPES) {
    for (const word of spec.words) {
      const at = text.indexOf(word);
      if (at < 0) continue;
      // The word stays in the title — "אימון" is the name of the thing, not
      // only its type — so nothing is cut here.
      return { spec, text };
    }
  }
  return { spec: null, text };
}

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function cleanTitle(text) {
  let out = ` ${text} `;
  // Words that were only ever there to disambiguate a time. Leaving them makes
  // every evening appointment called "בערב something".
  for (const p of PERIODS) for (const word of p.words) out = out.split(` ${word} `).join(' ');
  for (const word of FILLER) out = out.split(` ${word} `).join(' ');
  return out
    .replace(/[-–—]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;]+|[\s,.:;]+$/g, '')
    .trim();
}

/* ------------------------------------------------------------------ *
 * The parser
 * ------------------------------------------------------------------ */

/**
 * Read one sentence into the beginnings of an item.
 *
 * `ctx` needs `today` and may carry the profile. Nothing is written anywhere;
 * the caller shows the result and the user confirms it.
 */
export function parseQuickAdd(text, ctx) {
  const raw = String(text || '').trim();
  const today = (ctx && ctx.today) || null;

  if (!raw || !today) {
    return {
      ok: false, item: null,
      matched: { date: false, time: false, duration: false, type: false, title: false },
      confidence: 0,
      note: 'לא הצלחתי לקרוא מזה כלום. אפשר לכתוב משהו כמו "מחר ב-17:00 אימון של שעה".',
    };
  }

  let working = ` ${raw} `;

  const date = readDate(working, today);
  working = date.text;

  const time = readTime(working);
  working = time.text;

  const duration = readDuration(working);
  working = duration.text;

  const type = readType(working);
  const title = cleanTitle(type.text);

  const matched = {
    date: date.date !== null,
    time: time.minutes !== null,
    duration: duration.minutes !== null,
    type: type.spec !== null,
    title: title.length > 0,
  };

  if (!matched.title) {
    return {
      ok: false, item: null, matched, confidence: 0,
      note: 'הבנתי את הזמן, אבל לא נשאר לי שם למשימה. אפשר להוסיף במה מדובר.',
    };
  }

  const spec = type.spec || TYPES[TYPES.length - 1];
  const minutes = duration.minutes !== null ? duration.minutes : defaultDuration(spec.type);
  const isEvent = spec.type === 'event' || spec.type === 'meeting';

  const item = {
    kind: isEvent ? 'event' : 'task',
    type: spec.type,
    title,
    notes: '',
    date: date.date || today,
    start: time.minutes === null ? null : Math.max(0, Math.min(1439, time.minutes)),
    duration: minutes,
    estimatedDuration: minutes,
    locked: isEvent,
    category: spec.category,
    priority: isEvent ? 'high' : 'medium',
    deadline: null,
    difficulty: spec.focus === 'high' ? 4 : spec.focus === 'medium' ? 3 : 2,
    energyRequirement: spec.energy,
    focusRequirement: spec.focus,
    preferredTime: 'any',
    status: 'planned',
    isTop: false,
  };

  return {
    ok: true,
    item,
    matched,
    confidence: confidenceOf(matched, time.exact),
    note: noteFor(matched, time.exact),
  };
}

/* A sensible length for something with no length given, by kind. Stated rather
 * than defaulted to thirty for everything, because an hour-long workout typed as
 * "מחר אימון" should not arrive as half an hour. */
function defaultDuration(type) {
  switch (type) {
    case 'workout': return 60;
    case 'meeting': return 45;
    case 'study': return 45;
    case 'break': return 20;
    case 'event': return 90;
    default: return 30;
  }
}

function confidenceOf(matched, exactTime) {
  let score = 30;
  if (matched.title) score += 20;
  if (matched.date) score += 18;
  if (matched.time) score += exactTime ? 22 : 12;
  if (matched.duration) score += 12;
  if (matched.type) score += 8;
  return Math.min(100, score);
}

/*
 * What was not understood, in the user's own terms.
 *
 * Silence here would be the failure mode this whole module exists to avoid, so
 * there is always a sentence — including when everything was read, because
 * "I understood all of it" is itself information worth having before saving.
 */
function noteFor(matched, exactTime) {
  const missing = [];
  if (!matched.date) missing.push('תאריך');
  if (!matched.time) missing.push('שעה');
  if (!matched.duration) missing.push('משך');

  if (!missing.length) {
    return exactTime ? '' : 'ניחשתי אם מדובר בבוקר או בערב — שווה לוודא.';
  }
  return `לא זיהיתי ${missing.join(' ו')} — השלמתי לפי ברירת מחדל, אפשר לתקן למטה.`;
}
