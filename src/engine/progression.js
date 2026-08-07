/*
 * progression.js — how the program moves forward.
 *
 * Four answers live here:
 *   buildPhases()      the shape of the block. A strength plan peaks and then
 *                      measures; a fat-loss plan keeps the weights and drops
 *                      the sets; a hypertrophy plan accumulates volume and then
 *                      turns it into load.
 *   progressionModel() the ladder. Reps before load, load before sets — and for
 *                      anyone training with bodyweight only, leverage and tempo
 *                      instead of kilos, because there are no kilos.
 *   projectTargets()   what the numbers should look like at the end, grounded in
 *                      real rates of change rather than wishful arithmetic.
 *   weeklyPlanNote()   one line for the week the user is standing in, including
 *                      an explicit instruction on deload weeks.
 *
 * Selection goes through candidates() from the registry — equipment, refusals,
 * injuries and the level cap are its business. Nothing here uses Math.random();
 * the little variety there is comes from hashProfile().
 */

import { candidates, hashProfile, rotate } from '../data/exercises.index.js';
import { withholdsFatLoss } from './age.js';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const GOALS = ['fatloss', 'muscle', 'strength', 'fitness', 'sport'];
const EXPS = ['beginner', 'returning', 'intermediate', 'advanced'];

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clampInt(v, lo, hi, d) {
  const n = Math.round(num(v, d));
  return Math.max(lo, Math.min(hi, n));
}

/*
 * The goal this plan is actually executing, which is not always the chip.
 *
 * Everything in this file is narrative: phase titles, the progression cards,
 * the weekly note. None of it picks an exercise. So it has to describe the plan
 * that was built, and under 18 the plan that was built is not a diet —
 * nutrition.js holds a minor at maintenance whatever the chip says.
 *
 * It used to read the chip. A thirteen-year-old who picked חיטוב was given a
 * phase map opening "קובעים ימים קבועים ומתחילים גירעון מתון. שקילה אחת בשבוע,
 * אותו יום ואותה שעה" — on the same plan whose nutrition tab said, correctly,
 * that there is deliberately no calorie counting and no weekly weighing here.
 * Both sentences were written honestly. Neither knew about the other, which is
 * the sentence at the top of age.js describing the bug it was created to stop.
 *
 * Mapping to fitness rather than inventing a fourth phase table is deliberate:
 * a minor who wants to lean out is running a training plan at maintenance, and
 * that is exactly what the fitness track already describes.
 */
function goalOf(p) {
  const goal = GOALS.indexOf(p && p.goal) >= 0 ? p.goal : 'fitness';
  if (goal === 'fatloss' && withholdsFatLoss(p)) return 'fitness';
  return goal;
}

function expOf(p) {
  return EXPS.indexOf(p && p.experience) >= 0 ? p.experience : 'beginner';
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}

/** Weeks of program. Same clamp the generator uses, so the phase map matches. */
function programWeeks(profile) {
  const t = Date.parse(`${profile && profile.targetDate}T00:00:00`);
  if (!Number.isFinite(t)) return 12;
  const diff = (t - Date.now()) / (7 * 24 * 3600 * 1000);
  return clampInt(Math.ceil(diff), 4, 24, 12);
}

/* ------------------------------------------------------------------ *
 * What this profile can actually be loaded with
 * ------------------------------------------------------------------ */

const MAIN_PATTERNS = ['horizontal_push', 'vertical_push', 'horizontal_pull',
  'vertical_pull', 'squat', 'hinge', 'lunge'];

/**
 * Equipment tokens that appear in exercises this profile can really be
 * prescribed — asked of the registry rather than read off the profile, so the
 * level cap, injuries and refusals are already accounted for. Falls back to the
 * declared equipment list if the registry has nothing to say.
 */
function kit(profile) {
  const seen = new Set();
  let any = false;
  for (const pattern of MAIN_PATTERNS) {
    for (const ex of candidates(profile, { pattern })) {
      any = true;
      for (const q of ex.equipment || []) seen.add(q);
    }
  }
  if (!any) for (const q of (profile && profile.equipment) || []) seen.add(q);

  const barbell = seen.has('barbell');
  const freeWeights = seen.has('dumbbells') || seen.has('kettlebell');
  const machines = seen.has('machines') || seen.has('cable');
  return {
    barbell,
    freeWeights,
    machines,
    bands: seen.has('bands'),
    loaded: barbell || freeWeights || machines,
  };
}

/** Can this profile hang from something and pull itself up? */
function canHang(profile) {
  const list = candidates(profile, { pattern: 'vertical_pull' });
  if (list.length) {
    return list.some((e) => (e.equipment || []).some((q) => q === 'pullup_bar' || q === 'rings'));
  }
  const eq = (profile && profile.equipment) || [];
  return eq.indexOf('pullup_bar') >= 0 || eq.indexOf('rings') >= 0;
}

/* ------------------------------------------------------------------ *
 * 1. buildPhases
 * ------------------------------------------------------------------ */

/*
 * Phase plans per goal, per phase count. `s` is a share of the total weeks;
 * shares are normalised, so they only need to be right relative to each other.
 * `{w}` in a description is replaced with the number of weeks in the program.
 *
 * The two-phase plans are only used when the target date is less than eight
 * weeks out, and they say so — a short block is a different animal, not a
 * shrunken version of a long one.
 */
const PHASE_PLANS = {
  strength: {
    2: [
      { s: 0.45, title: 'בסיס דחוס', desc: 'נשארו {w} שבועות בלבד, אז התוכנית מתכווצת לשני שלבים: כאן מייצבים טכניקה ומעלים משקל בכל אימון שאפשר.' },
      { s: 0.55, title: 'עצימות ומדידה', desc: 'חזרות יורדות ל־3–5 והמנוחות מתארכות. בלוק קצר מוציא החוצה כוח שכבר קיים — הוא לא בונה בסיס חדש.' },
    ],
    3: [
      { s: 0.28, title: 'בסיס וטכניקה', desc: 'משקלים בינוניים ותבנית נקייה. כל סט נגמר עם שתי חזרות ברזרבה, אף סט לא נגמר בכישלון.' },
      { s: 0.38, title: 'צבירה', desc: '5–8 חזרות במשקל שעולה בהדרגה — כאן נבנה החומר שהעצימות תשתמש בו בהמשך.' },
      { s: 0.34, title: 'עצימות ושיא', desc: 'חזרות 3–5, עבודת העזר מצטמצמת, והשבוע האחרון בודק כמה באמת עלה.' },
    ],
    4: [
      { s: 0.22, title: 'בסיס וטכניקה', desc: 'משקלים בינוניים ותבנית נקייה. כל סט נגמר עם שתי חזרות ברזרבה, אף סט לא נגמר בכישלון.' },
      { s: 0.30, title: 'צבירה', desc: '5–8 חזרות במשקל שעולה בהדרגה. הנפח כאן הוא ההשקעה, השיא בהמשך הוא התשואה.' },
      { s: 0.28, title: 'עצימות', desc: 'חזרות 3–5 במשקלים כבדים יותר, פחות עבודת עזר — ההתאוששות עוברת לתרגילים המרכזיים.' },
      { s: 0.20, title: 'שיא ומדידה', desc: 'סינגלים וזוגות כבדים במנוחות ארוכות, ואז שבוע קל ומדידה של 1RM או 3RM.' },
    ],
    5: [
      { s: 0.18, title: 'בסיס וטכניקה', desc: 'משקלים בינוניים ותבנית נקייה. כל סט נגמר עם שתי חזרות ברזרבה, אף סט לא נגמר בכישלון.' },
      { s: 0.26, title: 'צבירה', desc: '5–8 חזרות במשקל שעולה בהדרגה. הנפח כאן הוא ההשקעה, השיא בהמשך הוא התשואה.' },
      { s: 0.24, title: 'עצימות', desc: 'חזרות 3–5 במשקלים כבדים יותר, פחות עבודת עזר — ההתאוששות עוברת לתרגילים המרכזיים.' },
      { s: 0.20, title: 'שיא', desc: 'סינגלים וזוגות כבדים, נפח נמוך, מנוחות ארוכות. כאן הכוח שנבנה יוצא החוצה.' },
      { s: 0.12, title: 'הורדה ומדידה', desc: 'שבוע קל שמנקה עייפות, ואחריו מדידה נקייה של התרגילים המרכזיים.' },
    ],
  },

  muscle: {
    2: [
      { s: 0.45, title: 'התנעה', desc: '{w} שבועות זה קצר לעלייה במסה, אז זה נדחס לשני שלבים: כאן קובעים טכניקה, טווחי חזרות ומשקלי עבודה.' },
      { s: 0.55, title: 'צבירה והעצמה', desc: 'נפח בקצה העליון של מה שאתה מתאושש ממנו, 1–2 חזרות מכשל, טווח תנועה מלא בכל סט.' },
    ],
    3: [
      { s: 0.24, title: 'הסתגלות', desc: 'לומדים את התרגילים ואת הטווחים. הכאב של השבועיים הראשונים חולף, והוא לא מדד להצלחה.' },
      { s: 0.40, title: 'צבירת נפח', desc: '8–12 חזרות, סט נוסף כשהטכניקה מחזיקה. השלב הזה עושה את רוב העבודה.' },
      { s: 0.36, title: 'העצמה', desc: 'הנפח יורד מעט, המשקלים עולים, והסטים מסתיימים קרוב יותר לכשל.' },
    ],
    4: [
      { s: 0.18, title: 'הסתגלות', desc: 'לומדים את התרגילים ואת הטווחים. הכאב של השבועיים הראשונים חולף, והוא לא מדד להצלחה.' },
      { s: 0.30, title: 'צבירת נפח', desc: '8–12 חזרות, סט נוסף כשהטכניקה מחזיקה. כל שבוע מוסיף קצת עבודה, לא הרבה.' },
      { s: 0.30, title: 'נפח בשיא', desc: 'הנפח בקצה העליון של מה שאתה מתאושש ממנו — ומכאן הוא כבר לא עולה.' },
      { s: 0.22, title: 'העצמה ומדידה', desc: '6–10 חזרות במשקלים גבוהים יותר, ובסוף מדידת היקפים ומשקלי עבודה מול ההתחלה.' },
    ],
    5: [
      { s: 0.16, title: 'הסתגלות', desc: 'לומדים את התרגילים ואת הטווחים. הכאב של השבועיים הראשונים חולף, והוא לא מדד להצלחה.' },
      { s: 0.26, title: 'צבירת נפח', desc: '8–12 חזרות, סט נוסף כשהטכניקה מחזיקה. כל שבוע מוסיף קצת עבודה, לא הרבה.' },
      { s: 0.24, title: 'נפח בשיא', desc: 'הנפח בקצה העליון של מה שאתה מתאושש ממנו — ומכאן הוא כבר לא עולה.' },
      { s: 0.22, title: 'העצמה', desc: '6–10 חזרות במשקלים גבוהים יותר. פחות סטים, יותר עומס על כל סט.' },
      { s: 0.12, title: 'הורדה ומדידה', desc: 'שבוע קל שמאפשר לגוף להדביק את הפער, ואז מדידת היקפים ומשקלי עבודה.' },
    ],
  },

  fatloss: {
    2: [
      { s: 0.45, title: 'התנעה', desc: 'נשארו {w} שבועות, אז זה מתקצר לשני שלבים: ימים קבועים, גירעון מתון ושקילה שבועית אחת.' },
      { s: 0.55, title: 'גירעון יציב', desc: 'הקצב נשמר קבוע והמשקלים באימון לא יורדים — זה מה ששומר על השריר בזמן הירידה.' },
    ],
    3: [
      { s: 0.24, title: 'התנעה', desc: 'קובעים ימים קבועים ומתחילים גירעון מתון. שקילה אחת בשבוע, אותו יום ואותה שעה.' },
      { s: 0.42, title: 'גירעון יציב', desc: 'הירידה בקצב קבוע. הנפח יורד מעט ככל שהקלוריות יורדות, אבל המשקלים נשארים.' },
      { s: 0.34, title: 'שמירה על עומס', desc: 'פחות סטים, אותה עצימות. המטרה עכשיו היא לא לאבד כוח, לא להוסיף.' },
    ],
    4: [
      { s: 0.18, title: 'התנעה', desc: 'קובעים ימים קבועים ומתחילים גירעון מתון. שקילה אחת בשבוע, אותו יום ואותה שעה.' },
      { s: 0.32, title: 'גירעון יציב', desc: 'הירידה בקצב קבוע. הנפח יורד מעט ככל שהקלוריות יורדות, אבל המשקלים נשארים.' },
      { s: 0.28, title: 'שמירה על עומס', desc: 'פחות סטים, אותה עצימות. המטרה עכשיו היא לא לאבד כוח, לא להוסיף.' },
      { s: 0.22, title: 'ליטוש וייצוב', desc: 'אותם משקלים, יותר צעדים, ואז העלאה הדרגתית חזרה לתחזוקה. ירידה שלא מתייצבת חוזרת.' },
    ],
    5: [
      { s: 0.14, title: 'התנעה', desc: 'קובעים ימים קבועים ומתחילים גירעון מתון. שקילה אחת בשבוע, אותו יום ואותה שעה.' },
      { s: 0.26, title: 'גירעון יציב', desc: 'הירידה בקצב קבוע. הנפח יורד מעט ככל שהקלוריות יורדות, אבל המשקלים נשארים.' },
      { s: 0.24, title: 'שמירה על עומס', desc: 'פחות סטים, אותה עצימות. המטרה עכשיו היא לא לאבד כוח, לא להוסיף.' },
      { s: 0.20, title: 'ליטוש', desc: 'אותם משקלים, יותר צעדים ותשומת לב לשינה. כאן נראים ההבדלים הקטנים.' },
      { s: 0.16, title: 'ייצוב', desc: 'מעלים קלוריות בהדרגה חזרה לתחזוקה ומוודאים שהמשקל מחזיק שבועיים ברצף.' },
    ],
  },

  fitness: {
    2: [
      { s: 0.45, title: 'התנעה', desc: 'יש {w} שבועות, אז זה שני שלבים: קודם כול להגיע לאימונים ולהריץ את התנועות נקי.' },
      { s: 0.55, title: 'בנייה', desc: 'מוסיפים סטים, משקל ואירובי קבוע. בשלב הזה הכושר כבר מרגיש אחרת ביום־יום.' },
    ],
    3: [
      { s: 0.28, title: 'בסיס', desc: 'בונים תדירות ותנועה נקייה. בשלב הזה עצם ההגעה לאימון היא ההתקדמות.' },
      { s: 0.38, title: 'בנייה', desc: 'מוסיפים סטים ומשקל בהדרגה, ומכניסים אירובי קבוע לשבוע.' },
      { s: 0.34, title: 'ייצוב', desc: 'שומרים על מה שנבנה, מוסיפים מעט עומס, ובודקים את המספרים מול ההתחלה.' },
    ],
    4: [
      { s: 0.22, title: 'בסיס', desc: 'בונים תדירות ותנועה נקייה. בשלב הזה עצם ההגעה לאימון היא ההתקדמות.' },
      { s: 0.30, title: 'בנייה', desc: 'מוסיפים סטים ומשקל בהדרגה, ומכניסים אירובי קבוע לשבוע.' },
      { s: 0.26, title: 'הרחבה', desc: 'ואריאציות קשות יותר וטווחי תנועה מלאים. האימון מתחיל להרגיש כמו יכולת ולא כמו מטלה.' },
      { s: 0.22, title: 'ייצוב', desc: 'שומרים על מה שנבנה, מוסיפים מעט עומס, ובודקים את המספרים מול ההתחלה.' },
    ],
    5: [
      { s: 0.18, title: 'בסיס', desc: 'בונים תדירות ותנועה נקייה. בשלב הזה עצם ההגעה לאימון היא ההתקדמות.' },
      { s: 0.26, title: 'בנייה', desc: 'מוסיפים סטים ומשקל בהדרגה, ומכניסים אירובי קבוע לשבוע.' },
      { s: 0.24, title: 'הרחבה', desc: 'ואריאציות קשות יותר וטווחי תנועה מלאים. האימון מתחיל להרגיש כמו יכולת ולא כמו מטלה.' },
      { s: 0.18, title: 'אתגר', desc: 'שבועות עמוסים יותר: יותר עומס, יותר אירובי, פחות מנוחה בין סטים קלים.' },
      { s: 0.14, title: 'ייצוב ומדידה', desc: 'מורידים עומס, שומרים על התדירות, ומודדים את אותם מספרים שנמדדו בהתחלה.' },
    ],
  },

  sport: {
    2: [
      { s: 0.45, title: 'הכנה כללית', desc: 'נשארו {w} שבועות למועד, אז זה שני שלבים: כאן בונים בסיס כוח ועמידות בסיסית לפציעות.' },
      { s: 0.55, title: 'חידוד', desc: 'מורידים נפח ושומרים על עצימות ומהירות. מגיעים למועד רעננים, לא שחוקים.' },
    ],
    3: [
      { s: 0.34, title: 'הכנה כללית', desc: 'כוח בסיסי וטווחי תנועה, בלי קשר ישיר לענף. כאן נבנית העמידות לפציעות.' },
      { s: 0.36, title: 'הכנה ייעודית', desc: 'העבודה מתקרבת לדרישות הענף: כיווני תנועה, מהירות וסיבולת ספציפית.' },
      { s: 0.30, title: 'חידוד', desc: 'מורידים נפח ושומרים על עצימות. הרגליים צריכות להיות טריות ביום המשחק.' },
    ],
    4: [
      { s: 0.28, title: 'הכנה כללית', desc: 'כוח בסיסי וטווחי תנועה, בלי קשר ישיר לענף. כאן נבנית העמידות לפציעות.' },
      { s: 0.28, title: 'הכנה ייעודית', desc: 'העבודה מתקרבת לדרישות הענף: כיווני תנועה, מהירות וסיבולת ספציפית.' },
      { s: 0.24, title: 'הספק', desc: 'פחות נפח, יותר מהירות: קפיצות והרמות מהירות בתחילת האימון, כשאתה טרי.' },
      { s: 0.20, title: 'חידוד', desc: 'מורידים נפח ושומרים על עצימות. הרגליים צריכות להיות טריות ביום המשחק.' },
    ],
    5: [
      { s: 0.24, title: 'הכנה כללית', desc: 'כוח בסיסי וטווחי תנועה, בלי קשר ישיר לענף. כאן נבנית העמידות לפציעות.' },
      { s: 0.24, title: 'הכנה ייעודית', desc: 'העבודה מתקרבת לדרישות הענף: כיווני תנועה, מהירות וסיבולת ספציפית.' },
      { s: 0.22, title: 'הספק', desc: 'פחות נפח, יותר מהירות: קפיצות והרמות מהירות בתחילת האימון, כשאתה טרי.' },
      { s: 0.16, title: 'חידוד', desc: 'מורידים נפח ושומרים על עצימות. הרגליים צריכות להיות טריות ביום המשחק.' },
      { s: 0.14, title: 'שמירה', desc: 'שני אימוני כוח קצרים בשבוע ששומרים על מה שנבנה בלי להתחרות באימוני הענף.' },
    ],
  },
};

/** Beginners need a longer runway; advanced lifters spend more of it sharp. */
function tilt(shares, exp) {
  const out = shares.slice();
  if (out.length < 2) return out;
  if (exp === 'beginner') out[0] *= 1.30;
  if (exp === 'returning') out[0] *= 1.15;
  if (exp === 'advanced') {
    out[0] *= 0.80;
    out[out.length - 1] *= 1.15;
  }
  return out;
}

/** Split `total` weeks by share, never handing any phase fewer than one week. */
function splitWeeks(total, shares) {
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  const raw = shares.map((s) => (total * s) / sum);
  const out = raw.map((r) => Math.max(1, Math.floor(r)));
  let left = total - out.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map((x) => x[1]);

  let k = 0;
  while (left > 0) {
    out[order[k % order.length]] += 1;
    left -= 1;
    k += 1;
  }
  // The one-week floor can overspend on very short programs: take it back from
  // the longest phase, never below one week.
  while (left < 0) {
    let big = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[big]) big = i;
    if (out[big] <= 1) break;
    out[big] -= 1;
    left += 1;
  }
  return out;
}

function phaseCount(weeks) {
  if (weeks < 8) return 2;
  if (weeks <= 12) return 3;
  if (weeks <= 18) return 4;
  return 5;
}

/**
 * The phase map: 2–5 named blocks covering every week of the program.
 * Returns [{ weeks: [start, end], title, desc }].
 */
export function buildPhases(profile) {
  const p = profile || {};
  const weeks = programWeeks(p);
  const plans = PHASE_PLANS[goalOf(p)] || PHASE_PLANS.fitness;
  const n = Math.min(phaseCount(weeks), weeks);
  const plan = plans[n] || plans[2];
  const lens = splitWeeks(weeks, tilt(plan.map((x) => x.s), expOf(p)));

  const out = [];
  let cursor = 1;
  for (let i = 0; i < plan.length && cursor <= weeks; i++) {
    const len = Math.max(1, lens[i] || 1);
    const start = cursor;
    const end = Math.min(weeks, start + len - 1);
    out.push({
      weeks: [start, end],
      title: plan[i].title,
      desc: String(plan[i].desc).replace('{w}', String(weeks)),
    });
    cursor = end + 1;
  }
  if (out.length) out[out.length - 1].weeks[1] = weeks;
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. progressionModel
 * ------------------------------------------------------------------ */

/**
 * How much weight to add when the top of the rep range is reached.
 * 5 kg where a barbell loads the legs, 2.5 kg on everything the arms move,
 * halved for small or young lifters, for whom 5 kg is a 10% jump.
 */
function loadJump(profile, k) {
  if (!k.loaded) return 0;
  const bw = num(profile.weightKg, 70);
  const age = num(profile.age, 30);
  let jump = k.barbell ? 5 : 2.5;
  if (bw < 60 || age < 16 || age >= 68) jump = jump / 2;
  if (!k.barbell && !k.freeWeights && k.machines) jump = Math.max(jump, 2.5);
  return jump;
}

/** How often the week gets pulled back so the body can catch up. */
function deloadEvery(profile) {
  const exp = expOf(profile);
  const goal = goalOf(profile);
  let n = { beginner: 6, returning: 5, intermediate: 5, advanced: 4 }[exp];
  if (goal === 'strength' && (exp === 'intermediate' || exp === 'advanced')) n = 4;
  if (goal === 'fatloss') n = Math.min(n, 4);
  if (num(profile.sleepHours, 7.5) < 6.5) n -= 1;
  if (clampInt(profile.stress, 1, 5, 3) >= 4) n -= 1;
  if (num(profile.age, 30) >= 55) n -= 1;
  return clampInt(n, 3, 8, 5);
}

function chainFor(profile, k) {
  const goal = goalOf(profile);
  if (!k.loaded) {
    // No kilos to add, so the ladder runs through reps, sets, tempo and leverage.
    return ['עוד חזרות', 'עוד סט', 'ירידה איטית יותר', 'מנוף קשה יותר', 'משקל חיצוני'];
  }
  if (goal === 'fatloss' || goal === 'fitness') {
    return ['עוד חזרות', 'עוד משקל', 'עוד סט', 'מנוחה קצרה יותר', 'ואריאציה קשה יותר'];
  }
  if (goal === 'strength') {
    return ['עוד חזרות', 'עוד משקל', 'עוד סט כבד', 'פחות עבודת עזר', 'ואריאציה קשה יותר'];
  }
  return ['עוד חזרות', 'עוד משקל', 'עוד סט', 'ירידה איטית יותר', 'ואריאציה קשה יותר'];
}

function ruleFor(profile, k, jump) {
  if (!k.loaded) {
    return 'התקדמות כפולה: נשארים באותה ואריאציה עד שכל הסטים מגיעים לקצה העליון של טווח החזרות '
      + 'בטכניקה נקייה — ואז עוברים לוואריאציה הקשה יותר ומתחילים שוב מהקצה התחתון.';
  }
  return `התקדמות כפולה: נשארים באותו משקל עד שכל הסטים מגיעים לקצה העליון של טווח החזרות `
    + `בטכניקה נקייה — ואז מוסיפים ${fmtKg(jump)} ק״ג ומתחילים שוב מהקצה התחתון.`;
}

function fmtKg(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function cardsFor(profile, k, jump, deload) {
  const exp = expOf(profile);
  const goal = goalOf(profile);
  const cards = [];

  if (k.loaded) {
    cards.push({
      k: 'עומס',
      title: 'כמה להוסיף',
      body: `${fmtKg(jump)} ק״ג בכל קפיצה, ובתרגילים שהידיים מזיזות אפילו 1–2 ק״ג. `
        + 'בסקוואט ובדדליפט הקפיצה גדולה יותר מאשר בלחיצות, כי המנוע גדול יותר. '
        + 'משקולת יד עולה בקפיצות של 2 ק״ג — על 10 ק״ג זו קפיצה של 20%, אז שם מוסיפים חזרות לפני שמוסיפים ברזל.',
    });
  } else {
    cards.push({
      k: 'עומס',
      title: 'העומס הוא המנוף',
      body: 'בלי משקולות המשקל לא עולה — הקושי עולה. רגליים גבוהות יותר, ידיים קרובות יותר, '
        + 'טווח גדול יותר, ירידה של 3–4 שניות. ואריאציה אחת קדימה שווה בערך 10 ק״ג על המוט.',
    });
  }

  cards.push({
    k: 'דילואד',
    title: `שבוע הורדה כל ${deload} שבועות`,
    body: k.loaded
      ? 'אותם תרגילים, בערך חצי מהסטים, ומשקל נמוך ב־10%. אף סט לא מגיע לכשל. '
        + 'זה לא שבוע אבוד — זה השבוע שבו כל מה שנבנה קודם מתממש.'
      : 'אותם תרגילים, סט אחד פחות בכל אחד, וואריאציה אחת קלה יותר. אף סט לא עד כשל. '
        + 'הגוף מדביק את הפער, והשבוע שאחריו מרגיש קל יותר במשקל זהה.',
  });

  cards.push({
    k: 'תקיעות',
    title: 'כשהמספר לא זז',
    body: 'שבועיים באותו מקום זה נורמלי, ולרוב הבעיה היא שינה, אוכל או לחץ ולא התוכנית. '
      + 'שלושה שבועות — הורד 10% מהמשקל, בנה חזרה מלמטה בשלושה שבועות, ותעבור את המספר הישן.',
  });

  cards.push({
    k: 'מדידה',
    title: 'איך יודעים שזה עובד',
    body: 'רשום משקל וחזרות בכל סט ראשון של תרגיל מרכזי. אם אחרי חודש אותו תרגיל נעשה '
      + 'ביותר חזרות או ביותר משקל — התוכנית עובדת, גם אם המראה במראה עוד לא השתנה.',
  });

  if (exp === 'beginner' || exp === 'returning') {
    cards.push({
      k: 'טכניקה',
      title: 'מתי לא להעלות',
      body: 'טווח התנועה מתקצר, הקצב מתפרק, או שהגוף מתחיל לעזור בתנופה — סימן שהמשקל הקודם '
        + 'עוד לא סיים את התפקיד שלו. חזרה נקייה שווה יותר משתי חזרות מכוערות.',
    });
  } else {
    cards.push({
      k: 'מאמץ',
      title: 'חזרות ברזרבה',
      body: 'רוב הסטים נגמרים עם 1–2 חזרות ברזרבה. סט עד כשל אמיתי שמור לתרגילי בידוד בסוף האימון — '
        + 'בתרגילים המרכזיים הוא גובה יותר התאוששות ממה שהוא מחזיר.',
    });
  }

  if (goal === 'fatloss') {
    cards.push({
      k: 'גירעון',
      title: 'למה המשקלים לא יורדים',
      body: 'בגירעון קלורי הגוף מחפש מה לוותר עליו. המשקל שאתה מרים הוא ההוראה לשמור על השריר — '
        + 'לכן הנפח יורד בהדרגה, אבל העצימות נשארת עד הסוף.',
    });
  } else if (goal === 'strength') {
    cards.push({
      k: 'מנוחה',
      title: 'המנוחה היא חלק מהסט',
      body: '2–3 דקות לפני סט כבד. אם אתה עדיין מתנשם, הסט הבא יימדד לפי הריאות ולא לפי השריר, '
        + 'והמספר שיצא ממנו לא יספר לך כלום.',
    });
  }

  return cards;
}

/**
 * The progression rule, the escalation ladder, deload frequency and load jump.
 * Returns { chain, rule, deloadEveryWeeks, loadJumpKg, cards }.
 */
export function progressionModel(profile) {
  const p = profile || {};
  const k = kit(p);
  const jump = loadJump(p, k);
  const deload = deloadEvery(p);
  return {
    chain: chainFor(p, k),
    rule: ruleFor(p, k, jump),
    deloadEveryWeeks: deload,
    loadJumpKg: jump,
    cards: cardsFor(p, k, jump, deload),
  };
}

/* ------------------------------------------------------------------ *
 * 3. projectTargets
 * ------------------------------------------------------------------ */

/*
 * Rates of change that hold up in a gym, not on a forum.
 *
 * rel  — relative growth per week of a rep count, capped by relCap
 * abs  — extra reps per week on top, capped by absCap
 * A beginner roughly doubles a push-up count in a quarter and triples a
 * pull-up count over a year. An advanced trainee adds a few percent.
 */
const REP_RATE = {
  beginner: { rel: 0.050, relCap: 0.90, abs: 0.25, absCap: 10 },
  returning: { rel: 0.045, relCap: 0.75, abs: 0.20, absCap: 8 },
  intermediate: { rel: 0.026, relCap: 0.42, abs: 0.10, absCap: 5 },
  advanced: { rel: 0.014, relCap: 0.22, abs: 0.05, absCap: 3 },
};

/* Percent of the current load per week, and the total ceiling for the block.
   Lower body moves faster than upper, and everyone slows down with training age. */
const KG_RATE = {
  beginner: { lower: 0.012, upper: 0.009, cap: 0.30 },
  returning: { lower: 0.010, upper: 0.008, cap: 0.25 },
  intermediate: { lower: 0.005, upper: 0.0035, cap: 0.14 },
  advanced: { lower: 0.0025, upper: 0.0018, cap: 0.07 },
};

function growReps(today, weeks, exp, low) {
  const g = REP_RATE[exp] || REP_RATE.beginner;
  const rel = Math.min(g.rel * weeks, g.relCap);
  const absCap = low ? Math.max(2, Math.round(g.absCap * 0.5)) : g.absCap;
  const abs = Math.min(g.abs * weeks * (low ? 0.6 : 1), absCap);
  return Math.max(today + 1, Math.round(today * (1 + rel) + abs));
}

function growSeconds(today, weeks, exp) {
  const g = REP_RATE[exp] || REP_RATE.beginner;
  const rel = Math.min(g.rel * weeks, g.relCap);
  return Math.min(120, Math.max(today + 5, roundTo(today * (1 + rel) + 5, 5)));
}

function growKg(today, weeks, exp, upper, age) {
  const g = KG_RATE[exp] || KG_RATE.beginner;
  let pct = Math.min((upper ? g.upper : g.lower) * weeks, g.cap);
  if (age < 18) pct = Math.min(pct, 0.18);
  return Math.max(today + 2.5, roundTo(today * (1 + pct), 2.5));
}

function benchOf(profile, key) {
  const b = profile && profile.benchmarks;
  const v = b && typeof b === 'object' ? Number(b[key]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * The honest target table: 5–8 Hebrew rows, today from the declared benchmarks
 * and a defensible number (or a qualitative milestone) for the end of the block.
 */
export function projectTargets(profile) {
  const p = profile || {};
  const weeks = programWeeks(p);
  const exp = expOf(p);
  const goal = goalOf(p);
  const age = num(p.age, 30);
  const k = kit(p);
  const hang = canHang(p);
  const teen = age < 18;
  const rows = [];

  /* ---- horizontal push, in reps ---- */
  const pushups = benchOf(p, 'pushups');
  rows.push({
    label: 'שכיבות שמיכה',
    today: pushups === null ? '—' : `${Math.round(pushups)}`,
    target: pushups === null
      ? '3×12 מלאות, חזה לרצפה'
      : `${growReps(Math.round(pushups), weeks, exp, false)}`,
  });

  /* ---- vertical pull, if there is anything to hang from ---- */
  const pullups = benchOf(p, 'pullups');
  if (hang) {
    rows.push({
      label: 'מתח',
      today: pullups === null ? '—' : `${Math.round(pullups)}`,
      target: pullups === null || pullups < 1
        ? (weeks >= 8 ? 'מתח ראשון נקי' : 'ירידה בשליטה, 5 שניות')
        : `${growReps(Math.round(pullups), weeks, exp, true)}`,
    });
  } else {
    const row = candidates(p, { pattern: 'horizontal_pull' });
    rows.push({
      label: row.length ? 'חתירה' : 'משיכה',
      today: pullups === null ? '—' : `${Math.round(pullups)} מתח`,
      target: '3×10 בגוף אופקי, שכמות נסגרות',
    });
  }

  /* ---- core, in seconds ---- */
  const plank = benchOf(p, 'plankSec');
  rows.push({
    label: 'פלאנק',
    today: plank === null ? '—' : `${Math.round(plank)} שנ׳`,
    target: plank === null
      ? '60 שנ׳ בלי צניחת אגן'
      : (plank >= 110 ? 'להוסיף קושי, לא זמן' : `${growSeconds(Math.round(plank), weeks, exp)} שנ׳`),
  });

  /* ---- squat ---- */
  const squatKg = benchOf(p, 'squatKg');
  const squatLoaded = candidates(p, { pattern: 'squat' })
    .some((e) => (e.equipment || []).some((q) => q === 'barbell' || q === 'machines' || q === 'dumbbells' || q === 'kettlebell'));
  if (squatKg !== null && (k.barbell || k.machines || k.freeWeights)) {
    rows.push({
      label: 'סקוואט',
      today: `${round1(squatKg)} ק״ג`,
      target: `${round1(growKg(squatKg, weeks, exp, false, age))} ק״ג`,
    });
  } else if (squatLoaded && !teen) {
    rows.push({
      label: 'סקוואט',
      today: squatKg === null ? '—' : `${round1(squatKg)} ק״ג`,
      target: '3×8 עם עומס יציב, ירך מתחת למקבילים',
    });
  } else {
    rows.push({
      label: 'סקוואט משקל גוף',
      today: '—',
      target: teen ? '3×15 עמוק ובשליטה' : '3×20 עמוק, עקבים על הרצפה',
    });
  }

  /* ---- hinge ---- */
  const dlKg = benchOf(p, 'deadliftKg');
  if (dlKg !== null && (k.barbell || k.freeWeights || k.machines)) {
    rows.push({
      label: 'דדליפט',
      today: `${round1(dlKg)} ק״ג`,
      target: `${round1(growKg(dlKg, weeks, exp, false, age))} ק״ג`,
    });
  } else if (candidates(p, { pattern: 'hinge' }).length) {
    rows.push({
      label: 'ציר ירכיים',
      today: dlKg === null ? '—' : `${round1(dlKg)} ק״ג`,
      target: teen ? '3×10 בגב ניטרלי, בלי עומס' : '3×10 בשליטה, גב ניטרלי לאורך כל הטווח',
    });
  }

  /* ---- press ---- */
  const benchKg = benchOf(p, 'benchKg');
  if (benchKg !== null && (k.barbell || k.freeWeights || k.machines)) {
    rows.push({
      label: 'לחיצת חזה',
      today: `${round1(benchKg)} ק״ג`,
      target: `${round1(growKg(benchKg, weeks, exp, true, age))} ק״ג`,
    });
  } else if (k.freeWeights || k.barbell || k.machines) {
    rows.push({
      label: 'לחיצת חזה',
      today: benchKg === null ? '—' : `${round1(benchKg)} ק״ג`,
      target: '3×10 בשליטה, ירידה של 2 שניות',
    });
  } else if (candidates(p, { pattern: 'vertical_push' }).length) {
    rows.push({
      label: 'לחיצה מעל הראש',
      today: '—',
      target: '3×8 פייק־פושאפ בטווח מלא',
    });
  }

  /* ---- the goal-shaped last row ---- */
  if (goal === 'fatloss' || goal === 'fitness' || goal === 'sport') {
    if (candidates(p, { pattern: 'conditioning' }).length) {
      rows.push({
        label: 'אירובי רצוף',
        today: '—',
        target: goal === 'sport' ? '6×200 מ׳ בלי נפילה בקצב' : '30 דק׳ רצוף בקצב שיחה',
      });
    }
  } else if (candidates(p, { pattern: 'mobility' }).length) {
    rows.push({
      label: 'ישיבה בסקוואט עמוק',
      today: '—',
      target: '2 דק׳ רצוף, עקבים על הרצפה',
    });
  }

  return rows.slice(0, 8);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * 4. weeklyPlanNote
 * ------------------------------------------------------------------ */

const FOCUS = {
  strength: [
    'הסט הראשון של התרגיל המרכזי הוא הסט שנספר. רשום משקל וחזרות, ותנסה לעבור אותו בשבוע הבא.',
    'שמור חזרה־שתיים ברזרבה בכל סט. כוח נבנה מהצטברות של אימונים טובים, לא מאימון אחד הרואי.',
    'חמם בסטים עולים: מוט ריק, ואז שניים־שלושה סטים בדרך למשקל העבודה. לא לדלג.',
    'אם הגב מתעגל או הברך נכנסת פנימה — המשקל הזה עוד לא שלך. רד קילו וקנה אותו נקי.',
    'מנוחה מלאה לפני סט כבד: 2–3 דקות. סט שנעשה מתנשם מודד ריאות, לא כוח.',
    'שבוע טוב הוא שבוע שבו תרגיל אחד זז. לא כולם — אחד.',
    'הידוק לפני כל חזרה: אוויר לבטן, שכמות אחורה, כפות רגליים נעוצות ברצפה.',
  ],
  muscle: [
    'סיים כל סט 1–2 חזרות מכשל אמיתי. פחות מזה, הסט לא באמת נספר.',
    'טווח תנועה מלא. חצי חזרה במשקל גדול נותנת פחות מחזרה שלמה במשקל קטן.',
    'שנייה־שתיים בירידה. השריר גדל גם — ובעיקר — מהחלק שבו אתה מוריד את המשקל.',
    'רשום את המספרים. עלייה במסה היא סכום של שיפורים קטנים לאורך שבועות, ואי אפשר לזכור אותם.',
    'ביום אימון אכול מספיק. אימון קשה על חוסר קלוריות הוא בעיקר נזק שלא משתלם.',
    'תרגיש את השריר עובד, לא את המפרק. אם המרפק כואב לפני שהיד עייפה — שנה זווית.',
    'אותו תרגיל, אותו סדר, כמה שבועות ברצף. החלפה מתמדת מונעת מהמספר לזוז.',
  ],
  fatloss: [
    'המשקלים באימון לא יורדים בגירעון. אותו עומס — זה מה שאומר לגוף לשמור על השריר.',
    'הוסף 2,000 צעדים ביום מעבר לאימונים. זה מזיז את המאזן יותר מסיבוב אירובי נוסף.',
    'שקילה אחת השבוע, אותו יום ואותה שעה. אל תשווה בין בוקר לערב.',
    'חלבון בכל ארוחה. השובע והשמירה על השריר מגיעים מאותו מקום.',
    'אם המשקל תקוע שבועיים והרעב עולה — בדוק שינה ולחץ לפני שאתה חותך עוד קלוריות.',
    'מנוחות קצרות זה לא אימון יעיל יותר, זה רק סט גרוע יותר. שמור על הזמנים.',
    'שבוע חברתי עמוס זה חלק מהחיים. תחזור לתלם באותו יום, לא ביום ראשון הבא.',
  ],
  fitness: [
    'העיקר השבוע הוא להגיע לכל האימונים. איכות מגיעה אחרי עקביות, לא לפניה.',
    'הוסף חזרה אחת בכל תרגיל מול השבוע שעבר. זה הכול, וזה מספיק.',
    'תרגיל אחד השבוע מקבל טווח תנועה מלא יותר. תבחר אותו מראש.',
    'האירובי בקצב שיחה. אם אתה לא יכול לדבר משפט — זה כבר לא הקצב שנשמר לאורך זמן.',
    'חימום קצר לפני הסט הכבד הראשון עדיף על מתיחות ארוכות אחרי האימון.',
    'שינה של 7–9 שעות היא החלק החזק בתוכנית. השבוע תשמור עליה כמו על אימון.',
    'תרשום איך הרגשת אחרי כל אימון. בעוד חודש זה יהיה המדד המעניין ביותר.',
  ],
  sport: [
    'עבודת המהירות בתחילת האימון, כשאתה טרי. עייפות הופכת אותה לאימון סיבולת.',
    'איכות הקפיצה חשובה מהכמות: כשהגובה יורד — הסט נגמר.',
    'חזק בשני הצדדים. עבודה חד־צדדית השבוע היא ביטוח נגד פציעה, לא תוספת.',
    'אימון הכוח לא מחליף את האימון בענף. אם הרגליים כבדות למשחק — הורד סט, לא שינה.',
    'נחיתה רכה, ברך מעל כף הרגל. הקרסול והברך משלמים על כל נחיתה עצלה.',
    'שמור אנרגיה למועד: יום לפני משחק זה אימון קל או כלום.',
    'סיבולת ספציפית מתאמנת במרחקים ובזמנים של הענף, לא בריצה ארוכה אחת.',
  ],
};

/** One Hebrew line for the week the user is in. */
export function weeklyPlanNote(profile, week) {
  const p = profile || {};
  const w = Math.max(1, Math.round(num(week, 1)));
  const model = progressionModel(p);
  const phases = buildPhases(p);
  const total = phases.length ? phases[phases.length - 1].weeks[1] : 12;
  const inRange = Math.min(w, total);
  const phase = phases.find((ph) => inRange >= ph.weeks[0] && inRange <= ph.weeks[1])
    || phases[phases.length - 1]
    || { title: 'אימון' };
  const head = `שבוע ${w} · ${phase.title}`;
  const k = kit(p);

  if (w > total) {
    return `${head} — עברת את אורך התוכנית. מדוד מחדש את המספרים שבטבלת היעדים, `
      + 'ובנה בלוק חדש מהמקום שאליו הגעת ולא מהמקום שממנו יצאת.';
  }

  if (model.deloadEveryWeeks > 0 && w % model.deloadEveryWeeks === 0) {
    return `${head} — שבוע דילואד: ${k.loaded
      ? 'אותם תרגילים, בערך חצי מהסטים, ומשקל נמוך ב־10%. אף סט לא מגיע לכשל. אתה אמור לצאת מהאימון עם תחושה שיכולת עוד — זו כל המטרה.'
      : 'אותם תרגילים, סט אחד פחות בכל אחד, וואריאציה אחת קלה יותר. אף סט לא עד כשל. השבוע הזה הוא מה שיאפשר לשבוע הבא להיות טוב.'}`;
  }

  if (w === 1) {
    return `${head} — שבוע ראשון: תרד באופן מודע במשקלים ותרשום כל מספר. `
      + 'המטרה היחידה השבוע היא ללמוד את התרגילים ולסיים כל אימון עם הרגשה שיכולת עוד סט.';
  }

  if (w === total) {
    return `${head} — שבוע אחרון: מדוד את אותם מספרים שמדדת בהתחלה, באותם תנאים. `
      + 'רק אחרי המדידה מחליטים מה הבלוק הבא.';
  }

  const pool = focusPool(p);
  const line = rotate(pool, hashProfile(p))[(w - 1) % pool.length];
  return `${head} — ${line}`;
}

/** The goal's focus lines, with the recovery reminders this profile needs first. */
function focusPool(profile) {
  const base = (FOCUS[goalOf(profile)] || FOCUS.fitness).slice();
  const extra = [];
  if (num(profile.sleepHours, 7.5) < 6.5) {
    extra.push('חצי שעה שינה נוספת השבוע תשנה יותר מכל שינוי בתוכנית. תתחיל משם.');
  }
  if (clampInt(profile.stress, 1, 5, 3) >= 4) {
    extra.push('שבוע לחוץ: שמור על הסטים המרכזיים וותר על תרגילי הסיום. אימון קצר שקרה עדיף על מושלם שלא.');
  }
  if (num(profile.age, 30) >= 55) {
    extra.push('חימום ארוך יותר לפני התרגיל הראשון. אחרי גיל 55 המפרקים צריכים כמה סטים כדי להתעורר.');
  }
  return extra.concat(base);
}
