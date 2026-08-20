/*
 * textures.js — every surface in Pine Court, generated from seeded noise.
 *
 * There are no image files in this project. The world asks for "clapboard,
 * this shade of cream, six boards" and gets back an albedo map, a normal map
 * derived from a real height field, and a roughness channel. Twelve houses can
 * each have their own paint without twelve downloads, and the cream of number
 * four is genuinely a different cream from the cream of number six rather than
 * the same texture with a tint on it.
 *
 * Three rules hold everywhere in this file:
 *
 * 1. Everything tiles. All the noise is lattice-wrapped at the texture edge,
 *    so a lawn that repeats forty times has no seam. The corollary bites more
 *    often than the rule: the multipliers on u and v inside a tfbm, and every
 *    cell count handed to tworley or gridLine, have to be whole numbers. A
 *    `tfbm(u * 0.6, v * 3, ...)` looks identical in a preview and puts a
 *    visible ruled line down the street once the plane is bigger than one
 *    repeat.
 *
 *    Five recipes break it on purpose, where the brief asks for a position on
 *    a surface rather than a pattern on one: the line on the road, the
 *    chalking on siding, the curtain glow behind glass, the mud at her hem,
 *    the falloff on glow. Each says so at the site, and each is a constraint
 *    on the material table rather than a licence — a term in v alone has to be
 *    mapped once over the thing it is on or it comes back as a band, once per
 *    repeat, all the way up.
 *
 * 2. Normals come from height, never authored directly. Each recipe writes a
 *    height field as it goes and the normal map is Sobel-differenced out of it
 *    at the end, so the bump always agrees with what you can see in the albedo.
 *
 * 3. The height field is not a garnish here, it is the whole picture. Pine
 *    Court is played at 3:30 in the morning under two sodium lamps and a low
 *    red moon, and at that light level colour barely survives the tonemap —
 *    almost everything the player actually reads is a normal catching a grazing
 *    light. A material whose height field is flat is invisible at night, no
 *    matter how carefully its albedo was chosen.
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
 * point in [0,1] — pores, aggregate, granules, blades of grass. */
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
 * The building block of every boarded, slabbed, coursed or bricked surface.
 * Divide by n to get the distance in texture units, which is what you want
 * whenever a joint has to look the same width in both axes. */
function gridLine(t, n) {
  const s = t * n;
  return Math.abs(s - Math.round(s));
}

/* Cell counts must be whole numbers or the lattice does not land on the tile
 * edge and the seam comes back. Recipes take theirs through here rather than
 * trusting whatever the world data happened to write. */
const cells = (x, d) => Math.max(1, Math.round(x ?? d));

/* ...and even numbers where the pattern alternates between two states per
 * cell: running bond, plain weave, mow stripes. An odd count puts two
 * identical cells side by side across the seam, which is the one place the
 * eye is already looking. */
const cells2 = (x, d) => Math.max(2, Math.round((x ?? d) / 2) * 2);

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
 * and mask (0 = cut away) for the cut-out materials.
 * ------------------------------------------------------------------ */

const KINDS = {

  /*
   * Mown lawn from above. The largest single surface in the game by a wide
   * margin, and the one the player spends the most time standing 1.6m above,
   * so blade scale is worth more than colour here: a flat green plane with a
   * bit of mottle on it is the tell that undoes every other material in the
   * street. The cell count wants to land near a blade every three or four
   * texels — drop it to 60 and the lawn becomes moss, push it past 220 and it
   * becomes velvet.
   */
  grass(u, v, o, P, S) {
    const c = P.color;
    const dryC = parseColor(P.dry || '#8b7f42');
    const weedC = parseColor(P.weed || '#b9c258');
    const clipC = parseColor(P.clipping || '#6d5c2c');

    const blade = 1 - tworley(u, v, cells(P.blades, 150), S);
    const lie = tfbm(u * 1, v * 4, 96, S + 2, 2);      /* blades lying over  */
    const tuft = 1 - tworley(u, v, 22, S + 5);         /* clumps of growth   */
    const patch = tfbm(u, v, 3, S + 17, 4);

    /*
     * A mow stripe is not a paint stripe. What you are looking at is the
     * blades lying toward you in one band and away in the next, so it belongs
     * in the height field and only faintly in the albedo. The triangle wave
     * gives each band a constant, opposite slope, which is exactly what the
     * roller leaves behind. The obvious version — (floor(v * stripes) & 1)
     * choosing between two greens — draws a hard line at every band edge and
     * turns the front garden into a football pitch seen from the away end.
     */
    const stripes = cells2(P.stripes, 6);
    const sb = v * stripes;
    const lean = Math.abs((sb % 2) - 1) - 0.5;

    const dead = sstep(0.52, 0.80, patch) * (P.dry_amount ?? 1);
    const clip = sstep(0.90, 0.98, tfbm(u * 3, v * 1, 40, S + 61, 2));
    const weed = sstep(0.92, 0.99, 1 - tworley(u, v, 8, S + 23));

    let t = 0.54 + 0.44 * blade + 0.20 * lie + 0.16 * tuft;
    t *= 1 + lean * 0.10;
    let r = mix(c[0], dryC[0], dead) * t;
    let g = mix(c[1], dryC[1], dead) * t;
    let b = mix(c[2], dryC[2], dead) * t;
    r = mix(r, weedC[0] * (0.8 + 0.4 * blade), weed);
    g = mix(g, weedC[1] * (0.8 + 0.4 * blade), weed);
    b = mix(b, weedC[2] * (0.8 + 0.4 * blade), weed);
    r = mix(r, clipC[0], clip * 0.75);
    g = mix(g, clipC[1], clip * 0.75);
    b = mix(b, clipC[2], clip * 0.75);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.95 - 0.04 * dead;
    o.h = 0.26 + 0.40 * blade + 0.20 * lie + 0.12 * tuft
        + 0.09 * lean + 0.16 * weed - 0.05 * clip;
  },

  /*
   * The road. Aggregate stones sitting in a bitumen matrix, which is a worley
   * field and a fine one on top of it; the fine layer is what stops the stones
   * reading as a pattern of identical pebbles under a headlight.
   */
  asphalt(u, v, o, P, S) {
    const c = P.color;
    const agg = 1 - tworley(u, v, cells(P.grain, 110), S);
    const fines = tfbm(u, v, 64, S + 3, 2);
    const mott = tfbm(u, v, 4, S + 11, 4);

    /* Tar poured into a crack shrinks, but it still stands proud of the road
     * and it is glossier than the road either side of it. A crack modelled as
     * a dark groove is a crack in concrete; on asphalt the repair is the
     * feature, not the split. */
    const tar = sstep(0.86, 0.97, tridged(u, v, 5, S + 27, 4));
    /* A rectangle of newer, finer, lighter surfacing where something was dug
     * up. Kept to one soft blob per tile: two is a texture, one is a road. */
    const repair = sstep(0.60, 0.72, tfbm(u, v, 2, S + 41, 3));

    let t = 0.68 + 0.30 * mott + 0.26 * agg + 0.10 * fines;
    t *= 1 + repair * 0.22;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;

    /*
     * The painted line. Worn by noise rather than by an even fade, because
     * road paint does not thin out, it comes off in flakes where the tyres
     * run and stays almost new a hand's width either side of that.
     *
     * The band keys on u alone, so a road carrying a line maps once across its
     * width and repeats only along its length. That is how a road is laid, but
     * it is the one term in here that will not survive being tiled sideways,
     * so it is worth saying out loud.
     */
    const lineAmt = clamp01(P.line ?? 0);
    const w = P.lineWidth ?? 0.055;
    const wear = tfbm(u * 2, v * 2, 24, S + 71, 3);
    const band = lineAmt > 0 ? sstep(w, w * 0.72, Math.abs(u - 0.5)) : 0;
    const l = band * lineAmt * (0.30 + 0.70 * sstep(0.36, 0.66, wear));
    const lc = parseColor(P.lineColor || '#cdbe66');
    r = mix(r, lc[0] * (0.86 + 0.2 * fines), l);
    g = mix(g, lc[1] * (0.86 + 0.2 * fines), l);
    b = mix(b, lc[2] * (0.86 + 0.2 * fines), l);

    r = mix(r, r * 0.72 + 0.012, tar);
    g = mix(g, g * 0.70 + 0.012, tar);
    b = mix(b, b * 0.70 + 0.014, tar);

    o.r = r; o.g = g; o.b = b;
    /* Written once, not once per branch: with a branch each, the repair patch
     * quietly loses its roughness the moment somebody paints a line over it. */
    o.rough = 0.92 - 0.06 * repair - 0.34 * l;
    o.h = 0.52 + 0.26 * agg + 0.08 * fines + 0.18 * tar + 0.10 * l;
  },

  /*
   * Pavement, kerbs, driveways. Poured in slabs with a control joint between
   * them, and the joint is where everything happens: water sits in it, moss
   * grows at its edge, and it is the only line on the whole surface that a
   * grazing street lamp can catch.
   */
  concrete(u, v, o, P, S) {
    const c = P.color;
    const n = cells(P.slabs, 2);

    /* Distance in texture units, not cell units. Doing this in cell units is
     * fine while slabs is the same in both axes and lays visibly fatter joints
     * along one of them the moment it is not. */
    const j = Math.min(gridLine(u, n), gridLine(v, n)) / n;
    const w = P.joint ?? 0.006;
    const joint = 1 - sstep(w * 0.5, w, j);
    const margin = 1 - sstep(w, w * 7, j);

    const pin = sstep(0.11, 0.02, tworley(u, v, 64, S));       /* air holes  */
    const swirl = tridged(u * 2, v * 2, 6, S + 13, 3);         /* the float  */
    const grit = tfbm(u, v, 96, S + 5, 2);
    const crack = sstep(0.90, 0.99, tridged(u, v, 7, S + 29, 4)) * (P.cracks ?? 1);
    const slab = (lhash(Math.floor(u * n), Math.floor(v * n), n, S + 3) - 0.5)
               * (P.vary ?? 0.10);

    let t = (0.84 + 0.20 * swirl + 0.12 * grit - 0.16 * pin) * (1 + slab);
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;

    /* The damp margin. Concrete goes green-grey where it stays wet, not
     * brown, and the joint stays darker than the slab even in daylight. */
    const damp = (margin * 0.55 + joint * 0.45) * (P.damp ?? 0.7);
    r = mix(r, r * 0.62, damp);
    g = mix(g, g * 0.66, damp);
    b = mix(b, b * 0.64, damp);
    r *= 1 - crack * 0.45; g *= 1 - crack * 0.45; b *= 1 - crack * 0.42;

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.92 - 0.16 * damp;
    o.h = 0.64 + 0.10 * swirl + 0.07 * grit - 0.16 * pin
        - 0.52 * crack - 0.66 * joint;
  },

  /*
   * Painted horizontal clapboard: the wall of every house in Pine Court. The
   * material is really one feature — the shadow under each board's lower lip —
   * and everything else is there so that feature has something to sit on. The
   * boards are wedges, thick at the bottom and thin at the top, so the height
   * ramps up the board and then falls off a cliff at the butt.
   *
   * The chalking and the damp are terms in v alone, which the brief asks for
   * and which nothing else here does. The price is that this material has to
   * be mapped once over the height of a wall: tile it twice vertically and you
   * get a chalk band and a damp band per repeat, marching up the house, which
   * is exactly the failure the wallpaper in the sibling engine is careful to
   * avoid. Whoever sets `tile` for a siding slot owns that, not this recipe.
   */
  siding(u, v, o, P, S) {
    const c = P.color;
    const boards = cells(P.boards, 8);
    const b = v * boards;
    const f = b - Math.floor(b);              /* 0 at this board's lower edge */
    const idx = Math.floor(b);

    const lip = 1 - sstep(0.0, 0.06, f);      /* the shadow line, and the step */
    const bevel = 1 - f;                       /* the wedge                    */
    const brush = tfbm(u * 6, v * 1, 48, S + 2, 2);   /* strokes along grain  */
    const orange = tfbm(u, v, 30, S + 8, 2);          /* roller peel          */
    const perBoard = (lhash(idx, 7, boards, S + 4) - 0.5) * 0.06;

    /* Nails: a real column pitch, a real position up the board, and a real
     * dimple where the gun sank the head. Distances are in texture units so
     * the dimple is round rather than an ellipse whose shape depends on how
     * many boards the wall happens to have. */
    const np = cells(P.nails, 6);
    const dnu = gridLine(u, np) / np;
    const dnv = (f - 0.68) / boards;
    const nail = sstep(0.0075, 0.0025, Math.hypot(dnu, dnv)) * (P.nails === 0 ? 0 : 1);

    /* Chalking: paint that has lost its binder to the sun. It concentrates
     * high on a wall because that is what gets the light, and it goes chalky
     * rather than dark — the naive version darkens the top and reads as soot. */
    const chalk = sstep(0.45, 1.0, v) * (P.chalk ?? 0.5)
                * (0.4 + 0.6 * tfbm(u, v, 5, S + 21, 3));
    const moss = sstep(0.18, 0.0, v) * (P.moss ?? 0.6)
               * sstep(0.42, 0.75, tfbm(u * 3, v * 1, 6, S + 33, 3));
    const mossC = parseColor(P.moss_color || '#5b6340');

    let t = (0.86 + 0.16 * bevel + 0.10 * brush + 0.08 * orange) * (1 + perBoard);
    t *= 1 - lip * 0.42;
    let r = c[0] * t, g = c[1] * t, bb = c[2] * t;
    r = mix(r, mix(r, 1, 0.55), chalk);
    g = mix(g, mix(g, 1, 0.55), chalk);
    bb = mix(bb, mix(bb, 0.96, 0.55), chalk);
    r = mix(r, mossC[0], moss); g = mix(g, mossC[1], moss); bb = mix(bb, mossC[2], moss);
    r *= 1 - nail * 0.25; g *= 1 - nail * 0.25; bb *= 1 - nail * 0.22;

    o.r = r; o.g = g; o.b = bb;
    /* House paint, not car paint. Even fresh it is nowhere near smooth, and
     * chalking takes it the rest of the way. */
    o.rough = 0.74 + 0.18 * chalk + 0.08 * moss - 0.05 * orange;
    o.h = 0.40 + 0.30 * bevel + 0.05 * brush + 0.04 * orange
        - 0.62 * lip - 0.30 * nail;
  },

  /*
   * Running bond brick: chimneys, porch piers, the low wall at the entrance to
   * the neighbourhood with the sign on it.
   */
  brick(u, v, o, P, S) {
    const c = P.color;
    const courses = cells2(P.courses, 8);
    const cols = cells(P.cols, 4);
    const row = Math.floor(v * courses);
    const bu = u * cols + (row & 1) * 0.5;

    /* The half-course offset pushes the last brick of every odd row one index
     * past the end of the range. Hashing that index without wrapping it gives
     * that brick a colour of its own on every repeat, which comes out as a
     * column of odd bricks running the full height of the chimney. */
    const col = wrap(Math.floor(bu), cols);

    const du = Math.abs(bu - Math.round(bu)) / cols;
    const dv = gridLine(v, courses) / courses;
    const m = P.mortar ?? 0.008;
    const mortar = 1 - sstep(m * 0.55, m, Math.min(du, dv));

    const k1 = lhash(col, row, cols * courses, S);
    const k2 = lhash(col, row, cols * courses, S + 909);
    const vary = (k1 - 0.5) * 0.26;
    /* About one brick in six comes out of the kiln noticeably darker and
     * redder. Without them a wall is a single colour with noise on it, and it
     * is the odd dark brick that makes the bond legible at all at night. */
    const burnt = k2 > 0.83 ? 1 : 0;
    const pit = tfbm(u * 4, v * 2, 48, S + 7, 3);
    const mc = parseColor(P.mortar_color || '#a49c8c');

    /* Efflorescence: salt drawn out through the face, worst next to the
     * mortar it came from. It is not white paint — it lifts the value and
     * kills the saturation, and it takes the roughness up with it. */
    const eff = sstep(0.62, 0.90, tfbm(u, v, 3, S + 55, 4))
              * (P.efflor ?? 0.5) * (0.5 + 0.5 * mortar);

    let t = (0.84 + 0.26 * pit) * (1 + vary) * (1 - burnt * 0.28);
    let r = c[0] * t;
    let g = c[1] * t * (1 - burnt * 0.10);
    let b = c[2] * t * (1 - burnt * 0.12);
    r = mix(r, mc[0] * (0.82 + 0.28 * pit), mortar);
    g = mix(g, mc[1] * (0.82 + 0.28 * pit), mortar);
    b = mix(b, mc[2] * (0.82 + 0.28 * pit), mortar);
    const lum = (r + g + b) / 3;
    r = mix(r, mix(lum, 1, 0.45), eff);
    g = mix(g, mix(lum, 1, 0.45), eff);
    b = mix(b, mix(lum, 0.97, 0.45), eff);

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.86, 0.95, mortar) + 0.05 * eff;
    o.h = mix(0.78 + 0.14 * pit, 0.26, mortar);
  },

  /*
   * Asphalt roof shingle. Three-tab: courses across V, each course cut by
   * vertical slots, each course offset from the one below so the slots do not
   * line up. The butt of every course throws a shadow onto the course below —
   * that shadow is the only reason a roof reads as a roof from the street
   * rather than as a grey slope.
   */
  shingle(u, v, o, P, S) {
    const c = P.color;
    const courses = cells(P.courses, 10);
    const cv = v * courses;
    const row = Math.floor(cv);
    const f = cv - row;                       /* 0 at the exposed butt edge   */

    const tabs = cells(P.tabs, 5);
    const off = lhash(0, row, courses, S + 3);       /* stagger, per course   */
    const slotD = gridLine(u + off, tabs) / tabs;
    /* The slot only exists in the exposed part of the course; above that it
     * is covered by the course over it and cutting it there gives a grid of
     * squares instead of a run of tabs. */
    const slot = (1 - sstep(0.0035, 0.008, slotD)) * sstep(0.62, 0.50, f);
    const butt = 1 - sstep(0.0, 0.07, f);

    const gran = 1 - tworley(u, v, cells(P.grain, 180), S + 9);
    const gran2 = tfbm(u, v, 70, S + 11, 2);
    /* The stagger has to be applied before the multiply, exactly as the slot
     * above applies it, or the colour blocks sit a fraction of a tab off from
     * the slots and every tab comes out in two tones with a hard edge down its
     * middle. Wrapped for the same reason the brick index is: the offset puts
     * the last tab of a course one index past the end. */
    const tab = wrap(Math.floor((u + off) * tabs), tabs);
    const perTab = (lhash(tab, row, courses * tabs, S + 17) - 0.5) * 0.16;
    /* Sun-bleach runs down the roof, so it is stretched along V and varies
     * quickly across U. Getting the axes the wrong way round gives horizontal
     * banding that reads as a manufacturing defect. */
    const bleach = sstep(0.52, 0.86, tfbm(u * 5, v * 1, 6, S + 29, 3))
                 * (P.bleach ?? 0.5);

    let t = (0.78 + 0.26 * gran + 0.14 * gran2) * (1 + perTab);
    t *= 1 - butt * 0.45;
    t *= 1 - slot * 0.70;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    const lum = (r + g + b) / 3;
    r = mix(r, mix(lum, 0.62, 0.35), bleach);
    g = mix(g, mix(lum, 0.60, 0.35), bleach);
    b = mix(b, mix(lum, 0.55, 0.35), bleach);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.93 - 0.05 * gran + 0.04 * bleach;
    o.h = 0.58 + 0.16 * gran + 0.06 * gran2 + 0.14 * (1 - f)
        - 0.66 * butt - 0.50 * slot;
  },

  /*
   * Timber, painted or bare: picket fences, porch decking, doors, the boards
   * over the window of the empty house. Planks run across U with the grain the
   * long way, because that is what a picket and a deck board both want; a
   * fence made from a texture whose grain runs across the picket looks wrong
   * before you can say why.
   */
  wood(u, v, o, P, S) {
    const paint = clamp01(P.paint ?? 0);
    const bare = parseColor(P.bare || '#a98a5c');
    const c = P.color;
    const n = cells(P.planks, 5);
    const pu = u * n;
    const col = wrap(Math.floor(pu), n);
    const f = pu - Math.floor(pu);
    const gap = 1 - sstep(0.004, 0.011, gridLine(u, n) / n);

    /*
     * Growth rings, not stripes. The rings are arcs around a pith line that
     * runs somewhere down the board, so the spacing widens as you move away
     * from it — a plain sine in u gives you a barcode. The coefficient on v
     * has to be a whole number: the ring phase is taken modulo 1, so an
     * integer step across the tile seam lands back on the same ring and any
     * other number puts a horizontal jog through every board.
     */
    const pith = 0.15 + 0.7 * lhash(col, 1, n, S + 5);
    const warp = tfbm(u * 2, v * 1, 5, S + col * 31, 3);
    const knotD = tworley(u * 1, v * 2, 7, S + 41);
    const knot = sstep(0.13, 0.02, knotD);
    let ring = Math.abs(f - pith) * (P.rings ?? 11) + warp * 1.8 + v * 2 + knot * 2.2;
    ring = Math.abs((ring % 1) - 0.5) * 2;
    const grain = ring * ring;                       /* hard latewood lines   */
    const fibre = tfbm(u * 1, v * 8, 40, S + 13, 2);
    const perPlank = (lhash(col, 3, n, S + 2) - 0.5) * 0.16;

    /* Wear at the ends of the boards. |2v-1| is 1 at both ends and 0 in the
     * middle and is continuous across the seam — its derivative is not, which
     * is why it is allowed nowhere near the height field. */
    const ends = Math.abs(v * 2 - 1);
    /* Paint fails at the edges of a board first, always — a picket that has
     * peeled evenly across its face has been sanded, not weathered. */
    const edge = sstep(0.26, 0.48, Math.abs(f - 0.5));
    /* Two halves on purpose: `flake` is the part that tiles and `peel` is the
     * same thing weighted toward the ends. Only `flake` gets into the height
     * field, because `ends` in there would put a one-texel ridge along the
     * seam where its slope changes sign. */
    const flake = clamp01(sstep(0.58, 0.94, tfbm(u * 3, v * 3, 8, S + 61, 3))
                * (0.45 + 0.75 * edge)) * (P.wear ?? 0.5) * paint;
    const peel = clamp01(flake * (0.30 + 0.70 * ends));

    let t = 0.72 + 0.34 * grain + 0.12 * fibre;
    t *= 1 - knot * 0.45;
    t = mix(t, 0.94 + 0.06 * fibre, paint * (1 - peel * 0.8));
    const bt = (1 + perPlank);
    let r = mix(bare[0], c[0], paint * (1 - peel)) * t * bt;
    let g = mix(bare[1], c[1], paint * (1 - peel)) * t * bt;
    let b = mix(bare[2], c[2], paint * (1 - peel)) * t * bt;
    r *= 1 - gap * 0.72; g *= 1 - gap * 0.74; b *= 1 - gap * 0.76;

    o.r = r; o.g = g; o.b = b;
    o.rough = mix(0.80, 0.52, paint) + 0.22 * peel + 0.12 * knot - 0.10 * grain;
    /* Paint fills the grain. A painted picket with the full bare-timber height
     * field on it looks like it was carved rather than brushed. */
    o.h = 0.62 + (0.16 * grain + 0.06 * fibre) * (1 - paint * 0.8)
        - 0.14 * knot - 0.70 * gap
        + 0.06 * flake * edge;
  },

  /*
   * A window. One material has to serve both the dark pane on an empty house
   * and the lit one where somebody is still awake, because the renderer scales
   * emissive per material slot and the world would otherwise need two copies
   * of every window in the street.
   *
   * The glazing bars are the important half. They are opaque, they are rough,
   * and they stand proud — if they are left as a dark line painted on the
   * glass the whole window reads as a decal.
   *
   * The curtain glow keys on v, and the gap between the curtains on u, so this
   * material has to be mapped once over a pane. Tiled, a window grows a row of
   * light slots and a stack of ceilings.
   */
  glass(u, v, o, P, S) {
    const c = P.color;
    const m = cells(P.muntins, 2);
    const bw = P.bar ?? 0.030;
    const d = Math.min(gridLine(u, m), gridLine(v, m)) / m;
    const bar = 1 - sstep(bw * 0.7, bw, d);
    const barC = parseColor(P.frame || '#c9c3b2');

    /* Dirt and rain. Streaks run down, so they vary fast across U and slowly
     * along V; the same noise with the multipliers swapped gives horizontal
     * smears that look like somebody wiped the glass, which is the opposite of
     * the intent. */
    const streak = sstep(0.55, 0.90, tfbm(u * 8, v * 1, 16, S + 3, 2));
    const grime = tfbm(u * 2, v * 2, 6, S + 9, 3);
    const dust = tfbm(u, v, 40, S + 21, 2);

    /* Curtain glow. Warm, brightest high up where the ceiling light is, with
     * a brighter slot where the curtains do not quite meet. */
    const lit = clamp01(P.lit ?? 0);
    const fold = tfbm(u * 3, v * 1, 4, S + 7, 3);
    const slit = sstep(0.09, 0.015, Math.abs(u - 0.5));
    const glow = clamp01((0.30 + 0.80 * sstep(0.10, 0.70, v))
               * (0.55 + 0.60 * fold) + slit * 0.45);
    const gc = parseColor(P.glowColor || '#f0c078');

    let r = c[0] + 0.05 * grime + 0.035 * streak;
    let g = c[1] + 0.05 * grime + 0.035 * streak;
    let b = c[2] + 0.06 * grime + 0.035 * streak;
    /* Warm the pane by the same amount the emissive is lifted, so the material
     * works whether the shader adds emissive or multiplies it by albedo. */
    const k = lit * glow;
    r = mix(r, gc[0], k * 0.85); g = mix(g, gc[1], k * 0.85); b = mix(b, gc[2], k * 0.8);

    o.r = mix(r, barC[0] * (0.90 + 0.14 * dust), bar);
    o.g = mix(g, barC[1] * (0.90 + 0.14 * dust), bar);
    o.b = mix(b, barC[2] * (0.90 + 0.14 * dust), bar);
    o.rough = mix(0.06 + 0.24 * streak + 0.10 * grime, 0.68, bar);
    o.h = mix(0.40 + 0.03 * streak, 0.92, bar);
    o.em = k * (1 - bar);
  },

  /*
   * Cut-out leaf mass for hedges and canopies. The whole job is the mask: a
   * blob per cell gives something that is holey in a preview and completely
   * solid at fifteen metres, because every hole is the same size and they
   * average out. The leaves have to be elongated and individually rotated so
   * the gaps between them come in different shapes.
   *
   * Coverage is aimed at roughly two thirds — enough that a hedge is opaque at
   * three metres, sparse enough that its silhouette against a street lamp has
   * sky in it.
   */
  foliage(u, v, o, P, S) {
    const c = P.color;
    const n = cells(P.leaves, 14);
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);

    let best = 8, bx = 0, by = 0, bid = 0, bid2 = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j;
        const px = cx + lhash(cx, cy, n, S);
        const py = cy + lhash(cx, cy, n, S ^ 0x9e37);
        const dd = (px - x) * (px - x) + (py - y) * (py - y);
        if (dd < best) {
          best = dd; bx = px; by = py;
          bid = lhash(cx, cy, n, S + 77);
          bid2 = lhash(cx, cy, n, S + 313);
        }
      }
    }

    const ang = bid * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const dx = x - bx, dy = y - by;
    const lx = (dx * ca + dy * sa) / (1.05 + 0.40 * bid2);
    const ly = (-dx * sa + dy * ca) / 0.44;
    /* Taper: widening ly's contribution with lx pulls the far end of the
     * ellipse to a point, which is the difference between a leaf and a pill. */
    const rad = Math.hypot(lx, ly * (1 + lx * 0.45));
    const leaf = sstep(1.06, 0.72, rad);

    /* Clusters. Without this the leaves cover the plane evenly and a hedge
     * becomes a green box with a texture on it. The numbers below were set by
     * measuring rather than by eye: six to seven tenths of the tile survives
     * depending on the seed, with about nine holes across a row. Take the keep
     * threshold up and the hedge stops being a hedge at fifteen metres. */
    const cluster = tfbm(u, v, 5, S + 5, 3);
    const keep = sstep(0.24, 0.40, cluster);
    const nibble = sstep(0.90, 0.98, tfbm(u * 2, v * 2, 22, S + 91, 2));
    const mask = clamp01(leaf * keep - nibble * 0.5);

    const rib = sstep(0.13, 0.0, Math.abs(ly)) * leaf;
    const depth = mix(0.55, 1.0, sstep(0.62, 0.20, cluster));  /* interior dark */
    const tip = 0.86 + 0.26 * sstep(-0.2, 0.9, lx);
    const perLeaf = 0.80 + 0.42 * bid2;
    const dryC = parseColor(P.dry || '#8d8a3f');
    const dry = sstep(0.86, 0.98, bid2) * (P.dryness ?? 0.35);

    let r = c[0] * depth * tip * perLeaf;
    let g = c[1] * depth * tip * perLeaf;
    let b = c[2] * depth * tip * perLeaf;
    r = mix(r, dryC[0], dry); g = mix(g, dryC[1], dry); b = mix(b, dryC[2], dry);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.86 - 0.10 * rib;
    o.mask = mask;
    /* Cut-outs put coverage in the blue channel, so the height field here is
     * only ever used for the normal — a domed leaf with a raised midrib. */
    o.h = mask * (0.30 + 0.45 * (1 - clamp01(rad)) + 0.25 * rib);
  },

  /* Bark. Vertical fissures, and they need to be deep: a trunk lit from one
   * side by a street lamp is entirely made of the shadows in its own grooves.
   * The lichen is the only thing on it that is not brown, and it wants to sit
   * on the ridges rather than in the cracks. */
  bark(u, v, o, P, S) {
    const c = P.color;
    const ridge = tridged(u * 4, v * 1, 4, S, 5);
    const fine = tridged(u * 8, v * 2, 12, S + 7, 3);
    const fissure = sstep(0.62, 0.18, ridge) * (P.fissure ?? 1);
    const flake = tworley(u * 2, v * 1, 22, S + 13);
    const lichenC = parseColor(P.lichen || '#8d9678');
    const lichen = sstep(0.58, 0.86, tfbm(u * 2, v * 2, 9, S + 29, 4))
                 * (P.lichen_amount ?? 0.35) * sstep(0.30, 0.62, ridge);

    let t = 0.56 + 0.44 * ridge + 0.16 * fine + 0.14 * flake;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    r *= 1 - fissure * 0.62; g *= 1 - fissure * 0.64; b *= 1 - fissure * 0.66;
    r = mix(r, lichenC[0] * (0.8 + 0.4 * flake), lichen);
    g = mix(g, lichenC[1] * (0.8 + 0.4 * flake), lichen);
    b = mix(b, lichenC[2] * (0.8 + 0.4 * flake), lichen);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.96 - 0.06 * lichen;
    o.h = 0.42 + 0.40 * ridge + 0.14 * fine + 0.10 * flake - 0.55 * fissure;
  },

  /*
   * Galvanised or painted sheet: the cars on the driveways, the mailboxes, the
   * bins, the lamp posts. P.polish is the one dial that matters — it takes the
   * roughness down and the bump with it, because a car that keeps the mailbox
   * bump map picks up every scratch as a dent in the clear coat.
   */
  metal(u, v, o, P, S) {
    const c = P.color;
    const polish = clamp01(P.polish ?? 0.3);
    const flat = 1 - polish * 0.85;

    const brush = tfbm(u * 1, v * 16, 40, S, 2);
    const dent = tfbm(u, v, 5, S + 13, 3);
    const scratch = sstep(0.90, 1.0, tridged(u * 1, v * 6, 10, S + 41, 3));
    const panels = P.panels > 0 ? cells(P.panels, 2) : 0;
    const pd = panels > 0
      ? Math.min(gridLine(u, panels), gridLine(v, panels)) / panels
      : 1;
    const seam = panels > 0 ? 1 - sstep(0.004, 0.010, pd) : 0;

    /*
     * Rust does not fade in. It starts at a pit and eats outward, so what you
     * want is the edge of a noise field, not the field itself: a bloom of raw
     * metal oxide with a halo of stained paint around it and hard paint
     * everywhere else. Multiplying the paint colour by rust * noise gives an
     * evenly dirty car, which reads as a badly lit car rather than an old one.
     */
    const amt = clamp01(P.rust ?? 0.25);
    /*
     * Thirteen, not four. At four the blooms come out forty centimetres
     * across on a 1.6 m tile — car-door-sized patches of saturated orange
     * that read as blood spatter on a parked car rather than as rust on one.
     * Rust arrives at a stone chip and a seam, so the feature it wants to be
     * is the size of a hand.
     */
    const nf = tfbm(u, v, 13, S + 61, 4) + seam * 0.20 + scratch * 0.10;
    const th = 0.78 - amt * 0.34;
    const core = sstep(th, th + 0.06, nf);
    const halo = sstep(th - 0.14, th, nf) * (1 - core);
    const rust = amt > 0 ? core : 0;
    const stain = amt > 0 ? halo * 0.6 : 0;

    let t = 0.88 + 0.16 * brush * flat + 0.14 * dent + 0.10 * scratch;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    /* Browner than the obvious orange. Iron oxide on a painted panel is dark
     * and dusty; the saturated colour is what a rust texture looks like when
     * it is being looked at on its own rather than on a car. */
    r = mix(r, 0.30 + 0.12 * brush, rust);
    g = mix(g, 0.17 + 0.06 * brush, rust);
    b = mix(b, 0.11 + 0.03 * brush, rust);
    r = mix(r, r * 0.72 + 0.10, stain);
    g = mix(g, g * 0.70 + 0.05, stain);
    b = mix(b, b * 0.70 + 0.02, stain);
    r *= 1 - seam * 0.35; g *= 1 - seam * 0.35; b *= 1 - seam * 0.35;
    r = mix(r, r + 0.12, scratch * (1 - rust) * 0.5);
    g = mix(g, g + 0.12, scratch * (1 - rust) * 0.5);
    b = mix(b, b + 0.12, scratch * (1 - rust) * 0.5);

    o.r = r; o.g = g; o.b = b;
    /* Polish flattens a scratch in the height field but must not hide it in
     * the roughness: without the last term a car with no rust bakes a
     * roughness channel that is one constant across the whole texture, and a
     * scratch through a clear coat is the one thing a street lamp finds. */
    o.rough = mix(mix(0.62, 0.10, polish), 0.95, rust)
            + 0.10 * stain + 0.16 * scratch * (1 - rust);
    o.h = 0.60 + (0.10 * dent + 0.06 * brush) * flat
        - 0.40 * seam - 0.10 * scratch * flat + 0.14 * rust * flat;
  },

  /*
   * Her dress. Dry linen: the threads really do go over and under, because a
   * weave faked with two sine waves has no shadow where a thread passes under
   * its neighbour and comes out as a mesh stocking. The parity that decides
   * which thread is on top is why the count has to be even.
   *
   * Everything else here is asymmetry. The mud climbs from the hem in a ragged
   * tide line, the old stains are placed by noise and never mirrored, and the
   * yellowing is uneven across the cloth. It is the symmetry of a clean white
   * quad that makes her read as a bedsheet on a stick from forty metres.
   */
  cloth(u, v, o, P, S) {
    const c = P.color;
    const n = cells2(P.weave, 120);
    const su = u * n, sv = v * n;
    const iu = Math.floor(su), iv = Math.floor(sv);
    const fu = su - iu, fv = sv - iv;
    const tu = Math.cos((fu - 0.5) * Math.PI);        /* round cross-sections */
    const tv = Math.cos((fv - 0.5) * Math.PI);
    const over = (iu + iv) & 1;
    const top = over ? tu : tv;
    const bot = over ? tv : tu;
    const weave = 0.30 + 0.46 * top + 0.20 * bot * (1 - top);

    const slub = tfbm(u * 2, v * 2, 14, S + 5, 3);    /* uneven thread        */
    const fuzz = tfbm(u, v, 90, S + 11, 2);
    const wash = tfbm(u, v, 3, S + 23, 4);            /* uneven fade          */

    const yellowC = parseColor(P.yellow || '#c9bb8a');
    const mudC = parseColor(P.mud || '#4b3c28');
    const stainC = parseColor(P.stain_color || '#4a4030');

    /* The hem. A tide line at a third of the way up, wobbled by noise so it
     * is nowhere straight. It keys on v, so the dress has to be mapped once up
     * her body; at a `tile` small enough to repeat, the hem repeats with it and
     * she gets a stack of dark bands from ankle to collar. */
    const tide = 0.34 + 0.18 * (tfbm(u * 4, v * 1, 5, S + 31, 3) - 0.5) * 2;
    const mud = sstep(tide, tide * 0.22, v)
              * (0.45 + 0.55 * tfbm(u * 3, v * 3, 9, S + 37, 3))
              * (P.mud_amount ?? 0.85);
    /* Old stains: nothing built out of |u - 0.5|, no symmetry anywhere. */
    const blot = sstep(0.60, 0.86, tfbm(u * 1, v * 2, 3, S + 47, 4))
               * (P.stains ?? 0.6);
    const blot2 = sstep(0.72, 0.94, tfbm(u * 2, v * 1, 7, S + 53, 3))
                * (P.stains ?? 0.6);

    const age = clamp01((P.age ?? 0.7) * (0.35 + 0.85 * wash));
    let base0 = mix(c[0], yellowC[0], age);
    let base1 = mix(c[1], yellowC[1], age);
    let base2 = mix(c[2], yellowC[2], age);
    const t = weave * 0.9 + 0.20 * slub + 0.10 * fuzz + 0.32;

    let r = base0 * t, g = base1 * t, b = base2 * t;
    r = mix(r, mudC[0] * (0.7 + 0.5 * weave), mud);
    g = mix(g, mudC[1] * (0.7 + 0.5 * weave), mud);
    b = mix(b, mudC[2] * (0.7 + 0.5 * weave), mud);
    const bl = clamp01(blot * 0.7 + blot2 * 0.5);
    r = mix(r, stainC[0] * (0.8 + 0.4 * weave), bl);
    g = mix(g, stainC[1] * (0.8 + 0.4 * weave), bl);
    b = mix(b, stainC[2] * (0.8 + 0.4 * weave), bl);

    o.r = r; o.g = g; o.b = b;
    /* No sheen at all. Anything under about 0.9 here puts a highlight on her
     * shoulder when she passes a lamp and the illusion goes immediately. */
    o.rough = 0.98 - 0.03 * mud;
    o.h = 0.24 + 0.52 * weave + 0.10 * slub + 0.06 * fuzz - 0.05 * mud;
  },

  /*
   * Skin. Dry, matte, and much darker than it feels right to author.
   *
   * A face picked at the value a colour picker calls skin comes back from the
   * tonemap under a sodium lamp as pale plaster, and then reads as a mask.
   * The multiply below is doing the work that the lighting rig would do if
   * this were a photograph; leave it out and every character in the game
   * glows.
   */
  skin(u, v, o, P, S) {
    const c = P.color;
    const value = P.value ?? 0.58;
    const pore = sstep(0.13, 0.03, tworley(u, v, cells(P.pores, 160), S));
    const grain = tfbm(u, v, 110, S + 7, 2);
    const mottle = tfbm(u, v, 6, S + 13, 4);
    const wrinkle = tridged(u * 2, v * 3, 24, S + 19, 3);
    const blotch = sstep(0.58, 0.84, tfbm(u * 2, v * 2, 4, S + 31, 3));

    /* Blotches go red and slightly darker, not brown; blood under skin is a
     * hue shift, and shifting the value instead gives dirt. */
    let t = 0.90 + 0.14 * mottle + 0.08 * grain - 0.10 * pore
          - 0.06 * (1 - wrinkle);
    let r = c[0] * t * value;
    let g = c[1] * t * value;
    let b = c[2] * t * value;
    r = mix(r, r * 1.10 + 0.010, blotch * 0.6);
    g = mix(g, g * 0.92, blotch * 0.6);
    b = mix(b, b * 0.88, blotch * 0.6);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.90 + 0.06 * pore - 0.04 * mottle;
    o.h = 0.52 + 0.10 * mottle - 0.24 * pore + 0.08 * (1 - wrinkle);
  },

  /*
   * Flat emissive: the cloth of the red flag, her eyes, the glass in the
   * street lamps. Almost one colour, with just enough noise in it that the
   * bloom has something to catch, and a soft falloff at the edges of the tile
   * so a quad does not end in a hard rectangle of light.
   *
   * The falloff is the one thing here that does not tile, which is fine and
   * deliberate: nothing that uses this material is ever repeated across a
   * surface. If something ever needs to be, set P.edge to 0.
   */
  glow(u, v, o, P, S) {
    const c = P.color;
    const edge = P.edge ?? 1;
    const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
    const core = mix(1, sstep(1.15, 0.25, rr), edge);
    const n = tfbm(u, v, 8, S, 3);
    const fine = tfbm(u, v, 48, S + 3, 2);

    const t = 0.94 + 0.10 * n;
    o.r = c[0] * t; o.g = c[1] * t; o.b = c[2] * t;
    o.rough = 0.70;
    o.h = 0.5 + 0.05 * fine;
    o.em = clamp01((P.em ?? 1) * (0.72 + 0.30 * core) * (0.94 + 0.10 * n));
  },

  /*
   * The fountain basin in the little green at the head of the court. The
   * renderer animates the real wave normals over the top of this, so all that
   * is wanted here is the still detail: what the water sits on, and a set of
   * rings that are already there when the animation amplitude is zero.
   *
   * Rings concentric about the middle of the tile cannot tile. Rings about the
   * feature points of a lattice can, and they read better anyway — a fountain
   * has several drip points, not one.
   */
  water(u, v, o, P, S) {
    const c = P.color;
    const d = tworley(u, v, cells(P.rings, 3), S);
    const jitter = tfbm(u, v, 6, S + 5, 3);
    const ring = 0.5 + 0.5 * Math.sin((d * 7 + jitter * 1.5) * Math.PI * 2);
    const chop = tfbm(u * 2, v * 2, 20, S + 11, 3);

    /* Silt and a couple of drowned leaves, seen through the water rather than
     * on it: they lift the colour a little and do not touch the roughness,
     * which is what keeps them under the surface. */
    const silt = tfbm(u, v, 4, S + 17, 4);
    const leaf = sstep(0.90, 0.99, 1 - tworley(u * 2, v * 1, 9, S + 23));
    const leafC = parseColor(P.leaf || '#4a4128');
    const siltC = parseColor(P.silt || '#3b3a2c');

    const t = 0.86 + 0.08 * ring + 0.14 * chop;
    let r = c[0] * t, g = c[1] * t, b = c[2] * t;
    const sk = sstep(0.48, 0.82, silt) * (P.silt_amount ?? 0.55);
    r = mix(r, siltC[0], sk * 0.55);
    g = mix(g, siltC[1], sk * 0.55);
    b = mix(b, siltC[2], sk * 0.45);
    r = mix(r, leafC[0], leaf * 0.7);
    g = mix(g, leafC[1], leaf * 0.7);
    b = mix(b, leafC[2], leaf * 0.6);

    o.r = r; o.g = g; o.b = b;
    o.rough = 0.06 + 0.05 * sk;
    o.h = 0.50 + 0.28 * ring + 0.10 * chop - 0.04 * leaf;
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
 *   normal:  rg  = tangent-space normal xy, b = height or cut-out coverage,
 *            a   = emissive
 *
 * Nothing in here or below it may call Math.random(). The whole point of a
 * seeded bake is that the same house comes back the same on night six as it
 * was on night one, and the player has been told to look for a change.
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

  const o = { r: 0, g: 0, b: 0, rough: 0.8, h: 0.5, em: 0, mask: -1 };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      /* mask starts negative rather than at 1, so that a cut-out recipe which
       * forgets to write one falls back to its height field below instead of
       * silently baking a solid rectangle. A hedge with no holes in it is the
       * kind of bug that ships, because it looks like a hedge. */
      o.r = o.g = o.b = 0; o.rough = 0.8; o.h = 0.5; o.em = 0; o.mask = -1;
      kind(u, v, o, P, S);
      const i = y * size + x;
      alb[i * 4]     = clamp01(o.r) * 255;
      alb[i * 4 + 1] = clamp01(o.g) * 255;
      alb[i * 4 + 2] = clamp01(o.b) * 255;
      alb[i * 4 + 3] = clamp01(o.rough) * 255;
      height[i] = o.h;
      emis[i] = o.em;
      mask[i] = o.mask < 0 ? o.h : o.mask;
    }
  }

  /* Sobel, wrapping at the edges so the normal map tiles exactly like the
   * albedo does. `bump` is per-material and the range is wide: siding wants a
   * fraction of what bark wants, and the difference between 1 and 3 on grass
   * is the difference between a lawn and a carpet of green foam. */
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
