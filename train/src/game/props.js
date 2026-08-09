/*
 * props.js — the objects people leave behind.
 *
 * Each clue in clues.js gets a small piece of geometry on a seat, on the floor
 * or screwed to a wall. They are not marked, not outlined and not lit
 * differently; the only thing that tells the player an object is readable is
 * that the crosshair changes when it is on one, which is the smallest possible
 * amount of help.
 *
 * A prop is spawned when its station comes round and is removed the moment it
 * has been read, because a carriage that accumulates read litter starts to
 * look like an inventory screen.
 */

import { mat4, compose } from '../core/math.js';
import { Builder } from '../render/mesh.js';
import { CAR, carCenterZ, seatSlot } from '../world/dims.js';
import { CLUES } from './clues.js';

export function buildPropMeshes(gl, materials) {
  const out = {};

  const paper = new Builder();
  paper.ao = 0.95;
  paper.material('paperProp');
  paper.push();
  paper.box(0.24, 0.008, 0.31, { tiles: 1 });
  paper.translate(0.01, 0.009, -0.02);
  paper.rotateY(0.12);
  paper.box(0.22, 0.006, 0.28, { tiles: 1 });
  paper.pop();
  out.paper = paper.build(gl, materials);

  const card = new Builder();
  card.ao = 0.95;
  card.material('cardProp');
  card.push();
  card.box(0.085, 0.004, 0.055, { tiles: 1 });
  card.pop();
  out.card = card.build(gl, materials);

  const phone = new Builder();
  phone.ao = 0.9;
  phone.material('phoneProp');
  phone.push();
  phone.box(0.072, 0.010, 0.148, { tiles: 1 });
  phone.pop();
  phone.material('screen');
  phone.push();
  phone.translate(0, 0.0055, 0);
  phone.box(0.062, 0.001, 0.132, { tiles: 1, faces: '+y' });
  phone.pop();
  out.phone = phone.build(gl, materials);

  const object = new Builder();
  object.ao = 0.9;
  object.material('objectProp');
  object.push();
  object.box(0.07, 0.030, 0.07, { tiles: 2 });
  object.pop();
  out.object = object.build(gl, materials);

  const umbrella = new Builder();
  umbrella.ao = 0.85;
  umbrella.material('objectProp');
  umbrella.push();
  umbrella.rotateX(0.32);
  umbrella.cylinder(0.019, 0.026, 0.82, 8, { caps: true, tiles: 2 });
  umbrella.translate(0, 0.44, 0);
  umbrella.cylinder(0.010, 0.010, 0.10, 6, { caps: true });
  umbrella.pop();
  out.umbrella = umbrella.build(gl, materials);

  const notice = new Builder();
  notice.ao = 0.95;
  notice.material('noticeProp');
  notice.push();
  notice.panel(0.26, 0.32);
  notice.pop();
  out.notice = notice.build(gl, materials);

  return out;
}

export function propMaterials(base) {
  return {
    ...base,
    paperProp: { map: 'newspaper', specular: 0.04 },
    cardProp: { map: null, color: [0.72, 0.74, 0.70], specular: 0.20, shininess: 40 },
    phoneProp: { map: null, color: [0.06, 0.06, 0.07], specular: 0.55, shininess: 90 },
    objectProp: { map: 'cloth', color: [0.22, 0.20, 0.19], specular: 0.18 },
    noticeProp: { map: 'notice', specular: 0.12 },
  };
}

export class PropManager {
  constructor(gl, materials, world) {
    this.gl = gl;
    this.world = world;
    this.meshes = buildPropMeshes(gl, materials);
    this.props = new Map();
  }

  /* Adds anything unlocked by reaching this station that the player has not
     already taken. */
  spawnForStation(stationIndex, collected) {
    for (const clue of CLUES) {
      if (clue.after > stationIndex) continue;
      if (collected.has(clue.id)) continue;
      if (this.props.has(clue.id)) continue;
      this.spawn(clue);
    }
  }

  spawn(clue) {
    const spot = clue.spot || {};
    const car = clue.car ?? 1;
    const kind = clue.id === 'umbrella' ? 'umbrella' : clue.kind;
    const mesh = this.meshes[kind] || this.meshes.object;

    let x = 0, y = 0.02, z = carCenterZ(car), yaw = 0, pitch = 0;
    if (spot.type === 'seat') {
      const slot = seatSlot(spot.slot ?? 0);
      x = slot.x;
      y = CAR.seatY + 0.015;
      z = carCenterZ(car) + slot.z;
      yaw = slot.facing + (spot.yaw ?? 0.3);
    } else if (spot.type === 'floor') {
      x = spot.x ?? 0;
      y = 0.02;
      z = carCenterZ(car) + (spot.z ?? 0);
      yaw = spot.yaw ?? 0.7;
      if (kind === 'umbrella') {
        x = Math.sign(x || 1) * (CAR.corridorHalf + 0.05);
        y = 0.36;
      }
    } else if (spot.type === 'wall') {
      const side = spot.side ?? -1;
      x = side * (CAR.halfWidth - 0.04);
      y = spot.y ?? 1.5;
      z = carCenterZ(car) + (spot.z ?? 0);
      yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else if (spot.type === 'ad') {
      /* No geometry: the advertisement is already on the wall. The clue is
         reading it, not finding it. */
      this.props.set(clue.id, {
        clue, node: null,
        interactable: this._adInteractable(clue, car, spot.slot ?? 0),
      });
      return;
    }

    const node = {
      mesh,
      matrix: compose(mat4(), x, y, z, yaw, pitch, 0, 1, 1, 1),
      overrides: {},
      visible: true,
      reflect: true,
    };
    if (kind === 'paper' && clue.kind === 'paper') {
      node.overrides.paperProp = { map: 'newspaper', specular: 0.04 };
    }

    const pad = kind === 'umbrella' ? 0.30 : 0.18;
    const interactable = {
      id: `clue.${clue.id}`,
      type: 'clue',
      clueId: clue.id,
      label: clue.label || clue.title,
      verb: clue.verb || 'Read',
      car,
      min: [x - pad, y - 0.12, z - pad],
      max: [x + pad, y + (kind === 'umbrella' ? 0.6 : 0.24), z + pad],
    };

    this.props.set(clue.id, { clue, node, interactable });
  }

  _adInteractable(clue, car, slot) {
    const template = this.world.interactablesFor(car).find((v) => v.id === `ad.${slot}`);
    if (!template) return null;
    return {
      ...template,
      id: `clue.${clue.id}`,
      type: 'clue',
      clueId: clue.id,
      label: clue.label || clue.title,
      verb: clue.verb || 'Read',
      car,
    };
  }

  remove(id) {
    this.props.delete(id);
  }

  clear() {
    this.props.clear();
  }

  nodes(out = []) {
    for (const p of this.props.values()) if (p.node) out.push(p.node);
    return out;
  }

  interactablesFor(car, out = []) {
    for (const p of this.props.values()) {
      if (!p.interactable) continue;
      if (p.interactable.car !== car) continue;
      out.push(p.interactable);
    }
    return out;
  }

  dispose() {
    for (const m of Object.values(this.meshes)) m.dispose();
  }
}
