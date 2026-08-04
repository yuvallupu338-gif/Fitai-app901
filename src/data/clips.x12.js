/* clips.x12.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Mobility and warm-up drills. These are the clips a user sees FIRST, in the
 * warm-up, every single session — and they are the ones most likely to come out
 * as near-identical small wiggles, because none of them is a loaded rep with an
 * obvious top and bottom.
 *
 * So every clip here commits to one large, unmistakable range of motion, and
 * runs slow. A stretch that looks like standing still has failed at its job,
 * which is to be copied from the picture without reading the name.
 */

import { p, STAND, GLUTE_BRIDGE_DOWN, GLUTE_BRIDGE_UP, HANG } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 4200, hero: 0.25, ease: 'inOut', props: [] }, o);

/* Standing rotation: the arms swing right across the body, feet planted. */
const TWIST_L = p(STAND, { spine: 92, head: 96, armL: [10, 20], armR: [4, 14] });
const TWIST_MID = p(STAND, { spine: 90, head: 90, armL: [-30, -20], armR: [-36, -26] });
const TWIST_R = p(STAND, { spine: 88, head: 84, armL: [-160, -170], armR: [-166, -176] });

/*
 * Leg swings. Both keep one leg planted and move only the other, so the two
 * must not be the same clip: the FRONT version swings the leg forward and back
 * through a big arc, and the SIDE version sweeps it across the body while the
 * torso stays square. Drawn side-on, "across" reads as a much shorter arc with
 * the knee tucking in, which is the honest projection of that movement.
 */
const swingBase = (over) => p(STAND, Object.assign({
  x: 44,
  armL: [-30, -26], armR: [-150, -154],
  legL: [-90, -90], footL: 2,
}, over || {}));

const SWING_F_BACK = swingBase({ legR: [-130, -128], footR: -46 });
const SWING_F_MID = swingBase({ legR: [-92, -90], footR: 2 });
const SWING_F_FWD = swingBase({ legR: [-40, -36], footR: 54 });

const SWING_S_IN = swingBase({ legR: [-74, -104], footR: -14, spine: 92 });
const SWING_S_MID = swingBase({ legR: [-92, -90], footR: 2, spine: 90 });
const SWING_S_OUT = swingBase({ legR: [-108, -76], footR: 18, spine: 88 });

/* Ankle rocks: the knee drives forward over a planted foot and comes back. */
const ANKLE_BACK = {
  x: 46, y: 60, spine: 84, head: 84,
  armL: [-40, -30], armR: [-46, -36],
  footPtL: { x: 34, y: 87.5, bend: 1 }, footPtR: { x: 56, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const ANKLE_FWD = {
  x: 50, y: 66, spine: 78, head: 78,
  armL: [-30, -20], armR: [-36, -26],
  footPtL: { x: 34, y: 87.5, bend: 1 }, footPtR: { x: 56, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* Wrist prep: on all fours, rocking the shoulders over planted hands. */
const WRIST_BACK = {
  x: 34, y: 68, spine: 26, head: 20,
  handL: { x: 60, y: 87.5, bend: -1 }, handR: { x: 63, y: 87.5, bend: -1 },
  legL: [-108, 176], legR: [-112, 172], footL: 170, footR: 170,
};
const WRIST_FWD = {
  x: 40, y: 68, spine: 22, head: 16,
  handL: { x: 60, y: 87.5, bend: -1 }, handR: { x: 63, y: 87.5, bend: -1 },
  legL: [-112, 174], legR: [-116, 170], footL: 170, footR: 170,
};

/* Toy soldier: a straight-leg kick up to the opposite hand, walking. */
const SOLDIER_DOWN = p(STAND, { x: 44, armL: [-60, -50], armR: [-120, -130] });
const SOLDIER_KICK = p(STAND, {
  x: 44, spine: 84, head: 80,
  armL: [-20, -14], armR: [-26, -20],
  legL: [-92, -90], legR: [-14, -10], footL: 2, footR: 62,
});

/* Kneeling hip flexor stretch: front foot planted, rear knee down, hips press
   forward. The tall torso and the long line from rear knee to shoulder are what
   make it a stretch rather than a lunge. */
const HIPFLEX_A = {
  x: 48, y: 66, spine: 92, head: 92,
  armL: [-70, -60], armR: [-76, -66],
  footPtL: { x: 66, y: 87.5, bend: 1 },
  legR: [-150, 178], footL: 2, footR: 168,
};
const HIPFLEX_B = {
  x: 52, y: 68, spine: 96, head: 98,
  armL: [-60, -46], armR: [-66, -52],
  footPtL: { x: 66, y: 87.5, bend: 1 },
  legR: [-156, 174], footL: 2, footR: 168,
};

/* Child's pose: hips back to the heels, arms long on the floor ahead. */
const CHILD_A = {
  x: 40, y: 76, spine: 14, head: 8,
  handL: { x: 82, y: 87, bend: -1 }, handR: { x: 85, y: 87, bend: -1 },
  legL: [-150, 178], legR: [-154, 174], footL: 170, footR: 170,
};
const CHILD_B = {
  x: 36, y: 78, spine: 10, head: 4,
  handL: { x: 86, y: 87, bend: -1 }, handR: { x: 89, y: 87, bend: -1 },
  legL: [-154, 176], legR: [-158, 172], footL: 170, footR: 170,
};

/* World's greatest stretch: a deep lunge, then the torso opens upward. */
const WGS_LUNGE = {
  x: 44, y: 70, spine: 34, head: 26,
  handL: { x: 62, y: 87, bend: -1 }, handR: { x: 66, y: 87, bend: -1 },
  footPtL: { x: 70, y: 87.5, bend: 1 },
  legR: [-152, 176], footL: 2, footR: 168,
};
const WGS_OPEN = {
  x: 44, y: 70, spine: 62, head: 70,
  handL: { x: 62, y: 87, bend: -1 }, armR: [70, 84],
  footPtL: { x: 70, y: 87.5, bend: 1 },
  legR: [-152, 176], footL: 2, footR: 168,
};

/* Band pull-down for the scapulae: arms overhead, then pulled down and wide. */
const SCAP_UP = p(STAND, { armL: [96, 98], armR: [84, 86] });
const SCAP_DOWN = p(STAND, { spine: 92, armL: [140, 156], armR: [136, 152] });

/* Passive hang. The difference from a dead hang is real and worth drawing: here
   the shoulders are allowed to SHRUG up by the ears and the body hangs longer,
   where an active hang pulls the scapulae down and rides higher. So this figure
   sits noticeably lower under the same bar, with the head down between the arms,
   and sways slowly instead of holding a position. */
const HANG_A = p(HANG, { y: 65, head: 84 });
const HANG_B = p(HANG, { y: 65.5, head: 84, legL: [-82, -86], legR: [-98, -94] });

export const X12_CLIPS = {
  torso_twist_standing: clip({
    id: 'torso_twist_standing', duration: 4000,
    keys: [
      { t: 0, pose: TWIST_L }, { t: 0.28, pose: TWIST_MID },
      { t: 0.52, pose: TWIST_R }, { t: 0.78, pose: TWIST_MID },
      { t: 1, pose: TWIST_L },
    ],
  }),

  leg_swings_front: clip({
    id: 'leg_swings_front', duration: 3400,
    keys: [
      { t: 0, pose: SWING_F_BACK }, { t: 0.3, pose: SWING_F_MID },
      { t: 0.55, pose: SWING_F_FWD }, { t: 0.8, pose: SWING_F_MID },
      { t: 1, pose: SWING_F_BACK },
    ],
  }),

  leg_swings_side: clip({
    id: 'leg_swings_side', duration: 3400,
    keys: [
      { t: 0, pose: SWING_S_IN }, { t: 0.3, pose: SWING_S_MID },
      { t: 0.55, pose: SWING_S_OUT }, { t: 0.8, pose: SWING_S_MID },
      { t: 1, pose: SWING_S_IN },
    ],
  }),

  ankle_rocks: clip({
    id: 'ankle_rocks', duration: 3200,
    keys: [
      { t: 0, pose: ANKLE_BACK }, { t: 0.42, pose: ANKLE_FWD },
      { t: 0.62, pose: ANKLE_FWD }, { t: 1, pose: ANKLE_BACK },
    ],
  }),

  wrist_prep: clip({
    id: 'wrist_prep', duration: 3600,
    props: [{ type: 'mat', x: 50, w: 60 }],
    keys: [
      { t: 0, pose: WRIST_BACK }, { t: 0.42, pose: WRIST_FWD },
      { t: 0.62, pose: WRIST_FWD }, { t: 1, pose: WRIST_BACK },
    ],
  }),

  toy_soldier: clip({
    id: 'toy_soldier', duration: 3000,
    keys: [
      { t: 0, pose: SOLDIER_DOWN }, { t: 0.44, pose: SOLDIER_KICK },
      { t: 0.6, pose: SOLDIER_KICK }, { t: 1, pose: SOLDIER_DOWN },
    ],
  }),

  glute_bridge_activation: clip({
    id: 'glute_bridge_activation', duration: 3600,
    props: [{ type: 'mat', x: 44, w: 62 }],
    keys: [
      { t: 0, pose: GLUTE_BRIDGE_DOWN }, { t: 0.4, pose: GLUTE_BRIDGE_UP },
      { t: 0.64, pose: GLUTE_BRIDGE_UP }, { t: 1, pose: GLUTE_BRIDGE_DOWN },
    ],
  }),

  hip_flexor_stretch_kneeling: clip({
    id: 'hip_flexor_stretch_kneeling', duration: 4600, hero: 0.5,
    props: [{ type: 'mat', x: 48, w: 60 }],
    keys: [
      { t: 0, pose: HIPFLEX_A }, { t: 0.5, pose: HIPFLEX_B }, { t: 1, pose: HIPFLEX_A },
    ],
  }),

  childs_pose_reach: clip({
    id: 'childs_pose_reach', duration: 4800, hero: 0.5,
    props: [{ type: 'mat', x: 50, w: 64 }],
    keys: [
      { t: 0, pose: CHILD_A }, { t: 0.5, pose: CHILD_B }, { t: 1, pose: CHILD_A },
    ],
  }),

  worlds_greatest_stretch: clip({
    id: 'worlds_greatest_stretch', duration: 4600,
    props: [{ type: 'mat', x: 50, w: 62 }],
    keys: [
      { t: 0, pose: WGS_LUNGE }, { t: 0.44, pose: WGS_OPEN },
      { t: 0.68, pose: WGS_OPEN }, { t: 1, pose: WGS_LUNGE },
    ],
  }),

  band_scap_pulldown: clip({
    id: 'band_scap_pulldown', duration: 3200,
    props: [{ type: 'band', x0: 40, y0: 20, x1: 60, y1: 20, sag: 3 }],
    keys: [
      { t: 0, pose: SCAP_UP }, { t: 0.42, pose: SCAP_DOWN },
      { t: 0.62, pose: SCAP_DOWN }, { t: 1, pose: SCAP_UP },
    ],
  }),

  passive_bar_hang: clip({
    id: 'passive_bar_hang', duration: 5000, hero: 0.5, ground: false,
    props: [{ type: 'bar', x: 50, y: 15, w: 44 }],
    keys: [
      { t: 0, pose: HANG_A }, { t: 0.5, pose: HANG_B }, { t: 1, pose: HANG_A },
    ],
  }),
};

