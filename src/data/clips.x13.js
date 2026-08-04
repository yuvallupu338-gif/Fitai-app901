/* clips.x13.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * The regressions: the easier version of a movement, which until now borrowed
 * the animation of the harder one it regresses from.
 *
 * That borrowing was worse than it sounds. A regression is what a BEGINNER is
 * given — the wall push-up, the knee plank, the tucked hollow, the sit-to-stand.
 * So the people with the least idea what the movement should look like were
 * being shown a picture of the movement they had explicitly been judged not
 * ready for. A wall push-up drawn as an incline push-up is not a small
 * inaccuracy; it is the app asking for the thing it just decided to protect
 * them from.
 *
 * Every clip here therefore commits to the ONE thing that makes it the easier
 * version — the shorter lever, the higher hands, the bent knee, the smaller
 * range — and makes that difference the most visible thing in the frame.
 */

import {
  p, STAND, STAND_PLANTED, HOLLOW, PLANK_TOP, HANG, PULLUP_TOP,
} from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 3000, hero: 0, ease: 'inOut', props: [] }, o);

/* ------------------------------------------------------------------ *
 * Nordic lean — the same rigid pivot about the knee as a nordic curl,
 * stopped at the point where you can still pull yourself back.
 * ------------------------------------------------------------------ */

const nordic = (deg, over) => {
  const r = (deg * Math.PI) / 180;
  return Object.assign({
    x: 50 + 15.5 * Math.cos(r), y: 87.5 - 15.5 * Math.sin(r),
    spine: deg, head: deg - 6,
    // Arms folded across the chest, which is how a lean is held: there is no
    // catching yourself, because the whole point is to stop before you need to.
    armL: [deg - 118, deg - 40], armR: [deg - 126, deg - 48],
    legL: [deg - 180, 180], legR: [deg - 184, 176],
    footL: 170, footR: 170,
  }, over || {});
};
const LEAN_UP = nordic(90);
const LEAN_MID = nordic(78);
const LEAN_END = nordic(66);

/* ------------------------------------------------------------------ *
 * Floor holds
 * ------------------------------------------------------------------ */

/* Tucked hollow: knees drawn in over the hips, shins level. The straight-leg
   version is a long lever from the same shoulders — here the lever is short,
   and that is the entire difference. */
const TUCK_HOLLOW = p(HOLLOW, {
  x: 46, y: 83,
  // Knees over the hips, shins level: a right angle at the knee. The first
  // draft folded only 54 degrees and the leg rendered as one straight line,
  // which is the very thing this clip exists to distinguish itself from.
  legL: [102, 184], legR: [98, 180],
  footL: 140, footR: 140,
});
const TUCK_HOLLOW_2 = p(TUCK_HOLLOW, {
  y: 83.6, spine: 24, head: 30,
  legL: [108, 188], legR: [104, 184],
});

/* Knee plank: the pivot moves from the toes to the knees, so the body is a
   short straight line from shoulder to knee with the shins folded up behind. */
const KNEE_PLANK = {
  x: 44, y: 76.5, spine: 22, head: 14,
  handL: { x: 62, y: 87.5, bend: -1 },
  handR: { x: 64, y: 87.5, bend: -1 },
  // Thigh down-and-back to put the KNEE on the floor, then the shin flat along
  // it. Angling the shin downward instead drives the whole lower leg through
  // the floor, which is exactly what the first draft did.
  legL: [-137, 180], legR: [-141, 176],
  footL: 168, footR: 168,
};
const KNEE_PLANK_2 = p(KNEE_PLANK, { y: 76.9, spine: 21, head: 13 });

/* high_plank is deliberately NOT here. Its family clip already draws a hold on
   straight arms with the hands on the floor — the borrow is the right movement,
   and a second copy of it would only be a second thing to keep in step. */

/* Side plank from the knees. A side-on camera cannot show which way a body is
   facing, so drawing it as a plank with a folded shin made it indistinguishable
   from the knee plank two rows above. The free arm reaching straight up is the
   one cue that reads unambiguously, so the whole clip is built around it. */
const SIDE_KNEE_DOWN = {
  x: 47, y: 78, spine: 16, head: 10,
  handR: { x: 67, y: 87.5, bend: -1 },
  armL: [92, 94],
  legL: [-145, 178], legR: [-148, 174],
  footL: 166, footR: 166,
};
const SIDE_KNEE_UP = p(SIDE_KNEE_DOWN, {
  y: 75, spine: 21, head: 15,
  handR: { x: 67, y: 87.5, bend: -1 },
  armL: [90, 92],
});

/* ------------------------------------------------------------------ *
 * Push regressions — the hands go higher, the body gets more upright,
 * and the load on the arms falls away with it.
 * ------------------------------------------------------------------ */

/* Wall push-up: hands on a wall at chest height, body nearly vertical. Against
   an incline push-up on a bench the difference is the torso angle, so this one
   is drawn steep enough that no one could mistake the two. */
const WALL_TOP = {
  x: 40, y: 60, spine: 66, head: 60,
  handL: { x: 71, y: 46, bend: -1 },
  handR: { x: 72.5, y: 47, bend: -1 },
  footPtL: { x: 30, y: 87.5, bend: 1 },
  footPtR: { x: 32, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const WALL_BOTTOM = p(WALL_TOP, {
  x: 45, y: 60.5, spine: 64, head: 58,
  handL: { x: 71, y: 46, bend: -1 },
  handR: { x: 72.5, y: 47, bend: -1 },
  footPtL: { x: 30, y: 87.5, bend: 1 },
  footPtR: { x: 32, y: 87.5, bend: 1 },
});

/* Scapular push-up: the elbows never bend. Only the shoulder blades move, so
   the chest rises and sinks a couple of units between the planted hands and the
   rest of the body does not move at all. Small on purpose — drawing it bigger
   would make it a push-up, which is exactly the mistake it teaches against. */
const SCAP_HOLLOW = p(PLANK_TOP, { x: 36.4, y: 70.8, spine: 25, head: 17 });
const SCAP_ROUND = p(PLANK_TOP, { x: 36.4, y: 75.2, spine: 21, head: 12 });

/* Kneeling pike push-up: same overhead press shape as a pike push-up, but the
   knees are down, so the hips sit far lower and the body makes a shallow tent
   instead of a steep one. */
const KPIKE_TOP = {
  // The hips are the highest point and the torso dives forward and DOWN to the
  // hands. Drawn with a shallow spine the whole thing lay flat and read as a
  // plank, which is the one shape a pike push-up must not look like.
  x: 34, y: 72.5, spine: -14, head: -8,
  handL: { x: 72, y: 87.5, bend: 1 },
  handR: { x: 74, y: 87.5, bend: 1 },
  legL: [-91, 180], legR: [-95, 176],
  footL: 168, footR: 168,
};
const KPIKE_BOTTOM = p(KPIKE_TOP, {
  x: 33, y: 72.5, spine: -30, head: 0,
  handL: { x: 72, y: 87.5, bend: 1 },
  handR: { x: 74, y: 87.5, bend: 1 },
  legL: [-91, 180], legR: [-95, 176],
});

/* ------------------------------------------------------------------ *
 * Lower-body regressions
 * ------------------------------------------------------------------ */

/* Sit-to-stand: the difference from a box squat is where the movement STOPS —
   here it ends seated, weight fully on the box, hands reaching forward for
   balance, and starts again from a dead stop. */
const STS_STAND = p(STAND_PLANTED, {
  x: 44, y: 57, armL: [-40, -30], armR: [-46, -36],
  footPtL: { x: 34, y: 87.5, bend: 1 }, footPtR: { x: 36, y: 87.5, bend: 1 },
});
const STS_MID = {
  x: 42, y: 66, spine: 58, head: 48,
  armL: [-16, -8], armR: [-22, -14],
  footPtL: { x: 34, y: 87.5, bend: 1 },
  footPtR: { x: 36, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const STS_SEATED = {
  x: 42, y: 72.5, spine: 70, head: 62,
  armL: [-14, -6], armR: [-20, -12],
  footPtL: { x: 32, y: 87.5, bend: 1 },
  footPtR: { x: 34, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* Supported split squat: one hand on a support. The rear knee still drops, but
   a hand is on the upright the whole time, which is the point of the variation
   and is invisible unless the support is drawn. */
const SUP_TOP = {
  x: 48, y: 60, spine: 88, head: 88,
  handR: { x: 74, y: 58, bend: -1 },
  armL: [-84, -86],
  footPtL: { x: 34, y: 84, bend: 1 },
  footPtR: { x: 60, y: 87.5, bend: 1 },
  footL: -45, footR: 2,
};
const SUP_BOTTOM = p(SUP_TOP, {
  x: 47, y: 70, spine: 86, head: 86,
  handR: { x: 74, y: 58, bend: -1 },
  footPtL: { x: 34, y: 84, bend: 1 },
  footPtR: { x: 60, y: 87.5, bend: 1 },
});

/* Low box jump: a real jump, but onto something ankle height. Both feet clear
   the floor and the landing is on the box, knees soft. */
const LBOX_LOAD = {
  x: 34, y: 66, spine: 64, head: 56,
  armL: [-150, -160], armR: [-156, -166],
  footPtL: { x: 34, y: 87.5, bend: 1 },
  footPtR: { x: 36, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
/* Every key here pins the feet with IK, including the airborne one. lerpPose
   falls back to a hard swap at t=0.5 when a limb is pinned in one pose and free
   in the next, so mixing the two representations made the take-off snap. */
const LBOX_AIR = {
  x: 44, y: 56, spine: 76, head: 72,
  armL: [30, 46], armR: [24, 40],
  footPtL: { x: 50, y: 74, bend: 1 },
  footPtR: { x: 52, y: 74.5, bend: 1 },
  footL: -30, footR: -30,
};
const LBOX_LAND = {
  x: 58, y: 64, spine: 70, head: 62,
  armL: [-30, -14], armR: [-36, -20],
  footPtL: { x: 62, y: 81, bend: 1 },
  footPtR: { x: 64, y: 81, bend: 1 },
  footL: 2, footR: 2,
};

/* Single-leg box squat: a pistol that stops on a box, so the free leg is out in
   front and the descent ends seated rather than at the floor. */
const SLBOX_TOP = p(STAND, {
  x: 46, y: 57,
  armL: [-30, -20], armR: [-36, -26],
  legL: undefined,
  footPtL: { x: 38, y: 87.5, bend: 1 }, footL: 2,
  legR: [-56, -14], footR: 60,
});
const SLBOX_DOWN = {
  x: 44, y: 71, spine: 70, head: 62,
  armL: [-18, -8], armR: [-24, -14],
  footPtL: { x: 38, y: 87.5, bend: 1 },
  footL: 2,
  legR: [-38, -6], footR: 60,
};

/* ------------------------------------------------------------------ *
 * Pull and core regressions
 * ------------------------------------------------------------------ */

/* Jumping pull-up: it starts on the FLOOR. The legs drive, the arms finish, and
   the feet leave and return — where a negative pull-up starts at the top and
   only ever comes down. */
/* Hands and feet are BOTH pinned in every key of this clip. The crouch's hands
   are targets in mid-air below the bar, not angles, so the reach up to the bar
   interpolates instead of snapping. */
const JPULL_CROUCH = {
  x: 50, y: 70, spine: 80, head: 76,
  handL: { x: 48, y: 44, bend: 1 }, handR: { x: 54, y: 45, bend: 1 },
  footPtL: { x: 46, y: 87.5, bend: 1 },
  footPtR: { x: 48, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};
const JPULL_TOP = p(PULLUP_TOP, {
  y: 44,
  handL: { x: 47, y: 24, bend: 1 }, handR: { x: 53, y: 24, bend: 1 },
  legL: undefined, legR: undefined,
  footPtL: { x: 44, y: 70, bend: 1 }, footPtR: { x: 46, y: 71, bend: 1 },
  legL: [-70, -104], legR: [-74, -108],
  footL: -20, footR: -20,
});
/* Knees bent on the way down: on a bar this low the feet would otherwise be
   through the floor, and the bent knee is what a jumping pull-up looks like
   anyway — you never fully hang, you reset your feet. */
const JPULL_HANG = p(HANG, {
  y: 55,
  handL: { x: 47, y: 24, bend: 1 }, handR: { x: 53, y: 24, bend: 1 },
  legL: undefined, legR: undefined,
  footPtL: { x: 45, y: 82, bend: 1 }, footPtR: { x: 47, y: 83, bend: 1 },
  footL: -10, footR: -10,
});

/* Lying knee raise: hips and shoulders stay on the floor and the knees stay
   BENT. The straight-leg version is a long lever and a different exercise. */
const LKR_DOWN = {
  x: 44, y: 84.5, spine: 10, head: 22,
  armL: [-4, -2], armR: [0, 2],
  legL: [176, 176], legR: [178, 178],
  footL: 120, footR: 120,
};
const LKR_UP = p(LKR_DOWN, {
  legL: [94, 176], legR: [90, 172],
  footL: 130, footR: 130,
});

/* Reverse crunch: the pelvis curls off the floor toward the ribs. The torso
   never leaves the mat, which is the whole difference from a crunch. */
const RC_DOWN = {
  x: 44, y: 84.5, spine: 8, head: 20,
  armL: [-2, 0], armR: [2, 4],
  legL: [124, 178], legR: [120, 174],
  footL: 150, footR: 150,
};
const RC_UP = p(RC_DOWN, {
  x: 42, y: 79.5,
  spine: 22, head: 32,
  legL: [72, 124], legR: [68, 120],
  footL: 110, footR: 110,
});

/* Prone W raise: face down, arms bent into a W and lifted off the floor by the
   rear delts and mid-back. A reverse fly is done bent over and standing. */
const PRONE_W_DOWN = {
  x: 42, y: 85, spine: 4, head: 16,
  armL: [138, 66], armR: [134, 62],
  legL: [180, 180], legR: [182, 182],
  footL: 100, footR: 100,
};
const PRONE_W_UP = p(PRONE_W_DOWN, {
  y: 82.5, spine: 16, head: 34,
  armL: [168, 112], armR: [164, 108],
});

/* Bodyweight lateral raise: the arms sweep out and up with nothing in the
   hands, so the tempo is slow and the top is held. Drawing it with a dumbbell
   would be drawing the exercise the user does not have the kit for. */
const BWLAT_DOWN = p(STAND, { armL: [-80, -84], armR: [-100, -96] });
const BWLAT_UP = p(STAND, { armL: [-6, -2], armR: [-14, -10] });

/* March in place: one knee at a time, slow, foot returning flat to the floor.
   High knees is the same shape run three times faster with both feet leaving
   the ground; the marching version never does. */
const MARCH_L = p(STAND, {
  x: 46,
  armL: [-40, -20], armR: [-140, -160],
  legL: [-40, -96], legR: [-92, -90],
  footL: -20, footR: 2,
});
const MARCH_MID = p(STAND, { x: 46, armL: [-84, -86], armR: [-96, -94] });
const MARCH_R = p(STAND, {
  x: 46,
  armL: [-140, -160], armR: [-40, -20],
  legL: [-88, -90], legR: [-38, -94],
  footL: 2, footR: -20,
});

export const X13_CLIPS = {
  nordic_lean: clip({
    id: 'nordic_lean', duration: 3800, hero: 0.45,
    props: [{ type: 'mat', x: 56, w: 56 }],
    keys: [
      { t: 0, pose: LEAN_UP }, { t: 0.4, pose: LEAN_MID },
      { t: 0.55, pose: LEAN_END }, { t: 0.72, pose: LEAN_MID },
      { t: 1, pose: LEAN_UP },
    ],
  }),

  tuck_hollow_hold: clip({
    id: 'tuck_hollow_hold', duration: 4000, hero: 0.5,
    props: [{ type: 'mat', x: 46, w: 56 }],
    keys: [
      { t: 0, pose: TUCK_HOLLOW }, { t: 0.5, pose: TUCK_HOLLOW_2 },
      { t: 1, pose: TUCK_HOLLOW },
    ],
  }),

  knee_plank: clip({
    id: 'knee_plank', duration: 4000, hero: 0.5,
    props: [{ type: 'mat', x: 50, w: 58 }],
    keys: [
      { t: 0, pose: KNEE_PLANK }, { t: 0.5, pose: KNEE_PLANK_2 },
      { t: 1, pose: KNEE_PLANK },
    ],
  }),

  side_plank_knees: clip({
    id: 'side_plank_knees', duration: 4000, hero: 0.5,
    props: [{ type: 'mat', x: 52, w: 56 }],
    keys: [
      { t: 0, pose: SIDE_KNEE_DOWN }, { t: 0.5, pose: SIDE_KNEE_UP },
      { t: 1, pose: SIDE_KNEE_DOWN },
    ],
  }),

  wall_pushup: clip({
    id: 'wall_pushup', duration: 3000,
    props: [{ type: 'wall', x: 76, y0: 12, y1: 88 }],
    keys: [
      { t: 0, pose: WALL_TOP }, { t: 0.42, pose: WALL_BOTTOM },
      { t: 0.56, pose: WALL_BOTTOM }, { t: 1, pose: WALL_TOP },
    ],
  }),

  scap_pushup: clip({
    id: 'scap_pushup', duration: 3200,
    props: [{ type: 'mat', x: 48, w: 62 }],
    keys: [
      { t: 0, pose: SCAP_HOLLOW }, { t: 0.4, pose: SCAP_ROUND },
      { t: 0.6, pose: SCAP_ROUND }, { t: 1, pose: SCAP_HOLLOW },
    ],
  }),

  kneeling_pike_pushup: clip({
    id: 'kneeling_pike_pushup', duration: 3200,
    props: [{ type: 'mat', x: 52, w: 60 }],
    keys: [
      { t: 0, pose: KPIKE_TOP }, { t: 0.44, pose: KPIKE_BOTTOM },
      { t: 0.58, pose: KPIKE_BOTTOM }, { t: 1, pose: KPIKE_TOP },
    ],
  }),

  sit_to_stand: clip({
    id: 'sit_to_stand', duration: 3600,
    props: [{ type: 'box', x: 44, y: 72.5, w: 26, h: 15.5 }],
    keys: [
      { t: 0, pose: STS_STAND }, { t: 0.3, pose: STS_MID },
      { t: 0.46, pose: STS_SEATED }, { t: 0.62, pose: STS_SEATED },
      { t: 0.8, pose: STS_MID }, { t: 1, pose: STS_STAND },
    ],
  }),

  supported_split_squat: clip({
    id: 'supported_split_squat', duration: 3400,
    props: [{ type: 'wall', x: 76, y0: 34, y1: 88 }],
    keys: [
      { t: 0, pose: SUP_TOP }, { t: 0.44, pose: SUP_BOTTOM },
      { t: 0.6, pose: SUP_BOTTOM }, { t: 1, pose: SUP_TOP },
    ],
  }),

  low_box_jump: clip({
    id: 'low_box_jump', duration: 1600, ease: 'out',
    props: [{ type: 'box', x: 63, y: 81, w: 24, h: 7 }],
    keys: [
      { t: 0, pose: LBOX_LOAD }, { t: 0.3, pose: LBOX_AIR },
      { t: 0.52, pose: LBOX_LAND }, { t: 0.72, pose: LBOX_LAND },
      { t: 1, pose: LBOX_LOAD },
    ],
  }),

  single_leg_box_squat: clip({
    id: 'single_leg_box_squat', duration: 3400,
    props: [{ type: 'box', x: 46, y: 71, w: 24, h: 17 }],
    keys: [
      { t: 0, pose: SLBOX_TOP }, { t: 0.44, pose: SLBOX_DOWN },
      { t: 0.6, pose: SLBOX_DOWN }, { t: 1, pose: SLBOX_TOP },
    ],
  }),

  jumping_pullup: clip({
    id: 'jumping_pullup', duration: 2600,
    props: [{ type: 'bar', x: 50, y: 24, w: 40 }],
    keys: [
      { t: 0, pose: JPULL_CROUCH }, { t: 0.26, pose: JPULL_TOP },
      { t: 0.44, pose: JPULL_TOP }, { t: 0.7, pose: JPULL_HANG },
      { t: 1, pose: JPULL_CROUCH },
    ],
  }),

  lying_knee_raise: clip({
    id: 'lying_knee_raise', duration: 3200,
    props: [{ type: 'mat', x: 46, w: 58 }],
    keys: [
      { t: 0, pose: LKR_DOWN }, { t: 0.42, pose: LKR_UP },
      { t: 0.58, pose: LKR_UP }, { t: 1, pose: LKR_DOWN },
    ],
  }),

  reverse_crunch: clip({
    id: 'reverse_crunch', duration: 3000,
    props: [{ type: 'mat', x: 46, w: 58 }],
    keys: [
      { t: 0, pose: RC_DOWN }, { t: 0.42, pose: RC_UP },
      { t: 0.56, pose: RC_UP }, { t: 1, pose: RC_DOWN },
    ],
  }),

  prone_w_raise: clip({
    id: 'prone_w_raise', duration: 3400,
    props: [{ type: 'mat', x: 46, w: 60 }],
    keys: [
      { t: 0, pose: PRONE_W_DOWN }, { t: 0.42, pose: PRONE_W_UP },
      { t: 0.62, pose: PRONE_W_UP }, { t: 1, pose: PRONE_W_DOWN },
    ],
  }),

  bw_lateral_raise: clip({
    id: 'bw_lateral_raise', duration: 3600,
    keys: [
      { t: 0, pose: BWLAT_DOWN }, { t: 0.4, pose: BWLAT_UP },
      { t: 0.62, pose: BWLAT_UP }, { t: 1, pose: BWLAT_DOWN },
    ],
  }),

  march_in_place: clip({
    id: 'march_in_place', duration: 2800,
    keys: [
      { t: 0, pose: MARCH_L }, { t: 0.25, pose: MARCH_MID },
      { t: 0.5, pose: MARCH_R }, { t: 0.75, pose: MARCH_MID },
      { t: 1, pose: MARCH_L },
    ],
  }),
};
