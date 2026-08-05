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

/* The sleep question is asked in half hours, so a figure quoted back at the
   user has to survive the trip: 6.5 must come back as "6.5", not as "7". */
function hoursHe(v) {
  const n = num(v, 0);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function goalOf(profile) {
  return GOAL_BASE[profile && profile.goal] ? profile.goal : 'fitness';
}

function experienceOf(profile) {
  const e = profile && profile.experience;
  return CEILING[e] ? e : 'beginner';
}

/*
 * Per-group multipliers from the photo scan, if there was one.
 *
 * Read defensively and inline rather than imported, so this file keeps its one
 * real property: arithmetic over a plain object, with nothing else in scope.
 * The values were already clamped where they were produced; they are clamped
 * again here because a profile can also arrive from an imported JSON file.
 */
function emphasisOf(profile) {
  const src = profile && profile.emphasis;
  const out = {};
  for (const g of GROUPS) {
    const v = src ? Number(src[g]) : 1;
    out[g] = Number.isFinite(v) ? Math.max(0.6, Math.min(1.5, v)) : 1;
  }
  return out;
}

/** True when the scan actually moved something, worth a sentence in the note. */
function emphasisActive(emph) {
  return GROUPS.some((g) => Math.abs(emph[g] - 1) > 0.05);
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
    // `sleep` rides along because the note quotes it: read twice, the note and
    // the factor it explains can disagree, and the user only sees the note.
    experience, frequency, session, rest, load, years, dense, sleep,
    total: experience * frequency * session * rest * load * years * dense,
  };
}

/* ------------------------------------------------------------------ *
 * Sharing a fixed number of sets out between the groups
 * ------------------------------------------------------------------ */

/*
 * Upper bound per group, as one table instead of a run of Math.min calls.
 * Every step that moves sets around reads this, because the ceilings used to
 * be stamped on once in the middle of the pipeline and the later re-spreads
 * walked straight past them — a five-day fat-loss week could finish with 18
 * sets of conditioning against a cap of 14.
 */
function ceilingsFor(exp) {
  const c = CEILING[exp];
  const caps = {
    core: 14,
    arms: Math.round(c * 0.65),      // accessory work never outgrows the compounds
    shoulders: Math.round(c * 0.6),
    calves: 8,
    conditioning: 14,
  };
  for (const g of MAJORS) caps[g] = c;
  return caps;
}

const NO_FLOOR = { push: 0, pull: 0, legs: 0, core: 0, arms: 0, shoulders: 0, calves: 0, conditioning: 0 };

/**
 * Hand out exactly `total` sets in proportion to `weights`, nobody above its
 * ceiling and nobody below its floor.
 *
 * The spill is the whole point. A group already sitting on its ceiling cannot
 * take its share, and the sets it turns down have to land somewhere or the week
 * silently shrinks — which is how emphasising a capped group used to cost the
 * rest of the week 39 sets without adding one to the group that was asked for.
 * A floor works the same way in reverse: what it takes, it takes from the
 * groups still free to move rather than out of the total.
 *
 * Note that the bounds are a CLAMP on each group's share, not a reservation off
 * the top. Handing every group its floor first and sharing only the remainder
 * would flatten the week — the small groups would come out of a 79-set fat-loss
 * plan with 5.6 sets of calves against 13 of pushing, where the proportions ask
 * for 3.6 against 14.4.
 */
function distribute(weights, total, caps, floors) {
  const out = {};
  let open = [];
  let left = total;
  for (const g of GROUPS) {
    if (weights[g] > 0) open.push(g);
    else { out[g] = Math.min(floors[g], caps[g]); left -= out[g]; }
  }
  // Every pass but the last pins at least one group to a bound, so the number
  // of groups bounds the passes.
  for (let pass = 0; pass < GROUPS.length && open.length; pass++) {
    const wSum = open.reduce((n, g) => n + weights[g], 0);
    if (wSum <= 0) break;
    const next = [];
    let pinned = 0;
    for (const g of open) {
      const share = left * (weights[g] / wSum);
      if (share > caps[g]) { out[g] = caps[g]; pinned += out[g]; } else if (share < floors[g]) {
        out[g] = Math.min(floors[g], caps[g]);
        pinned += out[g];
      } else { out[g] = share; next.push(g); }
    }
    if (next.length === open.length) break;   // nothing hit a bound: settled
    left -= pinned;
    open = next;
  }
  return out;
}

/** Whole sets, each inside its own floor and ceiling. */
function roundSets(vals, caps, floors) {
  const out = {};
  for (const g of GROUPS) out[g] = Math.max(floors[g], Math.min(Math.round(vals[g]), caps[g]));
  return out;
}

/*
 * The same, but the parts still add up to `total`.
 *
 * Rounding eight numbers one at a time misses their sum by a set or three in
 * either direction. Normally nobody would care; here the total is the one
 * number the note promises the scan did not move, so the difference is settled
 * against the fractions rather than left where it fell — the biggest fraction
 * takes the leftover set, the smallest gives one back.
 */
function roundToTotal(vals, total, caps, floors) {
  const out = roundSets(vals, caps, floors);
  const byFraction = GROUPS.filter((g) => out[g] > 0)
    .sort((a, b) => (vals[b] - out[b]) - (vals[a] - out[a]));
  let left = total - GROUPS.reduce((n, g) => n + out[g], 0);
  for (let pass = 0; left !== 0 && pass < GROUPS.length; pass++) {
    const order = left > 0 ? byFraction : byFraction.slice().reverse();
    let moved = false;
    for (const g of order) {
      if (left === 0) break;
      if (left > 0 && out[g] < caps[g]) { out[g] += 1; left -= 1; moved = true; }
      if (left < 0 && out[g] > floors[g]) { out[g] -= 1; left += 1; moved = true; }
    }
    // Floors and ceilings outrank the total: if the week cannot be made to add
    // up without breaking one, it stops trying rather than breaking one.
    if (!moved) break;
  }
  return out;
}

/*
 * Which groups the week trains at all, and the least each of them may hold.
 *
 * Under 3 sets a week is not training, it is decoration: those groups are
 * dropped and their sets re-spent on the ones that survived — in a 30-minute
 * full-body session the compounds carry the arms anyway.
 *
 * The list is read off the NEUTRAL week, in both directions.
 *
 * Downward, because trimming is not dropping: a group the week did train keeps
 * its place at that 3-set floor however hard the scan leans away from it, and
 * "a bit less biceps" turning into no biceps at all is a far bigger edit than
 * the 0.85 it came from — with nothing in the UI to show the user the
 * difference.
 *
 * Upward, because whether a group fits in the week at all is a fact about the
 * clock, not about the photographs. Letting the steered numbers vote here read
 * badly in practice: a capped emphasis on legs would spill a couple of loose
 * sets onto calves, tip them over the 3-set bar, and answer "more squatting"
 * with a calf exercise the read never asked for.
 */
function survivors(shaped, base) {
  const floors = {};
  const weights = {};
  for (const g of GROUPS) {
    const keep = SMALL.indexOf(g) < 0 || base[g] >= 3;
    floors[g] = keep ? (g === 'core' ? 2 : 3) : 0;
    // A kept group needs a non-zero weight even when the scan starved it, or
    // the floor would be all it ever gets back.
    weights[g] = keep ? Math.max(shaped[g], 0.01) : 0;
  }
  return { floors, weights };
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
  const caps = ceilingsFor(exp);

  // The neutral week: the goal baseline scaled by recovery, held under the
  // physiological ceilings. This is computed even when a scan is attached,
  // because it is what the scan is allowed to rearrange and nothing more.
  const base = {};
  for (const g of GROUPS) base[g] = Math.min(GOAL_BASE[goal][g] * f.total, caps[g]);

  // What the week can actually hold: working sets that fit in the main blocks,
  // and never more variety than the session has room for.
  const perSession = Math.min(budget.mainMin / MIN_PER_SET[goal], budget.maxSlots * 3.0);
  const capacity = perSession * days;

  let sum = GROUPS.reduce((n, g) => n + base[g], 0);
  const timeBound = sum > capacity;
  if (timeBound && sum > 0) {
    const k = capacity / sum;
    for (const g of GROUPS) base[g] *= k;
    sum = capacity;
  } else if (sum < capacity * 0.82) {
    // Long sessions, modest target: spend some of the spare time, but stay
    // under the ceilings — extra time is worth more as rest than as sets.
    const k = Math.min(1.3, (capacity * 0.85) / Math.max(1, sum));
    for (const g of GROUPS) base[g] = Math.min(base[g] * k, caps[g]);
    sum = GROUPS.reduce((n, g) => n + base[g], 0);
  }

  /*
   * The scan biases the DISTRIBUTION only — a photo can argue about where the
   * week's sets go, and it has no standing to argue about how many a body
   * recovers from or how many fit in forty minutes.
   *
   * So the multipliers are weights inside a fixed pool, not a scale on the way
   * in. Scaling first was self-defeating: a group already on its ceiling could
   * not rise however hard the photo pushed, but its inflated number still swole
   * the sum, and the fill-to-capacity factor that followed shrank every other
   * group to pay for sets nobody ever received. Redistributing spends the
   * neutral week's own sum instead, and whatever a ceiling refuses spills onto
   * the groups that can still take it.
   */
  const emph = emphasisOf(p);
  const emphasised = emphasisActive(emph);
  let shaped = base;
  if (emphasised) {
    const weights = {};
    for (const g of GROUPS) weights[g] = base[g] * emph[g];
    shaped = distribute(weights, sum, caps, NO_FLOOR);
  }

  const kept = survivors(shaped, base);
  const out = distribute(kept.weights, sum, caps, kept.floors);

  // The neutral week is rounded on its own terms; a steered week is rounded to
  // the total the neutral one came to. That equality is the sentence the note
  // says out loud, so it is enforced here rather than hoped for — see
  // roundToTotal for what happens when a floor makes it impossible.
  let vol;
  let moved = false;
  if (emphasised) {
    const flat = survivors(base, base);
    const neutral = roundSets(distribute(flat.weights, sum, caps, flat.floors), caps, flat.floors);
    vol = roundToTotal(out, GROUPS.reduce((n, g) => n + neutral[g], 0), caps, kept.floors);
    // A scan that leans on a group already sitting on its ceiling, in a week
    // where the groups it would take from are on theirs too, has nowhere to
    // move sets to and correctly changes nothing. The note is keyed on this
    // rather than on the multipliers, so it cannot announce an effect that the
    // arithmetic refused to produce.
    moved = GROUPS.some((g) => vol[g] !== neutral[g]);
  } else {
    vol = roundSets(out, caps, kept.floors);
  }

  vol.total = GROUPS.reduce((n, g) => n + vol[g], 0);
  vol.emphasised = emphasised;
  vol.note = volumeNote(vol, {
    goal, exp, days, minutes, timeBound, factors: f, moved,
  });
  return vol;
}

/* The profile is deliberately not a parameter: every number this sentence
   quotes has to be one the engine actually used, so they all arrive through
   `vol` and `ctx` and there is no second reading of the raw answers to drift
   away from the first. */
function volumeNote(vol, ctx) {
  const head = `${GOAL_HE[ctx.goal]} ב־${ctx.days} אימונים של ${ctx.minutes} דק׳: `
    + `${vol.total} סטים עובדים בשבוע, ${vol.push} לדחיפה, ${vol.pull} למשיכה ו־${vol.legs} לרגליים`;

  let why;
  if (ctx.timeBound) {
    why = 'זה מה שבאמת נכנס בזמן שיש, וקיצור מנוחות מעבר לזה כבר פוגע באיכות של כל סט';
  } else if (ctx.factors.rest < 1) {
    // The figure has to be the one the user actually typed. The question is
    // asked in half hours, so rounding 6.5 up to "7 שעות" both quotes them a
    // number they never gave and names the very value that would NOT have cost
    // them any volume — the rule it is explaining turns over at 7.
    why = `הורדתי נפח כי ${hoursHe(ctx.factors.sleep)} שעות שינה לא מספיקות להתאושש מיותר`;
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

  // The scan gets a sentence of its own instead of taking the one that explains
  // the number in the head. Both are true at the same time — the week is the
  // size the clock and the recovery allow, AND the split inside it moved — and
  // whichever of the two is dropped, the user is left holding half an answer to
  // "why does it say this". The clause with the dash stays glued to the head
  // because it is what makes that number make sense.
  const scan = ctx.moved
    ? ' הסריקה הזיזה את החלוקה בין הקבוצות לפי הפער שמצאה בין שתי התמונות, בלי לשנות את הסכום השבועי.'
    : '';
  return `${head} — ${why}.${scan}`;
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
    // A loaded carry is the cheapest full-body finisher there is.
    if (hasLegs && goal === 'fitness') pats.push('carry');
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
