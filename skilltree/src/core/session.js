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
import { getIndex, findSkill, findActivity, allTrees, registerTree, forgetTree as dropTree } from '../data/catalog.js';
import { applyAttempt, startSkill, refreshDerived, liveStreak } from '../domain/progress.js';
import { skillCapacity } from '../domain/xp.js';
import { award } from '../domain/achievements.js';
import { computeDepths } from '../domain/graph.js';
import { recommend, goalPath, reviewQueue } from '../domain/recommend.js';
import { missionsForToday, completeMissionsFor, nextActivityFor } from '../domain/missions.js';
import { grade } from '../domain/verify.js';
import { buildProgramme } from '../domain/goals.js';
import * as catalog from '../data/catalog.js';
import { totalXp } from '../domain/xp.js';
import { globalProgress } from '../domain/levels.js';

/*
 * Depth lookups are needed by two achievement rules and by nothing else, so
 * they are computed lazily and cached rather than being carried around.
 *
 * Keyed by the index object, not by the tree id. Registering a tree builds a
 * new index, so a generated tree accepted under an id already in the cache —
 * or a tree restored at boot — would otherwise be answered from depths
 * computed for the previous graph. An id is not a version; the index is.
 */
const depthCache = new WeakMap();
function depthOf(skillId) {
  const found = findSkill(skillId);
  if (!found) return null;
  if (!depthCache.has(found.index)) depthCache.set(found.index, computeDepths(found.index));
  return depthCache.get(found.index).get(skillId) ?? null;
}

function treeOf(skillId) {
  return findSkill(skillId)?.tree?.id || null;
}

function requirementCount(skillId) {
  return (findSkill(skillId)?.skill?.requires || []).length;
}

const achievementCtx = { depthOf, treeOf, requirementCount };

/* ------------------------------------------------------------------ *
 * The generated catalogue
 * ------------------------------------------------------------------ */

/*
 * Trees the learner generated are held in the same in-memory catalogue as the
 * seeded ones, which means they have to be put back there on every boot. This
 * runs at import time, before the router picks a screen, so a route straight
 * into a generated tree resolves on a cold load exactly as it does after
 * accepting one.
 *
 * A stored tree that no longer indexes — written by an older build, or edited
 * by hand in an export — is dropped rather than allowed to throw during
 * layout, because a broken tree must not cost the learner the whole app.
 */
export function restoreTrees() {
  const broken = [];
  for (const tree of store.savedTrees()) {
    try {
      registerTree(tree);
    } catch (err) {
      console.error(`could not restore tree ${tree.id}`, err);
      broken.push(tree.id);
    }
  }
  for (const id of broken) store.forgetTree(id);
  return { restored: store.savedTrees().length, dropped: broken };
}

restoreTrees();

/**
 * Register a generated tree and persist it, in that order.
 *
 * Registration validates the graph, so a tree that would break the layout is
 * rejected before anything is written — the alternative is storing a tree that
 * fails to load on every subsequent boot.
 */
export function acceptGeneratedTree(tree) {
  try {
    registerTree(tree);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const stored = store.saveTree({ ...tree, generated: true });
  /* Registered but not written: the tree works for this session, and saying so
   * is better than a silent loss at the next reload. */
  return { ok: true, persisted: stored };
}

/** Remove a generated tree from both the catalogue and storage. */
export function removeGeneratedTree(id) {
  dropTree(id);
  return store.forgetTree(id);
}

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
/*
 * A stable fingerprint for a submission.
 *
 * The attempt id used to be `activity#<attempts.length + 1>`, computed from the
 * live profile — which strictly increases, so the id was different every time
 * and the duplicate check downstream could never fire. Three comments claimed
 * double-submission was handled; it was handled by the UI removing the button,
 * and `session.submit` is a public API with no such protection.
 *
 * Hashing what was actually submitted makes an identical resubmission collide,
 * which is exactly the case worth collapsing: a double click, a retried call,
 * two concurrent submits of the same answers. A genuine retry differs — the
 * learner changed something — and correctly gets its own id.
 */
export function fingerprint(activityId, submission) {
  const payload = JSON.stringify({
    a: activityId,
    answers: submission.answers ?? null,
    source: submission.source ?? null,
    checked: submission.checked ?? null,
  });

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${activityId}#${(hash >>> 0).toString(36)}`;
}

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
      /* Derived from the submission itself — see fingerprint. */
      id: fingerprint(activityId, submission),
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

/**
 * The learner's programme — the single source of the goal numbers.
 *
 * Four screens reported progress toward the same goal and two of them
 * disagreed: the dashboard and the plan folded every destination across every
 * tree ("9 / 27"), while the tree and the profile walked the path to one target
 * in one tree ("2 / 19"). Same goal, same moment, 33% against 11%. Whichever
 * was right, showing both was not.
 *
 * So the programme is computed here, once, and every screen reads it. The tree
 * still shows only its own share — a graph cannot draw the skills in another
 * tree — but it takes that share from this, and says so.
 */
export function programme(now = Date.now()) {
  const p = freshProfile(now);
  if (!p || !p.plan?.goalText) return null;
  const built = buildProgramme({
    catalog,
    state: p,
    goalText: p.plan.goalText,
    minutesPerDay: p.plan.minutesPerDay || 20,
    now,
  });
  return built.ok ? built : null;
}

/** The part of the programme that lives in one tree, for the tree screen. */
export function programmeInTree(treeId, now = Date.now()) {
  const built = programme(now);
  if (!built) return null;
  const steps = built.steps.filter((s) => s.treeId === treeId);
  return { steps, done: steps.filter((s) => s.done).length, total: built.totalSteps };
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

/**
 * What to offer after finishing `activityId` — the next thing *forward*.
 *
 * `nextActivity` answers "where should I resume this skill", which is a
 * different question and falls back to the last graded activity once
 * everything is passed. Used as the "Next" button on a result panel, that
 * pointed backwards: fail a quiz and the app offered the lesson you had read a
 * minute earlier, labelled "Next".
 *
 * So this only ever looks later in the author's order, and only at work not
 * already passed. Nothing suitable returns null, and the panel simply offers
 * the way back to the tree.
 */
export function nextActivityAfter(skillId, activityId) {
  const found = findSkill(skillId);
  if (!found) return null;

  const activities = found.skill.activities || [];
  const here = activities.findIndex((a) => a.id === activityId);
  if (here === -1) return null;

  const passed = new Set((store.get()?.skills?.[skillId]?.attempts || [])
    .filter((a) => a.passed).map((a) => a.activityId));

  return activities.slice(here + 1).find((a) => !passed.has(a.id)) || null;
}

/**
 * Set the goal — both halves of it, in one place.
 *
 * `plan` is what the learner wrote; `goal` is the destination it resolved to,
 * and half a dozen screens read the latter. They were being written by two
 * separate call sites and cleared by neither, so an abandoned goal kept
 * driving the tree screen and the recommendations. One writer now.
 */
export function setGoal({ goalText, minutesPerDay, treeId, targetSkillId }, now = Date.now()) {
  return store.update((p) => ({
    ...p,
    plan: { goalText, createdAt: now, minutesPerDay: minutesPerDay || 20 },
    goal: targetSkillId
      ? { treeId, targetSkillId, text: goalText || '', createdAt: now }
      : null,
  }));
}

/**
 * Award anything the current state qualifies for.
 *
 * Exposed because seeding paths — onboarding, the demo — build state by
 * replaying attempts and would otherwise leave the learner on a populated
 * dashboard beside an achievements screen reading "0 of 16".
 */
export function awardPending() {
  let unlocked = [];
  store.update((p) => {
    const res = award(p, achievementCtx);
    unlocked = res.unlocked;
    return res.state;
  });
  return unlocked;
}
