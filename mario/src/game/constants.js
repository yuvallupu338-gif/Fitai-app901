/*
 * constants.js — the numbers that decide whether this feels like the real thing.
 *
 * Everything here is in pixels-per-frame at a fixed 60Hz step, because that is
 * the unit the 1985 game was written in. Its velocities live in an 8.8 fixed
 * point register: 0x1900 means 0x19 = 25 sixteenths of a pixel per frame, i.e.
 * 1.5625. Converting those to "pixels per second" and integrating with a
 * variable dt loses the exact arcs — a jump that clears a four-tile gap by two
 * pixels stops clearing it. So the loop runs a fixed 1/60 step (see core/loop.js)
 * and every number below is per-frame, straight out of the original units.
 *
 * The three-row jump table is the single most recognisable thing about the
 * movement: how high you go and how hard you come down both depend on how fast
 * you were already moving, and holding the button just swaps in a weaker
 * gravity until you let go or start falling. That is why a running jump feels
 * floaty and a standing jump feels like a hop.
 */

export const TILE = 16;
export const SCREEN_W = 256;
export const SCREEN_H = 240;
export const FPS = 60;
export const STEP = 1 / FPS;

/* ------------------------------------------------------------------ *
 * Ground movement
 * ------------------------------------------------------------------ */

export const WALK_MAX = 1.5625;       // 0x1900
export const RUN_MAX = 2.5625;        // 0x2900
export const WALK_ACCEL = 0.0369;     // 0x0098
export const RUN_ACCEL = 0.0556;      // 0x00E4
export const RELEASE_DECEL = 0.0508;  // 0x00D0  — letting go of the d-pad
export const SKID_DECEL = 0.1016;     // 0x01A0  — holding the other way
export const SKID_TURN = 0.5625;      // below this a skid flips to a walk
export const MIN_WALK = 0.2;          // a tap should move you, not creep

/* Airborne control. No friction: let go mid-jump and you keep your speed,
   which is what makes long jumps commitment rather than steering. */
export const AIR_ACCEL_SLOW = 0.0369;
export const AIR_ACCEL_FAST = 0.0556;

/* ------------------------------------------------------------------ *
 * Jumping. Picked by |vx| at the moment the jump starts, then frozen for
 * the whole arc — speeding up in mid air does not make you fall faster.
 * ------------------------------------------------------------------ */

export const JUMP_TABLE = [
  { speed: 1.0,     vy: -4.0, hold: 0.125,     fall: 0.4375 },
  { speed: 2.3125,  vy: -4.0, hold: 0.1171875, fall: 0.375  },
  { speed: Infinity, vy: -5.0, hold: 0.15625,  fall: 0.5625 },
];

export const MAX_FALL = 4.5;          // 0x4800
export const BOUNCE_VY = -3.0;        // bounce off a stomped enemy
export const BOUNCE_VY_HELD = -4.0;   // ...with the jump button held
export const SPRING_VY = -3.0;        // springboard, tapped
export const SPRING_VY_HELD = -7.0;   // springboard, held — clears anything

/* ------------------------------------------------------------------ *
 * Water. Gravity is a tenth of what it is on land and every stroke is a
 * small fixed impulse, so swimming is a rhythm rather than a jump.
 * ------------------------------------------------------------------ */

export const SWIM_GRAVITY = 0.0625;
export const SWIM_STROKE = -1.4;
/*
 * The stroke at the surface, which is a hop out of the water rather than a
 * weaker paddle.
 *
 * It only applies on levels with a waterline — a pond in the bottom of the
 * pits — because on a fully submerged level the surface is the top of the
 * map. Making it weaker than the underwater stroke, which is the obvious
 * reading of "near the surface", turns every pond into a trap: the swimmer
 * bobs at the waterline for ever, too high for the underwater stroke to be
 * applied and too low to reach the ledge. The point of putting water in a pit
 * is that falling in costs a swim instead of a life, and that only works if
 * you can get back out.
 */
export const SWIM_STROKE_SURFACE = -3.0;
export const SWIM_SURFACE_BAND = 12;       // px below the line that counts
export const SWIM_MAX_FALL = 2.0;
export const SWIM_MAX_RISE = -2.0;
export const SWIM_ACCEL = 0.03;
export const SWIM_MAX = 1.4;
export const SWIM_DECEL = 0.014;

/* ------------------------------------------------------------------ *
 * Bodies
 * ------------------------------------------------------------------ */

export const BODY_SMALL = { w: 12, h: 16 };
export const BODY_BIG = { w: 12, h: 31 };   // 31 not 32: two tiles of headroom
                                            // must actually be enough headroom
export const BODY_CROUCH = { w: 12, h: 16 };

/* ------------------------------------------------------------------ *
 * Enemies
 * ------------------------------------------------------------------ */

export const ENEMY_WALK = 0.5;
export const ENEMY_GRAVITY = 0.3;
export const ENEMY_MAX_FALL = 4.0;
export const SHELL_SPEED = 4.0;
export const SHELL_WAKE = 300;        // frames a kicked-back shell stays still
export const ITEM_WALK = 0.75;
export const ITEM_GRAVITY = 0.3;
export const STAR_VX = 1.0;
export const STAR_BOUNCE = -3.5;
export const FIREBALL_VX = 3.0;
export const FIREBALL_GRAVITY = 0.35;
export const FIREBALL_BOUNCE = -2.5;
export const MAX_FIREBALLS = 2;       // two on screen, exactly like the original

/* ------------------------------------------------------------------ *
 * Rules of the run
 * ------------------------------------------------------------------ */

export const STAR_FRAMES = 660;       // ~11 seconds of invincibility
export const HURT_FRAMES = 120;       // mercy flicker after shrinking
export const TIMER_TICK = 24;         // frames per unit of the level clock
export const TIME_BONUS = 50;         // score per leftover unit at the flag
export const COINS_PER_LIFE = 100;
export const START_LIVES = 3;
export const DEATH_PLANE = SCREEN_H + 16;

/* Stomp chain: each enemy killed without touching the ground is worth more,
   and the eleventh in a row is a life. Kicked shells run the same ladder. */
export const STOMP_CHAIN = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];

export const SCORE = {
  coin: 200,
  powerup: 1000,
  star: 1000,
  oneUp: 0,          // the life is the reward
  fireballKill: 200,
  shellKill: 500,
  bricks: 50,
  boss: 5000,
  flagpole: [100, 400, 800, 2000, 5000],   // by how high you grabbed it
};
