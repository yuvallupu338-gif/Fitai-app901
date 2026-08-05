#!/usr/bin/env node
/*
 * clip-audit.mjs — quality gate for the per-exercise animation batches.
 *
 * Checks, for every clip in src/data/clips.x*.js:
 *   - geometry: every joint finite and on canvas across the cycle, and nothing
 *     driven through the floor on a grounded clip
 *   - loop: first and last pose identical, at least three keys
 *   - keys are real exercise ids
 *   - the clip is actually DIFFERENT from the family clip it replaces
 *   - MOTION quality, which is what the geometry checks above cannot see:
 *       * nothing sinks into the floor (see FLOOR_TOLERANCE)
 *       * no IK `bend` changes between keys — lerpPose cannot blend it
 *       * no limb takes the long way round through the body
 *       * a foot in contact at both ends of a segment does not slide
 *       * a rep does not come home in one straight interpolation
 *       * a clip that turns to face the camera stays turned
 *
 * That last check compares joint motion AND props. Comparing joints alone gives
 * false positives on implement variants: a ring pull-up and a bar pull-up move
 * the body along nearly the same path, and the whole difference is what the
 * hands are holding. A clip only counts as a copy when both match.
 *
 * Usage: node tools/clip-audit.mjs
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { solve, lerpPose, GROUND } = await import(pathToFileURL(resolve(ROOT, 'src/core/rig.js')).href);
const { sampleClip, CURVE } = await import(pathToFileURL(resolve(ROOT, 'src/core/anim.js')).href);
const { CLIPS } = await import(pathToFileURL(resolve(ROOT, 'src/data/clips.index.js')).href);
const { byId } = await import(pathToFileURL(resolve(ROOT, 'src/data/exercises.index.js')).href);

const problems = [];

function jointSignature(clip) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const j = solve(sampleClip(clip, i / 10));
    out.push(j.head[0], j.head[1], j.arms.R.hand[0], j.arms.R.hand[1],
      j.arms.L.hand[0], j.arms.L.hand[1],
      j.legs.R.knee[0], j.legs.R.knee[1], j.legs.L.knee[0], j.legs.L.knee[1],
      j.legs.R.ankle[0], j.legs.R.ankle[1], j.legs.L.ankle[0], j.legs.L.ankle[1],
      j.pelvis[0], j.pelvis[1]);
  }
  return out;
}

function propSignature(clip) {
  return JSON.stringify((clip.props || []).map((p) => p.type).sort())
    + '|' + (clip.ground === false ? 'air' : 'ground')
    + '|' + JSON.stringify(clip.keys.map((k) => k.pose.load || '').filter(Boolean));
}

const meanDiff = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

/** Largest distance any tracked joint moves between two solved frames. */
function loopDrift(a, b) {
  const pick = (j) => [j.head, j.pelvis, j.neck, j.arms.L.hand, j.arms.R.hand,
    j.arms.L.elbow, j.arms.R.elbow, j.legs.L.knee, j.legs.R.knee,
    j.legs.L.ankle, j.legs.R.ankle, j.legs.L.toe, j.legs.R.toe];
  const pa = pick(a);
  const pb = pick(b);
  let worst = 0;
  for (let i = 0; i < pa.length; i++) {
    worst = Math.max(worst, Math.hypot(pa[i][0] - pb[i][0], pa[i][1] - pb[i][1]));
  }
  return worst;
}

/*
 * A limb can be posed two ways: by joint angles (armL, legR) or by an IK target
 * for its end point (handL, footPtR). lerpPose can only interpolate a key it
 * finds in BOTH poses; where one pose pins a limb and the next leaves it free,
 * it falls back to a hard swap at t=0.5 and the limb teleports.
 *
 * Nothing else catches this. The geometry is legal on both sides of the swap,
 * the loop still closes, and the clip is measurably different from its family —
 * it just visibly snaps halfway through, which is only findable by watching it.
 * Two clips shipped with it before this check existed.
 */
const LIMB_PAIRS = [
  ['armL', 'handL'], ['armR', 'handR'],
  ['legL', 'footPtL'], ['legR', 'footPtR'],
];

function checkRepresentation(clip) {
  const bad = [];
  for (let i = 0; i < clip.keys.length - 1; i++) {
    const a = clip.keys[i].pose;
    const b = clip.keys[i + 1].pose;
    for (const [angleKey, ikKey] of LIMB_PAIRS) {
      const aPinned = a[ikKey] !== undefined;
      const bPinned = b[ikKey] !== undefined;
      if (aPinned === bPinned) continue;
      // Only a problem when the other side actually poses the limb: a limb left
      // entirely alone in one key inherits nothing to snap between.
      const aFree = a[angleKey] !== undefined;
      const bFree = b[angleKey] !== undefined;
      if ((aPinned && bFree) || (bPinned && aFree)) {
        bad.push(`${angleKey}/${ikKey} between key ${i} and ${i + 1}`);
      }
    }
  }
  return bad;
}

/*
 * How far under GROUND a joint may sit before it reads as buried.
 *
 * This used to be y > 92 — four whole units, on a body whose foot is two units
 * thick. Everything from a split squat with its rear toe 3.4 under the floor to
 * a prone raise with a hand at 91 passed, and every one of them was visible.
 * 1.8 is about where the drawn silhouette stops clearing the ground line: the
 * plank family's curled toes sit at 1.3 and read as toes gripping the floor.
 */
const FLOOR_TOLERANCE = 1.8;

function checkGeometry(id, clip) {
  for (let i = 0; i < 20; i++) {
    const j = solve(sampleClip(clip, i / 20));
    // Elbows and knees are here because leaving them out let a glute bridge
    // ship with both forearms six units under the mat: every endpoint was on
    // the floor exactly where it belonged, and the joint between them was not.
    // IK has two solutions and the wrong one bends the limb straight down.
    const pts = {
      head: j.head, pelvis: j.pelvis, neck: j.neck,
      handL: j.arms.L.hand, handR: j.arms.R.hand,
      elbowL: j.arms.L.elbow, elbowR: j.arms.R.elbow,
      kneeL: j.legs.L.knee, kneeR: j.legs.R.knee,
      ankleL: j.legs.L.ankle, ankleR: j.legs.R.ankle,
      toeL: j.legs.L.toe, toeR: j.legs.R.toe,
    };
    for (const [k, [x, y]] of Object.entries(pts)) {
      if (!isFinite(x) || !isFinite(y)) return `${k} is not a number`;
      if (x < -2 || x > 102 || y < -2 || y > 102) return `${k} leaves the canvas`;
      if (clip.ground !== false && y - GROUND > FLOOR_TOLERANCE) {
        return `${k} is ${(y - GROUND).toFixed(1)} units under the floor`;
      }
    }
  }
  return null;
}


/*
 * `bend` picks WHICH of the two IK solutions an elbow or knee uses, and
 * lerpPose does not interpolate it — it copies the value from the FIRST key of
 * the segment. A clip that writes a different bend on a later key therefore
 * does not blend anything: the joint snaps to the other solution the instant
 * playback crosses that key. It is worth ten units of elbow, twice a cycle,
 * and nothing else in this file can see it, because both sides of the snap are
 * perfectly legal geometry.
 */
function checkBend(clip) {
  const bad = [];
  for (const k of ['handL', 'handR', 'footPtL', 'footPtR']) {
    const seen = clip.keys.map((kk) => kk.pose[k] && kk.pose[k].bend).filter((v) => v !== undefined);
    if (new Set(seen).size > 1) bad.push(`${k} bend changes across keys (${seen.join(', ')})`);
  }
  return bad;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const ENDPOINTS = [
  ['handL', (j) => j.arms.L.hand], ['handR', (j) => j.arms.R.hand],
  ['footL', (j) => j.legs.L.ankle], ['footR', (j) => j.legs.R.ankle],
  ['kneeL', (j) => j.legs.L.knee], ['kneeR', (j) => j.legs.R.knee],
];

/*
 * A limb that swings the long way round.
 *
 * Interpolation is linear on the raw angle, so legR written [-70,-110] in one
 * key and [172,176] in the next sweeps +242 degrees: the free leg of a
 * single-leg RDL kicked FORWARD, rose past the head and came down behind. That
 * shipped. Every endpoint was on canvas, the loop closed, and it was measurably
 * different from its family clip.
 *
 * The test is not "more than 180 degrees" — a vertical jump legitimately swings
 * its arms 218 degrees forward from behind the hips to overhead, and writing
 * that the short way would drag them backwards through the shoulder. What is
 * wrong is travelling a long way to arrive nowhere: the interpolated PATH of
 * the joint against the straight line between its two ends.
 */
function checkSweep(clip) {
  const bad = [];
  for (let i = 0; i < clip.keys.length - 1; i++) {
    const a = clip.keys[i].pose;
    const b = clip.keys[i + 1].pose;
    const ease = CURVE[clip.keys[i + 1].ease || clip.ease || 'inOut'] || CURVE.inOut;
    const STEPS = 16;
    const frames = [];
    for (let s = 0; s <= STEPS; s++) frames.push(solve(lerpPose(a, b, ease(s / STEPS))));
    for (const [name, get] of ENDPOINTS) {
      const pts = frames.map(get);
      let travelled = 0;
      for (let s = 1; s <= STEPS; s++) travelled += dist(pts[s - 1], pts[s]);
      const chord = dist(pts[0], pts[STEPS]);
      // Absolute floor as well as a ratio: a joint that wanders two units in a
      // circle is a wrist, not a hip taking the scenic route.
      if (travelled > 22 && travelled - chord > 22 && travelled > 2 * Math.max(chord, 1e-3)) {
        bad.push(`${name} between key ${i} and ${i + 1} travels ${travelled.toFixed(0)} units`
          + ` to move ${chord.toFixed(0)} — it is going the long way round`);
      }
    }
  }
  return bad;
}

/*
 * A planted foot that slides.
 *
 * Only flagged when BOTH feet are on the ground at BOTH ends of a segment:
 * with nothing airborne there is no source of motion, so a toe that moves is
 * skating. Locomotion is exempt by construction, because a step lifts a foot —
 * which is exactly the key the walking lunge, the burpee and the broad jump
 * were missing when they dragged a sole 28, 35 and 32 units along the floor.
 */
const CONTACT = 1.0;

function checkFootSlide(clip) {
  if (clip.ground === false) return [];
  const bad = [];
  const solved = clip.keys.map((k) => solve(k.pose));
  const planted = (j) => ['L', 'R'].every((s) => j.legs[s].toe[1] > GROUND - CONTACT);
  for (let i = 0; i < solved.length - 1; i++) {
    if (!planted(solved[i]) || !planted(solved[i + 1])) continue;
    for (const s of ['L', 'R']) {
      const travel = Math.abs(solved[i].legs[s].toe[0] - solved[i + 1].legs[s].toe[0]);
      if (travel > 2.2) {
        bad.push(`toe${s} slides ${travel.toFixed(1)} units between key ${i} and ${i + 1}`
          + ' with both feet on the ground');
      }
    }
  }
  return bad;
}

/*
 * A rep that comes home in one straight interpolation.
 *
 * Half of every rep is the half that trains the muscle, and a clip whose whole
 * return is a single lerp gives it no shape at all: no key in the middle, so no
 * arc, no overlap between the joints, and one velocity curve for the lot. It is
 * the difference between a lifter and a hinge opening.
 */
function checkReturn(clip) {
  if (clip.keys.length < 3) return null;
  const sig = (pose) => {
    const j = solve(pose);
    return [...j.head, ...j.pelvis, ...j.arms.R.hand, ...j.arms.L.hand,
      ...j.legs.R.knee, ...j.legs.R.ankle];
  };
  const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const home = sig(clip.keys[0].pose);
  let far = 1;
  let widest = -1;
  clip.keys.forEach((k, i) => {
    if (i === 0 || i === clip.keys.length - 1) return;
    const q = gap(home, sig(k.pose));
    if (q > widest) { widest = q; far = i; }
  });
  const keysBack = clip.keys.length - 2 - far;
  const timeBack = 1 - clip.keys[far].t;
  if (widest > 9 && keysBack === 0 && timeBack > 0.3) {
    return `returns from its furthest pose (t=${clip.keys[far].t}) to the start in one`
      + ` interpolation over ${(timeBack * 100).toFixed(0)}% of the clip — the way back needs a key`;
  }
  return null;
}

/*
 * A clip may not turn to face the camera part way through.
 *
 * `spread` is a camera choice, not a joint: it decides whether the figure is
 * seen edge-on or head-on. Interpolating it rotates the body mid-rep, which is
 * a cut, not a movement. Every key either has it or none does.
 */
function checkSpread(clip) {
  const seen = clip.keys.map((k) => k.pose.spread || 0);
  if (new Set(seen).size > 1) {
    return `spread changes mid-clip (${[...new Set(seen)].join(', ')}) — the camera moves, not the body`;
  }
  return null;
}

const files = existsSync(resolve(ROOT, 'src/data'))
  ? readdirSync(resolve(ROOT, 'src/data')).filter((f) => /^clips\.x\d+\.js$/.test(f))
  : [];

let total = 0;
for (const f of files) {
  const mod = await import(pathToFileURL(resolve(ROOT, 'src/data', f)).href);
  // Select the clip map by NAME. Picking "the first object export" let a stray
  // export shadow it, and a whole batch went unchecked without a word.
  const key = Object.keys(mod).find((k) => /_CLIPS$/.test(k));
  const map = (key && mod[key]) || {};
  if (!key) problems.push(`${f} exports no *_CLIPS map`);
  for (const [id, clip] of Object.entries(map)) {
    if (!clip || !Array.isArray(clip.keys)) continue;
    total++;

    const ex = byId(id);
    if (!ex) { problems.push(`${f}:${id} is not an exercise id`); continue; }

    const geo = checkGeometry(id, clip);
    if (geo) problems.push(`${f}:${id} ${geo}`);

    for (const swap of checkRepresentation(clip)) {
      problems.push(`${f}:${id} limb snaps mid-clip — ${swap} mixes an IK target with free angles`);
    }

    for (const b of checkBend(clip)) problems.push(`${f}:${id} elbow/knee pops — ${b}`);
    for (const b of checkSweep(clip)) problems.push(`${f}:${id} ${b}`);
    for (const b of checkFootSlide(clip)) problems.push(`${f}:${id} foot skates — ${b}`);
    const ret = checkReturn(clip);
    if (ret) problems.push(`${f}:${id} ${ret}`);
    const spr = checkSpread(clip);
    if (spr) problems.push(`${f}:${id} ${spr}`);

    if (clip.keys.length < 3) problems.push(`${f}:${id} has only ${clip.keys.length} keys`);
    // Compare where the loop RENDERS, not how it is written. A full arm circle
    // ends at 276 degrees where it started at -84: the same picture, a different
    // number, and no way to write it as one object without the arm unwinding
    // three quarters of the way back. Solved joint positions answer the question
    // the check is actually asking, and still catch a real jump.
    const first = solve(clip.keys[0].pose);
    const last = solve(clip.keys[clip.keys.length - 1].pose);
    const drift = loopDrift(first, last);
    if (drift > 0.25) {
      problems.push(`${f}:${id} loop jumps — first and last frame differ by ${drift.toFixed(1)} units`);
    }

    const family = CLIPS[ex.anim] || CLIPS[ex.pattern];
    if (family) {
      const sameMotion = meanDiff(jointSignature(clip), jointSignature(family)) < 1.5;
      const sameProps = propSignature(clip) === propSignature(family);
      if (sameMotion && sameProps) {
        problems.push(`${f}:${id} is a copy of the ${ex.anim} clip — same motion and same equipment`);
      }
    }
  }
}

/*
 * The shared family clips get the motion checks too.
 *
 * They were audited by nothing at all, and they are not a lesser tier: 85 of
 * the 267 exercises have no bespoke clip and play one of these instead, and the
 * pattern fallbacks play for anything new. The id/copy checks above do not
 * apply here — a family clip is not keyed by an exercise id and has nothing to
 * be a copy OF — but everything about how it MOVES does.
 */
let family = 0;
for (const [id, clip] of Object.entries(CLIPS)) {
  if (!clip || !Array.isArray(clip.keys)) continue;
  family++;
  const geo = checkGeometry(id, clip);
  if (geo) problems.push(`family:${id} ${geo}`);
  for (const swap of checkRepresentation(clip)) {
    problems.push(`family:${id} limb snaps mid-clip — ${swap} mixes an IK target with free angles`);
  }
  for (const b of checkBend(clip)) problems.push(`family:${id} elbow/knee pops — ${b}`);
  for (const b of checkSweep(clip)) problems.push(`family:${id} ${b}`);
  for (const b of checkFootSlide(clip)) problems.push(`family:${id} foot skates — ${b}`);
  const ret = checkReturn(clip);
  if (ret) problems.push(`family:${id} ${ret}`);
  const spr = checkSpread(clip);
  if (spr) problems.push(`family:${id} ${spr}`);
  const drift = loopDrift(solve(clip.keys[0].pose), solve(clip.keys[clip.keys.length - 1].pose));
  if (drift > 0.25) problems.push(`family:${id} loop jumps — first and last frame differ by ${drift.toFixed(1)} units`);
}

console.log(`per-exercise clips: ${total}   family clips: ${family}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);
