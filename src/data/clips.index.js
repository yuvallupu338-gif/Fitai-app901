/*
 * clips.index.js — clip registry with per-exercise and pattern-level fallback.
 *
 * Resolution order for an exercise:
 *   1. a clip keyed by the exercise's OWN id — the bespoke animation
 *   2. the clip named in exercise.anim — a shared family animation
 *   3. the exercise's pattern name — the generic fallback
 *   4. a hard-coded last resort so the UI never renders an empty box
 *
 * Checking the exercise id first is what lets the clips.x*.js batches give an
 * exercise its own animation without editing the exercise database at all.
 */

import { UPPER_CLIPS } from './clips.upper.js';
import { LOWER_CLIPS } from './clips.lower.js';
import { CORE_CLIPS } from './clips.core.js';
import { X01_CLIPS } from './clips.x01.js';
import { X02_CLIPS } from './clips.x02.js';
import { X03_CLIPS } from './clips.x03.js';
import { X04_CLIPS } from './clips.x04.js';
import { X05_CLIPS } from './clips.x05.js';
import { X06_CLIPS } from './clips.x06.js';
import { X07_CLIPS } from './clips.x07.js';
import { X08_CLIPS } from './clips.x08.js';
import { X09_CLIPS } from './clips.x09.js';
import { X10_CLIPS } from './clips.x10.js';
import { X11_CLIPS } from './clips.x11.js';
import { X12_CLIPS } from './clips.x12.js';
import { X13_CLIPS } from './clips.x13.js';
import { STAND, SQUAT_PARALLEL } from '../core/poses.js';

export const CLIPS = Object.assign({}, UPPER_CLIPS, LOWER_CLIPS, CORE_CLIPS);

/** Bespoke per-exercise clips, keyed by exercise id. These win over CLIPS. */
export const BY_EXERCISE = Object.assign({},
  X01_CLIPS, X02_CLIPS, X03_CLIPS, X04_CLIPS, X05_CLIPS, X06_CLIPS,
  X07_CLIPS, X08_CLIPS, X09_CLIPS, X10_CLIPS, X11_CLIPS, X12_CLIPS,
  X13_CLIPS);

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
  return BY_EXERCISE[exercise.id]
    || CLIPS[exercise.anim]
    || CLIPS[exercise.pattern]
    || LAST_RESORT;
}

export function clipById(id) {
  return BY_EXERCISE[id] || CLIPS[id] || LAST_RESORT;
}

export function clipIds() {
  return Object.keys(CLIPS).concat(Object.keys(BY_EXERCISE));
}

/** How many exercises have an animation of their own vs. a shared one. */
export function coverage(exercises) {
  let own = 0;
  let shared = 0;
  let generic = 0;
  for (const e of exercises) {
    if (BY_EXERCISE[e.id]) own++;
    else if (CLIPS[e.anim]) shared++;
    else generic++;
  }
  return { own, shared, generic, total: exercises.length };
}
