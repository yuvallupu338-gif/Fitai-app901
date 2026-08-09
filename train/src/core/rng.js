/*
 * rng.js — seeded randomness.
 *
 * Every run gets a seed, and every system that rolls dice takes a *named*
 * stream derived from it. That is the whole point: the anomaly director, the
 * passenger shuffler and the ambient sound scheduler can each draw as often as
 * they like without shifting each other's results, so a run can be replayed
 * from its seed and a save restored mid-journey continues the same night.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* FNV-1a over a string, so a stream name becomes a stable 32-bit offset. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /* A child generator whose sequence depends on this seed and the name, and
     on nothing else that has been drawn so far. */
  stream(name) {
    return new Rng((this.seed ^ hashString(name)) >>> 0);
  }

  float(min = 0, max = 1) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  bool(chance = 0.5) { return this.next() < chance; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* Weighted pick. Items are `{ weight }`; anything without one counts as 1. */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight ?? 1;
    if (total <= 0) return null;
    let roll = this.next() * total;
    for (const it of items) {
      roll -= it.weight ?? 1;
      if (roll <= 0) return it;
    }
    return items[items.length - 1];
  }
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (Math.random() * 0xffffffff) >>> 0;
}
