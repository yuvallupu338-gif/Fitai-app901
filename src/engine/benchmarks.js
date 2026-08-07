/*
 * benchmarks.js — turning what somebody can already do into what they get.
 *
 * The questionnaire asks for four numbers: push-ups in a row, pull-ups in a
 * row, a plank in seconds, dips in a row. Until now nothing read them. Declaring
 * 0 push-ups and declaring 60 produced byte-identical programmes, because
 * selection looked only at the experience tier somebody ticked.
 *
 * That is worse than it sounds, because the tier ladder has no rung between
 * "under 3 months" and "a year or more". Nine months of honest training leaves
 * a trainee nothing truthful to select, so they stay on "beginner" — and a
 * fifteen-year-old who worked up to 33 push-ups was opened on 4×6-10 KNEE
 * push-ups, which is the app telling somebody it has not been paying attention.
 *
 * A rep count is better evidence than a self-assessment. It is a specific claim
 * about a specific movement, it is easy to answer honestly, and it maps onto the
 * level ladder this library already has. So it is read as evidence, per pattern,
 * and it overrides the tier for that pattern alone — 40 push-ups says nothing
 * about somebody's pull-ups.
 *
 * The thresholds are the standard calisthenics ones and are deliberately not
 * generous. Each is the point at which the NEXT tier is reasonable to start
 * training, not the point at which the current one is mastered — the trainee
 * still gets "קל לי" if the app has aimed low, and aiming low is the mistake
 * that costs a session rather than an injury.
 *
 * Pure arithmetic over a profile: no DOM, no imports, no side effects.
 */

/*
 * reps -> level, per movement. Read as: at or above this many, level N is a
 * reasonable place to be working.
 *
 * Push-ups and dips both feed pushing, and they disagree often — somebody with
 * strong dips and weak push-ups is common. The higher of the two wins, because
 * the pattern pool is shared and the trainee has demonstrated the harder thing.
 */
const LADDERS = {
  pushups: [[50, 5], [30, 4], [15, 3], [6, 2], [0, 1]],
  dips: [[30, 5], [20, 4], [10, 3], [5, 2], [0, 1]],
  pullups: [[15, 5], [10, 4], [4, 3], [1, 2], [0, 1]],
  plankSec: [[180, 5], [120, 4], [60, 3], [30, 2], [0, 1]],
};

/* Which declared number speaks for which movement pattern. */
const SPEAKS_FOR = {
  horizontal_push: ['pushups', 'dips'],
  vertical_push: ['pushups', 'dips'],
  arms_triceps: ['pushups', 'dips'],
  vertical_pull: ['pullups'],
  horizontal_pull: ['pullups'],
  arms_biceps: ['pullups'],
  core_antiextension: ['plankSec'],
  core_flexion: ['plankSec'],
};

function repsOf(profile, key) {
  const bm = (profile && profile.benchmarks) || {};
  const raw = bm[key];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function levelFrom(key, reps) {
  for (const [at, level] of LADDERS[key] || []) {
    if (reps >= at) return level;
  }
  return null;
}

/**
 * The level this profile has demonstrated for a pattern, or null when they did
 * not answer the question that speaks for it.
 *
 * Null and zero are different answers and are kept different: skipping the
 * question means "no evidence, use the tier", while typing 0 is evidence, and
 * evidence that somebody is at the bottom of the ladder is worth as much as
 * evidence they are at the top.
 */
export function demonstratedLevel(profile, pattern) {
  const keys = SPEAKS_FOR[pattern];
  if (!keys) return null;
  let best = null;
  for (const key of keys) {
    const reps = repsOf(profile, key);
    if (reps === null) continue;
    const level = levelFrom(key, reps);
    if (level !== null && (best === null || level > best)) best = level;
  }
  return best;
}

/** True when the trainee answered at least one benchmark question. */
export function hasBenchmarks(profile) {
  return Object.keys(LADDERS).some((k) => repsOf(profile, k) !== null);
}

/**
 * A short Hebrew line naming what the app read, for the plan's own notes.
 *
 * The app is about to give somebody harder work than the box they ticked would
 * imply, and it should say why rather than let it look like a mistake.
 */
export function benchmarkNote(profile) {
  const parts = [];
  const push = repsOf(profile, 'pushups');
  const dips = repsOf(profile, 'dips');
  const pull = repsOf(profile, 'pullups');
  const plank = repsOf(profile, 'plankSec');
  if (push !== null) parts.push(`${push} שכיבות סמיכה`);
  if (dips !== null) parts.push(`${dips} מקבילים`);
  if (pull !== null) parts.push(`${pull} מתח`);
  if (plank !== null) parts.push(`פלאנק ${plank} שנ׳`);
  if (!parts.length) return '';
  return `רמת התרגילים נקבעה מהמספרים שדיווחת — ${parts.join(', ')} — ולא רק מהוותק שסימנת. `
    + 'אם משהו יצא קל או קשה מדי, הכפתורים בכרטיס מזיזים אותו רמה.';
}
