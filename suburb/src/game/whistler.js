/*
 * whistler.js — the woman in the street.
 *
 * She is the only antagonist in the game and she has four states: drifting,
 * listening, hunting, and gone. Everything else about her is in the numbers,
 * and the numbers are chosen so that a player can learn her rather than
 * memorise her:
 *
 *   - she moves along the walk graph, not in straight lines, so she comes
 *     round the side of a house the way a person searching would;
 *   - she hears. Every footstep is an event with a loudness, and a loud one
 *     brings her to where it happened. Running is the fastest way across the
 *     street and the surest way to be found;
 *   - she does not resolve a person who is not moving beyond about eight
 *     metres. That is the game's one real defence, and it is a hard one to
 *     use, because the correct response to seeing her is to stand perfectly
 *     still while she comes towards you;
 *   - she drifts over fences and hedges but not through houses. That is a
 *     rule about her, not a shortcut: it is why a garden is never safe and a
 *     locked house is — until the sixth night.
 *
 * Being seen is not instant. Suspicion fills at a rate that depends on
 * distance, on what you are doing and on what is lighting you, and the HUD
 * shows it filling. A player who is caught should always be able to say what
 * they did wrong, and an instant fail state at 30 metres cannot be argued
 * with.
 */

import { clamp, damp, angleDelta, approachAngle, pointSegment2 } from '../core/math.js';
import { rngFrom } from '../core/rng.js';

export const STATE = {
  DRIFT: 'drift',
  LISTEN: 'listen',
  HUNT: 'hunt',
  GONE: 'gone',
};

const EYE = 1.68;
const CATCH = 1.15;

export class Whistler {
  constructor(layout, cfg, seed) {
    this.layout = layout;
    this.cfg = cfg;
    this.rng = rngFrom(((seed | 0) ^ 0x77157) + cfg.n * 7919);
    this.graph = layout.graph;

    /*
     * She starts at the far end of the street from your front door. Not
     * random: on the first night the player needs to walk out of their own
     * house and see the neighbourhood before they see her, and a spawn roll
     * that occasionally puts her on the doorstep turns night one into a coin
     * toss.
     */
    const home = layout.home;
    let far = 0, best = -1;
    for (let i = 0; i < this.graph.nodes.length; i++) {
      const n = this.graph.nodes[i];
      if (n.kind !== 'road') continue;
      const d = Math.hypot(n.x - home.x, n.z - home.frontZ);
      if (d > best) { best = d; far = i; }
    }
    this.node = far;
    this.pos = { x: this.graph.nodes[far].x, z: this.graph.nodes[far].z };
    this.yaw = 0;
    this.state = STATE.DRIFT;
    this.target = { x: this.pos.x, z: this.pos.z };
    this.path = [];
    this.awareness = 0;
    this.lastSeen = null;
    this.lostFor = 0;
    this.pause = 0;
    this.bob = 0;
    this.visible = false;
    this.dist = 999;
    this.events = [];
    this.hunted = 0;         /* how long this hunt has been going on        */
    this.didCatch = false;
    this.heard = 0;          /* decays; drives the "she is listening" cue   */
  }

  /* ---------------------------------------------------------------- *
   * Hearing
   * ---------------------------------------------------------------- */

  /*
   * A noise at (x,z) with a loudness. Distance falls off fast — 1.0 carries
   * about thirty metres, 0.2 about eight — and a wall between makes it much
   * less. She does not know what made it, only where.
   */
  hear(x, z, level, world) {
    if (this.state === STATE.HUNT || this.state === STATE.GONE) return;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    let carry = level * 30;
    if (!world.lineOfSight(this.pos.x, EYE, this.pos.z, x, 1.2, z)) carry *= 0.45;
    if (d > carry) return;
    this.heard = clamp(this.heard + level * 0.8, 0, 1);
    /* A quiet noise nudges her; a loud one turns her round and brings her. */
    if (level > 0.35 || this.state === STATE.LISTEN) {
      this.state = STATE.LISTEN;
      this.lastSeen = { x, z };
      this.path = this.pathTo(x, z);
      this.lostFor = 0;
      this.events.push({ type: 'heard', x, z, level });
    }
  }

  /* ---------------------------------------------------------------- *
   * Seeing
   * ---------------------------------------------------------------- */

  /*
   * How fast suspicion fills, per second, right now. Zero means she cannot
   * see the player at all. The multipliers are the game's whole vocabulary of
   * risk, and they are meant to be learnable in that order: light is worse
   * than speed, speed is worse than posture.
   */
  noticeRate(player, world, lit) {
    /* Distance first, always. It drives the heartbeat and the audio mix, and
     * returning early without it freezes both — so hiding in a wardrobe made
     * the room go calm while she walked up to it, which is precisely backwards. */
    this.dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (player.hidden) {
      /* Hiding works, until the night she opens wardrobes. */
      if (!this.cfg.entersHouses) return 0;
      return this.dist < 2.2 ? 1.8 : 0;
    }
    const px = player.pos.x, pz = player.pos.z;
    const py = player.pos.y + player.eye;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const d = this.dist;
    if (d > this.cfg.sight) return 0;

    /* Her forward is -Z rotated by yaw, matching the camera convention. */
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const cosA = (dx * fx + dz * fz) / Math.max(d, 0.001);
    const half = Math.cos((this.cfg.cone / 2) * Math.PI / 180);
    /* Right up against her there is no cone: something a metre away is felt,
     * not seen. */
    if (cosA < half && d > 2.5) return 0;

    if (!world.lineOfSight(this.pos.x, EYE, this.pos.z, px, py, pz)) return 0;

    const prox = clamp(1 - d / this.cfg.sight, 0, 1);
    let rate = 1.5 * this.cfg.notice * (0.30 + 1.25 * prox);

    /* Standing absolutely still. The distance cut-off is what makes it a
     * decision instead of a cheat: inside eight metres it barely helps. */
    if (player.frozen) rate *= d > 8 ? 0.10 : 0.55;
    if (player.crouch) rate *= 0.62;
    if (player.speed > 3.4) rate *= 1.5;
    if (player.torchOn) rate *= 2.4;
    /* The flag is red and it catches every lamp on the street. Carrying it is
     * supposed to be the hardest part of the night, not the victory lap. */
    if (player.carrying) rate *= 1.5;
    rate *= 1 + clamp(lit, 0, 2) * 0.55;
    return rate;
  }

  /* ---------------------------------------------------------------- *
   * Moving
   * ---------------------------------------------------------------- */

  /* Breadth-first over the walk graph. Seventy-odd nodes, so this is free,
   * and it is what makes her come round a house rather than stand pressed
   * against the far side of it. */
  pathTo(x, z) {
    const nodes = this.graph.nodes;
    const from = this.nearestNode(this.pos.x, this.pos.z);
    const to = this.nearestNode(x, z);
    if (from === to) return [{ x, z }];
    const prev = new Int32Array(nodes.length).fill(-1);
    const seen = new Uint8Array(nodes.length);
    const q = [from];
    seen[from] = 1;
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      if (cur === to) break;
      for (const nx of this.graph.adj[cur]) {
        if (seen[nx]) continue;
        seen[nx] = 1;
        prev[nx] = cur;
        q.push(nx);
      }
    }
    if (!seen[to]) return [{ x, z }];
    const out = [];
    for (let cur = to; cur !== -1 && cur !== from; cur = prev[cur]) {
      out.unshift({ x: nodes[cur].x, z: nodes[cur].z });
    }
    out.push({ x, z });
    return out;
  }

  nearestNode(x, z) {
    let best = 0, bd = 1e9;
    const nodes = this.graph.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /*
   * She glides. Fences, hedges, bins and cars are nothing to her; houses are
   * not. Rather than a collision pass, she simply refuses to cross a wall:
   * if the step would put her inside a house she is not allowed in, she stops
   * and re-paths. It reads as her going round, and it never wedges.
   */
  step(dt, world, speed) {
    const t = this.path.length ? this.path[0] : this.target;
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      if (this.path.length) this.path.shift();
      return;
    }
    const nx = this.pos.x + (dx / d) * speed * dt;
    const nz = this.pos.z + (dz / d) * speed * dt;
    if (!this.blocked(nx, nz, world)) {
      this.pos.x = nx;
      this.pos.z = nz;
      this.stuck = 0;
    } else {
      /*
       * Something is in the way. Three answers, in order, and all three are
       * needed — the first version applied a blind sideways nudge, which
       * unwedged her by walking through the corner of the house it had just
       * refused to let her walk through, and the second version applied the
       * nudge only when it was clear, which left her standing against a shut
       * front door for two thirds of a night.
       */
      const lx = -dz / d, lz = dx / d;
      let slid = false;
      /* 1. Slide along whatever it is, either way round. */
      for (const sgn of [this.slideDir || 1, -(this.slideDir || 1)]) {
        const sx = this.pos.x + lx * sgn * speed * dt;
        const sz = this.pos.z + lz * sgn * speed * dt;
        if (!this.blocked(sx, sz, world)) {
          this.pos.x = sx;
          this.pos.z = sz;
          this.slideDir = sgn;
          slid = true;
          break;
        }
      }
      this.stuck = (this.stuck || 0) + dt;
      /* 2. Still going nowhere after a second: this waypoint is not worth it. */
      if (!slid && this.stuck > 1.0) {
        this.path.shift();
        if (!this.path.length) {
          const roam = this.pickRoam();
          this.path = this.pathTo(roam.x, roam.z);
        }
        this.slideDir = -(this.slideDir || 1);
      }
      /* 3. Four seconds boxed in cannot happen and would be unrecoverable if
       * it did, so it is allowed to end the only way it can: she is not
       * entirely a person, and she goes through. */
      if (this.stuck > 4) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.stuck = 0;
      }
    }
    this.yaw = approachAngle(this.yaw, Math.atan2(-dx, -dz), dt * 2.6);
  }

  /*
   * What she will not cross. Fences, hedges, cars and bins are nothing to her;
   * the shell of a house is, until the night she starts coming inside.
   *
   * A closed front door counts as part of the shell, and leaving it out was
   * not a small omission: the door is its own box rather than part of the
   * wall, so she walked through every shut front door in the street on every
   * night of the game — which quietly deleted the difference night six is
   * built around. An open door is a hole, and its box goes non-solid when it
   * swings, so the same test covers both.
   */
  blocked(x, z, world) {
    const list = world.near(x - 0.4, z - 0.4, x + 0.4, z + 0.4, this._tmp || (this._tmp = []));
    for (const b of list) {
      const shell = b.tag === 'house' || b.tag === 'garage' || b.tag === 'wall'
        || (b.tag === 'door' && b.solid);
      if (!shell && b.tag !== 'boundary') continue;
      if (this.cfg.entersHouses && b.tag !== 'boundary') continue;
      if (x + 0.3 > b.x0 && x - 0.3 < b.x1 && z + 0.3 > b.z0 && z - 0.3 < b.z1
        && b.y1 > 1.0) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * The tick
   * ---------------------------------------------------------------- */

  update(dt, player, world, lit) {
    this.events.length = 0;
    if (this.state === STATE.GONE) return;
    this.heard = Math.max(0, this.heard - dt * 0.25);
    this.bob += dt;

    const rate = this.noticeRate(player, world, lit);
    this.visible = rate > 0;

    if (this.state !== STATE.HUNT) {
      if (rate > 0) {
        this.awareness = clamp(this.awareness + rate * dt, 0, 1);
        this.lastSeen = { x: player.pos.x, z: player.pos.z };
        /* She turns towards whatever she is half-seeing, which is the tell
         * that the player has been noticed before the meter says so. */
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        this.yaw = approachAngle(this.yaw, Math.atan2(-dx, -dz), dt * 1.4);
        if (this.awareness >= 1) this.startHunt();
      } else {
        /* Losing you is slow when she is close: she stands where she thought
         * you were and looks. */
        const decay = this.dist < 10 ? 0.22 : 0.5;
        this.awareness = clamp(this.awareness - decay * dt, 0, 1);
      }
    }

    switch (this.state) {
      case STATE.DRIFT: this.drift(dt, world); break;
      case STATE.LISTEN: this.listen(dt, world); break;
      case STATE.HUNT: this.hunt(dt, player, world); break;
      default: break;
    }
    return this.events;
  }

  /*
   * Drifting is not a random walk.
   *
   * The first version stepped to a random neighbouring node each time it
   * arrived, with a small bias against doubling back — and simulating whole
   * nights showed what that actually produces: on night one she covered 175
   * metres in five minutes and never left one corner of the neighbourhood,
   * visiting six of the sixty ten-metre squares in it. A player could walk the
   * entire street, twice, past her own house, and never be noticed. A random
   * walk on a graph does not explore, it loiters.
   *
   * So she picks somewhere to be — a node at least thirty-five metres off,
   * never the one she came from — paths to it, and walks the whole way, with
   * the odd stop to turn and look. That reads as searching, and it means the
   * far end of the street is never safe just because she started at the other
   * one.
   */
  drift(dt, world) {
    if (this.pause > 0) {
      this.pause -= dt;
      /* A slow look round while she is stopped. Standing perfectly still and
       * then moving off in the same direction reads as a machine. */
      this.yaw += dt * 0.5 * (this.turnDir || 1);
      return;
    }
    if (!this.path.length) {
      this.node = this.nearestNode(this.pos.x, this.pos.z);
      const target = this.pickRoam();
      this.path = this.pathTo(target.x, target.z);
      /* A pause between legs, not between steps: stopping every twelve metres
       * is a patrol, stopping every two is a stutter. */
      if (this.rng.chance(0.45)) {
        this.pause = this.rng.range(1.0, 2.6);
        this.turnDir = this.rng.chance(0.5) ? 1 : -1;
      }
    }
    this.step(dt, world, this.cfg.speed);
  }

  /* Somewhere worth walking to: far enough to be a journey, and weighted
   * towards the roads and the gardens rather than dead ends. */
  pickRoam() {
    const nodes = this.graph.nodes;
    const far = [];
    for (const n of nodes) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      if (d < 35) continue;
      /* Front gardens and back gardens count twice: the road is how she gets
       * around, but the gardens are where a person hiding would be. */
      far.push(n);
      if (n.kind === 'front' || n.kind === 'back') far.push(n);
    }
    if (!far.length) return nodes[this.rng.int(nodes.length)];
    return far[this.rng.int(far.length)];
  }

  listen(dt, world) {
    this.step(dt, world, this.cfg.speed * 1.5);
    if (!this.path.length) {
      this.lostFor += dt;
      /* She stands over the noise for a few seconds, turning. */
      this.yaw += dt * 0.8;
      if (this.lostFor > 4) {
        this.state = STATE.DRIFT;
        this.lostFor = 0;
        this.node = this.nearestNode(this.pos.x, this.pos.z);
      }
    }
  }

  startHunt() {
    this.state = STATE.HUNT;
    this.awareness = 1;
    this.hunted = 0;
    this.path = [];
    this.events.push({ type: 'spotted' });
  }

  hunt(dt, player, world) {
    this.hunted += dt;
    const near = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 4;
    /*
     * The close-range clause exists so that a hunt does not end because the
     * player stepped behind her — at four metres she has you whether or not
     * you are in the cone. It still has to respect a wall: without the sight
     * test she keeps "seeing" you through the front of your own house, walks
     * at the wall, and catches you through it.
     */
    const seen = this.noticeRate(player, world, 1) > 0
      || (near && world.lineOfSight(this.pos.x, EYE, this.pos.z,
        player.pos.x, player.pos.y + player.eye, player.pos.z));
    if (seen) {
      this.lastSeen = { x: player.pos.x, z: player.pos.z };
      this.lostFor = 0;
      this.path = [];
      this.target = this.lastSeen;
      /* Straight at you, over everything except walls. */
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = this.cfg.huntSpeed;
      const nx = this.pos.x + (dx / d) * speed * dt;
      const nz = this.pos.z + (dz / d) * speed * dt;
      if (this.blocked(nx, nz, world)) {
        this.path = this.pathTo(player.pos.x, player.pos.z);
        this.step(dt, world, speed);
      } else {
        this.pos.x = nx;
        this.pos.z = nz;
        this.yaw = approachAngle(this.yaw, Math.atan2(-dx, -dz), dt * 5);
      }
      /* Once, and not through a wall. The event ends the night, and a night can
       * only end once — but anything else listening (a sound, a screen shake)
       * would otherwise fire thirty times a second for as long as she stood on
       * top of you. */
      const reach = d < CATCH && world.lineOfSight(this.pos.x, 1.2, this.pos.z,
        player.pos.x, player.pos.y + 1.2, player.pos.z);
      if (reach && !this.didCatch) {
        this.didCatch = true;
        this.events.push({ type: 'caught' });
      }
    } else {
      this.lostFor += dt;
      if (!this.path.length && this.lastSeen) {
        this.path = this.pathTo(this.lastSeen.x, this.lastSeen.z);
      }
      this.step(dt, world, this.cfg.huntSpeed * 0.8);
      /*
       * Giving up. Six seconds without sight is a long time to stand in a
       * wardrobe listening to somebody breathe outside it, and it is the only
       * way a hunt ever ends other than being caught.
       */
      if (this.lostFor > 6) {
        this.state = STATE.LISTEN;
        this.awareness = 0.55;
        this.lostFor = 0;
        this.events.push({ type: 'lost' });
      }
    }
  }

  /* Everything the audio needs, in camera space: +x is the player's right,
   * -z is straight ahead. Doing the rotation here means the audio module
   * never has to know what a yaw is. */
  listener(cam, world) {
    const dx = this.pos.x - cam.x, dz = this.pos.z - cam.z;
    const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw);
    return {
      dx: dx * c - dz * s,
      dz: dx * s + dz * c,
      dist: Math.hypot(dx, dz),
      hunting: this.state === STATE.HUNT,
      visible: world
        ? world.lineOfSight(this.pos.x, EYE, this.pos.z, cam.x, cam.y, cam.z)
        : true,
    };
  }

  /*
   * Her body, as a list of dynamic draws.
   *
   * The hover is 12cm and slow. Too much and she reads as a balloon; none at
   * all and the missing footsteps become obvious. The head tilt is the
   * suspicion state made visible — thirty degrees, which is enough to see
   * across a street and not enough to look like an animation — and the jaw
   * stays open for two seconds after the whistle stops, because that is the
   * gap the player is listening into.
   */
  dynamics(out, dt = 0) {
    if (this.state === STATE.GONE) return;
    const hunting = this.state === STATE.HUNT;
    const hover = 0.12 + Math.sin(this.bob * 1.1) * 0.03;
    const sway = Math.sin(this.bob * (hunting ? 5.5 : 1.6)) * (hunting ? 0.5 : 0.13);

    /* Suspicion tips the head over; a hunt straightens it. */
    const wantTilt = hunting ? 0 : this.awareness * 0.52;
    this.tilt = damp(this.tilt || 0, wantTilt, 3, dt || 0.016);
    /* Open while she is whistling or screaming, and two seconds behind on the
     * way back. */
    const wantJaw = hunting ? 1 : 0.55;
    this.jaw = this.jaw === undefined ? wantJaw
      : damp(this.jaw, wantJaw, hunting ? 9 : 0.5, dt || 0.016);

    out.push({ mesh: 'wTorso', x: this.pos.x, y: hover, z: this.pos.z, rot: this.yaw });
    const headY = hover + 2.15;
    const headYaw = this.yaw + (hunting ? 0 : Math.sin(this.bob * 0.7) * 0.35);
    out.push({ mesh: 'wHead', x: this.pos.x, y: headY, z: this.pos.z, rot: headYaw,
      pitch: this.tilt });
    out.push({
      mesh: 'wJaw', x: this.pos.x, y: headY - 0.05, z: this.pos.z, rot: headYaw,
      /* Hinged at the top, so this swings the whole jaw down and open. */
      pitch: this.tilt - 0.35 - this.jaw * 0.75,
    });
    out.push({
      mesh: 'wHair', x: this.pos.x, y: headY, z: this.pos.z, rot: headYaw,
      /* It lifts when she hunts. Not far — just enough that a face is nearly
       * there for the last few metres. */
      sy: hunting ? 0.72 : 1, sx: 1, sz: 1,
      pitch: hunting ? -0.35 : 0,
    });

    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const side of [-1, 1]) {
      const ox = 0.2 * side;
      out.push({
        mesh: 'wArm',
        x: this.pos.x + ox * c, y: hover + 1.88, z: this.pos.z + ox * s,
        rot: this.yaw,
        /* Hanging when she drifts; raised and reaching when she is not. */
        pitch: hunting ? -1.2 + sway * 0.2 : sway * 0.35,
      });
    }
  }
}

/* How much noise a moving player has made along a segment, for the tests and
 * for the "she heard you" cue: distance from her to the line the player walked
 * rather than to where they ended up. */
export function noiseDistance(w, ax, az, bx, bz) {
  return pointSegment2(w.pos.x, w.pos.z, ax, az, bx, bz);
}

/* Exposed for the HUD: a 0..1 that is what the suspicion ring shows. Damped so
 * the ring does not jitter on a frame where line of sight flickers through a
 * picket fence. */
export function smoothAwareness(prev, w, dt) {
  return damp(prev, w.awareness, 9, dt);
}

export { angleDelta };
