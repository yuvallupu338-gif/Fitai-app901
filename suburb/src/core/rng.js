/*
 * rng.js — deterministic randomness.
 *
 * The whole neighbourhood is a pure function of one integer. House colours,
 * which windows are lit, where the gnomes stand, which of the ten sites the
 * flag appears at, what the keypad code is — all of it comes out of the night's
 * seed and nothing else. That is not a cleverness for its own sake: this game
 * resets a night every time she catches you, and a night that rebuilt itself
 * differently on each retry would make the memory puzzle — which asks you to
 * remember what you saw in the daylight — a lie.
 *
 * Nothing in the generation path may call Math.random(). If you add something
 * that does, a night stops being replayable and the day you walked around in
 * stops being the night you play.
 */

export function hash1(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function hash2(x, y, seed = 0) {
  const h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  return hash1(h);
}

export function rand2(x, y, seed = 0) { return hash2(x, y, seed) / 4294967296; }

/*
 * mulberry32. Small, fast, and good enough for placing props. Returns a
 * closure so each generator can be handed "its" stream and not disturb anyone
 * else's sequence — which matters here more than usual, because the flag's
 * position and the puzzle's answer must not shift when someone adds one more
 * garden gnome to the props pass.
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
  f.int = (n) => Math.floor(f() * n);
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.irange = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.chance = (p) => f() < p;
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  /* Fisher-Yates against this stream, so a shuffled list is reproducible. */
  f.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      const t = a2[i]; a2[i] = a2[j]; a2[j] = t;
    }
    return a2;
  };
  return f;
}

/* ------------------------------------------------------------------ *
 * Noise
 *
 * Used for the things that are not placed but grown: the slight roll of the
 * ground, where the fog is thicker, how the lawn wears at the edges.
 * ------------------------------------------------------------------ */

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

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
