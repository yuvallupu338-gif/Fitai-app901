/*
 * time.test.mjs — the timezone and daylight-saving arithmetic.
 *
 * This suite exists because these are the bugs that do not reproduce. A
 * planner that loses an hour twice a year loses it on a specific Friday in
 * March, on somebody else's machine, in a way nobody connects to daylight
 * saving. The only way to know it works is to assert it against the two dates
 * where it breaks.
 *
 * Israel moves the clocks forward at 02:00 on the Friday before the last
 * Sunday in March, and back at 02:00 on the last Sunday in October.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_TZ, zonedParts, instantFrom, isoDay, minutesOfDay, parseIso, instantAt,
  dayLengthMinutes, addDays, addMonths, daysBetween, dayOfWeek, startOfWeek,
  endOfWeek, weekDays, monthGrid, formatTime, formatTimeRange, parseTimeInput,
  formatDate, formatDateWithDay, formatDuration, relativeDay, formatDueDistance,
  subtractIntervals, mergeIntervals, overlapMinutes, totalMinutes, startOfMonth,
  endOfMonth, daysInRange, isWeekend,
} from '../src/core/time.js';

describe('timezone', () => {
  test('the app timezone is Asia/Jerusalem', () => {
    assert.equal(APP_TZ, 'Asia/Jerusalem');
  });

  test('an instant resolves to Jerusalem wall-clock, not the machine local time', () => {
    /* 2026-08-14T09:00:00Z is 12:00 in Jerusalem (UTC+3 in summer). */
    const instant = Date.UTC(2026, 7, 14, 9, 0, 0);
    const parts = zonedParts(instant);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 8);
    assert.equal(parts.day, 14);
    assert.equal(parts.hour, 12);
    assert.equal(minutesOfDay(instant), 12 * 60);
  });

  test('a winter instant uses the winter offset', () => {
    /* 2026-01-14T09:00:00Z is 11:00 in Jerusalem (UTC+2). */
    const parts = zonedParts(Date.UTC(2026, 0, 14, 9, 0, 0));
    assert.equal(parts.hour, 11);
  });

  test('instantFrom round-trips a wall-clock time', () => {
    const instant = instantFrom(2026, 8, 14, 17, 30);
    assert.equal(isoDay(instant), '2026-08-14');
    assert.equal(minutesOfDay(instant), 17 * 60 + 30);
  });

  test('a day boundary near midnight lands on the right civil day', () => {
    /* 2026-08-14T21:30:00Z is 00:30 on the 15th in Jerusalem. */
    assert.equal(isoDay(Date.UTC(2026, 7, 14, 21, 30)), '2026-08-15');
    /* And an hour earlier is still the 14th. */
    assert.equal(isoDay(Date.UTC(2026, 7, 14, 20, 30)), '2026-08-14');
  });
});

describe('daylight saving', () => {
  test('an ordinary day is 1440 minutes', () => {
    assert.equal(dayLengthMinutes('2026-08-14'), 1440);
    assert.equal(dayLengthMinutes('2026-01-14'), 1440);
  });

  test('the spring-forward day is 23 hours', () => {
    /* Israel 2026: clocks go forward on Friday 27 March. */
    assert.equal(dayLengthMinutes('2026-03-27'), 1380);
  });

  test('the autumn day is 25 hours', () => {
    /* Israel 2026: clocks go back on Sunday 25 October. */
    assert.equal(dayLengthMinutes('2026-10-25'), 1500);
  });

  test('a transition does not shift the surrounding days', () => {
    assert.equal(dayLengthMinutes('2026-03-26'), 1440);
    assert.equal(dayLengthMinutes('2026-03-28'), 1440);
    assert.equal(dayLengthMinutes('2026-10-24'), 1440);
    assert.equal(dayLengthMinutes('2026-10-26'), 1440);
  });

  test('a working window that does not contain the transition keeps its length', () => {
    /* The clocks move at 02:00, so 08:00-22:00 is 14 hours on every day of the
     * year. This is the case the planner actually runs in, and it must not be
     * disturbed by the day being 23 or 25 hours long overall. */
    const spring = instantAt('2026-03-27', 22 * 60) - instantAt('2026-03-27', 8 * 60);
    assert.equal(Math.round(spring / 60000), 840);
    const autumn = instantAt('2026-10-25', 22 * 60) - instantAt('2026-10-25', 8 * 60);
    assert.equal(Math.round(autumn / 60000), 840);
  });

  test('a window containing the spring transition is an hour short', () => {
    const spring = instantAt('2026-03-27', 4 * 60) - instantAt('2026-03-27', 1 * 60);
    assert.equal(Math.round(spring / 60000), 120, '01:00-04:00 is two real hours in spring');
  });

  test('a repeated autumn hour resolves to the second occurrence, deterministically', () => {
    /* 01:00-02:00 happens twice on the fall-back morning. instantFrom picks
     * the later one — documented in time.js and pinned here so the choice
     * cannot drift silently between engine versions. */
    const autumn = instantAt('2026-10-25', 4 * 60) - instantAt('2026-10-25', 1 * 60);
    assert.equal(Math.round(autumn / 60000), 180);

    /* Whichever it picks, it must round-trip: the instant it returns has to
     * report the wall-clock time it was asked for. That is the property the
     * rest of the app depends on. */
    const instant = instantAt('2026-10-25', 90);
    assert.equal(minutesOfDay(instant), 90);
    assert.equal(isoDay(instant), '2026-10-25');

    /* And it is stable across calls. */
    assert.equal(instantAt('2026-10-25', 90), instantAt('2026-10-25', 90));
  });

  test('a nonexistent spring time clamps forward to the first that exists', () => {
    /* 02:30 does not exist on 2026-03-27; the clock goes 02:00 -> 03:00. */
    const instant = instantAt('2026-03-27', 150);
    assert.equal(isoDay(instant), '2026-03-27');
    assert.equal(minutesOfDay(instant), 180, 'clamped to 03:00');
  });

  test('minute-of-day to instant is monotonic on every day of the year', () => {
    /* The property the clamp exists to protect. Without it, 03:00 on the
     * spring-forward morning maps to an EARLIER instant than 02:30, and every
     * free window computed as end-minus-start across that hour comes out
     * negative — in capacity.js, on one day a year, silently. */
    for (const day of ['2026-03-27', '2026-10-25', '2026-08-14', '2026-01-01']) {
      let previous = -Infinity;
      for (let m = 0; m <= 1440; m += 15) {
        const instant = instantAt(day, m);
        assert.ok(
          instant >= previous,
          `${day} ${m}: instant went backwards (${instant} < ${previous})`,
        );
        previous = instant;
      }
    }
  });

  test('no window on a transition day is inside-out', () => {
    for (const day of ['2026-03-27', '2026-10-25']) {
      for (let start = 0; start < 1440; start += 30) {
        const span = instantAt(day, start + 30) - instantAt(day, start);
        assert.ok(span >= 0, `${day} ${start}: negative span`);
      }
    }
  });

  test('day arithmetic across a transition is still one civil day', () => {
    assert.equal(addDays('2026-03-26', 1), '2026-03-27');
    assert.equal(addDays('2026-03-27', 1), '2026-03-28');
    assert.equal(daysBetween('2026-03-20', '2026-04-03'), 14);
    assert.equal(daysBetween('2026-10-18', '2026-11-01'), 14);
  });
});

describe('calendar arithmetic', () => {
  test('addDays crosses months and years', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29', 'leap year');
  });

  test('addMonths clamps to the length of the target month', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-08-31', 1), '2026-09-30');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  });

  test('the week starts on Sunday', () => {
    /* 2026-08-14 is a Friday. */
    assert.equal(dayOfWeek('2026-08-14'), 5);
    assert.equal(startOfWeek('2026-08-14'), '2026-08-09');
    assert.equal(endOfWeek('2026-08-14'), '2026-08-15');
    const days = weekDays('2026-08-14');
    assert.equal(days.length, 7);
    assert.equal(days[0], '2026-08-09');
    assert.equal(dayOfWeek(days[0]), 0, 'first day of the week is Sunday');
  });

  test('a Sunday is the start of its own week', () => {
    assert.equal(startOfWeek('2026-08-09'), '2026-08-09');
  });

  test('Friday and Saturday are the weekend', () => {
    assert.equal(isWeekend('2026-08-14'), true, 'Friday');
    assert.equal(isWeekend('2026-08-15'), true, 'Saturday');
    assert.equal(isWeekend('2026-08-16'), false, 'Sunday is a working day');
  });

  test('the month grid is six Sunday-aligned weeks covering the month', () => {
    const grid = monthGrid('2026-08-14');
    assert.equal(grid.length, 42);
    assert.equal(dayOfWeek(grid[0]), 0);
    assert.ok(grid.includes('2026-08-01'));
    assert.ok(grid.includes('2026-08-31'));
  });

  test('month bounds', () => {
    assert.equal(startOfMonth('2026-08-14'), '2026-08-01');
    assert.equal(endOfMonth('2026-08-14'), '2026-08-31');
    assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
    assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
  });

  test('daysInRange is inclusive at both ends', () => {
    assert.deepEqual(daysInRange('2026-08-14', '2026-08-16'), ['2026-08-14', '2026-08-15', '2026-08-16']);
    assert.deepEqual(daysInRange('2026-08-16', '2026-08-14'), []);
  });

  test('parseIso rejects impossible dates', () => {
    assert.equal(parseIso('2026-13-01'), null);
    assert.equal(parseIso('not a date'), null);
    assert.ok(parseIso('2026-02-28'));
  });
});

describe('formatting', () => {
  test('times are 24-hour with no AM or PM anywhere', () => {
    assert.equal(formatTime(17 * 60 + 30), '17:30');
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(9 * 60), '09:00');
    assert.equal(formatTime(23 * 60 + 59), '23:59');
    assert.equal(formatTime(1440), '24:00', 'a block ending at midnight');
    for (const m of [0, 60, 720, 780, 1439]) {
      assert.doesNotMatch(formatTime(m), /AM|PM/i);
    }
  });

  test('a time range keeps its reading order for an RTL reader', () => {
    /* Deliberately NOT direction-isolated: in an RTL paragraph the start time
     * is met first, which is correct. */
    assert.equal(formatTimeRange(17 * 60, 17 * 60 + 45), '17:00–17:45');
  });

  test('parseTimeInput accepts what people type', () => {
    assert.equal(parseTimeInput('17:30'), 1050);
    assert.equal(parseTimeInput('9:05'), 545);
    assert.equal(parseTimeInput('0930'), 570);
    assert.equal(parseTimeInput('25:00'), null);
    assert.equal(parseTimeInput('17:75'), null);
    assert.equal(parseTimeInput('שלוש'), null);
  });

  test('dates are day-month-year, never American', () => {
    assert.equal(formatDate('2026-08-14'), '14 באוגוסט 2026');
    assert.equal(formatDate('2026-08-14', { numeric: true }), '14.08.2026');
    assert.equal(formatDate('2026-08-14', { noYear: true }), '14 באוגוסט');
    assert.doesNotMatch(formatDate('2026-08-14', { numeric: true }), /^08/);
  });

  test('a date with its day name reads as Hebrew', () => {
    assert.equal(formatDateWithDay('2026-08-14'), 'יום שישי, 14 באוגוסט');
    assert.equal(formatDateWithDay('2026-08-15'), 'שבת, 15 באוגוסט', 'שבת takes no יום prefix');
  });

  test('durations use the Hebrew dual where a person would', () => {
    assert.equal(formatDuration(45), '45 דק׳');
    assert.equal(formatDuration(60), 'שעה');
    assert.equal(formatDuration(120), 'שעתיים');
    assert.equal(formatDuration(80), 'שעה ו־20 דק׳');
    assert.equal(formatDuration(150), 'שעתיים ו־30 דק׳');
    assert.equal(formatDuration(180), '3 שעות');
  });

  test('relative days are named only within the coming week', () => {
    assert.equal(relativeDay('2026-08-14', '2026-08-14'), 'היום');
    assert.equal(relativeDay('2026-08-15', '2026-08-14'), 'מחר');
    assert.equal(relativeDay('2026-08-13', '2026-08-14'), 'אתמול');
    assert.equal(relativeDay('2026-08-18', '2026-08-14'), 'שלישי');
    /* Beyond a week a name is ambiguous, so it becomes a date. */
    assert.equal(relativeDay('2026-09-14', '2026-08-14'), '14 בספטמבר');
  });

  test('due distance says overdue in words', () => {
    assert.equal(formatDueDistance('2026-08-12', '2026-08-14'), 'לפני יומיים'.replace('לפני ', 'באיחור של '));
    assert.equal(formatDueDistance('2026-08-16', '2026-08-14'), 'עוד יומיים');
    assert.equal(formatDueDistance('2026-08-14', '2026-08-14'), 'היום');
  });
});

describe('interval arithmetic', () => {
  test('merge combines overlapping and touching runs', () => {
    assert.deepEqual(
      mergeIntervals([{ start: 60, end: 120 }, { start: 100, end: 180 }]),
      [{ start: 60, end: 180 }],
    );
    assert.deepEqual(
      mergeIntervals([{ start: 60, end: 120 }, { start: 120, end: 180 }]),
      [{ start: 60, end: 180 }],
    );
    assert.deepEqual(
      mergeIntervals([{ start: 200, end: 260 }, { start: 60, end: 120 }]),
      [{ start: 60, end: 120 }, { start: 200, end: 260 }],
      'unsorted input is handled',
    );
  });

  test('subtract carves busy time out of a window', () => {
    const free = subtractIntervals(
      { start: 480, end: 1320 },
      [{ start: 1080, end: 1170 }],
    );
    assert.deepEqual(free, [{ start: 480, end: 1080 }, { start: 1170, end: 1320 }]);
  });

  test('a busy block covering the whole window leaves nothing', () => {
    assert.deepEqual(subtractIntervals({ start: 480, end: 600 }, [{ start: 400, end: 700 }]), []);
  });

  test('overlap and totals', () => {
    assert.equal(overlapMinutes(60, 120, 100, 200), 20);
    assert.equal(overlapMinutes(60, 120, 200, 300), 0);
    assert.equal(totalMinutes([{ start: 0, end: 30 }, { start: 60, end: 90 }]), 60);
  });
});
