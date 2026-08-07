/*
 * mario-reach.mjs — proves a level can be finished, rather than guessing.
 *
 * A bot that holds right and jumps is a fine smoke test and a terrible oracle:
 * when it dies you cannot tell whether the level is impossible or the bot is
 * bad, and every fix to one looks like a fix to the other. This does the
 * thing properly — a breadth-first search over the states the player's own
 * physics can actually reach.
 *
 * Nodes are places you can be standing: a tile column and the row you are
 * standing on. Edges are things you can do from there — run right, run left,
 * and jump with a range of run-ups and button-hold lengths — each one
 * simulated with the real Player class against the real tile map until it
 * lands somewhere, falls out of the world, or stalls. If the flag is in the
 * reachable set, the level can be finished. If it is not, the search reports
 * the furthest column it could stand in, which is the exact tile to go and
 * look at.
 *
 * Two deliberate simplifications, both conservative:
 *
 *   Enemies are ignored. Whether a Hammer Brother makes a jump *hard* is a
 *   question about difficulty; this only answers whether the jump exists.
 *
 *   Moving lifts are treated as solid floor along the span they declare they
 *   cover. Simulating a platform's phase inside a search would multiply the
 *   state space by its period for no gain, and the span itself is checked
 *   separately in mario-validate.mjs.
 *
 * Nothing here imports a browser API, so it runs under node with the same
 * modules the game runs in a tab.
 */

import { Player } from '../mario/src/game/player.js';
import { T, isSolid, isSemiSolid } from '../mario/src/game/tiles.js';
import { TILE, SCREEN_H } from '../mario/src/game/constants.js';

/* One action is: hold right (or left) for `runUp` frames, then optionally
   jump and hold the button for `hold` frames, then keep going until you land.
   These nine cover the jumps the level vocabulary actually asks for. */
const ACTIONS = [
  { dir: 1, runUp: 0, hold: 0 },
  { dir: -1, runUp: 0, hold: 0 },
  { dir: 1, runUp: 0, hold: 4 },
  { dir: 1, runUp: 0, hold: 16 },
  { dir: 1, runUp: 14, hold: 4 },
  { dir: 1, runUp: 14, hold: 16 },
  { dir: 1, runUp: 34, hold: 16 },
  { dir: -1, runUp: 0, hold: 16 },
  { dir: 1, runUp: 34, hold: 9 },
];

/*
 * Underwater there is no ground to land on, so an action cannot be "jump and
 * see where you come down". A swim is a direction plus how often you stroke —
 * every six frames climbs, every twelve holds depth, never sinks — run for a
 * fixed stretch and then measured. The three rates cover up, along and down,
 * which is all the vertical control a swimmer has.
 */
const SWIM_ACTIONS = [
  { dir: 1, stroke: 6 }, { dir: 1, stroke: 12 }, { dir: 1, stroke: 0 },
  { dir: -1, stroke: 6 }, { dir: -1, stroke: 12 }, { dir: -1, stroke: 0 },
  { dir: 0, stroke: 6 }, { dir: 0, stroke: 0 },
];
const SWIM_FRAMES = 34;

const MAX_FRAMES = 220;      // one action never runs longer than this
const MAX_STATES = 20000;    // a runaway guard, far above any real level

/* The bits of World that Player reaches for. None of them can change the
   geometry: blocks are not bumped, so a search cannot "prove" a route that
   depends on breaking a brick it might not be big enough to break. */
function stubWorld(level) {
  const world = {
    level,
    camera: { x: 0, y: 0 },
    input: stubInput(),
    died: false,
    isUnderwater(x, y) {
      if (level.water) return true;
      if (level.waterLine === undefined) return false;
      if (y < level.waterLine * TILE) return false;
      const t = level.at(Math.floor(x / TILE), Math.floor(y / TILE));
      return t === T.WATER || t === T.WATER_TOP;
    },
    surfaceY() {
      /* Matches World.surfaceY: a fully submerged level has no surface. */
      if (level.water) return null;
      if (level.waterLine === undefined) return null;
      return level.waterLine * TILE;
    },
    sfx() {},
    addScore() {},
    popScore() {},
    collectCoin() {},
    addLife() {},
    startStarMusic() {},
    bumpBlock() {},
    onPlayerDeath() { world.died = true; },
    onFlagDown() {},
    onEnteredCastle() {},
    arriveAt() {},
    spawn() {},
  };
  return world;
}

function stubInput() {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false };
  let edge = false;
  return {
    /* Only a false-to-true transition is an edge. Firing one every frame the
       button is held would let the player re-jump on the frame they land,
       which would prove routes that do not exist. */
    set(button, v) {
      if (button === 'a' && v && !held[button]) edge = true;
      held[button] = v;
    },
    held: (b) => !!held[b],
    pressed(b) {
      if (b !== 'a') return false;
      const was = edge;
      edge = false;
      return was;
    },
    clearAll() { for (const k in held) held[k] = false; edge = false; },
  };
}

/*
 * Lifts become floor. Returns a copy of the tile array so the level itself is
 * left alone — the caller may want to draw it afterwards.
 */
function withLiftsAsFloor(level) {
  const tiles = Uint8Array.from(level.tiles);
  const patched = Object.create(Object.getPrototypeOf(level));
  Object.assign(patched, level);
  patched.tiles = tiles;
  for (const e of level.entities) {
    if (e.type !== 'platform' || !e.covers) continue;
    const row = Math.floor(e.y / TILE);
    for (let c = e.covers[0]; c <= e.covers[1]; c++) {
      if (c < 0 || c >= level.w) continue;
      if (tiles[row * level.w + c] === T.EMPTY) tiles[row * level.w + c] = T.PLATFORM;
    }
  }
  return patched;
}

/* The row a body standing in this column rests on, or -1. */
function floorUnder(level, col, fromRow) {
  for (let y = Math.max(0, fromRow); y < level.h; y++) {
    const t = level.at(col, y);
    if (isSolid(t) || isSemiSolid(t)) return y;
  }
  return -1;
}

/*
 * Runs one action from one standing position and reports where it ended up.
 * Returns null if the player died or never landed.
 */
function simulate(level, from, action, big) {
  const world = stubWorld(level);
  const player = new Player(world);
  player.reset(from.x, from.y, big ? 1 : 0);
  player.onGround = true;
  player.vx = from.vx || 0;

  const input = world.input;
  if (action.stroke !== undefined) return swim(world, player, input, level, action);
  const dirKey = action.dir > 0 ? 'right' : 'left';

  const startRow = Math.floor((from.y) / TILE);
  let ground = 0;
  let stalled = 0;

  for (let f = 0; f < MAX_FRAMES; f++) {
    input.set(dirKey, true);
    input.set('b', true);
    /* The jump starts after the run-up and the button is held for `hold`
       frames — which is the only thing that decides how high it goes. */
    input.set('a', action.hold > 0 && f >= action.runUp && f < action.runUp + action.hold);

    player.update(input, level, f);
    if (world.died || player.state === 'dying' || player.y > SCREEN_H + 16) return null;

    if (!player.onGround) { ground = 0; stalled = 0; continue; }
    ground++;

    /*
     * Where to stop. A jump ends the moment it lands — carrying on would walk
     * the player off the next ledge and report that fall as this jump's
     * result, or kill them in a pit that this action had nothing to do with.
     * A plain walk runs on a little, so that walking is a way of covering
     * ground, but stops as soon as the floor height changes, because that is
     * a new place to be standing and therefore a new node.
     */
    if (action.hold > 0) { if (ground >= 3) break; continue; }
    if (f < 2) continue;
    const row = Math.floor((player.y + player.h) / TILE);
    if (row !== startRow) { if (ground >= 3) break; continue; }
    if (Math.abs(player.vx) < 0.05) { if (++stalled > 6) break; } else stalled = 0;
    if (ground >= 34) break;
  }

  return node(level, player);
}

/* A stretch of swimming, measured at the end rather than on landing. */
function swim(world, player, input, level, action) {
  if (action.dir !== 0) input.set(action.dir > 0 ? 'right' : 'left', true);
  for (let f = 0; f < SWIM_FRAMES; f++) {
    /* One frame of A per stroke, because a stroke is an edge and holding the
       button does nothing after the first frame. */
    input.set('a', action.stroke > 0 && f % action.stroke === 0);
    player.update(input, level, f);
    if (world.died || player.state === 'dying' || player.y > SCREEN_H + 16) return null;
  }
  return node(level, player);
}

/*
 * A search node, or null if the player ended up somewhere that is not a place
 * — outside the map, or inside a wall.
 *
 * The bounds check is what keeps the state space finite. A swimmer drifting
 * above the top of the level produces a new row every stroke, for ever, and
 * the search spends its whole budget exploring empty sky it can never use.
 */
function node(level, player) {
  if (player.state !== 'play') return null;
  const col = Math.floor((player.x + player.w / 2) / TILE);
  const row = Math.floor((player.y + player.h / 2) / TILE);
  if (col < 0 || col >= level.w) return null;
  if (row < 0 || row >= level.h) return null;
  if (isSolid(level.at(col, row))) return null;
  return { x: player.x, y: player.y + player.h, vx: player.vx, col, row };
}

/*
 * The search. Returns { ok, reached, states } where `reached` is the furthest
 * column that can be stood in.
 */
export function proveReachable(rawLevel, opts) {
  const o = opts || {};
  const level = withLiftsAsFloor(rawLevel);
  const goalCol = rawLevel.goal
    ? Math.floor(rawLevel.goal.x / TILE)
    : level.w - 6;

  const startRow = floorUnder(level, Math.floor(rawLevel.start.x / TILE), 0);
  if (startRow < 0) return { ok: false, reached: 0, states: 0, why: 'no floor at the start' };

  const world = stubWorld(level);
  const seen = new Set();
  const queue = [{
    x: rawLevel.start.x,
    y: startRow * TILE,
    vx: 0,
    col: Math.floor(rawLevel.start.x / TILE),
    row: startRow,
  }];
  seen.add(queue[0].col * 100 + queue[0].row);

  let reached = queue[0].col;
  let states = 0;

  while (queue.length && states < MAX_STATES) {
    const node = queue.shift();
    states++;
    if (node.col > reached) reached = node.col;
    if (node.col >= goalCol) return { ok: true, reached: node.col, states };

    /* Which verbs are available here. A lake level has both: you walk up to
       the water and swim across it, and the state you are in decides which
       set of actions the search may take next. */
    const wet = world.isUnderwater(node.x + 8, node.y - 8);
    for (const action of (wet ? SWIM_ACTIONS : ACTIONS)) {
      const landed = simulate(level, node, action, !!o.big);
      if (!landed) continue;
      const key = landed.col * 100 + landed.row;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(landed);
    }
  }

  return {
    ok: false,
    reached,
    states,
    why: states >= MAX_STATES ? 'search ran out of budget' : `nothing beyond column ${reached}`,
  };
}
