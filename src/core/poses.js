/*
 * poses.js — shared base poses + pose helpers.
 *
 * Clip authors should START from a base pose and override a few fields
 * rather than inventing every angle. `p(BASE, {...})` is the workhorse.
 *
 * Reminder (see rig.js): angles are degrees, math convention.
 *   90 = up, -90 = down, 0 = right (the direction the figure faces), 180 = left.
 * "L" limbs are the far side (drawn dim), "R" limbs are the near side.
 */

import { GROUND } from './rig.js';

/** Shallow-merge a base pose with overrides. Nested IK targets are replaced whole. */
export function p(base, over) {
  return Object.assign({}, base, over || {});
}

/** Mirror a pose's facing without touching its geometry. */
export function flipped(pose) {
  return p(pose, { flip: !pose.flip });
}

/** Convenience: an IK hand/foot target. */
export function at(x, y, bend) {
  return { x, y, bend: bend === undefined ? 1 : bend };
}

/* ------------------------------------------------------------------ *
 * Standing / upright
 * ------------------------------------------------------------------ */

export const STAND = {
  x: 50, y: 57, spine: 90, head: 90,
  armL: [-84, -86], armR: [-96, -94],
  legL: [-87, -89], legR: [-93, -91],
  footL: 2, footR: 2,
};

export const STAND_WIDE = p(STAND, {
  y: 55.5,
  legL: [-78, -95], legR: [-102, -85],
});

/** Arms overhead, body long. */
export const REACH_UP = p(STAND, {
  armL: [96, 92], armR: [84, 88],
});

/* ------------------------------------------------------------------ *
 * Squat family
 * ------------------------------------------------------------------ */

export const SQUAT_TOP = p(STAND, { y: 57, spine: 88 });

export const SQUAT_BOTTOM = {
  x: 45, y: 71.5, spine: 62, head: 78,
  armL: [10, 8], armR: [4, 2],
  footPtL: { x: 51, y: 87.5, bend: 1 },
  footPtR: { x: 53, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

export const SQUAT_PARALLEL = {
  x: 46.5, y: 66, spine: 70, head: 82,
  armL: [12, 6], armR: [6, 0],
  footPtL: { x: 51, y: 87.5, bend: 1 },
  footPtR: { x: 53, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* ------------------------------------------------------------------ *
 * Hinge family (deadlift / RDL / good morning)
 * ------------------------------------------------------------------ */

export const HINGE_TOP = p(STAND, { y: 57, spine: 88, armL: [-84, -88], armR: [-96, -92] });

export const HINGE_BOTTOM = {
  x: 46, y: 62, spine: 22, head: 12,
  armL: [-86, -88], armR: [-94, -92],
  footPtL: { x: 49, y: 87.5, bend: 1 },
  footPtR: { x: 51, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

/* ------------------------------------------------------------------ *
 * Lunge / split stance
 * ------------------------------------------------------------------ */

export const LUNGE_TOP = {
  x: 48, y: 57, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
  footPtL: { x: 36, y: 87.5, bend: 1 },
  footPtR: { x: 60, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

export const LUNGE_BOTTOM = {
  x: 48, y: 68, spine: 86, head: 86,
  armL: [-84, -86], armR: [-96, -94],
  // Rear foot is up on the toes, so its ankle sits above the floor.
  footPtL: { x: 34, y: 83.5, bend: 1 },
  footPtR: { x: 62, y: 87.5, bend: 1 },
  footL: -45, footR: 2,
};

/* ------------------------------------------------------------------ *
 * Prone / plank family — figure faces RIGHT, feet to the LEFT
 * ------------------------------------------------------------------ */

export const PLANK_TOP = {
  x: 36.4, y: 73, spine: 23, head: 15,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 58.5, y: 87.5, bend: -1 },
  legL: [-157, -157], legR: [-157, -157],
  footL: -30, footR: -30,
};

/* The toes stay planted through a push-up — the body pivots about them — so the
   bottom position pins the feet with IK instead of letting the legs swing down. */
export const PLANK_BOTTOM = p(PLANK_TOP, {
  x: 34, y: 79.5, spine: 21, head: 13,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 58.5, y: 87.5, bend: -1 },
  legL: undefined, legR: undefined,
  footPtL: { x: 8.3, y: 84.9, bend: -1 },
  footPtR: { x: 9.3, y: 84.9, bend: -1 },
  footL: -30, footR: -30,
});

/** Forearm plank / hollow-adjacent hold. */
export const FOREARM_PLANK = p(PLANK_TOP, {
  x: 35, y: 76, spine: 20, head: 12,
  handL: { x: 62, y: 87.5, bend: -1 },
  handR: { x: 63, y: 87.5, bend: -1 },
  legL: undefined, legR: undefined,
  footPtL: { x: 8.3, y: 84.4, bend: -1 },
  footPtR: { x: 9.3, y: 84.4, bend: -1 },
  footL: -28, footR: -28,
});

/* ------------------------------------------------------------------ *
 * Supine / floor
 * ------------------------------------------------------------------ */

export const SUPINE = {
  x: 42, y: 85, spine: 8, head: 20,
  armL: [-6, -4], armR: [-2, 0],
  legL: [178, 178], legR: [178, 178],
  footL: 70, footR: 70,
};

/** Hollow body hold — shoulders and legs both off the floor, lower back pressed down. */
export const HOLLOW = {
  x: 46, y: 84, spine: 26, head: 32,
  armL: [46, 44], armR: [40, 38],
  legL: [171, 174], legR: [169, 172],
  footL: 150, footR: 150,
};

/* Head to the LEFT, knees up on the RIGHT, shoulders staying on the floor as
   the pelvis rises. Spine swings 176 -> 203 so the shoulders hold their height. */
export const GLUTE_BRIDGE_DOWN = {
  x: 48, y: 85.5, spine: 176, head: 150,
  armL: [184, 179], armR: [188, 183],
  footPtL: { x: 66, y: 87.5, bend: 1 },
  footPtR: { x: 68, y: 87.5, bend: 1 },
  footL: 0, footR: 0,
};

export const GLUTE_BRIDGE_UP = p(GLUTE_BRIDGE_DOWN, {
  x: 48, y: 76, spine: 203, head: 150,
  footPtL: { x: 66, y: 87.5, bend: 1 },
  footPtR: { x: 68, y: 87.5, bend: 1 },
});

/* ------------------------------------------------------------------ *
 * Hanging — ALWAYS pair these with `ground: false` in the clip,
 * because the feet legitimately hang below the floor line.
 * ------------------------------------------------------------------ */

export const BAR_Y = 15;

export const HANG = {
  x: 50, y: 61, spine: 90, head: 90,
  handL: { x: 47, y: BAR_Y, bend: 1 },
  handR: { x: 53, y: BAR_Y, bend: 1 },
  legL: [-88, -90], legR: [-92, -90],
  footL: 0, footR: 0,
};

export const PULLUP_TOP = p(HANG, {
  y: 50,
  handL: { x: 47, y: BAR_Y, bend: 1 },
  handR: { x: 53, y: BAR_Y, bend: 1 },
  legL: [-84, -96], legR: [-96, -84],
});

export const HANG_TUCK = p(HANG, {
  legL: [-30, -120], legR: [-34, -124],
  footL: -30, footR: -30,
});

export const HANG_LRAISE = p(HANG, {
  legL: [2, 0], legR: [-2, -4],
  footL: 60, footR: 60,
});

/* ------------------------------------------------------------------ *
 * Dips / support
 * ------------------------------------------------------------------ */

/* Knees bent with the feet tucked up behind, which is how dips are actually
   held and what keeps the legs on canvas at the bottom. */
export const DIP_TOP = {
  x: 50, y: 62, spine: 86, head: 84,
  handL: { x: 47, y: 40, bend: -1 },
  handR: { x: 53, y: 40, bend: -1 },
  legL: [-45, 165], legR: [-49, 161],
  footL: -120, footR: -120,
};

export const DIP_BOTTOM = p(DIP_TOP, {
  x: 51, y: 73, spine: 80, head: 76,
  handL: { x: 47, y: 40, bend: -1 },
  handR: { x: 53, y: 40, bend: -1 },
  legL: [-40, 170], legR: [-44, 166],
});

/* ------------------------------------------------------------------ *
 * Inverted / handstand
 * ------------------------------------------------------------------ */

export const HANDSTAND = {
  x: 50, y: 42, spine: -90, head: -90,
  handL: { x: 47.5, y: 87.5, bend: 1 },
  handR: { x: 52.5, y: 87.5, bend: 1 },
  legL: [91, 90], legR: [89, 90],
  footL: 178, footR: 178,
};

export const PIKE = {
  x: 44, y: 60, spine: -20, head: -34,
  handL: { x: 68, y: 87.5, bend: -1 },
  handR: { x: 70, y: 87.5, bend: -1 },
  footPtL: { x: 24, y: 87.5, bend: 1 },
  footPtR: { x: 26, y: 87.5, bend: 1 },
  footL: -30, footR: -30,
};

/* ------------------------------------------------------------------ *
 * Seated / kneeling
 * ------------------------------------------------------------------ */

export const SEATED = {
  x: 47, y: 68, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
  legL: [-6, -86], legR: [-10, -90],
  footL: 2, footR: 2,
};

/* Knees on the floor, shins flat, toes pointing back — the start of a
   nordic curl and the base for every kneeling drill. */
export const KNEELING = {
  x: 50, y: 72, spine: 90, head: 90,
  armL: [-84, -86], armR: [-96, -94],
  legL: [-90, 180], legR: [-94, 176],
  footL: 170, footR: 170,
};

/* ------------------------------------------------------------------ *
 * Easing
 * ------------------------------------------------------------------ */

export const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

export { GROUND };
