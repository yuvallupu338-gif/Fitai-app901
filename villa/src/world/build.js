/*
 * build.js — the villa, as geometry.
 *
 * The floor plan in data/rooms.js is the single source of truth for the shape
 * of the house: the same six rectangles that the 2D map draws are extruded
 * here into walls, floors, ceilings, doorways and window reveals. Nothing
 * about the building is authored twice, so moving a room moves it in both
 * views and in the simulation's adjacency at once.
 *
 * Three things are worth knowing before reading this.
 *
 * **Walls have thickness.** Each room's wall planes are inset half a wall from
 * its plan rectangle, which leaves a real gap between adjoining rooms. That
 * gap is what a doorway is cut through, and it is why a doorway has jambs and
 * a lintel you can see the edge of rather than being a hole in a sheet of
 * paper. Floors and ceilings are *not* inset, so they run under and over the
 * walls and there is never a crack of void at a skirting board.
 *
 * **Openings are holes, not decals.** A window is genuinely missing from the
 * wall mesh, with reveals around the gap, glass in the plane, and a quad of
 * `night` sealing the far end. That is what makes boarding one up mean
 * something: the boards go across an actual hole.
 *
 * **Winding is checked, not eyeballed.** Every quad's normal is
 * `cross(p1-p0, p3-p0)`, and an inside-out wall in a dark game looks like a
 * lighting bug rather than a geometry bug, which is a bad afternoon. Each
 * emitter below states which way its normal points and the maths that gets it
 * there.
 */

import { ROOMS, ROOM_BY_ID, sharedWall } from '../data/rooms.js';
import { REGULAR_OPENINGS, HIDDEN_OPENINGS } from '../data/openings.js';
import { MeshBuilder, addQuad, addBox } from '../render/meshbuilder.js';

/* Plan units are the 100 x 70 grid the 2D map uses. At 0.18 m each the living
 * room comes out just under eight metres across, which is a villa. */
export const SCALE = 0.18;
export const WALL_H = 2.7;
export const WALL_T = 0.14;
export const DOOR_W = 1.05;
export const DOOR_H = 2.06;
export const WINDOW_W = 1.35;
export const WINDOW_SILL = 0.95;
export const WINDOW_TOP = 2.10;
export const EYE_H = 1.68;

/* Which material each room is finished in. */
export const ROOM_FINISH = {
  entrance: { floor: 'tileEntry', wall: 'plasterWarm', ceil: 'ceilingWhite' },
  hall:     { floor: 'oakHall',   wall: 'plasterCold', ceil: 'ceilingWhite' },
  living:   { floor: 'oakLiving', wall: 'wallpaperLiving', ceil: 'ceilingWhite' },
  kitchen:  { floor: 'tileKitchen', wall: 'plasterCold', ceil: 'ceilingWhite' },
  bedroom:  { floor: 'oakBed',    wall: 'wallpaperBed', ceil: 'ceilingWhite' },
  supply:   { floor: 'concreteFloor', wall: 'plasterBare', ceil: 'ceilingWhite' },
};

/*
 * Ceiling fixtures. `group` is the flicker group from the shader — 0 is
 * steady, and the kitchen and the equipment room are not.
 *
 * `intensity` is not decoration. The shader's falloff is a real inverse
 * square, `1 / (1 + d*d)`, which at three metres is already down to a tenth —
 * so a fixture whose colour is around 1.0 and has no intensity term lights
 * nothing at all past its own shade, and the house comes out black with a
 * torch pool in it. A bulb is a few hundred candela; these numbers are what
 * put a room's worth of light on a room.
 */
export const ROOM_LIGHT = {
  entrance: { r: 1.00, g: 0.72, b: 0.42, range: 6.5, intensity: 7.5, group: 0 },
  hall:     { r: 0.92, g: 0.68, b: 0.44, range: 8.0, intensity: 8.5, group: 2 },
  living:   { r: 1.00, g: 0.74, b: 0.46, range: 8.0, intensity: 9.0, group: 0 },
  kitchen:  { r: 0.82, g: 0.86, b: 0.90, range: 6.5, intensity: 8.0, group: 1 },
  bedroom:  { r: 0.98, g: 0.66, b: 0.38, range: 6.0, intensity: 6.5, group: 0 },
  supply:   { r: 0.78, g: 0.80, b: 0.76, range: 5.5, intensity: 6.0, group: 3 },
};

const px = (v) => v * SCALE;

/* ------------------------------------------------------------------ *
 * Room rectangles
 * ------------------------------------------------------------------ */

/* The full plan rectangle in world units — what the floor and ceiling cover. */
export function roomRect(r) {
  return { x0: px(r.x), z0: px(r.y), x1: px(r.x + r.w), z1: px(r.y + r.h) };
}

/* The wall planes, inset by half a wall so adjoining rooms leave a real gap
 * between them for the doorway to be cut through. */
export function roomInner(r) {
  const t = WALL_T / 2;
  const f = roomRect(r);
  return { x0: f.x0 + t, z0: f.z0 + t, x1: f.x1 - t, z1: f.z1 - t };
}

/*
 * The four wall runs of a room, each as a start and an end laid out so that
 * `cross(edgeDir, up)` points *into* the room. Getting this table wrong turns
 * the house inside out, so each line records the normal it produces.
 */
function edgesOf(r) {
  const b = roomInner(r);
  return [
    /* dir +x  ->  normal (0,0,+1)  into the room */
    { side: 'north', ax: b.x0, az: b.z0, bx: b.x1, bz: b.z0 },
    /* dir -x  ->  normal (0,0,-1) */
    { side: 'south', ax: b.x1, az: b.z1, bx: b.x0, bz: b.z1 },
    /* dir -z  ->  normal (+1,0,0) */
    { side: 'west',  ax: b.x0, az: b.z1, bx: b.x0, bz: b.z0 },
    /* dir +z  ->  normal (-1,0,0) */
    { side: 'east',  ax: b.x1, az: b.z0, bx: b.x1, bz: b.z1 },
  ];
}

function edgeLength(e) {
  return Math.hypot(e.bx - e.ax, e.bz - e.az);
}

/* Position along an edge, 0 at its start. */
function pointAt(e, t) {
  return [e.ax + (e.bx - e.ax) * t, e.az + (e.bz - e.az) * t];
}

/* ------------------------------------------------------------------ *
 * Holes
 * ------------------------------------------------------------------ */

/*
 * Where a doorway to `other` falls on this room's edges. The shared wall is
 * computed in plan coordinates by data/rooms.js — the same function the 2D map
 * uses to draw its doorways — and mapped onto the inset edge here.
 */
function doorwayHoles(r, edges) {
  const out = [];
  for (const link of r.links) {
    const wall = sharedWall(r.id, link);
    if (!wall) continue;
    const mid = wall.vertical
      ? { x: px(wall.x1), z: px((wall.y1 + wall.y2) / 2) }
      : { x: px((wall.x1 + wall.x2) / 2), z: px(wall.y1) };

    /* Whichever edge of this room the shared wall lies on. */
    let best = null;
    let bestD = Infinity;
    for (const e of edges) {
      const d = pointLineDistance(mid.x, mid.z, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best || bestD > WALL_T * 2) continue;

    const len = edgeLength(best);
    const t = projectT(mid.x, mid.z, best);
    const half = (DOOR_W / 2) / len;
    out.push({
      edge: best.side, t0: clamp01(t - half), t1: clamp01(t + half),
      y0: 0, y1: DOOR_H, kind: 'doorway', to: link,
    });
  }
  return out;
}

/*
 * Where the villa's own doors and windows fall. `side` and `at` come straight
 * from data/openings.js, so the thing the 2D map draws a mark for and the
 * thing the 3D build cuts a hole for are the same record.
 */
function openingHoles(r, edges, defs) {
  const out = [];
  for (const def of defs) {
    if (def.room !== r.id) continue;
    const e = edges.find((x) => x.side === def.side);
    if (!e) continue;
    const len = edgeLength(e);
    const isDoor = def.kind === 'door';
    const w = isDoor ? DOOR_W : WINDOW_W;
    const half = (w / 2) / len;
    /* Keep the hole clear of the corners, or the reveal has nothing to sit in. */
    const t = Math.min(Math.max(def.at, half + 0.04), 1 - half - 0.04);
    out.push({
      edge: def.side, t0: t - half, t1: t + half,
      y0: isDoor ? 0 : WINDOW_SILL,
      y1: isDoor ? DOOR_H : WINDOW_TOP,
      kind: 'opening', id: def.id, isDoor,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Emitters
 * ------------------------------------------------------------------ */

/*
 * A wall panel between two points along an edge, between two heights.
 * Winding: p0 bottom-start, p1 bottom-end, p2 top-end, p3 top-start, which
 * gives cross(p1-p0, p3-p0) = (-dz, 0, dx) — the inward normal from the table
 * in edgesOf.
 */
function wallPanel(mb, e, t0, t1, y0, y1, mat, ao) {
  if (t1 - t0 < 1e-4 || y1 - y0 < 1e-4) return;
  const a = pointAt(e, t0);
  const b = pointAt(e, t1);
  const len = edgeLength(e) * (t1 - t0);
  addQuad(mb,
    [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]],
    [0, 0], [len, 0], [len, y1 - y0], [0, y1 - y0],
    mat, { sub: Math.max(1, Math.round(Math.max(len, y1 - y0) * 1.4)), ao });
}

/*
 * The four faces of a hole's thickness: two jambs, a lintel, and a sill. The
 * outward offset is the inward normal negated, so these run from the wall
 * plane away from the room by one wall thickness.
 */
function holeReveal(mb, e, hole, mat, ao) {
  const len = edgeLength(e);
  const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
  const ox = dz * WALL_T, oz = -dx * WALL_T;      /* -normal * WALL_T */
  const a = pointAt(e, hole.t0);
  const b = pointAt(e, hole.t1);
  const { y0, y1 } = hole;
  const w = len * (hole.t1 - hole.t0);
  const uvT = [[0, 0], [WALL_T, 0], [WALL_T, y1 - y0], [0, y1 - y0]];

  /* start jamb — normal +d */
  addQuad(mb,
    [a[0], y0, a[1]], [a[0] + ox, y0, a[1] + oz],
    [a[0] + ox, y1, a[1] + oz], [a[0], y1, a[1]],
    ...uvT, mat, { ao });
  /* end jamb — normal -d */
  addQuad(mb,
    [b[0], y0, b[1]], [b[0], y1, b[1]],
    [b[0] + ox, y1, b[1] + oz], [b[0] + ox, y0, b[1] + oz],
    ...uvT, mat, { ao });
  /* lintel — normal (0,-1,0) */
  addQuad(mb,
    [a[0], y1, a[1]], [a[0] + ox, y1, a[1] + oz],
    [b[0] + ox, y1, b[1] + oz], [b[0], y1, b[1]],
    [0, 0], [WALL_T, 0], [WALL_T, w], [0, w], mat, { ao });
  /* sill — normal (0,+1,0); a doorway starting at the floor has none */
  if (y0 > 0.001) {
    addQuad(mb,
      [a[0], y0, a[1]], [b[0], y0, b[1]],
      [b[0] + ox, y0, b[1] + oz], [a[0] + ox, y0, a[1] + oz],
      [0, 0], [w, 0], [w, WALL_T], [0, WALL_T], mat, { ao });
  }
}

/* A pane filling the hole, at some fraction of the way through the reveal.
 * Normal points into the room. */
function holePlane(mb, e, hole, mat, depth, opts) {
  const len = edgeLength(e);
  const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
  const ox = dz * WALL_T * depth, oz = -dx * WALL_T * depth;
  const a = pointAt(e, hole.t0);
  const b = pointAt(e, hole.t1);
  const { y0, y1 } = hole;
  const w = len * (hole.t1 - hole.t0);
  addQuad(mb,
    [a[0] + ox, y0, a[1] + oz], [b[0] + ox, y0, b[1] + oz],
    [b[0] + ox, y1, b[1] + oz], [a[0] + ox, y1, a[1] + oz],
    [0, 0], [w, 0], [w, y1 - y0], [0, y1 - y0], mat, opts || {});
}

/* ------------------------------------------------------------------ *
 * Ambient occlusion
 * ------------------------------------------------------------------ */

/*
 * Per-vertex, and it is doing more for the look than any other single thing
 * here: the soft darkening where a wall meets the floor and the ceiling is
 * what stops a room reading as a lit box. `t` runs 0 at the floor to 1 at the
 * ceiling on a wall panel.
 */
function wallAO(y0, y1) {
  return (s, t) => {
    const y = y0 + (y1 - y0) * t;
    const fromFloor = Math.min(1, y / 0.55);
    const fromCeil = Math.min(1, (WALL_H - y) / 0.45);
    const corner = Math.min(1, Math.min(s, 1 - s) / 0.06 + 0.35);
    return 0.30 + 0.70 * Math.min(fromFloor, fromCeil) * Math.min(1, corner);
  };
}

function floorAO(rect) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  return (s, t) => {
    const ex = Math.min(s, 1 - s) * w;
    const ez = Math.min(t, 1 - t) * d;
    const e = Math.min(ex, ez);
    return 0.34 + 0.66 * Math.min(1, e / 0.7);
  };
}

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

/*
 * Returns everything the game needs to render and walk around the house:
 *
 *   mesh       the whole static building, one buffer
 *   glass      the panes, drawn in the cut-out pass
 *   anchors    per opening id: where it is in the world, which way it faces,
 *              and how big the hole is — used to hang barricades on it, to
 *              aim at it, and to stand something outside it
 *   lights     ceiling fixtures
 *   areas      walkable rectangles, for collision
 */
export function buildVilla(mat) {
  const mb = new MeshBuilder(30000);
  const glassMb = new MeshBuilder(2000);
  const anchors = {};
  const lights = [];
  const areas = [];

  const hiddenByRoom = {};
  for (const d of HIDDEN_OPENINGS) {
    (hiddenByRoom[d.room] = hiddenByRoom[d.room] || []).push(d);
  }

  for (const r of ROOMS) {
    const finish = ROOM_FINISH[r.id];
    const rect = roomRect(r);
    const inner = roomInner(r);
    const edges = edgesOf(r);

    /* ---- floor and ceiling, over the full rectangle so they run under the
     * walls and leave no gap at the skirting ---- */
    const fw = rect.x1 - rect.x0, fd = rect.z1 - rect.z0;
    addQuad(mb,
      [rect.x0, 0, rect.z0], [rect.x0, 0, rect.z1], [rect.x1, 0, rect.z1], [rect.x1, 0, rect.z0],
      [0, 0], [0, fd], [fw, fd], [fw, 0],
      mat[finish.floor], { sub: Math.max(2, Math.round(Math.max(fw, fd) * 1.1)), ao: floorAO(rect) });
    addQuad(mb,
      [rect.x0, WALL_H, rect.z0], [rect.x1, WALL_H, rect.z0], [rect.x1, WALL_H, rect.z1], [rect.x0, WALL_H, rect.z1],
      [0, 0], [fw, 0], [fw, fd], [0, fd],
      mat[finish.ceil], { sub: Math.max(2, Math.round(Math.max(fw, fd) * 0.8)), ao: floorAO(rect) });

    /* ---- walls, cut around every hole on each run ---- */
    const holes = doorwayHoles(r, edges)
      .concat(openingHoles(r, edges, REGULAR_OPENINGS));

    for (const e of edges) {
      const mine = holes.filter((h) => h.edge === e.side).sort((a, b) => a.t0 - b.t0);
      const ao = wallAO(0, WALL_H);
      let cursor = 0;
      for (const h of mine) {
        if (h.t0 > cursor) wallPanel(mb, e, cursor, h.t0, 0, WALL_H, mat[finish.wall], ao);
        if (h.y0 > 0.001) wallPanel(mb, e, h.t0, h.t1, 0, h.y0, mat[finish.wall], ao);
        if (h.y1 < WALL_H - 0.001) wallPanel(mb, e, h.t0, h.t1, h.y1, WALL_H, mat[finish.wall], ao);
        holeReveal(mb, e, h, mat[finish.wall], ao);
        cursor = Math.max(cursor, h.t1);

        if (h.kind === 'opening') {
          /* Seal the far end so an opening looks out at the night rather than
           * into nothing, and record where it is for everything else. */
          holePlane(mb, e, h, mat.night, 1.0, {});
          if (!h.isDoor) holePlane(glassMb, e, h, mat.glass, 0.35, {});
          anchors[h.id] = anchorFor(e, h, r.id);
        }
      }
      if (cursor < 1) wallPanel(mb, e, cursor, 1, 0, WALL_H, mat[finish.wall], ao);
    }

    /* ---- hidden openings: no hole is cut until one is actually found, so
     * their anchors are recorded against a spot on the floor, a wall or the
     * ceiling and the geometry is added at runtime ---- */
    for (const d of hiddenByRoom[r.id] || []) {
      anchors[d.id] = hiddenAnchor(d, inner);
    }

    /* ---- light and walkable area ---- */
    const L = ROOM_LIGHT[r.id];
    lights.push({
      x: (rect.x0 + rect.x1) / 2, y: WALL_H - 0.22, z: (rect.z0 + rect.z1) / 2,
      r: L.r, g: L.g, b: L.b, intensity: L.intensity,
      range: L.range, group: L.group, room: r.id,
    });
    /* A small fixture body, so the light has something to come from. */
    addBox(mb, (rect.x0 + rect.x1) / 2, WALL_H - 0.10, (rect.z0 + rect.z1) / 2,
      0.34, 0.10, 0.34, 0, mat.lampShade, { bottom: true });

    areas.push({ x0: inner.x0, z0: inner.z0, x1: inner.x1, z1: inner.z1, room: r.id });
  }

  /* Doorway gaps as walkable rectangles, so the player can cross between
   * rooms without the collision solver having to know what a door is. */
  const done = new Set();
  for (const r of ROOMS) {
    for (const link of r.links) {
      const key = [r.id, link].sort().join('|');
      if (done.has(key)) continue;
      done.add(key);
      const wall = sharedWall(r.id, link);
      if (!wall) continue;
      const pad = DOOR_W / 2 - 0.06;
      if (wall.vertical) {
        const x = px(wall.x1), z = px((wall.y1 + wall.y2) / 2);
        areas.push({ x0: x - WALL_T, z0: z - pad, x1: x + WALL_T, z1: z + pad, door: key });
      } else {
        const x = px((wall.x1 + wall.x2) / 2), z = px(wall.y1);
        areas.push({ x0: x - pad, z0: z - WALL_T, x1: x + pad, z1: z + WALL_T, door: key });
      }
    }
  }

  return {
    mesh: mb.finish(),
    glass: glassMb.finish(),
    anchors, lights, areas,
  };
}

/*
 * Where an opening is, which way it faces, and how big it is. `nx`/`nz` point
 * into the room, so a barricade laid at `depth` along the negative normal sits
 * in the reveal, and something standing at a positive offset is inside with
 * you.
 */
function anchorFor(e, hole, roomId) {
  const len = edgeLength(e);
  const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
  const a = pointAt(e, hole.t0);
  const b = pointAt(e, hole.t1);
  return {
    id: hole.id,
    room: roomId,
    x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2,
    y: (hole.y0 + hole.y1) / 2,
    y0: hole.y0, y1: hole.y1,
    width: len * (hole.t1 - hole.t0),
    dx, dz,                    /* along the wall */
    nx: -dz, nz: dx,           /* into the room  */
    kind: hole.isDoor ? 'door' : 'window',
    hidden: false,
  };
}

/* A hole that is not in a wall. Floor and ceiling ones face up and down; the
 * rest are put against the nearest wall. */
function hiddenAnchor(def, inner) {
  const cx = inner.x0 + (inner.x1 - inner.x0) * (0.22 + def.at * 0.56);
  const cz = inner.z0 + (inner.z1 - inner.z0) * (0.3 + ((def.at * 1.7) % 1) * 0.4);
  const base = {
    id: def.id, room: def.room, width: 0.8, hidden: true, where: def.where,
    kind: 'hidden', dx: 1, dz: 0,
  };
  if (def.where === 'floor') {
    return Object.assign(base, { x: cx, z: cz, y: 0.02, y0: 0, y1: 0.04, nx: 0, nz: 0, ny: 1 });
  }
  if (def.where === 'ceiling') {
    return Object.assign(base, {
      x: cx, z: cz, y: WALL_H - 0.02, y0: WALL_H - 0.04, y1: WALL_H, nx: 0, nz: 0, ny: -1,
    });
  }
  /* Against whichever wall is nearest, at chest height. */
  const dLeft = cx - inner.x0, dRight = inner.x1 - cx;
  const dNear = cz - inner.z0, dFar = inner.z1 - cz;
  const m = Math.min(dLeft, dRight, dNear, dFar);
  let x = cx, z = cz, nx = 0, nz = 0;
  if (m === dLeft) { x = inner.x0 + 0.02; nx = 1; }
  else if (m === dRight) { x = inner.x1 - 0.02; nx = -1; }
  else if (m === dNear) { z = inner.z0 + 0.02; nz = 1; }
  else { z = inner.z1 - 0.02; nz = -1; }
  return Object.assign(base, {
    x, z, y: 1.15, y0: 0.7, y1: 1.6, nx, nz, ny: 0,
    dx: nz === 0 ? 0 : 1, dz: nz === 0 ? 1 : 0,
  });
}

/* ------------------------------------------------------------------ *
 * Small geometry helpers
 * ------------------------------------------------------------------ */

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function projectT(x, z, e) {
  const ex = e.bx - e.ax, ez = e.bz - e.az;
  const len2 = ex * ex + ez * ez;
  if (len2 < 1e-9) return 0;
  return clamp01(((x - e.ax) * ex + (z - e.az) * ez) / len2);
}

function pointLineDistance(x, z, e) {
  const t = projectT(x, z, e);
  const p = pointAt(e, t);
  return Math.hypot(x - p[0], z - p[1]);
}
