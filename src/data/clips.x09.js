/* clips.x09.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * The hinge family. Every clip here has to be visibly NOT a squat, because
 * confusing the two is the single most common error these exercises exist to
 * correct. In a hinge the knees stay only slightly bent, the pelvis travels
 * BACKWARD, and the spine angle drops toward horizontal. In a squat the pelvis
 * travels DOWN and the torso stays upright. Compare HINGE_BOTTOM against
 * SQUAT_BOTTOM in poses.js and the difference is the whole point.
 */

import { p, STAND, HINGE_TOP, HINGE_BOTTOM } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/* ---- standing hinge: pelvis back, shins near vertical ---- */

const hinge = (spine, pelvisX, pelvisY, over) => p(HINGE_BOTTOM, Object.assign({
  x: pelvisX, y: pelvisY, spine, head: spine - 10,
}, over));

const TOP = (over) => p(HINGE_TOP, over || {});
const MID = (over) => hinge(52, 47, 60, over);
const BOTTOM = (over) => hinge(22, 46, 62, over);

/* ---- hip thrust: shoulders parked on a bench, pelvis is what moves ---- */

const THRUST_DOWN = {
  x: 56, y: 84, spine: 135, head: 128,
  armL: [150, 142], armR: [156, 148],
  footPtL: { x: 70, y: 87.5, bend: 1 }, footPtR: { x: 74, y: 87.5, bend: 1 },
  footL: 0, footR: 0,
};
const THRUST_UP = Object.assign({}, THRUST_DOWN, {
  x: 62, y: 72, spine: 170, head: 163,
  armL: [176, 168], armR: [182, 174],
  footPtL: { x: 70, y: 87.5, bend: 1 }, footPtR: { x: 74, y: 87.5, bend: 1 },
});

/* ---- nordic: the body is rigid and pivots about the knee ---- */

const nordic = (deg, over) => {
  const r = (deg * Math.PI) / 180;
  return Object.assign({
    x: 50 + 15.5 * Math.cos(r), y: 87.5 - 15.5 * Math.sin(r),
    spine: deg, head: deg - 6,
    armL: [deg - 130, deg - 120], armR: [deg - 140, deg - 130],
    legL: [deg - 180, 180], legR: [deg - 184, 176],
    footL: 170, footR: 170,
  }, over || {});
};
const NORDIC_UP = nordic(90);
const NORDIC_MID = nordic(52);
/* At the bottom you catch yourself, so the hands are planted on the floor
   rather than swinging free — which is also what keeps them above it. */
const NORDIC_LOW = nordic(24, {
  handL: { x: 86, y: 87.5, bend: -1 },
  handR: { x: 89, y: 87.5, bend: -1 },
});
const NORDIC_ASSIST = nordic(38);

/* ---- lying leg curl: pelvis pinned, only the knee moves ---- */

const PRONE_STRAIGHT = {
  x: 40, y: 84, spine: 6, head: 14,
  armL: [8, 4], armR: [4, 0],
  legL: [182, 182], legR: [184, 184],
  footL: 96, footR: 96,
};
const PRONE_CURLED = Object.assign({}, PRONE_STRAIGHT, {
  legL: [182, 104], legR: [184, 100], footL: 20, footR: 20,
});

/* ---- single-leg RDL: the free leg rises to horizontal behind ---- */

const SL_TOP = p(STAND, {
  x: 50, y: 57, spine: 88,
  armL: [-84, -88], armR: [-96, -92], load: 'dumbbell',
  legL: [-90, -90], legR: [-70, -110], footL: 2, footR: -20,
});
const SL_BOTTOM = {
  x: 48, y: 60, spine: 18, head: 10,
  armL: [-84, -88], armR: [-92, -90], load: 'dumbbell',
  footPtL: { x: 50, y: 87.5, bend: 1 },
  legR: [172, 176], footL: 2, footR: 96,
};

/* ---- kettlebell swing: hinge, then a hard snap to horizontal ---- */

const SWING_BACK = hinge(30, 46, 62, { armL: [-40, -34], armR: [-46, -40], load: 'kettlebell' });
const SWING_STAND = p(STAND, { armL: [-70, -66], armR: [-76, -72], load: 'kettlebell' });
const SWING_FLOAT = p(STAND, { spine: 93, armL: [-6, -2], armR: [-12, -8], load: 'kettlebell' });

export const X09_CLIPS = {
  hip_hinge_drill: clip({
    id: 'hip_hinge_drill', duration: 3400,
    props: [{ type: 'wall', x: 24, y0: 40, y1: 88 }],
    keys: [
      { t: 0, pose: TOP({ armL: [-40, -34], armR: [-46, -40] }) },
      { t: 0.4, pose: MID({ armL: [-40, -34], armR: [-46, -40] }) },
      { t: 0.55, pose: BOTTOM({ armL: [-40, -34], armR: [-46, -40] }) },
      { t: 1, pose: TOP({ armL: [-40, -34], armR: [-46, -40] }) },
    ],
  }),

  rdl: clip({
    id: 'rdl', duration: 3200,
    keys: [
      { t: 0, pose: TOP({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      { t: 0.4, pose: MID({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      { t: 0.55, pose: BOTTOM({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      { t: 1, pose: TOP({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
    ],
  }),

  /* The deadlift starts on the FLOOR — the bar is set down every rep, which is
     what separates it from an RDL that stops at mid-shin. */
  deadlift: clip({
    id: 'deadlift', duration: 3400,
    keys: [
      {
        t: 0,
        pose: {
          x: 45, y: 68, spine: 26, head: 18,
          handL: { x: 55, y: 84, bend: -1 }, handR: { x: 58, y: 84, bend: -1 },
          footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
          footL: 2, footR: 2, load: 'barbell',
        },
      },
      { t: 0.28, pose: MID({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      { t: 0.5, pose: TOP({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      { t: 0.72, pose: MID({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }) },
      {
        t: 1,
        pose: {
          x: 45, y: 68, spine: 26, head: 18,
          handL: { x: 55, y: 84, bend: -1 }, handR: { x: 58, y: 84, bend: -1 },
          footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
          footL: 2, footR: 2, load: 'barbell',
        },
      },
    ],
  }),

  db_single_leg_rdl: clip({
    id: 'db_single_leg_rdl', duration: 3600,
    keys: [
      { t: 0, pose: SL_TOP }, { t: 0.45, pose: SL_BOTTOM },
      { t: 0.6, pose: SL_BOTTOM }, { t: 1, pose: SL_TOP },
    ],
  }),

  kb_swing: clip({
    id: 'kb_swing', duration: 1700,
    keys: [
      { t: 0, pose: SWING_BACK }, { t: 0.3, pose: SWING_STAND },
      { t: 0.5, pose: SWING_FLOAT }, { t: 0.75, pose: SWING_STAND },
      { t: 1, pose: SWING_BACK },
    ],
  }),

  band_pull_through: clip({
    id: 'band_pull_through', duration: 3000,
    props: [{ type: 'band', x0: 20, y0: 84, x1: 46, y1: 70, sag: 3 }],
    keys: [
      { t: 0, pose: TOP({ armL: [-96, -100], armR: [-100, -104] }) },
      { t: 0.45, pose: BOTTOM({ armL: [-140, -150], armR: [-144, -154] }) },
      { t: 0.6, pose: BOTTOM({ armL: [-140, -150], armR: [-144, -154] }) },
      { t: 1, pose: TOP({ armL: [-96, -100], armR: [-100, -104] }) },
    ],
  }),

  cable_pull_through: clip({
    id: 'cable_pull_through', duration: 3000,
    props: [
      { type: 'machine', x: 14, y: 48, w: 14, h: 40 },
      { type: 'band', x0: 20, y0: 74, x1: 46, y1: 70, sag: 1 },
    ],
    keys: [
      { t: 0, pose: TOP({ armL: [-96, -100], armR: [-100, -104] }) },
      { t: 0.45, pose: BOTTOM({ armL: [-140, -150], armR: [-144, -154] }) },
      { t: 0.62, pose: BOTTOM({ armL: [-140, -150], armR: [-144, -154] }) },
      { t: 1, pose: TOP({ armL: [-96, -100], armR: [-100, -104] }) },
    ],
  }),

  /* Hip thrust and its loaded version: the shoulders never leave the bench. */
  hip_thrust: clip({
    id: 'hip_thrust', duration: 2900,
    props: [{ type: 'bench', x: 28, y: 68, w: 30, h: 5 }],
    keys: [
      { t: 0, pose: THRUST_DOWN }, { t: 0.4, pose: THRUST_UP },
      { t: 0.6, pose: THRUST_UP }, { t: 1, pose: THRUST_DOWN },
    ],
  }),

  db_hip_thrust: clip({
    id: 'db_hip_thrust', duration: 3000,
    props: [{ type: 'bench', x: 28, y: 68, w: 30, h: 5 }],
    keys: [
      { t: 0, pose: Object.assign({}, THRUST_DOWN, { armL: [-70, -80], armR: [-64, -74] }) },
      { t: 0.4, pose: Object.assign({}, THRUST_UP, { armL: [-70, -80], armR: [-64, -74] }) },
      { t: 0.62, pose: Object.assign({}, THRUST_UP, { armL: [-70, -80], armR: [-64, -74] }) },
      { t: 1, pose: Object.assign({}, THRUST_DOWN, { armL: [-70, -80], armR: [-64, -74] }) },
    ],
  }),

  /* Knee flexion, lying face down — a different joint from every hinge above. */
  band_leg_curl: clip({
    id: 'band_leg_curl', duration: 2800,
    props: [{ type: 'band', x0: 8, y0: 86, x1: 22, y1: 80, sag: 2 }],
    keys: [
      { t: 0, pose: PRONE_STRAIGHT }, { t: 0.42, pose: PRONE_CURLED },
      { t: 0.58, pose: PRONE_CURLED }, { t: 1, pose: PRONE_STRAIGHT },
    ],
  }),

  towel_hamstring_curl: clip({
    id: 'towel_hamstring_curl', duration: 3000,
    props: [{ type: 'mat', x: 40, w: 60 }],
    keys: [
      { t: 0, pose: PRONE_STRAIGHT },
      { t: 0.45, pose: Object.assign({}, PRONE_STRAIGHT, { legL: [182, 122], legR: [184, 118], footL: 34, footR: 34 }) },
      { t: 0.6, pose: Object.assign({}, PRONE_STRAIGHT, { legL: [182, 122], legR: [184, 118], footL: 34, footR: 34 }) },
      { t: 1, pose: PRONE_STRAIGHT },
    ],
  }),

  back_extension: clip({
    id: 'back_extension', duration: 3200,
    props: [{ type: 'machine', x: 62, y: 58, w: 26, h: 30 }],
    keys: [
      {
        t: 0,
        pose: {
          x: 54, y: 62, spine: 200, head: 194,
          armL: [150, 140], armR: [156, 146],
          legL: [-24, -28], legR: [-28, -32], footL: 60, footR: 60,
        },
      },
      {
        t: 0.45,
        pose: {
          x: 54, y: 62, spine: 178, head: 172,
          armL: [150, 140], armR: [156, 146],
          legL: [-24, -28], legR: [-28, -32], footL: 60, footR: 60,
        },
      },
      {
        t: 1,
        pose: {
          x: 54, y: 62, spine: 200, head: 194,
          armL: [150, 140], armR: [156, 146],
          legL: [-24, -28], legR: [-28, -32], footL: 60, footR: 60,
        },
      },
    ],
  }),

  /* Nordics: the body stays rigid and rotates about the knee. The three
     versions differ only in how far they get, which is exactly the progression. */
  nordic_curl: clip({
    id: 'nordic_curl', duration: 4000,
    props: [{ type: 'mat', x: 44, w: 56 }],
    keys: [
      { t: 0, pose: NORDIC_UP }, { t: 0.45, pose: NORDIC_MID },
      { t: 0.62, pose: NORDIC_LOW }, { t: 1, pose: NORDIC_UP },
    ],
  }),

  nordic_negative: clip({
    id: 'nordic_negative', duration: 4400,
    props: [{ type: 'mat', x: 44, w: 56 }],
    keys: [
      { t: 0, pose: NORDIC_UP }, { t: 0.6, pose: NORDIC_MID },
      { t: 0.8, pose: NORDIC_LOW }, { t: 1, pose: NORDIC_UP },
    ],
  }),

  band_assisted_nordic: clip({
    id: 'band_assisted_nordic', duration: 3800,
    props: [{ type: 'mat', x: 44, w: 56 }, { type: 'band', x0: 50, y0: 12, x1: 62, y1: 62, sag: 4 }],
    keys: [
      { t: 0, pose: NORDIC_UP }, { t: 0.45, pose: NORDIC_ASSIST },
      { t: 0.62, pose: NORDIC_ASSIST }, { t: 1, pose: NORDIC_UP },
    ],
  }),
};
