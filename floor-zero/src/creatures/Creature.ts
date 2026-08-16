import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { clamp, damp, lerpAngle } from '../core/math';

export type CreatureKind = 'crawler' | 'tall';

export interface CreatureBody {
  root: THREE.Group;
  /** Everything that fades, so the whole thing can dissolve at once. */
  materials: THREE.Material[];
  /** Pivots the update loop animates, by name. */
  limbs: THREE.Group[];
  head: THREE.Object3D;
}

/**
 * Bodies are built from boxes for the same reason the mimic is: at these light
 * levels a silhouette that moves wrongly is far more frightening than a model,
 * and a silhouette cannot look cheap up close. What separates the two creatures
 * is proportion and gait, not detail.
 */
function buildCrawler(): CreatureBody {
  const root = new THREE.Group();
  root.name = 'crawler';

  const hide = new THREE.MeshLambertMaterial({
    color: 0x1b1410,
    emissive: 0x090604,
    transparent: true,
    opacity: 0.94,
  });
  const limbSkin = new THREE.MeshLambertMaterial({
    color: 0x120d0a,
    transparent: true,
    opacity: 0.96,
  });

  // Low, long body — it is the height of a dog and the length of a person.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.92), hide);
  spine.position.y = 0.52;
  root.add(spine);

  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.3), hide);
  shoulder.position.set(0, 0.56, -0.4);
  root.add(shoulder);

  const neck = new THREE.Group();
  neck.position.set(0, 0.54, -0.6);
  root.add(neck);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.3), hide);
  skull.position.z = -0.14;
  neck.add(skull);
  // No eyes, no mouth: a wedge with nothing on it.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.22), limbSkin);
  jaw.position.set(0, -0.09, -0.18);
  neck.add(jaw);

  const limbs: THREE.Group[] = [];
  // Four limbs, each far too long for the body, folded above the spine.
  for (let index = 0; index < 4; index++) {
    const front = index < 2;
    const sign = index % 2 === 0 ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(sign * 0.2, 0.58, front ? -0.34 : 0.36);
    root.add(hip);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.62, 0.085), limbSkin);
    upper.position.y = -0.31;
    hip.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -0.62;
    hip.add(knee);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 0.07), limbSkin);
    lower.position.y = -0.28;
    knee.add(lower);

    hip.rotation.x = front ? 0.5 : -0.5;
    knee.rotation.x = front ? -1.1 : 1.1;
    limbs.push(hip, knee);
  }

  return { root, materials: [hide, limbSkin], limbs, head: neck };
}

function buildTall(): CreatureBody {
  const root = new THREE.Group();
  root.name = 'tall_one';

  // Its whole rule is "keep your eyes on it", so it has to be findable in an
  // unlit stretch of corridor. The body stays near-black, but the head is pale
  // and faintly self-lit: what the player picks out of the dark is a face at
  // the wrong height, and then the shape under it.
  const cloth = new THREE.MeshLambertMaterial({
    color: 0x15181f,
    emissive: 0x05070a,
    transparent: true,
    opacity: 0.95,
  });
  const pale = new THREE.MeshLambertMaterial({
    color: 0x9a978c,
    emissive: 0x24231f,
    transparent: true,
    opacity: 0.95,
  });

  // Two and a half metres, and almost no width: it has to duck for doorways.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.02, 0.19), cloth);
  torso.position.y = 1.62;
  root.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.18), cloth);
  hips.position.y = 1.06;
  root.add(hips);

  const neck = new THREE.Group();
  neck.position.y = 2.14;
  root.add(neck);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), pale);
  skull.position.y = 0.14;
  neck.add(skull);

  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 2.02, 0);
    root.add(shoulder);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.16, 0.09), cloth);
    arm.position.y = -0.58;
    shoulder.add(arm);
    limbs.push(shoulder);

    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 1.02, 0);
    root.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.02, 0.11), cloth);
    leg.position.y = -0.51;
    hip.add(leg);
    limbs.push(hip);
  }

  return { root, materials: [cloth, pale], limbs, head: neck };
}

export type CreatureState = 'hidden' | 'lurking' | 'advancing' | 'frozen' | 'fleeing';

/**
 * One creature, with the behaviour that makes it worth being afraid of.
 *
 * Both species run on the same rule, inverted:
 *
 *  - the **crawler** advances while you are not looking, and light stops it;
 *  - the **tall one** advances while you are not looking, and nothing stops it
 *    except looking.
 *
 * Neither ever moves in front of you, which is what makes the corridor behind
 * you the dangerous part of the room.
 */
export class Creature {
  readonly body: CreatureBody;
  state: CreatureState = 'hidden';
  /** Metres per second while advancing. */
  speed: number;
  /** How close it has to get to end the run. */
  readonly catchRange: number;
  private fade = 0;
  private targetFade = 0;
  private stride = 0;
  private stateTimer = 0;
  private noiseTimer = 0;
  private readonly baseOpacity: number[];

  constructor(readonly kind: CreatureKind, scene: THREE.Scene) {
    this.body = kind === 'crawler' ? buildCrawler() : buildTall();
    this.speed = kind === 'crawler' ? 1.75 : 2.6;
    this.catchRange = kind === 'crawler' ? 1.0 : 1.15;
    this.baseOpacity = this.body.materials.map(
      (material) => (material as THREE.MeshLambertMaterial).opacity,
    );
    this.body.root.visible = false;
    this.body.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });
    scene.add(this.body.root);
  }

  get position(): THREE.Vector3 {
    return this.body.root.position;
  }

  get isVisible(): boolean {
    return this.body.root.visible && this.fade > 0.05;
  }

  get isActive(): boolean {
    return this.state !== 'hidden';
  }

  distanceTo(point: THREE.Vector3): number {
    return Math.hypot(point.x - this.position.x, point.z - this.position.z);
  }

  spawn(at: THREE.Vector3, facing: number): void {
    this.body.root.position.copy(at);
    this.body.root.rotation.y = facing;
    this.body.root.visible = true;
    this.state = 'lurking';
    this.stateTimer = 0;
    this.targetFade = 1;
  }

  banish(): void {
    this.state = 'hidden';
    this.targetFade = 0;
  }

  /** True when the player's view frustum plausibly contains it, with a clear line. */
  private isWatched(ctx: GameContext): boolean {
    const toCreature = new THREE.Vector3(
      this.position.x - ctx.camera.position.x,
      0,
      this.position.z - ctx.camera.position.z,
    );
    const distance = toCreature.length();
    if (distance < 0.001) return true;
    toCreature.divideScalar(distance);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    // Roughly the horizontal half-angle of the camera, a little tighter so the
    // very edge of the screen does not count as watching.
    if (forward.dot(toCreature) < 0.52) return false;
    const collision = ctx.world.collision;
    if (!collision) return true;
    return collision.hasLineOfSight(
      ctx.camera.position.x,
      ctx.camera.position.z,
      this.position.x,
      this.position.z,
      1.2,
    );
  }

  update(delta: number, ctx: GameContext): void {
    this.fade = damp(this.fade, this.targetFade, 3.4, delta);
    const alpha = clamp(this.fade, 0, 1);
    this.body.materials.forEach((material, index) => {
      const lambert = material as THREE.MeshLambertMaterial;
      lambert.opacity = alpha * this.baseOpacity[index];
      lambert.visible = alpha > 0.02;
    });
    this.body.root.visible = alpha > 0.02;
    if (this.state === 'hidden') {
      if (alpha <= 0.02) this.body.root.visible = false;
      return;
    }

    this.stateTimer += delta;
    const watched = this.isWatched(ctx);
    const distance = this.distanceTo(ctx.camera.position);

    if (this.kind === 'crawler') this.updateCrawler(delta, ctx, watched, distance);
    else this.updateTall(delta, ctx, watched, distance);

    this.animate(delta, ctx);
  }

  /**
   * Is the player's torch actually on this thing? The ceiling tubes are the
   * only thing `brightnessAt` knows about, and the crawler turns up precisely
   * when they have been knocked out — so without this its one weakness would be
   * unusable exactly when it matters, and unlearnable, because in a dark
   * corridor the player can never see what the light would have done.
   */
  private isTorchLit(ctx: GameContext): boolean {
    if (!ctx.player.flashlightOn) return false;
    const dx = this.position.x - ctx.camera.position.x;
    const dz = this.position.z - ctx.camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 15) return false;
    if (distance < 0.001) return true;
    const forward = ctx.player.forward;
    // The torch cone is PI/7 wide; cos of that is a shade over 0.9.
    return (forward.x * dx + forward.z * dz) / distance > 0.9;
  }

  /**
   * The crawler is a light puzzle. It closes while unseen, holds still the
   * moment it is looked at, and breaks off entirely if it is caught in the
   * light — so the answer is to face it and put the torch on it.
   */
  private updateCrawler(delta: number, ctx: GameContext, watched: boolean, distance: number): void {
    const brightness = ctx.world.lighting.brightnessAt(this.position);
    const lit = brightness > 0.34 || this.isTorchLit(ctx);

    if (this.state === 'fleeing') {
      this.step(ctx, delta, -1, this.speed * 1.5);
      if (this.distanceTo(ctx.camera.position) > 17 || this.stateTimer > 6) this.banish();
      return;
    }

    if (watched && lit) {
      // Caught in the open under a working tube: it gives up on this attempt.
      // The fleeing branch above already returned, so this is always the first
      // frame of the retreat.
      this.setState('fleeing');
      this.shriek(ctx, 0.75);
      return;
    }

    if (watched) {
      // Seen, but in the dark: it simply stops being a thing that moves.
      this.setState('frozen');
      return;
    }

    this.setState('advancing');
    this.step(ctx, delta, 1, this.speed);
    this.skitter(ctx, delta);

    if (distance < this.catchRange) {
      this.banish();
      ctx.bus.emit('player_caught', { by: 'crawler' });
    }
  }

  /**
   * The tall one does not obey light and does not flee. It advances in complete
   * silence whenever it is not being looked at, and stands motionless when it
   * is — so the only defence is to keep your eyes on it and back away, which
   * means walking blind.
   */
  private updateTall(delta: number, ctx: GameContext, watched: boolean, distance: number): void {
    if (watched) {
      this.setState('frozen');
      // It faces you, and it does not blink either.
      const wanted = Math.atan2(
        ctx.camera.position.x - this.position.x,
        ctx.camera.position.z - this.position.z,
      );
      this.body.root.rotation.y = lerpAngle(this.body.root.rotation.y, wanted, clamp(delta * 2.4, 0, 1));
      return;
    }

    this.setState('advancing');
    this.step(ctx, delta, 1, this.speed);

    if (distance < this.catchRange) {
      this.banish();
      ctx.bus.emit('player_caught', { by: 'tall' });
    }
  }

  private setState(next: CreatureState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateTimer = 0;
  }

  /** Move toward (+1) or away from (-1) the player, sliding along walls. */
  private step(ctx: GameContext, delta: number, direction: 1 | -1, speed: number): void {
    const dx = (ctx.camera.position.x - this.position.x) * direction;
    const dz = (ctx.camera.position.z - this.position.z) * direction;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return;

    const travel = speed * delta;
    const point = { x: this.position.x, z: this.position.z };
    const collision = ctx.world.collision;
    const radius = this.kind === 'crawler' ? 0.3 : 0.26;
    if (collision) {
      collision.moveAndSlide(point, (dx / distance) * travel, (dz / distance) * travel, radius, 0.1, 1.4);
    } else {
      point.x += (dx / distance) * travel;
      point.z += (dz / distance) * travel;
    }
    this.body.root.position.set(point.x, 0, point.z);

    const wanted = Math.atan2(dx * direction, dz * direction);
    this.body.root.rotation.y = lerpAngle(this.body.root.rotation.y, wanted, clamp(delta * 6, 0, 1));
  }

  private skitter(ctx: GameContext, delta: number): void {
    this.noiseTimer -= delta;
    if (this.noiseTimer > 0) return;
    this.noiseTimer = 0.34 + Math.random() * 0.3;
    ctx.audio.play('crawl', { position: this.position.clone(), volume: 0.55 });
  }

  private shriek(ctx: GameContext, volume: number): void {
    ctx.audio.play('shriek', { position: this.position.clone(), volume });
  }

  private animate(delta: number, ctx: GameContext): void {
    void ctx;
    const moving = this.state === 'advancing' || this.state === 'fleeing';
    this.stride += delta * (moving ? 7.5 : 0.9);

    if (this.kind === 'crawler') {
      // Diagonal gait: limbs 0/3 together, 1/2 together, and the spine rolls.
      for (let index = 0; index < 4; index++) {
        const hip = this.body.limbs[index * 2];
        const knee = this.body.limbs[index * 2 + 1];
        const phase = this.stride + (index === 0 || index === 3 ? 0 : Math.PI);
        const swing = Math.sin(phase) * (moving ? 0.62 : 0.05);
        const front = index < 2;
        hip.rotation.x = (front ? 0.5 : -0.5) + swing;
        knee.rotation.x = (front ? -1.1 : 1.1) - Math.abs(swing) * 0.5;
      }
      this.body.root.rotation.z = Math.sin(this.stride) * (moving ? 0.06 : 0.012);
      this.body.head.rotation.x = Math.sin(this.stride * 0.5) * 0.08;
      return;
    }

    // The tall one barely swings; it covers ground without seeming to walk.
    const swing = Math.sin(this.stride) * (moving ? 0.34 : 0.02);
    this.body.limbs[0].rotation.x = -swing * 0.35;
    this.body.limbs[1].rotation.x = swing;
    this.body.limbs[2].rotation.x = swing * 0.35;
    this.body.limbs[3].rotation.x = -swing;
    this.body.head.rotation.z = Math.sin(this.stride * 0.31) * 0.05;
  }

  dispose(): void {
    this.body.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const material of this.body.materials) material.dispose();
    this.body.root.removeFromParent();
  }
}
