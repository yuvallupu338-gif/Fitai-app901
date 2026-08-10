/*
 * mesher.js — a chunk of grid becomes a chunk of triangles.
 *
 * Three things here are worth more than they cost:
 *
 *   Hidden faces are never emitted. A wall only draws a face towards a
 *   neighbour that is lower than it is, so a solid block of city buildings is
 *   a shell, not a solid.
 *
 *   Risers. Wherever the floor steps down — a sunken pool, a terrace, the lip
 *   of a pit — a vertical face is emitted to close the gap. Without it the
 *   world is full of hairline slots you can see through, and they are the
 *   first thing anyone notices.
 *
 *   Ambient occlusion, baked per vertex from the occupancy field. This is the
 *   single cheapest realism win available: the dark line where a wall meets
 *   the floor is doing more work than any shader in this project.
 */

import { CHUNK, WALL_UNIT, MAT, F_CEIL, F_WATER, F_NOFLOOR, F_LIGHT, F_EXIT } from './grid.js';
import { MeshBuilder, addQuad, addCross } from './meshbuilder.js';
import { PROPS } from './props.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/*
 * Wall faces. `dir` is 0:+X 1:-X 2:+Z 3:-Z, and each case is wound so the
 * normal points at the neighbour. UVs are world-space (metres along the wall,
 * absolute height) so a texture runs unbroken down a corridor instead of
 * restarting at every cell.
 */
function face(mb, dir, x0, z0, x1, z1, yb, yt, mat, ao, sub) {
  let p0, p1, p2, p3, u0, u1;
  if (dir === 0) {
    p0 = [x1, yb, z1]; p1 = [x1, yb, z0]; p2 = [x1, yt, z0]; p3 = [x1, yt, z1];
    u0 = z1; u1 = z0;
  } else if (dir === 1) {
    p0 = [x0, yb, z0]; p1 = [x0, yb, z1]; p2 = [x0, yt, z1]; p3 = [x0, yt, z0];
    u0 = z0; u1 = z1;
  } else if (dir === 2) {
    p0 = [x0, yb, z1]; p1 = [x1, yb, z1]; p2 = [x1, yt, z1]; p3 = [x0, yt, z1];
    u0 = x0; u1 = x1;
  } else {
    p0 = [x1, yb, z0]; p1 = [x0, yb, z0]; p2 = [x0, yt, z0]; p3 = [x1, yt, z0];
    u0 = x1; u1 = x0;
  }
  addQuad(mb, p0, p1, p2, p3,
    [u0, yb], [u1, yb], [u1, yt], [u0, yt], mat, { sub, ao });
}

export function buildChunkMesh(world, chunk) {
  const L = chunk.level;
  const cell = L.cellSize;
  const sub = L.sub ?? 2;
  const waterDepth = L.waterDepth ?? 0.1;
  const baseX = chunk.cx * CHUNK, baseZ = chunk.cz * CHUNK;
  const mb = new MeshBuilder(6000);

  /*
   * Occupancy sampled at an arbitrary point, bilinear over cell centres. This
   * is the field the ambient occlusion reads: at the foot of a wall it tends
   * to 0.5, in the middle of a room to 0, and that gradient across a single
   * cell is exactly the soft corner shadow we want.
   */
  const occ = (fx, fz) => {
    const x = fx - 0.5, z = fz - 0.5;
    const xi = Math.floor(x), zi = Math.floor(z);
    const tx = x - xi, tz = z - zi;
    const s = (a, b) => (world.solidAt(a, b) ? 1 : 0);
    const a0 = s(xi, zi) * (1 - tx) + s(xi + 1, zi) * tx;
    const a1 = s(xi, zi + 1) * (1 - tx) + s(xi + 1, zi + 1) * tx;
    return a0 * (1 - tz) + a1 * tz;
  };

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const i = chunk.idx(x, z);
      const gx = baseX + x, gz = baseZ + z;
      const x0 = gx * cell, x1 = x0 + cell;
      const z0 = gz * cell, z1 = z0 + cell;
      const flags = chunk.flags[i];
      const fy = chunk.floor[i] * 0.1;
      const cy = L.ceilHeight + chunk.ceil[i] * 0.1;
      const w = chunk.wall[i] * WALL_UNIT;

      /* A wall that stops below the ceiling — a cubicle partition, a warehouse
       * rack, a fence — still has ceiling above it. Treating "has a wall" as
       * "has no ceiling" punches a hole in the roof over every partition in
       * the level, which from underneath looks like the sky has gone missing. */
      const roofed = (flags & F_CEIL) !== 0 && fy + w < cy - 0.02;

      /* ---- solid cell: faces outward, and a cap if it is a partition ---- */
      if (w > 0) {
        const yt = fy + w;
        for (let d = 0; d < 4; d++) {
          const nx = gx + DIRS[d][0], nz = gz + DIRS[d][1];
          const nw = world.wallAt(nx, nz);
          if (nw >= w - 0.001) continue;
          const nfy = world.floorAt(nx, nz);
          const nflags = world.flagsAt(nx, nz);
          let yb = nw > 0 ? nfy + nw : Math.min(fy, nfy);
          if (nflags & F_NOFLOOR) yb = fy - 4;
          if (yt - yb < 0.02) continue;
          const span = yt - yb;
          const ao = (s, t) => {
            const y = yb + span * t;
            let a = 1 - 0.55 * Math.exp(-Math.max(0, y - nfy) / 0.38);
            a -= 0.26 * Math.exp(-Math.max(0, cy - y) / 0.5);
            return clamp01(a) * 0.94 + 0.06;
          };
          face(mb, d, x0, z0, x1, z1, yb, yt, chunk.wmat[i], ao, sub);
        }
        if (yt < cy - 0.06 || !(flags & F_CEIL)) {
          /* Top of a half-height partition or a low wall. */
          addQuad(mb, [x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0],
            [x0, z1], [x1, z1], [x1, z0], [x0, z0], chunk.wmat[i],
            { sub: 1, ao: () => 0.9 });
        }
        if (!roofed) continue;
      }

      /* ---- floor, water: open cells only ---- */
      if (w === 0 && !(flags & F_NOFLOOR)) {
        addQuad(mb,
          [x0, fy, z1], [x1, fy, z1], [x1, fy, z0], [x0, fy, z0],
          [x0, z1], [x1, z1], [x1, z0], [x0, z0],
          chunk.fmat[i],
          { sub, ao: (s, t) => 1 - 0.78 * occ(gx + s, gz + 1 - t) });

        /* Risers down to a lower neighbour. Uses the wall material because a
         * step's face is a wall, not a floor. */
        for (let d = 0; d < 4; d++) {
          const nx = gx + DIRS[d][0], nz = gz + DIRS[d][1];
          if (world.wallAt(nx, nz) > 0) continue;
          const nflags = world.flagsAt(nx, nz);
          const drop = (nflags & F_NOFLOOR) ? fy - 4 : world.floorAt(nx, nz);
          if (fy - drop < 0.02) continue;
          face(mb, d, x0, z0, x1, z1, drop, fy, chunk.wmat[i],
            (s, t) => 0.55 + 0.35 * t, 1);
        }

        if (flags & F_WATER) {
          const wy = fy + waterDepth;
          addQuad(mb,
            [x0, wy, z1], [x1, wy, z1], [x1, wy, z0], [x0, wy, z0],
            [x0, z1], [x1, z1], [x1, z0], [x0, z0],
            MAT.WATER, { sub: 1, ao: () => 1 });
        }
      }

      if (roofed) {
        addQuad(mb,
          [x0, cy, z0], [x1, cy, z0], [x1, cy, z1], [x0, cy, z1],
          [x0, z0], [x1, z0], [x1, z1], [x0, z1],
          chunk.cmat[i],
          { sub, ao: (s, t) => 1 - 0.40 * occ(gx + s, gz + t) });

        /* Where the neighbouring ceiling is higher, close the step. */
        for (let d = 0; d < 4; d++) {
          const nx = gx + DIRS[d][0], nz = gz + DIRS[d][1];
          if (!(world.flagsAt(nx, nz) & F_CEIL)) continue;
          const ncy = world.ceilAt(nx, nz);
          if (ncy - cy < 0.02) continue;
          face(mb, d, x0, z0, x1, z1, cy, ncy, chunk.cmat[i], () => 0.7, 1);
        }

        if (flags & F_LIGHT) {
          const light = chunk.lights.find(
            (l) => Math.abs(l.x - (gx + 0.5) * cell) < 0.01
                && Math.abs(l.z - (gz + 0.5) * cell) < 0.01);
          const phase = light ? light.phase : -1;
          const dead = light ? light.dead : false;
          const inset = cell * 0.26;
          const py = cy - 0.03;
          const ax = x0 + inset, bx = x1 - inset;
          const az = z0 + inset, bz = z1 - inset;
          /* The diffuser's UVs run 0..1 across the fixture rather than in
           * world metres: the panel texture is one fixture, not a tiling
           * surface, and the material's uvScale must not stretch it. */
          addQuad(mb,
            [ax, py, az], [bx, py, az], [bx, py, bz], [ax, py, bz],
            [0, 0], [1, 0], [1, 1], [0, 1],
            dead ? MAT.ALT : MAT.LIGHT,
            { sub: 1, flick: dead ? -1 : phase, ao: () => 1 });
        }
      }

      /* The way down. Two crossed panes so it reads from any angle, and it is
       * emissive rather than lit — it is not part of the room. */
      if (flags & F_EXIT) {
        addCross(mb, (gx + 0.5) * cell, fy + 0.02, (gz + 0.5) * cell,
          1.15, 2.15, 0.5, MAT.LIGHT);
      }
    }
  }

  /* ---- props ---- */
  for (const p of chunk.props) {
    const builder = PROPS[p.type];
    if (!builder) continue;
    const lx = Math.max(0, Math.min(CHUNK - 1, Math.floor(p.x)));
    const lz = Math.max(0, Math.min(CHUNK - 1, Math.floor(p.z)));
    const pi = chunk.idx(lx, lz);
    builder(mb, Object.assign({}, p, {
      wx: (baseX + p.x) * cell,
      wz: (baseZ + p.z) * cell,
      wy: chunk.floor[pi] * 0.1 + (p.y || 0),
    }));
  }

  return mb.finish();
}
