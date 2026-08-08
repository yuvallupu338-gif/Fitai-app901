/*
 * holds.js — the reasons this app refuses to put somebody in a calorie deficit,
 * and the one place every screen has to ask.
 *
 * The refusals already existed. They were just scattered, so the app could hold
 * and cheer at the same time. A 26-year-old woman at BMI 17.6 asking to reach
 * 47 kg got, on one day:
 *
 *   nutrition tab   maintenance, and "there isn't enough fat here for a deficit
 *                   to take from — it will take from muscle, sleep and hormones"
 *   guide tab       "היעד ריאלי", over a four-row table dated to 47.5 kg
 *   phase map       התנעה > גירעון יציב > שמירה על עומס > ליטוש וייצוב
 *   plan tab        "הגירעון הקלורי מוריד את המשקל"
 *   plate           "so you get up from the table full without going over"
 *
 * Four surfaces green-lit it and the one that refused was a paragraph at the
 * bottom of a tab she may never open. The refusal was correct and invisible.
 *
 * So the test moves here, every surface calls it, and adding a fifth reason is
 * one edit rather than five. age.js stays what it is — the home for rules that
 * turn on a birthday. This is the home for rules that turn on a body.
 */

import { withholdsFatLoss } from './age.js';

/*
 * The floor no plan goes under, whatever the arithmetic says.
 *
 * The deficit was sized as a percentage of TDEE, which is the wrong shape when
 * TDEE is small: the lowest activity factor is 1.30, and 1.30 × 0.78 = 1.014,
 * so for every low-activity trainee the target was pinned to roughly their BMR
 * and the deficit ate the entire activity allowance. A 62-year-old woman at
 * 152 cm and 58 kg training twice a week — an ordinary client, not a corner
 * case — was handed 1,070 kcal. At 90 it reached 790.
 *
 * Below roughly 1,200 kcal (women) and 1,500 (men) you cannot meet
 * micronutrient requirements from food at all, which is why unsupervised diets
 * there are a clinical decision rather than an app's. The app stops instead.
 */
export const KCAL_FLOOR = { female: 1200, male: 1500, other: 1350 };

export function kcalFloor(profile) {
  const sex = profile && profile.sex;
  return KCAL_FLOOR[sex] !== undefined ? KCAL_FLOOR[sex] : KCAL_FLOOR.other;
}

export function bmiOf(profile) {
  const m = (Number(profile && profile.heightCm) || 0) / 100;
  return m > 0 ? (Number(profile && profile.weightKg) || 0) / (m * m) : 0;
}

export const UNDERWEIGHT_BMI = 18.5;

/*
 * Free-text medical screening.
 *
 * The intake asks "מצב רפואי או תרופות" and the answer reached exactly one
 * sentence of boilerplate. Everything else was identical: somebody who typed
 * "היסטוריה של אנורקסיה, במעקב פסיכיאטרי" was given a 364 kcal deficit, a
 * weekly weigh-in, and "הורד נשנוש אחד ביום" if the scale stalled. Somebody who
 * typed "אי ספיקת כליות שלב 3" was given 1.7 g/kg of protein.
 *
 * A keyword screen is a blunt instrument and it will miss things. It is also
 * the difference between reading the answer and not reading it, and the failure
 * mode is one extra conversation with a doctor rather than a diet prescribed
 * over an eating disorder. Both languages, because Israelis type both.
 *
 * Deliberately NOT a diagnosis and NOT a refusal to build a plan — the plan
 * still gets built, at maintenance, with a sentence saying why and who to ask.
 */
const MEDICAL_FLAGS = [
  {
    key: 'eating_disorder',
    /*
     * Widened to the vocabulary people actually type. The first list held the
     * two diagnosis names and missed every description: the binge and purge
     * words, the ב/ת variant of a phrase already in the list, and amenorrhoea —
     * which is the strongest RED-S flag there is in a training context and the
     * thing somebody is most likely to mention without naming a disorder.
     */
    terms: ['אנורקסיה', 'בולימיה', 'הפרעת אכילה', 'הפרעות אכילה', 'הפרעה באכילה',
      'אכילה כפייתית', 'בולמוס', 'זלילה', 'משלשלים', 'מקיאה', 'להקיא', 'אורתורקסיה',
      'אין לי מחזור', 'הפסקתי לקבל מחזור',
      'anorexia', 'bulimia', 'eating disorder', 'binge eating', 'arfid', 'ednos',
      'purging', 'amenorrhea', 'amenorrhoea'],
    he: 'ציינת היסטוריה של הפרעת אכילה. התוכנית כאן מכוונת לאחזקה ולא לירידה, ואין בה '
      + 'שקילות שבועיות או הוראה לקצץ אוכל — תוכנית ירידה במשקל במצב הזה נבנית עם הצוות '
      + 'המטפל שלך, לא עם אפליקציה.',
  },
  {
    key: 'pregnancy',
    /*
     * Three-letter Hebrew fragments do not belong here, and 'הרה' was the
     * proof: it lives inside אזהרה, הזהרה, במהרה and הרהרתי, so "אזהרה על
     * תרופה" produced a full pregnancy hold — refusing the deficit, removing
     * the weigh-ins and reshaping the training week. Strictly worse than the
     * לב/שלב bug, which only added a wrong sentence. 'הריון' catches every real
     * case on its own.
     *
     * Same for unanchored English roots: 'lactat' matched "lactate threshold"
     * and 'nursing' matched "nursing student", both from people describing
     * their training and their job. And 'מניקה' is added because 'מיניקה' was
     * a misspelling — the correct Hebrew was not in the list at all, so the
     * commonest way to say it in this country was never caught.
     */
    terms: ['הריון', 'בהריון', 'מניקה', 'מיניקה', 'הנקה', 'ילדתי',
      'pregnan', 'breastfeeding', 'expecting a baby', 'post partum', 'postpartum'],
    he: 'ציינת הריון או הנקה. אין כאן גירעון קלורי בכוונה — בהריון הוא לא מומלץ, וההנקה '
      + 'דורשת תוספת. הצרכים בתקופה הזאת (חומצה פולית, ברזל, סידן, יוד) והמזונות שכדאי '
      + 'להיזהר מהם הם שיחה עם המיילדת או הדיאטנית שלך.',
  },
  {
    key: 'kidney',
    terms: ['כליות', 'כליה', 'דיאליזה', 'אי ספיקת כליות', 'kidney', 'renal', 'dialysis', 'ckd'],
    he: 'ציינת מצב כלייתי. יעד החלבון כאן נבנה למתאמן בריא והוא גבוה מדי לחלק מהמצבים '
      + 'האלה — אל תשתמש בו לפני שדיאטנית קלינית או נפרולוג קבעו לך מספר.',
  },
  {
    key: 'diabetes',
    terms: ['סוכרת', 'אינסולין', 'לנטוס', 'נובורפיד', 'מטפורמין',
      'diabet', 'insulin', 'metformin', 'lantus', 'novorapid'],
    he: 'ציינת סוכרת או טיפול תרופתי אליה. חלוקת הפחמימות לאורך היום, והתאמת המינון סביב '
      + 'האימון, הן החלק שהאפליקציה לא יכולה לעשות — עבור על התוכנית עם הרופא או הדיאטנית '
      + 'שמכירים את הטיפול שלך לפני שאתה משנה משהו.',
  },
  {
    key: 'anticoagulant',
    terms: ['קומדין', 'וורפרין', 'נוגדי קרישה', 'אליקוויס', 'קסרלטו',
      'warfarin', 'coumadin', 'eliquis', 'xarelto', 'anticoagul'],
    he: 'ציינת נוגדי קרישה. שינוי פתאומי בכמות הירוקים בתפריט (חסה, ברוקולי, תרד) משפיע '
      + 'על ה־INR — אם אתה עובר לתפריט הזה, עשה את זה בהדרגה ועדכן את הרופא.',
  },
  {
    /*
     * No bare 'לב' here, however tempting. Hebrew is agglutinative and these
     * are substring matches: 'לב' is inside 'שלב', so "אי ספיקת כליות שלב 3"
     * announced itself as a cardiac condition and the kidney patient was handed
     * a beta-blocker warning. Every term below is long enough that an accidental
     * match is not a word somebody would plausibly type here.
     */
    key: 'heart',
    terms: ['מחלת לב', 'בעיות לב', 'אי ספיקת לב', 'ניתוח לב', 'לב פתוח', 'הפרעת קצב',
      'צנתור', 'אוטם', 'בטא בלוקר', 'יתר לחץ דם', 'קרדיו',
      'heart', 'cardiac', 'beta block', 'hypertens', 'stent', 'arrhythmia'],
    he: 'ציינת מצב לבבי או תרופות אליו. חלק מהתרופות האלה מסתירות את הסימנים שהיו אמורים '
      + 'להזהיר אותך באימון או בגירעון — קבל אישור רופא לפני שאתה מתחיל, ובקש ממנו גם יעד '
      + 'נתרן אם רלוונטי.',
  },
];

/*
 * Phrases that mean the opposite. "לא בהריון ולא מתכננת" contains הריון, and
 * matching it produced a pregnancy hold for somebody explicitly saying they are
 * not pregnant. A substring screen cannot parse negation, so the narrow fix is
 * to drop the sentence the negation sits in rather than to try.
 */
const NEGATORS = ['לא ', 'אין ', 'ללא ', 'שולל', 'no ', 'not ', 'never ', 'without ', 'denies'];

/**
 * Every medical flag this free text trips, as {key, he}. Empty when none.
 *
 * The fields are searched together — people put medical facts wherever the box
 * is, and an allergy or a surgery mentioned in the wrong one used to be read by
 * nothing at all.
 */
export function medicalFlags(profile) {
  const p = profile || {};
  const raw = `${p.medical || ''} . ${p.supplements || ''} . ${p.surgeries || ''}`.toLowerCase();
  if (!raw.trim()) return [];
  /* Split into clauses so a negation only clears its own sentence, not the
     whole answer — "לא בהריון, אבל יש סוכרת" must still flag the diabetes. */
  const clauses = raw.split(/[.,;\n]|\bאבל\b|\bו?אך\b/).map((c) => c.trim()).filter(Boolean);
  const hit = new Set();
  for (const c of clauses) {
    const negated = NEGATORS.some((n) => c.includes(n));
    for (const f of MEDICAL_FLAGS) {
      for (const t of f.terms) {
        if (!c.includes(t)) continue;
        /*
         * A term that is itself phrased as a negation survives the negation
         * rule. "אין לי מחזור" is grammatically a denial and clinically a
         * finding — it is the strongest RED-S signal in the whole list, and the
         * first version of this screen dropped it precisely because it starts
         * with אין. The negator has to be somewhere other than inside the thing
         * being matched.
         */
        const selfNegating = NEGATORS.some((n) => t.includes(n.trim()));
        if (negated && !selfNegating) continue;
        hit.add(f.key);
      }
    }
  }
  return MEDICAL_FLAGS.filter((f) => hit.has(f.key)).map((f) => ({ key: f.key, he: f.he }));
}

/*
 * Pregnancy is also an intake chip, not only free text. It is offered to every
 * non-male profile and nothing outside the exercise contraindication list has
 * ever read it: nutrition.js does not import injuries at all, so a declared
 * pregnancy came through the fat-loss branch untouched and produced a 430 kcal
 * deficit with no mention of pregnancy anywhere in the plan.
 */
function declaresPregnancy(profile) {
  return ((profile && profile.injuries) || []).indexOf('pregnancy') >= 0;
}

/**
 * Why this profile must not be put in a deficit, or null.
 *
 * Returns {reason, he} so a caller can both branch on it and print it. Order
 * matters only in that the first match wins; they are all absolute.
 */
export function fatLossHold(profile) {
  if (!profile) return null;
  if (withholdsFatLoss(profile)) {
    return {
      reason: 'minor',
      he: 'בגיל הזה הגוף עוד גדל, וגירעון קלורי מכוון פוגע בגדילה, בצפיפות העצם ובהורמונים. '
        + 'המסלול הנכון הוא לשמור על המשקל ולתת לגובה לעשות את העבודה.',
    };
  }
  if (declaresPregnancy(profile)) {
    /* Looked up by key, not by index. MEDICAL_FLAGS[1] was correct today and
       silently wrong the first time anybody reorders the list. */
    const preg = MEDICAL_FLAGS.find((f) => f.key === 'pregnancy');
    return { reason: 'pregnancy', he: preg.he };
  }
  const flagged = medicalFlags(profile).find((f) => f.key === 'eating_disorder' || f.key === 'pregnancy');
  if (flagged) return { reason: flagged.key, he: flagged.he };
  if (bmiOf(profile) > 0 && bmiOf(profile) < UNDERWEIGHT_BMI) {
    return {
      reason: 'underweight',
      he: 'המשקל שלך נמוך ביחס לגובה, ולכן התוכנית מכוונת לאחזקה ולא לירידה. אין כאן מספיק '
        + 'שומן שגירעון יכול לקחת ממנו, והוא ייקח במקומו משריר, משינה ומהורמונים.',
    };
  }
  return null;
}

/**
 * The goal the plan is actually built for, as opposed to the chip that was
 * ticked.
 *
 * progression.js worked this out for minors and did it right; generator.js,
 * volume.js and restday.js never got the same treatment, so a 14-year-old read
 * "הגירעון הקלורי מוריד את המשקל" on the tab he opens every day, three lines
 * from a nutrition tab saying there is deliberately no calorie counting here.
 * Worse than the sentence: volume.js shaped his whole week as a cut —
 * conditioning 10, push 12, arms 4 — to preserve muscle in a deficit that does
 * not exist.
 *
 * One function, so the plan and the food cannot disagree about what it is for.
 */
export function effectiveGoal(profile) {
  const goal = profile && profile.goal;
  if (goal === 'fatloss' && fatLossHold(profile)) return 'fitness';
  return goal;
}
