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
  p, SQUAT_PARALLEL, SQUAT_BOTTOM, HINGE_BOTTOM,
  LUNGE_TOP, LUNGE_BOTTOM, GLUTE_BRIDGE_DOWN, GLUTE_BRIDGE_UP, KNEELING, SEATED,
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

/* Loaded versions of the same four positions. Each is built once so the t:0
   and t:1 keys can share one object reference and the loop stays seamless. */
const GOB_TOP = chestHold(SQ_TOP, 'kettlebell');
const GOB_QUARTER = chestHold(SQ_QUARTER, 'kettlebell');
const GOB_PAR = chestHold(SQ_PAR, 'kettlebell');
const GOB_BOT = chestHold(SQ_BOT, 'kettlebell');

const BSQ_TOP = backRack(SQ_TOP);
const BSQ_QUARTER = backRack(SQ_QUARTER);
const BSQ_PAR = backRack(SQ_PAR);
const BSQ_BOT = backRack(SQ_BOT);

const FSQ_TOP = frontRack(SQ_TOP);
const FSQ_QUARTER = frontRack(SQ_QUARTER);
const FSQ_PAR = frontRack(SQ_PAR);
const FSQ_BOT = frontRack(SQ_BOT);

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

const SQUAT_CLIPS = {
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
      { t: 0, pose: GOB_TOP },
      { t: 0.22, pose: GOB_QUARTER },
      { t: 0.44, pose: GOB_PAR },
      { t: 0.55, pose: GOB_BOT, ease: 'out' },
      { t: 0.64, pose: GOB_BOT },
      { t: 1, pose: GOB_TOP },
    ],
  }),

  back_squat: clip({
    id: 'back_squat',
    duration: 3400,
    hero: 0.52,
    keys: [
      { t: 0, pose: BSQ_TOP },
      { t: 0.2, pose: BSQ_QUARTER },
      { t: 0.42, pose: BSQ_PAR },
      { t: 0.54, pose: BSQ_BOT, ease: 'out' },
      { t: 0.62, pose: BSQ_BOT },
      { t: 1, pose: BSQ_TOP },
    ],
  }),

  front_squat: clip({
    id: 'front_squat',
    duration: 3200,
    hero: 0.52,
    keys: [
      { t: 0, pose: FSQ_TOP },
      { t: 0.2, pose: FSQ_QUARTER },
      { t: 0.42, pose: FSQ_PAR },
      { t: 0.54, pose: FSQ_BOT, ease: 'out' },
      { t: 0.62, pose: FSQ_BOT },
      { t: 1, pose: FSQ_TOP },
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

/* ------------------------------------------------------------------ *
 * Split stance — the pelvis sits ~14 behind the front ankle at the bottom,
 * which is what puts the front knee over the foot and the rear knee under
 * the hip. Move the feet and keep that spacing.
 * ------------------------------------------------------------------ */

const SS_FRONT = { x: 61, y: 87.5, bend: 1 };

/* Rear heel stays up the whole set — the ankle rides above the floor and the
   toe carries the load. */
const SS_TOP = p(LUNGE_TOP, {
  y: 60.5,
  footPtL: { x: 36, y: 85.2, bend: 1 }, footPtR: SS_FRONT, footL: -25,
});
const SS_MID = p(LUNGE_BOTTOM, {
  y: 64, spine: 87, head: 87,
  footPtL: { x: 35.5, y: 84.5, bend: 1 }, footPtR: SS_FRONT, footL: -30,
});
const SS_BOT = p(LUNGE_BOTTOM, {
  footPtL: { x: 35, y: 83.8, bend: 1 }, footPtR: SS_FRONT, footL: -35,
});

/* Bulgarian — rear instep on the bench, front foot does the work. */
const BULG_BENCH = { type: 'bench', x: 30, y: 78, w: 18, h: 4, legs: true };
const BULG_REAR = { x: 33, y: 75.5, bend: 1 };
const BULG_FRONT = { x: 60, y: 87.5, bend: 1 };
const BULG_TOP = p(LUNGE_TOP, {
  x: 49, y: 62, spine: 86, head: 86,
  footPtL: BULG_REAR, footPtR: BULG_FRONT, footL: -150, footR: 2,
});
const BULG_MID = p(BULG_TOP, { y: 66, spine: 85, head: 85 });
const BULG_BOT = p(BULG_TOP, { y: 70, spine: 84, head: 84 });

/* Forward lunge — feet start together, the near leg steps out and comes back. */
const LG_STAND = p(LUNGE_TOP, {
  x: 47, y: 57.5,
  footPtL: { x: 46, y: 87.5, bend: 1 }, footPtR: { x: 48, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
});
const LG_STEP = p(LUNGE_TOP, {
  x: 53, y: 60, spine: 87, head: 87,
  footPtL: { x: 46, y: 87.5, bend: 1 }, footPtR: { x: 64, y: 82, bend: 1 },
  footL: 2, footR: 10,
});
const LG_BOTTOM = p(LUNGE_BOTTOM, {
  x: 59, y: 68,
  footPtL: { x: 46, y: 85, bend: 1 }, footPtR: { x: 73, y: 87.5, bend: 1 },
  footL: -30, footR: 2,
});
/* Same bottom with the far leg in front — walking lunges alternate sides. */
const LG_BOTTOM_L = p(LUNGE_BOTTOM, {
  x: 59, y: 68,
  footPtL: { x: 73, y: 87.5, bend: 1 }, footPtR: { x: 46, y: 85, bend: 1 },
  footL: 2, footR: -30,
});

/* Reverse lunge — the front foot never moves, the hips travel back over it. */
const RL_STAND = p(LUNGE_TOP, {
  x: 52, y: 57.5,
  footPtL: { x: 51, y: 87.5, bend: 1 }, footPtR: { x: 53, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
});
const RL_STEP = p(LUNGE_TOP, {
  x: 46, y: 61, spine: 87, head: 87,
  footPtL: { x: 34, y: 81, bend: 1 }, footPtR: { x: 53, y: 87.5, bend: 1 },
  footL: -20, footR: 2,
});
const RL_BOTTOM = p(LUNGE_BOTTOM, {
  x: 39, y: 68,
  footPtL: { x: 26, y: 84.6, bend: 1 }, footPtR: { x: 53, y: 87.5, bend: 1 },
  footL: -30, footR: 2,
});

/* Step-up — near foot planted on the box, the figure actually rises onto it. */
const STEP_BOX = { type: 'box', x: 66, y: 76, w: 20, h: 12 };
const STEP_FOOT = { x: 63, y: 75.5, bend: 1 };
const STEP_DOWN = p(LUNGE_TOP, {
  x: 50, y: 60, spine: 88, head: 88,
  footPtL: { x: 45, y: 87.5, bend: 1 }, footPtR: STEP_FOOT, footL: 2, footR: 2,
});
const STEP_DRIVE = p(STEP_DOWN, {
  x: 58, y: 50, spine: 84, head: 86,
  footPtL: { x: 52, y: 78, bend: 1 }, footPtR: STEP_FOOT, footL: -10,
});
const STEP_UP_TALL = p(STEP_DOWN, {
  x: 64, y: 46, spine: 88, head: 88,
  footPtL: { x: 70, y: 64, bend: 1 }, footPtR: STEP_FOOT, footL: 30,
});

/* Pistol — free leg pinned out in front (target beyond reach, so it reads as
   dead straight), support leg folds all the way under the hip. */
const PISTOL_TOP = {
  x: 48, y: 58, spine: 86, head: 86,
  armL: [10, 8], armR: [4, 2],
  footPtL: { x: 78, y: 66, bend: -1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
  footL: 60, footR: 2,
};
const PISTOL_MID = p(PISTOL_TOP, {
  y: 66, spine: 72, head: 80,
  armL: [14, 12], armR: [8, 6],
  footPtL: { x: 76, y: 67, bend: -1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
});
const PISTOL_BOT = p(PISTOL_TOP, {
  x: 44, y: 74.5, spine: 55, head: 70,
  armL: [16, 14], armR: [10, 8],
  footPtL: { x: 74, y: 68, bend: -1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
});

const SPLIT_CLIPS = {
  split_squat: clip({
    id: 'split_squat',
    duration: 3200,
    hero: 0.5,
    keys: [
      { t: 0, pose: SS_TOP },
      { t: 0.24, pose: SS_MID },
      { t: 0.45, pose: SS_BOT, ease: 'out' },
      { t: 0.56, pose: SS_BOT },
      { t: 0.8, pose: SS_MID },
      { t: 1, pose: SS_TOP },
    ],
  }),

  bulgarian_split_squat: clip({
    id: 'bulgarian_split_squat',
    duration: 3400,
    hero: 0.5,
    props: [BULG_BENCH],
    keys: [
      { t: 0, pose: BULG_TOP },
      { t: 0.26, pose: BULG_MID },
      { t: 0.46, pose: BULG_BOT, ease: 'out' },
      { t: 0.58, pose: BULG_BOT },
      { t: 0.82, pose: BULG_MID },
      { t: 1, pose: BULG_TOP },
    ],
  }),

  /* Pattern fallback for `lunge` too. */
  lunge: clip({
    id: 'lunge',
    duration: 3200,
    hero: 0.42,
    keys: [
      { t: 0, pose: LG_STAND },
      { t: 0.16, pose: LG_STEP },
      { t: 0.38, pose: LG_BOTTOM, ease: 'out' },
      { t: 0.5, pose: LG_BOTTOM },
      { t: 0.78, pose: LG_STEP },
      { t: 1, pose: LG_STAND },
    ],
  }),

  /* Alternates sides in place — travelling right would break the loop. */
  walking_lunge: clip({
    id: 'walking_lunge',
    duration: 3800,
    hero: 0.25,
    keys: [
      { t: 0, pose: LG_STAND },
      { t: 0.25, pose: LG_BOTTOM },
      { t: 0.5, pose: LG_STAND },
      { t: 0.75, pose: LG_BOTTOM_L },
      { t: 1, pose: LG_STAND },
    ],
  }),

  reverse_lunge: clip({
    id: 'reverse_lunge',
    duration: 3200,
    hero: 0.42,
    keys: [
      { t: 0, pose: RL_STAND },
      { t: 0.18, pose: RL_STEP },
      { t: 0.4, pose: RL_BOTTOM, ease: 'out' },
      { t: 0.52, pose: RL_BOTTOM },
      { t: 0.8, pose: RL_STEP },
      { t: 1, pose: RL_STAND },
    ],
  }),

  step_up: clip({
    id: 'step_up',
    duration: 3000,
    hero: 0.45,
    props: [STEP_BOX],
    keys: [
      { t: 0, pose: STEP_DOWN },
      { t: 0.3, pose: STEP_DRIVE },
      { t: 0.5, pose: STEP_UP_TALL, ease: 'out' },
      { t: 0.62, pose: STEP_UP_TALL },
      { t: 0.84, pose: STEP_DRIVE },
      { t: 1, pose: STEP_DOWN },
    ],
  }),

  pistol_squat: clip({
    id: 'pistol_squat',
    duration: 3600,
    hero: 0.5,
    keys: [
      { t: 0, pose: PISTOL_TOP },
      { t: 0.26, pose: PISTOL_MID },
      { t: 0.46, pose: PISTOL_BOT, ease: 'out' },
      { t: 0.58, pose: PISTOL_BOT },
      { t: 0.82, pose: PISTOL_MID },
      { t: 1, pose: PISTOL_TOP },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Hinge — knees stay nearly straight, the PELVIS travels backward and the
 * spine angle drops toward 20 degrees. Compare the knee position here
 * (x ~56 over an ankle at 51) with the squat (x ~60 over an ankle at 53,
 * pelvis ten units lower): that gap is the whole coaching point.
 * ------------------------------------------------------------------ */

const HG_TOP = p(HINGE_BOTTOM, {
  x: 50, y: 57.5, spine: 88, head: 88,
  armL: [-84, -88], armR: [-96, -92],
});
const HG_MID = p(HINGE_BOTTOM, { x: 48.5, y: 59.5, spine: 52, head: 44 });
const HG_BOT = HINGE_BOTTOM;

/* Deadlift: hips lower and spine flatter than an RDL so the hands reach the
   floor. Bar height is wherever the hands land — the load is drawn on them. */
const DL_FLOOR = hangHold(p(HINGE_BOTTOM, { x: 45, y: 63.5, spine: 15, head: 8 }), 22.9);
const DL_KNEE = hangHold(p(HINGE_BOTTOM, { x: 47.5, y: 60, spine: 45, head: 38 }), 22.9);
const DL_LOCKOUT = hangHold(HG_TOP, 22.9);

const RDL_TOP = hangHold(HG_TOP, 22.9);
const RDL_MID = hangHold(HG_MID, 22.9);
const RDL_BOT = hangHold(HG_BOT, 22.9);

const GM_TOP = backRack(HG_TOP);
const GM_MID = backRack(HG_MID);
const GM_BOT = backRack(HG_BOT);

/* Single-leg RDL: free leg swings back to horizontal, spine follows it down.
   The rear foot target sits beyond reach so the trailing leg reads dead straight. */
const SLR_TOP = hangHold({
  x: 50, y: 57.5, spine: 88, head: 88,
  footPtL: { x: 44, y: 86, bend: 1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
}, 22.9, 'dumbbell');
const SLR_MID = hangHold({
  x: 48.5, y: 59, spine: 50, head: 42,
  footPtL: { x: 30, y: 70, bend: 1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
  footL: -70, footR: 2,
}, 22.9, 'dumbbell');
const SLR_BOT = hangHold({
  x: 47, y: 60, spine: 15, head: 8,
  footPtL: { x: 17, y: 53, bend: 1 }, footPtR: { x: 50, y: 87.5, bend: 1 },
  footL: -160, footR: 2,
}, 22.9, 'dumbbell');

const HINGE_CLIPS = {
  /* Pattern fallback for `hinge`. */
  hinge: clip({
    id: 'hinge',
    duration: 3000,
    hero: 0.5,
    keys: [
      { t: 0, pose: HG_TOP },
      { t: 0.24, pose: HG_MID },
      { t: 0.46, pose: HG_BOT, ease: 'out' },
      { t: 0.56, pose: HG_BOT },
      { t: 0.8, pose: HG_MID },
      { t: 1, pose: HG_TOP },
    ],
  }),

  deadlift: clip({
    id: 'deadlift',
    duration: 3600,
    hero: 0,
    keys: [
      { t: 0, pose: DL_FLOOR },
      { t: 0.22, pose: DL_KNEE },
      { t: 0.4, pose: DL_LOCKOUT, ease: 'out' },
      { t: 0.5, pose: DL_LOCKOUT },
      { t: 0.72, pose: DL_KNEE },
      { t: 1, pose: DL_FLOOR },
    ],
  }),

  rdl: clip({
    id: 'rdl',
    duration: 3400,
    hero: 0.5,
    keys: [
      { t: 0, pose: RDL_TOP },
      { t: 0.24, pose: RDL_MID },
      { t: 0.46, pose: RDL_BOT, ease: 'out' },
      { t: 0.56, pose: RDL_BOT },
      { t: 0.8, pose: RDL_MID },
      { t: 1, pose: RDL_TOP },
    ],
  }),

  single_leg_rdl: clip({
    id: 'single_leg_rdl',
    duration: 3600,
    hero: 0.5,
    keys: [
      { t: 0, pose: SLR_TOP },
      { t: 0.26, pose: SLR_MID },
      { t: 0.48, pose: SLR_BOT, ease: 'out' },
      { t: 0.58, pose: SLR_BOT },
      { t: 0.82, pose: SLR_MID },
      { t: 1, pose: SLR_TOP },
    ],
  }),

  good_morning: clip({
    id: 'good_morning',
    duration: 3400,
    hero: 0.5,
    keys: [
      { t: 0, pose: GM_TOP },
      { t: 0.24, pose: GM_MID },
      { t: 0.46, pose: GM_BOT, ease: 'out' },
      { t: 0.56, pose: GM_BOT },
      { t: 0.8, pose: GM_MID },
      { t: 1, pose: GM_TOP },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Glute bridge / hip thrust — head to the LEFT, knees up on the RIGHT.
 * The spine angle stays on the positive side of 180 in every key so the
 * torso never spins the long way round.
 * ------------------------------------------------------------------ */

const BRIDGE_FEET = {
  footPtL: { x: 70, y: 87.5, bend: 1 },
  footPtR: { x: 72, y: 87.5, bend: 1 },
};
const GB_DOWN = p(GLUTE_BRIDGE_DOWN, Object.assign({ x: 52 }, BRIDGE_FEET));
const GB_MID = p(GLUTE_BRIDGE_DOWN, Object.assign({ x: 52, y: 80.5, spine: 190 }, BRIDGE_FEET));
const GB_UP = p(GLUTE_BRIDGE_UP, Object.assign({ x: 52 }, BRIDGE_FEET));

/* Free leg held straight in line with the torso — target is past full reach. */
const SLGB_DOWN = p(GB_DOWN, { footPtL: { x: 82, y: 78, bend: 1 }, footL: 10 });
const SLGB_MID = p(GB_MID, { footPtL: { x: 82, y: 74, bend: 1 }, footL: 10 });
const SLGB_UP = p(GB_UP, { footPtL: { x: 82, y: 70, bend: 1 }, footL: 10 });

/* Hip thrust: shoulder blades parked on the bench at a fixed point while the
   pelvis swings up around them. Hands ride the bar just above the hip. */
const HT_BENCH = { type: 'bench', x: 20, y: 73, w: 26, h: 5, legs: true };
const HT_FEET = {
  footPtL: { x: 72, y: 87.5, bend: 1 },
  footPtR: { x: 74, y: 87.5, bend: 1 },
  footL: 0, footR: 0,
};
const HT_DOWN = p(GLUTE_BRIDGE_DOWN, Object.assign({
  x: 52, y: 80, spine: 160, head: 145,
  handL: { x: 46, y: 75.5, bend: -1 }, handR: { x: 51, y: 75.5, bend: -1 },
  load: 'barbell',
}, HT_FEET));
const HT_MID = p(HT_DOWN, Object.assign({
  x: 52.7, y: 75, spine: 172, head: 138,
  handL: { x: 46.7, y: 70.5, bend: -1 }, handR: { x: 51.7, y: 70.5, bend: -1 },
}, HT_FEET));
const HT_UP = p(HT_DOWN, Object.assign({
  x: 53.3, y: 70, spine: 185.5, head: 130,
  handL: { x: 47.3, y: 65.5, bend: -1 }, handR: { x: 52.3, y: 65.5, bend: -1 },
}, HT_FEET));

const GLUTE_CLIPS = {
  glute_bridge: clip({
    id: 'glute_bridge',
    duration: 2800,
    hero: 0.45,
    keys: [
      { t: 0, pose: GB_DOWN },
      { t: 0.22, pose: GB_MID },
      { t: 0.42, pose: GB_UP, ease: 'out' },
      { t: 0.56, pose: GB_UP },
      { t: 0.8, pose: GB_MID },
      { t: 1, pose: GB_DOWN },
    ],
  }),

  single_leg_glute_bridge: clip({
    id: 'single_leg_glute_bridge',
    duration: 3000,
    hero: 0.45,
    keys: [
      { t: 0, pose: SLGB_DOWN },
      { t: 0.22, pose: SLGB_MID },
      { t: 0.42, pose: SLGB_UP, ease: 'out' },
      { t: 0.56, pose: SLGB_UP },
      { t: 0.8, pose: SLGB_MID },
      { t: 1, pose: SLGB_DOWN },
    ],
  }),

  hip_thrust: clip({
    id: 'hip_thrust',
    duration: 3000,
    hero: 0.45,
    props: [HT_BENCH],
    keys: [
      { t: 0, pose: HT_DOWN },
      { t: 0.22, pose: HT_MID },
      { t: 0.42, pose: HT_UP, ease: 'out' },
      { t: 0.58, pose: HT_UP },
      { t: 0.8, pose: HT_MID },
      { t: 1, pose: HT_DOWN },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Nordic curl — shins pinned to the floor, the whole body lowers as one
 * lever about the knee. Thigh angle swings -90 -> -155 while the shin
 * angle stays at 180, which is what keeps the shins nailed down.
 * ------------------------------------------------------------------ */

const NC_TOP = p(KNEELING, {
  x: 36, y: 72, spine: 90, head: 90,
  legL: [-90, 180], legR: [-92, 178], footL: 170, footR: 170,
  handL: { x: 37, y: 70, bend: -1 }, handR: { x: 38, y: 70, bend: -1 },
});
const NC_MID = p(NC_TOP, {
  x: 44.89, y: 74.8, spine: 55, head: 55,
  legL: [-125, 180], legR: [-127, 178],
  handL: { x: 67, y: 72, bend: -1 }, handR: { x: 68, y: 72, bend: -1 },
});
const NC_BOT = p(NC_TOP, {
  x: 50.05, y: 80.95, spine: 28, head: 20,
  legL: [-155, 180], legR: [-157, 178],
  handL: { x: 80, y: 87.5, bend: -1 }, handR: { x: 81, y: 87.5, bend: -1 },
});

const NORDIC_CLIPS = {
  nordic_curl: clip({
    id: 'nordic_curl',
    duration: 4000,
    hero: 0.35,
    props: [{ type: 'mat', x: 40, w: 56 }],
    keys: [
      { t: 0, pose: NC_TOP },
      { t: 0.36, pose: NC_MID },
      { t: 0.6, pose: NC_BOT, ease: 'in' },
      { t: 0.7, pose: NC_BOT },
      { t: 0.88, pose: NC_MID },
      { t: 1, pose: NC_TOP },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Machines — seated, simple, legible. FK legs where the joint that must
 * stay still is the KNEE (leg extension, leg curl): IK would drag it.
 * ------------------------------------------------------------------ */

/* Leg press: reclined against the seat, legs driving up and to the right. */
const LP_SEAT = { type: 'machine', x: 20, y: 62, w: 16, h: 26 };
const LP_BOTTOM = {
  x: 44, y: 74, spine: 150, head: 140,
  handL: { x: 38, y: 70, bend: -1 }, handR: { x: 39, y: 71, bend: -1 },
  footPtL: { x: 62, y: 62, bend: 1 }, footPtR: { x: 64, y: 61, bend: 1 },
  footL: 80, footR: 80,
};
const LP_MID = p(LP_BOTTOM, {
  footPtL: { x: 65, y: 59, bend: 1 }, footPtR: { x: 67, y: 58, bend: 1 },
});
const LP_TOP = p(LP_BOTTOM, {
  footPtL: { x: 67, y: 57, bend: 1 }, footPtR: { x: 69, y: 56, bend: 1 },
});

/* Leg extension: thigh angle frozen, only the shin swings. */
const LE_SEAT = { type: 'machine', x: 28, y: 58, w: 14, h: 30 };
const LE_DOWN = p(SEATED, {
  x: 38, y: 70,
  legL: [2, -88], legR: [-2, -92], footL: 0, footR: 0,
});
const LE_MID = p(LE_DOWN, { legL: [2, -45], legR: [-2, -49], footL: 30, footR: 30 });
const LE_UP = p(LE_DOWN, { legL: [2, -2], legR: [-2, -6], footL: 60, footR: 60 });

/* Leg curl: prone on the pad, heels curling toward the glutes. */
const LC_BENCH = { type: 'bench', x: 44, y: 82, w: 44, h: 4, legs: true };
const LC_DOWN = {
  x: 44, y: 80, spine: 5, head: 10,
  handL: { x: 80, y: 84, bend: 1 }, handR: { x: 81, y: 85, bend: 1 },
  legL: [180, 180], legR: [182, 182],
  footL: 255, footR: 255,
};
const LC_MID = p(LC_DOWN, { legL: [180, 140], legR: [182, 142], footL: 220, footR: 220 });
const LC_UP = p(LC_DOWN, { legL: [180, 100], legR: [182, 102], footL: 190, footR: 190 });

const MACHINE_CLIPS = {
  leg_press: clip({
    id: 'leg_press',
    duration: 3000,
    hero: 0.5,
    props: [LP_SEAT],
    keys: [
      { t: 0, pose: LP_BOTTOM },
      { t: 0.2, pose: LP_MID },
      { t: 0.38, pose: LP_TOP, ease: 'out' },
      { t: 0.5, pose: LP_TOP },
      { t: 0.76, pose: LP_MID },
      { t: 1, pose: LP_BOTTOM },
    ],
  }),

  leg_extension: clip({
    id: 'leg_extension',
    duration: 2800,
    hero: 0.45,
    props: [LE_SEAT],
    keys: [
      { t: 0, pose: LE_DOWN },
      { t: 0.2, pose: LE_MID },
      { t: 0.38, pose: LE_UP, ease: 'out' },
      { t: 0.52, pose: LE_UP },
      { t: 0.78, pose: LE_MID },
      { t: 1, pose: LE_DOWN },
    ],
  }),

  leg_curl: clip({
    id: 'leg_curl',
    duration: 2800,
    hero: 0.45,
    props: [LC_BENCH],
    keys: [
      { t: 0, pose: LC_DOWN },
      { t: 0.2, pose: LC_MID },
      { t: 0.38, pose: LC_UP, ease: 'out' },
      { t: 0.52, pose: LC_UP },
      { t: 0.78, pose: LC_MID },
      { t: 1, pose: LC_DOWN },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Calves — the toe stays nailed to the floor, the ankle and the whole
 * body rise ~3.5 units. The foot angle swings 2 -> -30, which is the
 * only thing that makes such a small movement readable.
 * ------------------------------------------------------------------ */

const CR_DOWN = {
  x: 50, y: 57.5, spine: 90, head: 90,
  armL: [-84, -86], armR: [-96, -94],
  footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 51, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const CR_MID = p(CR_DOWN, {
  y: 55.75,
  footPtL: { x: 49, y: 85.75, bend: 1 }, footPtR: { x: 51, y: 85.75, bend: 1 },
  footL: -14, footR: -14,
});
const CR_UP = p(CR_DOWN, {
  y: 54,
  footPtL: { x: 49, y: 84, bend: 1 }, footPtR: { x: 51, y: 84, bend: 1 },
  footL: -30, footR: -30,
});

/* Seated: knees pinned by the pad, ball of the foot on a block, heel drops
   below the block at the bottom. */
const SCR_BENCH = { type: 'bench', x: 38, y: 72, w: 26, h: 5, legs: true };
const SCR_BLOCK = { type: 'box', x: 70, y: 84, w: 12, h: 4 };
const SCR_DOWN = {
  x: 47, y: 70.5, spine: 88, head: 88,
  handL: { x: 58.5, y: 66.5, bend: -1 }, handR: { x: 59.5, y: 67.5, bend: -1 },
  footPtL: { x: 62, y: 86, bend: 1 }, footPtR: { x: 64, y: 86, bend: 1 },
  footL: 18, footR: 18,
};
const SCR_MID = p(SCR_DOWN, {
  handL: { x: 58.5, y: 65, bend: -1 }, handR: { x: 59.5, y: 66, bend: -1 },
  footPtL: { x: 62, y: 84.25, bend: 1 }, footPtR: { x: 64, y: 84.25, bend: 1 },
  footL: 2, footR: 2,
});
const SCR_UP = p(SCR_DOWN, {
  handL: { x: 58.5, y: 63.5, bend: -1 }, handR: { x: 59.5, y: 64.5, bend: -1 },
  footPtL: { x: 62, y: 82.5, bend: 1 }, footPtR: { x: 64, y: 82.5, bend: 1 },
  footL: -14, footR: -14,
});

const CALF_CLIPS = {
  calf_raise: clip({
    id: 'calf_raise',
    duration: 2400,
    hero: 0.4,
    keys: [
      { t: 0, pose: CR_DOWN },
      { t: 0.18, pose: CR_MID },
      { t: 0.34, pose: CR_UP, ease: 'out' },
      { t: 0.5, pose: CR_UP },
      { t: 0.76, pose: CR_MID },
      { t: 1, pose: CR_DOWN },
    ],
  }),

  seated_calf_raise: clip({
    id: 'seated_calf_raise',
    duration: 2600,
    hero: 0.4,
    props: [SCR_BENCH, SCR_BLOCK],
    keys: [
      { t: 0, pose: SCR_DOWN },
      { t: 0.18, pose: SCR_MID },
      { t: 0.36, pose: SCR_UP, ease: 'out' },
      { t: 0.52, pose: SCR_UP },
      { t: 0.78, pose: SCR_MID },
      { t: 1, pose: SCR_DOWN },
    ],
  }),

  /* Pattern fallback for `calf` — same movement, longer squeeze at the top
     and a slower lower, which is how the pattern should actually be trained. */
  calf: clip({
    id: 'calf',
    duration: 3000,
    hero: 0.45,
    keys: [
      { t: 0, pose: CR_DOWN },
      { t: 0.16, pose: CR_MID },
      { t: 0.3, pose: CR_UP, ease: 'out' },
      { t: 0.55, pose: CR_UP },
      { t: 0.8, pose: CR_MID },
      { t: 1, pose: CR_DOWN },
    ],
  }),
};

/* ------------------------------------------------------------------ *
 * Jumps — short, with a real countermovement, an airborne key where BOTH
 * feet clear the floor line, and a soft bent-knee landing. Arms swing back
 * on the dip and forward on take-off; that sweep is continuous through 0,
 * so no limb spins the long way round.
 * ------------------------------------------------------------------ */

const JS_DIP = p(SQUAT_PARALLEL, Object.assign({
  x: 50, y: 63, spine: 74, head: 84,
  armL: [-132, -122], armR: [-138, -128],
}, SQ_FEET));
const JS_AIR = p(SQUAT_PARALLEL, {
  x: 51.5, y: 48, spine: 92, head: 92,
  armL: [34, 44], armR: [29, 39],
  footPtL: { x: 50, y: 73, bend: 1 }, footPtR: { x: 52, y: 73, bend: 1 },
  footL: -40, footR: -40,
});
const JS_LAND = p(SQUAT_PARALLEL, Object.assign({
  x: 50, y: 62, spine: 76, head: 84,
  armL: [-20, -30], armR: [-26, -36],
}, SQ_FEET));

const BJ_BOX = { type: 'box', x: 70, y: 76, w: 22, h: 12 };
const BJ_STAND = {
  x: 44, y: 57.5, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
  footPtL: { x: 43, y: 87.5, bend: 1 }, footPtR: { x: 45, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const BJ_DIP = p(BJ_STAND, {
  x: 42, y: 64, spine: 72, head: 84,
  armL: [-132, -122], armR: [-138, -128],
});
const BJ_AIR = p(BJ_STAND, {
  x: 56, y: 52, spine: 80, head: 82,
  armL: [28, 38], armR: [24, 34],
  footPtL: { x: 58, y: 70, bend: 1 }, footPtR: { x: 60, y: 70, bend: 1 },
  footL: -30, footR: -30,
});
const BJ_LAND = p(BJ_STAND, {
  x: 66, y: 58, spine: 78, head: 84,
  armL: [-40, -50], armR: [-46, -56],
  footPtL: { x: 66, y: 75, bend: 1 }, footPtR: { x: 68, y: 75, bend: 1 },
});
const BJ_TALL = p(BJ_STAND, {
  x: 68, y: 46,
  footPtL: { x: 67, y: 75, bend: 1 }, footPtR: { x: 69, y: 75, bend: 1 },
});

const BR_STAND = p(BJ_STAND, {
  x: 38, y: 57.5,
  footPtL: { x: 37, y: 87.5, bend: 1 }, footPtR: { x: 39, y: 87.5, bend: 1 },
});
const BR_DIP = p(BR_STAND, {
  x: 36, y: 64, spine: 70, head: 82,
  armL: [-132, -122], armR: [-138, -128],
});
const BR_AIR = p(BR_STAND, {
  x: 50, y: 56, spine: 70, head: 80,
  armL: [20, 30], armR: [16, 26],
  footPtL: { x: 56, y: 74, bend: 1 }, footPtR: { x: 58, y: 74, bend: 1 },
  footL: -30, footR: -30,
});
const BR_LAND = p(BR_STAND, {
  x: 62, y: 66, spine: 66, head: 80,
  armL: [-110, -100], armR: [-116, -106],
  footPtL: { x: 70, y: 87.5, bend: 1 }, footPtR: { x: 72, y: 87.5, bend: 1 },
});
const BR_TALL = p(BR_STAND, {
  x: 70, y: 57.5,
  footPtL: { x: 69, y: 87.5, bend: 1 }, footPtR: { x: 71, y: 87.5, bend: 1 },
});

/* Generic `plyo`: a stiff pogo hop — shallow dip, straight legs in the air. */
const PL_DIP = p(SQUAT_PARALLEL, Object.assign({
  x: 50.5, y: 61, spine: 82, head: 86,
  armL: [-60, -50], armR: [-66, -56],
}, SQ_FEET));
const PL_AIR = p(SQUAT_PARALLEL, {
  x: 51.5, y: 51, spine: 90, head: 90,
  armL: [-50, -40], armR: [-56, -46],
  footPtL: { x: 51, y: 79, bend: 1 }, footPtR: { x: 53, y: 79, bend: 1 },
  footL: -35, footR: -35,
});
const PL_LAND = p(SQUAT_PARALLEL, Object.assign({
  x: 50.5, y: 59, spine: 86, head: 88,
  armL: [-70, -60], armR: [-76, -66],
}, SQ_FEET));

const JUMP_CLIPS = {
  jump_squat: clip({
    id: 'jump_squat',
    duration: 1300,
    hero: 0.42,
    keys: [
      { t: 0, pose: SQ_TOP },
      { t: 0.15, pose: JS_DIP },
      { t: 0.42, pose: JS_AIR, ease: 'out' },
      { t: 0.62, pose: JS_LAND, ease: 'in' },
      { t: 0.76, pose: JS_LAND },
      { t: 1, pose: SQ_TOP },
    ],
  }),

  box_jump: clip({
    id: 'box_jump',
    duration: 1900,
    hero: 0.36,
    props: [BJ_BOX],
    keys: [
      { t: 0, pose: BJ_STAND },
      { t: 0.11, pose: BJ_DIP },
      { t: 0.38, pose: BJ_AIR, ease: 'out' },
      { t: 0.54, pose: BJ_LAND, ease: 'in' },
      { t: 0.72, pose: BJ_TALL },
      { t: 1, pose: BJ_STAND },
    ],
  }),

  broad_jump: clip({
    id: 'broad_jump',
    duration: 1900,
    hero: 0.34,
    keys: [
      { t: 0, pose: BR_STAND },
      { t: 0.1, pose: BR_DIP },
      { t: 0.36, pose: BR_AIR, ease: 'out' },
      { t: 0.5, pose: BR_LAND, ease: 'in' },
      { t: 0.66, pose: BR_TALL },
      { t: 1, pose: BR_STAND },
    ],
  }),

  /* Pattern fallback for `plyo`. */
  plyo: clip({
    id: 'plyo',
    duration: 1100,
    hero: 0.4,
    keys: [
      { t: 0, pose: SQ_TOP },
      { t: 0.14, pose: PL_DIP },
      { t: 0.4, pose: PL_AIR, ease: 'out' },
      { t: 0.6, pose: PL_LAND, ease: 'in' },
      { t: 0.72, pose: PL_LAND },
      { t: 1, pose: SQ_TOP },
    ],
  }),
};

export const LOWER_CLIPS = Object.assign(
  {},
  SQUAT_CLIPS,
  SPLIT_CLIPS,
  HINGE_CLIPS,
  GLUTE_CLIPS,
  NORDIC_CLIPS,
  MACHINE_CLIPS,
  CALF_CLIPS,
  JUMP_CLIPS,
);
