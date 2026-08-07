/*
 * items.js — what comes out of blocks, and what is left over afterwards.
 *
 * The emergence is worth its own state. A mushroom does not appear on top of
 * a block, it grows out of it over about half a second, drawn behind the
 * block so it looks like it is being pushed up through it, and it is not
 * collectable until it is clear. Skipping that is the difference between a
 * powerup that feels like it came from somewhere and one that teleports.
 *
 * The effects at the bottom — brick shards, the coin that jumps out of a
 * block, the little score that floats up off a stomp — have no gameplay at
 * all. They are here because every one of them is feedback for an event the
 * player caused, and a game that reports nothing back feels broken even when
 * every number underneath it is right.
 */

import * as K from './constants.js';
import { moveX, moveY } from './physics.js';
import { CYCLE } from '../render/palettes.js';

const EMERGE_SPEED = 0.5;
const EMERGE_HEIGHT = 16;

class Item {
  constructor(world, x, y, opts) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vx = 0;
    this.vy = 0;
    this.opts = opts || {};
    this.remove = false;
    this.emerging = true;
    this.emerged = 0;
    this.anim = 0;
    this.isItem = true;
    this.active = true;
  }

  updateEmerge() {
    this.emerged += EMERGE_SPEED;
    this.y -= EMERGE_SPEED;
    if (this.emerged >= EMERGE_HEIGHT) {
      this.emerging = false;
      this.onEmerged();
    }
  }

  onEmerged() {}
  collect() { this.remove = true; }
  cull(camera) {
    if (this.y > K.SCREEN_H + 64) this.remove = true;
    if (this.x + this.w < camera.x - 64) this.remove = true;
  }
}

/* ------------------------------------------------------------------ *
 * Mushrooms — the one that walks
 * ------------------------------------------------------------------ */

export class Mushroom extends Item {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.oneUp = !!this.opts.oneUp;
    this.dir = 1;
  }

  onEmerged() { this.vx = K.ITEM_WALK * this.dir; }

  update(level) {
    if (this.emerging) return this.updateEmerge();
    this.vy = Math.min(K.ENEMY_MAX_FALL, this.vy + K.ITEM_GRAVITY);
    if (moveX(this, level, this.vx)) { this.dir = -this.dir; this.vx = -this.vx; }
    const hit = moveY(this, level, this.vy);
    if (hit.ground) this.vy = 0;
    this.onGround = hit.ground;
  }

  collect() {
    this.remove = true;
    if (this.oneUp) {
      this.world.addLife();
      this.world.popScore('1UP', this.x, this.y);
      this.world.sfx('oneUp');
    } else {
      this.world.player.powerUp('mushroom');
      this.world.addScore(K.SCORE.powerup, this.x, this.y);
    }
  }

  sprite() {
    return { name: 'mushroom', pal: this.oneUp ? 'oneUp' : 'mushroom' };
  }
}

/* ------------------------------------------------------------------ *
 * The flower — sits where it appeared and cycles colour
 * ------------------------------------------------------------------ */

export class Flower extends Item {
  update() {
    if (this.emerging) return this.updateEmerge();
    this.anim++;
  }

  collect() {
    this.remove = true;
    this.world.player.powerUp('flower');
    this.world.addScore(K.SCORE.powerup, this.x, this.y);
  }

  sprite() {
    return { name: 'flower', pal: CYCLE.flower[(this.anim >> 2) % CYCLE.flower.length] };
  }
}

/* ------------------------------------------------------------------ *
 * The star — bounces, and never stops
 * ------------------------------------------------------------------ */

export class Star extends Item {
  onEmerged() { this.vx = K.STAR_VX; this.vy = -2; }

  update(level) {
    if (this.emerging) return this.updateEmerge();
    this.anim++;
    this.vy = Math.min(K.ENEMY_MAX_FALL, this.vy + K.ITEM_GRAVITY);
    if (moveX(this, level, this.vx)) this.vx = -this.vx;
    const hit = moveY(this, level, this.vy);
    /* Bounces to a fixed height rather than decaying, which is what makes it
       so hard to catch and so worth catching. */
    if (hit.ground) this.vy = K.STAR_BOUNCE;
    if (hit.ceiling) this.vy = 0.5;
  }

  collect() {
    this.remove = true;
    this.world.player.powerUp('star');
    this.world.addScore(K.SCORE.star, this.x, this.y);
  }

  sprite() {
    return { name: 'star_item', pal: CYCLE.starItem[(this.anim >> 2) % CYCLE.starItem.length] };
  }
}

/* ------------------------------------------------------------------ *
 * The player's fireball
 * ------------------------------------------------------------------ */

export class Fireball {
  constructor(world, x, y, dir) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.w = 8;
    this.h = 8;
    this.vx = K.FIREBALL_VX * dir;
    this.vy = 2;
    this.remove = false;
    this.anim = 0;
    this.isFireball = true;
    this.bursting = 0;
    this.active = true;
  }

  update(level) {
    if (this.bursting > 0) {
      if (--this.bursting <= 0) this.remove = true;
      return;
    }
    this.anim++;
    this.vy = Math.min(6, this.vy + K.FIREBALL_GRAVITY);
    if (moveX(this, level, this.vx)) { this.burst(); return; }
    const hit = moveY(this, level, this.vy);
    /* Bounces off the floor at a fixed speed, so it skips along the ground
       instead of rolling to a stop — the reason fire reaches a Goomba four
       tiles away on flat ground. */
    if (hit.ground) this.vy = K.FIREBALL_BOUNCE;
    if (hit.ceiling) this.burst();
  }

  burst() {
    this.bursting = 12;
    this.vx = 0;
    this.vy = 0;
  }

  cull(camera) {
    if (this.x + this.w < camera.x - 16 || this.x > camera.x + K.SCREEN_W + 16) this.remove = true;
    if (this.y > K.SCREEN_H + 32) this.remove = true;
  }

  sprite() {
    if (this.bursting > 0) {
      return { name: this.bursting > 6 ? 'burst0' : 'burst1', pal: 'fireball', ox: -4, oy: -4 };
    }
    return { name: (this.anim >> 2) & 1 ? 'fireball1' : 'fireball0', pal: 'fireball' };
  }
}

/* ------------------------------------------------------------------ *
 * Effects. No collision, no state that matters, gone in under a second.
 * ------------------------------------------------------------------ */

export class Debris {
  constructor(world, x, y, vx, vy) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.w = 8;
    this.h = 8;
    this.vx = vx;
    this.vy = vy;
    this.remove = false;
    this.anim = 0;
    this.isEffect = true;
    this.isDebris = true;
  }

  update() {
    this.vy += 0.35;
    this.x += this.vx;
    this.y += this.vy;
    this.anim++;
    if (this.y > K.SCREEN_H + 32) this.remove = true;
  }

  cull() {}
}

/* The coin that jumps out of a block: straight up, spin, and gone. */
export class CoinPop {
  constructor(world, x, y) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vy = -5.5;
    this.t = 0;
    this.remove = false;
    this.isEffect = true;
    this.isCoinPop = true;
  }

  update() {
    this.t++;
    this.vy += 0.42;
    this.y += this.vy;
    if (this.t > 26) {
      this.remove = true;
      this.world.popScore(String(K.SCORE.coin), this.x, this.y);
    }
  }

  cull() {}
}

/* A number (or "1UP") drifting up and fading out. */
export class ScorePop {
  constructor(world, x, y, text) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.text = text;
    this.t = 0;
    this.remove = false;
    this.isEffect = true;
  }

  update() {
    this.t++;
    this.y -= 0.7;
    if (this.t > 44) this.remove = true;
  }

  cull() {}
}

export const ITEM_TYPES = { Mushroom, Flower, Star, Fireball, Debris, CoinPop, ScorePop };

/*
 * What a block gives up when it is hit. Split out here because the answer
 * depends on the player as much as the block: the same block is a mushroom
 * for a small player and a flower for a big one, which is what stops the
 * flower from being wasted on somebody who would still die to one Goomba.
 */
export function itemFromBlock(world, kind, col, row) {
  const x = col * 16;
  const y = row * 16;
  switch (kind) {
    case 'powerup':
      return world.player.power === 0
        ? new Mushroom(world, x, y, {})
        : new Flower(world, x, y, {});
    case 'star': return new Star(world, x, y, {});
    case 'oneup': return new Mushroom(world, x, y, { oneUp: true });
    default: return null;
  }
}
