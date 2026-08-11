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
import { BEHAVIOUR } from '../backrooms/src/game/entities.js';
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

/* ------------------------------------------------------------------ *
 * Distinctness
 *
 * A hundred levels are worth having only if they are a hundred *places*.
 * Nothing else in this suite would notice if fifty of them were the same
 * room with a different name — every one of them would generate, connect and
 * light perfectly well.
 *
 * So: describe each level by the things a player actually perceives, and
 * require that no two descriptions match, and that consecutive levels differ
 * on several axes rather than one. The axes are weighted by how loudly they
 * read — walking into a level, you notice the shape and the palette long
 * before you notice its exit rarity.
 * ------------------------------------------------------------------ */
{
  const axes = (L) => {
    const g = L.gen || {};
    const m = L.mats || [];
    const mat = (i, f) => (m[i] && m[i][f]) || '';
    return {
      shape: L.arch,
      floor: mat(0, 'kind'), floorCol: mat(0, 'color'),
      wall: mat(1, 'kind'), wallCol: mat(1, 'color'),
      ceilCol: mat(2, 'kind') ? mat(2, 'color') : '',
      fog: L.fogColor || '',
      reach: Math.round((L.fogFar || 0) / 6),
      dark: Math.round((L.ambient ? parseInt(L.ambient.slice(1), 16) : 0) / 0x101010),
      head: Math.round((L.ceilHeight || 0) * 2) / 2,
      lit: `${g.lightSpacing ?? -1}/${g.deadLights ?? 0}/${g.flickerPct ?? 0}`,
      /* Scatter is the difference between a field of wheat and an orchard,
       * which is to say: the entire difference. */
      strewn: `${g.scatterType || '-'}:${Math.round((g.scatter || 0) / 25)}`,
      wet: `${g.flood || 0}/${g.poolDepth || 0}/${L.waterDepth || 0}`,
      sky: L.sky ? Object.values(L.sky).join(',') : '',
      hazard: (L.hazards || []).slice().sort().join('+'),
      who: L.entities ? L.entities.kind : '-',
      sound: `${(L.audio || {}).tone || '-'}/${(L.audio || {}).reverb ?? 0}`,
    };
  };

  const keys = Object.keys(axes(LEVELS[0]));
  const shared = (a, b) => keys.filter((k) => String(a[k]) === String(b[k])).length;
  const desc = LEVELS.map(axes);

  /*
   * The thresholds are set one below what the file actually achieves rather
   * than at some round number: as written, the closest pair of levels
   * anywhere in the hundred differs on 7 of the 17 axes and the closest
   * back-to-back pair on 8. Asserting 6 and 7 leaves exactly one axis of
   * slack for an incidental edit, and no room at all to quietly add a level
   * that is a recolour of one already here.
   */
  const MIN_ANY = 6, MIN_ADJACENT = 7;

  for (let i = 0; i < LEVELS.length; i++) {
    for (let j = i + 1; j < LEVELS.length; j++) {
      const s = shared(desc[i], desc[j]);
      check(s < keys.length,
        `levels ${LEVELS[i].id} and ${LEVELS[j].id} are the same place in every respect`);
      check(keys.length - s >= MIN_ANY,
        `levels ${LEVELS[i].id} (${LEVELS[i].name}) and ${LEVELS[j].id} (${LEVELS[j].name}) `
        + `differ on only ${keys.length - s} of ${keys.length} axes`);
    }
  }

  /* And walking from one to the next must feel like arriving somewhere. */
  for (let i = 1; i < LEVELS.length; i++) {
    const s = shared(desc[i - 1], desc[i]);
    check(keys.length - s >= MIN_ADJACENT,
      `levels ${LEVELS[i - 1].id} and ${LEVELS[i].id} are back to back and `
      + `differ on only ${keys.length - s} of ${keys.length} axes`);
  }

  /* Every level is inhabited. An empty level is a corridor with a view. */
  for (const L of LEVELS) {
    check(!!L.entities && !!L.entities.kind, `level ${L.id} (${L.name}) has nothing living in it`);
    /*
     * And the safety label has to be true. Class 0 means "you could live
     * here", which a level with something hunting in it is not — when the
     * Lobby and the Reading Rooms were populated they stopped being class 0
     * and were moved up, rather than left carrying a green badge that lied.
     */
    check(!(L.cls === 0 && L.entities),
      `level ${L.id} (${L.name}) is labelled Safe and has a ${L.entities && L.entities.kind} in it`);

    /*
     * And it has to fit. A titan is 3.22m to the top of its head, so putting
     * one in a 2.8m storeroom is a monster wearing the ceiling as a hat — the
     * sort of thing that is obvious in play and invisible in a screenshot of
     * whichever level the renderer tests happen to use.
     */
    const B = L.entities && BEHAVIOUR[L.entities.kind];
    if (B && !L.outdoor) {
      const head = L.ceilHeight || 3;
      check(B.height <= head - 0.1,
        `level ${L.id} (${L.name}) has a ${L.entities.kind} ${B.height}m tall `
        + `under a ${head}m ceiling`);
    }
  }

  /* And no kind may dominate, or the roster is decoration. */
  const tally = new Map();
  for (const L of LEVELS) {
    const k = L.entities && L.entities.kind;
    if (k) tally.set(k, (tally.get(k) || 0) + 1);
  }
  check(tally.size >= 8, `only ${tally.size} kinds of thing across a hundred levels`);
  for (const [k, n] of tally) {
    check(n <= 22, `${k} is on ${n} of the hundred levels — too much of one thing`);
  }
  /* Never twice in a row: consecutive levels must change the threat. */
  for (let i = 1; i < LEVELS.length; i++) {
    const a = LEVELS[i - 1].entities, b = LEVELS[i].entities;
    check(!a || !b || a.kind !== b.kind,
      `levels ${LEVELS[i - 1].id} and ${LEVELS[i].id} are both ${b && b.kind}`);
  }
}

console.log(`${checks} checks over ${LEVELS.length} levels`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures.slice(0, 40)) console.error('  ✗ ' + f);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('world generation is deterministic, connected and seamless.');
