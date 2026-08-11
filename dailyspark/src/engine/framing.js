/*
 * framing.js — the personal-framing layer, done without a language model.
 *
 * The spec puts an LLM here: it rewrites the chosen spark in the reader's tone
 * and situation while leaving the action untouched. This app runs entirely on
 * the device with no key and no network, so that is not available, and the
 * honest move is to say what this does instead rather than to imitate the
 * output of something that is not running.
 *
 * What it actually does:
 *   - picks between the spark's two sanctioned action lines (the full one and
 *     the author-written `easier`) based on energy and mood;
 *   - prepends one short context clause to the body — the hour, the streak, the
 *     goal that matched — chosen from a small hand-written set per tone;
 *   - softens punctuation and drops the clause entirely on fragile days.
 *
 * What it deliberately does NOT do: rewrite the action. Every action line in
 * this app is text a human wrote and a human checked. A generator that
 * paraphrases it is a generator that can quietly turn "walk for four minutes"
 * into something nobody approved. When a model is added later it goes behind
 * `frame()` with the same contract — same core action, same length limits, and
 * the result still has to pass safety.checkCopy() before anything is shown.
 */

import { isFragile } from '../data/taxonomy.js';
import { checkCopy } from './safety.js';
import { PART_LABEL } from '../core/day.js';

/*
 * Context clauses, per tone.
 *
 * One per tone per situation, not a bank to shuffle through: a clause that
 * varies every day reads as a mail-merge, while a clause that is stable reads
 * as a voice. Variation comes from which situation applies, not from synonyms.
 */
const CLAUSES = {
  morning: {
    gentle: 'לפני שהיום מתחיל באמת.',
    direct: 'עכשיו, לפני שהיום לוקח אותך.',
    humorous: 'לפני שהאימיילים מגלים שקמת.',
    stoic: 'הבוקר הוא החלק היחיד שעדיין בשליטתך.',
    practical: 'הבוקר הוא הזמן שהכי סביר שתעשה את זה.',
  },
  midday: {
    gentle: 'באמצע היום, בין שני דברים.',
    direct: 'בין שתי משימות. עכשיו.',
    humorous: 'הפסקת הצהריים לא חייבת להיות מול המסך.',
    stoic: 'אמצע היום הוא המקום שבו רוב הכוונות נגמרות.',
    practical: 'רווח קצר עכשיו שווה יותר משעה בערב.',
  },
  evening: {
    gentle: 'לקראת סוף היום, בלי למהר.',
    direct: 'לפני שהיום נגמר.',
    humorous: 'לפני הפרק הבא. באמת לפני.',
    stoic: 'מה שנעשה בערב קובע איך נראה הבוקר.',
    practical: 'ערב הוא זמן טוב לדברים שלא דורשים כוח.',
  },
};

const STREAK_CLAUSE = {
  gentle: (n) => `${n} ימים ברצף. אין מה לשמור עליו חוץ מהיום עצמו.`,
  direct: (n) => `${n} ימים. אל תסבך את זה.`,
  humorous: (n) => `${n} ימים ברצף. מרשים, ולא נספר לאף אחד.`,
  stoic: (n) => `${n} ימים. ההמשכיות היא כל העניין.`,
  practical: (n) => `${n} ימים ברצף.`,
};

/*
 * Which situation gets the clause when several apply.
 *
 * Only one is ever used. Two clauses turn a card into a paragraph, and the
 * body has 220 characters that the spark's own text has first claim on.
 */
function pickClause(ctx) {
  if (ctx.fragile) return null;              // a hard day gets no commentary
  if (ctx.streak >= 3 && ctx.streak % 5 === 0) {
    const fn = STREAK_CLAUSE[ctx.tone] || STREAK_CLAUSE.practical;
    return fn(ctx.streak);
  }
  const byPart = CLAUSES[ctx.part];
  if (!byPart) return null;
  return byPart[ctx.tone] || byPart.practical;
}

/*
 * Choose the action line.
 *
 * The easier variant is used when the mood is fragile or energy is at the
 * floor — and only if the author wrote one. Falling back to the full action is
 * correct: retrieval already guaranteed the size fits the budget, so the full
 * line is never out of reach, only sometimes more than the day deserves.
 */
function pickAction(spark, ctx) {
  if ((ctx.fragile || ctx.energy <= 1) && spark.easier) return spark.easier;
  return spark.action;
}

/*
 * Build the "why this" line.
 *
 * This is the app's transparency obligation and its best defence against
 * feeling generic, so it names the actual reason rather than gesturing at one.
 * Priority order: an explicit goal the user set, then a learned preference,
 * then the mood, then the time. Never more than one reason — a list of four
 * reads as a system explaining itself, not as an app that knows you.
 */
export function whyThis(spark, ctx) {
  if (ctx.goalLabel) return `כי סימנת "${ctx.goalLabel}".`;
  if (ctx.fragile) return 'כי סימנת שהיום לא קל, אז זה בכוונה קטן.';
  if (ctx.learnedCategory === spark.category) {
    return `כי אתה נוטה לבצע ניצוצות של ${ctx.categoryLabel}.`;
  }
  if (ctx.learnedPart === ctx.part) {
    return `כי ${PART_LABEL[ctx.part]} הוא הזמן שאתה הכי מבצע בו.`;
  }
  if (ctx.isNewCategory) return 'כי עוד לא ניסינו את התחום הזה יחד.';
  return `כי ביקשת ${ctx.budgetMinutes === 1 ? 'דקה' : `${ctx.budgetMinutes} דקות`} ליום.`;
}

/*
 * Frame a spark for one reader at one moment.
 *
 * Returns { title, body, action, why, framed } where `framed` records whether
 * anything was actually changed — the book shows the delivered text, and it
 * should be able to say honestly whether the reader saw the library copy or a
 * situated version of it.
 *
 * If the result fails the safety check the original spark is returned
 * untouched. That is the fallback path in the spec, and it is why the check
 * runs here and not only at the call site.
 */
export function frame(spark, ctx) {
  const fragile = !!(ctx.mood && isFragile(ctx.mood));
  const context = Object.assign({}, ctx, { fragile });

  const action = pickAction(spark, context);
  const clause = pickClause(context);

  let body = spark.body;
  if (clause && (body.length + clause.length + 1) <= 220) body = `${body} ${clause}`;

  /* On a fragile day the app lowers its voice: no exclamation marks, ever.
   * The library does not use them, but the rule is enforced rather than
   * assumed, because this is the one path where copy is assembled at runtime. */
  if (fragile) body = body.replace(/!+/g, '.');

  const candidate = { title: spark.title, body, action };
  const verdict = checkCopy(candidate, { fragile });
  if (!verdict.ok) {
    return {
      title: spark.title,
      body: spark.body,
      action: spark.action,
      why: whyThis(spark, context),
      framed: false,
      blocked: verdict.check,
    };
  }

  return {
    title: candidate.title,
    body: candidate.body,
    action: candidate.action,
    why: whyThis(spark, context),
    framed: body !== spark.body || action !== spark.action,
    blocked: null,
  };
}
