/*
 * anomalies.js — the things that are wrong.
 *
 * Design rules this file is held to:
 *
 *  1. Nothing announces itself. There is no anomaly here that puts a message
 *     on screen, and no anomaly that makes a loud noise at the moment it
 *     happens. Several of them are *quieter* than the game around them.
 *  2. Anything that constitutes a change to the world happens off-camera.
 *     `unobserved` is a hard gate, not a preference: a passenger who moves
 *     while being watched is a bug, because the player will read it as an
 *     animation rather than as a fact about the world.
 *  3. Every anomaly has to survive being missed. A player who is looking the
 *     other way loses nothing they needed, and a player who was looking gets
 *     no confirmation that they were right.
 *
 * Weights scale with the station index so the night gets worse on a curve
 * rather than a step, and a run draws from a shuffled bag so two playthroughs
 * do not share an order.
 */

import { clamp } from '../core/math.js';
import { carCenterZ, seatSlot, CAR } from '../world/dims.js';
import { AD_SLOTS } from '../world/carriage.js';

/* Every entry: start(ctx) returns null (declined) or a handle with an optional
   update(dt, ctx) and end(ctx). `duration` is in seconds. */
export const ANOMALIES = [
  {
    id: 'lightsFlicker',
    weight: 4, min: 1, max: 6, cooldown: 34,
    start(ctx) {
      const car = ctx.playerCar;
      /* Remembered, because another anomaly may already have this carriage in
         the dark and restoring to a hardcoded "on" would cancel it. */
      const wasOn = ctx.world.cars[car]?.lights.some((l) => l.enabled) ?? true;
      let t = 0;
      const pattern = ctx.rng.pick([
        [0.06, 0.10, 0.04, 0.22, 0.05],
        [0.3, 0.08, 0.5],
        [0.04, 0.04, 0.04, 0.04, 0.9],
      ]);
      ctx.sfx.play('lightBuzz', { duration: 1.2, caption: false });
      let i = 0, next = pattern[0], on = false;
      return {
        duration: 2.6,
        update(dt) {
          t += dt;
          if (t >= next) {
            on = !on;
            i = (i + 1) % pattern.length;
            next = t + pattern[i];
            ctx.world.setCarLights(car, on);
          }
        },
        end() { ctx.world.setCarLights(car, wasOn); },
      };
    },
  },

  {
    id: 'blackout',
    weight: 2, min: 2, max: 6, cooldown: 70,
    start(ctx) {
      const cars = ctx.world.cars.map((c) => c.index);
      const wasOn = ctx.world.cars.map((c) => c.lights.some((l) => l.enabled));
      const restore = () => cars.forEach((c, i) => ctx.world.setCarLights(c, wasOn[i]));
      ctx.sfx.play('lightsOut');
      ctx.audio.duck(0.25, 0.35);
      for (const c of cars) ctx.world.setCarLights(c, false);
      let t = 0;
      const hold = ctx.rng.float(2.2, 5.5);
      let restored = false;
      return {
        duration: hold + 0.6,
        update(dt) {
          t += dt;
          if (!restored && t >= hold) {
            restored = true;
            restore();
            ctx.audio.duck(1, 0.5);
            ctx.sfx.play('powerUp');
            /* Whatever changed, changed here. */
            ctx.spendUnobserved(true);
          }
        },
        end() {
          restore();
          ctx.audio.duck(1, 0.4);
        },
      };
    },
  },

  {
    id: 'silence',
    weight: 3, min: 2, max: 6, cooldown: 90,
    start(ctx) {
      /* The bed goes, and nothing replaces it. This is the loudest thing in
         the game. */
      ctx.audio.duck(0.04, 0.55);
      ctx.sfx.caption('[the sound of the train stops]');
      let t = 0;
      const hold = ctx.rng.float(4.5, 9);
      return {
        duration: hold + 1.2,
        update(dt) {
          t += dt;
          if (t > hold && ctx.audio.duckAmount !== 1) ctx.audio.duck(1, 1.1);
        },
        end() { ctx.audio.duck(1, 0.8); },
      };
    },
  },

  {
    id: 'passengerMoves',
    weight: 4, min: 1, max: 5, cooldown: 28, unobserved: true,
    start(ctx) {
      const candidates = ctx.crowd.visiblePeople().filter((p) => p.present && p.id !== 'stranger');
      const person = ctx.rng.pick(candidates);
      if (!person) return null;
      const slot = ctx.rng.int(0, 53);
      const seat = seatSlot(slot);
      /* Only worth doing if it is somewhere the player will plausibly look. */
      ctx.queueUnobserved(person, () => {
        person.seat = slot;
        person.pose = ctx.rng.pick(['sit', 'sitHandsFolded', 'sitStare']);
        if (person.pose === 'sitStare') person.watch = 0.8;
      }, { x: seat.x, z: carCenterZ(person.car) + seat.z });
      return { duration: 0.1 };
    },
  },

  {
    id: 'passengerVanishes',
    weight: 3, min: 2, max: 6, cooldown: 46, unobserved: true,
    start(ctx) {
      const candidates = ctx.crowd.extras.filter((p) => p.present);
      const person = ctx.rng.pick(candidates);
      if (!person) return null;
      ctx.queueUnobserved(person, () => { person.present = false; });
      return { duration: 0.1 };
    },
  },

  {
    id: 'carriageFills',
    weight: 2, min: 3, max: 6, cooldown: 80, unobserved: true,
    start(ctx) {
      const target = ctx.playerCar === 0 ? 1 : ctx.playerCar - 1;
      const idle = ctx.crowd.extras.filter((p) => !p.present);
      if (idle.length < 3) return null;
      ctx.queueUnobservedCar(target, () => {
        idle.slice(0, ctx.rng.int(3, 5)).forEach((p, i) => {
          p.present = true;
          p.car = target;
          p.seat = ctx.rng.int(0, 53) % 54;
          p.pose = 'sitStare';
          p.watch = 1;
          p.phase = i * 0.7;
        });
      });
      return { duration: 0.1 };
    },
  },

  {
    id: 'everyoneLooks',
    weight: 2, min: 3, max: 6, cooldown: 95,
    start(ctx) {
      const people = ctx.crowd.visiblePeople().filter((p) => p.present);
      if (!people.length) return null;
      const restore = people.map((p) => ({ p, watch: p.watch }));
      /*
       * The one anomaly in the catalogue that moved bodies with no unobserved
       * gate on them: every head in the carriage swung round to face the
       * player while the player was looking at them. Watching it happen is the
       * opposite of the rule the whole game is built on — you are supposed to
       * turn back and find it already true. Each passenger is queued through
       * the same test as everything else, so they are looking at you by the
       * time you look at them, and never in the act of turning.
       */
      for (const p of people) ctx.queueUnobserved(p, () => { p.watch = 1; });
      return {
        duration: ctx.rng.float(3.5, 7),
        end() { for (const r of restore) ctx.queueUnobserved(r.p, () => { r.p.watch = r.watch; }); },
      };
    },
  },

  {
    id: 'figureOutside',
    weight: 2, min: 2, max: 6, cooldown: 85,
    start(ctx) {
      if (ctx.speed < 0.4) return null;
      const side = ctx.rng.bool() ? -1 : 1;
      const z = ctx.playerZ + ctx.rng.float(2, 7);
      const apparition = ctx.crowd.apparition;
      if (!apparition) return null;
      apparition.present = true;
      apparition.pose = 'standStill';
      apparition.watch = 1;
      apparition.customPos = [side * 2.55, 0, z];
      apparition.customYaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      let t = 0;
      return {
        duration: ctx.rng.float(1.1, 2.4),
        update(dt) {
          t += dt;
          /* It does not move with the train and it does not move against it.
             It is simply beside the window, at speed. */
          apparition.customPos[2] = ctx.playerZ + Math.sin(t * 0.4) * 0.3 + 3;
        },
        end() {
          apparition.present = false;
          apparition.customPos = null;
        },
      };
    },
  },

  {
    id: 'behindYou',
    weight: 2, min: 3, max: 6, cooldown: 80, unobserved: true,
    start(ctx) {
      const idle = ctx.crowd.extras.find((p) => !p.present);
      if (!idle) return null;
      /* camera.forward is (-sin yaw, ., -cos yaw), so *behind* the player is
         plus cos on Z and plus sin on X. Getting this backwards put the figure
         two metres in front of them, in full view. */
      const behind = ctx.playerZ + Math.cos(ctx.playerYaw) * 2.2;
      const x = Math.sin(ctx.playerYaw) * 0.9;
      ctx.queueUnobserved(idle, () => {
        idle.present = true;
        idle.customPos = [clamp(x, -0.6, 0.6), 0, behind];
        idle.customYaw = ctx.playerYaw + Math.PI;
        idle.pose = 'standStill';
        idle.watch = 1;
        idle.temporary = 11;
      }, { x, z: behind });
      return { duration: 0.1 };
    },
  },

  {
    id: 'footsteps',
    weight: 4, min: 1, max: 6, cooldown: 30,
    start(ctx) {
      const ahead = ctx.rng.bool();
      ctx.sfx.play('distantFootsteps', {
        count: ctx.rng.int(5, 11),
        spacing: ctx.rng.float(0.40, 0.56),
        approaching: ahead,
        pan: ahead ? 0.5 : -0.5,
      });
      return { duration: 4 };
    },
  },

  {
    id: 'whisper',
    weight: 4, min: 2, max: 6, cooldown: 36,
    start(ctx) {
      const line = ctx.rng.pick(WHISPERS);
      ctx.sfx.whisper(line, { far: 0.4 });
      ctx.flags.heardWhisper = true;
      return { duration: 3 };
    },
  },

  {
    id: 'phoneRings',
    weight: 3, min: 1, max: 6, cooldown: 55,
    start(ctx) {
      let t = 0;
      let rings = 0;
      const total = ctx.rng.int(3, 7);
      const pan = ctx.rng.float(-0.8, 0.8);
      ctx.sfx.play('phoneRing', { pan, far: 0.75 });
      rings++;
      return {
        duration: total * 2.1 + 1,
        update(dt) {
          t += dt;
          if (t > rings * 2.1 && rings < total) {
            rings++;
            ctx.sfx.play('phoneRing', { pan, far: 0.75, caption: false });
          }
        },
      };
    },
  },

  {
    id: 'knocking',
    weight: 2, min: 3, max: 6, cooldown: 70,
    start(ctx) {
      ctx.sfx.play('knock', { count: ctx.rng.int(3, 5), pan: ctx.rng.bool() ? -0.7 : 0.7, far: 0.6 });
      return { duration: 2.5 };
    },
  },

  {
    id: 'windowTap',
    weight: 2, min: 2, max: 6, cooldown: 64,
    start(ctx) {
      if (ctx.speed < 0.5) return null;
      ctx.sfx.play('windowTap', { pan: ctx.rng.bool() ? -0.8 : 0.8 });
      return { duration: 1.5 };
    },
  },

  {
    id: 'reflectionLag',
    weight: 3, min: 2, max: 6, cooldown: 60,
    start(ctx) {
      if (!ctx.settings.reflections) return null;
      const amount = ctx.rng.float(0.30, 0.75);
      ctx.avatar.delay = amount;
      return {
        duration: ctx.rng.float(9, 16),
        /* The flag is what unlocks an achievement, and it used to be set the
           instant the anomaly began — a toast in the corner of the screen
           announcing that something was wrong with the glass, to a player who
           had not looked at the glass. It is set when they are actually facing
           a window instead. Camera forward is (-sin yaw, -cos yaw), so a side
           window is |sin yaw| near one. */
        update(dt, live) {
          if (Math.abs(Math.sin(live.playerYaw)) > 0.72) live.flags.sawReflection = true;
        },
        end() { ctx.avatar.delay = 0; },
      };
    },
  },

  {
    id: 'reflectionStays',
    weight: 1, min: 4, max: 6, cooldown: 120,
    start(ctx) {
      if (!ctx.settings.reflections) return null;
      /* The reflection stops copying and simply stands there. */
      ctx.avatar.frozen = true;
      return {
        duration: ctx.rng.float(4, 7),
        update(dt, live) {
          if (Math.abs(Math.sin(live.playerYaw)) > 0.72) live.flags.sawReflection = true;
        },
        end() { ctx.avatar.frozen = false; },
      };
    },
  },

  {
    id: 'cameraFollows',
    weight: 3, min: 2, max: 6, cooldown: 50,
    start(ctx) {
      ctx.world.cameraTracking = true;
      return {
        duration: ctx.rng.float(8, 20),
        /* Same as the glass: credited when the player has the camera in
           frame, not when the camera starts following them. */
        update(dt, live) {
          if (live.player?.hover?.type === 'camera' || Math.abs(Math.sin(live.playerYaw)) > 0.72) {
            live.flags.sawCamera = true;
          }
        },
        end() { ctx.world.cameraTracking = false; },
      };
    },
  },

  {
    id: 'doorOpensItself',
    weight: 3, min: 2, max: 6, cooldown: 55,
    start(ctx) {
      const car = ctx.world.cars[ctx.playerCar];
      if (!car) return null;
      const conn = ctx.rng.pick(car.connecting.filter((c) => !c.terminal && c.open < 0.1));
      if (!conn) return null;
      let t = 0;
      ctx.sfx.play('doorOpen', { pan: conn.end > 0 ? 0.3 : -0.3, caption: false });
      return {
        duration: 6,
        update(dt) {
          t += dt;
          conn.open = clamp(t / 2.2, 0, 1);
        },
      };
    },
  },

  {
    id: 'displayLies',
    weight: 3, min: 2, max: 6, cooldown: 44,
    start(ctx) {
      const text = ctx.rng.pick(DISPLAY_LIES);
      ctx.setDisplayOverride(text, ctx.rng.bool(0.35));
      return {
        duration: ctx.rng.float(4, 9),
        end() { ctx.setDisplayOverride(null); },
      };
    },
  },

  {
    id: 'adChanges',
    weight: 3, min: 1, max: 6, cooldown: 40, unobserved: true,
    start(ctx) {
      const slot = ctx.rng.int(0, 3);
      const car = ctx.playerCar;
      if (!ctx.world.cars[car]) return null;
      const spec = ctx.rng.pick(ALTERED_ADS);
      /* The panel, not the middle of the carriage. Gating on the car centre
         let the poster change while the player was standing in front of it. */
      const place = AD_SLOTS[slot];
      const target = {
        x: place.side * (CAR.halfWidth - 0.1),
        y: 2.02,
        z: carCenterZ(car) + place.z,
      };
      ctx.queueUnobservedCar(car, () => ctx.world.setAd(car, slot, spec), target);
      return { duration: 0.1 };
    },
  },

  {
    id: 'mapGrows',
    weight: 2, min: 2, max: 5, cooldown: 999, unobserved: true,
    start(ctx) {
      if (ctx.flags.mapGrew) return null;
      ctx.queueUnobservedCar(ctx.playerCar, () => {
        ctx.flags.mapGrew = true;
        ctx.bumpRouteStage();
      });
      return { duration: 0.1 };
    },
  },

  {
    id: 'graffitiAppears',
    weight: 2, min: 3, max: 6, cooldown: 110, unobserved: true,
    start(ctx) {
      if (ctx.flags.graffiti) return null;
      const car = ctx.playerCar;
      ctx.queueUnobservedCar(car, () => {
        ctx.flags.graffiti = true;
        ctx.world.setGraffiti(car, ctx.rng.pick(['DON’T', 'NOT YOURS', '00:47', 'STILL HERE']), true);
      });
      return { duration: 0.1 };
    },
  },

  {
    id: 'handlesStill',
    weight: 2, min: 3, max: 6, cooldown: 75,
    start(ctx) {
      if (ctx.speed < 0.5) return null;
      /* At line speed, with the carriage rocking, every strap hangs perfectly
         still. Nobody has ever pointed at this. Everybody has felt it. */
      ctx.world.handlesFrozen = true;
      return {
        duration: ctx.rng.float(5, 10),
        end() { ctx.world.handlesFrozen = false; },
      };
    },
  },

  {
    id: 'coldBreath',
    weight: 2, min: 3, max: 6, cooldown: 66,
    start(ctx) {
      ctx.sfx.play('breath', { pan: ctx.rng.float(-0.4, 0.4) });
      ctx.fx.pulseTarget = 0.32;
      return {
        duration: 4.5,
        end() { ctx.fx.pulseTarget = 0; },
      };
    },
  },

  {
    id: 'nextCarDark',
    weight: 3, min: 2, max: 6, cooldown: 58,
    start(ctx) {
      const target = ctx.rng.bool() ? ctx.playerCar + 1 : ctx.playerCar - 1;
      if (target < 0 || target >= ctx.world.carCount) return null;
      const wasOn = ctx.world.cars[target]?.lights.some((l) => l.enabled) ?? true;
      ctx.world.setCarLights(target, false);
      return {
        duration: ctx.rng.float(10, 26),
        end() { ctx.world.setCarLights(target, wasOn); },
      };
    },
  },

  {
    id: 'groan',
    weight: 3, min: 1, max: 6, cooldown: 48,
    start(ctx) {
      ctx.sfx.play('metalGroan', { duration: ctx.rng.float(2.6, 4.5) });
      return { duration: 4 };
    },
  },

  {
    id: 'garbledAnnouncement',
    weight: 3, min: 2, max: 6, cooldown: 62,
    start(ctx) {
      const line = ctx.rng.pick(BAD_ANNOUNCEMENTS);
      ctx.sfx.speak(line, { corruption: ctx.rng.float(0.35, 0.85), rate: ctx.rng.float(0.82, 1.05) });
      return { duration: 6 };
    },
  },

  {
    id: 'clockStops',
    weight: 2, min: 3, max: 6, cooldown: 120,
    start(ctx) {
      ctx.flags.clockCorrupt = true;
      return {
        duration: 30,
        end() { ctx.flags.clockCorrupt = false; },
      };
    },
  },

  {
    id: 'grainSwell',
    weight: 3, min: 2, max: 6, cooldown: 42,
    start(ctx) {
      /* The image itself gets worse, briefly, as though the light were
         failing rather than the camera. */
      ctx.fx.grainTarget = ctx.rng.float(1.8, 3.0);
      ctx.fx.desaturateTarget = ctx.rng.float(0.2, 0.55);
      return {
        duration: ctx.rng.float(5, 11),
        end() { ctx.fx.grainTarget = 1; ctx.fx.desaturateTarget = 0; },
      };
    },
  },

  {
    id: 'seatCreak',
    weight: 3, min: 1, max: 6, cooldown: 26,
    start(ctx) {
      ctx.sfx.play('seatCreak', { pan: ctx.rng.float(-0.9, 0.9) });
      return { duration: 1.5 };
    },
  },

  {
    id: 'strangerCloser',
    weight: 2, min: 3, max: 6, cooldown: 90, unobserved: true,
    start(ctx) {
      const stranger = ctx.crowd.get('stranger');
      if (!stranger || !stranger.present) return null;
      const slot = seatSlot(stranger.seat);
      /* The slot list runs one whole side and then the other, so stepping over
         index 26 does not move somebody two seats along — it moves them to the
         far end of the opposite bench. Stay within the side he is already on. */
      const bench = stranger.seat < 27 ? 0 : 27;
      const step = slot.z > ctx.playerZ - carCenterZ(stranger.car) ? -2 : 2;
      const nearer = clamp(stranger.seat + step, bench, bench + 26);
      ctx.queueUnobserved(stranger, () => {
        stranger.seat = nearer;
        stranger.watch = Math.min(1, stranger.watch + 0.15);
      });
      return { duration: 0.1 };
    },
  },
];

const WHISPERS = [
  'not this one',
  'don’t look at the map',
  'you were on this train before',
  'it is not your stop',
  'he counts us at every station',
  'stay where you are',
  'nobody got off',
  'the doors open on both sides here',
];

const DISPLAY_LIES = [
  'STATION NOT FOUND',
  'THIS SERVICE DOES NOT STOP',
  'PLEASE REMAIN SEATED',
  'PASSENGERS: 1',
  'NEXT STOP: —',
  'YOU ARE ON THE 00:47',
  'DO NOT ALIGHT',
];

const BAD_ANNOUNCEMENTS = [
  'The next station is. The next station is. The next station is.',
  'Please do not alight at the next station under any circumstances.',
  'This train is calling at all stations, including the ones that are not on the map.',
  'Will the passenger in the fourth carriage please make themselves known to a member of staff.',
  'We are being held at a red signal. We apologise for the delay to your journey.',
  'All passengers must leave the train. All passengers must leave the train.',
];

export const ALTERED_ADS = [
  {
    id: 'alt-insomnia', bg: '#12181f', accent: '#e8552f',
    headline: 'STILL AWAKE?', body: 'You have been awake for a very long time.',
    foot: 'NIGHTHOLM MEDICAL · LINE 4',
  },
  {
    id: 'alt-storage', bg: '#f2efe6', accent: '#1a1a1a', dark: true,
    headline: 'ROOM FOR EVERYTHING', body: 'Nobody has asked about yours.',
    foot: 'KESTREL STORAGE',
  },
  {
    id: 'alt-missing', bg: '#ffffff', accent: '#b3121b', dark: true, photo: true,
    headline: 'HAVE YOU SEEN', body: 'Last seen on this train, in this carriage, tonight.',
    foot: 'TRANSIT POLICE · 8800',
  },
  {
    id: 'alt-coffee', bg: '#2a1c14', accent: '#d9a441',
    headline: 'ONE MORE', body: 'Open until the last train. There is no last train.',
    foot: 'BLACKBIRD COFFEE',
  },
  {
    id: 'alt-insurance', bg: '#0f2c3f', accent: '#7fd1e8',
    headline: 'WHAT IF TONIGHT', body: 'was the night. Cover in four minutes.',
    foot: 'MERIDIAN ASSURANCE',
  },
  {
    id: 'alt-language', bg: '#1d1430', accent: '#c6a6ff',
    headline: 'LEARN TO SAY IT', body: 'Ask him why he is still here.',
    foot: 'VERBA',
  },
  {
    id: 'alt-blank', bg: '#0b0c0e', accent: '#3a3d42',
    headline: ' ', body: ' ', foot: ' ',
  },
];

/*
 * The director. Holds a shuffled bag, respects per-anomaly cooldowns, and
 * scales how often it fires with how far into the night the train is.
 */
export class AnomalyDirector {
  constructor(rng, opts = {}) {
    this.rng = rng;
    this.nightmare = opts.nightmare || false;
    this.lastFired = new Map();
    this.active = [];
    this.clock = 0;
    this.nextAt = opts.firstDelay ?? 26;
    this.fired = [];
  }

  reset(stationIndex) {
    this.clock = 0;
    const base = this.nightmare ? 12 : 20;
    this.nextAt = base + this.rng.float(0, 10) - stationIndex * 1.2;
  }

  /* Suppresses new anomalies (during arrivals, endings, menus) without
     stopping the ones already running. */
  update(dt, ctx, allowNew = true) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const h = this.active[i];
      h.elapsed += dt;
      if (h.handle.update) h.handle.update(dt, ctx);
      if (h.elapsed >= (h.handle.duration ?? 0)) {
        if (h.handle.end) h.handle.end(ctx);
        this.active.splice(i, 1);
      }
    }

    /*
     * The clock stops while new anomalies are suppressed. It used to keep
     * running through the arrival, the whole dwell and the doors, so by the
     * time the train pulled out it was always past due and something fired on
     * the first frame of every departure — seven stations, seven anomalies,
     * all on the same beat. A player does not need to know why that felt
     * mechanical to feel it.
     */
    if (!allowNew) return;
    this.clock += dt;
    if (this.clock < this.nextAt) return;

    const fired = this.fire(ctx);
    const intensity = ctx.stationIndex + (this.nightmare ? 1.5 : 0);
    const gap = clamp(34 - intensity * 3.4, this.nightmare ? 6 : 11, 40);
    this.nextAt = this.clock + gap * this.rng.float(0.7, 1.35) + (fired ? 0 : 4);
  }

  fire(ctx, forceId = null) {
    const pool = [];
    for (const a of ANOMALIES) {
      if (forceId && a.id !== forceId) continue;
      if (!forceId) {
        const min = this.nightmare ? Math.max(0, a.min - 2) : a.min;
        if (ctx.stationIndex < min || ctx.stationIndex > a.max) continue;
        const last = this.lastFired.get(a.id);
        const cd = a.cooldown * (this.nightmare ? 0.6 : 1);
        if (last != null && ctx.totalTime - last < cd) continue;
      }
      pool.push({ ...a, weight: a.weight * (1 + ctx.stationIndex * 0.12) });
    }
    if (!pool.length) return false;

    const choice = this.rng.weighted(pool);
    if (!choice) return false;
    const def = ANOMALIES.find((a) => a.id === choice.id);
    let handle = null;
    try {
      handle = def.start(ctx);
    } catch (err) {
      console.warn(`[anomaly] ${def.id} failed`, err);
      return false;
    }
    if (!handle) return false;

    this.lastFired.set(def.id, ctx.totalTime);
    this.fired.push(def.id);
    this.active.push({ handle, elapsed: 0, id: def.id });
    ctx.emit('anomaly', { id: def.id });
    return true;
  }

  clear(ctx) {
    for (const h of this.active) if (h.handle.end) h.handle.end(ctx);
    this.active.length = 0;
  }
}
