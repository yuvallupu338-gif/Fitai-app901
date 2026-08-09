/*
 * carriage.js — one train car, built once and instanced four times.
 *
 * A single mesh with about twenty material groups. The cars differ from each
 * other, and from themselves an hour later, through per-node material
 * overrides rather than through separate geometry: the advertisement in car 2
 * is the same quad as the one in car 0, pointed at a different texture. That
 * is what makes it cheap to change an advertisement between two stations, and
 * changing advertisements between two stations is the entire point.
 *
 * Nothing here knows about the game. It returns geometry, light positions,
 * seat slots, interaction volumes and collision shapes; what any of it means
 * is decided elsewhere.
 */

import { Builder, carriageAO } from '../render/mesh.js';
import { CAR, SEAT_BANKS, POLE_Z, SEAT_SLOTS } from './dims.js';

const HALF_LEN = CAR.length / 2;

/* Wall runs between the door openings, as [z0, z1]. */
export const WALL_SEGMENTS = (() => {
  const [d0, d1] = CAR.doorZ;
  const hw = CAR.doorHalfWidth;
  return [
    [-HALF_LEN, d0 - hw],
    [d0 + hw, d1 - hw],
    [d1 + hw, HALF_LEN],
  ];
})();

const MULLION = 0.12;

function panes(z0, z1, targetWidth = 1.85) {
  const span = z1 - z0;
  const count = Math.max(1, Math.round((span - MULLION) / (targetWidth + MULLION)));
  const width = (span - (count + 1) * MULLION) / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    const start = z0 + MULLION + i * (width + MULLION);
    out.push([start, start + width]);
  }
  return out;
}

export function buildCarriage(gl, materials) {
  const b = new Builder();
  b.aoFn = carriageAO(CAR.halfWidth, CAR.height, true);

  buildFloor(b);
  buildCeiling(b);
  for (const side of [-1, 1]) {
    buildSideWall(b, side);
    buildSeatBanks(b, side);
    buildDoorSurrounds(b, side);
  }
  buildEndWalls(b);
  buildPoles(b);
  buildFittings(b);

  const mesh = b.build(gl, materials);
  return {
    mesh,
    lights: ceilingLights(),
    seatSlots: SEAT_SLOTS,
    interactables: interactionVolumes(),
    poles: poleColliders(),
    doorways: doorwayList(),
  };
}

/* ---- shell ---------------------------------------------------------- */

function buildFloor(b) {
  b.material('floor');
  b.push();
  b.translate(0, 0, 0);
  b.box(CAR.halfWidth * 2, 0.08, CAR.length, { tiles: 1.35, faces: '+y' });
  b.pop();

  /* The yellow line along the door thresholds, and the darker rubber the
     doors close onto. */
  b.material('doorLine');
  for (const dz of CAR.doorZ) {
    for (const side of [-1, 1]) {
      b.push();
      b.translate(side * (CAR.halfWidth - 0.22), 0.005, dz);
      b.box(0.30, 0.004, CAR.doorHalfWidth * 2 + 0.1, { tiles: 1, faces: '+y' });
      b.pop();
    }
  }
}

function buildCeiling(b) {
  b.material('ceiling');
  b.push();
  b.translate(0, CAR.height, 0);
  b.box(CAR.halfWidth * 2, 0.08, CAR.length, { tiles: 1.1, faces: '-y' });
  b.pop();

  /* The two coves the light strips sit in. */
  b.material('metal');
  for (const side of [-1, 1]) {
    b.push();
    b.translate(side * CAR.lightX, CAR.height - 0.055, 0);
    b.box(0.30, 0.11, CAR.length - 0.4, { tiles: 1.5, faces: ['-y', side > 0 ? '-x' : '+x'] });
    b.pop();
  }

  /* The tubes hang a clear three centimetres below the lip of the cove. They
     used to sit exactly flush with it, which is to say in the same plane, and
     the two surfaces spent the entire game deciding which of them was in
     front — so the brightest object in the carriage was invisible. */
  b.material('lightStrip');
  for (const side of [-1, 1]) {
    for (const [z0, z1] of LIGHT_RUNS) {
      b.push();
      b.translate(side * CAR.lightX, CAR.height - 0.145, (z0 + z1) / 2);
      b.box(0.26, 0.035, z1 - z0, { tiles: 1, faces: ['-y', '+x', '-x'] });
      b.pop();
    }
  }
}

const LIGHT_RUNS = [
  [-8.2, -5.4], [-5.0, -1.6], [-1.2, 1.2], [1.6, 5.0], [5.4, 8.2],
];

function buildSideWall(b, side) {
  const x = side * CAR.halfWidth;
  const inward = side > 0 ? '-x' : '+x';

  for (const [z0, z1] of WALL_SEGMENTS) {
    /* Below the glass — the panel the seats are bolted to. */
    b.material('wall');
    b.push();
    b.translate(x, CAR.windowY0 / 2, (z0 + z1) / 2);
    b.box(0.06, CAR.windowY0, z1 - z0, { tiles: 1.0, faces: inward });
    b.pop();

    /* Above the glass — where the advertising lives. */
    b.push();
    b.translate(x, (CAR.windowY1 + CAR.height) / 2, (z0 + z1) / 2);
    b.box(0.06, CAR.height - CAR.windowY1, z1 - z0, { tiles: 1.0, faces: inward });
    b.pop();

    const list = panes(z0, z1);
    /* Mullions, including the two at the ends of the run. */
    b.material('metal');
    const edges = [z0];
    for (const [pz0, pz1] of list) { edges.push(pz0, pz1); }
    edges.push(z1);
    for (let i = 0; i < edges.length; i += 2) {
      const m0 = edges[i], m1 = edges[i + 1];
      if (m1 - m0 < 0.001) continue;
      b.push();
      b.translate(x, (CAR.windowY0 + CAR.windowY1) / 2, (m0 + m1) / 2);
      b.box(0.07, CAR.windowY1 - CAR.windowY0, m1 - m0, { tiles: 2, faces: inward });
      b.pop();
    }

    /* Glass, and the rubber gasket around each pane. */
    for (const [pz0, pz1] of list) {
      b.material('metal');
      b.push();
      b.translate(x, CAR.windowY0 + 0.02, (pz0 + pz1) / 2);
      b.box(0.08, 0.04, pz1 - pz0, { tiles: 2, faces: [inward, '+y'] });
      b.translate(0, CAR.windowY1 - CAR.windowY0 - 0.04, 0);
      b.box(0.08, 0.04, pz1 - pz0, { tiles: 2, faces: [inward, '-y'] });
      b.pop();

      b.material(side > 0 ? 'glass.right' : 'glass.left');
      b.push();
      b.translate(x - side * 0.012, (CAR.windowY0 + CAR.windowY1) / 2, (pz0 + pz1) / 2);
      b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.panel(pz1 - pz0, CAR.windowY1 - CAR.windowY0 - 0.06, {
        uv: [0, 0, (pz1 - pz0) * 0.5, 1],
      });
      b.pop();
    }
  }
}

function buildDoorSurrounds(b, side) {
  const x = side * CAR.halfWidth;
  const inward = side > 0 ? '-x' : '+x';

  for (const dz of CAR.doorZ) {
    /* The header above the opening carries the route map. */
    b.material('wall');
    b.push();
    b.translate(x, (CAR.doorHeight + CAR.height) / 2, dz);
    b.box(0.06, CAR.height - CAR.doorHeight, CAR.doorHalfWidth * 2, { tiles: 1, faces: inward });
    b.pop();

    /* Door pocket reveals — the dark slot the leaves disappear into. */
    b.material('metal');
    for (const s of [-1, 1]) {
      b.push();
      b.translate(x - side * 0.05, CAR.doorHeight / 2, dz + s * (CAR.doorHalfWidth + 0.03));
      b.box(0.10, CAR.doorHeight, 0.06, { tiles: 3, faces: [inward, s > 0 ? '-z' : '+z'] });
      b.pop();
    }

    /* Behind the leaves: the outer skin, so an open door shows a jamb rather
       than the void. */
    b.material('darkMetal');
    b.push();
    b.translate(x + side * 0.09, CAR.doorHeight / 2, dz);
    b.box(0.02, CAR.doorHeight, CAR.doorHalfWidth * 2, { tiles: 2, faces: inward });
    b.pop();

    /* Route map over the doorway. */
    b.material(side > 0 ? 'map.right' : 'map.left');
    b.push();
    b.translate(x - side * 0.035, 2.11, dz);
    b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.panel(1.16, 0.29);
    b.pop();

    /* Emergency panel, on the aft side of each doorway. */
    b.material('notice');
    b.push();
    b.translate(x - side * 0.035, 1.38, dz + CAR.doorHalfWidth + 0.22);
    b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.panel(0.26, 0.32);
    b.pop();

    b.material('metal');
    b.push();
    b.translate(x - side * 0.055, 1.30, dz + CAR.doorHalfWidth + 0.22);
    b.rotateZ(Math.PI / 2);
    b.rotateX(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.cylinder(0.045, 0.045, 0.04, 12, { caps: true });
    b.pop();

    b.material('emergency');
    b.push();
    b.translate(x - side * 0.078, 1.30, dz + CAR.doorHalfWidth + 0.22);
    b.rotateZ(Math.PI / 2);
    b.rotateX(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.cylinder(0.033, 0.033, 0.02, 12, { caps: true });
    b.pop();

    /* Draught screens flanking the doorway. */
    b.material(side > 0 ? 'glass.right' : 'glass.left');
    for (const s of [-1, 1]) {
      b.push();
      b.translate(side * (CAR.halfWidth - 0.30), 1.05, dz + s * (CAR.doorHalfWidth + 0.16));
      b.panel(0.56, 0.94, { doubleSided: true });
      b.pop();
      b.material('metal');
      b.push();
      b.translate(side * (CAR.halfWidth - 0.585), 1.05, dz + s * (CAR.doorHalfWidth + 0.16));
      b.box(0.05, 0.98, 0.05, { tiles: 3 });
      b.pop();
      b.material(side > 0 ? 'glass.right' : 'glass.left');
    }
  }
}

function buildEndWalls(b) {
  for (const end of [-1, 1]) {
    const z = end * HALF_LEN;
    const facing = end > 0 ? '-z' : '+z';
    const doorHalf = 0.45;
    const doorH = 1.95;

    b.material('wall');
    /* Left and right of the connecting door. */
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? doorHalf : -CAR.halfWidth;
      const x1 = s > 0 ? CAR.halfWidth : -doorHalf;
      b.push();
      b.translate((x0 + x1) / 2, CAR.height / 2, z);
      b.box(x1 - x0, CAR.height, 0.06, { tiles: 1, faces: facing });
      b.pop();
    }
    /* Over the doorway. */
    b.push();
    b.translate(0, (doorH + CAR.height) / 2, z);
    b.box(doorHalf * 2, CAR.height - doorH, 0.06, { tiles: 1, faces: facing });
    b.pop();

    /* The dot-matrix strip above the connecting door. */
    b.material(end > 0 ? 'display.front' : 'display.back');
    b.push();
    b.translate(0, 2.11, z - end * 0.04);
    if (end > 0) b.rotateY(Math.PI);
    b.panel(1.30, 0.17);
    b.pop();

    /* Doorway frame. */
    b.material('metal');
    for (const s of [-1, 1]) {
      b.push();
      b.translate(s * doorHalf, doorH / 2, z - end * 0.03);
      b.box(0.06, doorH, 0.09, { tiles: 3 });
      b.pop();
    }
    b.push();
    b.translate(0, doorH, z - end * 0.03);
    b.box(doorHalf * 2 + 0.06, 0.07, 0.09, { tiles: 3 });
    b.pop();

    /* Grab rail beside the connecting door, and the small notice nobody
       reads. */
    b.push();
    b.translate(-CAR.halfWidth + 0.14, 1.15, z - end * 0.10);
    b.box(0.05, 1.5, 0.05, { tiles: 3 });
    b.pop();

    b.material('notice');
    b.push();
    b.translate(CAR.halfWidth - 0.42, 1.52, z - end * 0.035);
    if (end > 0) b.rotateY(Math.PI);
    b.panel(0.30, 0.30);
    b.pop();

    /* The bracket the security camera hangs off. The camera itself is a
       separate node, because it has to be able to turn. */
    b.material('darkMetal');
    b.push();
    b.translate(end > 0 ? CAR.halfWidth - 0.30 : -CAR.halfWidth + 0.30, CAR.height - 0.045, z - end * 0.22);
    b.box(0.07, 0.09, 0.07, { tiles: 4 });
    b.pop();

    /* Speaker grille. */
    b.material('metal');
    b.push();
    b.translate(end * 0.0, CAR.height - 0.045, z - end * 1.4);
    b.box(0.16, 0.02, 0.16, { tiles: 6, faces: '-y' });
    b.pop();
  }
}

function buildPoles(b) {
  b.material('pole');
  for (const side of [-1, 1]) {
    for (const z of POLE_Z) {
      b.push();
      b.translate(side * CAR.poleX, CAR.height / 2, z);
      b.cylinder(0.023, 0.023, CAR.height, 10);
      b.pop();
    }
    /* Overhead rails the handles hang from. */
    for (const bank of SEAT_BANKS) {
      b.push();
      b.translate(side * CAR.railX, CAR.railY, (bank.z0 + bank.z1) / 2);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.017, 0.017, bank.z1 - bank.z0, 8);
      b.pop();
    }
  }
}

function buildSeatBanks(b, side) {
  const wallX = side * CAR.halfWidth;
  for (const bank of SEAT_BANKS) {
    const zc = (bank.z0 + bank.z1) / 2;
    const len = bank.z1 - bank.z0;

    /* Plinth under the bench. */
    b.material('darkMetal');
    b.push();
    b.translate(wallX - side * (CAR.seatDepth / 2 + 0.06), 0.16, zc);
    b.box(CAR.seatDepth - 0.06, 0.32, len - 0.04, { tiles: 2, faces: [side > 0 ? '-x' : '+x', '-z', '+z'] });
    b.pop();

    /* Cushion. */
    b.material('seat');
    b.push();
    b.translate(wallX - side * (CAR.seatDepth / 2 + 0.05), CAR.seatY - 0.05, zc);
    b.box(CAR.seatDepth, 0.11, len, { tiles: 2.2 });
    b.pop();

    /* Back, leaned into the wall. */
    b.push();
    b.translate(wallX - side * 0.10, (CAR.seatY + CAR.seatBackY) / 2 + 0.02, zc);
    b.rotateZ(side * 0.10);
    b.box(0.11, CAR.seatBackY - CAR.seatY + 0.12, len, { tiles: 2.2 });
    b.pop();

    /* Chrome dividers every few places, and a hard end cap. */
    b.material('pole');
    const divisions = Math.max(2, Math.round(len / 1.4));
    for (let i = 0; i <= divisions; i++) {
      const z = bank.z0 + (len * i) / divisions;
      b.push();
      b.translate(wallX - side * (CAR.seatDepth / 2 + 0.05), CAR.seatY + 0.03, z);
      b.rotateX(Math.PI / 2);
      b.cylinder(0.012, 0.012, CAR.seatDepth * 0.92, 6);
      b.pop();
    }
  }
}

function buildFittings(b) {
  /* Advertising panels along the upper wall band. Four per car, two a side. */
  AD_SLOTS.forEach((slot, i) => {
    b.material(`ad${i}`);
    b.push();
    b.translate(slot.side * (CAR.halfWidth - 0.035), 2.02, slot.z);
    b.rotateY(slot.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.panel(1.02, 0.40);
    b.pop();
    b.material('metal');
    b.push();
    b.translate(slot.side * (CAR.halfWidth - 0.03), 2.02, slot.z);
    b.rotateY(slot.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    b.box(1.08, 0.46, 0.012, { tiles: 2 });
    b.pop();
  });

  /* A decal that is only ever shown in one car, and not from the beginning. */
  b.material('graffiti');
  b.push();
  b.translate(-CAR.halfWidth + 0.04, 0.72, -1.2);
  b.rotateY(Math.PI / 2);
  b.panel(0.9, 0.45);
  b.pop();

  /* Hanging handles are built into their own mesh — see buildHandles. */
}

export const AD_SLOTS = [
  { side: -1, z: -6.6 },
  { side: 1, z: -1.9 },
  { side: -1, z: 1.9 },
  { side: 1, z: 6.6 },
];

/*
 * The grab handles, as a separate mesh so the vertex shader can swing the
 * whole set from the rail without touching the rest of the carriage.
 */
export function buildHandles(gl, materials) {
  const b = new Builder();
  b.aoFn = null;
  b.ao = 0.9;
  for (const side of [-1, 1]) {
    for (const bank of SEAT_BANKS) {
      const len = bank.z1 - bank.z0;
      const count = Math.max(1, Math.floor(len / 0.72));
      const pad = (len - (count - 1) * 0.72) / 2;
      for (let i = 0; i < count; i++) {
        const z = bank.z0 + pad + i * 0.72;
        b.push();
        b.translate(side * CAR.railX, 0, z);

        b.material('strap');
        b.push();
        b.translate(0, 1.86, 0);
        b.box(0.014, 0.30, 0.030, { tiles: 4 });
        b.pop();

        /* The moulded loop. Four bars, corners left square — at this size and
           this light level nobody has ever noticed. */
        b.material('handle');
        const w = 0.052, h = 0.085, cy = 1.645;
        b.push();
        b.translate(0, cy + h, 0);
        b.box(0.013, 0.016, w * 2, { tiles: 4 });
        b.pop();
        b.push();
        b.translate(0, cy - h, 0);
        b.box(0.013, 0.020, w * 2, { tiles: 4 });
        b.pop();
        for (const s of [-1, 1]) {
          b.push();
          b.translate(0, cy, s * w);
          b.box(0.013, h * 2, 0.016, { tiles: 4 });
          b.pop();
        }
        b.pop();
      }
    }
  }
  return b.build(gl, materials);
}

/* One sliding door leaf, hinged at the origin so the node matrix only has to
   slide it along Z. Built per side because the glass belongs to that side's
   reflection plane. */
export function buildDoorLeaf(gl, materials, side) {
  const b = new Builder();
  b.ao = 0.86;
  const w = CAR.doorHalfWidth;
  const h = CAR.doorHeight;

  b.material('doorPanel');
  b.push();
  b.translate(0, h / 2, w / 2);
  b.box(0.05, h, w, { tiles: 1.4, faces: ['-x', '+x', '+z'] });
  b.pop();

  /* Glazed upper half. */
  b.material('metal');
  b.push();
  b.translate(0, 1.02, w / 2);
  b.box(0.06, 0.06, w, { tiles: 3 });
  b.pop();

  b.material(side > 0 ? 'glass.right' : 'glass.left');
  b.push();
  b.translate(-side * 0.012, 1.52, w / 2);
  b.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.panel(w - 0.1, 0.86, { uv: [0, 0, 0.6, 1] });
  b.pop();

  b.material('doorRubber');
  b.push();
  b.translate(0, h / 2, 0.012);
  b.box(0.07, h, 0.024, { tiles: 6 });
  b.pop();

  return b.build(gl, materials);
}

/* The connecting door between two cars. One leaf, plain glass — it is not on
   either reflection plane. */
export function buildConnectingDoor(gl, materials) {
  const b = new Builder();
  b.ao = 0.8;
  const w = 0.9, h = 1.95;
  b.material('doorPanel');
  b.push();
  b.translate(w / 2, h / 2, 0);
  b.box(w, h, 0.05, { tiles: 1.4, faces: ['+z', '-z', '+x', '-x'] });
  b.pop();
  b.material('glass.plain');
  b.push();
  b.translate(w / 2, 1.34, 0.031);
  b.panel(w - 0.20, 0.86, { doubleSided: true });
  b.pop();
  b.material('metal');
  b.push();
  b.translate(w / 2, 1.05, 0);
  b.box(w, 0.05, 0.06, { tiles: 3 });
  b.pop();
  b.push();
  b.translate(w - 0.10, 1.02, 0.05);
  b.box(0.03, 0.24, 0.03, { tiles: 4 });
  b.pop();
  return b.build(gl, materials);
}

/*
 * The security camera. Its own mesh, built looking down its own -Z, so a node
 * matrix can point it wherever it feels like pointing.
 */
export function buildSecurityCamera(gl, materials) {
  const b = new Builder();
  b.ao = 0.9;
  b.material('darkMetal');
  b.push();
  b.box(0.15, 0.12, 0.23, { tiles: 4 });
  b.pop();
  b.push();
  b.translate(0, 0.075, 0.04);
  b.box(0.05, 0.06, 0.05, { tiles: 4 });
  b.pop();
  b.material('lens');
  b.push();
  b.translate(0, 0, -0.125);
  b.rotateX(Math.PI / 2);
  b.cylinder(0.043, 0.048, 0.05, 12, { caps: true });
  b.pop();
  /* The little red light that is either recording or is not. */
  b.material('camLed');
  b.push();
  b.translate(0.045, 0.045, -0.115);
  b.box(0.014, 0.014, 0.008, { tiles: 1 });
  b.pop();
  return b.build(gl, materials);
}

export const CAMERA_MOUNTS = [
  { end: 1, x: CAR.halfWidth - 0.30, y: CAR.height - 0.19, z: HALF_LEN - 0.22, yaw: -0.55, pitch: -0.40 },
  { end: -1, x: -CAR.halfWidth + 0.30, y: CAR.height - 0.19, z: -HALF_LEN + 0.22, yaw: Math.PI + 0.55, pitch: -0.40 },
];

/* The bellows between two cars. */
export function buildGangway(gl, materials) {
  const b = new Builder();
  b.ao = 0.55;
  const len = CAR.gangway;
  const segs = 7;
  b.material('bellows');
  for (let i = 0; i < segs; i++) {
    const z = -len / 2 + (len / segs) * (i + 0.5);
    const bulge = i % 2 === 0 ? 0.03 : 0;
    b.push();
    b.translate(0, 1.05, z);
    b.box(1.30 + bulge * 2, 2.05 + bulge * 2, len / segs - 0.01, { tiles: 2, inward: true, faces: ['+x', '-x', '+y'] });
    b.pop();
  }
  b.material('floor');
  b.push();
  b.translate(0, 0.01, 0);
  b.box(1.16, 0.02, len, { tiles: 2, faces: '+y' });
  b.pop();
  b.material('darkMetal');
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.60, 0.6, 0);
    b.box(0.04, 1.2, len, { tiles: 2, faces: s > 0 ? '-x' : '+x' });
    b.pop();
  }
  return b.build(gl, materials);
}

/* ---- non-geometry outputs ------------------------------------------- */

function ceilingLights() {
  const lights = [];
  for (const [z0, z1] of LIGHT_RUNS) {
    lights.push({
      position: [0, CAR.lightY - 0.34, (z0 + z1) / 2],
      radius: 8.2,
      color: [0.86, 0.92, 1.0],
      /* Calibrated against the floor, which is the darkest large surface in
         the carriage: at this intensity a 0.17-albedo rubber floor lands
         around 0.25 on screen, which reads as "lit, at night" rather than
         "unlit". Everything else was set from there. */
      intensity: 2.45,
      flicker: 1,
      enabled: true,
    });
  }
  return lights;
}

function poleColliders() {
  const out = [];
  for (const side of [-1, 1]) {
    for (const z of POLE_Z) out.push({ x: side * CAR.poleX, z, radius: 0.12 });
  }
  return out;
}

function doorwayList() {
  const out = [];
  for (const side of [-1, 1]) {
    for (const z of CAR.doorZ) out.push({ side, z });
  }
  return out;
}

/*
 * Interaction volumes, in car-local space. Everything the player can look at
 * and get a prompt for, except the seats (generated from the slot list) and
 * anything the game places at runtime.
 */
function interactionVolumes() {
  const vol = [];
  const box = (id, type, cx, cy, cz, w, h, d, extra = {}) => vol.push({
    id, type,
    min: [cx - w / 2, cy - h / 2, cz - d / 2],
    max: [cx + w / 2, cy + h / 2, cz + d / 2],
    ...extra,
  });

  for (const side of [-1, 1]) {
    const sx = side > 0 ? 'right' : 'left';
    for (let d = 0; d < CAR.doorZ.length; d++) {
      const dz = CAR.doorZ[d];
      box(`map.${sx}.${d}`, 'routemap', side * (CAR.halfWidth - 0.10), 2.11, dz, 0.18, 0.34, 1.2,
        { side, label: 'Route map', verb: 'Read' });
      box(`emergency.${sx}.${d}`, 'emergency',
        side * (CAR.halfWidth - 0.10), 1.32, dz + CAR.doorHalfWidth + 0.22, 0.20, 0.42, 0.34,
        { side, label: 'Emergency alarm', verb: 'Use' });
      box(`door.${sx}.${d}`, 'door', side * (CAR.halfWidth - 0.06), 1.10, dz, 0.24, 1.9, CAR.doorHalfWidth * 2,
        { side, doorIndex: d, label: 'Door', verb: 'Look' });
    }
    box(`window.${sx}`, 'window', side * (CAR.halfWidth - 0.10), 1.42, 0, 0.20, 0.72, 3.0,
      { side, label: 'Window', verb: 'Look through' });
  }

  AD_SLOTS.forEach((slot, i) => {
    box(`ad.${i}`, 'ad', slot.side * (CAR.halfWidth - 0.10), 2.02, slot.z, 0.18, 0.46, 1.08,
      { adIndex: i, side: slot.side, label: 'Advertisement', verb: 'Read' });
  });

  for (const end of [-1, 1]) {
    const key = end > 0 ? 'front' : 'back';
    const z = end * HALF_LEN;
    box(`display.${key}`, 'display', 0, 2.11, z - end * 0.12, 1.34, 0.26, 0.20,
      { end, label: 'Service display', verb: 'Read' });
    box(`connect.${key}`, 'connecting', 0, 1.05, z - end * 0.10, 1.0, 1.95, 0.26,
      { end, label: 'Connecting door', verb: 'Open' });
    box(`camera.${key}`, 'camera',
      end > 0 ? CAR.halfWidth - 0.30 : -CAR.halfWidth + 0.30, CAR.height - 0.20, z - end * 0.26,
      0.34, 0.30, 0.36, { end, label: 'Security camera', verb: 'Look at' });
    box(`notice.${key}`, 'notice', CAR.halfWidth - 0.42, 1.52, z - end * 0.10, 0.36, 0.36, 0.18,
      { end, label: 'Notice', verb: 'Read' });
  }

  return vol;
}
