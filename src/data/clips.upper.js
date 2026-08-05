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
import { repKeys } from '../core/anim.js';


/* ================================================================== *
 * 1. PUSH-UP FAMILY
 * The hands never leave the floor at y = 87.5; the body pivots about the
 * toes. Grip width is the only thing that changes between variants.
 * ================================================================== */

/* --- standard push-up ------------------------------------------------ */

/*
 * The top of a push-up, with the TOES PINNED rather than the legs posed by
 * angle. PLANK_TOP poses them by angle and PLANK_BOTTOM pins them, so every
 * clip built from the pair mixed the two representations on one limb —
 * lerpPose cannot blend an angle pair against an IK target, so it hard-swaps at
 * the halfway mark and both legs teleport. The targets below are exactly where
 * PLANK_TOP's angles already put the ankles, so nothing about the picture
 * changes; only how it blends.
 */
const PLANK_TOES = {
  legL: undefined, legR: undefined,
  footPtL: { x: 8.3, y: 84.9, bend: -1 },
  footPtR: { x: 9.3, y: 84.9, bend: -1 },
};
const PU_TOP = p(PLANK_TOP, Object.assign({ x: 36.2, y: 73.2 }, PLANK_TOES));
const PU_BOTTOM = PLANK_BOTTOM;
const PU_PAUSE = p(PLANK_BOTTOM, { x: 34.3, y: 79.1, spine: 21.5, head: 13.5 });

const pushup = {
  id: 'pushup',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: repKeys(PU_TOP, PU_BOTTOM, PU_PAUSE, { lag: 1.4 }),
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
  keys: repKeys(KPU_TOP, KPU_BOTTOM, KPU_PAUSE, { lag: 1.2 }),
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
  keys: repKeys(IPU_TOP, IPU_BOTTOM, IPU_PAUSE, { lag: 1.2 }),
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
  keys: repKeys(DPU_TOP, DPU_BOTTOM, DPU_PAUSE, { lag: 1.4 }),
};

/* --- diamond: hands together under the sternum, elbows glued in ------ */

const DIA_TOP = p(PLANK_TOP, Object.assign({ x: 36.2, y: 73.2 }, PLANK_TOES, {
  handL: { x: 56.5, y: 87.5, bend: -1 },
  handR: { x: 57.5, y: 87.5, bend: -1 },
}));

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
  keys: repKeys(DIA_TOP, DIA_BOTTOM, DIA_PAUSE, { lag: 1.2 }),
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
  keys: repKeys(ARC_TOP, ARC_BOTTOM, ARC_PAUSE, { lag: 1.4 }),
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
  keys: repKeys(PPP_TOP, PPP_BOTTOM, PPP_PAUSE, { lag: 1.2 }),
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
  keys: repKeys(PIKE_TOP, PIKE_BOTTOM, PIKE_PAUSE, { lag: 1.6 }),
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
  keys: repKeys(EPP_TOP, EPP_BOTTOM, EPP_PAUSE, { lag: 1.6 }),
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
  keys: repKeys(HSPU_TOP, HSPU_BOTTOM, HSPU_PAUSE, { lag: 1.2 }),
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
  keys: repKeys(DIP_A, DIP_B, DIP_C, { lag: 1.6, arc: 1.6 }),
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
  keys: repKeys(BDIP_A, BDIP_B, BDIP_C, { lag: 1.2 }),
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
  keys: repKeys(BP_LOCK, BP_CHEST, BP_PAUSE, { arc: 2.2 }),
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
  keys: repKeys(CG_LOCK, CG_CHEST, CG_PAUSE, { arc: 1.6 }),
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
  keys: repKeys(DBP_LOCK, DBP_CHEST, DBP_PAUSE, { arc: 2.0 }),
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
  keys: repKeys(SKULL_LOCK, SKULL_DOWN, SKULL_PAUSE, { arc: 1.4 }),
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
  handR: { x: 55.5, y: 42.5, bend: -1 },
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
  keys: repKeys(INC_LOCK, INC_BOTTOM, INC_PAUSE, { arc: 1.8 }),
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
  keys: repKeys(MCP_BACK, MCP_OUT, MCP_HOLD, { arc: 1.2 }),
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

/* ================================================================== *
 * 6. HANGING / VERTICAL PULLING
 * Bar at y=15, ground:false — the feet hang below the floor line and
 * the ground rule would otherwise draw straight through the shins.
 * ================================================================== */

const BAR_PROP = { type: 'bar', x: 50, y: 15, w: 46, posts: true };

const PU_HANG = HANG;
const PU_HIGH = PULLUP_TOP;
const PU_HOLD = p(PULLUP_TOP, { y: 50.6, head: 89 });
const PU_MID = p(HANG, { y: 55.5, legL: [-86, -93], legR: [-94, -87] });

const pullup = {
  id: 'pullup',
  duration: 2800,
  ground: false,
  hero: 0.4,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: PU_HANG },
    { t: 0.34, pose: PU_HIGH },
    { t: 0.46, pose: PU_HOLD },
    { t: 0.74, pose: PU_MID },
    { t: 1, pose: PU_HANG },
  ],
};

/* Chin-up: narrower, supinated grip — same path, elbows track forward. */

const CH_HANG = p(HANG, {
  handL: { x: 48.5, y: 15, bend: 1 },
  handR: { x: 51.5, y: 15, bend: 1 },
});

const CH_TOP = p(CH_HANG, { y: 49, legL: [-84, -96], legR: [-96, -84] });
const CH_HOLD = p(CH_TOP, { y: 49.6 });
const CH_MID = p(CH_HANG, { y: 55, legL: [-86, -93], legR: [-94, -87] });

const chinup = {
  id: 'chinup',
  duration: 2800,
  ground: false,
  hero: 0.4,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: CH_HANG },
    { t: 0.34, pose: CH_TOP },
    { t: 0.46, pose: CH_HOLD },
    { t: 0.74, pose: CH_MID },
    { t: 1, pose: CH_HANG },
  ],
};

/* Wide grip: the hands sit further out, so the same bar is "closer". */

const WD_HANG = p(HANG, {
  y: 59,
  handL: { x: 43, y: 15, bend: 1 },
  handR: { x: 57, y: 15, bend: 1 },
});

const WD_TOP = p(WD_HANG, { y: 48.5, legL: [-84, -96], legR: [-96, -84] });
const WD_HOLD = p(WD_TOP, { y: 49.1 });
const WD_MID = p(WD_HANG, { y: 53.5, legL: [-86, -93], legR: [-94, -87] });

const wide_pullup = {
  id: 'wide_pullup',
  duration: 3000,
  ground: false,
  hero: 0.4,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: WD_HANG },
    { t: 0.34, pose: WD_TOP },
    { t: 0.46, pose: WD_HOLD },
    { t: 0.74, pose: WD_MID },
    { t: 1, pose: WD_HANG },
  ],
};

/* Archer: the body climbs toward the near hand, the far arm stays long. */

const AP_HANG = p(HANG, {
  x: 48, y: 59,
  handL: { x: 41, y: 15, bend: 1 },
  handR: { x: 55, y: 15, bend: 1 },
});

const AP_TOP = p(AP_HANG, {
  x: 53, y: 51, spine: 84, head: 84,
  legL: [-80, -94], legR: [-92, -82],
});

const AP_HOLD = p(AP_TOP, { y: 51.6 });

const archer_pullup = {
  id: 'archer_pullup',
  duration: 3400,
  ground: false,
  hero: 0.42,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: repKeys(AP_HANG, AP_TOP, AP_HOLD, { mode: 'lift', arc: 1.6 }),
};

/* Negative: start at the top, five slow seconds down, step back up. */

const NEG_TOP = p(PULLUP_TOP, { y: 49.5 });
const NEG_MID = p(HANG, { y: 55, legL: [-86, -93], legR: [-94, -87] });
const NEG_LOW = HANG;
const NEG_RESET = p(HANG, { y: 60, legL: [-70, -110], legR: [-74, -106], footL: -20, footR: -20 });

const negative_pullup = {
  id: 'negative_pullup',
  duration: 4200,
  ground: false,
  hero: 0,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: NEG_TOP },
    { t: 0.34, pose: NEG_MID },
    { t: 0.62, pose: NEG_LOW },
    { t: 0.78, pose: NEG_RESET },
    { t: 1, pose: NEG_TOP },
  ],
};

/* Band assist: one knee hooks into the band, which takes the bottom third. */

const BA_HANG = p(HANG, {
  legR: [-50, -140], footR: -90,
});

const BA_TOP = p(BA_HANG, { y: 50, legL: [-84, -96], legR: [-48, -138] });
const BA_HOLD = p(BA_TOP, { y: 50.6 });
const BA_MID = p(BA_HANG, { y: 55.5, legR: [-49, -139] });

const band_assisted_pullup = {
  id: 'band_assisted_pullup',
  duration: 2800,
  ground: false,
  hero: 0.4,
  ease: 'inOut',
  props: [
    BAR_PROP,
    { type: 'band', x0: 46, y0: 16, x1: 48.5, y1: 78, sag: 3 },
  ],
  keys: [
    { t: 0, pose: BA_HANG },
    { t: 0.34, pose: BA_TOP },
    { t: 0.46, pose: BA_HOLD },
    { t: 0.74, pose: BA_MID },
    { t: 1, pose: BA_HANG },
  ],
};

/* Muscle-up: pull, then the torso passes ABOVE the bar into support.
   The bar sits lower than usual so both the hang and the catch fit on canvas. */

const MU_BAR = { type: 'bar', x: 50, y: 26, w: 44, posts: true };

const MU_HANG = {
  x: 50, y: 71.8, spine: 90, head: 90,
  handL: { x: 47, y: 26, bend: 1 },
  handR: { x: 53, y: 26, bend: 1 },
  legL: [-25, -105], legR: [-29, -101],
  footL: -40, footR: -40,
};

const MU_PULL = p(MU_HANG, {
  x: 49, y: 60, spine: 84, head: 84,
  legL: [-15, -95], legR: [-19, -91],
  footL: -30, footR: -30,
});

const MU_CATCH = p(MU_HANG, {
  x: 36.47, y: 27.71, spine: 40, head: 34,
  legL: [-75, -95], legR: [-79, -91],
  footL: -10, footR: -10,
});

const MU_SUPPORT = p(MU_CATCH, { x: 36.9, y: 27.2, spine: 42, head: 36 });

const muscle_up = {
  id: 'muscle_up',
  duration: 3000,
  ground: false,
  hero: 0.46,
  ease: 'inOut',
  props: [MU_BAR],
  /* The way down is a muscle-up too, and it used to be one straight line from
     the support back to the hang — through the bar. It reverses through the
     same catch position it came up through. */
  keys: [
    { t: 0, pose: MU_HANG },
    { t: 0.26, pose: MU_PULL, ease: 'grind' },
    { t: 0.46, pose: MU_CATCH },
    { t: 0.58, pose: MU_SUPPORT },
    { t: 0.72, pose: MU_CATCH, ease: 'in' },
    { t: 0.88, pose: MU_PULL },
    { t: 1, pose: MU_HANG, ease: 'out' },
  ],
};

/* Dead hang: nothing moves but the pendulum and the breath. */

const DH_A = HANG;
const DH_B = p(HANG, { x: 50.8, y: 60.7, spine: 92, head: 92, legL: [-86, -88], legR: [-90, -88] });
const DH_C = p(HANG, { x: 49.2, y: 60.7, spine: 88, head: 88, legL: [-90, -92], legR: [-94, -92] });

const dead_hang = {
  id: 'dead_hang',
  duration: 4200,
  ground: false,
  hero: 0,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: DH_A },
    { t: 0.3, pose: DH_B },
    { t: 0.66, pose: DH_C },
    { t: 1, pose: DH_A },
  ],
};

/* Scapular pull: elbows stay long, only the shoulder blades work. */

const SCAP_DOWN = HANG;
const SCAP_UP = p(HANG, { y: 56, head: 88 });
const SCAP_HOLD = p(SCAP_UP, { y: 56.6 });

const scap_pull = {
  id: 'scap_pull',
  duration: 2400,
  ground: false,
  hero: 0.38,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: repKeys(SCAP_DOWN, SCAP_UP, SCAP_HOLD, { mode: 'lift' }),
};

/* Tuck front lever: hips rise until the back is horizontal under the bar. */

const FL_HANG = HANG;

const FL_MID = p(HANG, {
  x: 38, y: 50, spine: 45, head: 45,
  legL: [-40, -130], legR: [-44, -126],
  footL: -30, footR: -30,
});

const FL_TUCK = p(HANG, {
  x: 27.12, y: 38, spine: 0, head: 0,
  legL: [10, -160], legR: [6, -164],
  footL: -60, footR: -60,
});

const FL_HOLD = p(FL_TUCK, { x: 27.6, y: 38.6, spine: 2, head: 2 });

const front_lever_tuck = {
  id: 'front_lever_tuck',
  duration: 4000,
  ground: false,
  hero: 0.5,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: FL_HANG },
    { t: 0.28, pose: FL_MID },
    { t: 0.46, pose: FL_TUCK },
    { t: 0.64, pose: FL_HOLD },
    { t: 1, pose: FL_HANG },
  ],
};

/* ================================================================== *
 * 7. ROWING — horizontal pulling
 * ================================================================== */

/* Inverted row: body long and diagonal, heels planted, bar overhead. */

const AR_BOTTOM = {
  x: 34.5, y: 82.42, spine: 20, head: 24,
  handL: { x: 56, y: 52, bend: 1 },
  handR: { x: 60, y: 52, bend: 1 },
  footPtL: { x: 5, y: 85, bend: -1 },
  footPtR: { x: 6.5, y: 85, bend: -1 },
  footL: 60, footR: 60,
};

const AR_TOP = p(AR_BOTTOM, { x: 33.62, y: 77.4, spine: 30, head: 34 });
const AR_HOLD = p(AR_BOTTOM, { x: 33.8, y: 77.9, spine: 29, head: 33 });

const aussie_row = {
  id: 'aussie_row',
  duration: 2800,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [{ type: 'bar', x: 58, y: 52, w: 36, posts: true }],
  keys: repKeys(AR_BOTTOM, AR_TOP, AR_HOLD, { mode: 'lift', lag: 1.2, arc: 1.4 }),
};

const RR_BOTTOM = p(AR_BOTTOM, {
  handL: { x: 55, y: 52, bend: 1 },
  handR: { x: 61, y: 52, bend: 1 },
});

const RR_TOP = p(RR_BOTTOM, { x: 33.62, y: 77.4, spine: 30, head: 34 });
const RR_HOLD = p(RR_BOTTOM, { x: 33.9, y: 78.1, spine: 29, head: 33 });

const ring_row = {
  id: 'ring_row',
  duration: 2900,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [{ type: 'rings', x: 58, y: 52, w: 6, y0: 6 }],
  keys: repKeys(RR_BOTTOM, RR_TOP, RR_HOLD, { mode: 'lift', lag: 1.2, arc: 1.4 }),
};

/* Bent-over rowing: hips back, spine long at ~30deg, elbows drive past the ribs. */

const HINGED = {
  x: 46, y: 62, spine: 32, head: 26,
  footPtL: { x: 46, y: 87.5, bend: 1 },
  footPtR: { x: 48, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const BR_HANG = p(HINGED, {
  load: 'barbell',
  handL: { x: 64, y: 73, bend: -1 },
  handR: { x: 66, y: 73, bend: -1 },
});

const BR_TOP = p(BR_HANG, {
  handL: { x: 58.5, y: 63, bend: -1 },
  handR: { x: 60.5, y: 63, bend: -1 },
});

const BR_HOLD = p(BR_HANG, {
  handL: { x: 58.9, y: 63.6, bend: -1 },
  handR: { x: 60.9, y: 63.6, bend: -1 },
});

const bent_row = {
  id: 'bent_row',
  duration: 2800,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: repKeys(BR_HANG, BR_TOP, BR_HOLD, { mode: 'lift', arc: 1.8 }),
};

const DR_HANG = p(HINGED, {
  load: 'dumbbell',
  handL: { x: 64.5, y: 73, bend: -1 },
  handR: { x: 66.5, y: 73, bend: -1 },
});

const DR_TOP = p(DR_HANG, {
  handL: { x: 58.5, y: 63, bend: -1 },
  handR: { x: 60.5, y: 62, bend: -1 },
});

const DR_HOLD = p(DR_HANG, {
  handL: { x: 58.9, y: 63.6, bend: -1 },
  handR: { x: 60.9, y: 62.6, bend: -1 },
});

const db_row = {
  id: 'db_row',
  duration: 2800,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: repKeys(DR_HANG, DR_TOP, DR_HOLD, { mode: 'lift', arc: 1.8 }),
};

/* Seated cable row: reach long at the front, finish tall with elbows in. */

const CR_STRETCH = p(SEATED, {
  x: 47, y: 68, spine: 78, head: 74,
  handL: { x: 70, y: 56, bend: -1 },
  handR: { x: 72, y: 55.5, bend: -1 },
});

const CR_PULL = p(CR_STRETCH, {
  spine: 95, head: 92,
  handL: { x: 56, y: 58, bend: -1 },
  handR: { x: 58, y: 57.5, bend: -1 },
});

const CR_HOLD = p(CR_STRETCH, {
  spine: 94, head: 91,
  handL: { x: 56.4, y: 58.4, bend: -1 },
  handR: { x: 58.4, y: 57.9, bend: -1 },
});

const cable_row = {
  id: 'cable_row',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 80, y: 50, w: 14, h: 38 },
    { type: 'band', x0: 73, y0: 57, x1: 64, y1: 56.5, sag: 0 },
  ],
  keys: repKeys(CR_STRETCH, CR_PULL, CR_HOLD, { mode: 'lift', arc: 1.4 }),
};

/* Lat pulldown: seated, slight lean back, bar to the collarbone. */

const LP_TOP = p(SEATED, {
  x: 46, y: 70, spine: 86, head: 86,
  load: 'barbell',
  handL: { x: 50, y: 26, bend: -1 },
  handR: { x: 56, y: 27, bend: -1 },
});

const LP_DOWN = p(LP_TOP, {
  spine: 78, head: 78,
  handL: { x: 57, y: 57, bend: -1 },
  handR: { x: 61, y: 56.5, bend: -1 },
});

const LP_HOLD = p(LP_TOP, {
  spine: 79, head: 79,
  handL: { x: 56.6, y: 56.4, bend: -1 },
  handR: { x: 60.6, y: 55.9, bend: -1 },
});

const lat_pulldown = {
  id: 'lat_pulldown',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 54, y: 6, w: 22, h: 16 },
    { type: 'bench', x: 44, y: 74, w: 20, h: 5 },
    { type: 'band', x0: 53, y0: 22, x1: 53, y1: 30, sag: 0 },
  ],
  keys: repKeys(LP_TOP, LP_DOWN, LP_HOLD, { mode: 'lift', arc: 1.8 }),
};

/* ------------------------------------------------------------------ *
 * FRONTAL-PLANE BASE
 *
 * A face pull, a band pull-apart and a rear fly all happen ACROSS the body,
 * toward the camera. Drawn in profile the two arms lie exactly on top of each
 * other, the whole range of motion projects onto a few units of screen, and
 * the three exercises become the same picture of one arm twitching.
 *
 * `spread` (see the long note in rig.js) turns the figure to face the viewer:
 * the shoulders and hips separate horizontally and the arms are read in the
 * frontal plane. 13 is about a shoulder width. The feet turn out, because two
 * feet pointing the same way is the one detail that still says "profile".
 * ------------------------------------------------------------------ */

const FACING_SPREAD = 13;

const FACING = p(STAND, {
  x: 50, y: 57, spine: 90, head: 90, spread: FACING_SPREAD,
  footPtL: { x: 44.6, y: 87.5, bend: 1 },
  footPtR: { x: 55.4, y: 87.5, bend: 1 },
  footL: 172, footR: 8,
  legL: undefined, legR: undefined,
});

/* Shoulder joints of FACING: (43.5, 34.12) and (56.5, 34.12). */

/* Face pull: high cable to the face, elbows flaring WIDE and staying above the
   wrists. The flare is the whole exercise and it only exists in this plane. */

/*
 * The hands come IN and the ELBOWS go out — which is the exercise. Extended
 * toward the anchor the arms point at the camera and would project to nothing,
 * so the start is drawn as reach out to the sides at eye level; the finish
 * folds the hands to the ears with the elbows flared wide, and the flare is
 * what the profile view could never show.
 */
const FP_OUT = p(FACING, {
  handL: { x: 24, y: 30, bend: 1 },
  handR: { x: 76, y: 30, bend: -1 },
});

const FP_MID = p(FACING, {
  handL: { x: 31, y: 25.5, bend: 1 },
  handR: { x: 69, y: 25.5, bend: -1 },
});

const FP_IN = p(FACING, {
  handL: { x: 39, y: 22, bend: 1 },
  handR: { x: 61, y: 22, bend: -1 },
});

const FP_HOLD = p(FACING, {
  handL: { x: 38.4, y: 22.4, bend: 1 },
  handR: { x: 61.6, y: 22.4, bend: -1 },
});

const face_pull = {
  id: 'face_pull',
  duration: 2600,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    // A high anchor overhead with a rope to each hand: the one arrangement of a
    // cable that survives being looked at from the front.
    { type: 'bar', x: 50, y: 7, w: 24, posts: false },
    { type: 'band', x0: 45, y0: 7, x1: 32, y1: 26, sag: 1.5 },
    { type: 'band', x0: 55, y0: 7, x1: 68, y1: 26, sag: 1.5 },
  ],
  keys: [
    // Pull fast, hold the squeeze, feed it back slower than it came.
    { t: 0, pose: FP_OUT },
    { t: 0.18, pose: FP_MID, ease: 'in' },
    { t: 0.34, pose: FP_IN, ease: 'out' },
    { t: 0.5, pose: FP_HOLD },
    { t: 1, pose: FP_OUT, ease: 'inOut' },
  ],
};

/* Band pull-apart: arms stay long and sweep apart across the chest. */

/* Hands in front and elbows bent OUT at the start — arms pointing at the camera
   project to nothing, so the fold is where the reach has to go. Both ends stay
   clear of the double-fold that put the forearms across the chest. */
const BPA_TOGETHER = p(FACING, {
  handL: { x: 36, y: 42, bend: -1 },
  handR: { x: 64, y: 42, bend: 1 },
});

const BPA_MID = p(FACING, {
  handL: { x: 28, y: 37, bend: -1 },
  handR: { x: 72, y: 37, bend: 1 },
});

const BPA_APART = p(FACING, {
  handL: { x: 21.5, y: 33.6, bend: -1 },
  handR: { x: 78.5, y: 33.6, bend: 1 },
});

const BPA_HOLD = p(FACING, {
  handL: { x: 22.3, y: 33.9, bend: -1 },
  handR: { x: 77.7, y: 33.9, bend: 1 },
});

const band_pull_apart = {
  id: 'band_pull_apart',
  duration: 2400,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'band', x0: 30, y0: 36, x1: 70, y1: 36, sag: -1.5 }],
  keys: [
    { t: 0, pose: BPA_TOGETHER },
    { t: 0.2, pose: BPA_MID, ease: 'in' },
    { t: 0.38, pose: BPA_APART, ease: 'out' },
    { t: 0.52, pose: BPA_HOLD },
    { t: 1, pose: BPA_TOGETHER, ease: 'inOut' },
  ],
};

/* ================================================================== *
 * 8. ARMS AND SHOULDERS — isolation
 * The IK bend is what pins the elbow: bend -1 under the shoulder keeps a
 * curl honest, bend +1 above it keeps a face pull / press honest.
 * ================================================================== */

const CURL_DOWN = p(STAND, {
  load: 'dumbbell',
  handL: { x: 49, y: 57.4, bend: -1 },
  handR: { x: 51, y: 57.4, bend: -1 },
});

const CURL_MID = p(CURL_DOWN, {
  handL: { x: 56.5, y: 46, bend: -1 },
  handR: { x: 58, y: 45, bend: -1 },
});

const CURL_TOP = p(CURL_DOWN, {
  handL: { x: 55, y: 36.5, bend: -1 },
  handR: { x: 56.5, y: 35.5, bend: -1 },
});

const CURL_HOLD = p(CURL_DOWN, {
  handL: { x: 55.2, y: 37.2, bend: -1 },
  handR: { x: 56.7, y: 36.2, bend: -1 },
});

const biceps_curl = {
  id: 'biceps_curl',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: CURL_DOWN },
    { t: 0.24, pose: CURL_MID },
    { t: 0.42, pose: CURL_TOP },
    { t: 0.52, pose: CURL_HOLD },
    { t: 1, pose: CURL_DOWN },
  ],
};

/* Hammer: neutral grip, finishes a touch lower and closer to the body. */

const HAM_MID = p(CURL_DOWN, {
  handL: { x: 56, y: 47, bend: -1 },
  handR: { x: 57.5, y: 46, bend: -1 },
});

const HAM_TOP = p(CURL_DOWN, {
  handL: { x: 56, y: 39, bend: -1 },
  handR: { x: 57.5, y: 38, bend: -1 },
});

const HAM_HOLD = p(CURL_DOWN, {
  handL: { x: 56.2, y: 39.6, bend: -1 },
  handR: { x: 57.7, y: 38.6, bend: -1 },
});

const hammer_curl = {
  id: 'hammer_curl',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: CURL_DOWN },
    { t: 0.24, pose: HAM_MID },
    { t: 0.42, pose: HAM_TOP },
    { t: 0.52, pose: HAM_HOLD },
    { t: 1, pose: CURL_DOWN },
  ],
};

/* Pushdown: the elbow never leaves the ribs, only the forearm travels. */

const PD_TOP = p(STAND, {
  x: 42,
  handL: { x: 52, y: 44, bend: -1 },
  handR: { x: 53.5, y: 45, bend: -1 },
});

const PD_LOCK = p(PD_TOP, {
  handL: { x: 50, y: 55, bend: -1 },
  handR: { x: 51.5, y: 55, bend: -1 },
});

const PD_HOLD = p(PD_TOP, {
  handL: { x: 50, y: 54.4, bend: -1 },
  handR: { x: 51.5, y: 54.4, bend: -1 },
});

const triceps_pushdown = {
  id: 'triceps_pushdown',
  duration: 2400,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 56, y: 4, w: 10, h: 20 },
    { type: 'band', x0: 56, y0: 24, x1: 52, y1: 43, sag: 1 },
  ],
  keys: repKeys(PD_TOP, PD_LOCK, PD_HOLD, { mode: 'lift', arc: 1.4 }),
};

/* Shrug: the load rises, the neck shortens, the feet stay welded down. */

const SHRUG_DOWN = p(STAND, {
  load: 'dumbbell',
  head: 90,
  handL: { x: 48.5, y: 57.4, bend: -1 },
  handR: { x: 51.5, y: 57.4, bend: -1 },
});

const SHRUG_UP = p(SHRUG_DOWN, {
  head: 84,
  handL: { x: 48.5, y: 55.2, bend: -1 },
  handR: { x: 51.5, y: 55.2, bend: -1 },
});

const SHRUG_HOLD = p(SHRUG_DOWN, {
  head: 85,
  handL: { x: 48.5, y: 55.6, bend: -1 },
  handR: { x: 51.5, y: 55.6, bend: -1 },
});

const shrug = {
  id: 'shrug',
  duration: 2200,
  ground: true,
  hero: 0.36,
  ease: 'inOut',
  props: [],
  keys: repKeys(SHRUG_DOWN, SHRUG_UP, SHRUG_HOLD, { mode: 'lift' }),
};

/* Lateral raise: the hands ride an arc at arm's length, never above the ears. */

/*
 * Lateral raise. The hand targets were ALREADY symmetric about x = 50 — this
 * clip was always describing a frontal-plane movement — but with spread 0 both
 * arms grew out of one point in the middle of the chest and the pair read as a
 * FRONT raise with a thick arm. Standing it on FACING is the whole fix; the
 * targets only widened enough to keep the arms straight at the top, which is
 * where a lateral raise is judged.
 *
 * bend puts each elbow slightly ABOVE the shoulder-to-hand line, which is the
 * "pour the jug" the cue asks for and the opposite of a shrugged raise.
 */
const LR_DOWN = p(FACING, {
  load: 'dumbbell',
  handL: { x: 41, y: 57.4, bend: -1 },
  handR: { x: 59, y: 57.4, bend: 1 },
});

const LR_MID = p(LR_DOWN, {
  handL: { x: 31.5, y: 47.5, bend: -1 },
  handR: { x: 68.5, y: 47.5, bend: 1 },
});

const LR_TOP = p(LR_DOWN, {
  handL: { x: 21.5, y: 34.2, bend: -1 },
  handR: { x: 78.5, y: 34.2, bend: 1 },
});

const LR_HOLD = p(LR_DOWN, {
  handL: { x: 22.3, y: 34.8, bend: -1 },
  handR: { x: 77.7, y: 34.8, bend: 1 },
});

const lateral_raise = {
  id: 'lateral_raise',
  duration: 2800,
  ground: true,
  hero: 0.4,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: LR_DOWN },
    { t: 0.22, pose: LR_MID },
    { t: 0.4, pose: LR_TOP },
    { t: 0.5, pose: LR_HOLD },
    { t: 1, pose: LR_DOWN },
  ],
};

/* Front raise: same arc, straight out in front to eye level. */

const FR_DOWN = p(STAND, {
  load: 'dumbbell',
  handL: { x: 49, y: 57.1, bend: -1 },
  handR: { x: 51, y: 57.1, bend: -1 },
});

const FR_MID = p(FR_DOWN, {
  handL: { x: 64, y: 50.5, bend: -1 },
  handR: { x: 65.5, y: 51, bend: -1 },
});

const FR_TOP = p(FR_DOWN, {
  handL: { x: 72, y: 34, bend: -1 },
  handR: { x: 73, y: 35.5, bend: -1 },
});

const FR_HOLD = p(FR_DOWN, {
  handL: { x: 71.4, y: 34.6, bend: -1 },
  handR: { x: 72.4, y: 36.1, bend: -1 },
});

const front_raise = {
  id: 'front_raise',
  duration: 2800,
  ground: true,
  hero: 0.4,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: FR_DOWN },
    { t: 0.22, pose: FR_MID },
    { t: 0.4, pose: FR_TOP },
    { t: 0.5, pose: FR_HOLD },
    { t: 1, pose: FR_DOWN },
  ],
};

/*
 * Rear fly: hinged over, the arms hang straight down and open into a wide T.
 *
 * Hinged AND facing. rig.js separates the two sides horizontally on screen
 * rather than perpendicular to the spine, precisely so a bent-over movement
 * still shows both arms — a body hinging in the sagittal plane does not move
 * its shoulders apart in the plane the camera is looking down. In profile the
 * old keys moved both hands 25 units along nearly the same diagonal, which is
 * the picture of a bent-over row, not of a fly.
 */

const RF_BASE = p(HINGED, {
  spine: 30, head: 24, spread: 11,
  load: 'dumbbell',
  footPtL: { x: 44, y: 87.5, bend: 1 },
  footPtR: { x: 52, y: 87.5, bend: 1 },
  footL: 174, footR: 6,
});

/* Shoulder of RF_BASE lands at (65.8, 50.6); the hands hang below it. */
const RF_DOWN = p(RF_BASE, {
  handL: { x: 60.6, y: 72.5, bend: -1 },
  handR: { x: 71.0, y: 72.5, bend: 1 },
});

const RF_MID = p(RF_BASE, {
  handL: { x: 53.5, y: 63.5, bend: -1 },
  handR: { x: 78.1, y: 63.5, bend: 1 },
});

const RF_BACK = p(RF_BASE, {
  handL: { x: 46.5, y: 53.5, bend: -1 },
  handR: { x: 85.1, y: 53.5, bend: 1 },
});

const RF_HOLD = p(RF_BASE, {
  handL: { x: 47.4, y: 54.2, bend: -1 },
  handR: { x: 84.2, y: 54.2, bend: 1 },
});

const reverse_fly = {
  id: 'reverse_fly',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: RF_DOWN },
    { t: 0.2, pose: RF_MID, ease: 'in' },
    { t: 0.38, pose: RF_BACK, ease: 'out' },
    { t: 0.52, pose: RF_HOLD },
    { t: 1, pose: RF_DOWN, ease: 'inOut' },
  ],
};

/* ================================================================== *
 * 9. GENERIC PATTERN FALLBACKS
 * clips.index.js resolves exercise.anim -> clip id -> pattern name, so
 * these play for every upper-body exercise without a bespoke clip.
 * Each one is the plainest honest representative of its pattern.
 * ================================================================== */

const horizontal_push = {
  id: 'horizontal_push',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: repKeys(PU_TOP, PU_BOTTOM, PU_PAUSE, { lag: 1.4 }),
};

const vertical_push = {
  id: 'vertical_push',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: repKeys(PIKE_TOP, PIKE_BOTTOM, PIKE_PAUSE, { lag: 1.6 }),
};

/* Unloaded bent-over row — no bar, no bench, just the pulling shape. */

const GHP_HANG = p(HINGED, {
  handL: { x: 64, y: 73, bend: -1 },
  handR: { x: 66, y: 73, bend: -1 },
});

const GHP_TOP = p(GHP_HANG, {
  handL: { x: 58.5, y: 63, bend: -1 },
  handR: { x: 60.5, y: 63, bend: -1 },
});

const GHP_HOLD = p(GHP_HANG, {
  handL: { x: 58.9, y: 63.6, bend: -1 },
  handR: { x: 60.9, y: 63.6, bend: -1 },
});

const horizontal_pull = {
  id: 'horizontal_pull',
  duration: 2800,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: repKeys(GHP_HANG, GHP_TOP, GHP_HOLD, { mode: 'lift', lag: 1.2, arc: 1.4 }),
};

const vertical_pull = {
  id: 'vertical_pull',
  duration: 2800,
  ground: false,
  hero: 0.4,
  ease: 'inOut',
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: PU_HANG },
    { t: 0.34, pose: PU_HIGH },
    { t: 0.46, pose: PU_HOLD },
    { t: 0.74, pose: PU_MID },
    { t: 1, pose: PU_HANG },
  ],
};

/* Unloaded curl / extension / raise shapes for the arm and shoulder patterns. */

const GB_DOWN = p(STAND, {
  handL: { x: 49, y: 57.4, bend: -1 },
  handR: { x: 51, y: 57.4, bend: -1 },
});

const GB_MID = p(GB_DOWN, {
  handL: { x: 56.5, y: 46, bend: -1 },
  handR: { x: 58, y: 45, bend: -1 },
});

const GB_TOP = p(GB_DOWN, {
  handL: { x: 55, y: 36.5, bend: -1 },
  handR: { x: 56.5, y: 35.5, bend: -1 },
});

const GB_HOLD = p(GB_DOWN, {
  handL: { x: 55.2, y: 37.2, bend: -1 },
  handR: { x: 56.7, y: 36.2, bend: -1 },
});

const arms_biceps = {
  id: 'arms_biceps',
  duration: 2600,
  ground: true,
  hero: 0.42,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: GB_DOWN },
    { t: 0.24, pose: GB_MID },
    { t: 0.42, pose: GB_TOP },
    { t: 0.52, pose: GB_HOLD },
    { t: 1, pose: GB_DOWN },
  ],
};

/* Triceps: a narrow-hand push-up needs nothing but the floor. */

const arms_triceps = {
  id: 'arms_triceps',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: repKeys(DIA_TOP, DIA_BOTTOM, DIA_PAUSE, { arc: 1.2 }),
};

/* Unloaded pattern fallback — same plane, a shade shy of the loaded top. */
const GLR_DOWN = p(FACING, {
  handL: { x: 41.5, y: 57.2, bend: -1 },
  handR: { x: 58.5, y: 57.2, bend: 1 },
});

const GLR_MID = p(GLR_DOWN, {
  handL: { x: 32.5, y: 48.5, bend: -1 },
  handR: { x: 67.5, y: 48.5, bend: 1 },
});

const GLR_TOP = p(GLR_DOWN, {
  handL: { x: 23, y: 36, bend: -1 },
  handR: { x: 77, y: 36, bend: 1 },
});

const GLR_HOLD = p(GLR_DOWN, {
  handL: { x: 23.8, y: 36.6, bend: -1 },
  handR: { x: 76.2, y: 36.6, bend: 1 },
});

const shoulders_lateral = {
  id: 'shoulders_lateral',
  duration: 2800,
  ground: true,
  hero: 0.4,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: GLR_DOWN },
    { t: 0.22, pose: GLR_MID },
    { t: 0.4, pose: GLR_TOP },
    { t: 0.5, pose: GLR_HOLD },
    { t: 1, pose: GLR_DOWN },
  ],
};

/* Unloaded rear-delt fallback: the same hinged, camera-facing body as the
   dumbbell fly, opening a little shy of it and with nothing in the hands. */
const GRF_DOWN = p(RF_BASE, {
  load: undefined,
  handL: { x: 61.2, y: 72.2, bend: -1 },
  handR: { x: 70.4, y: 72.2, bend: 1 },
});

const GRF_MID = p(GRF_DOWN, {
  handL: { x: 54.8, y: 64.5, bend: -1 },
  handR: { x: 76.8, y: 64.5, bend: 1 },
});

const GRF_BACK = p(GRF_DOWN, {
  handL: { x: 48.4, y: 55.6, bend: -1 },
  handR: { x: 83.2, y: 55.6, bend: 1 },
});

const GRF_HOLD = p(GRF_DOWN, {
  handL: { x: 49.2, y: 56.2, bend: -1 },
  handR: { x: 82.4, y: 56.2, bend: 1 },
});

const shoulders_rear = {
  id: 'shoulders_rear',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: [
    { t: 0, pose: GRF_DOWN },
    { t: 0.24, pose: GRF_MID },
    { t: 0.44, pose: GRF_BACK },
    { t: 0.56, pose: GRF_HOLD },
    { t: 1, pose: GRF_DOWN },
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
  pullup,
  chinup,
  wide_pullup,
  archer_pullup,
  negative_pullup,
  band_assisted_pullup,
  muscle_up,
  dead_hang,
  scap_pull,
  front_lever_tuck,
  aussie_row,
  ring_row,
  bent_row,
  db_row,
  cable_row,
  lat_pulldown,
  face_pull,
  band_pull_apart,
  biceps_curl,
  hammer_curl,
  triceps_pushdown,
  shrug,
  lateral_raise,
  front_raise,
  reverse_fly,
  horizontal_push,
  vertical_push,
  horizontal_pull,
  vertical_pull,
  arms_biceps,
  arms_triceps,
  shoulders_lateral,
  shoulders_rear,
});
