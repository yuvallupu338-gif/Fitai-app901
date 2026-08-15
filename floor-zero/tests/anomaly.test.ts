import { describe, expect, it } from 'vitest';
import { AnomalyDirector } from '../src/anomalies/AnomalyDirector';
import { ANOMALIES, AnomalyDef } from '../src/anomalies/anomalyDefinitions';
import { EventBus } from '../src/core/EventBus';
import type { GameContext } from '../src/core/Context';
import { GameState } from '../src/core/GameState';
import { RNG } from '../src/core/RNG';
import { DEFAULT_SETTINGS } from '../src/core/types';

/**
 * The director only touches a handful of context members, so a small stub is
 * enough to exercise every scheduling rule without a renderer.
 */
function makeContext(overrides: Partial<{ chapter: number; tension: number; chasing: boolean }> = {}) {
  const state = new GameState();
  state.phase = 'playing';
  state.run.chapter = overrides.chapter ?? 5;

  const fired: string[] = [];
  const ctx = {
    state,
    rng: new RNG(1234),
    settings: { ...DEFAULT_SETTINGS },
    camera: { position: { x: 5, y: 1.6, z: 0 } },
    tension: {
      normalized: overrides.tension ?? 0,
      add: () => undefined,
    },
    mimic: { isChasing: overrides.chasing ?? false },
    world: { roomAt: () => 'corridor', prop: () => undefined },
    interactions: { get: () => undefined },
    sequencer: { run: () => 'routine' },
    audio: { play: () => null },
  } as unknown as GameContext;

  return { ctx, state, fired };
}

/** Synthetic anomalies with no world dependencies. */
function fakeDefs(fired: string[], count = 6): AnomalyDef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `fake_${i}`,
    minChapter: i < 3 ? 1 : 4,
    weight: 10,
    cooldown: 100,
    run: () => {
      fired.push(`fake_${i}`);
    },
  }));
}

function pump(director: AnomalyDirector, ctx: GameContext, seconds: number, step = 0.5): void {
  for (let t = 0; t < seconds; t += step) director.update(step, ctx);
}

describe('AnomalyDirector', () => {
  it('fires nothing before the minimum gap has elapsed', () => {
    const { ctx, fired } = makeContext();
    const director = new AnomalyDirector(new EventBus(), 99, fakeDefs(fired));
    director.configure({ chapter: 5, minGap: 30, budget: 10 }, 7);
    // configure() seeds the quiet timer at half the gap, so 10s is still short.
    pump(director, ctx, 10);
    expect(fired).toHaveLength(0);
  });

  it('does eventually fire once the quiet has run long enough', () => {
    const { ctx, fired } = makeContext();
    const director = new AnomalyDirector(new EventBus(), 5, fakeDefs(fired));
    director.configure({ chapter: 5, minGap: 20, budget: 10 }, 5);
    pump(director, ctx, 200);
    expect(fired.length).toBeGreaterThan(0);
  });

  it('never repeats the same anomaly back to back', () => {
    const { ctx, fired } = makeContext();
    const director = new AnomalyDirector(new EventBus(), 3, fakeDefs(fired, 8));
    director.configure({ chapter: 5, minGap: 5, budget: 40 }, 3);
    pump(director, ctx, 900, 0.5);

    expect(fired.length).toBeGreaterThan(4);
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i]).not.toBe(fired[i - 1]);
    }
  });

  it('honours each anomaly cooldown', () => {
    const { ctx, fired } = makeContext();
    const defs = fakeDefs(fired, 4).map((def) => ({ ...def, minChapter: 1, cooldown: 400 }));
    const director = new AnomalyDirector(new EventBus(), 11, defs);
    director.configure({ chapter: 5, minGap: 4, budget: 100 }, 11);
    pump(director, ctx, 380, 0.5);

    // With a 400s cooldown apiece and only four definitions, at most four fire.
    expect(fired.length).toBeLessThanOrEqual(4);
    expect(new Set(fired).size).toBe(fired.length);
  });

  it('respects the per-visit budget', () => {
    const { ctx, fired } = makeContext();
    const defs = fakeDefs(fired, 10).map((def) => ({ ...def, minChapter: 1, cooldown: 0 }));
    const director = new AnomalyDirector(new EventBus(), 21, defs);
    director.configure({ chapter: 5, minGap: 2, budget: 3 }, 21);
    pump(director, ctx, 1200, 0.5);

    expect(fired).toHaveLength(3);
    expect(director.firedThisVisit).toBe(3);
  });

  it('only picks anomalies allowed in the current chapter', () => {
    const { ctx, fired, state } = makeContext({ chapter: 1 });
    state.run.chapter = 1;
    const director = new AnomalyDirector(new EventBus(), 8, fakeDefs(fired, 6));
    director.configure({ chapter: 1, minGap: 3, budget: 20 }, 8);
    pump(director, ctx, 900, 0.5);

    expect(fired.length).toBeGreaterThan(0);
    for (const id of fired) {
      expect(['fake_0', 'fake_1', 'fake_2']).toContain(id);
    }
  });

  it('stays silent while the mimic is chasing', () => {
    const { ctx, fired } = makeContext({ chasing: true });
    const director = new AnomalyDirector(new EventBus(), 4, fakeDefs(fired, 6));
    director.configure({ chapter: 5, minGap: 1, budget: 50 }, 4);
    pump(director, ctx, 600);
    expect(fired).toHaveLength(0);
  });

  it('stays silent while the game is not interactive', () => {
    const { ctx, fired, state } = makeContext();
    state.phase = 'paused';
    const director = new AnomalyDirector(new EventBus(), 4, fakeDefs(fired, 6));
    director.configure({ chapter: 5, minGap: 1, budget: 50 }, 4);
    pump(director, ctx, 600);
    expect(fired).toHaveLength(0);
  });

  it('fires sooner at high tension than at low tension', () => {
    const run = (tension: number): number => {
      const { ctx, fired } = makeContext({ tension });
      const defs = fakeDefs(fired, 8).map((def) => ({ ...def, minChapter: 1, cooldown: 0 }));
      const director = new AnomalyDirector(new EventBus(), 77, defs);
      director.configure({ chapter: 5, minGap: 30, budget: 50 }, 77);
      pump(director, ctx, 400, 0.5);
      return fired.length;
    };
    expect(run(1)).toBeGreaterThan(run(0));
  });

  it('is deterministic for a fixed seed', () => {
    const sequence = (): string[] => {
      const { ctx, fired } = makeContext();
      const defs = fakeDefs(fired, 8).map((def) => ({ ...def, minChapter: 1, cooldown: 60 }));
      const director = new AnomalyDirector(new EventBus(), 4242, defs);
      director.configure({ chapter: 5, minGap: 6, budget: 12 }, 4242);
      pump(director, ctx, 600, 0.5);
      return fired;
    };
    expect(sequence()).toEqual(sequence());
  });

  it('produces different orders for different seeds', () => {
    const sequence = (seed: number): string[] => {
      const { ctx, fired } = makeContext();
      const defs = fakeDefs(fired, 8).map((def) => ({ ...def, minChapter: 1, cooldown: 60 }));
      const director = new AnomalyDirector(new EventBus(), seed, defs);
      director.configure({ chapter: 5, minGap: 6, budget: 12 }, seed);
      pump(director, ctx, 600, 0.5);
      return fired;
    };
    expect(sequence(1)).not.toEqual(sequence(9999));
  });

  it('emits an event and remembers what the player has seen', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('anomaly_triggered', ({ id }) => seen.push(id));

    const { ctx, fired, state } = makeContext();
    const director = new AnomalyDirector(bus, 1, fakeDefs(fired, 4).map((d) => ({ ...d, minChapter: 1 })));
    director.force('fake_1', ctx);

    expect(seen).toEqual(['fake_1']);
    expect(state.run.seenAnomalies).toContain('fake_1');
    expect(state.meta.anomaliesEverSeen).toContain('fake_1');
  });

  it('force() reports an unknown id instead of throwing', () => {
    const { ctx, fired } = makeContext();
    const director = new AnomalyDirector(new EventBus(), 1, fakeDefs(fired));
    expect(director.force('does_not_exist', ctx)).toBe(false);
  });
});

describe('the shipped anomaly catalogue', () => {
  it('has at least twenty distinct definitions', () => {
    expect(ANOMALIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ANOMALIES.map((a) => a.id)).size).toBe(ANOMALIES.length);
  });

  it('gives every anomaly a positive weight and a cooldown', () => {
    for (const def of ANOMALIES) {
      expect(def.weight).toBeGreaterThan(0);
      expect(def.cooldown).toBeGreaterThan(0);
      expect(typeof def.run).toBe('function');
    }
  });

  it('has enough chapter-1 anomalies for the first visit to feel alive', () => {
    expect(ANOMALIES.filter((a) => a.minChapter <= 1).length).toBeGreaterThanOrEqual(8);
  });
});
