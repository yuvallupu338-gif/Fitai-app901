/*
 * time.js — every date and time question the app asks.
 *
 * THE PROBLEM THIS FILE EXISTS TO SOLVE.
 *
 * A planner reasons in wall-clock time: "17:00 on Tuesday", "the free window
 * between the lesson and dinner", "how many minutes are left today". A browser
 * reasons in the machine's local timezone, which is whatever the traveller's
 * laptop is set to. Those agree until they do not, and when they disagree the
 * failure is silent — a day plan quietly built for the wrong seven hours.
 *
 * So nothing here uses the local timezone. A day is an ISO date string in the
 * app's zone ('2026-08-14'); a time of day is minutes after midnight (1020 for
 * 17:00); an instant is a UTC millisecond count. Conversion between them goes
 * through Intl with an explicit timeZone, which is the only mechanism in the
 * platform that knows when Israel changes its clocks.
 *
 * ISRAELI DAYLIGHT SAVING IS NOT DECORATIVE.
 *
 * The clocks move at 02:00 on the Friday before the last Sunday in March, and
 * back on the last Sunday in October. That makes one day 23 hours long and
 * another 25. A planner that assumes 1440 minutes in a day will overbook the
 * spring day by an hour and leave the autumn day an hour short, once a year,
 * in a way nobody will connect to daylight saving. dayLengthMinutes() asks the
 * calendar instead of assuming, and the window arithmetic is built on instants
 * rather than on minute counts, so the gap simply is not there to fall into.
 *
 * WEEK STARTS SUNDAY. TIMES ARE 24-HOUR. There is no AM/PM anywhere in this
 * app, and no en-US date format; both are checked by the Hebrew audit.
 */

import { HE } from '../locales/he.js';

export const APP_TZ = 'Asia/Jerusalem';

/* Intl formatters are expensive to construct and are asked the same question
 * thousands of times while a month grid renders. */
const partsCache = new Map();

function partsFormatter(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** The wall-clock fields of an instant, in the app's timezone. */
export function zonedParts(instant, tz) {
  const parts = partsFormatter(tz || APP_TZ).formatToParts(new Date(instant));
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds.
 *
 * Read the instant's wall-clock fields in the zone, then reinterpret those
 * fields as if they were UTC. The difference is the offset that was in force —
 * which is the only way to get it, because the platform exposes no direct API.
 */
function offsetAt(instant, tz) {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant;
}

/**
 * A wall-clock time in the zone → the UTC instant it names.
 *
 * Two passes. The first guess uses the offset in force at the naive instant,
 * which is wrong exactly when the guess lands on the other side of a
 * transition; the second pass reads the offset at the corrected instant and
 * settles it.
 *
 * THE TWO AMBIGUOUS CASES, AND WHAT THIS DOES WITH THEM.
 *
 * A time that does not exist — 02:30 on a spring-forward morning, when the
 * clock goes straight from 02:00 to 03:00 — resolves to the instant the clock
 * jumped to. That is what a person means when they type one.
 *
 * A time that happens twice — 01:30 on an autumn morning, lived through once
 * at UTC+3 and again at UTC+2 — resolves to the SECOND occurrence. Some
 * libraries pick the first; either is defensible and the only real
 * requirement is that the choice is deterministic, because a planner that
 * returns different answers for the same input is worse than one that picks
 * the less conventional hour. It is asserted in the tests so it cannot drift
 * silently.
 *
 * Neither case can reach the planner in practice: both happen at 01:00–03:00,
 * and the working window is configurable but defaults to 08:00–22:00. What
 * does reach the planner is the day LENGTH, which dayLengthMinutes() gets
 * right by construction because it subtracts two real instants.
 */
export function instantFrom(year, month, day, hour, minute, tz) {
  const zone = tz || APP_TZ;
  const naive = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
  let instant = naive - offsetAt(naive, zone);
  const refined = naive - offsetAt(instant, zone);
  if (refined !== instant) instant = refined;
  return instant;
}

export function now() {
  return Date.now();
}

/* ------------------------------------------------------------------ *
 * ISO day strings
 * ------------------------------------------------------------------ */

function pad2(n) { return n < 10 ? `0${n}` : String(n); }

/** '2026-08-14' for an instant, in the app's zone. */
export function isoDay(instant, tz) {
  const p = zonedParts(instant === undefined ? Date.now() : instant, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function today(tz) { return isoDay(Date.now(), tz); }

/** Minutes after midnight, in the app's zone. */
export function minutesOfDay(instant, tz) {
  const p = zonedParts(instant === undefined ? Date.now() : instant, tz);
  return p.hour * 60 + p.minute;
}

export function nowMinutes(tz) { return minutesOfDay(Date.now(), tz); }

/** Parse '2026-08-14' without going through Date, which would apply local time. */
export function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function isValidIso(iso) { return parseIso(iso) !== null; }

/** The instant at which a given wall-clock minute of a given day occurs. */
export function instantAt(iso, minutes, tz) {
  const d = parseIso(iso);
  if (!d) return null;
  const m = Math.max(0, Math.round(minutes || 0));
  return instantFrom(d.year, d.month, d.day, Math.floor(m / 60), m % 60, tz);
}

export function startOfDay(iso, tz) { return instantAt(iso, 0, tz); }

/** Midnight that ends the day — i.e. midnight of the next day. */
export function endOfDay(iso, tz) { return startOfDay(addDays(iso, 1), tz); }

/**
 * How many minutes this calendar day actually contains.
 * 1440 on nearly every day; 1380 and 1500 twice a year.
 */
export function dayLengthMinutes(iso, tz) {
  return Math.round((endOfDay(iso, tz) - startOfDay(iso, tz)) / 60000);
}

/* Day arithmetic in the civil calendar. Date.UTC handles month lengths and
 * leap years, and because both ends are UTC-noon-free integers there is no
 * daylight-saving drift to accumulate. */
export function addDays(iso, n) {
  const d = parseIso(iso);
  if (!d) return iso;
  const ts = Date.UTC(d.year, d.month - 1, d.day) + n * 86400000;
  const x = new Date(ts);
  return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}`;
}

export function addMonths(iso, n) {
  const d = parseIso(iso);
  if (!d) return iso;
  const total = (d.year * 12) + (d.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(d.day, lastDay))}`;
}

/** Whole days from a to b. Positive when b is later. */
export function daysBetween(a, b) {
  const x = parseIso(a);
  const y = parseIso(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso) {
  const d = parseIso(iso);
  if (!d) return 0;
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function isWeekend(iso) {
  const dow = dayOfWeek(iso);
  return dow === 5 || dow === 6;
}

export function compareIso(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function isBefore(a, b) { return String(a) < String(b); }
export function isAfter(a, b) { return String(a) > String(b); }
export function isSameDay(a, b) { return String(a) === String(b); }
export function isPast(iso, ref) { return String(iso) < String(ref || today()); }
export function isToday(iso, ref) { return String(iso) === String(ref || today()); }
export function isFuture(iso, ref) { return String(iso) > String(ref || today()); }

/* ------------------------------------------------------------------ *
 * Weeks and months
 * ------------------------------------------------------------------ */

/** The Sunday (by default) on or before iso. */
export function startOfWeek(iso, weekStartsOn) {
  const start = weekStartsOn === undefined ? 0 : weekStartsOn;
  const shift = (dayOfWeek(iso) - start + 7) % 7;
  return addDays(iso, -shift);
}

export function endOfWeek(iso, weekStartsOn) {
  return addDays(startOfWeek(iso, weekStartsOn), 6);
}

export function weekDays(iso, weekStartsOn) {
  const first = startOfWeek(iso, weekStartsOn);
  return Array.from({ length: 7 }, (unused, i) => addDays(first, i));
}

export function startOfMonth(iso) {
  const d = parseIso(iso);
  return d ? `${d.year}-${pad2(d.month)}-01` : iso;
}

export function endOfMonth(iso) {
  const d = parseIso(iso);
  if (!d) return iso;
  const last = new Date(Date.UTC(d.year, d.month, 0)).getUTCDate();
  return `${d.year}-${pad2(d.month)}-${pad2(last)}`;
}

/** Six weeks of days covering the month, for a month grid. */
export function monthGrid(iso, weekStartsOn) {
  const first = startOfWeek(startOfMonth(iso), weekStartsOn);
  return Array.from({ length: 42 }, (unused, i) => addDays(first, i));
}

/** The days of the last `n` days ending today (inclusive). */
export function lastNDays(n, endIso) {
  const end = endIso || today();
  return Array.from({ length: n }, (unused, i) => addDays(end, -(n - 1 - i)));
}

export function daysInRange(fromIso, toIso) {
  const out = [];
  const span = daysBetween(fromIso, toIso);
  if (span < 0) return out;
  for (let i = 0; i <= span; i += 1) out.push(addDays(fromIso, i));
  return out;
}

/* ------------------------------------------------------------------ *
 * Formatting — Hebrew, 24-hour, day-month-year
 * ------------------------------------------------------------------ */

/** 17:30. Never 5:30 PM. */
export function formatTime(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  /* A block that ends exactly at midnight reads better as 24:00 than as 00:00,
   * because 00:00 looks like the start of the day it is ending. */
  const total = m === 1440 ? 1440 : m % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function formatTimeRange(fromMinutes, toMinutes) {
  /* Deliberately NOT direction-isolated. In an RTL paragraph the range renders
   * with the later time on the left, so a Hebrew reader meets the start time
   * first — which is the correct reading order. Forcing it LTR would reverse
   * that. Each endpoint is internally LTR already, being digits and a colon. */
  return `${formatTime(fromMinutes)}–${formatTime(toMinutes)}`;
}

export function parseTimeInput(text) {
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(String(text || '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** '14 באוגוסט 2026' — the long form. */
export function formatDate(iso, opts) {
  const o = opts || {};
  const d = parseIso(iso);
  if (!d) return String(iso || '');
  const month = HE.time.monthNames[d.month - 1];
  if (o.numeric) return `${pad2(d.day)}.${pad2(d.month)}.${d.year}`;
  if (o.short) return `${d.day} ${HE.time.monthNamesPlain[d.month - 1]}`;
  if (o.noYear) return `${d.day} ${month}`;
  return `${d.day} ${month} ${d.year}`;
}

/** 'יום שישי, 14 באוגוסט' */
export function formatDateWithDay(iso, opts) {
  const o = opts || {};
  const dow = HE.time.dayNames[dayOfWeek(iso)];
  const prefix = dow === 'שבת' ? dow : `יום ${dow}`;
  return `${prefix}, ${formatDate(iso, { noYear: !o.year })}`;
}

export function dayName(iso, short) {
  const list = short ? HE.time.dayNamesShort : HE.time.dayNames;
  return list[dayOfWeek(iso)];
}

export function monthName(iso) {
  const d = parseIso(iso);
  return d ? HE.time.monthNamesPlain[d.month - 1] : '';
}

export function formatMonthYear(iso) {
  const d = parseIso(iso);
  return d ? `${HE.time.monthNamesPlain[d.month - 1]} ${d.year}` : '';
}

/**
 * 'היום' / 'מחר' / 'אתמול' / 'יום שלישי' within the coming week / a date.
 * The named-day range is deliberately short: "יום שלישי" three weeks out is
 * ambiguous, and a date is more useful than a familiar-sounding wrong guess.
 */
export function relativeDay(iso, refIso) {
  const ref = refIso || today();
  const delta = daysBetween(ref, iso);
  if (delta === 0) return HE.time.today;
  if (delta === 1) return HE.time.tomorrow;
  if (delta === -1) return HE.time.yesterday;
  if (delta > 1 && delta <= 6) return dayName(iso);
  const sameYear = parseIso(iso) && parseIso(ref) && parseIso(iso).year === parseIso(ref).year;
  return formatDate(iso, { noYear: sameYear });
}

/** 'שעה ו־20 דק׳' / '45 דק׳' / '3 שע׳'. */
export function formatDuration(totalMinutes, opts) {
  const o = opts || {};
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;

  if (mins === 0) return o.approx ? 'פחות מדקה' : '0 דק׳';
  if (hours === 0) return `${rest} דק׳`;

  /* Hebrew has real dual forms, and "שעתיים" is what a person says. */
  const hoursText = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
  if (rest === 0) return hoursText;
  return `${hoursText} ו־${rest} דק׳`;
}

/** The same, with the hedge the planner's estimates deserve. */
export function formatApproxDuration(totalMinutes) {
  return `כ־${formatDuration(totalMinutes)}`;
}

/** 'עוד 3 ימים' / 'באיחור של יומיים' / 'היום'. */
export function formatDueDistance(iso, refIso) {
  const ref = refIso || today();
  const delta = daysBetween(ref, iso);
  if (delta === 0) return HE.time.today;
  if (delta === 1) return HE.time.tomorrow;
  if (delta === -1) return HE.time.yesterday;
  const abs = Math.abs(delta);
  let text;
  if (abs < 7) text = abs === 2 ? 'יומיים' : `${abs} ימים`;
  else if (abs < 31) {
    const weeks = Math.round(abs / 7);
    text = weeks === 1 ? 'שבוע' : weeks === 2 ? 'שבועיים' : `${weeks} שבועות`;
  } else {
    const months = Math.round(abs / 30);
    text = months === 1 ? 'חודש' : months === 2 ? 'חודשיים' : `${months} חודשים`;
  }
  return delta > 0 ? `עוד ${text}` : `באיחור של ${text}`;
}

/** 'לפני 4 דקות' / 'לפני שעתיים' / 'אתמול'. For activity feeds. */
export function formatAgo(instant, nowInstant) {
  const ref = nowInstant === undefined ? Date.now() : nowInstant;
  const diffMin = Math.round((ref - instant) / 60000);
  if (diffMin < 1) return 'הרגע';
  if (diffMin < 60) return diffMin === 1 ? 'לפני דקה' : `לפני ${diffMin} דקות`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
  const dayDelta = daysBetween(isoDay(instant), isoDay(ref));
  if (dayDelta === 1) return HE.time.yesterday;
  if (dayDelta < 7) return `לפני ${dayDelta === 2 ? 'יומיים' : `${dayDelta} ימים`}`;
  return formatDate(isoDay(instant), { noYear: true });
}

/** Which part of the day it is, for the greeting. */
export function partOfDay(minutes) {
  const m = minutes === undefined ? nowMinutes() : minutes;
  if (m < 5 * 60) return 'night';
  if (m < 12 * 60) return 'morning';
  if (m < 16 * 60) return 'afternoon';
  if (m < 22 * 60) return 'evening';
  return 'night';
}

/* ------------------------------------------------------------------ *
 * Intervals — the arithmetic the planner runs on
 * ------------------------------------------------------------------ */

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Merge overlapping or touching intervals. Input may be unsorted.
 * Intervals are {start, end} in minutes-of-day or in instants; the arithmetic
 * is the same either way as long as one call does not mix the two.
 */
export function mergeIntervals(intervals) {
  const list = intervals
    .filter((i) => i && i.end > i.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const cur of list) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ start: cur.start, end: cur.end });
  }
  return out;
}

/** What is left of `bounds` after removing every `busy` interval. */
export function subtractIntervals(bounds, busy) {
  const blocked = mergeIntervals(busy);
  let free = [{ start: bounds.start, end: bounds.end }];
  for (const b of blocked) {
    const next = [];
    for (const f of free) {
      if (b.end <= f.start || b.start >= f.end) { next.push(f); continue; }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    free = next;
  }
  return free.filter((f) => f.end > f.start);
}

export function totalMinutes(intervals) {
  return intervals.reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}
