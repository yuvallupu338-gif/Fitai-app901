import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { line } from '../data/dialogue';
import { Creature, CreatureKind } from './Creature';

/**
 * Owns the two creatures and decides when the floor is allowed to send one.
 *
 * They are held back hard. A monster that shows up whenever it likes is
 * wallpaper; one that arrives twice in a playthrough, unannounced, from behind,
 * is the thing the player remembers. The director enforces that: a long cooling
 * period, never during a chase or a cutscene, never while one is already out,
 * and never in the first chapters where the game is still teaching the rules.
 */
export class CreatureDirector {
  private creatures: Record<CreatureKind, Creature>;
  /** Seconds before another creature may be sent at all. */
  private cooldown = 0;
  private introduced = new Set<CreatureKind>();

  constructor(scene: THREE.Scene) {
    this.creatures = {
      crawler: new Creature('crawler', scene),
      tall: new Creature('tall', scene),
    };
  }

  get active(): Creature | null {
    for (const creature of Object.values(this.creatures)) {
      if (creature.isActive) return creature;
    }
    return null;
  }

  get anyVisible(): boolean {
    return Object.values(this.creatures).some((creature) => creature.isVisible);
  }

  /** Distance to the nearest active creature, or Infinity when the floor is clear. */
  distanceToPlayer(ctx: GameContext): number {
    let best = Infinity;
    for (const creature of Object.values(this.creatures)) {
      if (!creature.isActive) continue;
      best = Math.min(best, creature.distanceTo(ctx.camera.position));
    }
    return best;
  }

  /**
   * Called whenever the lift doors open on a rebuilt floor. The delay is the
   * grace period before anything may be sent — long enough that arriving is
   * never immediately punished.
   */
  reset(delay = 45): void {
    for (const creature of Object.values(this.creatures)) creature.banish();
    this.cooldown = delay;
  }

  clear(): void {
    for (const creature of Object.values(this.creatures)) creature.banish();
  }

  canSend(ctx: GameContext, kind: CreatureKind): boolean {
    if (this.cooldown > 0) return false;
    if (this.active) return false;
    if (ctx.mimic.isChasing) return false;
    if (!ctx.state.isInteractive) return false;
    if (ctx.world.levelId !== 'floor0') return false;
    // The crawler needs somewhere dark to come from; the tall one needs length.
    return kind === 'crawler' ? ctx.state.run.chapter >= 2 : ctx.state.run.chapter >= 3;
  }

  /**
   * Puts one on the floor behind the player, at the far end of whatever they are
   * standing in, and lets it start closing.
   */
  send(ctx: GameContext, kind: CreatureKind): boolean {
    if (!this.canSend(ctx, kind)) return false;
    const creature = this.creatures[kind];

    const behind = new THREE.Vector3(
      ctx.camera.position.x - ctx.player.forward.x * 13,
      0,
      ctx.camera.position.z - ctx.player.forward.z * 13,
    );
    const nav = ctx.world.nav.nearest(behind.x, behind.z);
    const spawn = nav ? new THREE.Vector3(nav.x, 0, nav.z) : behind;
    // Never drop one in the player's lap, and never inside a wall.
    if (Math.hypot(spawn.x - ctx.camera.position.x, spawn.z - ctx.camera.position.z) < 7) return false;
    if (ctx.world.collision?.overlaps(spawn.x, spawn.z, 0.35, 0.1, 1.4)) return false;

    creature.spawn(spawn, Math.atan2(ctx.camera.position.x - spawn.x, ctx.camera.position.z - spawn.z));
    this.cooldown = 150;

    // One line, the first time each is ever met, and never again.
    if (!this.introduced.has(kind)) {
      this.introduced.add(kind);
      ctx.say(line(kind === 'crawler' ? 'creature_crawler' : 'creature_tall'), 4);
    }
    ctx.tension.add(kind === 'crawler' ? 26 : 34);
    ctx.bus.emit('creature_spawned', { kind });
    return true;
  }

  /**
   * Put a creature at an exact spot, skipping the placement rules. Used by
   * scripted beats and by the photo tool, where "somewhere behind the player"
   * is not good enough. The cooldown is still armed, so this cannot be used to
   * stack one on top of a natural spawn.
   */
  place(kind: CreatureKind, at: THREE.Vector3, facing = 0): Creature {
    const creature = this.creatures[kind];
    creature.spawn(at, facing);
    this.cooldown = 150;
    return creature;
  }

  update(delta: number, ctx: GameContext): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - delta);

    for (const creature of Object.values(this.creatures)) {
      creature.update(delta, ctx);
      if (!creature.isActive) continue;
      // A creature left behind when the player takes the lift, or one that has
      // lost the player entirely, is quietly recalled.
      if (creature.distanceTo(ctx.camera.position) > 34 || !ctx.state.isInteractive) {
        creature.banish();
      }
    }
  }

  dispose(): void {
    for (const creature of Object.values(this.creatures)) creature.dispose();
  }
}
