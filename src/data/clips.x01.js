/*
 * clips.x01.js — bespoke per-exercise animations for the PUSH batch.
 * Keys are EXERCISE IDs (see docs/clip-assignments.json), so clips.index.js
 * picks them over the shared family clip.
 *
 * Conventions (src/core/rig.js): viewBox 0..100, ground y = 88, angles in math
 * convention (0 = right = the way the figure faces, 90 = up, -90 = down).
 * Anything touching the floor, a box, a bench or a wall is pinned with an IK
 * target and holds the SAME coordinates in every key of its clip. Free limbs
 * use the FK [proximal, distal] arrays, and a limb never mixes the two inside
 * one clip — lerpPose() would freeze it.
 *
 * What separates each clip from its neighbours is written above it: grip width,
 * hand path, stance, support and tempo are the whole point of the batch.
 */

import { p } from '../core/poses.js';

/* ================================================================== *
 * 1. HORIZONTAL PUSH
 * ================================================================== */

/* --- incline push-up ------------------------------------------------
 * Hands on a step, feet on the floor, body one line. The give-away is the
 * angle: the shoulders stay well above the hands, so the chest travels a
 * short way to a surface that is nowhere near the ground.
 * ------------------------------------------------------------------ */

const INC_FEET = {
  footPtL: { x: 12, y: 86, bend: -1 },
  footPtR: { x: 13.5, y: 86, bend: -1 },
  footL: -28, footR: -28,
};

const INCP_TOP = p(INC_FEET, {
  x: 38.9, y: 73.7, spine: 55, head: 46,
  handL: { x: 66, y: 71.5, bend: -1 },
  handR: { x: 68, y: 71.5, bend: -1 },
});

const INCP_BOTTOM = p(INCP_TOP, { x: 39.7, y: 78, spine: 48, head: 39 });
const INCP_PAUSE = p(INCP_TOP, { x: 39.5, y: 77.4, spine: 49, head: 40 });

const incline_pushup = {
  id: 'incline_pushup',
  duration: 2600,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'box', x: 70, y: 72, w: 26, h: 16 }],
  keys: [
    { t: 0, pose: INCP_TOP },
    { t: 0.42, pose: INCP_BOTTOM },
    { t: 0.56, pose: INCP_PAUSE },
    { t: 1, pose: INCP_TOP },
  ],
};

/* --- push-up ---------------------------------------------------------
 * Full range on the floor: elbows 45 degrees back, so the shoulders travel
 * FORWARD of the hands as the chest drops to a finger's width off the floor.
 * ------------------------------------------------------------------ */

const PU_FEET = {
  footPtL: { x: 9, y: 85, bend: -1 },
  footPtR: { x: 10.5, y: 85, bend: -1 },
  footL: -30, footR: -30,
};

const PUSH_TOP = p(PU_FEET, {
  x: 36.44, y: 73.44, spine: 23, head: 15,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 58.5, y: 87.5, bend: -1 },
});

const PUSH_BOTTOM = p(PUSH_TOP, { x: 38.77, y: 82.05, spine: 19, head: 11 });
const PUSH_PAUSE = p(PUSH_TOP, { x: 38.4, y: 81.2, spine: 19.6, head: 11.6 });

const pushup = {
  id: 'pushup',
  duration: 2700,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PUSH_TOP },
    { t: 0.4, pose: PUSH_BOTTOM },
    { t: 0.54, pose: PUSH_PAUSE },
    { t: 1, pose: PUSH_TOP },
  ],
};

/* --- band chest press ------------------------------------------------
 * Standing, band anchored behind at chest height. Split stance so the body
 * can hold the tension, hands start beside the ribs and finish long in
 * front with the knuckles almost touching.
 * ------------------------------------------------------------------ */

const BCP_STANCE = {
  x: 44, y: 59.5, spine: 88, head: 88,
  footPtL: { x: 35, y: 87.5, bend: 1 },
  footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const BCP_BACK = p(BCP_STANCE, {
  handL: { x: 46, y: 47, bend: -1 },
  handR: { x: 48.5, y: 46, bend: -1 },
});

const BCP_MID = p(BCP_STANCE, {
  handL: { x: 56, y: 44, bend: -1 },
  handR: { x: 58.5, y: 43, bend: -1 },
});

const BCP_LONG = p(BCP_STANCE, {
  handL: { x: 63, y: 42.5, bend: -1 },
  handR: { x: 65.5, y: 41.5, bend: -1 },
});

const BCP_HOLD = p(BCP_STANCE, {
  handL: { x: 62.5, y: 42.9, bend: -1 },
  handR: { x: 65, y: 41.9, bend: -1 },
});

const band_chest_press = {
  id: 'band_chest_press',
  duration: 2800,
  ground: true,
  hero: 0.4,
  ease: 'inOut',
  props: [
    { type: 'wall', x: 12, y0: 20, y1: 88 },
    { type: 'band', x0: 12, y0: 45, x1: 41, y1: 46.5, sag: 2.5 },
  ],
  keys: [
    { t: 0, pose: BCP_BACK },
    { t: 0.24, pose: BCP_MID },
    { t: 0.4, pose: BCP_LONG },
    { t: 0.54, pose: BCP_HOLD },
    { t: 1, pose: BCP_BACK },
  ],
};

/* --- dumbbell bench press -------------------------------------------
 * Flat bench, shoulder blades pinned back, feet driven into the floor. The
 * two bells travel on separate arcs and stop level with the chest.
 * ------------------------------------------------------------------ */

const DB_BENCH = {
  x: 38, y: 72, spine: 8, head: 14,
  footPtL: { x: 22, y: 87.5, bend: -1 },
  footPtR: { x: 27, y: 87.5, bend: -1 },
  footL: 2, footR: 2,
  load: 'dumbbell',
};

const DBB_LOCK = p(DB_BENCH, {
  handL: { x: 60.5, y: 48, bend: 1 },
  handR: { x: 63, y: 47, bend: 1 },
});

const DBB_MID = p(DB_BENCH, {
  handL: { x: 58, y: 54, bend: 1 },
  handR: { x: 60.5, y: 53, bend: 1 },
});

const DBB_CHEST = p(DB_BENCH, {
  handL: { x: 55.5, y: 59.5, bend: 1 },
  handR: { x: 58, y: 58.5, bend: 1 },
});

const DBB_PAUSE = p(DB_BENCH, {
  handL: { x: 55.9, y: 58.9, bend: 1 },
  handR: { x: 58.4, y: 57.9, bend: 1 },
});

const db_bench_press = {
  id: 'db_bench_press',
  duration: 3200,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'bench', x: 52, y: 74, w: 46, h: 6 }],
  keys: [
    { t: 0, pose: DBB_LOCK },
    { t: 0.26, pose: DBB_MID },
    { t: 0.46, pose: DBB_CHEST },
    { t: 0.58, pose: DBB_PAUSE },
    { t: 1, pose: DBB_LOCK },
  ],
};

/* --- cable chest fly -------------------------------------------------
 * Standing between two stacks with one small step forward, so the cables
 * never go slack. The elbow angle barely changes — the arms SWEEP rather
 * than press, from fully spread to the knuckles meeting in front of the
 * sternum, which is what separates a fly from the band press above.
 * ------------------------------------------------------------------ */

const FLY_STANCE = {
  x: 46, y: 59.5, spine: 82, head: 84,
  footPtL: { x: 37, y: 87.5, bend: 1 },
  footPtR: { x: 55, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const CFLY_OPEN = p(FLY_STANCE, {
  handL: { x: 34, y: 45, bend: -1 },
  handR: { x: 68, y: 44, bend: -1 },
});

const CFLY_MID = p(FLY_STANCE, {
  handL: { x: 43, y: 46, bend: -1 },
  handR: { x: 63, y: 44.5, bend: -1 },
});

const CFLY_TOUCH = p(FLY_STANCE, {
  handL: { x: 52, y: 47, bend: -1 },
  handR: { x: 57, y: 45, bend: -1 },
});

const CFLY_HOLD = p(FLY_STANCE, {
  handL: { x: 51.6, y: 46.7, bend: -1 },
  handR: { x: 57.4, y: 45.3, bend: -1 },
});

const cable_chest_fly = {
  id: 'cable_chest_fly',
  duration: 3000,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 10, y: 14, w: 12, h: 54 },
    { type: 'machine', x: 90, y: 14, w: 12, h: 54 },
    { type: 'band', x0: 13, y0: 26, x1: 43, y1: 46, sag: 2 },
    { type: 'band', x0: 87, y0: 26, x1: 63, y1: 44.5, sag: 2 },
  ],
  keys: [
    { t: 0, pose: CFLY_OPEN },
    { t: 0.24, pose: CFLY_MID },
    { t: 0.44, pose: CFLY_TOUCH },
    { t: 0.58, pose: CFLY_HOLD },
    { t: 1, pose: CFLY_OPEN },
  ],
};

/* ================================================================== *
 * 2. VERTICAL PUSH
 * ================================================================== */

/* --- wall slide ------------------------------------------------------
 * The only clip in the batch where nothing but the arms move. Forearms stay
 * flat on the wall, elbows track up under the hands, and the top is where
 * contact would break — not overhead.
 * ------------------------------------------------------------------ */

const WS_BODY = {
  x: 50, y: 58, spine: 90, head: 90,
  footPtL: { x: 48, y: 87.5, bend: 1 },
  footPtR: { x: 51.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const WS_LOW = p(WS_BODY, { armL: [-47, 80], armR: [-35, 76.4] });
const WS_MID = p(WS_BODY, { armL: [-12, 91], armR: [0, 87.5] });
const WS_HIGH = p(WS_BODY, { armL: [23, 80], armR: [35, 76.4] });
const WS_HOLD = p(WS_BODY, { armL: [21, 81], armR: [33, 77.4] });

const wall_slide = {
  id: 'wall_slide',
  duration: 3400,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'wall', x: 62.5, y0: 8, y1: 88 }],
  keys: [
    { t: 0, pose: WS_LOW },
    { t: 0.24, pose: WS_MID },
    { t: 0.44, pose: WS_HIGH },
    { t: 0.56, pose: WS_HOLD },
    { t: 0.78, pose: WS_MID },
    { t: 1, pose: WS_LOW },
  ],
};

/* --- hands-elevated pike push-up -------------------------------------
 * Same wedge as the floor pike, but the hands are up on a step, so the
 * torso sits far closer to horizontal and the head dips past the edge
 * instead of to the ground.
 * ------------------------------------------------------------------ */

const IPK_FEET = {
  footPtL: { x: 24, y: 86.5, bend: -1 },
  footPtR: { x: 28.5, y: 86.5, bend: -1 },
  footL: -22, footR: -22,
};

const IPK_TOP = p(IPK_FEET, {
  x: 31.5, y: 58, spine: -20, head: -30,
  handL: { x: 70, y: 79.5, bend: -1 },
  handR: { x: 72, y: 79.5, bend: -1 },
});

const IPK_BOTTOM = p(IPK_TOP, { x: 39.3, y: 62.3, spine: -25, head: -58 });
const IPK_PAUSE = p(IPK_TOP, { x: 38.6, y: 62, spine: -24.4, head: -55 });

const incline_pike_pushup = {
  id: 'incline_pike_pushup',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'bench', x: 82, y: 80, w: 24, h: 5 }],
  keys: [
    { t: 0, pose: IPK_TOP },
    { t: 0.42, pose: IPK_BOTTOM },
    { t: 0.56, pose: IPK_PAUSE },
    { t: 1, pose: IPK_TOP },
  ],
};

/* --- pike push-up ----------------------------------------------------
 * Hips as high as they will go, hands flat on the floor, the crown of the
 * head lands between them. Steepest wedge in the batch.
 * ------------------------------------------------------------------ */

const PK_FEET = {
  footPtL: { x: 28, y: 87.5, bend: -1 },
  footPtR: { x: 32.5, y: 87.5, bend: -1 },
  footL: -12, footR: -12,
};

const PK_TOP = p(PK_FEET, {
  x: 34.8, y: 59.4, spine: -22, head: -34,
  handL: { x: 66, y: 87.5, bend: -1 },
  handR: { x: 68, y: 87.5, bend: -1 },
});

const PK_BOTTOM = p(PK_TOP, { x: 43.2, y: 61.6, spine: -30, head: -60 });
const PK_PAUSE = p(PK_TOP, { x: 42.4, y: 61.4, spine: -29, head: -57 });

const pike_pushup = {
  id: 'pike_pushup',
  duration: 2900,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PK_TOP },
    { t: 0.42, pose: PK_BOTTOM },
    { t: 0.56, pose: PK_PAUSE },
    { t: 1, pose: PK_TOP },
  ],
};

/* --- machine shoulder press ------------------------------------------
 * Seated, spine flat on the pad, handles starting level with the shoulder.
 * The path is a fixed vertical track and the elbows stop short of locked.
 * ------------------------------------------------------------------ */

const MSP_SEAT = {
  x: 40, y: 66, spine: 92, head: 90,
  footPtL: { x: 52, y: 87.5, bend: 1 },
  footPtR: { x: 54.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const MSP_LOW = p(MSP_SEAT, {
  handL: { x: 47.5, y: 45.5, bend: 1 },
  handR: { x: 50, y: 44.5, bend: 1 },
});

const MSP_MID = p(MSP_SEAT, {
  handL: { x: 46, y: 34, bend: 1 },
  handR: { x: 48.5, y: 33, bend: 1 },
});

const MSP_HIGH = p(MSP_SEAT, {
  handL: { x: 44, y: 23.5, bend: 1 },
  handR: { x: 46.5, y: 22.5, bend: 1 },
});

const MSP_HOLD = p(MSP_SEAT, {
  handL: { x: 44.2, y: 24.3, bend: 1 },
  handR: { x: 46.7, y: 23.3, bend: 1 },
});

const machine_shoulder_press = {
  id: 'machine_shoulder_press',
  duration: 2800,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 28, y: 26, w: 12, h: 46 },
    { type: 'bench', x: 44, y: 70, w: 26, h: 5 },
    { type: 'machine', x: 42, y: 14, w: 22, h: 10 },
  ],
  keys: [
    { t: 0, pose: MSP_LOW },
    { t: 0.24, pose: MSP_MID },
    { t: 0.42, pose: MSP_HIGH },
    { t: 0.54, pose: MSP_HOLD },
    { t: 1, pose: MSP_LOW },
  ],
};

/* --- landmine press --------------------------------------------------
 * One arm only. The bar is anchored in the floor, so the hand runs on a
 * diagonal — forward as much as up — while the free arm hangs and the
 * shoulder travels forward at the finish.
 * ------------------------------------------------------------------ */

const LM_STANCE = {
  x: 40, y: 59.5, spine: 88, head: 86,
  armL: [-115, -95],
  footPtL: { x: 33, y: 87.5, bend: 1 },
  footPtR: { x: 47, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const LM_RACK = p(LM_STANCE, { handR: { x: 47.4, y: 43, bend: 1 } });
const LM_MID = p(LM_STANCE, { handR: { x: 53.9, y: 35, bend: 1 } });
const LM_LOCK = p(LM_STANCE, {
  x: 41, spine: 85, head: 83,
  handR: { x: 60, y: 27.5, bend: 1 },
});
const LM_HOLD = p(LM_STANCE, {
  x: 40.8, spine: 85.6, head: 83.6,
  handR: { x: 59.4, y: 28.2, bend: 1 },
});

const landmine_press = {
  id: 'landmine_press',
  duration: 3000,
  ground: true,
  hero: 0,
  ease: 'inOut',
  props: [
    { type: 'box', x: 9, y: 82, w: 14, h: 6 },
    { type: 'band', x0: 12, y0: 86.5, x1: 60, y1: 27.5, sag: 0 },
  ],
  keys: [
    { t: 0, pose: LM_RACK },
    { t: 0.26, pose: LM_MID },
    { t: 0.44, pose: LM_LOCK },
    { t: 0.56, pose: LM_HOLD },
    { t: 1, pose: LM_RACK },
  ],
};

/* --- standing dumbbell shoulder press --------------------------------
 * Ribs down, glutes tight — the spine angle never changes. The bells start
 * racked wide in front of the shoulders, arc OUT past the ears (which is
 * what keeps the near and far arm apart on screen) and finish stacked over
 * the middle of the head.
 * ------------------------------------------------------------------ */

const DSP_STANCE = {
  x: 48, y: 58, spine: 89, head: 90,
  footPtL: { x: 46, y: 87.5, bend: 1 },
  footPtR: { x: 50.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
  load: 'dumbbell',
};

const DSP_RACK = p(DSP_STANCE, {
  handL: { x: 52, y: 47, bend: 1 },
  handR: { x: 57, y: 46, bend: 1 },
});

const DSP_OUT = p(DSP_STANCE, {
  handL: { x: 56, y: 34, bend: 1 },
  handR: { x: 60, y: 33, bend: 1 },
});

const DSP_LOCK = p(DSP_STANCE, {
  handL: { x: 48.5, y: 15.5, bend: 1 },
  handR: { x: 52.5, y: 14.5, bend: 1 },
});

const DSP_HOLD = p(DSP_STANCE, {
  handL: { x: 48.4, y: 16.3, bend: 1 },
  handR: { x: 52.4, y: 15.3, bend: 1 },
});

const DSP_DOWN = p(DSP_STANCE, {
  handL: { x: 55, y: 33, bend: 1 },
  handR: { x: 59, y: 32, bend: 1 },
});

const db_shoulder_press = {
  id: 'db_shoulder_press',
  duration: 3000,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: DSP_RACK },
    { t: 0.2, pose: DSP_OUT },
    { t: 0.42, pose: DSP_LOCK },
    { t: 0.54, pose: DSP_HOLD },
    { t: 0.78, pose: DSP_DOWN },
    { t: 1, pose: DSP_RACK },
  ],
};

/* --- barbell overhead press ------------------------------------------
 * The bar cannot go through the skull, so the head pulls back to let it
 * pass and pushes forward through the window at lockout. That head
 * movement is the whole tell of a strict barbell press.
 * ------------------------------------------------------------------ */

const OHP_STANCE = {
  x: 48, y: 58, spine: 89,
  footPtL: { x: 46, y: 87.5, bend: 1 },
  footPtR: { x: 50.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
  load: 'barbell',
};

const OHP_RACK = p(OHP_STANCE, {
  head: 101,
  handL: { x: 54, y: 42, bend: 1 },
  handR: { x: 56.5, y: 41.5, bend: 1 },
});

const OHP_PAST = p(OHP_STANCE, {
  head: 103,
  handL: { x: 53.5, y: 28.5, bend: 1 },
  handR: { x: 56, y: 28, bend: 1 },
});

const OHP_LOCK = p(OHP_STANCE, {
  head: 86,
  handL: { x: 49.5, y: 14, bend: 1 },
  handR: { x: 52, y: 13.5, bend: 1 },
});

const OHP_HOLD = p(OHP_STANCE, {
  head: 87,
  handL: { x: 49.5, y: 14.8, bend: 1 },
  handR: { x: 52, y: 14.3, bend: 1 },
});

const overhead_press = {
  id: 'overhead_press',
  duration: 3200,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: OHP_RACK },
    { t: 0.22, pose: OHP_PAST },
    { t: 0.42, pose: OHP_LOCK },
    { t: 0.56, pose: OHP_HOLD },
    { t: 1, pose: OHP_RACK },
  ],
};

/* --- push press ------------------------------------------------------
 * A short vertical dip, then the legs throw the bar. Fast: the dip and
 * drive together take a third of the loop, the heels leave the floor on
 * the drive, and the arms only finish what the hips started.
 * ------------------------------------------------------------------ */

const PP_FLAT = {
  footPtL: { x: 46, y: 87.5, bend: 1 },
  footPtR: { x: 50.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
  load: 'barbell',
};

const PP_TOE = {
  footPtL: { x: 46, y: 86, bend: 1 },
  footPtR: { x: 50.5, y: 86, bend: 1 },
  footL: -20, footR: -20,
  load: 'barbell',
};

const PP_RACK = p(PP_FLAT, {
  x: 48, y: 58, spine: 89, head: 98,
  handL: { x: 55, y: 42, bend: 1 },
  handR: { x: 57.5, y: 41.5, bend: 1 },
});

const PP_DIP = p(PP_FLAT, {
  x: 48, y: 64, spine: 90, head: 98,
  handL: { x: 55, y: 48, bend: 1 },
  handR: { x: 57.5, y: 47.5, bend: 1 },
});

const PP_DRIVE = p(PP_TOE, {
  x: 48, y: 56.5, spine: 91, head: 100,
  handL: { x: 54, y: 31, bend: 1 },
  handR: { x: 56.5, y: 30.5, bend: 1 },
});

const PP_LOCK = p(PP_FLAT, {
  x: 48, y: 58, spine: 89, head: 87,
  handL: { x: 50, y: 14, bend: 1 },
  handR: { x: 52.5, y: 13.5, bend: 1 },
});

const PP_HOLD = p(PP_FLAT, {
  x: 48, y: 58.4, spine: 89, head: 88,
  handL: { x: 50, y: 14.8, bend: 1 },
  handR: { x: 52.5, y: 14.3, bend: 1 },
});

const push_press = {
  id: 'push_press',
  duration: 1700,
  ground: true,
  hero: 0.34,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PP_RACK },
    { t: 0.2, pose: PP_DIP, ease: 'out' },
    { t: 0.28, pose: PP_DRIVE, ease: 'in' },
    { t: 0.36, pose: PP_LOCK, ease: 'out' },
    { t: 0.58, pose: PP_HOLD },
    { t: 1, pose: PP_RACK },
  ],
};

export const X01_CLIPS = {
  incline_pushup,
  pushup,
  band_chest_press,
  db_bench_press,
  cable_chest_fly,
  wall_slide,
  incline_pike_pushup,
  pike_pushup,
  machine_shoulder_press,
  landmine_press,
  db_shoulder_press,
  overhead_press,
  push_press,
};
