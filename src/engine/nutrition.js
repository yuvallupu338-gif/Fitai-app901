/*
 * nutrition.js — the eating plan.
 *
 * Two modes. Under 16 there are no calorie targets at all: the plan is the
 * plate rule, meal timing and habits, because a growing body should not be
 * taught to count. From 16 up it computes a real target from Mifflin-St Jeor
 * and sizes the deficit or surplus to what targets.js considers achievable,
 * rather than inventing an aggressive number.
 *
 * Food is Israeli home food with household measures, not grams on a scale.
 */

/* ------------------------------------------------------------------ *
 * Food bank
 *
 * tags: meat | fish | dairy | egg | gluten | nuts | legume | soy | honey
 * Every variant is tagged honestly so the diet filters actually bite.
 * ------------------------------------------------------------------ */

const BANK = {
  breakfast: [
    { n: 'קערת אורז וטחינה', i: 'כוס אורז חם · 2 כפות טחינה גולמית · בננה · תמרים', tags: ['sesame'] },
    { n: 'בטטה אפויה', i: 'בטטה גדולה אפויה · טחינה · אבוקדו · עגבניות שרי', tags: ['sesame'] },
    { n: 'דייסת קינואה', i: 'קינואה מבושלת במשקה אורז · בננה · תמרים · קינמון', tags: [] },
    { n: 'סלט אבוקדו ותפוח אדמה', i: '2 תפוחי אדמה · אבוקדו שלם · עגבנייה · שמן זית · מלח', tags: [] },
    { n: 'חומוס ותירס', i: 'חצי גביע חומוס · תירס · גזר · שמן זית', tags: ['legume'] },
    { n: 'חביתה, לחם וטחינה', i: '3 ביצים · 2 פרוסות לחם מלא · כף טחינה · בננה', tags: ['egg', 'gluten'] },
    { n: 'שיבולת שועל חמה', i: 'חצי כוס שיבולת שועל בחלב · כף חמאת בוטנים · כף דבש · בננה', tags: ['dairy', 'gluten', 'nuts', 'honey'] },
    { n: 'קערת יוגורט', i: 'יוגורט יווני גדול · גרנולה · חופן שקדים · 3 תמרים', tags: ['dairy', 'gluten', 'nuts'] },
    { n: 'פיתה וקוטג׳', i: '2 פיתות · קוטג׳ 5% · ביצה קשה · מלפפון · כוס שוקו', tags: ['dairy', 'egg', 'gluten'] },
    { n: 'שקשוקה', i: '2 ביצים ברוטב עגבניות · פרוסת לחם לניגוב · סלט', tags: ['egg', 'gluten'] },
    { n: 'שיבולת שועל במים', i: 'חצי כוס שיבולת שועל במים · כף טחינה גולמית · בננה · תמרים', tags: ['gluten'] },
    { n: 'טופו מקושקש', i: 'טופו מפורר עם כורכום וירקות · 2 פרוסות לחם · אבוקדו', tags: ['soy', 'gluten'] },
    { n: 'קערת פירות ואגוזים', i: 'בננה · תפוח · חופן אגוזים · 2 כפות טחינה · תמרים', tags: ['nuts'] },
    { n: 'ביצים ואורז', i: '3 ביצים · כוס אורז מאתמול · סלט עם שמן זית', tags: ['egg'] },
    { n: 'שייק בוקר', i: 'כוס משקה שקדים · בננה · 2 כפות שיבולת שועל · כף חמאת בוטנים', tags: ['gluten', 'nuts'] },
  ],

  snack: [
    { n: 'תמרים וטחינה', i: '4 תמרים · 2 כפות טחינה גולמית · כוס מים', tags: ['sesame'] },
    { n: 'בטטה קרה', i: 'בטטה אפויה מאתמול · מלח · שמן זית', tags: [] },
    { n: 'פירות וזרעי דלעת', i: 'בננה · תפוח · חופן זרעי דלעת', tags: [] },
    { n: 'תירס ואבוקדו', i: 'תירס חם · חצי אבוקדו · לימון · מלח', tags: [] },
    { n: 'כריך חמאת בוטנים', i: '2 פרוסות לחם · חמאת בוטנים ודבש · קרטון שוקו', tags: ['gluten', 'nuts', 'dairy', 'honey'] },
    { n: 'יוגורט וגרנולה', i: 'יוגורט · גרנולה · בננה', tags: ['dairy', 'gluten'] },
    { n: 'ביצים ולחמנייה', i: '2 ביצים קשות · לחמנייה · מלח', tags: ['egg', 'gluten'] },
    { n: 'אגוזים ופירות יבשים', i: 'חופן שקדים · 3 תמרים · תפוח', tags: ['nuts'] },
    { n: 'טונה על קרקרים', i: 'קופסת טונה · 6 קרקרים · מלפפון', tags: ['fish', 'gluten'] },
    { n: 'חומוס וירקות', i: 'חצי גביע חומוס · גזר וקולורבי חתוכים · פיתה קטנה', tags: ['legume', 'gluten'] },
    { n: 'פירות וטחינה', i: 'בננה · תפוח · 2 כפות טחינה גולמית', tags: [] },
    { n: 'אדממה', i: 'קערת אדממה · חופן שקדים · תפוז', tags: ['soy', 'nuts'] },
    { n: 'קוטג׳ ופרי', i: 'גביע קוטג׳ · אפרסק או תפוח · כף דבש', tags: ['dairy', 'honey'] },
    { n: 'תמרים ואגוזי מלך', i: '4 תמרים · חופן אגוזי מלך · כוס תה', tags: ['nuts'] },
  ],

  lunch: [
    { n: 'אורז וקטניות', i: 'אורז מלא · שעועית שחורה · אבוקדו · סלסה · לימון', tags: ['legume'] },
    { n: 'תבשיל בטטה וחומוס', i: 'בטטה · גרגרי חומוס · אורז · טחינה · כוסברה', tags: ['legume','sesame'] },
    { n: 'קינואה וירקות אפויים', i: 'קינואה · חציל · קישוא · פלפל · שמן זית · לימון', tags: [] },
    { n: 'מרק ירקות וקטניות', i: 'עדשים · תפוח אדמה · גזר · אורז בצד · שמן זית', tags: ['legume'] },
    { n: 'עוף ואורז', i: 'חזה עוף · כוס וחצי אורז · סלט עם שמן זית', tags: ['meat'] },
    { n: 'פסטה בולונז', i: 'פסטה · בשר טחון ברוטב עגבניות · פרוסת לחם', tags: ['meat', 'gluten'] },
    { n: 'שניצל ופירה', i: '2 שניצלים · פירה · סלט', tags: ['meat', 'gluten'] },
    { n: 'מג׳דרה', i: 'אורז עם עדשים · ביצה קשה · טחינה · סלט', tags: ['legume', 'egg'] },
    { n: 'טורטייה גדולה', i: 'טורטייה · טונה · ביצה · אבוקדו · ירקות', tags: ['fish', 'egg', 'gluten'] },
    { n: 'תבשיל עדשים', i: 'עדשים כתומות · אורז מלא · טחינה · סלט ירקות', tags: ['legume'] },
    { n: 'קדרת חומוס וירקות', i: 'חומוס גרגרים · בטטה · אורז · טחינה · לימון', tags: ['legume'] },
    { n: 'דג ואורז', i: 'פילה דג בתנור · אורז · ירקות אפויים', tags: ['fish'] },
    { n: 'תבשיל שעועית', i: 'שעועית לבנה ברוטב · אורז · סלט · כף שמן זית', tags: ['legume'] },
    { n: 'קציצות עוף ובורגול', i: 'קציצות עוף · בורגול · סלט ירקות', tags: ['meat', 'gluten'] },
  ],

  preworkout: [
    { n: 'אורז ומלח', i: 'כוס אורז לבן · מלח · כוס מים', tags: [] },
    { n: 'בטטה ותמרים', i: 'חצי בטטה אפויה · 3 תמרים · מים', tags: [] },
    { n: 'קומפוט פירות', i: 'תפוח מבושל · צימוקים · כוס מים עם מלח', tags: [] },
    { n: 'פיתה עם קוטג׳', i: 'פיתה · קוטג׳ · כף דבש', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'בננה וחמאת בוטנים', i: 'בננה · פרוסת לחם עם חמאת בוטנים', tags: ['gluten', 'nuts'] },
    { n: 'יוגורט וקרקרים', i: 'יוגורט · כף דבש · 5 קרקרים', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'שייק אנרגיה', i: 'כוס חלב · בננה · 2 כפות שיבולת שועל · כף דבש', tags: ['dairy', 'gluten', 'honey'] },
    { n: 'תמרים ובננה', i: '4 תמרים · בננה · כוס מים עם מלח', tags: [] },
    { n: 'לחם וריבה', i: '2 פרוסות לחם לבן · ריבה · תה', tags: ['gluten'] },
    { n: 'אורז ודבש', i: 'כוס אורז מהצהריים · כף דבש · מלח', tags: ['honey'] },
    { n: 'קערת פירות', i: 'בננה · תפוח · ענבים', tags: [] },
  ],

  dinner: [
    { n: 'אורז, קטניות וטחינה', i: 'אורז · עדשים · טחינה · סלט ירקות גדול · לימון', tags: ['legume','sesame'] },
    { n: 'תפוחי אדמה בתנור וטופו', i: 'טופו צלוי · תפוחי אדמה · ברוקולי · שמן זית', tags: ['soy'] },
    { n: 'קדרת בטטה ושעועית', i: 'בטטה · שעועית לבנה ברוטב עגבניות · אורז', tags: ['legume'] },
    { n: 'קינואה, חומוס וירקות', i: 'קינואה · גרגרי חומוס צלויים · ירקות אפויים · טחינה', tags: ['legume','sesame'] },
    { n: 'על האש', i: 'פרגית או כנפיים · אורז · פיתה · סלט עם טחינה', tags: ['meat', 'gluten'] },
    { n: 'המבורגר ביתי', i: '2 קציצות · לחמנייה · תפוחי אדמה בתנור · סלט', tags: ['meat', 'gluten'] },
    { n: 'דג ותפוח אדמה', i: 'פילה סלמון או בורי · 2 תפוחי אדמה · ירקות בתנור', tags: ['fish'] },
    { n: 'פסטה גדולה', i: 'פסטה עם בשר טחון · סלט · לחם שום', tags: ['meat', 'gluten'] },
    { n: 'שווארמה בצלחת', i: 'שווארמה · אורז · חומוס · טחינה · סלט', tags: ['meat', 'legume'] },
    { n: 'מוקפץ ירקות וטופו', i: 'טופו · ירקות מוקפצים · אורז · שומשום', tags: ['soy'] },
    { n: 'תבשיל גרגרי חומוס', i: 'חומוס ברוטב עגבניות · קוסקוס · סלט · טחינה', tags: ['legume', 'gluten'] },
    { n: 'עוף בתנור וירקות', i: 'ירכיים בתנור · בטטה · ברוקולי · אורז', tags: ['meat'] },
    { n: 'סלט קטניות גדול', i: 'עדשים ושעועית · ירקות · אבוקדו · טחינה · לחם מלא', tags: ['legume', 'gluten'] },
    { n: 'חביתת ירקות ואורז', i: '3 ביצים · ירקות מוקפצים · אורז · סלט', tags: ['egg'] },
  ],

  night: [
    { n: 'אורז וטחינה', i: 'חצי כוס אורז · כף טחינה גולמית · מלח', tags: ['sesame'] },
    { n: 'בטטה קטנה', i: 'בטטה אפויה · קינמון · תה', tags: [] },
    { n: 'קערת פירות', i: 'תפוח · בננה · תמרים', tags: [] },
    { n: 'קוטג׳ עם דבש', i: 'קופסת קוטג׳ 5% · כף דבש', tags: ['dairy', 'honey'] },
    { n: 'יוגורט וחמאת בוטנים', i: 'יוגורט יווני · כף חמאת בוטנים', tags: ['dairy', 'nuts'] },
    { n: 'חלב ולחם', i: 'כוס חלב · 2 פרוסות לחם עם ריבה', tags: ['dairy', 'gluten'] },
    { n: 'שייק לילה', i: 'כוס משקה שקדים · בננה · כף חמאת בוטנים', tags: ['nuts'] },
    { n: 'ביצים קשות', i: '2 ביצים קשות · מלפפון · מלח', tags: ['egg'] },
    { n: 'טחינה ותמרים', i: '2 כפות טחינה גולמית · 4 תמרים · תה', tags: [] },
    { n: 'אדממה וקערת פירות', i: 'אדממה · תפוח · חופן שקדים', tags: ['soy', 'nuts'] },
    { n: 'חומוס וגזר', i: 'חצי גביע חומוס · גזר חתוך · כף שמן זית', tags: ['legume'] },
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

function passesAllergies(variant, allergyTerms) {
  if (!allergyTerms.length) return true;
  const hay = `${variant.n} ${variant.i}`;
  return !allergyTerms.some((t) => hay.includes(t));
}

function allergyTerms(profile) {
  return String(profile.allergies || '')
    .split(/[,،;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/**
 * Filtered variants for a slot.
 *
 * Neither filter is ever relaxed. An allergy is a medical constraint and a
 * declared diet is the whole reason the user answered the question — showing
 * a vegan a cottage cheese bowl because the list ran short is worse than
 * showing them a shorter list. The bank carries enough vegan, gluten-free and
 * nut-free entries in every slot that the intersection still clears four.
 */
function variantsFor(slot, profile, count) {
  const diet = profile.diet || [];
  const terms = allergyTerms(profile);
  const bank = BANK[slot] || [];
  const list = bank.filter((v) => passesDiet(v, diet) && passesAllergies(v, terms));
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

function strategy(profile) {
  const bmr = Math.round(mifflin(profile));
  const factor = activityFactor(profile);
  const tdee = Math.round(bmr * factor);

  // Size the change by the achievable weekly rate, not by a round percentage.
  let deltaKcal = 0;
  const w = profile.weightKg;
  switch (profile.goal) {
    case 'fatloss': deltaKcal = -Math.round(Math.min(tdee * 0.22, (0.006 * w * 7700) / 7)); break;
    case 'muscle': deltaKcal = Math.round(Math.min(tdee * 0.12, (0.003 * w * 7700) / 7)); break;
    case 'strength': deltaKcal = Math.round(tdee * 0.05); break;
    case 'sport': deltaKcal = Math.round(tdee * 0.03); break;
    default: deltaKcal = 0;
  }

  const kcal = Math.round((tdee + deltaKcal) / 10) * 10;

  const proteinPerKg = profile.goal === 'fatloss' ? 2.2 : profile.goal === 'muscle' ? 1.9 : 1.7;
  const proteinG = Math.round(w * proteinPerKg);
  const fatG = Math.round(Math.max(w * 0.8, kcal * 0.25 / 9));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return {
    bmr,
    tdee,
    kcal,
    proteinG,
    carbsG,
    fatG,
    deltaKcal,
    basis: `חושב לפי נוסחת מיפלין־סנט ז׳ור: מטבוליזם במנוחה ${bmr} קק״ל, `
      + `מוכפל ב־${factor} (${FACTOR_HE[factor] || 'פעילות'}) לפי ${profile.daysPerWeek} אימונים של ${profile.minutesPerSession} דקות. `
      + (deltaKcal === 0
        ? 'ללא גירעון או עודף — אחזקה.'
        : `${deltaKcal < 0 ? 'גירעון' : 'עודף'} של ${Math.abs(deltaKcal)} קק״ל ביום, בקצב שאפשר להחזיק לאורך זמן.`),
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export function nutritionPlan(profile) {
  const p = profile || {};
  const minor = Number(p.age) < 16;
  const meals = [];

  const sched = scheduleFor(p.mealsPerDay || 4);
  const trainHour = TRAIN_TIME[p.timeOfDay] || 18;

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

  // The pre-workout meal only exists on training days, and only when it does
  // not collide with a meal that is already within an hour of the session.
  const preHour = trainHour - 1.5;
  const collides = sched.some(([, hour]) => Math.abs(hour - preHour) < 1);
  if (!collides && preHour > 5) {
    meals.push({
      time: hhmm(preHour),
      slot: SLOT_LABEL.preworkout,
      job: JOB.preworkout,
      trainingOnly: true,
      variants: variantsFor('preworkout', p, 5),
    });
  }
  meals.sort((a, b) => a.time.localeCompare(b.time));

  return {
    strategy: minor ? null : strategy(p),
    plate: plate(p),
    meals,
    eatingOut: eatingOut(p),
    checkins: checkins(p),
    warnings: warnings(p, minor),
  };
}

function plate(p) {
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

function eatingOut(p) {
  const cutting = p.goal === 'fatloss';
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
        : 'הכי חלש למטרה שלך — מעט מאוד חלבון ואנרגיה ליחידת נפח',
    },
  ];
}

function checkins(p) {
  const cutting = p.goal === 'fatloss';
  const out = [
    {
      k: 'שקילה',
      title: 'פעם בשבוע, אותו יום',
      body: 'בבוקר, אחרי שירותים, לפני שאתה אוכל. משקל יומי קופץ קילו בין בוקר לערב ולא אומר כלום.',
    },
    {
      k: cutting ? 'אם המשקל תקוע' : 'אם המשקל תקוע',
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

function warnings(p, minor) {
  const out = [];
  if (minor) {
    out.push('בלי קריאטין ובלי אבקת חלבון. ההמלצה של גופי רפואת הספורט היא לא ליטול קריאטין מתחת לגיל 18 — אין מספיק מחקר על גופים בהתפתחות. אוכל אמיתי עושה את העבודה.');
    out.push('ההורים יודעים, ורופא נתן אישור. זה סטנדרט לפני כל תוכנית מובנית בגיל הזה, לא סימן שמשהו לא בסדר.');
    out.push('אין כאן ספירת קלוריות בכוונה. בגיל הזה דיאטה מכוונת פוגעת בגדילה — המטרה היא לאכול מספיק ובאופן קבוע.');
  } else {
    out.push('המספרים כאן הם הערכה מנוסחה, לא מדידה. הם נקודת פתיחה — הגוף על המאזניים ובמראה הוא המדד האמיתי.');
    if (p.goal === 'fatloss') {
      out.push('גירעון גדול יותר לא נותן תוצאה מהירה יותר לאורך זמן — הוא רק מוריד שריר ומעלה את הסיכוי שתפרוש.');
    }
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
