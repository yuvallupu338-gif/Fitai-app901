/*
 * tiles.js — what each of the 16x16 pieces of the world does.
 *
 * The map is a byte per tile, so everything a tile knows has to be derivable
 * from its id: whether you stand on it, whether you can head it from below,
 * what falls out when you do, whether it hurts.
 *
 * Two distinctions carry most of the game's feel:
 *
 * SOLID vs SEMI-SOLID. A solid tile blocks from all four sides. A semi-solid
 * one only stops a body that is already falling and whose feet started above
 * it — mushroom platforms, tree tops, castle bridges. Being able to jump up
 * through a platform and land on it is a different game from having to walk
 * around, and getting the "feet started above it" part wrong is what makes a
 * player pop onto a platform they were trying to run under.
 *
 * BUMP. Every block that reacts to a head is one id, and what comes out is a
 * property of the id rather than of a separate object list. That is why a
 * level is a byte array and nothing else: the coins, the powerups and the
 * hidden 1-ups are all in the map.
 */

export const T = {
  EMPTY: 0,

  GROUND: 1,
  SOLID: 2,          // the hard block: never breaks, never bumps
  BRICK: 3,          // empty brick — breaks for a big player
  BRICK_COIN: 4,     // pays out coins until it is spent
  BRICK_ITEM: 5,     // holds a mushroom, or a flower if you are already big
  BRICK_STAR: 6,
  BRICK_1UP: 7,
  QUESTION: 8,       // one coin
  QUESTION_ITEM: 9,
  QUESTION_STAR: 10,
  QUESTION_1UP: 11,
  HIDDEN_COIN: 12,   // invisible until it is hit from below
  HIDDEN_1UP: 13,
  USED: 14,

  COIN: 15,          // free-standing, collected by touch

  PIPE_LIP_L: 16, PIPE_LIP_R: 17, PIPE_BODY_L: 18, PIPE_BODY_R: 19,
  PIPE_H_LIP_T: 20, PIPE_H_LIP_B: 21, PIPE_H_BODY_T: 22, PIPE_H_BODY_B: 23,

  PLATFORM: 24,      // semi-solid plank
  MUSH_TOP: 25,      // semi-solid mushroom cap
  MUSH_STEM: 26,     // decoration under the cap
  BRIDGE: 27,        // semi-solid, and the thing the axe drops
  TREE_TOP: 28,
  LOG: 29,
  CLOUD: 30,         // solid, for sky levels

  LAVA: 31,
  SPIKE: 32,
  WATER: 33,
  WATER_TOP: 34,
  VINE: 35,

  FLAGPOLE: 36, FLAG_BALL: 37,
  CASTLE_BRICK: 38, CASTLE_DOOR: 39, CASTLE_WINDOW: 40, CASTLE_TOP: 41,
};

const SOLID = new Set([
  T.GROUND, T.SOLID, T.BRICK, T.BRICK_COIN, T.BRICK_ITEM, T.BRICK_STAR, T.BRICK_1UP,
  T.QUESTION, T.QUESTION_ITEM, T.QUESTION_STAR, T.QUESTION_1UP, T.USED,
  T.PIPE_LIP_L, T.PIPE_LIP_R, T.PIPE_BODY_L, T.PIPE_BODY_R,
  T.PIPE_H_LIP_T, T.PIPE_H_LIP_B, T.PIPE_H_BODY_T, T.PIPE_H_BODY_B,
  T.CLOUD,
]);

/* The castle at the end of a level is scenery drawn in the tile layer, not
   architecture. It has to be non-solid or the scripted walk to its door ends
   with the player pressed against its outside wall. */

const SEMI = new Set([T.PLATFORM, T.MUSH_TOP, T.BRIDGE, T.TREE_TOP]);

/* Hit from below: id -> what happens. `becomes` is the id it turns into,
   `gives` is what pops out, `repeat` means it can pay out more than once. */
const BUMP = {
  [T.BRICK]: { gives: null, breakable: true },
  [T.BRICK_COIN]: { gives: 'coin', becomes: T.BRICK_COIN, repeat: true, spent: T.USED },
  [T.BRICK_ITEM]: { gives: 'powerup', becomes: T.USED },
  [T.BRICK_STAR]: { gives: 'star', becomes: T.USED },
  [T.BRICK_1UP]: { gives: 'oneup', becomes: T.USED },
  [T.QUESTION]: { gives: 'coin', becomes: T.USED },
  [T.QUESTION_ITEM]: { gives: 'powerup', becomes: T.USED },
  [T.QUESTION_STAR]: { gives: 'star', becomes: T.USED },
  [T.QUESTION_1UP]: { gives: 'oneup', becomes: T.USED },
  [T.HIDDEN_COIN]: { gives: 'coin', becomes: T.USED },
  [T.HIDDEN_1UP]: { gives: 'oneup', becomes: T.USED },
};

const HAZARD = new Set([T.LAVA, T.SPIKE]);
const LIQUID = new Set([T.WATER, T.WATER_TOP]);
/* Invisible blocks are not drawn and do not block a body moving sideways or
   downwards — only a head coming up from underneath finds them. */
const HIDDEN = new Set([T.HIDDEN_COIN, T.HIDDEN_1UP]);

export function isSolid(t) { return SOLID.has(t); }
export function isSemiSolid(t) { return SEMI.has(t); }
export function isHazard(t) { return HAZARD.has(t); }
export function isWater(t) { return LIQUID.has(t); }
export function isHidden(t) { return HIDDEN.has(t); }
export function isClimbable(t) { return t === T.VINE; }
export function bumpOf(t) { return BUMP[t] || null; }
export function isBumpable(t) { return !!BUMP[t]; }
export function isPipe(t) {
  return t >= T.PIPE_LIP_L && t <= T.PIPE_H_BODY_B;
}

/*
 * Which drawing a tile uses. Some ids animate — the question block runs a
 * four-step cycle and lava rolls — so the frame counter is a parameter rather
 * than state on the tile.
 */
const Q_CYCLE = ['qblock0', 'qblock1', 'qblock2', 'qblock1'];

export function tileArt(t, frame, theme) {
  switch (t) {
    case T.GROUND: return 'ground_' + (theme.ground || 'soil');
    case T.SOLID: return 'solid';
    case T.BRICK: case T.BRICK_COIN: case T.BRICK_ITEM:
    case T.BRICK_STAR: case T.BRICK_1UP:
      return theme.ground === 'stone' ? 'castle_brick' : 'brick';
    case T.QUESTION: case T.QUESTION_ITEM: case T.QUESTION_STAR: case T.QUESTION_1UP:
      return Q_CYCLE[(frame >> 3) & 3];
    case T.USED: return 'qblock_used';
    case T.COIN: return ['coin0', 'coin1', 'coin2', 'coin1'][(frame >> 3) & 3];
    case T.PIPE_LIP_L: return 'pipe_lip_l';
    case T.PIPE_LIP_R: return 'pipe_lip_r';
    case T.PIPE_BODY_L: return 'pipe_body_l';
    case T.PIPE_BODY_R: return 'pipe_body_r';
    case T.PIPE_H_LIP_T: return 'pipe_h_lip_t';
    case T.PIPE_H_LIP_B: return 'pipe_h_lip_b';
    case T.PIPE_H_BODY_T: return 'pipe_h_body_t';
    case T.PIPE_H_BODY_B: return 'pipe_h_body_b';
    case T.PLATFORM: return 'platform';
    case T.MUSH_TOP: return 'mushroom_top';
    case T.MUSH_STEM: return 'mushroom_stem';
    case T.BRIDGE: return 'bridge';
    case T.TREE_TOP: return 'tree_top';
    case T.LOG: return 'log';
    case T.CLOUD: return 'cloud_block';
    case T.LAVA: return (frame >> 3) & 1 ? 'lava1' : 'lava0';
    case T.SPIKE: return 'spike';
    case T.WATER_TOP: return (frame >> 3) & 1 ? 'water_top1' : 'water_top0';
    case T.WATER: return null;      // drawn as a flat wash, not a tile
    case T.VINE: return 'vine';
    case T.FLAGPOLE: return 'flagpole';
    case T.FLAG_BALL: return 'flag_ball';
    case T.CASTLE_BRICK: return 'castle_brick';
    case T.CASTLE_DOOR: return 'castle_door';
    case T.CASTLE_WINDOW: return 'castle_window';
    case T.CASTLE_TOP: return 'castle_top';
    default: return null;
  }
}
