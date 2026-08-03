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

/* ================================================================== *
 * 3. DIPS
 * Hands pinned on the bars, knees tucked back — the whole body hangs
 * between the hands, so the feet never reach the floor.
 * ================================================================== */

const DIP_A = p(DIP_TOP, {
  x: 48.4, y: 56.33, spine: 86, head: 84,
  handL: { x: 46, y: 56, bend: -1 },
  handR: { x: 54, y: 56, bend: -1 },
});

const DIP_B = p(DIP_A, {
  x: 45.74, y: 63.38, spine: 78, head: 74,
  legL: [-40, 170], legR: [-44, 166],
});

const DIP_C = p(DIP_B, { x: 46.1, y: 62.6, spine: 79, head: 75 });

const dip_bars = {
  id: 'dip_bars',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'dipbars', x: 50, y: 56, w: 26, gap: 6 }],
  keys: [
    { t: 0, pose: DIP_A },
    { t: 0.44, pose: DIP_B },
    { t: 0.56, pose: DIP_C },
    { t: 1, pose: DIP_A },
  ],
};

/* Rings add a little wobble: the hands drift apart under load. */

const RDIP_A = p(DIP_TOP, {
  x: 48.4, y: 56.33, spine: 86, head: 84,
  handL: { x: 46.5, y: 56, bend: -1 },
  handR: { x: 53.5, y: 56, bend: -1 },
});

const RDIP_B = p(RDIP_A, {
  x: 47.6, y: 60, spine: 82, head: 79,
  handL: { x: 46, y: 56.2, bend: -1 },
  handR: { x: 54, y: 56.2, bend: -1 },
});

const RDIP_C = p(RDIP_A, {
  x: 45.9, y: 63.38, spine: 78, head: 74,
  handL: { x: 45.6, y: 56.5, bend: -1 },
  handR: { x: 54.4, y: 56.5, bend: -1 },
  legL: [-40, 170], legR: [-44, 166],
});

const RDIP_D = p(RDIP_C, { x: 46.4, y: 62.5, spine: 79, head: 75 });

const ring_dip = {
  id: 'ring_dip',
  duration: 3000,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'rings', x: 50, y: 56, w: 7, y0: 6 }],
  keys: [
    { t: 0, pose: RDIP_A },
    { t: 0.24, pose: RDIP_B },
    { t: 0.46, pose: RDIP_C },
    { t: 0.58, pose: RDIP_D },
    { t: 1, pose: RDIP_A },
  ],
};

/* Bench dip: hands behind on the bench, heels out in front on the floor. */

const BDIP_A = {
  x: 36.61, y: 70.25, spine: 84, head: 82,
  handL: { x: 33, y: 69, bend: -1 },
  handR: { x: 35, y: 69, bend: -1 },
  footPtL: { x: 60, y: 84.5, bend: 1 },
  footPtR: { x: 62, y: 84.5, bend: 1 },
  footL: 20, footR: 20,
};

const BDIP_B = p(BDIP_A, { x: 36.03, y: 77.53, spine: 80, head: 78 });
const BDIP_C = p(BDIP_B, { x: 36.2, y: 76.8, spine: 80.5, head: 78.5 });

const bench_dip = {
  id: 'bench_dip',
  duration: 2600,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'bench', x: 24, y: 70, w: 26, h: 6 }],
  keys: [
    { t: 0, pose: BDIP_A },
    { t: 0.44, pose: BDIP_B },
    { t: 0.56, pose: BDIP_C },
    { t: 1, pose: BDIP_A },
  ],
};

/* ================================================================== *
 * 4. SUPINE PRESSING — figure lies along the bench, head to the right.
 * The load lives on the pose (`load`), never in the props.
 * ================================================================== */

const BENCH_PROP = { type: 'bench', x: 54, y: 74, w: 44, h: 6 };

/* Shared supine chassis: back on the pad, both feet planted on the floor. */
const SUPINE_BENCH = {
  x: 40, y: 72, spine: 8, head: 14,
  footPtL: { x: 26, y: 87.5, bend: -1 },
  footPtR: { x: 28, y: 87.5, bend: -1 },
  footL: 2, footR: 2,
};

const BP_LOCK = p(SUPINE_BENCH, {
  load: 'barbell',
  handL: { x: 61, y: 46, bend: 1 },
  handR: { x: 63, y: 46, bend: 1 },
});

const BP_CHEST = p(BP_LOCK, {
  handL: { x: 57, y: 58, bend: 1 },
  handR: { x: 59, y: 58, bend: 1 },
});

const BP_PAUSE = p(BP_LOCK, {
  handL: { x: 57.4, y: 57.4, bend: 1 },
  handR: { x: 59.4, y: 57.4, bend: 1 },
});

const bench_press = {
  id: 'bench_press',
  duration: 3200,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [BENCH_PROP],
  keys: [
    { t: 0, pose: BP_LOCK },
    { t: 0.44, pose: BP_CHEST },
    { t: 0.56, pose: BP_PAUSE },
    { t: 1, pose: BP_LOCK },
  ],
};

const CG_LOCK = p(SUPINE_BENCH, {
  load: 'barbell',
  handL: { x: 61, y: 47, bend: 1 },
  handR: { x: 62.5, y: 47, bend: 1 },
});

const CG_CHEST = p(CG_LOCK, {
  handL: { x: 56, y: 60, bend: 1 },
  handR: { x: 57.5, y: 60, bend: 1 },
});

const CG_PAUSE = p(CG_LOCK, {
  handL: { x: 56.4, y: 59.4, bend: 1 },
  handR: { x: 57.9, y: 59.4, bend: 1 },
});

const close_grip_bench = {
  id: 'close_grip_bench',
  duration: 3000,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [BENCH_PROP],
  keys: [
    { t: 0, pose: CG_LOCK },
    { t: 0.44, pose: CG_CHEST },
    { t: 0.56, pose: CG_PAUSE },
    { t: 1, pose: CG_LOCK },
  ],
};

const DBP_LOCK = p(SUPINE_BENCH, {
  load: 'dumbbell',
  handL: { x: 60, y: 47, bend: 1 },
  handR: { x: 63, y: 46, bend: 1 },
});

const DBP_CHEST = p(DBP_LOCK, {
  handL: { x: 55, y: 59, bend: 1 },
  handR: { x: 58, y: 58, bend: 1 },
});

const DBP_PAUSE = p(DBP_LOCK, {
  handL: { x: 55.4, y: 58.4, bend: 1 },
  handR: { x: 58.4, y: 57.4, bend: 1 },
});

const db_bench_press = {
  id: 'db_bench_press',
  duration: 3200,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [BENCH_PROP],
  keys: [
    { t: 0, pose: DBP_LOCK },
    { t: 0.44, pose: DBP_CHEST },
    { t: 0.56, pose: DBP_PAUSE },
    { t: 1, pose: DBP_LOCK },
  ],
};

/* Fly: elbows stay softly bent, the arms sweep wide instead of pressing. */

const FLY_TOP = p(SUPINE_BENCH, {
  load: 'dumbbell',
  handL: { x: 60, y: 48, bend: 1 },
  handR: { x: 62, y: 47, bend: 1 },
});

const FLY_MID = p(FLY_TOP, {
  handL: { x: 52, y: 57, bend: 1 },
  handR: { x: 69, y: 55, bend: 1 },
});

const FLY_WIDE = p(FLY_TOP, {
  handL: { x: 44, y: 65, bend: 1 },
  handR: { x: 78, y: 62, bend: 1 },
});

const db_fly = {
  id: 'db_fly',
  duration: 3000,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [BENCH_PROP],
  keys: [
    { t: 0, pose: FLY_TOP },
    { t: 0.26, pose: FLY_MID },
    { t: 0.5, pose: FLY_WIDE },
    { t: 0.74, pose: FLY_MID },
    { t: 1, pose: FLY_TOP },
  ],
};

/* Skullcrusher: the upper arm stays vertical, only the forearm moves. */

const SKULL_LOCK = p(SUPINE_BENCH, {
  load: 'barbell',
  handL: { x: 61, y: 46, bend: 1 },
  handR: { x: 63, y: 46, bend: 1 },
});

const SKULL_DOWN = p(SKULL_LOCK, {
  handL: { x: 70, y: 54, bend: 1 },
  handR: { x: 72, y: 54, bend: 1 },
});

const SKULL_PAUSE = p(SKULL_LOCK, {
  handL: { x: 69.4, y: 53.4, bend: 1 },
  handR: { x: 71.4, y: 53.4, bend: 1 },
});

const skullcrusher = {
  id: 'skullcrusher',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [BENCH_PROP],
  keys: [
    { t: 0, pose: SKULL_LOCK },
    { t: 0.44, pose: SKULL_DOWN },
    { t: 0.56, pose: SKULL_PAUSE },
    { t: 1, pose: SKULL_LOCK },
  ],
};

/* Incline press: reclined ~50deg, head up-back, chest facing up-forward. */

const INC_BASE = {
  x: 52, y: 74, spine: 130, head: 124,
  footPtL: { x: 70, y: 87.5, bend: 1 },
  footPtR: { x: 72, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
  load: 'dumbbell',
};

const INC_LOCK = p(INC_BASE, {
  handL: { x: 54, y: 42, bend: -1 },
  handR: { x: 55, y: 40, bend: -1 },
});

const INC_BOTTOM = p(INC_BASE, {
  handL: { x: 48, y: 50, bend: -1 },
  handR: { x: 50, y: 49, bend: -1 },
});

const INC_PAUSE = p(INC_BASE, {
  handL: { x: 48.4, y: 49.4, bend: -1 },
  handR: { x: 50.4, y: 48.4, bend: -1 },
});

const incline_db_press = {
  id: 'incline_db_press',
  duration: 3200,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    { type: 'bench', x: 60, y: 76, w: 26, h: 5 },
    { type: 'box', x: 36, y: 68, w: 16, h: 20 },
  ],
  keys: [
    { t: 0, pose: INC_LOCK },
    { t: 0.44, pose: INC_BOTTOM },
    { t: 0.56, pose: INC_PAUSE },
    { t: 1, pose: INC_LOCK },
  ],
};

/* Seated machine press: back supported, handles travel straight forward. */

const MCP_BACK = p(SEATED, {
  x: 44, y: 70,
  handL: { x: 56, y: 50, bend: -1 },
  handR: { x: 58, y: 49, bend: -1 },
});

const MCP_OUT = p(MCP_BACK, {
  handL: { x: 66, y: 48, bend: -1 },
  handR: { x: 68, y: 47.5, bend: -1 },
});

const MCP_HOLD = p(MCP_BACK, {
  handL: { x: 65.4, y: 48.2, bend: -1 },
  handR: { x: 67.4, y: 47.7, bend: -1 },
});

const machine_chest_press = {
  id: 'machine_chest_press',
  duration: 2800,
  ground: true,
  hero: 0.5,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 78, y: 36, w: 18, h: 36 },
    { type: 'bench', x: 44, y: 72, w: 22, h: 5 },
  ],
  keys: [
    { t: 0, pose: MCP_BACK },
    { t: 0.4, pose: MCP_OUT },
    { t: 0.52, pose: MCP_HOLD },
    { t: 1, pose: MCP_BACK },
  ],
};

/* ================================================================== *
 * 5. OVERHEAD PRESSING
 * ================================================================== */

const OHP_RACK = p(STAND, {
  load: 'barbell',
  handL: { x: 52, y: 42, bend: 1 },
  handR: { x: 54, y: 42, bend: 1 },
  head: 90,
});

const OHP_MID = p(OHP_RACK, {
  handL: { x: 51, y: 24, bend: 1 },
  handR: { x: 53, y: 24, bend: 1 },
  head: 98,
});

const OHP_LOCK = p(OHP_RACK, {
  handL: { x: 49, y: 12, bend: 1 },
  handR: { x: 51, y: 12, bend: 1 },
  head: 88,
});

const OHP_HOLD = p(OHP_LOCK, {
  handL: { x: 49, y: 12.6, bend: 1 },
  handR: { x: 51, y: 12.6, bend: 1 },
});

const overhead_press = {
  id: 'overhead_press',
  duration: 3000,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: OHP_RACK },
    { t: 0.24, pose: OHP_MID },
    { t: 0.42, pose: OHP_LOCK },
    { t: 0.54, pose: OHP_HOLD },
    { t: 1, pose: OHP_RACK },
  ],
};

const DBSP_RACK = p(STAND, {
  load: 'dumbbell',
  handL: { x: 54, y: 44, bend: 1 },
  handR: { x: 56, y: 43, bend: 1 },
  head: 90,
});

const DBSP_MID = p(DBSP_RACK, {
  handL: { x: 53, y: 25, bend: 1 },
  handR: { x: 55, y: 24, bend: 1 },
});

const DBSP_LOCK = p(DBSP_RACK, {
  handL: { x: 48, y: 14, bend: 1 },
  handR: { x: 52, y: 13, bend: 1 },
});

const DBSP_HOLD = p(DBSP_LOCK, {
  handL: { x: 48, y: 14.6, bend: 1 },
  handR: { x: 52, y: 13.6, bend: 1 },
});

const db_shoulder_press = {
  id: 'db_shoulder_press',
  duration: 3000,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: DBSP_RACK },
    { t: 0.24, pose: DBSP_MID },
    { t: 0.42, pose: DBSP_LOCK },
    { t: 0.54, pose: DBSP_HOLD },
    { t: 1, pose: DBSP_RACK },
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
  dip_bars,
  ring_dip,
  bench_dip,
  bench_press,
  close_grip_bench,
  db_bench_press,
  db_fly,
  skullcrusher,
  incline_db_press,
  machine_chest_press,
  overhead_press,
  db_shoulder_press,
});
/* __TAIL__ */
