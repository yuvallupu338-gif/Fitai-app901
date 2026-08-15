/**
 * Deterministic seeded random number generator (mulberry32).
 * Every run of the game gets a seed; the same seed reproduces the same
 * anomaly order, so saves stay consistent and tests can be deterministic.
 */
export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Raw float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.range(minInclusive, maxInclusive + 1 - 1e-9));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('RNG.pick called with an empty array');
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  shuffle<T>(items: T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Serialise / restore so a loaded save continues the same sequence. */
  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }

  fork(salt: number): RNG {
    return new RNG((this.s ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  }
}

export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}
