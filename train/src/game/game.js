/*
 * game.js — the night, as a state machine.
 *
 *   boarding → departing → travelling → arriving → stopped → …
 *
 * `stopped` is where the game actually is. Everything else exists to make the
 * twenty-six seconds with the doors open feel like a decision, and the
 * decision is made with the player's feet: standing on the platform when the
 * doors close is getting off. There is no menu, no prompt and no confirmation,
 * which means the player can change their mind up to the last second and, more
 * importantly, can fail to.
 *
 * This file owns the odometer, the fx targets, the interaction verbs, saving,
 * and the resolution of an ending. It owns no geometry and draws nothing.
 */

import { clamp, damp, lerp } from '../core/math.js';
import { Rng, randomSeed } from '../core/rng.js';
import { writeSave, clearSave } from '../core/store.js';
import { Renderer, Camera } from '../render/renderer.js';
import { TrainWorld } from '../world/train.js';
import { CAR, carCenterZ, SEAT_SLOTS } from '../world/dims.js';
import { PLATFORM } from '../world/outside.js';
import { propMaterials, PropManager } from './props.js';
import { Crowd } from './crowd.js';
import { Player } from './player.js';
import { AnomalyDirector } from './anomalies.js';
import { STATIONS, ROUTE_STAGES, MAX_SPEED, displayLines, clockFor } from './stations.js';
import { clueById, TOTAL_CLUES } from './clues.js';
import { resolveEnding, endingById } from './endings.js';
import { STRANGER_LINES, STRANGER_REPEAT, passengerLine } from './dialogue.js';

const BRAKE_TIME = 13;
const BRAKE_EXP = 1.6;
const ACCEL_TIME = 9;
const CLOSE_WARNING = 7.5;
const CLOSE_TIME = 3.2;

export class Game {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.settings = opts.settings;
    this.profile = opts.profile;
    this.events = opts.events;
    this.audio = opts.audio;
    this.sfx = opts.sfx;
    this.achievements = opts.achievements;

    this.renderer = new Renderer(this.canvas, this.settings);
    this.camera = new Camera(this.settings.fov);
    this.ready = false;
    this.running = false;

    this.fx = {
      fade: 1, fadeColor: [0, 0, 0], grain: 1, grainTarget: 1,
      desaturate: 0, desaturateTarget: 0, pulse: 0, pulseTarget: 0,
      vignette: 0.62, chromatic: 1, distort: 0, scanline: 0, bloom: 0.55,
      brightness: 1,
    };

    this.scene = {
      nodes: [], lights: [], ambient: [0.150, 0.162, 0.192],
      fogColor: [0.020, 0.024, 0.032], fogDensity: 0.020,
      lightScale: 1, time: 0, reflectionPlanes: [], reflectionStrength: 1,
      rainSpeed: 0.012, glassWarp: 0,
    };

    this._displayText = '';
    this._displayOverride = null;
    this.interactCooldown = 0;
    this._interactables = [];
    this._nodeScratch = [];
    this._avatarTrail = [];
  }

  /* ---- lifecycle ------------------------------------------------------- */

  build(seed) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.world = new TrainWorld(this.renderer.gl, this.renderer, this.rng.stream('world'));

    const materials = propMaterials(this.world.materials);
    Object.assign(this.world.materials, materials);
    this.props = new PropManager(this.renderer.gl, this.world.materials, this.world);
    this.crowd = new Crowd(this.world.passengerMeshes, this.world.materials, this.rng.stream('crowd'));
    this.player = new Player(this.world, this.settings);

    this.scene.reflectionPlanes = [
      { side: 'left', x: -(CAR.halfWidth - 0.014) },
      { side: 'right', x: CAR.halfWidth - 0.014 },
    ];

    /* The reflection needs somebody to reflect. This body is drawn in the
       mirror passes and nowhere else, and it is the only reason the game can
       lie about what the glass shows. */
    this.avatar = {
      delay: 0,
      frozen: false,
      body: {
        mesh: this.world.passengerMeshes.body('average', 'stand'),
        matrix: new Float32Array(16), overrides: {}, visible: true,
        reflect: true, reflectOnly: true,
      },
      head: {
        mesh: this.world.passengerMeshes.head('short'),
        matrix: new Float32Array(16), overrides: {}, visible: true,
        reflect: true, reflectOnly: true,
      },
    };
    for (const key of ['coat', 'legs', 'shoes']) {
      this.avatar.body.overrides[key] = { ...this.world.materials[key], color: AVATAR_COLORS[key] };
    }
    this.avatar.head.overrides.hair = { ...this.world.materials.hair, color: [0.12, 0.10, 0.10] };

    this.ready = true;
  }

  startNew({ nightmare = false, seed = null } = {}) {
    if (!this.ready) this.build(seed ?? randomSeed());
    else if (seed != null && seed !== this.seed) this._rebuildFor(seed);

    this.nightmare = nightmare;
    this.state = freshState(this.seed, nightmare);
    this.director = new AnomalyDirector(this.rng.stream(`anom:${this.seed}:${nightmare}`), { nightmare });

    this.world.worldZ = 0;
    this.world.speed = 0;
    this.crowd.reset();
    this.props.clear();
    this._enterStation(0, { initial: true });
    this.crowd.applyStation(0, { immediate: true });
    this.props.spawnForStation(0, this.state.clues);

    /* Start on the platform, outside the doors, with the train already
       standing. The first thing the player does in this game is choose to get
       on it. */
    const side = STATIONS[0].side;
    /* Standing at a doorway, not beside a sealed panel. The first thing the
       player does is walk in, and making them find the door first reads as the
       game not letting them on. */
    this.player.reset(carCenterZ(1) + CAR.doorZ[0]);
    this.player.outside = true;
    this.player.position[0] = side * (PLATFORM.innerX + 1.1);
    this.player.position[1] = PLATFORM.topY;
    this.player.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.player.pitch = 0;

    this.phase = 'boarding';
    this.phaseTime = 0;
    this.dwell = 999;
    this.fx.fade = 1;
    this.running = true;
    this.events.emit('run:start', { nightmare, seed: this.seed });
    this.achievements.unlock('boarded');
    return this;
  }

  loadFrom(save) {
    if (!save) return null;
    if (!this.ready) this.build(save.seed >>> 0);
    else if ((save.seed >>> 0) !== this.seed) this._rebuildFor(save.seed >>> 0);

    this.nightmare = Boolean(save.nightmare);
    this.state = freshState(this.seed, this.nightmare);
    this.state.clues = new Set(save.clues || []);
    this.state.flags = { ...save.flags };
    this.state.strangerTalks = save.strangerTalks || 0;
    this.state.strangerSaid = { ...(save.strangerSaid || {}) };
    this.state.spokenTo = { ...(save.spokenTo || {}) };
    this.state.sitCount = save.sitCount || 0;
    this.state.doorwayStations = new Set(save.doorwayStations || []);
    this.state.routeStage = save.routeStage || 0;
    this.director = new AnomalyDirector(this.rng.stream(`anom:${this.seed}:${this.nightmare}`), { nightmare: this.nightmare });

    const index = clamp(save.stationIndex ?? 0, 0, STATIONS.length - 1);
    this.world.worldZ = index * 1000;
    this.world.speed = 0;
    this.crowd.reset();
    this.props.clear();
    this._enterStation(index, { initial: true });
    this.crowd.applyStation(index, { immediate: true });
    this.props.spawnForStation(index, this.state.clues);

    this.player.reset(carCenterZ(clamp(save.playerCar ?? 1, 0, this.world.carCount - 1)));
    this.player.outside = false;
    this.phase = 'stopped';
    this.phaseTime = 0;
    this.dwell = STATIONS[index].dwell;
    this.fx.fade = 1;
    this.running = true;
    this.events.emit('run:start', { nightmare: this.nightmare, seed: this.seed, resumed: true });
    return this;
  }

  _rebuildFor(seed) {
    this.world.dispose();
    this.props.dispose();
    this.ready = false;
    this.build(seed);
  }

  save() {
    if (!this.state || this.phase === 'ending') return;
    writeSave({
      version: 1,
      seed: this.seed,
      nightmare: this.nightmare,
      stationIndex: this.state.stationIndex,
      clues: [...this.state.clues],
      flags: this.state.flags,
      strangerTalks: this.state.strangerTalks,
      /* Which of his lines have already been heard, and who else has been
         spoken to. Without these a resumed run replays the stranger from the
         top and counts every repeat as new. */
      strangerSaid: this.state.strangerSaid,
      spokenTo: this.state.spokenTo,
      sitCount: this.state.sitCount,
      doorwayStations: [...this.state.doorwayStations],
      routeStage: this.state.routeStage,
      playerCar: this.player.car,
      savedAt: Date.now(),
    });
    this.events.emit('saved');
  }

  /* ---- stations -------------------------------------------------------- */

  _enterStation(index, { initial = false } = {}) {
    /* A copy, because Nightmare rewrites which side the doors open on and the
       station table is module-level data shared with every other run in the
       tab. Mutating it would leak one night's rules into the next. */
    const station = { ...STATIONS[index] };
    this.state.stationIndex = index;
    this.station = station;

    const distance = initial ? this.world.worldZ : this.world.worldZ + brakeDistance();
    /* Nightmare keeps the line and the script exactly as they are — the
       stranger's lines name these stations, and shuffling them would turn the
       best-written part of the game into nonsense. What it takes away is the
       rhythm: you no longer know which side the doors will open on, or how
       long you have once they do. */
    if (this.nightmare && index > 0) {
      station.side = this.rng.stream(`side:${this.seed}:${index}`).bool() ? 1 : -1;
    }
    this.world.setStation(station, distance);
    this.scene.fogDensity = station.fog ?? 0.02;

    this.state.routeStage = Math.max(this.state.routeStage, routeStageFor(index));
    this._applyRouteStage();
    this.director.reset(index);
    if (!initial) this.props.spawnForStation(index, this.state.clues);
    this.sfxCorruption(index);
  }

  sfxCorruption(index) {
    this.sfx.corruption = clamp((index - 1) / 6, 0, 1) * (this.nightmare ? 1.25 : 1);
  }

  _applyRouteStage() {
    const stage = ROUTE_STAGES[clamp(this.state.routeStage, 0, ROUTE_STAGES.length - 1)];
    this.world.setRouteMap(stage.stations, {
      title: stage.title,
      subtitle: stage.subtitle,
      lineColor: stage.lineColor,
      scrawl: stage.scrawl,
      highlight: STATIONS[Math.min(this.state.stationIndex + 1, STATIONS.length - 1)]?.id,
    });
  }

  bumpRouteStage() {
    this.state.routeStage = clamp(this.state.routeStage + 1, 0, ROUTE_STAGES.length - 1);
    this._applyRouteStage();
    this.state.flags.mapChanged = true;
  }

  setDisplayOverride(text, corrupt = false) {
    this._displayOverride = text;
    this._displayCorrupt = corrupt;
    this._displayText = '';    // force a redraw
  }

  /* ---- frame ----------------------------------------------------------- */

  update(dt, input, elapsed) {
    if (!this.running) return;
    const st = this.state;
    st.totalTime += dt;
    this.phaseTime += dt;
    this.scene.time = elapsed;

    this._updatePhase(dt);

    /* Odometer. Everything outside the train is positioned from this. */
    this.world.speed = this.world.speed ?? 0;
    this.world.worldZ += this.world.speed * MAX_SPEED * dt;

    /* Body roll. A train at line speed is never still, and the amount it
       moves is the difference between a corridor and a vehicle. */
    const s = this.world.speed;
    const t = elapsed;
    this.sway = (Math.sin(t * 1.35) * 0.6 + Math.sin(t * 0.61 + 1.2) * 0.4) * 0.045 * s
      + Math.sin(t * 3.1) * 0.004 * s;
    this.roll = (Math.sin(t * 1.05 + 0.4) * 0.5 + Math.sin(t * 2.3) * 0.2) * 0.012 * s;

    const allowExit = this.phase === 'stopped' || this.phase === 'boarding';
    this.player.update(dt, input, {
      sfx: this.sfx,
      allowExit,
      onStepOff: () => this._onStepOff(),
      onBoard: () => this._onBoard(),
    });
    this.player.applyToCamera(this.camera, this.sway, this.roll, elapsed);

    this.world.update(dt, {
      playerZ: this.player.position[2],
      time: elapsed,
      sway: this.sway,
      eye: this.camera.position,
    });

    this._updateAvatar(dt, elapsed);
    this.crowd.update(dt, elapsed, this.camera, { sway: this.sway });
    this.crowd.spend(dt, this.camera, this.player.car, this._forceUnobserved);
    this._forceUnobserved = false;

    this.director.update(dt, this._anomalyContext(), this.phase === 'traveling' || this.phase === 'departing');

    this._updateInteractables();
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    if (input) this._handleInput(input);
    this._updateDisplay();
    this._updateAudio(dt);
    this._updateFx(dt);
    this._checkAchievements(dt);
  }

  _updatePhase(dt) {
    const world = this.world;
    const station = this.station;

    switch (this.phase) {
      case 'boarding': {
        this.fx.fade = damp(this.fx.fade, 0, 1.2, dt);
        world.speed = 0;
        if (this.phaseTime > 1.6 && !this.state.flags.introChime) {
          this.state.flags.introChime = true;
          this.sfx.play('doorChime');
          this.sfx.speak(station.onboard || 'Please mind the gap between the train and the platform.', { chime: false });
        }
        if (this.phaseTime > 2.6) {
          const moved = world.driveDoors(dt, station.side, 1, 0.55);
          if (moved && !this.state.flags.introDoors) {
            this.state.flags.introDoors = true;
            this.sfx.play('doorOpen');
          }
        }
        /* The doors do not close until the player is aboard. Nobody is
           getting stranded on the first platform. */
        if (!this.player.outside) {
          this.state.boardedFor = (this.state.boardedFor || 0) + dt;
          if (this.state.boardedFor > 6) {
            this.phase = 'stopped';
            this.phaseTime = CLOSE_WARNING > 0 ? station.dwell - CLOSE_WARNING - 0.5 : 0;
            this.dwell = station.dwell;
          }
        } else {
          this.state.boardedFor = 0;
        }
        break;
      }

      case 'stopped': {
        world.speed = 0;
        this.fx.fade = damp(this.fx.fade, 0, 1.6, dt);
        const remaining = this.dwell - this.phaseTime;

        if (remaining <= CLOSE_WARNING && !this.state.flags.closeWarned) {
          this.state.flags.closeWarned = true;
          if (!station.silent) {
            this.sfx.speak(station.terminus
              ? 'All passengers must leave the train.'
              : 'Please stand clear of the doors. The doors are closing.', { chime: false });
          }
          this.sfx.play('doorAlarm');
        }
        if (remaining <= CLOSE_TIME) {
          const moved = world.driveDoors(dt, station.side, 0, 0.5);
          if (moved && !this.state.flags.closing) {
            this.state.flags.closing = true;
            this.sfx.play('doorClose');
          }
        } else {
          world.driveDoors(dt, station.side, 1, 0.9);
        }

        if (Math.abs(this.player.position[0]) > CAR.doorwayHalf - 0.35 && !this.player.outside
          && world.doorsOpenAmount(station.side) > 0.6) {
          this.state.doorwayStations.add(station.id);
        }

        if (remaining <= 0) this._resolveDecision();
        break;
      }

      case 'departing': {
        const u = clamp(this.phaseTime / ACCEL_TIME, 0, 1);
        world.speed = 1 - (1 - u) * (1 - u);
        this.fx.fade = damp(this.fx.fade, 0, 2, dt);
        if (this.phaseTime >= ACCEL_TIME) {
          this.phase = 'traveling';
          this.phaseTime = 0;
        }
        break;
      }

      case 'traveling': {
        world.speed = 1;
        const leg = (this.station.legSeconds ?? 70) * (this.nightmare ? 0.86 : 1);
        if (this.phaseTime >= leg) {
          this._beginArrival();
        }
        break;
      }

      case 'arriving': {
        const u = clamp(this.phaseTime / BRAKE_TIME, 0, 1);
        world.speed = Math.pow(1 - u, BRAKE_EXP);
        if (this.phaseTime > 1.4 && !this.state.flags.braked) {
          this.state.flags.braked = true;
          this.sfx.play('brake', { duration: BRAKE_TIME * 0.75 });
        }
        if (u >= 1) {
          world.speed = 0;
          world.worldZ = world.stationDistance ?? world.worldZ;
          this._arrive();
        }
        break;
      }

      case 'ending': {
        this.fx.fade = damp(this.fx.fade, 1, 0.75, dt);
        world.speed = damp(world.speed, this.endingSpeed ?? 0, 0.6, dt);
        break;
      }
      default:
        break;
    }
  }

  _beginArrival() {
    const next = Math.min(this.state.stationIndex + 1, STATIONS.length - 1);
    this.phase = 'arriving';
    this.phaseTime = 0;
    this.state.flags.braked = false;
    this.state.flags.closeWarned = false;
    this.state.flags.closing = false;
    this._enterStation(next);
    const station = this.station;
    if (!station.silent && station.arrival) {
      this.sfx.speak(station.arrival, { corruption: station.id === 'unknown' ? 0.9 : undefined });
    } else if (station.silent) {
      /* No announcement at all, and the bed drops with it. The absence is
         the announcement. */
      this.audio.duck(0.35, 1.4);
      this.sfx.caption('[no announcement]');
    }
  }

  _arrive() {
    const station = this.station;
    this.phase = 'stopped';
    this.phaseTime = 0;
    this.dwell = this.nightmare
      ? this.rng.stream(`dwell:${this.seed}:${this.state.stationIndex}`).float(13, 34)
      : station.dwell;
    this.state.flags.closeWarned = false;
    this.state.flags.closing = false;
    if (this.audio.duckAmount < 1) this.audio.duck(1, 1.2);

    this.sfx.play('doorChime');
    this.world.driveDoors(0.001, station.side, 1, 0.5);
    this.sfx.play('doorOpen', { pan: station.side * 0.4 });

    this.crowd.applyStation(this.state.stationIndex);
    this.props.spawnForStation(this.state.stationIndex, this.state.clues);
    this._placeWatcher(station);
    this.save();
    this.events.emit('station', { index: this.state.stationIndex, station });
  }

  /* Platform Zero's one occupant. He is a very long way away and he is
     exactly the right height for that distance, which is the only thing that
     makes him work. */
  _placeWatcher(station) {
    const w = this.crowd.watcher;
    if (!station.watcher) {
      w.present = false;
      w.customPos = null;
      return;
    }
    const side = station.side;
    w.present = true;
    w.pose = 'standStill';
    w.watch = 1;
    w.customPos = [side * (PLATFORM.outerX - 1.1), PLATFORM.topY, (this.world.platformZ ?? 0) + 31];
    w.customYaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  _onStepOff() {
    this.sfx.play('cloth', { caption: false });
    this.events.emit('stepped-off');
  }

  _onBoard() {
    this.events.emit('boarded');
  }

  _resolveDecision() {
    const station = this.station;
    const decision = this.player.outside ? 'off' : 'stay';
    const ending = resolveEnding(decision, station, this.state);

    if (ending) {
      this._finish(ending, decision);
      return;
    }

    this.phase = 'departing';
    this.phaseTime = 0;
    this.state.flags.closeWarned = false;
    this.state.flags.closing = false;
    this.sfx.play('depart');
    if (station.departure && !station.silent) {
      this.sfx.speak(station.departure.replace('…', nextName(this.state.stationIndex)), { chime: false });
    }
    this.world.clearStation();
    this.crowd.watcher.present = false;
    this.events.emit('departed', { index: this.state.stationIndex });
  }

  _finish(endingId, decision) {
    const ending = endingById(endingId);
    this.phase = 'ending';
    this.phaseTime = 0;
    this.endingSpeed = decision === 'stay' ? 0.55 : 0;
    this.player.frozen = true;
    this.player.locked = true;
    this.director.clear(this._anomalyContext());
    this.audio.duck(0.25, 2.2);
    this.sfx.play('stinger', { caption: false });

    const record = this.profile.endings[endingId] || { firstSeen: Date.now(), count: 0 };
    record.count += 1;
    record.lastSeen = Date.now();
    this.profile.endings[endingId] = record;
    this.profile.runsCompleted = (this.profile.runsCompleted || 0) + 1;
    if (!this.profile.nightmareUnlocked) this.profile.nightmareUnlocked = true;
    if (this.nightmare) {
      this.profile.nightmareCompleted = true;
      this.achievements.unlock('nightmare');
    }
    for (const id of this.state.clues) {
      if (!this.profile.codex[id]) this.profile.codex[id] = Date.now();
    }
    if (this.state.stationIndex >= STATIONS.length - 1) this.achievements.unlock('rodeToEnd');
    if (this.state.sitCount === 0 && this.state.stationIndex >= STATIONS.length - 1) this.achievements.unlock('noSit');
    if (this.state.doorwayStations.size >= STATIONS.length - 1) this.achievements.unlock('everyStation');
    this.achievements.reconcile(this.profile);
    if (Object.keys(this.profile.endings).length >= 7) this.achievements.unlock('allEndings');

    clearSave();
    this.events.emit('ending', { ending, state: this.state, nightmare: this.nightmare });
  }

  /* ---- avatar (the reflection) ----------------------------------------- */

  _updateAvatar(dt, elapsed) {
    const a = this.avatar;
    const p = this.player;
    this._avatarTrail.push({
      t: elapsed, x: p.position[0], z: p.position[2], y: p.position[1],
      yaw: p.yaw, sitting: Boolean(p.sitting), bob: p.bob, bobAmount: p.bobAmount,
    });
    while (this._avatarTrail.length > 200) this._avatarTrail.shift();

    if (a.frozen) return;

    let sample = this._avatarTrail[this._avatarTrail.length - 1];
    if (a.delay > 0) {
      const want = elapsed - a.delay;
      for (let i = this._avatarTrail.length - 1; i >= 0; i--) {
        if (this._avatarTrail[i].t <= want) { sample = this._avatarTrail[i]; break; }
      }
    }

    const pose = sample.sitting ? 'sit' : 'stand';
    a.body.mesh = this.world.passengerMeshes.body('average', pose);
    const bobY = Math.sin(sample.bob * 2) * 0.021 * (sample.bobAmount || 0);
    /* The avatar faces the way the player faces; a passenger mesh faces +Z and
       the camera looks down -Z, hence the half turn. */
    const yaw = sample.yaw + Math.PI;
    composeInto(a.body.matrix, sample.x, sample.y + bobY, sample.z, yaw);
    const anchorY = (sample.sitting ? 1.19 : 1.62) + bobY;
    composeInto(a.head.matrix, sample.x, sample.y + anchorY, sample.z, yaw);
  }

  /* ---- interaction ------------------------------------------------------ */

  _updateInteractables() {
    const list = this._interactables;
    list.length = 0;
    const car = this.player.car;
    const eye = this.camera.position;

    for (const v of this.world.interactablesFor(car)) list.push(v);
    this.props.interactablesFor(car, list);

    /* Seats near enough to sit on. Generating all fifty-four every frame is
       cheap, but only the ones within reach are worth testing. */
    if (!this.player.sitting && !this.player.outside) {
      const base = carCenterZ(car);
      for (const slot of SEAT_SLOTS) {
        const z = base + slot.z;
        if (Math.abs(z - eye[2]) > 2.6) continue;
        if (this._seatTaken(car, slot.index)) continue;
        list.push({
          id: `seat.${car}.${slot.index}`,
          type: 'seat',
          car, slot: slot.index,
          label: 'Seat', verb: 'Sit',
          min: [slot.x - 0.30, 0.30, z - 0.22],
          max: [slot.x + 0.30, 0.95, z + 0.22],
        });
      }
    }

    for (const person of this.crowd.all()) {
      if (!person.present || person === this.crowd.apparition || person === this.crowd.watcher) continue;
      const pos = person.position();
      if (Math.abs(pos[2] - eye[2]) > 3.2) continue;
      list.push({
        id: `person.${person.id}`,
        type: 'person',
        personId: person.id,
        label: person.def.label || 'A passenger',
        verb: 'Speak to',
        min: [pos[0] - 0.34, 0.35, pos[2] - 0.34],
        max: [pos[0] + 0.34, 1.45, pos[2] + 0.34],
      });
    }

    this.player.pick(list, this.camera);
  }

  _seatTaken(car, slotIndex) {
    for (const p of this.crowd.all()) {
      if (p.present && !p.customPos && p.car === car && p.seat === slotIndex) return true;
    }
    return false;
  }

  _handleInput(input) {
    /* Drained every frame whether or not it is used, so a click that lands
       during a document overlay does not fire the moment it closes. */
    const clicked = input.takeClick();
    if (this.phase === 'ending' || this.interactCooldown > 0) return;
    if (input.pressed('interact') || clicked) {
      if (this.player.sitting) {
        const target = this.player.hover;
        if (!target || target.type === 'seat') {
          this.player.stand();
          this.sfx.play('seatCreak', { caption: false });
          return;
        }
      }
      const target = this.player.hover;
      if (target) this._interact(target);
    }
  }

  _interact(target) {
    const st = this.state;
    switch (target.type) {
      case 'seat':
        this.player.sit(target.car, target.slot);
        st.sitCount++;
        this.sfx.play('seatCreak', { caption: false });
        this.achievements.unlock('sat');
        break;

      case 'clue': {
        const clue = clueById(target.clueId);
        if (!clue) break;
        st.clues.add(clue.id);
        for (const f of clue.flags || []) st.flags[f] = true;
        this.props.remove(clue.id);
        this.sfx.play('clue', { caption: false });
        this.sfx.play('paper', { caption: false });
        this.events.emit('document', { kind: 'clue', clue });
        this.events.emit('clue', { clue, total: st.clues.size, of: TOTAL_CLUES });
        this.achievements.unlock('firstClue');
        if (st.clues.size >= Math.ceil(TOTAL_CLUES / 2)) this.achievements.unlock('halfClues');
        if (st.clues.size >= TOTAL_CLUES) this.achievements.unlock('allClues');
        break;
      }

      case 'routemap':
        this.events.emit('document', {
          kind: 'image',
          title: 'Route map',
          canvas: this.renderer.textures.canvas('routemap'),
          caption: st.flags.mapChanged ? 'It is not the map you looked at before.' : '',
        });
        if (st.flags.mapChanged) this.achievements.unlock('mapChanged');
        this.sfx.play('cloth', { caption: false });
        break;

      case 'ad': {
        const key = `ad:${target.adIndex}`;
        const perCar = `ad:${target.car}:${target.adIndex}`;
        const canvas = this.renderer.textures.canvas(perCar) || this.renderer.textures.canvas(key);
        this.events.emit('document', { kind: 'image', title: 'Advertisement', canvas });
        break;
      }

      case 'notice':
        this.events.emit('document', {
          kind: 'image', title: 'Notice', canvas: this.renderer.textures.canvas('notice'),
        });
        break;

      case 'display':
        this.events.emit('document', {
          kind: 'image', title: 'Service display', canvas: this.renderer.textures.canvas('display'),
        });
        break;

      case 'emergency':
        this._pullAlarm();
        break;

      case 'connecting': {
        const car = target.car;
        const boundary = target.end > 0 ? car : car - 1;
        if (boundary < 0 || boundary >= this.world.carCount - 1) {
          this.sfx.play('buttonDenied', { caption: false });
          this.events.emit('flavour', { text: 'There is nothing beyond this door but the night.' });
          break;
        }
        const opened = this.player.openGate(boundary);
        if (opened) {
          this.sfx.play('doorOpen', { caption: false, pan: target.end * 0.3 });
          this._openGateOver(boundary);
        } else {
          this.sfx.play('buttonDenied', { caption: false });
          this.events.emit('flavour', { text: 'It does not move. It moved an hour ago.' });
        }
        break;
      }

      case 'window':
        this.events.emit('flavour', {
          text: this.world.speed > 0.4
            ? 'Black glass, and the carriage in it, and past the carriage nothing at all.'
            : 'The platform, and the carriage laid over it, and both of them equally real.',
        });
        break;

      case 'camera':
        this.events.emit('flavour', {
          text: this.world.cameraTracking
            ? 'The lens is pointed at you. It was pointed down the carriage a moment ago.'
            : 'A small red light. It has been on all night.',
        });
        if (this.world.cameraTracking) this.achievements.unlock('sawCamera');
        break;

      case 'door':
        this.events.emit('flavour', {
          text: this.phase === 'stopped'
            ? 'The platform is right there. You could simply step down.'
            : 'Sealed. Beyond it the tunnel wall goes past at speed.',
        });
        break;

      case 'person':
        this._talkTo(target.personId);
        break;

      default:
        break;
    }
  }

  /* Both leaves of a gangway door move together, over a second and a half,
     ticked in _updateAudio along with everything else that is on a timer. */
  _openGateOver(boundary) {
    const a = this.world.cars[boundary].connecting.find((c) => c.end > 0);
    const b = this.world.cars[boundary + 1].connecting.find((c) => c.end < 0);
    if (!a || !b) return;
    this._gateAnim = this._gateAnim || [];
    this._gateAnim.push({ a, b, t: 0 });
  }

  _pullAlarm() {
    const st = this.state;
    this.sfx.play('button', { caption: false });
    if (st.flags.pulledAlarm) {
      this.events.emit('flavour', { text: 'It is already lit. It has been lit since you pulled it.' });
      return;
    }
    st.flags.pulledAlarm = true;
    this.achievements.unlock('alarm');
    this.events.emit('flavour', { text: 'A light comes on above the handle. Somewhere, a cab is supposed to answer.' });

    /* And then nothing answers, for eleven seconds, which is a long time. */
    this._alarmTimer = 11;
  }

  _talkTo(id) {
    const st = this.state;
    /* `find`, not `get`: the interaction layer offers the nameless passengers
       too, and they do not live in the named-cast map. */
    const person = this.crowd.find(id);
    if (!person) return;
    if (id === 'stranger') {
      const index = clamp(st.stationIndex, 0, STRANGER_LINES.length - 1);
      const said = st.strangerSaid[index] || 0;
      const lines = STRANGER_LINES[index];
      const line = said < lines.length
        ? lines[said]
        : STRANGER_REPEAT[Math.min(said - lines.length, STRANGER_REPEAT.length - 1)];
      st.strangerSaid[index] = said + 1;
      if (said < lines.length) {
        st.strangerTalks++;
        st.flags.talkedStranger = true;
        this.achievements.unlock('talkedStranger');
        if (st.strangerTalks >= 5) this.achievements.unlock('strangerFive');
      }
      this.events.emit('speech', { speaker: 'The passenger at the far end', text: line });
      this.sfx.whisper(line.replace(/[“”"]/g, ''), { gain: 0.032, pan: 0, far: 0.1, speaker: '' });
      return;
    }
    const count = st.spokenTo[id] || 0;
    st.spokenTo[id] = count + 1;
    this.events.emit('speech', { speaker: '', text: passengerLine(id, count) });
    if (Math.random() < 0.35) this.sfx.play('cloth', { caption: false, pan: 0 });
  }

  /* ---- support systems --------------------------------------------------- */

  _updateDisplay() {
    const st = this.state;
    const next = STATIONS[Math.min(st.stationIndex + 1, STATIONS.length - 1)];
    const lines = displayLines({
      phase: this.phase,
      override: this._displayOverride || (this.phase === 'stopped' && this.station.displayOverride) || null,
      stationName: this.station.name,
      nextName: this.station.terminus ? '—' : next.name,
      clock: clockFor(st.stationIndex, st.totalTime, st.flags.clockCorrupt),
    });
    const text = lines.join('|');
    if (text === this._displayText) return;
    this._displayText = text;
    this.world.setDisplay(lines, {
      corrupt: this._displayCorrupt || false,
      color: this.station.id === 'unknown' ? '#ff5a3a' : '#ffb03a',
    });
  }

  _updateAudio(dt) {
    this.audio.updateAmbient(dt, this.world.speed, {
      doorsOpen: this.world.doorsOpenAmount(this.station.side) > 0.3,
      lightsOn: this.world.cars[this.player.car]?.lights.some((l) => l.enabled) ?? true,
      humScale: this.phase === 'ending' ? 0.2 : 1,
    });

    if (this._alarmTimer > 0) {
      this._alarmTimer -= dt;
      if (this._alarmTimer <= 0) {
        this._alarmTimer = 0;
        this.audio.duck(0.15, 0.6);
        this.sfx.caption('[nothing answers]');
        this.achievements.unlock('noAlarm');
        setTimeout(() => this.audio.duck(1, 1.4), 2600);
      }
    }

    /* Connecting doors that were asked to open. */
    if (this._gateAnim) {
      for (let i = this._gateAnim.length - 1; i >= 0; i--) {
        const g = this._gateAnim[i];
        g.t += dt;
        const v = clamp(g.t / 1.5, 0, 1);
        g.a.open = Math.max(g.a.open, v);
        g.b.open = Math.max(g.b.open, v);
        if (v >= 1) this._gateAnim.splice(i, 1);
      }
    }
  }

  _updateFx(dt) {
    const fx = this.fx;
    fx.grain = damp(fx.grain, fx.grainTarget, 1.6, dt);
    fx.desaturate = damp(fx.desaturate, fx.desaturateTarget, 1.2, dt);
    fx.pulse = damp(fx.pulse, fx.pulseTarget, 1.4, dt);

    const intensity = this.state.stationIndex / (STATIONS.length - 1);
    fx.vignette = lerp(0.42, 0.68, intensity);
    fx.distort = lerp(0, 0.55, Math.max(0, intensity - 0.4) / 0.6);
    this.scene.glassWarp = fx.distort * 0.8;
    /* The ambient falls away across the night. It is a small number and it
       is the one that decides whether the far end of the carriage is a place
       or a hole. */
    this.scene.ambient[0] = lerp(0.150, 0.096, intensity);
    this.scene.ambient[1] = lerp(0.162, 0.106, intensity);
    this.scene.ambient[2] = lerp(0.192, 0.134, intensity);
    this.scene.reflectionStrength = this.avatar.frozen ? 1 : 1;
    this.scene.rainSpeed = 0.006 + this.world.speed * 0.03;

    /* Light flicker: a global, faint mains wobble plus whatever an anomaly is
       doing to individual fittings. */
    const t = this.scene.time;
    this.scene.lightScale = 1 + Math.sin(t * 31.4) * 0.012 + Math.sin(t * 7.7) * 0.008;
  }

  _checkAchievements(dt) {
    const st = this.state;
    if (!st.flags.walkedTrain) {
      const front = carCenterZ(this.world.carCount - 1);
      const back = carCenterZ(0);
      if (this.player.maxZ > front - 3 && this.player.minZ < back + 3) {
        st.flags.walkedTrain = true;
        this.achievements.unlock('walkedTrain');
      }
    }
    if (this.player.stillTime > 60 && this.world.speed > 0.8) {
      this.achievements.unlock('stoodStill');
      this.player.stillTime = 0;
    }
    if (this.state.flags.sawReflection) this.achievements.unlock('sawReflection');
    if (this.crowd.lookedAwayCount >= 15) this.achievements.unlock('lookedAway');
  }

  _anomalyContext() {
    return {
      world: this.world,
      crowd: this.crowd,
      player: this.player,
      camera: this.camera,
      sfx: this.sfx,
      audio: this.audio,
      fx: this.fx,
      rng: this.director.rng,
      settings: this.settings,
      flags: this.state.flags,
      avatar: this.avatar,
      speed: this.world.speed,
      playerCar: this.player.car,
      playerZ: this.player.position[2],
      playerYaw: this.player.yaw,
      stationIndex: this.state.stationIndex,
      totalTime: this.state.totalTime,
      emit: (type, payload) => this.events.emit(type, payload),
      queueUnobserved: (person, fn, point) => this.crowd.queueUnobserved(person, fn, point),
      queueUnobservedCar: (car, fn, point) => this.crowd.queueUnobservedCar(car, fn, point),
      spendUnobserved: (force) => { this._forceUnobserved = force; },
      setDisplayOverride: (text, corrupt) => this.setDisplayOverride(text, corrupt),
      bumpRouteStage: () => this.bumpRouteStage(),
    };
  }

  /* Abandoning a run mid-anomaly. Every live handle gets its end() so nothing
     it changed — a dark carriage, a raised grain target, a frozen reflection —
     survives into the next run through the fx object, which outlives the run. */
  abort() {
    if (!this.running) return;
    this.director?.clear(this._anomalyContext());
    this.fx.grainTarget = 1;
    this.fx.desaturateTarget = 0;
    this.fx.pulseTarget = 0;
    this.fx.distort = 0;
    this.avatar.delay = 0;
    this.avatar.frozen = false;
    this.world.cameraTracking = false;
    this.world.handlesFrozen = false;
    this.setDisplayOverride(null);
    this.running = false;
  }

  /* ---- render ------------------------------------------------------------ */

  render() {
    if (!this.ready) return;
    const nodes = this.world.collectNodes();
    this.props.nodes(nodes);
    this.crowd.nodes(nodes);
    nodes.push(this.avatar.body, this.avatar.head);
    this.scene.nodes = nodes;
    this.scene.lights = this.world.collectLights();
    this.renderer.render(this.scene, this.camera, this.fx);
  }

  dispose() {
    this.running = false;
    this.world?.dispose();
    this.props?.dispose();
    this.renderer.dispose();
  }
}

/* ---- helpers ------------------------------------------------------------ */

const AVATAR_COLORS = {
  coat: [0.10, 0.11, 0.14],
  legs: [0.09, 0.09, 0.11],
  shoes: [0.05, 0.05, 0.06],
};

function freshState(seed, nightmare) {
  return {
    seed,
    nightmare,
    stationIndex: 0,
    totalTime: 0,
    clues: new Set(),
    flags: {},
    strangerTalks: 0,
    strangerSaid: {},
    spokenTo: {},
    sitCount: 0,
    doorwayStations: new Set(),
    routeStage: 0,
  };
}

function brakeDistance() {
  return (MAX_SPEED * BRAKE_TIME) / (BRAKE_EXP + 1);
}

function routeStageFor(index) {
  if (index <= 1) return 0;
  if (index === 2) return 1;
  if (index === 3) return 2;
  if (index <= 5) return 3;
  return 4;
}

function nextName(index) {
  const next = STATIONS[Math.min(index + 1, STATIONS.length - 1)];
  return next ? next.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}

/* Position + yaw only. The avatar never pitches or rolls; a reflection that
   leans with the carriage draws the eye to itself, and the whole point of the
   reflection is that the player is not looking at it on purpose. */
function composeInto(out, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

