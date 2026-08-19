/*
 * build.js — the layout, turned into triangles, boxes and lights.
 *
 * One pass produces four things that have to agree with each other or the game
 * breaks in ways that are very hard to see:
 *
 *   sectors        the static geometry, split into a 40-metre grid so the
 *                  renderer can frustum-cull. One mesh for the whole street
 *                  would draw the six houses behind you every frame.
 *   collision      the same world as boxes (see collide.js)
 *   lights         street lamps, porch lights, and every window with somebody
 *                  awake behind it
 *   interactables  everything the player can press E on
 *
 * The rule that keeps them honest: nothing is drawn here without being added
 * to collision in the same function, and nothing is added to collision that
 * is not drawn. A fence you can see and walk through is a bug report; a fence
 * you can walk into and cannot see is a broken game.
 *
 * Heights, once, so they are not scattered through the file:
 *   kerb 0.14 · porch deck 0.42 · picket fence 1.15 · garden fence 1.85
 *   ground floor 2.9 (some houses 3.25) · garage roof 3.0 · hedge 1.9
 */

import {
  MeshBuilder, addQuad, addGround, addBox, addCylinder, addCross, addGableRoof,
  addSphere, addLimb,
} from './meshbuilder.js';
import { CollisionWorld } from './collide.js';
import { MAT, SIDING_SLOTS } from './materials.js';
import { PLAN } from './layout.js';
import { rngFrom } from '../core/rng.js';

const SECTOR = 40;

/*
 * Floor level. The porch deck, the top of the foundation and the floorboards
 * inside are all this height, which is what makes walking in through a front
 * door a flat surface rather than a 36cm step down into somebody's living
 * room. Every y inside a house is measured from it.
 */
const FLOOR = 0.42;

/* Ambient occlusion curves, shared so that a wall built in one function and a
 * fence built in another darken toward the ground at the same rate. */
const aoWall = (s, t) => 0.58 + 0.42 * Math.min(1, t * 3.2);
const aoUnder = () => 0.45;
const aoFlat = () => 1;

class Sectors {
  constructor(bounds) {
    this.bounds = bounds;
    this.cols = Math.ceil((bounds.x1 - bounds.x0) / SECTOR);
    this.rows = Math.ceil((bounds.z1 - bounds.z0) / SECTOR);
    this.list = [];
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        this.list.push({
          mb: new MeshBuilder(4096),
          i, j,
          min: [1e9, 1e9, 1e9],
          max: [-1e9, -1e9, -1e9],
        });
      }
    }
  }

  /* The builder covering a world position, and a running bounds update. Every
   * object goes into exactly one sector chosen by its centre, so a house that
   * straddles a boundary is not split — the bounds grow instead, which costs a
   * little culling accuracy and saves a great deal of complexity. */
  at(x, z, extentX = 0, extentZ = 0, extentY = 6) {
    const i = Math.max(0, Math.min(this.cols - 1,
      Math.floor((x - this.bounds.x0) / SECTOR)));
    const j = Math.max(0, Math.min(this.rows - 1,
      Math.floor((z - this.bounds.z0) / SECTOR)));
    const s = this.list[j * this.cols + i];
    s.min[0] = Math.min(s.min[0], x - extentX);
    s.min[1] = Math.min(s.min[1], -1.5);
    s.min[2] = Math.min(s.min[2], z - extentZ);
    s.max[0] = Math.max(s.max[0], x + extentX);
    s.max[1] = Math.max(s.max[1], extentY);
    s.max[2] = Math.max(s.max[2], z + extentZ);
    return s.mb;
  }

  finish() {
    return this.list
      .filter((s) => !s.mb.empty)
      .map((s) => ({ data: s.mb.finish(), bounds: [...s.min, ...s.max] }));
  }
}

/* ------------------------------------------------------------------ *
 * A wall with any number of openings
 * ------------------------------------------------------------------ */

/*
 * The front of a house has two windows and a door in it, and a wall routine
 * that takes one hole cannot express that. This one takes a list: it sorts the
 * openings along the wall, emits the full-height panels between them, and
 * emits the sill panel under and the head panel over each opening.
 *
 * `holes` are { u, w, y, h } in wall coordinates — u along the wall from
 * (x0,z0), y up from the base.
 */
function wallWithHoles(mb, x0, z0, x1, z1, base, height, holes, mat, opts = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const P = (u, y) => [x0 + ux * u, base + y, z0 + uz * u];
  const ao = opts.ao || aoWall;
  const sub = opts.sub || 2;
  const panel = (u0, u1, y0, y1) => {
    if (u1 - u0 < 0.002 || y1 - y0 < 0.002) return;
    addQuad(mb, P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1),
      [u0, y0], [u1, y0], [u1, y1], [u0, y1], mat,
      { sub, ao: (s, t) => ao(s, (y0 + (y1 - y0) * t) / height) });
  };

  const sorted = holes.slice().sort((a, b) => a.u - b.u);
  let cursor = 0;
  for (const h of sorted) {
    const hu0 = h.u - h.w / 2, hu1 = h.u + h.w / 2;
    panel(cursor, hu0, 0, height);
    panel(hu0, hu1, 0, h.y);
    panel(hu0, hu1, h.y + h.h, height);
    cursor = hu1;
  }
  panel(cursor, len, 0, height);
}

/* The reveal around an opening: the four faces of the wall's own thickness.
 * Skipping it is what makes a house look like painted cardboard — you see the
 * back of the wall through the window hole and there is nothing between. */
function reveal(mb, x0, z0, x1, z1, base, hole, thick, mat) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const nx = -uz, nz = ux;
  const u0 = hole.u - hole.w / 2, u1 = hole.u + hole.w / 2;
  const y0 = base + hole.y, y1 = base + hole.y + hole.h;
  const A = (u, y, t) => [x0 + ux * u + nx * t, y, z0 + uz * u + nz * t];
  const t0 = -thick / 2, t1 = thick / 2;
  const o = { sub: 1, ao: aoUnder };
  /* sill, head, and the two jambs */
  addQuad(mb, A(u0, y0, t0), A(u1, y0, t0), A(u1, y0, t1), A(u0, y0, t1),
    [0, 0], [hole.w, 0], [hole.w, thick], [0, thick], mat, o);
  addQuad(mb, A(u0, y1, t1), A(u1, y1, t1), A(u1, y1, t0), A(u0, y1, t0),
    [0, 0], [hole.w, 0], [hole.w, thick], [0, thick], mat, o);
  addQuad(mb, A(u0, y0, t1), A(u0, y1, t1), A(u0, y1, t0), A(u0, y0, t0),
    [0, 0], [hole.h, 0], [hole.h, thick], [0, thick], mat, o);
  addQuad(mb, A(u1, y0, t0), A(u1, y1, t0), A(u1, y1, t1), A(u1, y0, t1),
    [0, 0], [hole.h, 0], [hole.h, thick], [0, thick], mat, o);
}

/* A pane of glass, drawn on both faces so it is still there from inside. */
function pane(mb, x0, z0, x1, z1, base, hole, mat, flick) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const u0 = hole.u - hole.w / 2, u1 = hole.u + hole.w / 2;
  const y0 = base + hole.y, y1 = base + hole.y + hole.h;
  const A = (u, y) => [x0 + ux * u, y, z0 + uz * u];
  const o = { sub: 1, ao: aoFlat, flick };
  addQuad(mb, A(u0, y0), A(u1, y0), A(u1, y1), A(u0, y1),
    [0, 0], [hole.w, 0], [hole.w, hole.h], [0, hole.h], mat, o);
  addQuad(mb, A(u1, y0), A(u0, y0), A(u0, y1), A(u1, y1),
    [0, 0], [hole.w, 0], [hole.w, hole.h], [0, hole.h], mat, o);
}

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

export function buildWorld(layout) {
  const bounds = layout.bounds;
  const sec = new Sectors(bounds);
  const col = new CollisionWorld(bounds);
  const lights = [];
  const interact = [];
  const doors = [];
  const glows = [];        /* windows that come on later in the night       */
  const rng = rngFrom((layout.seed | 0) ^ 0x1f2e3d4c);

  ground(sec, col, layout);
  for (const h of layout.houses) house(sec, col, lights, interact, doors, h, layout, rng);
  for (const l of layout.lamps) streetLamp(sec, col, lights, l);
  props(sec, col, lights, interact, layout, rng);
  boundary(sec, col, layout);
  climbFurniture(sec, col, layout);

  for (const h of layout.houses) {
    for (const w of h.windows) {
      if (w.wakesAt !== undefined) glows.push(windowGlow(h, w));
    }
  }

  col.build();
  return {
    sectors: sec.finish(),
    collision: col,
    lights,
    interact,
    doors,
    glows,
    heightField: col.heightField(256, 12),
  };
}

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

function ground(sec, col, layout) {
  const b = layout.bounds;
  const road = PLAN.roadHalf, pave = PLAN.pave;

  /*
   * The lawn is one enormous quad per sector rather than one for the whole
   * neighbourhood: subdividing a 160-metre quad finely enough for the fog and
   * the moonlight to vary across it would cost thousands of vertices, and
   * subdividing it coarsely puts a visible gradient seam down the middle of
   * the street. Per sector, at four metres a step, it is neither.
   */
  for (let z = b.z0; z < b.z1; z += SECTOR) {
    for (let x = b.x0; x < b.x1; x += SECTOR) {
      const x1 = Math.min(x + SECTOR, b.x1), z1 = Math.min(z + SECTOR, b.z1);
      addGround(sec.at((x + x1) / 2, (z + z1) / 2, SECTOR / 2, SECTOR / 2, 0.2),
        x, z, x1, z1, 0, MAT.GRASS, { sub: Math.ceil((x1 - x) / 4) });
    }
  }

  /* Pine Street, its pavements and its kerbs. The kerb is 14cm of concrete
   * that you can step up without noticing and that the shadow of a wheel
   * catches on — leaving it out makes a road read as a painted stripe. */
  strip(sec, col, PLAN.pineX[0], -road, PLAN.pineX[1], road, 0.02, MAT.ROAD, 'road');
  strip(sec, col, PLAN.pineX[0], -road - pave, PLAN.pineX[1], -road, PLAN.kerb, MAT.PATH, 'pave');
  strip(sec, col, PLAN.pineX[0], road, PLAN.pineX[1], road + pave, PLAN.kerb, MAT.PATH, 'pave');

  /* Elm Court. It stops at the park and at the green, and the junction is
   * drawn by the Pine strip already, so it starts outside it. */
  strip(sec, col, -road, PLAN.elmZ[0], road, PLAN.elmZ[1], 0.02, MAT.ROAD, 'road');
  strip(sec, col, -road - pave, PLAN.elmZ[0], -road, PLAN.elmZ[1], PLAN.kerb, MAT.PATH, 'pave');
  strip(sec, col, road, PLAN.elmZ[0], road + pave, PLAN.elmZ[1], PLAN.kerb, MAT.PATH, 'pave');

  /* The park and the green: mown grass, so nothing to draw over the lawn, but
   * a gravel path through each. */
  const p = PLAN.park;
  strip(sec, col, -1.4, p.z0 + 2, 1.4, p.z1, 0.03, MAT.PATH, 'path');
}

/* A flat slab: drawn, and added to collision as a platform you can step onto
 * but never walk into. */
function strip(sec, col, x0, z0, x1, z1, y, mat, tag) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  addGround(sec.at(cx, cz, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y + 0.2),
    Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, mat,
    { sub: Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 6)) });
  /*
   * Always, even for the road, which is two centimetres proud of the lawn.
   *
   * This box is not there to be stood on — it is there to be *named*: the
   * footstep sound and how far that footstep carries both come from the tag of
   * whatever you are standing on, and without a box the tarmac reports itself
   * as grass. Running down the middle of the road was the quietest way to
   * cross the neighbourhood, which is the exact opposite of the intended
   * trade, and nothing on screen said so.
   */
  col.add(x0, 0, z0, x1, Math.max(y, 0.02), z1,
    { tag, opaque: false, solid: false, platform: true });
}

/* ------------------------------------------------------------------ *
 * A house
 * ------------------------------------------------------------------ */

function house(sec, col, lights, interact, doors, h, layout, rng) {
  const mb = sec.at(h.x, (h.z0 + h.z1) / 2, h.w / 2 + 4, h.d / 2 + 6, h.wallTop + h.roofRise + 1);
  const siding = SIDING_SLOTS[h.siding];
  const s = h.sign;
  const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2;
  const z0 = h.z0, z1 = h.z1;
  const front = h.frontZ;
  const top = h.wallTop;
  const thick = 0.24;

  /*
   * Foundation course: a brick skirt the house sits on. Without it a house
   * meets its lawn in a single hard line and looks placed rather than built.
   *
   * No top face. It is the same height as the floor inside and as the porch
   * deck outside, so its top is covered on every square centimetre — and drawn,
   * it wins the depth fight against the floorboards by 4mm and the front room
   * of every enterable house is paved in brick.
   */
  addBox(mb, h.x, FLOOR / 2, (z0 + z1) / 2, h.w + 0.3, FLOOR, h.d + 0.3, 0, MAT.BRICK,
    { ao: aoUnder, bottom: false, top: false });

  /* The four walls. Openings are in wall coordinates measured from the wall's
   * start corner, which is why each wall passes its own (x0,z0)-(x1,z1). */
  const doorW = 1.05, doorH = 2.1;
  const frontHoles = h.windows.filter((w) => w.wall === 'front')
    .map((w) => ({ u: w.u, w: w.w, y: w.y, h: w.h, win: w }));
  const doorU = h.w / 2;
  frontHoles.push({ u: doorU, w: doorW, y: 0, h: doorH, door: true });

  /*
   * The four walls, as one loop around the rectangle.
   *
   * Winding is the whole reason this is written as a loop rather than as four
   * hand-placed walls. A panel's normal is ninety degrees to the left of the
   * direction it is built in, so the loop has to run one specific way round or
   * the wall faces into the house — and with back-face culling on, a wall
   * facing the wrong way is not subtly wrong, it is not there at all. The
   * front row of houses and the back row face opposite ways down this street,
   * so hand-placing them gets exactly half of them inside-out, and the half
   * that is wrong is the half you are standing in.
   */
  const holesOn = (which) => h.windows.filter((w) => w.wall === which)
    .map((w) => ({ u: w.u, w: w.w, y: w.y, h: w.h, win: w }));
  const frontIsLow = h.frontZ === z0;
  const loop = [
    { side: 'zLow', ax: x1, az: z0, bx: x0, bz: z0, len: h.w },
    { side: 'xLow', ax: x0, az: z0, bx: x0, bz: z1, len: h.d },
    { side: 'zHigh', ax: x0, az: z1, bx: x1, bz: z1, len: h.w },
    { side: 'xHigh', ax: x1, az: z1, bx: x1, bz: z0, len: h.d },
  ];
  const walls = loop.map((w) => {
    if (w.side === 'zLow') {
      return Object.assign({ key: frontIsLow ? 'front' : 'back' }, w,
        { holes: frontIsLow ? frontHoles : holesOn('back') });
    }
    if (w.side === 'zHigh') {
      return Object.assign({ key: frontIsLow ? 'back' : 'front' }, w,
        { holes: frontIsLow ? holesOn('back') : frontHoles });
    }
    return Object.assign({ key: w.side === 'xLow' ? 'left' : 'right' }, w,
      { holes: holesOn(w.side === 'xLow' ? 'left' : 'right') });
  });

  for (const w of walls) {
    /* Sides run front-to-back, so their length is the house depth; the
     * openings were authored in that same measure. */
    wallWithHoles(mb, w.ax, w.az, w.bx, w.bz, 0, top, w.holes, siding);
    for (const hole of w.holes) {
      reveal(mb, w.ax, w.az, w.bx, w.bz, 0, hole, thick, MAT.WOOD);
      if (hole.win) {
        const lit = hole.win.lit;
        pane(mb, w.ax, w.az, w.bx, w.bz, 0, hole,
          lit ? MAT.GLASS_LIT : MAT.GLASS, -1);
        if (lit) {
          /* A lit window lights the ground under it. This is the only light
           * in the game that is attached to something the player can break
           * the logic of — walk into that room and the light is still there,
           * because somebody is still asleep with the lamp on. */
          const px = w.ax + (w.bx - w.ax) * (hole.u / w.len);
          const pz = w.az + (w.bz - w.az) * (hole.u / w.len);
          lights.push({
            x: px, y: hole.y + hole.h * 0.5, z: pz,
            r: 1, g: 0.78, b: 0.5, intensity: 1.5, radius: 9, phase: -1,
            kind: 'window',
          });
        }
      }
    }
  }

  /* Interior. Only for houses you can get into: a floor, a ceiling, one
   * dividing wall and enough furniture to hide behind. Building interiors for
   * all twelve would triple the triangle count of the whole game for rooms
   * nobody can enter. */
  if (h.enterable) interior(mb, col, interact, h, layout, rng);
  else {
    /* Sealed house: one box, so you cannot walk through the middle of it. */
    col.add(x0, 0, z0, x1, top, z1, { tag: 'house', id: h.id });
  }

  /* Roof. The ridge runs parallel to the street on every house here, which is
   * what makes the row read as one place from the end of the road. */
  addGableRoof(mb, x0, z0, x1, z1, top, h.roofRise, 'x', MAT.ROOF,
    { overhang: 0.42, gableMat: siding, ao: (s2, t) => 0.8 + 0.2 * t });
  col.add(x0 - 0.42, top, z0 - 0.42, x1 + 0.42, top + h.roofRise, z1 + 0.42,
    { tag: 'roof', id: h.id, platform: false });

  /* Chimney, on about half of them. */
  if (h.id % 2 === 0) {
    addBox(mb, h.x + h.w * 0.28, top + h.roofRise * 0.55, (z0 + z1) / 2,
      0.9, h.roofRise * 1.5, 0.9, 0, MAT.BRICK, { ao: aoWall, bottom: false });
  }

  /* Porch: a deck, a rail, two posts and a roof over the door. The porch light
   * hangs off the wall beside the door, and on the nights it is on it is the
   * brightest thing in the front garden. */
  const porchZ = front - s * 1.4;
  addBox(mb, h.x, 0.21, porchZ, 3.6, 0.42, 2.8, 0, MAT.WOOD, { ao: aoUnder, bottom: false });
  col.add(h.x - 1.8, 0, porchZ - 1.4, h.x + 1.8, 0.42, porchZ + 1.4,
    { tag: 'porch', id: h.id, solid: false, opaque: false });
  for (const px of [-1.7, 1.7]) {
    addBox(mb, h.x + px, 1.35, porchZ - s * 1.2, 0.16, 2.3, 0.16, 0, MAT.WOOD, { ao: aoWall });
    col.add(h.x + px - 0.1, 0.42, porchZ - s * 1.2 - 0.1,
      h.x + px + 0.1, 2.5, porchZ - s * 1.2 + 0.1, { tag: 'post', opaque: false });
  }
  addBox(mb, h.x, 2.55, porchZ - s * 0.6, 4.0, 0.16, 2.6, 0, MAT.ROOF, { ao: aoFlat });
  /* Two steps down to the path. */
  addBox(mb, h.x, 0.07, porchZ - s * 1.75, 2.2, 0.14, 0.5, 0, MAT.PATH, { ao: aoUnder });
  addBox(mb, h.x, 0.21, porchZ - s * 1.45, 2.2, 0.14, 0.5, 0, MAT.PATH, { ao: aoUnder });
  col.add(h.x - 1.1, 0, Math.min(porchZ - s * 1.4, porchZ - s * 2.0), h.x + 1.1, 0.28,
    Math.max(porchZ - s * 1.4, porchZ - s * 2.0),
    { tag: 'step', solid: false, opaque: false });

  if (h.porchLight) {
    lights.push({
      x: h.x + 0.9, y: 2.3, z: front - s * 0.4,
      r: 1, g: 0.86, b: 0.62, intensity: 2.2, radius: 11, phase: -1, kind: 'porch',
    });
  }

  /* The front path and the driveway. */
  const kerbZ = s * (PLAN.roadHalf + PLAN.pave);
  strip(sec, col, h.x - 1.0, front - s * 2.1, h.x + 1.0, kerbZ, 0.04, MAT.PATH, 'path');
  const gx = h.x + h.garageSide * (h.w / 2 - 1.8);
  strip(sec, col, gx - 1.6, front - s * 0.2, gx + 1.6, kerbZ, 0.05, MAT.PATH, 'drive');

  /* The garage, attached, with a flat roof you can get onto if you can find
   * something to climb. */
  garage(sec, col, interact, h);

  /* The front door. It is a dynamic object because it swings, so it is not in
   * the static mesh at all — only its frame is. */
  const dz = front - s * 0.02;
  doors.push({
    houseId: h.id,
    x: h.x - doorW / 2 * (s > 0 ? 1 : -1), y: 0, z: dz,
    yaw: s > 0 ? 0 : Math.PI,
    width: doorW, height: doorH,
    open: false, t: 0,
    locked: !h.enterable,
    box: col.add(h.x - doorW / 2, 0, dz - 0.06, h.x + doorW / 2, doorH, dz + 0.06,
      { tag: 'door', id: h.id, opaque: true }),
  });
  interact.push({
    kind: 'door', houseId: h.id, x: h.x, y: 1.0, z: front - s * 1.9, radius: 1.9,
    label: h.enterable ? 'הדלת' : 'הדלת נעולה',
  });

  /*
   * The kitchen window of the empty house, which has a sentence written on the
   * inside of it. From the garden every word of it is back to front, and the
   * only thing in the neighbourhood that reads it the right way round is the
   * wardrobe mirror on its own back fence.
   */
  if (h.abandoned) {
    interact.push({
      kind: 'window', houseId: h.id,
      x: h.x + h.w * 0.22, y: 1.6, z: h.backZ - s * 0.6, radius: 2.0,
      label: 'החלון',
    });
  }

  /* The number over the door — the mailbox puzzle's other half. */
  interact.push({
    kind: 'number', houseId: h.id, number: h.number,
    x: h.x, y: 2.35, z: front - s * 1.6, radius: 2.2, label: `מספר ${h.number}`,
  });
}

function garage(sec, col, interact, h) {
  const s = h.sign;
  const G = h.garage;
  const gx = G.x, gw = G.w, gd = G.d, gtop = G.wallTop;
  const mb = sec.at(gx, (G.z0 + G.z1) / 2, gw, gd, G.roof + 0.4);
  const siding = SIDING_SLOTS[h.siding];

  const z0 = Math.min(G.z0, G.z1), z1 = Math.max(G.z0, G.z1);
  /* Three walls and a flat roof; the fourth side is the door opening. */
  addBox(mb, gx, gtop / 2, (z0 + z1) / 2, gw, gtop, gd, 0, siding,
    { ao: aoWall, bottom: false, faces: s > 0 ? { zn: false } : { zp: false } });
  /* The roof slab, whose top is G.roof — the height the flag site is placed
   * from and the height the crates outside have to reach. */
  addBox(mb, gx, (gtop + G.roof) / 2, (z0 + z1) / 2, gw + 0.35, G.roof - gtop,
    gd + 0.35, 0, MAT.ROOF, { ao: aoFlat });
  /* The up-and-over door itself, always shut. */
  addBox(mb, gx, 1.2, h.frontZ - s * 0.06, gw - 0.5, 2.4, 0.12, 0, MAT.METAL, { ao: aoWall });

  col.add(gx - gw / 2, 0, z0, gx + gw / 2, G.roof, z1, { tag: 'garage', id: h.id });
  interact.push({
    kind: 'garageDoor', houseId: h.id, x: gx, y: 1.2, z: h.frontZ - s * 1.2,
    radius: 1.8, label: 'דלת המוסך נעולה',
  });
}

/*
 * Inside. One dividing wall makes two rooms — a front room and a back
 * bedroom — which is enough for the two things an interior is for: somewhere
 * to be that she cannot see into, and somewhere to hide when she comes in
 * anyway.
 */
function interior(mb, col, interact, h, layout, rng) {
  const s = h.sign;
  const IN = h.interior;
  const x0 = IN.x0, x1 = IN.x1;
  const z0 = IN.z0, z1 = IN.z1;
  const top = h.wallTop;

  addGround(mb, x0, z0, x1, z1, FLOOR, MAT.WOOD, { sub: 3, ao: aoUnder });
  /* The floorboards, as a platform, so a step indoors sounds like a step
   * indoors. Without it the lawn's default surface reaches through the walls
   * and you walk across somebody's living room on grass. */
  col.add(x0, 0, z0, x1, FLOOR, z1,
    { tag: 'floor', id: h.id, solid: false, opaque: false, platform: true });
  /* Ceiling, wound downward so it is visible from underneath. */
  addQuad(mb, [x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1],
    [0, 0], [h.w, 0], [h.w, h.d], [0, h.d], MAT.PATH, { sub: 2, ao: aoUnder });

  /* The wall between the rooms, with a doorway in it. */
  const midZ = IN.midZ;
  const innerDoorX = h.x - h.w / 2 + IN.doorU;
  wallWithHoles(mb, x0, midZ, x1, midZ, FLOOR, top - FLOOR,
    [{ u: IN.doorU - 0.24, w: 1.0, y: 0, h: 2.05 }], MAT.PATH, { sub: 1 });
  col.add(x0, FLOOR, midZ - 0.09, innerDoorX - 0.55, top, midZ + 0.09,
    { tag: 'wall', id: h.id });
  col.add(innerDoorX + 0.55, FLOOR, midZ - 0.09, x1, top, midZ + 0.09,
    { tag: 'wall', id: h.id });

  /*
   * The shell: four walls as collision, so the outside of the house is solid
   * even though the inside is hollow — with a gap in the front wall where the
   * front door is.
   *
   * That gap is the single most consequential number in this file. Without it
   * the door opens onto a wall: the geometry has a hole in it, the door leaf
   * swings, and the player walks into something invisible and concludes the
   * house cannot be entered. It was exactly that for a while, and nothing
   * about the picture on screen showed it — which is why suburb-world.mjs
   * flood-fills the neighbourhood and asserts you can get out of your own
   * bedroom.
   */
  const doorHalf = 0.58;
  col.add(h.x - h.w / 2, 0, h.z0, x0, top, h.z1, { tag: 'house', id: h.id });
  col.add(x1, 0, h.z0, h.x + h.w / 2, top, h.z1, { tag: 'house', id: h.id });
  const frontIsLow = h.frontZ === h.z0;
  const lowWall = (a, b) => col.add(a, 0, h.z0, b, top, z0, { tag: 'house', id: h.id });
  const highWall = (a, b) => col.add(a, 0, z1, b, top, h.z1, { tag: 'house', id: h.id });
  if (frontIsLow) {
    lowWall(h.x - h.w / 2, h.x - doorHalf);
    lowWall(h.x + doorHalf, h.x + h.w / 2);
    highWall(h.x - h.w / 2, h.x + h.w / 2);
  } else {
    lowWall(h.x - h.w / 2, h.x + h.w / 2);
    highWall(h.x - h.w / 2, h.x - doorHalf);
    highWall(h.x + doorHalf, h.x + h.w / 2);
  }
  /* And a ceiling, so nobody stands on the furniture and out through the
   * roof. */
  /* Not a platform. A ceiling is something that stops you standing up, not
   * something to stand on — and left standable, anything that asks the world
   * for the ground from above the roofline gets put on top of the house. */
  col.add(x0, top, z0, x1, top + 0.2, z1,
    { tag: 'ceiling', id: h.id, opaque: false, platform: false });

  const backRoomZ = IN.backRoomZ;

  /* The bed. In your own house it is where the night starts and ends; in
   * anyone else's, somebody is in it. */
  const bedX = IN.bed.x;
  addBox(mb, bedX, FLOOR + 0.32, backRoomZ, 1.5, 0.52, 2.0, 0, MAT.WOOD, { ao: aoUnder });
  addBox(mb, bedX, FLOOR + 0.66, backRoomZ - s * 0.75, 1.4, 0.18, 0.5, 0, MAT.CLOTH,
    { ao: aoFlat });
  col.add(bedX - 0.75, 0, backRoomZ - 1.0, bedX + 0.75, FLOOR + 0.58, backRoomZ + 1.0,
    { tag: 'bed', id: h.id, opaque: false });
  if (h.home) {
    interact.push({
      /*
       * The bed's own centre, with a radius wide enough to catch a player
       * standing beside it. Offsetting the prompt point into the room sounds
       * tidier and is wrong: the bed is already against the middle of the back
       * room, so any offset along Z puts the prompt through the wall between
       * the two rooms and the only place it can be pressed from is the other
       * side of that wall.
       */
      kind: 'bed', houseId: h.id, x: bedX, y: FLOOR + 0.7, z: backRoomZ, radius: 2.3,
      label: 'המיטה שלך',
    });
  }

  /* The wardrobe: the hiding place, and the reason night six is a different
   * game — from then on she opens them. */
  const wx = IN.wardrobe.x;
  addBox(mb, wx, FLOOR + 1.05, backRoomZ, 1.2, 2.1, 0.7, 0, MAT.WOOD, { ao: aoWall });
  col.add(wx - 0.6, 0, backRoomZ - 0.35, wx + 0.6, FLOOR + 2.1, backRoomZ + 0.35,
    { tag: 'wardrobe', id: h.id });
  interact.push({
    kind: 'hide', houseId: h.id, x: wx, y: FLOOR + 1.0, z: backRoomZ, radius: 1.6,
    label: 'להיכנס לארון',
    spot: { x: wx, z: backRoomZ },
  });

  /* Front room: a sofa, a low table and a television that is not on. */
  const frontRoomZ = IN.frontRoomZ;
  addBox(mb, h.x - 2.4, FLOOR + 0.4, frontRoomZ, 2.1, 0.8, 0.85, 0, MAT.CLOTH,
    { ao: aoUnder });
  col.add(h.x - 3.45, 0, frontRoomZ - 0.45, h.x - 1.35, FLOOR + 0.8, frontRoomZ + 0.45,
    { tag: 'sofa', id: h.id, opaque: false });
  addBox(mb, h.x + 0.4, FLOOR + 0.22, frontRoomZ, 1.1, 0.44, 0.6, 0, MAT.WOOD,
    { ao: aoUnder });
  col.add(h.x - 0.15, 0, frontRoomZ - 0.3, h.x + 0.95, FLOOR + 0.44, frontRoomZ + 0.3,
    { tag: 'table', id: h.id, opaque: false });
  addBox(mb, h.x + 3.2, FLOOR + 0.75, frontRoomZ, 0.9, 0.6, 0.3, 0, MAT.GLASS,
    { ao: aoFlat });
  addBox(mb, h.x + 3.2, FLOOR + 0.3, frontRoomZ, 0.7, 0.6, 0.4, 0, MAT.WOOD,
    { ao: aoUnder });
  col.add(h.x + 2.75, 0, frontRoomZ - 0.25, h.x + 3.65, FLOOR + 1.05, frontRoomZ + 0.25,
    { tag: 'tv', id: h.id, opaque: false });

  /* Something to find. Which house holds which piece of the story is decided
   * by the layout seed, so a save's story is laid out across its own street. */
  if (rng.chance(h.abandoned ? 1 : 0.45)) {
    interact.push({
      kind: 'story', houseId: h.id,
      x: h.x + rng.range(-2, 2), y: FLOOR + 0.9, z: frontRoomZ + rng.range(-1, 1),
      radius: 1.6,
      label: 'משהו על השולחן',
      slot: (h.id * 7 + (layout.seed | 0)) >>> 0,
    });
  }
  void layout;
}

/* ------------------------------------------------------------------ *
 * Street furniture and gardens
 * ------------------------------------------------------------------ */

function streetLamp(sec, col, lights, l) {
  const mb = sec.at(l.x, l.z, 1.5, 1.5, 6.5);
  addCylinder(mb, l.x, 0, l.z, 0.11, 5.2, 8, MAT.METAL, { ao: aoWall });
  addBox(mb, l.x, 0.12, l.z, 0.5, 0.24, 0.5, 0, MAT.PATH, { ao: aoUnder });
  /* The arm reaches out over the road, which is why the pavement under a
   * lamp is darker than the tarmac beside it. */
  const ax = Math.sin(l.yaw) * 0.9, az = -Math.cos(l.yaw) * 0.9;
  addBox(mb, l.x + ax / 2, 5.25, l.z + az / 2, Math.abs(ax) + 0.12, 0.12,
    Math.abs(az) + 0.12, 0, MAT.METAL, { ao: aoFlat });
  /* The glass is the warm window material, not the flag's red: GLOW is the one
   * red thing in the neighbourhood and a street full of red lamp heads spends
   * that colour before the flag ever appears. */
  addBox(mb, l.x + ax, 5.12, l.z + az, 0.62, 0.2, 0.34, 0, MAT.GLASS_LIT,
    { ao: aoFlat, flick: l.flicker });
  col.add(l.x - 0.16, 0, l.z - 0.16, l.x + 0.16, 5.2, l.z + 0.16,
    { tag: 'lamp', opaque: false });
  lights.push({
    x: l.x + ax, y: 5.0, z: l.z + az,
    /* Low-pressure sodium: almost monochromatic orange. Using a white lamp
     * here and tinting the frame afterwards is what makes a night scene look
     * like a day scene with the brightness turned down. */
    r: 1, g: 0.62, b: 0.24, intensity: 5.2, radius: 20, phase: l.flicker,
    kind: 'lamp',
  });
}

function props(sec, col, lights, interact, layout, rng) {
  for (const p of layout.props) {
    switch (p.kind) {
      case 'mailbox': mailbox(sec, col, interact, p); break;
      case 'flagpole': flagpole(sec, col, interact, p); break;
      case 'bin': bin(sec, col, interact, p); break;
      case 'car': car(sec, col, interact, p); break;
      case 'hedgeRow': hedgeRow(sec, col, interact, p, rng); break;
      case 'tree': tree(sec, col, p, rng); break;
      case 'doghouse': doghouse(sec, col, interact, p); break;
      case 'doll': doll(sec, col, interact, p); break;
      case 'digspot': digspot(sec, col, interact, p); break;
      case 'board': board(sec, col, interact, p); break;
      case 'ladder': ladder(sec, col, interact, p); break;
      case 'panel': fusePanel(sec, col, interact, p); break;
      case 'musicbox': musicbox(sec, col, interact, p); break;
      case 'mirror': mirror(sec, col, interact, p); break;
      case 'fountain': fountain(sec, col, interact, p); break;
      case 'bench': bench(sec, col, p); break;
      case 'sign': sign(sec, col, p); break;
      case 'shelter': shelter(sec, col, p); break;
      case 'homeMark': homeMark(sec, col, interact, p); break;
      default: break;
    }
  }
  /* Picket fences along every plot line, front garden only — back gardens get
   * the tall boarded fence, which is what makes the back of the street a
   * different, worse place to be. */
  const gateSite = layout.sites.find((x) => x.id === 'garage');
  for (const h of layout.houses) {
    const s = h.sign;
    const edge = h.w / 2 + PLAN.plotEdge;
    for (const side of [-1, 1]) {
      const fx = h.x + side * edge;
      picketFence(sec, col, fx, s * (PLAN.roadHalf + PLAN.pave), fx, s * (PLAN.frontZ - 0.5));
      /*
       * The side passage of one house in the street has a gate in it with a
       * chain and a combination on the chain, and behind that gate is the only
       * way onto its garage roof. Every other side passage is a solid run of
       * boarded fence.
       */
      const gated = gateSite && gateSite.houseId === h.id && side === -h.garageSide;
      if (gated) {
        boardFence(sec, col, fx, s * (PLAN.frontZ + 0.5), fx, s * (PLAN.frontZ + 2.4));
        gate(sec, col, interact, fx, s * (PLAN.frontZ + 2.4), s * (PLAN.frontZ + 3.9), h);
        boardFence(sec, col, fx, s * (PLAN.frontZ + 3.9), fx, s * (PLAN.frontZ + h.d + 6));
      } else {
        boardFence(sec, col, fx, s * (PLAN.frontZ + 0.5), fx, s * (PLAN.frontZ + h.d + 6));
      }
    }
    boardFence(sec, col, h.x - edge, s * (PLAN.frontZ + h.d + 6),
      h.x + edge, s * (PLAN.frontZ + h.d + 6));
  }
}

function mailbox(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.6, 0.6, 1.6);
  addCylinder(mb, p.x, 0, p.z, 0.06, 1.05, 6, MAT.WOOD, { ao: aoWall });
  addBox(mb, p.x, 1.18, p.z, 0.28, 0.26, 0.46, p.yaw, MAT.METAL, { ao: aoFlat });
  col.add(p.x - 0.2, 0, p.z - 0.25, p.x + 0.2, 1.32, p.z + 0.25,
    { tag: 'mailbox', opaque: false });
  interact.push({
    kind: 'mailbox', houseId: p.houseId, number: p.number,
    x: p.x, y: 1.18, z: p.z, radius: 1.6, label: `תיבת הדואר של מספר ${p.number}`,
  });
}

/* The flag pole outside every house. On the first night it is scenery. By the
 * seventh it is the only thing in the neighbourhood that was ever real. */
function flagpole(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.5, 0.5, 3.2);
  addCylinder(mb, p.x, 0, p.z, 0.05, 2.6, 6, MAT.METAL, { ao: aoWall });
  if (p.flying) {
    addQuad(mb, [p.x + 0.04, 1.85, p.z], [p.x + 0.04, 1.85, p.z + 0.62],
      [p.x + 0.04, 2.32, p.z + 0.62], [p.x + 0.04, 2.32, p.z],
      [0, 0], [0.62, 0], [0.62, 0.47], [0, 0.47], MAT.GLOW, { sub: 2 });
    addQuad(mb, [p.x - 0.04, 1.85, p.z + 0.62], [p.x - 0.04, 1.85, p.z],
      [p.x - 0.04, 2.32, p.z], [p.x - 0.04, 2.32, p.z + 0.62],
      [0, 0], [0.62, 0], [0.62, 0.47], [0, 0.47], MAT.GLOW, { sub: 2 });
  }
  col.add(p.x - 0.1, 0, p.z - 0.1, p.x + 0.1, 2.6, p.z + 0.1,
    { tag: 'pole', opaque: false });
  interact.push({
    kind: 'flagpole', houseId: p.houseId, x: p.x, y: 1.6, z: p.z, radius: 1.5,
    label: 'הדגל של הבית הזה',
  });
}

function bin(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.6, 0.6, 1.3);
  addBox(mb, p.x, 0.55, p.z, 0.62, 1.1, 0.72, p.yaw, MAT.METAL, { ao: aoWall, bottom: false });
  addBox(mb, p.x, 1.14, p.z, 0.66, 0.08, 0.76, p.yaw, MAT.METAL, { ao: aoFlat });
  col.add(p.x - 0.38, 0, p.z - 0.42, p.x + 0.38, 1.18, p.z + 0.42, { tag: 'bin' });
  interact.push({
    kind: 'bin', houseId: p.houseId, slot: p.slot ?? -1,
    x: p.x, y: 1.0, z: p.z, radius: 1.5,
    label: (p.slot ?? -1) >= 0 ? 'פח משורשר' : 'לפתוח את הפח',
  });
}

/*
 * A car, as five boxes. It is not a good car. It does not need to be: at night
 * it is a silhouette with a windscreen catching the street lamp, and what
 * matters is that it is exactly tall enough to crouch behind and not tall
 * enough to stand behind, which is a gameplay dimension rather than a
 * modelling one.
 */
function car(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1.4, 2.5, 1.8);
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  addBox(mb, p.x, 0.62, p.z, 1.78, 0.62, 4.3, p.yaw, MAT.METAL, { ao: aoWall, bottom: false });
  addBox(mb, p.x - s * 0.2, 1.14, p.z - c * 0.2, 1.66, 0.52, 2.3, p.yaw, MAT.GLASS,
    { ao: aoFlat, bottom: false });
  for (const [ox, oz] of [[-0.78, -1.5], [0.78, -1.5], [-0.78, 1.5], [0.78, 1.5]]) {
    addCylinder(mb, p.x + ox * c - oz * s, 0.0, p.z + ox * s + oz * c, 0.31, 0.22, 8,
      MAT.METAL, { ao: aoUnder });
  }
  const hw = Math.abs(c) * 0.9 + Math.abs(s) * 2.2;
  const hd = Math.abs(c) * 2.2 + Math.abs(s) * 0.9;
  col.add(p.x - hw, 0, p.z - hd, p.x + hw, 1.42, p.z + hd, { tag: 'car', id: p.houseId });
  interact.push({
    kind: 'car', houseId: p.houseId, x: p.x, y: 1.1, z: p.z, radius: 2.2,
    label: 'המכונית נעולה',
  });
}

/* Hedges are crossed billboards with a cut-out material, and a solid box for
 * collision that is shorter than the leaves: you walk into the woody part and
 * the top of it brushes past your shoulders, which is both how a hedge works
 * and where the rustle comes from. */
/*
 * A hedge, as a row of panels. `panels` forces the count, which matters for
 * exactly one boundary in the neighbourhood: the chain on number 12's gate
 * takes the number of white panels along it as its code, and a player who does
 * not believe the neighbour can stand there and count them. If the fence had
 * "about that many" the puzzle would be a lie.
 */
function hedgeRow(sec, col, interact, p, rng) {
  const z0 = Math.min(p.z0, p.z1), z1 = Math.max(p.z0, p.z1);
  const step = p.panels ? (z1 - z0) / p.panels : 1.1;
  for (let z = z0; z < z1 - 1e-6; z += step) {
    const mb = sec.at(p.x, z, 1.2, 1.2, 2.2);
    addCross(mb, p.x + rng.range(-0.12, 0.12), 0, z, step * 1.4,
      1.9 + rng.range(-0.15, 0.2), rng.range(0, Math.PI), MAT.LEAF,
      { ao: (s, t) => 0.5 + 0.5 * t });
  }
  /*
   * 1.75, not 1.45. The drawn hedge is 1.9m of leaf, and the box is what
   * decides whether she can see through it — at 1.45 a standing player was
   * visible over a hedge that fills the screen in front of them, which is the
   * worst kind of unfair: the picture says you are hidden and the rules say
   * you are not. It is now just tall enough to cover someone standing right
   * against it, and a picket fence at 1.15 still only covers a crouch.
   */
  col.add(p.x - 0.5, 0, z0, p.x + 0.5, 1.75, z1, { tag: 'hedge', opaque: true });
  if (p.panels) {
    /* Somewhere to stand and count from, which is the whole of that puzzle:
     * twenty seconds in the open, at the front of the plot, at 3:33. */
    interact.push({
      kind: 'count', houseId: p.houseId, panels: p.panels,
      x: p.x, y: 1.2, z: z0 + 2.5, radius: 2.0, label: 'לספור את המשוכות',
    });
  }
}

function tree(sec, col, p, rng) {
  const mb = sec.at(p.x, p.z, p.r * 2.5, p.r * 2.5, p.h + 1);
  addCylinder(mb, p.x, 0, p.z, p.r * 0.24, p.h * 0.62, 8, MAT.BARK, { ao: aoWall, cap: false });
  const cy = p.h * 0.45;
  for (let i = 0; i < 3; i++) {
    addCross(mb, p.x + rng.range(-0.5, 0.5), cy + i * p.h * 0.16, p.z + rng.range(-0.5, 0.5),
      p.r * 3.4 - i * 0.5, p.h * 0.5, rng.range(0, Math.PI), MAT.LEAF,
      { ao: () => 0.75 });
  }
  col.add(p.x - p.r * 0.3, 0, p.z - p.r * 0.3, p.x + p.r * 0.3, p.h * 0.62, p.z + p.r * 0.3,
    { tag: 'tree' });
  /* The canopy blocks sight but not movement — she cannot see you through a
   * tree, and you can stand under one. */
  col.add(p.x - p.r * 1.6, cy, p.z - p.r * 1.6, p.x + p.r * 1.6, cy + p.h * 0.5,
    p.z + p.r * 1.6, { tag: 'canopy', solid: false, platform: false, opaque: true });
}

function doghouse(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1.2, 1.2, 1.4);
  addBox(mb, p.x, 0.42, p.z, 1.1, 0.84, 1.2, p.yaw, MAT.WOOD, { ao: aoWall, bottom: false });
  addGableRoof(mb, p.x - 0.62, p.z - 0.68, p.x + 0.62, p.z + 0.68, 0.84, 0.35, 'x',
    MAT.ROOF, { overhang: 0.1 });
  col.add(p.x - 0.55, 0, p.z - 0.6, p.x + 0.55, 0.9, p.z + 0.6, { tag: 'doghouse' });
  interact.push({
    kind: 'doghouse', houseId: p.houseId, x: p.x, y: 0.5, z: p.z, radius: 1.6,
    label: 'המלונה',
  });
}

/*
 * A garden doll. Four of them stand in a row at 13 and they are Adam's toys
 * from the photograph — a teddy, a red hat, a ball and a book — which is why
 * they are four visibly different things rather than four garden gnomes. At
 * night they are four small silhouettes on a lawn, and that is enough.
 */
function doll(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.5, 0.5, 0.9);
  addCylinder(mb, p.x, 0, p.z, 0.17, 0.3, 7, MAT.PATH, { ao: aoUnder });
  const y = 0.3;
  switch (p.slot) {
    case 0:   /* the teddy */
      addLimb(mb, p.x, y + 0.34, p.z, [0.11, 0.09], [0.09, 0.08], 0.34, MAT.CLOTH,
        { ao: aoWall });
      addSphere(mb, p.x, y + 0.42, p.z, 0.1, 8, 6, MAT.CLOTH, { ao: aoFlat });
      break;
    case 1:   /* the red hat */
      addCylinder(mb, p.x, y, p.z, 0.13, 0.22, 8, MAT.CLOTH, { ao: aoWall });
      addBox(mb, p.x, y + 0.24, p.z, 0.42, 0.05, 0.42, 0, MAT.GLOW, { ao: aoFlat });
      addCylinder(mb, p.x, y + 0.24, p.z, 0.12, 0.16, 8, MAT.GLOW, { ao: aoWall });
      break;
    case 2:   /* the ball */
      addSphere(mb, p.x, y + 0.16, p.z, 0.16, 10, 8, MAT.CLOTH, { ao: aoFlat });
      break;
    default:  /* the book */
      addBox(mb, p.x, y + 0.06, p.z, 0.3, 0.11, 0.22, 0.3, MAT.WOOD, { ao: aoWall });
      break;
  }
  col.add(p.x - 0.2, 0, p.z - 0.2, p.x + 0.2, 0.7, p.z + 0.2,
    { tag: 'doll', opaque: false });
  interact.push({
    kind: 'doll', slot: p.slot, houseId: p.houseId,
    x: p.x, y: 0.55, z: p.z, radius: 1.4, label: 'בובת גינה',
  });
}

/* Loose earth under 13's porch. There is a bone under it, and the dog at 15
 * has been waiting twenty years for somebody to work that out. */
function digspot(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1, 1, 0.4);
  addGround(mb, p.x - 0.55, p.z - 0.45, p.x + 0.55, p.z + 0.45, 0.05, MAT.PATH,
    { sub: 2, ao: aoUnder });
  void col;
  interact.push({
    kind: 'dig', houseId: p.houseId, x: p.x, y: 0.3, z: p.z, radius: 1.5,
    label: 'אדמה תחוחה',
  });
}

/* The third board of the empty house's porch, standing a little proud of the
 * others — which is the only way a player who has read the window can find the
 * right one in the dark. */
function board(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1, 1, 0.6);
  addBox(mb, p.x, 0.47, p.z, 0.22, 0.1, 1.6, 0, MAT.WOOD, { ao: aoWall });
  void col;
  interact.push({
    kind: 'board', houseId: p.houseId, x: p.x, y: 0.5, z: p.z, radius: 1.6,
    label: 'קרש רופף',
  });
}

/* An aluminium ladder leaning on the big tree. It is drawn lying against the
 * trunk and it is the loudest object in the game. */
function ladder(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1.2, 1.2, 3.4);
  for (const ox of [-0.28, 0.28]) {
    addBox(mb, p.x + ox, 1.5, p.z, 0.07, 3.0, 0.07, 0, MAT.METAL, { ao: aoWall });
  }
  for (let i = 0; i < 8; i++) {
    addBox(mb, p.x, 0.35 + i * 0.36, p.z, 0.62, 0.05, 0.05, 0, MAT.METAL, { ao: aoFlat });
  }
  col.add(p.x - 0.4, 0, p.z - 0.2, p.x + 0.4, 1.2, p.z + 0.2,
    { tag: 'ladder', opaque: false });
  interact.push({
    kind: 'ladder', x: p.x, y: 1.2, z: p.z, radius: 1.8, label: 'הסולם',
  });
}

/* The fuse cabinet at the edge of the park: four switches behind a door that
 * has not been locked in years, and one strip of red tape. */
function fusePanel(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1, 1, 2.2);
  addBox(mb, p.x, 1.1, p.z, 0.7, 1.1, 0.34, p.yaw, MAT.METAL, { ao: aoWall });
  addCylinder(mb, p.x, 0, p.z, 0.09, 0.6, 6, MAT.METAL, { ao: aoUnder });
  addBox(mb, p.x, 0.3, p.z, 0.5, 0.6, 0.5, p.yaw, MAT.BRICK, { ao: aoUnder });
  col.add(p.x - 0.4, 0, p.z - 0.4, p.x + 0.4, 1.7, p.z + 0.4, { tag: 'panel' });
  interact.push({
    kind: 'panel', x: p.x, y: 1.2, z: p.z, radius: 1.8, label: 'ארון החשמל',
  });
}

function musicbox(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.4, 0.4, 0.6);
  addBox(mb, p.x, 0.36, p.z, 0.34, 0.28, 0.34, 0, MAT.WOOD, { ao: aoWall });
  addCylinder(mb, p.x, 0, p.z, 0.06, 0.22, 6, MAT.METAL, { ao: aoUnder });
  col.add(p.x - 0.2, 0, p.z - 0.2, p.x + 0.2, 0.5, p.z + 0.2,
    { tag: 'musicbox', opaque: false });
  interact.push({
    kind: 'musicbox', slot: p.slot, houseId: p.houseId,
    x: p.x, y: 0.4, z: p.z, radius: 1.4, label: 'תיבת נגינה',
  });
}

function mirror(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 0.8, 0.8, 2.0);
  addBox(mb, p.x, 0.9, p.z, 0.9, 1.8, 0.08, p.yaw, MAT.GLASS, { ao: aoFlat });
  addBox(mb, p.x, 0.9, p.z + 0.06, 1.0, 1.9, 0.06, p.yaw, MAT.WOOD, { ao: aoWall });
  col.add(p.x - 0.5, 0, p.z - 0.12, p.x + 0.5, 1.9, p.z + 0.12,
    { tag: 'mirror', opaque: false });
  interact.push({
    kind: 'mirror', houseId: p.houseId, x: p.x, y: 1.2, z: p.z, radius: 1.8,
    label: 'המראה',
  });
}

function fountain(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, p.r + 1, p.r + 1, 2.4);
  addCylinder(mb, p.x, 0, p.z, p.r, 0.55, 16, MAT.BRICK, { ao: aoWall, cap: false });
  /* The water sits below the rim, which is the only reason a flag can be
   * under it and out of sight from the path. */
  addGround(mb, p.x - p.r * 0.86, p.z - p.r * 0.86, p.x + p.r * 0.86, p.z + p.r * 0.86,
    0.34, MAT.GLASS, { sub: 3 });
  addCylinder(mb, p.x, 0.5, p.z, 0.3, 1.4, 10, MAT.BRICK, { ao: aoWall });
  addBox(mb, p.x, 1.95, p.z, 1.1, 0.16, 1.1, 0, MAT.BRICK, { ao: aoFlat });
  /* An annulus of collision: eight boxes round the rim, so you can crouch in
   * under the lip between them but not walk across the basin. */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx = p.x + Math.cos(a) * p.r, bz = p.z + Math.sin(a) * p.r;
    col.add(bx - 0.5, 0, bz - 0.5, bx + 0.5, 0.55, bz + 0.5,
      { tag: 'fountain', opaque: false });
  }
  col.add(p.x - 0.35, 0, p.z - 0.35, p.x + 0.35, 2.1, p.z + 0.35, { tag: 'fountain' });
  interact.push({
    kind: 'fountain', x: p.x, y: 0.5, z: p.z + p.r * 0.75, radius: 2.0, label: 'המזרקה',
  });
}

/*
 * Where the night ends: a doormat outside your own front door.
 *
 * The goal was a trigger volume and nothing else, which is fine until 3:34:40
 * with her behind you and a red flag in your hand — at which point "somewhere
 * near my front door" is not a place. A mat is a place, it is lit by your own
 * porch light, and it is the only one in the street.
 */
function homeMark(sec, col, interact, p) {
  const mb = sec.at(p.x, p.z, 1.2, 1.2, 0.3);
  addGround(mb, p.x - 0.6, p.z - 0.4, p.x + 0.6, p.z + 0.4, 0.44, MAT.CLOTH,
    { sub: 2, ao: () => 0.75 });
  void col;
  interact.push({
    kind: 'home', houseId: p.houseId, x: p.x, y: 0.6, z: p.z, radius: 1.8,
    label: 'הדלת שלך',
  });
}

function bench(sec, col, p) {
  const mb = sec.at(p.x, p.z, 1.2, 1.2, 1.2);
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  addBox(mb, p.x, 0.45, p.z, 1.9, 0.1, 0.5, p.yaw, MAT.WOOD, { ao: aoUnder });
  addBox(mb, p.x - s * 0.28, 0.78, p.z - c * 0.28, 1.9, 0.55, 0.09, p.yaw, MAT.WOOD,
    { ao: aoWall });
  for (const ox of [-0.8, 0.8]) {
    addBox(mb, p.x + ox * c, 0.22, p.z + ox * s, 0.12, 0.44, 0.44, p.yaw, MAT.METAL,
      { ao: aoUnder });
  }
  const hw = Math.abs(c) * 1.0 + Math.abs(s) * 0.35;
  const hd = Math.abs(c) * 0.35 + Math.abs(s) * 1.0;
  col.add(p.x - hw, 0, p.z - hd, p.x + hw, 0.5, p.z + hd,
    { tag: 'bench', opaque: false });
  col.add(p.x - s * 0.28 - hw * 0.9, 0.5, p.z - c * 0.28 - hd * 0.9,
    p.x - s * 0.28 + hw * 0.9, 1.05, p.z - c * 0.28 + hd * 0.9,
    { tag: 'benchBack', opaque: false });
}

function sign(sec, col, p) {
  const mb = sec.at(p.x, p.z, 0.8, 0.8, 2.2);
  addCylinder(mb, p.x, 0, p.z, 0.06, 1.6, 6, MAT.METAL, { ao: aoWall });
  addBox(mb, p.x, 1.75, p.z, 1.3, 0.4, 0.06, p.yaw, MAT.WOOD, { ao: aoFlat });
  col.add(p.x - 0.1, 0, p.z - 0.1, p.x + 0.1, 1.9, p.z + 0.1,
    { tag: 'sign', opaque: false });
}

function shelter(sec, col, p) {
  const mb = sec.at(p.x, p.z, 2.4, 1.6, 2.8);
  for (const ox of [-1.9, 1.9]) {
    addBox(mb, p.x + ox, 1.2, p.z, 0.12, 2.4, 0.12, 0, MAT.METAL, { ao: aoWall });
    col.add(p.x + ox - 0.1, 0, p.z - 0.1, p.x + ox + 0.1, 2.4, p.z + 0.1,
      { tag: 'post', opaque: false });
  }
  addBox(mb, p.x, 2.5, p.z, 4.2, 0.14, 1.6, 0, MAT.ROOF, { ao: aoFlat });
  addBox(mb, p.x, 1.2, p.z - 0.7, 4.0, 2.4, 0.08, 0, MAT.GLASS, { ao: aoWall });
  addBox(mb, p.x, 0.45, p.z + 0.3, 3.4, 0.1, 0.42, 0, MAT.WOOD, { ao: aoUnder });
  col.add(p.x - 2.1, 0, p.z - 0.8, p.x + 2.1, 0.5, p.z + 0.6,
    { tag: 'shelter', opaque: false });
}

/* ------------------------------------------------------------------ *
 * Fences
 * ------------------------------------------------------------------ */

/*
 * A gate: one panel of the same boarded fence with a chain across it. Its box
 * is tagged 'gate' and goes non-solid when the chain comes off — the same
 * mechanism the front doors use, and the reachability test knows to treat both
 * as open, because "can the player get there at all" must not depend on
 * whether they have solved a puzzle yet.
 */
function gate(sec, col, interact, x, z0, z1, h) {
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  const mb = sec.at(x, (lo + hi) / 2, 0.6, (hi - lo) / 2 + 0.5, 2.2);
  addBox(mb, x, 0.92, (lo + hi) / 2, 0.1, 1.85, hi - lo, 0, MAT.WOOD,
    { ao: aoWall, bottom: false });
  addBox(mb, x, 1.05, (lo + hi) / 2, 0.16, 0.06, 0.5, 0, MAT.METAL, { ao: aoFlat });
  const box = col.add(x - 0.09, 0, lo, x + 0.09, 1.85, hi, { tag: 'gate', id: h.id });
  interact.push({
    kind: 'gate', houseId: h.id, box,
    x, y: 1.1, z: (lo + hi) / 2, radius: 1.8, label: 'השער',
  });
}

function picketFence(sec, col, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const n = Math.floor(len / 0.24);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * 0.24;
    const px = x0 + ux * t, pz = z0 + uz * t;
    addBox(sec.at(px, pz, 0.4, 0.4, 1.4), px, 0.58, pz, 0.09, 1.15, 0.05,
      Math.atan2(ux, uz), MAT.WOOD, { ao: aoWall, bottom: false });
  }
  /* Two rails, which is what a picket fence actually is. */
  for (const y of [0.35, 0.92]) {
    const mb = sec.at((x0 + x1) / 2, (z0 + z1) / 2, len / 2, len / 2, 1.4);
    addBox(mb, (x0 + x1) / 2, y, (z0 + z1) / 2,
      Math.abs(x1 - x0) + 0.06, 0.09, Math.abs(z1 - z0) + 0.06, 0, MAT.WOOD,
      { ao: aoWall });
  }
  col.add(Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08,
    Math.max(x0, x1) + 0.08, 1.15, Math.max(z0, z1) + 0.08,
    { tag: 'fence' });
}

/* The back gardens are separated by boarded fence, not pickets: a solid wall
 * of it at 1.85m, which you cannot see over standing and cannot climb without
 * something to stand on. That is the whole difference in feel between the
 * front of the street and the back of it. */
function boardFence(sec, col, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const mb = sec.at((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.5,
    Math.abs(z1 - z0) / 2 + 0.5, 2.2);
  addBox(mb, (x0 + x1) / 2, 0.92, (z0 + z1) / 2,
    Math.abs(x1 - x0) + 0.09, 1.85, Math.abs(z1 - z0) + 0.09, 0, MAT.WOOD,
    { ao: aoWall, bottom: false });
  col.add(Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08,
    Math.max(x0, x1) + 0.08, 1.85, Math.max(z0, z1) + 0.08, { tag: 'fence' });
}

/* ------------------------------------------------------------------ *
 * The edge of the world, and the things you climb
 * ------------------------------------------------------------------ */

/*
 * A hedge three and a half metres tall all the way round. It is scenery and it
 * is also the answer to "what is outside the neighbourhood", which the game
 * does not otherwise give: you cannot see over it, you cannot get through it,
 * and on the seventh night you find out why.
 */
function boundary(sec, col, layout) {
  const b = layout.bounds;
  const h = PLAN.boundaryHeight;
  const runs = [
    [b.x0, b.z0, b.x1, b.z0], [b.x0, b.z1, b.x1, b.z1],
    [b.x0, b.z0, b.x0, b.z1], [b.x1, b.z0, b.x1, b.z1],
  ];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    for (let t = 0; t < len; t += 1.6) {
      const px = x0 + ux * t, pz = z0 + uz * t;
      addCross(sec.at(px, pz, 2, 2, h + 0.5), px, 0, pz, 2.6, h, t * 0.7, MAT.LEAF,
        { ao: (s, tt) => 0.4 + 0.5 * tt });
    }
    col.add(x0 - 0.7, 0, z0 - 0.7, x1 + 0.7, h, z1 + 0.7, { tag: 'boundary' });
  }
}

/*
 * The things that make the high flag sites reachable.
 *
 * This is placed from the site list rather than sprinkled about, because
 * "there is a flag on the garage roof and no way onto the garage roof" is not
 * a difficulty setting, it is a broken night — and it is exactly the kind of
 * thing that is invisible until somebody plays that night. tools/suburb-world
 * flood-fills the whole neighbourhood and asserts every site is standable-next
 * to, which is what stops this file and layout.js drifting apart.
 *
 * Every step is 0.55m, comfortably under the 0.62m the player can step up
 * without jumping.
 */
function climbFurniture(sec, col, layout) {
  for (const site of layout.sites) {
    if (site.id === 'garage') {
      /*
       * Stacked against the back wall of the garage, inside the back garden —
       * which is sealed except for the gate with the chain on it. 0.6, 1.2,
       * 1.8, 2.4, 3.0, and the roof is 3.1: every step is under the 62cm the
       * player can walk up, and the last is a 10cm rise rather than a jump
       * they have to discover.
       */
      const h = layout.houses.find((x) => x.id === site.houseId);
      const G = h.garage;
      /* Hard against the back wall: the roof overhangs it by 17cm, so the top
       * crate and the roof edge overlap and the last move is a step rather
       * than a leap across a gap the player cannot see. */
      const back = G.z1 + h.sign * 0.45;
      for (let i = 0; i < 5; i++) {
        const top = 0.6 * (i + 1);
        const cz = back + h.sign * (4 - i) * 0.9;
        addBox(sec.at(G.x, cz, 1.4, 1, top + 0.5), G.x, top / 2, cz, 1.7, top, 0.9, 0,
          MAT.WOOD, { ao: aoWall, bottom: false });
        col.add(G.x - 0.85, 0, cz - 0.45, G.x + 0.85, top, cz + 0.45, { tag: 'crate' });
      }
    }
    if (site.id === 'tree') {
      /*
       * Roots and a low fork get you to 1.65m, and no further. The flag is on
       * a branch at four metres, and the three rungs between the two are the
       * ladder — which starts lying against the fence six metres away and is
       * not standable until it has been dragged over, one loud half-phrase at
       * a time. Without that the ladder would be scenery and the puzzle would
       * be a decoration on a climb that already worked.
       */
      const steps = [[0.55, 1.5], [1.1, 1.0], [1.65, 0.75]];
      for (const [y, r] of steps) {
        addBox(sec.at(site.x, site.z + 1.2, 2, 2, y + 0.5), site.x, y / 2, site.z + 1.2,
          r * 2, y, r, 0, MAT.BARK, { ao: aoWall, bottom: false });
        col.add(site.x - r, 0, site.z + 1.2 - r / 2, site.x + r, y, site.z + 1.2 + r / 2,
          { tag: 'root' });
      }
      for (let i = 0; i < 3; i++) {
        const y = 2.25 + i * 0.6;
        col.add(site.x - 0.5, y - 0.05, site.z + 1.0, site.x + 0.5, y, site.z + 1.5,
          { tag: 'rung', platform: false, solid: false, opaque: false });
      }
      /* The branch the flag is tied to. */
      addBox(sec.at(site.x, site.z, 2, 2, 4.4), site.x, 3.75, site.z + 0.4, 3.2, 0.28, 0.3,
        0, MAT.BARK, { ao: aoWall });
      col.add(site.x - 1.6, 3.61, site.z + 0.25, site.x + 1.6, 3.89, site.z + 0.55,
        { tag: 'branch' });
    }
    if (site.id === 'pit') {
      /* An actual hole, 0.95m deep, with a heap of earth beside it. */
      col.addPit(site.x - 1.2, site.z - 1.2, site.x + 1.2, site.z + 1.2, -0.95);
      const mb = sec.at(site.x, site.z, 2, 2, 1);
      /* The four walls of the hole, and its floor. */
      const w = 1.2, d = -0.95;
      addGround(mb, site.x - w, site.z - w, site.x + w, site.z + w, d, MAT.PATH, { sub: 2 });
      const P = (dx, dz) => [site.x + dx, 0, site.z + dz];
      const Q = (dx, dz) => [site.x + dx, d, site.z + dz];
      const face = (a, b) => addQuad(mb, Q(...a), Q(...b), P(...b), P(...a),
        [0, 0], [2 * w, 0], [2 * w, -d], [0, -d], MAT.PATH, { sub: 1, ao: aoUnder });
      face([-w, w], [w, w]);
      face([w, -w], [-w, -w]);
      face([w, w], [w, -w]);
      face([-w, -w], [-w, w]);
      addBox(sec.at(site.x + 1.9, site.z, 1, 1, 1), site.x + 1.9, 0.22, site.z,
        1.4, 0.44, 1.4, 0, MAT.PATH, { ao: aoUnder });
      col.add(site.x + 1.2, 0, site.z - 0.7, site.x + 2.6, 0.44, site.z + 0.7,
        { tag: 'spoil', opaque: false });
    }
  }
}

/* A window that comes on later in the night is drawn as a separate quad the
 * renderer only submits once it is lit — the street mesh is static and cannot
 * change its own material. */
function windowGlow(h, w) {
  const s = h.sign;
  const isFront = w.wall === 'front';
  const along = isFront || w.wall === 'back' ? 'x' : 'z';
  const x = along === 'x' ? h.x - h.w / 2 + w.u : (w.wall === 'left' ? h.x - h.w / 2 : h.x + h.w / 2);
  const z = along === 'x' ? (isFront ? h.frontZ : h.backZ) : h.z0 + w.u;
  return {
    houseId: h.id, at: w.wakesAt, x, y: w.y + w.h / 2, z,
    w: w.w, h: w.h, yaw: along === 'x' ? 0 : Math.PI / 2, s,
    lit: false,
  };
}
