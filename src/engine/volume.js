/*
 * volume.js — how much work the week gets, how the week is split, and how much
 * of it fits into one session.
 *
 * Pure arithmetic over the profile: no DOM, no randomness, no imports.
 * Three ideas run through the whole file:
 *
 *   1. There is a physiological target — roughly 10–20 effective sets per
 *      muscle group per week, scaled by experience, recovery and goal.
 *   2. There is a time reality — a 30-minute session holds ~10 working sets,
 *      no matter what the target says.
 *   3. The plan is the smaller of the two, and the note says which one bound it.
 */

/* Groups the whole engine talks in. These keys are the weeklyVolume() result. */
const GROUPS = ['push', 'pull', 'legs', 'core', 'arms', 'shoulders', 'calves', 'conditioning'];
const MAJORS = ['push', 'pull', 'legs'];
const SMALL = ['arms', 'shoulders', 'calves', 'conditioning'];

/*
 * Weekly sets per group for the reference trainee: intermediate, 4 sessions of
 * 75 minutes, sleeping enough, no injuries. Every other profile is this list,
 * scaled. Majors sit mid-window so there is room to move in both directions.
 */
const GOAL_BASE = {
  strength: { push: 13, pull: 13, legs: 15, core: 6, arms: 5, shoulders: 5, calves: 4, conditioning: 3 },
  muscle: { push: 16, pull: 16, legs: 15, core: 7, arms: 8, shoulders: 6, calves: 5, conditioning: 2 },
  fatloss: { push: 12, pull: 12, legs: 13, core: 8, arms: 4, shoulders: 4, calves: 3, conditioning: 10 },
  fitness: { push: 12, pull: 12, legs: 12, core: 8, arms: 4, shoulders: 4, calves: 3, conditioning: 7 },
  sport: { push: 10, pull: 12, legs: 14, core: 8, arms: 3, shoulders: 3, calves: 3, conditioning: 9 },
};

/* Minutes one working set really costs, door to door: the set itself, the rest
   after it, and the walking and loading around it. Strength rests long. */
const MIN_PER_SET = { strength: 3.2, muscle: 2.6, fatloss: 2.0, fitness: 2.1, sport: 2.2 };

/* Upper bound per muscle group. A beginner does not need 20 sets of chest. */
const CEILING = { beginner: 14, returning: 16, intermediate: 18, advanced: 20 };

const GOAL_HE = {
  fatloss: 'ירידה בשומן', muscle: 'עלייה במסה', strength: 'כוח',
  fitness: 'כושר כללי', sport: 'ספורט',
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clampInt(v, lo, hi, d) {
  const n = Math.round(num(v, d));
  return Math.max(lo, Math.min(hi, n));
}

function goalOf(profile) {
  return GOAL_BASE[profile && profile.goal] ? profile.goal : 'fitness';
}

function experienceOf(profile) {
  const e = profile && profile.experience;
  return CEILING[e] ? e : 'beginner';
}

/* ------------------------------------------------------------------ *
 * sessionBudget
 * ------------------------------------------------------------------ */

/**
 * How one session divides up.
 *
 * `maxSlots` is a ceiling on exercise variety, not a target: a 30-minute
 * session tops out around 5 exercises and a 90-minute session around 9–10.
 * The curve is deliberately flat — doubling the time does not double the
 * number of exercises, it buys more sets and longer rests on each one.
 */
export function sessionBudget(profile) {
  const p = profile || {};
  const minutes = clampInt(p.minutesPerSession, 20, 120, 60);
  const goal = goalOf(p);

  const warmupMin = clampInt(minutes * 0.15, 5, 12, 8);
  const finisherShare = (goal === 'fatloss' || goal === 'fitness' || goal === 'sport') ? 0.09 : 0.05;
  const finisherMin = clampInt(minutes * finisherShare, 2, 8, 4);
  const mainMin = Math.max(10, minutes - warmupMin - finisherMin);

  // 30 min -> 5, 45 -> 6, 60 -> 7, 75 -> 9, 90 -> 10 slots, before the goal nudge.
  const goalAdj = goal === 'strength' ? -1 : (goal === 'fatloss' ? 1 : 0);
  const maxSlots = clampInt(2.2 + 0.085 * minutes + goalAdj, 3, 11, 6);

  return { warmupMin, mainMin, finisherMin, maxSlots };
}

/* ------------------------------------------------------------------ *
 * weeklyVolume
 * ------------------------------------------------------------------ */

function factors(profile, days, minutes) {
  const exp = experienceOf(profile);
  const age = clampInt(profile.age, 10, 90, 30);
  const sleep = num(profile.sleepHours, 7.5);
  const stress = clampInt(profile.stress, 1, 5, 3);

  const experience = { beginner: 0.80, returning: 0.88, intermediate: 1.0, advanced: 1.08 }[exp];
  const frequency = { 2: 0.80, 3: 0.90, 4: 1.0, 5: 1.07, 6: 1.12 }[days] || 1.0;
  const session = minutes <= 30 ? 0.75
    : minutes <= 45 ? 0.85
      : minutes <= 60 ? 0.95
        : minutes <= 75 ? 1.0
          : minutes <= 90 ? 1.05 : 1.08;
  const rest = sleep < 6 ? 0.82 : sleep < 7 ? 0.90 : sleep >= 8.5 ? 1.04 : 1.0;
  const load = stress >= 5 ? 0.85 : stress >= 4 ? 0.92 : 1.0;
  const years = age >= 65 ? 0.86 : age >= 55 ? 0.93 : age < 15 ? 0.92 : 1.0;
  // Enough training age to use a 5–6 day week, so use it.
  const dense = (days >= 5 && (exp === 'intermediate' || exp === 'advanced')) ? 1.05 : 1.0;

  return {
    experience, frequency, session, rest, load, years, dense,
    total: experience * frequency * session * rest * load * years * dense,
  };
}

/**
 * Sets per week per muscle group.
 *
 * Returns { push, pull, legs, core, arms, shoulders, calves, conditioning,
 *           total, note }.
 */
export function weeklyVolume(profile) {
  const p = profile || {};
  const goal = goalOf(p);
  const exp = experienceOf(p);
  const days = clampInt(p.daysPerWeek, 2, 6, 3);
  const minutes = clampInt(p.minutesPerSession, 20, 120, 60);
  const budget = sessionBudget(p);
  const f = factors(p, days, minutes);

  const raw = {};
  for (const g of GROUPS) raw[g] = GOAL_BASE[goal][g] * f.total;

  // Physiological ceilings. Accessory work never outgrows the compounds.
  const ceiling = CEILING[exp];
  for (const g of MAJORS) raw[g] = Math.min(raw[g], ceiling);
  raw.core = Math.min(raw.core, 14);
  raw.arms = Math.min(raw.arms, Math.round(ceiling * 0.65));
  raw.shoulders = Math.min(raw.shoulders, Math.round(ceiling * 0.6));
  raw.calves = Math.min(raw.calves, 8);
  raw.conditioning = Math.min(raw.conditioning, 14);

  // What the week can actually hold: working sets that fit in the main blocks,
  // and never more variety than the session has room for.
  const perSession = Math.min(budget.mainMin / MIN_PER_SET[goal], budget.maxSlots * 3.0);
  const capacity = perSession * days;

  let sum = GROUPS.reduce((n, g) => n + raw[g], 0);
  const timeBound = sum > capacity;
  if (timeBound && sum > 0) {
    const k = capacity / sum;
    for (const g of GROUPS) raw[g] *= k;
    sum = capacity;
  } else if (sum < capacity * 0.82) {
    // Long sessions, modest target: spend some of the spare time, but stay
    // under the ceilings — extra time is worth more as rest than as sets.
    const k = Math.min(1.3, (capacity * 0.85) / Math.max(1, sum));
    for (const g of GROUPS) {
      raw[g] = Math.min(raw[g] * k, g === 'core' ? 14 : MAJORS.includes(g) ? ceiling : raw[g] * 1.3);
    }
    sum = GROUPS.reduce((n, g) => n + raw[g], 0);
  }

  // Under 3 sets a week is not training, it is decoration. Drop those groups and
  // hand their minutes to the groups that survived — in a 30-minute full-body
  // session the compounds carry the arms anyway.
  const out = {};
  let dropped = 0;
  for (const g of GROUPS) {
    if (SMALL.indexOf(g) >= 0 && raw[g] < 3) { dropped += raw[g]; out[g] = 0; } else out[g] = raw[g];
  }
  const survivors = GROUPS.filter((g) => out[g] > 0);
  const survivorSum = survivors.reduce((n, g) => n + out[g], 0);
  if (dropped > 0.01 && survivorSum > 0) {
    const spread = 1 + dropped / survivorSum;
    for (const g of survivors) out[g] *= spread;
  }

  const vol = {};
  for (const g of MAJORS) vol[g] = Math.max(3, Math.round(Math.min(out[g], ceiling)));
  vol.core = Math.max(2, Math.round(Math.min(out.core, 16)));
  for (const g of SMALL) vol[g] = out[g] >= 2.5 ? Math.round(out[g]) : 0;

  vol.total = GROUPS.reduce((n, g) => n + vol[g], 0);
  vol.note = volumeNote(p, vol, {
    goal, exp, days, minutes, timeBound, factors: f,
  });
  return vol;
}

function volumeNote(profile, vol, ctx) {
  const head = `${GOAL_HE[ctx.goal]} ב־${ctx.days} אימונים של ${ctx.minutes} דק׳: `
    + `${vol.total} סטים עובדים בשבוע, ${vol.push} לדחיפה, ${vol.pull} למשיכה ו־${vol.legs} לרגליים`;

  let why;
  if (ctx.timeBound) {
    why = `זה מה שנכנס בזמן שיש — קיצור המנוחות מעבר לזה כבר פוגע באיכות הסטים`;
  } else if (ctx.factors.rest < 1) {
    why = `הורדתי נפח כי ${Math.round(num(profile.sleepHours, 7))} שעות שינה לא מספיקות להתאושש מיותר`;
  } else if (ctx.factors.load < 1) {
    why = 'הורדתי נפח כי רמת הלחץ שדיווחת עליה גובה מההתאוששות בדיוק כמו אימון נוסף';
  } else if (ctx.exp === 'beginner') {
    why = 'הנפח בצד הנמוך של הטווח כי בשלב הזה הגוף מגיב גם לגירוי קטן, והטכניקה חשובה יותר מהכמות';
  } else if (ctx.factors.dense > 1) {
    why = 'הנפח בקצה העליון של הטווח כי הוותק והתדירות שלך מצדיקים אותו';
  } else if (ctx.goal === 'fatloss') {
    why = 'נפח ההרמה נשמר כדי לא לאבד שריר בגירעון, והאירובי נוסף מעליו';
  } else {
    why = 'הכול בתוך הטווח של 10–20 סטים אפקטיביים לקבוצת שריר בשבוע';
  }
  return `${head} — ${why}.`;
}

/* ------------------------------------------------------------------ *
 * splitFor
 * ------------------------------------------------------------------ */

/* Pattern lists are in TRAINING ORDER: skill and heavy compounds first,
   isolation next, core near the end, conditioning last. The generator repeats
   a pattern when a group earns more than one slot on that day. */
const FULL_A = ['squat', 'horizontal_push', 'horizontal_pull', 'calf', 'arms_triceps', 'core_antiextension'];
const FULL_B = ['hinge', 'vertical_push', 'vertical_pull', 'lunge', 'shoulders_lateral', 'arms_biceps', 'core_flexion'];
const FULL_C = ['lunge', 'horizontal_push', 'vertical_pull', 'hinge', 'shoulders_rear', 'core_rotation'];

const UPPER_H = ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull',
  'shoulders_lateral', 'arms_triceps', 'arms_biceps', 'core_antiextension'];
const UPPER_V = ['vertical_pull', 'vertical_push', 'horizontal_pull', 'horizontal_push',
  'shoulders_rear', 'arms_biceps', 'arms_triceps', 'core_rotation'];
const LOWER_SQ = ['squat', 'hinge', 'lunge', 'calf', 'core_flexion'];
const LOWER_HI = ['hinge', 'squat', 'lunge', 'calf', 'core_antiextension'];

const PUSH_H = ['horizontal_push', 'vertical_push', 'shoulders_lateral', 'arms_triceps', 'core_antiextension'];
const PUSH_V = ['vertical_push', 'horizontal_push', 'shoulders_lateral', 'arms_triceps', 'core_flexion'];
const PULL_V = ['vertical_pull', 'horizontal_pull', 'shoulders_rear', 'arms_biceps', 'core_flexion'];
const PULL_H = ['horizontal_pull', 'vertical_pull', 'shoulders_rear', 'arms_biceps', 'core_rotation'];

const DAY_TEXT = {
  fbA: ['גוף מלא א׳', 'סקוואט, דחיפה אופקית ומשיכה אופקית — הבסיס שהשבוע נשען עליו.'],
  fbB: ['גוף מלא ב׳', 'ציר ירכיים, דחיפה מעל הראש ומשיכה אנכית — מה שהאימון הראשון לא כיסה.'],
  fbC: ['גוף מלא ג׳', 'עבודה חד־צדדית ואלכסונים: פחות עומס, יותר שליטה ואיזון בין הצדדים.'],
  upper: ['עליון', 'כל הפלג העליון באימון אחד — דחיפה, משיכה, כתפיים וידיים.'],
  lower: ['תחתון', 'סקוואט וציר ירכיים קודם, ואחריהם עבודה חד־צדדית ושוקיים.'],
  full: ['גוף מלא', 'אימון משלים שסוגר את מה שהעליון והתחתון החמיצו.'],
  upperA: ['עליון א׳', 'דגש אופקי: חזה וגב באמצע הטווח, שם רוב העבודה נעשית.'],
  upperB: ['עליון ב׳', 'דגש אנכי: מעל הראש ומעל הכתף — הזווית שהאימון הראשון לא נגע בה.'],
  lowerA: ['תחתון א׳', 'סקוואט בראש, ואחריו ציר ירכיים ועבודה חד־צדדית.'],
  lowerB: ['תחתון ב׳', 'ציר ירכיים בראש: ירך אחורית וישבן מקבלים את הסטים הטריים.'],
  push: ['דחיפה', 'חזה, כתפיים ויד אחורית — כל מה שדוחף, באימון אחד.'],
  pull: ['משיכה', 'גב, כתף אחורית ויד קדמית — כל מה שמושך, באימון אחד.'],
  legs: ['רגליים', 'ארבע ראשי, ירך אחורית, ישבן ושוקיים.'],
  pushA: ['דחיפה א׳', 'דגש אופקי — החזה מקבל את הסטים הכבדים.'],
  pullA: ['משיכה א׳', 'דגש אנכי — מתח ומשיכות מעל הראש ראשונות.'],
  legsA: ['רגליים א׳', 'סקוואט בראש: ארבע ראשי וישבן.'],
  pushB: ['דחיפה ב׳', 'דגש אנכי — לחיצה מעל הראש ראשונה, החזה אחריה.'],
  pullB: ['משיכה ב׳', 'דגש אופקי — חתירות, עובי הגב.'],
  legsB: ['רגליים ב׳', 'ציר ירכיים בראש: ירך אחורית, ישבן, וגב תחתון חזק.'],
};

function day(id, patterns, emphasis) {
  const t = DAY_TEXT[id] || [id, ''];
  return { id, title: t[0], focus: t[1], patterns: patterns.slice(), emphasis: emphasis.slice() };
}

function plans(days, exp, goal) {
  const advanced = exp === 'intermediate' || exp === 'advanced';
  if (days <= 2) {
    return {
      name: 'פול־באדי ×2',
      rationale: 'בשני אימונים בשבוע כל אימון חייב לגעת בכל הגוף — אחרת קבוצות שלמות פשוט לא מתאמנות.',
      days: [day('fbA', FULL_A, ['legs', 'push', 'pull']), day('fbB', FULL_B, ['legs', 'push', 'pull'])],
    };
  }
  if (days === 3) {
    if (advanced && (goal === 'muscle' || goal === 'strength')) {
      return {
        name: 'עליון · תחתון · גוף מלא',
        rationale: 'יש לך מספיק ותק כדי לפצל: יום עליון, יום תחתון, ואימון משלים שמחזיר תדירות של פעמיים לקבוצה.',
        days: [day('upper', UPPER_H, ['push', 'pull']), day('lower', LOWER_SQ, ['legs']),
          day('full', FULL_C, ['legs', 'pull', 'push'])],
      };
    }
    return {
      name: 'פול־באדי ×3',
      rationale: 'שלושה אימוני גוף מלא נותנים לכל קבוצת שריר שלוש הזדמנויות בשבוע — התדירות היא מה שמניע התקדמות בשלב הזה.',
      days: [day('fbA', FULL_A, ['legs', 'push', 'pull']), day('fbB', FULL_B, ['legs', 'push', 'pull']),
        day('fbC', FULL_C, ['legs', 'pull', 'push'])],
    };
  }
  if (days === 4) {
    return {
      name: 'עליון/תחתון ×2',
      rationale: 'ארבעה אימונים מאפשרים לפצל עליון ותחתון פעמיים — כל קבוצה מקבלת שני מפגשים איכותיים בשבוע.',
      days: [day('upperA', UPPER_H, ['push', 'pull']), day('lowerA', LOWER_SQ, ['legs']),
        day('upperB', UPPER_V, ['pull', 'push', 'shoulders']), day('lowerB', LOWER_HI, ['legs'])],
    };
  }
  if (days === 5) {
    return {
      name: 'דחיפה · משיכה · רגליים + עליון/תחתון',
      rationale: 'חמישה אימונים: שלושה ממוקדים ושניים רחבים, כדי שכל קבוצה עדיין תיפגש פעמיים בשבוע.',
      days: [day('push', PUSH_H, ['push', 'shoulders']), day('pull', PULL_V, ['pull', 'arms']),
        day('legs', LOWER_SQ, ['legs']), day('upper', UPPER_V, ['push', 'pull']),
        day('lower', LOWER_HI, ['legs'])],
    };
  }
  return {
    name: 'דחיפה · משיכה · רגליים ×2',
    rationale: 'שישה אימונים בפיצול דחיפה/משיכה/רגליים — נפח שבועי גבוה בלי אימון אחד ארוך מדי.',
    days: [day('pushA', PUSH_H, ['push']), day('pullA', PULL_V, ['pull']), day('legsA', LOWER_SQ, ['legs']),
      day('pushB', PUSH_V, ['push', 'shoulders']), day('pullB', PULL_H, ['pull', 'arms']),
      day('legsB', LOWER_HI, ['legs'])],
  };
}

/* Goal shaping, applied on top of the skeleton. */
function shape(d, goal, index, total) {
  const pats = d.patterns.slice();
  const hasLegs = pats.some((x) => x === 'squat' || x === 'hinge' || x === 'lunge');

  if (goal === 'sport') {
    // Explosive work goes first, while the nervous system is fresh.
    if (hasLegs) pats.unshift('plyo');
    // Accessory work is what gets cut to make room.
    const trim = pats.lastIndexOf('arms_biceps') >= 0 ? 'arms_biceps' : 'arms_triceps';
    const at = pats.indexOf(trim);
    if (at >= 0 && pats.length > 5) pats.splice(at, 1);
    pats.push('conditioning');
  } else if (goal === 'fatloss' || goal === 'fitness') {
    if (hasLegs && goal === 'fitness') pats.splice(Math.max(0, pats.length - 1), 0, 'carry');
    pats.push('conditioning');
  } else if (index === total - 1) {
    // Strength and hypertrophy still get one conditioning slot a week.
    pats.push('conditioning');
  }
  return Object.assign({}, d, { patterns: pats });
}

/**
 * The weekly split. `days.length === profile.daysPerWeek`, ids are stable ASCII,
 * `patterns` is the training order for that session.
 */
export function splitFor(profile) {
  const p = profile || {};
  const days = clampInt(p.daysPerWeek, 2, 6, 3);
  const goal = goalOf(p);
  const plan = plans(days, experienceOf(p), goal);
  const list = plan.days.slice(0, days).map((d, i) => shape(d, goal, i, days));
  return { name: plan.name, rationale: plan.rationale, days: list };
}
