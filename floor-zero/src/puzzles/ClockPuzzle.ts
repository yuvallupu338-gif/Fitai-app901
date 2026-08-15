import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { line } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { Builder } from '../world/Builders';
import { clockFaceTexture } from '../world/Textures';

export interface ClockTime {
  hour: number;
  minute: number;
}

/** Every clock offers the same six times; the clues say which goes where. */
export const CLOCK_OPTIONS: ClockTime[] = [
  { hour: 0, minute: 17 },
  { hour: 3, minute: 17 },
  { hour: 5, minute: 30 },
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 23, minute: 47 },
];

/**
 * Solution, in clock order: the call (23:47), the number (03:17), the years
 * (08:00), and the moment nobody is allowed to touch (00:17).
 */
export const CLOCK_SOLUTION = [5, 1, 3, 0];

export interface ClockPlacement {
  id: string;
  position: [number, number, number];
  rotationY: number;
}

interface ClockInstance {
  id: string;
  index: number;
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  textures: Map<string, THREE.Texture>;
}

/**
 * Four wall clocks, all stopped at 00:17. Cycling each one through its six
 * candidate times and matching the notes releases the service door.
 */
export class ClockPuzzle {
  readonly id = 'puzzle_clocks';
  readonly interactables: Interactable[] = [];
  private clocks: ClockInstance[] = [];
  private solved = false;
  private idleTimer = 0;
  private hintStage = 0;
  private nearby = false;
  onSolved: ((ctx: GameContext) => void) | null = null;

  constructor(private readonly builder: Builder, placements: ClockPlacement[]) {
    placements.forEach((placement, order) => {
      const clock = this.buildClock(placement);
      this.clocks.push(clock);
      this.interactables.push(
        new SimpleInteractable(
          placement.id,
          'clock',
          clock.mesh,
          () => (this.solved ? null : t('prompt.turn')),
          (ctx) => this.advance(ctx, order),
          { maxDistance: 2.3, recordAs: 'use' },
        ),
      );
    });
  }

  private buildClock(placement: ClockPlacement): ClockInstance {
    const texture = this.builder.ownTexture(clockFaceTexture(0, 17));
    const mesh = this.builder.panel(texture, 0.3, 0.3, placement.position, placement.rotationY, {
      name: placement.id,
    });
    mesh.translateZ(0.035);
    this.builder.decor({
      material: 'darkMetal',
      center: placement.position,
      size:
        Math.abs(Math.sin(placement.rotationY)) > 0.5 ? [0.05, 0.34, 0.34] : [0.34, 0.34, 0.05],
    });
    // Small numbered plate under each clock so the clue order is unambiguous.
    return {
      id: placement.id,
      index: 0,
      mesh,
      material: mesh.material as THREE.MeshLambertMaterial,
      textures: new Map([['0:17', texture]]),
    };
  }

  private advance(ctx: GameContext, order: number): void {
    if (this.solved) return;
    const clock = this.clocks[order];
    clock.index = (clock.index + 1) % CLOCK_OPTIONS.length;
    this.render(clock);
    ctx.audio.play('clock_tick', { position: clock.mesh.position.clone(), volume: 0.9 });
    this.idleTimer = 0;
    this.check(ctx);
  }

  private render(clock: ClockInstance): void {
    const time = CLOCK_OPTIONS[clock.index];
    const key = `${time.hour}:${time.minute}`;
    let texture = clock.textures.get(key);
    if (!texture) {
      texture = this.builder.ownTexture(clockFaceTexture(time.hour, time.minute));
      clock.textures.set(key, texture);
    }
    clock.material.map = texture;
    clock.material.needsUpdate = true;
  }

  private check(ctx: GameContext): void {
    const correct = this.clocks.every((clock, index) => clock.index === CLOCK_SOLUTION[index]);
    if (!correct) return;
    this.solved = true;
    ctx.audio.play('clock_lock', { volume: 1 });
    ctx.say(line('c3_clock_ok'));
    ctx.state.markSolved(this.id);
    ctx.bus.emit('puzzle_solved', { id: this.id });
    this.onSolved?.(ctx);
  }

  get isSolved(): boolean {
    return this.solved;
  }

  /** Restores a solved state after loading a save. */
  forceSolved(): void {
    this.solved = true;
    this.clocks.forEach((clock, index) => {
      clock.index = CLOCK_SOLUTION[index];
      this.render(clock);
    });
  }

  update(delta: number, ctx: GameContext): void {
    if (this.solved || this.clocks.length === 0) return;
    const player = ctx.camera.position;
    const anchor = this.clocks[0].mesh.position;
    this.nearby = Math.hypot(player.x - anchor.x, player.z - anchor.z) < 9;
    if (!this.nearby) return;

    this.idleTimer += delta;
    const threshold = ctx.settings.extraHints ? 20 : 70;
    if (this.hintStage === 0 && this.idleTimer > threshold) {
      this.hintStage = 1;
      ctx.say(line('hint_clocks_1'), 6);
    } else if (this.hintStage === 1 && this.idleTimer > threshold * 2) {
      this.hintStage = 2;
      ctx.say(line('hint_clocks_2'), 7);
    }
  }
}
