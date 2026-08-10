/*
 * chunk.js — generating one 16×16 patch of a level, start to finish.
 *
 * The archetype decides what the space looks like. Everything after it is the
 * same for all hundred levels, and is the part that makes a generated space
 * playable rather than merely plausible:
 *
 *   borders      openings punched at positions both neighbouring chunks agree
 *                on, so you can always walk from one chunk into the next;
 *   connectivity a guarantee that every open cell in the chunk can reach those
 *                openings — without it, roughly one room in twenty generates
 *                sealed, and the player who finds one thinks the game broke;
 *   fixtures     ceiling lights on the level's grid, some of them dead;
 *   features     no-clip points down to the next level, and things to pick up.
 */

import {
  CHUNK, Chunk, MAT, WALL_UNIT,
  F_CEIL, F_LIGHT, F_WATER, F_NOFLOOR, F_EXIT, F_ITEM, F_NOLIGHT,
} from './grid.js';
import { ARCHETYPES, chunkRng } from './archetypes.js';
import { hash2 } from '../core/rng.js';

const mod = (a, n) => ((a % n) + n) % n;

export function generateChunk(level, cx, cz) {
  const P = level.gen;
  const c = new Chunk(level, cx, cz);

  c.flags.fill(level.outdoor ? 0 : F_CEIL);
  c.fmat.fill(MAT.FLOOR);
  c.cmat.fill(MAT.CEIL);
  c.wmat.fill(MAT.WALL);

  const rng = chunkRng(level, cx, cz);
  const arch = ARCHETYPES[level.arch] || ARCHETYPES.rooms;
  arch(c, P, rng);

  /* Standing water over the whole level. This belongs here rather than in an
   * archetype: a flooded office, a flooded cave and a flooded street are the
   * same statement about the level, and having each generator implement it
   * separately meant most of them quietly did not. */
  if (P.flood) {
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      if (!c.wall[i] && !(c.flags[i] & F_NOFLOOR)) c.flags[i] |= F_WATER;
    }
  }

  if (P.connect !== false) {
    carveBorders(c, P);
    ensureConnected(c);
  }
  placeLights(c, P, level);
  placeFeatures(c, P, level, rng);
  return c;
}

/* ------------------------------------------------------------------ *
 * Borders
 * ------------------------------------------------------------------ */

/*
 * Door positions along the edge between two chunks. The key is derived from
 * the *lower* chunk of the pair plus the axis, so both sides compute the same
 * answer without ever looking at each other. This is the entire seam-matching
 * strategy, and it is why chunks can be generated in any order.
 */
function edgeDoors(cx, cz, axis, seed) {
  const h = hash2(cx * 2 + axis, cz * 3 + axis, seed + 5501);
  const count = 1 + (h % 3);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(hash2(cx + i * 17, cz - i * 29, seed + axis * 131 + i * 7) % CHUNK);
  }
  return out;
}

function carveBorders(c, P) {
  const seed = P.seed ?? 0;
  const openAt = (x, z) => {
    c.clearWall(x, z);
    c.unset(x, z, F_NOFLOOR);
  };
  for (const z of edgeDoors(c.cx, c.cz, 0, seed)) {           /* +X edge */
    openAt(CHUNK - 1, z); openAt(CHUNK - 2, z);
  }
  for (const z of edgeDoors(c.cx - 1, c.cz, 0, seed)) {       /* -X edge */
    openAt(0, z); openAt(1, z);
  }
  for (const x of edgeDoors(c.cx, c.cz, 1, seed)) {           /* +Z edge */
    openAt(x, CHUNK - 1); openAt(x, CHUNK - 2);
  }
  for (const x of edgeDoors(c.cx, c.cz - 1, 1, seed)) {       /* -Z edge */
    openAt(x, 0); openAt(x, 1);
  }
}

/* ------------------------------------------------------------------ *
 * Connectivity
 * ------------------------------------------------------------------ */

function walkable(c, i) {
  return c.wall[i] * WALL_UNIT <= 0.6 && (c.flags[i] & F_NOFLOOR) === 0;
}

/*
 * Label open regions, keep the biggest, and tunnel every other region into it.
 * The tunnel is found by breadth-first search across *all* cells including
 * walls, so the carve is always the shortest possible breach rather than a
 * corridor drawn through half the chunk.
 */
function ensureConnected(c) {
  const N = CHUNK * CHUNK;
  const label = new Int16Array(N).fill(-1);
  const sizes = [];
  const queue = new Int16Array(N);

  for (let start = 0; start < N; start++) {
    if (label[start] !== -1 || !walkable(c, start)) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = start;
    label[start] = id;
    let count = 0;
    while (head < tail) {
      const i = queue[head++];
      count++;
      const x = i & 15, z = i >> 4;
      if (x > 0) { const j = i - 1; if (label[j] === -1 && walkable(c, j)) { label[j] = id; queue[tail++] = j; } }
      if (x < 15) { const j = i + 1; if (label[j] === -1 && walkable(c, j)) { label[j] = id; queue[tail++] = j; } }
      if (z > 0) { const j = i - 16; if (label[j] === -1 && walkable(c, j)) { label[j] = id; queue[tail++] = j; } }
      if (z < 15) { const j = i + 16; if (label[j] === -1 && walkable(c, j)) { label[j] = id; queue[tail++] = j; } }
    }
    sizes.push(count);
  }
  if (sizes.length <= 1) return;

  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;

  for (let id = 0; id < sizes.length; id++) {
    if (id === main) continue;
    let from = -1;
    for (let i = 0; i < N; i++) if (label[i] === id) { from = i; break; }
    if (from < 0) continue;

    const prev = new Int16Array(N).fill(-1);
    const seen = new Uint8Array(N);
    let head = 0, tail = 0;
    queue[tail++] = from;
    seen[from] = 1;
    let hit = -1;
    while (head < tail && hit < 0) {
      const i = queue[head++];
      const x = i & 15, z = i >> 4;
      const step = (j) => {
        if (seen[j]) return false;
        seen[j] = 1;
        prev[j] = i;
        queue[tail++] = j;
        if (label[j] === main) { hit = j; return true; }
        return false;
      };
      if ((x > 0 && step(i - 1)) || (x < 15 && step(i + 1))
       || (z > 0 && step(i - 16)) || (z < 15 && step(i + 16))) break;
    }
    if (hit < 0) continue;
    for (let i = hit; i !== -1 && i !== from; i = prev[i]) {
      c.wall[i] = 0;
      c.flags[i] &= ~F_NOFLOOR;
      label[i] = main;
    }
    label[from] = main;
    /* Everything that was in this region now reaches the main one. */
    for (let i = 0; i < N; i++) if (label[i] === id) label[i] = main;
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function placeLights(c, P, level) {
  if (P.lightSpacing === 0) return;
  const sp = P.lightSpacing ?? 4;
  const seed = P.seed ?? 0;
  const cell = level.cellSize;
  const phase = mod(seed, sp);
  const col = level.lightColor || [1, 0.96, 0.86];
  const radius = P.lightRadius ?? 12;
  const intensity = P.lightIntensity ?? 2.2;
  const deadPct = P.deadLights ?? 8;

  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const i = c.idx(x, z);
      if (!(c.flags[i] & F_CEIL) || (c.flags[i] & F_NOLIGHT)) continue;
      /* A fixture hangs from the ceiling; what stands on the floor beneath it
       * is irrelevant unless it reaches all the way up. Refusing to light a
       * cell because a 1.4m cubicle partition passes through it is what makes
       * an open-plan office generate almost completely dark. */
      const ceilY = level.ceilHeight + c.ceil[i] * 0.1;
      if (c.wall[i] * WALL_UNIT > ceilY - c.floor[i] * 0.1 - 0.55) continue;
      const gx = c.cx * CHUNK + x, gz = c.cz * CHUNK + z;
      if (mod(gx, sp) !== phase || mod(gz, sp) !== phase) continue;

      const h = hash2(gx, gz, seed + 991);
      const dead = (h % 100) < deadPct;
      c.flags[i] |= F_LIGHT;
      c.lights.push({
        x: (gx + 0.5) * cell,
        y: ceilY - 0.12,
        z: (gz + 0.5) * cell,
        r: col[0], g: col[1], b: col[2],
        intensity: dead ? 0 : intensity,
        radius,
        /* A negative phase means "steady". Most fixtures are steady; the ones
         * that are not are what you hear before you see them. */
        phase: ((h >>> 7) % 100) < (P.flickerPct ?? 22) ? ((h >>> 12) % 1000) / 1000 : -1,
        dead,
      });
    }
  }
}

function placeFeatures(c, P, level, rng) {
  const seed = P.seed ?? 0;
  const cell = level.cellSize;

  const openCell = (salt) => {
    /* Walk the chunk from a hashed offset until a suitable cell turns up:
     * dry ground first, then anything open. The fallback matters — on a level
     * that is flooded end to end, insisting on dry ground means no exit is
     * ever placed and the level cannot be left. */
    const start = hash2(c.cx, c.cz, seed + salt) % (CHUNK * CHUNK);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < CHUNK * CHUNK; k++) {
        const i = (start + k * 37) % (CHUNK * CHUNK);
        if (c.wall[i]) continue;
        if (c.flags[i] & (F_NOFLOOR | F_LIGHT | F_EXIT)) continue;
        if (pass === 0 && (c.flags[i] & F_WATER)) continue;
        return i;
      }
    }
    return -1;
  };

  const exitRarity = P.exitRarity ?? 14;
  if (hash2(c.cx, c.cz, seed + 31337) % exitRarity === 0) {
    const i = openCell(4242);
    if (i >= 0) {
      c.flags[i] |= F_EXIT;
      const x = i & 15, z = i >> 4;
      const wx = ((c.cx * CHUNK + x) + 0.5) * cell;
      const wz = ((c.cz * CHUNK + z) + 0.5) * cell;
      c.exits.push({ x: wx, y: c.floor[i] * 0.1, z: wz });
      /* A no-clip point lights its own room, in a colour that belongs to no
       * fixture in the level. You see the wrong-coloured glow on a wall before
       * you see the thing making it, which is the only navigation aid the
       * player gets. */
      c.lights.push({
        x: wx, y: c.floor[i] * 0.1 + 1.2, z: wz,
        r: 0.62, g: 0.80, b: 1.0,
        intensity: 2.6, radius: 11, phase: -1, dead: false,
      });
    }
  }

  const itemRarity = P.itemRarity ?? 5;
  const items = hash2(c.cx, c.cz, seed + 606) % itemRarity === 0 ? 1 : 0;
  for (let k = 0; k < items; k++) {
    const i = openCell(700 + k);
    if (i < 0) continue;
    c.flags[i] |= F_ITEM;
    const x = i & 15, z = i >> 4;
    const roll = hash2(c.cx * 31 + k, c.cz, seed + 808) % 100;
    c.items.push({
      kind: roll < 62 ? 'almond' : roll < 86 ? 'battery' : 'note',
      x: ((c.cx * CHUNK + x) + 0.5) * cell,
      y: c.floor[i] * 0.1,
      z: ((c.cz * CHUNK + z) + 0.5) * cell,
      id: `${c.cx},${c.cz},${k}`,
    });
  }
  void rng;
}
