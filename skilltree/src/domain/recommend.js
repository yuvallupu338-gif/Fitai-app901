/*
 * recommend.js — what to do next, decided without a model.
 *
 * The brief is firm about this (§49): the recommendation engine is rule-based
 * and works offline; AI may later *explain* a recommendation, but it does not
 * make it. That split matters for a reason beyond cost — a scoring function
 * can be read, argued with and unit-tested, and "the model said so" cannot.
 *
 * Every candidate skill is scored on five axes, weighted, and the best few
 * returned with the reasons attached. The reasons are not decoration: they are
 * the actual score components, so the explanation shown to the learner cannot
 * drift from the decision that was made.
 */

import { statusOf, STATUS, readiness, requirementStatus } from './unlock.js';
import { reviewUrgency } from './mastery.js';
import { ancestorsOf } from './graph.js';

export const WEIGHTS = {
  goal: 0.32,        /* on the path to what they said they wanted */
  readiness: 0.22,   /* can they start it now, or nearly */
  unlockValue: 0.16, /* how much it opens up */
  difficultyFit: 0.15, /* matched to demonstrated ability */
  reviewUrgency: 0.15, /* something known is going stale */
};

/*
 * Difficulty match, scored as a curve rather than a threshold.
 *
 * The target is one step above the learner's demonstrated comfort: enough to
 * be worth doing, not so much that it stalls. Scoring the distance from that
 * target — rather than "is it below their level" — is what stops the engine
 * recommending the easiest available node forever.
 */
export function difficultyFit(skillDifficulty, comfortLevel) {
  const target = Math.min(5, comfortLevel + 1);
  const distance = Math.abs(skillDifficulty - target);
  return Math.max(0, 1 - distance / 3);
}

/*
 * Demonstrated comfort: the median difficulty of skills the learner has taken
 * to level 3 or better. Median rather than max, because one hard skill reached
 * once should not convince the engine that everything hard is now appropriate.
 */
export function comfortLevel(state, findSkill) {
  const done = Object.values(state.skills || {})
    .filter((s) => (s.level || 0) >= 3)
    .map((s) => findSkill(s.skillId)?.skill?.difficulty || 1)
    .sort((a, b) => a - b);
  if (!done.length) return 1;
  return done[Math.floor(done.length / 2)];
}

/**
 * Score every candidate in a tree and return the top few.
 *
 * @param ctx  { index, state, findSkill, goalPath }
 */
export function recommend(ctx, limit = 3) {
  const { index, state } = ctx;
  const progressOf = (id) => state.skills[id];
  const comfort = comfortLevel(state, ctx.findSkill || (() => null));
  const goalPath = new Set(ctx.goalPath || []);

  const candidates = [];

  for (const skill of index.tree.skills) {
    const status = statusOf(index, skill.id, progressOf);

    /* Mastered skills are finished. Everything else can be recommended,
     * including in-progress ones — "carry on with this" is usually the right
     * advice and an engine that only ever suggests new things is a distraction
     * machine. */
    if (status === STATUS.MASTERED) continue;

    const progress = state.skills[skill.id];
    const ready = readiness(index, skill.id, progressOf);

    /* Nothing locked and far away should surface; it is noise until the
     * prerequisites move. Half-ready is the cutoff. */
    if (status === STATUS.LOCKED && ready < 0.5) continue;

    const parts = {};

    parts.goal = goalPath.has(skill.id) ? 1 : 0;
    parts.readiness = ready;

    const opens = (index.dependents.get(skill.id) || []).length;
    parts.unlockValue = Math.min(1, opens / 3);

    parts.difficultyFit = difficultyFit(skill.difficulty || 1, comfort);

    parts.reviewUrgency = progress
      ? reviewUrgency({
        masteryScore: progress.masteryScore || 0,
        lastPracticedAt: progress.lastPracticedAt,
        level: progress.level || 0,
      }, ctx.now || Date.now()) / 100
      : 0;

    const score = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + parts[key] * weight, 0);

    candidates.push({
      skillId: skill.id,
      skill,
      status,
      score,
      parts,
      readiness: ready,
      reasons: reasonsFor(parts, skill, status, index, state),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

/*
 * Turn the score components into sentences a person would actually say.
 *
 * Only components that meaningfully contributed are mentioned, strongest
 * first, and at most two — a recommendation justified by five bullet points
 * reads as a machine defending itself.
 */
function reasonsFor(parts, skill, status, index, state) {
  const out = [];

  if (parts.goal > 0) out.push({ key: 'goal', weight: parts.goal * WEIGHTS.goal, text: 'On the path to your goal' });

  if (parts.reviewUrgency > 0.4) {
    out.push({ key: 'review', weight: parts.reviewUrgency * WEIGHTS.reviewUrgency, text: 'You have not practised this in a while' });
  }
  if (status === STATUS.IN_PROGRESS) {
    out.push({ key: 'progress', weight: 0.3, text: 'Already started' });
  }
  if (parts.unlockValue >= 0.66) {
    const count = (index.dependents.get(skill.id) || []).length;
    out.push({ key: 'unlocks', weight: parts.unlockValue * WEIGHTS.unlockValue, text: `Opens ${count} further skills` });
  }
  if (status === STATUS.AVAILABLE && parts.readiness >= 1) {
    out.push({ key: 'ready', weight: parts.readiness * WEIGHTS.readiness, text: 'Ready to start now' });
  }
  if (status === STATUS.LOCKED) {
    const missing = requirementStatus(index, skill.id, (id) => state.skills[id]).filter((r) => !r.met);
    if (missing.length === 1) {
      out.push({
        key: 'nearly',
        weight: parts.readiness * WEIGHTS.readiness,
        text: `One requirement away — ${missing[0].name} at level ${missing[0].needLevel}`,
      });
    }
  }
  if (parts.difficultyFit >= 0.9) {
    out.push({ key: 'fit', weight: parts.difficultyFit * WEIGHTS.difficultyFit, text: 'A good step up from where you are' });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 2).map((r) => r.text);
}

/**
 * The review queue (§48): skills that were learned and are drifting.
 *
 * Ordered by how much there is to lose, and capped — a queue of thirty items
 * is a guilt list, not a study aid.
 */
export function reviewQueue(state, findSkill, now = Date.now(), limit = 5) {
  return Object.values(state.skills || {})
    .map((s) => ({
      skillId: s.skillId,
      skill: findSkill(s.skillId)?.skill || null,
      urgency: reviewUrgency(s, now),
      confidence: s.confidence || 0,
      masteryScore: s.masteryScore || 0,
      lastPracticedAt: s.lastPracticedAt,
      neverPractised: !!s.neverPractised,
    }))
    .filter((r) => r.skill && r.urgency >= 25)
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, limit);
}

/**
 * The goal path: an ordered route to a target skill, with each step's status.
 *
 * This is §15 — the personal route drawn through the shared tree. Returned in
 * dependency order so the UI can render it as a sequence rather than a set.
 */
export function goalPath(index, targetSkillId, state) {
  const progressOf = (id) => state.skills[id];
  const needed = ancestorsOf(index, targetSkillId);
  needed.add(targetSkillId);

  const depths = new Map();
  const measure = (id) => {
    if (depths.has(id)) return depths.get(id);
    const reqs = (index.byId.get(id)?.requires || []).filter((r) => needed.has(r.skillId));
    const d = reqs.length ? Math.max(...reqs.map((r) => measure(r.skillId) + 1)) : 0;
    depths.set(id, d);
    return d;
  };
  for (const id of needed) measure(id);

  return [...needed]
    .sort((a, b) => (depths.get(a) - depths.get(b)) || a.localeCompare(b))
    .map((id) => ({
      skillId: id,
      skill: index.byId.get(id),
      status: statusOf(index, id, progressOf),
      level: state.skills[id]?.level || 0,
    }));
}
