/*
 * rng.js — seeded random numbers.
 *
 * Nothing in villa/src/sim/ calls Math.random(). Every roll goes through one
 * of these, seeded from the run's seed, which is what makes a night
 * reproducible: given the same seed and the same inputs, the same things wake
 * up at the same moment. That is worth more than it sounds — a balance bug on
 * night six is otherwise a bug you can watch but never repeat, and the headless
 * test in tools/villa-sim.mjs asserts determinism directly.
 *
 * mulberry32: one multiply-xorshift round. Small, fast, and good enough for a
 * game that never asks it for more than "which of these eight, and when".
 */

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /* The state, so a whole run can be saved and resumed mid-night without the
   * rest of the night changing under the player. */
  rng.state = () => a >>> 0;
  rng.setState = (s) => { a = (s >>> 0) || 1; };
  return rng;
}

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/* Fisher-Yates on a copy. Used to choose which hidden openings wake up on a
 * given night without ever mutating the pool itself. */
export function shuffled(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/* A seed from a string, so a player can type one in and get the same week. */
export function seedFrom(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
