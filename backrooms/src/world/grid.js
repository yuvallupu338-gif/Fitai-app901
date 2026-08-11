/*
 * grid.js — what a chunk of the world is.
 *
 * The world is a 2.5D grid: every cell has a floor height, an optional
 * ceiling, and an optional wall standing on it with its own height. That is
 * less than a voxel engine and much more than a flat maze, and it happens to
 * be exactly the shape of almost every space in this mythology — rooms,
 * corridors, pools sunk into a floor, half-height cubicle partitions, a
 * warehouse rack, a city block.
 *
 * Chunks are 16×16 cells and are never stored. A chunk is a pure function of
 * (level seed, cx, cz); walking away and coming back regenerates the identical
 * rooms. See rng.js for why that matters.
 */

export const CHUNK = 16;

/* Wall heights are stored in 5cm units so a full 3m wall is 60 and a cubicle
 * partition is 28, both inside a byte. Floor offsets are 10cm units in a signed
 * byte, giving ±12.7m of relief — enough for sunken pools, kerbs, terraces and
 * the lip of a pit, and not enough for a mountain, which is deliberate. */
export const WALL_UNIT = 0.05;
export const FLOOR_UNIT = 0.1;

export const F_CEIL    = 1;   /* has a ceiling above it                      */
export const F_LIGHT   = 2;   /* a fixture hangs here                        */
export const F_WATER   = 4;   /* standing water, surface at floor + waterDepth*/
export const F_NOFLOOR = 8;   /* open void — you fall                        */
export const F_EXIT    = 16;  /* no-clip point down to the next level        */
export const F_DOOR    = 32;  /* opening carved through a wall run           */
export const F_ITEM    = 64;  /* something worth picking up spawns here      */
export const F_NOLIGHT = 128; /* never place a fixture here                  */

/* Material slots. Every level supplies its materials in this order, so the
 * mesher can ask for "the wall material" without knowing which level it is in. */
export const MAT = {
  FLOOR: 0,
  WALL: 1,
  CEIL: 2,
  LIGHT: 3,
  ALT: 4,      /* trim, skirting, a second wall finish                       */
  WATER: 5,
  PROP: 6,
  PROP2: 7,
  FOLIAGE: 8,  /* cut-out material for vegetation and wire mesh              */
  /* Whatever is walking around. Deliberately NOT per-level: a level describes
   * the building it is, and the things in the building are the same things
   * everywhere. Levels may still override slot 9 if they want their own. */
  FLESH: 9,
  /* Lit eyes. Emissive, so the bloom picks them up and they are the only part
   * of a thing you can see across a dark room. */
  EYE: 10,
  /* The cut-out silhouette a shade is drawn with. */
  SHADE: 11,
};
export const MAT_COUNT = 12;

export class Chunk {
  constructor(level, cx, cz) {
    this.level = level;
    this.cx = cx;
    this.cz = cz;
    const n = CHUNK * CHUNK;
    this.wall = new Uint8Array(n);
    this.wmat = new Uint8Array(n);
    this.fmat = new Uint8Array(n);
    this.cmat = new Uint8Array(n);
    this.floor = new Int8Array(n);
    /* Ceiling offset from the level's nominal height, same 10cm units. Caves
     * and ruined levels need a ceiling that moves; office levels never touch
     * it and pay nothing for the array. */
    this.ceil = new Int8Array(n);
    this.flags = new Uint8Array(n);
    this.lights = [];
    this.props = [];
    this.items = [];
    this.exits = [];
    this.mesh = null;
    this.meshDirty = true;
  }

  /* Local index. Callers stay inside 0..15; the generators are written so that
   * they never need to reach into a neighbour, which is what keeps generation
   * a pure function of this chunk's coordinates. */
  idx(x, z) { return (z << 4) + x; }
  inside(x, z) { return x >= 0 && z >= 0 && x < CHUNK && z < CHUNK; }

  solid(x, z) {
    if (!this.inside(x, z)) return false;
    return this.wall[this.idx(x, z)] > 0;
  }
  blocking(x, z) {
    /* Anything over 60cm stops a walking body; below that it is a kerb. */
    if (!this.inside(x, z)) return false;
    return this.wall[this.idx(x, z)] * WALL_UNIT > 0.6;
  }

  setWall(x, z, metres, mat) {
    if (!this.inside(x, z)) return;
    const i = this.idx(x, z);
    this.wall[i] = Math.min(255, Math.round(metres / WALL_UNIT));
    if (mat !== undefined) this.wmat[i] = mat;
  }
  clearWall(x, z) {
    if (!this.inside(x, z)) return;
    this.wall[this.idx(x, z)] = 0;
  }
  setFloor(x, z, metres) {
    if (!this.inside(x, z)) return;
    this.floor[this.idx(x, z)] = Math.max(-127, Math.min(127, Math.round(metres / FLOOR_UNIT)));
  }
  floorY(x, z) {
    if (!this.inside(x, z)) return 0;
    return this.floor[this.idx(x, z)] * FLOOR_UNIT;
  }
  setCeil(x, z, metresFromNominal) {
    if (!this.inside(x, z)) return;
    this.ceil[this.idx(x, z)] =
      Math.max(-127, Math.min(127, Math.round(metresFromNominal / FLOOR_UNIT)));
  }
  set(x, z, flag) { if (this.inside(x, z)) this.flags[this.idx(x, z)] |= flag; }
  unset(x, z, flag) { if (this.inside(x, z)) this.flags[this.idx(x, z)] &= ~flag; }
  has(x, z, flag) { return this.inside(x, z) && (this.flags[this.idx(x, z)] & flag) !== 0; }

  /* ---------------------------------------------------------------- *
   * Drawing helpers — the vocabulary the archetypes are written in.
   * ---------------------------------------------------------------- */

  fillRect(x0, z0, x1, z1, fn) {
    const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(CHUNK - 1, Math.max(x0, x1));
    const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(CHUNK - 1, Math.max(z0, z1));
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) fn(x, z, this.idx(x, z));
  }

  /* Wall runs. `gap` is the chance per cell of leaving a doorway, which is the
   * whole difference between "a maze" and "rooms you can walk between". */
  wallRun(x, z, dx, dz, len, height, mat, rng, gap = 0) {
    for (let i = 0; i < len; i++) {
      const cx = x + dx * i, cz = z + dz * i;
      if (!this.inside(cx, cz)) continue;
      if (gap > 0 && rng && rng() < gap) {
        this.set(cx, cz, F_DOOR);
        continue;
      }
      this.setWall(cx, cz, height, mat);
    }
  }

  roomOutline(x0, z0, w, h, height, mat, rng, gap = 0) {
    this.wallRun(x0, z0, 1, 0, w, height, mat, rng, gap);
    this.wallRun(x0, z0 + h - 1, 1, 0, w, height, mat, rng, gap);
    this.wallRun(x0, z0, 0, 1, h, height, mat, rng, gap);
    this.wallRun(x0 + w - 1, z0, 0, 1, h, height, mat, rng, gap);
  }
}

/* World cell coordinates for a chunk-local cell, and back. Kept here so the
 * conversion exists exactly once. */
export function worldCell(cx, cz, x, z) { return [cx * CHUNK + x, cz * CHUNK + z]; }
export function chunkOf(gx, gz) { return [Math.floor(gx / CHUNK), Math.floor(gz / CHUNK)]; }
export function localOf(gx, gz) {
  return [((gx % CHUNK) + CHUNK) % CHUNK, ((gz % CHUNK) + CHUNK) % CHUNK];
}
