/*
 * chunks.js — the vocabulary a hundred levels are written in.
 *
 * A level here is a sentence of set pieces laid left to right: some flat
 * ground, a pit, three blocks and a Koopa, a staircase, a pipe with a plant in
 * it. Each chunk builds its own floor and reports how wide it turned out, so
 * the generator can keep appending until it hits the length it wants without
 * knowing what any individual piece does.
 *
 * The reason it is chunks rather than noise is solvability. A generator that
 * scatters tiles produces levels that are occasionally impossible, and a
 * hundred levels means a hundred chances to hand the player one. Here the
 * hard limits live inside the pieces:
 *
 *   - No pit is wider than four tiles. A running jump clears a bit over five,
 *     a standing jump clears three; four is a jump you have to mean without
 *     being one you have to have run up to.
 *   - Nothing that has to be jumped onto is more than four tiles above the
 *     thing you jump from, which is inside a standing jump's ~4.5 tiles.
 *   - Every chunk starts and ends with the walkable surface at the same
 *     height, so pieces compose in any order. Raised ground is always built
 *     with a ramp at both ends, inside the chunk.
 *
 * Difficulty (`c.diff`, 0 at level 1 and 1 at level 100) never changes those
 * limits. It changes how often the hard pieces come up, how many enemies are
 * in them, and how much of the safe padding between them is left.
 */

import { T } from '../game/tiles.js';
import { putPipe } from '../game/level.js';

/* ------------------------------------------------------------------ *
 * Helpers every chunk uses
 * ------------------------------------------------------------------ */

/* Lay solid floor from x to x+w-1. */
function floor(c, x, w) {
  c.level.fill(x, c.groundY, x + w - 1, c.level.h - 1, T.GROUND);
}

/* A ledge: solid ground raised `up` tiles, with the ramp already on it. */
function ledge(c, x, w, up) {
  const top = c.groundY - up;
  c.level.fill(x, top, x + w - 1, c.level.h - 1, T.GROUND);
  return top;
}

/* Drop an enemy so its feet are on the given row. */
function walker(c, type, col, row, opts) {
  c.level.spawn(type, col, row - 1, opts);
}

/* The roster this world has unlocked. Introducing everything at once is the
   fastest way to make a hundred levels feel like one level. */
export function rosterFor(world) {
  const r = ['goomba'];
  if (world >= 1) r.push('koopa');
  if (world >= 3) r.push('koopaRed');
  if (world >= 5) r.push('buzzy');
  if (world >= 8) r.push('koopaWing');
  if (world >= 11) r.push('spiny');
  return r;
}

function pickWalker(c) {
  const roster = c.roster;
  const kind = c.rng.pick(roster);
  switch (kind) {
    case 'koopa': return ['koopa', { variant: 'green' }];
    case 'koopaRed': return ['koopa', { variant: 'red' }];
    case 'buzzy': return ['koopa', { variant: 'buzzy' }];
    case 'koopaWing': return ['koopa', { variant: 'green', winged: true }];
    case 'spiny': return ['spiny', {}];
    default: return ['goomba', { variant: c.theme === 'underground' ? 'blue' : 'brown' }];
  }
}

/*
 * How many enemies a stretch of this difficulty gets. Never zero: a chunk
 * whose whole job is enemies and which rolls none is a chunk of empty floor,
 * and enough of those in a row is what makes a generated level feel generated.
 */
function enemyCount(c, max) {
  const n = 1 + Math.round(c.diff * (max - 1) + c.rng.next());
  return Math.max(1, Math.min(max, n));
}

/* A block row wants to be reachable: four tiles over the floor is the height
   the whole game is built around, because it is what a small player's jump
   clears with the block still hittable from underneath. */
const BLOCK_H = 4;
const HIGH_H = 8;

function blockRow(c, x, spec, up) {
  const row = c.groundY - (up || BLOCK_H);
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i];
    if (ch === '.') continue;
    c.level.set(x + i, row, TILE_FOR[ch]);
  }
  return row;
}

const TILE_FOR = {
  b: T.BRICK,
  c: T.BRICK_COIN,
  i: T.BRICK_ITEM,
  s: T.BRICK_STAR,
  u: T.BRICK_1UP,
  '?': T.QUESTION,
  '!': T.QUESTION_ITEM,
  '*': T.QUESTION_STAR,
  '1': T.QUESTION_1UP,
  h: T.HIDDEN_COIN,
  H: T.HIDDEN_1UP,
  o: T.COIN,
  S: T.SOLID,
};

/* Whether this level still owes the player a powerup. Levels that never offer
   one are miserable, and levels that offer six are trivial; the generator
   tracks the count and the block chunks ask before choosing. */
function powerupGlyph(c) {
  if (c.powerups < c.powerupTarget) { c.powerups++; return '!'; }
  return '?';
}

/* ------------------------------------------------------------------ *
 * The chunks
 * ------------------------------------------------------------------ */

export const CHUNKS = {
  /* ---- plain ground, the punctuation between everything else ---- */
  flat: {
    weight: (c) => (c.water ? 0 : 2.2 - c.diff),
    build(c) {
      const w = c.rng.int(4, 8);
      floor(c, c.x, w);
      if (c.rng.chance(0.35)) c.level.decor('bush', c.x + 1, c.groundY - 1);
      if (w >= 6 && c.rng.chance(0.35 + c.diff * 0.25)) {
        const [type, opts] = pickWalker(c);
        walker(c, type, c.x + w - 2, c.groundY, opts);
      }
      return w;
    },
  },

  coins: {
    weight: (c) => (c.water ? 0 : 1.1),
    build(c) {
      const w = c.rng.int(5, 8);
      floor(c, c.x, w);
      const row = c.groundY - c.rng.int(2, 4);
      for (let i = 1; i < w - 1; i += 2) c.level.set(c.x + i, row, T.COIN);
      return w;
    },
  },

  /* ---- pits ---- */
  gap: {
    weight: (c) => (c.water ? 0 : 1.6 + c.diff),
    build(c) {
      const lead = c.rng.int(3, 5);
      const width = Math.min(4, 2 + Math.floor(c.diff * 2 + c.rng.next()));
      const tail = c.rng.int(3, 5);
      floor(c, c.x, lead);
      floor(c, c.x + lead + width, tail);
      /* Coins over a pit are how the original tells you a jump is safe. */
      if (c.rng.chance(0.4)) {
        const row = c.groundY - 4;
        for (let i = 0; i < width; i++) c.level.set(c.x + lead + i, row, T.COIN);
      }
      /* Something on the landing side, far enough in that it is a thing to
         deal with after the jump rather than during it. */
      if (tail >= 4 && c.rng.chance(0.3 + c.diff * 0.3)) {
        const [type, opts] = pickWalker(c);
        walker(c, type, c.x + lead + width + tail - 2, c.groundY, opts);
      }
      return lead + width + tail;
    },
  },

  doubleGap: {
    weight: (c) => (c.water ? 0 : c.diff * 1.8),
    build(c) {
      const g1 = Math.min(4, 2 + Math.floor(c.diff * 2));
      const g2 = Math.min(4, 2 + Math.floor(c.diff * 2));
      /* The island between the two pits has to be long enough to land on,
         stop, and jump again. Two tiles is 32 pixels, which at running speed
         is twelve frames — less than the time it takes to release the jump
         button and press it again. Four is a landing; two is a trap. */
      const mid = c.rng.int(4, 5);
      floor(c, c.x, 3);
      floor(c, c.x + 3 + g1, mid);
      floor(c, c.x + 3 + g1 + mid + g2, 4);
      return 3 + g1 + mid + g2 + 4;
    },
  },

  /* ---- blocks ---- */
  blocks: {
    weight: (c) => (c.water ? 0.8 : c.castle ? 1.2 : 2.0),
    build(c) {
      const w = c.rng.int(5, 8);
      floor(c, c.x, w);
      const pattern = c.rng.pick(['b?b', '?', 'b?b?b', 'bb?bb', '??', 'b?']);
      const spec = pattern.replace('?', powerupGlyph(c));
      const at = c.x + Math.floor((w - spec.length) / 2);
      blockRow(c, at, spec);
      if (c.rng.chance(0.5 + c.diff * 0.3)) {
        const [type, opts] = pickWalker(c);
        walker(c, type, c.x + w - 2, c.groundY, opts);
      }
      return w;
    },
  },

  ceilingBlocks: {
    weight: (c) => (c.water ? 0 : c.roofed ? 2.2 : 0.5),
    build(c) {
      const w = c.rng.int(6, 10);
      floor(c, c.x, w);
      const high = c.groundY - HIGH_H;
      for (let i = 1; i < w - 1; i++) {
        c.level.set(c.x + i, high, i === Math.floor(w / 2) ? TILE_FOR[powerupGlyph(c)] : T.BRICK);
      }
      const spec = c.rng.pick(['?b?', 'bcb', 'b?b']);
      blockRow(c, c.x + Math.floor((w - spec.length) / 2), spec, BLOCK_H);
      return w;
    },
  },

  coinBrickRoom: {
    weight: (c) => (c.water ? 0 : c.roofed ? 1.6 : 0.6),
    build(c) {
      const w = c.rng.int(7, 10);
      floor(c, c.x, w);
      const top = c.groundY - HIGH_H;
      for (let i = 0; i < w; i++) {
        c.level.set(c.x + i, top, T.BRICK);
        if (i > 0 && i < w - 1) c.level.set(c.x + i, top + 1, T.COIN);
      }
      c.level.set(c.x + 1, top, T.BRICK_COIN);
      if (c.rng.chance(0.3)) c.level.set(c.x + w - 2, top, T.BRICK_1UP);
      return w;
    },
  },

  /* ---- the raised ground the whole overworld idiom is built on ---- */
  plateau: {
    weight: (c) => (c.water || c.castle ? 0 : 1.4),
    build(c) {
      const up = c.rng.int(1, 3);
      const body = c.rng.int(4, 8);
      let x = c.x;
      /* Ramps on both ends, so this composes with anything either side. */
      for (let i = 0; i < up; i++) { ledge(c, x, 1, i + 1); x++; }
      const top = ledge(c, x, body, up);
      if (c.rng.chance(0.5)) {
        const [type, opts] = pickWalker(c);
        walker(c, type, x + 1, top, opts);
      }
      if (c.rng.chance(0.4)) c.level.set(x + Math.floor(body / 2), top - BLOCK_H, T.QUESTION);
      x += body;
      for (let i = up; i > 0; i--) { ledge(c, x, 1, i); x++; }
      return x - c.x;
    },
  },

  stairs: {
    weight: (c) => (c.water ? 0 : 1.0 + c.diff * 0.5),
    build(c) {
      const h = c.rng.int(2, 4);
      const w = h * 2 + c.rng.int(2, 4);
      floor(c, c.x, w);
      /* Up one side, down the other, in solid blocks that sit on the floor. */
      for (let i = 0; i < h; i++) {
        c.level.fill(c.x + i, c.groundY - 1 - i, c.x + i, c.groundY - 1, T.SOLID);
        c.level.fill(c.x + w - 1 - i, c.groundY - 1 - i, c.x + w - 1 - i, c.groundY - 1, T.SOLID);
      }
      return w;
    },
  },

  stairGap: {
    weight: (c) => (c.water ? 0 : 0.8 + c.diff),
    build(c) {
      /*
       * The staircase-pit-staircase, and the one detail that makes it work:
       * the pit starts at the top step, not one tile past it.
       *
       * With a tile of flat ground between the peak and the pit, the player
       * is put back down at floor level before the jump — and then the far
       * staircase, which is at its tallest on the side facing them, is a
       * four-tile wall across a four-tile gap. That is not a hard jump, it is
       * an impossible one, and it was in eleven of the hundred levels.
       *
       * Take the tile away and the jump is peak to peak: level with itself,
       * over a gap, which is the shape this set piece is supposed to be.
       */
      const h = c.rng.int(3, 4);
      const gap = Math.min(4, 2 + Math.floor(c.diff * 2));
      let x = c.x;

      floor(c, x, 2);
      x += 2;
      for (let i = 0; i < h; i++) {          // up, one step per column
        floor(c, x + i, 1);
        c.level.fill(x + i, c.groundY - 1 - i, x + i, c.groundY - 1, T.SOLID);
      }
      x += h;
      x += gap;                              // the pit, straight off the top
      for (let i = 0; i < h; i++) {          // down, tallest step first
        floor(c, x + i, 1);
        c.level.fill(x + i, c.groundY - h + i, x + i, c.groundY - 1, T.SOLID);
      }
      x += h;
      floor(c, x, 3);
      return x + 3 - c.x;
    },
  },

  /* ---- pipes ---- */
  pipe: {
    weight: (c) => (c.water ? 0 : c.castle ? 0.5 : 1.7),
    build(c) {
      const lead = c.rng.int(2, 4);
      const h = c.rng.int(2, 4);
      const tail = c.rng.int(3, 5);
      const w = lead + 2 + tail;
      floor(c, c.x, w);
      const top = c.groundY - h;
      putPipe(c.level, c.x + lead, top, c.groundY - 1);
      if (c.plants && c.rng.chance(0.35 + c.diff * 0.3)) {
        c.level.spawn('piranha', c.x + lead, top, {
          variant: c.rng.chance(0.25 + c.diff * 0.4) ? 'red' : 'green',
          top: top * 16,
        });
      }
      return w;
    },
  },

  pipeRow: {
    weight: (c) => (c.water ? 0 : 0.9 + c.diff * 0.6),
    build(c) {
      const n = c.rng.int(2, 3);
      let x = c.x;
      let heights = [];
      for (let i = 0; i < n; i++) heights.push(c.rng.int(2, 4));
      const w = n * 2 + (n + 1) * 3;
      floor(c, c.x, w);
      x += 3;
      for (const h of heights) {
        const top = c.groundY - h;
        putPipe(c.level, x, top, c.groundY - 1);
        if (c.plants && c.rng.chance(0.5 + c.diff * 0.3)) {
          c.level.spawn('piranha', x, top, {
            variant: c.rng.chance(0.3) ? 'red' : 'green', top: top * 16,
          });
        }
        x += 5;
      }
      return w;
    },
  },

  /* A pipe you can actually go down, into a room full of coins. */
  warpPipe: {
    weight: (c) => (c.bonusUsed || c.water ? 0 : 1.2),
    once: true,
    build(c) {
      c.bonusUsed = true;
      const lead = 3;
      const w = lead + 2 + 4;
      floor(c, c.x, w);
      const top = c.groundY - 2;
      putPipe(c.level, c.x + lead, top, c.groundY - 1);
      c.level.warps.push({
        col: c.x + lead, row: top, w: 2, h: 1, dir: 'down',
        to: { room: 1, entry: 'top' },
      });
      return w;
    },
  },

  /* ---- enemies as the point of the chunk ---- */
  patrol: {
    weight: (c) => (c.water ? 0 : 2.2),
    build(c) {
      const n = enemyCount(c, 4);
      const w = Math.max(7, n * 3 + c.rng.int(2, 4));
      floor(c, c.x, w);
      for (let i = 0; i < n; i++) {
        const [type, opts] = pickWalker(c);
        walker(c, type, c.x + 2 + i * 3, c.groundY, opts);
      }
      return w;
    },
  },

  shellRun: {
    weight: (c) => (c.world >= 2 && !c.water ? 1.1 : 0),
    build(c) {
      const w = c.rng.int(8, 12);
      floor(c, c.x, w);
      walker(c, 'koopa', c.x + 3, c.groundY, { variant: c.rng.chance(0.5) ? 'red' : 'green' });
      const spec = 'bbbb';
      blockRow(c, c.x + 2, spec);
      walker(c, 'goomba', c.x + w - 3, c.groundY, {});
      return w;
    },
  },

  hammerBros: {
    weight: (c) => (c.world >= 4 && !c.water ? 0.7 + c.diff * 0.8 : 0),
    build(c) {
      const w = c.rng.int(9, 12);
      floor(c, c.x, w);
      const n = c.diff > 0.55 && c.rng.chance(0.4) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const bx = c.x + 3 + i * 4;
        const top = c.groundY - 3 - i * 2;
        c.level.fill(bx, top, bx + 2, top, T.BRICK);
        c.level.spawn('hammerbro', bx + 1, top - 2, { floor: top * 16 });
      }
      return w;
    },
  },

  lakituRun: {
    weight: (c) => (c.world >= 9 && !c.water && !c.lakitu ? 0.8 + c.diff : 0),
    once: true,
    build(c) {
      c.lakitu = true;
      const w = c.rng.int(10, 14);
      floor(c, c.x, w);
      c.level.spawn('lakitu', c.x + 4, 2, {});
      return w;
    },
  },

  cannons: {
    weight: (c) => (c.world >= 4 && !c.water ? 1.0 + c.diff * 0.8 : 0),
    build(c) {
      const n = c.rng.int(1, 2);
      const w = 5 + n * 5;
      floor(c, c.x, w);
      let x = c.x + 3;
      for (let i = 0; i < n; i++) {
        const h = c.rng.int(1, 3);
        for (let j = 1; j < h; j++) c.level.set(x, c.groundY - j, T.SOLID);
        c.level.set(x, c.groundY - h, T.SOLID);
        c.level.spawn('cannon', x, c.groundY - h, { period: 140 - Math.floor(c.diff * 60) });
        x += 5;
      }
      return w;
    },
  },

  /* ---- platforms over nothing ---- */
  platformRun: {
    weight: (c) => (c.water ? 0 : 1.2 + c.diff * 0.8),
    build(c) {
      const spans = c.rng.int(2, 3);
      let x = c.x;
      floor(c, x, 3);
      x += 3;
      /* Height drifts by one platform at a time. Choosing each height freely
         puts a five-tile rise at the end of a three-tile run-up, which is a
         jump the physics cannot make from a standing start. */
      let row = c.groundY - 3;
      const highest = c.groundY - 6;
      for (let i = 0; i < spans; i++) {
        x += c.rng.int(2, 3);
        row = Math.max(highest, Math.min(c.groundY - 3, row + c.rng.int(-1, 1)));
        const pw = c.rng.int(3, 4);
        c.level.fill(x, row, x + pw - 1, row, T.PLATFORM);
        if (c.rng.chance(0.5)) c.level.set(x + 1, row - 1, T.COIN);
        x += pw;
      }
      x += c.rng.int(2, 3);
      floor(c, x, 4);
      return x + 4 - c.x;
    },
  },

  movingPlatform: {
    weight: (c) => (c.water ? 0 : 0.9 + c.diff * 0.9),
    build(c) {
      /*
       * Two different pits, because the two platforms cross them differently.
       * A horizontal lift ferries you the whole way, so the pit can be as
       * wide as the track. A vertical one only bobs in place, so the player
       * still has to jump on and jump off — which means each side of it has
       * to be inside a jump, and the pit cannot be wider than the lift plus
       * two four-tile jumps.
       */
      const mode = c.rng.pick(['h', 'h', 'v']);
      const pit = mode === 'h' ? c.rng.int(6, 9) : c.rng.int(5, 7);
      const w = 4 + pit + 4;
      floor(c, c.x, 4);
      floor(c, c.x + 4 + pit, 4);
      const tiles = 3;
      const startCol = mode === 'h'
        ? c.x + 4
        : c.x + 4 + Math.floor((pit - tiles) / 2);
      c.level.spawnPx('platform', startCol * 16, (c.groundY - 2) * 16, {
        mode,
        span: mode === 'h' ? (pit - tiles) * 16 : 4 * 16,
        speed: 0.6 + c.diff * 0.5,
        tiles,
        /* Recorded in tiles so the validator can see what the lift covers
           without simulating it. */
        covers: mode === 'h'
          ? [c.x + 4, c.x + 4 + pit - 1]
          : [startCol - 4, startCol + tiles - 1 + 4],
      });
      return w;
    },
  },

  fallingPlatform: {
    weight: (c) => (c.world >= 6 && !c.water ? 0.8 + c.diff : 0),
    build(c) {
      const pit = c.rng.int(7, 10);
      floor(c, c.x, 4);
      floor(c, c.x + 4 + pit, 4);
      const n = Math.floor(pit / 3);
      for (let i = 0; i < n; i++) {
        c.level.spawnPx('platform', (c.x + 5 + i * 3) * 16, (c.groundY - 2) * 16, {
          mode: 'fall', tiles: 2,
          covers: [c.x + 4 + i * 3, c.x + 7 + i * 3],
        });
      }
      return 4 + pit + 4;
    },
  },

  springJump: {
    weight: (c) => (c.world >= 3 && !c.water ? 0.9 : 0),
    build(c) {
      const w = c.rng.int(10, 13);
      floor(c, c.x, w);
      c.level.spawnPx('spring', (c.x + 3) * 16, (c.groundY - 2) * 16, {});
      /* Something worth the bounce: a coin shelf too high to reach otherwise. */
      const shelf = c.groundY - 9;
      for (let i = 0; i < 4; i++) c.level.set(c.x + 5 + i, shelf, T.COIN);
      c.level.set(c.x + 4, shelf + 1, T.PLATFORM);
      c.level.fill(c.x + 5, shelf + 1, c.x + 8, shelf + 1, T.PLATFORM);
      return w;
    },
  },

  /* ---- castle ---- */
  firebar: {
    weight: (c) => (c.castle ? 2.2 : 0),
    build(c) {
      const w = c.rng.int(7, 10);
      floor(c, c.x, w);
      const px = c.x + Math.floor(w / 2);
      const h = c.rng.int(1, 3);
      for (let i = 0; i < h; i++) c.level.set(px, c.groundY - 1 - i, T.SOLID);
      c.level.spawnPx('firebar', px * 16 + 8, (c.groundY - h) * 16 + 8, {
        len: c.rng.int(4, 6),
        speed: (c.rng.chance(0.5) ? 1 : -1) * (0.02 + c.diff * 0.02),
      });
      return w;
    },
  },

  lavaGap: {
    weight: (c) => (c.castle || c.theme === 'volcano' ? 2.0 : 0),
    build(c) {
      const pit = Math.min(4, 2 + Math.floor(c.diff * 2));
      const w = 4 + pit + 4;
      floor(c, c.x, 4);
      floor(c, c.x + 4 + pit, 4);
      c.level.fill(c.x + 4, c.level.h - 2, c.x + 4 + pit - 1, c.level.h - 1, T.LAVA);
      if (c.rng.chance(0.4 + c.diff * 0.3)) {
        c.level.spawnPx('podoboo', (c.x + 4 + pit / 2) * 16, (c.level.h - 2) * 16, {
          rise: 7 * 16 + c.rng.int(0, 3) * 16,
          period: 150 - Math.floor(c.diff * 50),
        });
      }
      return w;
    },
  },

  lavaCorridor: {
    weight: (c) => (c.castle ? 1.4 : 0),
    build(c) {
      const w = c.rng.int(10, 14);
      c.level.fill(c.x, c.level.h - 2, c.x + w - 1, c.level.h - 1, T.LAVA);
      /* Stepping stones, never more than three tiles apart. */
      let x = c.x;
      while (x < c.x + w) {
        const pw = c.rng.int(2, 3);
        c.level.fill(x, c.groundY, x + pw - 1, c.groundY + 1, T.GROUND);
        x += pw + c.rng.int(2, 3);
      }
      c.level.fill(c.x + w - 3, c.groundY, c.x + w - 1, c.level.h - 1, T.GROUND);
      return w;
    },
  },

  castleMaze: {
    weight: (c) => (c.castle ? 1.2 : 0),
    build(c) {
      const w = c.rng.int(8, 11);
      floor(c, c.x, w);
      /* A low ceiling you have to duck under, with a firebar behind it. */
      const gapAt = c.rng.int(2, w - 4);
      for (let i = 0; i < w; i++) {
        if (i >= gapAt && i < gapAt + 2) continue;
        c.level.fill(c.x + i, c.groundY - 4, c.x + i, c.groundY - 3, T.SOLID);
      }
      for (let i = 0; i < w; i++) c.level.set(c.x + i, 2, T.CASTLE_BRICK);
      return w;
    },
  },

  /* ---- water ---- */
  coral: {
    weight: (c) => (c.water ? 3.0 : 0),
    build(c) {
      const w = c.rng.int(7, 11);
      const bottom = c.level.h - 2;
      c.level.fill(c.x, bottom, c.x + w - 1, c.level.h - 1, T.GROUND);
      /* Pillars from the floor and from the roof, never closing the channel
         to less than three tiles — a swimmer needs room to correct. */
      let x = c.x + 1;
      while (x < c.x + w - 2) {
        if (c.rng.chance(0.5)) {
          const h = c.rng.int(2, 4);
          c.level.fill(x, bottom - h, x, bottom - 1, T.GROUND);
        } else {
          const h = c.rng.int(2, 4);
          c.level.fill(x, 2, x, 1 + h, T.GROUND);
        }
        x += c.rng.int(3, 5);
      }
      return w;
    },
  },

  cheeps: {
    weight: (c) => (c.water ? 1.5 : 0),
    build(c) {
      const w = c.rng.int(8, 12);
      c.level.fill(c.x, c.level.h - 2, c.x + w - 1, c.level.h - 1, T.GROUND);
      const n = enemyCount(c, 3);
      for (let i = 0; i < n; i++) {
        c.level.spawn('cheep', c.x + 2 + i * 3, c.rng.int(3, 10), {
          variant: c.rng.chance(0.5) ? 'red' : 'gray',
          speed: 0.4 + c.diff * 0.5,
          wave: c.rng.chance(0.5),
        });
      }
      return w;
    },
  },

  bloopers: {
    weight: (c) => (c.water && c.world >= 3 ? 1.4 : 0),
    build(c) {
      const w = c.rng.int(8, 11);
      c.level.fill(c.x, c.level.h - 2, c.x + w - 1, c.level.h - 1, T.GROUND);
      const n = c.diff > 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) c.level.spawn('blooper', c.x + 3 + i * 4, c.rng.int(2, 5), {});
      for (let i = 1; i < w - 1; i += 3) c.level.set(c.x + i, c.level.h - 5, T.COIN);
      return w;
    },
  },

  /* ---- sky ---- */
  cloudRun: {
    weight: (c) => (c.sky ? 3.6 : 0),
    build(c) {
      let x = c.x;
      const n = c.rng.int(2, 4);
      let row = c.groundY;
      for (let i = 0; i < n; i++) {
        const pw = c.rng.int(3, 6);
        row = Math.max(c.groundY - 3, Math.min(c.groundY, row + c.rng.int(-1, 1)));
        c.level.fill(x, row, x + pw - 1, row, T.CLOUD);
        if (c.rng.chance(0.5)) c.level.set(x + 1, row - 1, T.COIN);
        if (c.rng.chance(0.3 + c.diff * 0.3)) {
          const [type, opts] = pickWalker(c);
          walker(c, type, x + pw - 2, row, opts);
        }
        x += pw + Math.min(4, 2 + Math.floor(c.diff * 2));
      }
      const pw = 4;
      c.level.fill(x, c.groundY, x + pw - 1, c.groundY, T.CLOUD);
      return x + pw - c.x;
    },
  },

  skyBlocks: {
    weight: (c) => (c.sky ? 2.4 : 0),
    build(c) {
      const w = c.rng.int(8, 11);
      c.level.fill(c.x, c.groundY, c.x + w - 1, c.groundY, T.CLOUD);
      const spec = c.rng.pick(['?bb?', 'b?b', 'cc']);
      blockRow(c, c.x + 2, spec.replace('?', powerupGlyph(c)));
      return w;
    },
  },

  /* ---- underground ---- */
  buzzyCave: {
    weight: (c) => (c.roofed && !c.water && c.world >= 5 ? 1.4 : 0),
    build(c) {
      const w = c.rng.int(8, 11);
      floor(c, c.x, w);
      const n = enemyCount(c, 3);
      for (let i = 0; i < n; i++) {
        walker(c, 'koopa', c.x + 2 + i * 3, c.groundY, { variant: 'buzzy' });
      }
      return w;
    },
  },

  pillars: {
    weight: (c) => (c.water ? 0 : c.roofed ? 1.5 : 0.5),
    build(c) {
      const w = c.rng.int(9, 13);
      floor(c, c.x, w);
      let x = c.x + 2;
      while (x < c.x + w - 2) {
        const h = c.rng.int(2, 4);
        c.level.fill(x, c.groundY - h, x, c.groundY - 1, T.SOLID);
        if (c.rng.chance(0.4)) c.level.set(x, c.groundY - h - 2, T.COIN);
        x += c.rng.int(3, 4);
      }
      return w;
    },
  },
};

/* Chunks that may only appear once in a level, tracked by the generator. */
export const ONCE = new Set(Object.entries(CHUNKS).filter(([, v]) => v.once).map(([k]) => k));
