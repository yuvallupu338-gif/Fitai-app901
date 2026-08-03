/*
 * clips.upper.js — animation clips for every upper-body movement.
 *
 * Coordinates, angles and IK all follow src/core/rig.js:
 *   viewBox 0..100, ground at y = 88, angles in math convention
 *   (0 = right / the way the figure faces, 90 = up, -90 = down).
 * Poses are composed from src/core/poses.js with p(BASE, {overrides}) so a clip
 * only states what actually changes.
 *
 * House rules used throughout this file:
 *   - Anything touching the floor, a bar, a bench or a ring is pinned with an IK
 *     target ({x, y, bend}); free limbs use the FK [proximal, distal] arrays.
 *   - Whatever a limb uses at t:0 it uses at every key of the same clip —
 *     lerpPose() keeps a key that only one side defines, so mixing FK and IK on
 *     one limb inside a clip freezes it.
 *   - The t:1 key reuses the t:0 pose OBJECT so the loop closes exactly.
 *   - Hanging clips set ground:false; their feet legitimately drop below y=88.
 */

import {
  p,
  PLANK_TOP,
  PLANK_BOTTOM,
  PIKE,
  HANDSTAND,
  HANG,
  PULLUP_TOP,
  DIP_TOP,
  STAND,
  SEATED,
} from '../core/poses.js';

/* ================================================================== *
 * 1. PUSH-UP FAMILY
 * The hands never leave the floor at y = 87.5; the body pivots about the
 * toes. Grip width is the only thing that changes between variants.
 * ================================================================== */

/* --- standard push-up ------------------------------------------------ */

const PU_TOP = PLANK_TOP;
const PU_BOTTOM = PLANK_BOTTOM;
const PU_PAUSE = p(PLANK_BOTTOM, { x: 34.3, y: 79.1, spine: 21.5, head: 13.5 });

const pushup = {
  id: 'pushup',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PU_TOP },
    { t: 0.42, pose: PU_BOTTOM },
    { t: 0.54, pose: PU_PAUSE },
    { t: 1, pose: PU_TOP },
  ],
};

/* --- knees down: the pivot moves from the toes to the knees ---------- */

const KPU_TOP = {
  x: 36, y: 75.5, spine: 26, head: 18,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 58.5, y: 87.5, bend: -1 },
  legL: [-140, 155], legR: [-144, 151],
  footL: 190, footR: 190,
};

const KPU_BOTTOM = p(KPU_TOP, {
  x: 36.4, y: 78.2, spine: 18, head: 10,
  legL: [-149, 146], legR: [-153, 142],
});

const KPU_PAUSE = p(KPU_BOTTOM, { y: 77.9, spine: 18.5, head: 10.5 });

const knee_pushup = {
  id: 'knee_pushup',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [{ type: 'mat', x: 40, w: 62 }],
  keys: [
    { t: 0, pose: KPU_TOP },
    { t: 0.42, pose: KPU_BOTTOM },
    { t: 0.54, pose: KPU_PAUSE },
    { t: 1, pose: KPU_TOP },
  ],
};

/* --- hands elevated on a box: the easiest loaded angle --------------- */

const IPU_TOP = {
  x: 34.4, y: 70.8, spine: 46, head: 38,
  handL: { x: 60, y: 74.2, bend: -1 },
  handR: { x: 62, y: 74.2, bend: -1 },
  footPtL: { x: 19, y: 84.5, bend: -1 },
  footPtR: { x: 20.5, y: 84.5, bend: -1 },
  footL: -35, footR: -35,
};

const IPU_BOTTOM = p(IPU_TOP, { x: 36.9, y: 74.3, spine: 34, head: 26 });
const IPU_PAUSE = p(IPU_BOTTOM, { x: 36.6, y: 73.9, spine: 35, head: 27 });

const incline_pushup = {
  id: 'incline_pushup',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [{ type: 'box', x: 66, y: 75, w: 24, h: 13 }],
  keys: [
    { t: 0, pose: IPU_TOP },
    { t: 0.42, pose: IPU_BOTTOM },
    { t: 0.54, pose: IPU_PAUSE },
    { t: 1, pose: IPU_TOP },
  ],
};

/* --- feet elevated: more load on the shoulders ----------------------- */

const DPU_TOP = {
  x: 35, y: 68, spine: 10, head: 3,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 58.5, y: 87.5, bend: -1 },
  footPtL: { x: 12, y: 73, bend: -1 },
  footPtR: { x: 13.5, y: 73, bend: -1 },
  footL: -149, footR: -149,
};

const DPU_BOTTOM = p(DPU_TOP, { x: 33, y: 74, spine: 8, head: 1 });
const DPU_PAUSE = p(DPU_BOTTOM, { x: 33.2, y: 73.6, spine: 8.5, head: 1.5 });

const decline_pushup = {
  id: 'decline_pushup',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'box', x: 14, y: 76, w: 22, h: 12 }],
  keys: [
    { t: 0, pose: DPU_TOP },
    { t: 0.44, pose: DPU_BOTTOM },
    { t: 0.56, pose: DPU_PAUSE },
    { t: 1, pose: DPU_TOP },
  ],
};

/* --- diamond: hands together under the sternum, elbows glued in ------ */

const DIA_TOP = p(PLANK_TOP, {
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 57.5, y: 87.5, bend: -1 },
});

const DIA_BOTTOM = p(PLANK_BOTTOM, {
  x: 33.6, y: 80,
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 57.5, y: 87.5, bend: -1 },
});

const DIA_PAUSE = p(DIA_BOTTOM, { x: 33.9, y: 79.6, spine: 21.5, head: 13.5 });

const diamond_pushup = {
  id: 'diamond_pushup',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: DIA_TOP },
    { t: 0.44, pose: DIA_BOTTOM },
    { t: 0.58, pose: DIA_PAUSE },
    { t: 1, pose: DIA_TOP },
  ],
};

/* --- archer: the torso slides over the working (near) hand ----------- */

const ARC_TOP = {
  x: 39.4, y: 73.9, spine: 19, head: 11,
  handL: { x: 70, y: 87.5, bend: -1 },
  handR: { x: 52, y: 87.5, bend: -1 },
  footPtL: { x: 12, y: 84.9, bend: -1 },
  footPtR: { x: 13, y: 84.9, bend: -1 },
  footL: -30, footR: -30,
};

const ARC_BOTTOM = p(ARC_TOP, { x: 31.1, y: 78.7, spine: 17, head: 9 });
const ARC_PAUSE = p(ARC_BOTTOM, { x: 31.6, y: 78.2, spine: 17.5, head: 9.5 });

const archer_pushup = {
  id: 'archer_pushup',
  duration: 3200,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: ARC_TOP },
    { t: 0.44, pose: ARC_BOTTOM },
    { t: 0.58, pose: ARC_PAUSE },
    { t: 1, pose: ARC_TOP },
  ],
};

/* --- pseudo planche: hands by the waist, shoulders way past them ----- */

const PPP_TOP = {
  x: 34.5, y: 74.8, spine: 20, head: 12,
  handL: { x: 46, y: 87.5, bend: -1 },
  handR: { x: 48, y: 87.5, bend: -1 },
  footPtL: { x: 7, y: 84.5, bend: -1 },
  footPtR: { x: 8, y: 84.5, bend: -1 },
  footL: -30, footR: -30,
};

const PPP_BOTTOM = p(PPP_TOP, { x: 36, y: 80.3, spine: 16, head: 8 });
const PPP_PAUSE = p(PPP_BOTTOM, { x: 35.8, y: 79.9, spine: 16.5, head: 8.5 });

const pseudo_planche_pushup = {
  id: 'pseudo_planche_pushup',
  duration: 3200,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PPP_TOP },
    { t: 0.46, pose: PPP_BOTTOM },
    { t: 0.6, pose: PPP_PAUSE },
    { t: 1, pose: PPP_TOP },
  ],
};

/* --- pike push-up: hips stay high, the head travels to the floor ----- */

const PIKE_TOP = p(PIKE, {
  footPtL: { x: 31, y: 86, bend: 1 },
  footPtR: { x: 33, y: 86, bend: 1 },
  footL: -20, footR: -20,
});

const PIKE_BOTTOM = p(PIKE_TOP, { x: 46.6, y: 59.9, spine: -32, head: -46 });
const PIKE_PAUSE = p(PIKE_BOTTOM, { x: 46.2, y: 59.9, spine: -31, head: -45 });

const pike_pushup = {
  id: 'pike_pushup',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: PIKE_TOP },
    { t: 0.44, pose: PIKE_BOTTOM },
    { t: 0.58, pose: PIKE_PAUSE },
    { t: 1, pose: PIKE_TOP },
  ],
};

/* --- feet on a box: nearly vertical pressing ------------------------- */

const EPP_TOP = {
  x: 40, y: 54, spine: -35, head: -50,
  handL: { x: 64, y: 87.5, bend: 1 },
  handR: { x: 66, y: 87.5, bend: 1 },
  footPtL: { x: 18, y: 72.5, bend: 1 },
  footPtR: { x: 20, y: 72.5, bend: 1 },
  footL: -160, footR: -160,
};

const EPP_BOTTOM = p(EPP_TOP, { x: 43.8, y: 57.8, spine: -45, head: -60 });
const EPP_PAUSE = p(EPP_BOTTOM, { x: 43.5, y: 57.4, spine: -44, head: -59 });

const elevated_pike_pushup = {
  id: 'elevated_pike_pushup',
  duration: 2900,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'box', x: 20, y: 74, w: 22, h: 14 }],
  keys: [
    { t: 0, pose: EPP_TOP },
    { t: 0.46, pose: EPP_BOTTOM },
    { t: 0.6, pose: EPP_PAUSE },
    { t: 1, pose: EPP_TOP },
  ],
};

/* ================================================================== *
 * 2. HANDSTAND FAMILY
 * Hands pinned to the floor, the body inverted. Holds still breathe.
 * ================================================================== */

const HS_A = HANDSTAND;
const HS_B = p(HANDSTAND, { x: 50.9, spine: -88.5, head: -88.5, legL: [92.5, 91], legR: [90.5, 91] });
const HS_C = p(HANDSTAND, { x: 49.3, spine: -91.5, head: -91.5, legL: [89.5, 89], legR: [87.5, 89] });

const handstand_hold = {
  id: 'handstand_hold',
  duration: 4200,
  ground: true,
  hero: 0,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: HS_A },
    { t: 0.3, pose: HS_B },
    { t: 0.62, pose: HS_C },
    { t: 1, pose: HS_A },
  ],
};

/* Back to the wall: the heels rest on it, so the body leans a few degrees. */

const WHS_A = {
  x: 48, y: 42, spine: -97, head: -97,
  handL: { x: 44, y: 87.5, bend: -1 },
  handR: { x: 46, y: 87.5, bend: -1 },
  legL: [83, 84], legR: [81, 84],
  footL: 0, footR: 0,
};

const WHS_B = p(WHS_A, { x: 48.7, spine: -95.5, head: -95.5, legL: [84.5, 85], legR: [82.5, 85] });
const WHS_C = p(WHS_A, { x: 47.4, spine: -98.5, head: -98.5, legL: [81.5, 83], legR: [79.5, 83] });

const wall_handstand = {
  id: 'wall_handstand',
  duration: 4200,
  ground: true,
  hero: 0,
  ease: 'inOut',
  props: [{ type: 'wall', x: 58, y0: 6, y1: 88 }],
  keys: [
    { t: 0, pose: WHS_A },
    { t: 0.34, pose: WHS_B },
    { t: 0.66, pose: WHS_C },
    { t: 1, pose: WHS_A },
  ],
};

/* Handstand push-up: hands pinned, the whole body drops until the head
   brushes the floor between them, then presses back to lockout. */

const HSPU_TOP = WHS_A;
const HSPU_BOTTOM = p(WHS_A, { x: 48.3, y: 49.8 });
const HSPU_PAUSE = p(WHS_A, { x: 48.3, y: 49.2 });

const handstand_pushup = {
  id: 'handstand_pushup',
  duration: 3200,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'wall', x: 58, y0: 6, y1: 88 }],
  keys: [
    { t: 0, pose: HSPU_TOP },
    { t: 0.46, pose: HSPU_BOTTOM },
    { t: 0.58, pose: HSPU_PAUSE },
    { t: 1, pose: HSPU_TOP },
  ],
};

export const UPPER_CLIPS = Object.assign({}, {
  pushup,
  knee_pushup,
  incline_pushup,
  decline_pushup,
  diamond_pushup,
  archer_pushup,
  pseudo_planche_pushup,
  pike_pushup,
  elevated_pike_pushup,
  handstand_hold,
  wall_handstand,
  handstand_pushup,
});
/* __TAIL__ */
