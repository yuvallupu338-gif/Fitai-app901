/*
 * clips.lower.js — lower-body animation clips.
 *
 * Every clip is `{ id, duration, ground, hero, ease, props, keys }` as specified
 * in docs/CONTRACTS.md. Poses are composed with `p(BASE, {overrides})` from
 * src/core/poses.js; hands and feet that touch something are pinned with IK
 * targets so they stay put while the pelvis travels.
 *
 * House rules used throughout this file:
 *   - Feet are pinned at y 87.5 (GROUND is 88) for anything standing.
 *   - A clip either uses footPt* on EVERY key or leg* on every key. Mixing the
 *     two makes lerpPose hard-switch mid-segment and the leg pops.
 *   - Angles stay sign-continuous inside a clip (see rig.js).
 *   - t:1 reuses the exact t:0 pose object so the loop never jumps.
 */

import { solve } from '../core/rig.js';
import {
  p, STAND, SQUAT_PARALLEL, SQUAT_BOTTOM, HINGE_BOTTOM,
  LUNGE_TOP, LUNGE_BOTTOM, GLUTE_BRIDGE_DOWN, KNEELING,
} from '../core/poses.js';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.5, props: [] }, cfg);
}

/** Where the shoulder joint of a pose ends up — loads are placed relative to it. */
function shoulderOf(pose) {
  return solve(pose).shoulder;
}

/**
 * Barbell across the traps (back squat, good morning).
 * Both hands sit on ONE horizontal line so the bar renders level; the far hand
 * is behind the shoulder (elbow drops back), the near hand in front of it.
 */
function backRack(pose) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx - 8.8, y: sy - 0.5, bend: 1 },
    handR: { x: sx + 8.2, y: sy - 0.5, bend: -1 },
    load: 'barbell',
  });
}

/** Barbell in the front rack — bar on the delts, elbows tucked down and in. */
function frontRack(pose) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx + 3, y: sy - 1.5, bend: -1 },
    handR: { x: sx + 8, y: sy - 1.5, bend: -1 },
    load: 'barbell',
  });
}

/** Both hands cupped at the sternum — goblet hold. Elbows hang straight down. */
function chestHold(pose, load) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx + 4, y: sy + 2.5, bend: -1 },
    handR: { x: sx + 4.8, y: sy + 2.5, bend: -1 },
    load,
  });
}

/**
 * Straight arms hanging from the shoulders holding a load (deadlift, RDL, shrug
 * grip). `drop` is capped at the arm's reach so the arms never fold — the load
 * is drawn at the hands, so the bar always lands wherever the fingers do.
 */
function hangHold(pose, drop, load) {
  const [sx, sy] = shoulderOf(pose);
  const d = Math.min(drop, 22.9);
  return p(pose, {
    handL: { x: sx - 4.5, y: sy + d, bend: -1 },
    handR: { x: sx + 4.5, y: sy + d, bend: -1 },
    load: load || 'barbell',
  });
}

/* ------------------------------------------------------------------ *
 * Squat family — feet pinned at 51 / 53, pelvis travels down AND back
 * ------------------------------------------------------------------ */

const SQ_FEET = {
  footPtL: { x: 51, y: 87.5, bend: 1 },
  footPtR: { x: 53, y: 87.5, bend: 1 },
};

/* Built off SQUAT_PARALLEL so the key set (footPt IK + FK arms) matches the
   rest of the family exactly — same feet, standing pelvis. */
const SQ_TOP = p(SQUAT_PARALLEL, Object.assign({
  x: 51.5, y: 57.4, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
}, SQ_FEET));

/* Quarter squat — the brake point on the way down. */
const SQ_QUARTER = p(SQUAT_PARALLEL, Object.assign({
  x: 49.5, y: 61.5, spine: 80, head: 86,
  armL: [-30, -40], armR: [-36, -46],
}, SQ_FEET));

const SQ_PAR = p(SQUAT_PARALLEL, SQ_FEET);
const SQ_BOT = p(SQUAT_BOTTOM, SQ_FEET);

/* Box squat: sit back onto the box, feet further forward than a free squat. */
const BOX_PROP = { type: 'box', x: 40, y: 74, w: 20, h: 14 };
const BOX_FEET = {
  footPtL: { x: 52, y: 87.5, bend: 1 },
  footPtR: { x: 54, y: 87.5, bend: 1 },
};
const BOXSQ_TOP = p(SQUAT_PARALLEL, Object.assign({
  x: 50, y: 58, spine: 86, head: 88,
  armL: [-84, -86], armR: [-96, -94],
}, BOX_FEET));
const BOXSQ_MID = p(SQUAT_PARALLEL, Object.assign({
  x: 45.5, y: 66, spine: 66, head: 80,
  armL: [10, 6], armR: [4, 0],
}, BOX_FEET));
const BOXSQ_SIT = p(SQUAT_PARALLEL, Object.assign({
  x: 41, y: 72.5, spine: 62, head: 78,
  armL: [12, 8], armR: [6, 2],
}, BOX_FEET));

/* Wall sit: back flat on the wall, thighs horizontal, shins vertical. */
const WALL_PROP = { type: 'wall', x: 30, y0: 28, y1: 88 };
const WALLSIT = {
  x: 33, y: 72, spine: 88, head: 86,
  armL: [-70, -80], armR: [-76, -86],
  footPtL: { x: 47.5, y: 87.5, bend: 1 },
  footPtR: { x: 49.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
/* Holds still need to breathe — one unit of drift, nothing more. */
const WALLSIT_BREATHE = p(WALLSIT, { y: 73, spine: 87, head: 85, armL: [-68, -78], armR: [-74, -84] });

export const LOWER_CLIPS = {
  /* Pattern fallback for `squat` as well as the bodyweight squat itself. */
  squat: clip({
    id: 'squat',
    duration: 3000,
    hero: 0.5,
    keys: [
      { t: 0, pose: SQ_TOP },
      { t: 0.18, pose: SQ_QUARTER },
      { t: 0.4, pose: SQ_PAR },
      { t: 0.5, pose: SQ_BOT, ease: 'out' },
      { t: 0.6, pose: SQ_BOT },
      { t: 1, pose: SQ_TOP },
    ],
  }),

  goblet_squat: clip({
    id: 'goblet_squat',
    duration: 3200,
    hero: 0.52,
    keys: [
      { t: 0, pose: chestHold(SQ_TOP, 'kettlebell') },
      { t: 0.22, pose: chestHold(SQ_QUARTER, 'kettlebell') },
      { t: 0.44, pose: chestHold(SQ_PAR, 'kettlebell') },
      { t: 0.55, pose: chestHold(SQ_BOT, 'kettlebell'), ease: 'out' },
      { t: 0.64, pose: chestHold(SQ_BOT, 'kettlebell') },
      { t: 1, pose: chestHold(SQ_TOP, 'kettlebell') },
    ],
  }),

  back_squat: clip({
    id: 'back_squat',
    duration: 3400,
    hero: 0.52,
    keys: [
      { t: 0, pose: backRack(SQ_TOP) },
      { t: 0.2, pose: backRack(SQ_QUARTER) },
      { t: 0.42, pose: backRack(SQ_PAR) },
      { t: 0.54, pose: backRack(SQ_BOT), ease: 'out' },
      { t: 0.62, pose: backRack(SQ_BOT) },
      { t: 1, pose: backRack(SQ_TOP) },
    ],
  }),

  front_squat: clip({
    id: 'front_squat',
    duration: 3200,
    hero: 0.52,
    keys: [
      { t: 0, pose: frontRack(SQ_TOP) },
      { t: 0.2, pose: frontRack(SQ_QUARTER) },
      { t: 0.42, pose: frontRack(SQ_PAR) },
      { t: 0.54, pose: frontRack(SQ_BOT), ease: 'out' },
      { t: 0.62, pose: frontRack(SQ_BOT) },
      { t: 1, pose: frontRack(SQ_TOP) },
    ],
  }),

  box_squat: clip({
    id: 'box_squat',
    duration: 3400,
    hero: 0.55,
    props: [BOX_PROP],
    keys: [
      { t: 0, pose: BOXSQ_TOP },
      { t: 0.24, pose: BOXSQ_MID },
      { t: 0.44, pose: BOXSQ_SIT, ease: 'out' },
      { t: 0.58, pose: BOXSQ_SIT },
      { t: 0.78, pose: BOXSQ_MID },
      { t: 1, pose: BOXSQ_TOP },
    ],
  }),

  wall_sit: clip({
    id: 'wall_sit',
    duration: 4200,
    hero: 0,
    props: [WALL_PROP],
    keys: [
      { t: 0, pose: WALLSIT },
      { t: 0.5, pose: WALLSIT_BREATHE },
      { t: 1, pose: WALLSIT },
    ],
  }),

  /* __APPEND__ */
};
