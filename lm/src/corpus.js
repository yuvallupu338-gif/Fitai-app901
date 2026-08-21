/*
 * corpus.js — the text the model trains on when you have not given it one.
 *
 * A blank textarea is a bad first minute: you cannot tell a broken trainer from
 * an empty one. So the page starts with something to chew on, and since this
 * repository is a training app, what it chews on is training logs — a few
 * hundred sessions written out in the same shape, plus a page of prose about
 * lifting so the model has real sentences to fail at as well.
 *
 * The log half is generated from templates against a seeded generator, which
 * makes it identical on every load and gives the model a structure it can
 * actually learn in the first thirty seconds: a date line, exercises with sets
 * and reps, a note. Watching it discover that "×" is followed by a digit, and
 * then that a line ends after the digit, is the clearest demonstration of what
 * a language model is that fits in half a minute.
 *
 * The prose half is there to keep it honest. Templates are learnable to a loss
 * the model has no business reaching; sentences are not, and the gap between
 * how well it does on the two is the whole lesson about what this architecture
 * can and cannot hold.
 */

import { makeRng } from './rng.js';

const PROSE = `אימון זה לא מה שאתה עושה ביום אחד. זה מה שאתה מסוגל לחזור אליו מחר.
התוכנית הכי טובה היא זו שאתה באמת מבצע, גם כשקר בחוץ וגם כשאין חשק.
עומס עולה לאט. מי שממהר לשלושים חזרות מגיע לפציעה לפני שהוא מגיע לכוח.
טכניקה לפני משקל, טווח תנועה מלא לפני עוד חזרה, ושינה לפני כל השאר.
כאב חד עוצר את הסט. שריפה בשריר היא חלק מהעבודה, דקירה במפרק היא לא.
חימום קצר לפני כל אימון: מפרקים, נשימה, שתי סדרות קלות של התרגיל הראשון.
יום מנוחה הוא חלק מהתוכנית ולא הפסקה ממנה. השריר גדל בין האימונים.
אם עברו שבועיים בלי התקדמות, שנה משתנה אחד בלבד ותן לו שבוע לדבר.
מים לפני קפה, חלבון בכל ארוחה, ופחמימה סביב האימון. אין קיצורי דרך.
כשקשה, תוריד חזרה אחת מכל סט ותשמור על התדירות. עדיף אימון קטן מאשר כלום.
`;

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const BLOCKS = [
  {
    name: 'דחיפה',
    moves: ['שכיבות סמיכה', 'מקבילים', 'לחיצת כתפיים', 'שכיבות יהלום', 'פייק פוש אפ', 'שכיבות רגליים מוגבהות'],
  },
  {
    name: 'משיכה',
    moves: ['מתח אוסטרלי', 'מתח', 'חתירה בטבעות', 'מתח סופינציה', 'משיכת מגבת', 'הליכת מוט'],
  },
  {
    name: 'רגליים',
    moves: ['סקוואט', 'מכרעים', 'סקוואט בולגרי', 'גשר ירכיים', 'עליות מדרגה', 'עליות עקבים'],
  },
  {
    name: 'ליבה',
    moves: ['פלאנק', 'הולו הולד', 'הרמות רגליים', 'פלאנק צד', 'כפיפות בטן', 'סופרמן'],
  },
  {
    name: 'סיבולת',
    moves: ['ריצה קלה', 'קפיצות חבל', 'ברפי', 'הליכה מהירה', 'אינטרוולים', 'טיפוס הרים'],
  },
];

const NOTES = [
  'הרגשה טובה, הסט האחרון היה כבד',
  'הכתף שקטה היום',
  'ישנתי שש שעות וזה הורגש',
  'עליתי חזרה בכל סט',
  'שמרתי טכניקה, לא הוספתי משקל',
  'הפסקות של דקה וחצי',
  'הברך בסדר, בלי כאב',
  'קצת עייף אבל סיימתי הכל',
  'התאמנתי בבוקר לפני העבודה',
  'הורדתי סט אחד כי הזמן נגמר',
  'הדופק חזר מהר בין הסטים',
  'שתיתי מעט מדי לפני האימון',
];

const CLOSERS = [
  'מתיחות חמש דקות',
  'הליכה קלה לסיום',
  'נשימות עמוקות ומקלחת',
  'גלגלת לגב ולירך',
  'מתיחת חזה על המשקוף',
];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

function session(rng, index) {
  const block = pick(rng, BLOCKS);
  const day = DAYS[index % DAYS.length];
  const week = Math.floor(index / 4) + 1;
  const lines = [`שבוע ${week} · יום ${day} · ${block.name}`];

  const count = between(rng, 3, 5);
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let move = pick(rng, block.moves);
    for (let tries = 0; used.has(move) && tries < 5; tries++) move = pick(rng, block.moves);
    used.add(move);
    const sets = between(rng, 2, 5);
    if (block.name === 'סיבולת') {
      lines.push(`${move} ${between(rng, 8, 30)} דקות`);
    } else if (rng() < 0.25) {
      lines.push(`${move} ${sets}×${between(rng, 20, 60)} שניות`);
    } else {
      lines.push(`${move} ${sets}×${between(rng, 4, 15)}`);
    }
  }
  lines.push(`${pick(rng, CLOSERS)}`);
  lines.push(`הערה: ${pick(rng, NOTES)}`);
  return lines.join('\n');
}

/**
 * The default text: prose, then a few hundred logged sessions.
 * Deterministic — the same seed gives the same corpus, so two people comparing
 * loss numbers are comparing the same run.
 */
export function buildCorpus({ seed = 7, sessions = 220 } = {}) {
  const rng = makeRng(seed);
  const parts = [PROSE];
  for (let i = 0; i < sessions; i++) parts.push(session(rng, i));
  return parts.join('\n\n') + '\n';
}
