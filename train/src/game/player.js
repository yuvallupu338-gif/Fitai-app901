/*
 * player.js — walking, looking, sitting down, and reaching for things.
 *
 * The carriage is a corridor, so the collision is a corridor: an X clamp that
 * widens at the doorways, a Z clamp at each end, and circles round the grab
 * poles. There is no physics engine here and there is nothing for one to do.
 *
 * Two details are load-bearing for how the game feels:
 *
 *  - The train sways, and the camera sways with it, and so does the player's
 *    aim. It is a small number and it is the difference between standing in a
 *    train and standing in a room shaped like one.
 *  - Sitting is a real state with its own eye height and a limited look range,
 *    because the game asks the player to sit down and watch people, and a
 *    seated camera that can spin freely is a chair with a swivel.
 */

import { clamp, damp, lerp, rayAABB, angleDelta } from '../core/math.js';
import { CAR, carCenterZ, seatSlot } from '../world/dims.js';
import { PLATFORM } from '../world/outside.js';

const HALF_LEN = CAR.length / 2;
const WALK_SPEED = 1.62;
const SLOW_SPEED = 0.78;
const ACCEL = 11;
const REACH = 2.5;

export class Player {
  constructor(world, settings) {
    this.world = world;
    this.settings = settings;

    this.position = [0, 0, carCenterZ(1) - 3.5];
    this.velocity = [0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = CAR.eyeHeight;

    this.sitting = null;          // { car, slot, yaw }
    this.outside = false;
    this.bob = 0;
    this.bobAmount = 0;
    this.strideSide = 0;
    this.stillTime = 0;
    this.walkedFrom = carCenterZ(1);
    this.minZ = this.position[2];
    this.maxZ = this.position[2];

    this.look = { yaw: 0, pitch: 0 };
    this.hover = null;
    this.hoverDistance = 0;
    this.locked = false;          // set while a document overlay is open
    this.frozen = false;          // set during endings and cutscenes
  }

  get car() { return this.world.carIndexAt(this.position[2]); }

  get eye() {
    return [this.position[0], this.position[1] + this.eyeHeight, this.position[2]];
  }

  reset(z = carCenterZ(1) - 3.5) {
    this.position = [0, 0, z];
    this.velocity = [0, 0];
    this.sitting = null;
    this.outside = false;
    this.bob = 0;
    /* Both gates get set when a run ends. A new run that inherited them would
       start with a camera that does not turn and legs that do not work. */
    this.locked = false;
    this.frozen = false;
    this.stillTime = 0;
  }

  /* ---- movement -------------------------------------------------------- */

  update(dt, input, ctx) {
    const s = this.settings;

    if (!this.locked && input) {
      const [dx, dy] = input.takeLook(s.sensitivity, s.invertMouseX, s.invertY);
      this.yaw -= dx;
      this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
    }

    if (this.sitting) {
      /* A neck, not a turntable. */
      const rel = angleDelta(this.sitting.yaw, this.yaw);
      if (Math.abs(rel) > 1.85) this.yaw = this.sitting.yaw + Math.sign(rel) * 1.85;
      this.velocity[0] = 0;
      this.velocity[1] = 0;
      this.eyeHeight = damp(this.eyeHeight, CAR.sitEyeHeight, 9, dt);
      this.bobAmount = damp(this.bobAmount, 0, 8, dt);
      this.stillTime += dt;
      return;
    }

    this.eyeHeight = damp(this.eyeHeight, CAR.eyeHeight, 9, dt);

    let ix = 0, iz = 0;
    if (input && !this.locked && !this.frozen) {
      if (input.down('forward')) iz += 1;
      if (input.down('back')) iz -= 1;
      if (input.down('right')) ix += 1;
      if (input.down('left')) ix -= 1;
    }
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    const slow = input && input.down('slow');
    const target = slow ? SLOW_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    /* Forward is -Z in view space; the carriage's +Z is the direction of
       travel, so walking "forward" walks toward the front of the train. */
    const wantX = (ix * cos - iz * sin) * target;
    const wantZ = (-ix * sin - iz * cos) * target;

    this.velocity[0] = damp(this.velocity[0], wantX, ACCEL, dt);
    this.velocity[1] = damp(this.velocity[1], wantZ, ACCEL, dt);

    const speed = Math.hypot(this.velocity[0], this.velocity[1]);
    if (speed > 0.08) this.stillTime = 0; else this.stillTime += dt;

    const nx = this.position[0] + this.velocity[0] * dt;
    const nz = this.position[2] + this.velocity[1] * dt;
    this._move(nx, nz, ctx);

    this.minZ = Math.min(this.minZ, this.position[2]);
    this.maxZ = Math.max(this.maxZ, this.position[2]);

    /* Head bob and footsteps share one phase so a step lands at the bottom of
       the stride and not somewhere near it. */
    const targetBob = clamp(speed / WALK_SPEED, 0, 1);
    this.bobAmount = damp(this.bobAmount, targetBob, 6, dt);
    const before = this.bob;
    this.bob += speed * dt * 3.35;
    if (this.bobAmount > 0.15) {
      const half = Math.PI;
      if (Math.floor(this.bob / half) !== Math.floor(before / half)) {
        ctx.sfx?.footstep({ surface: this.outside ? 'platform' : 'carriage', level: 0.5 + this.bobAmount * 0.6 });
      }
    }
  }

  _move(nx, nz, ctx) {
    const world = this.world;
    const doorSide = world.doorSide;

    if (this.outside) {
      const side = doorSide;
      const inner = side * (PLATFORM.innerX + 0.42);
      const outer = side * (PLATFORM.outerX - 0.55);
      const lo = Math.min(inner, outer), hi = Math.max(inner, outer);
      let x = clamp(nx, lo, hi);
      const pz = world.platformZ ?? 0;
      const halfPlat = (PLATFORM.length / 2) - 3;
      let z = clamp(nz, pz - halfPlat, pz + halfPlat);

      /* Coming back aboard: only through a doorway, and only while it is
         actually open. */
      if (Math.abs(nx) < Math.abs(inner)) {
        const doorway = this._doorwayAt(nz, side);
        if (doorway && world.cars[doorway.car].doorOpen[String(side)][doorway.index] > 0.65) {
          this.outside = false;
          this.position[1] = 0;
          x = side * (CAR.halfWidth - 0.22);
          z = nz;
          ctx.onBoard?.();
        }
      }
      this.position[0] = x;
      this.position[2] = z;
      this.position[1] = damp(this.position[1], PLATFORM.topY, 12, 0.016);
      return;
    }

    /* Inside. */
    const doorway = this._doorwayAt(nz, nx > 0 ? 1 : -1);
    const side = nx > 0 ? 1 : -1;
    const open = doorway ? world.cars[doorway.car].doorOpen[String(side)][doorway.index] : 0;
    const inGangway = this._gangwayAt(nz);

    let limit = inGangway ? 0.54 : CAR.corridorHalf;
    if (doorway && open > 0.45) limit = CAR.doorwayHalf;

    let x = clamp(nx, -limit, limit);

    /* Stepping down onto the platform. */
    if (doorway && open > 0.7 && side === world.doorSide && Math.abs(nx) >= CAR.doorwayHalf - 0.001
      && world.platformZ != null && ctx.allowExit !== false) {
      this.outside = true;
      /* Clear of the platform edge, not on it. Landing inside the re-board
         threshold put the player straight back on the train on the next frame,
         forever, which quietly made every "got off here" ending unreachable. */
      this.position[0] = side * (PLATFORM.innerX + 0.55);
      this.position[2] = nz;
      ctx.onStepOff?.();
      return;
    }

    let z = nz;
    /* The ends of the train. */
    const frontLimit = carCenterZ(world.carCount - 1) + HALF_LEN - 0.34;
    const backLimit = carCenterZ(0) - HALF_LEN + 0.34;
    z = clamp(z, backLimit, frontLimit);

    /* Connecting doors. */
    for (let i = 0; i < world.carCount - 1; i++) {
      const boundary = carCenterZ(i) + CAR.spacing / 2;
      const gate = this._gateOpen(i);
      if (gate) continue;
      const here = this.position[2];
      const wall = 0.62;
      if (here <= boundary && z > boundary - wall) z = boundary - wall;
      if (here > boundary && z < boundary + wall) z = boundary + wall;
    }

    /* Poles. */
    for (const pole of world.polesFor(world.carIndexAt(z))) {
      const dx = x - pole.x;
      const dz = z - pole.z;
      const d = Math.hypot(dx, dz);
      const r = pole.radius + 0.22;
      if (d < r && d > 1e-4) {
        x = pole.x + (dx / d) * r;
        z = pole.z + (dz / d) * r;
      }
    }

    this.position[0] = x;
    this.position[2] = z;
    this.position[1] = damp(this.position[1], 0, 14, 0.016);
  }

  _doorwayAt(z, side) {
    const world = this.world;
    for (const car of world.cars) {
      for (let i = 0; i < CAR.doorZ.length; i++) {
        const dz = car.z + CAR.doorZ[i];
        if (Math.abs(z - dz) < CAR.doorHalfWidth + 0.12) {
          return { car: car.index, index: i, side, z: dz };
        }
      }
    }
    return null;
  }

  _gangwayAt(z) {
    const world = this.world;
    for (let i = 0; i < world.carCount - 1; i++) {
      const boundary = carCenterZ(i) + CAR.spacing / 2;
      if (Math.abs(z - boundary) < CAR.gangway / 2 + 0.3) return i;
    }
    return null;
  }

  _gateOpen(i) {
    const a = this.world.cars[i]?.connecting.find((c) => c.end > 0);
    const b = this.world.cars[i + 1]?.connecting.find((c) => c.end < 0);
    return (a?.open ?? 0) > 0.55 && (b?.open ?? 0) > 0.55;
  }

  openGate(i) {
    const a = this.world.cars[i]?.connecting.find((c) => c.end > 0);
    const b = this.world.cars[i + 1]?.connecting.find((c) => c.end < 0);
    if (!a || !b) return false;
    if (a.locked || b.locked) return false;
    return true;
  }

  /* ---- sitting --------------------------------------------------------- */

  sit(car, slotIndex) {
    const slot = seatSlot(slotIndex);
    /* Sitting is always inside. Reachable from the platform through an open
       doorway, and leaving `outside` set there stalls the boarding phase and
       hands the door-close decision the wrong answer. */
    this.outside = false;
    this.sitting = { car, slot: slotIndex, yaw: slot.facing };
    this.position[0] = slot.x * 0.86;
    this.position[2] = carCenterZ(car) + slot.z;
    this.velocity[0] = 0;
    this.velocity[1] = 0;
    this.yaw = slot.facing;
  }

  stand() {
    if (!this.sitting) return;
    const slot = seatSlot(this.sitting.slot);
    this.position[0] = slot.x > 0 ? CAR.corridorHalf - 0.12 : -(CAR.corridorHalf - 0.12);
    this.sitting = null;
  }

  /* ---- interaction ----------------------------------------------------- */

  /*
   * Picks whatever the crosshair is on. Everything interactive in the game is
   * an axis-aligned box, which is a lie the player never gets to test because
   * the boxes are all screwed to flat walls.
   */
  pick(candidates, camera) {
    const eye = camera.position;
    const dir = camera.forward;
    let best = null;
    let bestDist = REACH;
    for (const item of candidates) {
      if (item.disabled) continue;
      const t = rayAABB(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], item.min, item.max);
      if (t < 0 || t > bestDist) continue;
      best = item;
      bestDist = t;
    }
    this.hover = best;
    this.hoverDistance = best ? bestDist : 0;
    return best;
  }

  /* Applies the carriage's motion to the camera. Sway is a shared value so the
     hanging handles and the passengers move with the same body of air. */
  applyToCamera(camera, sway, roll, time) {
    const bobScale = (this.settings.headBob ?? 1) * this.bobAmount;
    const bobY = Math.sin(this.bob * 2) * 0.021 * bobScale;
    const bobX = Math.sin(this.bob) * 0.016 * bobScale;
    const breathe = Math.sin(time * 0.9) * 0.004;

    camera.position[0] = this.position[0] + sway * 0.55 + bobX;
    camera.position[1] = this.position[1] + this.eyeHeight + bobY + breathe + Math.abs(sway) * 0.05;
    camera.position[2] = this.position[2];
    camera.yaw = this.yaw + sway * 0.02;
    camera.pitch = this.pitch;
    camera.roll = roll + Math.sin(this.bob) * 0.006 * bobScale;
    camera.fov = lerp(camera.fov, this.settings.fov, 0.2);
    camera.update();
  }
}
