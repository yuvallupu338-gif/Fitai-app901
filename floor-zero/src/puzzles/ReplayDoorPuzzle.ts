import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { line } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { Builder } from '../world/Builders';
import { Door, DoorSystem } from '../world/DoorController';

export interface ShutterConfig {
  /** Corridor x where the shutter sits. */
  x: number;
  minZ: number;
  maxZ: number;
  height: number;
  switchPosition: [number, number, number];
  switchRotation: number;
}

/**
 * The chapter 2 puzzle. A security shutter closes far too quickly for one
 * person: the switch is inside apartment 01 and the shutter is ten metres away
 * down the corridor.
 *
 * The solution is not a trick of level design — it is the recording. The player
 * trips the switch on one visit; on the next visit the mimic replays that exact
 * interaction, the recorded `switch` event reaches this class through the same
 * `activate` path the player used, and the shutter really opens while the
 * player is standing at it.
 */
export class ReplayDoorPuzzle {
  readonly id = 'puzzle_shutter';
  readonly interactables: Interactable[] = [];
  readonly door: Door;
  private closeTimer = 0;
  private openedBy: 'player' | 'mimic' | null = null;
  private solved = false;
  private hintTimer = 0;
  private hintShown = false;
  private readonly shutterMesh: THREE.Mesh;
  /** Seconds the shutter stays open — deliberately not enough to run it. */
  readonly openDuration = 2.4;

  constructor(builder: Builder, doors: DoorSystem, private readonly config: ShutterConfig) {
    const width = Math.abs(config.maxZ - config.minZ);
    const centerZ = (config.minZ + config.maxZ) / 2;

    const pivot = new THREE.Group();
    pivot.position.set(config.x, 0, centerZ);
    builder.addObject(pivot);

    this.shutterMesh = builder.box({
      id: 'shutter_leaf',
      material: 'doorMetal',
      center: [0, 0, 0],
      size: [0.12, config.height, width],
      collide: false,
      tile: 1,
      castShadow: true,
    });
    this.shutterMesh.removeFromParent();
    this.shutterMesh.position.set(0, config.height / 2, 0);
    pivot.add(this.shutterMesh);

    // Guide rails so it reads as a roller shutter rather than a floating slab.
    for (const side of [-1, 1] as const) {
      builder.decor({
        material: 'darkMetal',
        center: [config.x, config.height / 2, centerZ + side * (width / 2 + 0.06)],
        size: [0.2, config.height + 0.4, 0.12],
      });
    }
    builder.decor({
      material: 'darkMetal',
      center: [config.x, config.height + 0.16, centerZ],
      size: [0.26, 0.32, width + 0.24],
    });

    builder.addCollider({
      id: 'shutter_col',
      minX: config.x - 0.12,
      maxX: config.x + 0.12,
      minY: 0,
      maxY: config.height,
      minZ: config.minZ,
      maxZ: config.maxZ,
      solid: true,
    });

    this.door = doors.add(
      new Door({
        id: 'shutter',
        type: 'slide',
        pivot,
        colliderId: 'shutter_col',
        collision: builder.collision,
        travel: config.height + 0.1,
        speed: 1.35,
        slideAxis: 'y',
        closedPosition: pivot.position.clone(),
      }),
    );

    const switchPlate = builder.box({
      id: 'shutter_switch_plate',
      material: 'metal',
      center: config.switchPosition,
      size:
        Math.abs(Math.sin(config.switchRotation)) > 0.5
          ? [0.06, 0.22, 0.16]
          : [0.16, 0.22, 0.06],
      collide: false,
    });

    const leverGeometry = new THREE.BoxGeometry(0.05, 0.14, 0.05);
    builder.trackGeometry(leverGeometry);
    const leverMaterial = builder.own(new THREE.MeshLambertMaterial({ color: 0xb43c30 }));
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.position.set(...config.switchPosition);
    lever.rotation.y = config.switchRotation;
    lever.translateZ(0.08);
    builder.addObject(lever);

    this.interactables.push(
      new SimpleInteractable(
        'shutter_switch',
        'switch',
        switchPlate,
        () => (this.solved ? null : t('prompt.press')),
        (ctx) => this.trip(ctx, 'player', lever),
        { maxDistance: 2.4, recordAs: 'switch' },
      ),
    );

    // The mimic goes through the very same object, but we can tell them apart.
    const item = this.interactables[0] as SimpleInteractable;
    (item as unknown as { replay: (ctx: GameContext) => void }).replay = (ctx: GameContext) => {
      this.trip(ctx, 'mimic', lever);
    };
  }

  private trip(ctx: GameContext, by: 'player' | 'mimic', lever: THREE.Mesh): void {
    if (this.solved) return;
    lever.rotation.x = 0.6;
    window.setTimeout(() => {
      lever.rotation.x = 0;
    }, 900);

    this.openedBy = by;
    this.closeTimer = this.openDuration;
    this.door.setOpen(true);
    ctx.audio.play('shutter_open', {
      position: new THREE.Vector3(this.config.x, 1.2, 0),
      volume: 0.95,
    });
    ctx.audio.play('switch', { volume: 0.8 });

    if (by === 'mimic') {
      ctx.say(line('c2_shutter_open'), 2.6);
      ctx.tension.add(9);
    }
  }

  get isSolved(): boolean {
    return this.solved;
  }

  forceSolved(): void {
    this.solved = true;
    this.door.locked = false;
    this.door.forceState(true);
  }

  update(delta: number, ctx: GameContext): void {
    if (this.solved) return;

    if (this.closeTimer > 0) {
      this.closeTimer -= delta;
      if (this.closeTimer <= 0) {
        this.door.setOpen(false);
        ctx.audio.play('shutter_close', {
          position: new THREE.Vector3(this.config.x, 1.2, 0),
          volume: 0.9,
        });
      }
    }

    // Solved the moment the player is on the far side while it was the mimic
    // that opened it.
    if (this.openedBy && ctx.camera.position.x > this.config.x + 0.6) {
      this.solved = true;
      this.door.forceState(true);
      ctx.state.markSolved(this.id);
      ctx.bus.emit('puzzle_solved', { id: this.id });
      ctx.tension.add(-12);
      return;
    }

    // Nudge the player once if they keep trying to sprint it alone.
    if (!this.hintShown && ctx.state.run.chapter === 2 && ctx.state.run.visit >= 3) {
      this.hintTimer += delta;
      const threshold = ctx.settings.extraHints ? 25 : 80;
      if (this.hintTimer > threshold) {
        this.hintShown = true;
        ctx.say(line('hint_shutter'), 6);
      }
    }
  }
}
