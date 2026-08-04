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

import { p, STAND, HANG } from '../core/poses.js';

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

/* Head-on: a straight swinging leg (thigh and shin share one angle), arms held
   wide and level in a symmetric T, and a SUPPORT LEG THAT STAYS SPLAYED so that
   at the midpoint the two feet sit apart, side by side. A profile view can never
   show two feet apart like that — in profile they stack — so the splayed stance
   plus the level T is what tells the eye this camera is in front of the figure
   and the leg is crossing the body rather than kicking forward. */
const sideSwing = (thigh, spine) => p(STAND, {
  x: 50, y: 57, spine, head: spine,
  armL: [190, 178], armR: [-10, 2],
  legL: [-100, -100], footL: -10,
  legR: [thigh, thigh], footR: thigh + 90,
});

const SWING_S_OUT = sideSwing(-40, 87);
const SWING_S_MID = sideSwing(-80, 90);
const SWING_S_IN = sideSwing(-140, 93);

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
const ANKLE_MID = ankleRock(55, 65, 83);
const ANKLE_FWD = ankleRock(60, 65.5, 80);

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
/* The hip travels an ARC about the knee, but lerpPose walks the straight line
   between two keys, so a single 35-degree step would cut the corner and drag
   the planted shin three quarters of a unit across the mat. Halving the step
   puts the sag back under two tenths. */
const WRIST_BACK = wristRock(-100, 14, 2);
const WRIST_MID = wristRock(-117.5, 11, -1);
const WRIST_FWD = wristRock(-135, 8, -4);

/* Toy soldier: a straight-leg kick up to the opposite hand. The standing hip
   never moves and the SUPPORT LEG KEEPS EXACTLY THE ANGLES IT HAD in every key
   — STAND's own [-87, -89] against the kick key's [-92, -90] was enough to walk
   the planted foot 1.6 units across the floor each rep. */
const SOLDIER_PLANT = { x: 44, y: 57, legL: [-90, -90], footL: 2 };
const SOLDIER_DOWN = p(STAND, Object.assign({
  armL: [-60, -50], armR: [-120, -130],
}, SOLDIER_PLANT));
const SOLDIER_KICK = p(STAND, Object.assign({
  spine: 84, head: 80,
  armL: [-20, -14], armR: [-26, -20],
  legR: [-14, -10], footR: 62,
}, SOLDIER_PLANT));

/* Kneeling hip flexor stretch. Same trick as the wrist rock: the rear KNEE is
   the fixed point and the pelvis is solved from the rear thigh angle, so the
   knee stays welded to the mat while the hips press a long way forward and the
   rear thigh swings from vertical to trailing well behind the body. That travel
   IS the stretch — the previous version moved the hips four units and read as a
   held photograph. The front foot is pinned, the torso stays tall and finishes
   leaning back, and the NEAR arm sweeps overhead as the hips arrive — one arm,
   not two, because the drill loads one hip and a matched pair would read as the
   two-legged parent. The far hand rides the hip so that nothing competes with
   the long line down the front of the rear leg. */
const HF_KNEE = [38, 86.6];
const halfKneel = (thigh, spine, hip, reach) => {
  const r = (thigh * Math.PI) / 180;
  return {
    x: HF_KNEE[0] - 15.5 * Math.cos(r),
    y: HF_KNEE[1] + 15.5 * Math.sin(r),
    spine, head: spine + 2,
    handL: { x: hip[0], y: hip[1], bend: 1 },
    handR: { x: reach[0], y: reach[1], bend: 1 },
    legL: [thigh, 178],
    footPtR: { x: 60, y: 87.5, bend: 1 },
    footL: 172, footR: 2,
  };
};
/* Stepped in halves for the same reason as the wrist rock: one 33-degree jump
   across the hip's arc chords the corner and slides the planted shin. */
const HIPFLEX_TALL = halfKneel(-95, 90, [42, 68], [44, 69]);
const HIPFLEX_MID = halfKneel(-111.5, 94, [46, 69.5], [45, 49]);
const HIPFLEX_PRESS = halfKneel(-128, 98, [50, 71], [46, 30]);

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

/* Glute bridge activation. The shared GLUTE_BRIDGE_* poses cannot carry this
   one: they lift the pelvis nine units, which on a warm-up card reads as lying
   still and breathing, and their arms are posed by ANGLE, so the hands skate two
   units along the mat as the torso rolls. Here the hands are pinned to the mat
   beside the hips like everything else touching the floor, and the pelvis lifts
   half again as far, the spine unrolling underneath it so the shoulders stay
   down where a bridge keeps them. */
const bridge = (py, spine) => ({
  x: 48, y: py, spine, head: 150,
  handL: { x: 38, y: 87.5, bend: -1 }, handR: { x: 41, y: 87.5, bend: -1 },
  footPtL: { x: 66, y: 87.5, bend: 1 }, footPtR: { x: 68, y: 87.5, bend: 1 },
  footL: 0, footR: 0,
});
const BRIDGE_DOWN = bridge(85.5, 176);
const BRIDGE_MID = bridge(79.5, 192);
const BRIDGE_UP = bridge(73, 208.5);

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
const HANG_GRIP = passiveHang(50, 56.5, 90, 90, [-89, -90], [-93, -90]);
const HANG_SINK = passiveHang(50, 60.5, 90, 84, [-88, -90], [-92, -90]);
/* The sway has to be worth drawing or the clip is a photograph: a two-unit
   shuffle was the whole motion before. Twelve units of pelvis carries the feet
   through twenty-one, with the spine and the trailing legs leaning into the
   swing so the body reads as one pendulum instead of a wobbling plank. */
const HANG_FWD = passiveHang(56, 59.5, 100, 94, [-78, -80], [-82, -80]);
const HANG_BACK = passiveHang(44, 59.5, 80, 74, [-98, -100], [-102, -100]);

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
      { t: 0, pose: ANKLE_BACK }, { t: 0.24, pose: ANKLE_MID },
      { t: 0.42, pose: ANKLE_FWD }, { t: 0.62, pose: ANKLE_FWD },
      { t: 0.82, pose: ANKLE_MID }, { t: 1, pose: ANKLE_BACK },
    ],
  }),

  wrist_prep: clip({
    id: 'wrist_prep', duration: 3600, hero: 0.5,
    props: [{ type: 'mat', x: 42, w: 68 }],
    keys: [
      { t: 0, pose: WRIST_BACK }, { t: 0.22, pose: WRIST_MID },
      { t: 0.42, pose: WRIST_FWD }, { t: 0.62, pose: WRIST_FWD },
      { t: 0.8, pose: WRIST_MID }, { t: 1, pose: WRIST_BACK },
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
      { t: 0, pose: BRIDGE_DOWN }, { t: 0.22, pose: BRIDGE_MID },
      { t: 0.42, pose: BRIDGE_UP }, { t: 0.64, pose: BRIDGE_UP },
      { t: 0.82, pose: BRIDGE_MID }, { t: 1, pose: BRIDGE_DOWN },
    ],
  }),

  hip_flexor_stretch_kneeling: clip({
    id: 'hip_flexor_stretch_kneeling', duration: 4600, hero: 0.5,
    props: [{ type: 'mat', x: 40, w: 60 }],
    keys: [
      { t: 0, pose: HIPFLEX_TALL }, { t: 0.22, pose: HIPFLEX_MID },
      { t: 0.42, pose: HIPFLEX_PRESS }, { t: 0.68, pose: HIPFLEX_PRESS },
      { t: 0.84, pose: HIPFLEX_MID }, { t: 1, pose: HIPFLEX_TALL },
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
      { t: 0, pose: HANG_GRIP }, { t: 0.14, pose: HANG_SINK },
      { t: 0.36, pose: HANG_FWD }, { t: 0.5, pose: HANG_SINK },
      { t: 0.72, pose: HANG_BACK }, { t: 0.86, pose: HANG_SINK },
      { t: 1, pose: HANG_GRIP },
    ],
  }),
};
