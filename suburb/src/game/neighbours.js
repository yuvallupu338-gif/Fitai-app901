/*
 * neighbours.js — the people, in both halves of the day.
 *
 * By day they stand in their front gardens and talk to you, and what they say
 * is not colour: the clues the night's puzzles need are in their small talk,
 * so the daylight walk is the only place to learn tonight's code, this week's
 * gnome order, or which of the three music boxes is the one that is in tune.
 * A player who skips the day can still play the night; they will just be
 * solving it blind, which is exactly the trade the design wants.
 *
 * By night most of them are asleep behind their windows and are nothing but a
 * lit rectangle. The exception is the "sleepers" of night three onward: people
 * standing in their own gardens in the dark, not moving, facing nothing. They
 * are not hostile. They are in the way, and they wake.
 */

import { rngFrom } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { PLAN } from '../world/layout.js';

export class Neighbours {
  constructor(layout, cfg, seed, scene) {
    this.layout = layout;
    this.cfg = cfg;
    this.scene = scene;
    this.rng = rngFrom(((seed | 0) ^ 0x2b1d) + cfg.n * 313);
    this.people = [];
    this.events = [];
    this.dog = null;
    this.build();
  }

  build() {
    const day = this.scene === 'day';
    const houses = this.layout.houses.filter((h) => !h.abandoned && !h.home);

    if (day) {
      /* Everyone is out. Mowing, watering, standing by the mailbox with the
       * post in their hand, being pleased to see you. */
      for (const h of houses) {
        const s = h.sign;
        this.people.push({
          houseId: h.id,
          name: h.occupant.name,
          x: h.x + this.rng.range(-2.5, 2.5),
          z: s * (PLAN.frontZ - this.rng.range(4.5, 7.5)),
          yaw: s > 0 ? 0 : Math.PI,
          awake: true,
          sleeper: false,
          phase: this.rng.range(0, 6.28),
          talkedTo: false,
        });
      }
      return;
    }

    /* Night. A handful of them are outside, standing still. Never in the
     * player's own garden and never in the two gardens either side of it —
     * a sleeper eight metres from your own front door on the night they are
     * introduced is not a hazard, it is a locked door. */
    const home = this.layout.home;
    const pool = houses.filter((h) => Math.abs(h.x - home.x) > 24 || h.side !== home.side);
    const chosen = this.rng.shuffle(pool).slice(0, this.cfg.sleepers);
    for (const h of chosen) {
      const s = h.sign;
      this.people.push({
        houseId: h.id,
        name: h.occupant.name,
        x: h.x + this.rng.range(-3, 3),
        z: s * (PLAN.frontZ - this.rng.range(3.5, 7)),
        /* Facing nothing in particular, which is the whole horror of them. */
        yaw: this.rng.range(0, Math.PI * 2),
        awake: false,
        sleeper: true,
        phase: this.rng.range(0, 6.28),
        woke: 0,
      });
    }

    const dogHouse = this.layout.houses.find((h) => h.dog);
    if (dogHouse) {
      const s = dogHouse.sign;
      this.dog = {
        x: dogHouse.x + 3,
        z: s * (PLAN.frontZ + dogHouse.d + 3.5),
        yaw: s > 0 ? 0 : Math.PI,
        barkCool: 0,
        awake: false,
      };
    }
  }

  /*
   * Returns events. `wake` is the loud one: a person screaming inside their own
   * garden at half past three brings her from wherever she is, and the player
   * gets exactly as much warning as the gasp before it.
   */
  update(dt, player) {
    this.events.length = 0;
    for (const p of this.people) {
      p.phase += dt;
      if (p.sleeper && !p.awake) {
        const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
        /* Touching one wakes it. Walking past at two metres does not, which
         * is the only reason they are passable at all. */
        if (d < 1.15) {
          p.awake = true;
          p.woke = 0;
          this.events.push({ type: 'wake', x: p.x, z: p.z, name: p.name });
        }
      } else if (p.awake && p.sleeper) {
        p.woke += dt;
        /* They turn to follow you and they do not stop screaming. */
        const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
        p.yaw = Math.atan2(-dx, -dz);
        if (p.woke > 3.5) p.screaming = false;
        else p.screaming = true;
      }
    }

    if (this.dog) {
      this.dog.barkCool = Math.max(0, this.dog.barkCool - dt);
      const d = Math.hypot(player.pos.x - this.dog.x, player.pos.z - this.dog.z);
      const range = player.crouch ? 4.5 : 8;
      if (d < range && this.dog.barkCool <= 0) {
        this.dog.barkCool = 2.4;
        this.dog.awake = true;
        this.events.push({ type: 'bark', x: this.dog.x, z: this.dog.z, dist: d });
      }
    }
    return this.events;
  }

  /* The nearest person the player could talk to, in daylight. */
  nearest(player, radius = 2.6) {
    let best = null, bd = radius;
    for (const p of this.people) {
      if (!p.awake || p.sleeper) continue;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  dynamics(out, time) {
    for (const p of this.people) {
      /*
       * Standing figures, with a walk cycle that never walks: the legs swing a
       * few degrees on a slow sine so they are not statues, and the sleepers
       * sway a little more than the daytime ones — which is the only
       * difference between the two, and it is enough.
       */
      const sway = p.sleeper
        ? Math.sin(time * 0.9 + p.phase) * 0.05
        : Math.sin(time * 1.6 + p.phase) * 0.02;
      const scream = p.screaming ? 0.06 * Math.sin(time * 26) : 0;
      out.push({ mesh: 'nTorso', x: p.x, y: 0.72, z: p.z, rot: p.yaw + sway });
      out.push({
        mesh: 'nHead', x: p.x, y: 1.55 + scream, z: p.z,
        rot: p.yaw + sway * 2,
        pitch: p.sleeper ? 0.22 : 0,
      });
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (const side of [-1, 1]) {
        const ox = 0.21 * side;
        out.push({
          mesh: 'nArm', x: p.x + ox * c, y: 1.38, z: p.z + ox * s,
          rot: p.yaw, pitch: sway * (p.screaming ? 8 : 1.5) * side,
        });
        const lx = 0.09 * side;
        out.push({
          mesh: 'nLeg', x: p.x + lx * c, y: 0.74, z: p.z + lx * s,
          rot: p.yaw, pitch: sway * 0.6 * side,
        });
      }
    }
    if (this.dog) {
      const d = this.dog;
      out.push({
        mesh: 'dog', x: d.x, y: 0, z: d.z,
        rot: d.yaw + (d.barkCool > 0 ? Math.sin(time * 18) * 0.12 : 0),
      });
    }
  }
}

/* How loud a scream is at a distance, for the whistler's hearing. Clamped
 * rather than falling off forever: a scream in this neighbourhood is heard
 * everywhere in it, and that is the point of it. */
export function screamLoudness(dist) {
  return clamp(1.4 - dist / 90, 0.6, 1.4);
}
