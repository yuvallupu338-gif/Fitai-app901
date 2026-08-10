/*
 * rng.js — deterministic noise and random numbers.
 *
 * Every piece of world in this game is generated from coordinates, never
 * stored. Walk east for ten minutes, walk back, and the rooms are the same
 * rooms — because a chunk's contents are a pure function of (levelSeed, cx, cz)
 * and nothing else. That rule is what makes an "endless" level possible in a
 * few kilobytes, and it is also what makes it debuggable: a bad room can be
 * reproduced from its coordinates alone.
 *
 * Nothing here calls Math.random(). If you add something that does, chunk
 * generation stops being reproducible and the seams between chunks will start
 * flickering as you walk over them.
 */

/* ------------------------------------------------------------------ *
 * Integer hashing
 * ------------------------------------------------------------------ */

/* One round of a 32-bit integer avalanche (the murmur3 finaliser). Cheap, and
 * good enough that neighbouring cells look unrelated. */
export function hash1(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  return hash1(h);
}

export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
        ^ Math.imul(z | 0, 0x9e3779b1) ^ (seed | 0);
  return hash1(h);
}

/* Unit float from integer coordinates. */
export function rand2(x, y, seed = 0) { return hash2(x, y, seed) / 4294967296; }
export function rand3(x, y, z, seed = 0) { return hash3(x, y, z, seed) / 4294967296; }

/* ------------------------------------------------------------------ *
 * Streams
 * ------------------------------------------------------------------ */

/*
 * mulberry32 — small, fast, and passes enough of the statistical tests for
 * level generation. Returns a closure so a generator can be handed "its" stream
 * and not worry about disturbing anyone else's sequence.
 */
export function rngFrom(seed) {
  let a = (seed | 0) >>> 0;
  const f = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /* Conveniences that show up in every generator. */
  f.int = (n) => Math.floor(f() * n);
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.irange = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.chance = (p) => f() < p;
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

/* Seed a stream from a coordinate pair — the standard way a chunk gets its
 * own reproducible randomness. */
export function rngAt(x, y, seed = 0) { return rngFrom(hash2(x, y, seed)); }

/* ------------------------------------------------------------------ *
 * Noise
 * ------------------------------------------------------------------ */

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/* Value noise. Smoother than it has any right to be for the cost, and for
 * stains, damp patches and mottled paint it reads better than gradient noise,
 * which tends to look like clouds. */
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = rand2(xi, yi, seed);
  const b = rand2(xi + 1, yi, seed);
  const c = rand2(xi, yi + 1, seed);
  const d = rand2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/* Gradient (Perlin-style) noise, for the things value noise makes look like
 * cotton wool: rolling ground, water, cave walls. */
export function gnoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const g = (ix, iy, dx, dy) => {
    const h = hash2(ix, iy, seed) & 7;
    const ang = h * (Math.PI / 4);
    return Math.cos(ang) * dx + Math.sin(ang) * dy;
  };
  const a = g(xi, yi, xf, yf);
  const b = g(xi + 1, yi, xf - 1, yf);
  const c = g(xi, yi + 1, xf, yf - 1);
  const d = g(xi + 1, yi + 1, xf - 1, yf - 1);
  return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * 0.5 + 0.5;
}

export function fbm2(x, y, seed = 0, octaves = 4, lac = 2, gain = 0.5) {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise2(x * f, y * f, seed + i * 1013);
    norm += a;
    f *= lac;
    a *= gain;
  }
  return sum / norm;
}

export function fbmG(x, y, seed = 0, octaves = 4, lac = 2, gain = 0.5) {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * gnoise2(x * f, y * f, seed + i * 7919);
    norm += a;
    f *= lac;
    a *= gain;
  }
  return sum / norm;
}

/*
 * Worley / cellular noise. Returns distance to the nearest feature point,
 * roughly in [0,1]. This is what makes tiles, cracked concrete, pebbles and
 * carpet loops — anything with cells rather than clouds.
 */
export function worley2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 8;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const h = hash2(cx, cy, seed);
      const px = cx + (h & 255) / 255;
      const py = cy + ((h >>> 8) & 255) / 255;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.min(1, Math.sqrt(best));
}

/* Ridged noise — sharp creases instead of soft hills. Cave walls, rust runs,
 * the veins in marble. */
export function ridged(x, y, seed = 0, octaves = 4) {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = Math.abs(gnoise2(x * f, y * f, seed + i * 311) * 2 - 1);
    sum += a * (1 - n);
    norm += a;
    f *= 2;
    a *= 0.5;
  }
  return sum / norm;
}
