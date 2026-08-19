/*
 * fmt.js — numbers, times and dates as Hebrew a person reads.
 *
 * Pure and Node-importable: it touches no DOM and holds no state, so the
 * engine can build a `detail` string for a factor and the validator can still
 * import the module that did it.
 *
 * Everything date-shaped is delegated to time.js rather than reimplemented.
 * There is exactly one clock in this app and one calendar, and a second copy
 * of "what does 1470 minutes render as" is how a timeline ends up an hour off
 * from the card above it.
 */

import { fromMinutes, parseKey, isValidKey, dayOfWeek, diffDays, todayKey } from './time.js';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי',
  'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/*
 * What a value that does not exist yet looks like.
 *
 * Accuracy before the first review, confidence before the first day, a
 * completion rate with nothing completed — the contract is emphatic that
 * these are null and not zero, and null means "no signal", never "we measured
 * and got nothing". An em dash says that without pretending. Printing '0%'
 * instead would be the app inventing a measurement it never took.
 */
const UNKNOWN = '—';

/* The real minus, U+2212, not the hyphen on the keyboard. See signed(). */
const MINUS = '−';

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

/*
 * Reads a number the way this app means one, where null is a word and not a
 * zero: no observation yet, no personal signal, nothing measured. Number()
 * turns null and '' into 0, which is exactly the confusion the contract keeps
 * warning about — a confidence that was never computed would print as 0% and
 * read like a finding. Anything that is not a real number arrives here as NaN
 * and leaves the caller showing a dash.
 */
function value(n) {
  if (n === null || n === undefined || n === '') return NaN;
  return Number(n);
}

/* ------------------------------------------------------------------ *
 * Clock
 * ------------------------------------------------------------------ */

/**
 * A time of day. `format` is '24h' or '12h' from the profile; anything else
 * is treated as 24h, which is what almost every Hebrew UI shows.
 *
 * The 12h branch drops the leading zero on purpose. '07:30 לפנה״צ' reads like
 * a 24-hour clock that someone bolted a label onto; '7:30 לפנה״צ' is how the
 * hour is spoken.
 */
export function time(m, format) {
  const clock = fromMinutes(m);
  if (format !== '12h') return clock;
  const h24 = Number(clock.slice(0, 2));
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${clock.slice(3)} ${h24 < 12 ? 'לפנה״צ' : 'אחה״צ'}`;
}

/**
 * A span, from a start and a length: '10:00–11:00'.
 *
 * The separator is an en dash, and the result must NOT be wrapped in
 * signedNum() or any other dir="ltr" span. A range reads correctly as it
 * stands inside Hebrew prose — the reader meets 10:00 first and 11:00 second,
 * both intact — and forcing it left-to-right is the bug, not the fix. dom.js
 * has the long version of why.
 *
 * The end wraps at midnight through fromMinutes(), so a late item shows
 * '23:30–00:30' rather than a 24:30 that exists on no clock.
 */
export function range(start, dur, format) {
  return `${time(start, format)}–${time(Number(start) + Number(dur), format)}`;
}

/* ------------------------------------------------------------------ *
 * Durations
 * ------------------------------------------------------------------ */

/**
 * A length of time in words: 45 → '45 דק׳', 60 → 'שעה', 95 → '1 שעה 35 דק׳',
 * 120 → 'שעתיים'.
 *
 * Hebrew has a dual, and a whole two hours is 'שעתיים' — writing '2 שעות'
 * there is the kind of wrong that makes an app feel translated. The dual only
 * fits when the number stands alone, though. With minutes attached the hour
 * count goes back to a numeral, so '1 שעה 35 דק׳' and '2 שעות 5 דק׳' line up
 * as a column in the timeline instead of one row starting with a word and the
 * next with a digit.
 *
 * A negative length is a bug upstream, not a thing to render, so it floors at
 * zero and shows '0 דק׳' — the same string an empty day gets.
 */
export function duration(mins) {
  const total = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} דק׳`;
  if (m === 0) {
    if (h === 1) return 'שעה';
    if (h === 2) return 'שעתיים';
    return `${h} שעות`;
  }
  return `${h} ${h === 1 ? 'שעה' : 'שעות'} ${m} דק׳`;
}

/** The same length as digits, for tight places: 95 → '1:35', 45 → '0:45'. */
export function durationShort(mins) {
  const total = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

/*
 * A day name from a key.
 *
 * Storage can hand back a key that migration did not catch, and a render path
 * is the worst place to throw: one bad row would blank the whole screen
 * instead of one label. So an unreadable key comes back as a dash here, while
 * time.js still throws for the engine, where a wrong day has to be loud.
 *
 * A missing `now` in the two functions below is a different kind of wrong —
 * that is a caller forgetting to inject the clock, and it stays an exception.
 */
export function dayName(key) {
  if (!isValidKey(key)) return UNKNOWN;
  return DAY_NAMES[dayOfWeek(key)];
}

export function dayShort(key) {
  if (!isValidKey(key)) return UNKNOWN;
  return DAY_SHORT[dayOfWeek(key)];
}

/**
 * How a date is titled on a card: 'היום', 'מחר', 'מחרתיים', 'אתמול',
 * 'שלשום', and past that a written date — 'יום שלישי, 3 בספטמבר'.
 *
 * Saturday is 'שבת' with no 'יום' in front. Hebrew names the other six days
 * as the first, second, third and so on, which needs the word 'יום' to make
 * sense of the ordinal; Shabbat has a name of its own and 'יום שבת' sounds
 * like someone reading a table out loud.
 *
 * The year appears only when it is not the current one. On a history screen
 * scrolled back far enough, '3 בספטמבר' alone stops being a date.
 */
export function dateLabel(key, now) {
  if (!isValidKey(key)) return UNKNOWN;
  const delta = diffDays(key, todayKey(now));
  if (delta === 0) return 'היום';
  if (delta === 1) return 'מחר';
  if (delta === 2) return 'מחרתיים';
  if (delta === -1) return 'אתמול';
  if (delta === -2) return 'שלשום';
  const { y, m, d } = parseKey(key);
  const name = dayOfWeek(key) === 6 ? 'שבת' : `יום ${DAY_NAMES[dayOfWeek(key)]}`;
  const year = y === now.getFullYear() ? '' : ` ${y}`;
  return `${name}, ${d} ב${MONTHS[m - 1]}${year}`;
}

/**
 * The same date said as a distance: 'מחר', 'בעוד 3 ימים', 'לפני יומיים'.
 *
 * This is not dateLabel() with different words. dateLabel names a day and
 * belongs on a card title; relDay answers "how far is that" and belongs in a
 * sentence — 'הדפוס הזה חזר על עצמו לפני יומיים'.
 *
 * Which is why two days back is 'לפני יומיים' while two days ahead is
 * 'מחרתיים'. It reads asymmetric written down and is not asymmetric spoken:
 * 'מחרתיים' is the ordinary word for the day after tomorrow and turns up in
 * conversation constantly, whereas 'שלשום' is bookish enough that a distance
 * phrase carries better. Both spellings come straight from the contract's own
 * examples for these two functions.
 */
export function relDay(key, now) {
  if (!isValidKey(key)) return UNKNOWN;
  const delta = diffDays(key, todayKey(now));
  if (delta === 0) return 'היום';
  if (delta === 1) return 'מחר';
  if (delta === 2) return 'מחרתיים';
  if (delta === -1) return 'אתמול';
  if (delta === -2) return 'לפני יומיים';
  if (delta > 0) return `בעוד ${delta} ימים`;
  return `לפני ${-delta} ימים`;
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/** A percentage that is already 0..100, not a 0..1 fraction: 84 → '84%'. */
export function pct(n) {
  const v = value(n);
  if (!Number.isFinite(v)) return UNKNOWN;
  return `${Math.round(v)}%`;
}

/**
 * A delta with its sign kept: '+8', '−3', and a bare '0' for no change,
 * because nothing moved and '+0' claims a direction.
 *
 * The minus is U+2212 and not the hyphen-minus next to the zero key. A hyphen
 * is a punctuation mark drawn short and low; set against the plus in a column
 * of factor deltas it sits at the wrong height and half the width, and the
 * column stops looking like numbers. IBM Plex Mono, which this app uses for
 * numerals, cuts U+2212 to match its plus exactly.
 *
 * Anything from here that lands inside Hebrew prose has to be wrapped by
 * signedNum() from dom.js. The sign is bidi-neutral and detaches from its own
 * digits in an RTL run — '+8' shows up as '8+' — and that wrapper is the one
 * fix for it.
 */
export function signed(n) {
  const v = Math.round(value(n));
  if (!Number.isFinite(v)) return UNKNOWN;
  if (v > 0) return `+${v}`;
  if (v < 0) return `${MINUS}${-v}`;
  return '0';
}

/**
 * A plain integer, grouped in thousands: 1234 → '1,234'.
 *
 * Deliberately not toLocaleString('he-IL'). Intl reads its digit shapes and
 * its grouping mark out of whatever ICU data the runtime shipped with, so the
 * same number can come back differently in Node than in the browser — and
 * every string this module builds ends up inside forecast JSON that the
 * validator compares byte for byte. A hand-rolled group is boring and
 * identical everywhere.
 */
export function num(n) {
  const v = value(n);
  if (!Number.isFinite(v)) return UNKNOWN;
  const r = Math.round(v);
  const digits = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return r < 0 ? `${MINUS}${digits}` : digits;
}

/**
 * The Hebrew band for a day score. The bands are §5 of the contract and the
 * only place they are written as words, so a score and its label can never
 * disagree between the ring and the history row.
 */
export function scoreLabel(score) {
  const v = value(score);
  if (!Number.isFinite(v)) return UNKNOWN;
  if (v < 55) return 'יום מאתגר';
  if (v < 70) return 'יום סביר';
  if (v < 85) return 'יום טוב';
  return 'יום טוב מאוד';
}
