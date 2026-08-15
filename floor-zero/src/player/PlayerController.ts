import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { damp } from '../core/math';
import { MotionState } from '../core/types';
import { PlayerCamera } from './PlayerCamera';

const RADIUS = 0.3;
const EYE_STANDING = 1.68;
const EYE_CROUCHING = 1.06;
const HEIGHT_STANDING = 1.75;
const HEIGHT_CROUCHING = 1.15;
const WALK_SPEED = 2.15;
const RUN_SPEED = 3.55;
const CROUCH_SPEED = 1.1;
const ACCELERATION = 12;

/**
 * First person movement: capsule against axis-aligned geometry, footsteps that
 * know what they are standing on, a torch, and a safety net that puts the
 * player back on solid ground if the world ever changes underneath them.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly view: PlayerCamera;
  readonly flashlight: THREE.SpotLight;
  private velocityX = 0;
  private velocityZ = 0;
  private eye = EYE_STANDING;
  private stepDistance = 0;
  private sprintLatched = false;
  private lastSurface = 'terrazzo';
  frozen = false;
  crouching = false;
  flashlightOn = false;
  idleTime = 0;
  speed = 0;
  motion: MotionState = 0;
  private readonly forwardVector = new THREE.Vector3(0, 0, -1);
  private readonly scratch = { x: 0, z: 0 };
  private flashlightFlicker = 0;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.view = new PlayerCamera(camera);
    this.flashlight = new THREE.SpotLight(0xfff0d4, 0, 17, Math.PI / 7, 0.55, 1.1);
    this.flashlight.castShadow = false;
    this.flashlight.visible = false;
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);
    this.flashlight.position.set(0.12, -0.1, 0);
    this.flashlight.target.position.set(0.12, -0.1, -1);
    scene.add(camera);
  }

  get yaw(): number {
    return this.view.yaw;
  }

  get pitch(): number {
    return this.view.pitch;
  }

  get yawDelta(): number {
    return this.view.yawDelta;
  }

  get eyeHeight(): number {
    return this.eye;
  }

  get forward(): THREE.Vector3 {
    return this.forwardVector;
  }

  get isMoving(): boolean {
    return this.speed > 0.35;
  }

  teleport(x: number, z: number, yaw?: number): void {
    this.position.set(x, 0, z);
    this.velocityX = 0;
    this.velocityZ = 0;
    if (yaw !== undefined) this.view.setAngles(yaw, 0);
  }

  setShake(amount: number, frequency: number): void {
    this.view.setShake(amount, frequency);
  }

  kick(strength: number): void {
    this.view.kick(strength);
  }

  setFlashlight(on: boolean, ctx?: GameContext): void {
    if (this.flashlightOn === on) return;
    this.flashlightOn = on;
    this.flashlight.visible = on;
    ctx?.audio.play('switch', { volume: 0.5 });
    ctx?.bus.emit('flashlight_toggled', { on });
    ctx?.recorder.recordEvent(on ? 'flashlight_on' : 'flashlight_off', 'flashlight');
  }

  update(delta: number, ctx: GameContext): void {
    const settings = ctx.settings;
    const look = ctx.input.consumeLook();
    if (!this.frozen && ctx.state.isInteractive) {
      this.view.applyLook(look.x, look.y, settings, ctx.input.usingTouch);
    }

    this.forwardVector.set(-Math.sin(this.view.yaw), 0, -Math.cos(this.view.yaw));

    let inputX = 0;
    let inputY = 0;
    let wantsRun = false;

    if (!this.frozen && ctx.state.isInteractive) {
      const move = ctx.input.move;
      inputX = move.x;
      inputY = move.y;

      if (settings.sprintToggle) {
        if (ctx.input.wasPressed('sprint')) this.sprintLatched = !this.sprintLatched;
        wantsRun = this.sprintLatched;
      } else {
        wantsRun = ctx.input.isDown('sprint');
      }
      this.crouching = ctx.input.isDown('crouch');

      if (ctx.input.wasPressed('flashlight')) this.setFlashlight(!this.flashlightOn, ctx);
    } else {
      this.sprintLatched = false;
    }

    const running = wantsRun && !this.crouching && (Math.abs(inputX) + Math.abs(inputY)) > 0.1;
    const maxSpeed = this.crouching ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED;

    // Convert stick input into world space using the camera yaw.
    const right = new THREE.Vector3(this.forwardVector.z, 0, -this.forwardVector.x);
    const desiredX = (this.forwardVector.x * inputY + right.x * inputX) * maxSpeed;
    const desiredZ = (this.forwardVector.z * inputY + right.z * inputX) * maxSpeed;

    this.velocityX = damp(this.velocityX, desiredX, ACCELERATION, delta);
    this.velocityZ = damp(this.velocityZ, desiredZ, ACCELERATION, delta);
    if (Math.abs(this.velocityX) < 0.008) this.velocityX = 0;
    if (Math.abs(this.velocityZ) < 0.008) this.velocityZ = 0;

    const height = this.crouching ? HEIGHT_CROUCHING : HEIGHT_STANDING;
    this.scratch.x = this.position.x;
    this.scratch.z = this.position.z;
    const collision = ctx.world.collision;
    if (collision) {
      collision.moveAndSlide(this.scratch, this.velocityX * delta, this.velocityZ * delta, RADIUS, 0.05, height);
    } else {
      this.scratch.x += this.velocityX * delta;
      this.scratch.z += this.velocityZ * delta;
    }

    const travelled = Math.hypot(this.scratch.x - this.position.x, this.scratch.z - this.position.z);
    this.position.x = this.scratch.x;
    this.position.z = this.scratch.z;
    this.speed = delta > 0 ? travelled / delta : 0;

    // Keep the player inside the level even if geometry changed under them.
    if (ctx.world.isOutOfBounds(this.position.x, this.position.z)) {
      const safe = ctx.world.safePoint;
      this.position.set(safe.x, 0, safe.z);
      this.velocityX = 0;
      this.velocityZ = 0;
    }

    this.motion = this.crouching ? 3 : this.speed < 0.35 ? 0 : running ? 2 : 1;
    this.idleTime = this.speed < 0.25 ? this.idleTime + delta : 0;

    // Footsteps.
    if (this.speed > 0.4) {
      this.stepDistance += travelled;
      const stride = running ? 0.98 : this.crouching ? 1.05 : 0.78;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.playFootstep(ctx, running);
      }
    } else {
      this.stepDistance = Math.max(0, this.stepDistance - delta * 0.4);
    }

    const targetEye = this.crouching ? EYE_CROUCHING : EYE_STANDING;
    this.eye = damp(this.eye, targetEye, 10, delta);

    this.view.update({
      position: this.position,
      eyeHeight: this.eye,
      speed: this.speed,
      running,
      settings,
      tension: ctx.tension.normalized,
      delta,
    });

    this.updateFlashlight(delta, ctx);
  }

  private updateFlashlight(delta: number, ctx: GameContext): void {
    if (!this.flashlightOn) {
      this.flashlight.intensity = damp(this.flashlight.intensity, 0, 12, delta);
      if (this.flashlight.intensity < 0.2) this.flashlight.visible = false;
      return;
    }
    this.flashlight.visible = true;
    let target = 26;
    // The torch stutters when tension is high — but never when the player has
    // asked for reduced flashing.
    if (!ctx.settings.reduceFlashing && ctx.tension.normalized > 0.7) {
      this.flashlightFlicker -= delta;
      if (this.flashlightFlicker <= 0) {
        this.flashlightFlicker = 0.08 + Math.random() * 0.5;
        target = Math.random() < 0.4 ? 6 : 26;
      }
    }
    this.flashlight.intensity = damp(this.flashlight.intensity, target, 16, delta);
  }

  private playFootstep(ctx: GameContext, running: boolean): void {
    const surface = ctx.world.surfaceAt(this.position.x, this.position.z);
    this.lastSurface = surface;
    const sound =
      surface === 'wood'
        ? 'step_wood'
        : surface === 'carpet'
          ? 'step_carpet'
          : surface === 'metal'
            ? 'step_metal'
            : 'step_terrazzo';
    ctx.audio.play(sound, {
      volume: (running ? 0.85 : this.crouching ? 0.32 : 0.6) * 0.9,
      rate: 0.92 + Math.random() * 0.16,
    });
  }

  get surface(): string {
    return this.lastSurface;
  }
}
