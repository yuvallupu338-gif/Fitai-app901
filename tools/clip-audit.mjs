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
const { solve } = await import(pathToFileURL(resolve(ROOT, 'src/core/rig.js')).href);
const { sampleClip } = await import(pathToFileURL(resolve(ROOT, 'src/core/anim.js')).href);
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
      if (clip.ground !== false && y > 92) return `${k} goes through the floor`;
    }
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

console.log(`per-exercise clips: ${total}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);
