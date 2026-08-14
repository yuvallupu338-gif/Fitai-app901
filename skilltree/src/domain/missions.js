/*
 * missions.js — the day's short list.
 *
 * Generated once per day and stored, not recomputed on every render. That is
 * the whole design constraint: a list that reshuffles when you refresh is not
 * a commitment, it is a slot machine. The date key is what makes it stable,
 * and it also means "did I do today's missions" is answerable.
 *
 * Intensity (§17) caps the count rather than changing the kind of work.
 * Someone on Light gets one real mission, not three trivial ones.
 */

import { reviewQueue } from './recommend.js';
import { STATUS } from './unlock.js';
import { dayNumber } from './progress.js';
import { baseXpFor } from './xp.js';

export const INTENSITY = {
  light: { count: 1, label: 'Light', blurb: 'One thing a day.' },
  normal: { count: 2, label: 'Normal', blurb: 'A couple of things a day.' },
  intensive: { count: 3, label: 'Intensive', blurb: 'Three things a day.' },
};

/*
 * Pick the day's missions.
 *
 * Deliberately mixes types rather than taking the top N from one ranking: a
 * list of three "continue X" items is not a day's work, it is one item written
 * three times. So a review comes first if anything is genuinely stale, then
 * the strongest recommendation, then something new.
 */
export function generateMissions(ctx, now = Date.now()) {
  const { state, findSkill } = ctx;
  const intensity = INTENSITY[state.settings?.intensity || 'normal'] || INTENSITY.normal;
  const missions = [];
  const used = new Set();

  const stale = reviewQueue(state, findSkill, now, 1);
  if (stale.length && intensity.count > 1) {
    missions.push({
      id: `review:${stale[0].skillId}`,
      type: 'review',
      skillId: stale[0].skillId,
      title: `Review ${stale[0].skill.name}`,
      detail: 'Confidence has slipped since you last practised.',
      xp: 15,
    });
    used.add(stale[0].skillId);
  }

  for (const rec of ctx.recommendations || []) {
    if (missions.length >= intensity.count) break;
    if (used.has(rec.skillId)) continue;

    const activity = nextActivityFor(rec.skill, state.skills[rec.skillId]);
    if (!activity) continue;

    missions.push({
      id: `activity:${activity.id}`,
      type: rec.status === STATUS.IN_PROGRESS ? 'continue' : 'start',
      skillId: rec.skillId,
      activityId: activity.id,
      title: rec.status === STATUS.IN_PROGRESS
        ? `Continue ${rec.skill.name}`
        : `Start ${rec.skill.name}`,
      detail: activity.title,
      xp: xpHintFor(activity.kind),
    });
    used.add(rec.skillId);
  }

  return missions.slice(0, intensity.count);
}

/* The engine's own table, not a transcription of it — a mission chip that
 * promises XP the engine will not pay is a small lie the learner catches. */
function xpHintFor(kind) {
  return baseXpFor(kind);
}

/**
 * The next activity a learner should do in a skill: the first one they have
 * not yet passed, in author order.
 *
 * Author order is meaningful — a lesson precedes its quiz, which precedes its
 * challenge — so this is a genuine curriculum rather than a shuffle. Once
 * everything is passed it returns the last graded activity, which is the one
 * worth repeating to push mastery up.
 */
export function nextActivityFor(skill, progress) {
  const activities = skill.activities || [];
  if (!activities.length) return null;

  const passed = new Set();
  for (const attempt of progress?.attempts || []) {
    if (attempt.passed) passed.add(attempt.activityId);
  }

  const unpassed = activities.find((a) => !passed.has(a.id));
  if (unpassed) return unpassed;

  const graded = activities.filter((a) => a.kind !== 'learn');
  return graded[graded.length - 1] || activities[activities.length - 1];
}

/**
 * Fetch today's missions, generating them if the stored set is from another
 * day. Returns the state so the caller can persist a freshly generated set —
 * the generation has to be a write, or the list is not stable.
 */
export function missionsForToday(ctx, now = Date.now()) {
  const today = dayNumber(now);
  const stored = ctx.state.missions;

  if (stored && stored.day === today) {
    return { state: ctx.state, missions: stored.items, completed: stored.completed || [] };
  }

  const items = generateMissions(ctx, now);
  const state = { ...ctx.state, missions: { day: today, items, completed: [] } };
  return { state, missions: items, completed: [] };
}

/**
 * Mark a mission done. Called from the attempt pipeline rather than from a
 * button, so a mission completes because the work happened — not because
 * someone ticked it off.
 */
export function completeMissionsFor(state, { skillId, activityId }) {
  const missions = state.missions;
  if (!missions || !missions.items?.length) return state;

  const completed = new Set(missions.completed || []);
  let changed = false;

  for (const mission of missions.items) {
    if (completed.has(mission.id)) continue;
    const hit = (mission.activityId && mission.activityId === activityId)
      || (mission.type === 'review' && mission.skillId === skillId);
    if (hit) { completed.add(mission.id); changed = true; }
  }

  if (!changed) return state;
  return { ...state, missions: { ...missions, completed: [...completed] } };
}
