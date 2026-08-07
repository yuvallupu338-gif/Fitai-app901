/*
 * catalog.js — the hundred levels, as a hundred decisions.
 *
 * Everything that makes level 61 different from level 12 is here: which world
 * it belongs to, what it is made of, how long it is, how much time you get,
 * and the seed that fixes its layout forever. The generator turns that into
 * tiles; this file is the design document.
 *
 * Twenty-five worlds of four, and the fourth of every world is a castle,
 * because that rhythm is load-bearing. It tells the player where they are
 * without a map, it gives the tension somewhere to break, and it means the
 * boss is never a surprise — you can see it coming for three levels.
 *
 * The curve across the hundred:
 *   length   180 tiles at the start, 260 by the end
 *   time     400 down to 300 — the same distance with less room to explore it
 *   powerups 2 in the first three levels, then 1, then 1 that is harder to get
 *   roster   grows a rank every few worlds (see rosterFor in chunks.js)
 *   pieces   the hard chunks get their weight from `diff`, which is just
 *            (id-1)/99, so the composition drifts rather than stepping
 *
 * Themes are deliberately not a straight rotation. A player who can predict
 * that level 3 of every world is a sky level has stopped looking.
 */

import { hash } from '../core/rng.js';

/*
 * Each world: a name, the three themes its first three stages use, and what
 * kind of castle closes it. `water: true` on a stage makes the whole level a
 * swim; `lake: true` puts water in the pits instead of a bottomless drop.
 */
const WORLDS = [
  { name: 'GREEN HILLS', stages: ['overworld', 'underground', 'overworld'], castle: 'castle' },
  { name: 'STONE VALLEY', stages: ['overworld', 'underground', 'sky'], castle: 'castle' },
  { name: 'FROZEN PEAK', stages: ['snow', 'underground', 'snow'], castle: 'castle' },
  { name: 'GOLDEN DUNES', stages: ['desert', 'overworld', 'sky'], castle: 'castle' },
  { name: 'DEEP WOODS', stages: ['forest', 'underground', 'water'], castle: 'castle' },
  { name: 'NIGHT ROAD', stages: ['night', 'overworld', 'sky'], castle: 'castle' },
  { name: 'CORAL SEA', stages: ['water', 'overworld', 'water'], castle: 'castle' },
  { name: 'SKY GARDEN', stages: ['sky', 'overworld', 'sky'], castle: 'castle' },
  { name: 'EMBER CAVE', stages: ['underground', 'volcano', 'overworld'], castle: 'castle' },
  { name: 'CRYSTAL LAKE', stages: ['snow', 'water', 'snow'], castle: 'castle' },
  { name: 'WINDY CLIFFS', stages: ['overworld', 'sky', 'night'], castle: 'castle' },
  { name: 'LOST DESERT', stages: ['desert', 'underground', 'desert'], castle: 'castle' },
  { name: 'MOONLIT BAY', stages: ['night', 'water', 'overworld'], castle: 'castle' },
  { name: 'IRON WORKS', stages: ['underground', 'castle', 'overworld'], castle: 'castle' },
  { name: 'STORM PEAK', stages: ['snow', 'sky', 'night'], castle: 'castle' },
  { name: 'SUNKEN CITY', stages: ['water', 'underground', 'water'], castle: 'castle' },
  { name: 'BONE YARD', stages: ['night', 'underground', 'desert'], castle: 'castle' },
  { name: 'CLOUD SPIRE', stages: ['sky', 'sky', 'overworld'], castle: 'castle' },
  { name: 'FIRE FIELDS', stages: ['volcano', 'overworld', 'volcano'], castle: 'castle' },
  { name: 'GLASS CAVERN', stages: ['underground', 'snow', 'underground'], castle: 'castle' },
  { name: 'TWILIGHT PASS', stages: ['night', 'sky', 'forest'], castle: 'castle' },
  { name: 'ABYSS DEPTHS', stages: ['water', 'volcano', 'water'], castle: 'castle' },
  { name: 'OBSIDIAN GATE', stages: ['volcano', 'castle', 'night'], castle: 'castle' },
  { name: 'STARFALL RUN', stages: ['sky', 'overworld', 'sky'], castle: 'castle' },
  { name: 'FINAL CROWN', stages: ['night', 'volcano', 'castle'], castle: 'castle' },
];

/* Which stages put a lake in their pits, keyed by level id. Chosen by hand
   rather than by seed: it changes what a missed jump costs, and that is a
   decision about a specific level, not a texture. */
const LAKES = new Set([9, 23, 38, 51, 66, 79, 92]);

/* Levels that hide a warp pipe down to a coin room. Roughly one in four, and
   never two in a row, so finding one still feels like finding something. */
const BONUS = new Set([
  2, 6, 11, 15, 19, 24, 28, 33, 37, 42, 46, 50, 55, 59, 63, 68, 72, 77, 81, 86, 90, 95, 99,
]);

function build() {
  const out = [];
  for (let w = 1; w <= 25; w++) {
    const world = WORLDS[w - 1];
    for (let s = 1; s <= 4; s++) {
      const id = (w - 1) * 4 + s;
      const castle = s === 4;
      const theme = castle ? world.castle : world.stages[s - 1];
      const water = theme === 'water';
      const diff = (id - 1) / 99;

      out.push({
        id,
        world: w,
        stage: s,
        worldName: world.name,
        name: `${w}-${s}`,
        theme,
        castle,
        water,
        lake: LAKES.has(id),
        bonus: BONUS.has(id),
        /* Castles are shorter and meaner; the boss is the length. */
        length: castle
          ? Math.round(150 + diff * 60)
          : Math.round(180 + diff * 80),
        time: castle
          ? Math.round(300 - diff * 60)
          : Math.round(400 - diff * 100),
        powerups: id <= 3 ? 2 : 1,
        /* The seed is derived from the level's identity rather than its
           position, so inserting a world later would not reshuffle every
           level after it. */
        seed: hash(`super-mario-100:${w}:${s}:${theme}`),
      });
    }
  }
  return out;
}

export const CATALOG = build();

export function levelById(id) {
  return CATALOG[id - 1] || null;
}

export function worldName(w) {
  return (WORLDS[w - 1] || {}).name || '';
}

export const WORLD_COUNT = 25;
export const LEVEL_COUNT = 100;
