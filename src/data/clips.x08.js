/*
 * clips.x08.js — bespoke per-exercise animations for the SQUAT batch.
 *
 * Keys are EXERCISE IDs (docs/clip-assignments.json, entry "x08"), so each one
 * wins over the shared squat / goblet_squat / box_squat / pistol_squat clip in
 * clips.index.js.
 *
 * House rules (src/core/rig.js, src/core/poses.js):
 *   - viewBox 0..100, ground y = 88, angles in math convention (0 = right =
 *     the way the figure faces, 90 = up, -90 = down).
 *   - A limb uses ONE representation for the whole clip: IK targets
 *     (handL / footPtR / ...) or FK arrays (armL / legR). lerpPose hard-switches
 *     when a key adds or drops a target, which pops the limb.
 *   - Anything standing on the floor is pinned at ankle y = 87.2 and holds the
 *     SAME coordinates in every key of its clip.
 *   - Angles stay sign-continuous inside a clip.
 *   - t:1 reuses the exact t:0 pose OBJECT, so the loop never jumps.
 *
 * THIS IS A SQUAT FILE, NOT A HINGE FILE. In every clip below the pelvis
 * travels DOWN far more than it travels back, the knee ends up well FORWARD of
 * the ankle, and the spine never drops below 55 degrees. A hinge is the
 * opposite on all three counts (spine toward 20, knee over the ankle, pelvis
 * going backwards). What separates the nine clips from each other is written
 * above each one: box height, support, grip, depth and tempo are the point.
 */

import { p } from '../core/poses.js';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ANKLE = 87.2;                 // ankle height for a foot flat on the floor
const SHOULDER_UP = 26 * 0.88;      // pelvis -> shoulder distance along the spine

/** Clip defaults, so each entry only states what is interesting about it. */
function clip(cfg) {
  return Object.assign({ ground: true, ease: 'inOut', hero: 0.5, props: [] }, cfg);
}

/** Where the shoulder joint of a {x, y, spine} pose lands. */
function shoulderOf(pose) {
  const r = (pose.spine * Math.PI) / 180;
  return [pose.x + SHOULDER_UP * Math.cos(r), pose.y - SHOULDER_UP * Math.sin(r)];
}

/**
 * Barbell across the traps. Both hands sit on ONE horizontal line so the bar
 * renders level; the far hand is behind the shoulder, the near hand in front,
 * which is what keeps the two arms from merging into one thick limb.
 */
function backRack(pose) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx - 8.8, y: sy - 0.6, bend: 1 },
    handR: { x: sx + 8.2, y: sy - 0.6, bend: -1 },
    load: 'barbell',
  });
}

/** Kettlebell cupped by the horns right under the chin, elbows hanging down. */
function gobletGrip(pose) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx + 4.2, y: sy + 0.6, bend: -1 },
    handR: { x: sx + 5.0, y: sy + 1.4, bend: -1 },
    load: 'kettlebell',
  });
}

/** Band ends gripped at the collarbones, elbows hanging in front. No load. */
function bandGrip(pose) {
  const [sx, sy] = shoulderOf(pose);
  return p(pose, {
    handL: { x: sx + 3.2, y: sy - 1.4, bend: -1 },
    handR: { x: sx + 8.0, y: sy - 1.4, bend: -1 },
  });
}

/* ================================================================== *
 * 1. UNLOADED — the shape of the squat itself
 * ================================================================== */

/* --- bodyweight squat ------------------------------------------------
 * The reference rep. Feet flat and pinned, the pelvis drops 15 units and
 * only 5.6 back, the knees run forward past the toes and the arms sweep up
 * from the sides to straight out front as a counterweight.
 * ------------------------------------------------------------------ */

const BW_FEET = {
  footPtL: { x: 46.8, y: ANKLE, bend: 1 },
  footPtR: { x: 51.2, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const BW_TOP = p(BW_FEET, {
  x: 49.0, y: 57.0, spine: 88, head: 88,
  armL: [-84, -86], armR: [-96, -94],
});

const BW_QTR = p(BW_FEET, {
  x: 47.8, y: 61.8, spine: 80, head: 86,
  armL: [-54, -46], armR: [-64, -56],
});

const BW_PAR = p(BW_FEET, {
  x: 45.6, y: 67.6, spine: 70, head: 81,
  armL: [-24, -12], armR: [-34, -22],
});

const BW_BOT = p(BW_FEET, {
  x: 43.4, y: 72.4, spine: 62, head: 77,
  armL: [2, 12], armR: [-8, 2],
});

const BW_HOLD = p(BW_FEET, {
  x: 43.7, y: 71.8, spine: 63, head: 78,
  armL: [1, 11], armR: [-9, 1],
});

const bodyweight_squat = clip({
  id: 'bodyweight_squat',
  duration: 3000,
  hero: 0.52,
  keys: [
    { t: 0, pose: BW_TOP },
    { t: 0.22, pose: BW_QTR },
    { t: 0.4, pose: BW_PAR },
    { t: 0.52, pose: BW_BOT, ease: 'out' },
    { t: 0.62, pose: BW_HOLD },
    { t: 1, pose: BW_TOP },
  ],
});

/* --- tempo squat -----------------------------------------------------
 * Same joints, different clock — and the clock IS the exercise. Six seconds
 * for one rep: three down at a dead-constant speed (ease 'linear' on both
 * descent segments, not the usual ease-in-out), a second parked at the
 * bottom, two back up. The arms stay out front the whole time instead of
 * swinging, so nothing distracts from the pace.
 * ------------------------------------------------------------------ */

const TS_FEET = {
  footPtL: { x: 47.8, y: ANKLE, bend: 1 },
  footPtR: { x: 51.4, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const TS_TOP = p(TS_FEET, {
  x: 49.6, y: 57.2, spine: 89, head: 89,
  armL: [-26, -18], armR: [-36, -28],
});

const TS_MID = p(TS_FEET, {
  x: 47.6, y: 65.4, spine: 78, head: 84,
  armL: [-12, -4], armR: [-22, -14],
});

const TS_BOT = p(TS_FEET, {
  x: 45.0, y: 73.2, spine: 66, head: 78,
  armL: [0, 8], armR: [-10, -2],
});

const TS_HOLD = p(TS_FEET, {
  x: 45.1, y: 73.0, spine: 66.5, head: 78.5,
  armL: [0.5, 8.5], armR: [-9.5, -1.5],
});

const tempo_squat = clip({
  id: 'tempo_squat',
  duration: 6000,
  hero: 0.55,
  keys: [
    { t: 0, pose: TS_TOP },
    { t: 0.25, pose: TS_MID, ease: 'linear' },
    { t: 0.5, pose: TS_BOT, ease: 'linear' },
    { t: 0.66, pose: TS_HOLD },
    { t: 0.86, pose: TS_MID },
    { t: 1, pose: TS_TOP },
  ],
});

/* ================================================================== *
 * 2. TO A BOX — the pelvis goes BACK, and how far back is the exercise
 * ================================================================== */

/* --- high box squat --------------------------------------------------
 * Level 1. The box is deliberately tall (top at y=70, 18 units of it), so
 * the pelvis only drops 11 and stops well above parallel — that is the whole
 * regression: the higher the box, the less knee. The feet sit further
 * forward than a free squat so the figure can sit BACK to reach it, and the
 * touch is a kiss: one short key, then straight back up.
 * ------------------------------------------------------------------ */

/* Sitting back puts the hip almost directly behind the ankle, which stacks the
   two knees on top of each other. The far foot is therefore set 5 units behind
   the near one and a touch lower, which is what pulls the far knee clear of the
   near one for the whole descent. */
const HB_FEET = {
  footPtL: { x: 51.8, y: 88.0, bend: 1 },
  footPtR: { x: 56.8, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const HB_TOP = p(HB_FEET, {
  x: 54.2, y: 57.4, spine: 87, head: 88,
  armL: [-84, -86], armR: [-96, -94],
});

const HB_BACK = p(HB_FEET, {
  x: 50.0, y: 62.6, spine: 76, head: 84,
  armL: [-40, -30], armR: [-50, -40],
});

const HB_SIT = p(HB_FEET, {
  x: 45.4, y: 68.8, spine: 64, head: 78,
  armL: [-2, 8], armR: [-12, -2],
});

const HB_KISS = p(HB_FEET, {
  x: 45.8, y: 68.1, spine: 65, head: 79,
  armL: [-3, 7], armR: [-13, -3],
});

const box_squat_high = clip({
  id: 'box_squat_high',
  duration: 2600,
  hero: 0.5,
  props: [{ type: 'box', x: 36, y: 70, w: 26, h: 18 }],
  keys: [
    { t: 0, pose: HB_TOP },
    { t: 0.26, pose: HB_BACK },
    { t: 0.46, pose: HB_SIT, ease: 'out' },
    { t: 0.54, pose: HB_KISS },
    { t: 0.78, pose: HB_BACK },
    { t: 1, pose: HB_TOP },
  ],
});

/* --- barbell box squat -----------------------------------------------
 * Same idea, twice the commitment. Lower box (top at y=75), the pelvis
 * travels 11.4 units BACK so the shin ends up dead vertical, and the torso
 * has to lean to 59 degrees to keep the bar over the midfoot. The pause on
 * the box is a real key and the figure does not slump into it — HOLD is a
 * hair MORE upright than SIT, which is what "keep the tension" looks like.
 * ------------------------------------------------------------------ */

const BB_FEET = {
  footPtL: { x: 55.4, y: 88.0, bend: 1 },
  footPtR: { x: 60.4, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const BB_TOP = backRack(p(BB_FEET, { x: 57.0, y: 57.2, spine: 88, head: 89 }));
const BB_MID = backRack(p(BB_FEET, { x: 51.6, y: 63.8, spine: 74, head: 84 }));
const BB_SIT = backRack(p(BB_FEET, { x: 45.6, y: 71.6, spine: 59, head: 76 }));
const BB_TENSE = backRack(p(BB_FEET, { x: 45.9, y: 71.2, spine: 60, head: 77 }));

const bb_box_squat = clip({
  id: 'bb_box_squat',
  duration: 3600,
  hero: 0.5,
  props: [{ type: 'box', x: 35, y: 75, w: 28, h: 13 }],
  keys: [
    { t: 0, pose: BB_TOP },
    { t: 0.26, pose: BB_MID },
    { t: 0.46, pose: BB_SIT, ease: 'out' },
    { t: 0.62, pose: BB_TENSE },
    { t: 0.84, pose: BB_MID },
    { t: 1, pose: BB_TOP },
  ],
});

/* ================================================================== *
 * 3. LOADED — what the hands hold changes what the torso can do
 * ================================================================== */

/* --- band squat ------------------------------------------------------
 * Standing on the middle of the band with both ends gripped at the
 * collarbones. The two bands are drawn from under each foot up to the hands
 * of the STANDING key, which is where the band is longest and the tension
 * highest — at the bottom it goes slack, which is exactly why the rep feels
 * easy down there. Hips back and down, torso stays high at 72 degrees.
 * ------------------------------------------------------------------ */

const BS_FEET = {
  footPtL: { x: 48.6, y: ANKLE, bend: 1 },
  footPtR: { x: 52.4, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const BS_TOP = bandGrip(p(BS_FEET, { x: 50.6, y: 57.2, spine: 88, head: 89 }));
const BS_MID = bandGrip(p(BS_FEET, { x: 48.6, y: 63.6, spine: 80, head: 85 }));
const BS_BOT = bandGrip(p(BS_FEET, { x: 45.4, y: 70.6, spine: 72, head: 81 }));
const BS_HOLD = bandGrip(p(BS_FEET, { x: 45.7, y: 70.1, spine: 72.6, head: 81.5 }));

const band_squat = clip({
  id: 'band_squat',
  duration: 2800,
  hero: 0.5,
  props: [
    { type: 'band', x0: 48.6, y0: ANKLE, x1: BS_TOP.handL.x, y1: BS_TOP.handL.y, sag: 4 },
    { type: 'band', x0: 52.4, y0: ANKLE, x1: BS_TOP.handR.x, y1: BS_TOP.handR.y, sag: 4 },
  ],
  keys: [
    { t: 0, pose: BS_TOP },
    { t: 0.24, pose: BS_MID },
    { t: 0.44, pose: BS_BOT, ease: 'out' },
    { t: 0.56, pose: BS_HOLD },
    { t: 0.8, pose: BS_MID },
    { t: 1, pose: BS_TOP },
  ],
});

/* --- kettlebell goblet squat -----------------------------------------
 * The bell rides under the chin the whole way, which is what lets the torso
 * stay at 74 degrees — the most upright bottom of any loaded squat here —
 * and the stance is the widest. Tempo is asymmetric on purpose: the descent
 * takes half the loop, the drive out of the hole takes a fifth of it.
 * ------------------------------------------------------------------ */

const KB_FEET = {
  footPtL: { x: 46.8, y: ANKLE, bend: 1 },
  footPtR: { x: 51.6, y: ANKLE, bend: 1 },
  footL: 6, footR: 6,
};

const KB_TOP = gobletGrip(p(KB_FEET, { x: 49.4, y: 57.2, spine: 88, head: 89 }));
const KB_MID = gobletGrip(p(KB_FEET, { x: 47.6, y: 64.6, spine: 82, head: 85 }));
const KB_BOT = gobletGrip(p(KB_FEET, { x: 45.2, y: 73.0, spine: 74, head: 80 }));
const KB_HOLD = gobletGrip(p(KB_FEET, { x: 45.4, y: 72.6, spine: 74.6, head: 80.5 }));

const kb_goblet_squat = clip({
  id: 'kb_goblet_squat',
  duration: 3400,
  hero: 0.55,
  keys: [
    { t: 0, pose: KB_TOP },
    { t: 0.26, pose: KB_MID, ease: 'linear' },
    { t: 0.5, pose: KB_BOT, ease: 'linear' },
    { t: 0.62, pose: KB_HOLD },
    { t: 0.82, pose: KB_MID, ease: 'out' },
    { t: 1, pose: KB_TOP },
  ],
});

/* ================================================================== *
 * 4. STRAP-SUPPORTED — the hands are welded to a point in space
 * ================================================================== */

/* --- TRX supported squat ---------------------------------------------
 * The handles are pinned: both hands hold the SAME coordinates in all five
 * keys while the body drops away underneath them. That is the whole read —
 * nothing is being pulled, the straps just stop the figure tipping over, so
 * the torso can stay at 80 degrees and the depth is deliberately partial
 * (hip above the knee) because this is the level-1 entry point.
 * ------------------------------------------------------------------ */

const SP_FEET = {
  footPtL: { x: 47.6, y: ANKLE, bend: 1 },
  footPtR: { x: 50.8, y: ANKLE, bend: 1 },
  footL: 2, footR: 2,
};

const SP_GRIP = {
  handL: { x: 63.4, y: 43.8, bend: -1 },
  handR: { x: 68.6, y: 46.2, bend: -1 },
};

const SP_TOP = p(SP_FEET, Object.assign({ x: 49.8, y: 57.2, spine: 88, head: 89 }, SP_GRIP));
const SP_MID = p(SP_FEET, Object.assign({ x: 47.6, y: 63.2, spine: 84, head: 86 }, SP_GRIP));
const SP_BOT = p(SP_FEET, Object.assign({ x: 44.6, y: 69.2, spine: 80, head: 83 }, SP_GRIP));
const SP_HOLD = p(SP_FEET, Object.assign({ x: 44.9, y: 68.7, spine: 80.5, head: 83.5 }, SP_GRIP));

const supported_squat = clip({
  id: 'supported_squat',
  duration: 3000,
  hero: 0.5,
  props: [{ type: 'rings', x: 66, y: 45, w: 5.2, y0: 6 }],
  keys: [
    { t: 0, pose: SP_TOP },
    { t: 0.26, pose: SP_MID },
    { t: 0.46, pose: SP_BOT, ease: 'out' },
    { t: 0.58, pose: SP_HOLD },
    { t: 0.8, pose: SP_MID },
    { t: 1, pose: SP_TOP },
  ],
});

/* --- assisted pistol squat -------------------------------------------
 * One leg, and the two legs never mirror: the NEAR leg is planted at
 * x=50.4 and folds under the hip, the FAR leg hangs out in front, dead
 * straight (its IK target sits beyond reach, which is how the rig draws a
 * locked limb). The straps are pinned like the supported squat above, and
 * because they carry part of the load the torso holds 76 degrees and the
 * free leg only has to be held at hip height — both of which are visibly
 * easier than the unassisted version below.
 * ------------------------------------------------------------------ */

const AP_GRIP = {
  handL: { x: 64.4, y: 39.8, bend: -1 },
  handR: { x: 69.6, y: 42.2, bend: -1 },
  footPtR: { x: 50.4, y: ANKLE, bend: 1 },
  footR: 2,
};

const AP_TOP = p(AP_GRIP, {
  x: 48.6, y: 57.6, spine: 88, head: 89,
  footPtL: { x: 82, y: 70, bend: 1 }, footL: 62,
});

const AP_MID = p(AP_GRIP, {
  x: 46.8, y: 63.4, spine: 82, head: 85,
  footPtL: { x: 81, y: 68, bend: 1 }, footL: 74,
});

const AP_BOT = p(AP_GRIP, {
  x: 44.6, y: 70.2, spine: 76, head: 81,
  footPtL: { x: 80, y: 66, bend: 1 }, footL: 88,
});

const AP_HOLD = p(AP_GRIP, {
  x: 44.9, y: 69.7, spine: 76.5, head: 81.5,
  footPtL: { x: 80.2, y: 66.4, bend: 1 }, footL: 86,
});

const assisted_pistol_squat = clip({
  id: 'assisted_pistol_squat',
  duration: 3600,
  hero: 0.5,
  props: [{ type: 'rings', x: 67, y: 41, w: 5.2, y0: 6 }],
  keys: [
    { t: 0, pose: AP_TOP },
    { t: 0.28, pose: AP_MID, ease: 'linear' },
    { t: 0.5, pose: AP_BOT, ease: 'linear' },
    { t: 0.62, pose: AP_HOLD },
    { t: 0.84, pose: AP_MID },
    { t: 1, pose: AP_TOP },
  ],
});

/* --- pistol squat ----------------------------------------------------
 * The level-5 version, and every difference from the assisted clip is a
 * difficulty: no straps, so the arms swing forward as the only
 * counterweight; the free leg finishes ABOVE hip height instead of at it;
 * the hip folds all the way to y=75.4, below the knee; and the torso has to
 * lean to 55 degrees to keep the whole stack over one foot. The heel never
 * leaves x=50, y=87.2.
 * ------------------------------------------------------------------ */

const PS_PLANT = { footPtR: { x: 50.0, y: ANKLE, bend: 1 }, footR: 2 };

const PS_TOP = p(PS_PLANT, {
  x: 48.2, y: 57.4, spine: 86, head: 88,
  armL: [-6, 0], armR: [-16, -10],
  footPtL: { x: 85, y: 60, bend: 1 }, footL: 56,
});

const PS_MID = p(PS_PLANT, {
  x: 46.6, y: 66.0, spine: 72, head: 80,
  armL: [6, 12], armR: [-4, 2],
  footPtL: { x: 82, y: 58, bend: 1 }, footL: 78,
});

const PS_BOT = p(PS_PLANT, {
  x: 43.2, y: 75.4, spine: 55, head: 72,
  armL: [26, 32], armR: [16, 22],
  footPtL: { x: 78, y: 60, bend: 1 }, footL: 96,
});

const PS_HOLD = p(PS_PLANT, {
  x: 43.4, y: 75.0, spine: 56, head: 73,
  armL: [25.5, 31.5], armR: [15.5, 21.5],
  footPtL: { x: 78.4, y: 60.4, bend: 1 }, footL: 95,
});

const pistol_squat = clip({
  id: 'pistol_squat',
  duration: 3800,
  hero: 0.5,
  keys: [
    { t: 0, pose: PS_TOP },
    { t: 0.3, pose: PS_MID },
    { t: 0.5, pose: PS_BOT, ease: 'out' },
    { t: 0.62, pose: PS_HOLD },
    { t: 0.84, pose: PS_MID },
    { t: 1, pose: PS_TOP },
  ],
});

export const X08_CLIPS = {
  bodyweight_squat,
  tempo_squat,
  box_squat_high,
  bb_box_squat,
  band_squat,
  kb_goblet_squat,
  supported_squat,
  assisted_pistol_squat,
  pistol_squat,
};
