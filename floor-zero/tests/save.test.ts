import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager, migrate, migrateSettings } from '../src/save/SaveManager';
import { DEFAULT_SETTINGS, SAVE_VERSION } from '../src/core/types';
import { GameState } from '../src/core/GameState';

/** Minimal in-memory Storage so the tests never touch a real browser. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  failOnWrite = false;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  raw(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  poke(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const KEY = 'floor-zero.save.v1';

describe('SaveManager', () => {
  let storage: MemoryStorage;
  let save: SaveManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    save = new SaveManager(storage);
  });

  it('returns a blank save when nothing is stored', () => {
    const data = save.load();
    expect(data.run).toBeNull();
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(save.hasRun).toBe(false);
  });

  it('writes and reads back a run', () => {
    const state = new GameState();
    state.run.chapter = 3;
    state.run.visit = 4;
    state.addItem('control_key');
    state.markSolved('puzzle_clocks');
    state.setFlag('floor_power');

    expect(save.saveRun(state.run, state.meta, DEFAULT_SETTINGS).ok).toBe(true);

    const fresh = new SaveManager(storage);
    const loaded = fresh.load();
    expect(loaded.run?.chapter).toBe(3);
    expect(loaded.run?.visit).toBe(4);
    expect(loaded.run?.inventory).toContain('control_key');
    expect(loaded.run?.solvedPuzzles).toContain('puzzle_clocks');
    expect(loaded.run?.flags.floor_power).toBe(true);
    expect(fresh.hasRun).toBe(true);
  });

  it('persists settings independently of the run', () => {
    save.saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 0.31, quality: 'high', lang: 'en' });
    const fresh = new SaveManager(storage);
    expect(fresh.load().settings.masterVolume).toBeCloseTo(0.31, 5);
    expect(fresh.load().settings.quality).toBe('high');
    expect(fresh.load().settings.lang).toBe('en');
    expect(fresh.hasRun).toBe(false);
  });

  it('clears the run but keeps meta progress and settings', () => {
    const state = new GameState();
    state.unlockEnding(2);
    save.saveRun(state.run, state.meta, { ...DEFAULT_SETTINGS, musicVolume: 0.2 });
    save.clearRun();

    const fresh = new SaveManager(storage);
    const loaded = fresh.load();
    expect(loaded.run).toBeNull();
    expect(loaded.meta.endingsUnlocked).toContain(2);
    expect(loaded.settings.musicVolume).toBeCloseTo(0.2, 5);
  });

  it('erases everything on clear()', () => {
    const state = new GameState();
    save.saveRun(state.run, state.meta, DEFAULT_SETTINGS);
    save.clear();
    expect(storage.raw(KEY)).toBeNull();
    expect(new SaveManager(storage).hasRun).toBe(false);
  });

  it('discards corrupt JSON rather than crashing', () => {
    storage.poke(KEY, '{ this is not json');
    const data = save.load();
    expect(data.run).toBeNull();
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('discards a payload that is not an object', () => {
    storage.poke(KEY, '"just a string"');
    expect(save.load().run).toBeNull();
  });

  it('survives a run object with garbage fields', () => {
    storage.poke(
      KEY,
      JSON.stringify({
        version: 3,
        run: {
          seed: 'not a number',
          chapter: 99,
          visit: -5,
          inventory: ['fuse', 42, null],
          flags: { good: true, bad: 'nope' },
          behavior: { heat: { 'a,b': 3, 'c,d': 'x' } },
        },
        meta: { endingsUnlocked: [1, 'two'] },
        settings: { masterVolume: 5, quality: 'ultra' },
      }),
    );
    const data = save.load();
    expect(data.run?.chapter).toBe(5); // clamped to the last chapter
    expect(data.run?.visit).toBe(0);
    expect(data.run?.inventory).toEqual(['fuse']);
    expect(data.run?.flags).toEqual({ good: true });
    expect(data.run?.behavior.heat).toEqual({ 'a,b': 3 });
    expect(data.meta.endingsUnlocked).toEqual([1]);
    expect(data.settings.masterVolume).toBe(1);
    expect(data.settings.quality).toBe('medium');
  });

  it('reports a failed write instead of throwing', () => {
    storage.failOnWrite = true;
    const result = save.saveSettings(DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quota');
  });

  it('works with no storage at all', () => {
    const none = new SaveManager(null);
    expect(none.available).toBe(false);
    expect(none.load().run).toBeNull();
    expect(none.saveSettings(DEFAULT_SETTINGS).ok).toBe(false);
  });
});

describe('save migration', () => {
  it('upgrades a version 1 payload that stored progress flat', () => {
    const migrated = migrate({
      version: 1,
      progress: { seed: 42, chapter: 2, visit: 2, inventory: ['fuse'] },
      settings: { masterVolume: 0.5 },
    });
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(SAVE_VERSION);
    expect(migrated!.run?.chapter).toBe(2);
    expect(migrated!.run?.inventory).toEqual(['fuse']);
    expect(migrated!.settings.masterVolume).toBeCloseTo(0.5, 5);
  });

  it('drops version 2 tracks that used the old unpacked shape', () => {
    const migrated = migrate({
      version: 2,
      run: {
        seed: 7,
        chapter: 2,
        lastTrack: { samples: [{ t: 0, x: 0 }] },
        olderTrack: { samples: [] },
      },
    });
    expect(migrated!.run?.lastTrack).toBeNull();
    expect(migrated!.run?.olderTrack).toBeNull();
  });

  it('keeps version 3 packed tracks', () => {
    const packed = { v: 2, visit: 1, d: 1000, s: [0, 0, 0, 0, 0, 0, 1], e: [], r: [] };
    const migrated = migrate({ version: 3, run: { seed: 7, chapter: 2, lastTrack: packed } });
    expect(migrated!.run?.lastTrack).toEqual(packed);
  });

  it('rejects a non-object payload', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate(7)).toBeNull();
    expect(migrate('x')).toBeNull();
  });

  it('fills in every missing setting with its default', () => {
    const settings = migrateSettings({ fov: 200, subtitleSize: 'huge', scareIntensity: 'extreme' });
    expect(settings.fov).toBe(105);
    expect(settings.subtitleSize).toBe('medium');
    expect(settings.scareIntensity).toBe('normal');
    expect(settings.headBob).toBe(DEFAULT_SETTINGS.headBob);
  });
});
