/*
 * pathfind.js — how a thing gets from where it is to where you are.
 *
 * Walking straight at the player and sliding along whatever you hit is enough
 * to look alive in an open room and falls apart everywhere else: an entity two
 * metres away behind a partition presses into it forever, and the level's
 * architecture — the thing the whole game is made of — stops mattering. What
 * makes something frightening is that it comes *round* the wall.
 *
 * This is a bounded breadth-first search over the cell grid. BFS rather than
 * A* on purpose: the grid is uniform-cost, the window is small, and BFS has no
 * heuristic to get subtly wrong. The window is the real trick — the world is
 * infinite, so the search is clamped to a box around the two endpoints and
 * simply fails if the player is further away than that, which is correct,
 * because something that cannot find you should not be tracking you anyway.
 */

import { F_NOFLOOR } from '../world/grid.js';

/* One shared scratch buffer. Pathfinding runs a few times a second per entity,
 * and allocating a fresh visited-set each time is exactly the kind of garbage
 * that turns into a stutter on a phone. */
const MAX_SPAN = 64;
const scratch = {
  came: new Int32Array(MAX_SPAN * MAX_SPAN),
  seen: new Uint8Array(MAX_SPAN * MAX_SPAN),
  queue: new Int32Array(MAX_SPAN * MAX_SPAN),
  stamp: new Int32Array(MAX_SPAN * MAX_SPAN),
  epoch: 0,
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function passable(world, gx, gz) {
  if (world.wallAt(gx, gz) > 0.6) return false;
  if (world.flagsAt(gx, gz) & F_NOFLOOR) return false;
  return true;
}

/*
 * A route from one cell to another, as world-space waypoints.
 *
 * Returns null when there is no route inside the window — the caller is
 * expected to fall back to something dumber rather than freeze.
 */
export function findPath(world, fromGX, fromGZ, toGX, toGZ, limit = 14) {
  if (fromGX === toGX && fromGZ === toGZ) return [];

  /*
   * Window around both endpoints. The margin has to be whatever is left over
   * after the endpoints themselves, not a fixed number added on top of them —
   * adding a fixed margin overflows the buffer as soon as the two are more
   * than a few cells apart, and the whole search then returns null and the
   * caller quietly falls back to walking into the wall.
   */
  const spanX = Math.abs(toGX - fromGX) + 1;
  const spanZ = Math.abs(toGZ - fromGZ) + 1;
  const room = MAX_SPAN - Math.max(spanX, spanZ);
  if (room < 4) return null;              /* too far apart to route at all */
  const margin = Math.min(limit, Math.floor(room / 2));

  const minX = Math.min(fromGX, toGX) - margin;
  const minZ = Math.min(fromGZ, toGZ) - margin;
  const maxX = Math.max(fromGX, toGX) + margin;
  const maxZ = Math.max(fromGZ, toGZ) + margin;
  const w = maxX - minX + 1;
  const h = maxZ - minZ + 1;
  if (w > MAX_SPAN || h > MAX_SPAN) return null;

  const { came, seen, queue, stamp } = scratch;
  const epoch = ++scratch.epoch;
  const idx = (x, z) => (z - minZ) * w + (x - minX);

  const start = idx(fromGX, fromGZ);
  const goal = idx(toGX, toGZ);
  let head = 0, tail = 0;
  queue[tail++] = start;
  stamp[start] = epoch;
  seen[start] = 1;
  came[start] = -1;

  let found = false;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goal) { found = true; break; }
    const cx = minX + (cur % w);
    const cz = minZ + Math.floor(cur / w);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0], nz = cz + DIRS[d][1];
      if (nx < minX || nz < minZ || nx > maxX || nz > maxZ) continue;
      const ni = idx(nx, nz);
      if (stamp[ni] === epoch && seen[ni]) continue;
      if (!passable(world, nx, nz)) { stamp[ni] = epoch; seen[ni] = 1; came[ni] = -2; continue; }
      stamp[ni] = epoch;
      seen[ni] = 1;
      came[ni] = cur;
      queue[tail++] = ni;
    }
  }
  if (!found) return null;

  /* Walk the parents back, then reverse. */
  const cells = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) {
    if (i < 0) return null;
    cells.push(i);
  }
  cells.reverse();

  const cell = world.cell;
  return cells.map((i) => ({
    x: (minX + (i % w) + 0.5) * cell,
    z: (minZ + Math.floor(i / w) + 0.5) * cell,
  }));
}

/*
 * Straight-line check on the grid. Used to skip the first few waypoints when
 * they are pointlessly round a corner the entity can already walk through —
 * without it, everything moves in visible right angles like a chess piece.
 */
export function clearLine(world, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (world.cell * 0.4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const [gx, gz] = world.cellOf(ax + dx * t, az + dz * t);
    if (!passable(world, gx, gz)) return false;
  }
  return true;
}
