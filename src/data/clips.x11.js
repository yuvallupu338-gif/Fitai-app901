/* clips.x11.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Plyometrics, core and loaded carries — three families that fail in three
 * different ways if drawn carelessly:
 *
 *   A jump that never leaves the ground is not a jump, so every plyo clip has a
 *   frame where BOTH feet are clear of the floor and a landing frame with the
 *   knees bent to absorb it.
 *   A carry is walking, so the legs must be visibly out of phase, and the
 *   suitcase version loads ONE side while the torso refuses to lean — that
 *   asymmetry is the whole exercise.
 *   Anti-extension work is about what does NOT happen: the body lengthens away
 *   from the hands and the spine holds its line instead of sagging.
 */

import { p, STAND, HANG, HANG_TUCK, SEATED } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 2600, hero: 0, ease: 'inOut', props: [] }, o);

/* ---- jumps: `lift` raises the whole figure off the floor ---- */

const grounded = (over) => p(STAND, Object.assign({ y: 57 }, over || {}));

const dip = (depth, over) => p(STAND, Object.assign({
  y: 57 + depth, spine: 74, head: 78,
  armL: [-140, -150], armR: [-146, -156],
  footPtL: { x: 48, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
}, over || {}));

const airborne = (lift, over) => p(STAND, Object.assign({
  y: 57 - lift, spine: 92, head: 92,
  armL: [40, 50], armR: [34, 44],
  legL: [-86, -88], legR: [-94, -90], footL: -40, footR: -40,
}, over || {}));

const POGO_DOWN = dip(3, { armL: [-96, -100], armR: [-100, -104], spine: 86, head: 88 });
const POGO_AIR = airborne(5, { armL: [-96, -100], armR: [-100, -104], spine: 90, head: 90 });
const POGO_STAND = grounded({ armL: [-96, -100], armR: [-100, -104] });

const VJ_STAND = grounded({});
const VJ_DIP = dip(9);
const VJ_AIR = airborne(14);
const VJ_LAND = dip(6);

const BOX_STAND = grounded({ x: 34 });
const BOX_DIP = dip(9, { x: 34, footPtL: { x: 32, y: 87.5, bend: 1 }, footPtR: { x: 36, y: 87.5, bend: 1 } });
const BOX_AIR = airborne(13, { x: 48 });
const BOX_TOP = {
  x: 62, y: 47, spine: 80, head: 84,
  armL: [-30, -40], armR: [-36, -46],
  footPtL: { x: 60, y: 70, bend: 1 }, footPtR: { x: 64, y: 70, bend: 1 },
  footL: 2, footR: 2,
};

/* Skater: travels sideways and lands on ONE leg, so the legs never mirror. */
const SKATE_LEFT = {
  x: 34, y: 64, spine: 76, head: 80,
  armL: [-150, -160], armR: [-20, -10],
  footPtL: { x: 30, y: 87.5, bend: 1 },
  legR: [10, -60], footL: 2, footR: -40,
};
const SKATE_AIR = p(STAND, {
  x: 50, y: 50, spine: 90, head: 90,
  armL: [40, 50], armR: [140, 130],
  legL: [-60, -110], legR: [-120, -70], footL: -30, footR: -30,
});
const SKATE_RIGHT = {
  x: 66, y: 64, spine: 76, head: 80,
  armL: [-20, -10], armR: [-150, -160],
  footPtL: { x: 70, y: 87.5, bend: 1 },
  legR: [170, -120], footL: 2, footR: -40,
};

/* Split jump: the forward leg swaps in mid-air. */
const SPLIT_A = {
  x: 48, y: 68, spine: 88, head: 88,
  armL: [-40, -30], armR: [-140, -150],
  footPtL: { x: 34, y: 84, bend: 1 }, footPtR: { x: 62, y: 87.5, bend: 1 },
  footL: -42, footR: 2,
};
const SPLIT_AIR = p(STAND, {
  y: 46, spine: 90, head: 90,
  armL: [50, 60], armR: [130, 120],
  legL: [-60, -100], legR: [-120, -80], footL: -30, footR: -30,
});
const SPLIT_B = {
  x: 48, y: 68, spine: 88, head: 88,
  armL: [-140, -150], armR: [-40, -30],
  footPtL: { x: 62, y: 84, bend: 1 }, footPtR: { x: 34, y: 87.5, bend: 1 },
  footL: -42, footR: 2,
};

/* ---- core ---- */

const KNEE_UP = p(STAND, {
  spine: 84, head: 84,
  armL: [-160, -120], armR: [30, -10],
  legL: [-30, -110], legR: [-92, -90], footL: -40, footR: 2,
});
const KNEE_DOWN = p(STAND, { armL: [40, 50], armR: [140, 130] });

/* Anti-extension: the body lengthens away from the hands and must NOT sag. */
const FALLOUT_SHORT = {
  x: 44, y: 70, spine: 40, head: 34,
  handL: { x: 62, y: 48, bend: -1 }, handR: { x: 65, y: 48, bend: -1 },
  legL: [-96, -172], legR: [-100, -176], footL: 170, footR: 170,
};
const FALLOUT_LONG = {
  x: 40, y: 74, spine: 22, head: 16,
  handL: { x: 76, y: 44, bend: -1 }, handR: { x: 79, y: 44, bend: -1 },
  legL: [-96, -172], legR: [-100, -176], footL: 170, footR: 170,
};

const ROLL_SHORT = {
  x: 46, y: 70, spine: 36, head: 30,
  handL: { x: 66, y: 84, bend: -1 }, handR: { x: 69, y: 84, bend: -1 },
  legL: [-104, 178], legR: [-108, 174], footL: 170, footR: 170, load: 'barbell',
};
const ROLL_LONG = {
  x: 38, y: 74, spine: 16, head: 10,
  handL: { x: 84, y: 86, bend: -1 }, handR: { x: 87, y: 86, bend: -1 },
  legL: [-104, 178], legR: [-108, 174], footL: 170, footR: 170, load: 'barbell',
};

const LEVER_HANG = p(HANG_TUCK, {});
const LEVER_TUCK = p(HANG, {
  y: 46, spine: 8, head: 14,
  handL: { x: 47, y: 15, bend: 1 }, handR: { x: 53, y: 15, bend: 1 },
  legL: [-150, -130], legR: [-156, -136], footL: -60, footR: -60,
});

/* Rotation: the hands travel diagonally while the feet stay planted. */
const CHOP_HIGH = {
  x: 50, y: 57, spine: 96, head: 100,
  armL: [130, 140], armR: [124, 134],
  footPtL: { x: 46, y: 87.5, bend: 1 }, footPtR: { x: 54, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const CHOP_LOW = {
  x: 50, y: 64, spine: 74, head: 68,
  armL: [-48, -56], armR: [-54, -62],
  footPtL: { x: 46, y: 87.5, bend: 1 }, footPtR: { x: 54, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const WINDMILL_UP = p(STAND, {
  armL: [96, 94], armR: [-100, -104], load: 'kettlebell',
});
const WINDMILL_DOWN = {
  x: 46, y: 64, spine: 40, head: 34,
  armL: [104, 100], armR: [-70, -78], load: 'kettlebell',
  footPtL: { x: 36, y: 87.5, bend: 1 }, footPtR: { x: 58, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* ---- carries: walking, so the legs are out of phase ---- */

const stride = (phase, over) => p(STAND, Object.assign({
  y: 56.5,
  legL: [-90 + phase, -92 + phase * 0.5],
  legR: [-90 - phase, -92 - phase * 0.5],
  footL: 2 + phase * 0.4, footR: 2 - phase * 0.4,
}, over || {}));

const CARRY_A = (over) => stride(16, over);
const CARRY_MID = (over) => stride(0, over);
const CARRY_B = (over) => stride(-16, over);

const BACKPACK = { armL: [-84, -88], armR: [-96, -92] };
const FRONT_RACK = { armL: [-46, 44], armR: [-52, 38], load: 'kettlebell' };
const OVERHEAD = { armL: [92, 90], armR: [88, 90], load: 'dumbbell' };
/* Suitcase: ONE side is loaded and the torso resists the lean. Mirroring the
   arms here would draw a farmer carry and lose the entire point. */
const SUITCASE = { spine: 94, head: 94, armL: [-84, -88], armR: [-98, -94], load: 'dumbbell' };

/* ---- machine intervals: seated, legs cycling, but clearly different rigs ---- */

const BIKE_A = p(SEATED, {
  x: 42, y: 62, spine: 74, head: 70,
  armL: [-16, -12], armR: [-22, -18],
  legL: [-20, -70], legR: [-70, -110], footL: 10, footR: 10,
});
const BIKE_B = p(SEATED, {
  x: 42, y: 62, spine: 74, head: 70,
  armL: [-16, -12], armR: [-22, -18],
  legL: [-70, -110], legR: [-20, -70], footL: 10, footR: 10,
});

const ROW_CATCH = p(SEATED, {
  x: 34, y: 70, spine: 66, head: 62,
  armL: [-6, -2], armR: [-12, -8],
  legL: [-10, -104], legR: [-14, -108], footL: 20, footR: 20,
});
const ROW_FINISH = p(SEATED, {
  x: 52, y: 70, spine: 100, head: 104,
  armL: [-168, -172], armR: [-174, -178],
  legL: [-4, -86], legR: [-8, -90], footL: 4, footR: 4,
});

export const X11_CLIPS = {
  pogo_hop: clip({
    id: 'pogo_hop', duration: 900,
    keys: [
      { t: 0, pose: POGO_STAND }, { t: 0.22, pose: POGO_DOWN },
      { t: 0.5, pose: POGO_AIR }, { t: 0.76, pose: POGO_DOWN },
      { t: 1, pose: POGO_STAND },
    ],
  }),

  vertical_jump: clip({
    id: 'vertical_jump', duration: 1400,
    keys: [
      { t: 0, pose: VJ_STAND }, { t: 0.26, pose: VJ_DIP },
      { t: 0.5, pose: VJ_AIR }, { t: 0.72, pose: VJ_LAND },
      { t: 1, pose: VJ_STAND },
    ],
  }),

  box_jump: clip({
    id: 'box_jump', duration: 1600,
    props: [{ type: 'box', x: 62, y: 70, w: 24, h: 18 }],
    keys: [
      { t: 0, pose: BOX_STAND }, { t: 0.24, pose: BOX_DIP },
      { t: 0.48, pose: BOX_AIR }, { t: 0.68, pose: BOX_TOP },
      { t: 1, pose: BOX_STAND },
    ],
  }),

  skater_hop: clip({
    id: 'skater_hop', duration: 1500,
    keys: [
      { t: 0, pose: SKATE_LEFT }, { t: 0.3, pose: SKATE_AIR },
      { t: 0.55, pose: SKATE_RIGHT }, { t: 0.82, pose: SKATE_AIR },
      { t: 1, pose: SKATE_LEFT },
    ],
  }),

  split_jump: clip({
    id: 'split_jump', duration: 1500,
    keys: [
      { t: 0, pose: SPLIT_A }, { t: 0.3, pose: SPLIT_AIR },
      { t: 0.55, pose: SPLIT_B }, { t: 0.82, pose: SPLIT_AIR },
      { t: 1, pose: SPLIT_A },
    ],
  }),

  standing_knee_to_elbow: clip({
    id: 'standing_knee_to_elbow', duration: 2200,
    keys: [
      { t: 0, pose: KNEE_DOWN }, { t: 0.45, pose: KNEE_UP },
      { t: 0.6, pose: KNEE_UP }, { t: 1, pose: KNEE_DOWN },
    ],
  }),

  trx_fallout: clip({
    id: 'trx_fallout', duration: 3400,
    props: [
      { type: 'band', x0: 62, y0: 8, x1: 62, y1: 46, sag: 0 },
      { type: 'band', x0: 68, y0: 8, x1: 68, y1: 46, sag: 0 },
    ],
    keys: [
      { t: 0, pose: FALLOUT_SHORT }, { t: 0.45, pose: FALLOUT_LONG },
      { t: 0.62, pose: FALLOUT_LONG }, { t: 1, pose: FALLOUT_SHORT },
    ],
  }),

  barbell_rollout: clip({
    id: 'barbell_rollout', duration: 3400,
    props: [{ type: 'mat', x: 46, w: 60 }],
    keys: [
      { t: 0, pose: ROLL_SHORT }, { t: 0.45, pose: ROLL_LONG },
      { t: 0.62, pose: ROLL_LONG }, { t: 1, pose: ROLL_SHORT },
    ],
  }),

  front_lever_tuck: clip({
    id: 'front_lever_tuck', duration: 4000, ground: false,
    props: [{ type: 'bar', x: 50, y: 15, w: 44 }],
    keys: [
      { t: 0, pose: LEVER_HANG }, { t: 0.4, pose: LEVER_TUCK },
      { t: 0.66, pose: LEVER_TUCK }, { t: 1, pose: LEVER_HANG },
    ],
  }),

  band_woodchop: clip({
    id: 'band_woodchop', duration: 2600,
    props: [{ type: 'band', x0: 84, y0: 22, x1: 62, y1: 34, sag: 2 }],
    keys: [
      { t: 0, pose: CHOP_HIGH }, { t: 0.42, pose: CHOP_LOW },
      { t: 0.6, pose: CHOP_LOW }, { t: 1, pose: CHOP_HIGH },
    ],
  }),

  cable_woodchop: clip({
    id: 'cable_woodchop', duration: 2700,
    props: [
      { type: 'machine', x: 86, y: 20, w: 12, h: 40 },
      { type: 'band', x0: 82, y0: 26, x1: 62, y1: 34, sag: 1 },
    ],
    keys: [
      { t: 0, pose: CHOP_HIGH }, { t: 0.42, pose: CHOP_LOW },
      { t: 0.62, pose: CHOP_LOW }, { t: 1, pose: CHOP_HIGH },
    ],
  }),

  windmill: clip({
    id: 'windmill', duration: 3600,
    keys: [
      { t: 0, pose: WINDMILL_UP }, { t: 0.45, pose: WINDMILL_DOWN },
      { t: 0.64, pose: WINDMILL_DOWN }, { t: 1, pose: WINDMILL_UP },
    ],
  }),

  backpack_carry: clip({
    id: 'backpack_carry', duration: 2400,
    keys: [
      { t: 0, pose: CARRY_A(BACKPACK) }, { t: 0.33, pose: CARRY_MID(BACKPACK) },
      { t: 0.66, pose: CARRY_B(BACKPACK) }, { t: 1, pose: CARRY_A(BACKPACK) },
    ],
  }),

  suitcase_hold: clip({
    id: 'suitcase_hold', duration: 2600,
    keys: [
      { t: 0, pose: CARRY_A(SUITCASE) }, { t: 0.33, pose: CARRY_MID(SUITCASE) },
      { t: 0.66, pose: CARRY_B(SUITCASE) }, { t: 1, pose: CARRY_A(SUITCASE) },
    ],
  }),

  front_rack_carry: clip({
    id: 'front_rack_carry', duration: 2500,
    keys: [
      { t: 0, pose: CARRY_A(FRONT_RACK) }, { t: 0.33, pose: CARRY_MID(FRONT_RACK) },
      { t: 0.66, pose: CARRY_B(FRONT_RACK) }, { t: 1, pose: CARRY_A(FRONT_RACK) },
    ],
  }),

  overhead_carry: clip({
    id: 'overhead_carry', duration: 2500,
    keys: [
      { t: 0, pose: CARRY_A(OVERHEAD) }, { t: 0.33, pose: CARRY_MID(OVERHEAD) },
      { t: 0.66, pose: CARRY_B(OVERHEAD) }, { t: 1, pose: CARRY_A(OVERHEAD) },
    ],
  }),

  bike_intervals: clip({
    id: 'bike_intervals', duration: 1600,
    props: [{ type: 'machine', x: 62, y: 56, w: 20, h: 32 }, { type: 'bench', x: 38, y: 62, w: 16, h: 4 }],
    keys: [
      { t: 0, pose: BIKE_A }, { t: 0.5, pose: BIKE_B }, { t: 1, pose: BIKE_A },
    ],
  }),

  rower_intervals: clip({
    id: 'rower_intervals', duration: 2400,
    props: [{ type: 'machine', x: 78, y: 62, w: 16, h: 26 }, { type: 'bench', x: 42, y: 76, w: 46, h: 4, legs: false }],
    keys: [
      { t: 0, pose: ROW_CATCH }, { t: 0.42, pose: ROW_FINISH },
      { t: 0.6, pose: ROW_FINISH }, { t: 1, pose: ROW_CATCH },
    ],
  }),
};

