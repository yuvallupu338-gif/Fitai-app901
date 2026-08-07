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
  /*
   * Legs, and this ladder stops at 4 on purpose.
   *
   * Bodyweight squats are the easiest leg movement in the library and they are
   * an endurance test long before they are a strength one: 90 in a row is a
   * good engine, not a strong squat. The first version of this ran to 5 and the
   * measurement caught what that meant — a self-declared BEGINNER who typed 90
   * was prescribed the nordic curl, which is the hardest hamstring movement
   * that exists and which most trained athletes cannot do one of.
   *
   * Level 5 down here is the pistol squat and the full nordic curl. Those are
   * skill work with their own progressions, and no count of the easiest
   * movement in the pattern is evidence for them. The trainee who really is
   * there gets there through "קל לי", which is a claim about the actual
   * exercise in front of them rather than an extrapolation from a different one.
   *
   * A rep count is a weak instrument here compared to what it is for pull-ups.
   * It is still enormously better than what it replaces, which was nothing at
   * all: legs came from the experience tier and never moved again.
   */
  squats: [[60, 4], [40, 3], [20, 2], [0, 1]],
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
  /*
   * The three leg patterns, which had no entry here at all — the reason half
   * the body never progressed. A squat count speaks for all three because they
   * share a demand: the knee-dominant and hip-dominant patterns in this library
   * are the same musculature at different angles, and nothing in the
   * questionnaire distinguishes them. Better one honest signal for three
   * patterns than none for any of them.
   */
  squat: ['squats'],
  lunge: ['squats'],
  hinge: ['squats'],
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

/*
 * How long a set of numbers stays believable.
 *
 * Four weeks is short enough that a beginner's push-ups have moved — they gain
 * fastest at the start, which is exactly when a stale number costs the most —
 * and long enough that re-testing is not itself the training. It also lands on
 * the deload cadence, so the week somebody is told to back off is the week they
 * are asked to measure.
 *
 * Counted in days rather than in programme weeks on purpose. currentWeek() is
 * derived from startedAt and keeps counting whether or not anybody trained; a
 * trainee who did nothing for a fortnight should not be asked to re-test on a
 * schedule that pretended they did. Days since the numbers were last recorded
 * is the honest clock.
 */
export const RETEST_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the trainee last recorded their numbers, or null if never. */
export function daysSinceBenchmarks(profile, now) {
  const at = profile && profile.benchmarksAt;
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const ms = (now === undefined ? Date.now() : now) - t;
  return Math.max(0, Math.floor(ms / DAY_MS));
}

/**
 * True when it is time to ask for the numbers again.
 *
 * Never true for somebody who gave none in the first place: the app should not
 * open by nagging for a re-test of a measurement that was skipped. They are
 * asked at the start, and if they declined, the tier carries the plan. The
 * tracking tab still keeps a quiet, unprompted way in for them — declining is
 * not the same as being locked out — but that is an offer, not this.
 */
export function retestDue(profile, now) {
  if (!hasBenchmarks(profile)) return false;
  const days = daysSinceBenchmarks(profile, now);
  /*
   * Numbers with no stamp are of unknown age, and unknown is not fresh. Every
   * profile built before this cycle existed is in exactly that state — it has
   * four numbers and nothing saying when they were true — so returning false
   * here would mean every trainee already using the app is never asked again.
   * Asking once costs a card; the answer starts the clock properly.
   */
  if (days === null) return true;
  return days >= RETEST_DAYS;
}

/** Days remaining until the next re-test, or null when it is already due. */
export function daysUntilRetest(profile, now) {
  if (!hasBenchmarks(profile)) return null;
  const days = daysSinceBenchmarks(profile, now);
  if (days === null) return null;
  return days >= RETEST_DAYS ? null : RETEST_DAYS - days;
}

/*
 * How long "not now" lasts.
 *
 * A prompt with no way to decline is a prompt that gets answered with a guess,
 * and a guessed push-up count is worse than a stale real one — the whole point
 * of reading these numbers is that they are measured. So declining is allowed,
 * and it has to actually stop the asking or it is not a decline.
 *
 * A week, not forever: the trainee is being asked to find ten minutes and a
 * floor, which is a scheduling problem rather than a refusal, and the answer to
 * "not today" is usually "next week" rather than "never".
 */
export const RETEST_SNOOZE_DAYS = 7;

/** True when a "not now" from this timestamp has run out (or never happened). */
export function snoozeExpired(snoozedAt, now) {
  if (!snoozedAt) return true;
  const t = Date.parse(snoozedAt);
  if (!Number.isFinite(t)) return true;
  const at = now === undefined ? Date.now() : now;
  /* A stamp from the future is a broken clock or an edited backup, not a
     snooze that lasts until then. */
  if (t > at) return true;
  return at - t >= RETEST_SNOOZE_DAYS * DAY_MS;
}

/**
 * What changes if these new numbers are accepted, per pattern.
 *
 * Returned rather than applied, so the trainee can be shown what a re-test
 * bought before their plan is rewritten — and so nothing moves if the answer is
 * that nothing moved. The commonest honest outcome of a re-test is "the same",
 * and an app that rebuilds the whole week to say so is an app that punishes
 * measuring.
 */
export function retestDelta(profile, nextBenchmarks) {
  const after = Object.assign({}, profile, {
    benchmarks: Object.assign({}, profile.benchmarks, nextBenchmarks),
  });
  const moved = [];
  for (const pattern of Object.keys(SPEAKS_FOR)) {
    const before = demonstratedLevel(profile, pattern);
    const now = demonstratedLevel(after, pattern);
    if (before !== now && now !== null) moved.push({ pattern, from: before, to: now });
  }
  return moved;
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

/*
 * Exported so tools/validate.js can assert the general rule rather than a list
 * it would have to remember to update: every number the questionnaire collects
 * must be read by at least one movement pattern. The leg hole existed because
 * nothing could state that.
 */
export { LADDERS, SPEAKS_FOR };
