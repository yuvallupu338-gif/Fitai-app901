/* clips.x10.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Split-stance work and calves.
 *
 * Every lunge variant is one leg in front and one behind, so the stance alone
 * cannot separate them. What does: which foot is planted where at the start
 * (forward lunge steps out, reverse steps back, a split squat never moves),
 * whether the rear foot is on the floor or a bench, and whether the figure
 * travels across the frame or stays put.
 *
 * Calves are the opposite problem — the whole movement is a few units of ankle
 * extension, so the clips lean on the foot angle and on how far the body rises.
 */

import { p, STAND } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/* Split stance. `drop` is how far the pelvis sinks; the feet stay planted. */
function split(frontX, rearX, drop, over) {
  return Object.assign({
    x: (frontX + rearX) / 2 - 2, y: 57 + drop,
    spine: 88, head: 88,
    armL: [-84, -86], armR: [-96, -94],
    footPtL: { x: rearX, y: 87.5 - Math.min(drop * 0.35, 4), bend: 1 },
    footPtR: { x: frontX, y: 87.5, bend: 1 },
    footL: -42, footR: 2,
  }, over || {});
}

const SPLIT_TOP = split(60, 36, 0);
const SPLIT_LOW = split(60, 36, 11);
const SPLIT_DB_TOP = split(60, 36, 0, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const SPLIT_DB_LOW = split(60, 36, 11, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });

/* Forward lunge: starts feet together, the front foot STEPS OUT and comes back. */
const FWD_STAND = p(STAND, { x: 44 });
const FWD_STEP = split(62, 40, 6);
const FWD_LOW = split(64, 40, 12);

/* Reverse lunge: starts together, the REAR foot travels backward instead. */
const REV_STAND = p(STAND, { x: 52, load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const REV_STEP = split(58, 36, 6, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const REV_LOW = split(58, 32, 12, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });

/* Walking lunge: the whole figure crosses the frame, which no other lunge does. */
const WALK_A = split(44, 20, 11, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const WALK_B = split(58, 34, 2, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const WALK_C = split(72, 48, 11, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });

/* Step-up: the body actually RISES onto the box — the giveaway is that the
   pelvis finishes higher than it started, which no lunge does. */
const STEP_DOWN = {
  x: 40, y: 57, spine: 86, head: 86,
  armL: [-84, -86], armR: [-96, -94],
  footPtL: { x: 34, y: 87.5, bend: 1 }, footPtR: { x: 56, y: 72, bend: 1 },
  footL: 2, footR: 2,
};
const STEP_UP_POSE = {
  x: 56, y: 42, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
  footPtL: { x: 50, y: 72, bend: 1 }, footPtR: { x: 58, y: 72, bend: 1 },
  footL: 2, footR: 2,
};
const STEP_DB_DOWN = Object.assign({}, STEP_DOWN, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const STEP_DB_UP = Object.assign({}, STEP_UP_POSE, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });

/* Calves: tiny range, so the foot angle carries the whole read. */
const calf = (rise, footAngle, over) => p(STAND, Object.assign({
  y: 57 - rise,
  legL: [-88, -90], legR: [-92, -90],
  footL: footAngle, footR: footAngle,
}, over || {}));

const CALF_DOWN = calf(0, 2);
const CALF_UP = calf(4.5, -34);
const CALF_DB_DOWN = calf(0, 2, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const CALF_DB_UP = calf(4.5, -34, { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] });
const CALF_BB_DOWN = calf(0, 2, { load: 'barbell', armL: [-60, 40], armR: [-120, 140] });
const CALF_BB_UP = calf(4.5, -34, { load: 'barbell', armL: [-60, 40], armR: [-120, 140] });

/* Single leg: the free leg hooks up behind, so the two legs must not mirror. */
const SL_CALF_DOWN = p(STAND, {
  legL: [-60, -120], legR: [-92, -90], footL: -60, footR: 2,
});
const SL_CALF_UP = p(STAND, {
  y: 49.5, legL: [-58, -118], legR: [-92, -90], footL: -60, footR: -46,
});

/* Deficit: standing on a box edge, the heel drops BELOW the forefoot. */
const DEF_DOWN = calf(-3, 30);
const DEF_UP = calf(4.5, -34);

/* Tibialis raise: the opposite joint action — toes come UP, heels stay down,
   and the figure leans back against a wall. */
const TIB_DOWN = p(STAND, { x: 56, spine: 96, footL: 2, footR: 2 });
const TIB_UP = p(STAND, { x: 56, spine: 96, footL: 42, footR: 42 });

export const X10_CLIPS = {
  split_squat: clip({
    id: 'split_squat', duration: 3000,
    keys: [
      { t: 0, pose: SPLIT_TOP }, { t: 0.42, pose: SPLIT_LOW },
      { t: 0.58, pose: SPLIT_LOW }, { t: 1, pose: SPLIT_TOP },
    ],
  }),

  db_split_squat: clip({
    id: 'db_split_squat', duration: 3100,
    keys: [
      { t: 0, pose: SPLIT_DB_TOP }, { t: 0.42, pose: SPLIT_DB_LOW },
      { t: 0.6, pose: SPLIT_DB_LOW }, { t: 1, pose: SPLIT_DB_TOP },
    ],
  }),

  forward_lunge: clip({
    id: 'forward_lunge', duration: 3200,
    keys: [
      { t: 0, pose: FWD_STAND }, { t: 0.24, pose: FWD_STEP },
      { t: 0.46, pose: FWD_LOW }, { t: 0.74, pose: FWD_STEP },
      { t: 1, pose: FWD_STAND },
    ],
  }),

  db_reverse_lunge: clip({
    id: 'db_reverse_lunge', duration: 3200,
    keys: [
      { t: 0, pose: REV_STAND }, { t: 0.24, pose: REV_STEP },
      { t: 0.46, pose: REV_LOW }, { t: 0.74, pose: REV_STEP },
      { t: 1, pose: REV_STAND },
    ],
  }),

  db_walking_lunge: clip({
    id: 'db_walking_lunge', duration: 3400,
    keys: [
      { t: 0, pose: WALK_A }, { t: 0.4, pose: WALK_B },
      { t: 0.75, pose: WALK_C }, { t: 1, pose: WALK_A },
    ],
  }),

  step_up: clip({
    id: 'step_up', duration: 3200,
    props: [{ type: 'box', x: 56, y: 72, w: 22, h: 16 }],
    keys: [
      { t: 0, pose: STEP_DOWN }, { t: 0.45, pose: STEP_UP_POSE },
      { t: 0.62, pose: STEP_UP_POSE }, { t: 1, pose: STEP_DOWN },
    ],
  }),

  db_step_up: clip({
    id: 'db_step_up', duration: 3300,
    props: [{ type: 'box', x: 56, y: 72, w: 22, h: 16 }],
    keys: [
      { t: 0, pose: STEP_DB_DOWN }, { t: 0.45, pose: STEP_DB_UP },
      { t: 0.64, pose: STEP_DB_UP }, { t: 1, pose: STEP_DB_DOWN },
    ],
  }),

  single_leg_calf_raise: clip({
    id: 'single_leg_calf_raise', duration: 2600,
    keys: [
      { t: 0, pose: SL_CALF_DOWN }, { t: 0.4, pose: SL_CALF_UP },
      { t: 0.58, pose: SL_CALF_UP }, { t: 1, pose: SL_CALF_DOWN },
    ],
  }),

  deficit_calf_raise: clip({
    id: 'deficit_calf_raise', duration: 2800,
    props: [{ type: 'box', x: 44, y: 80, w: 22, h: 8 }],
    keys: [
      { t: 0, pose: DEF_DOWN }, { t: 0.42, pose: DEF_UP },
      { t: 0.6, pose: DEF_UP }, { t: 1, pose: DEF_DOWN },
    ],
  }),

  db_calf_raise: clip({
    id: 'db_calf_raise', duration: 2500,
    keys: [
      { t: 0, pose: CALF_DB_DOWN }, { t: 0.4, pose: CALF_DB_UP },
      { t: 0.58, pose: CALF_DB_UP }, { t: 1, pose: CALF_DB_DOWN },
    ],
  }),

  bb_calf_raise: clip({
    id: 'bb_calf_raise', duration: 2600,
    keys: [
      { t: 0, pose: CALF_BB_DOWN }, { t: 0.42, pose: CALF_BB_UP },
      { t: 0.6, pose: CALF_BB_UP }, { t: 1, pose: CALF_BB_DOWN },
    ],
  }),

  tibialis_raise: clip({
    id: 'tibialis_raise', duration: 2600,
    props: [{ type: 'wall', x: 72, y0: 20, y1: 88 }],
    keys: [
      { t: 0, pose: TIB_DOWN }, { t: 0.42, pose: TIB_UP },
      { t: 0.6, pose: TIB_UP }, { t: 1, pose: TIB_DOWN },
    ],
  }),
};
