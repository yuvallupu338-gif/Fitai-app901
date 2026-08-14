/*
 * achievements.js — badges, and the rules that award them.
 *
 * Each achievement is a predicate over the whole learner state, evaluated
 * after every change. That is deliberately simple: it means an achievement can
 * never be missed because the one code path that should have awarded it did
 * not run, and it means seeded demo state arrives with the right badges
 * already unlocked rather than needing a migration.
 *
 * The cost is re-evaluating every rule on every attempt. With a few dozen
 * cheap predicates over data already in memory, that is not worth optimising.
 */

import { totalXp } from './xp.js';
import { levelForXp } from './levels.js';
import { liveStreak } from './progress.js';

/*
 * Tiers exist so the profile can show something other than a flat wall of
 * equally-weighted badges. Mastering a skill should not look the same as
 * completing one activity.
 */
export const ACHIEVEMENTS = [
  {
    id: 'first_step',
    name: 'First Step',
    tier: 'bronze',
    description: 'Complete your first activity.',
    test: (s) => countAttempts(s) >= 1,
  },
  {
    id: 'first_unlock',
    name: 'Door Opened',
    tier: 'bronze',
    description: 'Unlock a skill by meeting its requirements.',
    test: (s) => Object.keys(s.skills || {}).length >= 2,
  },
  {
    id: 'first_mastery',
    name: 'Mastered',
    tier: 'silver',
    description: 'Take a skill to level 5.',
    test: (s) => skillsAtLevel(s, 5) >= 1,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    tier: 'silver',
    description: 'Start 20 different skills.',
    test: (s) => Object.keys(s.skills || {}).length >= 20,
  },
  {
    id: 'specialist',
    name: 'Specialist',
    tier: 'gold',
    description: 'Reach level 5 in five skills.',
    test: (s) => skillsAtLevel(s, 5) >= 5,
  },
  {
    id: 'streak_7',
    name: 'Seven Days',
    tier: 'bronze',
    description: 'Practise seven days running.',
    /* Reads the stored longest, not the live current — an achievement you
     * earned in March should not vanish because you took April off. */
    test: (s) => (s.streak?.longest || 0) >= 7,
  },
  {
    id: 'streak_30',
    name: 'Thirty Days',
    tier: 'gold',
    description: 'Practise thirty days running.',
    test: (s) => (s.streak?.longest || 0) >= 30,
  },
  {
    id: 'xp_1000',
    name: 'Four Figures',
    tier: 'bronze',
    description: 'Earn 1,000 XP.',
    test: (s) => totalXp(s.xpEvents) >= 1000,
  },
  {
    id: 'xp_10000',
    name: 'Five Figures',
    tier: 'gold',
    description: 'Earn 10,000 XP.',
    test: (s) => totalXp(s.xpEvents) >= 10000,
  },
  {
    id: 'level_10',
    name: 'Level 10',
    tier: 'silver',
    description: 'Reach global level 10.',
    test: (s) => levelForXp(totalXp(s.xpEvents)) >= 10,
  },
  {
    id: 'perfectionist',
    name: 'Full Marks',
    tier: 'silver',
    description: 'Score 100% on an assessment.',
    test: (s) => everyAttempt(s).some((a) => a.score === 100 && (a.kind === 'assessment' || a.kind === 'mastery')),
  },
  {
    id: 'persistent',
    name: 'Second Attempt',
    tier: 'bronze',
    /* Deliberately rewards failing and coming back. The whole app leans on
     * retrying being normal, and celebrating only first-time passes would
     * quietly say the opposite. */
    description: 'Fail something, then pass it.',
    test: (s) => {
      for (const skill of Object.values(s.skills || {})) {
        const byActivity = new Map();
        for (const a of skill.attempts || []) {
          if (!byActivity.has(a.activityId)) byActivity.set(a.activityId, []);
          byActivity.get(a.activityId).push(a);
        }
        for (const list of byActivity.values()) {
          const failed = list.findIndex((a) => !a.passed);
          if (failed !== -1 && list.slice(failed + 1).some((a) => a.passed)) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'polymath',
    name: 'Polymath',
    tier: 'gold',
    description: 'Make progress in three different trees.',
    test: (s, ctx) => treesTouched(s, ctx).size >= 3,
  },
  {
    id: 'deep_diver',
    name: 'Deep Diver',
    tier: 'silver',
    description: 'Reach a skill ten steps into a tree.',
    test: (s, ctx) => {
      if (!ctx || !ctx.depthOf) return false;
      return Object.keys(s.skills || {}).some((id) => (ctx.depthOf(id) ?? 0) >= 9);
    },
  },
  {
    id: 'goal_set',
    name: 'Destination Chosen',
    tier: 'bronze',
    description: 'Set a goal.',
    test: (s) => !!(s.goal && s.goal.targetSkillId),
  },
  {
    id: 'goal_reached',
    name: 'Arrived',
    tier: 'gold',
    description: 'Reach the skill you set as your goal.',
    test: (s) => {
      if (!s.goal || !s.goal.targetSkillId) return false;
      return (s.skills?.[s.goal.targetSkillId]?.level || 0) >= 3;
    },
  },
];

function everyAttempt(state) {
  const out = [];
  for (const skill of Object.values(state.skills || {})) {
    for (const a of skill.attempts || []) out.push(a);
  }
  return out;
}

function countAttempts(state) {
  return everyAttempt(state).length;
}

function skillsAtLevel(state, level) {
  return Object.values(state.skills || {}).filter((s) => (s.level || 0) >= level).length;
}

function treesTouched(state, ctx) {
  const set = new Set();
  if (!ctx || !ctx.treeOf) return set;
  for (const id of Object.keys(state.skills || {})) {
    const treeId = ctx.treeOf(id);
    if (treeId) set.add(treeId);
  }
  return set;
}

/**
 * Re-evaluate every rule and return the ids that are now earned.
 *
 * `ctx` supplies the graph lookups a few rules need — which tree a skill is
 * in, how deep it sits — so this module never imports the catalog and stays
 * testable with a plain object.
 */
export function evaluate(state, ctx) {
  return ACHIEVEMENTS.filter((a) => {
    try {
      return a.test(state, ctx);
    } catch {
      /* A rule that throws on unusual state must not take the app down with
       * it — an unearned badge is a far better failure than a blank screen. */
      return false;
    }
  }).map((a) => a.id);
}

/**
 * Award anything newly earned, returning the state plus the list of what was
 * just unlocked so the UI can show it. Already-earned achievements keep their
 * original timestamp.
 */
export function award(state, ctx, now = Date.now()) {
  const earned = evaluate(state, ctx);
  const existing = state.achievements || {};
  const fresh = earned.filter((id) => !existing[id]);
  if (!fresh.length) return { state, unlocked: [] };

  const achievements = { ...existing };
  for (const id of fresh) achievements[id] = now;

  return {
    state: { ...state, achievements },
    unlocked: fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)),
  };
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
