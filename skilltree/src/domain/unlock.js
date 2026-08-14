/*
 * unlock.js — the gate. Whether a skill is open, and if not, exactly what is
 * missing.
 *
 * Two things live here and they are deliberately the same code path:
 *
 *   1. the boolean the tree uses to grey a node out, and
 *   2. the itemised list the detail panel shows —
 *        JavaScript Level 3  ✗  (you are at 2)
 *        HTML Level 3        ✓
 *
 * If those were computed separately they would drift, and the failure mode is
 * the worst kind: a node the app says is locked, next to a requirements list
 * where every line is ticked. So `requirementStatus` is the single source and
 * `isUnlocked` is a fold over it.
 *
 * Pure module: state comes in as a lookup function, never from storage.
 */

import { levelFor } from './levels.js';

/**
 * The learner's current standing on one skill, in the shape the gate needs.
 * `progressOf` is `(skillId) => userSkill | undefined`.
 */
export function levelOf(progressOf, skillId) {
  const p = progressOf(skillId);
  if (!p) return 0;

  /*
   * Recompute, then take the higher of that and the recorded peak.
   *
   * Recomputing matters because a stored level can be stale — thresholds and
   * a skill's activity list both change, and a gate that disagrees with the
   * skill panel is a bug report. Taking the peak matters because a level is
   * earned and does not fall (see applyAttempt). Doing both, here, in the one
   * function every reader goes through, is what stops the two rules drifting:
   * the review found six modules reading the stored field and five recomputing,
   * and the two answers differing by three mastered skills.
   */
  const computed = levelFor({
    xp: p.xp || 0,
    masteryScore: p.masteryScore || 0,
    capacity: p.capacity || 0,
    started: !!p.startedAt,
  });

  return Math.max(computed, p.peakLevel || 0);
}

/**
 * Itemised requirement check for one skill.
 * Returns one entry per prerequisite, each with what was needed, what the
 * learner has, and whether it is satisfied.
 */
export function requirementStatus(index, skillId, progressOf) {
  const skill = index.byId.get(skillId);
  if (!skill) return [];

  return (skill.requires || []).map((req) => {
    const reqSkill = index.byId.get(req.skillId);
    const have = levelOf(progressOf, req.skillId);
    const need = req.minLevel ?? 1;
    return {
      skillId: req.skillId,
      name: reqSkill ? reqSkill.name : req.skillId,
      needLevel: need,
      haveLevel: have,
      met: have >= need,
    };
  });
}

/**
 * Is this skill open to work on?
 *
 * A skill with no prerequisites is always open — that is what makes a root a
 * root, and the brief calls it out as an edge case (§60).
 */
export function isUnlocked(index, skillId, progressOf) {
  return requirementStatus(index, skillId, progressOf).every((r) => r.met);
}

/*
 * The five states a node can be in, in the order they escalate. The tree, the
 * panel and the profile all sort and style on these, so they are named here
 * once rather than being stringly-typed at each call site.
 */
export const STATUS = {
  LOCKED: 'locked',
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  MASTERED: 'mastered',
};

/**
 * The single status for a node, folding the gate and the learner's progress.
 *
 * "Completed" is level 3 — competent, can use it unaided — rather than level 5.
 * Requiring mastery to call something complete would leave a realistic tree
 * almost entirely unfinished forever, and it would make the two states
 * redundant. Mastered stays as the distinct, rarer thing.
 */
export function statusOf(index, skillId, progressOf) {
  const p = progressOf(skillId);
  const level = levelOf(progressOf, skillId);

  if (level >= 5) return STATUS.MASTERED;
  if (level >= 3) return STATUS.COMPLETED;
  if (p && p.startedAt) return STATUS.IN_PROGRESS;
  return isUnlocked(index, skillId, progressOf) ? STATUS.AVAILABLE : STATUS.LOCKED;
}

/**
 * Every skill whose gate opened as a result of some change.
 *
 * Called with the statuses captured before an activity and the index after it,
 * so the app can fire the unlock moment (§66) for each one. It handles the
 * several-at-once case (§60) by returning a list rather than a single id —
 * finishing one assessment can genuinely open three branches, and showing one
 * toast while silently opening the others would be wrong.
 */
export function newlyUnlocked(index, progressOf, previousStatuses) {
  const opened = [];
  for (const skill of index.tree.skills) {
    const before = previousStatuses.get(skill.id);
    if (before !== STATUS.LOCKED) continue;
    if (statusOf(index, skill.id, progressOf) !== STATUS.LOCKED) opened.push(skill.id);
  }
  return opened;
}

/** Snapshot every status in a tree — the "before" half of the pair above. */
export function statusSnapshot(index, progressOf) {
  const map = new Map();
  for (const skill of index.tree.skills) map.set(skill.id, statusOf(index, skill.id, progressOf));
  return map;
}

/**
 * How close a locked skill is to opening, 0..1.
 *
 * Drives the "almost there" ordering in recommendations, and lets a locked
 * node show a faint partial ring instead of a flat grey block — which is the
 * difference between a wall and a horizon.
 */
export function readiness(index, skillId, progressOf) {
  const reqs = requirementStatus(index, skillId, progressOf);
  if (!reqs.length) return 1;
  const total = reqs.reduce((sum, r) => sum + Math.min(1, r.haveLevel / Math.max(1, r.needLevel)), 0);
  return total / reqs.length;
}
