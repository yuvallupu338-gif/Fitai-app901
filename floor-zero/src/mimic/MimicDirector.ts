import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { clamp } from '../core/math';
import { BehaviorProfile } from '../core/types';
import type { MimicTier } from '../data/chapters';
import { MimicController } from './MimicController';
import { ReplayTrack } from './ReplayTrack';

const HEAT_CELL = 2;

export interface VisitPlan {
  tier: MimicTier;
  /** Seconds after the doors open before the mimic appears. */
  spawnDelay: number;
  track: ReplayTrack;
}

/**
 * Decides *what kind of thing* the mimic is on any given visit, learns how this
 * particular player moves, and at the top tier uses that model to be somewhere
 * before they get there.
 */
export class MimicDirector {
  readonly controller: MimicController;
  tier: MimicTier = 0;
  private spawnTimer = 0;
  private pending: VisitPlan | null = null;
  private deviationTimer = 14;
  private active = false;
  private finished = false;
  private chaseActive = false;
  private chaseSpeed = 2.4;
  private chaseRepath = 0;
  private observeTimer = 0;
  private lastPlayerCell = '';
  private roomTimer = 0;
  private currentRoom = '';
  private lastPlayerPosition = new THREE.Vector3();
  private flickerWatch = 0;
  private noiseWatch = 0;
  private noiseOrigin = new THREE.Vector3();
  private scriptedLook = 0;
  private lingerTimer = 0;

  constructor(scene: THREE.Scene) {
    this.controller = new MimicController(scene);
  }

  get isActive(): boolean {
    return this.active;
  }

  get isChasing(): boolean {
    return this.chaseActive;
  }

  get position(): THREE.Vector3 {
    return this.controller.position;
  }

  get visible(): boolean {
    return this.controller.isVisible;
  }

  distanceToPlayer(ctx: GameContext): number {
    if (!this.active && !this.chaseActive) return Infinity;
    return Math.hypot(
      ctx.camera.position.x - this.controller.position.x,
      ctx.camera.position.z - this.controller.position.z,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Visit lifecycle                                                   */
  /* ---------------------------------------------------------------- */

  planVisit(plan: VisitPlan): void {
    this.pending = plan;
    this.tier = plan.tier;
    this.spawnTimer = plan.spawnDelay;
    this.active = false;
    this.finished = false;
    this.chaseActive = false;
    this.deviationTimer = plan.tier >= 3 ? 9 : 15;
    this.controller.hide();
    this.controller.attention = 0;
    this.controller.speedScale = 1;
  }

  clearVisit(): void {
    this.pending = null;
    this.active = false;
    this.chaseActive = false;
    this.tier = 0;
    this.controller.hide();
  }

  /** Force the mimic to look straight at the player for a few seconds. */
  lookAtPlayer(seconds = 3): void {
    this.scriptedLook = seconds;
  }

  /* ---------------------------------------------------------------- */

  update(delta: number, ctx: GameContext): void {
    this.observe(delta, ctx);

    if (this.scriptedLook > 0) {
      this.scriptedLook = Math.max(0, this.scriptedLook - delta);
      this.controller.attention = Math.min(1, this.controller.attention + delta * 3);
    } else if (!this.chaseActive) {
      this.controller.attention = Math.max(
        this.tier >= 3 ? 0.25 : 0,
        this.controller.attention - delta * 0.6,
      );
    }

    if (this.pending && !this.active) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) this.spawn(ctx);
    }

    if (this.active && !this.chaseActive) {
      this.updateBehaviour(delta, ctx);
    }

    if (this.chaseActive) {
      this.updateChase(delta, ctx);
    }

    this.controller.update(delta, ctx);
  }

  private spawn(ctx: GameContext): void {
    const plan = this.pending;
    if (!plan) return;
    this.active = true;

    if (plan.track.isEmpty) {
      // Nothing recorded yet (a loaded save, or a skipped chapter): walk the
      // corridor from the lift instead of replaying nothing.
      const nav = ctx.world.nav;
      const start = nav.nearest(1.5, 0);
      const end = nav.nearest(22, 0);
      if (start && end) {
        const route = nav.path(start.id, end.id).map((node) => new THREE.Vector3(node.x, 0, node.z));
        this.controller.teleport(new THREE.Vector3(start.x, 0, start.z));
        this.controller.walkPath(route, 1.3);
      } else {
        this.controller.standStill();
      }
    } else {
      this.controller.beginReplay(plan.track, {
        onEvent: (targetId, kind) => this.onReplayEvent(ctx, targetId, kind),
        onFinished: () => this.onReplayFinished(ctx),
      });
    }

    ctx.bus.emit('mimic_spawned', { level: this.tier });
    ctx.audio.play('creak', { position: this.controller.position.clone(), volume: 0.5 });
  }

  private onReplayEvent(ctx: GameContext, targetId: string, kind: string): void {
    // Tier 2+ sometimes fumbles: it reaches for a door and misses.
    if (this.tier >= 2 && ctx.rng.chance(0.18)) {
      ctx.bus.emit('mimic_deviation', { kind: 'missed_interaction' });
      return;
    }
    const replayed = ctx.interactions.replay(targetId);
    if (replayed) {
      ctx.bus.emit('mimic_interaction', { targetId });
    }
    if (kind === 'switch' || kind === 'door_open') {
      ctx.audio.play('creak', { position: this.controller.position.clone(), volume: 0.35 });
    }
  }

  private onReplayFinished(ctx: GameContext): void {
    if (this.finished) return;
    this.finished = true;
    if (this.tier <= 1) {
      this.controller.hide();
      this.active = false;
      return;
    }
    // Tier 2+: it keeps going after the recording runs out.
    this.lingerTimer = 6 + ctx.rng.range(0, 6);
    const nav = ctx.world.nav;
    const target = this.tier >= 3 ? this.predictDestination(ctx) : nav.nearest(this.controller.position.x + 6, 0);
    if (target) {
      const route = nav
        .route(this.controller.position.x, this.controller.position.z, target.x, target.z)
        .map((point) => new THREE.Vector3(point.x, 0, point.z));
      this.controller.walkPath(route, 1.25);
    } else {
      this.controller.standStill();
    }
    ctx.bus.emit('mimic_deviation', { kind: 'past_end_of_track' });
  }

  private updateBehaviour(delta: number, ctx: GameContext): void {
    if (this.finished) {
      this.lingerTimer -= delta;
      if (this.lingerTimer <= 0) {
        this.controller.hide();
        this.active = false;
      }
      return;
    }

    if (this.tier <= 1) return;

    this.deviationTimer -= delta;
    if (this.deviationTimer > 0) return;
    this.deviationTimer = this.tier >= 3 ? ctx.rng.range(8, 15) : ctx.rng.range(12, 22);

    const distance = this.distanceToPlayer(ctx);
    const options: Array<() => void> = [];

    // Tier 2 — faulty copy.
    options.push(() => {
      this.controller.freeze(ctx.rng.range(2, 4.5));
      ctx.bus.emit('mimic_deviation', { kind: 'long_pause' });
    });
    options.push(() => {
      this.lookAtPlayer(ctx.rng.range(2, 4));
      ctx.bus.emit('mimic_deviation', { kind: 'head_turn' });
    });
    options.push(() => {
      this.controller.speedScale = ctx.rng.chance(0.5) ? 0.62 : 1.45;
      window.setTimeout(() => {
        this.controller.speedScale = 1;
      }, 4200);
      ctx.bus.emit('mimic_deviation', { kind: 'tempo_drift' });
    });

    if (this.tier >= 3) {
      // Learning — it starts using the player's own habits.
      options.push(() => {
        const favourite = this.favouriteDoor();
        const node = favourite ? ctx.world.nav.nearest(favourite.x, favourite.z) : null;
        if (!node) return;
        const route = ctx.world.nav
          .route(this.controller.position.x, this.controller.position.z, node.x, node.z)
          .map((point) => new THREE.Vector3(point.x, 0, point.z));
        this.controller.walkPath(route, 1.5);
        this.finished = true;
        this.lingerTimer = 14;
        ctx.bus.emit('mimic_deviation', { kind: 'uses_your_door' });
      });
      options.push(() => {
        if (distance < 6 || distance > 26) return;
        const behind = ctx.world.nav.nearest(
          this.controller.position.x + (ctx.rng.chance(0.5) ? 7 : -7),
          this.controller.position.z,
        );
        if (behind) this.controller.teleport(new THREE.Vector3(behind.x, 0, behind.z));
        ctx.bus.emit('mimic_deviation', { kind: 'relocated' });
        ctx.audio.play('glitch', { volume: 0.35 });
      });
      options.push(() => {
        const door = this.nearestReplayableDoor(ctx);
        if (!door) return;
        ctx.interactions.replay(door);
        ctx.bus.emit('mimic_deviation', { kind: 'opened_unrecorded_door' });
      });
    }

    if (this.tier >= 4) {
      // Predicting — it goes where the player is about to go and waits.
      options.push(() => {
        const target = this.predictDestination(ctx);
        if (!target) return;
        const route = ctx.world.nav
          .route(this.controller.position.x, this.controller.position.z, target.x, target.z)
          .map((point) => new THREE.Vector3(point.x, 0, point.z));
        this.controller.walkPath(route, 1.85);
        this.finished = true;
        this.lingerTimer = 20;
        this.controller.attention = 0.7;
        ctx.bus.emit('mimic_deviation', { kind: 'waits_ahead' });
      });
    }

    ctx.rng.pick(options)();
  }

  private nearestReplayableDoor(ctx: GameContext): string | null {
    let best: string | null = null;
    let bestDistance = 3.2;
    for (const interactable of ctx.interactions.all) {
      if (interactable.kind !== 'door' || !interactable.enabled) continue;
      const world = new THREE.Vector3();
      interactable.hitbox.getWorldPosition(world);
      const distance = Math.hypot(world.x - this.controller.position.x, world.z - this.controller.position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = interactable.id;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- */
  /* Chase                                                             */
  /* ---------------------------------------------------------------- */

  startChase(ctx: GameContext, from?: THREE.Vector3): void {
    this.chaseActive = true;
    this.active = true;
    this.finished = true;
    this.chaseSpeed = 2.15;
    this.controller.attention = 1;
    this.controller.show();
    this.controller.startChase();
    const origin =
      from ??
      new THREE.Vector3(
        ctx.camera.position.x - ctx.player.forward.x * 9,
        0,
        ctx.camera.position.z - ctx.player.forward.z * 9,
      );
    this.controller.teleport(origin);
    ctx.bus.emit('chase_started', {});
  }

  stopChase(): void {
    this.chaseActive = false;
    this.controller.hide();
    this.active = false;
  }

  private updateChase(delta: number, ctx: GameContext): void {
    // Ramps up, but never faster than a sprinting player who keeps moving.
    this.chaseSpeed = Math.min(3.35, this.chaseSpeed + delta * 0.16);
    this.controller.walkSpeedOverride = this.chaseSpeed;

    this.chaseRepath -= delta;
    if (this.chaseRepath <= 0) {
      this.chaseRepath = 0.35;
      const route = ctx.world.nav.route(
        this.controller.position.x,
        this.controller.position.z,
        ctx.camera.position.x,
        ctx.camera.position.z,
      );
      const next = route.length > 1 ? route[1] : route[0];
      this.controller.setChaseTarget(new THREE.Vector3(next.x, 0, next.z));
    }

    const distance = this.distanceToPlayer(ctx);
    if (distance < 1.15) {
      this.chaseActive = false;
      ctx.bus.emit('player_caught', { by: 'mimic' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Learning                                                          */
  /* ---------------------------------------------------------------- */

  private observe(delta: number, ctx: GameContext): void {
    if (!ctx.state.isInteractive) return;
    const profile = ctx.state.behavior;
    const position = ctx.camera.position;

    this.observeTimer += delta;
    this.roomTimer += delta;

    if (this.flickerWatch > 0) {
      this.flickerWatch -= delta;
      const turned = Math.abs(ctx.player.yawDelta) > 1.6;
      if (turned) {
        profile.turnAfterFlicker = clamp(profile.turnAfterFlicker * 0.85 + 0.15, 0, 1);
        this.flickerWatch = 0;
      } else if (this.flickerWatch <= 0) {
        profile.turnAfterFlicker = clamp(profile.turnAfterFlicker * 0.9, 0, 1);
      }
    }

    if (this.noiseWatch > 0) {
      this.noiseWatch -= delta;
      const before = this.lastPlayerPosition.distanceTo(this.noiseOrigin);
      const now = position.distanceTo(this.noiseOrigin);
      if (before - now > 1.6) {
        profile.investigatesNoise = clamp(profile.investigatesNoise * 0.85 + 0.15, 0, 1);
        this.noiseWatch = 0;
      } else if (this.noiseWatch <= 0) {
        profile.investigatesNoise = clamp(profile.investigatesNoise * 0.9, 0, 1);
      }
    }

    if (this.observeTimer < 0.5) return;
    const step = this.observeTimer;
    this.observeTimer = 0;

    const cell = `${Math.round(position.x / HEAT_CELL)},${Math.round(position.z / HEAT_CELL)}`;
    profile.heat[cell] = (profile.heat[cell] ?? 0) + 1;

    const room = ctx.world.roomAt(position.x, position.z);
    if (room !== this.currentRoom) {
      if (this.currentRoom) {
        profile.roomDwell[this.currentRoom] = (profile.roomDwell[this.currentRoom] ?? 0) + this.roomTimer;
      }
      this.currentRoom = room;
      this.roomTimer = 0;
    }

    const travelled = position.distanceTo(this.lastPlayerPosition);
    const speed = travelled / step;
    profile.observations += 1;
    profile.averageSpeed += (speed - profile.averageSpeed) / Math.min(200, profile.observations);

    if (cell !== this.lastPlayerCell) {
      const dx = position.x - this.lastPlayerPosition.x;
      profile.junctionBias = clamp(profile.junctionBias * 0.95 + Math.sign(dx) * 0.05, -1, 1);
      this.lastPlayerCell = cell;
    }

    this.lastPlayerPosition.copy(position);
  }

  /** Called by the anomaly director so the profile learns reaction habits. */
  noteFlicker(): void {
    this.flickerWatch = 3;
  }

  noteNoise(position: THREE.Vector3): void {
    this.noiseWatch = 6;
    this.noiseOrigin.copy(position);
  }

  noteDoorUse(id: string, profile: BehaviorProfile): void {
    profile.doorUse[id] = (profile.doorUse[id] ?? 0) + 1;
  }

  private favouriteDoor(): { x: number; z: number } | null {
    return this.favouriteDoorPosition;
  }

  /** Populated by the level manager whenever a door interaction is recorded. */
  favouriteDoorPosition: { x: number; z: number } | null = null;

  /**
   * Where is this player probably heading? Combines the heat map, the direction
   * they are facing, and how long they linger in each room. No neural network —
   * just a weighted score over the waypoints.
   */
  predictDestination(ctx: GameContext): { x: number; z: number } | null {
    const nav = ctx.world.nav;
    const profile = ctx.state.behavior;
    const position = ctx.camera.position;
    const forwardX = ctx.player.forward.x;
    const forwardZ = ctx.player.forward.z;

    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (const node of nav.all) {
      const dx = node.x - position.x;
      const dz = node.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 4 || distance > 26) continue;

      const alignment = (dx * forwardX + dz * forwardZ) / (distance || 1);
      const cell = `${Math.round(node.x / HEAT_CELL)},${Math.round(node.z / HEAT_CELL)}`;
      const heat = profile.heat[cell] ?? 0;
      const dwell = node.room ? profile.roomDwell[node.room] ?? 0 : 0;

      const score =
        alignment * 3.2 +
        Math.min(6, heat) * 0.55 +
        Math.min(20, dwell) * 0.12 +
        (profile.junctionBias * Math.sign(dx) > 0 ? 0.9 : 0) -
        distance * 0.06;

      if (score > bestScore) {
        bestScore = score;
        best = { x: node.x, z: node.z };
      }
    }
    return best;
  }

  dispose(): void {
    this.controller.dispose();
  }
}
