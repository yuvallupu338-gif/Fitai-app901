/*
 * clips.core.js — core, conditioning, mobility and carry animation clips.
 *
 * Shape is `{ id, duration, ground, hero, ease, props, keys }` exactly as
 * docs/CONTRACTS.md specifies. Poses are composed with `p(BASE, {overrides})`
 * from src/core/poses.js.
 *
 * House rules used throughout this file:
 *   - A limb uses ONE representation (footPt*/hand* IK, or leg*/arm* FK) in
 *     EVERY key of a clip. lerpPose hard-switches when a key adds or drops a
 *     target, which pops the limb, so the choice is made per clip.
 *   - Anything touching the floor is pinned at y 87.5 (GROUND is 88).
 *   - Isometric holds are never frozen: the torso rotates about the fixed
 *     shoulder (see `hips()`), which keeps pinned hands and feet in place while
 *     the hips breathe by a unit or two.
 *   - Angles stay sign-continuous inside a clip (see rig.js).
 *   - t:1 reuses the exact t:0 pose object so the loop never jumps.
 */

import { solve } from '../core/rig.js';
import {
  p, STAND, SUPINE, HOLLOW, PLANK_TOP, SQUAT_BOTTOM, DIP_TOP,
  HANG, HANG_TUCK, HANG_LRAISE,
} from '../core/poses.js';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const FLOOR = 87.5;
const SHOULDER_UP = 26 * 0.88; // pelvis -> shoulder distance along the spine

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.5, props: [] }, cfg);
}

/**
 * Pelvis that puts the shoulder joint exactly at (sx, sy) for a given spine
 * angle. Rotating a hold about its own shoulder is the only way to breathe
 * without dragging pinned hands off the floor.
 */
function hips(sx, sy, spine) {
  const r = (spine * Math.PI) / 180;
  return { x: sx - SHOULDER_UP * Math.cos(r), y: sy + SHOULDER_UP * Math.sin(r), spine };
}

/** Where the shoulder joint of a pose ends up — hands are placed relative to it. */
function shoulderOf(pose) {
  return solve(pose).shoulder;
}

/** Hands folded on the chest, placed in the torso's own frame (crunch, sit-up). */
function chestHands(pose, bend) {
  const [sx, sy] = shoulderOf(pose);
  const r = ((pose.spine === undefined ? 90 : pose.spine) * Math.PI) / 180;
  const bx = -Math.cos(r); const by = Math.sin(r);   // shoulder -> pelvis
  const fx = -Math.sin(r); const fy = -Math.cos(r);  // straight out of the chest
  return p(pose, {
    handL: { x: sx + 6.6 * bx + 4.0 * fx, y: sy + 6.6 * by + 4.0 * fy, bend },
    handR: { x: sx + 5.4 * bx + 5.4 * fx, y: sy + 5.4 * by + 5.4 * fy, bend },
  });
}

/** Straight arms hanging at the sides holding a load — carries. */
function sideLoad(pose, drop, load) {
  const [sx, sy] = shoulderOf(pose);
  const d = Math.min(drop, 22.9);
  return p(pose, {
    handL: { x: sx - 2.6, y: sy + d, bend: -1 },
    handR: { x: sx + 2.6, y: sy + d, bend: -1 },
    load,
  });
}

const MAT_WIDE = { type: 'mat', x: 44, w: 76 };

/* ================================================================== *
 * 1. PLANKS — anti-extension holds.
 * The shoulder is the anchor: hands stay welded to the floor while the
 * spine angle breathes the hips up and down by about a unit.
 * ================================================================== */

/* High plank. Shoulder stacked over the hands, legs clamped straight. */
function highPlank(spine, headOff, tremor) {
  return p(PLANK_TOP, Object.assign(hips(57.4, 64, spine), {
    head: spine - 8 + headOff,
    handL: { x: 56.4, y: FLOOR, bend: -1 },
    handR: { x: 58.4, y: FLOOR, bend: -1 },
    legL: undefined,
    legR: undefined,
    footPtL: { x: 8.0, y: 84.9, bend: -1 },
    footPtR: { x: 9.2, y: 85.1, bend: -1 },
    footL: -28 + tremor,
    footR: -30 + tremor,
  }));
}

const PLK_MID = highPlank(23, 0, 0);
const PLK_IN = highPlank(21.6, 1, 0.8);   // ribs fill, hips float up
const PLK_OUT = highPlank(24.4, -1, -0.8); // breath out, hips settle

const plank = clip({
  id: 'plank',
  duration: 4200,
  hero: 0,
  props: [{ type: 'mat', x: 34, w: 62 }],
  keys: [
    { t: 0, pose: PLK_MID },
    { t: 0.3, pose: PLK_IN },
    { t: 0.62, pose: PLK_OUT },
    { t: 1, pose: PLK_MID },
  ],
});

/* Forearm plank. Elbow lands under the shoulder on the floor, forearm flat. */
function forearmPlank(sx, sy, spine, headOff, tremor) {
  return p(PLANK_TOP, Object.assign(hips(sx, sy, spine), {
    head: spine - 10 + headOff,
    handL: { x: sx + 10.5, y: FLOOR - 0.1, bend: -1 },
    handR: { x: sx + 11.5, y: FLOOR, bend: -1 },
    legL: undefined,
    legR: undefined,
    footPtL: { x: sx - 52.4, y: 84.6, bend: -1 },
    footPtR: { x: sx - 51.2, y: 84.8, bend: -1 },
    footL: -25 + tremor,
    footR: -27 + tremor,
  }));
}

const FPL_MID = forearmPlank(60, 75.7, 14, 0, 0);
const FPL_IN = forearmPlank(60, 75.7, 12.8, 1, 0.7);
const FPL_OUT = forearmPlank(60, 75.7, 15.2, -1, -0.7);

const forearm_plank = clip({
  id: 'forearm_plank',
  duration: 4600,
  hero: 0,
  props: [{ type: 'mat', x: 38, w: 68 }],
  keys: [
    { t: 0, pose: FPL_MID },
    { t: 0.32, pose: FPL_IN },
    { t: 0.66, pose: FPL_OUT },
    { t: 1, pose: FPL_MID },
  ],
});

/* Generic anti-extension fallback — same job, its own body position so it does
   not read as a copy of `forearm_plank`. */
const AEX_MID = forearmPlank(57, 75.2, 15.5, 0, 0);
const AEX_IN = forearmPlank(57, 75.2, 14.2, 1.5, 1);
const AEX_OUT = forearmPlank(57, 75.2, 16.8, -1.5, -1);

const core_antiextension = clip({
  id: 'core_antiextension',
  duration: 4800,
  hero: 0,
  props: [{ type: 'mat', x: 36, w: 68 }],
  keys: [
    { t: 0, pose: AEX_MID },
    { t: 0.34, pose: AEX_IN },
    { t: 0.68, pose: AEX_OUT },
    { t: 1, pose: AEX_MID },
  ],
});

/* Side plank. Bottom (far) elbow on the floor, top arm reaching for the
   ceiling — the raised arm is the near limb so it draws bright. */
function sidePlank(spine, armLift, tremor) {
  return p(PLANK_TOP, Object.assign(hips(60, 75.5, spine), {
    head: spine + 2,
    handL: { x: 71.5, y: FLOOR, bend: -1 },
    handR: undefined,
    armR: [92 + armLift, 90 + armLift],
    legL: undefined,
    legR: undefined,
    footPtL: { x: 7.6, y: 85.1, bend: -1 },
    footPtR: { x: 7.5, y: 84.4, bend: -1 },
    footL: -18 + tremor,
    footR: -16 + tremor,
  }));
}

const SPL_MID = sidePlank(11, 0, 0);
const SPL_UP = sidePlank(9.8, 1.5, 0.8);
const SPL_DOWN = sidePlank(12.2, -1.5, -0.8);

const side_plank = clip({
  id: 'side_plank',
  duration: 4400,
  hero: 0,
  props: [{ type: 'mat', x: 38, w: 68 }],
  keys: [
    { t: 0, pose: SPL_MID },
    { t: 0.32, pose: SPL_UP },
    { t: 0.66, pose: SPL_DOWN },
    { t: 1, pose: SPL_MID },
  ],
});

/* ================================================================== *
 * 2. HOLLOW BODY
 * ================================================================== */

const HOL_MID = p(HOLLOW, {});
const HOL_IN = p(HOLLOW, {
  y: 83.4, spine: 27.5, head: 33.5,
  armL: [48, 46], armR: [42, 40],
  legL: [173, 176], legR: [171, 174],
});
const HOL_OUT = p(HOLLOW, {
  y: 84.5, spine: 25, head: 31,
  armL: [44.5, 42.5], armR: [38.5, 36.5],
  legL: [169.5, 172.5], legR: [167.5, 170.5],
});

const hollow_hold = clip({
  id: 'hollow_hold',
  duration: 4000,
  hero: 0,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: HOL_MID },
    { t: 0.34, pose: HOL_IN },
    { t: 0.68, pose: HOL_OUT },
    { t: 1, pose: HOL_MID },
  ],
});

/* Rocking keeps the banana shape and pivots it about the low back: shoulders
   drop as the legs rise, then the other way. */
const ROCK_BACK = p(HOLLOW, {
  y: 84.6, spine: 20, head: 26,
  armL: [40, 38], armR: [34, 32],
  legL: [162, 166], legR: [160, 164],
});
const ROCK_FWD = p(HOLLOW, {
  y: 83.4, spine: 33, head: 39,
  armL: [52, 50], armR: [46, 44],
  legL: [178, 181], legR: [176, 179],
});

const hollow_rock = clip({
  id: 'hollow_rock',
  duration: 2000,
  hero: 0.25,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: HOL_MID },
    { t: 0.25, pose: ROCK_BACK },
    { t: 0.5, pose: HOL_MID },
    { t: 0.75, pose: ROCK_FWD },
    { t: 1, pose: HOL_MID },
  ],
});
