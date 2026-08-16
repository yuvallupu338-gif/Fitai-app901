/*
 * restday.js — one small, concrete job for each rest day.
 *
 * A rest day used to be an absence: the week strip left it blank and a footer
 * said walking and stretching were a good idea. That is true and it is also
 * nothing to do, so it got treated as nothing — which is how a four-day week
 * becomes three sessions and four days of no movement at all.
 *
 * These are NOT training. Nothing here builds a set, adds to weekly volume, or
 * asks for effort that has to be recovered from. The rule every task obeys is
 * that it should leave you fresher than it found you, which is why the hard
 * options a fitness app reaches for by default — intervals, "active recovery"
 * circuits, an easy lifting day — are not in the list.
 *
 * Deterministic: same profile, same tasks, in the same order. Pure arithmetic
 * and table lookups over a profile; no DOM, no randomness, no dates.
 */

import { hashProfile, rotate } from '../data/exercises.index.js';
import { withholdsBodyNumbers, IMPACT_EASES_FROM } from './age.js';

/*
 * The catalogue.
 *
 * `needs` is equipment that must be present. `hurts` lists the injuries that
 * rule a task out — a jump rope is 100+ landings on one knee, which is the
 * opposite of a rest day for someone whose knee is the reason they are careful.
 * `load` is what the task costs the body, and it is what stops these stacking
 * into a fifth session: at most one 'moderate' task per week.
 *
 * `maxAge` is the same idea as `hurts`, for the risk nobody ticks a box for.
 * The injury filter catches a jump rope for a declared bad knee; it had nothing
 * to say about an eighty-two-year-old with no injuries listed, who was being
 * handed ten minutes of jumping — a hundred landings and a balance demand, on a
 * day meant for recovery. Where a task is capped there is always a gentler one
 * left in the pool, so the day still has something on it.
 */
const TASKS = [
  {
    id: 'walk_3k',
    title: 'הליכה 3 ק״מ',
    body: 'קצב שבו אפשר לדבר אבל לא לשיר. בערך 30–35 דקות. זה הדבר היחיד ברשימה שכמעט תמיד שווה לעשות.',
    load: 'easy', needs: [], hurts: [],
  },
  {
    id: 'walk_5k',
    title: 'הליכה 5 ק״מ',
    body: 'בערך 50 דקות. אם אתה עושה את זה אחרי ארוחה — עוד יותר טוב, זה מיישר את הסוכר בדם.',
    load: 'moderate', needs: [], hurts: ['knee', 'ankle', 'hip'], maxAge: 70,
  },
  {
    id: 'jump_rope_10',
    title: 'קפיצה בחבל 10 דקות',
    body: 'לא ברצף — 8 סבבים של דקה עם חצי דקה הפסקה. הכתפיים עושות את הסיבוב, לא המרפקים.',
    // Shares its cap with the warm-up's impact line: both decide whether to
    // make the same person land, and they must not answer differently.
    load: 'moderate', needs: ['jump_rope'], hurts: ['knee', 'ankle', 'lower_back'],
    maxAge: IMPACT_EASES_FROM,
  },
  {
    id: 'bike_20',
    title: 'אופניים 20 דקות',
    body: 'התנגדות נמוכה, רגליים מסתובבות מהר. המטרה היא להזרים דם לרגליים אחרי יום הרגליים, לא לעבוד עליהן שוב.',
    load: 'easy', needs: ['bike'], hurts: [],
  },
  {
    id: 'swim_20',
    title: 'שחייה 20 דקות',
    body: 'הדבר הכי קל על המפרקים שיש. גם מי שלא יודע לשחות טוב — 20 דקות של תנועה במים עושות את העבודה.',
    // 'shoulder' was missing, and the sentence above is why: swimming is the
    // joint-friendly exercise, and for knees and hips that is exactly right —
    // which is what makes the shoulder easy to miss. Twenty minutes of front
    // crawl is several hundred rotations of a loaded arm overhead, the single
    // movement a declared shoulder is being kept away from all week. The plan
    // then handed it back on the day meant for recovery.
    // Every other task here is doable from the front door; this one needs a
    // body of water, and it was the only entry claiming otherwise. The app was
    // telling people with no pool to go for a swim, which is not advice — it is
    // a blank rest day dressed as one.
    load: 'easy', needs: ['pool'], hurts: ['shoulder'],
  },
  {
    id: 'mobility_10',
    title: '10 דקות ניידות ירכיים וכתפיים',
    body: 'המקומות שנתקעים ראשונים ממחשב ומישיבה. חמש דקות לכל אזור, בלי למתוח עד כאב.',
    load: 'easy', needs: [], hurts: [],
  },
  {
    id: 'stairs_10',
    title: '10 קומות מדרגות',
    body: 'עולים ברגל, יורדים במעלית. הירידה היא מה שמכאיב מחר, והיא לא נחוצה כאן.',
    // 'ankle' to match the flat 5 km walk beside it, which already carries it.
    // Ten flights is the same plantarflexion the walk asks for, concentrated:
    // every step up drives off the forefoot with the whole body over it.
    load: 'moderate', needs: [], hurts: ['knee', 'ankle', 'hip'], maxAge: 65,
  },
  {
    id: 'carry_walk',
    title: 'הליכה עם קניות 15 דקות',
    body: 'משקל בכל יד, כתפיים אחורה, צעד רגיל. זה תרגיל אחיזה וליבה שמתחפש לסידורים.',
    load: 'easy', needs: [], hurts: ['lower_back', 'shoulder', 'elbow', 'wrist'],
  },
  {
    id: 'stretch_hips',
    title: '8 דקות מתיחות לירכיים',
    body: 'כופף ירך וישבן, 90 שניות לכל צד, נשימה עמוקה. אחרי סקוואטים או ריצה זה מה שמחזיר את הטווח.',
    load: 'easy', needs: [], hurts: [],
  },
  {
    id: 'walk_hills',
    title: 'הליכה 30 דקות בעלייה',
    body: 'רחוב משופע או הליכון בשיפוע 6–8. העלייה מעלה דופק בלי הזעזוע שיש בריצה.',
    // 'hip' was missing while the flat 5 km walk beside it carries it. Half an
    // hour at a 6–8% grade asks considerably more of hip flexion and extension
    // than the same half hour on the level, so if one of them is a problem for
    // a declared hip, this is the one. Found by the audit disagreeing with the
    // table rather than reading it.
    load: 'moderate', needs: [], hurts: ['knee', 'ankle', 'hip'], maxAge: 70,
  },
  {
    id: 'row_15',
    title: 'חתירה 15 דקות',
    body: 'קצב נוח, נשימה שמדברת. רגליים דוחפות ראשונות, ידיים מושכות אחרונות.',
    // 'shoulder' because the pull is the point of the movement. The catalogue
    // already rules out carrying the shopping for a declared shoulder, and a
    // rowing machine asks considerably more of it than two bags do — rarely
    // reached, since it needs a rower, but the rule should not depend on that.
    load: 'moderate', needs: ['rower'], hurts: ['lower_back', 'shoulder'],
  },
  {
    id: 'play',
    title: 'משחק כדור או ריקוד — חצי שעה',
    body: 'לא חייב להיראות כמו אימון כדי לספור. חצי שעה של תנועה שאתה נהנה ממנה עושה את אותה עבודה.',
    // Half an hour of a ball game is cutting, pivoting and landing at whatever
    // speed the game asks for — the least controlled thing in this catalogue,
    // and the classic mechanism for exactly these three joints. The audit meant
    // to rule it out and had been naming an id that does not exist.
    load: 'easy', needs: [], hurts: ['knee', 'ankle', 'hip'],
  },
];

/* Goals lean the order: fat loss wants steps, strength wants tissue quality. */
const PREFERENCE = {
  fatloss: ['walk_5k', 'walk_3k', 'walk_hills', 'stairs_10', 'jump_rope_10'],
  fitness: ['walk_3k', 'jump_rope_10', 'bike_20', 'play'],
  muscle: ['walk_3k', 'mobility_10', 'stretch_hips', 'swim_20'],
  strength: ['mobility_10', 'stretch_hips', 'walk_3k', 'swim_20'],
  sport: ['mobility_10', 'walk_3k', 'play', 'stretch_hips'],
};

/* How many of the week's rest days get a task. The rest stay genuinely empty:
   a plan that fills all seven days is a plan nobody keeps for a month. */
function taskDayCount(restCount, goal) {
  if (restCount <= 1) return restCount;
  if (goal === 'fatloss') return Math.min(restCount, restCount - 1 + (restCount >= 4 ? 1 : 0));
  return Math.max(1, Math.min(restCount - 1, 3));
}

function allowed(task, profile) {
  const inj = new Set(profile.injuries || []);
  if (task.hurts.some((q) => inj.has(q))) return false;
  const owned = new Set(profile.equipment || []);
  if (!task.needs.every((q) => owned.has(q))) return false;
  const age = Number(profile.age);
  if (task.maxAge && Number.isFinite(age) && age > task.maxAge) return false;
  return true;
}

/**
 * One task per resting weekday, as
 * `[{ dayIndex, id, title, body, load }]`, ordered by weekday.
 *
 * `restDayIndexes` is which weekdays are free — the caller knows them, because
 * it knows which days the program put sessions on.
 */
export function restDayTasks(profile, restDayIndexes) {
  const p = profile || {};
  const rest = (restDayIndexes || []).slice().sort((a, b) => a - b);
  if (!rest.length) return [];

  const goal = PREFERENCE[p.goal] ? p.goal : 'fitness';
  const pool = TASKS.filter((t) => allowed(t, p));
  if (!pool.length) return [];

  /*
   * The goal's own picks come first, in the goal's order — that is the whole
   * point of the preference list. Only the tail is rotated by the profile hash,
   * so two people with the same goal get the same first choices and a different
   * fourth one. Rotating the whole list buried jump rope under rowing for a
   * fitness goal that had asked for jump rope second.
   */
  const pref = PREFERENCE[goal];
  const preferred = pref
    .map((id) => pool.find((t) => t.id === id))
    .filter(Boolean);
  const restOfPool = pool
    .filter((t) => pref.indexOf(t.id) < 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const queue = preferred.concat(
    rotate(restOfPool, hashProfile(p) % Math.max(1, restOfPool.length)),
  );

  const want = taskDayCount(rest.length, goal);
  const out = [];
  let moderate = 0;
  for (const dayIndex of rest) {
    if (out.length >= want) break;
    // At most one demanding task a week. The others are what a rest day is for.
    const next = queue.find((t) => !out.some((o) => o.id === t.id)
      && (t.load !== 'moderate' || moderate === 0));
    if (!next) break;
    if (next.load === 'moderate') moderate += 1;
    out.push({ dayIndex, id: next.id, title: next.title, body: next.body, load: next.load });
  }
  return out;
}

/**
 * The sentence under the week strip. Says what the rest days are for, and
 * changes when there is nothing scheduled on them.
 */
export function restNote(profile, tasks, restCount) {
  if (!restCount) return 'שבוע מלא. שים לב להתאוששות.';
  if (!tasks.length) return 'ימי המנוחה הם מנוחה. הליכה קלה ומתיחות זה מצוין, אבל שום דבר חייב.';
  // Under 16 the framing stays away from anything that sounds like a target.
  if (withholdsBodyNumbers(profile)) {
    return 'בימי המנוחה יש משימה קטנה אחת. היא לא אימון ולא חייבים אותה — היא רק כדי לא לשבת כל היום.';
  }
  return `${tasks.length} משימות קטנות בימי המנוחה. הן לא אימון — הן מה שגורם לאימון הבא להרגיש טוב יותר.`;
}

export { TASKS };
