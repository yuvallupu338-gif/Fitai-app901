/* clips.x12.js — bespoke per-exercise animations. Keys are EXERCISE IDS.
 *
 * Mobility and warm-up drills. These are the clips a user sees FIRST, in the
 * warm-up, every single session — and they are the ones most likely to come out
 * as near-identical small wiggles, because none of them is a loaded rep with an
 * obvious top and bottom.
 *
 * So every clip here commits to one large, unmistakable range of motion, and
 * runs slow. A stretch that looks like standing still has failed at its job,
 * which is to be copied from the picture without reading the name.
 *
 * Two rules earned the hard way in this file:
 *
 *  - Anything resting on the floor or gripping the bar is pinned with IK to the
 *    SAME coordinates in every key. It is not enough to write the target down:
 *    the arm is only 23.5 long and the leg 30.5, so a target further than that
 *    from the shoulder or hip is silently clamped and the limb hangs in mid-air
 *    near the floor instead of on it. Every pinned target below has been checked
 *    against the reach it actually needs.
 *
 *  - A key may not swap a limb between IK and FK. lerpPose can blend two IK
 *    targets or two angle pairs, but an object against `undefined` falls through
 *    to a nearest-key pick and the limb teleports at the halfway mark.
 */

import { p, STAND, GLUTE_BRIDGE_DOWN, GLUTE_BRIDGE_UP, HANG } from '../core/poses.js';

const clip = (o) => Object.assign({ duration: 4200, hero: 0.25, ease: 'inOut', props: [] }, o);

/* Standing rotation. Seen side-on, a twist turns about the vertical axis — which
   is very nearly the axis the camera looks along — so it only reads if the two
   arms go OPPOSITE ways: the near arm wraps to the front while the far arm
   travels behind, then they trade. Both arms sweeping together is an arm swing,
   and that is what this used to look like. The hands are IK targets at chest
   height so they foreshorten, passing close to the shoulder mid-sweep, which is
   the honest projection of a hand coming towards the camera. */
const twist = (rx, ry, lx, ly, head) => p(STAND, {
  spine: 90, head,
  handR: { x: rx, y: ry, bend: -1 },
  handL: { x: lx, y: ly, bend: -1 },
});
const TWIST_OPEN = twist(67, 40, 37, 44, 86);
const TWIST_CROSS = twist(37, 44, 67, 40, 94);

/*
 * Leg swings. Both keep one leg planted and move only the other, and the two
 * must not read as the same drill — so they are drawn from DIFFERENT camera
 * angles, which is the only thing that can separate a front-to-back swing from
 * a side-to-side one in a flat rig.
 *
 * FRONT is side-on: the torso is in profile, the arms counter-swing, and the leg
 * arcs forward and back past a support leg it never crosses.
 *
 * SIDE is head-on: the arms hang out symmetrically in an A, both legs are
 * vertical at the midpoint, and the swinging leg abducts wide and then crosses
 * IN FRONT OF the support leg. That crossing is the read. It cannot happen in
 * the front swing, and no amount of tucking the knee ever said it.
 */
const swingBase = (over) => p(STAND, Object.assign({
  x: 44,
  armL: [-30, -26], armR: [-150, -154],
  legL: [-90, -90], footL: 2,
}, over || {}));

const SWING_F_BACK = swingBase({ legR: [-130, -128], footR: -46 });
const SWING_F_MID = swingBase({ legR: [-92, -90], footR: 2 });
const SWING_F_FWD = swingBase({ legR: [-40, -36], footR: 54 });

/* Head-on: a straight swinging leg (thigh and shin share one angle), fixed
   symmetric arms, and a torso that counter-leans a couple of degrees. */
const sideSwing = (thigh, foot, spine) => p(STAND, {
  x: 50, y: 57, spine, head: spine,
  armL: [-142, -152], armR: [-38, -28],
  legL: [-90, -90], footL: 2,
  legR: [thigh, thigh], footR: foot,
});

const SWING_S_OUT = sideSwing(-48, -14, 86);
const SWING_S_MID = sideSwing(-88, 0, 90);
const SWING_S_IN = sideSwing(-132, 176, 94);

/* Ankle rocks to the wall — the Hebrew name says "to the wall", and the wall is
   what makes the drill legible, because a knee travelling towards it is the
   whole movement. The hips go FORWARD, not down: a pelvis that sinks is a lunge,
   which is exactly what this clip used to be. Both feet stay pinned, the rear leg
   straightens instead of its knee dropping, and only the front knee travels —
   from behind the toes to well past them, a hand's width off the wall. */
const ankleRock = (px, py, spine) => ({
  x: px, y: py, spine, head: spine - 2,
  handL: { x: 71.5, y: 47, bend: -1 },
  handR: { x: 71.5, y: 50, bend: -1 },
  footPtL: { x: 42, y: 87.5, bend: 1 },
  footPtR: { x: 62, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
});
const ANKLE_BACK = ankleRock(50, 64, 86);
const ANKLE_FWD = ankleRock(58, 65.5, 80);

/* Wrist prep: on all fours, rocking the shoulders over planted hands. The knee
   is the fixed point and the pelvis is derived from the thigh angle, so the
   knees never slide and the hips can travel far enough to carry the shoulders
   from BEHIND the hands to well past them. That change in wrist angle is the
   entire drill; a shoulder parked over the wrist shows nothing at all. */
const WRIST_KNEE = [30.5, 86.6];
const wristRock = (thigh, spine, head) => {
  const r = (thigh * Math.PI) / 180;
  return {
    x: WRIST_KNEE[0] - 15.5 * Math.cos(r),
    y: WRIST_KNEE[1] + 15.5 * Math.sin(r),
    spine, head,
    handL: { x: 60, y: 87.5, bend: -1 },
    handR: { x: 63, y: 87.5, bend: -1 },
    legL: [thigh, 178], legR: [thigh, 175],
    footL: 168, footR: 166,
  };
};
const WRIST_BACK = wristRock(-100, 14, 2);
const WRIST_FWD = wristRock(-135, 4, -8);

/* Toy soldier: a straight-leg kick up to the opposite hand, walking. */
const SOLDIER_DOWN = p(STAND, { x: 44, armL: [-60, -50], armR: [-120, -130] });
const SOLDIER_KICK = p(STAND, {
  x: 44, spine: 84, head: 80,
  armL: [-20, -14], armR: [-26, -20],
  legL: [-92, -90], legR: [-14, -10], footL: 2, footR: 62,
});

/* Kneeling hip flexor stretch. Same trick as the wrist rock: the rear KNEE is
   the fixed point and the pelvis is solved from the rear thigh angle, so the
   knee stays welded to the mat while the hips press a long way forward and the
   rear thigh swings from vertical to trailing well behind the body. That travel
   IS the stretch — the previous version moved the hips four units and read as a
   held photograph. The front foot is pinned, the torso stays tall and finishes
   leaning back, and the hands ride the hips so that nothing competes with the
   long line down the front of the rear leg. */
const HF_KNEE = [38, 86.6];
const halfKneel = (thigh, spine, hx, hy) => {
  const r = (thigh * Math.PI) / 180;
  return {
    x: HF_KNEE[0] - 15.5 * Math.cos(r),
    y: HF_KNEE[1] + 15.5 * Math.sin(r),
    spine, head: spine + 2,
    handL: { x: hx, y: hy, bend: 1 },
    handR: { x: hx + 2, y: hy + 1, bend: 1 },
    legL: [thigh, 178],
    footPtR: { x: 60, y: 87.5, bend: 1 },
    footL: 172, footR: 2,
  };
};
const HIPFLEX_TALL = halfKneel(-95, 90, 42, 68);
const HIPFLEX_PRESS = halfKneel(-128, 98, 50, 71);

/* Child's pose. The shins stay flat and the hips stay parked on the heels for
   the whole clip — they are the one thing that never moves — and the drill is
   the FOLD onto them: from a tall kneeling sit the chest travels twenty-odd
   units down and forward until the head rests on the mat and the arms are long
   in front. Starting already folded leaves nothing to show, and hips riding high
   above the heels is a downward dog, not this. */
const childSit = (spine, head, lx, ly, rx, ry) => ({
  x: 33.5, y: 77.9, spine, head,
  handL: { x: lx, y: ly, bend: -1 },
  handR: { x: rx, y: ry, bend: -1 },
  legL: [-36, 178], legR: [-36, 175],
  footL: 172, footR: 170,
});
const CHILD_SIT = childSit(55, 62, 56, 76, 58, 78);
const CHILD_FOLD = childSit(-5, -1, 74, 87, 76, 87);
const CHILD_REACH = childSit(-8, -4, 76.5, 87, 78.5, 87);

/* World's greatest stretch: a deep lunge, then the torso opens and one arm winds
   up to the ceiling. The down hand stays welded to the mat throughout and the
   head turns up to follow the reaching hand — that pairing is the rotation. The
   torso itself barely rises, because it cannot: lift the shoulder and the planted
   hand can no longer reach the floor, which is how this clip previously ended up
   doing an overhead lunge with both hands in the air. Both arms are IK in both
   keys, so neither teleports at the halfway mark. */
const WGS_BASE = {
  x: 44, y: 76,
  footPtR: { x: 66, y: 87.5, bend: 1 },
  legL: [-152, -166], footL: 175, footR: 2,
};
const WGS_LUNGE = Object.assign({}, WGS_BASE, {
  spine: 28, head: 16,
  handL: { x: 58, y: 87, bend: -1 },
  handR: { x: 63, y: 87, bend: -1 },
});
const WGS_OPEN = Object.assign({}, WGS_BASE, {
  spine: 30, head: 62,
  handL: { x: 58, y: 87, bend: -1 },
  handR: { x: 64, y: 43, bend: 1 },
});

/* Band pull-down for the scapulae. The arms sweep from overhead DOWN and forward
   to the hips, elbows locked straight the whole way — the forearm angle equals
   the upper-arm angle in every key, so no amount of interpolation can bend them.
   Sweeping the arms backwards over the head instead, which is where this
   started, is shoulder extension and reads as a backstroke. */
const SCAP_OVERHEAD = p(STAND, { spine: 90, head: 90, armL: [93, 93], armR: [87, 87] });
const SCAP_PULLED = p(STAND, { spine: 92, head: 92, armL: [-55, -55], armR: [-61, -61] });

/* Passive hang. The difference from a dead hang is real and worth drawing: the
   shoulders are allowed to shrug up by the ears and the body hangs longer. So
   the clip starts on a gripped bar with the elbows still slightly bent and then
   SINKS — arms going dead straight, body dropping, head drifting down between
   them — and then sways, legs trailing wider than the hips the way a pendulum
   does. The hands never leave their two points on the bar, and the pelvis stays
   close enough underneath them that the arms can still reach: drop it and the
   IK clamps, which left the old version floating four units below a bar it was
   not actually holding. */
const passiveHang = (px, py, spine, head, ll, lr) => p(HANG, {
  x: px, y: py, spine, head,
  handL: { x: 48.5, y: 15, bend: 1 },
  handR: { x: 51.5, y: 15, bend: 1 },
  legL: ll, legR: lr, footL: 0, footR: 0,
});
const HANG_GRIP = passiveHang(50, 57.6, 90, 90, [-89, -90], [-93, -90]);
const HANG_SINK = passiveHang(48, 60.5, 92, 82, [-94, -92], [-98, -92]);
const HANG_SWAY = passiveHang(52, 60.5, 88, 98, [-86, -88], [-90, -88]);

export const X12_CLIPS = {
  torso_twist_standing: clip({
    id: 'torso_twist_standing', duration: 4000, hero: 0,
    keys: [
      { t: 0, pose: TWIST_OPEN }, { t: 0.14, pose: TWIST_OPEN },
      { t: 0.5, pose: TWIST_CROSS }, { t: 0.64, pose: TWIST_CROSS },
      { t: 1, pose: TWIST_OPEN },
    ],
  }),

  leg_swings_front: clip({
    id: 'leg_swings_front', duration: 3400,
    keys: [
      { t: 0, pose: SWING_F_BACK }, { t: 0.3, pose: SWING_F_MID },
      { t: 0.55, pose: SWING_F_FWD }, { t: 0.8, pose: SWING_F_MID },
      { t: 1, pose: SWING_F_BACK },
    ],
  }),

  leg_swings_side: clip({
    id: 'leg_swings_side', duration: 3400,
    keys: [
      { t: 0, pose: SWING_S_OUT }, { t: 0.3, pose: SWING_S_MID },
      { t: 0.55, pose: SWING_S_IN }, { t: 0.8, pose: SWING_S_MID },
      { t: 1, pose: SWING_S_OUT },
    ],
  }),

  ankle_rocks: clip({
    id: 'ankle_rocks', duration: 3200, hero: 0.5,
    props: [{ type: 'wall', x: 74, y0: 28, y1: 88 }],
    keys: [
      { t: 0, pose: ANKLE_BACK }, { t: 0.42, pose: ANKLE_FWD },
      { t: 0.62, pose: ANKLE_FWD }, { t: 1, pose: ANKLE_BACK },
    ],
  }),

  wrist_prep: clip({
    id: 'wrist_prep', duration: 3600, hero: 0.5,
    props: [{ type: 'mat', x: 42, w: 68 }],
    keys: [
      { t: 0, pose: WRIST_BACK }, { t: 0.42, pose: WRIST_FWD },
      { t: 0.62, pose: WRIST_FWD }, { t: 1, pose: WRIST_BACK },
    ],
  }),

  toy_soldier: clip({
    id: 'toy_soldier', duration: 3000,
    keys: [
      { t: 0, pose: SOLDIER_DOWN }, { t: 0.44, pose: SOLDIER_KICK },
      { t: 0.6, pose: SOLDIER_KICK }, { t: 1, pose: SOLDIER_DOWN },
    ],
  }),

  glute_bridge_activation: clip({
    id: 'glute_bridge_activation', duration: 3600,
    props: [{ type: 'mat', x: 44, w: 62 }],
    keys: [
      { t: 0, pose: GLUTE_BRIDGE_DOWN }, { t: 0.4, pose: GLUTE_BRIDGE_UP },
      { t: 0.64, pose: GLUTE_BRIDGE_UP }, { t: 1, pose: GLUTE_BRIDGE_DOWN },
    ],
  }),

  hip_flexor_stretch_kneeling: clip({
    id: 'hip_flexor_stretch_kneeling', duration: 4600, hero: 0.5,
    props: [{ type: 'mat', x: 40, w: 60 }],
    keys: [
      { t: 0, pose: HIPFLEX_TALL }, { t: 0.42, pose: HIPFLEX_PRESS },
      { t: 0.68, pose: HIPFLEX_PRESS }, { t: 1, pose: HIPFLEX_TALL },
    ],
  }),

  childs_pose_reach: clip({
    id: 'childs_pose_reach', duration: 4800, hero: 0.5,
    props: [{ type: 'mat', x: 50, w: 64 }],
    keys: [
      { t: 0, pose: CHILD_SIT }, { t: 0.38, pose: CHILD_FOLD },
      { t: 0.72, pose: CHILD_REACH }, { t: 1, pose: CHILD_SIT },
    ],
  }),

  worlds_greatest_stretch: clip({
    id: 'worlds_greatest_stretch', duration: 4600, hero: 0.5,
    props: [{ type: 'mat', x: 44, w: 66 }],
    keys: [
      { t: 0, pose: WGS_LUNGE }, { t: 0.44, pose: WGS_OPEN },
      { t: 0.68, pose: WGS_OPEN }, { t: 1, pose: WGS_LUNGE },
    ],
  }),

  band_scap_pulldown: clip({
    id: 'band_scap_pulldown', duration: 3200, hero: 0.5,
    props: [{ type: 'band', x0: 53, y0: 6, x1: 62, y1: 53, sag: 2 }],
    keys: [
      { t: 0, pose: SCAP_OVERHEAD }, { t: 0.42, pose: SCAP_PULLED },
      { t: 0.62, pose: SCAP_PULLED }, { t: 1, pose: SCAP_OVERHEAD },
    ],
  }),

  passive_bar_hang: clip({
    id: 'passive_bar_hang', duration: 5000, hero: 0.5, ground: false,
    props: [{ type: 'bar', x: 50, y: 15, w: 44 }],
    keys: [
      { t: 0, pose: HANG_GRIP }, { t: 0.28, pose: HANG_SINK },
      { t: 0.62, pose: HANG_SWAY }, { t: 1, pose: HANG_GRIP },
    ],
  }),
};
