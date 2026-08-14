/*
 * levels.js — the two ladders in the app, and the arithmetic behind both.
 *
 * There are two independent notions of "level" here and conflating them is the
 * fastest way to make progression feel arbitrary:
 *
 *   Global level  — one number for the account, driven by total XP. It only
 *                   ever goes up, and it is the cheap dopamine.
 *   Skill level   — 0..5 per skill, and it is *not* purely XP-driven. Grinding
 *                   a quiz twenty times must not produce a "Mastered" badge, so
 *                   a skill level is the minimum of what your XP has earned and
 *                   what your demonstrated mastery supports. See levelFor().
 *
 * Everything in this file is pure. No storage, no DOM, no clock.
 */

/* ------------------------------------------------------------------ *
 * Global level
 * ------------------------------------------------------------------ */

/*
 * Cumulative XP required to *reach* global level n.
 *
 * The brief fixed four points: L1=0, L2=100, L3=250, L4=450 — gaps of 100,
 * 150, 200, i.e. each level costs 50 XP more than the last. That is exactly a
 * quadratic, so rather than ship a lookup table that stops at some arbitrary
 * level, we use the closed form it implies:
 *
 *     xpForLevel(n) = 25n² + 25n − 50
 *
 * which reproduces all four given points and keeps rising forever. The growth
 * matters: at L10 the account has spent 2,700 XP, at L25 it is 16,200, at L50
 * it is 63,700. A linear curve would have made level 40 a Tuesday.
 */
export function xpForLevel(n) {
  if (n <= 1) return 0;
  return 25 * n * n + 25 * n - 50;
}

/*
 * Inverse of the above, solved rather than looped, so that a 250,000 XP
 * account costs the same to render as a new one.
 *
 *   25n² + 25n − 50 = x   →   n = (−1 + √(9 + 4x/25)) / 2
 */
export function levelForXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.max(1, Math.floor((-1 + Math.sqrt(9 + (4 * x) / 25)) / 2));
}

/*
 * Everything the UI needs to draw a global-level bar, in one call, so no
 * component has to re-derive "how far through this level am I" and get the
 * edge case at level 1 subtly wrong.
 */
export function globalProgress(xp) {
  const total = Math.max(0, Number(xp) || 0);
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = ceiling - floor;
  return {
    level,
    totalXp: total,
    intoLevel: total - floor,
    levelSpan: span,
    toNextLevel: ceiling - total,
    /* Guarded because span is 0 only if the curve is ever made flat; a NaN
     * width silently collapses the progress bar rather than throwing. */
    fraction: span > 0 ? Math.min(1, (total - floor) / span) : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Skill level
 * ------------------------------------------------------------------ */

export const SKILL_LEVELS = [
  { level: 0, key: 'locked', name: 'Locked', blurb: 'Not open yet.' },
  { level: 1, key: 'beginner', name: 'Beginner', blurb: 'You know what it is and can follow along.' },
  { level: 2, key: 'familiar', name: 'Familiar', blurb: 'You can use it with notes or help.' },
  { level: 3, key: 'competent', name: 'Competent', blurb: 'You can use it on your own.' },
  { level: 4, key: 'advanced', name: 'Advanced', blurb: 'You use it fluently and can explain it.' },
  { level: 5, key: 'mastered', name: 'Mastered', blurb: 'You have proven it under pressure.' },
];

export function skillLevelMeta(level) {
  return SKILL_LEVELS[Math.max(0, Math.min(5, Math.round(Number(level) || 0)))];
}

/*
 * Skill-level thresholds, as a fraction of what the skill can yield.
 *
 * See `skillCapacity` in xp.js for why these are fractions rather than
 * absolute XP figures. The shape: a quarter of the skill's content for level
 * 2, half for 3, three quarters for 4, and all of it for 5.
 *
 * The consequence is worth stating, because it is the intended design. Passing
 * every activity once at 100% lands exactly on the level-5 XP threshold;
 * passing everything at a more realistic 85% lands at level 4 and needs one
 * more good attempt to tip over. Combined with the mastery gate below, that
 * means "Mastered" requires doing all of a skill's work and demonstrating it
 * well — which is what the word should mean.
 */
const LEVEL_FRACTION = [0, 0, 0.25, 0.5, 0.75, 1];

export function xpForSkillLevel(level, capacity = 0) {
  const n = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  return Math.round(LEVEL_FRACTION[n] * Math.max(0, Number(capacity) || 0));
}

/*
 * The mastery score each level demands. This is the half of the gate that XP
 * cannot buy: you can accumulate 900 XP on a skill by replaying its cheapest
 * activity, but you cannot reach 85 mastery without assessments actually
 * going well, because mastery is computed from graded work (see mastery.js).
 */
const MASTERY_FOR_SKILL_LEVEL = [0, 0, 25, 45, 65, 85];

export function masteryForSkillLevel(level) {
  return MASTERY_FOR_SKILL_LEVEL[Math.max(0, Math.min(5, Math.round(Number(level) || 0)))];
}

/*
 * The rule that keeps the whole progression honest.
 *
 * A skill's level is the highest level for which the learner has BOTH the XP
 * and the mastery. Taking the minimum of the two ladders — rather than an
 * average, or XP alone — is what makes "Mastered" mean something: no amount of
 * repetition moves you past level 2 if your assessments sit at 30%, and a
 * single lucky assessment does not vault you to 5 without the practice behind
 * it.
 *
 * `started` distinguishes level 0 (locked / never opened) from level 1: simply
 * beginning a skill earns level 1, because "I have started this" is a real
 * state the tree needs to draw.
 */
export function levelFor({ xp = 0, masteryScore = 0, capacity = 0, started = false } = {}) {
  let level = started ? 1 : 0;

  /* A skill with nothing in it has nothing to earn. Without this guard every
   * threshold is zero and an empty skill reports level 5 the moment it is
   * opened — which is exactly the fake progress the app exists to avoid. */
  if (!(capacity > 0)) return level;

  for (let n = 2; n <= 5; n += 1) {
    if (xp >= xpForSkillLevel(n, capacity) && masteryScore >= masteryForSkillLevel(n)) level = n;
    else break;
  }
  return level;
}

/*
 * Progress toward the *next* skill level, reported per ladder so the UI can
 * say which one is actually holding you back. "370 / 500 XP" is useful;
 * "you are 20 mastery points short" is more useful, and without this split the
 * panel can only show the first.
 */
export function skillProgress({ xp = 0, masteryScore = 0, capacity = 0, started = false } = {}) {
  const level = levelFor({ xp, masteryScore, capacity, started });
  const next = Math.min(5, level + 1);
  const atCap = level >= 5;

  const xpFloor = xpForSkillLevel(level, capacity);
  const xpCeiling = xpForSkillLevel(next, capacity);
  const xpSpan = xpCeiling - xpFloor;
  const masteryCeiling = masteryForSkillLevel(next);

  const xpFraction = atCap || xpSpan <= 0 ? 1 : Math.min(1, (xp - xpFloor) / xpSpan);
  const masteryFraction = atCap || masteryCeiling <= 0 ? 1 : Math.min(1, masteryScore / masteryCeiling);

  return {
    level,
    nextLevel: atCap ? null : next,
    atCap,
    xp,
    xpFloor,
    xpCeiling,
    xpIntoLevel: Math.max(0, xp - xpFloor),
    xpNeeded: Math.max(0, xpCeiling - xp),
    xpFraction,
    masteryScore,
    masteryCeiling,
    masteryNeeded: Math.max(0, masteryCeiling - masteryScore),
    masteryFraction,
    /* The ring in the tree shows the binding constraint, not an average — an
     * average would sit at a comfortable 70% while mastery quietly blocks. */
    fraction: atCap ? 1 : Math.min(xpFraction, masteryFraction),
    blockedBy: atCap ? null : (xpFraction <= masteryFraction ? 'xp' : 'mastery'),
  };
}
