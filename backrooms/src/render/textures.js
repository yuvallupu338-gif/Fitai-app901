/*
 * textures.js — every surface in the game, generated from noise.
 *
 * There are no image files anywhere in this project. A level asks for
 * "wallpaper, this shade of yellow, quite stained" and gets back an albedo
 * map, a normal map derived from a real height field, and a roughness channel.
 * That is what lets a hundred levels each have their own materials without a
 * hundred megabytes of downloads, and it is why the yellow of Level 0 and the
 * yellow of Level 4 can be genuinely different yellows rather than the same
 * texture with a tint.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. Everything tiles. All the noise is lattice-wrapped at the texture edge,
 *    so a wall that repeats eight times has no seam. A seam on a wallpaper
 *    texture is visible from across a room and instantly reads as "game".
 *
 * 2. Normals come from height, never authored directly. Each recipe writes a
 *    height field as it goes and the normal map is Sobel-differenced out of it
 *    at the end, so the bump always agrees with what you can see in the albedo.
 *
 * Colours are authored in sRGB (the numbers you would pick in a colour picker)
 * because the albedo array is uploaded as SRGB8_ALPHA8 and converted by the
 * sampler. Roughness rides in the albedo alpha, which stays linear.
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

  /* The wall of Level 0 and half the levels after it. Vinyl wallcovering hung
   * in strips: a seam every strip width, a faint pebbled texture, and damp
   * coming up from the skirting because it always is. */
  wallpaper(u, v, o, P, S) {
    const c = P.color;
    const mott = tfbm(u, v, 3, S, 5);
    const fine = tfbm(u, v, 40, S + 91, 2);
    let tint = 0.82 + 0.30 * mott + 0.08 * fine;

    const strips = P.strips || 3;
    const seam = gridLine(u, strips);
    const seamShade = 1 - 0.16 * (1 - sstep(0, 0.010, seam));
    tint *= seamShade;

    /*
     * Stains. Note what is NOT here: any term in `v` on its own. A texture
     * that darkens towards its own bottom edge looks completely right in a
     * preview and lays a hard horizontal line across every wall in the game,
     * once per repeat, because v jumps from 1 back to 0 at the seam. Damp has
     * to come from tileable noise or not at all.
     *
     * The amplitude is kept low for the same family of reasons: the eye finds
     * a repeating texture by locking onto its largest blobs, so big
     * low-frequency stains are exactly what makes tiling obvious.
     */
    const d0 = P.damp || 0;
    const blob = tfbm(u * 0.7, v * 0.5, 2, S + 17, 4);
    const damp = sstep(0.54, 0.80, blob) * d0;
    const rust = sstep(0.66, 0.94, tfbm(u, v, 6, S + 33, 3)) * d0;

    let r = c[0] * tint, g = c[1] * tint, b = c[2] * tint;
    r = mix(r, r * 0.72 + 0.06, damp);
    g = mix(g, g * 0.68 + 0.04, damp);
    b = mix(b, b * 0.60 + 0.02, damp);
    r = mix(r, 0.32, rust * 0.35); g = mix(g, 0.21, rust * 0.35); b = mix(b, 0.14, rust * 0.35);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.82 - 0.14 * fine + 0.12 * damp;
    o.h = 0.5 + 0.28 * fine + 0.10 * mott - 0.55 * (1 - sstep(0, 0.012, seam));
  },

  /* Painted plasterboard. Almost flat, with the orange-peel of roller paint and
   * the occasional filled-and-sanded patch. */
  drywall(u, v, o, P, S) {
    const c = P.color;
    const peel = tfbm(u, v, 26, S, 3);
    const patch = sstep(0.60, 0.78, tfbm(u, v, 4, S + 5, 3));
    const scuff = sstep(0.72, 0.95, tfbm(u * 3, v * 0.4, 8, S + 71, 3)) * 0.5;
    const t = 0.92 + 0.10 * peel - 0.06 * patch;
    o.r = c[0] * t * (1 - scuff * 0.25);
    o.g = c[1] * t * (1 - scuff * 0.25);
    o.b = c[2] * t * (1 - scuff * 0.22);
    o.rough = 0.88 - 0.10 * patch;
    o.h = 0.5 + 0.18 * peel + 0.06 * patch;
  },

  /* Thin commercial loop-pile, laid wall to wall, damp. The single most
   * recognisable surface in the whole mythology. */
  carpet(u, v, o, P, S) {
    const c = P.color;
    const loops = tworley(u, v, P.density || 90, S);
    const fibre = tfbm(u, v, 160, S + 3, 2);
    const drag = tfbm(u * 0.25, v * 4, 6, S + 12, 3);      /* vacuum lanes     */
    const wet = sstep(0.50, 0.80, tfbm(u, v, 2.5, S + 44, 4)) * (P.damp ?? 0.6);

    let t = 0.76 + 0.30 * loops + 0.16 * fibre + 0.08 * drag;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    /* Wet carpet goes darker and much less rough — it is the sheen that sells
     * "moist", not the colour, so the darkening stays modest and the roughness
     * does the work. Heavy dark patches here read as a repeating texture from
     * across a room. */
    r = mix(r, r * 0.62, wet); g = mix(g, g * 0.60, wet); b = mix(b, b * 0.62, wet);

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.97, 0.42, wet) - 0.06 * loops;
    o.h = 0.35 + 0.5 * loops + 0.25 * fibre;
  },

  /* Patterned hotel/office carpet: the same loop pile with a repeating motif
   * printed on it. Busy on purpose — it hides joins and it is unmistakably
   * "corridor of somewhere that used to have guests". */
  carpetPattern(u, v, o, P, S) {
    KINDS.carpet(u, v, o, { color: P.color, damp: P.damp ?? 0.25, density: 80 }, S);
    const n = P.motif || 4;
    const su = (u * n) % 1, sv = (v * n) % 1;
    const dx = su - 0.5, dy = sv - 0.5;
    const rad = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    const petal = Math.cos(ang * (P.petals || 6)) * 0.5 + 0.5;
    const shape = sstep(0.34, 0.30, rad - petal * 0.10);
    const lattice = sstep(0.06, 0.02, Math.min(gridLine(u, n), gridLine(v, n)));
    const a = parseColor(P.accent || '#7a2230');
    const k = clamp01(shape * 0.85 + lattice * 0.5);
    o.r = mix(o.r, a[0] * (0.7 + 0.5 * shape), k);
    o.g = mix(o.g, a[1] * (0.7 + 0.5 * shape), k);
    o.b = mix(o.b, a[2] * (0.7 + 0.5 * shape), k);
    o.h += 0.06 * k;
  },

  /* Mineral fibre drop ceiling: 600mm grid, T-bar rails, pinholes, and the
   * brown ring where something upstairs leaked. */
  ceilingTile(u, v, o, P, S) {
    const c = P.color;
    const n = P.tiles || 2;
    const gx = gridLine(u, n), gy = gridLine(v, n);
    const rail = Math.min(gx, gy);
    const isRail = 1 - sstep(0.010, 0.020, rail);

    const pin = tworley(u, v, 150, S + 2);
    const grain = tfbm(u, v, 30, S, 3);
    const perTile = lhash(Math.floor(u * n), Math.floor(v * n), n, S + 9);

    let t = 0.92 + 0.12 * grain - 0.17 * (1 - sstep(0.0, 0.07, pin)) + (perTile - 0.5) * 0.07;
    const leak = sstep(0.62, 0.86, tfbm(u * 0.6, v * 0.6, 2, S + 51, 4)) * (P.stain ?? 0.5);

    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r = mix(r, 0.42, leak * 0.55); g = mix(g, 0.30, leak * 0.55); b = mix(b, 0.16, leak * 0.55);

    /* Rails are painted metal: darker, smoother, and sitting proud of the tile
     * face by a few millimetres. */
    const rc = parseColor(P.rail || '#d8d3c4');
    r = mix(r, rc[0] * 0.9, isRail); g = mix(g, rc[1] * 0.9, isRail); b = mix(b, rc[2] * 0.9, isRail);

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.93, 0.55, isRail);
    o.h = mix(0.42 + 0.2 * grain - 0.22 * (1 - sstep(0, 0.07, pin)), 0.85, isRail);
  },

  /* The fixture. A diffuser panel with two tubes behind it and a metal frame:
   * the emissive channel is what the shader multiplies up past 1.0 to bloom. */
  lightPanel(u, v, o, P, S) {
    const frame = Math.min(u, 1 - u, v, 1 - v);
    const isFrame = 1 - sstep(0.05, 0.075, frame);
    /* Two tubes running the long way, visible through the diffuser. */
    const tube = Math.max(
      sstep(0.10, 0.03, Math.abs(v - 0.32)),
      sstep(0.10, 0.03, Math.abs(v - 0.68)));
    const dust = tfbm(u, v, 12, S, 3);
    const dead = P.dead || 0;

    const base = 0.86 + 0.14 * tube - 0.18 * dust;
    const c = P.color;
    o.r = mix(c[0] * base, 0.34, isFrame);
    o.g = mix(c[1] * base, 0.34, isFrame);
    o.b = mix(c[2] * base, 0.35, isFrame);
    o.rough = mix(0.35, 0.5, isFrame);
    o.h = mix(0.6, 0.95, isFrame);
    o.em = (1 - isFrame) * (0.55 + 0.45 * tube) * (1 - dust * 0.35) * (1 - dead);
  },

  /* Poured concrete. Pores, form-work lines, a hairline crack network and the
   * dark bloom of old water. */
  concrete(u, v, o, P, S) {
    const c = P.color;
    const pore = tworley(u, v, 70, S);
    const mott = tfbm(u, v, 4, S + 6, 5);
    const crack = sstep(0.86, 0.97, tridged(u, v, 5, S + 21, 4)) * (P.cracks ?? 1);
    const stain = sstep(0.55, 0.8, tfbm(u, v, 2, S + 77, 4)) * (P.damp ?? 0.4);

    let t = 0.80 + 0.34 * mott + 0.14 * pore;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r *= 1 - crack * 0.55; g *= 1 - crack * 0.55; b *= 1 - crack * 0.5;
    r = mix(r, r * 0.6, stain); g = mix(g, g * 0.6, stain); b = mix(b, b * 0.62, stain);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.9 - 0.2 * stain;
    o.h = 0.55 + 0.2 * pore + 0.15 * mott - 0.6 * crack;
  },

  /* Small square wall tile with grout. Poolrooms, changing rooms, anywhere
   * that used to be wet on purpose. */
  tile(u, v, o, P, S) {
    const c = P.color;
    const n = P.tiles || 8;
    const g = Math.min(gridLine(u, n), gridLine(v, n));
    const w = P.grout || 0.030;
    const isGrout = 1 - sstep(w * 0.6, w, g);

    const tx = Math.floor(u * n), ty = Math.floor(v * n);
    const vary = (lhash(tx, ty, n, S) - 0.5) * (P.vary ?? 0.12);
    const glaze = tfbm(u, v, 60, S + 4, 2);
    const grime = sstep(0.5, 0.85, tfbm(u, v, 3, S + 19, 4)) * (P.damp ?? 0.3);

    const gc = parseColor(P.grout_color || '#cfcabc');
    let r = c[0] * (1 + vary) * (0.96 + 0.08 * glaze);
    let gg = c[1] * (1 + vary) * (0.96 + 0.08 * glaze);
    let b = c[2] * (1 + vary) * (0.96 + 0.08 * glaze);
    r = mix(r, gc[0] * 0.86, isGrout); gg = mix(gg, gc[1] * 0.86, isGrout); b = mix(b, gc[2] * 0.86, isGrout);
    r = mix(r, r * 0.7, grime * (0.4 + isGrout * 0.6));
    gg = mix(gg, gg * 0.72, grime * (0.4 + isGrout * 0.6));
    b = mix(b, b * 0.68, grime * (0.4 + isGrout * 0.6));

    o.r = r; o.g = gg; o.b = b;
    o.rough = mix(0.12 + 0.2 * grime, 0.85, isGrout);
    o.h = mix(0.85, 0.25, isGrout);
  },

  /* Sheet vinyl / lino. Flecked, waxed, and scuffed along the traffic line. */
  linoleum(u, v, o, P, S) {
    const c = P.color;
    const fleck = tworley(u, v, 120, S);
    const fleck2 = tfbm(u, v, 90, S + 8, 2);
    const n = P.tiles || 4;
    const seam = 1 - sstep(0.004, 0.010, Math.min(gridLine(u, n), gridLine(v, n)));
    const scuff = sstep(0.6, 0.95, tfbm(u * 4, v * 0.5, 10, S + 30, 3));
    const chk = P.checker ? ((Math.floor(u * n) + Math.floor(v * n)) & 1) : 0;

    const alt = parseColor(P.alt || '#3a3a3e');
    let t = 0.88 + 0.2 * fleck + 0.14 * fleck2;
    let r = mix(c[0], alt[0], chk) * t;
    let g = mix(c[1], alt[1], chk) * t;
    let b = mix(c[2], alt[2], chk) * t;
    r *= 1 - seam * 0.3; g *= 1 - seam * 0.3; b *= 1 - seam * 0.3;

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.28 + 0.35 * scuff + 0.2 * seam;
    o.h = 0.6 + 0.1 * fleck - 0.4 * seam;
  },

  /* Planks. Stretched grain, knots, a gap between boards. */
  wood(u, v, o, P, S) {
    const c = P.color;
    const n = P.planks || 4;
    const row = Math.floor(v * n);
    const off = lhash(0, row, n, S) * 0.7;          /* stagger the butt joints */
    const gapV = 1 - sstep(0.006, 0.014, gridLine(v, n));
    const gapU = 1 - sstep(0.004, 0.010, gridLine(u + off, 2));

    const grain = tridged(u * 0.35, v * 9, 6, S + row * 17, 4);
    const fine = tfbm(u * 0.5, v * 14, 24, S + 5, 2);
    const knot = sstep(0.90, 0.99, tworley(u * 1.2, v * 3, 5, S + row * 3));
    const perPlank = (lhash(row, 3, n, S + 2) - 0.5) * 0.18;

    let t = (0.78 + 0.36 * grain + 0.10 * fine) * (1 + perPlank);
    t *= 1 - knot * 0.45;
    o.r = c[0] * t * (1 - (gapV + gapU) * 0.55);
    o.g = c[1] * t * (1 - (gapV + gapU) * 0.58);
    o.b = c[2] * t * (1 - (gapV + gapU) * 0.6);
    o.rough = 0.55 + 0.3 * grain + 0.2 * knot;
    o.h = 0.6 + 0.18 * grain - 0.55 * Math.max(gapV, gapU);
  },

  /* Painted or galvanised sheet metal, with panel seams, rivets and rust
   * eating out from the joins. */
  metal(u, v, o, P, S) {
    const c = P.color;
    const n = P.panels || 2;
    const seam = 1 - sstep(0.006, 0.013, Math.min(gridLine(u, n), gridLine(v, n)));
    const brush = tfbm(u * 0.2, v * 20, 40, S, 2);
    const dent = tfbm(u, v, 6, S + 13, 3);
    const rustMask = sstep(0.5, 0.8, tfbm(u, v, 4, S + 61, 4) + seam * 0.25) * (P.rust ?? 0.4);
    const rivet = sstep(0.08, 0.05, tworley(u, v, n * 6, S + 3)) * (P.rivets ?? 0);

    let t = 0.85 + 0.22 * brush + 0.12 * dent;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r = mix(r, 0.36 + 0.12 * brush, rustMask);
    g = mix(g, 0.17 + 0.07 * brush, rustMask);
    b = mix(b, 0.08 + 0.04 * brush, rustMask);
    const dark = Math.max(seam * 0.5, 0);
    r *= 1 - dark; g *= 1 - dark; b *= 1 - dark;

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(P.polish ?? 0.35, 0.95, rustMask);
    o.h = 0.6 - 0.4 * seam + 0.3 * rivet + 0.08 * dent;
  },

  /* Running-bond brick with recessed mortar. */
  brick(u, v, o, P, S) {
    const rows = P.rows || 6;
    const cols = P.cols || 3;
    const row = Math.floor(v * rows);
    const shift = (row & 1) * 0.5;
    const bu = u * cols + shift;
    const col = Math.floor(bu);
    const m = P.mortar || 0.05;
    const dv = gridLine(v, rows), du = Math.abs(bu - Math.round(bu));
    const isMortar = 1 - Math.min(sstep(m * 0.5, m, dv * rows / rows + dv), sstep(m * 0.5, m, du));
    const mortar = clamp01(1 - Math.min(sstep(0.012, 0.024, dv), sstep(0.02, 0.04, du)));

    const c = P.color;
    const vary = (lhash(col, row, cols * 4, S) - 0.5) * 0.30;
    const pit = tfbm(u, v, 60, S + 7, 3);
    const mc = parseColor(P.mortar_color || '#9a9488');

    let t = (0.85 + 0.25 * pit) * (1 + vary);
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r = mix(r, mc[0] * (0.8 + 0.3 * pit), mortar);
    g = mix(g, mc[1] * (0.8 + 0.3 * pit), mortar);
    b = mix(b, mc[2] * (0.8 + 0.3 * pit), mortar);

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.85, 0.95, mortar);
    o.h = mix(0.75 + 0.15 * pit, 0.25, mortar);
    void isMortar;
  },

  /* Cave rock: ridged strata, cobbled surface, wet sheen in the low spots. */
  rock(u, v, o, P, S) {
    const c = P.color;
    const strata = tridged(u * 0.6, v * 2.2, 4, S, 5);
    const cob = tworley(u, v, 14, S + 5);
    const grit = tfbm(u, v, 80, S + 9, 2);
    const wet = sstep(0.45, 0.8, tfbm(u, v, 3, S + 23, 4)) * (P.damp ?? 0.5);

    let t = 0.62 + 0.4 * strata + 0.26 * cob + 0.12 * grit;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r = mix(r, r * 0.5, wet); g = mix(g, g * 0.52, wet); b = mix(b, b * 0.6, wet);

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.95, 0.30, wet);
    o.h = 0.4 + 0.35 * cob + 0.3 * strata + 0.1 * grit;
  },

  /* Loose ground: dirt, gravel, sand — one recipe, three parameter sets. */
  ground(u, v, o, P, S) {
    const c = P.color;
    const peb = tworley(u, v, P.grain || 60, S);
    const dunes = tfbm(u, v, 3, S + 4, 4);
    const rip = P.ripple ? (Math.sin((u * 14 + dunes * 6) * Math.PI * 2) * 0.5 + 0.5) : 0;
    const patch = tfbm(u, v, 9, S + 31, 3);

    let t = 0.76 + 0.30 * dunes + 0.22 * peb + 0.12 * patch + 0.10 * rip;
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 0.94 - 0.1 * peb;
    o.h = 0.4 + 0.3 * peb + 0.25 * dunes + 0.12 * rip;
  },

  /* Grass and undergrowth seen from above. Clumpy, with dead patches. */
  grass(u, v, o, P, S) {
    const c = P.color;
    const dry = parseColor(P.dry || '#8f8347');
    const clump = tworley(u, v, 40, S);
    const blade = tfbm(u * 0.6, v * 3, 110, S + 2, 2);
    const patch = tfbm(u, v, 4, S + 17, 4);
    const dead = sstep(0.5, 0.78, patch);

    let t = 0.66 + 0.4 * clump + 0.3 * blade;
    let r = mix(c[0], dry[0], dead) * t;
    let g = mix(c[1], dry[1], dead) * t;
    let b = mix(c[2], dry[2], dead) * t;
    o.r = r; o.g = g; o.b = b;
    o.rough = 0.92;
    o.h = 0.35 + 0.4 * clump + 0.3 * blade;
  },

  /* Asphalt with aggregate showing through and the ghost of a painted line. */
  asphalt(u, v, o, P, S) {
    const c = P.color;
    const agg = tworley(u, v, 100, S);
    const mott = tfbm(u, v, 5, S + 3, 4);
    const crack = sstep(0.88, 0.98, tridged(u, v, 6, S + 27, 4));
    const line = P.line ? sstep(0.055, 0.045, Math.abs(u - 0.5)) : 0;
    const wear = tfbm(u * 3, v * 3, 20, S + 71, 2);

    let t = 0.72 + 0.3 * mott + 0.26 * agg;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    const lc = parseColor(P.line_color || '#cbb64f');
    const l = line * (0.45 + 0.55 * wear);
    r = mix(r, lc[0], l); g = mix(g, lc[1], l); b = mix(b, lc[2], l);
    r *= 1 - crack * 0.5; g *= 1 - crack * 0.5; b *= 1 - crack * 0.5;

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.9 - 0.1 * l;
    o.h = 0.55 + 0.3 * agg - 0.5 * crack;
  },

  /* Polished stone: warped veins, high gloss, almost no bump. */
  marble(u, v, o, P, S) {
    const c = P.color;
    const warp = tfbm(u, v, 3, S + 2, 4);
    const vein = tridged(u * 1.4 + warp * 1.2, v * 1.1 - warp, 3, S, 5);
    const vein2 = tridged(u * 4 + warp * 2, v * 3, 5, S + 9, 3);
    const vc = parseColor(P.vein || '#3b3b42');

    const k = clamp01(sstep(0.72, 0.95, vein) + sstep(0.85, 0.99, vein2) * 0.5);
    o.r = mix(c[0] * (0.94 + 0.12 * warp), vc[0], k);
    o.g = mix(c[1] * (0.94 + 0.12 * warp), vc[1], k);
    o.b = mix(c[2] * (0.94 + 0.12 * warp), vc[2], k);
    o.rough = 0.10 + 0.15 * k;
    o.h = 0.5 + 0.05 * k;
  },

  /* Woven fabric — upholstery, curtains, the felt on a cubicle divider. */
  fabric(u, v, o, P, S) {
    const c = P.color;
    const n = P.weave || 130;
    const warpT = Math.sin(u * n * Math.PI * 2) * 0.5 + 0.5;
    const weftT = Math.sin(v * n * Math.PI * 2) * 0.5 + 0.5;
    const w = Math.max(warpT, weftT);
    const fuzz = tfbm(u, v, 90, S, 2);
    const soil = sstep(0.55, 0.85, tfbm(u, v, 3, S + 13, 4)) * (P.damp ?? 0.25);

    let t = 0.78 + 0.28 * w + 0.14 * fuzz;
    o.r = c[0] * t * (1 - soil * 0.35);
    o.g = c[1] * t * (1 - soil * 0.38);
    o.b = c[2] * t * (1 - soil * 0.36);
    o.rough = 0.95;
    o.h = 0.45 + 0.35 * w + 0.15 * fuzz;
  },

  /* Rendered/stucco wall — heavy trowel texture, chalky. */
  stucco(u, v, o, P, S) {
    const c = P.color;
    const bump = tworley(u, v, 26, S);
    const swirl = tfbm(u, v, 10, S + 4, 3);
    const chip = sstep(0.82, 0.95, tfbm(u, v, 7, S + 44, 3));
    let t = 0.8 + 0.3 * bump + 0.16 * swirl;
    o.r = c[0] * t * (1 - chip * 0.3);
    o.g = c[1] * t * (1 - chip * 0.32);
    o.b = c[2] * t * (1 - chip * 0.3);
    o.rough = 0.95;
    o.h = 0.45 + 0.4 * bump + 0.2 * swirl - 0.3 * chip;
  },

  /* Still water seen from above. Mostly the shader's job; this supplies the
   * colour, the silt and a base ripple. */
  water(u, v, o, P, S) {
    const c = P.color;
    const rip = tfbm(u, v, 8, S, 4);
    const silt = tfbm(u, v, 3, S + 6, 3);
    let t = 0.85 + 0.3 * rip;
    o.r = c[0] * t * (0.9 + 0.2 * silt);
    o.g = c[1] * t * (0.9 + 0.2 * silt);
    o.b = c[2] * t;
    o.rough = 0.05;
    o.h = 0.5 + 0.5 * rip;
  },

  /* Near-black with just enough structure that the eye does not read it as a
   * hole in the renderer. */
  voidmat(u, v, o, P, S) {
    const c = P.color;
    const n = tfbm(u, v, 12, S, 4);
    const g = tfbm(u, v, 60, S + 2, 2);
    o.r = c[0] * (0.7 + 0.6 * n) + 0.004 * g;
    o.g = c[1] * (0.7 + 0.6 * n) + 0.004 * g;
    o.b = c[2] * (0.7 + 0.6 * n) + 0.006 * g;
    o.rough = 0.8;
    o.h = 0.5 + 0.2 * n;
  },

  /*
   * A standing silhouette, as a cut-out. Deliberately soft and slightly ragged
   * at the edges — a crisp outline reads as a cardboard cut-out, and the whole
   * point of this shape is that you cannot quite resolve it.
   */
  silhouette(u, v, o, P, S) {
    const c = P.color;
    /* Body: a tapering column, widest at the shoulders, narrowing to the feet
     * and rounding into a head at the top. */
    const headY = 0.86;
    const dxHead = (u - 0.5) / 0.115;
    const dyHead = (v - headY) / 0.10;
    const head = 1 - Math.min(1, Math.hypot(dxHead, dyHead));

    const shoulder = sstep(0.80, 0.72, v);
    const width = 0.10 + 0.16 * shoulder * (1 - sstep(0.72, 0.02, v) * 0.35);
    const body = v < 0.80 ? 1 - Math.min(1, Math.abs(u - 0.5) / Math.max(0.02, width)) : 0;
    /* Legs: split the lower third so it does not read as a traffic cone. */
    const gap = v < 0.34 ? sstep(0.0, 0.045, Math.abs(u - 0.5)) : 1;

    /* Ragged edge: the noise multiplies the falloff, so it eats the outline
     * and leaves the solid middle alone. */
    const fray = tfbm(u * 2, v * 2, 7, S, 3);
    let mask = clamp01(Math.max(head, body * gap) * (0.82 + 0.4 * fray));
    mask = sstep(0.22, 0.44, mask);

    const depth = 0.35 + 0.35 * tfbm(u, v, 5, S + 3, 3);
    o.r = c[0] * depth; o.g = c[1] * depth; o.b = c[2] * depth;
    o.rough = 0.98;
    o.mask = mask;
    o.h = mask;
  },

  /* A uniform emissive disc. Eyes, indicator lamps — anything that is only
   * ever seen as a point of light. */
  glow(u, v, o, P, S) {
    const c = P.color;
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const core = sstep(1.05, 0.15, r);
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.rough = 0.35;
    o.h = 0.5;
    o.em = 0.45 + 0.55 * core;
    void S;
  },

  /* Cut-out materials. The mask goes in the height channel and the shader
   * discards below the threshold, which is how a chain-link fence or a field
   * of wheat costs one quad. */
  chainlink(u, v, o, P, S) {
    const n = P.cells || 10;
    const d1 = Math.abs(((u + v) * n) % 1 - 0.5);
    const d2 = Math.abs(((u - v) * n) % 1 - 0.5);
    const wire = Math.max(sstep(0.42, 0.5, d1), sstep(0.42, 0.5, d2));
    const c = P.color;
    const rust = sstep(0.55, 0.85, tfbm(u, v, 5, S, 3)) * (P.rust ?? 0.5);
    o.r = mix(c[0], 0.35, rust) * (0.8 + 0.4 * wire);
    o.g = mix(c[1], 0.17, rust) * (0.8 + 0.4 * wire);
    o.b = mix(c[2], 0.09, rust) * (0.8 + 0.4 * wire);
    o.rough = mix(0.4, 0.9, rust);
    o.mask = wire;
    o.h = wire;
  },

  /* Vertical blades for billboard vegetation: wheat, reeds, long grass. */
  blades(u, v, o, P, S) {
    const n = P.blades || 12;
    const col = Math.floor(u * n);
    const f = u * n - col;
    const lean = (lhash(col, 0, n, S) - 0.5) * 0.7;
    const height = 0.45 + 0.55 * lhash(col, 1, n, S + 3);
    const centre = 0.5 + lean * v;
    const width = 0.30 * (1 - v * 0.75);
    const inBlade = sstep(width, width * 0.55, Math.abs(f - centre)) * (v < height ? 1 : 0);

    const c = P.color;
    const dry = parseColor(P.dry || '#c9b465');
    const k = lhash(col, 2, n, S + 7);
    const shade = 0.55 + 0.5 * v + 0.25 * k;
    o.r = mix(c[0], dry[0], P.dryness ?? 0.5) * shade;
    o.g = mix(c[1], dry[1], P.dryness ?? 0.5) * shade;
    o.b = mix(c[2], dry[2], P.dryness ?? 0.5) * shade;
    o.rough = 0.9;
    o.mask = inBlade;
    o.h = inBlade;
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
