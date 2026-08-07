/*
 * clips.x02.js — bespoke per-exercise animations for the TRICEPS batch.
 * Keys are EXERCISE IDs (see docs/clip-assignments.json), so clips.index.js
 * picks them over the shared arms_triceps clip.
 *
 * Conventions (src/core/rig.js): viewBox 0..100, ground y = 88, angles in math
 * convention (0 = right = the way the figure faces, 90 = up, -90 = down).
 * Every hand or foot that touches the floor, a bench, a wall, a bar or a ring
 * is pinned with an IK target and keeps the SAME coordinates in every key of
 * its clip; free limbs use the FK [proximal, distal] arrays. A limb never
 * mixes the two inside one clip — lerpPose() would freeze it.
 *
 * The elbow is the whole story in this batch, so each clip states above it
 * where the elbow lives and what is allowed to move around it.
 */

import { p } from '../core/poses.js';

import { repKeys } from '../core/anim.js';
/* --- wall triceps extension ------------------------------------------
 * The gentlest triceps press there is: hands stay put on the wall at head
 * height, the body is one rigid lever pivoting on the heels, and ONLY the
 * elbows fold. The forehead — not the chest — is what approaches the wall.
 * ------------------------------------------------------------------ */

const WTX_BASE = {
  handL: { x: 70, y: 39, bend: 1 },
  handR: { x: 70, y: 36, bend: 1 },
  footPtL: { x: 41, y: 87.5, bend: 1 },
  footPtR: { x: 46, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const WTX_LONG = p(WTX_BASE, { x: 45.6, y: 58.3, spine: 82, head: 67 });
const WTX_MID = p(WTX_BASE, { x: 48.6, y: 59.1, spine: 76, head: 61 });
const WTX_NEAR = p(WTX_BASE, { x: 51.6, y: 59.8, spine: 70, head: 55 });
const WTX_HOLD = p(WTX_BASE, { x: 51.2, y: 59.7, spine: 70.8, head: 55.8 });

const wall_triceps_extension = {
  id: 'wall_triceps_extension',
  duration: 2800,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'wall', x: 71, y0: 8, y1: 88 }],
  keys: [
    { t: 0, pose: WTX_LONG },
    { t: 0.24, pose: WTX_MID },
    { t: 0.44, pose: WTX_NEAR },
    { t: 0.58, pose: WTX_HOLD },
    { t: 1, pose: WTX_LONG },
  ],
};

/* --- sphinx push-up --------------------------------------------------
 * Starts where no other push-up does: the ELBOWS on the floor. The hands
 * never move, the forearms peel off the ground, and the hips stay in the
 * same line the whole way — no piking to get up.
 * ------------------------------------------------------------------ */

const SPX_BASE = {
  handL: { x: 70, y: 87.5, bend: -1 },
  handR: { x: 72, y: 87.5, bend: -1 },
  footPtL: { x: 6, y: 84.3, bend: 1 },
  footPtR: { x: 6.5, y: 84.8, bend: 1 },
  footL: -30, footR: -30,
};

const SPX_DOWN = p(SPX_BASE, { x: 35.3, y: 77.9, spine: 6, head: 0 });
const SPX_MID = p(SPX_BASE, { x: 35, y: 77.4, spine: 11, head: 5 });
const SPX_UP = p(SPX_BASE, { x: 34.9, y: 76.3, spine: 16, head: 10 });
const SPX_HOLD = p(SPX_BASE, { x: 34.9, y: 76.5, spine: 15.2, head: 9.2 });

const sphinx_pushup = {
  id: 'sphinx_pushup',
  duration: 2800,
  ground: true,
  hero: 0,
  ease: 'inOut',
  props: [{ type: 'mat', x: 44, w: 78 }],
  keys: [
    { t: 0, pose: SPX_DOWN },
    { t: 0.2, pose: SPX_MID },
    { t: 0.4, pose: SPX_UP },
    { t: 0.54, pose: SPX_HOLD },
    { t: 1, pose: SPX_DOWN },
  ],
};

/* --- close-grip push-up ----------------------------------------------
 * Hands exactly shoulder width — narrower than a push-up, wider than a
 * diamond — and the elbows shave the ribs instead of flaring, so the body
 * travels further forward over the hands and the descent is deeper.
 * ------------------------------------------------------------------ */

const CGP_BASE = {
  handL: { x: 57.4, y: 87.5, bend: -1 },
  handR: { x: 59.2, y: 87.5, bend: -1 },
  footPtL: { x: 9.4, y: 85, bend: 1 },
  footPtR: { x: 10, y: 86, bend: 1 },
  footL: -30, footR: -30,
};

const CGP_TOP = p(CGP_BASE, { x: 36.94, y: 73.44, spine: 23, head: 15 });
const CGP_BOTTOM = p(CGP_BASE, { x: 39.6, y: 82.3, spine: 18.5, head: 10.5 });
const CGP_PAUSE = p(CGP_BASE, { x: 39.3, y: 81.6, spine: 19, head: 11 });

const close_grip_pushup = {
  id: 'close_grip_pushup',
  duration: 3000,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [],
  keys: repKeys(CGP_TOP, CGP_BOTTOM, CGP_PAUSE, { lag: 1.2 }),
};

/* --- bench dip -------------------------------------------------------
 * Hands behind on the bench at hip width, heels out in front. The torso
 * stays vertical and the hips drop straight down the face of the bench —
 * and stop at ninety degrees, which is why the bottom key is a hold.
 * ------------------------------------------------------------------ */

const BD_BASE = {
  handL: { x: 32, y: 69, bend: -1 },
  handR: { x: 35, y: 69, bend: -1 },
  footPtL: { x: 60, y: 85, bend: 1 },
  footPtR: { x: 64, y: 85, bend: 1 },
  footL: 25, footR: 25,
};

const BD_TOP = p(BD_BASE, { x: 39, y: 72, spine: 86, head: 84 });
const BD_MID = p(BD_BASE, { x: 38.5, y: 76.5, spine: 84, head: 82 });
const BD_BOTTOM = p(BD_BASE, { x: 38, y: 80.5, spine: 82, head: 80 });
const BD_HOLD = p(BD_BASE, { x: 38.1, y: 80.1, spine: 82.4, head: 80.4 });

const bench_dip = {
  id: 'bench_dip',
  duration: 2800,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'bench', x: 24, y: 70, w: 30, h: 6 }],
  keys: [
    { t: 0, pose: BD_TOP },
    { t: 0.24, pose: BD_MID },
    { t: 0.46, pose: BD_BOTTOM },
    { t: 0.6, pose: BD_HOLD },
    { t: 1, pose: BD_TOP },
  ],
};

/* --- band overhead triceps extension ---------------------------------
 * Band pinned under the back foot, hands overhead. The upper arm angle is
 * IDENTICAL in every key — the elbows never open outwards, only the
 * forearms swing down behind the neck and back up.
 * ------------------------------------------------------------------ */

const BOX_BASE = {
  x: 44, y: 59.5, spine: 89, head: 90,
  footPtL: { x: 36, y: 87.5, bend: 1 },
  footPtR: { x: 50, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const BOX_LOCK = p(BOX_BASE, { armL: [55, 106], armR: [64, 94] });
const BOX_MID = p(BOX_BASE, { armL: [55, 150], armR: [64, 140] });
const BOX_STRETCH = p(BOX_BASE, { armL: [55, 195], armR: [64, 185] });
const BOX_HOLD = p(BOX_BASE, { armL: [55, 190], armR: [64, 180] });

const band_overhead_triceps_ext = {
  id: 'band_overhead_triceps_ext',
  duration: 3000,
  ground: true,
  hero: 0,
  ease: 'inOut',
  props: [{ type: 'band', x0: 36, y0: 87.5, x1: 40, y1: 30, sag: 3 }],
  keys: [
    { t: 0, pose: BOX_LOCK },
    { t: 0.24, pose: BOX_MID },
    { t: 0.44, pose: BOX_STRETCH },
    { t: 0.58, pose: BOX_HOLD },
    { t: 1, pose: BOX_LOCK },
  ],
};

/* --- dumbbell kickback -----------------------------------------------
 * One arm, and only one. The free hand is planted on the bench, the torso
 * is hinged and dead still, the upper arm is welded parallel to the floor
 * and the forearm is the single thing in the clip that moves.
 * ------------------------------------------------------------------ */

const KB_BASE = {
  x: 36, y: 62, spine: 28, head: 18,
  handL: { x: 68, y: 69, bend: -1 },
  footPtL: { x: 28, y: 87.5, bend: 1 },
  footPtR: { x: 40, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
  load: 'dumbbell',
};

const KB_BENT = p(KB_BASE, { armR: [-178, -90] });
const KB_MID = p(KB_BASE, { armR: [-178, -134] });
const KB_LONG = p(KB_BASE, { x: 36.4, spine: 27, head: 17, armR: [-178, -165] });
const KB_HOLD = p(KB_BASE, { x: 36.3, spine: 27.3, head: 17.3, armR: [-178, -160] });

const db_kickback = {
  id: 'db_kickback',
  duration: 2600,
  ground: true,
  hero: 0.44,
  ease: 'inOut',
  props: [{ type: 'bench', x: 74, y: 70, w: 24, h: 5 }],
  keys: [
    { t: 0, pose: KB_BENT },
    { t: 0.24, pose: KB_MID },
    { t: 0.44, pose: KB_LONG },
    { t: 0.6, pose: KB_HOLD },
    { t: 1, pose: KB_BENT },
  ],
};

/* --- dumbbell overhead triceps extension -----------------------------
 * Seated so the lower back cannot cheat, both hands cupping ONE bell (the
 * two hands sit close enough that the loads read as a single weight), the
 * elbows aimed at the ceiling and the bell lowered behind the head.
 * ------------------------------------------------------------------ */

const DOX_SEAT = {
  x: 42, y: 66, spine: 92, head: 92,
  footPtL: { x: 48, y: 87.5, bend: 1 },
  footPtR: { x: 58, y: 86, bend: 1 },
  footL: 2, footR: -25,
  load: 'dumbbell',
};

const DOX_LOCK = p(DOX_SEAT, { armL: [58, 111], armR: [72, 91] });
const DOX_MID = p(DOX_SEAT, { armL: [58, 155], armR: [72, 140] });
const DOX_STRETCH = p(DOX_SEAT, { armL: [58, 199], armR: [72, 189] });
const DOX_HOLD = p(DOX_SEAT, { armL: [58, 193], armR: [72, 183] });

const db_overhead_triceps_ext = {
  id: 'db_overhead_triceps_ext',
  duration: 3200,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'bench', x: 44, y: 70, w: 26, h: 5 }],
  keys: [
    { t: 0, pose: DOX_LOCK },
    { t: 0.24, pose: DOX_MID },
    { t: 0.46, pose: DOX_STRETCH },
    { t: 0.6, pose: DOX_HOLD },
    { t: 1, pose: DOX_LOCK },
  ],
};

/* --- cable triceps pushdown ------------------------------------------
 * The upper arm angle is frozen at the ribs for the whole clip, so the
 * elbow literally cannot travel; the forearm sweeps from chest height to
 * the thigh and then holds there for a beat before the cable pulls back.
 * ------------------------------------------------------------------ */

const PD_BASE = {
  x: 44, y: 58, spine: 88, head: 88,
  footPtL: { x: 42, y: 87.5, bend: 1 },
  footPtR: { x: 46.5, y: 87.5, bend: 1 },
  footL: 2, footR: 2,
};

const PD_UP = p(PD_BASE, { armL: [-80, 45], armR: [-68, 38] });
const PD_HALF = p(PD_BASE, { armL: [-80, -18], armR: [-68, -24] });
const PD_LOCK = p(PD_BASE, { armL: [-80, -76], armR: [-68, -64] });
const PD_HOLD = p(PD_BASE, { armL: [-80, -73], armR: [-68, -61] });

const triceps_pushdown = {
  id: 'triceps_pushdown',
  duration: 2600,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [
    { type: 'machine', x: 52, y: 6, w: 14, h: 16 },
    { type: 'band', x0: 52, y0: 22, x1: 55.5, y1: 40, sag: 1 },
  ],
  keys: [
    { t: 0, pose: PD_UP },
    { t: 0.22, pose: PD_HALF },
    { t: 0.42, pose: PD_LOCK },
    { t: 0.6, pose: PD_HOLD },
    { t: 1, pose: PD_UP },
  ],
};

/* --- upright bar dip -------------------------------------------------
 * The triceps version of a dip: the torso is bolt upright at EVERY key —
 * it never leans forward the way a chest dip does — the elbows drive
 * straight back, and the descent stops at ninety degrees.
 * ------------------------------------------------------------------ */

const TD_BASE = {
  handL: { x: 46.5, y: 54.5, bend: -1 },
  handR: { x: 52.5, y: 59.5, bend: -1 },
  legL: [-50, 160], legR: [-58, 152],
  footL: -120, footR: -120,
};

const TD_TOP = p(TD_BASE, { x: 49, y: 59.8, spine: 90, head: 90 });
const TD_MID = p(TD_BASE, { x: 49, y: 63.4, spine: 90, head: 90 });
const TD_BOTTOM = p(TD_BASE, { x: 49, y: 67, spine: 90, head: 90 });
const TD_HOLD = p(TD_BASE, { x: 49, y: 66.4, spine: 90, head: 90 });

const triceps_dip_bars = {
  id: 'triceps_dip_bars',
  duration: 2800,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'dipbars', x: 50, y: 57, w: 26, gap: 5 }],
  keys: [
    { t: 0, pose: TD_TOP },
    { t: 0.24, pose: TD_MID },
    { t: 0.46, pose: TD_BOTTOM },
    { t: 0.6, pose: TD_HOLD },
    { t: 1, pose: TD_TOP },
  ],
};

/* --- ring triceps extension ------------------------------------------
 * Hands stay on the rings, feet stay on the floor, and the whole plank
 * rotates through the elbows until the forehead has travelled past the
 * ring line. Hardest thing in the batch, so it moves slowly.
 * ------------------------------------------------------------------ */

const RTX_BASE = {
  handL: { x: 57, y: 32, bend: -1 },
  handR: { x: 62, y: 32, bend: -1 },
  footPtL: { x: 25, y: 87.5, bend: 1 },
  footPtR: { x: 29, y: 86.5, bend: 1 },
  footL: -14, footR: -14,
};

const RTX_LONG = p(RTX_BASE, { x: 34, y: 59.8, spine: 72, head: 52 });
const RTX_MID = p(RTX_BASE, { x: 37.3, y: 61.4, spine: 65, head: 45 });
const RTX_DEEP = p(RTX_BASE, { x: 40.4, y: 62.8, spine: 58, head: 38 });
const RTX_HOLD = p(RTX_BASE, { x: 40, y: 62.6, spine: 58.8, head: 38.8 });

const ring_triceps_extension = {
  id: 'ring_triceps_extension',
  duration: 3400,
  ground: true,
  hero: 0.46,
  ease: 'inOut',
  props: [{ type: 'rings', x: 59.5, y: 32, w: 5, y0: 6 }],
  keys: [
    { t: 0, pose: RTX_LONG },
    { t: 0.24, pose: RTX_MID },
    { t: 0.46, pose: RTX_DEEP },
    { t: 0.6, pose: RTX_HOLD },
    { t: 1, pose: RTX_LONG },
  ],
};

export const X02_CLIPS = {
  wall_triceps_extension,
  sphinx_pushup,
  close_grip_pushup,
  band_overhead_triceps_ext,
  db_kickback,
  db_overhead_triceps_ext,
  triceps_pushdown,
  triceps_dip_bars,
  ring_triceps_extension,
};
