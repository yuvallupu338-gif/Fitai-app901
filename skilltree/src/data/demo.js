/*
 * demo.js — a populated profile, so the whole product can be seen at once (§77).
 *
 * The important design decision: this does not write skill records. It replays
 * ~90 real attempts through `applyAttempt`, with plausible scores, spread over
 * eleven weeks of dates. Everything downstream is therefore genuinely derived —
 * the XP ledger, the level, mastery from actual scores, retention from attempts
 * separated by real gaps, streaks from real calendar days, achievements from
 * the same predicates a learner triggers, unlocks from the same gates.
 *
 * Hand-writing the numbers would have been a tenth of the code and would have
 * produced exactly the fake state §75 forbids: a profile showing level 14 with
 * an XP history that could not have produced it, and charts that disagree with
 * the totals above them.
 *
 * The scores below are deliberately uneven. A demo where everything is 95% is
 * not a demo of a learning app — the failed React state challenge and the shaky
 * async score are what make the recommendation engine and the review queue
 * visible.
 */

import { getIndex, allTrees } from './catalog.js';
import { applyAttempt } from '../domain/progress.js';
import { award } from '../domain/achievements.js';
import { computeDepths } from '../domain/graph.js';
import { emptyProfile } from '../core/store.js';

const DAY = 86400000;

/*
 * A study plan: which skills, in order, with the score profile of a real
 * learner. `score` is the mean; attempts vary around it deterministically so
 * two runs of the seed produce identical state.
 */
const WEB_PLAN = [
  { id: 'internet_basics', score: 92, days: 78 },
  { id: 'html_basics', score: 95, days: 76 },
  { id: 'semantic_html', score: 88, days: 72 },
  { id: 'html_forms', score: 84, days: 69 },
  { id: 'css_basics', score: 90, days: 66 },
  { id: 'css_box_model', score: 93, days: 63 },
  { id: 'css_flexbox', score: 86, days: 58 },
  { id: 'css_grid', score: 79, days: 52 },
  { id: 'js_basics', score: 88, days: 47 },
  { id: 'js_functions', score: 82, days: 41 },
  { id: 'js_arrays', score: 85, days: 35 },
  { id: 'js_objects', score: 80, days: 30 },
  { id: 'js_dom', score: 83, days: 24 },
  { id: 'js_events', score: 78, days: 20 },
  { id: 'git', score: 91, days: 17 },
  /* The weak spot. Failed twice before passing — this is what drives the
   * "strengthen your fundamentals" recommendation and the persistence badge. */
  { id: 'js_async', score: 62, days: 12, failFirst: 2 },
  { id: 'react_basics', score: 76, days: 6 },
  { id: 'react_props', score: 74, days: 3 },
  { id: 'react_state', score: 58, days: 1, failFirst: 1, partial: true },
];

const CALISTHENICS_PLAN = [
  { id: 'bodyweight_basics', score: 100, days: 70 },
  { id: 'incline_pushups', score: 100, days: 64 },
  { id: 'pushups', score: 100, days: 55 },
  { id: 'hanging', score: 100, days: 50 },
  { id: 'australian_pullups', score: 100, days: 44 },
  { id: 'core_control', score: 100, days: 33 },
  /* Left deliberately stale: last touched five weeks ago, so the review queue
   * and the confidence-decay notice have something real to show. */
  { id: 'diamond_pushups', score: 100, days: 36 },
  { id: 'pullups', score: 100, days: 9, partial: true },
];

/*
 * A little progress on the business side.
 *
 * The demo's stated goal is "Open a web design business", and a learner with
 * that goal and zero business progress is incoherent — the plan screen would
 * show every business skill untouched while claiming it as the destination.
 * Two skills in, one part-done, is what someone eight weeks into this actually
 * looks like.
 */
const BUSINESS_PLAN = [
  { id: 'what_you_sell', score: 100, days: 21 },
  { id: 'portfolio', score: 100, days: 11, partial: true },
];

const MATH_PLAN = [
  { id: 'arithmetic', score: 96, days: 60 },
  { id: 'fractions', score: 89, days: 54 },
  { id: 'percentages', score: 92, days: 48 },
  { id: 'powers_roots', score: 85, days: 40 },
  { id: 'basic_algebra', score: 81, days: 26 },
  { id: 'equations', score: 77, days: 14, partial: true },
];

/*
 * Deterministic jitter. Math.random would make the demo different on every
 * load, which makes a screenshot impossible to reproduce and a smoke test
 * impossible to assert against.
 */
function jitter(seed, spread) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round((x - Math.floor(x)) * spread * 2 - spread);
}

/*
 * Read a plan into a flat list of attempts, without applying any of them.
 *
 * Separated from the applying so every plan across every tree can be merged
 * and then replayed in *calendar* order — see `buildDemoProfile`.
 */
function planAttempts(treeId, plan, now) {
  const index = getIndex(treeId);
  const out = [];
  let seed = 1;

  for (const entry of plan) {
    const skill = index.byId.get(entry.id);
    if (!skill) continue;

    const activities = skill.activities || [];
    /* `partial` means still working through it — take only the first couple of
     * activities, which leaves the skill genuinely in progress rather than
     * complete-but-labelled-otherwise. */
    const take = entry.partial ? Math.min(2, activities.length) : activities.length;
    const at = now - entry.days * DAY;

    for (let i = 0; i < take; i += 1) {
      const activity = activities[i];
      seed += 1;

      /* Failures first where the plan says so, then the pass. This is what
         gives the mastery algorithm a real recency curve to work with. */
      const fails = i === 0 ? (entry.failFirst || 0) : 0;
      for (let f = 0; f < fails; f += 1) {
        out.push({
          treeId,
          at: at - (fails - f) * DAY,
          attempt: {
            skillId: entry.id,
            activityId: activity.id,
            kind: activity.kind,
            score: Math.max(20, entry.score - 30 + jitter(seed + f, 6)),
            passed: false,
            id: `demo:${activity.id}:fail${f}`,
          },
        });
      }

      const score = activity.kind === 'learn'
        ? null
        : Math.max(35, Math.min(100, entry.score + jitter(seed, 7)));

      out.push({
        treeId,
        at: at + i * 3600000,
        attempt: {
          skillId: entry.id,
          activityId: activity.id,
          kind: activity.kind,
          score,
          passed: activity.kind === 'learn' ? true : score >= 60,
          id: `demo:${activity.id}`,
        },
      });
    }
  }

  return out;
}

/**
 * Build the demo profile. Pure — returns a profile object without touching
 * storage, so the caller decides whether to install it.
 */
export function buildDemoProfile(now = Date.now()) {
  let state = { ...emptyProfile('Alex'), onboarded: true };

  /*
   * Every attempt from every plan, merged and replayed in calendar order.
   *
   * The order matters more than it looks. Applying tree by tree meant the
   * engine saw 6 May, then 12 July, then 3 June — so `touchStreak` counted
   * days out of sequence and produced a number that had to be overwritten
   * afterwards, and mastery's recency weighting was fed a history that ran
   * backwards. Sorting first means the demo goes through exactly the pipeline a
   * real learner does, and the streak, the daily-XP chart and the mastery
   * curve are all derived rather than asserted.
   */
  const timeline = [
    ...planAttempts('web', WEB_PLAN, now),
    ...planAttempts('calisthenics', CALISTHENICS_PLAN, now),
    ...planAttempts('math', MATH_PLAN, now),
    ...planAttempts('business', BUSINESS_PLAN, now),
    /*
     * A recent run of daily practice.
     *
     * Without this the demo's longest streak is three days, because the study
     * plan above puts each skill on its own date and consecutive days happen
     * only by accident. Three days does not demonstrate a streak.
     *
     * The fix is to give the demo learner an actual habit rather than to write
     * a bigger number into `streak`: eleven consecutive days of short review
     * sessions on skills they already hold. Every one is a real attempt with a
     * real score flowing through the same pipeline, so the streak, the XP
     * chart, the consistency component of mastery and the daily-XP bars all
     * agree with each other.
     */
    ...habitAttempts(now),
  ].sort((a, b) => a.at - b.at);

  /*
   * Evaluate the demo against every registered tree, not a hardcoded list.
   *
   * This named three trees while the seed plans covered four, so the demo
   * profile was judged by different rules than the same state would be judged
   * by live — `deep_diver` could not see business depth at all.
   */
  const depths = new Map();
  const treeIds = () => allTrees().map((t) => t.id);

  const depthOf = (skillId) => {
    for (const treeId of treeIds()) {
      if (!depths.has(treeId)) depths.set(treeId, computeDepths(getIndex(treeId)));
      const d = depths.get(treeId).get(skillId);
      if (d !== undefined) return d;
    }
    return null;
  };
  const treeOf = (skillId) => treeIds().find((treeId) => getIndex(treeId).byId.has(skillId)) || null;
  const requirementCount = (skillId) => {
    for (const treeId of treeIds()) {
      const skill = getIndex(treeId).byId.get(skillId);
      if (skill) return (skill.requires || []).length;
    }
    return 0;
  };
  const badgeCtx = { depthOf, treeOf, requirementCount };

  /*
   * Replay, awarding as we go.
   *
   * Awarding once at the end stamped every badge with `now`, so an eighty-day-
   * old profile displayed ten achievements all reading "Earned just now" — a
   * detail small enough to ignore and precisely the kind that tells someone the
   * data is made up. Awarding after each attempt gives every badge the date of
   * the work that earned it, because that is when it was earned.
   */
  for (const { treeId, at, attempt } of timeline) {
    const index = getIndex(treeId);
    if (!index.byId.has(attempt.skillId)) continue;
    state = applyAttempt(state, index, attempt, at).state;
    state = award(state, badgeCtx, at).state;
  }

  /* A written goal, phrased the way someone would actually say it, so the
   * demo shows the plan screen doing its job rather than an empty state. */
  state.plan = {
    goalText: 'Open a web design business',
    createdAt: now - 80 * DAY,
    minutesPerDay: 30,
  };
  state.goal = {
    treeId: 'business',
    targetSkillId: 'working_business',
    text: 'Open a web design business',
    createdAt: now - 80 * DAY,
  };

  /* The goal badges depend on the goal, which is set after the replay. */
  return award(state, badgeCtx, now - 80 * DAY).state;
}

/*
 * Eleven days of short review sessions, ending yesterday.
 *
 * Ending yesterday rather than today is deliberate: it leaves today's missions
 * undone, so the dashboard opens with something to do instead of a completed
 * list. A demo that starts finished has nothing to demonstrate.
 *
 * Rotates over skills the learner already has, which is what review actually
 * looks like, and keeps the scores high because these are not new material.
 */
function habitAttempts(now) {
  const index = getIndex('web');
  const rotation = ['js_arrays', 'js_functions', 'css_flexbox', 'js_objects', 'git'];
  const out = [];

  for (let dayBack = 11; dayBack >= 1; dayBack -= 1) {
    const skillId = rotation[(11 - dayBack) % rotation.length];
    const skill = index.byId.get(skillId);
    if (!skill) continue;

    const activities = (skill.activities || []).filter((a) => a.kind !== 'learn');
    if (!activities.length) continue;
    const activity = activities[(11 - dayBack) % activities.length];

    /* Late morning, so the local-day bucketing is unambiguous wherever the
     * demo is opened — an attempt stamped at 00:30 lands on a different day
     * either side of the date line. */
    const at = new Date(now - dayBack * DAY);
    at.setHours(10, 30, 0, 0);

    out.push({
      treeId: 'web',
      at: at.getTime(),
      attempt: {
        skillId,
        activityId: activity.id,
        kind: activity.kind,
        score: 88 + jitter(dayBack, 8),
        passed: true,
        id: `demo:habit:${dayBack}`,
      },
    });
  }

  return out;
}

