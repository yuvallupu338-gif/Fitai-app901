/*
 * mastery.js — how well someone actually knows a skill, and how sure we are.
 *
 * Two numbers come out of here and they answer different questions:
 *
 *   masteryScore — how well you performed. Earned, and it does not rot.
 *   confidence   — how much that score still reflects today. Decays with time
 *                  away from the skill, recovers the moment you practise.
 *
 * Keeping them apart is the point (§47). A skill you aced six months ago is
 * still a skill you aced; pretending you lost it is insulting and makes the
 * profile lie. But treating it as fresh is also wrong, and the review queue
 * needs something to sort on. So mastery is the record and confidence is the
 * caveat, and the UI can say "you had this — worth ten minutes to get it back"
 * instead of silently deleting progress.
 *
 * Pure module. The clock arrives as an argument so tests are not flaky.
 */

const DAY = 86400000;

/* Kept in step with `dayNumber` in progress.js — both must agree on where a
 * day starts, or the streak and the consistency score describe different
 * calendars. */
function localDay(ms) {
  const d = new Date(ms);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY);
}

/*
 * The four components of a mastery score, with the weights from §46. Exported
 * and passed through rather than inlined because the brief explicitly asks for
 * them to be tunable — and because the moment they are inlined, three screens
 * start disagreeing about what mastery means.
 */
export const DEFAULT_WEIGHTS = {
  assessment: 0.40,
  challenge: 0.25,
  retention: 0.20,
  consistency: 0.15,
};

/*
 * Recency-weighted mean of graded attempts.
 *
 * A plain average punishes learning: the two attempts you failed while working
 * it out sit in the record forever, dragging a skill you now know down to 60.
 * Weighting later attempts more heavily means the score follows where you are,
 * not where you started — which is what "mastery" is supposed to measure.
 *
 * Weights ramp linearly from 1 for the oldest attempt to `recencyBias` for the
 * newest.
 */
export function weightedScore(attempts, recencyBias = 3) {
  const graded = (attempts || []).filter((a) => Number.isFinite(a.score));
  if (!graded.length) return null;
  const sorted = graded.slice().sort((a, b) => a.at - b.at);

  let sum = 0;
  let weightSum = 0;
  sorted.forEach((a, i) => {
    const w = sorted.length === 1 ? 1 : 1 + (recencyBias - 1) * (i / (sorted.length - 1));
    sum += a.score * w;
    weightSum += w;
  });
  return sum / weightSum;
}

/*
 * How much of a mastery score is still "live" after time away.
 *
 * Exponential decay toward a floor, with the half-life stretched by how well
 * the skill was learned in the first place: something you took to level 5
 * fades far slower than something you scraped a pass on. The floor exists
 * because deep learning does not go to zero — you do not forget how to ride a
 * bike, you get rusty.
 */
export function confidenceFor({ masteryScore = 0, lastPracticedAt = null, level = 0 }, now = Date.now()) {
  if (!lastPracticedAt) return 0;
  const days = Math.max(0, (now - lastPracticedAt) / DAY);

  /* 14 days at level 1, 74 at level 5. */
  const halfLife = 14 + Math.max(0, level) * 15;
  const floor = 0.35 + Math.min(0.35, (masteryScore / 100) * 0.35);

  const decayed = Math.pow(0.5, days / halfLife);
  return Math.round(Math.max(floor, decayed) * 100);
}

/*
 * Retention: did the knowledge survive contact with time?
 *
 * Measured as how well the learner did on attempts made *after a gap* of a week
 * or more. Scoring well on something you last saw ten days ago is real evidence
 * of retention in a way that scoring well twice in one session is not. With no
 * such attempt yet we return null and the component drops out of the average
 * rather than scoring zero — punishing a new learner for not yet having a
 * history would make every fresh skill look worse than it is.
 */
export function retentionScore(attempts, now = Date.now()) {
  const graded = (attempts || []).filter((a) => Number.isFinite(a.score)).sort((a, b) => a.at - b.at);
  if (graded.length < 2) return null;

  const afterGap = [];
  for (let i = 1; i < graded.length; i += 1) {
    if (graded[i].at - graded[i - 1].at >= 7 * DAY) afterGap.push(graded[i]);
  }
  if (!afterGap.length) return null;
  return weightedScore(afterGap, 2);
}

/*
 * Consistency: how many distinct days in the last three weeks had activity on
 * this skill. Distinct *days*, not attempts — otherwise one long Sunday session
 * scores the same as three weeks of steady work, and steady work is the thing
 * worth rewarding.
 *
 * Six active days out of 21 reads as full marks. The bar is deliberately low:
 * this is 15% of a score, and setting it where only daily practice scores well
 * would make it a streak counter wearing a different hat.
 */
export function consistencyScore(attempts, now = Date.now()) {
  const list = attempts || [];
  if (!list.length) return null;

  /*
   * There is no such thing as consistency on day one.
   *
   * Without this, a learner's very first perfect assessment is averaged
   * against a consistency score of 17 — because they have been active on one
   * day out of a possible six — and their mastery lands at 77 instead of
   * ~100. Scoring someone on a history they have not had time to accumulate is
   * the same mistake as scoring the components that have no evidence at all,
   * and the fix is the same: return null and let the weights renormalise.
   */
  const first = Math.min(...list.map((a) => a.at));
  if (now - first < 7 * DAY) return null;

  const window = now - 21 * DAY;
  const days = new Set();
  for (const a of list) {
    /* Local calendar days, matching `dayNumber` in progress.js. Bucketing by
     * UTC counted one evening's work as two separate days for anyone far
     * enough from UTC, doubling this component for them. */
    if (a.at >= window) days.add(localDay(a.at));
  }
  if (!days.size) return 0;
  return Math.min(100, (days.size / 6) * 100);
}

/**
 * The mastery score itself.
 *
 * Components that have no evidence yet (no assessment taken, no retention
 * history) are dropped and the remaining weights renormalised, so an early
 * learner is scored on what they have actually done. The alternative — zeros
 * for missing components — caps a brand-new skill at 40% no matter how well
 * the learner performs, which reads as broken.
 */
export function computeMastery(attempts, opts = {}) {
  const now = opts.now ?? Date.now();
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const list = attempts || [];

  const assessments = list.filter((a) => a.kind === 'assessment' || a.kind === 'mastery');
  const challenges = list.filter((a) => a.kind === 'challenge' || a.kind === 'project' || a.kind === 'quiz' || a.kind === 'practice');

  const parts = [
    { key: 'assessment', value: weightedScore(assessments) },
    { key: 'challenge', value: weightedScore(challenges) },
    { key: 'retention', value: retentionScore(list, now) },
    { key: 'consistency', value: consistencyScore(list, now) },
  ].filter((p) => p.value !== null && Number.isFinite(p.value));

  if (!parts.length) return { score: 0, parts: {} };

  const totalWeight = parts.reduce((s, p) => s + weights[p.key], 0);
  const score = parts.reduce((s, p) => s + p.value * weights[p.key], 0) / totalWeight;

  const breakdown = {};
  for (const p of parts) breakdown[p.key] = Math.round(p.value);

  return { score: Math.max(0, Math.min(100, Math.round(score))), parts: breakdown };
}

/*
 * Whether a skill has drifted far enough to be worth a review, and how badly.
 * Used to order the review queue (§48) — highest urgency first. Only skills
 * that got somewhere worth protecting (level 2+) can be urgent; nagging
 * someone about a skill they touched once is noise.
 */
export function reviewUrgency({ masteryScore = 0, lastPracticedAt = null, level = 0 }, now = Date.now()) {
  if (!lastPracticedAt || level < 2) return 0;
  const confidence = confidenceFor({ masteryScore, lastPracticedAt, level }, now);
  const gap = Math.max(0, 100 - confidence);
  /* Weighted by how much there is to lose, so a mastered skill going stale
   * outranks a shaky one going stale. */
  return Math.round(gap * (0.5 + (masteryScore / 100) * 0.5));
}
