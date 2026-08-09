/*
 * train.js — the world: four cars, the tunnel around them, and whichever
 * station is currently sliding past.
 *
 * Everything is built once. Per-frame work is limited to writing node
 * matrices, moving the tunnel, and deciding which cars are close enough to be
 * worth drawing. The cars share a single mesh and differ only by material
 * override, which is what makes "the advertisement in car three is not the one
 * that was there before" a one-line change instead of a rebuild.
 */

import { mat4, compose, identity, translate } from '../core/math.js';
import { CAR, carCenterZ } from './dims.js';
import {
  buildCarriage, buildHandles, buildDoorLeaf, buildConnectingDoor, buildGangway,
  buildSecurityCamera, CAMERA_MOUNTS, AD_SLOTS,
} from './carriage.js';
import {
  buildTunnelSegment, buildPlatform, platformLights, buildUnderframe,
  TUNNEL_SEGMENT, PLATFORM,
} from './outside.js';
import { trainMaterials } from './materials.js';
import { PassengerMeshCache, blobShadowTexture } from './passengers.js';
import {
  adTexture, routeMapTexture, displayTexture, stationSignTexture, noticeTexture,
  graffitiTexture, AD_TEMPLATES,
} from '../render/textures.js';

const HALF_LEN = CAR.length / 2;
export const REFLECT_PLANE_X = CAR.halfWidth - 0.014;
export const CAR_LIGHT_INTENSITY = 2.45;

export class TrainWorld {
  constructor(gl, renderer, rng, opts = {}) {
    this.gl = gl;
    this.renderer = renderer;
    this.textures = renderer.textures;
    this.rng = rng;
    this.carCount = opts.carCount ?? 4;

    this.materials = trainMaterials();
    this.textures.set('blob', blobShadowTexture(), { clamp: true });
    this.textures.set('routemap', routeMapTexture(DEFAULT_LINE, { rng: rng.stream('map') }), { clamp: true });
    this.textures.set('display', displayTexture(['', '']), { clamp: true });
    this.textures.set('stationSign', stationSignTexture('CENTRAL'), { clamp: true });
    this.textures.set('notice', noticeTexture(DEFAULT_NOTICE, rng.stream('notice')), { clamp: true });
    this.textures.set('graffiti', graffitiTexture(rng.stream('graf'), 'GET OFF'), { clamp: true });
    this.textures.set('ad:platform', adTexture(AD_TEMPLATES[4], rng.stream('padv')), { clamp: true });
    for (let i = 0; i < AD_SLOTS.length; i++) {
      this.textures.set(`ad:${i}`, adTexture(AD_TEMPLATES[i % AD_TEMPLATES.length], rng.stream(`ad${i}`)), { clamp: true });
    }

    const carriage = buildCarriage(gl, this.materials);
    this.carriageMesh = carriage.mesh;
    this.carLightTemplate = carriage.lights;
    this.interactionTemplate = carriage.interactables;
    this.poleTemplate = carriage.poles;
    this.handleMesh = buildHandles(gl, this.materials);
    this.doorLeafMesh = {
      '-1': buildDoorLeaf(gl, this.materials, -1),
      1: buildDoorLeaf(gl, this.materials, 1),
    };
    this.connectMesh = buildConnectingDoor(gl, this.materials);
    this.cameraMesh = buildSecurityCamera(gl, this.materials);
    this.gangwayMesh = buildGangway(gl, this.materials);
    this.tunnelMesh = buildTunnelSegment(gl, this.materials);
    this.underframeMesh = buildUnderframe(gl, this.materials, this.carCount);
    this.passengerMeshes = new PassengerMeshCache(gl, this.materials);

    this.worldZ = 0;
    this.speed = 0;
    this.lightScale = 1;
    this.handlesFrozen = false;
    this.cameraTracking = false;
    this.doorSide = 1;
    this.platform = null;
    this.platformNode = null;
    this.platformLights = [];
    this.stationDistance = null;

    this._nodes = [];
    this._lights = [];
    this.extraNodes = [];       // passengers and props, owned by the game
    this.extraLights = [];

    this._buildNodes();
  }

  /* ---- construction ------------------------------------------------- */

  _buildNodes() {
    this.cars = [];
    for (let i = 0; i < this.carCount; i++) {
      const z = carCenterZ(i);
      const car = {
        index: i,
        z,
        node: {
          mesh: this.carriageMesh,
          matrix: compose(mat4(), 0, 0, z, 0, 0, 0, 1, 1, 1),
          overrides: {},
          visible: true,
          reflect: false,
        },
        handles: {
          mesh: this.handleMesh,
          matrix: compose(mat4(), 0, 0, z, 0, 0, 0, 1, 1, 1),
          wobble: [0, 1.3, i * 1.7, CAR.railY],
          visible: true,
          reflect: false,
        },
        doors: [],
        connecting: [],
        lights: this.carLightTemplate.map((l) => ({
          ...l,
          position: [l.position[0], l.position[1], l.position[2] + z],
          car: i,
        })),
        /* Door state is [side][index]: 0 shut, 1 fully open. */
        doorOpen: { '-1': [0, 0], 1: [0, 0] },
        doorLocked: { '-1': [false, false], 1: [false, false] },
      };

      for (const side of [-1, 1]) {
        for (let d = 0; d < CAR.doorZ.length; d++) {
          for (let leaf = 0; leaf < 2; leaf++) {
            car.doors.push({
              node: {
                mesh: this.doorLeafMesh[String(side)],
                matrix: mat4(),
                visible: true,
                reflect: false,
              },
              side, index: d, leaf,
            });
          }
        }
      }

      car.cameras = CAMERA_MOUNTS.map((mount) => ({
        mount,
        yaw: mount.yaw,
        pitch: mount.pitch,
        node: { mesh: this.cameraMesh, matrix: mat4(), visible: true, reflect: false },
      }));

      for (const end of [-1, 1]) {
        car.connecting.push({
          node: { mesh: this.connectMesh, matrix: mat4(), visible: true, reflect: false },
          end,
          open: 0,
          locked: false,
          /* Cars at the ends of the train have nothing beyond them. */
          terminal: (end < 0 && i === 0) || (end > 0 && i === this.carCount - 1),
        });
      }

      this.cars.push(car);
    }

    this.gangways = [];
    for (let i = 0; i < this.carCount - 1; i++) {
      this.gangways.push({
        mesh: this.gangwayMesh,
        matrix: compose(mat4(), 0, 0, carCenterZ(i) + CAR.spacing / 2, 0, 0, 0, 1, 1, 1),
        visible: true,
        reflect: false,
      });
    }

    this.underframe = {
      mesh: this.underframeMesh,
      matrix: identity(mat4()),
      visible: true,
      reflect: false,
    };

    const trainLength = (this.carCount - 1) * CAR.spacing + CAR.length;
    this.trainCenter = ((this.carCount - 1) * CAR.spacing) / 2;
    this.tunnelCount = Math.ceil(trainLength / TUNNEL_SEGMENT) + 3;
    this.tunnelNodes = [];
    for (let i = 0; i < this.tunnelCount; i++) {
      this.tunnelNodes.push({
        mesh: this.tunnelMesh,
        matrix: mat4(),
        visible: true,
        reflect: false,
      });
    }
    this.tunnelBase = this.trainCenter - ((this.tunnelCount - 1) / 2) * TUNNEL_SEGMENT;
  }

  /* ---- stations ------------------------------------------------------ */

  /*
   * Places a platform on the line. `distance` is the odometer reading at which
   * the train comes to rest alongside it; the platform is simply parked in the
   * scrolling world at that offset and needs no further attention.
   */
  setStation(spec, distance) {
    this.clearStation();
    const side = spec.side ?? 1;
    this.doorSide = side;
    this.textures.set('stationSign', stationSignTexture(spec.signName ?? spec.name, {
      sub: spec.signSub,
      decay: spec.decay ?? 0,
      bg: spec.signBg,
      ink: spec.signInk,
      bar: spec.signBar,
      rng: this.rng.stream(`sign:${spec.id}`),
    }), { clamp: true });
    if (spec.platformAd) {
      this.textures.set('ad:platform', adTexture(spec.platformAd, this.rng.stream(`pad:${spec.id}`)), { clamp: true });
    }

    const mesh = buildPlatform(this.gl, this.materials, {
      side,
      tiled: spec.tiled !== false,
      benches: spec.benches !== false,
      length: spec.platformLength || PLATFORM.length,
    });
    this.platform = { mesh, spec, side };
    this.platformNode = { mesh, matrix: mat4(), visible: true, reflect: false };
    this.platformLights = platformLights(mesh, spec);
    this.stationDistance = distance;
  }

  clearStation() {
    if (this.platform) this.platform.mesh.dispose();
    this.platform = null;
    this.platformNode = null;
    this.platformLights = [];
    this.stationDistance = null;
  }

  /* Where the platform currently is, in train space. Null when there is no
     station on the line. */
  get platformZ() {
    if (this.stationDistance == null) return null;
    return this.trainCenter + (this.stationDistance - this.worldZ);
  }

  /* ---- content mutation ---------------------------------------------- */

  setAd(carIndex, slot, spec) {
    const key = `ad:${carIndex}:${slot}`;
    this.textures.set(key, adTexture(spec, this.rng.stream(key)), { clamp: true });
    const car = this.cars[carIndex];
    if (!car) return;
    car.node.overrides[`ad${slot}`] = { ...this.materials[`ad${slot}`], map: key };
  }

  setRouteMap(stations, opts = {}) {
    this.textures.set('routemap', routeMapTexture(stations, { ...opts, rng: this.rng.stream('map2') }), { clamp: true });
  }

  setDisplay(lines, opts = {}) {
    this.textures.set('display', displayTexture(lines, opts), { clamp: true });
  }

  setGraffiti(carIndex, text, visible = true) {
    if (text) this.textures.set('graffiti', graffitiTexture(this.rng.stream(`graf:${text}`), text), { clamp: true });
    for (const car of this.cars) {
      car.node.overrides.graffiti = { ...this.materials.graffiti, hidden: !(visible && car.index === carIndex) };
    }
  }

  setCarLights(carIndex, on, intensity = CAR_LIGHT_INTENSITY) {
    const car = this.cars[carIndex];
    if (!car) return;
    for (const l of car.lights) {
      l.enabled = on;
      l.intensity = on ? intensity : 0;
    }
    car.node.overrides.lightStrip = {
      ...this.materials.lightStrip,
      emissiveScale: on ? 1.35 * (intensity / CAR_LIGHT_INTENSITY) : 0.02,
    };
  }

  setDoorLocked(carIndex, side, index, locked) {
    const car = this.cars[carIndex];
    if (car) car.doorLocked[String(side)][index] = locked;
  }

  /* ---- per-frame ------------------------------------------------------ */

  update(dt, ctx) {
    const { playerZ = 0, time = 0, sway = 0 } = ctx;

    /* Tunnel scroll. The modulo keeps the segments in place while the offset
       carries them past; without it the coordinates grow until float precision
       makes the whole tunnel shiver. */
    const offset = -(((this.worldZ % TUNNEL_SEGMENT) + TUNNEL_SEGMENT) % TUNNEL_SEGMENT);
    for (let i = 0; i < this.tunnelNodes.length; i++) {
      const node = this.tunnelNodes[i];
      const z = this.tunnelBase + i * TUNNEL_SEGMENT + offset;
      identity(node.matrix);
      translate(node.matrix, node.matrix, 0, 0, z);
      node.visible = Math.abs(z - playerZ) < TUNNEL_SEGMENT * 2.6;
    }

    if (this.platformNode) {
      identity(this.platformNode.matrix);
      translate(this.platformNode.matrix, this.platformNode.matrix, 0, 0, this.platformZ);
      this.platformNode.visible = Math.abs(this.platformZ - playerZ) < 120;
    }

    const swayAmp = 0.010 + Math.abs(sway) * 0.05 + this.speed * 0.02;
    for (const car of this.cars) {
      const near = Math.abs(car.z - playerZ);
      const visible = near < CAR.spacing * 1.65;
      car.node.visible = visible;
      car.handles.visible = visible;
      car.handles.wobble[0] = this.handlesFrozen ? 0 : swayAmp;
      car.handles.wobble[1] = 1.15 + this.speed * 0.5;

      /* Only what the player is standing in needs to appear in the glass. A
         reflection of the next carriage along would be, at best, invisible. */
      const reflect = near < CAR.spacing * 0.85;
      car.node.reflect = reflect;
      car.handles.reflect = reflect;

      for (const door of car.doors) {
        const amount = car.doorOpen[String(door.side)][door.index];
        const dz = CAR.doorZ[door.index];
        const w = CAR.doorHalfWidth;
        const slide = (w + 0.04) * amount;
        const x = door.side * (CAR.halfWidth - 0.055);
        const z = door.leaf === 0 ? dz - w - slide : dz + w + slide;
        compose(door.node.matrix, x, 0, car.z + z, door.leaf === 0 ? 0 : Math.PI, 0, 0, 1, 1, 1);
        door.node.visible = visible;
        door.node.reflect = reflect;
      }

      for (const cam of car.cameras) {
        const m = cam.mount;
        const wx = m.x, wy = m.y, wz = car.z + m.z;
        let yaw = m.yaw;
        let pitch = m.pitch;
        if (this.cameraTracking && ctx.eye) {
          const dx = ctx.eye[0] - wx;
          const dy = ctx.eye[1] - wy;
          const dz = ctx.eye[2] - wz;
          const len = Math.hypot(dx, dy, dz) || 1;
          /* The lens looks down local -Z, so pointing it at a target means
             solving for the yaw and pitch that put -Z on the target. */
          yaw = Math.atan2(-dx, -dz);
          pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
        }
        cam.yaw += (((yaw - cam.yaw + Math.PI) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 2.2);
        cam.pitch += (pitch - cam.pitch) * Math.min(1, dt * 2.2);
        compose(cam.node.matrix, wx, wy, wz, cam.yaw, cam.pitch, 0, 1, 1, 1);
        cam.node.visible = visible;
        cam.node.reflect = false;
      }

      for (const conn of car.connecting) {
        const z = car.z + conn.end * (HALF_LEN - 0.03);
        const x = -0.45 - 0.95 * conn.open;
        compose(conn.node.matrix, x, 0, z, 0, 0, 0, 1, 1, 1);
        conn.node.visible = visible && !conn.terminal;
        conn.node.reflect = false;
      }
    }

    for (let i = 0; i < this.gangways.length; i++) {
      const z = carCenterZ(i) + CAR.spacing / 2;
      this.gangways[i].visible = Math.abs(z - playerZ) < CAR.spacing * 1.4;
    }

    this.time = time;
  }

  /* Opens or shuts every door on one side of every car. Returns the number of
     leaves that actually moved, so the caller knows whether to play a sound. */
  driveDoors(dt, side, target, speed = 1.1) {
    let moved = 0;
    for (const car of this.cars) {
      const arr = car.doorOpen[String(side)];
      for (let i = 0; i < arr.length; i++) {
        if (car.doorLocked[String(side)][i] && target > 0) continue;
        const before = arr[i];
        const delta = speed * dt;
        arr[i] = before < target ? Math.min(target, before + delta) : Math.max(target, before - delta);
        if (arr[i] !== before) moved++;
      }
    }
    return moved;
  }

  doorsOpenAmount(side) {
    let max = 0;
    for (const car of this.cars) {
      for (const v of car.doorOpen[String(side)]) max = Math.max(max, v);
    }
    return max;
  }

  /* ---- scene ---------------------------------------------------------- */

  collectNodes() {
    const nodes = this._nodes;
    nodes.length = 0;
    for (const t of this.tunnelNodes) if (t.visible) nodes.push(t);
    if (this.platformNode && this.platformNode.visible) nodes.push(this.platformNode);
    nodes.push(this.underframe);
    for (const g of this.gangways) if (g.visible) nodes.push(g);
    for (const car of this.cars) {
      if (!car.node.visible) continue;
      nodes.push(car.node, car.handles);
      for (const d of car.doors) if (d.node.visible) nodes.push(d.node);
      for (const c of car.connecting) if (c.node.visible) nodes.push(c.node);
      for (const cam of car.cameras) if (cam.node.visible) nodes.push(cam.node);
    }
    for (const n of this.extraNodes) if (n.visible !== false) nodes.push(n);
    return nodes;
  }

  collectLights() {
    const lights = this._lights;
    lights.length = 0;
    for (const car of this.cars) {
      if (!car.node.visible) continue;
      for (const l of car.lights) lights.push(l);
    }
    for (const l of this.platformLights) {
      lights.push({ ...l, position: [l.position[0], l.position[1], l.position[2] + this.platformZ] });
    }
    for (const l of this.extraLights) lights.push(l);
    return lights;
  }

  /* Interaction volumes for one car, lifted into train space. */
  interactablesFor(carIndex) {
    const car = this.cars[carIndex];
    if (!car) return [];
    return this.interactionTemplate.map((v) => ({
      ...v,
      car: carIndex,
      key: `${carIndex}:${v.id}`,
      min: [v.min[0], v.min[1], v.min[2] + car.z],
      max: [v.max[0], v.max[1], v.max[2] + car.z],
    }));
  }

  polesFor(carIndex) {
    const car = this.cars[carIndex];
    if (!car) return [];
    return this.poleTemplate.map((p) => ({ x: p.x, z: p.z + car.z, radius: p.radius }));
  }

  carIndexAt(z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.carCount; i++) {
      const d = Math.abs(z - carCenterZ(i));
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  dispose() {
    this.carriageMesh.dispose();
    this.handleMesh.dispose();
    this.doorLeafMesh['-1'].dispose();
    this.doorLeafMesh['1'].dispose();
    this.connectMesh.dispose();
    this.cameraMesh.dispose();
    this.gangwayMesh.dispose();
    this.tunnelMesh.dispose();
    this.underframeMesh.dispose();
    this.passengerMeshes.dispose();
    this.clearStation();
  }
}

export const DEFAULT_LINE = [
  { id: 'central', name: 'Central' },
  { id: 'riverside', name: 'Riverside' },
  { id: 'northend', name: 'North End' },
  { id: 'ashgrove', name: 'Ashgrove' },
  { id: 'kestrel', name: 'Kestrel Park' },
  { id: 'lastop', name: 'Marsh Lane' },
];

const DEFAULT_NOTICE = {
  title: 'In an emergency',
  body: 'Pull the handle only when the train is at a platform. Misuse is an offence.',
  foot: 'PENALTY 500',
};

