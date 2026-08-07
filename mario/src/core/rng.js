/*
 * rng.js — the same hundred levels for everybody, forever.
 *
 * The level catalogue stores a seed per level rather than a tile map, so the
 * generator has to be a pure function of that seed. Math.random() would make
 * level 47 a different level on every reload, which breaks the two things that
 * make a hundred levels worth having: a best time you can beat, and being able
 * to tell somebody where the hidden 1-up is.
 *
 * mulberry32 is used because it is four lines, has no state beyond a uint32,
 * and passes enough of gjrand that nobody will ever see a pattern in where the
 * coins land.
 */

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /* [0,1) */
    next,
    /* Integer in [lo,hi] inclusive — the form nearly every call site wants. */
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
    float(lo, hi) { return lo + next() * (hi - lo); },
    chance(p) { return next() < p; },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    /* Weighted pick over [[value, weight], ...]. Weights need not sum to 1. */
    weighted(pairs) {
      let total = 0;
      for (const p of pairs) total += p[1];
      let r = next() * total;
      for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
  };
}

/* A stable 32-bit hash of a string, so a level can be seeded by its name and
   stay put even if the catalogue is reordered. */
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
