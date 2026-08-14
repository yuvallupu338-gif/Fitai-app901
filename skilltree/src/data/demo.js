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

import { getIndex } from './catalog.js';
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

function runPlan(state, treeId, plan, now) {
  const index = getIndex(treeId);
  let next = state;
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
        const applied = applyAttempt(next, index, {
          skillId: entry.id,
          activityId: activity.id,
          kind: activity.kind,
          score: Math.max(20, entry.score - 30 + jitter(seed + f, 6)),
          passed: false,
          id: `demo:${activity.id}:fail${f}`,
        }, at - (fails - f) * DAY);
        next = applied.state;
      }

      const score = activity.kind === 'learn'
        ? null
        : Math.max(35, Math.min(100, entry.score + jitter(seed, 7)));

      const applied = applyAttempt(next, index, {
        skillId: entry.id,
        activityId: activity.id,
        kind: activity.kind,
        score,
        passed: activity.kind === 'learn' ? true : score >= 60,
        id: `demo:${activity.id}`,
      }, at + i * 3600000);
      next = applied.state;
    }
  }

  return next;
}

/**
 * Build the demo profile. Pure — returns a profile object without touching
 * storage, so the caller decides whether to install it.
 */
export function buildDemoProfile(now = Date.now()) {
  let state = { ...emptyProfile('Alex'), onboarded: true };

  state = runPlan(state, 'web', WEB_PLAN, now);
  state = runPlan(state, 'calisthenics', CALISTHENICS_PLAN, now);
  state = runPlan(state, 'math', MATH_PLAN, now);

  /*
   * A recent run of daily practice.
   *
   * Without this the demo's longest streak is three days, because the study
   * plan above puts each skill on its own date and consecutive days happen only
   * by accident. Three days does not demonstrate a streak.
   *
   * The fix is to give the demo learner an actual habit rather than to write a
   * bigger number into `streak`: eleven consecutive days of short review
   * sessions on skills they already hold. Every one is a real attempt with a
   * real score that flows through the same pipeline, so the streak, the XP
   * chart, the consistency component of mastery and the daily-XP bars all agree
   * with each other. Writing `longest: 21` by hand would have shown a streak the
   * ledger could not account for, which is the kind of demo data that falls
   * apart the moment anyone clicks through to the chart.
   */
  state = runDailyHabit(state, now);

  state.goal = {
    treeId: 'web',
    targetSkillId: 'fullstack',
    text: 'Full Stack Developer',
    createdAt: now - 80 * DAY,
  };

  /*
   * The streak is the one thing a replay cannot produce honestly. Attempts are
   * applied in plan order, not calendar order, so `touchStreak` sees the days
   * out of sequence and lands on a number that means nothing. Rather than
   * leaving a wrong value, it is computed here from the distinct calendar days
   * the seeded attempts actually fall on — which is the same thing the live
   * streak counts, just derived after the fact.
   */
  state.streak = streakFromAttempts(state, now);

  const depths = new Map();
  const depthOf = (skillId) => {
    for (const treeId of ['web', 'math', 'calisthenics']) {
      if (!depths.has(treeId)) depths.set(treeId, computeDepths(getIndex(treeId)));
      const d = depths.get(treeId).get(skillId);
      if (d !== undefined) return d;
    }
    return null;
  };
  const treeOf = (skillId) => {
    for (const treeId of ['web', 'math', 'calisthenics']) {
      if (getIndex(treeId).byId.has(skillId)) return treeId;
    }
    return null;
  };

  const withBadges = award(state, { depthOf, treeOf }, now);
  return withBadges.state;
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
function runDailyHabit(state, now) {
  const index = getIndex('web');
  const rotation = ['js_arrays', 'js_functions', 'css_flexbox', 'js_objects', 'git'];
  let next = state;

  for (let dayBack = 11; dayBack >= 1; dayBack -= 1) {
    const skillId = rotation[(11 - dayBack) % rotation.length];
    const skill = index.byId.get(skillId);
    if (!skill || !next.skills[skillId]) continue;

    const activities = (skill.activities || []).filter((a) => a.kind !== 'learn');
    if (!activities.length) continue;
    const activity = activities[(11 - dayBack) % activities.length];

    /* Late morning, so the local-day bucketing is unambiguous wherever the
     * demo is opened — an attempt stamped at 00:30 lands on a different day
     * either side of the date line. */
    const at = new Date(now - dayBack * DAY);
    at.setHours(10, 30, 0, 0);

    const applied = applyAttempt(next, index, {
      skillId,
      activityId: activity.id,
      kind: activity.kind,
      score: 88 + jitter(dayBack, 8),
      passed: true,
      id: `demo:habit:${dayBack}`,
    }, at.getTime());
    next = applied.state;
  }

  return next;
}

/*
 * Distinct local days with activity, folded into a current and longest run.
 * Local days rather than UTC, for the same reason `dayNumber` uses them: a
 * learner at 23:50 and 00:10 has been active twice.
 */
function streakFromAttempts(state, now) {
  const days = new Set();
  for (const skill of Object.values(state.skills)) {
    for (const attempt of skill.attempts || []) {
      const d = new Date(attempt.at);
      days.add(Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY));
    }
  }

  const sorted = [...days].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous = null;

  for (const day of sorted) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  const today = Math.floor((new Date(now).getTime() - new Date(now).getTimezoneOffset() * 60000) / DAY);
  const last = sorted[sorted.length - 1];
  const alive = last === today || last === today - 1;

  return { current: alive ? run : 0, longest, lastDay: last ?? null };
}
