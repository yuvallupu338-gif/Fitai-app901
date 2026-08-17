import * as THREE from 'three';
import { angleDelta, clamp, damp, lerpAngle } from '../core/math';
import type { GameContext } from '../core/Context';
import { ReplayTrack } from './ReplayTrack';

export type MimicMode = 'hidden' | 'replay' | 'walk' | 'idle' | 'chase';

export interface MimicVisuals {
  root: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  arms: [THREE.Mesh, THREE.Mesh];
  legs: [THREE.Mesh, THREE.Mesh];
}

/**
 * Builds the figure out of simple boxes. It is deliberately not detailed: a
 * dark, slightly translucent silhouette reads better in a dim corridor than a
 * model would, and it never breaks the illusion by looking wrong up close.
 */
function buildFigure(): MimicVisuals {
  const root = new THREE.Group();
  root.name = 'mimic';

  const skin = new THREE.MeshLambertMaterial({
    color: 0x14171c,
    transparent: true,
    opacity: 0.82,
    emissive: 0x05070a,
  });
  const darker = new THREE.MeshLambertMaterial({
    color: 0x0b0d11,
    transparent: true,
    opacity: 0.86,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), skin);
  torso.position.y = 1.12;
  root.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), darker);
  hips.position.y = 0.78;
  root.add(hips);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.12), darker);
  neck.position.y = 1.47;
  root.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.52;
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.25, 0.2), skin);
  head.position.y = 0.11;
  headPivot.add(head);
  head.userData.pivot = headPivot;

  const arms: [THREE.Mesh, THREE.Mesh] = [null as never, null as never];
  const legs: [THREE.Mesh, THREE.Mesh] = [null as never, null as never];

  for (const side of [0, 1] as const) {
    const sign = side === 0 ? -1 : 1;

    const armPivot = new THREE.Group();
    armPivot.position.set(sign * 0.26, 1.38, 0);
    root.add(armPivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.12), darker);
    arm.position.y = -0.28;
    armPivot.add(arm);
    arm.userData.pivot = armPivot;
    arms[side] = arm;

    const legPivot = new THREE.Group();
    legPivot.position.set(sign * 0.11, 0.76, 0);
    root.add(legPivot);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.74, 0.15), darker);
    leg.position.y = -0.37;
    legPivot.add(leg);
    leg.userData.pivot = legPivot;
    legs[side] = leg;
  }

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });

  return { root, head, torso, arms, legs };
}

export interface ReplayHooks {
  /** Fired when the replay reaches a recorded interaction. */
  onEvent?: (targetId: string, kind: string) => void;
  onFinished?: () => void;
}

/**
 * Drives the mimic body: replays a track, walks a path, chases, and keeps
 * itself out of walls when the floor plan no longer matches the recording.
 */
export class MimicController {
  readonly visuals = buildFigure();
  mode: MimicMode = 'hidden';
  /** Extra time offset applied to the replay, used by the "learning" tiers. */
  speedScale = 1;
  /** 0..1 how strongly the head turns toward the player. */
  attention = 0;
  /** Seconds the mimic is frozen in place (tier 2 glitch). */
  private freezeTimer = 0;
  private track: ReplayTrack = ReplayTrack.empty();
  private playhead = 0;
  private lastPlayhead = 0;
  private hooks: ReplayHooks = {};
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private walkSpeed = 1.5;
  /** Set above zero to override the walking speed (used by the chase ramp). */
  walkSpeedOverride = 0;
  private stride = 0;
  private lastStepPhase = 0;
  private currentSpeed = 0;
  private readonly previousPosition = new THREE.Vector3();
  private chaseTarget: THREE.Vector3 | null = null;
  private fade = 0;
  private targetFade = 0;
  private materials: THREE.MeshLambertMaterial[] = [];
  private lookYaw = 0;
  /** Seconds left in the current silent glitch burst. */
  private glitchTimer = 0;
  private glitchStrength = 1;
  /** Time until the next snap inside a burst. */
  private glitchStep = 0;
  private glitchHidden = false;
  private readonly glitchAnchor = new THREE.Vector3();
  private glitchAnchorYaw = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.visuals.root);
    this.visuals.root.visible = false;
    this.visuals.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const material = mesh.material as THREE.MeshLambertMaterial;
        if (!this.materials.includes(material)) this.materials.push(material);
      }
    });
  }

  get position(): THREE.Vector3 {
    return this.visuals.root.position;
  }

  get yaw(): number {
    return this.visuals.root.rotation.y;
  }

  get isVisible(): boolean {
    return this.visuals.root.visible && this.fade > 0.05;
  }

  get trackDuration(): number {
    return this.track.duration;
  }

  get replayTime(): number {
    return this.playhead;
  }

  get replayFinished(): boolean {
    return this.mode === 'replay' && this.playhead >= this.track.duration;
  }

  setTrack(track: ReplayTrack): void {
    this.track = track;
  }

  get currentTrack(): ReplayTrack {
    return this.track;
  }

  hide(): void {
    this.mode = 'hidden';
    this.targetFade = 0;
    this.chaseTarget = null;
    if (this.glitchTimer > 0) this.endGlitch();
  }

  show(): void {
    this.targetFade = 1;
    this.visuals.root.visible = true;
  }

  /** Blink out and reappear somewhere else — the tier-3 "gone" beat. */
  teleport(position: THREE.Vector3, yaw = this.yaw): void {
    this.visuals.root.position.copy(position);
    this.visuals.root.rotation.y = yaw;
    this.previousPosition.copy(position);
    // Moving mid-burst rebases it, or the next snap would drag the figure back
    // to where it was standing before.
    this.glitchAnchor.copy(position);
    this.glitchAnchorYaw = yaw;
  }

  beginReplay(track: ReplayTrack, hooks: ReplayHooks = {}, startTime = 0): void {
    this.track = track;
    this.hooks = hooks;
    this.playhead = startTime;
    this.lastPlayhead = startTime;
    this.mode = 'replay';
    this.show();
    const pose = track.sampleAt(startTime);
    if (pose) this.teleport(new THREE.Vector3(pose.x, 0, pose.z), pose.yaw);
  }

  freeze(seconds: number): void {
    this.freezeTimer = Math.max(this.freezeTimer, seconds);
  }

  /**
   * A silent malfunction. The figure snaps between poses and positions a few
   * centimetres either side of where it was standing, strobes, and stretches —
   * and makes no sound at all. Nothing is said, nothing is played: the whole
   * effect is that the thing standing there stops looking like a person for a
   * fraction of a second, and then does again.
   *
   * It always returns to the pose it started from, so a figure that is standing
   * guard is still standing in the same place afterwards.
   */
  glitch(seconds = 0.6, strength = 1): void {
    if (this.glitchTimer <= 0) {
      this.glitchAnchor.copy(this.visuals.root.position);
      this.glitchAnchorYaw = this.visuals.root.rotation.y;
    }
    this.glitchTimer = Math.max(this.glitchTimer, seconds);
    this.glitchStrength = strength;
    this.glitchStep = 0;
  }

  get isGlitching(): boolean {
    return this.glitchTimer > 0;
  }

  /** Snap back to the anchor pose and clear any distortion. */
  private endGlitch(): void {
    this.glitchTimer = 0;
    this.visuals.root.position.copy(this.glitchAnchor);
    this.visuals.root.rotation.y = this.glitchAnchorYaw;
    this.visuals.root.scale.set(1, 1, 1);
    this.visuals.root.rotation.z = 0;
    for (const side of [0, 1] as const) {
      (this.visuals.arms[side].userData.pivot as THREE.Group).rotation.z = 0;
      (this.visuals.legs[side].userData.pivot as THREE.Group).rotation.z = 0;
    }
    (this.visuals.head.userData.pivot as THREE.Group).rotation.z = 0;
  }

  /**
   * One frame of the burst. Runs after the normal animation so it overrides it,
   * and re-rolls the distortion a few times a second rather than every frame —
   * a per-frame jitter reads as noise, a stepped one reads as a broken machine.
   */
  private applyGlitch(delta: number): void {
    this.glitchTimer -= delta;
    if (this.glitchTimer <= 0) {
      this.endGlitch();
      return;
    }

    // The dropout has to be re-asserted every frame: the fade pass at the top of
    // update() turns the materials back on, so a flag set once would blink for a
    // single frame and be invisible at 60fps.
    if (this.glitchHidden) {
      for (const material of this.materials) material.visible = false;
    }

    this.glitchStep -= delta;
    if (this.glitchStep > 0) return;
    this.glitchStep = 0.045 + Math.random() * 0.05;

    const s = this.glitchStrength;
    const root = this.visuals.root;
    // Snap sideways, never far: it has not moved, it has *failed to be still*.
    root.position.set(
      this.glitchAnchor.x + (Math.random() - 0.5) * 0.16 * s,
      this.glitchAnchor.y,
      this.glitchAnchor.z + (Math.random() - 0.5) * 0.16 * s,
    );
    root.rotation.y = this.glitchAnchorYaw + (Math.random() - 0.5) * 0.5 * s;
    root.rotation.z = (Math.random() - 0.5) * 0.09 * s;
    root.scale.set(1 + (Math.random() - 0.5) * 0.1 * s, 1 + (Math.random() - 0.5) * 0.22 * s, 1);

    for (const side of [0, 1] as const) {
      const arm = this.visuals.arms[side].userData.pivot as THREE.Group;
      const leg = this.visuals.legs[side].userData.pivot as THREE.Group;
      arm.rotation.x = (Math.random() - 0.5) * 1.9 * s;
      arm.rotation.z = (Math.random() - 0.5) * 0.8 * s;
      leg.rotation.x = (Math.random() - 0.5) * 0.5 * s;
    }
    const headPivot = this.visuals.head.userData.pivot as THREE.Group;
    headPivot.rotation.y = (Math.random() - 0.5) * 2.6 * s;
    headPivot.rotation.z = (Math.random() - 0.5) * 0.7 * s;

    // Dropped frames. The figure is simply not there for one step.
    this.glitchHidden = Math.random() < 0.22 * s;
    for (const material of this.materials) material.visible = !this.glitchHidden && this.fade > 0.02;
  }

  walkPath(points: THREE.Vector3[], speed = 1.5): void {
    this.path = points.slice();
    this.pathIndex = 0;
    this.walkSpeed = speed;
    this.mode = 'walk';
    this.show();
  }

  standStill(): void {
    this.mode = 'idle';
    this.show();
  }

  startChase(): void {
    this.mode = 'chase';
    this.show();
  }

  setChaseTarget(target: THREE.Vector3 | null): void {
    this.chaseTarget = target;
  }

  get pathComplete(): boolean {
    return this.mode === 'walk' && this.pathIndex >= this.path.length;
  }

  distanceTo(point: THREE.Vector3): number {
    return Math.hypot(point.x - this.position.x, point.z - this.position.z);
  }

  update(delta: number, ctx: GameContext): void {
    this.fade = damp(this.fade, this.targetFade, 6, delta);
    const opacity = clamp(this.fade, 0, 1);
    for (const material of this.materials) {
      material.opacity = opacity * 0.86;
      material.visible = opacity > 0.02;
    }
    this.visuals.root.visible = opacity > 0.02;
    if (this.mode === 'hidden' && opacity <= 0.02) return;

    this.previousPosition.copy(this.visuals.root.position);

    if (this.freezeTimer > 0) {
      this.freezeTimer = Math.max(0, this.freezeTimer - delta);
    } else {
      switch (this.mode) {
        case 'replay':
          this.updateReplay(delta, ctx);
          break;
        case 'walk':
          this.updateWalk(delta, ctx);
          break;
        case 'chase':
          this.updateChase(delta, ctx);
          break;
        default:
          break;
      }
    }

    const moved = Math.hypot(
      this.visuals.root.position.x - this.previousPosition.x,
      this.visuals.root.position.z - this.previousPosition.z,
    );
    // A glitch snap is not walking; letting it feed the stride would set the
    // legs marching on the spot, which is the opposite of the effect.
    this.currentSpeed = delta > 0 && this.glitchTimer <= 0 ? moved / delta : 0;
    this.animate(delta, ctx);
    if (this.glitchTimer > 0) this.applyGlitch(delta);
  }

  private updateReplay(delta: number, ctx: GameContext): void {
    this.lastPlayhead = this.playhead;
    this.playhead += delta * this.speedScale;

    const pose = this.track.sampleAt(this.playhead);
    if (pose) {
      this.moveTo(pose.x, pose.z, ctx);
      this.visuals.root.rotation.y = lerpAngle(this.visuals.root.rotation.y, pose.yaw, clamp(delta * 12, 0, 1));
    }

    for (const event of this.track.eventsBetween(this.lastPlayhead, this.playhead)) {
      if (event.kind === 'enter_room') continue;
      this.hooks.onEvent?.(event.targetId, event.kind);
    }

    if (this.playhead >= this.track.duration) {
      this.hooks.onFinished?.();
    }
  }

  private updateWalk(delta: number, ctx: GameContext): void {
    if (this.pathIndex >= this.path.length) return;
    const target = this.path[this.pathIndex];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.22) {
      this.pathIndex++;
      return;
    }
    const step = Math.min(distance, this.walkSpeed * delta);
    this.moveTo(this.position.x + (dx / distance) * step, this.position.z + (dz / distance) * step, ctx);
    const wanted = Math.atan2(dx, dz);
    this.visuals.root.rotation.y = lerpAngle(this.visuals.root.rotation.y, wanted, clamp(delta * 7, 0, 1));
  }

  private updateChase(delta: number, ctx: GameContext): void {
    const target = this.chaseTarget;
    if (!target) return;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return;
    const speed = this.walkSpeedOverride > 0 ? this.walkSpeedOverride : this.walkSpeed;
    const step = Math.min(distance, speed * delta);
    let nx = this.position.x + (dx / distance) * step;
    let nz = this.position.z + (dz / distance) * step;

    // Very light obstacle avoidance: if the direct step is blocked, try sliding
    // along each axis before giving up for this frame.
    const collision = ctx.world.collision;
    if (collision && collision.overlaps(nx, nz, 0.3, 0.1, 1.7)) {
      if (!collision.overlaps(this.position.x, nz, 0.3, 0.1, 1.7)) nx = this.position.x;
      else if (!collision.overlaps(nx, this.position.z, 0.3, 0.1, 1.7)) nz = this.position.z;
      else return;
    }
    this.visuals.root.position.set(nx, 0, nz);
    const wanted = Math.atan2(dx, dz);
    this.visuals.root.rotation.y = lerpAngle(this.visuals.root.rotation.y, wanted, clamp(delta * 9, 0, 1));
  }

  /**
   * Move to a replayed position, but refuse to enter geometry. When the floor
   * plan changed since the recording, the mimic slides against the new walls
   * instead of walking through them.
   */
  private moveTo(x: number, z: number, ctx: GameContext): void {
    const collision = ctx.world.collision;
    if (!collision) {
      this.visuals.root.position.set(x, 0, z);
      return;
    }
    if (!collision.overlaps(x, z, 0.28, 0.1, 1.7)) {
      this.visuals.root.position.set(x, 0, z);
      return;
    }
    const point = { x: this.position.x, z: this.position.z };
    collision.moveAndSlide(point, x - point.x, z - point.z, 0.28, 0.1, 1.7);
    this.visuals.root.position.set(point.x, 0, point.z);
  }

  /**
   * One footfall, from wherever it is actually standing.
   *
   * The tapes have been promising this since chapter 1 — "I hear footsteps
   * repeating my route" — and the figure walked in total silence. Hearing your
   * own route played back behind you is the whole premise made audible, so the
   * steps use the surface it is really crossing and are pitched down a fraction:
   * close enough to yours to be recognised, wrong enough to be noticed.
   */
  private footstep(ctx: GameContext): void {
    const surface = ctx.world.surfaceAt(this.position.x, this.position.z);
    const id =
      surface === 'wood'
        ? 'step_wood'
        : surface === 'carpet'
          ? 'step_carpet'
          : surface === 'metal'
            ? 'step_metal'
            : 'step_terrazzo';
    ctx.audio.play(id, {
      position: new THREE.Vector3(this.position.x, 0.1, this.position.z),
      volume: this.mode === 'chase' ? 0.75 : 0.5,
      rate: 0.93,
    });
  }

  private animate(delta: number, ctx: GameContext): void {
    const speed = this.currentSpeed;
    this.stride += delta * (2.6 + speed * 2.6);
    const amount = clamp(speed / 1.6, 0, 1.4);

    // A footfall on every half stride, but only when it is really covering
    // ground: a frozen or glitching figure reports zero speed and stays silent.
    const phase = Math.floor(this.stride / Math.PI);
    if (speed > 0.35 && this.fade > 0.15) {
      if (phase !== this.lastStepPhase) this.footstep(ctx);
    }
    this.lastStepPhase = phase;

    const swing = Math.sin(this.stride) * 0.55 * amount;
    (this.visuals.legs[0].userData.pivot as THREE.Group).rotation.x = swing;
    (this.visuals.legs[1].userData.pivot as THREE.Group).rotation.x = -swing;
    (this.visuals.arms[0].userData.pivot as THREE.Group).rotation.x = -swing * 0.7;
    (this.visuals.arms[1].userData.pivot as THREE.Group).rotation.x = swing * 0.7;
    this.visuals.torso.position.y = 1.12 + Math.abs(Math.sin(this.stride)) * 0.018 * amount;

    // The head turning toward the player is the whole point of tier 2+.
    const headPivot = this.visuals.head.userData.pivot as THREE.Group;
    const toPlayer = Math.atan2(
      ctx.camera.position.x - this.position.x,
      ctx.camera.position.z - this.position.z,
    );
    const wanted = angleDelta(this.visuals.root.rotation.y, toPlayer) * this.attention;
    this.lookYaw = damp(this.lookYaw, clamp(wanted, -2.4, 2.4), 5, delta);
    headPivot.rotation.y = this.lookYaw;
  }

  dispose(): void {
    this.visuals.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
    this.visuals.root.removeFromParent();
  }
}
