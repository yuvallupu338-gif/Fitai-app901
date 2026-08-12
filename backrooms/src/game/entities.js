/*
 * entities.js — the things that are also here.
 *
 * Thirteen behaviours, and none of them is a combat AI. Each one asks the player
 * to do something different, which is the only reason to have more than one:
 *
 *   hound    hunts. Runs at you the moment it has line of sight, and keeps
 *            coming. The only counter is distance and doors.
 *   watcher  moves only when you are not looking at it. Turn around and it is
 *            exactly where it was; turn back and it is closer. This is the
 *            cheapest genuinely unsettling behaviour in games and it has never
 *            stopped working.
 *   crawler  low and fast, lives in the dark, and is drawn to your torch.
 *   shade    a silhouette with eyes, on the levels dark enough that a body
 *            would only ever be seen as one anyway.
 *   smiler   a pair of eyes with nothing round them. Comes on in the dark and
 *            backs off from the torch beam, so the counter is to point the
 *            light at it — and the cost is that the torch has a battery.
 *   lurker   stands perfectly still, at the edge of sight, indistinguishable
 *            from the furniture, until you walk inside its radius. Then it is
 *            very fast for a very short time. Punishes walking incuriously.
 *   stalker  holds a fixed distance and circles. It will not close while you
 *            face it and it will not leave, so it turns a level into a thing
 *            you are crossing with company.
 *   swarm    several small ones at once, deaf until you sprint. The counter is
 *            patience, which is expensive when something else is behind you.
 *   titan    three and a half metres, slow, and it does not stop, ever. You
 *            cannot outrun it forever in a corridor; you have to break line of
 *            sight and mean it.
 *   blind    cannot see at all. It walks to wherever you last made a noise,
 *            not to where you are, so it can be sent to the wrong end of the
 *            level by running once and then going quiet.
 *   dropper  hangs on the ceiling doing nothing until you walk underneath it.
 *            The only counter is to look up, which nobody does.
 *   twin     stands exactly opposite you across a fixed point and copies every
 *            step mirrored, so the gap between you is always twice your own
 *            distance from that point. Backing away from it is safe and works;
 *            what it actually does is take one part of the level away, because
 *            anything on the far side has to be reached through the middle,
 *            and the middle is where the two of you arrive together.
 *   leech    latches on and rides. It barely hurts; what it does is slow you
 *            down, with everything else on the level still coming.
 *
 * All of them route round the architecture rather than pressing into it — see
 * pathfind.js. An entity that walks into a wall and stays there is not a
 * monster, it is a bug you can stand next to.
 *
 * They are spawned in a shell around the player and despawned when they fall
 * behind, so a level has a population without the game tracking one.
 */

import { hash2 } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { findPath, clearLine } from './pathfind.js';

/*
 * `mesh` picks the model; `speed`, `sight`, `reach`, `damage` are the numbers
 * the shared movement code reads. Everything that makes a kind *feel* like
 * itself is in the decision block in update(), not here.
 *
 * `height` is how far the model actually reaches above the floor, and it is
 * here rather than in a comment because the world suite reads it: a level may
 * not be given a kind that does not fit under its ceiling. The titan is the
 * reason — at 1.85× a biped it stands 3.22m, which rules out most interiors,
 * and "it clips through the ceiling on level 20" is not something a screenshot
 * of level 0 would ever have shown.
 */
const BEHAVIOUR = {
  hound:   { mesh: 'biped',   speed: 3.6, sight: 26, reach: 1.15, damage: 0.34, hp: 3, height: 1.74 },
  watcher: { mesh: 'biped',   speed: 2.4, sight: 30, reach: 1.05, damage: 0.28, hp: 3, height: 1.74 },
  crawler: { mesh: 'crawler', speed: 3.9, sight: 15, reach: 0.95, damage: 0.22, hp: 2, height: 0.52 },
  /*
   * A shape rather than a body: a dark silhouette with two lit eyes, which is
   * the oldest image in this mythology and still the most effective one. It
   * does not need limbs because you are never meant to see it resolve — at
   * fog distance it is a hole in the room with something looking out of it.
   */
  shade:   { mesh: 'shade',   speed: 3.0, sight: 34, reach: 1.10, damage: 0.30, hp: 3, height: 1.95 },
  /* Nothing but the eyes. Fast in the dark, and it will not come into light. */
  smiler:  { mesh: 'smiler',  speed: 4.2, sight: 30, reach: 1.00, damage: 0.26, hp: 2, height: 1.72 },
  /* Slow-looking until it is not. `speed` here is the charge, not the walk. */
  lurker:  { mesh: 'biped',   speed: 5.4, sight: 9,  reach: 1.10, damage: 0.40, hp: 3, height: 1.74 },
  /* Slightly faster than a walk and slightly slower than a sprint, on purpose:
   * it stays with you while you walk and falls behind if you commit to running,
   * which is the trade the whole behaviour exists to offer. */
  stalker: { mesh: 'biped',   speed: 3.2, sight: 40, reach: 1.05, damage: 0.24, hp: 3, height: 1.74 },
  /* Individually trivial, and they do not arrive individually. */
  swarm:   { mesh: 'crawler', speed: 4.4, sight: 18, reach: 0.85, damage: 0.12, hp: 1, height: 0.52 },
  /* Reach and damage scale with the size of the thing. It does not need speed. */
  titan:   { mesh: 'titan',   speed: 1.9, sight: 44, reach: 2.10, damage: 0.55, hp: 6, height: 3.22 },
  /* `sight: 0` is not a placeholder — it cannot see at all, and everything it
   * does is driven by the noise map instead. */
  blind:   { mesh: 'blind',   speed: 3.4, sight: 0,  reach: 1.15, damage: 0.32, hp: 3, height: 1.74 },
  /* Lives on the ceiling. `speed` applies only after it has come down. */
  dropper: { mesh: 'dropper', speed: 4.6, sight: 12, reach: 0.95, damage: 0.36, hp: 2, height: 0.52 },
  /* Its position is a reflection of yours, so `speed` never applies. */
  twin:    { mesh: 'biped',   speed: 0,   sight: 60, reach: 1.10, damage: 0.30, hp: 4, height: 1.74 },
  /* Trivial damage per bite. The cost of a leech is what it does to your legs. */
  leech:   { mesh: 'crawler', speed: 4.0, sight: 16, reach: 0.90, damage: 0.10, hp: 1, height: 0.52 },
};

/* How many of a kind may exist at once, before the depth bonus. A swarm that
 * capped at four would not be a swarm; a twin that came in pairs would not be
 * a reflection. */
const CROWD = { swarm: 7, smiler: 3, titan: 1, lurker: 2, twin: 1, leech: 3, dropper: 3, blind: 2 };

export class Entities {
  constructor(level, world) {
    this.level = level;
    this.world = world;
    this.spec = level.entities;
    this.list = [];
    this.events = [];
    this.spawnTimer = 2;
    /* More of them the deeper you are. The level's own density still sets the
     * character of the place; depth just adds pressure on top of it, and the
     * ceiling is per-kind because "how many of these are reasonable" is a
     * property of the thing, not of the level. */
    const cap = this.spec ? (CROWD[this.spec.kind] ?? 4) : 0;
    this.max = this.spec
      ? Math.min(cap, Math.max(1, Math.round(this.spec.density * cap))
        + Math.floor(level.id / 34))
      : 0;
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
    /* `??` and not `||`: a level (or a test) that asks for speed 0 means it,
     * and `||` quietly hands back the default instead, so the one setting that
     * exists to hold something still was the one setting that did nothing. */
    const speed = this.spec.speed ?? B.speed;
    const fx = -Math.sin(player.yaw) * Math.cos(player.pitch);
    const fz = -Math.cos(player.yaw) * Math.cos(player.pitch);

    /*
     * How much noise the player is making, read off the velocity they actually
     * achieved rather than off the sprint key: being shoved along by a slope
     * or wading out of water is just as loud, and a flag would miss it. A walk
     * is 2.85 m/s and a sprint 4.7, so the line sits between them. Crouching
     * is silent at any speed — that is the deal it offers.
     */
    const planar = Math.hypot(player.vel.x, player.vel.z);
    const loud = !player.crouch && planar > 3.6;

    /*
     * Where the last noise was, and how stale it is. This is the whole world
     * as far as a blind one is concerned: it walks to the place, not to the
     * person, so a player who sprints once and then crouches has sent it to
     * an empty room and can walk out behind it.
     */
    if (loud) this.noise = { x: player.pos.x, z: player.pos.z, at: time };
    else if (this.noise && time - this.noise.at > 12) this.noise = null;

    /* Recounted every frame from whatever is actually holding on, so a leech
     * that despawns or gets shaken off stops slowing the player immediately
     * rather than leaving a limp that never wears off. */
    player.grabbed = 0;

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

      /*
       * `mode` is where the kinds actually differ. Everything downstream —
       * pathing, stepping, facing, gait — is shared; only the question "where
       * am I trying to be" changes, and that is enough to make nine things
       * that feel nothing like each other.
       *
       *   chase  head for the player
       *   flee   get away from the player
       *   orbit  hold a radius and circle it
       *   (none) stand still
       */
      let move = false;
      let mode = 'chase';
      /* Where `chase` is heading. Almost always the player; a blind one heads
       * for a remembered noise instead, which is the only reason this is a
       * variable rather than `player.pos`. */
      let goalX = player.pos.x, goalZ = player.pos.z;
      const kind = this.spec.kind;

      if (kind === 'watcher') {
        move = sees && !watched;
        if (watched && !e.frozen) {
          e.frozen = true;
          this.events.push({ type: 'freeze', dist });
        }
        if (!watched) e.frozen = false;

      } else if (kind === 'crawler') {
        move = sees || dist < 8 || (player.flashlightOn && dist < 20);

      } else if (kind === 'smiler') {
        /*
         * Held off by the torch, and only by the torch. `inBeam` is the same
         * cone the renderer lights with, so what the player sees lit is what
         * the smiler reacts to — if these two ever disagree the behaviour
         * reads as random, which is worse than no behaviour at all.
         */
        const inBeam = player.flashlightOn && dist < 18
          && (fx * toX + fz * toZ) > 0.91;
        if (inBeam) { move = dist < 14; mode = 'flee'; }
        else { move = sees || dist < 12; mode = 'chase'; }

      } else if (kind === 'lurker') {
        /*
         * Standing still is the whole disguise, so it must not drift, sway or
         * turn while it waits — anything that moves in the corner of the eye
         * is read as alive immediately. Once triggered it stays triggered:
         * backing out of the radius does not put it away again.
         */
        if (!e.alerted && dist < (this.spec.trigger ?? 6.5) && sees) {
          e.alerted = true;
          this.events.push({ type: 'lunge', dist });
        }
        move = e.alerted;

      } else if (kind === 'stalker') {
        /*
         * Keeps its distance while you look at it and closes the moment you
         * do not, which makes turning round cost you ground every time. The
         * radius is a band rather than a number so it does not judder between
         * advancing and retreating on the boundary.
         */
        const hold = this.spec.hold ?? 9;
        if (!sees) { move = false; }
        else if (!watched) { move = true; mode = 'chase'; }
        else if (dist < hold - 1.5) { move = true; mode = 'flee'; }
        else if (dist > hold + 2.5) { move = true; mode = 'chase'; }
        else { move = true; mode = 'orbit'; }

      } else if (kind === 'swarm') {
        /*
         * Deaf until you make noise. Crouching is silent at any speed, which
         * gives the player a real decision rather than a rule to memorise:
         * cross slowly and safely, or quickly and with company.
         */
        move = loud || dist < 5 || e.alerted;
        if (loud && sees) e.alerted = true;

      } else if (kind === 'titan') {
        /* It never loses interest. That is the entire design. */
        if (sees) e.alerted = true;
        move = e.alerted;

      } else if (kind === 'blind') {
        /*
         * It has no eyes and `sees` is always false for it. What it has is the
         * last place a noise came from, and it goes there — not to you. Two
         * consequences worth having: standing still while it walks past is
         * genuinely safe, and one sprint in the wrong direction moves it off
         * you for as long as the memory lasts.
         */
        if (this.noise) {
          goalX = this.noise.x; goalZ = this.noise.z;
          const gone = Math.hypot(goalX - e.x, goalZ - e.z);
          /* Once it has arrived it stops and waits there, which is the part
           * that makes the misdirection worth doing. */
          move = gone > 0.8;
        } else {
          move = false;
        }

      } else if (kind === 'dropper') {
        /*
         * On the ceiling until you are under it. Hanging is not a pose, it is
         * the whole monster: it does not move, does not sway, and is above the
         * eyeline of a player who is watching the corridor ahead.
         */
        if (e.hung === undefined) { e.hung = true; e.vy = 0; }
        if (e.hung) {
          /* The origin goes *on* the ceiling, not below it — the flipped model
           * hangs down from its own origin, so any clearance added here would
           * leave it floating in the room instead of gripping the tiles. */
          e.y = world.ceilingAt(e.x, e.z);
          if (dist < (this.spec.trigger ?? 3.2)) {
            e.hung = false;
            e.alerted = true;
            e.vy = 0;
            this.events.push({ type: 'drop', dist });
          }
          move = false;
        } else if (e.vy !== undefined && e.y > world.groundAt(e.x, e.z, 0.3) + 0.02) {
          /* Falling. Under gravity rather than at a fixed rate, because a drop
           * that accelerates is read as something letting go and a drop at a
           * constant speed is read as a lift. */
          e.vy -= 12 * dt;
          e.y = Math.max(world.groundAt(e.x, e.z, 0.3), e.y + e.vy * dt);
          move = false;
        } else {
          e.vy = undefined;
          move = e.alerted;
        }

      } else if (kind === 'twin') {
        /*
         * A reflection through a fixed point, set when it spawns. It never
         * chases and never gives up, and the geometry does the work: the gap
         * between the two of you is exactly twice your own distance from the
         * mirror point, so retreating widens it and crossing the middle closes
         * it to nothing. What it costs you is the far half of the room.
         */
        if (e.mx === undefined) {
          e.mx = (player.pos.x + e.x) / 2;
          e.mz = (player.pos.z + e.z) / 2;
        }
        const tx = 2 * e.mx - player.pos.x;
        const tz = 2 * e.mz - player.pos.z;
        const ty = world.groundAt(tx, tz, 0.3);
        /* Refuse the reflection if it lands in a wall or off an edge, and hold
         * the last good position instead — a twin standing inside the masonry
         * is a glitch, and a twin waiting at the doorway is a monster. */
        if (ty > -900 && !world.blocked(tx, tz, ty, 0.3, 0.5)) {
          e.x = tx; e.z = tz; e.y = ty;
        }
        e.rot = Math.atan2(-toX, -toZ) + Math.PI;   /* always facing you */
        e.moving = Math.hypot(player.vel.x, player.vel.z) > 0.4;
        move = false;

      } else if (kind === 'leech') {
        /*
         * Rides. While it is on you it takes almost nothing per bite, and the
         * damage is not the point: it is the drag on your legs while whatever
         * else lives here is still walking towards the noise you are making.
         */
        if (e.rider) {
          e.x = player.pos.x; e.z = player.pos.z;
          e.y = player.pos.y + 0.35;
          e.ride = (e.ride || 0) + Math.hypot(player.vel.x, player.vel.z) * dt;
          player.grabbed = (player.grabbed || 0) + 1;
          if (e.ride > (this.spec.shake ?? 14)) {
            e.rider = false;
            e.ride = 0;
            /*
             * And it has to stay off for a moment. Shaking one loose leaves it
             * exactly where you are standing, which is well inside its own
             * reach, so without this it re-attached on the very next frame and
             * the whole "carry it far enough" mechanic did nothing at all.
             */
            e.shy = 3.0;
            this.events.push({ type: 'shaken', dist });
          }
          move = false;
        } else {
          e.shy = Math.max(0, (e.shy || 0) - dt);
          move = sees || dist < 7 || e.alerted;
          /* Just shaken off: back away rather than stand under your feet. */
          if (e.shy > 0) mode = 'flee';
          else if (dist < B.reach) {
            e.rider = true;
            e.ride = 0;
            this.events.push({ type: 'latch', dist });
          }
          if (sees) e.alerted = true;
        }

      } else {
        if (sees) e.alerted = true;
        move = e.alerted;
      }

      if (move) {
        let mvX, mvZ;

        if (mode === 'chase') {
          /*
           * Steer along a route rather than straight at the player. Re-planned
           * on a timer — twice a second while hunting, rarely while wandering —
           * because a path is only wrong once the player has moved a cell or
           * two, and pathing every frame for every entity is pure waste.
           *
           * `|| 0` because an entity that arrived without the field — the test
           * harness stands one in front of the camera by hand — would otherwise
           * carry a NaN timer that never fires, and quietly revert to walking
           * into walls with nothing to show that it had.
           */
          e.repath = (e.repath || 0) - dt;
          if (e.repath <= 0) {
            e.repath = 0.45 + Math.random() * 0.25;
            const [egx, egz] = world.cellOf(e.x, e.z);
            const [ggx, ggz] = world.cellOf(goalX, goalZ);
            e.path = findPath(world, egx, egz, ggx, ggz);
            e.pathI = 0;
          }

          /* Aim at the next waypoint, skipping any the entity can already walk
           * to in a straight line — otherwise it visibly hugs cell centres and
           * turns in right angles like something on rails. */
          let aimX = goalX, aimZ = goalZ;
          if (e.path && e.path.length) {
            while (e.pathI < e.path.length - 1
                   && clearLine(world, e.x, e.z, e.path[e.pathI + 1].x, e.path[e.pathI + 1].z)) {
              e.pathI++;
            }
            const wp = e.path[Math.min(e.pathI, e.path.length - 1)];
            if (Math.hypot(wp.x - e.x, wp.z - e.z) < 0.35 && e.pathI < e.path.length - 1) e.pathI++;
            const cur = e.path[Math.min(e.pathI, e.path.length - 1)];
            aimX = cur.x; aimZ = cur.z;
          }

          const adx = aimX - e.x, adz = aimZ - e.z;
          const alen = Math.hypot(adx, adz) || 1;
          mvX = adx / alen; mvZ = adz / alen;

        } else {
          /*
           * Fleeing and circling are deliberately *not* pathed. Both are
           * short-range reactions to where the player is standing right now,
           * and a BFS to a retreat cell would lag a beat behind the torch
           * sweep that caused it — which reads as the thing ignoring the
           * light. The wall-slide below handles the corners, and something
           * that backs into a corner and stays there is, for a smiler, the
           * correct and frightening outcome anyway.
           *
           * Signs matter here and are easy to get backwards. `toX/toZ` is the
           * *player-to-entity* direction — it is built by negating the vector
           * to the player, and the chase code above steers with `-toX`. So
           * retreating is `+toX`, and closing the gap is `-toX`. Written the
           * other way round, a smiler pinned by the torch walks calmly into
           * the beam and into your face, which is what the first version did.
           */
          if (mode === 'flee') {
            mvX = toX; mvZ = toZ;
          } else {
            /* Orbit, with a gentle pull back to the held radius so it spirals
             * onto the circle instead of drifting off it. `e.spin` fixes which
             * way round, per entity, or two of them would mirror each other. */
            if (e.spin === undefined) e.spin = Math.random() < 0.5 ? -1 : 1;
            const hold = this.spec.hold ?? 9;
            const tanX = -toZ * e.spin, tanZ = toX * e.spin;
            /* Too far out pulls inward (-to), too close pushes outward (+to). */
            const pull = clamp((dist - hold) / 4, -1, 1);
            mvX = tanX - toX * pull;
            mvZ = tanZ - toZ * pull;
            const l = Math.hypot(mvX, mvZ) || 1;
            mvX /= l; mvZ /= l;
          }
          e.path = null;
        }

        const step = speed * dt;
        const nx = e.x + mvX * step, nz = e.z + mvZ * step;
        /* Try both axes, then each on its own, so a corner does not trap it. */
        if (!world.blocked(nx, nz, e.y, 0.3, 0.5)) { e.x = nx; e.z = nz; }
        else if (!world.blocked(nx, e.z, e.y, 0.3, 0.5)) e.x = nx;
        else if (!world.blocked(e.x, nz, e.y, 0.3, 0.5)) e.z = nz;
        e.y = world.groundAt(e.x, e.z, 0.3);
        if (e.y < -900) { this.list.splice(i, 1); continue; }
        /*
         * Face the way it is going — except a smiler, which is a pair of eyes
         * and nothing else, so a smiler backing out of the torch beam with its
         * eyes turned away would simply vanish. It watches you the whole way
         * out, which is the only reason to have built it this way.
         */
        e.rot = B.mesh === 'smiler'
          ? Math.atan2(-toX, -toZ) + Math.PI
          : Math.atan2(mvX, mvZ) + Math.PI;
        e.moving = true;
        e.cue -= dt;
        if (e.cue <= 0) {
          e.cue = 1.4 + Math.random() * 2.2;
          this.events.push({ type: 'cue', kind: this.spec.kind, dist });
        }
      } else {
        e.moving = false;
      }

      /* Retreating is retreating: a smiler pinned by the torch does not get to
       * bite on its way out. Everything else may. */
      if (mode !== 'flee' && dist < B.reach && e.cooldown <= 0) {
        e.cooldown = 1.1;
        player.hurt(B.damage);
        this.events.push({ type: 'hit', dist });
      }
      e.cooldown = Math.max(0, e.cooldown - dt);

      /*
       * Gait. The stride advances with distance covered rather than with time,
       * so the feet keep pace with the body instead of skating — the single
       * thing that gives away a walk cycle driven off a clock.
       *
       * A lurker that has not been triggered gets none of it. The idle sway is
       * tiny, but anything at all moving in the corner of the eye is read as
       * alive instantly, and the disguise is the whole of the ambush.
       */
      const hiding = kind === 'lurker' && !e.alerted;
      const stride = B.mesh === 'crawler' ? 2.6 : B.mesh === 'titan' ? 1.05 : 1.7;
      if (e.moving) e.phase += speed * dt * stride;
      else if (!hiding) e.phase += dt * 1.1;    /* a slow idle sway          */
      e.swing = e.moving ? 1 : hiding ? 0 : 0.07;
      /* Vertical bob peaks twice per stride, once per footfall. */
      e.bob = e.moving
        ? Math.abs(Math.sin(e.phase)) * 0.035 - 0.017
        : hiding ? 0 : Math.sin(time * 1.6 + e.seed) * 0.012;

      /* Where the head is pointing. It tracks the player independently of the
       * body, which is why a watcher standing still is worse than one that
       * moves: the body is square-on to nothing and the face is not. A hiding
       * lurker does not track — a head that turns is the one tell that would
       * give it away from across the room. */
      const toPlayer = Math.atan2(-toX, -toZ) + Math.PI;
      const delta = ((toPlayer - e.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      e.headYaw = hiding ? 0 : Math.max(-1.1, Math.min(1.1, delta));
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
        path: null, pathI: 0, repath: Math.random() * 0.4,
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
  dynamics(out, cam) {
    for (const e of this.list) {
      const y = e.y + e.bob;
      const sw = Math.sin(e.phase) * e.swing;
      const sw2 = Math.sin(e.phase + Math.PI) * e.swing;

      if (e.mesh === 'shade') {
        /*
         * Billboard: yawed to face the camera every frame, so the pane is
         * never seen edge-on. It sways rather than walks — it has no legs to
         * animate and a shape that bobs like a body would immediately read as
         * a costume.
         */
        const rot = cam
          ? Math.atan2(cam.x - e.x, cam.z - e.z) + Math.PI
          : e.rot;
        out.push({
          mesh: 'shade',
          x: e.x,
          y: y + Math.sin(e.phase * 0.5) * 0.02,
          z: e.z,
          rot,
          scale: 1,
        });
        continue;
      }

      if (e.mesh === 'smiler') {
        /*
         * Eyes and a grin, hung at head height with no body under them. There
         * is nothing to animate and nothing to light: the whole thing is
         * emissive, so what the player sees is exactly what a face in an
         * unlit room gives you and no more.
         */
        out.push({
          mesh: 'smiler',
          x: e.x,
          y: y + 1.55 + Math.sin(e.phase * 0.7 + e.seed) * 0.035,
          z: e.z,
          rot: e.rot,
          scale: 1,
        });
        continue;
      }

      /*
       * The crawler rig, shared by the leech and the dropper. A dropper still
       * on the ceiling is the same body rolled onto its back — the legs point
       * up into the tiles it is holding, which is what makes the shape read as
       * hanging rather than as floating.
       */
      if (e.mesh === 'crawler' || e.mesh === 'dropper' || e.mesh === 'leech') {
        /*
         * A dropper still on the ceiling is the same body turned over. A pitch
         * of PI is already a half-turn about the model's own X axis, so it
         * costs nothing and needs no new transform: the body, built upward
         * from its origin, hangs downward from it instead, and the legs, built
         * hanging from their joints, reach up into the tiles. Put the origin
         * at the ceiling and the whole thing assembles itself the right way up
         * — or rather, the right way down.
         */
        const up = e.mesh === 'dropper' && e.hung;
        const flip = up ? -1 : 1;
        const turn = up ? Math.PI : 0;
        out.push({ mesh: 'crawlBody', x: e.x, y, z: e.z, rot: e.rot, pitch: turn, scale: 1 });
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
            y: y + 0.33 * flip,
            z: e.z + ox * si + oz * c,
            rot: e.rot, pitch: turn + s * 0.75, scale: 1,
          });
        }
        continue;
      }

      /*
       * The biped rig, also used for the titan at a little under twice the
       * size. Scaling the whole rig rather than modelling a second one is not
       * a shortcut here: every joint offset below is in metres, so multiplying
       * them by the same factor as the meshes keeps the thing assembled, and a
       * 3.5m figure taking one stride to your three reads as an entirely
       * different animal without a single new triangle.
       */
      const S = e.mesh === 'titan' ? 1.85 : 1;

      out.push({ mesh: 'entTorso', x: e.x, y, z: e.z, rot: e.rot, scale: S });
      /* 1.60, not 1.68: the head has to overlap the top of the neck stub
       * (which reaches 1.52) or it visibly floats above the shoulders.
       *
       * The blind one gets the same head without the eyes, which is the only
       * thing on it that tells the player why it walked past them: a body with
       * no lights in its face, going somewhere else. */
      out.push({
        mesh: e.mesh === 'blind' ? 'entHeadBlind' : 'entHead',
        x: e.x, y: y + 1.60 * S, z: e.z,
        rot: e.rot + e.headYaw, scale: S,
      });

      const c = Math.cos(e.rot), s = Math.sin(e.rot);
      /*
       * Shoulders and hips, offset sideways from the body's centre line. The
       * shoulders sit at 0.26 rather than tucked in at 0.235: the torso is
       * 0.20 wide up there and an arm half-hidden behind it reads as no arm
       * at all, which is exactly how the first screenshots came out — a slab
       * with legs. The gap is what makes the silhouette a body.
       */
      for (const [ox, mesh, yj, amp, ph] of [
        [-0.26, 'entArm', 1.42, 0.62, sw],
        [0.26, 'entArm', 1.42, 0.62, sw2],
        [-0.095, 'entLeg', 0.90, 0.80, sw2],
        [0.095, 'entLeg', 0.90, 0.80, sw],
      ]) {
        out.push({
          mesh,
          x: e.x + ox * S * c,
          y: y + yj * S,
          z: e.z + ox * S * s,
          rot: e.rot,
          pitch: ph * amp,
          scale: S,
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
  shade: 'צל',
  smiler: 'מחייך',
  lurker: 'אורב',
  stalker: 'עוקב',
  swarm: 'נחיל',
  titan: 'ענק',
  blind: 'עיוור',
  dropper: 'תולה',
  twin: 'תאום',
  leech: 'עלוקה',
}[kind] || '');

export const clampDanger = (d) => clamp(1 - d / 20, 0, 1);
