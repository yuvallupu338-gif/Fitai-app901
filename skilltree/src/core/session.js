/*
 * session.js — the service layer (§57).
 *
 * The domain modules are pure and know nothing about storage. The store knows
 * nothing about skills. This is the seam between them, and it is the only
 * place in the app where a UI component is allowed to change learner state.
 *
 * Everything here follows the same shape: read the profile, run the pure
 * domain function, award anything that follows from it, write once, and hand
 * back a list of things that happened so the caller can announce them. A
 * component never composes those steps itself — that is how the achievement
 * check ends up running in four screens and not the fifth.
 */

import * as store from './store.js';
import { getIndex, findSkill, findActivity, allTrees } from '../data/catalog.js';
import { applyAttempt, startSkill, refreshDerived, liveStreak } from '../domain/progress.js';
import { skillCapacity } from '../domain/xp.js';
import { award } from '../domain/achievements.js';
import { computeDepths } from '../domain/graph.js';
import { recommend, goalPath, reviewQueue } from '../domain/recommend.js';
import { missionsForToday, completeMissionsFor, nextActivityFor } from '../domain/missions.js';
import { grade } from '../domain/verify.js';
import { totalXp } from '../domain/xp.js';
import { globalProgress } from '../domain/levels.js';

/* Depth lookups are needed by two achievement rules and by nothing else, so
 * they are computed lazily and cached rather than being carried around. */
const depthCache = new Map();
function depthOf(skillId) {
  const found = findSkill(skillId);
  if (!found) return null;
  if (!depthCache.has(found.tree.id)) depthCache.set(found.tree.id, computeDepths(found.index));
  return depthCache.get(found.tree.id).get(skillId) ?? null;
}

function treeOf(skillId) {
  return findSkill(skillId)?.tree?.id || null;
}

const achievementCtx = { depthOf, treeOf };

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export function profile() {
  return store.get();
}

/**
 * The profile with time-derived fields brought up to date.
 *
 * Confidence decays with the clock, so a profile loaded after a fortnight away
 * carries stale numbers until this runs. Called by the screens that display
 * them rather than on a timer, which keeps it lazy and predictable.
 */
export function freshProfile(now = Date.now()) {
  const p = store.get();
  if (!p) return null;
  return refreshDerived(backfillCapacity(p), now);
}

/*
 * A skill record written before `capacity` existed — or belonging to a tree
 * that has since gained an activity — carries a stale or absent denominator,
 * and every level derived from it would be wrong. `applyAttempt` heals a record
 * the next time it is touched, but the screens read state long before that, so
 * a skill would sit at level 1 with the tree locked behind it until the learner
 * happened to do something. This closes that window on read.
 */
function backfillCapacity(profile) {
  let changed = false;
  const skills = {};

  for (const [id, record] of Object.entries(profile.skills || {})) {
    const found = findSkill(id);
    if (!found) { skills[id] = record; continue; }
    const capacity = skillCapacity(found.skill.activities, record.difficulty || found.skill.difficulty || 1);
    if (capacity === record.capacity) { skills[id] = record; continue; }
    skills[id] = { ...record, capacity };
    changed = true;
  }

  return changed ? { ...profile, skills } : profile;
}

export function overview(now = Date.now()) {
  const p = store.get();
  if (!p) return null;
  const xp = totalXp(p.xpEvents);
  return {
    profile: p,
    xp,
    ...globalProgress(xp),
    streak: liveStreak(p, now),
    skillsStarted: Object.keys(p.skills).length,
    skillsCompleted: Object.values(p.skills).filter((s) => (s.level || 0) >= 3).length,
    skillsMastered: Object.values(p.skills).filter((s) => (s.level || 0) >= 5).length,
    achievements: Object.keys(p.achievements || {}).length,
  };
}

export function progressOf(skillId) {
  return store.get()?.skills?.[skillId] || null;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Begin a skill. Returns the outcome so the caller can explain a refusal
 * rather than silently doing nothing.
 */
export function begin(skillId) {
  const found = findSkill(skillId);
  if (!found) return { ok: false, reason: 'unknown_skill' };

  let outcome = { ok: true };
  store.update((p) => {
    const res = startSkill(p, found.index, skillId);
    if (!res.started) { outcome = { ok: false, reason: res.reason }; return p; }
    const withBadges = award(res.state, achievementCtx);
    outcome = { ok: true, unlockedAchievements: withBadges.unlocked };
    return withBadges.state;
  });
  return outcome;
}

/**
 * Grade a submission and commit everything that follows from it.
 *
 * This is the function the whole app is built around, and the order matters:
 * grade first (pure, and the score is not the caller's to decide), then apply,
 * then award badges, then tick off missions — because a badge can depend on
 * the attempt and a mission can depend on the badge, but never the reverse.
 *
 * Returns the grading result plus the announcements, so the activity screen
 * can show the feedback and the toasts from one call.
 */
export async function submit(activityId, submission) {
  const found = findActivity(activityId);
  if (!found) return { ok: false, reason: 'unknown_activity' };

  const { activity, skill, index } = found;
  const result = await grade(activity, submission);

  let events = [];
  let badges = [];

  store.update((p) => {
    const applied = applyAttempt(p, index, {
      skillId: skill.id,
      activityId,
      kind: activity.kind,
      score: result.score,
      passed: result.passed,
      /* The attempt id is derived from what has already happened, not from
       * the caller, so a double-submitted form collapses to one award. */
      id: `${activityId}#${(p.skills[skill.id]?.attempts?.length || 0) + 1}`,
      durationMs: submission.durationMs || null,
    });

    events = applied.events;
    let next = applied.state;

    const withBadges = award(next, achievementCtx);
    badges = withBadges.unlocked;
    next = withBadges.state;

    if (result.passed) next = completeMissionsFor(next, { skillId: skill.id, activityId });
    return next;
  });

  return { ok: true, result, events, badges, skill, activity };
}

/* ------------------------------------------------------------------ *
 * Derived views the screens ask for
 * ------------------------------------------------------------------ */

/**
 * Recommendations across every tree the learner has touched, plus their goal
 * tree. Scored per tree then merged, because the scoring is relative to a
 * tree's own structure and comparing raw scores across trees is meaningless
 * without the merge step being explicit about it.
 */
export function recommendations(limit = 3, now = Date.now()) {
  const p = freshProfile(now);
  if (!p) return [];

  const treeIds = new Set();
  for (const skillId of Object.keys(p.skills)) {
    const treeId = treeOf(skillId);
    if (treeId) treeIds.add(treeId);
  }
  if (p.goal?.treeId) treeIds.add(p.goal.treeId);
  /* A brand-new profile has touched nothing; recommend from every tree rather
   * than returning an empty list to a learner who has just signed up. */
  if (!treeIds.size) for (const t of allTrees()) treeIds.add(t.id);

  const path = p.goal ? goalPathFor(p.goal).map((s) => s.skillId) : [];

  const merged = [];
  for (const treeId of treeIds) {
    const index = getIndex(treeId);
    if (!index) continue;
    merged.push(...recommend({ index, state: p, findSkill, goalPath: path, now }, limit));
  }

  return merged
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((rec) => ({ ...rec, tree: findSkill(rec.skillId)?.tree || null }));
}

export function goalPathFor(goal) {
  if (!goal || !goal.targetSkillId) return [];
  const index = getIndex(goal.treeId);
  if (!index) return [];
  return goalPath(index, goal.targetSkillId, freshProfile());
}

export function reviews(now = Date.now(), limit = 5) {
  const p = freshProfile(now);
  if (!p) return [];
  return reviewQueue(p, findSkill, now, limit);
}

/**
 * Today's missions. Generates and persists them on the first call of a new
 * day, so the list is stable for the rest of it.
 */
export function missions(now = Date.now()) {
  const p = freshProfile(now);
  if (!p) return { missions: [], completed: [] };

  const recs = recommendations(3, now);
  const result = missionsForToday({ state: p, findSkill, recommendations: recs }, now);

  if (result.state !== p) store.update(() => result.state);
  return { missions: result.missions, completed: result.completed };
}

/** The skills the learner is actively working on, most recent first. */
export function currentFocus(limit = 3) {
  const p = freshProfile();
  if (!p) return [];
  return Object.values(p.skills)
    .filter((s) => (s.level || 0) < 5 && s.lastPracticedAt)
    .sort((a, b) => b.lastPracticedAt - a.lastPracticedAt)
    .slice(0, limit)
    .map((s) => ({ ...s, skill: findSkill(s.skillId)?.skill || null, tree: findSkill(s.skillId)?.tree || null }))
    .filter((s) => s.skill);
}

export function recentlyUnlocked(limit = 4) {
  const p = freshProfile();
  if (!p) return [];
  return Object.values(p.skills)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, limit)
    .map((s) => ({ ...s, skill: findSkill(s.skillId)?.skill || null }))
    .filter((s) => s.skill);
}

export function nextActivity(skillId) {
  const found = findSkill(skillId);
  if (!found) return null;
  return nextActivityFor(found.skill, store.get()?.skills?.[skillId]);
}

export function setGoal(treeId, targetSkillId, text) {
  return store.update((p) => ({
    ...p,
    goal: { treeId, targetSkillId, text: text || '', createdAt: Date.now() },
  }));
}
