/*
 * clips.x03.js — bespoke per-exercise animations, delts batch.
 *
 * Keys are EXERCISE IDs (see docs/clip-assignments.json, entry "x03"), so each
 * one wins over the shared lateral_raise / reverse_fly clip in clips.index.js.
 *
 * House rules followed here (same as clips.core.js):
 *   - A limb uses ONE representation for the whole clip: IK targets
 *     (handL / footPtR / ...) or FK arrays (armL / legR). lerpPose hard-switches
 *     when a key adds or drops a target, which pops the limb.
 *   - `bend` is taken from the FIRST key of a segment, so it never changes
 *     inside a clip.
 *   - Anything resting on the floor is pinned: ankles at y = 86.8 (GROUND 88,
 *     the foot capsule fills the rest), hands flat on the floor at y = 87.2.
 *   - Angles stay sign-continuous inside a clip (see rig.js).
 *   - t:1 reuses the exact t:0 pose OBJECT, so the loop never jumps.
 *
 * Side view: the figure faces +x. "L" is the far side (drawn dim, behind the
 * torso), "R" is the near side. A movement that happens across the frontal
 * plane — a lateral raise, a rear fly — is drawn by splitting the two arms so
 * the pair reads as opening, never as one thick limb.
 */

import { p, STAND, SEATED } from '../core/poses.js';

import { repKeys } from '../core/anim.js';
/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ANKLE = 86.8;                 // ankle height for a foot flat on the floor
const SHOULDER_UP = 26 * 0.88;      // pelvis -> shoulder distance along the spine

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.44, props: [] }, cfg);
}

/** Pelvis that puts the shoulder joint exactly at (sx, sy) for a spine angle. */
function hipsFor(sx, sy, spine) {
  const r = (spine * Math.PI) / 180;
  return { x: sx - SHOULDER_UP * Math.cos(r), y: sy + SHOULDER_UP * Math.sin(r), spine };
}

/** An IK hand target `dist` away from (sx, sy) at `deg` (math convention). */
function reach(sx, sy, deg, dist, bend) {
  const r = (deg * Math.PI) / 180;
  return { x: +(sx + dist * Math.cos(r)).toFixed(2), y: +(sy - dist * Math.sin(r)).toFixed(2), bend };
}

/* Feet planted under a standing figure whose pelvis sits at y = 57. */
const PLANTED = {
  footPtL: { x: 48.6, y: ANKLE, bend: 1 },
  footPtR: { x: 51.4, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

/** Standing, feet welded to the floor. Shoulder lands at (50, 34.12). */
const TALL = p(STAND, Object.assign({ x: 50, y: 57 }, PLANTED));

/*
 * The same figure turned to FACE the viewer.
 *
 * The clips below already placed their hands symmetrically about x = 50, which
 * is what a frontal-plane movement looks like — but the rig solved both arms
 * from a single shoulder point at the centre of the chest, so the pair sprouted
 * from one spot and the raise read as one thick limb splitting in two. `spread`
 * separates the shoulders and the hips, and the existing targets suddenly draw
 * the exercise they were always describing.
 *
 * Feet turn out slightly, because two feet both pointing the same way is the
 * one detail that still says "profile" no matter how the arms are drawn.
 */
const FACING = p(TALL, {
  spread: 13,
  footPtL: { x: 44.6, y: ANKLE, bend: 1 },
  footPtR: { x: 55.4, y: ANKLE, bend: 1 },
  footL: 172, footR: 8,
});

/* ================================================================== *
 * 1. LATERAL — the frontal-plane raises
 * ================================================================== */

/* Isometric hold: nothing travels. The arms hang on at shoulder height while
   the ribcage breathes, the elbows sag a hair and get pulled back up. */

const LRH_HOLD = p(FACING, {
  handL: { x: 22.6, y: 34.4, bend: -1 },
  handR: { x: 77.4, y: 35.0, bend: 1 },
});

const LRH_SAG = p(FACING, {
  spine: 89.2, head: 88.6,
  handL: { x: 23.0, y: 36.6, bend: -1 },
  handR: { x: 77.0, y: 37.2, bend: 1 },
});

const LRH_LIFT = p(FACING, {
  spine: 90.4, head: 90.6,
  handL: { x: 22.4, y: 33.6, bend: -1 },
  handR: { x: 77.6, y: 34.2, bend: 1 },
});

const lateral_raise_hold = clip({
  id: 'lateral_raise_hold',
  duration: 4400,
  hero: 0,
  keys: [
    { t: 0, pose: LRH_HOLD },
    { t: 0.3, pose: LRH_SAG, ease: 'out' },
    { t: 0.52, pose: LRH_LIFT },
    { t: 0.8, pose: LRH_SAG, ease: 'out' },
    { t: 1, pose: LRH_HOLD },
  ],
});

/* Self-resisted: the near arm raises, the far hand rides its forearm and
   presses down the whole way. Only one side works — the far arm is the brake. */

const SRL_DOWN = p(TALL, {
  handR: { x: 56, y: 55.5, bend: 1 },
  handL: { x: 56.3, y: 50.3, bend: -1 },
});

const SRL_MID = p(TALL, {
  handR: { x: 64.5, y: 45.5, bend: 1 },
  handL: { x: 63.4, y: 40.4, bend: -1 },
});

const SRL_TOP = p(TALL, {
  handR: { x: 70, y: 36.5, bend: 1 },
  handL: { x: 66.0, y: 33.3, bend: -1 },
});

const SRL_HOLD = p(TALL, {
  handR: { x: 69.4, y: 37.2, bend: 1 },
  handL: { x: 65.6, y: 33.7, bend: -1 },
});

const self_resisted_lateral_raise = clip({
  id: 'self_resisted_lateral_raise',
  duration: 3600,
  hero: 0.4,
  keys: [
    { t: 0, pose: SRL_DOWN },
    { t: 0.24, pose: SRL_MID },
    { t: 0.42, pose: SRL_TOP },
    { t: 0.54, pose: SRL_HOLD },
    { t: 1, pose: SRL_DOWN, ease: 'linear' },
  ],
});

/* Band: standing on the middle of the band, so the resistance grows as the
   hands rise. Elbows stay softly bent — the band never lets them lock. */

const BLR_DOWN = p(FACING, {
  handL: { x: 42.6, y: 56.4, bend: -1 },
  handR: { x: 57.4, y: 56.4, bend: 1 },
});

const BLR_MID = p(FACING, {
  handL: { x: 35.5, y: 46.5, bend: -1 },
  handR: { x: 64.5, y: 47.2, bend: 1 },
});

const BLR_TOP = p(FACING, {
  handL: { x: 30.2, y: 37.0, bend: -1 },
  handR: { x: 69.8, y: 38.0, bend: 1 },
});

const BLR_HOLD = p(FACING, {
  handL: { x: 30.6, y: 37.6, bend: -1 },
  handR: { x: 69.4, y: 38.6, bend: 1 },
});

const band_lateral_raise = clip({
  id: 'band_lateral_raise',
  duration: 2600,
  hero: 0.4,
  props: [
    { type: 'band', x0: 48.6, y0: 86.8, x1: 30.2, y1: 37.0, sag: 4 },
    { type: 'band', x0: 51.4, y0: 86.8, x1: 69.8, y1: 38.0, sag: 4 },
  ],
  keys: [
    { t: 0, pose: BLR_DOWN },
    { t: 0.22, pose: BLR_MID },
    { t: 0.4, pose: BLR_TOP },
    { t: 0.52, pose: BLR_HOLD },
    { t: 1, pose: BLR_DOWN },
  ],
});

/* Dumbbell lateral raise: strict. The elbow leads — at the top each hand sits
   BELOW its own elbow — the body never sways, and the eccentric is the long
   half of the clip. */

const DLR_DOWN = p(FACING, {
  load: 'dumbbell',
  handL: { x: 42.4, y: 57.2, bend: -1 },
  handR: { x: 57.6, y: 57.2, bend: 1 },
});

const DLR_MID = p(DLR_DOWN, {
  handL: { x: 34.6, y: 48.2, bend: -1 },
  handR: { x: 65.4, y: 49.0, bend: 1 },
});

const DLR_TOP = p(DLR_DOWN, {
  handL: { x: 28.0, y: 36.4, bend: -1 },
  handR: { x: 72.0, y: 37.2, bend: 1 },
});

const DLR_HOLD = p(DLR_DOWN, {
  handL: { x: 28.4, y: 36.9, bend: -1 },
  handR: { x: 71.6, y: 37.7, bend: 1 },
});

const db_lateral_raise = clip({
  id: 'db_lateral_raise',
  duration: 3000,
  hero: 0.4,
  keys: [
    { t: 0, pose: DLR_DOWN },
    { t: 0.2, pose: DLR_MID },
    { t: 0.36, pose: DLR_TOP },
    { t: 0.5, pose: DLR_HOLD },
    { t: 1, pose: DLR_DOWN, ease: 'linear' },
  ],
});

/* Scaption: 30 degrees in front of the frontal plane. Both hands stay FORWARD
   of the body the whole way and finish in a shallow V at shoulder height —
   never out to the sides, never parallel like a front raise. */

/* Scaption is the plane between a front raise and a lateral one, so it is drawn
   on the same camera as the lateral raise — facing — with the arms carried
   NARROWER than a true lateral. Side-on it was two hands four units apart
   travelling the same line, which is a front raise. */
const SCP_DOWN = p(FACING, {
  load: 'dumbbell',
  handL: { x: 41.5, y: 57.2, bend: -1 },
  handR: { x: 58.5, y: 57.2, bend: 1 },
});

const SCP_MID = p(SCP_DOWN, {
  handL: { x: 35.5, y: 46.5, bend: -1 },
  handR: { x: 64.5, y: 46.5, bend: 1 },
});

const SCP_TOP = p(SCP_DOWN, {
  handL: { x: 30.5, y: 33.5, bend: -1 },
  handR: { x: 69.5, y: 33.5, bend: 1 },
});

const SCP_HOLD = p(SCP_DOWN, {
  handL: { x: 31.2, y: 34.1, bend: -1 },
  handR: { x: 68.8, y: 34.1, bend: 1 },
});

const db_scaption_raise = clip({
  id: 'db_scaption_raise',
  duration: 2900,
  hero: 0.4,
  keys: repKeys(SCP_DOWN, SCP_TOP, SCP_HOLD, { mode: 'lift' }),
});

/* Upright row: the bar rides up the shirt, so the hands barely move sideways —
   what travels is the ELBOWS, which flare out past the shoulders and finish
   above the wrists. The bar stops at the chest, not the chin. */

const UPR_DOWN = p(FACING, {
  load: 'barbell',
  handL: { x: 48.2, y: 56.5, bend: -1 },
  handR: { x: 51.8, y: 56.5, bend: 1 },
});

const UPR_MID = p(UPR_DOWN, {
  handL: { x: 48.4, y: 50.5, bend: -1 },
  handR: { x: 51.6, y: 50.5, bend: 1 },
});

const UPR_TOP = p(UPR_DOWN, {
  spine: 91, head: 92,
  handL: { x: 48.6, y: 45.0, bend: -1 },
  handR: { x: 51.4, y: 45.0, bend: 1 },
});

const UPR_HOLD = p(UPR_DOWN, {
  spine: 90.6, head: 91.4,
  handL: { x: 48.6, y: 45.6, bend: -1 },
  handR: { x: 51.4, y: 45.6, bend: 1 },
});

const bb_upright_row = clip({
  id: 'bb_upright_row',
  duration: 2800,
  hero: 0.42,
  keys: [
    { t: 0, pose: UPR_DOWN },
    { t: 0.22, pose: UPR_MID },
    { t: 0.4, pose: UPR_TOP },
    { t: 0.52, pose: UPR_HOLD },
    { t: 1, pose: UPR_DOWN },
  ],
});

/* Cable lateral raise: one arm only. The cable runs from a low pulley BEHIND
   the body, so the hand starts across the midline and never returns to the
   thigh — the stack keeps pulling, so the bottom of every rep still has load. */

const CLR_LOW = p(TALL, {
  handR: { x: 53.5, y: 54.0, bend: 1 },
  handL: { x: 46.0, y: 56.0, bend: -1 },
});

const CLR_MID = p(CLR_LOW, {
  handR: { x: 63.0, y: 45.0, bend: 1 },
});

const CLR_TOP = p(CLR_LOW, {
  handR: { x: 72.0, y: 36.0, bend: 1 },
});

const CLR_HOLD = p(CLR_LOW, {
  handR: { x: 71.5, y: 36.7, bend: 1 },
});

const cable_lateral_raise = clip({
  id: 'cable_lateral_raise',
  duration: 3000,
  hero: 0.42,
  props: [
    { type: 'machine', x: 12, y: 46, w: 14, h: 42 },
    { type: 'band', x0: 12, y0: 78, x1: 72, y1: 36, sag: 6 },
  ],
  keys: [
    { t: 0, pose: CLR_LOW },
    { t: 0.24, pose: CLR_MID },
    { t: 0.42, pose: CLR_TOP },
    { t: 0.54, pose: CLR_HOLD },
    { t: 1, pose: CLR_LOW, ease: 'linear' },
  ],
});

/* ================================================================== *
 * 2. RINGS — body-weight delt work, feet planted, body a rigid plank
 * The whole figure rotates about the heels; the straps let the hands
 * travel, which is the only way straight arms can move at all.
 * ================================================================== */

const RING_FEET = {
  footPtL: { x: 11.5, y: 87.2, bend: -1 },
  footPtR: { x: 13.8, y: 87.4, bend: -1 },
  footL: 62, footR: 62,
};

/** Rigid body leaning back from the heels at `deg`, shoulder 51 from the feet. */
function leaner(deg) {
  const r = (deg * Math.PI) / 180;
  const sx = 12.6 + 51 * Math.cos(r);
  const sy = 87.3 - 51 * Math.sin(r);
  return { sx, sy, base: p(hipsFor(sx, sy, deg), Object.assign({ head: deg - 4 }, RING_FEET)) };
}

/* Y-raise: from arms hanging straight up the strap to a wide Y past the ears,
   the body rising a few degrees as the delts take over. */

const RYR_LOW = leaner(28);
const RYR_HIGH = leaner(44);

const RYR_HANG = p(RYR_LOW.base, {
  handL: reach(RYR_LOW.sx, RYR_LOW.sy, 96, 20.9, -1),
  handR: reach(RYR_LOW.sx, RYR_LOW.sy, 84, 20.9, 1),
});

const RYR_Y = p(RYR_HIGH.base, {
  handL: reach(RYR_HIGH.sx, RYR_HIGH.sy, 95, 21, -1),
  handR: reach(RYR_HIGH.sx, RYR_HIGH.sy, 42, 21, 1),
});

const RYR_HOLD = p(RYR_HIGH.base, {
  handL: reach(RYR_HIGH.sx, RYR_HIGH.sy, 94, 20.8, -1),
  handR: reach(RYR_HIGH.sx, RYR_HIGH.sy, 43, 20.8, 1),
});

const ring_y_raise = clip({
  id: 'ring_y_raise',
  duration: 3200,
  hero: 0.44,
  props: [{ type: 'rings', x: 57, y: 38.5, w: 11, y0: 5 }],
  keys: repKeys(RYR_HANG, RYR_Y, RYR_HOLD, { mode: 'lift' }),
});

/* Ring reverse fly: same lean, but the arms open sideways into a wide T
   instead of sweeping past the head. The body only rises a few degrees —
   the further back you start, the harder it gets. */

const RRF_LOW = leaner(26);
const RRF_HIGH = leaner(36);

const RRF_HANG = p(RRF_LOW.base, {
  handL: reach(RRF_LOW.sx, RRF_LOW.sy, 96, 20.8, -1),
  handR: reach(RRF_LOW.sx, RRF_LOW.sy, 85, 20.8, 1),
});

const RRF_OPEN = p(RRF_HIGH.base, {
  handL: reach(RRF_HIGH.sx, RRF_HIGH.sy, 158, 18.6, -1),
  handR: reach(RRF_HIGH.sx, RRF_HIGH.sy, 24, 19, 1),
});

const RRF_HOLD = p(RRF_HIGH.base, {
  handL: reach(RRF_HIGH.sx, RRF_HIGH.sy, 156, 18.4, -1),
  handR: reach(RRF_HIGH.sx, RRF_HIGH.sy, 26, 18.8, 1),
});

const ring_reverse_fly = clip({
  id: 'ring_reverse_fly',
  duration: 3000,
  hero: 0.44,
  props: [{ type: 'rings', x: 56.5, y: 45.5, w: 15, y0: 5 }],
  keys: repKeys(RRF_HANG, RRF_OPEN, RRF_HOLD, { mode: 'lift' }),
});

/* ================================================================== *
 * 3. REAR DELTS — wall, floor, bench, machine
 * ================================================================== */

/* Wall angel: the spine is glued to the wall and never moves. Only the arms
   slide — from a bent goalpost up to nearly straight overhead, and the rep
   stops the moment the forearms would leave the bricks. */

const WALL_X = 30;

const WA_BASE = p(STAND, {
  x: 34.2, y: 57, spine: 90, head: 90,
  footPtL: { x: 33.0, y: ANKLE, bend: 1 },
  footPtR: { x: 35.8, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
});

const WA_LOW = p(WA_BASE, {
  handL: { x: 39.0, y: 26.0, bend: -1 },
  handR: { x: 42.5, y: 29.5, bend: -1 },
});

const WA_MID = p(WA_BASE, {
  handL: { x: 37.4, y: 19.5, bend: -1 },
  handR: { x: 40.8, y: 22.5, bend: -1 },
});

const WA_HIGH = p(WA_BASE, {
  handL: { x: 36.0, y: 13.0, bend: -1 },
  handR: { x: 39.2, y: 15.6, bend: -1 },
});

const WA_HOLD = p(WA_BASE, {
  handL: { x: 36.3, y: 13.6, bend: -1 },
  handR: { x: 39.5, y: 16.2, bend: -1 },
});

const wall_angel = clip({
  id: 'wall_angel',
  duration: 3200,
  hero: 0.42,
  props: [{ type: 'wall', x: WALL_X, y0: 6, y1: 88 }],
  keys: [
    { t: 0, pose: WA_LOW },
    { t: 0.22, pose: WA_MID },
    { t: 0.4, pose: WA_HIGH },
    { t: 0.54, pose: WA_HOLD },
    { t: 1, pose: WA_LOW },
  ],
});

/* Prone floor work. The hips never leave the mat; what lifts is the chest by a
   few degrees and the arms, and the ARM DIRECTION is what separates T from Y:
   the T sweeps up and back, the Y sweeps up and forward past the head. */

const PRONE = {
  x: 44, y: 84.2, spine: 6, head: 4,
  legL: [181, 178], legR: [186, 184],
  footL: 198, footR: 202,
};

const PRONE_SX = 66.76;
const PRONE_SY = 81.81;

const PRONE_UP = p(PRONE, { spine: 11, head: 16 });
const UP_SX = 44 + SHOULDER_UP * Math.cos((11 * Math.PI) / 180);
const UP_SY = 84.2 - SHOULDER_UP * Math.sin((11 * Math.PI) / 180);

/* T-raise — arms out at shoulder line, thumbs up, sweeping up and back. */

const PT_REST = p(PRONE, {
  handL: { x: 49.4, y: 87.2, bend: -1 },
  handR: { x: 52.8, y: 88.0, bend: -1 },
});

const PT_UP = p(PRONE_UP, {
  handL: reach(UP_SX, UP_SY, 128, 19, -1),
  handR: reach(UP_SX, UP_SY, 106, 18.6, -1),
});

const PT_HOLD = p(PRONE_UP, {
  handL: reach(UP_SX, UP_SY, 126, 18.8, -1),
  handR: reach(UP_SX, UP_SY, 104, 18.4, -1),
});

const prone_t_raise = clip({
  id: 'prone_t_raise',
  duration: 3000,
  hero: 0.44,
  props: [{ type: 'mat', x: 46, w: 88 }],
  keys: repKeys(PT_REST, PT_UP, PT_HOLD, { mode: 'lift' }),
});

/* Y-raise — arms start overhead on the floor and lift forward past the ears. */

const PY_REST = p(PRONE, {
  handL: { x: 88.4, y: 87.4, bend: 1 },
  handR: { x: 86.0, y: 88.2, bend: 1 },
});

const PY_UP = p(PRONE_UP, {
  handL: reach(UP_SX, UP_SY, 52, 20.6, 1),
  handR: reach(UP_SX, UP_SY, 31, 20.2, 1),
});

const PY_HOLD = p(PRONE_UP, {
  handL: reach(UP_SX, UP_SY, 50, 20.4, 1),
  handR: reach(UP_SX, UP_SY, 29, 20.0, 1),
});

const prone_y_raise = clip({
  id: 'prone_y_raise',
  duration: 3200,
  hero: 0.44,
  props: [{ type: 'mat', x: 46, w: 88 }],
  keys: repKeys(PY_REST, PY_UP, PY_HOLD, { mode: 'lift' }),
});

/* Bent-over dumbbell reverse fly: a real hinge — chest almost parallel to the
   floor, knees soft, elbows fixed at a slight bend and the hands opening back
   past the hip line. The eccentric is deliberately the long half. */

/*
 * Hinged AND facing the camera. Drawn in profile the two hands both travelled
 * back and up along the same diagonal, four units apart, which is the picture
 * of a bent-over ROW — the one exercise a rear fly most needs to be told apart
 * from. Everything that makes it a fly happens across the frontal plane.
 *
 * rig.js separates the two sides horizontally on screen rather than square to
 * the spine, precisely so a hinged body still shows both arms: hinging turns
 * the body in the plane the camera looks down, so the shoulders stay side by
 * side on screen. Shoulder joints land at (55.4, 52.7) and (66.4, 52.7).
 */
const RF_HINGE = {
  x: 40, y: 62, spine: 24, head: 18, spread: 11,
  footPtL: { x: 34.6, y: ANKLE, bend: 1 },
  footPtR: { x: 45.4, y: ANKLE, bend: 1 },
  footL: 172, footR: 8,
  load: 'dumbbell',
};

const RF_HANG = p(RF_HINGE, {
  handL: { x: 55.4, y: 75.4, bend: -1 },
  handR: { x: 66.4, y: 75.4, bend: 1 },
});

const RF_MID = p(RF_HINGE, {
  handL: { x: 40.2, y: 68.2, bend: -1 },
  handR: { x: 81.6, y: 68.2, bend: 1 },
});

const RF_OPEN = p(RF_HINGE, {
  handL: { x: 33.8, y: 54.2, bend: -1 },
  handR: { x: 88.0, y: 54.2, bend: 1 },
});

const RF_HOLD = p(RF_HINGE, {
  handL: { x: 34.5, y: 54.9, bend: -1 },
  handR: { x: 87.3, y: 54.9, bend: 1 },
});

const db_reverse_fly = clip({
  id: 'db_reverse_fly',
  duration: 3000,
  hero: 0.4,
  keys: repKeys(RF_HANG, RF_OPEN, RF_HOLD, { mode: 'lift' }),
});

/* Chest-supported: face down ON the bench, so the torso cannot cheat at all.
   The arms hang dead vertical at the bottom — that is the giveaway — and the
   squeeze at the top is held for a beat. */

/* Same plane problem as the free version, same answer. Face down on the pad,
   spread across it, arms hanging dead vertical at the bottom and opening into
   a wide T. Shoulder joints land at (52.3, 58.5) and (64.3, 58.5). */
const CSF_BASE = {
  x: 36, y: 60.5, spine: 5, head: 3, spread: 12,
  footPtL: { x: 21.5, y: 86.6, bend: -1 },
  footPtR: { x: 29.5, y: 87.4, bend: -1 },
  footL: 34, footR: 42,
  load: 'dumbbell',
};

const CSF_HANG = p(CSF_BASE, {
  handL: { x: 52.3, y: 81.2, bend: -1 },
  handR: { x: 64.3, y: 81.2, bend: 1 },
});

const CSF_MID = p(CSF_BASE, {
  handL: { x: 37.5, y: 74.8, bend: -1 },
  handR: { x: 79.1, y: 74.8, bend: 1 },
});

const CSF_OPEN = p(CSF_BASE, {
  handL: { x: 30.6, y: 60.2, bend: -1 },
  handR: { x: 86.0, y: 60.2, bend: 1 },
});

const CSF_HOLD = p(CSF_BASE, {
  handL: { x: 31.3, y: 60.8, bend: -1 },
  handR: { x: 85.3, y: 60.8, bend: 1 },
});

const chest_supported_db_reverse_fly = clip({
  id: 'chest_supported_db_reverse_fly',
  duration: 3000,
  hero: 0.4,
  props: [{ type: 'bench', x: 44, y: 63, w: 36, h: 5 }],
  keys: repKeys(CSF_HANG, CSF_OPEN, CSF_HOLD, { mode: 'lift' }),
});

/* Machine reverse fly: seated, chest pinned to the pad, handles set at shoulder
   height. The hands start together in front of the sternum and split wide —
   the torso is the one thing that does not move. */

const MRF_SEAT = p(SEATED, {
  x: 47, y: 68, spine: 88, head: 88,
  legL: [-8, -88], legR: [-16, -98],
  footL: 2, footR: 4,
});

const MRF_IN = p(MRF_SEAT, {
  handL: { x: 65.0, y: 40.0, bend: -1 },
  handR: { x: 66.0, y: 43.4, bend: 1 },
});

const MRF_MID = p(MRF_SEAT, {
  handL: { x: 60.0, y: 33.0, bend: -1 },
  handR: { x: 63.4, y: 50.0, bend: 1 },
});

const MRF_OPEN = p(MRF_SEAT, {
  handL: { x: 54.0, y: 26.5, bend: -1 },
  handR: { x: 60.0, y: 57.6, bend: 1 },
});

const MRF_HOLD = p(MRF_SEAT, {
  handL: { x: 54.5, y: 27.1, bend: -1 },
  handR: { x: 59.6, y: 57.0, bend: 1 },
});

const machine_reverse_fly = clip({
  id: 'machine_reverse_fly',
  duration: 2700,
  hero: 0.42,
  props: [
    { type: 'bench', x: 44, y: 72, w: 22, h: 5 },
    { type: 'machine', x: 55, y: 34, w: 6, h: 24 },
    { type: 'machine', x: 74, y: 20, w: 14, h: 50 },
  ],
  keys: [
    { t: 0, pose: MRF_IN },
    { t: 0.22, pose: MRF_MID },
    { t: 0.4, pose: MRF_OPEN },
    { t: 0.54, pose: MRF_HOLD },
    { t: 1, pose: MRF_IN },
  ],
});

export const X03_CLIPS = {
  lateral_raise_hold,
  self_resisted_lateral_raise,
  band_lateral_raise,
  db_lateral_raise,
  db_scaption_raise,
  bb_upright_row,
  cable_lateral_raise,
  ring_y_raise,
  wall_angel,
  prone_t_raise,
  prone_y_raise,
  db_reverse_fly,
  chest_supported_db_reverse_fly,
  machine_reverse_fly,
  ring_reverse_fly,
};
