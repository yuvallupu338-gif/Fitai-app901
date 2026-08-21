/*
 * barricade.js — boards and tape, across an actual hole.
 *
 * This is the picture the game is about. Everything else — the balance table,
 * the supply budget, the neighbour's two calls — exists so that the player
 * ends up standing in a dark room looking at these, wondering whether there
 * are enough of them, while something works on the other side.
 *
 * So it is built to be *read*, from across a room, at a glance:
 *
 *   - Boards are individual, not a panel. Six boards over a window is
 *     obviously more than two, and you can count them without stopping.
 *   - Each board sits at its own slight angle, deterministically derived from
 *     the opening's own name, so no two openings look stamped from the same
 *     die and the same opening looks the same every time you walk back to it.
 *   - They stand proud of the wall, catching the lamp on their top edge, which
 *     is what separates "boarded" from "painted a different colour".
 *   - Tape goes on as an X. It is the shape everyone already reads as "this is
 *     a stopgap", and it distinguishes itself from timber at any distance and
 *     in any light.
 *
 * Mesh geometry is rebuilt only when an opening's board or tape count actually
 * changes — see the cache in game/world.js — because rebuilding fifteen of
 * these every frame is a lot of arithmetic to arrive at the same buffer.
 */

import { MeshBuilder, addQuad } from '../render/meshbuilder.js';
import { hash1 } from '../core/rng.js';

/*
 * A box in an arbitrary frame. addBox only yaws around Y, and a board nailed
 * across a window at a hurried angle is exactly the case that needs more than
 * that. `right`, `up` and `normal` must be a right-handed orthonormal set:
 * right x up = normal. Every face below states the cross product that gives
 * its outward normal, because a board that is inside out looks like a hole.
 */
function orientedBox(mb, c, right, up, normal, hw, hh, hd, mat, ao) {
  const P = (sx, sy, sz) => [
    c[0] + right[0] * hw * sx + up[0] * hh * sy + normal[0] * hd * sz,
    c[1] + right[1] * hw * sx + up[1] * hh * sy + normal[1] * hd * sz,
    c[2] + right[2] * hw * sx + up[2] * hh * sy + normal[2] * hd * sz,
  ];
  const A = P(-1, -1, 1), B = P(1, -1, 1), C = P(1, 1, 1), D = P(-1, 1, 1);
  const E = P(-1, -1, -1), F = P(1, -1, -1), G = P(1, 1, -1), H = P(-1, 1, -1);
  const uvFace = [[0, 0], [hw * 2, 0], [hw * 2, hh * 2], [0, hh * 2]];
  const uvEnd = [[0, 0], [hd * 2, 0], [hd * 2, hh * 2], [0, hh * 2]];
  const uvTop = [[0, 0], [hw * 2, 0], [hw * 2, hd * 2], [0, hd * 2]];
  const o = { ao };

  addQuad(mb, A, B, C, D, ...uvFace, mat, o);   /* +normal: right x up      */
  addQuad(mb, F, E, H, G, ...uvFace, mat, o);   /* -normal: -right x up     */
  addQuad(mb, B, F, G, C, ...uvEnd, mat, o);    /* +right:  -normal x up    */
  addQuad(mb, E, A, D, H, ...uvEnd, mat, o);    /* -right:   normal x up    */
  addQuad(mb, D, C, G, H, ...uvTop, mat, o);    /* +up:      right x -normal */
  addQuad(mb, E, F, B, A, ...uvTop, mat, o);    /* -up:      right x normal  */
}

/* A deterministic wobble per board, so the same window always looks the same
 * and no two windows look alike. */
function jitter(id, i, spread) {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (Math.imul(h, 31) + id.charCodeAt(k)) | 0;
  return ((hash1(h + i * 7919) / 4294967296) - 0.5) * 2 * spread;
}

/* The local frame of an opening: along it, up it, and out of it into the room.
 * A gap in a floor or a ceiling has no wall to lie along, so it gets the world
 * axes instead. */
function frameOf(a) {
  if (a.ny) {
    const normal = [0, a.ny, 0];
    const right = [1, 0, 0];
    /* right x up = normal  =>  up = normal x right */
    const up = [
      normal[1] * right[2] - normal[2] * right[1],
      normal[2] * right[0] - normal[0] * right[2],
      normal[0] * right[1] - normal[1] * right[0],
    ];
    return { right, up, normal };
  }
  return { right: [a.dx, 0, a.dz], up: [0, 1, 0], normal: [a.nx, 0, a.nz] };
}

const BOARD_T = 0.022;      /* half-thickness */
const BOARD_H = 0.075;      /* half-height    */

/*
 * Build the barricade on one opening. `planks` and `tape` are the counts from
 * the simulation; nothing here decides anything, it only draws what the rules
 * already say is there.
 */
export function buildBarricade(mb, anchor, planks, tape, mat) {
  const f = frameOf(anchor);
  const span = anchor.y1 - anchor.y0;
  const w = anchor.width;
  const cx = anchor.x, cz = anchor.z;
  const midY = anchor.ny ? anchor.y : (anchor.y0 + anchor.y1) / 2;

  /* Two boards per plank the player nailed on. */
  /*
   * How far the boards are spread. For a wall opening that is its height; for
   * a hole in a floor or a ceiling there is no height — the anchor is four
   * centimetres thick — so spreading across `span` puts eight 15 cm boards
   * inside a 4 cm slot, stacked on each other and z-fighting. Half the hidden
   * openings in the game are floor or ceiling ones. Those spread across the
   * hole's width instead, which is what boarding a hatch actually looks like.
   */
  const layout = anchor.ny ? anchor.width : span;
  const boards = planks * 2;
  for (let i = 0; i < boards; i++) {
    const frac = (i + 0.5) / boards;
    /* Along `up` from one edge of the opening to the other, with a nudge. */
    const off = (frac - 0.5) * Math.max(0.12, layout - BOARD_H * 2.6)
      + jitter(anchor.id, i, layout * 0.035);
    const tilt = jitter(anchor.id, i + 40, 0.075);
    /* Every board at its own depth, not alternating between two — with eight
     * boards the alternating pattern put four of them at an identical depth
     * with coplanar faces. */
    const depth = 0.026 + i * 0.0055;

    /* Rotate right/up about the normal by `tilt`. */
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const right = [
      f.right[0] * ct + f.up[0] * st,
      f.right[1] * ct + f.up[1] * st,
      f.right[2] * ct + f.up[2] * st,
    ];
    const up = [
      f.up[0] * ct - f.right[0] * st,
      f.up[1] * ct - f.right[1] * st,
      f.up[2] * ct - f.right[2] * st,
    ];

    const c = [
      cx + f.up[0] * off + f.normal[0] * depth,
      midY + f.up[1] * off + f.normal[1] * depth,
      cz + f.up[2] * off + f.normal[2] * depth,
    ];
    orientedBox(mb, c, right, up, f.normal,
      w / 2 + 0.11, BOARD_H, BOARD_T, mat.timberPlank, () => 0.86);

    /* Two nail heads per board, at the ends where they would actually be. */
    for (const s of [-1, 1]) {
      const nc = [
        c[0] + right[0] * (w / 2 + 0.04) * s + f.normal[0] * (BOARD_T + 0.004),
        c[1] + right[1] * (w / 2 + 0.04) * s + f.normal[1] * (BOARD_T + 0.004),
        c[2] + right[2] * (w / 2 + 0.04) * s + f.normal[2] * (BOARD_T + 0.004),
      ];
      orientedBox(mb, nc, right, up, f.normal, 0.011, 0.011, 0.004, mat.metalPale, () => 1);
    }
  }
  return boards;
}

/*
 * Tape, as an X across the opening. Drawn into a separate builder because it
 * is a cut-out material and the renderer keeps those in their own pass.
 */
export function buildTape(mb, anchor, tape, mat) {
  if (tape <= 0) return 0;
  const f = frameOf(anchor);
  const span = anchor.y1 - anchor.y0;
  const w = anchor.width;
  const midY = anchor.ny ? anchor.y : (anchor.y0 + anchor.y1) / 2;
  const diag = Math.hypot(w, span) * 0.52;
  const halfW = 0.030;

  let count = 0;
  for (let layer = 0; layer < tape; layer++) {
    for (const dir of [1, -1]) {
      /* The angle of the diagonal, plus a little so the second layer is not a
       * perfect overlay of the first. */
      const ang = Math.atan2(span * dir, w) + jitter(anchor.id, layer * 3 + dir, 0.09);
      const ct = Math.cos(ang), st = Math.sin(ang);
      const right = [
        f.right[0] * ct + f.up[0] * st,
        f.right[1] * ct + f.up[1] * st,
        f.right[2] * ct + f.up[2] * st,
      ];
      const up = [
        f.up[0] * ct - f.right[0] * st,
        f.up[1] * ct - f.right[1] * st,
        f.up[2] * ct - f.right[2] * st,
      ];
      const depth = 0.052 + layer * 0.010;
      const c = [
        anchor.x + f.normal[0] * depth,
        midY + f.normal[1] * depth,
        anchor.z + f.normal[2] * depth,
      ];
      /* A single quad rather than a box — tape has no thickness worth
       * modelling, and the cut-out pass draws it from both sides. */
      const P = (sx, sy) => [
        c[0] + right[0] * diag * sx + up[0] * halfW * sy,
        c[1] + right[1] * diag * sx + up[1] * halfW * sy,
        c[2] + right[2] * diag * sx + up[2] * halfW * sy,
      ];
      addQuad(mb, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1),
        [0, 0], [diag * 2, 0], [diag * 2, 1], [0, 1],
        mat.tapeStrip, { sub: 6, ao: () => 0.94 });
      count++;
    }
  }
  return count;
}

/*
 * Every barricade in the house, as two meshes. Returns null for a builder that
 * ended up empty, because uploading a zero-index buffer is a WebGL error
 * rather than a no-op.
 */
export function buildAllBarricades(openings, anchors, mat) {
  const solidMb = new MeshBuilder(4000);
  const tapeMb = new MeshBuilder(1000);
  let solidCount = 0;
  let tapeCount = 0;

  for (const o of openings) {
    if (!o.present || !o.revealed) continue;
    const a = anchors[o.id];
    if (!a) continue;
    if (o.planks > 0) solidCount += buildBarricade(solidMb, a, o.planks, o.tape, mat);
    if (o.tape > 0) tapeCount += buildTape(tapeMb, a, o.tape, mat);
  }

  return {
    solid: solidCount ? solidMb.finish() : null,
    tape: tapeCount ? tapeMb.finish() : null,
  };
}

/* What the cache keys on: rebuild only when a board or a roll actually
 * changed, not every frame. */
export function barricadeSignature(openings) {
  let s = '';
  for (const o of openings) {
    if (!o.present || !o.revealed) continue;
    s += `${o.id}:${o.planks}:${o.tape}:${o.breached ? 1 : 0}|`;
  }
  return s;
}
