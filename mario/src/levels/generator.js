/*
 * generator.js — builds a level out of the pieces in chunks.js.
 *
 * A hundred hand-placed levels is roughly twelve thousand tiles typed by hand,
 * and the result would be a hundred levels that were each edited once. This
 * builds them instead, from a seed, which buys three things a static map
 * cannot: the difficulty curve is a number rather than a hundred separate
 * judgement calls, a fix to a set piece fixes it everywhere it appears, and
 * tools/mario-validate.mjs can build all hundred and walk them for unjumpable
 * gaps on every commit.
 *
 * It is not random level generation in the roguelike sense. The seed picks
 * from a fixed vocabulary of hand-authored set pieces whose internal rules
 * guarantee they are crossable, and the catalogue decides which vocabulary
 * each level draws from. Same seed, same level, forever — which is what makes
 * a best time mean something.
 *
 * The shape of every level is the same three acts the original used, because
 * it works: a safe opening where the controls can be found, a middle that
 * states the level's idea and then complicates it, and a run-in to the flag.
 */

import { rng } from '../core/rng.js';
import { Level, LEVEL_H, GROUND_Y, putPipe, putPipeH, putCastle, putFlagpole } from '../game/level.js';
import { T } from '../game/tiles.js';
import { CHUNKS, rosterFor } from './chunks.js';
import { THEMES } from '../render/palettes.js';

const INTRO = 12;        // tiles of safe ground before anything happens
const OUTRO_FLAG = 34;   // staircase, pole, castle
const OUTRO_BOSS = 30;   // lava, bridge, axe

export function buildLevel(def) {
  const r = rng(def.seed);
  const theme = THEMES[def.theme] ? def.theme : 'overworld';
  const t = THEMES[theme];

  const water = !!def.water;
  const castle = !!def.castle;
  const sky = theme === 'sky';
  const roofed = theme === 'underground' || castle || theme === 'volcano';

  const width = def.length || 200;
  const level = new Level(width, LEVEL_H, theme);
  level.id = def.id;
  level.name = def.name;
  level.world = def.world;
  level.stage = def.stage;
  level.time = def.time || 400;
  level.water = water;
  level.castle = castle;
  level.music = def.music || (castle ? 'castle' : water ? 'water' : roofed ? 'underground' : 'overworld');

  const c = {
    level,
    rng: r,
    x: 0,
    groundY: GROUND_Y,
    diff: Math.min(1, (def.id - 1) / 99),
    theme,
    themeDef: t,
    world: def.world,
    roster: rosterFor(def.world),
    water,
    castle,
    sky,
    roofed,
    /* Piranha plants need pipes to live in, and pipes underwater look wrong,
       so the two flags are separate. */
    plants: !water && def.world >= 2,
    powerups: 0,
    powerupTarget: def.powerups === undefined ? (def.id <= 3 ? 2 : 1) : def.powerups,
    bonusUsed: !def.bonus,
    lakitu: false,
    floorTile: sky ? T.CLOUD : T.GROUND,
    floorDepth: sky ? 1 : 99,
    used: new Set(),
  };

  /* The floor helper in chunks.js writes through level.fill, which does not
     know about sky levels; patching fill here is what lets every land chunk
     work unchanged on a level whose ground is a cloud. */
  const rawFill = level.fill.bind(level);
  level.fill = (x0, y0, x1, y1, v) => {
    if (v === T.GROUND) {
      v = c.floorTile;
      if (c.floorDepth < 99) y1 = Math.min(y1, y0 + c.floorDepth - 1);
    }
    rawFill(x0, y0, x1, y1, v);
  };

  /* ---- act one: somewhere to stand ---- */
  level.fill(0, c.groundY, INTRO - 1, level.h - 1, T.GROUND);
  level.start = { x: 40, y: (c.groundY - 1) * 16 };
  c.x = INTRO;

  /* ---- act two: the level ---- */
  const outro = castle ? OUTRO_BOSS : OUTRO_FLAG;
  const budget = width - outro - 4;
  const names = Object.keys(CHUNKS);

  let guard = 0;
  while (c.x < budget && guard++ < 400) {
    const choices = [];
    for (const name of names) {
      if (CHUNKS[name].once && c.used.has(name)) continue;
      const w = CHUNKS[name].weight(c);
      if (w > 0) choices.push([name, w]);
    }
    if (!choices.length) break;
    const name = r.weighted(choices);
    const before = c.x;
    const entitiesBefore = level.entities.length;
    const consumed = CHUNKS[name].build(c);
    c.used.add(name);
    c.x = before + Math.max(1, consumed | 0);
    /*
     * A chunk that runs past the start of the run-in is not half-built, it is
     * built on top of where the flagpole is about to go. Undo it: floor the
     * whole span it touched and drop what it spawned. Filling only from the
     * budget line would leave the chunk's pit open with nothing on the far
     * side of it.
     */
    if (c.x > budget) {
      rawFill(before, c.groundY, level.w - 1, level.h - 1, c.floorTile);
      level.entities.length = entitiesBefore;
      level.warps = level.warps.filter((wp) => wp.col < before);
      c.x = before;
      break;
    }
  }
  if (c.x < budget) level.fill(c.x, c.groundY, budget, level.h - 1, T.GROUND);
  c.x = budget;

  /* ---- act three: the way out ---- */
  if (castle) buildBossEnding(c);
  else buildFlagEnding(c);

  /* ---- passes over the finished map ---- */
  if (roofed) addCeiling(c);
  if (def.lake) addLake(c);
  addHiddenBlocks(c);
  if (!roofed && !water) addScenery(c);
  if (water) addWaterDecor(c);
  if (level.warps.length) buildBonusRoom(c, def);
  guarantee(c);
  repair(c);

  return level;
}

/*
 * What a weighted draw can leave out.
 *
 * Picking chunks by weight means a level can legitimately roll twenty chunks
 * and never once roll the one that holds the mushroom, or a castle that never
 * rolls a firebar and is therefore a castle in colour only. These are the
 * three things a level is not allowed to be missing, patched in afterwards
 * rather than by rigging the draw — rigging it would distort every other
 * level to fix the rare one.
 */
function guarantee(c) {
  const { level } = c;

  /* One powerup, minimum. A level with none is a level you can only lose on. */
  if (c.powerups < 1) {
    const col = placeOnClearGround(c, (x) => level.at(x, c.groundY - 4) === T.EMPTY);
    if (col > 0) { level.set(col, c.groundY - 4, T.QUESTION_ITEM); c.powerups++; }
  }

  /* A castle needs at least two of its own hazards, or it is a brown level
     painted grey. */
  if (c.castle) {
    let hazards = level.entities.filter((e) => e.type === 'firebar' || e.type === 'podoboo').length;
    let guard = 0;
    while (hazards < 2 && guard++ < 12) {
      const col = placeOnClearGround(c, (x) => {
        for (let y = c.groundY - 6; y < c.groundY; y++) if (level.at(x, y) !== T.EMPTY) return false;
        return true;
      });
      if (col < 0) break;
      level.set(col, c.groundY - 1, T.SOLID);
      level.spawnPx('firebar', col * 16 + 8, (c.groundY - 1) * 16 + 8, {
        len: c.rng.int(4, 6),
        speed: (c.rng.chance(0.5) ? 1 : -1) * (0.02 + c.diff * 0.02),
      });
      hazards++;
    }
  }

  balancePopulation(c);
}

const POPULATION = new Set(['goomba', 'koopa', 'spiny', 'cheep', 'blooper', 'hammerbro']);

/*
 * How many things are walking around.
 *
 * A weighted draw over fifteen chunks has a wide tail: most levels land near
 * a dozen enemies, and then one lands on three and another on twenty-two.
 * Three is an empty level and twenty-two is a wall of bodies, and neither is
 * a level anybody designed — they are both just variance. So the count is
 * pushed back inside a band afterwards, which is cheaper and less distorting
 * than rigging every chunk's weight to narrow the distribution.
 *
 * The band widens with difficulty rather than sliding, because a late level
 * being *sparse and fast* is a legitimate kind of late level.
 */
function balancePopulation(c) {
  const { level } = c;
  const min = Math.round(level.w / 24 + c.diff * 6);
  const max = min + 9;
  const pop = () => level.entities.filter((e) => POPULATION.has(e.type));

  let have = pop();
  let guard = 0;
  while (have.length < min && guard++ < 40) {
    if (c.water) {
      const col = c.rng.int(INTRO + 8, Math.max(INTRO + 9, level.w - 30));
      level.spawn('cheep', col, c.rng.int(3, 10), {
        variant: c.rng.chance(0.5) ? 'red' : 'gray',
        speed: 0.4 + c.diff * 0.5,
        wave: c.rng.chance(0.5),
      });
    } else {
      /* Only onto plain floor with two tiles of headroom and nothing else
         standing there, so a filler enemy never appears inside a pipe or on
         top of the one before it. */
      const col = placeOnClearGround(c, (x) => {
        if (!level.hasHeadroom(x, c.groundY, 2)) return false;
        for (const e of level.entities) if (Math.abs(e.x - x * 16) < 40) return false;
        return true;
      });
      if (col < 0) break;
      const kind = c.rng.weighted([['goomba', 3], ['koopa', 2]]);
      level.spawn(kind, col, c.groundY - 1, kind === 'koopa'
        ? { variant: c.world >= 3 && c.rng.chance(0.3) ? 'red' : 'green' }
        : { variant: c.theme === 'underground' ? 'blue' : 'brown' });
    }
    have = pop();
  }

  if (have.length > max) {
    /* Thin from the crowded end: sort by position and drop every nth, so the
       level keeps its shape instead of losing its second half. */
    const sorted = have.slice().sort((a, b) => a.x - b.x);
    const drop = new Set();
    const step = sorted.length / (sorted.length - max);
    for (let i = 0; drop.size < sorted.length - max; i += step) {
      drop.add(sorted[Math.min(sorted.length - 1, Math.floor(i))]);
    }
    level.entities = level.entities.filter((e) => !drop.has(e));
  }
}

/* Finds a column of ordinary floor, past the opening and before the run-in,
   that satisfies `ok`. Returns -1 if the level has no room for one more
   thing, which is a legitimate answer on a level made of pits. */
function placeOnClearGround(c, ok) {
  const { level } = c;
  const last = level.goal ? Math.floor(level.goal.x / 16) - 12 : level.w - 40;
  for (let tries = 0; tries < 60; tries++) {
    const x = c.rng.int(INTRO + 6, Math.max(INTRO + 7, last));
    if (level.floorAt(x) !== c.groundY) continue;
    if (!ok(x)) continue;
    return x;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * Endings
 * ------------------------------------------------------------------ */

function buildFlagEnding(c) {
  const { level } = c;
  let x = c.x;
  level.fill(x, c.groundY, x + 5, level.h - 1, T.GROUND);
  x += 6;

  /* The staircase. Four steps of solid block, which is the shape everybody
     remembers even though it does nothing but look like an ending. */
  for (let i = 0; i < 4; i++) {
    level.fill(x + i, c.groundY - 1 - i, x + i, c.groundY - 1, T.SOLID);
    level.fill(x + i, c.groundY, x + i, level.h - 1, T.GROUND);
  }
  x += 4;
  level.fill(x, c.groundY, x + 2, level.h - 1, T.GROUND);
  x += 3;

  const poleCol = x;
  level.fill(poleCol - 1, c.groundY, level.w - 1, level.h - 1, T.GROUND);
  level.goal = putFlagpole(level, poleCol, c.groundY - 1, 9);
  level.goal.flagX = poleCol * 16;

  putCastle(level, poleCol + 8, c.groundY - 1);
  level.castleDoorX = (poleCol + 10) * 16;
  c.x = level.w;
}

function buildBossEnding(c) {
  const { level } = c;
  let x = c.x;
  level.fill(x, c.groundY, x + 4, level.h - 1, T.GROUND);
  x += 5;

  /* Lava, and a bridge over it that the axe takes away. */
  const bridgeW = 13;
  level.fill(x, level.h - 2, x + bridgeW - 1, level.h - 1, T.LAVA);
  for (let i = 0; i < bridgeW; i++) level.set(x + i, c.groundY, T.BRIDGE);
  level.bridge = { col: x, w: bridgeW, row: c.groundY };

  level.spawnPx('boss', (x + bridgeW - 4) * 16, (c.groundY - 2) * 16, {
    hp: 1 + Math.floor(c.diff * 4),
    floor: c.groundY * 16,
    range: 5 * 16,
  });
  x += bridgeW;

  level.fill(x, c.groundY, level.w - 1, level.h - 1, T.GROUND);
  const axeCol = x + 2;
  level.spawnPx('axe', axeCol * 16, (c.groundY - 1) * 16, {});
  level.goal = { type: 'axe', x: axeCol * 16, y: (c.groundY - 1) * 16 };
  c.x = level.w;
}

/* ------------------------------------------------------------------ *
 * Passes
 * ------------------------------------------------------------------ */

/*
 * The roof over underground and castle levels.
 *
 * Row 2, not row 1. The HUD is drawn over the top of the play area rather
 * than in a bar above it — the same trick the original uses, and the reason
 * the map is fifteen rows and not thirteen — and row 1 is exactly where the
 * score and the clock are. A ceiling there is a wall of bricks with MARIO
 * 000000 printed across it.
 */
const CEILING_ROW = 2;

function addCeiling(c) {
  const { level } = c;
  const tile = c.castle ? T.CASTLE_BRICK : T.BRICK;
  for (let x = 0; x < level.w; x++) {
    if (level.at(x, CEILING_ROW) === T.EMPTY) level.set(x, CEILING_ROW, tile);
  }
}

/* Water in the bottom of the pits instead of nothing under them. Changes what
   a missed jump costs — a soaking rather than a life — which is the whole
   point of the levels that use it. */
function addLake(c) {
  const { level } = c;
  const line = level.h - 4;
  level.waterLine = line;
  for (let x = 0; x < level.w; x++) {
    let open = true;
    for (let y = line; y < level.h; y++) {
      if (level.at(x, y) !== T.EMPTY) { open = false; break; }
    }
    if (!open) continue;
    level.set(x, line, T.WATER_TOP);
    for (let y = line + 1; y < level.h; y++) level.set(x, y, T.WATER);
  }
}

/*
 * Invisible blocks. One per level at most, always over ground the player will
 * walk anyway, never over a pit — a hidden block that appears mid-jump and
 * blocks the landing is the single most hated thing a platformer can do.
 */
function addHiddenBlocks(c) {
  const { level } = c;
  if (!c.rng.chance(0.55)) return;
  for (let tries = 0; tries < 30; tries++) {
    const x = c.rng.int(INTRO + 4, level.w - 50);
    const floorRow = level.floorAt(x);
    if (floorRow !== c.groundY) continue;
    const row = c.groundY - 4;
    if (level.at(x, row) !== T.EMPTY) continue;
    if (level.at(x - 1, row) !== T.EMPTY || level.at(x + 1, row) !== T.EMPTY) continue;
    level.set(x, row, c.rng.chance(0.3) ? T.HIDDEN_1UP : T.HIDDEN_COIN);
    return;
  }
}

function addScenery(c) {
  const { level } = c;
  const style = c.themeDef.scenery;
  if (style === 'none') return;

  for (let x = 2; x < level.w - 6; x += c.rng.int(6, 14)) {
    const roll = c.rng.next();
    const floorRow = level.floorAt(x);
    const base = floorRow < 0 ? c.groundY : floorRow;
    if (roll < 0.3) level.decor('hill', x, base, { big: c.rng.chance(0.4) });
    else if (roll < 0.5) level.decor('bush', x, base, { w: c.rng.int(1, 3) });
    else if (roll < 0.6 && style === 'forest') level.decor('tree', x, base, { big: c.rng.chance(0.5) });
    else if (roll < 0.6 && style === 'desert') level.decor('cactus', x, base, {});
    else if (roll < 0.6 && style === 'winter') level.decor('snowman', x, base, {});
    else if (roll < 0.72) level.decor('fence', x, base, { w: c.rng.int(2, 4) });
  }
  for (let x = 3; x < level.w - 4; x += c.rng.int(8, 18)) {
    level.decor('cloud', x, c.rng.int(1, 4), { w: c.rng.int(1, 3) });
  }
}

function addWaterDecor(c) {
  const { level } = c;
  for (let x = 3; x < level.w - 4; x += c.rng.int(7, 15)) {
    level.decor('weed', x, level.h - 2, { h: c.rng.int(1, 3) });
  }
}

/*
 * The bonus room behind a warp pipe: a short corridor of coins with a pipe
 * out of it. Built as a second Level so the main map does not have to carry a
 * disconnected island of tiles that the camera could wander into.
 */
function buildBonusRoom(c, def) {
  const { level } = c;
  const warp = level.warps[0];
  const room = new Level(28, LEVEL_H, 'underground');
  room.music = 'underground';
  room.fill(0, GROUND_Y, room.w - 1, room.h - 1, T.GROUND);
  for (let x = 0; x < room.w; x++) room.set(x, CEILING_ROW, T.BRICK);
  room.fill(0, CEILING_ROW, 0, GROUND_Y - 1, T.BRICK);
  room.fill(room.w - 1, CEILING_ROW, room.w - 1, GROUND_Y - 1, T.BRICK);

  const rows = c.rng.int(2, 3);
  for (let ry = 0; ry < rows; ry++) {
    for (let x = 4; x < room.w - 8; x += 2) {
      room.set(x, GROUND_Y - 3 - ry * 2, T.COIN);
    }
  }
  if (c.rng.chance(0.4)) room.set(6, GROUND_Y - 4, T.QUESTION_1UP);

  /* The way out: a horizontal pipe you walk into, which puts you back in the
     main room past the one you came down. */
  putPipeH(room, room.w - 5, GROUND_Y - 2, 4);
  room.warps.push({
    col: room.w - 5, row: GROUND_Y - 2, w: 1, h: 2, dir: 'right',
    to: { room: 0, entry: 'exit' },
  });
  room.start = { x: 3 * 16, y: (CEILING_ROW + 1) * 16 };
  room.exitFor0 = null;

  /* Where the main room puts the player back down. Four tiles past the pipe
     they went into, on solid ground the ending pass has already laid. */
  const backCol = Math.min(level.w - 6, warp.col + 5);
  warp.backTo = { x: backCol * 16, y: (c.groundY - 2) * 16 };
  room.warps[0].to.x = backCol * 16;
  room.warps[0].to.y = (c.groundY - 2) * 16;
  level.rooms[1] = room;
  room.id = level.id;
  room.name = level.name;
  room.time = level.time;
}

/*
 * Last pass: fix anything the composition of two chunks could have produced
 * that a single chunk could not.
 */
function repair(c) {
  const { level } = c;

  /* An enemy standing where the floor turned out to be a pit falls out of the
     level on frame one. Move it to the nearest solid ground or drop it. */
  level.entities = level.entities.filter((e) => {
    if (e.type === 'platform' || e.type === 'firebar' || e.type === 'boss'
      || e.type === 'lakitu' || e.type === 'cheep' || e.type === 'blooper'
      || e.type === 'podoboo' || e.type === 'axe' || e.type === 'piranha'
      || e.type === 'cannon' || e.type === 'spring') return true;
    const col = Math.floor(e.x / 16);
    const floorRow = level.floorAt(col, Math.floor(e.y / 16));
    return floorRow >= 0;
  });

  /* Nothing may sit inside a wall. */
  for (const e of level.entities) {
    if (e.type === 'piranha' || e.type === 'cannon' || e.type === 'firebar') continue;
    const col = Math.floor(e.x / 16);
    let row = Math.floor(e.y / 16);
    let guard = 0;
    while (row > 1 && guard++ < 16 && level.at(col, row) !== T.EMPTY) row--;
    e.y = row * 16;
  }

  /* The first screen must be empty of threats: the player has not had a frame
     to react yet. */
  const safeUntil = level.start.x + 96;
  level.entities = level.entities.filter((e) => e.x > safeUntil || e.type === 'platform');

  /* And the last: nothing hostile standing on the flagpole. */
  if (level.goal && level.goal.type === 'flag') {
    level.entities = level.entities.filter((e) => e.x < level.goal.x - 48);
  }
}
