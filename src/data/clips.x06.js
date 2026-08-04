/*
 * clips.x06.js — bespoke per-exercise animations, vertical-pull batch.
 *
 * Keys are EXERCISE IDs (see docs/clip-assignments.json, entry "x06"), so each
 * one wins over the shared pullup / lat_pulldown clip in clips.index.js.
 *
 * House rules followed here (same as clips.core.js):
 *   - A limb uses ONE representation for the whole clip: IK targets
 *     (handL / footPtR / ...) or FK arrays (armL / legR). lerpPose hard-switches
 *     when a key adds or drops a target, which pops the limb.
 *   - `bend` is taken from the FIRST key of a segment, so it never changes
 *     inside a clip.
 *   - Hands on a bar, rings or handles are pinned with IK at the exact prop
 *     coordinates and hold them in every key, so the grip never slides.
 *   - Anything hanging from a bar sets `ground: false` — the feet legitimately
 *     hang below the floor line.
 *   - Angles stay sign-continuous inside a clip (see rig.js).
 *   - t:1 reuses the exact t:0 pose OBJECT, so the loop never jumps.
 *
 * What separates these clips from a generic pull-up: the GRIP (wide, neutral,
 * rings that rotate in), the SUPPORT (kneeling, seated, lying, prone) and the
 * TEMPO (a five-second negative is not a rep at normal speed).
 */

import { p, STAND, SEATED, KNEELING } from '../core/poses.js';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ANKLE = 86.8;            // ankle height for a foot flat on the floor
const FLOOR_HAND = 87.4;       // palm flat on the floor

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.44, props: [] }, cfg);
}

/* Feet planted under a standing figure whose pelvis sits at y = 57. */
const PLANTED = {
  footPtL: { x: 48.6, y: ANKLE, bend: 1 },
  footPtR: { x: 51.4, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const TALL = p(STAND, Object.assign({ x: 50, y: 57 }, PLANTED));

/* ================================================================== *
 * 1. NO EQUIPMENT — the two drills a beginner can do on day one
 * ================================================================== */

/* Self-resisted towel pulldown. One arm holds the towel high, the other pulls
   down against it and never wins: nothing travels, the effort shows in the
   braced trunk and the working elbow driving into the ribs. */

const TOW_HOLD = p(TALL, {
  handL: { x: 55.0, y: 14.0, bend: 1 },
  handR: { x: 58.4, y: 45.0, bend: -1 },
});

const TOW_STRAIN = p(TALL, {
  spine: 89.2, head: 87.4,
  handL: { x: 55.2, y: 14.3, bend: 1 },
  handR: { x: 58.1, y: 45.3, bend: -1 },
});

const TOW_BREATHE = p(TALL, {
  spine: 90.3, head: 90.6,
  handL: { x: 54.9, y: 13.8, bend: 1 },
  handR: { x: 58.5, y: 44.8, bend: -1 },
});

const towel_pulldown_iso = clip({
  id: 'towel_pulldown_iso',
  duration: 4200,
  hero: 0,
  props: [{ type: 'band', x0: 55, y0: 14, x1: 58.4, y1: 45, sag: 1.5 }],
  keys: [
    { t: 0, pose: TOW_HOLD },
    { t: 0.3, pose: TOW_STRAIN, ease: 'out' },
    { t: 0.55, pose: TOW_BREATHE },
    { t: 0.8, pose: TOW_STRAIN, ease: 'out' },
    { t: 1, pose: TOW_HOLD },
  ],
});

/* Prone floor lat slide. Face down, arms overhead in a Y, palms brushing the
   floor all the way back to the armpits. The chest deliberately does NOT lift —
   that is the whole point, and it is what separates this from a Y-raise. */

const PRONE = {
  x: 44, y: 84.2, spine: 6, head: 4,
  legL: [181, 178], legR: [186, 184],
  footL: 198, footR: 202,
};

const SLIDE_LONG = p(PRONE, {
  handL: { x: 88.4, y: FLOOR_HAND, bend: 1 },
  handR: { x: 86.4, y: 88.2, bend: 1 },
});

const SLIDE_MID = p(PRONE, {
  spine: 6.5, head: 6,
  handL: { x: 78.0, y: FLOOR_HAND, bend: 1 },
  handR: { x: 76.0, y: 88.2, bend: 1 },
});

const SLIDE_PIT = p(PRONE, {
  spine: 7, head: 8,
  handL: { x: 69.0, y: FLOOR_HAND, bend: 1 },
  handR: { x: 67.0, y: 88.2, bend: 1 },
});

const SLIDE_HOLD = p(PRONE, {
  spine: 7, head: 8,
  handL: { x: 69.6, y: FLOOR_HAND, bend: 1 },
  handR: { x: 67.6, y: 88.2, bend: 1 },
});

const prone_lat_pull_slide = clip({
  id: 'prone_lat_pull_slide',
  duration: 3400,
  hero: 0.46,
  props: [{ type: 'mat', x: 52, w: 92 }],
  keys: [
    { t: 0, pose: SLIDE_LONG },
    { t: 0.24, pose: SLIDE_MID },
    { t: 0.44, pose: SLIDE_PIT },
    { t: 0.58, pose: SLIDE_HOLD },
    { t: 1, pose: SLIDE_LONG },
  ],
});

/* ================================================================== *
 * 2. STRAIGHT-ARM WORK — the lat does the whole job, the elbow never bends
 * ================================================================== */

/* Band version: stand tall under a high anchor, sweep a long straight arc down
   to the hips. The band is slack at the top and hardest at the bottom, so the
   tempo is quick up and braked on the way in. */

const BSA_UP = p(TALL, {
  handL: { x: 65.5, y: 19.5, bend: -1 },
  handR: { x: 67.5, y: 22.5, bend: 1 },
});

const BSA_ARC = p(TALL, {
  handL: { x: 70.0, y: 38.0, bend: -1 },
  handR: { x: 71.0, y: 41.0, bend: 1 },
});

const BSA_HIP = p(TALL, {
  spine: 88, head: 88,
  handL: { x: 58.0, y: 54.0, bend: -1 },
  handR: { x: 59.5, y: 54.5, bend: 1 },
});

const BSA_HOLD = p(TALL, {
  spine: 88, head: 88,
  handL: { x: 58.5, y: 53.4, bend: -1 },
  handR: { x: 60.0, y: 53.9, bend: 1 },
});

const band_straight_arm_pulldown = clip({
  id: 'band_straight_arm_pulldown',
  duration: 2400,
  hero: 0.24,
  props: [
    { type: 'bar', x: 82, y: 8, w: 20, posts: false },
    { type: 'band', x0: 80, y0: 9, x1: 70, y1: 38, sag: 3 },
  ],
  keys: [
    { t: 0, pose: BSA_UP },
    { t: 0.24, pose: BSA_ARC },
    { t: 0.44, pose: BSA_HIP },
    { t: 0.56, pose: BSA_HOLD },
    { t: 1, pose: BSA_UP },
  ],
});

/* Cable version: hips back, torso tipped forward and LOCKED there, staggered
   stance, and the rep finishes with a real pause at the thighs. */

const SAP_BASE = {
  x: 48, y: 58, spine: 78, head: 76,
  footPtL: { x: 43.0, y: ANKLE, bend: 1 },
  footPtR: { x: 52.0, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const SAP_UP = p(SAP_BASE, {
  handL: { x: 70.5, y: 24.0, bend: -1 },
  handR: { x: 72.0, y: 27.0, bend: 1 },
});

const SAP_ARC = p(SAP_BASE, {
  handL: { x: 74.0, y: 40.0, bend: -1 },
  handR: { x: 73.0, y: 44.0, bend: 1 },
});

const SAP_THIGH = p(SAP_BASE, {
  handL: { x: 61.0, y: 54.5, bend: -1 },
  handR: { x: 64.5, y: 54.0, bend: 1 },
});

const SAP_HOLD = p(SAP_BASE, {
  handL: { x: 61.4, y: 53.9, bend: -1 },
  handR: { x: 64.9, y: 53.4, bend: 1 },
});

const straight_arm_pulldown = clip({
  id: 'straight_arm_pulldown',
  duration: 2900,
  hero: 0.24,
  props: [
    { type: 'machine', x: 91, y: 14, w: 14, h: 62 },
    { type: 'band', x0: 85, y0: 18, x1: 74, y1: 40, sag: 3 },
  ],
  keys: [
    { t: 0, pose: SAP_UP },
    { t: 0.24, pose: SAP_ARC },
    { t: 0.44, pose: SAP_THIGH },
    { t: 0.58, pose: SAP_HOLD },
    { t: 1, pose: SAP_UP, ease: 'linear' },
  ],
});

/* ================================================================== *
 * 3. HANGING FROM A BAR — ground:false, the feet hang past the floor line
 * ================================================================== */

const BAR_PROP = { type: 'bar', x: 50, y: 15, w: 46, posts: true };

/* Ankles crossed behind, which is how anyone actually hangs once the legs are
   bent — and it keeps the two shins from reading as one thick limb. */
const CROSSED = { legL: [-58, -128], legR: [-66, -120], footL: -30, footR: -34 };

/* Negative pull-up: the clip STARTS at the top and spends three quarters of its
   run coming down. The return is deliberately quick — you step or jump back up,
   the descent is the exercise. */

const NEG_TOP = p(STAND, Object.assign({
  x: 50, y: 49.2, spine: 88, head: 84,
  handL: { x: 47, y: 15, bend: 1 },
  handR: { x: 53, y: 15, bend: 1 },
}, CROSSED));

const NEG_HIGH = p(NEG_TOP, { y: 51.5, spine: 89, head: 86 });
const NEG_HALF = p(NEG_TOP, { y: 55.5, spine: 90, head: 89 });
const NEG_DEAD = p(NEG_TOP, { y: 60.5, spine: 90, head: 90 });

const negative_pullup = clip({
  id: 'negative_pullup',
  duration: 5000,
  ground: false,
  hero: 0,
  props: [BAR_PROP],
  keys: [
    { t: 0, pose: NEG_TOP },
    { t: 0.16, pose: NEG_HIGH, ease: 'linear' },
    { t: 0.44, pose: NEG_HALF, ease: 'linear' },
    { t: 0.74, pose: NEG_DEAD, ease: 'linear' },
    { t: 1, pose: NEG_TOP, ease: 'in' },
  ],
});

/* Neutral grip: palms facing each other on parallel handles, so in profile the
   two hands stack in depth instead of spreading along the bar. The elbows stay
   in front of the ribs and the chest — not the chin — meets the handles. */

const NG_HANG = {
  x: 50, y: 59.5, spine: 90, head: 90,
  handL: { x: 48.8, y: 13.8, bend: 1 },
  handR: { x: 51.2, y: 16.2, bend: 1 },
  legL: [-84, -94], legR: [-96, -86],
  footL: -14, footR: -18,
};

const NG_MID = p(NG_HANG, { y: 54, spine: 89, head: 89 });
const NG_TOP = p(NG_HANG, { y: 48, spine: 87, head: 86, legL: [-80, -98], legR: [-100, -82] });
const NG_HOLD = p(NG_TOP, { y: 48.6, spine: 87.4, head: 86.4 });

const neutral_grip_pullup = clip({
  id: 'neutral_grip_pullup',
  duration: 2900,
  ground: false,
  hero: 0.4,
  props: [{ type: 'dipbars', x: 50, y: 15, w: 18, gap: 2.6 }],
  keys: [
    { t: 0, pose: NG_HANG },
    { t: 0.34, pose: NG_TOP },
    { t: 0.46, pose: NG_HOLD },
    { t: 0.74, pose: NG_MID },
    { t: 1, pose: NG_HANG },
  ],
});

/* Weighted: a plate on a dip belt between the knees. Everything is slower and
   the rep grinds through the middle, but the range is still honest — chin over
   the bar, arms straight at the bottom. */

const WP_HANG = {
  x: 50, y: 60.4, spine: 90, head: 90,
  handL: { x: 47, y: 15, bend: 1 },
  handR: { x: 53, y: 15, bend: 1 },
  legL: [-70, -118], legR: [-78, -110],
  footL: -34, footR: -38,
};

const WP_STICK = p(WP_HANG, { y: 55.5, spine: 89, head: 88 });
const WP_TOP = p(WP_HANG, { y: 50.4, spine: 87, head: 84, legL: [-66, -122], legR: [-74, -114] });
const WP_HOLD = p(WP_TOP, { y: 51.0, spine: 87.4, head: 84.6 });

const weighted_pullup = clip({
  id: 'weighted_pullup',
  duration: 3800,
  ground: false,
  hero: 0,
  props: [
    BAR_PROP,
    { type: 'band', x0: 49, y0: 63, x1: 42.5, y1: 73, sag: 1 },
    { type: 'box', x: 40, y: 72, w: 13, h: 5 },
  ],
  keys: [
    { t: 0, pose: WP_HANG },
    { t: 0.3, pose: WP_STICK, ease: 'linear' },
    { t: 0.46, pose: WP_TOP },
    { t: 0.58, pose: WP_HOLD },
    { t: 1, pose: WP_HANG, ease: 'linear' },
  ],
});

/* Rings: the straps let the grip rotate, so the hands start wide and pronated
   and finish turned in and close under the chest. The body stays welded — no
   swing — which is most of the difficulty. */

const RP_HANG = {
  x: 50, y: 60.4, spine: 90, head: 90,
  handL: { x: 45.5, y: 15, bend: 1 },
  handR: { x: 54.5, y: 15, bend: 1 },
  legL: [-86, -93], legR: [-94, -87],
  footL: -12, footR: -16,
};

const RP_MID = p(RP_HANG, {
  y: 55,
  handL: { x: 46.5, y: 15, bend: 1 },
  handR: { x: 53.5, y: 15, bend: 1 },
});

const RP_TOP = p(RP_HANG, {
  y: 50, spine: 88, head: 87,
  handL: { x: 47.6, y: 15, bend: 1 },
  handR: { x: 52.4, y: 15, bend: 1 },
  legL: [-82, -96], legR: [-98, -84],
});

const RP_HOLD = p(RP_TOP, {
  y: 50.6, spine: 88.4, head: 87.4,
  handL: { x: 47.8, y: 15, bend: 1 },
  handR: { x: 52.2, y: 15, bend: 1 },
});

const ring_pullup = clip({
  id: 'ring_pullup',
  duration: 3000,
  ground: false,
  hero: 0,
  props: [{ type: 'rings', x: 50, y: 15, w: 9, y0: 4 }],
  keys: [
    { t: 0, pose: RP_HANG },
    { t: 0.34, pose: RP_TOP },
    { t: 0.48, pose: RP_HOLD },
    { t: 0.74, pose: RP_MID },
    { t: 1, pose: RP_HANG },
  ],
});

/* ================================================================== *
 * 4. SUPPORTED PULLOVERS — kneeling and lying, arms long
 * ================================================================== */

/* TRX pullover: kneeling, so the hips cannot swing and the lats have to move
   the straps. The knees never leave the floor; the torso rises from a forward
   lean to upright as the hands arc down to the thighs. */

const TRX_KNEEL = p(KNEELING, {
  x: 50, y: 72,
  legL: [-90, 180], legR: [-95, 175],
  footL: 170, footR: 174,
});

const TRX_OVER = p(TRX_KNEEL, {
  spine: 70, head: 66,
  handL: { x: 73.0, y: 35.6, bend: -1 },
  handR: { x: 75.4, y: 41.0, bend: 1 },
});

const TRX_ARC = p(TRX_KNEEL, {
  spine: 77, head: 74,
  handL: { x: 74.4, y: 46.5, bend: -1 },
  handR: { x: 76.4, y: 52.0, bend: 1 },
});

const TRX_THIGH = p(TRX_KNEEL, {
  spine: 84, head: 82,
  handL: { x: 65.0, y: 63.0, bend: -1 },
  handR: { x: 68.0, y: 66.4, bend: 1 },
});

const TRX_HOLD = p(TRX_KNEEL, {
  spine: 83.4, head: 81.4,
  handL: { x: 65.4, y: 62.4, bend: -1 },
  handR: { x: 68.4, y: 65.8, bend: 1 },
});

const trx_lat_pullover = clip({
  id: 'trx_lat_pullover',
  duration: 3000,
  hero: 0.24,
  props: [
    { type: 'bar', x: 88, y: 6, w: 18, posts: false },
    { type: 'band', x0: 85, y0: 7, x1: 75, y1: 48, sag: 2 },
    { type: 'band', x0: 90, y0: 7, x1: 76, y1: 51, sag: 2 },
  ],
  keys: [
    { t: 0, pose: TRX_OVER },
    { t: 0.24, pose: TRX_ARC },
    { t: 0.44, pose: TRX_THIGH },
    { t: 0.58, pose: TRX_HOLD },
    { t: 1, pose: TRX_OVER },
  ],
});

/* Dumbbell pullover: lying on the bench, ONE bell in both hands — the two hands
   sit almost on top of each other, which is exactly how it looks from the side.
   The pause is at the stretch, and the rep stops before the ribs flare. */

const PLO_BASE = {
  x: 36, y: 62, spine: 6, head: 8,
  footPtL: { x: 24.0, y: 87.2, bend: 1 },
  footPtR: { x: 27.5, y: 87.4, bend: 1 },
  footL: 2, footR: 4,
  load: 'dumbbell',
};

const PLO_CHEST = p(PLO_BASE, {
  handL: { x: 60.0, y: 40.0, bend: -1 },
  handR: { x: 58.5, y: 41.6, bend: -1 },
});

const PLO_ARC = p(PLO_BASE, {
  handL: { x: 74.0, y: 49.0, bend: -1 },
  handR: { x: 72.5, y: 50.5, bend: -1 },
});

const PLO_STRETCH = p(PLO_BASE, {
  handL: { x: 78.0, y: 66.0, bend: -1 },
  handR: { x: 76.5, y: 67.0, bend: -1 },
});

const PLO_HOLD = p(PLO_BASE, {
  handL: { x: 77.6, y: 65.3, bend: -1 },
  handR: { x: 76.1, y: 66.3, bend: -1 },
});

const db_lat_pullover = clip({
  id: 'db_lat_pullover',
  duration: 3200,
  hero: 0.46,
  props: [{ type: 'bench', x: 46, y: 65, w: 40, h: 5 }],
  keys: [
    { t: 0, pose: PLO_CHEST },
    { t: 0.26, pose: PLO_ARC },
    { t: 0.46, pose: PLO_STRETCH },
    { t: 0.6, pose: PLO_HOLD },
    { t: 1, pose: PLO_CHEST },
  ],
});

/* ================================================================== *
 * 5. MACHINES
 * ================================================================== */

/* Seated legs: FK, because two IK feet at the same height put both knees in
   exactly the same place and the pair reads as one thick leg. */
const SIT_LEGS = { legL: [-8, -88], legR: [-16, -98], footL: 2, footR: 4 };

/* Lat pulldown: thighs locked under the pad, chest up, wide grip, bar to the
   collarbone — and the arms straighten completely at the top of every rep. */

const LPD_SEAT = p(SEATED, Object.assign({ x: 47, y: 68, spine: 88, head: 88, load: 'barbell' }, SIT_LEGS));

const LPD_TOP = p(LPD_SEAT, {
  handL: { x: 42.5, y: 24.0, bend: 1 },
  handR: { x: 53.0, y: 23.5, bend: -1 },
});

const LPD_MID = p(LPD_SEAT, {
  spine: 86, head: 86,
  handL: { x: 41.5, y: 34.0, bend: 1 },
  handR: { x: 54.5, y: 33.0, bend: -1 },
});

const LPD_CLAV = p(LPD_SEAT, {
  spine: 84, head: 84,
  handL: { x: 41.0, y: 44.0, bend: 1 },
  handR: { x: 56.0, y: 42.0, bend: -1 },
});

const LPD_HOLD = p(LPD_SEAT, {
  spine: 84.4, head: 84.4,
  handL: { x: 41.3, y: 43.4, bend: 1 },
  handR: { x: 55.7, y: 41.5, bend: -1 },
});

const lat_pulldown = clip({
  id: 'lat_pulldown',
  duration: 2900,
  hero: 0.44,
  props: [
    { type: 'machine', x: 50, y: 4, w: 28, h: 14 },
    { type: 'band', x0: 49, y0: 18, x1: 48, y1: 24, sag: 0 },
    { type: 'bench', x: 44, y: 72, w: 22, h: 5 },
    { type: 'box', x: 58, y: 64, w: 14, h: 4 },
  ],
  keys: [
    { t: 0, pose: LPD_TOP },
    { t: 0.24, pose: LPD_MID },
    { t: 0.44, pose: LPD_CLAV },
    { t: 0.56, pose: LPD_HOLD },
    { t: 1, pose: LPD_TOP },
  ],
});

/* Behind-the-neck: torso bolt upright — no lean at all — the head tips forward
   to let the bar past, the range is short and the tempo is slow. Mobility work
   masquerading as a pulldown, which is why the weight stays light. */

const BNP_SEAT = p(SEATED, Object.assign({ x: 47, y: 68, spine: 89, head: 89, load: 'barbell' }, SIT_LEGS));

const BNP_TOP = p(BNP_SEAT, {
  handL: { x: 42.0, y: 25.0, bend: 1 },
  handR: { x: 52.5, y: 24.0, bend: -1 },
});

const BNP_MID = p(BNP_SEAT, {
  head: 80,
  handL: { x: 41.0, y: 33.5, bend: 1 },
  handR: { x: 53.2, y: 33.0, bend: -1 },
});

const BNP_NECK = p(BNP_SEAT, {
  head: 70,
  handL: { x: 40.0, y: 42.0, bend: 1 },
  handR: { x: 54.0, y: 43.0, bend: -1 },
});

const BNP_HOLD = p(BNP_SEAT, {
  head: 71,
  handL: { x: 40.3, y: 41.4, bend: 1 },
  handR: { x: 54.3, y: 42.4, bend: -1 },
});

const behind_neck_pulldown = clip({
  id: 'behind_neck_pulldown',
  duration: 3200,
  hero: 0.44,
  props: [
    { type: 'machine', x: 50, y: 4, w: 28, h: 14 },
    { type: 'band', x0: 49, y0: 18, x1: 47, y1: 25, sag: 0 },
    { type: 'bench', x: 44, y: 72, w: 22, h: 5 },
    { type: 'box', x: 58, y: 64, w: 14, h: 4 },
  ],
  keys: [
    { t: 0, pose: BNP_TOP },
    { t: 0.26, pose: BNP_MID, ease: 'linear' },
    { t: 0.46, pose: BNP_NECK },
    { t: 0.6, pose: BNP_HOLD },
    { t: 1, pose: BNP_TOP, ease: 'linear' },
  ],
});

/* Assisted machine: knees on the counter-weighted pad inside the frame, so the
   figure is UP in the machine rather than hanging free, and the shins fold back
   behind the pad. Full range — the arms straighten at the bottom. */

const AST_BASE = {
  x: 50, y: 62, spine: 90, head: 90,
  handL: { x: 46, y: 18, bend: 1 },
  handR: { x: 54, y: 18, bend: 1 },
  footPtL: { x: 52.0, y: 75.5, bend: 1 },
  footPtR: { x: 60.5, y: 80.0, bend: 1 },
  footL: -60, footR: -70,
};

const AST_MID = p(AST_BASE, { y: 57.5, spine: 89, head: 89 });
const AST_TOP = p(AST_BASE, { y: 53, spine: 87, head: 86 });
const AST_HOLD = p(AST_BASE, { y: 53.6, spine: 87.4, head: 86.4 });

const assisted_pullup_machine = clip({
  id: 'assisted_pullup_machine',
  duration: 2800,
  hero: 0.4,
  props: [
    { type: 'wall', x: 30, y0: 10, y1: 88 },
    { type: 'wall', x: 76, y0: 10, y1: 88 },
    { type: 'bar', x: 53, y: 10, w: 46, posts: false },
    { type: 'bar', x: 50, y: 18, w: 14, posts: false },
    { type: 'box', x: 64, y: 67, w: 16, h: 4.5 },
  ],
  keys: [
    { t: 0, pose: AST_BASE },
    { t: 0.34, pose: AST_TOP },
    { t: 0.46, pose: AST_HOLD },
    { t: 0.74, pose: AST_MID },
    { t: 1, pose: AST_BASE },
  ],
});

export const X06_CLIPS = {
  towel_pulldown_iso,
  prone_lat_pull_slide,
  band_straight_arm_pulldown,
  negative_pullup,
  neutral_grip_pullup,
  weighted_pullup,
  ring_pullup,
  trx_lat_pullover,
  db_lat_pullover,
  lat_pulldown,
  assisted_pullup_machine,
  behind_neck_pulldown,
  straight_arm_pulldown,
};
