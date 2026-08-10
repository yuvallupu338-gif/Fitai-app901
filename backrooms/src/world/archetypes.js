/*
 * archetypes.js — the sixteen ways a level can be shaped.
 *
 * A hundred levels do not need a hundred generators. They need about sixteen
 * kinds of space — a room maze, a corridor block, a pillared hall, a cave, a
 * street grid — each of which takes a fistful of parameters and a palette and
 * comes out looking like somewhere specific. Level 0 and Level 4 share this
 * file's `rooms` and `corridors` and could not look less alike.
 *
 * Every generator obeys three rules:
 *
 *   1. It only touches its own chunk. Never reach into a neighbour: chunks are
 *      generated on demand in whatever order the player walks, so "the chunk
 *      next door" may not exist yet, and may be regenerated later.
 *   2. Anything that must line up between chunks — street grids, pillar rows,
 *      corridor spines — is computed from *global* cell coordinates, not from
 *      the per-chunk random stream. That is the whole trick to seamlessness.
 *   3. Anything that must not line up uses the chunk's own stream, which is
 *      seeded from its coordinates and therefore stable.
 *
 * Connectivity is not their problem. chunk.js carves the border doors and
 * guarantees every open cell can be reached, whatever mess is left here.
 */

import { CHUNK, MAT, F_CEIL, F_WATER, F_NOFLOOR, F_DOOR, F_NOLIGHT } from './grid.js';
import { hash2, fbmG, gnoise2, rngFrom } from '../core/rng.js';

const mod = (a, n) => ((a % n) + n) % n;

/* Global cell coordinates of a chunk-local cell. */
function gx(c, x) { return c.cx * CHUNK + x; }
function gz(c, z) { return c.cz * CHUNK + z; }

function fillSolid(c, H, mat = MAT.WALL) {
  const h = Math.min(255, Math.round(H / 0.05));
  c.wall.fill(h);
  c.wmat.fill(mat);
}

export const ARCHETYPES = {

  /*
   * ROOMS — the shape of Level 0, and of half the levels that follow it.
   *
   * Not a maze: mostly open floor with wall runs dropped across it at random,
   * pierced often enough that you are never truly boxed in but not so often
   * that you can see where you are going. The pathological property of the
   * real thing — that every room looks like the last one and you cannot tell
   * whether you have been here — falls out of this for free.
   */
  rooms(c, P, rng) {
    const H = P.wallHeight;
    const runs = P.runs ?? 15;
    for (let i = 0; i < runs; i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      const horiz = rng.chance(0.5);
      const len = rng.irange(P.runMin ?? 3, P.runMax ?? 12);
      c.wallRun(x, z, horiz ? 1 : 0, horiz ? 0 : 1, len, H, MAT.WALL, rng, P.gap ?? 0.10);
    }
    const rooms = P.rooms ?? 2;
    for (let i = 0; i < rooms; i++) {
      const w = rng.irange(4, 9), h = rng.irange(4, 9);
      if (CHUNK - w < 1 || CHUNK - h < 1) continue;
      c.roomOutline(rng.int(CHUNK - w), rng.int(CHUNK - h), w, h, H, MAT.WALL, rng,
        P.roomGap ?? 0.13);
    }
    /* Alcoves: a stub of wall going nowhere. They are what make a corner feel
     * like it might be hiding something. */
    for (let i = 0; i < (P.stubs ?? 4); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      c.wallRun(x, z, rng.chance(0.5) ? 1 : 0, 0, rng.irange(1, 3), H, MAT.WALL, rng, 0);
    }
  },

  /* MAZE — a proper perfect maze on odd cells. Claustrophobic and solvable,
   * which is the opposite of `rooms` and exactly right for the levels whose
   * whole idea is that the walls are close. */
  maze(c, P, rng) {
    const H = P.wallHeight;
    fillSolid(c, H, P.wallMat ?? MAT.WALL);
    const seen = new Uint8Array(CHUNK * CHUNK);
    const stack = [[1, 1]];
    c.clearWall(1, 1);
    seen[c.idx(1, 1)] = 1;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (stack.length) {
      const [x, z] = stack[stack.length - 1];
      /* Shuffle a copy so the walk is chunk-deterministic. */
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      let moved = false;
      for (const oi of order) {
        const [dx, dz] = DIRS[oi];
        const nx = x + dx * 2, nz = z + dz * 2;
        if (nx < 1 || nz < 1 || nx > CHUNK - 1 || nz > CHUNK - 1) continue;
        if (seen[c.idx(nx, nz)]) continue;
        c.clearWall(x + dx, z + dz);
        c.clearWall(nx, nz);
        seen[c.idx(nx, nz)] = 1;
        stack.push([nx, nz]);
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }
    /* A perfect maze has exactly one route between any two points, which after
     * ten minutes stops being frightening and starts being tedious. Knocking a
     * few walls out puts loops back in. */
    for (let i = 0; i < (P.loops ?? 6); i++) {
      c.clearWall(rng.irange(1, CHUNK - 2), rng.irange(1, CHUNK - 2));
    }
  },

  /* HALLS — a pillared span with no walls to speak of. Level 1's warehouse,
   * car parks, plant rooms: places where the fog does the work and the pillars
   * give you just enough parallax to know you are moving. */
  halls(c, P, rng) {
    const H = P.wallHeight;
    const sp = P.pillarSpacing ?? 4;
    const size = P.pillarSize ?? 1;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        if (mod(wx, sp) < size && mod(wz, sp) < size) {
          c.setWall(x, z, H, P.pillarMat ?? MAT.ALT);
        }
      }
    }
    for (let i = 0; i < (P.runs ?? 3); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      c.wallRun(x, z, rng.chance(0.5) ? 1 : 0, rng.chance(0.5) ? 1 : 0,
        rng.irange(4, 12), H, MAT.WALL, rng, 0.15);
    }
  },

  /*
   * CORRIDORS — a building floor plan: corridor grid, rooms in the blocks
   * between, one door each. Hotels, offices, hospitals and schools are all
   * this generator with different numbers and different carpet.
   */
  corridors(c, P, rng) {
    const H = P.wallHeight;
    const per = P.block ?? 7;
    const cw = P.corridorWidth ?? 2;
    fillSolid(c, H, MAT.WALL);
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const mx = mod(wx, per), mz = mod(wz, per);
        const inCorridor = mx < cw || mz < cw;
        const inRoom = mx > cw && mx < per - 1 && mz > cw && mz < per - 1;
        if (inCorridor || inRoom) c.clearWall(x, z);
        if (inRoom) {
          const bx = Math.floor(wx / per), bz = Math.floor(wz / per);
          /* Rooms get their own finish so a corridor reads as a corridor. */
          if (P.roomFloorMat !== undefined) c.fmat[c.idx(x, z)] = P.roomFloorMat;
          void bx; void bz;
        }
      }
    }
    /* One door per block, on a hashed side. Because the block id comes from
     * global coordinates, the two chunks either side of a block boundary agree
     * on where its door is. */
    const blocks = new Set();
    for (let z = -1; z < CHUNK + 1; z++) {
      for (let x = -1; x < CHUNK + 1; x++) {
        blocks.add(Math.floor(gx(c, x) / per) + ',' + Math.floor(gz(c, z) / per));
      }
    }
    for (const key of blocks) {
      const [bx, bz] = key.split(',').map(Number);
      const h = hash2(bx, bz, P.seed ?? 0);
      const side = h & 3;
      const off = cw + 1 + ((h >>> 4) % Math.max(1, per - cw - 2));
      let wx, wz;
      if (side === 0) { wx = bx * per + cw; wz = bz * per + off; }
      else if (side === 1) { wx = bx * per + per - 1; wz = bz * per + off; }
      else if (side === 2) { wx = bx * per + off; wz = bz * per + cw; }
      else { wx = bx * per + off; wz = bz * per + per - 1; }
      const lx = wx - c.cx * CHUNK, lz = wz - c.cz * CHUNK;
      if (c.inside(lx, lz)) { c.clearWall(lx, lz); c.set(lx, lz, F_DOOR); }
    }
  },

  /* CUBICLES — an open-plan floor. Partitions you can see over but not walk
   * through, which is a specific and very unpleasant kind of lost. */
  cubicles(c, P, rng) {
    const H = P.wallHeight;
    const low = P.partitionHeight ?? 1.35;
    const per = P.pod ?? 3;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const mx = mod(wx, per), mz = mod(wz, per);
        const aisle = mod(Math.floor(wx / per), 3) === 0 || mod(Math.floor(wz / per), 4) === 0;
        if (aisle) continue;
        if ((mx === 0 || mz === 0) && !((hash2(wx, wz, P.seed ?? 0) & 7) === 0)) {
          c.setWall(x, z, low, P.partitionMat ?? MAT.ALT);
        }
      }
    }
    /* A handful of real rooms — meeting rooms, offices with a door shut. */
    for (let i = 0; i < (P.rooms ?? 2); i++) {
      const w = rng.irange(4, 6), h = rng.irange(4, 6);
      if (CHUNK - w < 1 || CHUNK - h < 1) continue;
      c.roomOutline(rng.int(CHUNK - w), rng.int(CHUNK - h), w, h, H, MAT.WALL, rng, 0.10);
    }
  },

  /*
   * PIPES — maintenance tunnels. Straight bores punched from random points and
   * allowed to cross, which gives long sight lines down a duct and sudden
   * junctions, rather than the even chop of a maze.
   */
  pipes(c, P, rng) {
    const H = P.wallHeight;
    fillSolid(c, H, MAT.WALL);
    const bores = P.bores ?? 9;
    for (let i = 0; i < bores; i++) {
      let x = rng.int(CHUNK), z = rng.int(CHUNK);
      let dir = rng.int(4);
      const segs = rng.irange(2, 4);
      for (let s = 0; s < segs; s++) {
        const len = rng.irange(4, 12);
        const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
        const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
        for (let k = 0; k < len; k++) {
          c.clearWall(x, z);
          if (P.wide && rng.chance(0.35)) c.clearWall(x + dz, z + dx);
          x += dx; z += dz;
          if (x < 0 || z < 0 || x >= CHUNK || z >= CHUNK) break;
        }
        x = Math.max(0, Math.min(CHUNK - 1, x));
        z = Math.max(0, Math.min(CHUNK - 1, z));
        dir = (dir + (rng.chance(0.5) ? 1 : 3)) % 4;
      }
    }
    /* Pipe runs bolted along the walls, at two heights. */
    for (let i = 0; i < (P.pipeProps ?? 6); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      if (c.solid(x, z)) continue;
      c.props.push({
        type: 'piperun', x: x + 0.5, z: z + 0.5,
        y: rng.chance(0.5) ? H - 0.35 : 0.6,
        rot: rng.chance(0.5) ? 0 : Math.PI / 2,
        len: rng.range(3, 8), mat: MAT.PROP,
      });
    }
  },

  /*
   * CAVE — thresholded noise rather than cellular automata, because noise is
   * continuous across chunk boundaries by construction and CA is not. The
   * floor and ceiling both wander, which is what stops it reading as "rooms
   * with rock wallpaper".
   */
  cave(c, P, rng) {
    const H = P.wallHeight;
    const s = P.seed ?? 0;
    const scale = P.caveScale ?? 0.055;
    const thr = P.rockThreshold ?? 0.53;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const n = fbmG(wx * scale, wz * scale, s, 4) * 0.75
                + fbmG(wx * scale * 3, wz * scale * 3, s + 7, 2) * 0.25;
        const i = c.idx(x, z);
        if (n > thr) {
          c.wall[i] = Math.min(255, Math.round(H / 0.05));
          c.wmat[i] = P.rockMat ?? MAT.WALL;
        } else {
          const rel = (thr - n) / thr;
          c.setFloor(x, z, (gnoise2(wx * 0.16, wz * 0.16, s + 3) - 0.5) * (P.relief ?? 0.9));
          /* Ceiling drops where the rock is close, so the roof follows the
           * shape of the passage instead of sitting flat over it. */
          c.setCeil(x, z, -(1 - Math.min(1, rel * 2.4)) * (P.ceilRelief ?? 1.6));
        }
      }
    }
  },

  /*
   * POOL — the poolrooms. Tiled rooms, wide arched openings instead of doors,
   * and water standing in sunken basins. Bright, warm, empty and completely
   * silent apart from the water: the one part of this mythology that is
   * beautiful before it is frightening.
   */
  pool(c, P, rng) {
    const H = P.wallHeight;
    for (let i = 0; i < (P.runs ?? 8); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      const horiz = rng.chance(0.5);
      c.wallRun(x, z, horiz ? 1 : 0, horiz ? 0 : 1, rng.irange(5, 14), H,
        MAT.WALL, rng, P.gap ?? 0.22);
    }
    const depth = P.poolDepth ?? 1.4;
    for (let i = 0; i < (P.pools ?? 3); i++) {
      const w = rng.irange(3, 7), h = rng.irange(3, 7);
      if (CHUNK - w < 2 || CHUNK - h < 2) continue;
      const x0 = 1 + rng.int(CHUNK - w - 1), z0 = 1 + rng.int(CHUNK - h - 1);
      c.fillRect(x0, z0, x0 + w - 1, z0 + h - 1, (x, z, idx) => {
        if (c.wall[idx]) return;
        c.setFloor(x, z, -depth);
        c.flags[idx] |= F_WATER;
        c.fmat[idx] = P.poolFloorMat ?? MAT.ALT;
      });
    }
    /* Shallow water lying over everything else is `gen.flood`, applied
     * uniformly in chunk.js — see the note there. */
  },

  /* CITY — street grid, blocks solid to well above the fog. You never get
   * inside; the level is the street. */
  city(c, P, rng) {
    const per = P.block ?? 11;
    const road = P.road ?? 3;
    const bh = P.buildingHeight ?? 12;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const mx = mod(wx, per), mz = mod(wz, per);
        const i = c.idx(x, z);
        if (mx < road || mz < road) {
          c.fmat[i] = P.roadMat ?? MAT.FLOOR;
          /* Kerb: a step up onto the pavement, which is a small thing that
           * does an enormous amount for "this is a street". */
          if (mx === road || mz === road) c.setFloor(x, z, 0.14);
          c.flags[i] &= ~F_CEIL;
        } else {
          const bx = Math.floor(wx / per), bz = Math.floor(wz / per);
          const h = hash2(bx, bz, P.seed ?? 0);
          c.wall[i] = Math.min(255, Math.round((bh + (h % 9)) / 0.05));
          c.wmat[i] = (h & 4) ? (P.altMat ?? MAT.ALT) : MAT.WALL;
          c.flags[i] &= ~F_CEIL;
          c.flags[i] |= F_NOLIGHT;
        }
      }
    }
    if (P.streetlights) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const wx = gx(c, x), wz = gz(c, z);
          if (mod(wx, per) === road - 1 && mod(wz, 6) === 0 && !c.solid(x, z)) {
            c.props.push({ type: 'lamppost', x: x + 0.5, z: z + 0.5, y: 0, mat: MAT.PROP });
            const cell = c.level.cellSize;
            c.lights.push({
              x: (wx + 0.5) * cell + 0.75, y: 4.5, z: (wz + 0.5) * cell,
              r: P.lampColor ? P.lampColor[0] : 1.0,
              g: P.lampColor ? P.lampColor[1] : 0.72,
              b: P.lampColor ? P.lampColor[2] : 0.36,
              intensity: P.lampIntensity ?? 3.2, radius: 16,
              phase: (hash2(wx, wz, P.seed ?? 0) % 100) < 15 ? 0.4 : -1,
              dead: false,
            });
          }
        }
      }
    }
  },

  /* SUBURB — lots, fences, houses you cannot enter, permanent night. */
  suburb(c, P, rng) {
    const per = P.block ?? 8;
    const road = P.road ?? 2;
    const H = P.wallHeight ?? 3.2;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const mx = mod(wx, per), mz = mod(wz, per);
        const i = c.idx(x, z);
        c.flags[i] &= ~F_CEIL;
        if (mx < road || mz < road) {
          c.fmat[i] = P.roadMat ?? MAT.FLOOR;
          /* Street lighting. Without it a permanent-night suburb is a black
           * screen with a horizon in it — you cannot see the houses that are
           * the entire point of the level. */
          if (P.streetlights && mx === road - 1 && mod(wz, 7) === 0) {
            const cell = c.level.cellSize;
            c.props.push({ type: 'lamppost', x: x + 0.5, z: z + 0.5, y: 0, mat: MAT.PROP });
            c.lights.push({
              x: (wx + 0.5) * cell + 0.75, y: 4.5, z: (wz + 0.5) * cell,
              r: P.lampColor ? P.lampColor[0] : 1.0,
              g: P.lampColor ? P.lampColor[1] : 0.70,
              b: P.lampColor ? P.lampColor[2] : 0.34,
              intensity: P.lampIntensity ?? 3.0, radius: 15,
              phase: (hash2(wx, wz, P.seed ?? 0) % 100) < 12 ? 0.7 : -1,
              dead: false,
            });
          }
          continue;
        }
        c.fmat[i] = P.lawnMat ?? MAT.ALT;
        const inHouse = mx >= road + 2 && mx <= per - 2 && mz >= road + 2 && mz <= per - 2;
        if (inHouse) {
          c.wall[i] = Math.min(255, Math.round((H + 1.5) / 0.05));
          c.wmat[i] = MAT.WALL;
          c.flags[i] |= F_NOLIGHT;
        } else if ((mx === road || mz === road) && ((hash2(wx, wz, P.seed ?? 0) & 15) !== 0)) {
          c.setWall(x, z, P.fenceHeight ?? 1.5, P.fenceMat ?? MAT.ALT);
        }
      }
    }
  },

  /* OPEN — no architecture at all. Fields, salt flats, an ocean, the inside of
   * something too big to see the sides of. Everything comes from the palette,
   * the fog and whatever props get scattered. */
  open(c, P, rng) {
    const s = P.seed ?? 0;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const i = c.idx(x, z);
        if (!P.ceiling) c.flags[i] &= ~F_CEIL;
        if (P.relief) {
          const wx = gx(c, x), wz = gz(c, z);
          c.setFloor(x, z, (fbmG(wx * 0.03, wz * 0.03, s, 3) - 0.5) * P.relief);
        }
      }
    }
    const n = P.scatter ?? 0;
    for (let i = 0; i < n; i++) {
      const x = rng() * CHUNK, z = rng() * CHUNK;
      c.props.push({
        type: P.scatterType || 'billboard', x, z, y: 0,
        rot: rng() * Math.PI, scale: rng.range(P.scatterMin ?? 0.8, P.scatterMax ?? 1.6),
        /* Left undefined on purpose: each prop builder knows which slot it
         * belongs in (a tree trunk is not foliage), and only a level that
         * wants to override it says so. */
        mat: P.scatterMat,
      });
    }
  },

  /* PLATFORMS — islands over nothing. The gaps are real: step off and you
   * fall, and falling is how you leave. */
  platforms(c, P, rng) {
    const s = P.seed ?? 0;
    const scale = P.islandScale ?? 0.045;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const i = c.idx(x, z);
        c.flags[i] &= ~F_CEIL;
        const n = fbmG(wx * scale, wz * scale, s, 4);
        /* Bridges: thin deterministic strips that stitch islands together, so
         * the level is walkable rather than a set of prisons. */
        const bridge = mod(wx, P.bridgeSpacing ?? 9) === 0 || mod(wz, P.bridgeSpacing ?? 9) === 0;
        if (n < (P.islandThreshold ?? 0.46) && !bridge) {
          c.flags[i] |= F_NOFLOOR;
        } else {
          /* Same cap as the terraces: island tops have to be steppable or the
           * bridges between them lead nowhere. */
          c.setFloor(x, z, Math.round((n - 0.5) * (P.relief ?? 6) / 0.42) * 0.42);
        }
      }
    }
  },

  /* WAREHOUSE — racking, aisles, and the feeling that the inventory is the
   * point and you are not. */
  warehouse(c, P, rng) {
    const H = P.wallHeight;
    const per = P.aisle ?? 5;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        if (mod(wz, per) < (P.rackDepth ?? 2) && mod(wx, 14) !== 0) {
          c.setWall(x, z, P.rackHeight ?? Math.min(H - 0.4, 3.2), P.rackMat ?? MAT.PROP);
        }
      }
    }
    for (let i = 0; i < (P.crates ?? 5); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      if (c.solid(x, z)) continue;
      c.props.push({
        type: 'crate', x: x + rng.range(0.25, 0.75), z: z + rng.range(0.25, 0.75),
        y: 0, rot: rng() * Math.PI, scale: rng.range(0.8, 1.5), mat: MAT.PROP,
      });
    }
  },

  /* PARKING — low ceiling, columns on a tight grid, painted bays. The lowest
   * ceiling in the game, and the only place where the fixtures are below head
   * height often enough to matter. */
  parking(c, P, rng) {
    const H = P.wallHeight;
    const sp = P.pillarSpacing ?? 3;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        if (mod(wx, sp) === 0 && mod(wz, sp * 2) === 0) c.setWall(x, z, H, P.pillarMat ?? MAT.ALT);
        else if (mod(wz, sp * 2) === sp && mod(wx, 2) === 0) {
          c.fmat[c.idx(x, z)] = P.bayMat ?? MAT.FLOOR;
        }
      }
    }
    for (let i = 0; i < (P.cars ?? 3); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      if (c.solid(x, z)) continue;
      c.props.push({
        type: 'car', x: x + 0.5, z: z + 0.5, y: 0,
        rot: rng.chance(0.5) ? 0 : Math.PI / 2, mat: MAT.PROP, scale: 1,
      });
    }
  },

  /* TERRACES — quantised ground. Steps, landings and ramps going nowhere in
   * particular; the levels that are meant to feel like a stairwell that has
   * been unrolled. */
  terraces(c, P, rng) {
    const s = P.seed ?? 0;
    /* Capped at the player's step height. A 90cm terrace looks magnificent and
     * is a wall you cannot climb, and a level made of walls you cannot climb is
     * a level nobody can cross. */
    const step = Math.min(P.step ?? 0.4, 0.45);
    const amp = P.amplitude ?? 4;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = gx(c, x), wz = gz(c, z);
        const n = fbmG(wx * (P.terraceScale ?? 0.035), wz * (P.terraceScale ?? 0.035), s, 3);
        c.setFloor(x, z, Math.round((n - 0.5) * amp / step) * step);
        if (!P.ceiling) c.flags[c.idx(x, z)] &= ~F_CEIL;
      }
    }
    if (P.walls) {
      for (let i = 0; i < P.walls; i++) {
        const x = rng.int(CHUNK), z = rng.int(CHUNK);
        c.wallRun(x, z, rng.chance(0.5) ? 1 : 0, rng.chance(0.5) ? 1 : 0,
          rng.irange(3, 9), P.wallHeight, MAT.WALL, rng, 0.2);
      }
    }
  },

  /* RUINS — the rooms archetype after something happened to it. Walls at half
   * height, holes in the ceiling, rubble underfoot. */
  ruins(c, P, rng) {
    ARCHETYPES.rooms(c, P, rng);
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const i = c.idx(x, z);
        const wx = gx(c, x), wz = gz(c, z);
        const decay = fbmG(wx * 0.09, wz * 0.09, (P.seed ?? 0) + 41, 3);
        if (c.wall[i] && decay > 0.55) {
          c.wall[i] = Math.round(c.wall[i] * (0.25 + (1 - decay)));
        }
        if (decay > (P.holes ?? 0.66)) {
          c.flags[i] &= ~F_CEIL;
          c.flags[i] |= F_NOLIGHT;
        }
        if (!c.wall[i] && decay > 0.62) c.setFloor(x, z, -0.1);
      }
    }
    for (let i = 0; i < (P.rubble ?? 6); i++) {
      const x = rng.int(CHUNK), z = rng.int(CHUNK);
      if (c.solid(x, z)) continue;
      c.props.push({
        type: 'rubble', x: x + rng(), z: z + rng(), y: 0,
        rot: rng() * Math.PI, scale: rng.range(0.5, 1.4), mat: MAT.PROP,
      });
    }
  },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

/* A chunk's private random stream. Seeded from its own coordinates and the
 * level seed, and from nothing else. */
export function chunkRng(level, cx, cz, salt = 0) {
  return rngFrom(hash2(cx, cz, (level.seed | 0) + salt * 7919));
}
