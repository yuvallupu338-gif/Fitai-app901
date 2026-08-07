/*
 * physics.js — bodies against the tile map.
 *
 * One axis at a time, always: move in x and resolve, then move in y and
 * resolve. Doing both at once and then working out which side was hit is
 * where corner bugs come from — the classic one being a player running along
 * a flat floor who catches on the seam between two floor tiles because a
 * combined sweep decided the second tile was a wall.
 *
 * Two rules carry the feel:
 *
 * Semi-solid tiles (platforms, tree tops, the castle bridge) only stop a body
 * that is falling AND whose feet were above the tile's top edge on the
 * previous frame. That is what lets you jump up through a platform and land
 * on it, and the "were above" half is what stops you popping onto one you
 * were trying to run underneath.
 *
 * A head hit picks the block nearest the body's centre rather than the first
 * one found. With a 12-pixel-wide body under a row of blocks, the body
 * overlaps two of them most of the time, and "first found" means jumping
 * under a row always breaks the left one — which feels like the game is
 * ignoring where you aimed.
 */

import { TILE } from './constants.js';
import { isSolid, isSemiSolid, isHidden } from './tiles.js';

/*
 * Horizontal move with resolution. Returns true if it hit a wall.
 * Assumes |dx| < TILE, which every velocity in this game satisfies.
 */
export function moveX(body, level, dx) {
  body.x += dx;
  if (dx === 0) return false;

  const top = Math.floor(body.y / TILE);
  const bottom = Math.floor((body.y + body.h - 1) / TILE);

  if (dx > 0) {
    const col = Math.floor((body.x + body.w - 1) / TILE);
    for (let row = top; row <= bottom; row++) {
      if (isSolid(level.at(col, row))) {
        body.x = col * TILE - body.w;
        return true;
      }
    }
  } else {
    const col = Math.floor(body.x / TILE);
    for (let row = top; row <= bottom; row++) {
      if (isSolid(level.at(col, row))) {
        body.x = (col + 1) * TILE;
        return true;
      }
    }
  }
  return false;
}

/*
 * Vertical move with resolution.
 * Returns { ground, ceiling, bumped: {col,row} | null }.
 */
export function moveY(body, level, dy, opts) {
  const o = opts || {};
  const prevBottom = body.y + body.h;
  body.y += dy;

  const left = Math.floor(body.x / TILE);
  const right = Math.floor((body.x + body.w - 1) / TILE);
  const result = { ground: false, ceiling: false, bumped: null, tile: 0 };

  if (dy > 0) {
    /*
     * The row under the feet, not the row the feet are in.
     *
     * A body that has just landed sits with its bottom edge exactly on a tile
     * boundary, so `bottom - 1` is the empty tile above the floor and the
     * landing test fails one frame after it succeeded. The result is a body
     * that alternates grounded and airborne every frame: jumps only work on
     * half of them, enemies never notice ledges, and — because the airborne
     * branch of the movement code has different rules — the player quietly
     * accelerates past the speed cap. One character, all of that.
     *
     * Safe because dy is at most the terminal velocity of 4.5, well under a
     * tile, so the feet can never be more than one row into the floor.
     */
    const row = Math.floor((body.y + body.h) / TILE);
    for (let col = left; col <= right; col++) {
      const t = level.at(col, row);
      const landing = isSolid(t)
        || (isSemiSolid(t) && !o.ignoreSemi && prevBottom <= row * TILE + 1);
      if (landing) {
        body.y = row * TILE - body.h;
        result.ground = true;
        result.tile = t;
        break;
      }
    }
  } else if (dy < 0) {
    const row = Math.floor(body.y / TILE);
    let best = -1;
    let bestDist = Infinity;
    const centre = body.x + body.w / 2;
    for (let col = left; col <= right; col++) {
      const t = level.at(col, row);
      if (!isSolid(t) && !isHidden(t)) continue;
      const d = Math.abs(col * TILE + TILE / 2 - centre);
      if (d < bestDist) { bestDist = d; best = col; }
    }
    if (best >= 0) {
      /* An invisible block is not a ceiling until it has been hit, so the
         body stops on it only if it is a real one. */
      const t = level.at(best, row);
      if (isSolid(t)) {
        body.y = (row + 1) * TILE;
        result.ceiling = true;
      }
      result.bumped = { col: best, row, tile: t };
      result.tile = t;
    }
  }
  return result;
}

/* Is the body standing on anything right now? Used after a move to notice a
   floor that disappeared — a broken brick, a collapsed bridge. */
export function onGround(body, level) {
  const row = Math.floor((body.y + body.h) / TILE);
  const left = Math.floor(body.x / TILE);
  const right = Math.floor((body.x + body.w - 1) / TILE);
  if ((body.y + body.h) % TILE > 1) return false;
  for (let col = left; col <= right; col++) {
    const t = level.at(col, row);
    if (isSolid(t) || isSemiSolid(t)) return true;
  }
  return false;
}

/* Every tile the body currently overlaps, for the things that are decided by
   touching rather than by colliding — coins, lava, water, warp zones. */
export function forEachOverlappedTile(body, level, fn) {
  const left = Math.floor(body.x / TILE);
  const right = Math.floor((body.x + body.w - 1) / TILE);
  const top = Math.floor(body.y / TILE);
  const bottom = Math.floor((body.y + body.h - 1) / TILE);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      fn(level.at(col, row), col, row);
    }
  }
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/*
 * Whether a walker should turn round at the edge of the platform it is on.
 * Only the enemies that are supposed to be careful ask — a Goomba walks off,
 * a red Koopa does not, and that difference is the entire personality of the
 * red Koopa.
 */
export function atLedge(body, level, dir) {
  const ahead = dir > 0 ? body.x + body.w + 1 : body.x - 1;
  const col = Math.floor(ahead / TILE);
  const row = Math.floor((body.y + body.h + 1) / TILE);
  const t = level.at(col, row);
  return !isSolid(t) && !isSemiSolid(t);
}
