/*
 * outside.js — the tunnel and the platforms.
 *
 * The train never moves. The world slides past it, which is how every train
 * scene in every medium has ever been shot, and it means the player's collision
 * problem stays "a corridor" instead of becoming "a corridor on a moving
 * reference frame".
 *
 * The tunnel is four identical segments cycled through the scroll offset. A
 * station is one mesh built when the train is a minute out from it and thrown
 * away when it is a minute past, which is what lets each station be a
 * genuinely different place rather than a re-skin.
 */

import { Builder } from '../render/mesh.js';
import { CAR } from './dims.js';

export const TUNNEL_SEGMENT = 26;
export const TUNNEL_SEGMENTS = 4;

export function buildTunnelSegment(gl, materials) {
  const b = new Builder();
  b.ao = 0.8;
  const L = TUNNEL_SEGMENT;
  const halfW = 3.5;
  const top = 4.0;
  const bottom = -1.3;

  b.material('tunnel');
  /* Side walls, facing in. */
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * halfW, (top + bottom) / 2, 0);
    b.box(0.2, top - bottom, L, { tiles: 0.5, faces: s > 0 ? '-x' : '+x' });
    b.pop();
  }
  /* Crown. */
  b.push();
  b.translate(0, top, 0);
  b.box(halfW * 2, 0.2, L, { tiles: 0.5, faces: '-y' });
  b.pop();
  /* The haunch between wall and crown, so the tube is not a rectangle. */
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * (halfW - 0.45), top - 0.45, 0);
    b.rotateZ(s * Math.PI / 4);
    b.box(1.3, 0.16, L, { tiles: 0.5, faces: '-y' });
    b.pop();
  }

  /* Track bed. */
  b.material('ballast');
  b.push();
  b.translate(0, bottom + 0.1, 0);
  b.box(halfW * 2, 0.2, L, { tiles: 1.2, faces: '+y' });
  b.pop();

  b.material('rail');
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.72, bottom + 0.28, 0);
    b.box(0.08, 0.14, L, { tiles: 2 });
    b.pop();
  }
  b.material('sleeper');
  for (let z = -L / 2 + 0.3; z < L / 2; z += 0.62) {
    b.push();
    b.translate(0, bottom + 0.17, z);
    b.box(2.1, 0.12, 0.24, { tiles: 2, faces: ['+y', '+z', '-z'] });
    b.pop();
  }

  /* Segment rings, cable trays and the conduits that make the speed readable. */
  b.material('darkMetal');
  for (let z = -L / 2; z < L / 2; z += 3.25) {
    for (const s of [-1, 1]) {
      b.push();
      b.translate(s * (halfW - 0.12), 1.4, z);
      b.box(0.14, 3.2, 0.16, { tiles: 2 });
      b.pop();
    }
  }
  b.material('cable');
  for (const s of [-1, 1]) {
    for (const y of [2.55, 2.72, 2.88]) {
      b.push();
      b.translate(s * (halfW - 0.22), y, 0);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.035, 0.035, L, 6);
      b.pop();
    }
  }

  /* Service lamps: dim, sodium, and mostly out. Passing one is the only thing
     that tells you how fast you are going. */
  b.material('serviceLamp');
  for (let z = -L / 2 + 4; z < L / 2; z += 8.6) {
    b.push();
    b.translate(-(halfW - 0.30), 2.95, z);
    b.box(0.10, 0.26, 0.16, { tiles: 1 });
    b.pop();
  }

  const mesh = b.build(gl, materials);
  mesh.segmentLength = L;
  return mesh;
}

export const PLATFORM = {
  innerX: 1.62,        // where the platform edge sits from the train centreline
  outerX: 8.4,
  topY: -0.04,         // a shade below the carriage floor, as it always is
  wallTop: 4.6,
  length: 78,
};

/*
 * A station. `spec` describes how far it has been let go:
 *
 *   lights      how many of the ceiling fittings are alive
 *   decay       0 clean, 1 abandoned — drives the signage and the litter
 *   tiled       tiled wall (city centre) or bare concrete (outer stations)
 *   benches     seating, bins, the small furniture of a place people use
 *   signMap     the texture key for the station name
 */
export function buildPlatform(gl, materials, spec) {
  const b = new Builder();
  b.ao = 0.85;
  const side = spec.side >= 0 ? 1 : -1;
  const L = spec.length || PLATFORM.length;
  const x0 = PLATFORM.innerX;
  const x1 = PLATFORM.outerX;

  /* Deck. */
  b.material('platformFloor');
  b.push();
  b.translate(side * (x0 + x1) / 2, PLATFORM.topY, 0);
  b.box(x1 - x0, 0.1, L, { tiles: 0.8, faces: '+y' });
  b.pop();

  /* The edge: a tactile strip and the vertical face down to the track. */
  b.material('edgeStrip');
  b.push();
  b.translate(side * (x0 + 0.28), PLATFORM.topY + 0.006, 0);
  b.box(0.56, 0.01, L, { tiles: 1.4, faces: '+y' });
  b.pop();
  b.material('concrete');
  b.push();
  b.translate(side * x0, PLATFORM.topY - 0.6, 0);
  b.box(0.08, 1.2, L, { tiles: 1.2, faces: side > 0 ? '-x' : '+x' });
  b.pop();

  /* Back wall. */
  b.material(spec.tiled ? 'platformTile' : 'concrete');
  b.push();
  b.translate(side * x1, (PLATFORM.topY + PLATFORM.wallTop) / 2, 0);
  b.box(0.2, PLATFORM.wallTop - PLATFORM.topY, L, { tiles: 0.9, faces: side > 0 ? '-x' : '+x' });
  b.pop();

  /* Ceiling. */
  b.material('concrete');
  b.push();
  b.translate(side * (x0 + x1) / 2, PLATFORM.wallTop, 0);
  b.box(x1 - x0 + 1.6, 0.2, L, { tiles: 0.7, faces: '-y' });
  b.pop();

  /* Pillars along the platform. */
  b.material('pillar');
  for (let z = -L / 2 + 5; z < L / 2; z += 7.4) {
    b.push();
    b.translate(side * (x0 + 1.35), (PLATFORM.topY + PLATFORM.wallTop) / 2, z);
    b.box(0.34, PLATFORM.wallTop - PLATFORM.topY, 0.34, { tiles: 1.4 });
    b.pop();
  }

  /* Light fittings. Which of them work is the station's mood in one number. */
  b.material('platformLamp');
  const lampCount = Math.max(1, Math.round(L / 7.6));
  const lampZ = [];
  for (let i = 0; i < lampCount; i++) {
    const z = -L / 2 + 4 + i * (L - 8) / Math.max(1, lampCount - 1);
    lampZ.push(z);
    b.push();
    b.translate(side * (x0 + 2.6), PLATFORM.wallTop - 0.14, z);
    b.box(0.5, 0.09, 1.7, { tiles: 1, faces: '-y' });
    b.pop();
  }

  /* Station name boards. */
  b.material('sign');
  for (const z of [-L / 4, 0, L / 4]) {
    b.push();
    b.translate(side * (x1 - 0.12), 2.35, z);
    b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.panel(3.1, 0.78);
    b.pop();
  }
  /* Hanging board over the platform, readable from inside the carriage. */
  b.push();
  b.translate(side * (x0 + 1.9), 3.05, 6.2);
  b.rotateY(side > 0 ? Math.PI : 0);
  b.panel(2.4, 0.6, { doubleSided: true });
  b.pop();

  if (spec.benches !== false) {
    b.material('platformBench');
    for (const z of [-9.5, 4.5, 15.5]) {
      b.push();
      b.translate(side * (x1 - 0.95), PLATFORM.topY + 0.44, z);
      b.box(0.5, 0.07, 2.0, { tiles: 2 });
      b.translate(side * 0.22, 0.28, 0);
      b.rotateZ(side * 0.12);
      b.box(0.07, 0.5, 2.0, { tiles: 2 });
      b.pop();
      b.material('darkMetal');
      for (const dz of [-0.8, 0.8]) {
        b.push();
        b.translate(side * (x1 - 0.95), PLATFORM.topY + 0.22, z + dz);
        b.box(0.42, 0.42, 0.06, { tiles: 2 });
        b.pop();
      }
      b.material('platformBench');
    }
    /* A bin, and the vending machine that has been out of order for years. */
    b.material('darkMetal');
    b.push();
    b.translate(side * (x1 - 0.62), PLATFORM.topY + 0.45, -2.5);
    b.cylinder(0.28, 0.24, 0.9, 12, { caps: true, tiles: 2 });
    b.pop();
    b.push();
    b.translate(side * (x1 - 0.55), PLATFORM.topY + 0.95, 11.5);
    b.box(0.7, 1.9, 1.1, { tiles: 1.6 });
    b.pop();
  }

  /* Poster frames on the back wall. */
  b.material('platformAd');
  for (const z of [-16, -6, 8, 19]) {
    b.push();
    b.translate(side * (x1 - 0.12), 1.85, z);
    b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.panel(1.2, 1.7);
    b.pop();
  }

  /* The far wall, past the tracks: the tunnel carries on behind the train. */
  b.material('tunnel');
  b.push();
  b.translate(-side * 3.6, 1.6, 0);
  b.box(0.2, 6.0, L, { tiles: 0.6, faces: side > 0 ? '+x' : '-x' });
  b.pop();

  const mesh = b.build(gl, materials);
  mesh.lampZ = lampZ;
  mesh.side = side;
  return mesh;
}

/* Point lights for a platform, in the platform's own space. */
export function platformLights(mesh, spec) {
  const side = mesh.side;
  const out = [];
  const working = spec.lights ?? 1;
  mesh.lampZ.forEach((z, i) => {
    const alive = working >= 1 ? true : (i / mesh.lampZ.length) < working || (i % 3 === 0 && working > 0.25);
    out.push({
      position: [side * (PLATFORM.innerX + 2.6), PLATFORM.wallTop - 0.5, z],
      radius: 12,
      color: spec.lightColor || [0.82, 0.86, 0.95],
      intensity: alive ? (spec.lightIntensity ?? 0.5) * 1.9 : 0,
      flicker: 1,
      enabled: alive,
      failing: !alive ? false : (spec.decay ?? 0) > 0.5 && i % 2 === 1,
    });
  });
  return out;
}

/*
 * The gap between two cars, seen from inside the gangway: a strip of tunnel
 * rushing past under your feet. Purely a detail, and one people stop and look
 * at every time.
 */
export function buildUnderframe(gl, materials, carCount) {
  const b = new Builder();
  b.ao = 0.4;
  b.material('darkMetal');
  const total = (carCount - 1) * CAR.spacing + CAR.length + 4;
  b.push();
  b.translate(0, -0.35, (carCount - 1) * CAR.spacing / 2);
  b.box(2.8, 0.5, total, { tiles: 1.2, faces: ['+x', '-x', '-y'] });
  b.pop();
  return b.build(gl, materials);
}
