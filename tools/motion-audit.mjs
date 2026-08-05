#!/usr/bin/env node
/*
 * motion-audit.mjs — how far does each clip actually move?
 *
 * A clip that barely changes reads as a standing figure, which tells the user
 * nothing. Isometric holds are supposed to be still, so this cross-references
 * the exercise database: a near-static clip is only a defect when it is serving
 * a rep-based exercise.
 *
 * Usage: node tools/motion-audit.mjs
 */

import { solve } from '../src/core/rig.js';
import { sampleClip } from '../src/core/anim.js';
import { CLIPS, clipFor } from '../src/data/clips.index.js';
import { EXERCISES } from '../src/data/exercises.index.js';

const rows = [];
for (const [id, clip] of Object.entries(CLIPS)) {
  const track = {};
  for (let i = 0; i < 20; i++) {
    const j = solve(sampleClip(clip, i / 20));
    const pts = { head: j.head, pelvis: j.pelvis,
      handR: j.arms.R.hand, handL: j.arms.L.hand,
      kneeR: j.legs.R.knee, ankleR: j.legs.R.ankle, ankleL: j.legs.L.ankle,
      // Toes are tracked because some movements happen entirely below the
      // ankle. A tibialis raise pivots on a planted heel, so every other joint
      // is stationary by design and the clip scored 0.0 while visibly working.
      toeR: j.legs.R.toe, toeL: j.legs.L.toe };
    for (const [k, [x, y]] of Object.entries(pts)) {
      (track[k] ||= []).push([x, y]);
    }
  }
  // largest distance any tracked joint travels across the cycle
  let best = 0, who = '';
  for (const [k, pts] of Object.entries(track)) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (span > best) { best = span; who = k; }
  }
  rows.push({ id, span: best, who, keys: clip.keys.length });
}
rows.sort((a, b) => a.span - b.span);
console.log('clips with the least movement (units of the 100-box):\n');
for (const r of rows.slice(0, 22)) {
  const flag = r.span < 4 ? '  <-- effectively static' : r.span < 8 ? '  <-- barely moves' : '';
  console.log(`  ${r.span.toFixed(1).padStart(5)}  ${r.id.padEnd(24)} (max at ${r.who}, ${r.keys} keys)${flag}`);
}
const stat = rows.filter(r => r.span < 4).length;
const low = rows.filter(r => r.span >= 4 && r.span < 8).length;
console.log(`\n${rows.length} clips | ${stat} effectively static | ${low} barely moving`);

// The check that actually matters: a rep-based exercise must visibly move.
const spanOf = (clip) => {
  const t = {};
  for (let i = 0; i < 20; i++) {
    const j = solve(sampleClip(clip, i / 20));
    const p = { head: j.head, pelvis: j.pelvis, handR: j.arms.R.hand, kneeR: j.legs.R.knee, ankleR: j.legs.R.ankle, toeR: j.legs.R.toe };
    for (const [k, v] of Object.entries(p)) (t[k] ||= []).push(v);
  }
  let best = 0;
  for (const pts of Object.values(t)) {
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    best = Math.max(best, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  }
  return best;
};

const offenders = EXERCISES
  .filter((e) => e.unit === 'reps')
  .map((e) => ({ e, span: spanOf(clipFor(e)) }))
  .filter((r) => r.span < 4.5);

console.log(`\nrep-based exercises whose animation barely moves: ${offenders.length}`);
for (const o of offenders) console.log(`   ${o.span.toFixed(1)}  ${o.e.id} -> clip ${o.e.anim}`);
process.exit(offenders.length > 6 ? 1 : 0);
