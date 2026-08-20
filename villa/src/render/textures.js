/*
 * textures.js — every surface in the villa, generated from noise.
 *
 * There are no image files anywhere in this game. A room asks for "oak boards,
 * this shade, fairly worn" and gets back an albedo map, a normal map derived
 * from a real height field, and a roughness channel. Two rules hold
 * throughout, and both are load-bearing:
 *
 * 1. Everything tiles. All the noise is lattice-wrapped at the texture edge,
 *    so a floor that repeats eight times across a room has no seam. A seam is
 *    visible from the far wall and instantly reads as "game".
 *
 * 2. Normals come from height, never authored directly. Each recipe writes a
 *    height field as it goes and the normal map is Sobel-differenced out of it
 *    at the end, so the bump always agrees with what you can see.
 *
 * The noise and baking machinery is shared in spirit with
 * backrooms/src/render/textures.js — the same lattice-wrapped value noise,
 * Worley and ridged fBm, and the same Sobel pass. The recipes are not: an
 * office and a house are made of different things, and the one that matters
 * most here is `timber`, because a boarded-up window is what the player spends
 * the game looking at.
 *
 * Colours are authored in sRGB because the albedo array is uploaded as
 * SRGB8_ALPHA8 and converted by the sampler. Roughness rides in the albedo
 * alpha, which stays linear.
 */

import { hash1 } from '../core/rng.js';

/* ------------------------------------------------------------------ *
 * Tileable noise
 * ------------------------------------------------------------------ */

function wrap(v, p) { return ((v % p) + p) % p; }

function lhash(x, y, per, seed) {
  return hash1(Math.imul(wrap(x, per), 0x27d4eb2d)
             ^ Math.imul(wrap(y, per), 0x165667b1) ^ seed) / 4294967296;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/* Value noise whose lattice repeats every `per` cells. Call it with
 * (u * per, v * per, per) and the result tiles across the texture. */
function tnoise(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const a = lhash(xi, yi, per, seed);
  const b = lhash(xi + 1, yi, per, seed);
  const c = lhash(xi, yi + 1, per, seed);
  const d = lhash(xi + 1, yi + 1, per, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function tfbm(u, v, base, seed, oct = 4, gain = 0.5) {
  let f = base, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * tnoise(u * f, v * f, f, seed + i * 1013);
    norm += a;
    f *= 2;
    a *= gain;
  }
  return sum / norm;
}

/* Cellular noise, lattice-wrapped. Returns distance to the nearest feature
 * point in [0,1] — tiles, pores, pebbles, carpet loops. */
function tworley(u, v, per, seed) {
  const x = u * per, y = v * per;
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 8;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + lhash(cx, cy, per, seed);
      const py = cy + lhash(cx, cy, per, seed ^ 0x9e37);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.min(1, Math.sqrt(best));
}

function tridged(u, v, base, seed, oct = 4) {
  let f = base, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = Math.abs(tnoise(u * f, v * f, f, seed + i * 311) * 2 - 1);
    sum += a * (1 - n);
    norm += a;
    f *= 2;
    a *= 0.5;
  }
  return sum / norm;
}

const sstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

/* Distance to the nearest line of a grid with `n` cells across, in cell units.
 * The building block of every tiled, planked, panelled or bricked surface. */
function gridLine(t, n) {
  const s = t * n;
  return Math.abs(s - Math.round(s));
}

export function parseColor(c) {
  if (Array.isArray(c)) return c;
  const h = c.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((d) => parseInt(d + d, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [n[0] / 255, n[1] / 255, n[2] / 255];
}

/* ------------------------------------------------------------------ *
 * Recipes
 *
 * Each writes into `o`: rgb (sRGB 0..1), rough, h (height 0..1), em (emissive),
 * and optionally mask (0 = cut away, for foliage and wire mesh).
 * ------------------------------------------------------------------ */

const KINDS = {

  /* Painted plaster. Nearly flat: the orange peel a roller leaves, a filled
   * patch here and there, and scuffing where furniture has been dragged past.
   * Most of the villa is this, so it has to be quiet — a wall you notice is a
   * wall that is wrong. */
  plaster(u, v, o, P, S) {
    const c = P.color;
    const peel = tfbm(u, v, 24, S, 3);
    const patch = sstep(0.62, 0.80, tfbm(u, v, 4, S + 5, 3));
    const scuff = sstep(0.74, 0.96, tfbm(u * 3, v * 0.4, 8, S + 71, 3)) * 0.5;
    const age = sstep(0.55, 0.85, tfbm(u * 0.8, v * 0.6, 2, S + 23, 4)) * (P.age ?? 0.25);
    const t = 0.93 + 0.09 * peel - 0.05 * patch - 0.12 * age;
    o.r = c[0] * t * (1 - scuff * 0.22);
    o.g = c[1] * t * (1 - scuff * 0.22);
    o.b = c[2] * t * (1 - scuff * 0.20);
    o.rough = 0.90 - 0.08 * patch;
    o.h = 0.5 + 0.16 * peel + 0.05 * patch;
  },

  /* Oak boards. The grain is ridged noise stretched hard along the board, the
   * boards are offset row to row so the end joints never line up, and the gap
   * between them is a real groove in the height field — that groove catching
   * the lamp is most of what makes a floor read as wood rather than as a
   * brown wall lying down. */
  oak(u, v, o, P, S) {
    const c = P.color;
    const nBoards = P.boards || 7;
    const rowH = 1 / nBoards;
    const row = Math.floor(v / rowH);
    /* Every row shifted by its own amount, so end joints stagger. */
    const shift = lhash(row, 7, nBoards, S) * 0.87;
    const uu = (u + shift) % 1;
    const nLen = P.lengths || 3;
    const board = Math.floor(uu * nLen);

    const seed = S + row * 131 + board * 17;
    const along = (uu * nLen) % 1;
    const across = (v / rowH) % 1;

    /* Grain runs the length of the board. Squashing v hard is what turns
     * isotropic noise into something that looks sawn. */
    const grain = tridged(along * 0.9, across * 0.06, 5, seed, 4);
    const fine = tfbm(along * 2, across * 0.25, 22, seed + 3, 2);
    const knot = sstep(0.88, 0.99, tfbm(along, across, 3, seed + 44, 3));

    const shade = 0.80 + 0.34 * grain + 0.10 * fine
      + (lhash(board, row, nLen, S + 9) - 0.5) * 0.22;   /* board-to-board tone */

    let r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
    r = mix(r, r * 0.42, knot); g = mix(g, g * 0.38, knot); b = mix(b, b * 0.34, knot);

    /* The groove between boards, in both directions. */
    const gapAcross = 1 - sstep(0, 0.045, Math.min(across, 1 - across));
    const gapAlong = 1 - sstep(0, 0.012, Math.min(along, 1 - along));
    const gap = Math.max(gapAcross, gapAlong);
    const wear = sstep(0.5, 0.9, tfbm(u * 1.2, v * 1.2, 3, S + 61, 3)) * (P.wear ?? 0.3);

    o.r = mix(r, r * 0.30, gap) * (1 - wear * 0.12);
    o.g = mix(g, g * 0.28, gap) * (1 - wear * 0.12);
    o.b = mix(b, b * 0.26, gap) * (1 - wear * 0.10);
    o.rough = mix(P.gloss ? 0.34 : 0.62, 0.85, wear) + 0.10 * grain;
    o.h = 0.62 + 0.16 * grain + 0.06 * fine - 0.62 * gap;
  },

  /* Glazed floor tile with a grout line. The grout is darker, much rougher and
   * genuinely recessed; the tile face is nearly smooth with a slow mottle so
   * the specular from a moving lamp crawls over it. */
  tile(u, v, o, P, S) {
    const c = P.color;
    const n = P.tiles || 6;
    const gu = gridLine(u, n), gv = gridLine(v, n);
    const line = Math.min(gu, gv);
    const grout = 1 - sstep(0.010, 0.030, line);

    const cell = Math.floor(u * n) + Math.floor(v * n) * n;
    const tone = 0.94 + (lhash(cell, 3, n * n, S) - 0.5) * 0.13;
    const mott = tfbm(u * 2, v * 2, 9, S + 12, 4);
    const t = tone * (0.93 + 0.14 * mott);

    const gc = P.grout || [0.30, 0.29, 0.27];
    const dirt = sstep(0.4, 0.9, tfbm(u, v, 5, S + 88, 3));

    o.r = mix(c[0] * t, gc[0] * (0.8 + 0.3 * dirt), grout);
    o.g = mix(c[1] * t, gc[1] * (0.8 + 0.3 * dirt), grout);
    o.b = mix(c[2] * t, gc[2] * (0.8 + 0.3 * dirt), grout);
    o.rough = mix(0.22 + 0.12 * mott, 0.94, grout);
    o.h = mix(0.72, 0.18, grout);
  },

  /* Hung wallpaper: a seam every strip, a pebbled emboss, and a vertical
   * stripe if the room wants one. There is deliberately no term in `v` alone —
   * a texture that darkens towards its own bottom edge lays a hard horizontal
   * line across the wall once per repeat. */
  wallpaper(u, v, o, P, S) {
    const c = P.color;
    const mott = tfbm(u, v, 3, S, 5);
    const fine = tfbm(u, v, 44, S + 91, 2);
    let tint = 0.86 + 0.24 * mott + 0.07 * fine;

    const seam = gridLine(u, P.strips || 3);
    tint *= 1 - 0.13 * (1 - sstep(0, 0.009, seam));

    /* Optional damask stripe. Two frequencies so it does not read as a bar
     * code, and low contrast so it survives being tiled. */
    let stripe = 0;
    if (P.stripe) {
      const sN = P.stripe;
      const t1 = Math.cos(u * Math.PI * 2 * sN) * 0.5 + 0.5;
      const t2 = Math.cos(u * Math.PI * 2 * sN * 3 + 1.2) * 0.5 + 0.5;
      /* Low contrast on purpose. A wallpaper stripe strong enough to read as
       * a pattern in a screenshot reads as corduroy across a whole wall. */
      stripe = (t1 * 0.7 + t2 * 0.3) * 0.075;
    }

    const damp = sstep(0.60, 0.86, tfbm(u * 0.7, v * 0.5, 2, S + 17, 4)) * (P.damp || 0);

    let r = c[0] * (tint - stripe), g = c[1] * (tint - stripe), b = c[2] * (tint - stripe);
    r = mix(r, r * 0.70 + 0.05, damp);
    g = mix(g, g * 0.66 + 0.04, damp);
    b = mix(b, b * 0.58 + 0.02, damp);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.84 - 0.12 * fine + 0.10 * damp;
    o.h = 0.5 + 0.26 * fine + 0.09 * mott - 0.5 * (1 - sstep(0, 0.011, seam)) + stripe * 1.4;
  },

  /*
   * Rough sawn pine — the barricade timber, and the single most important
   * material in the game. It is what the player has spent their afternoon on
   * and what they stare at while something works on the other side of it, so
   * it gets saw marks across the grain, split ends, and a much stronger height
   * field than anything else in the villa. It should look nailed on in a
   * hurry, because it was.
   */
  timber(u, v, o, P, S) {
    const c = P.color;
    const grain = tridged(u * 1.1, v * 0.05, 6, S, 4);
    const fine = tfbm(u * 3, v * 0.2, 30, S + 7, 2);
    /* Saw marks: a fast ripple across the board, not along it. */
    const saw = (Math.sin(u * Math.PI * 2 * 34 + tfbm(u, v, 5, S + 2, 2) * 6) * 0.5 + 0.5);
    const knot = sstep(0.84, 0.98, tfbm(u * 1.5, v * 0.5, 4, S + 44, 3));
    const split = sstep(0.90, 1.0, tridged(u * 0.6, v * 0.1, 3, S + 71, 3));

    const shade = 0.78 + 0.32 * grain + 0.12 * fine + 0.06 * saw;
    let r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
    r = mix(r, r * 0.40, knot); g = mix(g, g * 0.36, knot); b = mix(b, b * 0.32, knot);
    r = mix(r, r * 0.25, split); g = mix(g, g * 0.24, split); b = mix(b, b * 0.22, split);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.90 + 0.06 * grain;
    o.h = 0.5 + 0.30 * grain + 0.14 * fine + 0.10 * saw - 0.45 * split - 0.25 * knot;
  },

  /* Packing tape. Nearly clear, quite glossy, and creased — the creases are
   * the whole point, because a flat translucent quad reads as a bug and a
   * creased one reads as tape. Cut out along the strip edges so it can be laid
   * across an opening as a single quad. */
  tape(u, v, o, P, S) {
    const c = P.color || [0.78, 0.74, 0.62];
    const crease = tridged(u * 0.4, v * 2.2, 7, S, 3);
    const bubble = sstep(0.62, 0.86, tfbm(u * 2, v * 6, 12, S + 5, 3));
    const t = 0.88 + 0.22 * crease + 0.14 * bubble;
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 0.18 + 0.24 * crease;
    o.h = 0.5 + 0.34 * crease + 0.10 * bubble;
    /* The strip runs along u; feather the long edges so it is not a hard
     * rectangle of plastic. */
    const edge = sstep(0, 0.06, Math.min(v, 1 - v));
    o.mask = edge;
  },

  /* A painted panelled door: two sunk panels with a moulded edge. The panels
   * are cut in the height field, so the lamp finds them. */
  door(u, v, o, P, S) {
    const c = P.color;
    const peel = tfbm(u, v, 20, S, 3);
    /* Two panels stacked in v, inset from the stiles and rails. */
    const inU = sstep(0.16, 0.20, u) * (1 - sstep(0.80, 0.84, u));
    const panelV = (v < 0.5)
      ? sstep(0.10, 0.14, v) * (1 - sstep(0.40, 0.44, v))
      : sstep(0.56, 0.60, v) * (1 - sstep(0.86, 0.90, v));
    const panel = inU * panelV;
    const grime = sstep(0.6, 0.95, tfbm(u * 2, v, 6, S + 31, 3)) * 0.4;

    const t = (0.94 + 0.08 * peel) * (1 - panel * 0.10) * (1 - grime * 0.18);
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 0.52 - 0.10 * panel + 0.2 * grime;
    o.h = 0.62 - 0.34 * panel + 0.08 * peel;
  },

  /* Window glass. Almost nothing — a little unevenness so the reflection is
   * not a mirror, and grime at the edges. Emissive is left at zero; whatever
   * is on the other side is drawn, not faked. */
  glass(u, v, o, P, S) {
    const c = P.color || [0.06, 0.08, 0.10];
    const ripple = tfbm(u, v, 6, S, 3);
    const grime = sstep(0.55, 0.95, tfbm(u * 1.4, v * 1.4, 4, S + 12, 3));
    const edge = 1 - sstep(0.02, 0.12, Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)));
    const dirt = Math.max(grime * 0.5, edge * 0.7);
    o.r = mix(c[0], 0.19, dirt); o.g = mix(c[1], 0.19, dirt); o.b = mix(c[2], 0.18, dirt);
    o.rough = mix(0.05, 0.55, dirt) + 0.05 * ripple;
    o.h = 0.5 + 0.05 * ripple;
  },

  /* Brick, seen through a broken opening. Stretcher bond: every other course
   * offset by half a brick. */
  brick(u, v, o, P, S) {
    const c = P.color;
    const rows = P.rows || 9;
    const cols = P.cols || 4;
    const row = Math.floor(v * rows);
    const uu = (u + (row % 2) * 0.5 / cols) % 1;
    const gu = gridLine(uu, cols), gv = gridLine(v, rows);
    const mortar = Math.max(1 - sstep(0.012, 0.030, gu), 1 - sstep(0.010, 0.026, gv));

    const cell = Math.floor(uu * cols) + row * cols;
    const tone = 0.82 + (lhash(cell, 5, cols * rows, S) - 0.5) * 0.34;
    const pit = tfbm(u * 4, v * 4, 26, S + 3, 3);
    const t = tone * (0.90 + 0.18 * pit);

    const mc = P.mortar || [0.52, 0.50, 0.46];
    o.r = mix(c[0] * t, mc[0], mortar);
    o.g = mix(c[1] * t, mc[1], mortar);
    o.b = mix(c[2] * t, mc[2], mortar);
    o.rough = mix(0.88 - 0.08 * pit, 0.96, mortar);
    o.h = mix(0.68 + 0.18 * pit, 0.22, mortar);
  },

  /* Upholstery and bedding. Woven at two scales so it does not moiré. */
  fabric(u, v, o, P, S) {
    const c = P.color;
    const warp = Math.sin(u * Math.PI * 2 * (P.weave || 120)) * 0.5 + 0.5;
    const weft = Math.sin(v * Math.PI * 2 * (P.weave || 120)) * 0.5 + 0.5;
    const cloth = (warp * weft) * 0.6 + 0.4;
    const fuzz = tfbm(u, v, 90, S, 2);
    const fold = tfbm(u * 0.6, v * 0.6, 3, S + 8, 4);
    const t = 0.74 + 0.24 * cloth + 0.14 * fuzz + 0.16 * fold;
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 0.94 - 0.05 * cloth;
    o.h = 0.45 + 0.30 * cloth + 0.20 * fuzz;
  },

  /* Painted or bare metal: hinges, the stove, the rifle, the nail heads. */
  metal(u, v, o, P, S) {
    const c = P.color;
    const brush = tfbm(u * 12, v * 0.3, 40, S, 2);
    const pit = sstep(0.80, 0.97, tfbm(u * 3, v * 3, 18, S + 6, 3));
    const rust = sstep(0.66, 0.94, tfbm(u, v, 5, S + 33, 3)) * (P.rust ?? 0.15);
    let t = 0.88 + 0.16 * brush;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r = mix(r, 0.36, rust); g = mix(g, 0.20, rust); b = mix(b, 0.11, rust);
    o.r = r * (1 - pit * 0.3); o.g = g * (1 - pit * 0.3); o.b = b * (1 - pit * 0.3);
    o.rough = mix(P.gloss ?? 0.35, 0.92, Math.max(rust, pit * 0.6)) + 0.06 * brush;
    o.h = 0.6 + 0.10 * brush - 0.4 * pit;
  },

  /* Artexed ceiling — the stippled swirl every house of this age has. */
  ceiling(u, v, o, P, S) {
    const c = P.color;
    const stipple = tworley(u, v, P.density || 70, S);
    const swirl = tridged(u, v, 4, S + 2, 3);
    const stain = sstep(0.72, 0.95, tfbm(u * 0.8, v * 0.8, 3, S + 40, 4)) * (P.stain ?? 0.3);
    const t = 0.92 + 0.14 * stipple + 0.06 * swirl;
    o.r = mix(c[0] * t, 0.44, stain * 0.5);
    o.g = mix(c[1] * t, 0.40, stain * 0.5);
    o.b = mix(c[2] * t, 0.33, stain * 0.5);
    o.rough = 0.95;
    o.h = 0.42 + 0.42 * stipple + 0.12 * swirl;
  },

  /* Bare screed, in the equipment room, where nobody laid anything nicer. */
  concrete(u, v, o, P, S) {
    const c = P.color;
    const agg = tworley(u, v, 40, S);
    const wash = tfbm(u, v, 5, S + 1, 5);
    const crack = sstep(0.93, 1.0, tridged(u * 0.7, v * 0.7, 3, S + 55, 4));
    const t = 0.86 + 0.20 * wash + 0.10 * agg;
    o.r = c[0] * t * (1 - crack * 0.5);
    o.g = c[1] * t * (1 - crack * 0.5);
    o.b = c[2] * t * (1 - crack * 0.5);
    o.rough = 0.93 - 0.06 * agg;
    o.h = 0.5 + 0.16 * agg + 0.12 * wash - 0.6 * crack;
  },

  /*
   * What is outside. Not a skybox — a material for the quad that seals each
   * window and door, so an opening reads as "there is something out there and
   * you cannot see it" rather than as a hole into the void. Almost black, with
   * the faintest cold gradient and a slow crawl to it.
   */
  night(u, v, o, P, S) {
    const c = P.color || [0.020, 0.028, 0.042];
    const drift = tfbm(u * 0.5, v * 0.5, 2, S, 4);
    const fog = tfbm(u, v, 6, S + 3, 3);
    const t = 0.7 + 0.7 * drift + 0.2 * fog;
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 1.0;
    o.h = 0.5;
  },
};
export const MATERIAL_KINDS = Object.keys(KINDS);

/* ------------------------------------------------------------------ *
 * Baking
 * ------------------------------------------------------------------ */

/*
 * Run one recipe over a size×size grid, then Sobel the height field into a
 * normal map. Output is two RGBA byte arrays ready for texSubImage3D:
 *
 *   albedo:  rgb = colour (sRGB), a = roughness
 *   normal:  rg  = tangent-space normal xy, b = height or cut-out mask,
 *            a   = emissive
 */
export function bakeMaterial(def, size) {
  const S = (def.seed ?? 0) | 0;
  const kind = KINDS[def.kind] || KINDS.concrete;
  const P = Object.assign({}, def);
  P.color = parseColor(def.color || '#808080');

  const alb = new Uint8Array(size * size * 4);
  const nrm = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const emis = new Float32Array(size * size);
  const mask = new Float32Array(size * size);

  const o = { r: 0, g: 0, b: 0, rough: 0.8, h: 0.5, em: 0, mask: 1 };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      o.r = o.g = o.b = 0; o.rough = 0.8; o.h = 0.5; o.em = 0; o.mask = 1;
      kind(u, v, o, P, S);
      const i = y * size + x;
      alb[i * 4]     = clamp01(o.r) * 255;
      alb[i * 4 + 1] = clamp01(o.g) * 255;
      alb[i * 4 + 2] = clamp01(o.b) * 255;
      alb[i * 4 + 3] = clamp01(o.rough) * 255;
      height[i] = o.h;
      emis[i] = o.em;
      mask[i] = o.mask;
    }
  }

  /* Sobel, wrapping at the edges so the normal map tiles exactly like the
   * albedo does. `bumpScale` is per-material: carpet wants ten times what
   * painted plaster wants. */
  const bump = (def.bump ?? 1) * size / 128;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = ((x - 1) + size) % size, xp = (x + 1) % size;
      const h = (ix, iy) => height[iy * size + ix];
      const dx = (h(xp, ym) + 2 * h(xp, y) + h(xp, yp))
               - (h(xm, ym) + 2 * h(xm, y) + h(xm, yp));
      const dy = (h(xm, yp) + 2 * h(x, yp) + h(xp, yp))
               - (h(xm, ym) + 2 * h(x, ym) + h(xp, ym));
      let nx = -dx * bump, ny = -dy * bump, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = y * size + x;
      nrm[i * 4]     = (nx * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      /* Cut-out materials put coverage here; everything else puts height,
       * which the shader ignores unless a cut-out threshold is set. */
      nrm[i * 4 + 2] = clamp01(def.cutout ? mask[i] : height[i]) * 255;
      nrm[i * 4 + 3] = clamp01(emis[i]) * 255;
    }
  }

  return { albedo: alb, normal: nrm };
}
