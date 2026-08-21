/*
 * time.js — the only place in TomorrowAI that reads or builds a date.
 *
 * Two representations, and the rest of the app knows no others. A DateKey is
 * 'YYYY-MM-DD', one calendar day in the browser's local timezone. Minutes is a
 * whole number of minutes from local midnight of that day: 450 is 07:30. A
 * schedule item stays inside 0..1439, but a night does not — a bedtime that
 * belongs to the evening before is negative, and an item that runs past
 * midnight ends above 1439. Both are normal here and neither is normal in a
 * Date, which is why every other module asks this file instead of doing it by
 * hand. The first version of the timeline parsed its own dates and spent a
 * week disagreeing with the sleep card about which day 23:15 belonged to.
 *
 * Nothing in this file asks the system what time it is. Every function that
 * needs the present takes a Date. The validator runs each engine entry point
 * twice on identical input and compares the JSON byte for byte, so a single
 * hidden new Date() would pass all afternoon and fail across midnight.
 *
 * profile.timezone is stored for a future sync and is deliberately unused
 * here. The app runs in the local zone, and half a timezone conversion is
 * worse than none.
 */

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86400000;
const NOON = 720;

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function keyOf(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/* ------------------------------------------------------------------ *
 * Date keys
 * ------------------------------------------------------------------ */

/**
 * Splits a DateKey into numbers. `m` is 1-based, the month as it is written
 * in the key, so parseKey('2026-09-03').m is 9 and not 8. Callers that need a
 * Date get one from keyToDate() rather than doing the -1 themselves.
 *
 * Throws on anything malformed, because a bad key is not a value this app can
 * carry: it would land in the store as a day nobody can navigate to.
 */
export function parseKey(key) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!parts) throw new Error(`bad DateKey: ${key}`);
  const y = Number(parts[1]);
  const m = Number(parts[2]);
  const d = Number(parts[3]);
  /*
   * The shape being right does not make the date real — '2026-02-30' and
   * '2026-13-01' both match. A Date silently rolls those forward to March 2
   * and January 2027, so building one and checking that the fields survived
   * the trip is the cheapest honest calendar.
   */
  const probe = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new Error(`bad DateKey: ${key}`);
  }
  return { y, m, d };
}

export function isValidKey(key) {
  try {
    parseKey(key);
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * A Date at 12:00 local on that day — the anchor for every day-level
 * calculation in this file.
 *
 * On the night a DST change lands, local midnight is not a safe place to
 * stand: in a zone that shifts at 00:00 it either does not exist or happens
 * twice, and arithmetic from it drifts by an hour. Noon is eleven hours from
 * either edge and survives both. It is also what keeps diffDays() honest — see
 * the note there.
 */
function noon(key) {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** The local calendar day `now` falls on. `now` is required and must be a Date. */
export function todayKey(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('todayKey(now): now must be a Date');
  }
  return keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(key, n) {
  const at = noon(key);
  at.setDate(at.getDate() + Math.trunc(Number(n) || 0));
  return keyOf(at.getFullYear(), at.getMonth() + 1, at.getDate());
}

/**
 * Whole days from `b` to `a`, signed: diffDays(tomorrow, today) is 1.
 *
 * Both sides are built at local noon before subtracting. Subtracting midnights
 * across a spring-forward boundary gives 23 hours, which is 0.958 days, and
 * whichever way that gets turned into an integer somebody loses a day: floor()
 * eats it outright and the app tells them tomorrow is today. From noon the
 * gap is 23 or 25 hours around the shift, never closer to the wrong integer
 * than an hour, so rounding lands on the calendar answer every time.
 */
export function diffDays(a, b) {
  return Math.round((noon(a).getTime() - noon(b).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday .. 6 = Saturday. */
export function dayOfWeek(key) {
  return noon(key).getDay();
}

/*
 * Which two days count as the weekend depends on where the week starts, and
 * both weeks are real for this app's users. weekStart 0 is the Israeli week,
 * Sunday through Saturday, whose weekend is Friday and Saturday. weekStart 1
 * is the Monday-first week, whose weekend is Saturday and Sunday. The schedule
 * screen groups by this and the scoring model treats a weekend day's load
 * differently, so getting it from the profile rather than assuming matters.
 */
export function isWeekend(key, weekStart) {
  const dow = dayOfWeek(key);
  if (Number(weekStart) === 1) return dow === 6 || dow === 0;
  return dow === 5 || dow === 6;
}

/** The seven DateKeys of the week `key` falls in, first day first. */
export function weekKeys(key, weekStart) {
  const start = Number(weekStart) === 1 ? 1 : 0;
  const back = (dayOfWeek(key) - start + 7) % 7;
  const first = addDays(key, -back);
  const out = [];
  for (let i = 0; i < 7; i += 1) out.push(addDays(first, i));
  return out;
}

/* ------------------------------------------------------------------ *
 * Instants
 * ------------------------------------------------------------------ */

/**
 * The local instant `minutes` from midnight of `key`. Minutes outside
 * 0..1439 are the point: -45 is 23:15 the evening before, 1470 is 00:30 the
 * morning after, and both are ordinary values for a sleep window.
 *
 * It counts from noon rather than from midnight for the same reason noon()
 * exists — a zone that shifts at midnight has no midnight to count from on
 * two days a year, and the offset arithmetic is identical from either anchor.
 */
export function keyToDate(key, minutes) {
  const n = Number(minutes);
  const at = noon(key);
  at.setMinutes(at.getMinutes() + (Number.isFinite(n) ? Math.round(n) : 0) - NOON);
  return at;
}

/** Minutes from local midnight for `now`, 0..1439. */
export function nowMinutes(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('nowMinutes(now): now must be a Date');
  }
  return now.getHours() * 60 + now.getMinutes();
}

/* ------------------------------------------------------------------ *
 * Minutes
 * ------------------------------------------------------------------ */

/** Forces a value onto the clock, 0..1439. For schedule fields, not for nights. */
export function clampMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(n)));
}

/**
 * Reads a clock string into minutes. Tolerant on the way in: '7:30',
 * '07:30', '7.30' and ' 07:30 ' are all 450, and a 12-hour suffix is
 * understood because the profile offers a 12h format and a field in that mode
 * hands back '7:30 PM'.
 *
 * Returns null — not NaN, not 0 — for anything it cannot read. Both of the
 * other two answers are traps. NaN spreads through every sum it touches and
 * only surfaces three screens later as an empty timeline, and 0 is a
 * perfectly valid time, so a failed parse would quietly schedule the user's
 * workout at midnight and look deliberate doing it.
 *
 * A number is refused rather than passed through: 730 could mean 07:30 or
 * 12:10 and the caller knows which, so it should say so.
 */
export function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  /*
   * The input comes from a text field inside an RTL document, and browsers
   * and pasted text both slip invisible bidi marks in around the digits. They
   * are not whitespace, so trim() leaves them and the regex refuses a string
   * that looks perfectly correct on screen.
   */
  const text = hhmm.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const parts = /^(\d{1,2})(?:[:.](\d{1,2}))?\s*([ap])\.?m\.?$|^(\d{1,2})(?:[:.](\d{1,2}))?$/i.exec(text);
  if (!parts) return null;
  const half = parts[3] ? parts[3].toLowerCase() : '';
  let h = Number(half ? parts[1] : parts[4]);
  const raw = half ? parts[2] : parts[5];
  const m = raw === undefined ? 0 : Number(raw);
  if (m > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === 'p' ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return h * 60 + m;
}

/**
 * Renders minutes as a clock reading, always four digits and a colon.
 *
 * Minutes cross midnight in both directions here — a bedtime of -45, an item
 * that ends at 1470 — and a reader wants '23:15' and '00:30', not '-1:-45'
 * and '24:30'. The double modulo is what makes a negative value wrap forward
 * instead of printing a sign.
 */
export function fromMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return '00:00';
  const wrapped = ((Math.round(n) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/** Rounds to the nearest `step` minutes. The optimiser searches a 15-minute grid. */
export function snap(m, step) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  const s = Number(step);
  if (!Number.isFinite(s) || s <= 0) return Math.round(n);
  return Math.round(n / s) * s;
}

/**
 * Whether two spans share any minute.
 *
 * Touching is not overlapping: an item ending at 10:00 and one starting at
 * 10:00 are back to back, and calling that a conflict would make the
 * scheduler reject every tidy day it builds. An unscheduled task has
 * start === null, which compares as 0 the moment it reaches an operator, so
 * anything that is not a finite number is no overlap at all rather than an
 * invisible item sitting at midnight.
 */
export function overlaps(aStart, aDur, bStart, bDur) {
  const as = Number(aStart);
  const bs = Number(bStart);
  const ad = Number(aDur);
  const bd = Number(bDur);
  if (![as, bs, ad, bd].every(Number.isFinite)) return false;
  if (ad <= 0 || bd <= 0) return false;
  return as < bs + bd && bs < as + ad;
}

/* ------------------------------------------------------------------ *
 * Sleep
 * ------------------------------------------------------------------ */

function normalizeClock(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * A clock reading turned into a point on one day's number line.
 *
 * 23:00 stays 1380; 00:30 becomes 1470, because it belongs to the small hours
 * after this date rather than the morning before it. The split is noon — the
 * same place sleepWindow() splits a night, and it has to stay the same place:
 * a timeline that ended before it started was what happened the first time two
 * modules disagreed about which day 00:30 was on.
 *
 * It lives here rather than in the engine because three modules need it and
 * core/time.js is the only one of them nothing else imports, so this is the one
 * home for it that closes no cycle.
 */
export function bedtimeAbs(minutes) {
  return minutes >= NOON ? minutes : minutes + MINUTES_PER_DAY;
}

/**
 * The night that ENDS on the forecast date, expressed against that date's
 * midnight: { start, end, minutes }.
 *
 * Both arguments are plain clock readings, 0..1439, exactly as the user set
 * them in the profile — nothing in the stored data says which side of
 * midnight a bedtime is on. That has to be decided here, once, or every
 * caller invents its own answer and the sleep card, the timeline and the
 * scoring factor each report a different number of hours for the same night.
 *
 * The split is at 12:00 noon. A bedtime reading at or after noon is that
 * evening, before the date turns, and comes back negative: 23:15 is
 * start = -45, forty-five minutes before the day it belongs to began. A
 * reading before noon is already past midnight and stays positive: 00:30 is
 * start = 30. Noon is the split because nobody's habitual bedtime is midday,
 * so it is the widest possible margin of error on both sides — the choice
 * only ever gets tested by a 22:00 or a 02:00, never by anything near the
 * boundary.
 *
 * If the two readings still cross — a 02:00 bedtime with a 01:00 wake — the
 * bedtime is pushed back a further day so `minutes` stays positive as the
 * contract requires. It comes out implausibly long, which is the honest
 * outcome: this function reports the number the data implies and callers
 * clamp for scoring. Anything under 3h or over 14h is out of range, and
 * saying so is their job, not this one's.
 */
export function sleepWindow(bedMinutes, wakeMinutes) {
  const bed = normalizeClock(bedMinutes);
  const end = normalizeClock(wakeMinutes);
  let start = bed >= NOON ? bed - MINUTES_PER_DAY : bed;
  if (end <= start) start -= MINUTES_PER_DAY;
  return { start, end, minutes: end - start };
}
