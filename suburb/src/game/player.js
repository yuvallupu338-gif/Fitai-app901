/*
 * player.js — a body in the street.
 *
 * Movement is deliberately heavy. Acceleration and braking are separate, the
 * head bobs and the footstep lands on the low point of the bob, running costs
 * breath and widens the field of view slightly, crouching is slow. None of
 * that is realism for its own sake: a camera that starts and stops instantly
 * reads as a floating eye, and a floating eye is never frightened.
 *
 * Two things here are not standard first-person fare, and both exist because
 * of her:
 *
 *   noise    every footstep emits an event with a position and a loudness that
 *            depends on the surface and the speed. She hears them. Running
 *            across tarmac is the loudest thing you can do on your feet, and
 *            it is exactly what you want to do when you are frightened.
 *   still    standing genuinely still — no keys, no mouse — is a mechanic.
 *            Beyond about eight metres she does not resolve a person who is
 *            not moving, so the correct answer to seeing her is very often to
 *            stop dead in the middle of a lawn and let her drift past.
 */

import { clamp, damp } from '../core/math.js';

const EYE_STAND = 1.66;
const EYE_CROUCH = 0.95;
const RADIUS = 0.34;
const STEP_UP = 0.62;
const GRAVITY = -19;
const BODY = 1.75;

/* Surface tag -> what it sounds like and how much noise it makes. Tarmac is
 * a quarter louder than a lawn; the difference decides routes. */
const SURFACES = {
  grass: { sound: 'grass', loud: 0.80 },
  road: { sound: 'road', loud: 1.25 },
  pave: { sound: 'path', loud: 1.20 },
  path: { sound: 'path', loud: 1.20 },
  drive: { sound: 'path', loud: 1.20 },
  step: { sound: 'path', loud: 1.15 },
  porch: { sound: 'wood', loud: 1.15 },
  floor: { sound: 'floor', loud: 0.95 },
  crate: { sound: 'wood', loud: 1.1 },
  bench: { sound: 'wood', loud: 1.1 },
  roof: { sound: 'gravel', loud: 1.3 },
  garage: { sound: 'gravel', loud: 1.3 },
  bin: { sound: 'gravel', loud: 1.4 },
};

export class Player {
  constructor(spawn) {
    this.pos = { x: spawn.x, y: 0, z: spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.grounded = true;
    this.crouch = false;
    this.eye = EYE_STAND;
    this.bob = 0;
    this.bobAmount = 0;
    this.fov = 74;
    this.breath = 1;
    this.torchOn = false;
    this.carrying = false;
    this.hidden = null;        /* { x, z, until } while inside something    */
    this.still = 0;            /* seconds spent not moving and not looking  */
    this.speed = 0;
    this.distance = 0;
    this.stepPhase = 0;
    this.events = [];
    this.surface = 'grass';
    this.indoors = false;
    this.frozenOut = 0;        /* cooldown after leaving a hiding place     */
    this.hideCooldown = 0;     /* and how long until you can get back in    */
    this.from = null;          /* where you were standing before you hid    */
  }

  get cameraY() { return this.pos.y + this.eye + this.bob; }
  get frozen() { return this.still > 0.35; }

  camera() {
    return {
      x: this.pos.x, y: this.cameraY, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch, fov: this.fov,
    };
  }

  /* Being inside something is a hard state: no movement, no look, and the
   * camera sits where the wardrobe is rather than where the body was. */
  /*
   * Into a wardrobe. Where the body was is remembered, because that is where
   * it has to come back out: the hiding place itself is a solid box, and
   * leaving the player standing in the middle of it hands them to the
   * collision pass, which pushes them out along whichever axis is cheapest —
   * sometimes through the bedroom wall and onto the lawn.
   */
  hide(spot, seconds) {
    this.hidden = { x: spot.x, z: spot.z, until: seconds };
    this.from = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    this.pos.x = spot.x;
    this.pos.z = spot.z;
    this.vel.x = this.vel.z = 0;
    this.events.push({ type: 'hide', on: true });
  }

  unhide() {
    if (!this.hidden) return;
    this.hidden = null;
    if (this.from) {
      this.pos.x = this.from.x;
      this.pos.y = this.from.y;
      this.pos.z = this.from.z;
      this.from = null;
    }
    this.frozenOut = 0.4;
    /* You cannot climb straight back in. Without this, two taps of E is an
     * unlimited hiding place and the wardrobe timer means nothing. */
    this.hideCooldown = 6;
    this.events.push({ type: 'hide', on: false });
  }

  update(dt, input, world) {
    this.events.length = 0;

    /* ---- look ---- */
    if (!this.hidden) {
      this.yaw -= input.lookX;
      this.pitch = clamp(this.pitch - input.lookY, -1.4, 1.4);
    } else {
      /* You can still turn your head inside a wardrobe, a little. */
      this.yaw -= input.lookX * 0.55;
      this.pitch = clamp(this.pitch - input.lookY * 0.55, -0.9, 0.9);
    }
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    if (this.hidden) {
      this.hidden.until -= dt;
      this.eye = damp(this.eye, 1.35, 8, dt);
      this.breath = clamp(this.breath + dt * 0.14, 0, 1);
      this.still += dt;
      this.speed = 0;
      if (this.hidden.until <= 0) {
        this.unhide();
        this.events.push({ type: 'hide-timeout' });
      }
      return;
    }

    /* ---- intent ---- */
    const [ax, az] = input.axes();
    const wantCrouch = input.down('KeyC', 'ControlLeft', 'ShiftRight');
    const wantRun = input.down('ShiftLeft') && !wantCrouch && this.breath > 0.05;
    const moving = ax !== 0 || az !== 0;

    /* Crouching under something is allowed; standing up into it is not. */
    if (this.crouch && !wantCrouch) {
      const head = world.ceilingAt(this.pos.x, this.pos.z, this.pos.y);
      if (head - this.pos.y > BODY + 0.1) this.crouch = false;
    } else if (wantCrouch) {
      this.crouch = true;
    }

    let speed = this.crouch ? 1.35 : wantRun ? 4.5 : 2.7;
    /* Out of breath is slower than merely tired, and it is loud. */
    if (this.breath < 0.2) speed *= 0.8 + this.breath;

    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wantX = (ax * cy - az * sy) * speed;
    const wantZ = (-ax * sy - az * cy) * speed;

    /* Separate accelerate and brake constants: up to speed briskly, stopped
     * over about a third of a second. That third of a second is where the
     * weight lives, and it is also what makes freezing feel like a decision
     * rather than a switch. */
    const k = moving ? 11 : 8;
    this.vel.x = damp(this.vel.x, wantX, k, dt);
    this.vel.z = damp(this.vel.z, wantZ, k, dt);

    const flags = world.moveWithCollision(this.pos, this.vel.x * dt, this.vel.z * dt,
      RADIUS, STEP_UP, this.crouch ? 1.1 : BODY);
    if (flags & 3) {
      this.vel.x *= 0.35;
      this.vel.z *= 0.35;
    }
    if (flags & 4) this.events.push({ type: 'brush' });

    /* ---- vertical ---- */
    const ground = world.groundAt(this.pos.x, this.pos.z, this.pos.y, STEP_UP, RADIUS * 0.6);
    if (this.grounded && input.hit('Space') && !this.crouch) {
      this.vel.y = 4.3;
      this.grounded = false;
      this.breath = clamp(this.breath - 0.06, 0, 1);
    }
    this.vel.y += GRAVITY * dt;
    this.pos.y += this.vel.y * dt;

    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      const fell = !this.grounded;
      const drop = this.fallFrom !== undefined ? this.fallFrom - ground : 0;
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
      this.fallFrom = ground;
      if (fell) this.events.push({ type: 'land', hard: drop > 2.2, drop });
    } else if (this.grounded && ground > this.pos.y && ground - this.pos.y <= STEP_UP) {
      /* Stepping onto a kerb, a porch step or a crate. Smoothed, or it is a
       * jolt at every driveway. */
      this.pos.y = damp(this.pos.y, ground, 22, dt);
      this.fallFrom = this.pos.y;
    } else {
      this.grounded = false;
      this.fallFrom = Math.max(this.fallFrom ?? this.pos.y, this.pos.y);
    }

    /* ---- head ---- */
    const head = world.ceilingAt(this.pos.x, this.pos.z, this.pos.y);
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.speed = planar;
    this.distance += planar * dt;
    const targetEye = Math.min(this.crouch ? EYE_CROUCH : EYE_STAND,
      head - this.pos.y - 0.14);
    this.eye = damp(this.eye, Math.max(0.5, targetEye), 10, dt);

    this.surface = world.surfaceAt(this.pos.x, this.pos.z, this.pos.y, STEP_UP);
    this.indoors = this.surface === 'floor';

    if (this.grounded) {
      this.stepPhase += planar * dt * 2.0;
      const target = clamp(planar / 4.5, 0, 1) * (this.crouch ? 0.02 : 0.045);
      this.bobAmount = damp(this.bobAmount, target, 8, dt);
      const prev = this.bob;
      this.bob = -Math.abs(Math.sin(this.stepPhase * Math.PI)) * this.bobAmount * 2;
      if (this.bob > prev && prev < -this.bobAmount * 1.4 && planar > 0.6) {
        const surf = SURFACES[this.surface] || SURFACES.grass;
        const fast = planar > 3.4;
        /*
         * How loud a step is. Crouching is nearly silent whatever you are
         * standing on, walking is half of running, and the surface is worth as
         * much as the speed — which is the whole reason to cross a lawn rather
         * than take the pavement.
         */
        const loud = surf.loud * (this.crouch ? 0.16 : fast ? 0.95 : 0.45);
        this.events.push({ type: 'step', sound: surf.sound, fast, loud });
        this.events.push({ type: 'noise', x: this.pos.x, z: this.pos.z, level: loud });
      }
    } else {
      this.bobAmount = damp(this.bobAmount, 0, 6, dt);
      this.bob = damp(this.bob, 0, 6, dt);
    }

    const targetFov = 74 + (wantRun && planar > 3 ? 5 : 0) + (this.crouch ? -3 : 0);
    this.fov = damp(this.fov, targetFov, 6, dt);

    /* ---- breath ---- */
    if (wantRun && planar > 2) this.breath = clamp(this.breath - dt * 0.115, 0, 1);
    else this.breath = clamp(this.breath + dt * (planar < 0.4 ? 0.16 : 0.075), 0, 1);
    if (this.breath < 0.12 && planar > 0.4) {
      /* Gasping carries about as far as a footstep on tarmac, and unlike a
       * footstep you cannot choose not to. */
      this.breathNoise = (this.breathNoise ?? 0) + dt;
      if (this.breathNoise > 1.1) {
        this.breathNoise = 0;
        this.events.push({ type: 'noise', x: this.pos.x, z: this.pos.z, level: 0.55 });
        this.events.push({ type: 'gasp' });
      }
    }

    /* ---- stillness ---- */
    this.frozenOut = Math.max(0, this.frozenOut - dt);
    this.hideCooldown = Math.max(0, (this.hideCooldown || 0) - dt);
    if (planar < 0.12 && input.idle > 0 && this.frozenOut <= 0) this.still += dt;
    else this.still = 0;
  }
}
