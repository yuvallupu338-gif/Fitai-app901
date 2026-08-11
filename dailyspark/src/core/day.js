/*
 * day.js — what "today" means, and everything that counts days.
 *
 * The whole product is one item per day, so the definition of a day is load
 * bearing in a way it usually is not. Two decisions are encoded here.
 *
 * 1. The day rolls at 04:00 local, not at midnight.
 *    Someone still awake at 01:30 has not started a new day, and handing them
 *    tomorrow's spark costs them today's and breaks a streak they were in the
 *    middle of keeping. Four in the morning is late enough for the night owls
 *    and early enough that nobody who wakes at five is served yesterday.
 *
 * 2. Dates are formatted from local clock fields, never from toISOString().
 *    toISOString() converts to UTC first, so east of Greenwich every evening
 *    after the UTC offset lands on the following date — in Israel that is the
 *    whole evening, which is when a lot of people open the app. That bug looks
 *    like "my streak reset at nine at night" and it is very hard to see in a
 *    test that runs at noon.
 */

/** Milliseconds by which the logical day trails the calendar day. */
const ROLLOVER_HOUR = 4;

function pad(n) {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' for the logical day containing `date` (default: now). */
export function dayKey(date) {
  const d = date ? new Date(date) : new Date();
  const shifted = new Date(d.getTime() - ROLLOVER_HOUR * 3600000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** A Date at local noon of the given key — noon so DST shifts cannot slide it. */
export function dateOfKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Key `delta` days away from `key`. Negative goes back. */
export function shiftKey(key, delta) {
  const d = dateOfKey(key);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `a` to `b`, both keys. Positive when b is later. */
export function daysBetween(a, b) {
  return Math.round((dateOfKey(b) - dateOfKey(a)) / 86400000);
}

/** When the current spark expires and the next one appears. */
export function nextRollover(now) {
  const d = now ? new Date(now) : new Date();
  const next = new Date(d);
  next.setHours(ROLLOVER_HOUR, 0, 0, 0);
  if (next <= d) next.setDate(next.getDate() + 1);
  return next;
}

/** "עוד 7 שעות" — coarse on purpose; a live second counter invites waiting. */
export function untilRolloverText(now) {
  const ms = nextRollover(now) - (now ? new Date(now) : new Date());
  const hours = Math.floor(ms / 3600000);
  if (hours >= 2) return `הניצוץ הבא בעוד ${hours} שעות`;
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins >= 60) return 'הניצוץ הבא בעוד שעה';
  return `הניצוץ הבא בעוד ${mins} דקות`;
}

/* ISO-ish week stamp for the weekly insight, e.g. "2026-W32". */
export function weekKey(key) {
  const date = key ? dateOfKey(key) : dateOfKey(dayKey());
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

/** 0 = Sunday, matching how a Hebrew week is read. */
export function weekdayOf(key) {
  return dateOfKey(key).getDay();
}

export const WEEKDAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function monthName(key) {
  return MONTHS[dateOfKey(key).getMonth()];
}

/** "יום שלישי, 11.8" — the header line on the home screen. */
export function humanDate(key) {
  const d = dateOfKey(key);
  const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `יום ${names[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}`;
}

/*
 * Three coarse parts of the day.
 *
 * The ranker uses this as a context feature and the framing layer uses it to
 * place a spark in the reader's actual hour ("לפני שהיום מתחיל"). Three buckets
 * rather than an hour number because with a few dozen interactions per user
 * there is nothing to learn from twenty-four of anything.
 */
export function partOfDay(now) {
  const hour = (now ? new Date(now) : new Date()).getHours();
  if (hour < 11) return 'morning';
  if (hour < 17) return 'midday';
  return 'evening';
}

export const PART_LABEL = { morning: 'בוקר', midday: 'צהריים', evening: 'ערב' };
