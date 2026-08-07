/*
 * nutrition.js — the eating plan.
 *
 * Two modes. Under 16 there are no calorie targets at all: the plan is the
 * plate rule, meal timing and habits, because a growing body should not be
 * taught to count. From 16 up it computes a real target from Mifflin-St Jeor
 * and sizes the deficit or surplus to what targets.js considers achievable,
 * rather than inventing an aggressive number.
 *
 * "No calorie targets" has to mean the whole diet, not just the arithmetic.
 * Deleting the numbers while leaving weekly weigh-ins and deficit-shaped
 * restaurant advice on screen still teaches a fourteen-year-old to diet — it
 * only stops telling them the number, on the same page as a warning saying we
 * deliberately do not diet at this age. So the minor flag now reaches every
 * part of the plan that carries a diet's behaviour, not just warnings().
 *
 * For the same reason "cutting" means the plan is actually in a deficit, not
 * that the goal chip says fatloss. A minor and an underweight adult both have
 * the chip and neither is losing weight here.
 *
 * Food is Israeli home food with household measures, not grams on a scale.
 */

import { withholdsBodyNumbers } from './age.js';

/* ------------------------------------------------------------------ *
 * Food bank
 *
 * tags: meat | fish | dairy | egg | gluten | nuts | sesame | legume | soy | honey
 * Every variant is tagged honestly so the diet filters actually bite.
 *
 * Order matters. variantsFor takes the first five survivors, so the head of
 * each slot is the food most people will actually be shown and the tail is
 * reserve. The last entries in every slot carry no tags at all, because the
 * stacked cases really do reach them: vegan + gluten-free + a sesame allergy
 * used to leave one dinner and two lunches in the whole bank.
 * ------------------------------------------------------------------ */

const BANK = {
  breakfast: [
    { n: 'חביתה, לחם וטחינה', i: '3 ביצים · 2 פרוסות לחם מלא · כף טחינה · בננה', tags: ['egg', 'gluten', 'sesame'] },
    { n: 'שיבולת שועל חמה', i: 'חצי כוס שיבולת שועל בחלב · כף חמאת בוטנים · כף דבש · בננה', tags: ['dairy', 'gluten', 'nuts', 'honey'] },
    { n: 'קערת יוגורט', i: 'יוגורט יווני גדול · גרנולה · חופן שקדים · 3 תמרים', tags: ['dairy', 'gluten', 'nuts'] },
    { n: 'פיתה וקוטג׳', i: '2 פיתות · קוטג׳ 5% · ביצה קשה · מלפפון · כוס שוקו', tags: ['dairy', 'egg', 'gluten'] },
    { n: 'שקשוקה', i: '2 ביצים ברוטב עגבניות · פרוסת לחם לניגוב · סלט', tags: ['egg', 'gluten'] },
    { n: 'שיבולת שועל במים', i: 'חצי כוס שיבולת שועל במים · כף טחינה גולמית · בננה · תמרים', tags: ['gluten', 'sesame'] },
    { n: 'טופו מקושקש', i: 'טופו מפורר עם כורכום וירקות · 2 פרוסות לחם · אבוקדו', tags: ['soy', 'gluten'] },
    { n: 'קערת פירות ואגוזים', i: 'בננה · תפוח · חופן אגוזים · 2 כפות טחינה · תמרים', tags: ['nuts', 'sesame'] },
    { n: 'ביצים ואורז', i: '3 ביצים · כוס אורז מאתמול · סלט עם שמן זית', tags: ['egg'] },
    { n: 'שייק בוקר', i: 'כוס משקה שקדים · בננה · 2 כפות שיבולת שועל · כף חמאת בוטנים', tags: ['gluten', 'nuts'] },
    { n: 'קערת אורז וטחינה', i: 'כוס אורז חם · 2 כפות טחינה גולמית · בננה · תמרים', tags: ['sesame'] },
    { n: 'בטטה אפויה', i: 'בטטה גדולה אפויה · טחינה · אבוקדו · עגבניות שרי', tags: ['sesame'] },
    { n: 'דייסת קינואה', i: 'קינואה מבושלת במשקה אורז · בננה · תמרים · קינמון', tags: [] },
    { n: 'סלט אבוקדו ותפוח אדמה', i: '2 תפוחי אדמה · אבוקדו שלם · עגבנייה · שמן זית · מלח', tags: [] },
    { n: 'חומוס ותירס', i: 'חצי גביע חומוס · תירס · גזר · שמן זית', tags: ['legume'] },
    { n: 'קערת כוסמת ופירות', i: 'כוסמת מבושלת · תפוח מגורד · צימוקים · קינמון · זרעי חמנייה', tags: [] },
    { n: 'פולנטה חמה', i: 'גריסי תירס · שמן זית · עגבניות מוקפצות · זרעי חמנייה', tags: [] },
  ],

  snack: [
    { n: 'כריך חמאת בוטנים', i: '2 פרוסות לחם · חמאת בוטנים ודבש · קרטון שוקו', tags: ['gluten', 'nuts', 'dairy', 'honey'] },
    { n: 'יוגורט וגרנולה', i: 'יוגורט · גרנולה · בננה', tags: ['dairy', 'gluten'] },
    { n: 'ביצים ולחמנייה', i: '2 ביצים קשות · לחמנייה · מלח', tags: ['egg', 'gluten'] },
    { n: 'אגוזים ופירות יבשים', i: 'חופן שקדים · 3 תמרים · תפוח', tags: ['nuts'] },
    { n: 'טונה על קרקרים', i: 'קופסת טונה · 6 קרקרים · מלפפון', tags: ['fish', 'gluten'] },
    { n: 'חומוס וירקות', i: 'חצי גביע חומוס · גזר וקולורבי חתוכים · פיתה קטנה', tags: ['legume', 'gluten'] },
    { n: 'פירות וטחינה', i: 'בננה · תפוח · 2 כפות טחינה גולמית', tags: ['sesame'] },
    { n: 'אדממה', i: 'קערת אדממה · חופן שקדים · תפוז', tags: ['soy', 'nuts'] },
    { n: 'קוטג׳ ופרי', i: 'גביע קוטג׳ · אפרסק או תפוח · כף דבש', tags: ['dairy', 'honey'] },
    { n: 'תמרים ואגוזי מלך', i: '4 תמרים · חופן אגוזי מלך · כוס תה', tags: ['nuts'] },
    { n: 'תמרים וטחינה', i: '4 תמרים · 2 כפות טחינה גולמית · כוס מים', tags: ['sesame'] },
    { n: 'בטטה קרה', i: 'בטטה אפויה מאתמול · מלח · שמן זית', tags: [] },
    { n: 'פירות וזרעי דלעת', i: 'בננה · תפוח · חופן זרעי דלעת', tags: [] },
    { n: 'תירס ואבוקדו', i: 'תירס חם · חצי אבוקדו · לימון · מלח', tags: [] },
    { n: 'קרקרי אורז ואבוקדו', i: '4 קרקרי אורז · אבוקדו · עגבניות שרי · מלח', tags: [] },
    { n: 'צימוקים וזרעי חמנייה', i: 'חופן צימוקים · חופן זרעי חמנייה · תפוז', tags: [] },
  ],

  lunch: [
    { n: 'עוף ואורז', i: 'חזה עוף · כוס וחצי אורז · סלט עם שמן זית', tags: ['meat'] },
    { n: 'פסטה בולונז', i: 'פסטה · בשר טחון ברוטב עגבניות · פרוסת לחם', tags: ['meat', 'gluten'] },
    { n: 'שניצל ופירה', i: '2 שניצלים · פירה · סלט', tags: ['meat', 'gluten'] },
    { n: 'מג׳דרה', i: 'אורז עם עדשים · ביצה קשה · טחינה · סלט', tags: ['legume', 'egg', 'sesame'] },
    { n: 'טורטייה גדולה', i: 'טורטייה · טונה · ביצה · אבוקדו · ירקות', tags: ['fish', 'egg', 'gluten'] },
    { n: 'תבשיל עדשים', i: 'עדשים כתומות · אורז מלא · טחינה · סלט ירקות', tags: ['legume', 'sesame'] },
    { n: 'קדרת חומוס וירקות', i: 'חומוס גרגרים · בטטה · אורז · טחינה · לימון', tags: ['legume', 'sesame'] },
    { n: 'דג ואורז', i: 'פילה דג בתנור · אורז · ירקות אפויים', tags: ['fish'] },
    { n: 'תבשיל שעועית', i: 'שעועית לבנה ברוטב · אורז · סלט · כף שמן זית', tags: ['legume'] },
    { n: 'קציצות עוף ובורגול', i: 'קציצות עוף · בורגול · סלט ירקות', tags: ['meat', 'gluten'] },
    { n: 'אורז וקטניות', i: 'אורז מלא · שעועית שחורה · אבוקדו · סלסה · לימון', tags: ['legume'] },
    { n: 'תבשיל בטטה וחומוס', i: 'בטטה · גרגרי חומוס · אורז · טחינה · כוסברה', tags: ['legume','sesame'] },
    { n: 'קינואה וירקות אפויים', i: 'קינואה · חציל · קישוא · פלפל · שמן זית · לימון', tags: [] },
    { n: 'מרק ירקות וקטניות', i: 'עדשים · תפוח אדמה · גזר · אורז בצד · שמן זית', tags: ['legume'] },
    { n: 'אורז וירקות מוקפצים', i: 'אורז מלא · גזר · קישוא · פלפל · שמן זית · לימון', tags: [] },
    { n: 'בטטה ממולאת', i: 'בטטה גדולה אפויה · תירס · אבוקדו · זרעי דלעת · סלט', tags: [] },
    { n: 'תבשיל תפוחי אדמה וירקות', i: 'תפוחי אדמה · גזר · עגבניות · שמן זית · אורז בצד', tags: [] },
  ],

  preworkout: [
    { n: 'פיתה עם קוטג׳', i: 'פיתה · קוטג׳ · כף דבש', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'בננה וחמאת בוטנים', i: 'בננה · פרוסת לחם עם חמאת בוטנים', tags: ['gluten', 'nuts'] },
    { n: 'יוגורט וקרקרים', i: 'יוגורט · כף דבש · 5 קרקרים', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'שייק אנרגיה', i: 'כוס חלב · בננה · 2 כפות שיבולת שועל · כף דבש', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'תמרים ובננה', i: '4 תמרים · בננה · כוס מים עם מלח', tags: [] },
    { n: 'לחם וריבה', i: '2 פרוסות לחם לבן · ריבה · תה', tags: ['gluten'] },
    { n: 'אורז ודבש', i: 'כוס אורז מהצהריים · כף דבש · מלח', tags: ['honey'] },
    { n: 'קערת פירות', i: 'בננה · תפוח · ענבים', tags: [] },
    { n: 'אורז ומלח', i: 'כוס אורז לבן · מלח · כוס מים', tags: [] },
    { n: 'בטטה ותמרים', i: 'חצי בטטה אפויה · 3 תמרים · מים', tags: [] },
    { n: 'קומפוט פירות', i: 'תפוח מבושל · צימוקים · כוס מים עם מלח', tags: [] },
  ],

  dinner: [
    { n: 'על האש', i: 'פרגית או כנפיים · אורז · פיתה · סלט עם טחינה', tags: ['meat', 'gluten', 'sesame'] },
    { n: 'המבורגר ביתי', i: '2 קציצות · לחמנייה · תפוחי אדמה בתנור · סלט', tags: ['meat', 'gluten'] },
    { n: 'דג ותפוח אדמה', i: 'פילה סלמון או בורי · 2 תפוחי אדמה · ירקות בתנור', tags: ['fish'] },
    { n: 'פסטה גדולה', i: 'פסטה עם בשר טחון · סלט · לחם שום', tags: ['meat', 'gluten'] },
    { n: 'שווארמה בצלחת', i: 'שווארמה · אורז · חומוס · טחינה · סלט', tags: ['meat', 'legume', 'sesame'] },
    { n: 'מוקפץ ירקות וטופו', i: 'טופו · ירקות מוקפצים · אורז · שומשום', tags: ['soy', 'sesame'] },
    { n: 'תבשיל גרגרי חומוס', i: 'חומוס ברוטב עגבניות · קוסקוס · סלט · טחינה', tags: ['legume', 'gluten', 'sesame'] },
    { n: 'עוף בתנור וירקות', i: 'ירכיים בתנור · בטטה · ברוקולי · אורז', tags: ['meat'] },
    { n: 'סלט קטניות גדול', i: 'עדשים ושעועית · ירקות · אבוקדו · טחינה · לחם מלא', tags: ['legume', 'gluten', 'sesame'] },
    { n: 'חביתת ירקות ואורז', i: '3 ביצים · ירקות מוקפצים · אורז · סלט', tags: ['egg'] },
    { n: 'אורז, קטניות וטחינה', i: 'אורז · עדשים · טחינה · סלט ירקות גדול · לימון', tags: ['legume','sesame'] },
    { n: 'תפוחי אדמה בתנור וטופו', i: 'טופו צלוי · תפוחי אדמה · ברוקולי · שמן זית', tags: ['soy'] },
    { n: 'קדרת בטטה ושעועית', i: 'בטטה · שעועית לבנה ברוטב עגבניות · אורז', tags: ['legume'] },
    { n: 'קינואה, חומוס וירקות', i: 'קינואה · גרגרי חומוס צלויים · ירקות אפויים · טחינה', tags: ['legume','sesame'] },
    { n: 'קינואה, תירס ואבוקדו', i: 'קינואה · תירס · אבוקדו · עגבניות · לימון · שמן זית', tags: [] },
    { n: 'כוסמת וירקות שורש בתנור', i: 'כוסמת · גזר · בטטה · בצל · שמן זית · זרעי דלעת', tags: [] },
    { n: 'תפוחי אדמה וירקות בתנור', i: 'תפוחי אדמה · פלפל · חציל · שמן זית · סלט · זרעי חמנייה', tags: [] },
  ],

  night: [
    { n: 'קוטג׳ עם דבש', i: 'קופסת קוטג׳ 5% · כף דבש', tags: ['dairy', 'honey'] },
    { n: 'יוגורט וחמאת בוטנים', i: 'יוגורט יווני · כף חמאת בוטנים', tags: ['dairy', 'nuts'] },
    { n: 'חלב ולחם', i: 'כוס חלב · 2 פרוסות לחם עם ריבה', tags: ['dairy', 'gluten'] },
    { n: 'שייק לילה', i: 'כוס משקה שקדים · בננה · כף חמאת בוטנים', tags: ['nuts'] },
    { n: 'ביצים קשות', i: '2 ביצים קשות · מלפפון · מלח', tags: ['egg'] },
    { n: 'טחינה ותמרים', i: '2 כפות טחינה גולמית · 4 תמרים · תה', tags: ['sesame'] },
    { n: 'אדממה וקערת פירות', i: 'אדממה · תפוח · חופן שקדים', tags: ['soy', 'nuts'] },
    { n: 'חומוס וגזר', i: 'חצי גביע חומוס · גזר חתוך · כף שמן זית', tags: ['legume'] },
    { n: 'אורז וטחינה', i: 'חצי כוס אורז · כף טחינה גולמית · מלח', tags: ['sesame'] },
    { n: 'בטטה קטנה', i: 'בטטה אפויה · קינמון · תה', tags: [] },
    { n: 'קערת פירות', i: 'תפוח · בננה · תמרים', tags: [] },
    { n: 'אורז חם עם קינמון', i: 'חצי כוס אורז · קינמון · צימוקים · תה', tags: [] },
  ],
};

/* ------------------------------------------------------------------ *
 * Diet filtering
 * ------------------------------------------------------------------ */

const EXCLUDE_BY_DIET = {
  vegan: ['meat', 'fish', 'dairy', 'egg', 'honey'],
  vegetarian: ['meat', 'fish'],
  gluten_free: ['gluten'],
  lactose_free: ['dairy'],
};

function passesDiet(variant, diet) {
  const tags = variant.tags || [];
  for (const d of diet) {
    const banned = EXCLUDE_BY_DIET[d];
    if (banned && banned.some((t) => tags.includes(t))) return false;
    // Kosher and halal: no meat and dairy in the same dish.
    if ((d === 'kosher' || d === 'halal') && tags.includes('meat') && tags.includes('dairy')) return false;
  }
  return true;
}

/*
 * Hebrew words people actually type, mapped to the tags the bank already carries.
 *
 * Matching the typed text against the dish text was the bug, and it failed in
 * the worst possible direction: someone writes "שומשום" — sesame — and every
 * tahini dish sails through, because the word "שומשום" does not appear in
 * "כף טחינה". Someone writes "אגוזים" and misses "חמאת בוטנים". The user is
 * shown a plan built "for them" and reasonably assumes the food they declared
 * was taken out. Silent non-filtering is worse than no filter at all, because
 * being asked the question is what creates the trust.
 *
 * These are prefixes, matched against the typed word in both directions, so
 * "אגוז", "אגוזים" and "אגוזי מלך" all reach the nuts tag.
 */
const ALLERGEN_TERMS = {
  nuts: ['אגוז', 'בוטנ', 'שקד', 'פיסטוק', 'קשיו', 'לוז', 'פקאן', 'מקדמי'],
  sesame: ['שומשום', 'טחינ', 'חלווה', 'חומוס טחינה'],
  egg: ['ביצ', 'חלבון ביצה'],
  dairy: ['חלב', 'יוגורט', 'קוטג', 'גבינ', 'לקטוז', 'שוקו', 'חמאה', 'מוצרי חלב'],
  fish: ['דג', 'דגים', 'טונה', 'סלמון', 'בורי', 'פירות ים'],
  soy: ['סויה', 'טופו', 'אדממה'],
  legume: ['קטני', 'חומוס', 'עדש', 'שעוע', 'אפונ', 'פול'],
  gluten: ['גלוטן', 'חיט', 'קמח', 'לחם', 'שעור'],
};

/** The tags a typed allergy list implicates. */
function allergyTags(terms) {
  const tags = new Set();
  for (const typed of terms) {
    for (const [tag, words] of Object.entries(ALLERGEN_TERMS)) {
      for (const w of words) {
        // Either direction: the typed word may be shorter than the canonical
        // one ("אגוז" vs "אגוזים") or longer ("אגוזי מלך").
        if (typed.includes(w) || w.includes(typed)) { tags.add(tag); break; }
      }
    }
  }
  return tags;
}

function passesAllergies(variant, terms, tags) {
  if (!terms.length) return true;
  // Tags first, because they are the reliable half: a dish is excluded whether
  // or not the user happened to type the word that appears in its ingredients.
  for (const t of (variant.tags || [])) if (tags.has(t)) return false;
  // Then the literal text as well, for anything the tag vocabulary does not
  // cover — a specific fruit, a spice, a brand.
  const hay = `${variant.n} ${variant.i}`;
  return !terms.some((t) => hay.includes(t));
}

function allergyTerms(profile) {
  return String(profile.allergies || '')
    // Punctuation only. Splitting on the letter ו — meaning "and" — shatters
    // the words it is inside: "שומשום" contains two of them and comes apart
    // into fragments that match nothing.
    .split(/[,،;\n/]|\s+ו(?=[א-ת])/)
    .map((t) => t.trim())
    // A leading ו is the conjunction only when a real word follows it. Stripping
    // ל or מ as well would maul "מלח" into "לח".
    .map((t) => (t.length >= 4 && t.startsWith('ו') ? t.slice(1) : t))
    .filter((t) => t.length >= 2);
}

/**
 * Filtered variants for a slot.
 *
 * Neither filter is ever relaxed. An allergy is a medical constraint and a
 * declared diet is the whole reason the user answered the question — showing
 * a vegan a cottage cheese bowl because the list ran short is worse than
 * showing them a shorter list.
 *
 * So this can and does return fewer than four, and once returned nothing at
 * all: a long free-text allergy list emptied dinner completely and the tab
 * crashed on the swap counter. The tail of the bank now covers the realistic
 * stacks, nutritionPlan drops whatever still comes back empty, and warnings()
 * says out loud that the restrictions are what thinned the plan. Padding the
 * list to four with food the user cannot eat is not the alternative.
 */
function variantsFor(slot, profile, count) {
  const diet = profile.diet || [];
  const terms = allergyTerms(profile);
  const bank = BANK[slot] || [];
  const tags = allergyTags(terms);
  const list = bank.filter((v) => passesDiet(v, diet) && passesAllergies(v, terms, tags));
  return list.slice(0, Math.max(count, 4)).map(({ n, i }) => ({ n, i }));
}

/* ------------------------------------------------------------------ *
 * Meal schedule
 * ------------------------------------------------------------------ */

const TRAIN_TIME = { morning: 7, noon: 13, evening: 18 };

const SLOT_LABEL = {
  breakfast: 'ארוחת בוקר',
  snack: 'נשנוש',
  lunch: 'צהריים',
  preworkout: 'לפני אימון',
  dinner: 'ארוחת ערב',
  night: 'לפני שינה',
};

function scheduleFor(mealsPerDay) {
  switch (mealsPerDay) {
    case 3: return [['breakfast', 8], ['lunch', 13], ['dinner', 19]];
    case 4: return [['breakfast', 8], ['lunch', 13], ['snack', 16], ['dinner', 20]];
    case 5: return [['breakfast', 7.5], ['snack', 10], ['lunch', 13], ['dinner', 19], ['night', 22]];
    default: return [['breakfast', 7], ['snack', 10], ['lunch', 13], ['snack', 16], ['dinner', 20], ['night', 22]];
  }
}

function hhmm(h) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const JOB = {
  breakfast: 'הארוחה שהכי הרבה מדלגים עליה, והכי חסרה',
  snack: 'מה שמונע שתגיע לארוחה הבאה מורעב ותאכל כפול',
  lunch: 'ארוחה מלאה לפי כלל הצלחת',
  preworkout: 'שעה וחצי לפני. פחמימה עם קצת חלבון, דל שומן וסיבים כדי לא להרגיש כבד',
  preworkoutEarly: 'שלושת רבעי שעה לפני. קטן ופחמימתי בלבד — מספיק כדי לא להתאמן על ריק, ולא מספיק כדי להכביד',
  dinner: 'הארוחה הגדולה של היום — 2 כפות יד חלבון, 2 אגרופי פחמימה',
  night: 'חלבון איטי לפני השינה — שם נבנה השריר',
};

/* ------------------------------------------------------------------ *
 * Energy
 * ------------------------------------------------------------------ */

function mifflin(profile) {
  const w = profile.weightKg;
  const h = profile.heightCm;
  const a = profile.age;
  const male = 10 * w + 6.25 * h - 5 * a + 5;
  const female = 10 * w + 6.25 * h - 5 * a - 161;
  if (profile.sex === 'male') return male;
  if (profile.sex === 'female') return female;
  return (male + female) / 2;
}

function activityFactor(profile) {
  const weeklyMinutes = (profile.daysPerWeek || 3) * (profile.minutesPerSession || 60);
  if (weeklyMinutes <= 90) return 1.30;
  if (weeklyMinutes <= 180) return 1.40;
  if (weeklyMinutes <= 300) return 1.50;
  if (weeklyMinutes <= 450) return 1.62;
  return 1.72;
}

const FACTOR_HE = {
  1.30: 'פעילות נמוכה', 1.40: 'פעילות קלה', 1.50: 'פעילות בינונית',
  1.62: 'פעילות גבוהה', 1.72: 'פעילות גבוהה מאוד',
};

/*
 * BMI is only consulted at the bottom of its range, where it says the one thing
 * it is actually good for: there is nothing here to take off.
 */
function bmiOf(profile) {
  const m = (Number(profile.heightCm) || 0) / 100;
  return m > 0 ? (Number(profile.weightKg) || 0) / (m * m) : 0;
}

/*
 * Protein and fat are prescribed per kilo of a reference weight rather than per
 * kilo of whatever the scale says, because for someone carrying a lot of fat
 * the two stop being the same number. 2.2 g/kg of 200 kg came out as 440 g of
 * protein and 160 g of fat, which used the whole day's energy before a single
 * gram of carbohydrate — the card printed "פחמימה 0 ג׳" next to a 2460 kcal
 * target that its own macros missed by 740. Nobody eats that; it is arithmetic
 * that ran off the end of the plan.
 *
 * Fat mass carries no protein requirement of its own, so the reference stops
 * counting above BMI 28 — the adjusted-body-weight move every clinic makes, in
 * one line. Below that it changes nothing, which is most people.
 */
function referenceKg(profile) {
  const m = (Number(profile.heightCm) || 0) / 100;
  const w = Number(profile.weightKg) || 0;
  return m > 0 ? Math.min(w, 28 * m * m) : w;
}

function strategy(profile) {
  const bmr = Math.round(mifflin(profile));
  const factor = activityFactor(profile);
  const tdee = Math.round(bmr * factor);

  // Size the change by the achievable weekly rate, not by a round percentage.
  let wanted = 0;
  let hold = null;
  const w = profile.weightKg;
  switch (profile.goal) {
    case 'fatloss':
      // targets.js refuses to put an under-18 into a deficit. Being underweight
      // is the same refusal for a different reason: under BMI 18.5 there is no
      // fat to spend, so the deficit comes out of muscle, bone and hormones
      // instead. Whether to diet anyway is a conversation with a doctor, and an
      // app that has seen two numbers does not get to open it.
      if (bmiOf(profile) < 18.5) { hold = 'underweight'; break; }
      wanted = -Math.round(Math.min(tdee * 0.22, (0.006 * w * 7700) / 7));
      break;
    case 'muscle': wanted = Math.round(Math.min(tdee * 0.12, (0.003 * w * 7700) / 7)); break;
    case 'strength': wanted = Math.round(tdee * 0.05); break;
    case 'sport': wanted = Math.round(tdee * 0.03); break;
    default: wanted = 0;
  }

  // A deficit is meant to come out of the day's activity, not out of what the
  // body spends lying still. Without this floor a light, short, twice-a-week
  // adult was handed 970 kcal — a number no dietitian would write down, and one
  // this file arrived at purely by taking 22% of an already small TDEE.
  const kcal = Math.round(Math.max(tdee + wanted, bmr) / 10) * 10;

  // Report the change that survived the floor and the rounding: this is the
  // number printed beside the target, and it has to match it. Maintenance stays
  // exactly zero instead of becoming a 5 kcal "deficit" made of rounding.
  const deltaKcal = wanted === 0 ? 0 : kcal - tdee;
  // Whether the floor bit, asked of the floor rather than of the rounded
  // result — the 10 kcal rounding alone would otherwise claim it did.
  const trimmed = tdee + wanted < bmr;

  const ref = referenceKg(profile);
  const proteinPerKg = profile.goal === 'fatloss' ? 2.2 : profile.goal === 'muscle' ? 1.9 : 1.7;

  /*
   * Per-kilo protein and fat are floors, and a floor does not know how big the
   * day is. On a compressed budget they ate it whole: a 45-year-old woman at
   * 165 cm and 75 kg who trains twice a week was handed 165 g protein and 55 g
   * carbohydrate — an accidental ketogenic diet, prescribed to someone whose
   * entire reason for being here is that the training should get better.
   * Carbohydrate is the first thing the sessions lose.
   *
   * So both are also capped at 35% of the target. Fat is floored at 25%, which
   * lands it in the 25–35% band it belongs in, and what the two leave behind is
   * never less than 30% carbohydrate. On an uncompressed budget — most people —
   * neither cap binds and the numbers are unchanged.
   */
  const proteinG = Math.min(Math.round(ref * proteinPerKg), Math.round(kcal * 0.35 / 4));
  const fatG = Math.min(Math.round(Math.max(ref * 0.8, kcal * 0.25 / 9)), Math.round(kcal * 0.35 / 9));
  // The clamp below is a guard, not a plan: with the caps in place the
  // remainder stays positive across the whole range the intake accepts.
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return {
    bmr,
    tdee,
    kcal,
    proteinG,
    carbsG,
    fatG,
    deltaKcal,
    hold,
    basis: `חושב לפי נוסחת מיפלין־סנט ז׳ור: מטבוליזם במנוחה ${bmr} קק״ל, `
      + `מוכפל ב־${factor} (${FACTOR_HE[factor] || 'פעילות'}) לפי ${profile.daysPerWeek} אימונים של ${profile.minutesPerSession} דקות. `
      + (deltaKcal === 0
        ? (hold === 'underweight'
          ? 'המשקל שלך כבר בקצה התחתון של הטווח לגובה, ולכן אין כאן גירעון אלא אחזקה. מכאן ההרכב משתנה מהאימון ומהחלבון, לא מהמאזניים.'
          : 'ללא גירעון או עודף — אחזקה.')
        : `${deltaKcal < 0 ? 'גירעון' : 'עודף'} של ${Math.abs(deltaKcal)} קק״ל ביום, בקצב שאפשר להחזיק לאורך זמן.`)
      + (trimmed ? ' הגירעון קוצר כדי שהיעד לא ירד מתחת למטבוליזם במנוחה.' : ''),
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export function nutritionPlan(profile) {
  const p = profile || {};
  const minor = withholdsBodyNumbers(p);
  const meals = [];

  const trainHour = TRAIN_TIME[p.timeOfDay] || 18;
  const sessionEnd = trainHour + (Number(p.minutesPerSession) || 60) / 60;

  /*
   * A meal that lands inside the session is not a meal. The grid is fixed, so
   * whoever trains at noon was told to eat lunch at 13:00 — under the bar — and
   * whoever trains at 07:00 got breakfast at 07:00 for the same reason. Meals
   * caught inside the session slide to half an hour after it, which is where
   * the post-workout meal belongs anyway.
   */
  const sched = scheduleFor(p.mealsPerDay || 4)
    .map(([slot, hour]) => [slot, hour >= trainHour - 0.25 && hour < sessionEnd ? sessionEnd + 0.5 : hour]);

  let snackIndex = 0;
  for (const [slot, hour] of sched) {
    const label = slot === 'snack'
      ? `${SLOT_LABEL.snack} ${snackIndex++ === 0 ? 'בוקר' : 'אחר הצהריים'}`
      : SLOT_LABEL[slot];
    meals.push({
      time: hhmm(hour),
      slot: label,
      job: JOB[slot],
      trainingOnly: false,
      variants: variantsFor(slot, p, 5),
    });
  }

  // 90 minutes before is right for the afternoon and absurd in the morning: it
  // puts a 07:00 session's meal at 05:30, which nobody gets up for, so they
  // train on nothing instead. An early session gets a small one 45 minutes out.
  const early = trainHour <= 8;
  const preHour = trainHour - (early ? 0.75 : 1.5);

  // The pre-workout meal only exists on training days, and only when it does
  // not collide with a meal that is already within an hour of the session.
  const collides = sched.some(([, hour]) => Math.abs(hour - preHour) < 1);
  if (!collides) {
    meals.push({
      time: hhmm(preHour),
      slot: SLOT_LABEL.preworkout,
      job: early ? JOB.preworkoutEarly : JOB.preworkout,
      trainingOnly: true,
      variants: variantsFor('preworkout', p, 5),
    });
  }
  meals.sort((a, b) => a.time.localeCompare(b.time));

  // A slot the filters emptied is dropped rather than rendered: a meal card
  // with no options divides by zero in its own swap counter and takes the whole
  // tab down with it. The warning below is what the user gets instead.
  const served = meals.filter((m) => m.variants.length > 0);
  const thin = served.length < meals.length || served.some((m) => m.variants.length < 4);

  /*
   * Without age, height and weight there is no formula to run, and Mifflin
   * happily returns NaN rather than saying so — the macro card then reads
   * "קלוריות NaN". A profile we cannot measure gets the same answer a minor
   * gets: the plate, the meals and the habits, with no invented numbers. This
   * also settles what a missing age means, which Number() otherwise answers two
   * different ways (null is 0 and counts as a minor, undefined is NaN and does
   * not); either way it now lands on "no numbers".
   */
  const measurable = Number(p.age) > 0 && Number(p.heightCm) > 0 && Number(p.weightKg) > 0;
  const strat = minor || !measurable ? null : strategy(p);
  // Cutting means the plan is in a deficit, not that the goal chip says so.
  const cutting = !!strat && strat.deltaKcal < 0;

  return {
    strategy: strat,
    plate: plate(p, minor),
    meals: served,
    eatingOut: eatingOut(p, minor, cutting),
    checkins: checkins(p, minor, cutting),
    warnings: warnings(p, minor, strat, thin),
  };
}

function plate(p, minor) {
  /*
   * The plate is the only quantity guidance a minor is given, so it gets its
   * own version rather than one of the adult ones. The cutting plate is a diet;
   * the bulking plate tells you not to overdo the vegetables, which is written
   * for an adult chasing a surplus and is nonsense advice for a fourteen-year-
   * old. What is left is the growth plate: eat all four, every meal.
   */
  if (minor) {
    return [
      {
        k: 'חלבון',
        title: 'כף יד בכל ארוחה',
        body: 'שתיים בערב. עוף, בשר, דגים, טונה, ביצים, קוטג׳, יוגורט, קטניות, טופו. בגיל הזה זה חומר גלם לגובה ולעצם, לא רק לשריר.',
      },
      {
        k: 'פחמימה',
        title: 'אגרוף בכל ארוחה, שניים אחרי אימון',
        body: 'אורז, פסטה, לחם, פיתה, תפוח אדמה, קוסקוס, שיבולת שועל. זה הדלק של האימון, של הגדילה ושל יום הלימודים — הוא לא מיועד לקיצוץ.',
      },
      {
        k: 'שומן',
        title: 'כף מלאה',
        body: 'שמן זית, טחינה, אבוקדו, חמאת בוטנים, אגוזים. הדרך הכי קלה להוסיף אנרגיה ליום כשאין תיאבון לאכול עוד צלחת.',
      },
      {
        k: 'ירקות',
        title: 'מה שיש בבית',
        body: 'לצד הפחמימה ולא במקומה. הם לא אמורים למלא אותך בגיל הזה — הם אמורים פשוט להיות שם.',
      },
    ];
  }

  const bulking = p.goal === 'muscle' || p.goal === 'strength';
  return [
    {
      k: 'חלבון',
      title: 'כף יד אחת',
      body: 'שתיים בארוחת הערב. עוף, בשר, דגים, טונה, ביצים, קוטג׳, יוגורט יווני, קטניות, טופו.',
    },
    {
      k: 'פחמימה',
      title: bulking ? 'אגרוף עד שניים' : 'אגרוף אחד',
      body: bulking
        ? 'אורז, פסטה, לחם, פיתה, תפוח אדמה, קוסקוס, שיבולת שועל. זה הדלק וזה מה שמעלה משקל.'
        : 'אורז, פסטה, לחם, תפוח אדמה, קוסקוס. לא לאפס — בלי פחמימה האימונים נופלים ראשונים.',
    },
    {
      k: 'שומן',
      title: bulking ? 'כף מלאה' : 'כף שטוחה',
      body: 'שמן זית, טחינה, אבוקדו, חמאת בוטנים, אגוזים. הדרך הכי קלה להוסיף או להוריד אנרגיה.',
    },
    {
      k: 'ירקות',
      title: bulking ? 'מה שנכנס' : 'חצי מהצלחת',
      body: bulking
        ? 'לא צריך להגזים — הם ממלאים בלי לתת אנרגיה, וזה בדיוק מה שאתה לא רוצה עכשיו.'
        : 'הם מה שיגרום לך לקום מהשולחן שבע בלי לחרוג. אל תוותר עליהם.',
    },
  ];
}

/*
 * This table used to ignore the diet chips completely. Someone who ticked
 * "טבעוני" two screens earlier was told that grilled chicken is the best option
 * in any situation — the same failure as the allergy filter, where the question
 * is asked, answered, and then not used. And `cutting` came straight off the
 * goal chip, so a fourteen-year-old whose warnings say the app deliberately
 * does not diet at this age was reading "two slices, not four".
 */
function eatingOut(p, minor, cutting) {
  const diet = p.diet || [];
  const vegan = diet.includes('vegan');
  const out = vegan || diet.includes('vegetarian')
    ? eatingOutVeg(vegan, cutting)
    : eatingOutMeat(cutting);

  if (diet.includes('gluten_free')) {
    // Written as an override of the rows above rather than a sixth opinion —
    // half of them recommend a pita, and this is the line that takes it back.
    out.push({
      where: 'בלי גלוטן',
      pick: 'כל מה שלמעלה נכון חוץ מהפיתה, מהלחמנייה ומהבצק — קח אורז, תפוחי אדמה או מנה בצלחת במקום. תשאל על הרוטב ועל הציפוי, שם הקמח מתחבא',
    });
  }
  if (p.whoCooks === 'outside') {
    // Someone who buys ready-made eats from a shelf every day, not from a
    // restaurant once a week. Their version of this table is the makolet.
    out.push({
      where: 'סופר ומכולת',
      pick: `${vegan ? 'חומוס, טופו, אורז מוכן, ירקות חתוכים, פירות ואגוזים' : 'קוטג׳, טונה, ביצים קשות, אורז מוכן, ירקות חתוכים ופירות'} — מי שלא מבשל בונה את היום מהמדף הזה, וזה עובד בדיוק כמו בישול`,
    });
  }
  if (minor) {
    out.push({
      where: 'קיוסק ואוטומט',
      pick: 'בתוספת לארוחה, לא במקומה. חטיף בהפסקה הוא בעיה רק כשהוא מחליף את הצהריים',
    });
  }
  return out;
}

function eatingOutMeat(cutting) {
  return [
    {
      where: 'שווארמה',
      pick: cutting
        ? 'בצלחת, בלי פיתה, עם הרבה סלט. תבקש רזה ותוותר על הצ׳יפס'
        : 'בצלחת עם אורז וסלט — יותר בשר מאשר בפיתה',
    },
    {
      where: 'המבורגר',
      pick: cutting
        ? 'בלי רוטב ובלי צ׳יפס, או חצי לחמנייה. הבשר עצמו הוא לא הבעיה'
        : 'בסדר גמור. תוסיף ביצה או קציצה שנייה',
    },
    {
      where: 'פיצה',
      pick: cutting
        ? 'שתי משולשים עם סלט גדול לפני — לא ארבעה בלי'
        : 'עם תוספת טונה או עוף, לא רק גבינה',
    },
    {
      where: 'על האש',
      pick: 'האופציה הכי טובה בכל מצב — פרגית או כנפיים עם סלט וטחינה',
    },
    {
      where: 'סושי',
      pick: cutting
        ? 'סשימי ומאקי פשוט. הימנע מהמטוגן ומרטבים מתוקים'
        : 'מעט מאוד חלבון ואנרגיה ליחידת נפח, וקל לצאת משם רעב. תוסיף אדממה, מרק ואורז',
    },
  ];
}

function eatingOutVeg(vegan, cutting) {
  const out = [
    {
      where: 'חומוס',
      pick: cutting
        ? 'מנה עם הרבה סלט ופיתה אחת, לא שתיים. הטחינה והשמן הם רוב הקלוריות כאן, לא הגרגרים'
        : 'מנת חומוס עם פול ופיתה — חלבון, פחמימה ושומן במנה אחת, וזמין בכל פינה',
    },
    {
      where: 'פלאפל',
      pick: cutting
        ? 'בצלחת עם סלט וחומוס, בלי פיתה. הכדורים מטוגנים וזה כל הסיפור כאן'
        : 'בפיתה עם הרבה סלט וטחינה. אחת הארוחות הצמחוניות הזמינות בארץ עם חלבון אמיתי',
    },
    {
      where: 'על האש',
      pick: 'ירקות בגריל, תפוחי אדמה ופיתה עם טחינה. אם אתה יכול — תביא איתך קציצות עדשים או טופו, שם החלבון',
    },
    {
      where: 'סושי',
      pick: 'מאקי ירקות ואבוקדו עם אדממה. בלי האדממה כמעט ואין כאן חלבון',
    },
  ];
  out.push(vegan
    ? {
      where: 'פיצה',
      pick: 'בלי גבינה עם המון תוספות ירקות — או פשוט לבחור אחרת. בלי הגבינה נשאר בעיקר בצק',
    }
    : {
      where: 'שקשוקה בבית קפה',
      pick: 'שקשוקה או חביתה עם לחם וסלט — ארוחת חלבון שלמה כמעט בכל תפריט, גם כשאין שום דבר אחר',
    });
  return out;
}

function checkins(p, minor, cutting) {
  /*
   * The markers are the diet. A weekly weigh-in and "stuck for three weeks?
   * drop a snack" are what dieting consists of once you delete the calorie
   * count — which is exactly what this screen used to hand a fourteen-year-old,
   * two panels below a warning saying we do not diet at this age. Under 16 the
   * question is not whether the number moved, it is whether the day held: did
   * breakfast happen, are the training numbers climbing, does the afternoon
   * still have energy in it. All three answer "are you eating enough", and none
   * of them teaches a growing kid to watch a scale.
   */
  if (minor) {
    return [
      {
        k: 'ארוחת בוקר',
        title: 'אכלת אותה היום?',
        body: 'הסימן הכי טוב שהיום מסודר, וההרגל הראשון שנופל. מי שמדלג עליה מגיע לצהריים מורעב, אוכל פחות טוב עד הערב, ומגיע לאימון ריק.',
      },
      {
        k: 'המספרים באימון',
        title: 'עוד חזרה, עוד קצת משקל',
        body: 'זו העדות שצריך בגיל הזה. אם המספרים עולים משבוע לשבוע אתה אוכל מספיק. אם הם תקועים חודש — קודם תוסיף אוכל, לא אימון.',
      },
      {
        k: 'אנרגיה',
        title: 'איך אחר הצהריים',
        body: 'עייפות כבדה בשיעורים האחרונים או בדרך לאימון היא כמעט תמיד ארוחה חסרה, לא חוסר שינה. נשנוש בין הצהריים לאימון פותר את זה.',
      },
      {
        k: 'בלי מאזניים',
        title: 'לא שוקלים כל שבוע',
        body: 'אתה עוד גדל, ולכן המספר אמור לעלות. מעקב שבועי אחריו מלמד להסתכל על הדבר הלא נכון בדיוק בגיל שבו זה נדבק. הבגדים, הכוח והמראה מספרים את זה טוב יותר.',
      },
    ];
  }

  const out = [
    {
      k: 'שקילה',
      title: 'פעם בשבוע, אותו יום',
      body: 'בבוקר, אחרי שירותים, לפני שאתה אוכל. משקל יומי קופץ קילו בין בוקר לערב ולא אומר כלום.',
    },
    {
      k: 'אם המשקל תקוע',
      title: cutting ? 'הורד נשנוש' : 'הוסף נשנוש',
      body: cutting
        ? 'שבועיים־שלושה בלי תזוזה? הורד נשנוש אחד ביום, או החלף אותו בפרי. אל תוריד ארוחה שלמה.'
        : 'שבועיים־שלושה בלי תזוזה? תוסיף עוד נשנוש ביום. בדרך כלל הבעיה היא ארוחת הבוקר.',
    },
    {
      k: 'אם המספרים באימון עולים',
      title: 'אתה בכיוון',
      body: 'עוד חזרה, עוד 2.5 ק״ג — זו עדות טובה יותר מכל מספר על המאזניים.',
    },
  ];
  if (cutting) {
    out.push({
      k: 'סימן אזהרה',
      title: 'אם הביצועים נופלים',
      body: 'ירידה חדה בכוח, שינה גרועה ורעב מתמיד אומרים שהגירעון גדול מדי. תוסיף 200 קק״ל ותמשיך.',
    });
  }
  return out;
}

function warnings(p, minor, strat, thin) {
  const out = [];
  if (minor) {
    out.push('בלי קריאטין ובלי אבקת חלבון. ההמלצה של גופי רפואת הספורט היא לא ליטול קריאטין מתחת לגיל 18 — אין מספיק מחקר על גופים בהתפתחות. אוכל אמיתי עושה את העבודה.');
    out.push('ההורים יודעים, ורופא נתן אישור. זה סטנדרט לפני כל תוכנית מובנית בגיל הזה, לא סימן שמשהו לא בסדר.');
    out.push('אין כאן ספירת קלוריות בכוונה, וגם לא שקילות שבועיות או "להוריד נשנוש". בגיל הזה דיאטה מכוונת פוגעת בגדילה — המטרה היא לאכול מספיק ובאופן קבוע.');
    if (p.goal === 'fatloss') {
      out.push('ציינת ירידה במשקל כמטרה. בגיל הזה זה קורה דרך הגובה והשריר ולא דרך פחות אוכל — המספר על המאזניים אמור לעלות בזמן שההרכב משתנה. אם יש חשש רפואי סביב המשקל, זו שיחה עם רופא ולא עם אפליקציה.');
    }
  } else {
    // Only claim the numbers are an estimate when there are numbers.
    if (strat) out.push('המספרים כאן הם הערכה מנוסחה, לא מדידה. הם נקודת פתיחה — הגוף על המאזניים ובמראה הוא המדד האמיתי.');
    if (strat && strat.hold === 'underweight') {
      out.push('המשקל שלך נמוך ביחס לגובה, ולכן התוכנית מכוונת לאחזקה ולא לירידה. אין כאן מספיק שומן שגירעון יכול לקחת ממנו, והוא ייקח במקומו משריר, משינה ומהורמונים. אם בכל זאת חשוב לך לרדת — תעשה את זה מול דיאטן.');
    } else if (p.goal === 'fatloss') {
      out.push('גירעון גדול יותר לא נותן תוצאה מהירה יותר לאורך זמן — הוא רק מוריד שריר ומעלה את הסיכוי שתפרוש.');
    }
  }
  if (thin) {
    // Better to say the plan came out narrow than to quietly pad it with food
    // the person told us they cannot eat.
    out.push('ההגבלות שציינת מוציאות חלק גדול מהמאגר, ובעיקר את מקורות החלבון, ולכן נשארו כאן פחות חלופות מהרגיל. מה שמופיע מתאים לך — אבל שווה לבנות עם דיאטן עוד אופציות, במיוחד לחלבון, לברזל, לאבץ ולסידן.');
  }
  if (String(p.medical || '').trim() || String(p.supplements || '').trim()) {
    out.push('ציינת מצב רפואי או תוספים. שווה לעבור על התוכנית התזונתית עם רופא או דיאטן לפני שמתחילים.');
  }
  if ((p.diet || []).includes('vegan')) {
    out.push('בתפריט טבעוני שים לב לוויטמין B12 — הוא לא קיים בצומח וצריך תוסף. גם ברזל ואבץ דורשים תשומת לב.');
  }
  return out;
}

export { BANK, passesDiet };
