/*
 * clips.core.js — core, conditioning, mobility and carry animation clips.
 *
 * Shape is `{ id, duration, ground, hero, ease, props, keys }` exactly as
 * docs/CONTRACTS.md specifies. Poses are composed with `p(BASE, {overrides})`
 * from src/core/poses.js.
 *
 * House rules used throughout this file:
 *   - A limb uses ONE representation — IK targets (handL, footPtR, ...) or FK
 *     angle arrays (armL, legR, ...) — in EVERY key of a clip. lerpPose hard-switches when a key adds or drops a
 *     target, which pops the limb, so the choice is made per clip.
 *   - Anything touching the floor is pinned at y 87.5 (GROUND is 88).
 *   - Isometric holds are never frozen: the torso rotates about the fixed
 *     shoulder (see `hips()`), which keeps pinned hands and feet in place while
 *     the hips breathe by a unit or two.
 *   - Angles stay sign-continuous inside a clip (see rig.js).
 *   - t:1 reuses the exact t:0 pose object so the loop never jumps.
 */

import { solve } from '../core/rig.js';
import {
  p, STAND, SUPINE, HOLLOW, PLANK_TOP, SQUAT_BOTTOM, DIP_TOP,
  HANG, HANG_TUCK, HANG_LRAISE,
} from '../core/poses.js';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const FLOOR = 87.5;
const SHOULDER_UP = 26 * 0.88; // pelvis -> shoulder distance along the spine

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.5, props: [] }, cfg);
}

/**
 * Pelvis that puts the shoulder joint exactly at (sx, sy) for a given spine
 * angle. Rotating a hold about its own shoulder is the only way to breathe
 * without dragging pinned hands off the floor.
 */
function hips(sx, sy, spine) {
  const r = (spine * Math.PI) / 180;
  return { x: sx - SHOULDER_UP * Math.cos(r), y: sy + SHOULDER_UP * Math.sin(r), spine };
}

/** Where the shoulder joint of a pose ends up — hands are placed relative to it. */
function shoulderOf(pose) {
  return solve(pose).shoulder;
}

/**
 * Hands cradling the back of the head, placed in the torso's own frame so they
 * travel with the skull through a crunch or sit-up. Elbows end up flared and
 * clear of the floor, which hands-on-chest never manages lying down.
 */
function headHands(pose) {
  const j = solve(pose);
  const [hx, hy] = j.head;
  const r = ((pose.spine === undefined ? 90 : pose.spine) * Math.PI) / 180;
  const ux = Math.cos(r); const uy = -Math.sin(r);   // along the spine, pelvis -> head
  const bx = Math.sin(r); const by = Math.cos(r);    // behind the body
  return p(pose, {
    handL: { x: hx + 3.5 * ux + 1.2 * bx, y: hy + 3.5 * uy + 1.2 * by, bend: 1 },
    handR: { x: hx + 3.2 * ux + 2.4 * bx, y: hy + 3.2 * uy + 2.4 * by, bend: 1 },
  });
}

/** Straight arms hanging at the sides holding a load — carries. */
function sideLoad(pose, drop, load) {
  const [sx, sy] = shoulderOf(pose);
  const d = Math.min(drop, 22.9);
  return p(pose, {
    handL: { x: sx - 2.6, y: sy + d, bend: -1 },
    handR: { x: sx + 2.6, y: sy + d, bend: -1 },
    load,
  });
}

const MAT_WIDE = { type: 'mat', x: 44, w: 76 };

/* ================================================================== *
 * 1. PLANKS — anti-extension holds.
 * The shoulder is the anchor: hands stay welded to the floor while the
 * spine angle breathes the hips up and down by about a unit.
 * ================================================================== */

/* High plank. Shoulder stacked over the hands, legs clamped straight. */
function highPlank(spine, headOff, tremor) {
  return p(PLANK_TOP, Object.assign(hips(57.4, 64, spine), {
    head: spine - 8 + headOff,
    handL: { x: 56.4, y: FLOOR, bend: -1 },
    handR: { x: 58.4, y: FLOOR, bend: -1 },
    legL: undefined,
    legR: undefined,
    footPtL: { x: 8.0, y: 84.9, bend: -1 },
    footPtR: { x: 9.2, y: 85.1, bend: -1 },
    footL: -28 + tremor,
    footR: -30 + tremor,
  }));
}

const PLK_MID = highPlank(23, 0, 0);
const PLK_IN = highPlank(21.6, 1, 0.8);   // ribs fill, hips float up
const PLK_OUT = highPlank(24.4, -1, -0.8); // breath out, hips settle

const plank = clip({
  id: 'plank',
  duration: 4200,
  hero: 0,
  props: [{ type: 'mat', x: 34, w: 62 }],
  keys: [
    { t: 0, pose: PLK_MID },
    { t: 0.3, pose: PLK_IN },
    { t: 0.62, pose: PLK_OUT },
    { t: 1, pose: PLK_MID },
  ],
});

/* Forearm plank. Elbow lands under the shoulder on the floor, forearm flat. */
function forearmPlank(sx, sy, spine, headOff, tremor) {
  return p(PLANK_TOP, Object.assign(hips(sx, sy, spine), {
    head: spine - 10 + headOff,
    handL: { x: sx + 10.5, y: FLOOR - 0.1, bend: -1 },
    handR: { x: sx + 11.5, y: FLOOR, bend: -1 },
    legL: undefined,
    legR: undefined,
    footPtL: { x: sx - 52.4, y: 84.6, bend: -1 },
    footPtR: { x: sx - 51.2, y: 84.8, bend: -1 },
    footL: -25 + tremor,
    footR: -27 + tremor,
  }));
}

const FPL_MID = forearmPlank(60, 75.7, 14, 0, 0);
const FPL_IN = forearmPlank(60, 75.7, 12.8, 1, 0.7);
const FPL_OUT = forearmPlank(60, 75.7, 15.2, -1, -0.7);

const forearm_plank = clip({
  id: 'forearm_plank',
  duration: 4600,
  hero: 0,
  props: [{ type: 'mat', x: 38, w: 68 }],
  keys: [
    { t: 0, pose: FPL_MID },
    { t: 0.32, pose: FPL_IN },
    { t: 0.66, pose: FPL_OUT },
    { t: 1, pose: FPL_MID },
  ],
});

/* Generic anti-extension fallback — same job, its own body position so it does
   not read as a copy of `forearm_plank`. */
const AEX_MID = forearmPlank(57, 75.2, 15.5, 0, 0);
const AEX_IN = forearmPlank(57, 75.2, 14.2, 1.5, 1);
const AEX_OUT = forearmPlank(57, 75.2, 16.8, -1.5, -1);

const core_antiextension = clip({
  id: 'core_antiextension',
  duration: 4800,
  hero: 0,
  props: [{ type: 'mat', x: 36, w: 68 }],
  keys: [
    { t: 0, pose: AEX_MID },
    { t: 0.34, pose: AEX_IN },
    { t: 0.68, pose: AEX_OUT },
    { t: 1, pose: AEX_MID },
  ],
});

/* Side plank. Bottom (far) elbow on the floor, top arm reaching for the
   ceiling — the raised arm is the near limb so it draws bright. */
function sidePlank(spine, armLift, tremor) {
  return p(PLANK_TOP, Object.assign(hips(60, 75.5, spine), {
    head: spine + 2,
    handL: { x: 71.5, y: FLOOR, bend: -1 },
    handR: undefined,
    armR: [92 + armLift, 90 + armLift],
    legL: undefined,
    legR: undefined,
    footPtL: { x: 7.6, y: 85.1, bend: -1 },
    footPtR: { x: 7.5, y: 84.4, bend: -1 },
    footL: -18 + tremor,
    footR: -16 + tremor,
  }));
}

const SPL_MID = sidePlank(11, 0, 0);
const SPL_UP = sidePlank(9.8, 1.5, 0.8);
const SPL_DOWN = sidePlank(12.2, -1.5, -0.8);

const side_plank = clip({
  id: 'side_plank',
  duration: 4400,
  hero: 0,
  props: [{ type: 'mat', x: 38, w: 68 }],
  keys: [
    { t: 0, pose: SPL_MID },
    { t: 0.32, pose: SPL_UP },
    { t: 0.66, pose: SPL_DOWN },
    { t: 1, pose: SPL_MID },
  ],
});

/* ================================================================== *
 * 2. HOLLOW BODY
 * ================================================================== */

const HOL_MID = p(HOLLOW, {});
const HOL_IN = p(HOLLOW, {
  y: 83.4, spine: 27.5, head: 33.5,
  armL: [48, 46], armR: [42, 40],
  legL: [173, 176], legR: [171, 174],
});
const HOL_OUT = p(HOLLOW, {
  y: 84.5, spine: 25, head: 31,
  armL: [44.5, 42.5], armR: [38.5, 36.5],
  legL: [169.5, 172.5], legR: [167.5, 170.5],
});

const hollow_hold = clip({
  id: 'hollow_hold',
  duration: 4000,
  hero: 0,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: HOL_MID },
    { t: 0.34, pose: HOL_IN },
    { t: 0.68, pose: HOL_OUT },
    { t: 1, pose: HOL_MID },
  ],
});

/* Rocking keeps the banana shape and pivots it about the low back: shoulders
   drop as the legs rise, then the other way. */
const ROCK_BACK = p(HOLLOW, {
  y: 84.6, spine: 20, head: 26,
  armL: [40, 38], armR: [34, 32],
  legL: [162, 166], legR: [160, 164],
});
const ROCK_FWD = p(HOLLOW, {
  y: 83.4, spine: 33, head: 39,
  armL: [52, 50], armR: [46, 44],
  legL: [178, 181], legR: [176, 179],
});

const hollow_rock = clip({
  id: 'hollow_rock',
  duration: 2000,
  hero: 0.25,
  props: [MAT_WIDE],
  /* A rock is a pendulum: slowest at the two ends, fastest through the middle.
     inOut everywhere stopped it four times a cycle. */
  keys: [
    { t: 0, pose: HOL_MID },
    { t: 0.25, pose: ROCK_BACK, ease: 'out' },
    { t: 0.5, pose: HOL_MID, ease: 'in' },
    { t: 0.75, pose: ROCK_FWD, ease: 'out' },
    { t: 1, pose: HOL_MID, ease: 'in' },
  ],
});

/* ================================================================== *
 * 3. FLOOR FLEXION — head to the RIGHT, feet to the LEFT.
 * The pelvis never moves in these clips: either the torso rotates about
 * it or the legs do, which is what makes the exercise readable.
 * ================================================================== */

/* Knees bent, heels planted — the position every crunch and sit-up starts in. */
const FEET_PLANTED = {
  footPtL: { x: 22, y: FLOOR, bend: -1 },
  footPtR: { x: 24.5, y: FLOOR, bend: -1 },
  footL: 180, footR: 180,
};

function crunchPose(spine, tuck) {
  return headHands(p(SUPINE, Object.assign({
    x: 42, y: 85.2, spine, head: spine + tuck,
  }, FEET_PLANTED)));
}

const CR_DOWN = crunchPose(10, 12);
const CR_UP = crunchPose(38, 16);
const CR_SQUEEZE = crunchPose(41.5, 17);
/* Halfway down. The eccentric is the half a crunch is actually made of and it
   had no key at all — the shoulder blades went from the squeeze to the mat in
   one straight line. */
const CR_MIDWAY = crunchPose(24, 14);

const crunch = clip({
  id: 'crunch',
  duration: 2600,
  hero: 0.34,
  props: [MAT_WIDE],
  /* The lowering used to be one straight interpolation over half the cycle,
     which is the only half of a crunch that trains anything. It gets a key of
     its own and 46% of the clip; the shortening half keeps 34%. */
  keys: [
    { t: 0, pose: CR_DOWN },
    { t: 0.34, pose: CR_UP, ease: 'grind' },
    { t: 0.46, pose: CR_SQUEEZE },
    { t: 0.74, pose: CR_MIDWAY, ease: 'in' },
    { t: 0.94, pose: CR_DOWN, ease: 'out' },
    { t: 1, pose: CR_DOWN },
  ],
});

/* Sit-up — same anchor, but the torso keeps rotating past vertical until the
   chest is over the knees. Spine climbs 10 -> 100, never wrapping. */
function situpPose(spine, tuck) {
  return headHands(p(SUPINE, Object.assign({
    x: 42, y: 85.4, spine, head: spine + tuck,
  }, FEET_PLANTED)));
}

const SU_DOWN = situpPose(10, 12);
const SU_MID = situpPose(50, 14);
const SU_TOP = situpPose(100, 12);

const situp = clip({
  id: 'situp',
  duration: 3200,
  hero: 0.46,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: SU_DOWN },
    { t: 0.28, pose: SU_MID },
    { t: 0.46, pose: SU_TOP },
    { t: 0.72, pose: SU_MID },
    { t: 1, pose: SU_DOWN },
  ],
});

/* Lying leg raise — pelvis pinned, hands pressing the floor beside the hips,
   only the legs travel (176 -> 92, one continuous sweep). */
function legRaisePose(thigh, shin, foot) {
  return p(SUPINE, {
    x: 44, y: 85.5, spine: 8, head: 20,
    armL: [187, 185], armR: [185, 183],
    legL: [thigh, shin], legR: [thigh - 2, shin - 2],
    footL: foot, footR: foot,
  });
}

const LR_DOWN = legRaisePose(176, 179, 200);
const LR_UP = legRaisePose(92, 90, 110);
const LR_TOP = legRaisePose(96, 93, 104);

const leg_raise = clip({
  id: 'leg_raise',
  duration: 3400,
  hero: 0.4,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: LR_DOWN },
    { t: 0.36, pose: LR_UP, ease: 'out' },
    { t: 0.48, pose: LR_TOP },
    { t: 1, pose: LR_DOWN },
  ],
});

/* Dead bug — arms point at the ceiling, knees stacked over the hips, opposite
   limbs reach away while the low back stays glued down. */
const DB_BASE = p(SUPINE, {
  x: 43, y: 84.6, spine: 8, head: 20,
  armL: [93, 91], armR: [89, 87],
  legL: [100, 175], legR: [96, 171],
  footL: 150, footR: 150,
});

const DB_A = p(DB_BASE, { armL: [24, 8], legR: [172, 176], footR: 195 });
const DB_B = p(DB_BASE, { armR: [20, 4], legL: [176, 180], footL: 195 });

const dead_bug = clip({
  id: 'dead_bug',
  duration: 4200,
  hero: 0.25,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: DB_BASE },
    { t: 0.25, pose: DB_A },
    { t: 0.5, pose: DB_BASE },
    { t: 0.75, pose: DB_B },
    { t: 1, pose: DB_BASE },
  ],
});

/* Generic core-flexion fallback: a reaching crunch — arms slide along the floor
   past the knees so the flexion reads even at thumbnail size. */
function reachCrunch(spine, upper, fore) {
  return p(SUPINE, Object.assign({
    x: 43, y: 85.3, spine, head: spine + 12,
    armL: [upper, fore], armR: [upper - 4, fore - 4],
  }, {
    footPtL: { x: 23, y: FLOOR, bend: -1 },
    footPtR: { x: 25.5, y: FLOOR, bend: -1 },
    footL: 180, footR: 180,
  }));
}

const CF_DOWN = reachCrunch(12, 168, 172);
const CF_UP = reachCrunch(40, 176, 176);
const CF_SQUEEZE = reachCrunch(43, 178, 178);
const CF_MIDWAY = reachCrunch(25, 172, 174);

const core_flexion = clip({
  id: 'core_flexion',
  duration: 2400,
  hero: 0.32,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: CF_DOWN },
    { t: 0.32, pose: CF_UP, ease: 'grind' },
    { t: 0.44, pose: CF_SQUEEZE },
    { t: 0.72, pose: CF_MIDWAY, ease: 'in' },
    { t: 0.94, pose: CF_DOWN, ease: 'out' },
    { t: 1, pose: CF_DOWN },
  ],
});

/* ================================================================== *
 * 4. ROTATION / ANTI-ROTATION
 * A side-on rig cannot show transverse rotation directly, so the twist
 * is carried by the hands travelling on an arc across the body while the
 * torso counter-tilts and the head tracks them.
 * ================================================================== */

/* Seated V: torso leaning back past vertical, knees folded in front, heels
   hovering. Spine sits above 90 for the whole clip — no sign flips. */
function twistPose(spine, hx, hy, headLag) {
  return p(SUPINE, {
    x: 46, y: 78, spine, head: spine - headLag,
    handL: { x: hx - 1.2, y: hy - 1.2, bend: -1 },
    handR: { x: hx, y: hy, bend: -1 },
    footPtL: { x: 60, y: 84.5, bend: 1 },
    footPtR: { x: 62.5, y: 84.6, bend: 1 },
    footL: 20, footR: 22,
    load: 'plate',
  });
}

const RT_MID = twistPose(122, 48, 65, 6);
const RT_NEAR = twistPose(119, 53, 68, 12);
const RT_FAR = twistPose(125, 43, 62, 0);

const russian_twist = clip({
  id: 'russian_twist',
  duration: 2600,
  hero: 0.25,
  props: [MAT_WIDE],
  keys: [
    { t: 0, pose: RT_MID },
    { t: 0.25, pose: RT_NEAR, ease: 'out' },
    { t: 0.5, pose: RT_MID, ease: 'in' },
    { t: 0.75, pose: RT_FAR, ease: 'out' },
    { t: 1, pose: RT_MID, ease: 'in' },
  ],
});

/* Pallof press — the whole point is that nothing rotates. Cable pulls from the
   left, ribs stay stacked, only the arms travel. */
function pallofPose(spine, hx, hy) {
  return p(STAND, {
    x: 50, y: 57, spine, head: spine,
    handL: { x: hx - 1.5, y: hy + 1.3, bend: -1 },
    handR: { x: hx, y: hy, bend: -1 },
    footPtL: { x: 47, y: FLOOR, bend: 1 },
    footPtR: { x: 53, y: FLOOR, bend: 1 },
    footL: 2, footR: 2,
  });
}

const PF_IN = pallofPose(90, 56, 41);
const PF_OUT = pallofPose(89.4, 72.5, 39.4);
const PF_HOLD = pallofPose(89.6, 71.5, 39.8);

const pallof_press = clip({
  id: 'pallof_press',
  duration: 3200,
  hero: 0.3,
  props: [
    { type: 'machine', x: 12, y: 30, w: 14, h: 40 },
    { type: 'band', x0: 19, y0: 40.5, x1: 57, y1: 41, sag: 1.5 },
  ],
  keys: [
    { t: 0, pose: PF_IN },
    { t: 0.3, pose: PF_OUT, ease: 'out' },
    { t: 0.45, pose: PF_HOLD },
    { t: 1, pose: PF_IN },
  ],
});

/* Generic rotation fallback: a standing chop. Hands travel high-near to
   low-far, knees soften into the finish, torso follows the hands. */
function chopPose(spine, py, hx, hy, head) {
  return p(STAND, {
    x: 50, y: py, spine, head,
    handL: { x: hx - 2, y: hy + 1.5, bend: -1 },
    handR: { x: hx, y: hy, bend: -1 },
    footPtL: { x: 46, y: FLOOR, bend: 1 },
    footPtR: { x: 54, y: FLOOR, bend: 1 },
    footL: 2, footR: 2,
  });
}

const CRO_HIGH = chopPose(86, 57, 65, 24, 80);
const CRO_MID = chopPose(90, 58, 58, 45, 88);
const CRO_LOW = chopPose(96, 59.4, 45, 55, 100);

const core_rotation = clip({
  id: 'core_rotation',
  duration: 3000,
  hero: 0.5,
  props: [],
  keys: [
    { t: 0, pose: CRO_HIGH },
    { t: 0.3, pose: CRO_MID, ease: 'in' },
    { t: 0.5, pose: CRO_LOW, ease: 'out' },
    { t: 0.75, pose: CRO_MID, ease: 'in' },
    { t: 1, pose: CRO_HIGH, ease: 'out' },
  ],
});

/* ================================================================== *
 * 5. HANGING — ground:false, because the feet legitimately hang below
 * the floor line. Torso pivots about the fixed shoulder so the hands
 * never leave the bar.
 * ================================================================== */

const BAR_PROP = { type: 'bar', x: 50, y: 15, w: 46, posts: true };
const BAR_HANDS = {
  handL: { x: 47, y: 15, bend: 1 },
  handR: { x: 53, y: 15, bend: 1 },
};

function hangPose(spine, thigh, shin, foot) {
  return p(HANG, Object.assign(hips(50, 38.12, spine), BAR_HANDS, {
    head: spine,
    legL: [thigh, shin], legR: [thigh - 4, shin],
    footL: foot, footR: foot,
  }));
}

const HANG_BOTTOM = p(HANG, Object.assign(hips(50, 38.12, 90), BAR_HANDS, {
  head: 90,
  legL: [-88, -90], legR: [-92, -90],
  footL: 0, footR: 0,
}));

const HKR_TUCK = p(HANG_TUCK, Object.assign(hips(50, 38.12, 94), BAR_HANDS, {
  head: 94,
  legL: [-30, -120], legR: [-34, -124],
  footL: -30, footR: -30,
}));
const HKR_TOP = p(HKR_TUCK, Object.assign(hips(50, 38.12, 96), {
  head: 96,
  legL: [-22, -118], legR: [-26, -122],
}));
/* Knees halfway back down, so the lowering is not one straight drop. */
const HKR_MIDWAY = p(HKR_TUCK, Object.assign(hips(50, 38.12, 92), {
  head: 92,
  legL: [-58, -108], legR: [-62, -112],
  footL: -16, footR: -16,
}));

const hanging_knee_raise = clip({
  id: 'hanging_knee_raise',
  duration: 2800,
  ground: false,
  hero: 0.38,
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: HANG_BOTTOM },
    { t: 0.38, pose: HKR_TUCK, ease: 'grind' },
    { t: 0.5, pose: HKR_TOP },
    { t: 0.76, pose: HKR_MIDWAY, ease: 'in' },
    { t: 0.94, pose: HANG_BOTTOM, ease: 'out' },
    { t: 1, pose: HANG_BOTTOM },
  ],
});

const HLR_MID = hangPose(93, -44, -60, 20);
const HLR_TOP = p(HANG_LRAISE, Object.assign(hips(50, 38.12, 96), BAR_HANDS, {
  head: 96,
  legL: [2, 0], legR: [-2, -4],
  footL: 60, footR: 60,
}));
const HLR_SQUEEZE = p(HLR_TOP, Object.assign(hips(50, 38.12, 98), {
  head: 98,
  legL: [8, 6], legR: [4, 2],
}));

const hanging_leg_raise = clip({
  id: 'hanging_leg_raise',
  duration: 3000,
  ground: false,
  hero: 0.42,
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: HANG_BOTTOM },
    { t: 0.24, pose: HLR_MID, ease: 'grind' },
    { t: 0.42, pose: HLR_TOP, ease: 'out' },
    { t: 0.54, pose: HLR_SQUEEZE },
    { t: 0.8, pose: HLR_MID, ease: 'in' },
    { t: 0.95, pose: HANG_BOTTOM, ease: 'out' },
    { t: 1, pose: HANG_BOTTOM },
  ],
});

/* Toes to bar: the torso has to lean back to nearly horizontal for the feet to
   reach the bar. Spine climbs 90 -> 162, legs sweep -88 -> 128, both monotone. */
const TTB_MID = hangPose(120, 70, 68, 74);
const TTB_TOP = hangPose(162, 128, 128, 128);

const toes_to_bar = clip({
  id: 'toes_to_bar',
  duration: 2800,
  ground: false,
  hero: 0.5,
  props: [{ type: 'bar', x: 50, y: 15, w: 56, posts: false }],
  keys: [
    { t: 0, pose: HANG_BOTTOM },
    { t: 0.3, pose: TTB_MID },
    { t: 0.5, pose: TTB_TOP, ease: 'out' },
    { t: 0.72, pose: TTB_MID },
    { t: 1, pose: HANG_BOTTOM },
  ],
});

/* ================================================================== *
 * 6. SUPPORT HOLDS on parallel bars — shoulder sits a full arm above the
 * hands, legs out front. Isometric, so the legs carry a visible tremor.
 * ================================================================== */

const DIP_BARS = { type: 'dipbars', x: 50, y: 56, w: 26, gap: 6 };
const SUPPORT_HANDS = {
  handL: { x: 46, y: 56, bend: -1 },
  handR: { x: 54, y: 56, bend: -1 },
};

function supportPose(py, spine, legs, foot) {
  return p(DIP_TOP, Object.assign({
    x: 48.4, y: py, spine, head: spine,
  }, SUPPORT_HANDS, {
    legL: legs[0], legR: legs[1],
    footL: foot, footR: foot - 4,
  }));
}

const LSIT_MID = supportPose(56.33, 88, [[2, 2], [-2, -2]], 62);
const LSIT_A = supportPose(56.0, 89, [[4, 3], [0, -1]], 65);
const LSIT_B = supportPose(56.6, 87, [[1, 1], [-3, -3]], 59);

const l_sit = clip({
  id: 'l_sit',
  duration: 4000,
  hero: 0,
  props: [DIP_BARS],
  keys: [
    { t: 0, pose: LSIT_MID },
    { t: 0.34, pose: LSIT_A },
    { t: 0.68, pose: LSIT_B },
    { t: 1, pose: LSIT_MID },
  ],
});

const TUCK_MID = supportPose(56.33, 88, [[0, -90], [-4, -94]], -30);
const TUCK_A = supportPose(56.0, 89, [[2, -88], [-2, -92]], -26);
const TUCK_B = supportPose(56.7, 87, [[-2, -93], [-6, -97]], -34);

const tuck_l_sit = clip({
  id: 'tuck_l_sit',
  duration: 3800,
  hero: 0,
  props: [DIP_BARS],
  keys: [
    { t: 0, pose: TUCK_MID },
    { t: 0.34, pose: TUCK_A },
    { t: 0.68, pose: TUCK_B },
    { t: 1, pose: TUCK_MID },
  ],
});

/* ================================================================== *
 * 7. QUADRUPED — hands and knees.
 * Arms are longer than thighs, so the shoulder rides ~8 units higher
 * than the hip and the spine runs downhill at about 20 degrees.
 * All four limbs are IK the whole way through, which lets a limb swap
 * between planted and extended without changing representation.
 * ================================================================== */

const QUAD_HANDS = {
  handL: { x: 63, y: 87.4, bend: -1 },
  handR: { x: 64.5, y: 87.4, bend: -1 },
};
const QUAD_KNEES = {
  footPtL: { x: 28, y: FLOOR, bend: 1 },
  footPtR: { x: 30, y: FLOOR, bend: 1 },
  footL: 185, footR: 185,
};

function quadPose(spine, head) {
  return p(PLANK_TOP, Object.assign(hips(64.43, 63.99, spine), QUAD_HANDS, QUAD_KNEES, {
    head,
    legL: undefined, legR: undefined,
  }));
}

const QUAD_BASE = quadPose(20.5, 10);

/* Opposite arm and leg reach away while the torso refuses to tilt. */
const BD_A = p(QUAD_BASE, {
  handL: { x: 87, y: 58.5, bend: -1 },
  footPtR: { x: 12.8, y: 70.2, bend: 1 },
  footR: 178,
});
const BD_B = p(quadPose(20.8, 11), {
  handR: { x: 86.5, y: 59.5, bend: -1 },
  footPtL: { x: 12.5, y: 69.6, bend: 1 },
  footL: 178,
});

const bird_dog = clip({
  id: 'bird_dog',
  duration: 4600,
  hero: 0.25,
  props: [{ type: 'mat', x: 46, w: 82 }],
  keys: [
    { t: 0, pose: QUAD_BASE },
    { t: 0.25, pose: BD_A },
    { t: 0.5, pose: QUAD_BASE },
    { t: 0.75, pose: BD_B },
    { t: 1, pose: QUAD_BASE },
  ],
});

/* Cat-cow. One spine segment cannot round, so the wave is carried by the head
   plus a small hip rise and fall; the range stays honest instead of pretty. */
const CC_COW = quadPose(22.5, 55);   // belly drops, eyes up
const CC_CAT = quadPose(17.5, -40);  // hips tuck, chin to chest

const cat_cow = clip({
  id: 'cat_cow',
  duration: 4800,
  hero: 0.28,
  props: [{ type: 'mat', x: 46, w: 82 }],
  keys: [
    { t: 0, pose: QUAD_BASE },
    { t: 0.28, pose: CC_COW },
    { t: 0.62, pose: CC_CAT },
    { t: 1, pose: QUAD_BASE },
  ],
});

/* ================================================================== *
 * 8. CONDITIONING — the loudest clips in the library.
 * Gait clips run on 'linear' easing: easing into every key turns a run
 * into a series of poses.
 * ================================================================== */

/* Mountain climber. Hands stay welded down; the hips pike up as the knees
   trade places, which is both what it looks like and what keeps the swinging
   knee from arcing through the floor. */
function climberPose(spine, rLeg, lLeg) {
  return p(PLANK_TOP, Object.assign(hips(57.4, 64, spine), {
    head: spine - 8,
    handL: { x: 56.4, y: FLOOR, bend: -1 },
    handR: { x: 58.4, y: FLOOR, bend: -1 },
    legL: [lLeg[0], lLeg[1]], legR: [rLeg[0], rLeg[1]],
    footL: lLeg[2], footR: rLeg[2],
  }));
}

/* Angles run in a 150..330 band rather than crossing -180: the swing shin has
   to point UP-and-back (150) to fold the heel under the seat, and mixing that
   with -157 would spin the leg the long way round. */
const MC_R = climberPose(23, [320, 168, 330], [203, 203, 330]);
const MC_SWAP_A = climberPose(13.9, [260, 150, 320], [237, 176, 325]);
const MC_L = climberPose(23, [203, 203, 330], [320, 168, 330]);
const MC_SWAP_B = climberPose(13.9, [237, 176, 325], [260, 150, 320]);

const mountain_climber = clip({
  id: 'mountain_climber',
  duration: 1400,
  hero: 0,
  ease: 'linear',
  props: [{ type: 'mat', x: 34, w: 62 }],
  keys: [
    { t: 0, pose: MC_R },
    { t: 0.25, pose: MC_SWAP_A },
    { t: 0.5, pose: MC_L },
    { t: 0.75, pose: MC_SWAP_B },
    { t: 1, pose: MC_R },
  ],
});

/* Burpee — stand, crouch with the hands down, kick to plank, feet back in,
   jump. Feet and hands are IK in every key so nothing snaps between phases;
   the leg targets sit past full reach in the plank, so the clamp keeps the
   legs dead straight there. */
const BUR_STAND = p(STAND, {
  x: 51, y: 57, spine: 90, head: 90,
  handL: { x: 48.6, y: 57.3, bend: -1 },
  handR: { x: 53.4, y: 57.3, bend: -1 },
  footPtL: { x: 49.6, y: FLOOR, bend: 1 },
  footPtR: { x: 52.4, y: FLOOR, bend: 1 },
  footL: 2, footR: 2,
});

const BUR_CROUCH = p(BUR_STAND, {
  x: 44, y: 73, spine: 22, head: 8,
  handL: { x: 64.2, y: 87.4, bend: -1 },
  handR: { x: 65.8, y: 87.4, bend: -1 },
  footPtL: { x: 49.6, y: FLOOR, bend: 1 },
  footPtR: { x: 52.4, y: FLOOR, bend: 1 },
  footL: 4, footR: 4,
});

const BUR_PLANK = p(BUR_CROUCH, Object.assign(hips(64.5, 64, 24), {
  head: 16,
  footPtL: { x: 14.6, y: 85, bend: 1 },
  footPtR: { x: 15.8, y: 85.2, bend: 1 },
  footL: -28, footR: -30,
}));

/* Feet in the air on the way back and on the way in. Without this key both
   toes stayed welded to the mat while they travelled 35 units, which is a
   burpee performed on ice. The hands are already planted, so the hips only
   have to hinge over them. */
const BUR_KICK = p(BUR_CROUCH, Object.assign(hips(64.5, 64, 12), {
  head: 6,
  footPtL: { x: 26, y: 81.5, bend: 1 },
  footPtR: { x: 27.2, y: 81.8, bend: 1 },
  footL: -16, footR: -18,
}));

const BUR_JUMP = p(BUR_STAND, {
  x: 51, y: 52.2, spine: 90, head: 92,
  handL: { x: 53, y: 7.2, bend: -1 },
  handR: { x: 54.5, y: 8, bend: -1 },
  footPtL: { x: 50, y: 82, bend: 1 },
  footPtR: { x: 52.8, y: 82.2, bend: 1 },
  footL: -30, footR: -30,
});

const burpee = clip({
  id: 'burpee',
  duration: 2600,
  hero: 0.34,
  props: [{ type: 'mat', x: 42, w: 76 }],
  keys: [
    { t: 0, pose: BUR_STAND },
    { t: 0.14, pose: BUR_CROUCH },
    { t: 0.24, pose: BUR_KICK, ease: 'in' },
    { t: 0.36, pose: BUR_PLANK, ease: 'out' },
    { t: 0.48, pose: BUR_KICK, ease: 'in' },
    { t: 0.58, pose: BUR_CROUCH, ease: 'out' },
    { t: 0.76, pose: BUR_JUMP, ease: 'out' },
    { t: 1, pose: BUR_STAND, ease: 'in' },
  ],
});

/*
 * Jumping jack — the one movement in this file that is ENTIRELY frontal-plane.
 *
 * Seen edge-on there is nothing left of it: the two arms lie on top of each
 * other and the only way to show the legs opening is to scissor them fore and
 * aft, which is a split jack, a different exercise with a different muscle
 * bill. That is what this clip used to do, and it read as a man jogging.
 * `spread` turns the figure to face the camera and the arms and legs open
 * where a viewer can see them.
 *
 * The arc is keyed at three heights, not two, because an arm that goes from
 * hip to overhead in one lerp travels the CHORD — a straight diagonal — and a
 * jumping jack is the arc, not the endpoints.
 */
const JACK_SPREAD = 13;

function jackPose(py, feet, hands, footAng) {
  return p(STAND, {
    x: 50, y: py, spine: 90, head: 90, spread: JACK_SPREAD,
    handL: { x: hands[0], y: hands[1], bend: -1 },
    handR: { x: hands[2], y: hands[3], bend: 1 },
    footPtL: { x: feet[0], y: feet[1], bend: 1 },
    footPtR: { x: feet[2], y: feet[3], bend: 1 },
    footL: 180 - footAng, footR: footAng,
  });
}

/* feet under the hips, hands at the thighs */
const JJ_CLOSED = jackPose(57.2, [47.5, FLOOR, 52.5, FLOOR], [39.8, 57.2, 60.2, 57.2], 4);
/* half open, mid-flight: arms out at shoulder height, feet off the floor */
const JJ_AIR = jackPose(55.4, [39, 84, 61, 84], [24.5, 33.4, 75.5, 33.4], -16);
/* wide, hands nearly touching overhead */
const JJ_OPEN = jackPose(61, [33, FLOOR, 67, FLOOR], [45.4, 12.4, 54.6, 12.4], 14);

const jumping_jack = clip({
  id: 'jumping_jack',
  duration: 1100,
  hero: 0.5,
  ease: 'linear',
  props: [],
  keys: [
    // Ballistics, not a metronome: leaving the floor the figure is decelerating
    // against gravity, coming back down it is speeding up.
    { t: 0, pose: JJ_CLOSED },
    { t: 0.26, pose: JJ_AIR, ease: 'out' },
    { t: 0.5, pose: JJ_OPEN, ease: 'in' },
    { t: 0.76, pose: JJ_AIR, ease: 'out' },
    { t: 1, pose: JJ_CLOSED, ease: 'in' },
  ],
});

/* Jump rope. Wrists stay parked at the hips all clip long so the rope — drawn
   as a band arc from the far hand to the near hand — keeps its ends. */
const ROPE_HANDS = {
  handL: { x: 41, y: 52, bend: 1 },   // far hand parked behind the hip
  handR: { x: 60, y: 50, bend: -1 },  // near hand out in front of it
};

function ropePose(py, feet, footAng) {
  return p(STAND, Object.assign({ x: 50, y: py, spine: 90, head: 90 }, ROPE_HANDS, {
    footPtL: { x: feet[0], y: feet[1], bend: 1 },
    footPtR: { x: feet[2], y: feet[3], bend: 1 },
    footL: footAng, footR: footAng - 3,
  }));
}

const JR_GROUND = ropePose(57.4, [48.8, FLOOR, 51.2, FLOOR], 2);
const JR_AIR = ropePose(53.2, [49, 83.6, 51.2, 83.8], -35);
const JR_LAND = ropePose(58.2, [48.8, FLOOR, 51.2, FLOOR], 4);

const jump_rope = clip({
  id: 'jump_rope',
  duration: 1000,
  hero: 0.3,
  props: [{ type: 'band', x0: 41, y0: 52, x1: 60, y1: 50, sag: 72 }],
  keys: [
    { t: 0, pose: JR_GROUND },
    { t: 0.3, pose: JR_AIR, ease: 'out' },
    { t: 0.62, pose: JR_LAND, ease: 'in' },
    { t: 1, pose: JR_GROUND },
  ],
});

/* Running family. Arms are FK so the swing angles stay under control; the two
   legs are half a cycle apart, which is the whole read of the clip. */
function runPose(py, spine, rLeg, lLeg, rArm, lArm, feet) {
  return p(STAND, {
    x: 50, y: py, spine, head: spine,
    armL: lArm, armR: rArm,
    legL: lLeg, legR: rLeg,
    footL: feet[0], footR: feet[1],
  });
}

const ARM_FWD = [-55, 20];
const ARM_BACK = [-125, -95];
/* Two different mid-swing arms, so the two arms never sit on top of each other
   in the passing frames — one is on its way up, the other on its way down. */
const ARM_MID_UP = [-80, -20];
const ARM_MID_DOWN = [-100, -55];

const HK_R = runPose(57, 88, [-12, -78], [-93, -91], ARM_BACK, ARM_FWD, [2, -50]);
const HK_PASS_A = runPose(55.8, 88, [-62, -95], [-40, -75], ARM_MID_UP, ARM_MID_DOWN, [-20, -18]);
const HK_L = runPose(57, 88, [-93, -91], [-12, -78], ARM_FWD, ARM_BACK, [-50, 2]);
const HK_PASS_B = runPose(55.8, 88, [-40, -75], [-62, -95], ARM_MID_DOWN, ARM_MID_UP, [-18, -20]);

const high_knees = clip({
  id: 'high_knees',
  duration: 900,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: HK_R },
    { t: 0.25, pose: HK_PASS_A },
    { t: 0.5, pose: HK_L },
    { t: 0.75, pose: HK_PASS_B },
    { t: 1, pose: HK_R },
  ],
});

/* One running leg cycle: stance -> toe-off -> heel tucked under the seat at
   mid-swing -> reaching for the next contact. Folding the shin at mid-swing is
   what keeps the foot off the floor while the thigh swings through vertical. */
const JOG_R = runPose(57.6, 88, [-80, -100], [-45, -170], ARM_BACK, ARM_FWD, [-50, 2]);
const JOG_AIR_A = runPose(55.6, 88, [-115, -140], [-72, -95], ARM_MID_UP, ARM_MID_DOWN, [-8, -20]);
const JOG_L = runPose(57.6, 88, [-45, -170], [-80, -100], ARM_FWD, ARM_BACK, [2, -50]);
const JOG_AIR_B = runPose(55.6, 88, [-72, -95], [-115, -140], ARM_MID_DOWN, ARM_MID_UP, [-20, -8]);

const jog = clip({
  id: 'jog',
  duration: 1200,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: JOG_R },
    { t: 0.25, pose: JOG_AIR_A },
    { t: 0.5, pose: JOG_L },
    { t: 0.75, pose: JOG_AIR_B },
    { t: 1, pose: JOG_R },
  ],
});

/* Generic conditioning fallback — hard running in place: more forward lean,
   higher knee, bigger arm drive than the steady jog. */
const CON_R = runPose(56.8, 84, [-28, -80], [-96, -92], ARM_BACK, ARM_FWD, [2, -46]);
const CON_A = runPose(55.2, 84, [-70, -96], [-48, -78], ARM_MID_UP, ARM_MID_DOWN, [-22, -16]);
const CON_L = runPose(56.8, 84, [-96, -92], [-28, -80], ARM_FWD, ARM_BACK, [-46, 2]);
const CON_B = runPose(55.2, 84, [-48, -78], [-70, -96], ARM_MID_DOWN, ARM_MID_UP, [-16, -22]);

const conditioning = clip({
  id: 'conditioning',
  duration: 1000,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: CON_R },
    { t: 0.25, pose: CON_A },
    { t: 0.5, pose: CON_L },
    { t: 0.75, pose: CON_B },
    { t: 1, pose: CON_R },
  ],
});

/* ================================================================== *
 * 9. MOBILITY — slow, big ranges, 4000ms and up.
 * ================================================================== */

/* Standing hip circles: feet pinned, pelvis traces a circle, torso counter-
   tilts so the head stays over the middle. Hands ride on the hips. */
function hipCirclePose(px, py, spine) {
  return p(STAND, {
    x: px, y: py, spine, head: spine,
    handL: { x: px - 4.5, y: py - 3, bend: -1 },
    handR: { x: px + 4.5, y: py - 2.5, bend: -1 },
    footPtL: { x: 46.5, y: FLOOR, bend: 1 },
    footPtR: { x: 53.5, y: FLOOR, bend: 1 },
    footL: 2, footR: 2,
  });
}

const HC_FRONT = hipCirclePose(54, 57.5, 96);
const HC_SIDE_A = hipCirclePose(50, 56.8, 90);
const HC_BACK = hipCirclePose(46, 57.5, 84);
const HC_SIDE_B = hipCirclePose(50, 58.4, 90);

const hip_circle = clip({
  id: 'hip_circle',
  duration: 4200,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: HC_FRONT },
    { t: 0.25, pose: HC_SIDE_A },
    { t: 0.5, pose: HC_BACK },
    { t: 0.75, pose: HC_SIDE_B },
    { t: 1, pose: HC_FRONT },
  ],
});

/* Arm circles. The hands are driven around a circle centred on the shoulder as
   IK targets — a full revolution with no angle to wrap, so t:0 and t:1 are the
   same point and the loop is seamless. */
function armCircle(deg) {
  const r = (deg * Math.PI) / 180;
  return p(STAND, {
    handL: { x: 48.5 + 22.3 * Math.cos(r), y: 34.12 - 22.3 * Math.sin(r), bend: 1 },
    handR: { x: 50 + 22.9 * Math.cos(r), y: 34.12 - 22.9 * Math.sin(r), bend: 1 },
  });
}

const AC_DOWN = armCircle(-90);
const AC_FRONT = armCircle(0);
const AC_UP = armCircle(90);
const AC_BACK = armCircle(180);

const shoulder_circle = clip({
  id: 'shoulder_circle',
  duration: 4000,
  hero: 0.5,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: AC_DOWN },
    { t: 0.25, pose: AC_FRONT },
    { t: 0.5, pose: AC_UP },
    { t: 0.75, pose: AC_BACK },
    { t: 1, pose: AC_DOWN },
  ],
});

/* Deep squat hold — heels down, elbows inside the knees, slow rock in and out
   of the end range instead of a dead sit. */
function deepSquat(py, spine) {
  const base = p(SQUAT_BOTTOM, { x: 45, y: py, spine, head: spine + 16 });
  const [sx, sy] = shoulderOf(base);
  return p(base, {
    handL: { x: sx + 4.4, y: sy + 6.4, bend: -1 },
    handR: { x: sx + 5.6, y: sy + 7.2, bend: -1 },
  });
}

const DS_MID = deepSquat(71.5, 62);
const DS_TALL = deepSquat(70.6, 65);
const DS_LOW = deepSquat(72.2, 59);

const deep_squat_hold = clip({
  id: 'deep_squat_hold',
  duration: 4400,
  hero: 0,
  props: [],
  keys: [
    { t: 0, pose: DS_MID },
    { t: 0.32, pose: DS_TALL },
    { t: 0.68, pose: DS_LOW },
    { t: 1, pose: DS_MID },
  ],
});

/* Generic mobility fallback — reach tall, fold to the shins, roll back up.
   Slowest clip in the file on purpose. */
function foldPose(py, spine, head, hands) {
  return p(STAND, {
    x: 48 - (90 - spine) * 0.03, y: py, spine, head,
    handL: { x: hands[0], y: hands[1], bend: -1 },
    handR: { x: hands[2], y: hands[3], bend: -1 },
    footPtL: { x: 46.5, y: FLOOR, bend: 1 },
    footPtR: { x: 49.5, y: FLOOR, bend: 1 },
    footL: 2, footR: 2,
  });
}

const MOB_TALL = foldPose(57.4, 90, 90, [46, 12.5, 50.5, 12]);
const MOB_MID = foldPose(57.5, 50, 44, [76, 52, 77.5, 53]);
const MOB_FOLD = foldPose(57.6, 20, 6, [70, 72, 71.5, 72.8]);

const mobility = clip({
  id: 'mobility',
  duration: 5000,
  hero: 0.5,
  props: [],
  keys: [
    { t: 0, pose: MOB_TALL },
    { t: 0.3, pose: MOB_MID },
    { t: 0.5, pose: MOB_FOLD },
    { t: 0.75, pose: MOB_MID },
    { t: 1, pose: MOB_TALL },
  ],
});

/* ================================================================== *
 * 10. CARRIES — walk cycle with the legs half a phase apart, ribs
 * stacked, load hanging off straight arms.
 * ================================================================== */

function walkPose(py, feet, footAng) {
  return p(STAND, {
    x: 50, y: py, spine: 90, head: 90,
    footPtL: { x: feet[0], y: feet[1], bend: 1 },
    footPtR: { x: feet[2], y: feet[3], bend: 1 },
    footL: footAng[0], footR: footAng[1],
  });
}

const FC_CONTACT_R = sideLoad(walkPose(58.4, [41.5, FLOOR, 58.5, 87.4], [2, -2]), 22.7, 'kettlebell');
const FC_PASS_R = sideLoad(walkPose(57, [52.5, 82.5, 50.6, FLOOR], [-25, 2]), 22.7, 'kettlebell');
const FC_CONTACT_L = sideLoad(walkPose(58.4, [58.7, 87.4, 41.3, FLOOR], [-2, 2]), 22.7, 'kettlebell');
const FC_PASS_L = sideLoad(walkPose(57, [50.4, FLOOR, 52.8, 82.3], [2, -25]), 22.7, 'kettlebell');

const farmer_carry = clip({
  id: 'farmer_carry',
  duration: 2600,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: FC_CONTACT_R },
    { t: 0.25, pose: FC_PASS_R },
    { t: 0.5, pose: FC_CONTACT_L },
    { t: 0.75, pose: FC_PASS_L },
    { t: 1, pose: FC_CONTACT_R },
  ],
});

/* Generic carry fallback — shorter, busier stride than the loaded farmer walk. */
const CY_CONTACT_R = sideLoad(walkPose(58, [43, FLOOR, 57, 87.4], [2, -2]), 22.4, 'kettlebell');
const CY_PASS_R = sideLoad(walkPose(56.9, [51.8, 83.4, 50.5, FLOOR], [-22, 2]), 22.4, 'kettlebell');
const CY_CONTACT_L = sideLoad(walkPose(58, [57.2, 87.4, 42.8, FLOOR], [-2, 2]), 22.4, 'kettlebell');
const CY_PASS_L = sideLoad(walkPose(56.9, [50.3, FLOOR, 52, 83.2], [2, -22]), 22.4, 'kettlebell');

const carry = clip({
  id: 'carry',
  duration: 2400,
  hero: 0,
  ease: 'linear',
  props: [],
  keys: [
    { t: 0, pose: CY_CONTACT_R },
    { t: 0.25, pose: CY_PASS_R },
    { t: 0.5, pose: CY_CONTACT_L },
    { t: 0.75, pose: CY_PASS_L },
    { t: 1, pose: CY_CONTACT_R },
  ],
});

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const CORE_CLIPS = {
  // planks and anti-extension holds
  plank,
  forearm_plank,
  side_plank,
  core_antiextension,
  // hollow body
  hollow_hold,
  hollow_rock,
  // floor flexion
  crunch,
  situp,
  leg_raise,
  dead_bug,
  core_flexion,
  // rotation and anti-rotation
  russian_twist,
  pallof_press,
  core_rotation,
  // hanging
  hanging_knee_raise,
  hanging_leg_raise,
  toes_to_bar,
  // parallel-bar support
  l_sit,
  tuck_l_sit,
  // quadruped
  bird_dog,
  cat_cow,
  // conditioning
  mountain_climber,
  burpee,
  jumping_jack,
  jump_rope,
  high_knees,
  jog,
  conditioning,
  // mobility
  hip_circle,
  shoulder_circle,
  deep_squat_hold,
  mobility,
  // carries
  farmer_carry,
  carry,
};
