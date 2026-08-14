/*
 * progress.js — the one function that changes a learner's state.
 *
 * Every completed activity in the app funnels through `applyAttempt`. It is
 * written as a pure reducer — old state in, new state out, nothing mutated,
 * clock supplied by the caller — for three reasons:
 *
 *   1. It is the only place XP, mastery, levels, unlocks and achievements can
 *      disagree with each other, so it is the only place worth testing hard.
 *   2. The brief's §55 wants progression decided in one authoritative place
 *      rather than trusted from the UI. There is no server here (see the
 *      README), so this module is that place: the activity screen reports what
 *      happened — which activity, what answer — and has no say in what it is
 *      worth. It cannot hand itself 500 XP.
 *   3. It returns a diff (`events`) describing what changed, so the UI can play
 *      the level-up and unlock moments without re-deriving them by comparing
 *      two snapshots and guessing.
 *
 * Deterministic and AI-free by design (§80): a missing API key changes nothing
 * about how progression behaves.
 */

import { computeAward, appendXpEvent, totalXp, skillCapacity } from './xp.js';
import { computeMastery, confidenceFor } from './mastery.js';
import { levelFor, levelForXp } from './levels.js';
import { statusSnapshot, newlyUnlocked, statusOf, isUnlocked } from './unlock.js';

/** A blank record for a skill the learner has just opened. */
export function newUserSkill(skillId, difficulty = 1, capacity = 0, now = Date.now()) {
  return {
    skillId,
    difficulty,
    /* What this skill can yield in total — the denominator every level
     * threshold is a fraction of. Stored rather than looked up so the pure
     * domain never needs the catalogue. */
    capacity,
    xp: 0,
    level: 1,
    masteryScore: 0,
    confidence: 0,
    attempts: [],
    passCounts: {},
    startedAt: now,
    lastPracticedAt: null,
    completedAt: null,
    masteredAt: null,
  };
}

/**
 * Begin a skill. Refuses if the gate is shut — the UI hides the button, but
 * the rule belongs here too, because the UI is not the authority on it.
 */
export function startSkill(state, index, skillId, now = Date.now()) {
  const skill = index.byId.get(skillId);
  if (!skill) throw new Error(`unknown skill: ${skillId}`);

  const progressOf = (id) => state.skills[id];
  if (state.skills[skillId]) return { state, started: false, reason: 'already_started' };
  if (!isUnlocked(index, skillId, progressOf)) {
    return { state, started: false, reason: 'locked' };
  }

  return {
    state: {
      ...state,
      skills: {
        ...state.skills,
        [skillId]: newUserSkill(skillId, skill.difficulty || 1,
          skillCapacity(skill.activities, skill.difficulty || 1), now),
      },
      analytics: appendAnalytics(state.analytics, 'skill_started', { skillId, treeId: index.tree.id }, now),
    },
    started: true,
  };
}

/* Internal analytics ledger (§81). An abstraction, not a provider: events are
 * recorded locally in the shape a provider would want, so wiring one up later
 * is a subscriber, not a refactor. */
function appendAnalytics(list, name, props, at) {
  const events = list || [];
  /* Bounded — this is a diagnostic trail, not a permanent record, and an
   * unbounded array in localStorage eventually throws a quota error mid-session. */
  const next = events.concat([{ name, props, at }]);
  return next.length > 500 ? next.slice(next.length - 500) : next;
}

/**
 * Record a finished attempt and settle every consequence of it.
 *
 * @param state    the whole learner state
 * @param index    indexed tree the skill belongs to
 * @param attempt  { skillId, activityId, kind, score, passed, id, durationMs }
 * @returns { state, events }  where events describe what the UI should announce
 */
export function applyAttempt(state, index, attempt, now = Date.now()) {
  const { skillId, activityId, kind } = attempt;
  const skill = index.byId.get(skillId);
  if (!skill) throw new Error(`unknown skill: ${skillId}`);

  /* Auto-start on first activity. Someone who has just completed a challenge
   * has unambiguously started the skill, and making them press a separate
   * button first is bureaucracy. */
  let base = state;
  if (!base.skills[skillId]) {
    const res = startSkill(base, index, skillId, now);
    if (!res.started) return { state, events: [{ type: 'rejected', reason: res.reason }] };
    base = res.state;
  }

  const before = {
    statuses: statusSnapshot(index, (id) => base.skills[id]),
    globalLevel: levelForXp(totalXp(base.xpEvents)),
    skillLevel: base.skills[skillId].level,
  };

  const prev = base.skills[skillId];
  const attemptId = attempt.id || `att_${skillId}_${activityId}_${prev.attempts.length + 1}`;

  /* Idempotency. The brief lists "assessment submitted twice" as an edge case;
   * a double-submitted attempt id is dropped whole rather than half-applied. */
  if (prev.attempts.some((a) => a.id === attemptId)) {
    return { state, events: [{ type: 'duplicate', attemptId }] };
  }

  const passed = attempt.passed !== false;
  const score = Number.isFinite(attempt.score) ? Math.max(0, Math.min(100, attempt.score)) : null;

  const record = {
    id: attemptId,
    activityId,
    kind,
    score,
    passed,
    at: now,
    durationMs: attempt.durationMs || null,
  };

  const attempts = prev.attempts.concat([record]);

  /* Only passes count toward the repeat-decay counter, so failing three times
   * and then passing still pays full value. */
  const passKey = activityId;
  const previousPasses = prev.passCounts[passKey] || 0;
  const award = computeAward({
    kind,
    score,
    previousPasses,
    difficulty: prev.difficulty,
    passed,
  });

  const xpEvents = award > 0
    ? appendXpEvent(base.xpEvents, {
      key: `attempt:${attemptId}`,
      amount: award,
      reason: attempt.reason || labelFor(kind, skill.name),
      skillId,
      treeId: index.tree.id,
      kind,
      at: now,
    })
    : base.xpEvents;

  const gained = totalXp(xpEvents) - totalXp(base.xpEvents);

  const mastery = computeMastery(attempts, { now, weights: state.settings?.masteryWeights });
  const skillXp = (prev.xp || 0) + gained;

  /* Recomputed rather than read from the record: it is cheap, and it heals a
   * profile stored before this field existed or before a tree gained an
   * activity. A stale denominator would silently mis-state every level. */
  const capacity = skillCapacity(skill.activities, prev.difficulty || skill.difficulty || 1);

  const level = levelFor({
    xp: skillXp,
    masteryScore: mastery.score,
    capacity,
    started: true,
  });

  const updated = {
    ...prev,
    capacity,
    xp: skillXp,
    attempts,
    passCounts: passed ? { ...prev.passCounts, [passKey]: previousPasses + 1 } : prev.passCounts,
    masteryScore: mastery.score,
    masteryParts: mastery.parts,
    level,
    lastPracticedAt: now,
    completedAt: prev.completedAt || (level >= 3 ? now : null),
    masteredAt: prev.masteredAt || (level >= 5 ? now : null),
  };
  updated.confidence = confidenceFor(updated, now);

  let next = {
    ...base,
    skills: { ...base.skills, [skillId]: updated },
    xpEvents,
    analytics: appendAnalytics(base.analytics, 'activity_completed',
      { skillId, activityId, kind, score, passed }, now),
  };

  /* ---- what changed, for the UI to announce ---- */
  const events = [];
  if (gained > 0) events.push({ type: 'xp', amount: gained, skillId });

  if (level > before.skillLevel) {
    events.push({ type: 'skill_level', skillId, from: before.skillLevel, to: level });
    next.analytics = appendAnalytics(next.analytics, 'skill_level_up', { skillId, level }, now);
  }
  if (level >= 5 && before.skillLevel < 5) {
    events.push({ type: 'mastered', skillId });
    next.analytics = appendAnalytics(next.analytics, 'skill_mastered', { skillId }, now);
  }

  const globalLevel = levelForXp(totalXp(xpEvents));
  if (globalLevel > before.globalLevel) {
    events.push({ type: 'global_level', from: before.globalLevel, to: globalLevel });
  }

  const opened = newlyUnlocked(index, (id) => next.skills[id], before.statuses);
  for (const id of opened) {
    events.push({ type: 'unlocked', skillId: id, name: index.byId.get(id).name });
    next.analytics = appendAnalytics(next.analytics, 'skill_unlocked', { skillId: id }, now);
  }
  /* Attached so a single toast can say "+2 skills unlocked" rather than
   * stacking three of them (§60, several at once). */
  if (opened.length) {
    const lvl = events.find((e) => e.type === 'global_level');
    if (lvl) lvl.unlocked = opened.length;
  }

  next = touchStreak(next, now);
  return { state: next, events };
}

function labelFor(kind, skillName) {
  const verb = {
    learn: 'Lesson', quiz: 'Quiz', practice: 'Practice', challenge: 'Challenge',
    project: 'Project', assessment: 'Assessment', mastery: 'Mastery challenge',
  }[kind] || 'Activity';
  return `${skillName} ${verb.toLowerCase()}`;
}

/*
 * Streaks, counted in whole local days.
 *
 * Comparing calendar days rather than 24-hour gaps is the whole trick: a
 * learner who practises at 23:50 and again at 00:10 has been active on two
 * days and expects a 2-day streak, and one who practises at 09:00 then 20:00
 * has been active on one. Dividing timestamps by 86400000 gets both wrong for
 * anyone not on UTC, so we go through the local calendar.
 */
export function dayNumber(ms) {
  const d = new Date(ms);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function touchStreak(state, now = Date.now()) {
  const today = dayNumber(now);
  const streak = state.streak || { current: 0, longest: 0, lastDay: null };
  if (streak.lastDay === today) return state;

  const current = streak.lastDay === today - 1 ? streak.current + 1 : 1;
  return {
    ...state,
    streak: {
      current,
      longest: Math.max(streak.longest || 0, current),
      lastDay: today,
    },
  };
}

/**
 * A streak is only alive if it was touched today or yesterday. Stored streaks
 * go stale the moment the user stops opening the app, and a dashboard that
 * still boasts "14 days" after a fortnight away is lying.
 */
export function liveStreak(state, now = Date.now()) {
  const streak = state.streak || { current: 0, longest: 0, lastDay: null };
  const today = dayNumber(now);
  const alive = streak.lastDay === today || streak.lastDay === today - 1;
  return {
    current: alive ? streak.current : 0,
    longest: streak.longest || 0,
    activeToday: streak.lastDay === today,
  };
}

/**
 * Refresh time-derived numbers without any new activity. Confidence decays
 * with the clock, so it has to be recomputed on load rather than only on
 * write, or a skill left alone for a month still reports the confidence it had
 * on the day it was last touched.
 */
export function refreshDerived(state, now = Date.now()) {
  const skills = {};
  for (const [id, s] of Object.entries(state.skills || {})) {
    skills[id] = { ...s, confidence: confidenceFor(s, now) };
  }
  return { ...state, skills };
}
