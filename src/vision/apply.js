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
 * Pure functions over plain objects. No DOM, no network, no randomness.
 */

/* Which volume group each movement pattern feeds. The generator thinks in
   patterns; volume.js thinks in groups; this table is the only place the two
   vocabularies meet. */
const PATTERN_GROUP = {
  vertical_push: 'push',
  horizontal_push: 'push',
  vertical_pull: 'pull',
  horizontal_pull: 'pull',
  squat: 'legs',
  hinge: 'legs',
  lunge: 'legs',
  arms_biceps: 'arms',
  arms_triceps: 'arms',
  shoulders_lateral: 'shoulders',
  shoulders_rear: 'shoulders',
  core_flexion: 'core',
  core_antiextension: 'core',
  core_rotation: 'core',
  calf: 'calves',
  carry: 'core',
  conditioning: 'conditioning',
  plyo: 'conditioning',
  mobility: null,
};

const GROUPS = ['push', 'pull', 'legs', 'core', 'arms', 'shoulders', 'calves', 'conditioning'];

/* How hard the first, second and later emphases push. The first pick gets a
   real shove; the fifth gets a nudge. A flat bonus across five patterns is the
   same as no emphasis at all, only with more arithmetic. */
const EMPHASIS_STEPS = [1.35, 1.25, 1.18, 1.12, 1.08];
const DEEMPHASIS = 0.85;

/* Conditioning is asked for directly rather than inferred, because "how much
   cardio" is the one question where the gap between two photos really does
   give a clearer answer than the questionnaire does. */
const CONDITIONING_FACTOR = { none: 0.35, light: 0.8, moderate: 1.3, high: 1.8 };

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
 * emphasisFrom
 * ------------------------------------------------------------------ */

/**
 * The per-group multipliers a read implies. Always returns every group, always
 * finite, always inside [FLOOR, CAP] — volume.js multiplies straight through
 * this, so a hole or a NaN here would become a broken program.
 *
 * A read that is unusable, missing or malformed returns a neutral set, which
 * makes "no scan" and "a scan that failed" the same thing downstream.
 */
export function emphasisFrom(read) {
  const out = neutral();
  if (!read || read.usable !== true || !read.steer) return out;

  const weight = CONFIDENCE_WEIGHT[read.confidence] || CONFIDENCE_WEIGHT.low;

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

/**
 * The one-line "what the scan actually changed" the plan screen shows. Reads
 * the multipliers rather than the model's words, so it can never claim a change
 * that did not happen.
 */
export function emphasisSummary(emphasis) {
  const e = emphasis || neutral();
  const up = [];
  const down = [];
  for (const g of GROUPS) {
    if (e[g] >= 1.1) up.push(GROUP_HE[g]);
    else if (e[g] <= 0.92) down.push(GROUP_HE[g]);
  }
  if (!up.length && !down.length) return 'הסריקה לא שינתה את חלוקת הנפח — התוכנית שנבנתה כבר תואמת לפער בין התמונות.';
  const parts = [];
  if (up.length) parts.push(`יותר נפח ל${up.join(', ')}`);
  if (down.length) parts.push(`פחות ל${down.join(', ')}`);
  return `${parts.join(' · ')}. שאר הכללים — ציוד, פציעות, מסלול — לא השתנו.`;
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
  if (Number.isFinite(age) && age < 18) return true;
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
