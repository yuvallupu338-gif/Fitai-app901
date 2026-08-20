/*
 * collide.js — the world as boxes.
 *
 * The neighbourhood is bounded and it is made of rectangles, so there is no
 * grid here and no voxels: houses, walls, fences, hedges, cars and bins go in
 * as axis-aligned boxes, get bucketed into an 8-metre spatial hash once at
 * build time, and everything the game asks — can I walk here, what am I
 * standing on, can she see me — is a query against that.
 *
 * Three of those queries carry real weight:
 *
 *   groundAt      is what lets you climb. A box whose top is within a step of
 *                 your feet is not an obstacle, it is a surface, and that one
 *                 rule is the whole of "stand on the bin, then the fence, then
 *                 the garage roof" with no climbing system anywhere.
 *   lineOfSight   decides whether she has seen you, in real 3D against the
 *                 same boxes you are hiding behind. A picket fence stops her
 *                 seeing a crouched player and not a standing one, and that
 *                 falls out of the geometry rather than being coded anywhere.
 *   heightField   is the same world again, flattened to a texture, so the
 *                 shader can march it for shadows without knowing any of this
 *                 exists.
 */

import { segmentBox } from '../core/math.js';

const CELL = 8;

export class CollisionWorld {
  constructor(bounds) {
    this.bounds = bounds;
    this.boxes = [];
    this.pits = [];
    this.cells = new Map();
    this.built = false;
  }

  /*
   * tag       what this is, for the interaction code ('house', 'fence', ...)
   * opaque    blocks line of sight (a hedge does, a flag pole does not)
   * platform  can be stood on (almost everything; a hedge cannot)
   * solid     blocks movement at all (false for trigger volumes)
   */
  add(x0, y0, z0, x1, y1, z1, opts = {}) {
    const b = {
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      y0: Math.min(y0, y1), y1: Math.max(y0, y1),
      z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      tag: opts.tag || 'world',
      id: opts.id ?? -1,
      opaque: opts.opaque !== false,
      platform: opts.platform !== false,
      solid: opts.solid !== false,
      soft: !!opts.soft,          /* rustles and slows, does not stop you    */
    };
    this.boxes.push(b);
    this.built = false;
    return b;
  }

  /* A hole in the ground: the pit in a lawn, the sunken basin of a fountain.
   * Kept separate from the boxes because a hole is the absence of the default
   * floor, and expressing that as geometry means describing the whole world's
   * floor as boxes for the sake of two rectangles. */
  addPit(x0, z0, x1, z1, y) {
    this.pits.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      z0: Math.min(z0, z1), z1: Math.max(z0, z1), y,
    });
  }

  build() {
    this.cells.clear();
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
      const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cx * 73856093 ^ cz * 19349663;
          let list = this.cells.get(key);
          if (!list) { list = []; this.cells.set(key, list); }
          list.push(b);
        }
      }
    }
    this.built = true;
    return this;
  }

  /* Every box whose cell overlaps the query rectangle. Duplicates are possible
   * when a box spans cells; callers all tolerate seeing a box twice, which is
   * cheaper than de-duplicating on every query. */
  near(x0, z0, x1, z1, out) {
    const res = out || [];
    res.length = 0;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(cx * 73856093 ^ cz * 19349663);
        if (!list) continue;
        for (const b of list) if (!res.includes(b)) res.push(b);
      }
    }
    return res;
  }

  /* ---------------------------------------------------------------- *
   * Standing
   * ---------------------------------------------------------------- */

  pitAt(x, z) {
    for (const p of this.pits) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p.y;
    }
    return null;
  }

  /*
   * The surface under (x,z) that a body with its feet at `feetY` would be
   * standing on. Boxes higher than a step above the feet are ignored: they are
   * things to walk into, not onto, and treating them as ground is what
   * teleports a player onto a roof when they brush the wall underneath it.
   */
  groundAt(x, z, feetY = 1e9, step = 0.62, radius = 0) {
    const pit = this.pitAt(x, z);
    let best = pit === null ? 0 : pit;
    const list = this.near(x - radius, z - radius, x + radius, z + radius, this._tmpA
      || (this._tmpA = []));
    const reach = feetY + step;
    for (const b of list) {
      if (!b.platform) continue;
      if (x < b.x0 - radius || x > b.x1 + radius) continue;
      if (z < b.z0 - radius || z > b.z1 + radius) continue;
      if (b.y1 > reach) continue;
      if (b.y1 > best) best = b.y1;
    }
    return best;
  }

  /*
   * What the surface under the feet is made of, as a tag. The footstep sound
   * and the amount of noise a step makes both read this, which is why it
   * belongs here rather than being guessed from position: the tarmac, the
   * pavement, the porch decking and the lawn all meet within two metres of
   * every front door in this neighbourhood, and a footstep that disagrees with
   * the ground is something the ear catches immediately even when the player
   * could not say what was wrong.
   */
  surfaceAt(x, z, feetY, step = 0.62) {
    let best = -1e9, tag = 'grass';
    const list = this.near(x, z, x, z, this._tmpF || (this._tmpF = []));
    for (const b of list) {
      if (!b.platform) continue;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (b.y1 > feetY + step) continue;
      if (b.y1 > best) { best = b.y1; tag = b.tag; }
    }
    if (best < -1e8) return 'grass';
    return tag;
  }

  /* The lowest thing above the head, or a large number for open sky. Used to
   * stop a crouched player standing up inside a car or under a porch. */
  ceilingAt(x, z, feetY) {
    let best = 1e9;
    const list = this.near(x, z, x, z, this._tmpB || (this._tmpB = []));
    for (const b of list) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (b.y0 < feetY + 0.05) continue;
      if (b.y0 < best) best = b.y0;
    }
    return best;
  }

  /* ---------------------------------------------------------------- *
   * Moving
   * ---------------------------------------------------------------- */

  /*
   * Move a cylinder by (dx,dz), sliding along whatever it hits. The two axes
   * are resolved separately and in order, which is the oldest trick in the
   * book and still the right one: it gives you sliding along a wall for free,
   * and it cannot wedge a player in an inside corner the way a single
   * combined resolve can.
   *
   * Returns a bitfield: 1 = blocked in X, 2 = blocked in Z, 4 = brushed
   * something soft (a hedge, which is a noise, not a wall).
   */
  moveWithCollision(pos, dx, dz, radius, step, height = 1.75) {
    let flags = 0;
    const feet = pos.y;
    const headY = feet + height;
    const list = this.near(
      Math.min(pos.x, pos.x + dx) - radius - 1, Math.min(pos.z, pos.z + dz) - radius - 1,
      Math.max(pos.x, pos.x + dx) + radius + 1, Math.max(pos.z, pos.z + dz) + radius + 1,
      this._tmpC || (this._tmpC = []));

    const blocks = (b) => b.solid && b.y1 > feet + step && b.y0 < headY;

    /* X */
    let nx = pos.x + dx;
    for (const b of list) {
      if (!blocks(b)) {
        if (b.soft && overlaps(nx, pos.z, radius, b)) flags |= 4;
        continue;
      }
      if (!overlaps(nx, pos.z, radius, b)) continue;
      nx = dx > 0 ? b.x0 - radius - 0.001 : b.x1 + radius + 0.001;
      flags |= 1;
    }
    pos.x = nx;

    /* Z */
    let nz = pos.z + dz;
    for (const b of list) {
      if (!blocks(b)) {
        if (b.soft && overlaps(pos.x, nz, radius, b)) flags |= 4;
        continue;
      }
      if (!overlaps(pos.x, nz, radius, b)) continue;
      nz = dz > 0 ? b.z0 - radius - 0.001 : b.z1 + radius + 0.001;
      flags |= 2;
    }
    pos.z = nz;

    /* The edge of the world. There is a hedge there and it is three and a half
     * metres of it, but the clamp is what actually holds — a player who gets
     * behind the hedge is in a grey void, and finding that is worse than
     * finding nothing. */
    const bd = this.bounds;
    pos.x = Math.max(bd.x0 + radius, Math.min(bd.x1 - radius, pos.x));
    pos.z = Math.max(bd.z0 + radius, Math.min(bd.z1 - radius, pos.z));
    return flags;
  }

  /*
   * Is there room for a body standing on `ground` here?
   *
   * This is the player's own rule, not a stricter one: anything whose top is
   * within a step of your feet is a thing you walk up, not a thing you walk
   * into. Getting that wrong in one place and right in the other is how a
   * staircase of crates ends up climbable by the player and impassable to the
   * reachability test that is supposed to prove it — which is exactly what
   * happened, and why this lives here rather than in the test.
   */
  standableAt(x, z, ground, radius = 0.34, height = 1.75, step = 0.62) {
    const list = this.near(x - radius, z - radius, x + radius, z + radius,
      this._tmpG || (this._tmpG = []));
    for (const b of list) {
      if (!b.solid) continue;
      if (b.y1 <= ground + step) continue;      /* a step, not a wall        */
      if (b.y0 >= ground + height) continue;    /* overhead                  */
      if (overlaps(x, z, radius, b)) return false;
    }
    return true;
  }

  /* Is this spot clear enough to stand a body in? Used when she picks where to
   * appear and when the flag looks for somewhere to fall. */
  clearAt(x, z, radius, feet = 0, height = 1.8) {
    const list = this.near(x - radius, z - radius, x + radius, z + radius,
      this._tmpD || (this._tmpD = []));
    for (const b of list) {
      if (!b.solid) continue;
      if (b.y1 <= feet + 0.3 || b.y0 >= feet + height) continue;
      if (overlaps(x, z, radius, b)) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Seeing
   * ---------------------------------------------------------------- */

  /*
   * Unobstructed sight between two points. Walks only the boxes in the cells
   * the segment passes near, which for a 30-metre sight line across a suburb
   * is a few dozen rather than a few hundred.
   *
   * `ignoreTag` exists for one case: she must be able to see out of a house
   * she is standing inside, and her own walls would otherwise blind her.
   */
  lineOfSight(x0, y0, z0, x1, y1, z1, ignore) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const list = this.near(
      Math.min(x0, x1) - 0.5, Math.min(z0, z1) - 0.5,
      Math.max(x0, x1) + 0.5, Math.max(z0, z1) + 0.5,
      this._tmpE || (this._tmpE = []));
    for (const b of list) {
      if (!b.opaque) continue;
      if (ignore && ignore(b)) continue;
      if (segmentBox(x0, y0, z0, dx, dy, dz, b) >= 0) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- *
   * The height field
   * ---------------------------------------------------------------- */

  /*
   * Everything opaque, flattened into a single-channel height texture the
   * shader marches for shadows. The neighbourhood is bounded, so unlike the
   * sibling app's rolling window this is the whole world at once and never
   * needs re-uploading — one texture, built at load, correct forever.
   *
   * MAX_H is the divisor the shader must use to decode it. Twelve metres
   * covers the ridge of the tallest roof with room to spare; raising it costs
   * precision everywhere, which shows up as stair-stepping in the shadow of a
   * fence.
   */
  heightField(size = 256, maxH = 12) {
    const bd = this.bounds;
    const w = bd.x1 - bd.x0, d = bd.z1 - bd.z0;
    const px = new Uint8Array(size * size * 4);
    /* One texel is a square in world space; the field is stretched to the
     * bounds, and the shader is handed the same rectangle. */
    for (const b of this.boxes) {
      if (!b.opaque || b.y1 <= 0.2) continue;
      const i0 = Math.max(0, Math.floor((b.x0 - bd.x0) / w * size));
      const i1 = Math.min(size - 1, Math.ceil((b.x1 - bd.x0) / w * size));
      const j0 = Math.max(0, Math.floor((b.z0 - bd.z0) / d * size));
      const j1 = Math.min(size - 1, Math.ceil((b.z1 - bd.z0) / d * size));
      const v = Math.min(255, Math.round(b.y1 / maxH * 255));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const o = (j * size + i) * 4;
          if (px[o] < v) px[o] = v;
        }
      }
    }
    return { pixels: px, size, maxH, rect: [bd.x0, bd.z0, w, d] };
  }
}

function overlaps(x, z, r, b) {
  return x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1;
}
