#!/usr/bin/env node
/*
 * mario-validate.mjs — checks the parts of mario/ that can be checked without
 * a browser, which turns out to be most of the parts that break.
 *
 *   1. Art. Every frame is a grid of strings; a single mistyped row is a
 *      column of pixels shifted sideways for the life of the sprite, and it
 *      is invisible in a diff. So: row count equals h, every row is exactly
 *      w characters, and every character appears in the palette the art
 *      declares (an unknown letter draws as a hole).
 *   2. Levels. All hundred are generated and walked: no gap is wider than a
 *      running jump clears, no step is taller than one, nothing spawns inside
 *      a wall, and the player does not start on top of an enemy.
 *   3. Every level is *proved finishable* — a breadth-first search over the
 *      states the real physics can reach, from the spawn to the flag. See
 *      mario-reach.mjs. This is the check that matters: a hundred levels is a
 *      hundred chances to ship one that cannot be finished, and no amount of
 *      playing them by hand would find the one that cannot.
 *   4. The catalogue itself — a hundred entries, numbered 1..100, each with
 *      a theme that exists and a time limit that can actually be met.
 *
 * Usage: node tools/mario-validate.mjs [--verbose] [--quick]
 * `--quick` skips the reachability proof, which is most of the runtime.
 * Exits non-zero on any error.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { proveReachable } from './mario-reach.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const QUICK = process.argv.includes('--quick');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

async function load(rel) {
  try {
    return await import(pathToFileURL(resolve(ROOT, rel)).href);
  } catch (e) {
    err(`${rel}: import failed — ${e.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 1. Art
 * ------------------------------------------------------------------ */

async function checkArt() {
  const [player, enemies, items, tiles, pal] = await Promise.all([
    load('mario/src/render/art.player.js'),
    load('mario/src/render/art.enemies.js'),
    load('mario/src/render/art.items.js'),
    load('mario/src/render/art.tiles.js'),
    load('mario/src/render/palettes.js'),
  ]);
  if (!player || !enemies || !items || !tiles || !pal) return;

  const sets = [
    ['player', player.ALL_PLAYER_ART, 'sprite'],
    ['enemies', enemies.ENEMY_ART, 'sprite'],
    ['items', items.ITEM_ART, 'sprite'],
    ['tiles', tiles.TILE_ART, 'theme'],
  ];

  const themeSlots = new Set(['a', 'b', 'c', 'd', 'e', '.']);
  let frames = 0;
  let pixels = 0;

  for (const [setName, set, kind] of sets) {
    for (const [name, art] of Object.entries(set)) {
      frames++;
      const where = `${setName}/${name}`;
      if (!Array.isArray(art.rows)) { err(`${where}: no rows`); continue; }
      if (!art.w || !art.h) { err(`${where}: missing w/h`); continue; }
      if (art.rows.length !== art.h) {
        err(`${where}: declares h=${art.h} but has ${art.rows.length} rows`);
      }
      const legal = kind === 'theme'
        ? themeSlots
        : new Set([...Object.keys(pal.SPRITE_PAL[art.pal] || {}), '.']);
      if (kind === 'sprite' && !pal.SPRITE_PAL[art.pal]) {
        err(`${where}: palette "${art.pal}" is not in SPRITE_PAL`);
      }
      art.rows.forEach((row, i) => {
        if (typeof row !== 'string') { err(`${where} row ${i}: not a string`); return; }
        if (row.length !== art.w) {
          err(`${where} row ${i}: ${row.length} chars, expected ${art.w} — "${row}"`);
        }
        for (const ch of row) {
          if (ch === '.' || ch === ' ') continue;
          pixels++;
          if (!legal.has(ch)) {
            err(`${where} row ${i}: character "${ch}" has no colour in palette "${art.pal || 'theme'}"`);
            return;
          }
        }
      });
    }
  }

  /* Every theme must define all five slots, or a tile silently loses part of
     itself on that world only — the kind of bug that shows up at level 61. */
  for (const [name, t] of Object.entries(pal.THEMES)) {
    for (const slot of ['a', 'b', 'c', 'd', 'e', 'bg', 'ground']) {
      if (!t[slot]) err(`theme ${name}: missing "${slot}"`);
    }
    if (!/^(soil|stone|sand|snow|coral)$/.test(t.ground)) {
      err(`theme ${name}: ground family "${t.ground}" has no drawing`);
    }
  }

  if (VERBOSE) console.log(`  art: ${frames} frames, ${pixels} lit pixels`);
}

/* ------------------------------------------------------------------ *
 * 2 + 3. Levels and the catalogue
 * ------------------------------------------------------------------ */

async function checkLevels() {
  const [catalog, gen, tilesMod, levelMod] = await Promise.all([
    load('mario/src/levels/catalog.js'),
    load('mario/src/levels/generator.js'),
    load('mario/src/game/tiles.js'),
    load('mario/src/game/level.js'),
  ]);
  if (!catalog || !gen || !tilesMod || !levelMod) return;

  const { CATALOG } = catalog;
  const { buildLevel } = gen;
  const { isSolid, isSemiSolid, isHazard, T } = tilesMod;
  const { CEILING_ROWS } = levelMod;

  if (CATALOG.length !== 100) err(`catalogue has ${CATALOG.length} levels, expected 100`);

  const seenIds = new Set();
  for (const def of CATALOG) {
    if (seenIds.has(def.id)) err(`level ${def.id}: duplicate id`);
    seenIds.add(def.id);
    if (def.id < 1 || def.id > 100) err(`level ${def.id}: id out of range`);
    if (!def.name) err(`level ${def.id}: no name`);
  }
  for (let i = 1; i <= 100; i++) if (!seenIds.has(i)) err(`catalogue is missing level ${i}`);

  let widest = 0;
  let totalCoins = 0;
  let totalEnemies = 0;
  let proved = 0;

  for (const def of CATALOG) {
    let level;
    try {
      level = buildLevel(def);
    } catch (e) {
      err(`level ${def.id} (${def.name}): build threw — ${e.message}`);
      continue;
    }
    const where = `level ${def.id} (${def.name})`;

    if (level.w < 100) err(`${where}: only ${level.w} tiles wide`);
    widest = Math.max(widest, level.w);

    /* Determinism: the same seed must give the same level, or a best time
       means nothing. */
    const again = buildLevel(def);
    if (again.tiles.length !== level.tiles.length) {
      err(`${where}: not deterministic (different size on rebuild)`);
    } else {
      for (let i = 0; i < level.tiles.length; i++) {
        if (level.tiles[i] !== again.tiles[i]) {
          err(`${where}: not deterministic (tile ${i} differs on rebuild)`);
          break;
        }
      }
      if (again.entities.length !== level.entities.length) {
        err(`${where}: not deterministic (entity count differs on rebuild)`);
      }
    }

    /* The start must be standing room, not a wall and not a pit. */
    const sx = Math.floor(level.start.x / 16);
    const sy = Math.floor(level.start.y / 16);
    if (isSolid(level.at(sx, sy))) err(`${where}: starts inside a solid tile`);
    let floor = -1;
    for (let y = sy; y < level.h; y++) {
      if (isSolid(level.at(sx, y)) || isSemiSolid(level.at(sx, y))) { floor = y; break; }
    }
    if (floor < 0) err(`${where}: starts over a bottomless pit`);
    if (floor >= 0 && isHazard(level.at(sx, floor))) err(`${where}: starts on a hazard`);

    /* The goal must exist and be at the far end. */
    if (!level.goal) err(`${where}: no goal`);
    else if (level.goal.x < (level.w - 40) * 16) {
      warn(`${where}: goal is ${Math.round(level.w - level.goal.x / 16)} tiles from the end`);
    }

    /* Nothing may spawn buried. A Goomba inside a wall walks out of the
       level and the player never sees it; worse, a shell inside a wall
       becomes unkillable. */
    for (const e of level.entities) {
      const ex = Math.floor(e.x / 16);
      const ey = Math.floor(e.y / 16);
      if (ex < 0 || ex >= level.w || ey < 0 || ey >= level.h) {
        err(`${where}: ${e.type} spawns outside the map at ${ex},${ey}`);
      } else if (isSolid(level.at(ex, ey)) && e.type !== 'piranha' && e.type !== 'firebar' && e.type !== 'cannon') {
        err(`${where}: ${e.type} spawns inside a solid tile at ${ex},${ey}`);
      }
      if (e.type === 'goomba' || e.type === 'koopa') totalEnemies++;
    }

    /* Nothing hostile within four tiles of the spawn: the first thing on
       screen must never be an unavoidable hit. */
    for (const e of level.entities) {
      if (e.type === 'coin' || e.type === 'platform' || e.type === 'spring') continue;
      if (Math.abs(e.x - level.start.x) < 64 && Math.abs(e.y - level.start.y) < 64) {
        err(`${where}: ${e.type} spawns on top of the player`);
      }
    }

    /* Gaps. A running jump covers about five tiles; anything wider is a
       guaranteed death rather than a challenge. Measured on the floor row
       the player actually walks on, with moving lifts counted as floor —
       they declare the span they ferry the player across. */
    const gaps = measureGaps(level, isSolid, isSemiSolid, CEILING_ROWS);
    for (const g of gaps) {
      if (g.width <= 5) continue;
      if (spanned(level, g)) continue;
      err(`${where}: ${g.width}-tile gap at x=${g.x} cannot be jumped`);
    }

    /* Steps up. A standing jump clears four tiles and a running one five, so
       a five-tile wall with no run-up is a level that ends there. */
    let prevFloor = -1;
    for (let x = 0; x < level.w; x++) {
      const f = groundSurface(level, x, isSolid, isSemiSolid, CEILING_ROWS);
      if (f >= 0 && prevFloor >= 0 && prevFloor - f > 4) {
        err(`${where}: ${prevFloor - f}-tile step up at x=${x}`);
      }
      if (f >= 0) prevFloor = f;
    }

    for (let i = 0; i < level.tiles.length; i++) {
      if (level.tiles[i] === T.COIN) totalCoins++;
    }

    /* The proof. Runs both sizes, because the big body is wider and taller
       and a corridor a small player fits through is not necessarily one a big
       player fits through — and the game hands you a mushroom on every level,
       so both are states you can arrive in. */
    if (!QUICK) {
      for (const big of [false, true]) {
        const proof = proveReachable(level, { big });
        if (!proof.ok) {
          err(`${where}: ${big ? 'big' : 'small'} player cannot finish it — `
            + `${proof.why}, furthest column ${proof.reached} of ${level.w}`);
          break;
        }
        proved++;
      }
    }

    if (def.time < 200) warn(`${where}: only ${def.time} on the clock`);
    if (level.w > 16 * def.time / 3) {
      warn(`${where}: ${level.w} tiles in ${def.time} units may be too tight`);
    }
  }

  if (VERBOSE) {
    console.log(`  levels: 100 built, widest ${widest} tiles, ${totalCoins} coins, ${totalEnemies} walkers`);
    if (!QUICK) console.log(`  reachability: ${proved} of 200 runs proved (both body sizes)`);
  }
}

/* A gap is crossable if a lift covers it end to end. Lifts record the span
   they serve in tiles at generation time rather than being simulated here. */
function spanned(level, gap) {
  const from = gap.x - 1;
  const to = gap.x + gap.width;
  for (const e of level.entities) {
    if (e.type !== 'platform' || !e.covers) continue;
    if (e.covers[0] <= from + 1 && e.covers[1] >= to - 1) return true;
  }
  /* Several falling platforms in a row cover a pit between them. */
  const steps = level.entities
    .filter((e) => e.type === 'platform' && e.covers)
    .map((e) => e.covers)
    .sort((a, b) => a[0] - b[0]);
  let reach = from;
  for (const s of steps) {
    if (s[0] > reach + 4) break;
    reach = Math.max(reach, s[1]);
  }
  return reach >= to - 4;
}

/*
 * The floor of a column: the top of the stack that rises from the bottom of
 * the map, not the topmost surface in it.
 *
 * The difference is the whole check. Scanning downwards finds the first thing
 * it meets, which on a level with a brick ceiling is the ceiling, and every
 * column then reads as an eight-tile step. Scanning up from the floor finds
 * what the player is actually walking on and steps over the overhead
 * furniture — the coin shelves, the hanging blocks, the springboard's prize
 * ledge — none of which anybody walks along.
 */
function groundSurface(level, x, isSolid, isSemiSolid, CEILING_ROWS) {
  let found = -1;
  for (let y = level.h - 1; y >= CEILING_ROWS; y--) {
    const t = level.at(x, y);
    const standable = isSolid(t) || isSemiSolid(t);
    if (standable) found = y;
    else if (found >= 0) break;     // reached the air above the floor stack
  }
  return found;
}



/* Walks the bottom of the map looking for columns with no floor at all, and
   groups the consecutive ones into gaps. Only columns whose whole height is
   empty count — a pit with a platform over it is not a gap. */
function measureGaps(level, isSolid, isSemiSolid, CEILING_ROWS) {
  const gaps = [];
  let run = 0;
  for (let x = 0; x < level.w; x++) {
    let hasFloor = false;
    for (let y = CEILING_ROWS; y < level.h; y++) {
      const t = level.at(x, y);
      if (isSolid(t) || isSemiSolid(t)) { hasFloor = true; break; }
    }
    if (hasFloor) {
      if (run > 0) { gaps.push({ x: x - run, width: run }); run = 0; }
    } else {
      run++;
    }
  }
  if (run > 0) gaps.push({ x: level.w - run, width: run });
  return gaps;
}

/* ------------------------------------------------------------------ */

async function main() {
  await checkArt();
  await checkLevels();

  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

main();
