/*
 * rng.js — deterministic randomness.
 *
 * Every customer in this game is a seed. Their face, skin tone, hair, the
 * makeup they walked in wearing, what they ask for and what they secretly
 * prefer all come out of one number, which means the same shift can be replayed
 * exactly — for the audit, and for a player who closes the tab mid-customer and
 * comes back expecting the same person to still be sitting there.
 *
 * Math.random cannot do that, so it is not used anywhere in this app.
 */

/* xmur3: string -> 32-bit seed. Used so a customer can be seeded by a readable
 * key ("day3-customer2") instead of a magic number. */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/*
 * mulberry32. Small, fast, and good enough that a hundred customers generated
 * from consecutive seeds do not visibly rhyme — which is the actual failure
 * mode of a weaker generator here: every third customer with the same nose.
 */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  next.chance = (p) => next() < p;
  /* Fisher-Yates on a copy — callers pass shared catalog arrays and would
   * otherwise find their data order changing under them. */
  next.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  };
  /* Roughly normal, for anything that should cluster around a middle: face
   * proportions, how picky a customer is, how much they tip. */
  next.gauss = (mean = 0, sd = 1) => {
    const u = Math.max(1e-9, next());
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return next;
}

/*
 * Value noise on a 2D lattice, for the procedural textures. Deterministic in
 * (x, y) with no state, so a texture generated on two machines is the same
 * texture and the smoke test's pixel assertions mean something.
 */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fade(t) { return t * t * (3 - 2 * t); }

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/* Tiling variant: the lattice wraps at `period`, so the texture repeats
 * seamlessly. Every surface texture in this game is tiled across a prop, and
 * a visible seam on a countertop is the first thing anybody notices. */
export function tileNoise(x, y, period, seed = 0) {
  const wrap = (n) => ((n % period) + period) % period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const x0 = wrap(xi), x1 = wrap(xi + 1);
  const y0 = wrap(yi), y1 = wrap(yi + 1);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function fbm(x, y, octaves, seed = 0, period = 0) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (period
      ? tileNoise(x * freq, y * freq, period * freq, seed + i * 131)
      : valueNoise(x * freq, y * freq, seed + i * 131));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
