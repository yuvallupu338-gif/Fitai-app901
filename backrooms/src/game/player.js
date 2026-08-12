/*
 * player.js — a body in the world.
 *
 * Movement is deliberately heavy. Acceleration and deceleration are separate,
 * the head bobs and the step sound lands on the low point of the bob, sprinting
 * costs stamina and widens the field of view slightly, and crouching is slow.
 * None of that is realism for its own sake: a camera that starts and stops
 * instantly reads as a floating eye, and a floating eye is never frightened.
 *
 * The two meters that matter are stamina, which runs out, and sanity, which
 * drains in the dark and is restored by light, by almond water, and by
 * standing still.
 */

import { clamp, damp, lerp } from '../core/math.js';

const EYE_STAND = 1.66;
const EYE_CROUCH = 0.95;
const RADIUS = 0.34;
const STEP = 0.46;
const GRAVITY = -19;

export class Player {
  constructor(spawn) {
    this.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this.crouch = false;
    this.eye = EYE_STAND;
    this.bob = 0;
    this.bobAmount = 0;
    this.fov = 74;
    this.stamina = 1;
    this.sanity = 1;
    this.health = 1;
    this.damage = 0;
    this.fallFrom = spawn.y;
    this.inWater = 0;
    this.stepPhase = 0;
    this.events = [];
    this.flashlightOn = false;
    this.battery = 1;
    this.almond = 0;
    this.notes = 0;
    this.dead = false;
    this.distance = 0;
  }

  get cameraY() { return this.pos.y + this.eye + this.bob; }

  /*
   * One tick. `light` is how brightly lit the player currently is, in the same
   * units the renderer uses, and is what decides whether sanity drains.
   */
  update(dt, input, world, level, light) {
    this.events.length = 0;
    if (this.dead) return;

    /* ---- look ---- */
    this.yaw -= input.lookX;
    this.pitch = clamp(this.pitch - input.lookY, -1.45, 1.45);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    /* ---- intent ---- */
    const [ax, az] = input.axes();
    const wantCrouch = input.down('KeyC', 'ControlLeft', 'ShiftRight');
    const wantSprint = input.down('ShiftLeft') && !wantCrouch && this.stamina > 0.03;
    const moving = ax !== 0 || az !== 0;

    /* Crouching under something is allowed; standing up into it is not. */
    if (this.crouch && !wantCrouch) {
      const head = world.ceilingAt(this.pos.x, this.pos.z);
      if (head - this.pos.y > EYE_STAND + 0.22) this.crouch = false;
    } else if (wantCrouch) {
      this.crouch = true;
    }

    const water = world.waterAt(this.pos.x, this.pos.z);
    const depth = water === null ? 0 : clamp(water - this.pos.y, 0, 2);
    this.inWater = damp(this.inWater, depth, 8, dt);

    let speed = this.crouch ? 1.45 : wantSprint ? 4.7 : 2.85;
    speed *= 1 - clamp(this.inWater, 0, 0.9) * 0.55;      /* wading is slow    */
    /* Anything riding you costs a fifth of your legs each, floored so that
     * three of them is a bad afternoon and not a full stop — a player who
     * cannot move at all cannot shake them off either, and the way out of a
     * leech is distance covered. */
    speed *= Math.max(0.35, 1 - (this.grabbed || 0) * 0.20);
    speed *= lerp(0.72, 1, this.stamina * 0.35 + 0.65);

    /* Rotate the intent into world space. Forward at yaw 0 is -Z, matching
     * the camera basis in math.js. */
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wantX = (ax * cy - az * sy) * speed;
    const wantZ = (-ax * sy - az * cy) * speed;

    /* Separate accelerate/brake constants: you get up to speed briskly and
     * stop over about a third of a second, which is where the weight lives. */
    const k = moving ? 11 : 8;
    this.vel.x = damp(this.vel.x, wantX, k, dt);
    this.vel.z = damp(this.vel.z, wantZ, k, dt);

    const hit = world.moveWithCollision(this.pos, this.vel.x * dt, this.vel.z * dt,
      RADIUS, STEP);
    if (hit) {
      /* Bleed speed into the wall rather than sticking to it. */
      this.vel.x *= 0.35;
      this.vel.z *= 0.35;
    }

    /* ---- vertical ---- */
    const ground = world.groundAt(this.pos.x, this.pos.z, RADIUS);
    if (this.grounded && input.hit('Space') && !this.crouch) {
      this.vel.y = 4.6;
      this.grounded = false;
    }
    this.vel.y += GRAVITY * dt;
    this.pos.y += this.vel.y * dt;

    if (ground < -900) {
      /* Nothing underneath. This is not a bug, it is how you leave. */
      this.grounded = false;
      if (this.pos.y < this.fallFrom - 7) this.events.push({ type: 'void' });
    } else if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      const fall = this.fallFrom - ground;
      if (!this.grounded && fall > 3.5) {
        const hurt = clamp((fall - 3.5) / 9, 0, 1);
        this.hurt(hurt * 0.55);
        this.events.push({ type: 'land', hard: true, fall });
      } else if (!this.grounded) {
        this.events.push({ type: 'land', hard: false });
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
      this.fallFrom = ground;
    } else if (this.grounded && ground > this.pos.y && ground - this.pos.y <= STEP) {
      /* Walking up a kerb or a stair nosing. Smoothed so it is not a jolt. */
      this.pos.y = damp(this.pos.y, ground, 22, dt);
      this.fallFrom = this.pos.y;
    } else {
      this.grounded = false;
    }
    if (this.grounded) this.fallFrom = this.pos.y;
    else this.fallFrom = Math.max(this.fallFrom, this.pos.y);

    /* Head clearance: never let the camera go through a ceiling. */
    const head = world.ceilingAt(this.pos.x, this.pos.z);

    /* ---- bob, eye height, fov ---- */
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.distance += planar * dt;
    const targetEye = Math.min(this.crouch ? EYE_CROUCH : EYE_STAND,
      head - this.pos.y - 0.16);
    this.eye = damp(this.eye, Math.max(0.5, targetEye), 10, dt);

    if (this.grounded) {
      this.stepPhase += planar * dt * 2.05;
      const target = clamp(planar / 4.5, 0, 1) * (this.crouch ? 0.02 : 0.045);
      this.bobAmount = damp(this.bobAmount, target, 8, dt);
      const prev = this.bob;
      this.bob = -Math.abs(Math.sin(this.stepPhase * Math.PI)) * this.bobAmount * 2;
      /* The footstep fires as the head reaches the bottom of the bob. */
      if (this.bob > prev && prev < -this.bobAmount * 1.4 && planar > 0.6) {
        this.events.push({
          type: 'step',
          wet: depth > 0.03,
          fast: planar > 3.6,
        });
      }
    } else {
      this.bobAmount = damp(this.bobAmount, 0, 6, dt);
      this.bob = damp(this.bob, 0, 6, dt);
    }

    const targetFov = 74 + (wantSprint && planar > 3 ? 6 : 0) + (this.crouch ? -3 : 0);
    this.fov = damp(this.fov, targetFov, 6, dt);

    /* ---- meters ---- */
    if (wantSprint && planar > 2) this.stamina = clamp(this.stamina - dt * 0.16, 0, 1);
    else this.stamina = clamp(this.stamina + dt * (planar < 0.5 ? 0.30 : 0.11), 0, 1);

    const dark = level.hazards.includes('dark');
    const lit = clamp(light * 1.6 + (this.flashlightOn ? 0.35 : 0), 0, 1);
    let drain = 0;
    if (dark) drain += 0.045 * (1 - lit);
    if (level.hazards.includes('exposure')) drain += 0.02;
    if (level.hazards.includes('silence')) drain += 0.03;
    drain += (level.cls - 1) * 0.004;
    if (drain > 0) this.sanity = clamp(this.sanity - drain * dt, 0, 1);
    if (drain <= 0 || lit > 0.5) {
      this.sanity = clamp(this.sanity + dt * 0.035 * lit, 0, 1);
    }
    if (this.sanity <= 0) this.hurt(dt * 0.14);

    if (this.flashlightOn) {
      this.battery = clamp(this.battery - dt * 0.012, 0, 1);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.events.push({ type: 'battery-dead' });
      }
    }

    if (level.hazards.includes('heat')) this.hurt(dt * 0.012);
    if (level.hazards.includes('toxic') && depth > 0.05) this.hurt(dt * 0.03);
    if (level.hazards.includes('deep') && depth > 1.4) this.hurt(dt * 0.09);
    if (level.hazards.includes('radiation')) this.hurt(dt * 0.008);
    if (level.hazards.includes('electric')) this.hurt(dt * 0.006);

    this.damage = Math.max(0, this.damage - dt * 1.6);
    this.health = clamp(this.health + dt * 0.006, 0, 1);
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.events.push({ type: 'died' });
    }
  }

  hurt(amount) {
    if (amount <= 0) return;
    this.health = clamp(this.health - amount, 0, 1);
    this.damage = Math.min(1, this.damage + amount * 2.4);
  }

  toggleFlashlight() {
    if (this.battery <= 0) return false;
    this.flashlightOn = !this.flashlightOn;
    return this.flashlightOn;
  }

  camera() {
    return {
      x: this.pos.x,
      y: this.cameraY,
      z: this.pos.z,
      yaw: this.yaw,
      pitch: this.pitch,
      fov: this.fov,
    };
  }
}
