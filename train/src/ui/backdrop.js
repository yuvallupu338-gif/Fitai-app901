/*
 * backdrop.js — what is behind the main menu.
 *
 * An empty platform, at night, from standing height. Every twenty seconds or
 * so a train comes through and does not stop, and its lit windows go past at
 * line speed close enough to read the seats.
 *
 * It is the real world, the real renderer and the real train. The camera is
 * simply parked on the platform instead of inside the carriage, and the
 * odometer is driven past it. That costs nothing and it means the first thing
 * a player sees is the thing they are about to be inside.
 */

import { Camera } from '../render/renderer.js';
import { PLATFORM } from '../world/outside.js';
import { clamp, lerp } from '../core/math.js';

const IDLE = 13;
const PASS = 11.5;
const SWEEP = 150;

const MENU_STATION = {
  id: 'menu',
  name: 'CENTRAL',
  signName: 'CENTRAL',
  signSub: 'Line 4 · Zone 1',
  side: 1,
  tiled: true,
  decay: 0.25,
  lights: 0.8,
  lightIntensity: 0.42,
  benches: true,
  platformLength: 96,
};

export class Backdrop {
  constructor(game, sfx) {
    this.game = game;
    this.sfx = sfx;
    this.camera = new Camera(58);
    this.phase = 'idle';
    this.t = 0;
    this.cycle = 0;
    this.active = false;

    this.scene = {
      nodes: [],
      lights: [],
      ambient: [0.042, 0.048, 0.062],
      fogColor: [0.014, 0.017, 0.024],
      fogDensity: 0.026,
      lightScale: 1,
      time: 0,
      reflectionPlanes: [],
      reflectionStrength: 1,
      rainSpeed: 0.008,
      glassWarp: 0,
    };
    this.fx = {
      fade: 1, fadeColor: [0, 0, 0], grain: 1.15, vignette: 0.80,
      chromatic: 1, distort: 0.10, bloom: 0.7, brightness: 1,
      desaturate: 0.12, pulse: 0, scanline: 0, bloomThreshold: 0.55,
    };
  }

  enter() {
    const world = this.game.world;
    world.setStation(MENU_STATION, 0);
    world.worldZ = -SWEEP;
    world.speed = 0;
    for (let i = 0; i < world.carCount; i++) world.setCarLights(i, true);
    this.phase = 'idle';
    this.t = IDLE * 0.45;
    this.active = true;
    this.fx.fade = 1;
  }

  leave() {
    this.active = false;
    this.game.world.clearStation();
  }

  update(dt, elapsed) {
    if (!this.active) return;
    const world = this.game.world;
    this.scene.time = elapsed;
    this.t += dt;

    if (this.phase === 'idle') {
      world.worldZ = -SWEEP;
      if (this.t >= IDLE) {
        this.phase = 'pass';
        this.t = 0;
        this.cycle++;
        this.sfx?.play('trainPassing', { duration: PASS * 0.75, caption: false });
      }
    } else {
      const u = clamp(this.t / PASS, 0, 1);
      /* Eased at both ends so the train arrives out of the dark rather than
         being switched on beside you. */
      const s = u * u * (3 - 2 * u);
      world.worldZ = lerp(-SWEEP, SWEEP, s);
      if (u >= 1) { this.phase = 'idle'; this.t = 0; }
    }

    world.update(dt, {
      playerZ: this._cameraZ(),
      time: elapsed,
      sway: 0,
      eye: this.camera.position,
    });

    /* A slow drift, as though whoever is standing here is tired and shifting
       their weight. */
    const drift = Math.sin(elapsed * 0.11) * 0.10 + Math.sin(elapsed * 0.047) * 0.06;
    const bob = Math.sin(elapsed * 0.7) * 0.006;
    this.camera.position[0] = PLATFORM.innerX + 2.55;
    this.camera.position[1] = PLATFORM.topY + 1.63 + bob;
    this.camera.position[2] = this._cameraZ();
    this.camera.yaw = Math.PI / 2 + drift;
    this.camera.pitch = -0.045 + Math.sin(elapsed * 0.09) * 0.02;
    this.camera.roll = 0;
    this.camera.fov = 58;
    this.camera.update();

    this.fx.fade = Math.max(0, this.fx.fade - dt * 0.55);
  }

  _cameraZ() {
    const world = this.game.world;
    return (world.platformZ ?? 0) + 8;
  }

  render() {
    if (!this.active) return;
    const world = this.game.world;
    const nodes = world.collectNodes();
    this.scene.nodes = nodes;
    this.scene.lights = world.collectLights();
    this.game.renderer.render(this.scene, this.camera, this.fx);
  }
}
