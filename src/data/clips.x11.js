/* clips.x11.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Plyometrics, core and loaded carries — three families that fail in three
 * different ways if drawn carelessly:
 *
 *   A jump that never leaves the ground is not a jump, so every plyo clip has a
 *   frame where BOTH ankles are clear of the floor and a landing frame with the
 *   knees bent to absorb it. Every foot is an IK target in every frame, in the
 *   air as well as on the floor, so the ankle height is stated rather than
 *   inherited — FK legs left to swing between keys are what turn a hop into a
 *   small squat and what send a limb the long way round near +/-180.
 *   A carry is walking: one foot is always planted and the two legs are never in
 *   the same place. The suitcase version is the exception — it is a HOLD (unit
 *   'time'; the walking version is its own exercise, suitcase_carry), the feet
 *   never move, and only ONE hand is loaded. A one-sided load is `load` plus
 *   `loadSide`: without the side the rig mirrors the implement into the free
 *   hand, and a suitcase hold with a bell in each hand is a farmer carry. Hiding
 *   the mirrored bell behind the body does not work either — measured, it pokes
 *   out both sides of the torso — and it forces the free arm into the mirror of
 *   the loaded one, which is the very symmetry the exercise exists to break.
 *   Anti-extension work is about what does NOT happen: the body lengthens away
 *   from the hands while the spine holds its line. The hands are the anchor —
 *   they stay welded to the bar, the floor or the straps, because an implement
 *   the figure is visibly not touching reads as a mistake before anything else.
 */

import { GROUND } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 2600, hero: 0, ease: 'inOut', props: [] }, o);

const FLOOR = GROUND - 0.5;

/* ================================================================== *
 * JUMPS
 * ================================================================== */

const jump = (px, py, spine, head, armL, armR, fL, fR, foot) => ({
  x: px, y: py, spine, head, armL, armR,
  footPtL: { x: fL[0], y: fL[1], bend: 1 },
  footPtR: { x: fR[0], y: fR[1], bend: 1 },
  footL: foot[0], footR: foot[1],
});

/* Pogo: ankles only. The knees barely bend and the arms never move, so the
   whole rise has to come from the toes — which is why the foot angle swings
   8 -> -55 while the spine sits still. */
const POGO_ARMS = [[-92, -34], [-98, -40]];
const POGO_CONTACT = jump(50, 58.4, 89, 89, ...POGO_ARMS, [48.6, FLOOR], [51.4, FLOOR], [8, 8]);
const POGO_TOEOFF = jump(50, 53.6, 89, 89, ...POGO_ARMS, [48.6, 83.4], [51.4, 83.4], [-40, -40]);
const POGO_AIR = jump(50, 48.6, 89, 89, ...POGO_ARMS, [48.6, 79.1], [51.4, 79.1], [-55, -55]);

/* Vertical jump: deep countermovement with the arms thrown behind the hips,
   then a full reach overhead, then a soft quarter-squat landing. */
const VJ_STAND = jump(50, 57, 89, 89, [-86, -88], [-94, -92], [48.6, FLOOR], [51.4, FLOOR], [2, 2]);
const VJ_DIP = jump(50, 66, 70, 80, [-136, -146], [-142, -152], [48.6, FLOOR], [51.4, FLOOR], [2, 2]);
/* The apex is set by the ceiling, not by taste: the reaching hands are the
   highest thing in the frame, and at pelvis 46 they measured out at y -0.14,
   i.e. clipped off the top of the 0..100 canvas along with the wrist cap. The
   pelvis sits at 48.6 instead, which lands the hands at y 2.5, and the ankles
   drop with it so the legs stay as extended as they were — the feet still clear
   the floor by 7.9. */
const VJ_AIR = jump(51, 48.6, 92, 92, [82, 98], [76, 92], [50, 75], [52.5, 75.5], [-45, -45]);
const VJ_LAND = jump(50, 64, 74, 84, [-40, -52], [-46, -58], [48.6, FLOOR], [51.4, FLOOR], [2, 2]);

/* Box jump. The cue is "step down, never jump down", so the return is a
   two-beat step-off: one foot reaches the floor while the other is still up on
   the box. That is also what separates it from the family clip, which floats
   back off the box in one piece. */
const BOX = { type: 'box', x: 64, y: 71, w: 24, h: 17 };
const BOX_STAND = jump(36, 57, 89, 89, [-86, -88], [-94, -92], [34.6, FLOOR], [37.4, FLOOR], [2, 2]);
const BOX_DIP = jump(36, 66, 70, 80, [-136, -146], [-142, -152], [34.6, FLOOR], [37.4, FLOOR], [2, 2]);
const BOX_AIR = jump(50, 46, 84, 84, [30, 44], [24, 38], [50, 72], [52.5, 72.5], [-40, -40]);
const BOX_LAND = jump(63, 50, 72, 82, [-24, -40], [-30, -46], [60, 71], [64, 71], [2, 2]);
const BOX_TALL = jump(64, 41, 88, 88, [-86, -88], [-94, -92], [62, 71], [65, 71], [2, 2]);
const BOX_STEP = jump(48, 60, 80, 84, [-70, -80], [-78, -88], [37.4, FLOOR], [64, 71], [2, 2]);
const BOX_ABSORB = jump(37, 63, 80, 84, [-70, -80], [-78, -88], [34.6, FLOOR], [37.4, FLOOR], [2, 2]);

/* Skater: a sideways bound that lands on ONE leg and sticks it. The planted
   foot is on the floor, the free foot is up and swept behind, and the figure
   crosses the frame — three things a two-footed hop never does. */
const SK_R = jump(63, 64, 74, 82, [-158, -168], [-16, -6], [52, 79], [68, FLOOR], [-35, 2]);
const SK_L = jump(37, 64, 74, 82, [-22, -12], [-152, -162], [32, FLOOR], [48, 79], [2, -35]);
const SK_AIR_L = jump(50, 55, 86, 88, [-120, -140], [-40, -20], [44, 76], [56, 74], [-30, -30]);
const SK_AIR_R = jump(50, 55, 86, 88, [-40, -20], [-120, -140], [56, 74], [44, 76], [-30, -30]);

/* Split jump: a lunge stance with a flight phase, landing with the legs
   swapped. The rear heel is up in both stances, the arms alternate with them. */
const SJ_A = jump(48, 68, 88, 88, [-46, -30], [-134, -150], [34, 84], [62, FLOOR], [-35, 2]);
const SJ_B = jump(48, 68, 88, 88, [-134, -150], [-46, -30], [62, FLOOR], [34, 84], [2, -35]);
const SJ_AIR_A = jump(49, 52, 90, 90, [-80, -50], [-100, -130], [56, 74], [42, 76], [-30, -30]);
const SJ_AIR_B = jump(49, 52, 90, 90, [-100, -130], [-80, -50], [42, 76], [56, 74], [-30, -30]);

/* ================================================================== *
 * CORE
 * ================================================================== */

/* Standing knee to elbow. Unilateral: the NEAR knee drives up and the NEAR
   elbow comes down onto it, so the two actually meet on screen — a far knee
   and a near elbow would pass each other and read as a march. The other arm
   stays overhead, which keeps the sides from mirroring. */
const KTE_TALL = {
  x: 50, y: 57.2, spine: 90, head: 90,
  armL: [132, 140], armR: [92, 96],
  footPtL: { x: 48.5, y: FLOOR, bend: 1 },
  footPtR: { x: 52, y: FLOOR, bend: 1 },
  footL: 2, footR: 2,
};
const KTE_CRUNCH = {
  x: 50, y: 57.2, spine: 66, head: 58,
  armL: [128, 136], armR: [-64, 200],
  footPtL: { x: 48.5, y: FLOOR, bend: 1 },
  footPtR: { x: 63.6, y: 61, bend: 1 },
  footL: 2, footR: -30,
};

/* TRX fallout: STANDING, one rigid line from the heels up, arms straight the
   whole way. The hands ride forward on the strap arc as the body falls away
   from them, which is the only path a fixed anchor actually allows. */
const trx = (px, py, spine, hx, hy, foot) => ({
  x: px, y: py, spine, head: spine,
  handL: { x: hx, y: hy, bend: -1 },
  handR: { x: hx + 1, y: hy - 0.8, bend: -1 },
  footPtL: { x: 26, y: FLOOR, bend: 1 },
  footPtR: { x: 28.2, y: FLOOR, bend: 1 },
  footL: foot, footR: foot,
});
const TRX_IN = trx(38.28, 59.91, 66, 66.2, 28.8, 8);
const TRX_MID = trx(42.5, 62.7, 57, 70.6, 30.0, 6);
const TRX_OUT = trx(46.21, 65.05, 48, 74.6, 30.6, 4);

/* Barbell rollout from the knees. Pairing the pelvis with the thigh angle
   holds the knee at (50, 87) so it never slides or sinks through the floor,
   and the hands stay pinned at y 83.6 so the bar rolls along the mat instead
   of drifting up into the air at an angle. */
const roll = (thigh, px, py, spine, hx) => ({
  x: px, y: py, spine, head: spine - 6,
  handL: { x: hx, y: 83.6, bend: -1 },
  handR: { x: hx + 1.4, y: 83.6, bend: -1 },
  legL: [thigh, 180], legR: [thigh - 3, 178],
  footL: 174, footR: 172, load: 'barbell',
});
const ROLL_IN = roll(-90, 50, 71.5, 29, 68.8);
const ROLL_MID = roll(-75, 45.99, 72.03, 20, 79.2);
const ROLL_OUT = roll(-62, 42.72, 73.32, 12, 81.4);

/* Tuck front lever. The shoulder is parked directly under the bar so the arms
   stay locked onto it in every frame. The hold IS the exercise, so the clip
   spends its time refusing a sag rather than swinging up and down. */
const lever = (spine, legL, legR, foot) => ({
  x: 49.4 - 22.88 * Math.cos((spine * Math.PI) / 180),
  y: 37.8 + 22.88 * Math.sin((spine * Math.PI) / 180),
  spine, head: spine,
  handL: { x: 47, y: 15, bend: 1 },
  handR: { x: 53, y: 15, bend: 1 },
  legL, legR, footL: foot, footR: foot,
});
const FL_HANG = {
  x: 50, y: 60.88, spine: 90, head: 90,
  handL: { x: 47, y: 15, bend: 1 },
  handR: { x: 53, y: 15, bend: 1 },
  legL: [20, -120], legR: [16, -124], footL: -50, footR: -50,
};
const FL_LEVEL = lever(2, [8, -158], [4, -162], -60);
const FL_SAG = lever(13, [19, -147], [15, -151], -49);
const FL_TIGHT = lever(-3, [3, -163], [-1, -167], -65);

/* ================================================================== *
 * ROTATION
 * A side-on rig cannot show a twist, so a chop reads through the arc the
 * straight arms sweep and through where the resistance comes from. The two
 * versions sit at opposite ends of that arc on purpose: the band hangs off a
 * LOW anchor so its chop travels upward and finishes tall, the cable comes off
 * a HIGH pulley so its chop travels down and finishes in a partial squat.
 * Same family, opposite silhouettes in every frame.
 * ================================================================== */

const chop = (px, py, spine, head, hx, hy, feet) => ({
  x: px, y: py, spine, head,
  handL: { x: hx, y: hy, bend: -1 },
  handR: { x: hx + 1.4, y: hy - 1.4, bend: -1 },
  footPtL: { x: feet[0], y: FLOOR, bend: 1 },
  footPtR: { x: feet[1], y: FLOOR, bend: 1 },
  footL: 2, footR: 2,
});

const BAND_FEET = [44.5, 55.5];
const BAND_LOW = chop(50, 63, 76, 66, 41.6, 58.9, BAND_FEET);
const BAND_MID = chop(50, 60.5, 88, 92, 71.5, 45.4, BAND_FEET);
const BAND_HIGH = chop(50, 58, 98, 106, 59.4, 19.0, BAND_FEET);

const CABLE_FEET = [42.5, 53.5];
const CABLE_HIGH = chop(48, 58, 96, 104, 59.4, 20.0, CABLE_FEET);
const CABLE_MID = chop(48, 61, 86, 80, 70.7, 44.4, CABLE_FEET);
const CABLE_LOW = chop(47, 66, 72, 62, 42.3, 63.4, CABLE_FEET);

/* Kettlebell windmill. The NEAR arm holds the bell locked overhead for the
   whole clip and the eyes stay on it; the FAR hand tracks all the way down to
   the floor beside the front foot. The pelvis height never changes — only its
   x — because the cue is "shift the hip, it is a hinge, not a side bend", and
   a pelvis that drops instead would draw a squat. That is also what keeps both
   legs long: bending the knees to get the hand down is the classic error.
   Unilateral, so the arms never mirror — and loadSide 'R' is what puts the one
   bell in the overhead hand. Without it the rig mirrors the load into the free
   hand, and measured at the bottom frame that second bell sits at (54, 84.5)
   and spans 48.6..59.4 — the near shin covers about four units of it, so it is
   NOT hidden: a kettlebell is drawn lying on the floor. */
const windmill = (px, spine, head, up, down) => ({
  x: px, y: 59, spine, head,
  handR: { x: up[0], y: up[1], bend: 1 },
  handL: { x: down[0], y: down[1], bend: 1 },
  footPtL: { x: 44.5, y: FLOOR, bend: 1 },
  footPtR: { x: 55.5, y: FLOOR, bend: 1 },
  footL: 2, footR: 2, load: 'kettlebell', loadSide: 'R',
});
const WM_TOP = windmill(50, 88, 96, [51.6, 13.2], [48.2, 58.5]);
const WM_MID = windmill(47.5, 34, 74, [67.2, 23.3], [58.5, 66.5]);
const WM_DOWN = windmill(45, -20, 62, [67.2, 43.9], [54, 84.5]);

/* ================================================================== *
 * CARRIES
 * One foot planted at all times, the swing foot genuinely off the floor,
 * and the stride length saying which carry it is: short and busy under a
 * chest load, longer with nothing in the way, careful under an overhead one.
 * ================================================================== */

const walk = (py, feet, footAng, over) => Object.assign({
  x: 50, y: py, spine: 90, head: 90,
  footPtL: { x: feet[0], y: feet[1], bend: 1 },
  footPtR: { x: feet[2], y: feet[3], bend: 1 },
  footL: footAng[0], footR: footAng[1],
}, over || {});

function carryKeys(span, over) {
  const back = 50 - span;
  const fwd = 50 + span;
  const A = walk(58.4, [back, FLOOR, fwd, 87.4], [2, -2], over);
  const B = walk(57.2, [52.5, 82.5, 50.6, FLOOR], [-25, 2], over);
  const C = walk(58.4, [fwd, 87.4, back, FLOOR], [-2, 2], over);
  const D = walk(57.2, [50.4, FLOOR, 52.8, 82.3], [2, -25], over);
  return [
    { t: 0, pose: A }, { t: 0.25, pose: B }, { t: 0.5, pose: C },
    { t: 0.75, pose: D }, { t: 1, pose: A },
  ];
}

/* The bag is hugged against the chest — the cue says so explicitly ("on the
   chest or in one hand, not on the back"), and a rig carrying nothing at all
   is just a walk cycle. */
const BACKPACK = {
  spine: 87, head: 87,
  handL: { x: 54.5, y: 44.5, bend: -1 },
  handR: { x: 55.5, y: 43.5, bend: -1 },
  load: 'plate',
};
/* Bells racked at the collarbones with the elbows down and tucked; bend -1 is
   what drops the elbow behind the hand instead of flaring it out in front. */
const FRONT_RACK = {
  spine: 91, head: 91,
  handL: { x: 51.5, y: 41, bend: -1 },
  handR: { x: 53, y: 40, bend: -1 },
  load: 'kettlebell',
};
const OVERHEAD = {
  spine: 91, head: 91,
  handL: { x: 48.6, y: 13.2, bend: 1 },
  handR: { x: 50.4, y: 12.8, bend: 1 },
  load: 'dumbbell',
};

/* Suitcase hold: a HOLD, not a walk. The feet are pinned and never move, which
   is the single clearest way to tell it from the three carries above and from
   its own walking sibling, suitcase_carry. The sway is the torso refusing to
   lean toward the weight — the whole point of the exercise.
   ONE side is loaded, and that has to survive two ways of being undone. The
   bell: loadSide 'R' draws it in the near hand only, instead of the rig
   mirroring it into the free hand and drawing a farmer carry. The arms: two
   hands hanging at the same height ARE a mirrored pair whatever the load says —
   parking the free hand at the pelvis measured 3.4 units from the mirror of the
   loaded one, which reads as the two-handed parent. So the loaded arm hangs
   long (21.2 to 23.0 of a 23.5 reach, shoulder pulled down by the bell) and the
   free arm is relaxed and bent (14.3), its hand up at the waist — which holds
   the two at 6.8 units apart or more through the whole sway. */
const suitcase = (px, spine, hand) => ({
  x: px, y: 57.4, spine, head: spine,
  handL: { x: 47.5, y: 48.6, bend: -1 },
  handR: { x: hand[0], y: hand[1], bend: -1 },
  footPtL: { x: 47.5, y: FLOOR, bend: 1 },
  footPtR: { x: 52.5, y: FLOOR, bend: 1 },
  footL: 2, footR: 2, load: 'dumbbell', loadSide: 'R',
});
const SUIT_A = suitcase(50, 90.5, [55.2, 55.8]);
const SUIT_B = suitcase(49.4, 93, [55.4, 56.4]);
const SUIT_C = suitcase(50.6, 88.5, [55.0, 55.4]);

/* ================================================================== *
 * MACHINE INTERVALS
 * ================================================================== */

/* Bike: the pelvis never leaves the saddle and the hands never leave the bars,
   so the whole clip is two feet running opposite ends of one crank circle.
   Drawing the crank as a ring is what stops the whole thing reading as a
   stool with someone leaning forward on it. */
const CRANK = [57, 74, 5.6];
const pedal = (deg) => [
  CRANK[0] + CRANK[2] * Math.cos((deg * Math.PI) / 180),
  CRANK[1] - CRANK[2] * Math.sin((deg * Math.PI) / 180),
];
const bike = (deg) => {
  const r = pedal(deg);
  const l = pedal(deg + 180);
  return {
    x: 41, y: 57.5, spine: 62, head: 56,
    handL: { x: 66.5, y: 44.5, bend: -1 },
    handR: { x: 68, y: 43.5, bend: -1 },
    footPtL: { x: l[0], y: l[1], bend: 1 },
    footPtR: { x: r[0], y: r[1], bend: 1 },
    footL: 2, footR: 2,
  };
};
const BIKE_KEYS = [90, 30, -30, -90, -150, -210].map(bike);

/* Rower: legs, then body, then arms — and back in reverse order. The feet are
   strapped to the plates and never move; everything else is the seat running
   down the rail under a torso that opens from 66 degrees to past vertical
   with the handle finishing at the ribs, not stretched out behind. */
const row = (px, spine, head, hand) => ({
  x: px, y: 76, spine, head,
  handL: { x: hand[0], y: hand[1], bend: -1 },
  handR: { x: hand[0] + 1.4, y: hand[1] - 1.2, bend: -1 },
  footPtL: { x: 64, y: 77, bend: 1 },
  footPtR: { x: 65.6, y: 77.6, bend: 1 },
  footL: 34, footR: 34,
});
const ROW_CATCH = row(48, 66, 62, [76.9, 65.8]);
const ROW_DRIVE = row(40, 84, 80, [63.6, 57.6]);
const ROW_FINISH = row(35.5, 104, 100, [48.5, 61.5]);
const ROW_ARMS = row(36, 100, 98, [53.2, 57.0]);
const ROW_BODY = row(43, 74, 70, [70.1, 61.8]);

export const X11_CLIPS = {
  pogo_hop: clip({
    id: 'pogo_hop', duration: 800,
    keys: [
      { t: 0, pose: POGO_CONTACT }, { t: 0.18, pose: POGO_TOEOFF },
      { t: 0.42, pose: POGO_AIR, ease: 'out' }, { t: 0.68, pose: POGO_TOEOFF, ease: 'in' },
      { t: 1, pose: POGO_CONTACT },
    ],
  }),

  vertical_jump: clip({
    id: 'vertical_jump', duration: 1500,
    keys: [
      { t: 0, pose: VJ_STAND }, { t: 0.22, pose: VJ_DIP },
      { t: 0.46, pose: VJ_AIR, ease: 'out' }, { t: 0.66, pose: VJ_LAND, ease: 'in' },
      { t: 1, pose: VJ_STAND },
    ],
  }),

  box_jump: clip({
    id: 'box_jump', duration: 2600,
    props: [BOX],
    keys: [
      { t: 0, pose: BOX_STAND }, { t: 0.1, pose: BOX_DIP },
      { t: 0.28, pose: BOX_AIR, ease: 'out' }, { t: 0.4, pose: BOX_LAND, ease: 'in' },
      { t: 0.52, pose: BOX_TALL }, { t: 0.72, pose: BOX_STEP },
      { t: 0.86, pose: BOX_ABSORB }, { t: 1, pose: BOX_STAND },
    ],
  }),

  skater_hop: clip({
    id: 'skater_hop', duration: 1800,
    keys: [
      { t: 0, pose: SK_R }, { t: 0.2, pose: SK_AIR_L, ease: 'out' },
      { t: 0.4, pose: SK_L, ease: 'in' }, { t: 0.55, pose: SK_L },
      { t: 0.75, pose: SK_AIR_R }, { t: 1, pose: SK_R },
    ],
  }),

  split_jump: clip({
    id: 'split_jump', duration: 1600,
    keys: [
      { t: 0, pose: SJ_A }, { t: 0.26, pose: SJ_AIR_A, ease: 'out' },
      { t: 0.5, pose: SJ_B, ease: 'in' }, { t: 0.76, pose: SJ_AIR_B, ease: 'out' },
      { t: 1, pose: SJ_A },
    ],
  }),

  standing_knee_to_elbow: clip({
    id: 'standing_knee_to_elbow', duration: 2400,
    keys: [
      { t: 0, pose: KTE_TALL }, { t: 0.42, pose: KTE_CRUNCH },
      { t: 0.6, pose: KTE_CRUNCH }, { t: 1, pose: KTE_TALL },
    ],
  }),

  trx_fallout: clip({
    id: 'trx_fallout', duration: 3600,
    props: [
      { type: 'bar', x: 78, y: 5, w: 10, posts: false },
      { type: 'band', x0: 76.6, y0: 5, x1: 70.2, y1: 29.4, sag: 0.6 },
      { type: 'band', x0: 79.4, y0: 5, x1: 71.6, y1: 28.6, sag: 0.6 },
    ],
    keys: [
      { t: 0, pose: TRX_IN }, { t: 0.3, pose: TRX_MID },
      { t: 0.48, pose: TRX_OUT }, { t: 0.62, pose: TRX_OUT },
      { t: 0.82, pose: TRX_MID }, { t: 1, pose: TRX_IN },
    ],
  }),

  barbell_rollout: clip({
    id: 'barbell_rollout', duration: 3600,
    props: [{ type: 'mat', x: 52, w: 74 }],
    keys: [
      { t: 0, pose: ROLL_IN }, { t: 0.3, pose: ROLL_MID },
      { t: 0.48, pose: ROLL_OUT }, { t: 0.6, pose: ROLL_OUT },
      { t: 0.8, pose: ROLL_MID }, { t: 1, pose: ROLL_IN },
    ],
  }),

  front_lever_tuck: clip({
    id: 'front_lever_tuck', duration: 4400, ground: false,
    props: [{ type: 'bar', x: 50, y: 15, w: 44 }],
    keys: [
      { t: 0, pose: FL_HANG }, { t: 0.2, pose: FL_LEVEL },
      { t: 0.42, pose: FL_SAG }, { t: 0.62, pose: FL_TIGHT },
      { t: 0.84, pose: FL_LEVEL }, { t: 1, pose: FL_HANG },
    ],
  }),

  band_woodchop: clip({
    id: 'band_woodchop', duration: 2800,
    /* The band runs along the pull line and passes through the low hand, so it
       reads as being held rather than ending in mid-air; a static prop cannot
       follow the whole arc, so it is aimed at the hero frame. */
    props: [{ type: 'band', x0: 14, y0: 86, x1: 58, y1: 42, sag: 3 }],
    keys: [
      { t: 0, pose: BAND_LOW }, { t: 0.3, pose: BAND_MID },
      { t: 0.5, pose: BAND_HIGH }, { t: 0.62, pose: BAND_HIGH },
      { t: 0.8, pose: BAND_MID }, { t: 1, pose: BAND_LOW },
    ],
  }),

  cable_woodchop: clip({
    id: 'cable_woodchop', duration: 3000,
    props: [
      { type: 'machine', x: 86, y: 12, w: 12, h: 44 },
      { type: 'band', x0: 82, y0: 19, x1: 60.8, y1: 18.6, sag: 0.5 },
    ],
    keys: [
      { t: 0, pose: CABLE_HIGH }, { t: 0.3, pose: CABLE_MID },
      { t: 0.5, pose: CABLE_LOW }, { t: 0.64, pose: CABLE_LOW },
      { t: 0.82, pose: CABLE_MID }, { t: 1, pose: CABLE_HIGH },
    ],
  }),

  windmill: clip({
    id: 'windmill', duration: 3800,
    keys: [
      { t: 0, pose: WM_TOP }, { t: 0.28, pose: WM_MID },
      { t: 0.48, pose: WM_DOWN }, { t: 0.62, pose: WM_DOWN },
      { t: 0.82, pose: WM_MID }, { t: 1, pose: WM_TOP },
    ],
  }),

  backpack_carry: clip({
    id: 'backpack_carry', duration: 2200, ease: 'linear',
    keys: carryKeys(6, BACKPACK),
  }),

  suitcase_hold: clip({
    id: 'suitcase_hold', duration: 3400,
    keys: [
      { t: 0, pose: SUIT_A }, { t: 0.32, pose: SUIT_B },
      { t: 0.66, pose: SUIT_C }, { t: 1, pose: SUIT_A },
    ],
  }),

  front_rack_carry: clip({
    id: 'front_rack_carry', duration: 2500, ease: 'linear',
    keys: carryKeys(7.5, FRONT_RACK),
  }),

  overhead_carry: clip({
    id: 'overhead_carry', duration: 2800, ease: 'linear',
    keys: carryKeys(5.5, OVERHEAD),
  }),

  bike_intervals: clip({
    id: 'bike_intervals', duration: 1300, ease: 'linear',
    props: [
      { type: 'box', x: 40, y: 60, w: 13, h: 3 },
      { type: 'wall', x: 40, y0: 63, y1: 87 },
      { type: 'bar', x: 55, y: 74, w: 30, posts: false },
      { type: 'wall', x: 70, y0: 43, y1: 87 },
      { type: 'bar', x: 70, y: 43, w: 10, posts: false },
      { type: 'machine', x: 80, y: 58, w: 14, h: 28 },
      { type: 'rings', x: 57, y: 74, w: 0.4, y0: 71.4 },
    ],
    keys: [
      { t: 0, pose: BIKE_KEYS[0] }, { t: 1 / 6, pose: BIKE_KEYS[1] },
      { t: 2 / 6, pose: BIKE_KEYS[2] }, { t: 3 / 6, pose: BIKE_KEYS[3] },
      { t: 4 / 6, pose: BIKE_KEYS[4] }, { t: 5 / 6, pose: BIKE_KEYS[5] },
      { t: 1, pose: BIKE_KEYS[0] },
    ],
  }),

  rower_intervals: clip({
    id: 'rower_intervals', duration: 2600,
    props: [
      { type: 'bar', x: 42, y: 82, w: 56, posts: false },
      { type: 'machine', x: 88, y: 52, w: 12, h: 30 },
      { type: 'wall', x: 71, y0: 70, y1: 82 },
      { type: 'band', x0: 82, y0: 66, x1: 78.3, y1: 64.6, sag: 0 },
    ],
    keys: [
      { t: 0, pose: ROW_CATCH }, { t: 0.16, pose: ROW_DRIVE },
      { t: 0.34, pose: ROW_FINISH }, { t: 0.52, pose: ROW_ARMS },
      { t: 0.76, pose: ROW_BODY }, { t: 1, pose: ROW_CATCH },
    ],
  }),
};
