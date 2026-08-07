/*
 * level.js — the map, and nothing else.
 *
 * A level is a byte per tile plus three lists: where things spawn, what is
 * painted behind them, and where the pipes lead. No behaviour, no rendering,
 * no reference to a canvas — which is what lets the generator run under node
 * and lets tools/mario-validate.mjs build all hundred levels and walk them for
 * unjumpable gaps before a browser is ever involved.
 *
 * Coordinates: tile columns and rows everywhere in here, pixels everywhere
 * outside. The conversion is one multiply and the confusion of doing it in
 * both directions is not worth the multiply saved, so the boundary is sharp —
 * `at(col,row)` takes tiles, `start`/entity positions come out in pixels.
 */

import { T, isSolid, isSemiSolid } from './tiles.js';

export const LEVEL_H = 15;          // 240px: exactly one screen, no vertical
                                    // scrolling, same as the game this copies
export const GROUND_Y = 13;         // top row of the default floor
export const FLOOR_ROWS = 2;
/* Rows 0-2 are the HUD band and, on roofed levels, the ceiling. Nothing that
   asks "what is the floor here" may look inside them. */
export const CEILING_ROWS = 3;

export class Level {
  constructor(w, h, theme) {
    this.w = w;
    this.h = h || LEVEL_H;
    this.theme = theme || 'overworld';
    this.tiles = new Uint8Array(this.w * this.h);
    this.entities = [];
    this.scenery = [];
    this.warps = [];
    this.start = { x: 48, y: (GROUND_Y - 1) * 16 };
    this.goal = null;
    this.time = 400;
    this.water = false;
    this.music = 'overworld';
    this.rooms = [];        // bonus areas, indexed from 1
    this.name = '';
    this.id = 0;
  }

  at(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return T.EMPTY;
    return this.tiles[y * this.w + x];
  }

  set(x, y, v) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    this.tiles[y * this.w + x] = v;
  }

  fill(x0, y0, x1, y1, v) {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        this.tiles[y * this.w + x] = v;
      }
    }
  }

  spawn(type, col, row, opts) {
    this.entities.push({ type, x: col * 16, y: row * 16, ...(opts || {}) });
  }

  /* Spawn at pixel coordinates, for the handful of things that need to sit
     between tiles (a firebar pivot, a platform mid-track). */
  spawnPx(type, x, y, opts) {
    this.entities.push({ type, x, y, ...(opts || {}) });
  }

  decor(kind, col, row, opts) {
    this.scenery.push({ kind, x: col * 16, y: row * 16, ...(opts || {}) });
  }

  /*
   * The floor row under a column, or -1 for a bottomless pit.
   *
   * The scan starts below the ceiling band, not at row 0. Underground and
   * castle levels have a brick roof along row 1, and a search that began at
   * the top would answer "the floor of this column is row 1" for every column
   * on those levels — including the bottomless ones, which is how a pit stops
   * looking like a pit to everything that asks.
   */
  floorAt(col, from) {
    for (let y = Math.max(CEILING_ROWS, from === undefined ? 0 : from); y < this.h; y++) {
      const t = this.at(col, y);
      if (isSolid(t) || isSemiSolid(t)) return y;
    }
    return -1;
  }

  /* Is there room for a body of this many tiles standing on `row`? Used to
     refuse to place an enemy in a one-tile slot it cannot walk out of. */
  hasHeadroom(col, row, tiles) {
    for (let i = 1; i <= (tiles || 2); i++) {
      if (isSolid(this.at(col, row - i))) return false;
    }
    return true;
  }
}

/*
 * Pipes are four tiles that have to agree with each other, and a pipe drawn
 * one tile short is a wall the player can walk into and get stuck against.
 * Every pipe in the game goes through here.
 */
export function putPipe(level, col, topRow, bottomRow) {
  level.set(col, topRow, T.PIPE_LIP_L);
  level.set(col + 1, topRow, T.PIPE_LIP_R);
  for (let y = topRow + 1; y <= bottomRow; y++) {
    level.set(col, y, T.PIPE_BODY_L);
    level.set(col + 1, y, T.PIPE_BODY_R);
  }
}

/* A horizontal pipe, mouth on the left, running `len` tiles to the right. */
export function putPipeH(level, col, topRow, len) {
  level.set(col, topRow, T.PIPE_H_LIP_T);
  level.set(col, topRow + 1, T.PIPE_H_LIP_B);
  for (let x = col + 1; x < col + len; x++) {
    level.set(x, topRow, T.PIPE_H_BODY_T);
    level.set(x, topRow + 1, T.PIPE_H_BODY_B);
  }
}

/*
 * The castle at the end of a level. Drawn out of tiles rather than as one
 * picture so it sits on whatever ground height the level ended at.
 */
export function putCastle(level, col, baseRow) {
  const top = baseRow - 4;
  level.fill(col, top + 1, col + 4, baseRow, T.CASTLE_BRICK);
  level.set(col, top, T.CASTLE_TOP);
  level.set(col + 2, top, T.CASTLE_TOP);
  level.set(col + 4, top, T.CASTLE_TOP);
  level.set(col + 2, top + 1, T.CASTLE_WINDOW);
  level.set(col + 2, baseRow, T.CASTLE_DOOR);
  level.set(col + 1, top + 2, T.CASTLE_WINDOW);
  level.set(col + 3, top + 2, T.CASTLE_WINDOW);
}

/* The flagpole: a ball, a run of pole, and the block it is planted in. */
export function putFlagpole(level, col, baseRow, height) {
  const top = baseRow - height;
  level.set(col, top, T.FLAG_BALL);
  for (let y = top + 1; y < baseRow; y++) level.set(col, y, T.FLAGPOLE);
  level.set(col, baseRow, T.SOLID);
  return { type: 'flag', x: col * 16, y: top * 16, base: baseRow * 16, height: height * 16 };
}
