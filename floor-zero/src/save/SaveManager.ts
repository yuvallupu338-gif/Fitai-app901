import {
  DEFAULT_SETTINGS,
  MetaProgress,
  RunState,
  SAVE_VERSION,
  SaveData,
  Settings,
  emptyBehaviorProfile,
  emptyMeta,
} from '../core/types';

const STORAGE_KEY = 'floor-zero.save.v1';

export interface SaveResult {
  ok: boolean;
  reason?: string;
}

/**
 * localStorage persistence with an explicit schema version. Older saves are
 * migrated field by field, and anything unreadable is discarded rather than
 * allowed to crash the game on boot.
 */
export class SaveManager {
  private cache: SaveData | null = null;
  private storage: Storage | null;

  constructor(storage: Storage | null = safeStorage()) {
    this.storage = storage;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  load(): SaveData {
    if (this.cache) return this.cache;
    const fallback = this.blank();
    if (!this.storage) return (this.cache = fallback);

    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return (this.cache = fallback);
    }
    if (!raw) return (this.cache = fallback);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[save] corrupt save discarded');
      this.clear();
      return (this.cache = fallback);
    }

    const migrated = migrate(parsed);
    if (!migrated) {
      console.warn('[save] unreadable save discarded');
      this.clear();
      return (this.cache = fallback);
    }
    this.cache = migrated;
    return migrated;
  }

  blank(): SaveData {
    return {
      version: SAVE_VERSION,
      updatedAt: 0,
      run: null,
      meta: emptyMeta(),
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  write(data: SaveData): SaveResult {
    this.cache = data;
    if (!this.storage) return { ok: false, reason: 'unavailable' };
    try {
      data.version = SAVE_VERSION;
      data.updatedAt = Date.now();
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { ok: true };
    } catch (error) {
      console.warn('[save] write failed', error);
      return { ok: false, reason: 'quota' };
    }
  }

  saveRun(run: RunState, meta: MetaProgress, settings: Settings): SaveResult {
    const data = this.load();
    data.run = run;
    data.meta = meta;
    data.settings = settings;
    return this.write(data);
  }

  saveSettings(settings: Settings): SaveResult {
    const data = this.load();
    data.settings = settings;
    return this.write(data);
  }

  saveMeta(meta: MetaProgress): SaveResult {
    const data = this.load();
    data.meta = meta;
    return this.write(data);
  }

  get hasRun(): boolean {
    return this.load().run !== null;
  }

  clearRun(): void {
    const data = this.load();
    data.run = null;
    this.write(data);
  }

  clear(): void {
    this.cache = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__fz_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function migrateSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const merged: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = source[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof fallback === 'number') {
      (merged[key] as number) = num(value, fallback);
    } else if (typeof fallback === 'boolean') {
      (merged[key] as boolean) = bool(value, fallback);
    } else if (typeof value === 'string') {
      (merged[key] as string) = value;
    }
  }
  // Clamp the numeric ranges so an edited save cannot break the game.
  merged.masterVolume = clamp01(merged.masterVolume);
  merged.musicVolume = clamp01(merged.musicVolume);
  merged.sfxVolume = clamp01(merged.sfxVolume);
  merged.voiceVolume = clamp01(merged.voiceVolume);
  merged.screenEffects = clamp01(merged.screenEffects);
  merged.mouseSensitivity = clampRange(merged.mouseSensitivity, 0.2, 4);
  merged.touchSensitivity = clampRange(merged.touchSensitivity, 0.2, 4);
  merged.fov = clampRange(merged.fov, 55, 105);
  if (!['low', 'medium', 'high'].includes(merged.quality)) merged.quality = 'medium';
  if (!['he', 'en'].includes(merged.lang)) merged.lang = 'he';
  if (!['small', 'medium', 'large'].includes(merged.subtitleSize)) merged.subtitleSize = 'medium';
  if (!['normal', 'reduced'].includes(merged.scareIntensity)) merged.scareIntensity = 'normal';
  return merged;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function migrateMeta(raw: unknown): MetaProgress {
  const source = isRecord(raw) ? raw : {};
  return {
    endingsUnlocked: Array.isArray(source.endingsUnlocked)
      ? source.endingsUnlocked.filter((value): value is number => typeof value === 'number')
      : [],
    highestChapterReached: num(source.highestChapterReached, 0),
    completedOnce: bool(source.completedOnce, false),
    anomaliesEverSeen: strArray(source.anomaliesEverSeen),
    erased: bool(source.erased, false),
  };
}

function migrateRun(raw: unknown): RunState | null {
  if (!isRecord(raw)) return null;
  const seed = num(raw.seed, 0);
  if (seed === 0 && raw.chapter === undefined) return null;

  const behaviorSource = isRecord(raw.behavior) ? raw.behavior : {};
  const behavior = emptyBehaviorProfile();
  if (isRecord(behaviorSource.heat)) {
    for (const [key, value] of Object.entries(behaviorSource.heat)) {
      if (typeof value === 'number') behavior.heat[key] = value;
    }
  }
  if (isRecord(behaviorSource.doorUse)) {
    for (const [key, value] of Object.entries(behaviorSource.doorUse)) {
      if (typeof value === 'number') behavior.doorUse[key] = value;
    }
  }
  if (isRecord(behaviorSource.roomDwell)) {
    for (const [key, value] of Object.entries(behaviorSource.roomDwell)) {
      if (typeof value === 'number') behavior.roomDwell[key] = value;
    }
  }
  behavior.junctionBias = num(behaviorSource.junctionBias, 0);
  behavior.turnAfterFlicker = num(behaviorSource.turnAfterFlicker, 0.5);
  behavior.investigatesNoise = num(behaviorSource.investigatesNoise, 0.5);
  behavior.averageSpeed = num(behaviorSource.averageSpeed, 1.8);
  behavior.observations = num(behaviorSource.observations, 0);

  const flags: Record<string, boolean> = {};
  if (isRecord(raw.flags)) {
    for (const [key, value] of Object.entries(raw.flags)) if (typeof value === 'boolean') flags[key] = value;
  }
  const counters: Record<string, number> = {};
  if (isRecord(raw.counters)) {
    for (const [key, value] of Object.entries(raw.counters)) if (typeof value === 'number') counters[key] = value;
  }

  return {
    seed: seed || 1,
    rngState: num(raw.rngState, seed || 1),
    chapter: Math.max(0, Math.min(5, num(raw.chapter, 0))),
    visit: Math.max(0, num(raw.visit, 0)),
    checkpointId: typeof raw.checkpointId === 'string' ? raw.checkpointId : 'prologue',
    playTime: num(raw.playTime, 0),
    flags,
    counters,
    inventory: strArray(raw.inventory),
    solvedPuzzles: strArray(raw.solvedPuzzles),
    seenAnomalies: strArray(raw.seenAnomalies),
    notesRead: strArray(raw.notesRead),
    tapesPlayed: strArray(raw.tapesPlayed),
    behavior,
    lastTrack: isRecord(raw.lastTrack) ? (raw.lastTrack as unknown as RunState['lastTrack']) : null,
    olderTrack: isRecord(raw.olderTrack) ? (raw.olderTrack as unknown as RunState['olderTrack']) : null,
  };
}

/**
 * Accepts any historical shape and returns something the game can boot with, or
 * null when the payload is not a save at all.
 */
export function migrate(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  const version = num(raw.version, 1);

  const meta = migrateMeta(raw.meta);
  const settings = migrateSettings(raw.settings);
  let run = migrateRun(raw.run);

  // v1 stored a single flat "progress" object with no separate run.
  if (!run && isRecord(raw.progress)) {
    run = migrateRun(raw.progress);
  }
  // v2 tracks were stored unpacked; drop them rather than guess.
  if (run && version < 3 && run.lastTrack && !Array.isArray((run.lastTrack as { s?: unknown }).s)) {
    run.lastTrack = null;
    run.olderTrack = null;
  }

  return {
    version: SAVE_VERSION,
    updatedAt: num(raw.updatedAt, 0),
    run,
    meta,
    settings,
  };
}
