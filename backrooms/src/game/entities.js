/*
 * entities.js — the things that are also here.
 *
 * Three behaviours, and none of them is a combat AI:
 *
 *   hound    hunts. Runs at you the moment it has line of sight, and keeps
 *            coming. The only counter is distance and doors.
 *   watcher  moves only when you are not looking at it. Turn around and it is
 *            exactly where it was; turn back and it is closer. This is the
 *            cheapest genuinely unsettling behaviour in games and it has never
 *            stopped working.
 *   crawler  low and fast, lives in the dark, and is drawn to your torch.
 *
 * They are spawned in a shell around the player and despawned when they fall
 * behind, so a level has a population without the game tracking one.
 */

import { hash2 } from '../core/rng.js';
import { clamp } from '../core/math.js';

const BEHAVIOUR = {
  hound:   { mesh: 'biped',   speed: 3.6, sight: 26, reach: 1.15, damage: 0.34, hp: 3 },
  watcher: { mesh: 'biped',   speed: 2.4, sight: 30, reach: 1.05, damage: 0.28, hp: 3 },
  crawler: { mesh: 'crawler', speed: 3.9, sight: 15, reach: 0.95, damage: 0.22, hp: 2 },
};

export class Entities {
  constructor(level, world) {
    this.level = level;
    this.world = world;
    this.spec = level.entities;
    this.list = [];
    this.events = [];
    this.spawnTimer = 2;
    this.max = this.spec ? Math.max(1, Math.round(this.spec.density * 4)) : 0;
  }

  update(dt, player, world, time) {
    this.events.length = 0;
    if (!this.spec || player.dead) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3 + Math.random() * 4;
      if (this.list.length < this.max) this.trySpawn(player, world, time);
    }

    const B = BEHAVIOUR[this.spec.kind] || BEHAVIOUR.hound;
    const speed = this.spec.speed || B.speed;
    const fx = -Math.sin(player.yaw) * Math.cos(player.pitch);
    const fz = -Math.cos(player.yaw) * Math.cos(player.pitch);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const dx = player.pos.x - e.x, dz = player.pos.z - e.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 62) { this.list.splice(i, 1); continue; }

      const sees = dist < B.sight && this.lineOfSight(world, e, player);
      /*
       * Are we being looked at? Compared in the horizontal plane, because a
       * player staring at the floor is not looking at anything.
       *
       * `toX/toZ` is the player→entity direction (it is negated again below to
       * walk towards the player), so the player is looking at this entity when
       * their forward vector agrees with it. This was written with an extra
       * negation, which inverted the entire watcher: it advanced while you
       * stared straight at it and stopped the moment you turned away — the
       * exact opposite of the one behaviour it exists for.
       */
      const toX = -dx / (dist || 1), toZ = -dz / (dist || 1);
      const watched = (fx * toX + fz * toZ) > 0.80 && sees;

      let move = false;
      if (this.spec.kind === 'watcher') {
        move = sees && !watched;
        if (watched && !e.frozen) {
          e.frozen = true;
          this.events.push({ type: 'freeze', dist });
        }
        if (!watched) e.frozen = false;
      } else if (this.spec.kind === 'crawler') {
        move = sees || dist < 8 || (player.flashlightOn && dist < 20);
      } else {
        if (sees) e.alerted = true;
        move = e.alerted;
      }

      if (move) {
        const step = speed * dt;
        const nx = e.x + toX * -step, nz = e.z + toZ * -step;
        /* Try both axes, then each on its own, so a corner does not trap it. */
        if (!world.blocked(nx, nz, e.y, 0.3, 0.5)) { e.x = nx; e.z = nz; }
        else if (!world.blocked(nx, e.z, e.y, 0.3, 0.5)) e.x = nx;
        else if (!world.blocked(e.x, nz, e.y, 0.3, 0.5)) e.z = nz;
        e.y = world.groundAt(e.x, e.z, 0.3);
        if (e.y < -900) { this.list.splice(i, 1); continue; }
        e.rot = Math.atan2(-toX, -toZ) + Math.PI;
        e.moving = true;
        e.cue -= dt;
        if (e.cue <= 0) {
          e.cue = 1.4 + Math.random() * 2.2;
          this.events.push({ type: 'cue', kind: this.spec.kind, dist });
        }
      } else {
        e.moving = false;
      }

      if (dist < B.reach && e.cooldown <= 0) {
        e.cooldown = 1.1;
        player.hurt(B.damage);
        this.events.push({ type: 'hit', dist });
      }
      e.cooldown = Math.max(0, e.cooldown - dt);

      /*
       * Gait. The stride advances with distance covered rather than with time,
       * so the feet keep pace with the body instead of skating — the single
       * thing that gives away a walk cycle driven off a clock.
       */
      const stride = this.spec.kind === 'crawler' ? 2.6 : 1.7;
      if (e.moving) e.phase += speed * dt * stride;
      else e.phase += dt * 1.1;                 /* a slow idle sway          */
      e.swing = e.moving ? 1 : 0.07;
      /* Vertical bob peaks twice per stride, once per footfall. */
      e.bob = e.moving
        ? Math.abs(Math.sin(e.phase)) * 0.035 - 0.017
        : Math.sin(time * 1.6 + e.seed) * 0.012;

      /* Where the head is pointing. It tracks the player independently of the
       * body, which is why a watcher standing still is worse than one that
       * moves: the body is square-on to nothing and the face is not. */
      let toPlayer = Math.atan2(-toX, -toZ) + Math.PI;
      let delta = ((toPlayer - e.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      e.headYaw = Math.max(-1.1, Math.min(1.1, delta));
    }
  }

  trySpawn(player, world, time) {
    const seed = hash2(Math.floor(player.pos.x), Math.floor(player.pos.z),
      Math.floor(time * 7));
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = ((seed >>> (attempt * 3)) % 360) * Math.PI / 180;
      const d = 17 + ((seed >>> attempt) % 12);
      const x = player.pos.x + Math.cos(a) * d;
      const z = player.pos.z + Math.sin(a) * d;
      const y = world.groundAt(x, z, 0.3);
      if (y < -900) continue;
      if (world.blocked(x, z, y, 0.35, 0.5)) continue;
      this.list.push({
        x, y, z, rot: a, cooldown: 0, alerted: false, frozen: false,
        moving: false, bob: 0, cue: 1, seed: Math.random() * 6.28,
        phase: Math.random() * 6.28, swing: 0, headYaw: 0,
        mesh: (BEHAVIOUR[this.spec.kind] || BEHAVIOUR.hound).mesh,
      });
      return true;
    }
    return false;
  }

  /* Grid line-of-sight: step along the segment and give up at the first wall
   * tall enough to hide behind. Coarse, but it is checked against the same
   * height field the shadows use, so what blocks sight also blocks light. */
  lineOfSight(world, e, player) {
    const dx = player.pos.x - e.x, dz = player.pos.z - e.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (world.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [gx, gz] = world.cellOf(e.x + dx * t, e.z + dz * t);
      if (world.wallAt(gx, gz) > 1.2) return false;
    }
    return true;
  }

  /*
   * Render descriptors, one per body part. Each part's mesh was built with its
   * origin at the joint it hangs from, so a pitch on the model matrix is a
   * rotation about the shoulder or the hip.
   *
   * Arms and legs swing in opposition, as a body does; the offset on the arms
   * keeps them from mirroring the legs exactly, which is the difference
   * between walking and marching.
   */
  dynamics(out) {
    for (const e of this.list) {
      const y = e.y + e.bob;
      const sw = Math.sin(e.phase) * e.swing;
      const sw2 = Math.sin(e.phase + Math.PI) * e.swing;

      if (e.mesh === 'crawler') {
        out.push({ mesh: 'crawlBody', x: e.x, y, z: e.z, rot: e.rot, scale: 1 });
        /* Four limbs on a diagonal gait: front-left with back-right. */
        const legs = [
          [-0.17, -0.26, sw], [0.17, -0.26, sw2],
          [-0.17, 0.22, sw2], [0.17, 0.22, sw],
        ];
        for (const [ox, oz, s] of legs) {
          const c = Math.cos(e.rot), si = Math.sin(e.rot);
          out.push({
            mesh: 'crawlLimb',
            x: e.x + ox * c - oz * si,
            y: y + 0.33,
            z: e.z + ox * si + oz * c,
            rot: e.rot, pitch: s * 0.75, scale: 1,
          });
        }
        continue;
      }

      out.push({ mesh: 'entTorso', x: e.x, y, z: e.z, rot: e.rot, scale: 1 });
      /* 1.60, not 1.68: the head has to overlap the top of the neck stub
       * (which reaches 1.52) or it visibly floats above the shoulders. */
      out.push({
        mesh: 'entHead',
        x: e.x, y: y + 1.60, z: e.z,
        rot: e.rot + e.headYaw, scale: 1,
      });

      const c = Math.cos(e.rot), s = Math.sin(e.rot);
      /* Shoulders and hips, offset sideways from the body's centre line. */
      for (const [ox, mesh, yj, amp, ph] of [
        [-0.235, 'entArm', 1.42, 0.62, sw],
        [0.235, 'entArm', 1.42, 0.62, sw2],
        [-0.095, 'entLeg', 0.90, 0.80, sw2],
        [0.095, 'entLeg', 0.90, 0.80, sw],
      ]) {
        out.push({
          mesh,
          x: e.x + ox * c,
          y: y + yj,
          z: e.z + ox * s,
          rot: e.rot,
          pitch: ph * amp,
          scale: 1,
        });
      }
    }
    return out;
  }

  /* How close the nearest one is, for the music and the heartbeat. */
  nearest(x, z) {
    let best = Infinity;
    for (const e of this.list) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < best) best = d;
    }
    return best;
  }

  clear() { this.list.length = 0; }
}

export { BEHAVIOUR };
export const dangerLabel = (kind) => ({
  hound: 'ציד',
  watcher: 'צופה',
  crawler: 'זוחל',
}[kind] || '');

export const clampDanger = (d) => clamp(1 - d / 20, 0, 1);
