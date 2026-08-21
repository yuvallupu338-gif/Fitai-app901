/*
 * rng.js — a seeded random number generator, because a model you cannot
 * reproduce is a model you cannot debug.
 *
 * Math.random has no seed, so two runs of the same training recipe would
 * differ in their weight init and in which slices of the text they saw, and
 * there would be no way to tell a real improvement from a lucky one. mulberry32
 * is thirty characters of arithmetic with a good enough spread for this: the
 * weights it draws are only ever a starting point that gradient descent then
 * spends the whole run overwriting.
 */

/** A uniform [0,1) generator from a 32-bit seed. */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Box-Muller, one draw per call. The second value of the pair is thrown away
 * rather than cached: a cache would be state living outside the generator, so
 * the same seed would produce different weights depending on what had been
 * drawn before it, and the reproducibility this file exists for would be a
 * lie. Init draws a few hundred thousand numbers once — the extra sine costs
 * nothing next to a single training step. */
export function gauss(rng) {
  let u = 0, v = 0, s = 0;
  do {
    u = rng() * 2 - 1;
    v = rng() * 2 - 1;
    s = u * u + v * v;
  } while (s === 0 || s >= 1);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

/** Fill a buffer with N(0, scale) noise. */
export function fillGauss(buf, rng, scale) {
  for (let i = 0; i < buf.length; i++) buf[i] = gauss(rng) * scale;
  return buf;
}

/** Draw an index from a probability vector that sums to ~1. */
export function sampleFrom(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;   // floating point crumbs at the end of the sum
}
