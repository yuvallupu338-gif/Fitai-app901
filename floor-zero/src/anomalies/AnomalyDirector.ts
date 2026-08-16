import type * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { EventBus } from '../core/EventBus';
import { RNG } from '../core/RNG';
import { ANOMALIES, AnomalyDef, isLookingAway } from './anomalyDefinitions';

export interface DirectorConfig {
  chapter: number;
  /** Minimum quiet seconds between anomalies. */
  minGap: number;
  /** How many may fire during this visit. */
  budget: number;
}

/**
 * Chooses what goes wrong and when. It leans on quiet: the gap between events
 * matters more than the events themselves, so the director will happily sit on
 * its hands for half a minute while tension climbs.
 */
export class AnomalyDirector {
  private config: DirectorConfig = { chapter: 0, minGap: 20, budget: 0 };
  private sinceLast = 0;
  private fired = 0;
  private cooldowns = new Map<string, number>();
  private recent: string[] = [];
  private rng: RNG;
  private pendingCheck = 0;

  constructor(
    private readonly bus: EventBus,
    seed = 1,
    /** Overridable so the scheduling rules can be tested without the world. */
    private readonly defs: readonly AnomalyDef[] = ANOMALIES,
  ) {
    this.rng = new RNG(seed);
  }

  configure(config: DirectorConfig, seed: number): void {
    this.config = config;
    this.sinceLast = Math.min(12, config.minGap * 0.5);
    this.fired = 0;
    this.rng = new RNG(seed);
    // Cooldowns persist across the visit so the same trick is not reused.
    for (const [id, value] of this.cooldowns) this.cooldowns.set(id, Math.max(0, value - 60));
  }

  /** Every definition this director can draw from — used by the smoke test. */
  get catalogue(): readonly AnomalyDef[] {
    return this.defs;
  }

  get quietTime(): number {
    return this.sinceLast;
  }

  get firedThisVisit(): number {
    return this.fired;
  }

  /** Force a specific anomaly (used by scripted beats and by tests). */
  force(id: string, ctx: GameContext): boolean {
    const def = this.defs.find((candidate) => candidate.id === id);
    if (!def) return false;
    this.trigger(def, ctx);
    return true;
  }

  update(delta: number, ctx: GameContext): void {
    this.sinceLast += delta;
    for (const [id, value] of this.cooldowns) {
      if (value > 0) this.cooldowns.set(id, Math.max(0, value - delta));
    }

    if (!ctx.state.isInteractive) return;
    if (this.fired >= this.config.budget) return;
    if (ctx.mimic.isChasing) return;

    // Tension shortens the wait, but never below two thirds of the minimum.
    const gap = this.config.minGap * (1 - ctx.tension.normalized * 0.33);
    if (this.sinceLast < gap) return;

    // Re-evaluate a few times a second rather than every frame.
    this.pendingCheck -= delta;
    if (this.pendingCheck > 0) return;
    this.pendingCheck = 0.4;

    // The longer the quiet has run past the gap, the likelier a trigger.
    const eagerness = Math.min(1, (this.sinceLast - gap) / 12);
    if (!this.rng.chance(0.08 + eagerness * 0.35)) return;

    const candidate = this.pick(ctx);
    if (!candidate) return;
    this.trigger(candidate, ctx);
  }

  private pick(ctx: GameContext): AnomalyDef | null {
    const chapter = ctx.state.run.chapter;
    const room = ctx.world.roomAt(ctx.camera.position.x, ctx.camera.position.z);

    const eligible: AnomalyDef[] = [];
    let totalWeight = 0;

    for (const def of this.defs) {
      if (def.minChapter > chapter) continue;
      if ((this.cooldowns.get(def.id) ?? 0) > 0) continue;
      if (this.recent.includes(def.id)) continue;
      if (def.rooms && def.rooms.length > 0 && !def.rooms.includes(room)) continue;
      if (def.canRun && !def.canRun(ctx)) continue;
      eligible.push(def);
      totalWeight += def.weight;
    }

    if (eligible.length === 0) return null;

    // Anomalies that must happen behind the player's back get one attempt; if
    // the player is staring right at the prop, we simply wait.
    let roll = this.rng.next() * totalWeight;
    for (const def of eligible) {
      roll -= def.weight;
      if (roll > 0) continue;
      if (def.unobserved) {
        const target = this.targetFor(def, ctx);
        if (target && !isLookingAway(ctx, target)) return null;
      }
      return def;
    }
    return eligible[eligible.length - 1];
  }

  private targetFor(def: AnomalyDef, ctx: GameContext): THREE.Object3D | null {
    switch (def.id) {
      case 'photo_change':
        return ctx.world.prop('family_photo') ?? null;
      case 'extra_door':
        return ctx.world.prop('alcove_seal') ?? null;
      case 'plate_change':
      case 'apartment_swap':
        return ctx.world.prop('plate_04') ?? null;
      case 'chair_move':
        return ctx.world.prop('corridor_chair') ?? null;
      case 'window_corridor':
        return ctx.world.prop('corridor_window') ?? null;
      case 'board_message':
      case 'board_remembers':
        return ctx.world.prop('corridor_board') ?? null;
      case 'item_returns':
        return ctx.interactions.get('fuse')?.hitbox ?? null;
      default:
        return null;
    }
  }

  private trigger(def: AnomalyDef, ctx: GameContext): void {
    this.sinceLast = 0;
    this.fired += 1;
    this.cooldowns.set(def.id, def.cooldown);
    this.recent.push(def.id);
    if (this.recent.length > 4) this.recent.shift();

    const routine = def.run(ctx);
    if (routine) ctx.sequencer.run(routine, `anomaly_${def.id}`);

    ctx.state.markAnomalySeen(def.id);
    ctx.tension.add(6);
    this.bus.emit('anomaly_triggered', { id: def.id, index: this.fired });

    // A short sting, but not on every anomaly — that is what makes the ones
    // that do have it land.
    if (this.rng.chance(0.3) && ctx.settings.scareIntensity === 'normal') {
      ctx.audio.play('sub_drop', { volume: 0.25 });
    }
  }
}
