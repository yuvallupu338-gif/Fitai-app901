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

import { p, STAND, STAND_PLANTED } from '../core/poses.js';
import { repKeys } from '../core/anim.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

const FLOOR = 87.5;
const REACH = 30.5;   // thigh + shin; the hips can never be further than this from an ankle

/*
 * FOOT CONTACTS
 *
 * The rig pins a foot by its ANKLE, but what the viewer sees touching the
 * ground is the toe, 6.5 units away at whatever angle the pose sets. The two
 * are only the same point for a flat foot, and the split-stance poses here all
 * have the rear heel up.
 *
 * `ballFoot` returns the ankle target that puts the TOE on the floor for a
 * heel-up foot. Pinning the rear ankle at 87.5 like a flat one — which is what
 * this file did — drove the rear toe 3.9 units under the floor on every split
 * squat, lunge and walking lunge in the file.
 */
const BALL_ANGLE = -45;
const BALL_OFF = 6.5 * Math.SQRT1_2;               // 4.6, both axes at 45 degrees
const ballFoot = (toeX) => ({ x: toeX - BALL_OFF, y: FLOOR - BALL_OFF, bend: 1 });
const flatFoot = (ankleX) => ({ x: ankleX, y: FLOOR, bend: 1 });

/*
 * Split stance. `drop` is how far the pelvis sinks below the tallest position
 * the stance allows; the feet stay planted throughout.
 *
 * That tallest position is not a matter of taste. A leg reaches 30.5 units, and
 * the old top put the pelvis at y 57 over feet 24 apart, which asks each leg to
 * span 32-34. The IK clamps at full reach instead of returning NaN, so nothing
 * looked broken to the audit — but both ankles ended up short of their targets
 * and BOTH FEET LIFTED OFF THE GROUND. The figure hovered through the top of
 * every rep and slammed back down at the bottom. 59.5 is the highest the hips
 * can go over this stance with the feet still on the floor.
 */
const STANCE = 25;            // front ankle to rear TOE
const SPLIT_TALL = 59.5;

function split(frontX, drop, over) {
  return Object.assign({
    x: frontX - 11, y: SPLIT_TALL + drop,
    spine: 88, head: 88,
    armL: [-84, -86], armR: [-96, -94],
    footPtL: ballFoot(frontX - STANCE), footPtR: flatFoot(frontX),
    footL: BALL_ANGLE, footR: 2,
  }, over || {});
}

const DB_ARMS = { load: 'dumbbell', armL: [-88, -90], armR: [-92, -90] };

const SPLIT_TOP = split(58, 0);
const SPLIT_MID = split(58, 5.5);
const SPLIT_LOW = split(58, 11);
const SPLIT_DB_TOP = split(58, 0, DB_ARMS);
const SPLIT_DB_MID = split(58, 5.5, DB_ARMS);
const SPLIT_DB_LOW = split(58, 11, DB_ARMS);

/*
 * Forward lunge: feet together, the NEAR foot steps out, sinks, and pushes back.
 *
 * The stepping foot is airborne in FWD_SWING. Without that key it travelled the
 * whole 25 units with its sole on the floor, and the athlete skated into the
 * lunge instead of stepping into it. The rear foot never moves at all: it rolls
 * up onto the ball about a toe that stays exactly where it started.
 */
const FWD_REAR_TOE = 47.5;                       // rear foot, planted all clip
const FWD_FRONT = FWD_REAR_TOE + STANCE;         // 72.5
const FWD_STAND = p(STAND_PLANTED, {
  x: 40, y: 57,
  footPtL: flatFoot(FWD_REAR_TOE - 6.5), footPtR: flatFoot(39),
  footL: 2, footR: 2,
});
const FWD_SWING = p(STAND_PLANTED, {
  x: 44, y: 58.6, spine: 87, head: 87,
  armL: [-70, -80], armR: [-104, -96],
  footPtL: flatFoot(FWD_REAR_TOE - 6.5), footPtR: { x: 57, y: 78.5, bend: 1 },
  footL: 2, footR: 24,
});
const FWD_PLANT = split(FWD_FRONT, 3);
const FWD_LOW = split(FWD_FRONT, 11);

/* Reverse lunge: the front foot never moves, the REAR foot travels backward —
   through the air, for the same reason. */
const REV_FRONT = 53;      // the front ankle, planted for the whole clip
const REV_STAND = p(STAND_PLANTED, Object.assign({
  x: 52, y: 57,
  footPtL: flatFoot(51), footPtR: flatFoot(REV_FRONT),
  footL: 2, footR: 2,
}, DB_ARMS));
const REV_SWING = p(STAND_PLANTED, Object.assign({
  x: 50, y: 58.4, spine: 87, head: 87,
  footPtL: { x: 38, y: 79, bend: 1 }, footPtR: flatFoot(REV_FRONT),
  footL: -20, footR: 2,
}, DB_ARMS));
const REV_PLANT = split(REV_FRONT, 3, DB_ARMS);
const REV_LOW = split(REV_FRONT, 11, DB_ARMS);

/*
 * Walking lunge. It cannot actually travel: a clip loops, so a figure that
 * crosses the frame has to get back, and the old keys did it by sliding the
 * whole body 28 units backwards with both feet welded to the floor — a moonwalk
 * at the end of every rep. It alternates legs in place instead, which is what
 * the family clip does and what separates it from a static split squat: the
 * swing leg passes through the air and lands on the OTHER side.
 */
const WALK_ANKLE_L = 40;                       // where the far foot stands
const WALK_ANKLE_R = 38;                       // where the near foot stands
const WALK_TOE_L = WALK_ANKLE_L + 6.5;         // the pivot each foot rolls over
const WALK_TOE_R = WALK_ANKLE_R + 6.5;
const WALK_TALL = p(STAND_PLANTED, Object.assign({
  x: 39, y: 57,
  footPtL: flatFoot(WALK_ANKLE_L), footPtR: flatFoot(WALK_ANKLE_R),
  footL: 2, footR: 2,
}, DB_ARMS));
/* near leg swinging forward; the far foot has not moved */
const WALK_SWING_R = p(STAND_PLANTED, Object.assign({
  x: 44, y: 58.6, spine: 87, head: 87,
  footPtL: flatFoot(WALK_ANKLE_L), footPtR: { x: 55, y: 78.5, bend: 1 },
  footL: 2, footR: 24,
}, DB_ARMS));
const WALK_LOW_R = split(WALK_TOE_L + STANCE, 11, DB_ARMS);
/* far leg swinging forward; the near foot has not moved */
const WALK_SWING_L = p(STAND_PLANTED, Object.assign({
  x: 44, y: 58.6, spine: 87, head: 87,
  footPtL: { x: 57, y: 78.5, bend: 1 }, footPtR: flatFoot(WALK_ANKLE_R),
  footL: 24, footR: 2,
}, DB_ARMS));
const WALK_LOW_L = Object.assign(split(WALK_TOE_R + STANCE, 11, DB_ARMS), {
  // far leg leads: the same geometry with the two feet exchanged
  footPtL: flatFoot(WALK_TOE_R + STANCE), footPtR: ballFoot(WALK_TOE_R),
  footL: 2, footR: BALL_ANGLE,
});

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

/*
 * Single leg: the free leg hooks up behind, so the two legs must not mirror.
 *
 * The standing leg is what sets the pelvis height, and it is straight in both
 * positions — so the pelvis can only rise by as much as the ankle extends,
 * which is 4.5, not the 7.5 this used to claim. With the extra three the
 * planted foot came clean off the ground and the figure levitated for
 * two thirds of the clip.
 */
const SL_CALF_DOWN = p(STAND, {
  // Knee folded enough that the free foot hangs clear behind the standing
  // shin. At [-60,-120] its toe sat a unit UNDER the floor, so the "free" leg
  // was standing on the ground too and the exercise lost its name.
  legL: [-55, -150], legR: [-92, -90], footL: -100, footR: 2,
});
const SL_CALF_UP = p(STAND, {
  y: 52.5, legL: [-53, -148], legR: [-92, -90], footL: -100, footR: -46,
});

/*
 * Deficit calf raise: the figure stands ON a box with the balls of the feet on
 * its edge and the heels hanging into the gap behind. `calf()` cannot express
 * that, because it measures the pelvis down to a floor the feet are no longer
 * on: at rise -3 the ankles ended up at y 90.5, two and a half units UNDER the
 * ground line, with the box drawn beside a figure that was never on it.
 *
 * These pin the ball of the foot to the box top (y = DEF_BOX_TOP) and let the
 * ankle ride wherever the foot angle puts it — a 6.9-unit range against the
 * 4.5 of a floor-level raise, which is the whole point of the deficit.
 */
const DEF_BOX_TOP = 80;
const DEF_BOX = { type: 'box', x: 48, y: DEF_BOX_TOP, w: 26, h: 8 };
/* toe on the box edge, ankle above and behind it, for a given foot angle */
const defCalf = (footAngle, over) => {
  const r = (footAngle * Math.PI) / 180;
  const ankleY = DEF_BOX_TOP + 6.5 * Math.sin(r);
  return p(STAND, Object.assign({
    y: ankleY - 30.5,
    legL: [-88, -90], legR: [-92, -90],
    footL: footAngle, footR: footAngle,
  }, over || {}));
};
const DEF_DOWN = defCalf(30);    // heel dropped below the edge
const DEF_UP = defCalf(-34);     // up on the toes

/* Tibialis raise: the opposite joint action — toes come UP, heels stay down,
   and the figure leans back against a wall. */
const TIB_DOWN = p(STAND, { x: 56, spine: 96, footL: 2, footR: 2 });
const TIB_UP = p(STAND, { x: 56, spine: 96, footL: 42, footR: 42 });

export const X10_CLIPS = {
  /*
   * Split squat. Real tempo, not a metronome: the descent takes 44% of the
   * cycle, the bottom is a beat, the drive up is quicker than the way down and
   * grinds through its middle, and the top settles rather than stopping dead.
   */
  split_squat: clip({
    id: 'split_squat', duration: 3000, hero: 0.46,
    keys: [
      { t: 0, pose: SPLIT_TOP },
      { t: 0.22, pose: SPLIT_MID, ease: 'in' },
      { t: 0.44, pose: SPLIT_LOW, ease: 'out' },
      { t: 0.54, pose: SPLIT_LOW },
      { t: 0.86, pose: SPLIT_TOP, ease: 'grind' },
      { t: 1, pose: SPLIT_TOP },
    ],
  }),

  db_split_squat: clip({
    id: 'db_split_squat', duration: 3100, hero: 0.46,
    keys: [
      { t: 0, pose: SPLIT_DB_TOP },
      { t: 0.22, pose: SPLIT_DB_MID, ease: 'in' },
      { t: 0.44, pose: SPLIT_DB_LOW, ease: 'out' },
      { t: 0.56, pose: SPLIT_DB_LOW },
      { t: 0.87, pose: SPLIT_DB_TOP, ease: 'grind' },
      { t: 1, pose: SPLIT_DB_TOP },
    ],
  }),

  forward_lunge: clip({
    id: 'forward_lunge', duration: 3200, hero: 0.48,
    keys: [
      { t: 0, pose: FWD_STAND },
      { t: 0.14, pose: FWD_SWING, ease: 'out' },
      { t: 0.28, pose: FWD_PLANT, ease: 'in' },
      { t: 0.48, pose: FWD_LOW, ease: 'out' },
      { t: 0.58, pose: FWD_LOW },
      { t: 0.78, pose: FWD_PLANT, ease: 'grind' },
      { t: 0.9, pose: FWD_SWING },
      { t: 1, pose: FWD_STAND },
    ],
  }),

  db_reverse_lunge: clip({
    id: 'db_reverse_lunge', duration: 3200, hero: 0.48,
    keys: [
      { t: 0, pose: REV_STAND },
      { t: 0.14, pose: REV_SWING, ease: 'out' },
      { t: 0.28, pose: REV_PLANT, ease: 'in' },
      { t: 0.48, pose: REV_LOW, ease: 'out' },
      { t: 0.58, pose: REV_LOW },
      { t: 0.78, pose: REV_PLANT, ease: 'grind' },
      { t: 0.9, pose: REV_SWING },
      { t: 1, pose: REV_STAND },
    ],
  }),

  /* Alternating in place — see the note on WALK_TALL. Two full reps per cycle,
     one on each leg, with the swing leg airborne between them. */
  db_walking_lunge: clip({
    id: 'db_walking_lunge', duration: 3800, hero: 0.2,
    keys: [
      { t: 0, pose: WALK_TALL },
      { t: 0.1, pose: WALK_SWING_R, ease: 'out' },
      { t: 0.24, pose: WALK_LOW_R, ease: 'in' },
      { t: 0.32, pose: WALK_LOW_R },
      { t: 0.46, pose: WALK_SWING_R, ease: 'grind' },
      { t: 0.5, pose: WALK_TALL },
      { t: 0.6, pose: WALK_SWING_L, ease: 'out' },
      { t: 0.74, pose: WALK_LOW_L, ease: 'in' },
      { t: 0.82, pose: WALK_LOW_L },
      { t: 0.96, pose: WALK_SWING_L, ease: 'grind' },
      { t: 1, pose: WALK_TALL },
    ],
  }),

  step_up: clip({
    id: 'step_up', duration: 3200,
    props: [{ type: 'box', x: 56, y: 72, w: 22, h: 16 }],
    keys: repKeys(STEP_DOWN, STEP_UP_POSE, STEP_UP_POSE, { mode: 'lift' }),
  }),

  db_step_up: clip({
    id: 'db_step_up', duration: 3300,
    props: [{ type: 'box', x: 56, y: 72, w: 22, h: 16 }],
    keys: repKeys(STEP_DB_DOWN, STEP_DB_UP, STEP_DB_UP, { mode: 'lift' }),
  }),

  single_leg_calf_raise: clip({
    id: 'single_leg_calf_raise', duration: 2600,
    keys: repKeys(SL_CALF_DOWN, SL_CALF_UP, SL_CALF_UP, { mode: 'lift' }),
  }),

  deficit_calf_raise: clip({
    id: 'deficit_calf_raise', duration: 2800, hero: 0.5,
    props: [DEF_BOX],
    keys: [
      { t: 0, pose: DEF_DOWN }, { t: 0.36, pose: DEF_UP, ease: 'grind' },
      { t: 0.5, pose: DEF_UP }, { t: 1, pose: DEF_DOWN, ease: 'out' },
    ],
  }),

  db_calf_raise: clip({
    id: 'db_calf_raise', duration: 2500,
    keys: repKeys(CALF_DB_DOWN, CALF_DB_UP, CALF_DB_UP, { mode: 'lift' }),
  }),

  bb_calf_raise: clip({
    id: 'bb_calf_raise', duration: 2600,
    keys: repKeys(CALF_BB_DOWN, CALF_BB_UP, CALF_BB_UP, { mode: 'lift' }),
  }),

  tibialis_raise: clip({
    id: 'tibialis_raise', duration: 2600,
    props: [{ type: 'wall', x: 72, y0: 20, y1: 88 }],
    keys: repKeys(TIB_DOWN, TIB_UP, TIB_UP, { mode: 'lift' }),
  }),
};
