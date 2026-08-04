/* clips.x14.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * The equipment variants: the body was already doing the right thing, and the
 * wrong thing was in its hands.
 *
 * A band overhead press drawn with a barbell tells someone who owns one band
 * and no barbell that they cannot do the exercise the app just prescribed them.
 * A dumbbell RDL drawn with a bar says the same to someone training in a
 * bedroom. These are quieter failures than a regression drawn as its harder
 * parent — the movement pattern is right — but they undo the one promise the
 * whole equipment filter exists to keep, which is that everything in the plan
 * is something you can actually pick up.
 *
 * A note on bands: props are fixed for a whole clip while the hands move
 * through it, so a band is drawn where it sits at the working end of the rep
 * rather than tracking the hand. Better a band anchored a little loosely than
 * no band at all, which is what these had.
 */

import {
  p, STAND, STAND_PLANTED, HINGE_TOP, HINGE_BOTTOM, SUPINE, SEATED, DIP_TOP, DIP_BOTTOM,
} from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/* ------------------------------------------------------------------ *
 * Hinges with something other than a barbell
 * ------------------------------------------------------------------ */

/* Dumbbell RDL: the weights hang at arm's length either side of the leg, so
   they track down the thigh instead of along one bar across the shins. */
const DB_RDL_TOP = p(HINGE_TOP, { load: 'dumbbell', armL: [-86, -88], armR: [-94, -92] });
const DB_RDL_MID = p(HINGE_BOTTOM, {
  x: 47, y: 60, spine: 52, head: 42, load: 'dumbbell',
  armL: [-86, -88], armR: [-94, -92],
});
const DB_RDL_BOTTOM = p(HINGE_BOTTOM, {
  x: 46, y: 62, spine: 24, head: 14, load: 'dumbbell',
  armL: [-86, -88], armR: [-94, -92],
});

/* Kettlebell deadlift: the bell starts BETWEEN the feet, not in front of the
   shins, so the pull is more vertical and the stance is wider. */
const KB_DL_TOP = p(HINGE_TOP, {
  load: 'kettlebell', armL: [-86, -88], armR: [-94, -92],
  footPtL: { x: 55, y: 87.5, bend: 1 }, footPtR: { x: 45, y: 87.5, bend: 1 },
});
const KB_DL_BOTTOM = {
  x: 47, y: 66, spine: 40, head: 30, load: 'kettlebell',
  armL: [-86, -88], armR: [-94, -92],
  footPtL: { x: 55, y: 87.5, bend: 1 }, footPtR: { x: 45, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* Bodyweight hip thrust: shoulders on the bench, nothing across the hips. The
   loaded version is the same shape with a bar on the lap, and the bar is the
   only thing that says which one you are being asked for. */
const BWT_DOWN = {
  x: 56, y: 84, spine: 135, head: 128,
  armL: [150, 142], armR: [156, 148],
  footPtL: { x: 70, y: 87.5, bend: 1 }, footPtR: { x: 74, y: 87.5, bend: 1 },
  footL: 0, footR: 0,
};
const BWT_UP = p(BWT_DOWN, {
  x: 62, y: 72, spine: 170, head: 163,
  armL: [176, 168], armR: [182, 174],
  footPtL: { x: 70, y: 87.5, bend: 1 }, footPtR: { x: 74, y: 87.5, bend: 1 },
});

/* ------------------------------------------------------------------ *
 * Pressing without a bench, or without a bar
 * ------------------------------------------------------------------ */

/* Dumbbell floor press: lying on the FLOOR, so the elbows stop when they touch
   it. That short bottom half is the whole reason the exercise exists — it is
   the bench press for someone with no bench and a cranky shoulder. */
const FLOOR_PRESS_DOWN = {
  x: 40, y: 84, spine: 6, head: 18, load: 'dumbbell',
  armL: [64, 4], armR: [58, -2],
  legL: [176, 118], legR: [178, 120],
  footL: 40, footR: 40,
};
const FLOOR_PRESS_UP = p(FLOOR_PRESS_DOWN, {
  armL: [82, 84], armR: [76, 78],
});

/* Seated dumbbell shoulder press: back against an upright bench, which is what
   makes it the seated version — the standing one has no support and the whole
   body braces instead. */
const SEATED_PRESS_DOWN = p(SEATED, {
  x: 44, y: 66, spine: 92, head: 92, load: 'dumbbell',
  armL: [26, 62], armR: [20, 56],
  legL: [-4, -84], legR: [-8, -88],
});
const SEATED_PRESS_UP = p(SEATED_PRESS_DOWN, {
  armL: [92, 94], armR: [86, 88],
});

/* Band overhead press: the band runs from under the foot to the hand, so the
   resistance grows as the arm finishes — the opposite of a dumbbell, which is
   heaviest at the bottom. */
const BAND_OHP_DOWN = p(STAND_PLANTED, { armL: [26, 66], armR: [20, 60] });
const BAND_OHP_UP = p(STAND_PLANTED, { armL: [92, 94], armR: [86, 88] });

/* Chest dip: the torso leans FORWARD, which moves the work from the triceps to
   the chest. Upright is the triceps version and is a different exercise. */
const CHEST_DIP_TOP = p(DIP_TOP, { x: 50, y: 62, spine: 66, head: 62 });
const CHEST_DIP_BOTTOM = p(DIP_BOTTOM, { x: 52, y: 73, spine: 56, head: 50 });

/* Floor triceps dip: hands on the floor BEHIND the hips, which are held off it.
   The bench version starts with the hands up on a bench and the hips lower. */
const FLOOR_DIP_UP = {
  x: 52, y: 77, spine: 148, head: 136,
  handL: { x: 26, y: 87.5, bend: 1 }, handR: { x: 28, y: 87.5, bend: 1 },
  footPtL: { x: 74, y: 87.5, bend: 1 }, footPtR: { x: 76, y: 87.5, bend: 1 },
  footL: 30, footR: 30,
};
const FLOOR_DIP_DOWN = p(FLOOR_DIP_UP, {
  x: 52, y: 84, spine: 152, head: 140,
  handL: { x: 26, y: 87.5, bend: 1 }, handR: { x: 28, y: 87.5, bend: 1 },
  footPtL: { x: 74, y: 87.5, bend: 1 }, footPtR: { x: 76, y: 87.5, bend: 1 },
});

/* ------------------------------------------------------------------ *
 * Pulling on a band, a towel, or a cable
 * ------------------------------------------------------------------ */

/* Band lat pulldown: kneeling under a high anchor, elbows driving down and back
   past the ribs. Kneeling matters — standing, you just pull yourself up. */
const BAND_PD_UP = {
  x: 48, y: 72, spine: 88, head: 88,
  armL: [84, 88], armR: [78, 82],
  legL: [-90, 180], legR: [-94, 176],
  footL: 170, footR: 170,
};
const BAND_PD_DOWN = p(BAND_PD_UP, {
  spine: 84, head: 84,
  armL: [-46, -62], armR: [-52, -68],
});

/* Doorframe towel row: feet close to the frame, body leaning back on straight
   arms, then pulled in. The hands stay exactly where the towel is, so they are
   pinned and the BODY is what moves — which is the honest way round for any
   row you do against your own weight. */
const TOWEL_BACK = {
  x: 44, y: 64, spine: 82, head: 80,
  handL: { x: 70, y: 56, bend: -1 }, handR: { x: 71, y: 57, bend: -1 },
  footPtL: { x: 62, y: 87.5, bend: 1 }, footPtR: { x: 64, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const TOWEL_IN = p(TOWEL_BACK, {
  x: 52, y: 61, spine: 86, head: 86,
  handL: { x: 70, y: 56, bend: -1 }, handR: { x: 71, y: 57, bend: -1 },
  footPtL: { x: 62, y: 87.5, bend: 1 }, footPtR: { x: 64, y: 87.5, bend: 1 },
});

/* Band seated row: sitting on the floor, legs out, band around the feet. The
   cable version sits on a machine with a pad; this one has neither. */
const BAND_ROW_OUT = {
  x: 40, y: 78, spine: 74, head: 72,
  handL: { x: 68, y: 58, bend: -1 }, handR: { x: 69, y: 59, bend: -1 },
  legL: [-2, -4], legR: [-6, -8],
  footL: 70, footR: 70,
};
const BAND_ROW_IN = p(BAND_ROW_OUT, {
  spine: 84, head: 84,
  handL: { x: 51, y: 60, bend: -1 }, handR: { x: 52, y: 61, bend: -1 },
});

/* Cable face pull: the hands finish either side of the head with the elbows
   HIGH, which is what separates it from a row to the ribs. */
const FACE_PULL_OUT = p(STAND_PLANTED, {
  x: 42, armL: [4, 2], armR: [-2, -4],
});
const FACE_PULL_IN = p(STAND_PLANTED, {
  x: 42, armL: [24, 140], armR: [18, 134],
});

/* ------------------------------------------------------------------ *
 * Arms, with what is actually to hand
 * ------------------------------------------------------------------ */

/* Backpack curl: a bag held in both hands in front, so the grip is close
   together and the elbows stay pinned to the ribs. */
const PACK_DOWN = p(STAND_PLANTED, {
  load: 'plate', armL: [-80, -84], armR: [-88, -90],
});
const PACK_UP = p(STAND_PLANTED, {
  load: 'plate', armL: [-78, 46], armR: [-86, 40],
});

/* Band hammer curl: band under the feet, neutral grip. */
const BAND_CURL_DOWN = p(STAND_PLANTED, { armL: [-82, -86], armR: [-90, -92] });
const BAND_CURL_UP = p(STAND_PLANTED, { armL: [-80, 52], armR: [-88, 46] });

/* Band triceps pushdown: the elbows are pinned at the ribs and only the
   forearm moves, which is the whole difference between this and a press. */
const PUSHDOWN_UP = p(STAND_PLANTED, { armL: [-78, 30], armR: [-86, 24] });
const PUSHDOWN_DOWN = p(STAND_PLANTED, { armL: [-80, -86], armR: [-88, -92] });

/* Dumbbell front raise: the arm travels FORWARD and up to eye level, where a
   lateral raise goes out to the side. Side-on, forward is the one that reads,
   so this clip commits to it fully. */
const FRONT_RAISE_DOWN = p(STAND_PLANTED, {
  load: 'dumbbell', armL: [-82, -86], armR: [-90, -94],
});
const FRONT_RAISE_UP = p(STAND_PLANTED, {
  load: 'dumbbell', armL: [-4, 0], armR: [-10, -6],
});

/* Arm circles: both arms sweep a full circle. Four keys around the clock, and
   because interpolation is linear the angles must keep climbing rather than
   wrapping, or the arms unwind the long way at the seam. */
const circle = (deg) => p(STAND, { armL: [deg, deg - 4], armR: [deg - 8, deg - 12] });
const CIRCLE_0 = circle(-84);
const CIRCLE_1 = circle(6);
const CIRCLE_2 = circle(96);
const CIRCLE_3 = circle(186);
const CIRCLE_4 = circle(276);

/* ------------------------------------------------------------------ *
 * The rest
 * ------------------------------------------------------------------ */

/* Treadmill intervals: a running gait on a deck, with the console in front. A
   jog outdoors has the same gait and no machine, so the machine is the clip. */
const TREAD_A = {
  x: 46, y: 56, spine: 84, head: 82,
  armL: [-24, -84], armR: [-150, -96],
  legL: [-42, -128], legR: [-126, -74],
  footL: -20, footR: 30,
};
const TREAD_B = {
  x: 46, y: 54, spine: 86, head: 84,
  armL: [-88, -70], armR: [-92, -110],
  legL: [-84, -96], legR: [-96, -84],
  footL: 2, footR: 2,
};
const TREAD_C = {
  x: 46, y: 56, spine: 84, head: 82,
  armL: [-150, -96], armR: [-24, -84],
  legL: [-126, -74], legR: [-42, -128],
  footL: 30, footR: -20,
};

/* Candlestick roll: from sitting, roll back until the legs are vertical over
   the shoulders, then roll up onto the feet. A sit-up never leaves the mat. */
const CANDLE_SIT = {
  x: 48, y: 78, spine: 62, head: 56,
  handL: { x: 70, y: 86, bend: -1 }, handR: { x: 72, y: 86.5, bend: -1 },
  legL: [20, -95], legR: [16, -99],
  footL: 2, footR: 2,
};
const CANDLE_ROLL = {
  x: 46, y: 72, spine: 4, head: 0,
  handL: { x: 72, y: 87.5, bend: -1 }, handR: { x: 74, y: 87.5, bend: -1 },
  legL: [128, 140], legR: [124, 136],
  footL: 160, footR: 160,
};
/* Shoulders and head on the floor, hips stacked above them, legs vertical.
   That stack is the whole exercise and the reason it is not a sit-up. */
const CANDLE_UP = {
  x: 44, y: 62, spine: -60, head: -28,
  handL: { x: 72, y: 87.5, bend: -1 }, handR: { x: 74, y: 87.5, bend: -1 },
  legL: [92, 90], legR: [88, 86],
  footL: 178, footR: 178,
};

export const X14_CLIPS = {
  db_rdl: clip({
    id: 'db_rdl', duration: 3200,
    keys: [
      { t: 0, pose: DB_RDL_TOP }, { t: 0.3, pose: DB_RDL_MID },
      { t: 0.5, pose: DB_RDL_BOTTOM }, { t: 0.72, pose: DB_RDL_MID },
      { t: 1, pose: DB_RDL_TOP },
    ],
  }),

  kb_deadlift: clip({
    id: 'kb_deadlift', duration: 3200,
    keys: [
      { t: 0, pose: KB_DL_BOTTOM }, { t: 0.4, pose: KB_DL_TOP },
      { t: 0.6, pose: KB_DL_TOP }, { t: 1, pose: KB_DL_BOTTOM },
    ],
  }),

  bw_hip_thrust: clip({
    id: 'bw_hip_thrust', duration: 3200,
    props: [{ type: 'bench', x: 42, y: 76, w: 26, h: 5 }],
    keys: [
      { t: 0, pose: BWT_DOWN }, { t: 0.42, pose: BWT_UP },
      { t: 0.62, pose: BWT_UP }, { t: 1, pose: BWT_DOWN },
    ],
  }),

  db_floor_press: clip({
    id: 'db_floor_press', duration: 3000,
    props: [{ type: 'mat', x: 44, w: 58 }],
    keys: [
      { t: 0, pose: FLOOR_PRESS_DOWN }, { t: 0.42, pose: FLOOR_PRESS_UP },
      { t: 0.6, pose: FLOOR_PRESS_UP }, { t: 1, pose: FLOOR_PRESS_DOWN },
    ],
  }),

  seated_db_shoulder_press: clip({
    id: 'seated_db_shoulder_press', duration: 3200,
    props: [
      { type: 'bench', x: 44, y: 76, w: 24, h: 5 },
      { type: 'wall', x: 32, y0: 52, y1: 78 },
    ],
    keys: [
      { t: 0, pose: SEATED_PRESS_DOWN }, { t: 0.42, pose: SEATED_PRESS_UP },
      { t: 0.6, pose: SEATED_PRESS_UP }, { t: 1, pose: SEATED_PRESS_DOWN },
    ],
  }),

  band_overhead_press: clip({
    id: 'band_overhead_press', duration: 3200,
    props: [{ type: 'band', x0: 50, y0: 87, x1: 56, y1: 40, sag: 3 }],
    keys: [
      { t: 0, pose: BAND_OHP_DOWN }, { t: 0.42, pose: BAND_OHP_UP },
      { t: 0.6, pose: BAND_OHP_UP }, { t: 1, pose: BAND_OHP_DOWN },
    ],
  }),

  bar_dip: clip({
    id: 'bar_dip', duration: 3000, ground: false,
    props: [{ type: 'dipbars', x: 50, y: 40, w: 26, gap: 7 }],
    keys: [
      { t: 0, pose: CHEST_DIP_TOP }, { t: 0.42, pose: CHEST_DIP_BOTTOM },
      { t: 0.58, pose: CHEST_DIP_BOTTOM }, { t: 1, pose: CHEST_DIP_TOP },
    ],
  }),

  floor_triceps_dip: clip({
    id: 'floor_triceps_dip', duration: 3000,
    props: [{ type: 'mat', x: 52, w: 62 }],
    keys: [
      { t: 0, pose: FLOOR_DIP_UP }, { t: 0.42, pose: FLOOR_DIP_DOWN },
      { t: 0.58, pose: FLOOR_DIP_DOWN }, { t: 1, pose: FLOOR_DIP_UP },
    ],
  }),

  band_lat_pulldown: clip({
    id: 'band_lat_pulldown', duration: 3200,
    props: [
      { type: 'mat', x: 46, w: 50 },
      { type: 'band', x0: 54, y0: 12, x1: 56, y1: 52, sag: 2 },
    ],
    keys: [
      { t: 0, pose: BAND_PD_UP }, { t: 0.42, pose: BAND_PD_DOWN },
      { t: 0.6, pose: BAND_PD_DOWN }, { t: 1, pose: BAND_PD_UP },
    ],
  }),

  doorframe_towel_row: clip({
    id: 'doorframe_towel_row', duration: 3200,
    props: [{ type: 'wall', x: 74, y0: 10, y1: 88 }],
    keys: [
      { t: 0, pose: TOWEL_BACK }, { t: 0.42, pose: TOWEL_IN },
      { t: 0.6, pose: TOWEL_IN }, { t: 1, pose: TOWEL_BACK },
    ],
  }),

  band_seated_row: clip({
    id: 'band_seated_row', duration: 3200,
    props: [
      { type: 'mat', x: 46, w: 56 },
      { type: 'band', x0: 76, y0: 84, x1: 60, y1: 59, sag: 2 },
    ],
    keys: [
      { t: 0, pose: BAND_ROW_OUT }, { t: 0.42, pose: BAND_ROW_IN },
      { t: 0.6, pose: BAND_ROW_IN }, { t: 1, pose: BAND_ROW_OUT },
    ],
  }),

  cable_face_pull: clip({
    id: 'cable_face_pull', duration: 3000,
    props: [
      { type: 'machine', x: 82, y: 22, w: 16, h: 60 },
      { type: 'band', x0: 74, y0: 26, x1: 58, y1: 44, sag: 2 },
    ],
    keys: [
      { t: 0, pose: FACE_PULL_OUT }, { t: 0.42, pose: FACE_PULL_IN },
      { t: 0.6, pose: FACE_PULL_IN }, { t: 1, pose: FACE_PULL_OUT },
    ],
  }),

  backpack_curl: clip({
    id: 'backpack_curl', duration: 3000,
    keys: [
      { t: 0, pose: PACK_DOWN }, { t: 0.42, pose: PACK_UP },
      { t: 0.6, pose: PACK_UP }, { t: 1, pose: PACK_DOWN },
    ],
  }),

  band_hammer_curl: clip({
    id: 'band_hammer_curl', duration: 3000,
    props: [{ type: 'band', x0: 50, y0: 87, x1: 56, y1: 62, sag: 2 }],
    keys: [
      { t: 0, pose: BAND_CURL_DOWN }, { t: 0.42, pose: BAND_CURL_UP },
      { t: 0.6, pose: BAND_CURL_UP }, { t: 1, pose: BAND_CURL_DOWN },
    ],
  }),

  band_triceps_pushdown: clip({
    id: 'band_triceps_pushdown', duration: 3000,
    props: [{ type: 'band', x0: 56, y0: 14, x1: 57, y1: 60, sag: 2 }],
    keys: [
      { t: 0, pose: PUSHDOWN_UP }, { t: 0.42, pose: PUSHDOWN_DOWN },
      { t: 0.6, pose: PUSHDOWN_DOWN }, { t: 1, pose: PUSHDOWN_UP },
    ],
  }),

  db_front_raise: clip({
    id: 'db_front_raise', duration: 3200,
    keys: [
      { t: 0, pose: FRONT_RAISE_DOWN }, { t: 0.42, pose: FRONT_RAISE_UP },
      { t: 0.6, pose: FRONT_RAISE_UP }, { t: 1, pose: FRONT_RAISE_DOWN },
    ],
  }),

  arm_circles: clip({
    id: 'arm_circles', duration: 3600, ease: 'linear',
    keys: [
      { t: 0, pose: CIRCLE_0 }, { t: 0.25, pose: CIRCLE_1 },
      { t: 0.5, pose: CIRCLE_2 }, { t: 0.75, pose: CIRCLE_3 },
      { t: 1, pose: CIRCLE_4 },
    ],
  }),

  treadmill_intervals: clip({
    id: 'treadmill_intervals', duration: 1400, ease: 'linear',
    props: [
      { type: 'box', x: 44, y: 85.6, w: 48, h: 2.4 },
      { type: 'machine', x: 74, y: 34, w: 9, h: 52 },
    ],
    keys: [
      { t: 0, pose: TREAD_A }, { t: 0.25, pose: TREAD_B },
      { t: 0.5, pose: TREAD_C }, { t: 0.75, pose: TREAD_B },
      { t: 1, pose: TREAD_A },
    ],
  }),

  candlestick: clip({
    id: 'candlestick', duration: 3200,
    props: [{ type: 'mat', x: 44, w: 60 }],
    keys: [
      { t: 0, pose: CANDLE_SIT }, { t: 0.3, pose: CANDLE_ROLL },
      { t: 0.5, pose: CANDLE_UP }, { t: 0.72, pose: CANDLE_ROLL },
      { t: 1, pose: CANDLE_SIT },
    ],
  }),
};
