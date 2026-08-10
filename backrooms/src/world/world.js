/*
 * world.js — streaming, queries, and everything the player physically bumps
 * into.
 *
 * The world is infinite in the only sense that matters: there is no edge to
 * reach and no map to run out of. Chunks are generated when they come within
 * view distance, meshed a couple per frame so walking never hitches, and
 * dropped when they fall behind. Because generation is a pure function of
 * coordinates, dropping a chunk loses nothing — walk back and it comes out
 * identical, down to which fluorescent tube was flickering.
 *
 * The only mutable state is what the player has taken: picked-up items are
 * remembered by id so they do not reappear.
 */

import { CHUNK, WALL_UNIT, F_CEIL, F_WATER, F_NOFLOOR, F_EXIT } from './grid.js';
import { generateChunk } from './chunk.js';
import { buildChunkMesh } from './mesher.js';

/* Collision-free for anything within ±32768 chunks, which is about 1.6 million
 * metres in every direction. A hashed key would be shorter and would very
 * occasionally evict a live chunk without releasing its buffers. */
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

export class World {
  /*
   * `upload` and `release` are handed in by the renderer so this module never
   * touches WebGL: it produces vertex data and forgets about it.
   */
  constructor(level, upload, release) {
    this.level = level;
    this.upload = upload;
    this.release = release;
    this.chunks = new Map();
    this.taken = new Set();
    this.cell = level.cellSize;

    const span = CHUNK * this.cell;
    this.radius = Math.max(1, Math.min(4, Math.ceil((level.fogFar ?? 45) / span) + 1));

    /* Wall-height field for the shader's occlusion march. */
    this.occSize = 128;
    this.occData = new Uint8Array(this.occSize * this.occSize * 4);
    this.occOriginCell = [Infinity, Infinity];
    this.occDirty = true;

    this._cacheKey = NaN;
    this._cache = null;
    this.pending = [];
  }

  /* ---------------------------------------------------------------- *
   * Chunk access
   * ---------------------------------------------------------------- */

  chunkAt(cx, cz) {
    const k = key(cx, cz);
    if (k === this._cacheKey && this._cache && this._cache.cx === cx && this._cache.cz === cz) {
      return this._cache;
    }
    let c = this.chunks.get(k);
    if (c && (c.cx !== cx || c.cz !== cz)) c = undefined;   /* hash collision  */
    if (!c) {
      c = generateChunk(this.level, cx, cz);
      this.chunks.set(k, c);
    }
    this._cacheKey = k;
    this._cache = c;
    return c;
  }

  cellIndex(gx, gz) {
    const cx = Math.floor(gx / CHUNK), cz = Math.floor(gz / CHUNK);
    const c = this.chunkAt(cx, cz);
    return [c, c.idx(gx - cx * CHUNK, gz - cz * CHUNK)];
  }

  wallAt(gx, gz) { const [c, i] = this.cellIndex(gx, gz); return c.wall[i] * WALL_UNIT; }
  floorAt(gx, gz) { const [c, i] = this.cellIndex(gx, gz); return c.floor[i] * 0.1; }
  ceilAt(gx, gz) {
    const [c, i] = this.cellIndex(gx, gz);
    return this.level.ceilHeight + c.ceil[i] * 0.1;
  }
  flagsAt(gx, gz) { const [c, i] = this.cellIndex(gx, gz); return c.flags[i]; }
  solidAt(gx, gz) { const [c, i] = this.cellIndex(gx, gz); return c.wall[i] * WALL_UNIT > 0.6; }

  cellOf(x, z) { return [Math.floor(x / this.cell), Math.floor(z / this.cell)]; }

  /* ---------------------------------------------------------------- *
   * Streaming
   * ---------------------------------------------------------------- */

  /*
   * Called every frame. Generates and meshes at most `budget` chunks so a fast
   * walk cannot stall the frame, and prefers the nearest missing chunk so the
   * hole in front of you fills before the one behind.
   */
  update(px, pz, budget = 2) {
    const pcx = Math.floor(px / this.cell / CHUNK);
    const pcz = Math.floor(pz / this.cell / CHUNK);
    const R = this.radius;

    let built = 0;
    let best = null, bestD = Infinity;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const c = this.chunkAt(cx, cz);
        if (c.mesh && !c.meshDirty) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    while (best && built < budget) {
      this.meshChunk(best);
      built++;
      best = null; bestD = Infinity;
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const c = this.chunkAt(pcx + dx, pcz + dz);
          if (c.mesh && !c.meshDirty) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = c; }
        }
      }
    }

    /* Evict. One extra ring of slack so walking back and forth over a chunk
     * boundary does not thrash. */
    const keep = R + 1;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > keep || Math.abs(c.cz - pcz) > keep) {
        if (c.mesh) this.release(c.mesh);
        this.chunks.delete(k);
        if (this._cache === c) { this._cache = null; this._cacheKey = NaN; }
      }
    }

    this.updateOccupancy(px, pz);
  }

  meshChunk(c) {
    const data = buildChunkMesh(this, c);
    if (c.mesh) this.release(c.mesh);
    c.mesh = data.indices.length ? this.upload(data) : null;
    c.meshDirty = false;
    const span = CHUNK * this.cell;
    c.bounds = [c.cx * span, -6, c.cz * span, (c.cx + 1) * span, this.level.ceilHeight + 14,
      (c.cz + 1) * span];
  }

  /*
   * The occlusion field the shader marches through. Re-centred only when the
   * player leaves the middle of it, which in practice is once per chunk
   * crossing: 16k cell lookups every fifty metres of walking is free, and
   * doing it per frame would not be.
   */
  updateOccupancy(px, pz) {
    const [gx, gz] = this.cellOf(px, pz);
    const half = this.occSize >> 1;
    const ox = gx - half, oz = gz - half;
    if (Math.abs(ox - this.occOriginCell[0]) < 8 && Math.abs(oz - this.occOriginCell[1]) < 8
        && !this.occDirty) {
      return;
    }
    this.occOriginCell = [ox, oz];
    const d = this.occData;
    for (let j = 0; j < this.occSize; j++) {
      for (let i = 0; i < this.occSize; i++) {
        const [c, idx] = this.cellIndex(ox + i, oz + j);
        const h = c.wall[idx] * WALL_UNIT;
        d[(j * this.occSize + i) * 4] = Math.min(255, Math.round(h / 12 * 255));
      }
    }
    this.occDirty = false;
    this.occChanged = true;
  }

  occRect() {
    return [this.occOriginCell[0] * this.cell, this.occOriginCell[1] * this.cell,
      this.cell, this.occSize];
  }

  /* ---------------------------------------------------------------- *
   * Lights
   * ---------------------------------------------------------------- */

  /*
   * The nearest `max` lights to the camera, brightest-first-ish. Sorting by
   * distance alone is wrong — a dim lamp two metres away matters less than a
   * bank of tubes eight metres away — so the key is distance weighted by
   * intensity, which also decides which two get to cast shadows.
   */
  gatherLights(x, y, z, max, out) {
    const pcx = Math.floor(x / this.cell / CHUNK);
    const pcz = Math.floor(z / this.cell / CHUNK);
    const found = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!c || c.cx !== pcx + dx || c.cz !== pcz + dz) continue;
        for (const l of c.lights) {
          if (l.intensity <= 0) continue;
          const d2 = (l.x - x) ** 2 + (l.y - y) ** 2 + (l.z - z) ** 2;
          if (d2 > l.radius * l.radius) continue;
          found.push([d2 / Math.max(0.2, l.intensity), l]);
        }
      }
    }
    found.sort((a, b) => a[0] - b[0]);
    const n = Math.min(max, found.length);
    for (let i = 0; i < n; i++) out[i] = found[i][1];
    return n;
  }

  /* ---------------------------------------------------------------- *
   * Physics queries
   * ---------------------------------------------------------------- */

  /* Highest floor under a disc of radius r. Taking the maximum rather than the
   * cell under the centre is what stops a player standing on the lip of a step
   * from sinking into it. */
  groundAt(x, z, r = 0.34) {
    let best = -Infinity;
    let anyFloor = false;
    for (const [ox, oz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
      const [gx, gz] = this.cellOf(x + ox, z + oz);
      const [c, i] = this.cellIndex(gx, gz);
      if (c.flags[i] & F_NOFLOOR) continue;
      anyFloor = true;
      const h = c.floor[i] * 0.1;
      if (h > best) best = h;
    }
    return anyFloor ? best : -1000;
  }

  ceilingAt(x, z) {
    const [gx, gz] = this.cellOf(x, z);
    const [c, i] = this.cellIndex(gx, gz);
    if (!(c.flags[i] & F_CEIL)) return 1e4;
    return this.level.ceilHeight + c.ceil[i] * 0.1;
  }

  waterAt(x, z) {
    const [gx, gz] = this.cellOf(x, z);
    const [c, i] = this.cellIndex(gx, gz);
    if (!(c.flags[i] & F_WATER)) return null;
    return c.floor[i] * 0.1 + (this.level.waterDepth ?? 0.1);
  }

  /* Would a body of radius r standing with its feet at `feetY` intersect
   * anything at (x,z)? `step` is how high a lip it can walk over. */
  blocked(x, z, feetY, r = 0.34, step = 0.45) {
    for (const [ox, oz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r],
      [-r, 0], [r, 0], [0, -r], [0, r]]) {
      const [gx, gz] = this.cellOf(x + ox, z + oz);
      const [c, i] = this.cellIndex(gx, gz);
      const fy = c.floor[i] * 0.1;
      const w = c.wall[i] * WALL_UNIT;
      if (w > 0 && fy + w > feetY + step) return true;
      if (!(c.flags[i] & F_NOFLOOR) && fy > feetY + step) return true;
    }
    return false;
  }

  /* Axis-separated so running into a wall at an angle slides along it instead
   * of stopping dead. Anyone who has played a game where it does not will
   * recognise the difference immediately. */
  moveWithCollision(pos, dx, dz, r = 0.34, step = 0.45) {
    let hit = false;
    if (dx !== 0) {
      if (!this.blocked(pos.x + dx, pos.z, pos.y, r, step)) pos.x += dx;
      else hit = true;
    }
    if (dz !== 0) {
      if (!this.blocked(pos.x, pos.z + dz, pos.y, r, step)) pos.z += dz;
      else hit = true;
    }
    return hit;
  }

  /* ---------------------------------------------------------------- *
   * Features
   * ---------------------------------------------------------------- */

  nearestExit(x, z, maxDist) {
    const pcx = Math.floor(x / this.cell / CHUNK);
    const pcz = Math.floor(z / this.cell / CHUNK);
    let best = null, bestD = maxDist * maxDist;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!c) continue;
        for (const e of c.exits) {
          const d = (e.x - x) ** 2 + (e.z - z) ** 2;
          if (d < bestD) { bestD = d; best = e; }
        }
      }
    }
    return best ? { exit: best, dist: Math.sqrt(bestD) } : null;
  }

  *itemsNear(x, z, range) {
    const pcx = Math.floor(x / this.cell / CHUNK);
    const pcz = Math.floor(z / this.cell / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!c) continue;
        for (const it of c.items) {
          if (this.taken.has(it.id)) continue;
          if (Math.abs(it.x - x) > range || Math.abs(it.z - z) > range) continue;
          yield it;
        }
      }
    }
  }

  take(item) { this.taken.add(item.id); }

  /* Somewhere to stand. Spirals out from a preferred point until it finds a
   * cell that is open, roofed if the level has a roof, and not underwater. */
  findSpawn(startX = 0, startZ = 0) {
    const [sx, sz] = this.cellOf(startX, startZ);
    for (let ring = 0; ring < 40; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const gx = sx + dx, gz = sz + dz;
          const [c, i] = this.cellIndex(gx, gz);
          if (c.wall[i] > 0) continue;
          if (c.flags[i] & (F_NOFLOOR | F_EXIT)) continue;
          return {
            x: (gx + 0.5) * this.cell,
            y: c.floor[i] * 0.1,
            z: (gz + 0.5) * this.cell,
          };
        }
      }
    }
    return { x: startX, y: 0, z: startZ };
  }

  visibleChunks() {
    const out = [];
    for (const c of this.chunks.values()) if (c.mesh) out.push(c);
    return out;
  }

  dispose() {
    for (const c of this.chunks.values()) if (c.mesh) this.release(c.mesh);
    this.chunks.clear();
  }
}
