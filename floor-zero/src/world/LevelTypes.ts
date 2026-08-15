import type * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Interactable } from '../interactions/Interactable';
import type { Builder } from './Builders';
import type { TriggerVolume } from './Collision';
import type { DoorSystem } from './DoorController';
import type { ElevatorRig } from './ElevatorController';
import type { FixtureConfig } from './LightingManager';
import type { NavGraph } from './Nav';
import type { ScreenSurface } from './Textures';
import type { SecurityFeed } from './Screens';
import type { ClockPuzzle } from '../puzzles/ClockPuzzle';
import type { ToySoundPuzzle } from '../puzzles/ToySoundPuzzle';
import type { ReplayDoorPuzzle } from '../puzzles/ReplayDoorPuzzle';

export interface LevelPuzzles {
  clocks: ClockPuzzle | null;
  toys: ToySoundPuzzle | null;
  shutter: ReplayDoorPuzzle | null;
}
import type { Ambience } from '../audio/TensionAudioSystem';

export type SurfaceKind = 'terrazzo' | 'wood' | 'carpet' | 'metal';
export type LevelId = 'lobby' | 'floor0';

export interface RoomBounds {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  surface: SurfaceKind;
  /** Small closed spaces raise tension faster. */
  enclosed: boolean;
  ambience: Ambience;
}

export interface LevelBuild {
  id: LevelId;
  variant: number;
  builder: Builder;
  doors: DoorSystem;
  interactables: Interactable[];
  triggers: TriggerVolume[];
  nav: NavGraph;
  rooms: RoomBounds[];
  props: Map<string, THREE.Object3D>;
  screens: ScreenSurface[];
  feeds: SecurityFeed[];
  puzzles: LevelPuzzles;
  fixtures: FixtureConfig[];
  elevator: ElevatorRig | null;
  spawn: { x: number; z: number; yaw: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  safePoint: { x: number; z: number };
  update?: (delta: number, ctx: GameContext) => void;
}

export function emptyBuildShell(id: LevelId, variant: number, builder: Builder, doors: DoorSystem): LevelBuild {
  return {
    id,
    variant,
    builder,
    doors,
    interactables: [],
    triggers: [],
    nav: null as unknown as NavGraph,
    rooms: [],
    props: new Map(),
    screens: [],
    feeds: [],
    puzzles: { clocks: null, toys: null, shutter: null },
    fixtures: [],
    elevator: null,
    spawn: { x: 0, z: 0, yaw: 0 },
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    safePoint: { x: 0, z: 0 },
  };
}
