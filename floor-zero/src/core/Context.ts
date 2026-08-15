import type * as THREE from 'three';
import type { EventBus } from './EventBus';
import type { GameState } from './GameState';
import type { RNG } from './RNG';
import type { Settings } from './types';
import type { AudioManager } from '../audio/AudioManager';
import type { TensionSystem } from '../audio/TensionAudioSystem';
import type { UIManager } from '../ui/UIManager';
import type { SaveManager } from '../save/SaveManager';
import type { LevelManager } from '../world/LevelManager';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerRecorder } from '../player/PlayerRecorder';
import type { MimicDirector } from '../mimic/MimicDirector';
import type { AnomalyDirector } from '../anomalies/AnomalyDirector';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { PostFX } from '../fx/PostFX';
import type { InputManager } from '../input/InputManager';
import type { Sequencer } from './Sequencer';

/**
 * The shared service locator. `Game` implements it, and every subsystem takes
 * it as an argument rather than importing its siblings.
 */
export interface GameContext {
  readonly bus: EventBus;
  readonly state: GameState;
  readonly settings: Settings;
  readonly audio: AudioManager;
  readonly tension: TensionSystem;
  readonly ui: UIManager;
  readonly save: SaveManager;
  readonly world: LevelManager;
  readonly player: PlayerController;
  readonly recorder: PlayerRecorder;
  readonly mimic: MimicDirector;
  readonly anomalies: AnomalyDirector;
  readonly interactions: InteractionSystem;
  readonly postfx: PostFX;
  readonly input: InputManager;
  readonly sequencer: Sequencer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rng: RNG;
  /** Seconds since the game started running. */
  readonly time: number;

  /** Show a subtitle line. */
  say(text: string, duration?: number): void;
  /** Set the active objective from an OBJECTIVES key. */
  setObjective(key: string): void;
  /** Persist a checkpoint. */
  checkpoint(label: string): void;
  /** Advance to the next chapter (does not rebuild the level by itself). */
  completeChapter(): void;
  /** Ride the lift: closes doors, rebuilds Floor 0, reopens. */
  travelToFloorZero(): void;
  /** Leave the level and run an ending sequence. */
  playEnding(ending: 1 | 2 | 3): void;
  /** Respawn the player at the last checkpoint after being caught. */
  respawnAtCheckpoint(reason: string): void;
}
