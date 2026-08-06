/*
 * apply.js — turns a photo read into changes the engine can actually make.
 *
 * This is the boundary. On one side is a model's opinion about two pictures; on
 * the other is a program generator with equipment filters, injury filters, an
 * avoid list, a training track and volume ceilings. Nothing crosses except
 * numbers produced here, and the numbers are multipliers on weekly volume per
 * muscle group — never exercises, never loads, never a rule.
 *
 * Which means the read can shift where the week's work goes, and it cannot:
 *   - add equipment the user does not own
 *   - undo an injury exclusion
 *   - exceed the per-group ceiling in volume.js
 *   - change the training track the user chose
 *
 * Pure functions over plain objects. No DOM, no network, no randomness. The one
 * import is volume.js, which is arithmetic over a plain object and pulls in
 * nothing itself — emphasisSummary needs it to say what a read actually changed.
 */

import { withholdsFatLoss, stillDeveloping } from '../engine/age.js';

import { weeklyVolume } from '../engine/volume.js';
import { PATTERN_GROUP } from '../engine/generator.js';

/*
 * Which volume group each movement pattern feeds. The generator thinks in
 * patterns; volume.js thinks in groups; this is where the two vocabularies meet.
 *
 * Imported rather than restated. This file used to keep its own copy, and the
 * copies drifted in both directions at once: plyo was priced out of conditioning
 * here and out of legs in the generator, so emphasising jumps bought a longer
 * cardio block instead of a jump; mobility was funded by nothing here and by
 * core there, so asking for it did nothing. The generator's table is the one
 * that decides where a slot's sets actually come from, which makes it the only
 * one worth reading.
 */

const GROUPS = ['push', 'pull', 'legs', 'core', 'arms', 'shoulders', 'calves', 'conditioning'];

/* How hard the first, second and later emphases push. The first pick gets a
   real shove; the fifth gets a nudge. A flat bonus across five patterns is the
   same as no emphasis at all, only with more arithmetic. */
const EMPHASIS_STEPS = [1.35, 1.25, 1.18, 1.12, 1.08];
const DEEMPHASIS = 0.85;

/* Conditioning is asked for directly rather than inferred, because "how much
   cardio" is the one question where the gap between two photos really does
   give a clearer answer than the questionnaire does.
   'unchanged' is the neutral answer and has to map to exactly 1.0: every other
   value moves the block, so without a 1.0 the mere fact that a scan ran was
   enough to change cardio. An unrecognised value falls through to no factor at
   all, which is the same thing. */
const CONDITIONING_FACTOR = { unchanged: 1, none: 0.35, light: 0.8, moderate: 1.3, high: 1.8 };

/* A low-confidence read still says something, but it should not reshape a week
   as hard as a clear one. Everything is pulled back toward 1.0 in proportion. */
const CONFIDENCE_WEIGHT = { high: 1.0, medium: 0.7, low: 0.4 };

const FLOOR = 0.6;
const CAP = 1.5;

function neutral() {
  const out = {};
  for (const g of GROUPS) out[g] = 1;
  return out;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Pull a multiplier toward 1 by (1 - weight). weight 1 keeps it, 0 erases it. */
function temper(mult, weight) {
  return 1 + (mult - 1) * weight;
}

/* ------------------------------------------------------------------ *
 * How old the read is
 * ------------------------------------------------------------------ */

/*
 * A read is a photograph of a gap, and the training exists to close that gap.
 * Eight weeks of work is enough to move it; six months is enough that the photo
 * is a description of someone else. So the multipliers lose weight as the read
 * ages instead of steering forever off a picture from last winter.
 *
 * Only the steering decays. The verdict, the timeline and the notes are still
 * worth reading at six months — what expires is the standing to keep bending
 * this week's volume.
 */
const FRESH_DAYS = 56;    // 8 weeks: still the same body, full weight
const STALE_DAYS = 84;    // 12 weeks: the UI should start asking for a new photo
const SPENT_DAYS = 182;   // ~6 months: the read no longer moves any volume

/**
 * How old a read is and how much say it still has. Null when there is no read,
 * or no timestamp on it — and a read with no usable date keeps full weight
 * rather than losing it, because a scan that silently stopped working would be a
 * far harder failure to notice than one that worked a few weeks too long.
 *
 * `he` is empty while the read is fresh — there is nothing to tell the user
 * until there is something to do about it.
 */
export function readAge(read, now) {
  if (!read || typeof read !== 'object') return null;
  const at = Date.parse(read.at);
  if (!Number.isFinite(at)) return null;
  const days = Math.max(0, Math.floor(((now || new Date()).getTime() - at) / 86400000));
  const weeks = Math.round(days / 7);
  const weight = days <= FRESH_DAYS ? 1
    : days >= SPENT_DAYS ? 0
      : 1 - (days - FRESH_DAYS) / (SPENT_DAYS - FRESH_DAYS);

  let he = '';
  if (days >= SPENT_DAYS) {
    he = `הסריקה הזאת בת ${weeks} שבועות, והיא כבר לא מזיזה את חלוקת הנפח. `
      + 'תמונה חדשה תיתן קריאה של הפער כפי שהוא היום.';
  } else if (days >= STALE_DAYS) {
    he = `הסריקה הזאת בת ${weeks} שבועות. ככל שהיא מתיישנת המשקל שלה בתוכנית יורד — `
      + 'אם התאמנת מאז, תמונה חדשה שווה יותר מהקריאה הזאת.';
  }
  return { days, weeks, weight, stale: days >= STALE_DAYS, spent: days >= SPENT_DAYS, he };
}

/* ------------------------------------------------------------------ *
 * emphasisFrom
 * ------------------------------------------------------------------ */

/**
 * The per-group multipliers a read implies. Always returns every group, always
 * finite, always inside [FLOOR, CAP] — volume.js multiplies straight through
 * this, so a hole or a NaN here would become a broken program.
 *
 * A read that is unusable, missing or malformed returns a neutral set, which
 * makes "no scan" and "a scan that failed" the same thing downstream.
 *
 * `now` is only ever passed by tests; the app leaves it out.
 */
export function emphasisFrom(read, now) {
  const out = neutral();
  if (!read || read.usable !== true || !read.steer) return out;

  // Two things dilute a read: how much the photos supported it, and how long
  // ago they were taken. Both pull toward 1.0, so they multiply.
  const age = readAge(read, now);
  const weight = (CONFIDENCE_WEIGHT[read.confidence] || CONFIDENCE_WEIGHT.low)
    * (age ? age.weight : 1);

  const emphasise = Array.isArray(read.steer.emphasise) ? read.steer.emphasise : [];
  emphasise.forEach((pattern, i) => {
    const group = PATTERN_GROUP[pattern];
    if (!group) return;
    const step = EMPHASIS_STEPS[Math.min(i, EMPHASIS_STEPS.length - 1)];
    // Two emphasised patterns in one group compound, but gently — a request for
    // both pull patterns means "more back", not "double the back".
    out[group] *= 1 + (step - 1) * (out[group] > 1 ? 0.5 : 1);
  });

  for (const pattern of (Array.isArray(read.steer.deemphasise) ? read.steer.deemphasise : [])) {
    const group = PATTERN_GROUP[pattern];
    if (group) out[group] *= DEEMPHASIS;
  }

  const cond = CONDITIONING_FACTOR[read.steer.conditioning];
  if (cond) out.conditioning *= cond;

  // Posture drills are worth a small extra push toward the area, not a
  // restructure. A photo is a weak instrument for posture and the drills
  // themselves are harmless, so the size of the nudge matches the evidence.
  for (const item of (Array.isArray(read.posture) ? read.posture : [])) {
    const group = PATTERN_GROUP[item && item.drill];
    if (group) out[group] *= 1.08;
  }

  for (const g of GROUPS) {
    out[g] = clamp(temper(out[g], weight), FLOOR, CAP);
    if (!Number.isFinite(out[g])) out[g] = 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Human-readable summary
 * ------------------------------------------------------------------ */

const GROUP_HE = {
  push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', core: 'ליבה',
  arms: 'ידיים', shoulders: 'כתפיים', calves: 'שוקיים', conditioning: 'אירובי',
};

const PATTERN_HE = {
  vertical_pull: 'משיכה אנכית', horizontal_pull: 'חתירה',
  vertical_push: 'דחיפה מעל הראש', horizontal_push: 'דחיפה אופקית',
  squat: 'סקוואט', hinge: 'צירי ירך', lunge: 'מכרעים',
  arms_biceps: 'יד קדמית', arms_triceps: 'יד אחורית',
  shoulders_lateral: 'כתף צדדית', shoulders_rear: 'כתף אחורית',
  core_flexion: 'כיפוף ליבה', core_antiextension: 'ייצוב ליבה', core_rotation: 'סיבוב ליבה',
  calf: 'שוקיים', carry: 'נשיאות', conditioning: 'אירובי', plyo: 'קפיצות', mobility: 'ניידות',
};

export function patternHe(pattern) {
  return PATTERN_HE[pattern] || pattern;
}

export function groupHe(group) {
  return GROUP_HE[group] || group;
}

const NOTHING_MOVED = 'הסריקה לא שינתה את חלוקת הנפח — התוכנית שנבנתה כבר תואמת לפער בין התמונות.';

/* The same threshold volume.js uses to decide whether a scan counts as having
   steered anything, so the sentence and the volume note never disagree. */
const ASKED = 0.05;

/**
 * The one-line "what the scan actually changed" the plan screen shows.
 *
 * Given a profile it is MEASURED: the same week is costed twice, once with the
 * emphasis neutralised and once with it applied, and only groups whose whole-set
 * count actually moved are named. This used to read the multipliers instead,
 * under a comment claiming that made it impossible to overstate anything, and
 * the truth was the reverse. volume.js applies the multipliers, then clips each
 * group at its ceiling, rescales the week to the time available, rounds to whole
 * sets and drops the small groups left under three. A 1.3 on conditioning
 * survives none of that in a two-set hypertrophy block, and was announced as
 * "more cardio" to a plan that ends up with no cardio at all.
 *
 * Without a profile there is no week to cost, so it says what the read ASKED
 * for and says that is what it is. That is weaker, and it is true — which the
 * definite version, computed against some average stranger's week, would not be.
 */
export function emphasisSummary(emphasis, profile) {
  const e = emphasis && typeof emphasis === 'object' ? emphasis : neutral();
  const up = [];
  const down = [];

  if (profile && typeof profile === 'object') {
    const before = weeklyVolume(Object.assign({}, profile, { emphasis: neutral() }));
    const after = weeklyVolume(Object.assign({}, profile, { emphasis: e }));
    for (const g of GROUPS) {
      const moved = after[g] - before[g];
      if (moved > 0) up.push(GROUP_HE[g]);
      else if (moved < 0) down.push(GROUP_HE[g]);
    }
    if (!up.length && !down.length) return NOTHING_MOVED;
    const parts = [];
    if (up.length) parts.push(`יותר נפח ל${up.join(', ')}`);
    if (down.length) parts.push(`פחות ל${down.join(', ')}`);
    return `${parts.join(' · ')}. שאר הכללים — ציוד, פציעות, מסלול — לא השתנו.`;
  }

  for (const g of GROUPS) {
    if (e[g] > 1 + ASKED) up.push(GROUP_HE[g]);
    else if (e[g] < 1 - ASKED) down.push(GROUP_HE[g]);
  }
  if (!up.length && !down.length) return NOTHING_MOVED;
  const parts = [];
  if (up.length) parts.push(`יותר נפח ל${up.join(', ')}`);
  if (down.length) parts.push(`פחות ל${down.join(', ')}`);
  return `הסריקה ביקשה ${parts.join(' · ')}. כמה מזה נכנס בפועל נקבע מול התקרות והזמן שיש לך.`;
}

/* ------------------------------------------------------------------ *
 * Realism
 * ------------------------------------------------------------------ */

const BAND_HE = {
  realistic: { label: 'ריאלי', tone: 'good' },
  tight: { label: 'אפשרי אבל צפוף', tone: 'warn' },
  needs_more_time: { label: 'צריך יותר זמן', tone: 'warn' },
  not_reachable_naturally: { label: 'לא בר־השגה בדרך טבעית', tone: 'bad' },
};

export function bandHe(band) {
  return BAND_HE[band] || BAND_HE.tight;
}

const CONFIDENCE_HE = { high: 'קריאה ברורה', medium: 'קריאה חלקית', low: 'קריאה מוגבלת' };

export function confidenceHe(confidence) {
  return CONFIDENCE_HE[confidence] || CONFIDENCE_HE.low;
}

/* "carrying_weight" is a neutral structural bucket in the schema, and the system
   prompt spends a rule on not commenting how someone looks. Rendering it as
   "נושא משקל עודף" — carrying EXCESS weight — added that judgement downstream of
   the model, where no amount of prompt work could remove it. */
const BUILD_HE = {
  lean: 'רזה', average: 'ממוצע', carrying_weight: 'מבנה מלא יותר',
  muscular: 'שרירי', unclear: 'לא ברור מהתמונה',
};
const TRAINING_AGE_HE = {
  untrained: 'ללא סימני אימון קבוע', some_training: 'סימני אימון חלקיים',
  clearly_trained: 'מתאמן בבירור', unclear: 'לא ברור מהתמונה',
};

export function buildHe(build) { return BUILD_HE[build] || BUILD_HE.unclear; }
export function trainingAgeHe(age) { return TRAINING_AGE_HE[age] || TRAINING_AGE_HE.unclear; }

/**
 * How the scan's timeline compares with the date the user picked. Returns null
 * when there is nothing to say — no read, no months, no target date.
 */
/*
 * The sentence itself. The rule behind it — who counts as still developing, and
 * why — lives in engine/age.js with every other age threshold, so two screens
 * cannot disagree about the same person.
 */
export function growthNote(profile) {
  if (!stillDeveloping(profile)) return null;
  const age = Number(profile.age);
  return {
    age,
    he: `בגיל ${age} חלק מהפער בין שתי התמונות ייסגר בלי קשר לאימון — רוחב המסגרת, עומק בית החזה `
      + 'ומסת השריר ממשיכים להתפתח לתוך שנות העשרים המוקדמות. '
      + 'זה עובד לשני הכיוונים: היעד קרוב יותר ממה שהאימון לבדו מסביר, וגם — אל תזקוף לזכות התוכנית '
      + 'את מה שהגיל עושה ממילא.',
  };
}

export function timelineGap(read, profile) {
  if (!read || read.usable !== true || !read.realism) return null;
  const months = read.realism.honestMonths;
  const p = profile || {};
  const d = new Date(p.targetDate);
  if (isNaN(d)) return null;
  const monthsToTarget = Math.max(0, Math.round((d - new Date()) / (30.44 * 86400000)));

  if (months === null) {
    return {
      kind: 'unreachable',
      monthsToTarget,
      honestMonths: null,
      he: 'הסריקה אומרת שהגוף שבתמונה השנייה לא מגיע בדרך טבעית, בשום לוח זמנים. '
        + 'זה לא אומר שאין לאן להתקדם — זה אומר שהיעד הזה הוא לא סרגל טוב למדוד בו את עצמך.',
    };
  }
  if (months <= monthsToTarget) {
    return {
      kind: 'fits',
      monthsToTarget,
      honestMonths: months,
      he: `הסריקה נותנת לזה ${months} חודשים, ויש לך ${monthsToTarget}. היעד והתאריך מסתדרים.`,
    };
  }
  return {
    kind: 'short',
    monthsToTarget,
    honestMonths: months,
    he: `הסריקה נותנת לזה ${months} חודשים, ונתת ${monthsToTarget}. `
      + `הפער הוא ${months - monthsToTarget} חודשים — אפשר להזיז את התאריך, או להקטין את היעד ולהשאיר אותו.`,
  };
}

/* ------------------------------------------------------------------ *
 * Conflict with the stated goal
 * ------------------------------------------------------------------ */

const GOAL_HE = {
  fatloss: 'ירידה בשומן', muscle: 'עלייה במסה', strength: 'כוח', fitness: 'כושר כללי',
};

/* Duplicated rather than imported: apply.js is the pure layer the engine and the
   audits load, and it must not pull in the network client's dependency chain to
   answer a question about two numbers. */
function fatLossDisallowed(profile) {
  const age = Number(profile && profile.age);
  if (withholdsFatLoss({ age })) return true;
  const h = Number(profile && profile.heightCm);
  const w = Number(profile && profile.weightKg);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0) return false;
  return w / ((h / 100) ** 2) < 18.5;
}

/**
 * When the photos point at a different goal than the one chosen, this is the
 * suggestion the UI offers. It is only ever a suggestion: the goal is not
 * changed without the user pressing the button, because a program that quietly
 * switches from building to cutting because of a photograph is a program that
 * betrayed the person using it.
 */
export function goalConflict(read, profile) {
  if (!read || read.usable !== true || !read.steer || !read.steer.goal) return null;
  const p = profile || {};
  if (read.steer.goal === p.goal) return null;
  // A sport goal is a fact about the user's life, not a physique read. The
  // photos have no standing to argue with it.
  if (p.goal === 'sport') return null;
  /*
   * Second layer. normalizeRead already refuses to carry a fat-loss steer for a
   * minor or an underweight profile, so this should never fire — which is the
   * point of having it. The failure it guards against is an app assembling
   * restriction and cardio for someone already under the line, in two taps.
   */
  if (read.steer.goal === 'fatloss' && fatLossDisallowed(p)) return null;
  return {
    from: p.goal,
    to: read.steer.goal,
    fromHe: GOAL_HE[p.goal] || p.goal,
    toHe: GOAL_HE[read.steer.goal] || read.steer.goal,
    note: read.steer.goalNote || '',
  };
}

export { GROUPS, PATTERN_GROUP };
