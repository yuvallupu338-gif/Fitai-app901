/*
 * nlp.test.mjs — reading a task out of a Hebrew sentence.
 *
 * The bug this suite exists to prevent has already happened once. JavaScript's
 * \b word boundary is defined on [A-Za-z0-9_], so every Hebrew letter is a
 * non-word character to it and /\bמחר\b/ matches nothing, anywhere, silently.
 * The patterns looked correct and the parser found no dates at all. Every
 * anchored pattern in nlp.js is therefore exercised here on a real sentence.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCapture, parseDate, parseTime, parseDuration, parseRecurrence,
  parseUrgency, parseTags, guessProject,
} from '../src/engine/nlp.js';

const TODAY = '2026-08-14'; /* a Friday */
const OPTS = { today: TODAY, nowMinutes: 10 * 60 };

function parse(text) {
  return parseCapture(text, OPTS);
}

describe('dates', () => {
  test('relative days', () => {
    assert.equal(parseDate('מחר', TODAY).date, '2026-08-15');
    assert.equal(parseDate('מחרתיים', TODAY).date, '2026-08-16');
    assert.equal(parseDate('היום', TODAY).date, TODAY);
    assert.equal(parseDate('אתמול', TODAY).date, '2026-08-13');
  });

  test('מחרתיים is not read as מחר', () => {
    /* Longest-first ordering. Get this wrong and "מחרתיים" becomes tomorrow
     * with a stray "תיים" left in the title. */
    const result = parse('מחרתיים פגישה');
    assert.equal(result.fields.dueDate, '2026-08-16');
    assert.equal(result.title, 'פגישה');
  });

  test('day names find the next such day, never today', () => {
    assert.equal(parseDate('ביום ראשון', TODAY).date, '2026-08-16');
    assert.equal(parseDate('יום שלישי', TODAY).date, '2026-08-18');
    /* Said on a Friday, "ביום שישי" means next Friday. */
    assert.equal(parseDate('ביום שישי', TODAY).date, '2026-08-21');
  });

  test('a bare day letter is too weak to fire on its own', () => {
    /* ב is a preposition and ה is the article; matching "בא׳" inside ordinary
     * text would date half the tasks anybody types. */
    assert.equal(parseDate('לבדוק את הא׳ בטופס', TODAY), null);
    assert.equal(parseDate('ביום א׳', TODAY).date, '2026-08-16');
  });

  test('relative spans', () => {
    assert.equal(parseDate('בעוד יומיים', TODAY).date, '2026-08-16');
    assert.equal(parseDate('בעוד 3 ימים', TODAY).date, '2026-08-17');
    assert.equal(parseDate('בעוד שבוע', TODAY).date, '2026-08-21');
    assert.equal(parseDate('בעוד שבועיים', TODAY).date, '2026-08-28');
    assert.equal(parseDate('בעוד חודש', TODAY).date, '2026-09-13');
  });

  test('numeric dates are day-first, always', () => {
    assert.equal(parseDate('14.9', TODAY).date, '2026-09-14');
    assert.equal(parseDate('3/4', TODAY).date, '2027-04-03', 'already passed, so next year');
    assert.equal(parseDate('25.12.2026', TODAY).date, '2026-12-25');
    assert.equal(parseDate('1.1.27', TODAY).date, '2027-01-01');
  });

  test('an impossible date is not a date', () => {
    assert.equal(parseDate('32.13', TODAY), null);
  });
});

describe('times', () => {
  test('a clock time, with or without the preposition', () => {
    assert.equal(parseTime('17:00').minutes, 1020);
    assert.equal(parseTime('ב17:00').minutes, 1020);
    assert.equal(parseTime('ב־17:00').minutes, 1020, 'with a maqaf');
    assert.equal(parseTime('ב-17:00').minutes, 1020, 'with a hyphen');
    assert.equal(parseTime('בשעה 17:00').minutes, 1020);
  });

  test('the preposition is consumed with the number', () => {
    /* Otherwise removing the time leaves a stranded "ב־" in the task title,
     * which is what the first version did. */
    const result = parse('מחר ב־17:00 ללמוד מתמטיקה 45 דקות');
    assert.equal(result.title, 'ללמוד מתמטיקה');
    assert.equal(result.fields.scheduledDate, '2026-08-15');
    assert.equal(result.fields.scheduledStart, 1020);
    assert.equal(result.fields.estimatedMinutes, 45);
  });

  test('a bare hour needs the preposition, and is read as the afternoon', () => {
    assert.equal(parseTime('ב־5').minutes, 17 * 60);
    assert.equal(parseTime('ב־9').minutes, 9 * 60, 'nine is already unambiguous');
    assert.equal(parseTime('5'), null, 'a bare number is part of the task');
  });

  test('an assumed hour asks for confirmation', () => {
    assert.equal(parse('ב־5 אימון').needsConfirmation, true);
    assert.equal(parse('ב־17:00 אימון').needsConfirmation, false);
  });

  test('a duration is never mistaken for a time', () => {
    /* "45 דקות" would otherwise become 00:45. */
    const result = parse('ללמוד 45 דקות');
    assert.equal(result.fields.estimatedMinutes, 45);
    assert.equal(result.fields.scheduledStart, undefined);
    assert.equal(result.title, 'ללמוד');
  });

  test('an impossible time is refused', () => {
    assert.equal(parseTime('25:00'), null);
    assert.equal(parseTime('17:75'), null);
  });
});

describe('durations', () => {
  test('the written forms people actually use', () => {
    assert.equal(parseDuration('45 דקות').minutes, 45);
    assert.equal(parseDuration('20 דק׳').minutes, 20);
    assert.equal(parseDuration('שעה').minutes, 60);
    assert.equal(parseDuration('שעתיים').minutes, 120);
    assert.equal(parseDuration('חצי שעה').minutes, 30);
    assert.equal(parseDuration('רבע שעה').minutes, 15);
    assert.equal(parseDuration('שעה וחצי').minutes, 90);
    assert.equal(parseDuration('שעתיים וחצי').minutes, 150);
    assert.equal(parseDuration('1.5 שעות').minutes, 90);
    assert.equal(parseDuration('3 שעות').minutes, 180);
  });

  test('the longer form wins, so "שעה וחצי" is not read as an hour', () => {
    const result = parse('לצפות בהרצאה שעה וחצי');
    assert.equal(result.fields.estimatedMinutes, 90);
    assert.equal(result.title, 'לצפות בהרצאה', 'no stray "וחצי" left behind');
  });

  test('an absurd duration is refused', () => {
    assert.equal(parseDuration('50 שעות'), null);
  });

  test('the preposition form of a clock time is not a duration', () => {
    /* "בשעה 17:00" introduces a time. A bare-שעה duration pattern that fired
     * on it would turn every "at 17:00" into a one-hour estimate. */
    const result = parse('בשעה 17:00 פגישה');
    assert.equal(result.fields.scheduledStart, 17 * 60);
    assert.equal(result.fields.estimatedMinutes, undefined);
    assert.equal(result.title, 'פגישה');
  });
});

describe('recurrence', () => {
  test('the explicit forms', () => {
    assert.equal(parseRecurrence('כל יום').recurrence, 'daily');
    assert.equal(parseRecurrence('כל שבוע').recurrence, 'weekly');
    assert.equal(parseRecurrence('כל חודש').recurrence, 'monthly');
  });

  test('a named day gives a weekly rule on that day', () => {
    const result = parseRecurrence('כל יום ראשון');
    assert.equal(result.recurrence, 'weekly');
    assert.deepEqual(result.days, [0]);
  });

  test('recurrence is parsed before the date, so the day name is not eaten', () => {
    /* "כל יום ראשון" contains a day name. Letting the date parser reach it
     * first turns a weekly rule into a one-off next Sunday and leaves a stray
     * "כל" in the title. */
    const result = parse('כל יום ראשון לשלוח דוח שבועי');
    assert.equal(result.fields.recurrence, 'weekly');
    assert.deepEqual(result.fields.recurrenceDays, [0]);
    assert.equal(result.fields.dueDate, undefined);
    assert.equal(result.title, 'לשלוח דוח שבועי');
  });

  test('an adjective is not an instruction to repeat', () => {
    /* "דוח שבועי" is the name of a report. */
    assert.equal(parseRecurrence('לשלוח דוח שבועי'), null);
  });
});

describe('urgency and tags', () => {
  test('urgent and important are different words with different effects', () => {
    assert.equal(parseUrgency('דחוף').urgency, 5);
    assert.equal(parseUrgency('חשוב').importance, 5);
    assert.equal(parseUrgency('חשוב').urgency, 3, 'important is not urgent');
  });

  test('trailing bangs', () => {
    assert.equal(parseUrgency('לכתוב סיכום!!').urgency, 5);
    assert.equal(parseUrgency('לכתוב סיכום!').urgency, 4);
    assert.equal(parseUrgency('לכתוב סיכום'), null);
  });

  test('hashtags become tags and leave the title', () => {
    const result = parse('לסדר את הארון #בית #דחוי');
    assert.deepEqual(result.fields.tags, ['בית', 'דחוי']);
    assert.equal(result.title, 'לסדר את הארון');
  });
});

describe('whole sentences', () => {
  test('the specification example', () => {
    const result = parse('מחר ב־17:00 ללמוד מתמטיקה 45 דקות');
    assert.equal(result.title, 'ללמוד מתמטיקה');
    assert.equal(result.fields.scheduledDate, '2026-08-15');
    assert.equal(result.fields.scheduledStart, 17 * 60);
    assert.equal(result.fields.estimatedMinutes, 45);
    assert.ok(result.confidence > 0.5);
  });

  test('a time means a plan; a date alone means a deadline', () => {
    /* Writing a due date from a scheduling sentence manufactures urgency
     * nobody asked for, and that urgency then drives the priority engine. */
    const scheduled = parse('מחר ב־17:00 ללמוד');
    assert.equal(scheduled.fields.dueDate, undefined);
    assert.equal(scheduled.fields.scheduledDate, '2026-08-15');

    const due = parse('14.9 להגיש עבודה');
    assert.equal(due.fields.dueDate, '2026-09-14');
  });

  test('a time already past means tomorrow', () => {
    const result = parseCapture('ב־9 אימון', { today: TODAY, nowMinutes: 22 * 60 });
    assert.equal(result.fields.scheduledDate, '2026-08-15');
  });

  test('a sentence with nothing in it survives intact', () => {
    const result = parse('סתם משימה בלי כלום');
    assert.equal(result.title, 'סתם משימה בלי כלום');
    assert.equal(result.confidence, 0);
    assert.deepEqual(result.fields, {});
  });

  test('a line that parses down to nothing keeps its original text', () => {
    const result = parse('מחר');
    assert.ok(result.title.length >= 2, 'produced a task with an empty title');
  });

  test('empty input is refused rather than creating a blank task', () => {
    assert.equal(parse('').ok, false);
    assert.equal(parse('   ').ok, false);
  });

  test('everything at once', () => {
    const result = parse('ביום שלישי ב־20:30 לצפות בהרצאה שעה וחצי #לימודים דחוף');
    assert.equal(result.title, 'לצפות בהרצאה');
    assert.equal(result.fields.scheduledDate, '2026-08-18');
    assert.equal(result.fields.scheduledStart, 20 * 60 + 30);
    assert.equal(result.fields.estimatedMinutes, 90);
    assert.deepEqual(result.fields.tags, ['לימודים']);
    assert.equal(result.fields.urgency, 5);
  });

  test('no leftover punctuation or stranded prepositions in any title', () => {
    const samples = [
      'מחר ב־17:00 ללמוד מתמטיקה 45 דקות',
      'ביום ראשון לשלוח דוח',
      'בעוד שבועיים לחדש ביטוח',
      '14.9 להגיש עבודה',
      'כל יום לקרוא חצי שעה',
      'ב־5 אימון',
      'לתקן את הניווט 20 דקות דחוף',
    ];
    for (const s of samples) {
      const title = parse(s).title;
      assert.doesNotMatch(title, /^[בלמהוכש][־-]?\s/, `stranded preposition: ${title}`);
      assert.doesNotMatch(title, /[־-]\s*$/, `trailing dash: ${title}`);
      assert.doesNotMatch(title, /\s{2,}/, `double space: ${title}`);
      assert.equal(title, title.trim());
      assert.ok(title.length > 1, `title too short for ${s}`);
    }
  });
});

describe('project guessing', () => {
  const projects = [
    { id: 'p1', title: 'אתר תיק עבודות', status: 'active' },
    { id: 'p2', title: 'הכנה למבחן במתמטיקה', status: 'active' },
    { id: 'p3', title: 'ישן', status: 'done' },
  ];

  test('a strong overlap is suggested', () => {
    const guess = guessProject('לעדכן את האתר של תיק העבודות', projects);
    assert.ok(guess);
    assert.equal(guess.project.id, 'p1');
  });

  test('Hebrew prefixes do not stop a match', () => {
    /* "לאתר" and "האתר" are the same word for this purpose. */
    assert.ok(guessProject('לסדר את התיק עבודות', projects));
  });

  test('a weak overlap suggests nothing', () => {
    assert.equal(guessProject('לקנות חלב', projects), null);
  });

  test('a finished project is never suggested', () => {
    assert.equal(guessProject('משהו ישן', projects), null);
  });
});
