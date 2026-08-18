import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Routine } from '../core/Sequencer';
import { line } from '../data/dialogue';
import { t } from '../data/localization';
import { Interactable, SimpleInteractable } from '../interactions/Interactable';
import { Builder } from '../world/Builders';
import { toySequenceTexture } from '../world/Textures';
import type { SoundId } from '../audio/AudioManager';

const TOY_SOUNDS: SoundId[] = ['toy_0', 'toy_1', 'toy_2', 'toy_3'];
const TOY_COLORS = [0xc05a3c, 0x3c6ec0, 0x4b9a4b, 0xc0a03c];

export interface ToyPlacement {
  x: number;
  z: number;
}

type Phase = 'idle' | 'mimic' | 'player' | 'retry' | 'solved';

/**
 * Six tones. The mimic plays the first three from the corridor doorway, then
 * stops and waits; the player has to finish the other three.
 *
 * A wrong press or a missed window does not throw the player back to the
 * beginning — the mimic simply plays the three they owe again and reopens the
 * window. The tension comes from who is standing in the doorway, not from
 * re-watching a cutscene.
 */
export class ToySoundPuzzle {
  readonly id = 'puzzle_toys';
  readonly interactables: Interactable[] = [];
  readonly sequence: number[];
  /** Seconds the player gets to answer, per attempt. */
  readonly windowDuration = 22;
  private toys: THREE.Mesh[] = [];
  private glows: THREE.Mesh[] = [];
  private phase: Phase = 'idle';
  private playerStep = 0;
  private windowTimer = 0;
  private hintTimer = 0;
  private hintShown = false;
  private started = false;
  private attempts = 0;
  onSolved: ((ctx: GameContext) => void) | null = null;
  /** Where the mimic should stand while it plays its half. */
  readonly mimicSpot = new THREE.Vector3();

  constructor(
    private readonly builder: Builder,
    placements: ToyPlacement[],
    sequence: number[],
    drawingPosition: [number, number, number],
    drawingRotation: number,
  ) {
    this.sequence = sequence;

    placements.forEach((placement, index) => {
      const { mesh, glow } = this.buildToy(placement, index);
      this.toys.push(mesh);
      this.glows.push(glow);
      this.interactables.push(
        new SimpleInteractable(
          `toy_${index}`,
          'toy',
          mesh,
          () => (this.phase === 'solved' ? null : t('prompt.press')),
          (ctx) => this.press(ctx, index),
          { maxDistance: 2.3, recordAs: 'use' },
        ),
      );
    });

    builder.panel(
      builder.ownTexture(toySequenceTexture(sequence)),
      0.62,
      0.42,
      drawingPosition,
      drawingRotation,
      { name: 'toy_sequence_drawing' },
    );

    this.mimicSpot.set(
      placements.reduce((sum, p) => sum + p.x, 0) / Math.max(1, placements.length),
      0,
      placements.reduce((sum, p) => sum + p.z, 0) / Math.max(1, placements.length) - 1.6,
    );
  }

  private buildToy(placement: ToyPlacement, index: number): { mesh: THREE.Mesh; glow: THREE.Mesh } {
    const material = this.builder.own(new THREE.MeshLambertMaterial({ color: TOY_COLORS[index % 4] }));
    let geometry: THREE.BufferGeometry;
    switch (index % 4) {
      case 0:
        geometry = new THREE.SphereGeometry(0.14, 14, 10);
        break;
      case 1:
        geometry = new THREE.BoxGeometry(0.24, 0.24, 0.24);
        break;
      case 2:
        geometry = new THREE.ConeGeometry(0.16, 0.3, 12);
        break;
      default:
        geometry = new THREE.TorusGeometry(0.13, 0.05, 8, 16);
        break;
    }
    this.builder.trackGeometry(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(placement.x, 0.16, placement.z);
    mesh.castShadow = true;
    mesh.name = `toy_${index}`;
    mesh.userData.interactableId = `toy_${index}`;
    this.builder.addObject(mesh);

    const glowGeometry = new THREE.SphereGeometry(0.22, 10, 8);
    this.builder.trackGeometry(glowGeometry);
    const glowMaterial = this.builder.own(
      new THREE.MeshBasicMaterial({
        color: TOY_COLORS[index % 4],
        transparent: true,
        opacity: 0,
      }),
    );
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(mesh.position);
    this.builder.addObject(glow);

    return { mesh, glow };
  }

  private flash(index: number): void {
    const material = this.glows[index].material as THREE.MeshBasicMaterial;
    material.opacity = 0.55;
  }

  ping(ctx: GameContext, index: number): void {
    this.flash(index);
    ctx.audio.play(TOY_SOUNDS[index % 4], {
      position: this.toys[index].position.clone(),
      volume: 0.9,
    });
  }

  /** The full run: the mimic's half, then the player's window. */
  *run(ctx: GameContext): Routine {
    this.started = true;
    this.phase = 'mimic';
    this.playerStep = 0;
    ctx.say(line('c4_toys_start'), 3);

    ctx.mimic.controller.show();
    ctx.mimic.controller.standStill();
    ctx.mimic.controller.teleport(this.mimicSpot.clone());
    ctx.mimic.lookAtPlayer(9);
    yield 1.2;

    for (let i = 0; i < 3; i++) {
      const toy = this.sequence[i];
      ctx.mimic.controller.teleport(
        new THREE.Vector3(this.toys[toy].position.x, 0, this.toys[toy].position.z - 0.7),
      );
      yield 0.35;
      this.ping(ctx, toy);
      yield 0.75;
    }

    ctx.mimic.controller.teleport(this.mimicSpot.clone());
    this.openWindow(ctx);
    ctx.audio.play('glitch', { volume: 0.3 });
  }

  /** Hands the sequence back to the player with a fresh timer. */
  private openWindow(ctx: GameContext): void {
    this.phase = 'player';
    this.playerStep = 0;
    this.windowTimer = this.windowDuration;
    ctx.say(line('c4_toys_your_turn'), 2.5);
  }

  private press(ctx: GameContext, index: number): void {
    if (this.phase === 'solved') return;

    if (this.phase === 'idle') {
      // Any toy starts the sequence.
      this.ping(ctx, index);
      ctx.sequencer.run(this.run(ctx), 'toy_puzzle');
      return;
    }

    if (this.phase !== 'player') {
      // While the mimic is playing, a press is just a noise.
      this.ping(ctx, index);
      return;
    }

    this.ping(ctx, index);
    const expected = this.sequence[3 + this.playerStep];
    if (index !== expected) {
      this.fail(ctx, 'wrong');
      return;
    }

    this.playerStep += 1;
    // A rising confirmation so progress through the three is audible.
    ctx.audio.play('button', { volume: 0.3, rate: 1 + this.playerStep * 0.18 });
    if (this.playerStep >= 3) {
      this.solve(ctx);
    }
  }

  private fail(ctx: GameContext, reason: 'wrong' | 'timeout'): void {
    this.attempts += 1;
    this.phase = 'retry';
    this.playerStep = 0;
    this.windowTimer = 0;
    ctx.audio.play('sub_drop', { volume: 0.4 });
    ctx.say(line(reason === 'wrong' ? 'c4_toys_fail' : 'c4_toys_slow'), 2.6);
    ctx.tension.add(4);
    // Two misses is enough evidence that the drawing has not been read.
    if (this.attempts >= 2 && !this.hintShown) {
      this.hintShown = true;
      ctx.say(line('hint_toys'), 6);
    }
    ctx.sequencer.run(this.retry(ctx), 'toy_retry');
  }

  /**
   * The mimic replays only the three the player owes, slowly, and hands the
   * window straight back. Its half of the sequence is never repeated.
   */
  private *retry(ctx: GameContext): Routine {
    yield 1.2;
    if (this.phase !== 'retry') return;
    ctx.mimic.controller.show();
    ctx.mimic.controller.standStill();
    ctx.mimic.controller.teleport(this.mimicSpot.clone());
    for (let i = 3; i < 6; i++) {
      this.ping(ctx, this.sequence[i]);
      yield 0.9;
    }
    yield 0.5;
    if (this.phase !== 'retry') return;
    this.openWindow(ctx);
  }

  private solve(ctx: GameContext): void {
    this.phase = 'solved';
    ctx.audio.play('clock_lock', { volume: 1 });
    ctx.say(line('c4_toys_solved'), 3);
    ctx.state.markSolved(this.id);
    ctx.bus.emit('puzzle_solved', { id: this.id });
    ctx.mimic.controller.hide();
    this.onSolved?.(ctx);
  }

  get isSolved(): boolean {
    return this.phase === 'solved';
  }

  /** Which half of the sequence is running right now. */
  get stage(): Phase {
    return this.phase;
  }

  forceSolved(): void {
    this.phase = 'solved';
  }

  update(delta: number, ctx: GameContext): void {
    for (const glow of this.glows) {
      const material = glow.material as THREE.MeshBasicMaterial;
      if (material.opacity > 0) material.opacity = Math.max(0, material.opacity - delta * 1.6);
    }

    for (const toy of this.toys) toy.rotation.y += delta * 0.4;

    if (this.phase === 'player') {
      this.windowTimer -= delta;
      if (this.windowTimer <= 0) this.fail(ctx, 'timeout');
    }

    if (!this.started && !this.hintShown && this.toys.length) {
      const anchor = this.toys[0].position;
      if (Math.hypot(ctx.camera.position.x - anchor.x, ctx.camera.position.z - anchor.z) < 6) {
        this.hintTimer += delta;
        const threshold = ctx.settings.extraHints ? 8 : 24;
        if (this.hintTimer > threshold) {
          this.hintShown = true;
          ctx.say(line('hint_toys'), 6);
        }
      }
    }
  }
}
