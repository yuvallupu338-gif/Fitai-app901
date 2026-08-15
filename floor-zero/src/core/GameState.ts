import { RNG, makeSeed } from './RNG';
import {
  BehaviorProfile,
  MetaProgress,
  RunState,
  emptyBehaviorProfile,
  emptyMeta,
} from './types';

export type Phase =
  | 'boot'
  | 'menu'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'cutscene'
  | 'ending'
  | 'credits';

/**
 * Single source of truth for "where is the player in the story". Holds no
 * Three.js objects — the world is rebuilt from this, never the other way round.
 */
export class GameState {
  phase: Phase = 'boot';
  run: RunState;
  meta: MetaProgress;
  rng: RNG;
  /** Seconds since the current Floor 0 visit began. */
  visitTime = 0;
  objective = '';
  /** Set while a scripted sequence owns the camera. */
  cinematic = false;

  constructor(meta: MetaProgress = emptyMeta()) {
    this.meta = meta;
    this.run = GameState.newRun(makeSeed());
    this.rng = new RNG(this.run.seed);
  }

  static newRun(seed: number): RunState {
    return {
      seed,
      rngState: seed,
      chapter: 0,
      visit: 0,
      checkpointId: 'prologue',
      playTime: 0,
      flags: {},
      counters: {},
      inventory: [],
      solvedPuzzles: [],
      seenAnomalies: [],
      notesRead: [],
      tapesPlayed: [],
      behavior: emptyBehaviorProfile(),
      lastTrack: null,
      olderTrack: null,
    };
  }

  startNewRun(seed = makeSeed()): void {
    this.run = GameState.newRun(seed);
    this.rng = new RNG(seed);
    this.visitTime = 0;
  }

  adoptRun(run: RunState): void {
    this.run = run;
    this.rng = new RNG(run.seed);
    this.rng.state = run.rngState;
    this.visitTime = 0;
  }

  /** Called before every write to disk so the anomaly order survives a reload. */
  syncRngState(): void {
    this.run.rngState = this.rng.state;
  }

  flag(name: string): boolean {
    return this.run.flags[name] === true;
  }

  setFlag(name: string, value = true): void {
    this.run.flags[name] = value;
  }

  counter(name: string): number {
    return this.run.counters[name] ?? 0;
  }

  bump(name: string, by = 1): number {
    const next = this.counter(name) + by;
    this.run.counters[name] = next;
    return next;
  }

  hasItem(id: string): boolean {
    return this.run.inventory.includes(id);
  }

  addItem(id: string): void {
    if (!this.hasItem(id)) this.run.inventory.push(id);
  }

  removeItem(id: string): void {
    const index = this.run.inventory.indexOf(id);
    if (index >= 0) this.run.inventory.splice(index, 1);
  }

  isSolved(id: string): boolean {
    return this.run.solvedPuzzles.includes(id);
  }

  markSolved(id: string): void {
    if (!this.isSolved(id)) this.run.solvedPuzzles.push(id);
  }

  markAnomalySeen(id: string): void {
    if (!this.run.seenAnomalies.includes(id)) this.run.seenAnomalies.push(id);
    if (!this.meta.anomaliesEverSeen.includes(id)) this.meta.anomaliesEverSeen.push(id);
  }

  unlockEnding(ending: number): void {
    if (!this.meta.endingsUnlocked.includes(ending)) this.meta.endingsUnlocked.push(ending);
    this.meta.endingsUnlocked.sort();
    this.meta.completedOnce = true;
  }

  get behavior(): BehaviorProfile {
    return this.run.behavior;
  }

  get isInteractive(): boolean {
    return this.phase === 'playing' && !this.cinematic;
  }
}
