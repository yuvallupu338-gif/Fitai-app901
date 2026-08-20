/*
 * player.js — where you are, and what you can walk into.
 *
 * Collision is done against a list of walkable rectangles rather than against
 * the wall geometry. In a fixed six-room house that is both simpler and more
 * robust: the rooms and the doorways between them are already rectangles,
 * `buildVilla` hands them over, and there is no chance of squeezing through a
 * seam between two wall quads because the walls are not what is being tested.
 *
 * Movement resolves per axis. Trying the full move, then x alone, then z alone
 * is what makes walking along a wall slide rather than stop dead, and it is
 * three rectangle tests instead of a swept circle.
 */

import { EYE_H } from '../world/build.js';

const RADIUS = 0.26;
const WALK = 2.05;
const RUN = 3.15;
const ACCEL = 14;

export class Player {
  constructor(x, z, yaw) {
    this.x = x;
    this.y = EYE_H;
    this.z = z;
    this.yaw = yaw || 0;
    this.pitch = 0;
    this.vx = 0;
    this.vz = 0;
    this.bob = 0;
    this.bobAmount = 0;
    this.stepPhase = 0;
    this.torch = true;
    this.speedScale = 1;
  }

  /*
   * `areas` are the walkable rectangles and `blockers` the furniture. A point
   * is standing somewhere legal if it is inside at least one area and inside
   * no blocker — and the four probes around it are what stop the player's
   * shoulders passing through a door frame their centre fits through.
   */
  canStand(x, z, areas, blockers) {
    for (const b of blockers) {
      if (x > b.x0 - RADIUS && x < b.x1 + RADIUS
        && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return false;
    }
    const probes = [
      [x, z], [x + RADIUS, z], [x - RADIUS, z], [x, z + RADIUS], [x, z - RADIUS],
    ];
    for (const [px, pz] of probes) {
      let inside = false;
      for (const a of areas) {
        if (px >= a.x0 && px <= a.x1 && pz >= a.z0 && pz <= a.z1) { inside = true; break; }
      }
      if (!inside) return false;
    }
    return true;
  }

  update(dt, input, world, opts) {
    const look = input.takeLook();
    this.yaw += look.dx;
    this.pitch = clamp(this.pitch - look.dy, -1.45, 1.45);

    const m = input.move();
    const speed = (input.running ? RUN : WALK) * this.speedScale * ((opts && opts.speed) || 1);

    /*
     * Movement is relative to where you are looking, on the floor plane, in
     * the engine's convention: yaw 0 looks down -Z and the right vector is
     * (cos yaw, 0, -sin yaw). Getting the sign of the Z term wrong here walks
     * you backwards when you press forward, which is subtle enough in a dark
     * corridor to be blamed on the level.
     */
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wantX = (m.x * cy + m.z * sy) * speed;
    const wantZ = (m.z * cy - m.x * sy) * speed;

    const k = 1 - Math.exp(-ACCEL * dt);
    this.vx += (wantX - this.vx) * k;
    this.vz += (wantZ - this.vz) * k;

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const { areas, blockers } = world;

    if (this.canStand(nx, nz, areas, blockers)) {
      this.x = nx; this.z = nz;
    } else if (this.canStand(nx, this.z, areas, blockers)) {
      this.x = nx; this.vz = 0;
    } else if (this.canStand(this.x, nz, areas, blockers)) {
      this.z = nz; this.vx = 0;
    } else {
      this.vx = 0; this.vz = 0;
    }

    /* Head bob, and the footstep that comes with it. Tied to distance rather
     * than to time, so walking slowly does not sound like running. */
    const moved = Math.hypot(this.vx, this.vz);
    this.bobAmount += (Math.min(1, moved / WALK) - this.bobAmount) * (1 - Math.exp(-8 * dt));
    const prev = this.stepPhase;
    this.stepPhase += moved * dt * 1.9;
    this.bob = Math.sin(this.stepPhase * Math.PI * 2) * 0.022 * this.bobAmount;
    const stepped = Math.floor(this.stepPhase * 2) !== Math.floor(prev * 2) && moved > 0.4;

    this.y = EYE_H + this.bob;
    return { stepped };
  }

  /* Which room the player is standing in, by rectangle. Rooms come first in
   * `areas`; a doorway rectangle has no `room` and falls through to whichever
   * room also contains the point. */
  roomAt(areas) {
    for (const a of areas) {
      if (!a.room) continue;
      if (this.x >= a.x0 && this.x <= a.x1 && this.z >= a.z0 && this.z <= a.z1) return a.room;
    }
    let best = null;
    let bestD = Infinity;
    for (const a of areas) {
      if (!a.room) continue;
      const cx = Math.max(a.x0, Math.min(this.x, a.x1));
      const cz = Math.max(a.z0, Math.min(this.z, a.z1));
      const d = Math.hypot(this.x - cx, this.z - cz);
      if (d < bestD) { bestD = d; best = a.room; }
    }
    return best;
  }

  /* Must agree with core/math.js forwardFromEuler, which is what the view
   * matrix is built from — an X sign flipped here mirrors the torch and the
   * interaction cone against the picture on screen. */
  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
