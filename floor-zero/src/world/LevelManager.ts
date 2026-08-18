import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { GameState } from '../core/GameState';
import { QualityLevel } from '../core/types';
import { buildFloorZero, buildLobby } from './BuildingGenerator';
import { CollisionWorld, updateTriggers } from './Collision';
import type { DoorSystem } from './DoorController';
import { ElevatorController } from './ElevatorController';
import { LevelBuild, LevelId, RoomBounds, SurfaceKind } from './LevelTypes';
import { LightingManager } from './LightingManager';
import { MaterialLibrary } from './Materials';
import { NavGraph } from './Nav';
import type { SecurityFeed } from './Screens';

/**
 * Owns whichever level is currently in the scene, and rebuilds Floor 0 from
 * scratch every time the lift doors close. Everything the level created is
 * disposed on the way out so that a long play session does not leak geometry.
 */
export class LevelManager {
  readonly lighting: LightingManager;
  readonly elevator = new ElevatorController();
  materials: MaterialLibrary;
  private build: LevelBuild | null = null;
  private emptyNav = new NavGraph();
  private currentRoom = '';
  private quality: QualityLevel = 'medium';
  private lastLoad: { id: LevelId; variant: number; chapter: number } | null = null;
  private environment: THREE.Texture | null = null;

  constructor(private readonly scene: THREE.Scene, quality: QualityLevel = 'medium') {
    this.quality = quality;
    this.materials = new MaterialLibrary(quality);
    this.lighting = new LightingManager(scene);
    this.lighting.setQuality(quality);
    this.lighting.setEmissiveBoost(this.materials.emissiveBoost);
  }

  /** The pre-filtered probe used for ambient specular on every PBR surface. */
  setEnvironment(environment: THREE.Texture | null): void {
    this.environment = environment;
    this.scene.environment = environment;
  }

  get current(): LevelBuild | null {
    return this.build;
  }

  get collision(): CollisionWorld | null {
    return this.build?.builder.collision ?? null;
  }

  get nav(): NavGraph {
    return this.build?.nav ?? this.emptyNav;
  }

  get doors(): DoorSystem | null {
    return this.build?.doors ?? null;
  }

  get safePoint(): { x: number; z: number } {
    return this.build?.safePoint ?? { x: 0, z: 0 };
  }

  get levelId(): LevelId | null {
    return this.build?.id ?? null;
  }

  get variant(): number {
    return this.build?.variant ?? 0;
  }

  /**
   * Returns true when the caller must reload the level: the material library is
   * rebuilt when the tier crosses the physical/cheap boundary, and the existing
   * meshes still point at the old materials.
   */
  setQuality(quality: QualityLevel, shadows: boolean): boolean {
    const previous = this.quality;
    this.quality = quality;
    this.lighting.setQuality(quality);
    this.lighting.setShadows(shadows);
    this.lighting.setEmissiveBoost(this.materials.emissiveBoost);

    const wasPhysical = previous !== 'low';
    const isPhysical = quality !== 'low';
    const detailChanged = wasPhysical && isPhysical && previous !== quality;
    if (wasPhysical === isPhysical && !detailChanged) return false;

    const rebuilt = new MaterialLibrary(quality);
    const stale = this.materials;
    this.unload();
    this.materials = rebuilt;
    stale.dispose();
    this.scene.environment = this.environment;
    this.lighting.setEmissiveBoost(this.materials.emissiveBoost);
    return true;
  }

  /** Parameters of the level currently loaded, for rebuilding it in place. */
  get reloadParams(): { id: LevelId; variant: number; chapter: number } | null {
    return this.lastLoad;
  }

  /** Tears down the current level, builds the new one and wires it up. */
  load(id: LevelId, options: { variant: number; chapter: number; state: GameState }): LevelBuild {
    this.unload();

    const next =
      id === 'lobby'
        ? buildLobby({ materials: this.materials, state: options.state, variant: options.variant })
        : buildFloorZero({
            materials: this.materials,
            state: options.state,
            variant: options.variant,
            chapter: options.chapter,
          });

    this.build = next;
    this.lastLoad = { id, variant: options.variant, chapter: options.chapter };
    this.scene.add(next.builder.group);

    this.lighting.clearFixtures();
    for (const fixture of next.fixtures) this.lighting.addFixture(fixture);

    if (next.elevator) this.elevator.attach(next.elevator);
    else this.elevator.detach();

    this.currentRoom = '';
    return next;
  }

  unload(): void {
    if (!this.build) return;
    for (const screen of this.build.screens) screen.dispose();
    this.build.builder.group.removeFromParent();
    this.build.builder.dispose();
    this.build.doors.clear();
    this.elevator.detach();
    this.lighting.clearFixtures();
    this.build = null;
  }

  roomAt(x: number, z: number): string {
    if (!this.build) return '';
    for (const room of this.build.rooms) {
      if (x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ) return room.id;
    }
    return '';
  }

  roomBounds(id: string): RoomBounds | undefined {
    return this.build?.rooms.find((room) => room.id === id);
  }

  surfaceAt(x: number, z: number): SurfaceKind {
    if (!this.build) return 'terrazzo';
    // Inside the lift car the floor is rubber over steel.
    const rig = this.build.elevator;
    if (rig && Math.hypot(x - rig.interior.x, z - rig.interior.z) < 1.1) return 'metal';
    const room = this.build.rooms.find(
      (candidate) => x >= candidate.minX && x <= candidate.maxX && z >= candidate.minZ && z <= candidate.maxZ,
    );
    return room?.surface ?? 'terrazzo';
  }

  isEnclosed(x: number, z: number): boolean {
    const id = this.roomAt(x, z);
    return this.build?.rooms.find((room) => room.id === id)?.enclosed ?? false;
  }

  ambienceAt(x: number, z: number): RoomBounds['ambience'] {
    const id = this.roomAt(x, z);
    return this.build?.rooms.find((room) => room.id === id)?.ambience ?? 'corridor';
  }

  isOutOfBounds(x: number, z: number): boolean {
    if (!this.build) return false;
    const b = this.build.bounds;
    return x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ;
  }

  prop(name: string): THREE.Object3D | undefined {
    return this.build?.props.get(name);
  }

  get feeds(): SecurityFeed[] {
    return this.build?.feeds ?? [];
  }

  update(delta: number, ctx: GameContext): void {
    if (!this.build) return;
    this.build.doors.update(delta);
    this.elevator.update(delta);
    this.build.update?.(delta, ctx);
    updateTriggers(this.build.triggers, ctx.camera.position.x, ctx.camera.position.z);

    const room = this.roomAt(ctx.camera.position.x, ctx.camera.position.z);
    if (room && room !== this.currentRoom) {
      this.currentRoom = room;
      ctx.recorder.enterRoom(room);
    }

    this.lighting.update(delta, ctx.camera.position, ctx.settings.reduceFlashing);
  }

  get room(): string {
    return this.currentRoom;
  }

  dispose(): void {
    this.unload();
    this.lighting.dispose();
    this.materials.dispose();
  }
}
