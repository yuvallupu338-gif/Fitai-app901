/* clips.x09.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * The hinge family. Every clip here has to be visibly NOT a squat, because
 * confusing the two is the single most common error these exercises exist to
 * correct. In a hinge the knees stay only slightly bent, the pelvis travels
 * BACKWARD, and the spine angle drops toward horizontal. In a squat the pelvis
 * travels DOWN and the torso stays upright. Compare HINGE_BOTTOM against
 * SQUAT_BOTTOM in poses.js and the difference is the whole point.
 */

import { p, STAND, STAND_PLANTED, HINGE_TOP, HINGE_BOTTOM } from '../core/poses.js';
import { repKeys } from '../core/anim.js';

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
/* Hands expressed as IK targets in EVERY key, not just the one that reaches the
   floor. With angles above and a target below, the arms snapped to the floor at
   the midpoint instead of reaching for it. */
const nordicHands = (deg) => {
  const r = (deg * Math.PI) / 180;
  const px = 50 + 15.5 * Math.cos(r);
  const py = 87.5 - 15.5 * Math.sin(r);
  // Roughly where a hanging arm would put the hand, in front of the chest.
  const sx = px + 20 * Math.cos(r);
  const sy = py - 20 * Math.sin(r);
  return {
    handL: { x: sx + 12, y: Math.min(87.5, sy + 16), bend: -1 },
    handR: { x: sx + 14, y: Math.min(87.5, sy + 17), bend: -1 },
  };
};
const NORDIC_UP = nordic(90, nordicHands(90));
const NORDIC_MID = nordic(52, nordicHands(52));
/* At the bottom you catch yourself, so the hands are planted on the floor
   rather than swinging free — which is also what keeps them above it. */
const NORDIC_LOW = nordic(24, {
  handL: { x: 86, y: 87.5, bend: -1 },
  handR: { x: 89, y: 87.5, bend: -1 },
});
const NORDIC_ASSIST = nordic(38, nordicHands(38));

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

/* ---- conventional deadlift: the bar is set down every rep ---- */

/* Arms as ANGLES, not hand targets: in a deadlift they hang straight the whole
   way up, and every other key of this clip uses angles, so pinning one made the
   arms snap at the midpoint of every rep. */
const DL_ARMS = { load: 'barbell', armL: [-88, -90], armR: [-92, -90] };
const DL_FLOOR = Object.assign({
  x: 45, y: 68, spine: 26, head: 18,
  footPtL: { x: 49, y: 87.5, bend: 1 }, footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
}, DL_ARMS);
const DL_KNEE = MID(DL_ARMS);
const DL_LOCK = TOP(DL_ARMS);

/* ---- single-leg RDL: the free leg rises to horizontal behind ---- */

/*
 * Single-leg RDL. The free leg is posed by ANGLE, and the numbers below are
 * written to sweep BACKWARD past straight-down, because the interpolator is
 * linear on the raw number and does not know which way a hip is allowed to go.
 *
 * Written as legR [-70,-110] -> [172,176] the arithmetic sweep is +242 degrees:
 * the free leg kicked forward, rose past the head and came down behind, which
 * is the one path a hip cannot take. -188/-184 is the same picture (-188 = 172)
 * reached by the -118 degrees of hip EXTENSION the exercise is actually made
 * of. Do not "tidy" these back into the -180..180 range.
 */
const SL_TOP = p(STAND, {
  x: 50, y: 57, spine: 88,
  armL: [-84, -88], armR: [-96, -92], load: 'dumbbell',
  // Standing leg pinned, matching SL_BOTTOM — a free angle here and a pinned
  // foot there makes the support leg jump halfway through the rep.
  legL: undefined,
  footPtL: { x: 50, y: 87.5, bend: 1 },
  legR: [-70, -110], footL: 2, footR: -20,
});
/* Mid-hinge: the torso is halfway down and the free leg trails it, still short
   of horizontal. Without this key the leg and the spine arrive together, which
   is a hinge no hamstring has ever produced. */
const SL_MID = {
  x: 49, y: 58.4, spine: 54, head: 46,
  armL: [-84, -88], armR: [-94, -91], load: 'dumbbell',
  footPtL: { x: 50, y: 87.5, bend: 1 },
  // The free foot passes the standing one here. Its ANKLE has to sit high
  // enough that the straight line the interpolator draws to it clears the
  // floor: the arc cuts its corner, and at [-132,-136] the toe scraped two
  // units under the ground halfway to this key.
  legR: [-118, -124], footL: 2, footR: -18,
};
const SL_BOTTOM = {
  x: 48, y: 60, spine: 18, head: 10,
  armL: [-84, -88], armR: [-92, -90], load: 'dumbbell',
  footPtL: { x: 50, y: 87.5, bend: 1 },
  legR: [-188, -184], footL: 2, footR: -124,
};

/* ---- back extension: the torso rotates about a pad, nothing else moves ---- */

const bext = (spine) => ({
  x: 54, y: 62, spine, head: spine - 6,
  armL: [150, 140], armR: [156, 146],
  legL: [-24, -28], legR: [-28, -32], footL: 60, footR: 60,
});
const BEXT_DOWN = bext(200);
const BEXT_UP = bext(178);

/* ---- kettlebell swing: hinge, then a hard snap to horizontal ---- */

const SWING_BACK = hinge(30, 46, 62, { armL: [-40, -34], armR: [-46, -40], load: 'kettlebell' });
const SWING_STAND = p(STAND_PLANTED, { armL: [-70, -66], armR: [-76, -72], load: 'kettlebell' });
const SWING_FLOAT = p(STAND_PLANTED, { spine: 93, armL: [-6, -2], armR: [-12, -8], load: 'kettlebell' });

export const X09_CLIPS = {
  hip_hinge_drill: clip({
    id: 'hip_hinge_drill', duration: 3400,
    props: [{ type: 'wall', x: 24, y0: 40, y1: 88 }],
    keys: repKeys(TOP({ armL: [-40, -34], armR: [-46, -40] }), BOTTOM({ armL: [-40, -34], armR: [-46, -40] }), null, { lag: 1.4 }),
  }),

  rdl: clip({
    id: 'rdl', duration: 3200,
    keys: repKeys(TOP({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }), BOTTOM({ load: 'barbell', armL: [-88, -90], armR: [-92, -90] }), null, { lag: 1.4 }),
  }),

  /* The deadlift starts on the FLOOR — the bar is set down every rep, which is
     what separates it from an RDL that stops at mid-shin. */
  deadlift: clip({
    id: 'deadlift', duration: 3400, hero: 0.12,
    /*
     * Tempo, not a metronome. The pull is 36% of the cycle and runs on `grind`,
     * because a deadlift has one famous sticking point — just below the knee,
     * where the bar leaves the shins and the hips have not yet taken over — and
     * it sits in the MIDDLE of the drive, which is the one place inOut can
     * never put a slow moment. Then a beat at lockout, then a longer eccentric,
     * because the bar comes down slower than it went up and everything on this
     * screen used to take exactly as long in both directions.
     */
    keys: [
      { t: 0, pose: DL_FLOOR },
      { t: 0.22, pose: DL_KNEE, ease: 'grind' },
      { t: 0.36, pose: DL_LOCK, ease: 'out' },
      { t: 0.48, pose: DL_LOCK },
      { t: 0.72, pose: DL_KNEE, ease: 'in' },
      { t: 0.94, pose: DL_FLOOR, ease: 'out' },
      { t: 1, pose: DL_FLOOR },
    ],
  }),

  db_single_leg_rdl: clip({
    id: 'db_single_leg_rdl', duration: 3600, hero: 0.44,
    keys: [
      { t: 0, pose: SL_TOP },
      { t: 0.26, pose: SL_MID },
      { t: 0.48, pose: SL_BOTTOM, ease: 'out' },
      { t: 0.58, pose: SL_BOTTOM },
      { t: 0.82, pose: SL_MID, ease: 'grind' },
      { t: 1, pose: SL_TOP, ease: 'settle' },
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
    keys: repKeys(THRUST_DOWN, THRUST_UP, THRUST_UP, { mode: 'lift' }),
  }),

  /* Loaded version: the dumbbell rides ON THE HIPS, which is where the hands
     have to be. At [-70,-80] they hung straight down from a shoulder already
     lying on the bench and finished two and a half units under the floor,
     holding nothing — there was no load on the pose at all, so the only thing
     separating this from the bodyweight version was a pair of buried arms. */
  db_hip_thrust: clip({
    id: 'db_hip_thrust', duration: 3000,
    props: [{ type: 'bench', x: 28, y: 68, w: 30, h: 5 }],
    keys: repKeys(
      Object.assign({}, THRUST_DOWN, { armL: [-45, -45], armR: [-42, -48], load: 'dumbbell' }),
      Object.assign({}, THRUST_UP, { armL: [-10, -10], armR: [-8, -12], load: 'dumbbell' }),
      null, { mode: 'lift' }),
  }),

  /* Knee flexion, lying face down — a different joint from every hinge above. */
  band_leg_curl: clip({
    id: 'band_leg_curl', duration: 2800,
    props: [{ type: 'band', x0: 8, y0: 86, x1: 22, y1: 80, sag: 2 }],
    keys: repKeys(PRONE_STRAIGHT, PRONE_CURLED, PRONE_CURLED, { mode: 'lift' }),
  }),

  towel_hamstring_curl: clip({
    id: 'towel_hamstring_curl', duration: 3000,
    props: [{ type: 'mat', x: 40, w: 60 }],
    keys: repKeys(
      PRONE_STRAIGHT,
      Object.assign({}, PRONE_STRAIGHT, { legL: [182, 122], legR: [184, 118], footL: 34, footR: 34 }),
      null, { mode: 'lift' },
    ),
  }),

  back_extension: clip({
    id: 'back_extension', duration: 3200,
    props: [{ type: 'machine', x: 62, y: 58, w: 26, h: 30 }],
    keys: repKeys(BEXT_DOWN, BEXT_UP, null, { mode: 'lift' }),
  }),

  /* Nordics: the body stays rigid and rotates about the knee. The three
     versions differ only in how far they get, which is exactly the progression. */
  nordic_curl: clip({
    id: 'nordic_curl', duration: 4000,
    props: [{ type: 'mat', x: 44, w: 56 }],
    keys: repKeys(NORDIC_UP, NORDIC_LOW, null, {}),
  }),

  nordic_negative: clip({
    id: 'nordic_negative', duration: 4400,
    props: [{ type: 'mat', x: 44, w: 56 }],
    keys: repKeys(NORDIC_UP, NORDIC_LOW, null, {}),
  }),

  band_assisted_nordic: clip({
    id: 'band_assisted_nordic', duration: 3800,
    props: [{ type: 'mat', x: 44, w: 56 }, { type: 'band', x0: 50, y0: 12, x1: 62, y1: 62, sag: 4 }],
    keys: repKeys(NORDIC_UP, NORDIC_ASSIST, NORDIC_ASSIST, {}),
  }),
};
