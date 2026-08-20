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

/*
 * The one place the neighbour skeleton is written down. renderer.js authors
 * every part hanging from its own joint at local zero, and these are where
 * those joints go, so the two files agree by construction rather than by
 * coincidence. That is exactly what went wrong before: the torso mesh carried
 * its own idea of where it belonged and was translated here as well, so it
 * ended up floating seventy centimetres above the head it was attached to.
 */
const HIP = 0.88;
const SHOULDER = 1.44;
const CROWN = 1.60;

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

  /*
   * What this person looks like, drawn once and kept. It is on the person
   * rather than on the draw call because a neighbour who changed height
   * between two frames would be far worse than ten who are all the same, and
   * because the daylight walk asks the player to recognise these people: the
   * one at 14 has to be the same shape at 3:33 as she was at four in the
   * afternoon. Seeded from the save like everything else in the street.
   */
  look() {
    return {
      tall: this.rng.range(0.93, 1.07),
      wide: this.rng.range(0.94, 1.09),
      look: this.rng.int(3),
    };
  }

  build() {
    const day = this.scene === 'day';
    const houses = this.layout.houses.filter((h) => !h.abandoned && !h.home);

    if (day) {
      /* Everyone is out. Mowing, watering, standing by the mailbox with the
       * post in their hand, being pleased to see you. */
      for (const h of houses) {
        const s = h.sign;
        const x = h.x + this.rng.range(-2.5, 2.5);
        const z = s * (PLAN.frontZ - this.rng.range(4.5, 7.5));
        this.people.push({
          houseId: h.id,
          name: h.occupant.name,
          x,
          z,
          yaw: s > 0 ? 0 : Math.PI,
          awake: true,
          sleeper: false,
          phase: this.rng.range(0, 6.28),
          talkedTo: false,
          /*
           * The patch of their own front garden they mill about in. Kept off
           * the path and well short of the kerb: a neighbour who wanders into
           * the road is a neighbour the player expects to be able to run over,
           * and this game has no answer to that.
           */
          plot: {
            x0: h.x - h.w / 2 - 1.2, x1: h.x + h.w / 2 + 1.2,
            z0: Math.min(s * (PLAN.frontZ - 8.5), s * (PLAN.frontZ - 2.6)),
            z1: Math.max(s * (PLAN.frontZ - 8.5), s * (PLAN.frontZ - 2.6)),
          },
          /* Where they go at eight: their own front door. */
          door: { x: h.x, z: h.frontZ - s * 1.1 },
          tx: x, tz: z,
          wait: this.rng.range(0.4, 3.0),
          speed: this.rng.range(0.62, 0.92),
          stride: this.rng.range(0, 6.28),
          moving: false,
          goingIn: false,
          inside: false,
          ...this.look(),
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
        ...this.look(),
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
  /*
   * The afternoon, walking.
   *
   * They pick a spot in their own front garden, walk to it, stand for a few
   * seconds and pick another — which is not a simulation of anything, and does
   * not need to be. What it buys is that the street is alive when the player
   * arrives and empty when they come back, and that the person who has the
   * clue is somewhere in a garden rather than nailed to a mark on the lawn.
   *
   * At eight they all go in at once. There is no announcement: the player
   * either notices the street emptying or finds out at 3:33 that they never
   * asked anybody about the fuse box.
   */
  walk(dt, day) {
    if (!day) return;
    const inside = day.insideYet;
    for (const p of this.people) {
      if (p.sleeper || p.inside) continue;
      if (inside && !p.goingIn) {
        p.goingIn = true;
        p.tx = p.door.x;
        p.tz = p.door.z;
        p.wait = 0;
      }
      if (p.wait > 0) {
        p.wait -= dt;
        p.moving = false;
        continue;
      }
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.22) {
        if (p.goingIn) {
          /* Through their own front door, and that is the last of them until
           * tomorrow afternoon. */
          p.inside = true;
          p.moving = false;
          continue;
        }
        p.moving = false;
        p.wait = 1.6 + this.rng.range(0, 4.5);
        p.tx = this.rng.range(p.plot.x0, p.plot.x1);
        p.tz = this.rng.range(p.plot.z0, p.plot.z1);
        continue;
      }
      /* Hurrying, once it is eight: nobody strolls to their own door when the
       * light has gone. */
      const v = p.speed * (p.goingIn ? 1.7 : 1);
      const step = Math.min(d, v * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.stride += step * 3.1;
      p.moving = true;
      /* Turning takes a moment, so they lean into a corner instead of
       * snapping round it. */
      const want = Math.atan2(-dx, -dz);
      let turn = want - p.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      p.yaw += turn * Math.min(1, dt * 6);
    }
  }

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
      if (!p.awake || p.sleeper || p.inside) continue;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  dynamics(out, time) {
    for (const p of this.people) {
      /* Gone in for the evening: nothing to draw, and the game has to stop
       * offering to talk to somebody who is not there. */
      if (p.inside) continue;
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
      /*
       * Every joint height is multiplied by this person's own height and every
       * part is scaled to match, so a tall neighbour is tall all the way down
       * rather than a standard body with the head moved up. The head is the
       * one exception: it rides higher but is not itself scaled, because a
       * head that grows with the body is how a figure becomes a doll, and
       * because real heads vary far less than real heights do.
       */
      /*
       * The gait, driven by distance covered rather than by the clock, so a
       * person who has stopped has their feet on the ground instead of
       * marching on the spot — which is the single thing that most gives away
       * a walk cycle bolted onto a position.
       */
      const gait = p.moving ? Math.sin(p.stride) : 0;
      const swing = p.moving ? Math.cos(p.stride) * 0.06 : 0;
      const h = p.tall, w = p.wide;
      const look = p.look;
      out.push({
        mesh: 'nTorso' + look, x: p.x, y: SHOULDER * h + Math.abs(swing) * 0.5, z: p.z,
        rot: p.yaw + sway, sy: h, sx: w, sz: w,
      });
      out.push({
        mesh: 'nHead', x: p.x, y: CROWN * h + scream + Math.abs(swing) * 0.5, z: p.z,
        rot: p.yaw + sway * 2,
        pitch: p.sleeper ? 0.22 : 0,
      });
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (const side of [-1, 1]) {
        const ox = 0.205 * side * w;
        out.push({
          mesh: 'nArm' + look, x: p.x + ox * c, y: SHOULDER * h - 0.055,
          z: p.z + ox * s,
          /* Arms opposite the legs, which is the half of a walk cycle that
           * costs nothing and that the eye checks first. */
          rot: p.yaw,
          pitch: sway * (p.screaming ? 8 : 1.5) * side - gait * 0.42 * side,
          sy: h, sx: w, sz: w,
        });
        const lx = 0.082 * side * w;
        out.push({
          mesh: 'nLeg' + look, x: p.x + lx * c, y: HIP * h, z: p.z + lx * s,
          rot: p.yaw, pitch: sway * 0.6 * side + gait * 0.52 * side,
          sy: h, sx: w, sz: w,
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
