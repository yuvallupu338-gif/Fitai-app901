/*
 * clips.index.js — clip registry with pattern-level fallback.
 *
 * Resolution order for `exercise.anim`:
 *   1. an exact clip id
 *   2. the exercise's pattern name (every pattern has a generic clip)
 *   3. a hard-coded last resort so the UI never renders an empty box
 */

import { UPPER_CLIPS } from './clips.upper.js';
import { LOWER_CLIPS } from './clips.lower.js';
import { CORE_CLIPS } from './clips.core.js';
import { STAND, SQUAT_PARALLEL } from '../core/poses.js';

export const CLIPS = Object.assign({}, UPPER_CLIPS, LOWER_CLIPS, CORE_CLIPS);

const LAST_RESORT = {
  id: 'generic',
  duration: 2600,
  hero: 0,
  props: [],
  keys: [
    { t: 0, pose: STAND },
    { t: 0.5, pose: SQUAT_PARALLEL },
    { t: 1, pose: STAND },
  ],
};

export function clipFor(exercise) {
  if (!exercise) return LAST_RESORT;
  return CLIPS[exercise.anim] || CLIPS[exercise.pattern] || LAST_RESORT;
}

export function clipById(id) {
  return CLIPS[id] || LAST_RESORT;
}

export function clipIds() {
  return Object.keys(CLIPS);
}
