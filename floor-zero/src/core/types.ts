/**
 * Shared plain-data types. Nothing here imports Three.js so that the recording,
 * replay and save systems stay unit-testable in a plain Node environment.
 */

export type MotionState = 0 | 1 | 2 | 3; // idle | walk | run | crouch

export interface RecordedSample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  motion: MotionState;
}

export type RecordedEventKind =
  | 'door_open'
  | 'door_close'
  | 'switch'
  | 'pickup'
  | 'drop'
  | 'use'
  | 'flashlight_on'
  | 'flashlight_off'
  | 'enter_room'
  | 'stop'
  | 'elevator_button';

export interface RecordedEvent {
  t: number;
  kind: RecordedEventKind;
  targetId: string;
}

export interface TrackData {
  version: number;
  visit: number;
  duration: number;
  samples: RecordedSample[];
  events: RecordedEvent[];
  rooms: string[];
}

/** Quantised, flattened form used for localStorage. */
export interface PackedTrack {
  v: number;
  visit: number;
  d: number;
  /** 7 numbers per sample: t, x, y, z, yaw, pitch, motion (all ×1000 except motion). */
  s: number[];
  e: Array<[number, RecordedEventKind, string]>;
  r: string[];
}

/**
 * Coarse statistics about how this particular player moves through the floor.
 * The mimic's highest behaviour tier reads from this to *predict* rather than
 * replay.
 */
export interface BehaviorProfile {
  /** Visit counts per 2m grid cell, keyed "gx,gz". */
  heat: Record<string, number>;
  /** How many times the player used each door / switch id. */
  doorUse: Record<string, number>;
  /** Seconds spent inside each named room. */
  roomDwell: Record<string, number>;
  /** Preference at corridor junctions: +1 east, -1 west (running average). */
  junctionBias: number;
  /** 0..1 — how often the player turns around after a light flickers. */
  turnAfterFlicker: number;
  /** 0..1 — how often the player walks toward an unexplained noise. */
  investigatesNoise: number;
  /** Average movement speed in m/s over the run. */
  averageSpeed: number;
  /** Number of samples that fed the averages. */
  observations: number;
}

export function emptyBehaviorProfile(): BehaviorProfile {
  return {
    heat: {},
    doorUse: {},
    roomDwell: {},
    junctionBias: 0,
    turnAfterFlicker: 0.5,
    investigatesNoise: 0.5,
    averageSpeed: 1.8,
    observations: 0,
  };
}

export type QualityLevel = 'low' | 'medium' | 'high';
export type Language = 'he' | 'en';

export interface Settings {
  lang: Language;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  mouseSensitivity: number;
  touchSensitivity: number;
  invertY: boolean;
  fov: number;
  quality: QualityLevel;
  shadows: boolean;
  screenEffects: number;
  headBob: boolean;
  subtitles: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  highContrast: boolean;
  reduceMotion: boolean;
  reduceFlashing: boolean;
  scareIntensity: 'normal' | 'reduced';
  sprintToggle: boolean;
  extraHints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'he',
  masterVolume: 0.85,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  voiceVolume: 1,
  mouseSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  fov: 74,
  quality: 'medium',
  shadows: true,
  screenEffects: 0.8,
  headBob: true,
  subtitles: true,
  subtitleSize: 'medium',
  highContrast: false,
  reduceMotion: false,
  reduceFlashing: false,
  scareIntensity: 'normal',
  sprintToggle: false,
  extraHints: false,
};

export interface RunState {
  seed: number;
  rngState: number;
  chapter: number;
  /** How many times the player has arrived on Floor 0. */
  visit: number;
  checkpointId: string;
  playTime: number;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  inventory: string[];
  solvedPuzzles: string[];
  seenAnomalies: string[];
  notesRead: string[];
  tapesPlayed: string[];
  behavior: BehaviorProfile;
  lastTrack: PackedTrack | null;
  /** Kept so the mimic can reach tier 3-4 with more than one visit of memory. */
  olderTrack: PackedTrack | null;
}

export interface MetaProgress {
  endingsUnlocked: number[];
  highestChapterReached: number;
  completedOnce: boolean;
  anomaliesEverSeen: string[];
  /** Set by ending 3 — the main menu title glitches once afterwards. */
  erased: boolean;
}

export interface SaveData {
  version: number;
  updatedAt: number;
  run: RunState | null;
  meta: MetaProgress;
  settings: Settings;
}

export const SAVE_VERSION = 3;

export function emptyMeta(): MetaProgress {
  return {
    endingsUnlocked: [],
    highestChapterReached: 0,
    completedOnce: false,
    anomaliesEverSeen: [],
    erased: false,
  };
}
