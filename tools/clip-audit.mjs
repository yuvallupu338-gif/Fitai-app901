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

function checkGeometry(id, clip) {
  for (let i = 0; i < 20; i++) {
    const j = solve(sampleClip(clip, i / 20));
    const pts = {
      head: j.head, pelvis: j.pelvis,
      handL: j.arms.L.hand, handR: j.arms.R.hand,
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

    if (clip.keys.length < 3) problems.push(`${f}:${id} has only ${clip.keys.length} keys`);
    const first = JSON.stringify(clip.keys[0].pose);
    const last = JSON.stringify(clip.keys[clip.keys.length - 1].pose);
    if (first !== last) problems.push(`${f}:${id} loop jumps — first and last pose differ`);

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
