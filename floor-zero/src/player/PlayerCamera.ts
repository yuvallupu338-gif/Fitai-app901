import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { Settings } from '../core/types';

const PITCH_LIMIT = Math.PI / 2 - 0.04;

export interface CameraFrame {
  position: THREE.Vector3;
  eyeHeight: number;
  speed: number;
  running: boolean;
  settings: Settings;
  /** 0..1 hidden tension, nudges FOV and sway. */
  tension: number;
  delta: number;
}

/**
 * Owns look angles and all the small camera motion that sells "a person is
 * holding this": bob, sway, breathing, shake and the field-of-view drift when
 * running or frightened.
 */
export class PlayerCamera {
  yaw = 0;
  pitch = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private shakeAmount = 0;
  private shakeFrequency = 0;
  private shakeTime = 0;
  private fovCurrent = 74;
  private previousYaw = 0;
  yawDelta = 0;
  private impulse = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.fovCurrent = camera.fov;
  }

  setAngles(yaw: number, pitch = 0): void {
    this.yaw = yaw;
    this.previousYaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  applyLook(dx: number, dy: number, settings: Settings, touch: boolean): void {
    const base = touch ? 0.0032 * settings.touchSensitivity : 0.0022 * settings.mouseSensitivity;
    this.yaw -= dx * base;
    this.pitch -= (settings.invertY ? -dy : dy) * base;
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  setShake(amount: number, frequency: number): void {
    this.shakeAmount = amount;
    this.shakeFrequency = frequency;
  }

  /** One-off kick, used by scares and by being caught. */
  kick(strength: number): void {
    this.impulse.set(
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength * 0.4,
    );
  }

  update(frame: CameraFrame): void {
    const { delta, settings } = frame;
    this.yawDelta = (this.yaw - this.previousYaw) / Math.max(delta, 1e-4);
    this.previousYaw = this.yaw;

    // Head bob.
    const moving = frame.speed > 0.35;
    const targetBob = moving && settings.headBob && !settings.reduceMotion ? clamp(frame.speed / 3.2, 0, 1) : 0;
    this.bobAmount = damp(this.bobAmount, targetBob, 7, delta);
    if (moving) this.bobPhase += delta * (frame.running ? 12.5 : 8.4);

    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.022 * this.bobAmount;
    const roll = Math.cos(this.bobPhase) * 0.012 * this.bobAmount;

    // Idle breathing sway so a standing player is never perfectly still.
    const breath = settings.reduceMotion ? 0 : Math.sin(performance.now() * 0.00092) * 0.008;

    this.shakeTime += delta * this.shakeFrequency;
    const shakeScale = settings.reduceMotion ? 0.35 : 1;
    const shakeX = Math.sin(this.shakeTime * 1.7) * this.shakeAmount * shakeScale;
    const shakeY = Math.cos(this.shakeTime * 2.3) * this.shakeAmount * shakeScale;

    this.impulse.multiplyScalar(Math.max(0, 1 - delta * 6));

    this.camera.position.set(
      frame.position.x + bobX + shakeX + this.impulse.x,
      frame.position.y + frame.eyeHeight + bobY + breath + shakeY + this.impulse.y,
      frame.position.z + this.impulse.z,
    );

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(roll + this.impulse.x * 0.4);

    // Field of view: slightly wider when running, slightly tighter when scared.
    const targetFov = settings.fov + (frame.running ? 5 : 0) - frame.tension * 3.5;
    this.fovCurrent = damp(this.fovCurrent, targetFov, 4, delta);
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Unit vector the player is looking along, flattened to the floor plane. */
  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1).normalize();
  }
}
