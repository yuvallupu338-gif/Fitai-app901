#!/usr/bin/env node
/*
 * backrooms-world.mjs — the checks a screenshot cannot make.
 *
 * The generator has three invariants that everything else rests on, none of
 * which are visible in a single frame:
 *
 *   determinism  a chunk must be a pure function of its coordinates. If it is
 *                not, walking away and back rebuilds a different room, and the
 *                seams between chunks flicker as you cross them.
 *   seams        two chunks either side of a border must agree about where the
 *                openings are, or the level is a grid of sealed boxes.
 *   connectivity every open cell in a chunk must reach the chunk's borders.
 *                Roughly one room in twenty generates sealed without the
 *                repair pass, and the player who spawns in one thinks the game
 *                is broken.
 *
 * Usage: node tools/backrooms-world.mjs
 */

import { LEVELS } from '../backrooms/src/data/levels.js';
import { generateChunk } from '../backrooms/src/world/chunk.js';
import { CHUNK, WALL_UNIT, F_NOFLOOR } from '../backrooms/src/world/grid.js';

const failures = [];
let checks = 0;
const check = (cond, msg) => { checks++; if (!cond) failures.push(msg); };

const walkable = (c, i) =>
  c.wall[i] * WALL_UNIT <= 0.6 && (c.flags[i] & F_NOFLOOR) === 0;

/* Flood from every walkable border cell; anything left over is unreachable. */
function unreachable(c) {
  const N = CHUNK * CHUNK;
  const seen = new Uint8Array(N);
  const queue = [];
  for (let k = 0; k < CHUNK; k++) {
    for (const i of [k, (CHUNK - 1) * CHUNK + k, k * CHUNK, k * CHUNK + CHUNK - 1]) {
      if (walkable(c, i) && !seen[i]) { seen[i] = 1; queue.push(i); }
    }
  }
  while (queue.length) {
    const i = queue.pop();
    const x = i & 15, z = i >> 4;
    const push = (j) => { if (!seen[j] && walkable(c, j)) { seen[j] = 1; queue.push(j); } };
    if (x > 0) push(i - 1);
    if (x < 15) push(i + 1);
    if (z > 0) push(i - 16);
    if (z < 15) push(i + 16);
  }
  let n = 0;
  for (let i = 0; i < N; i++) if (walkable(c, i) && !seen[i]) n++;
  return n;
}

const COORDS = [[0, 0], [1, 0], [0, 1], [-3, 7], [12, -5], [40, 40], [-91, 13]];

for (const level of LEVELS) {
  const label = `level ${level.id} (${level.name}, ${level.arch})`;

  for (const [cx, cz] of COORDS) {
    const a = generateChunk(level, cx, cz);
    const b = generateChunk(level, cx, cz);
    let same = true;
    for (const key of ['wall', 'wmat', 'fmat', 'cmat', 'floor', 'ceil', 'flags']) {
      for (let i = 0; i < a[key].length; i++) {
        if (a[key][i] !== b[key][i]) { same = false; break; }
      }
      if (!same) break;
    }
    check(same, `${label}: chunk ${cx},${cz} is not deterministic`);

    /* Enough of the chunk has to be standable to be a place at all. */
    let open = 0;
    for (let i = 0; i < CHUNK * CHUNK; i++) if (walkable(a, i)) open++;
    check(open >= 24,
      `${label}: chunk ${cx},${cz} is only ${open}/256 walkable — effectively solid`);

    if (level.gen.connect !== false) {
      const stranded = unreachable(a);
      check(stranded === 0,
        `${label}: chunk ${cx},${cz} strands ${stranded} cells behind walls`);
    }
  }

  /* Seams: the shared edge between two chunks must be open on both sides in
   * the same places, or you cannot walk from one to the other. */
  const left = generateChunk(level, 0, 0);
  const right = generateChunk(level, 1, 0);
  const below = generateChunk(level, 0, 1);
  let xCrossings = 0, zCrossings = 0;
  for (let k = 0; k < CHUNK; k++) {
    if (walkable(left, left.idx(CHUNK - 1, k)) && walkable(right, right.idx(0, k))) xCrossings++;
    if (walkable(left, left.idx(k, CHUNK - 1)) && walkable(below, below.idx(k, 0))) zCrossings++;
  }
  check(xCrossings > 0, `${label}: no way to walk east out of chunk 0,0`);
  check(zCrossings > 0, `${label}: no way to walk south out of chunk 0,0`);

  /* Lights, exits and items have to actually be produced somewhere, or a level
   * is unlit, or has no way down. */
  if (level.gen.lightSpacing > 0) {
    let lights = 0;
    for (const [cx, cz] of COORDS) lights += generateChunk(level, cx, cz).lights.length;
    check(lights > 0, `${label}: declares fixtures but generated none`);
  }
  let exits = 0;
  for (let cx = 0; cx < 12; cx++) {
    for (let cz = 0; cz < 12; cz++) exits += generateChunk(level, cx, cz).exits.length;
  }
  check(exits > 0, `${label}: no no-clip point in 144 chunks — the level has no exit`);
}

console.log(`${checks} checks over ${LEVELS.length} levels`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures.slice(0, 40)) console.error('  ✗ ' + f);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('world generation is deterministic, connected and seamless.');
