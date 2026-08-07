/*
 * player.js — the character, and the sixty or so decisions that make him feel
 * like the one everybody already knows how to control.
 *
 * The ones that matter most, in the order a player notices them missing:
 *
 * Momentum. Acceleration and friction are separate numbers, and letting go of
 * the d-pad decelerates more gently than holding the other way. That gap is
 * the skid, and the skid is why running feels like it has weight.
 *
 * Variable jump height. The jump's initial velocity and its gravity are both
 * chosen from a table indexed by how fast you were moving when you left the
 * ground, and then a *weaker* gravity applies for as long as the button is
 * held and you are still rising. Release early and you drop into the heavier
 * one mid-arc. Tapping gives a hop; holding at full run gives the long arc
 * that clears a four-tile pit.
 *
 * Air control without air friction. You can steer in mid-air, but nothing
 * slows you down up there, so a jump is a commitment.
 *
 * The bounce. Landing on an enemy sets your vertical speed rather than adding
 * to it, and sets it higher if the jump button is held, which is what makes a
 * chain of stomps possible at all.
 *
 * Everything scripted — dying, growing, going down a pipe, sliding down the
 * flagpole — runs through the same body, with input ignored. That keeps one
 * set of collision rules rather than a second, subtly different set for
 * cutscenes.
 */

import * as K from './constants.js';
import { moveX, moveY, forEachOverlappedTile } from './physics.js';
import { T, isSolid, isClimbable } from './tiles.js';

export const SMALL = 0;
export const BIG = 1;
export const FIRE = 2;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.w = K.BODY_SMALL.w;
    this.h = K.BODY_SMALL.h;
    this.power = SMALL;
    this.facing = 1;
    this.onGround = false;
    this.crouching = false;
    this.jumpHeld = false;
    this.jumping = false;
    this.gravityHold = K.JUMP_TABLE[0].hold;
    this.gravityFall = K.JUMP_TABLE[0].fall;
    this.state = 'play';        // play | dying | grow | shrink | pipe | flag | walk | done
    this.timer = 0;
    this.starTimer = 0;
    this.hurtTimer = 0;
    this.animTimer = 0;
    this.frame = 0;
    this.swimStroke = 0;
    this.underwater = false;
    this.stompChain = 0;
    this.script = null;
    this.dead = false;
    this.climbing = false;
  }

  get big() { return this.power !== SMALL; }
  get invincible() { return this.starTimer > 0; }
  get intangible() { return this.hurtTimer > 0 || this.state !== 'play'; }
  get centreX() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }

  reset(x, y, power) {
    this.power = power === undefined ? SMALL : power;
    this.applyBody();
    this.x = x;
    this.y = y - this.h;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.state = 'play';
    this.timer = 0;
    this.starTimer = 0;
    this.hurtTimer = 0;
    this.stompChain = 0;
    this.dead = false;
    this.crouching = false;
    this.climbing = false;
    this.script = null;
  }

  /* The hitbox follows the power-up, and the feet stay where they were: a
     player who grows while standing on a ledge must not be pushed into the
     floor and squeezed out sideways. */
  applyBody() {
    const bottom = this.y + this.h;
    const body = this.power === SMALL
      ? K.BODY_SMALL
      : (this.crouching ? K.BODY_CROUCH : K.BODY_BIG);
    this.w = body.w;
    this.h = body.h;
    this.y = bottom - this.h;
  }

  /* ---------------------------------------------------------------- *
   * The frame
   * ---------------------------------------------------------------- */

  update(input, level, frame) {
    this.underwater = this.world.isUnderwater(this.x + this.w / 2, this.y + this.h / 2);

    switch (this.state) {
      case 'dying': return this.updateDying();
      case 'grow': case 'shrink': return this.updateTransform();
      case 'pipe': return this.updatePipe();
      case 'flag': return this.updateFlag(level);
      case 'walk': return this.updateWalk(level);
      case 'done': return;
      default: break;
    }

    if (this.starTimer > 0) this.starTimer--;
    if (this.hurtTimer > 0) this.hurtTimer--;

    if (this.climbing) return this.updateClimb(input, level);

    const left = input.held('left');
    const right = input.held('right');
    const run = input.held('b');
    const down = input.held('down');

    /* Crouching. Small players do not crouch — they duck-slide, which the
       original also does not have, so down does nothing for them. */
    const wantCrouch = this.big && down && this.onGround;
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch && !this.canStand(level)) {
        /* Under a ceiling: stay down rather than being shoved through it. */
      } else {
        this.crouching = wantCrouch;
        this.applyBody();
      }
    }

    if (this.underwater) this.swim(input, left, right);
    else this.walk(left, right, run);

    this.jump(input, level);
    this.applyGravity(input);

    /* --- move --- */
    moveX(this, level, this.vx);
    if (this.x < this.world.camera.x) { this.x = this.world.camera.x; this.vx = 0; }
    if (this.x + this.w > level.w * K.TILE) { this.x = level.w * K.TILE - this.w; this.vx = 0; }

    const wallHit = this.checkWall(level);
    if (wallHit) this.vx = 0;

    const before = this.vy;
    const hit = moveY(this, level, this.vy);
    this.onGround = hit.ground;
    if (hit.ground) {
      this.jumping = false;
      this.stompChain = 0;
      if (before > 0) this.vy = 0;
    }
    if (hit.bumped && before < 0) {
      this.world.bumpBlock(hit.bumped.col, hit.bumped.row, this);
      this.vy = 0;
    }

    this.touchTiles(level);
    this.animate();

    if (this.y > K.DEATH_PLANE) this.die(true);
  }

  /* moveX resolves against solids; this catches the case where the body ends
     the frame overlapping one anyway, which happens when a block grows into
     the player (a bumped brick, a rising platform). */
  checkWall(level) {
    const row0 = Math.floor(this.y / K.TILE);
    const row1 = Math.floor((this.y + this.h - 1) / K.TILE);
    const colL = Math.floor(this.x / K.TILE);
    const colR = Math.floor((this.x + this.w - 1) / K.TILE);
    for (let row = row0; row <= row1; row++) {
      if (isSolid(level.at(colL, row)) && this.vx < 0) { this.x = (colL + 1) * K.TILE; return true; }
      if (isSolid(level.at(colR, row)) && this.vx > 0) { this.x = colR * K.TILE - this.w; return true; }
    }
    return false;
  }

  canStand(level) {
    const test = { x: this.x, y: this.y + this.h - K.BODY_BIG.h, w: this.w, h: K.BODY_BIG.h };
    const row = Math.floor(test.y / K.TILE);
    const colL = Math.floor(test.x / K.TILE);
    const colR = Math.floor((test.x + test.w - 1) / K.TILE);
    for (let col = colL; col <= colR; col++) if (isSolid(level.at(col, row))) return false;
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Ground movement
   * ---------------------------------------------------------------- */

  walk(left, right, run) {
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const max = run ? K.RUN_MAX : K.WALK_MAX;
    const accel = this.onGround
      ? (run ? K.RUN_ACCEL : K.WALK_ACCEL)
      : (Math.abs(this.vx) >= K.WALK_MAX ? K.AIR_ACCEL_FAST : K.AIR_ACCEL_SLOW);

    if (this.crouching && this.onGround) {
      /* Crouching kills acceleration but keeps momentum, so a crouch at speed
         is a slide rather than a stop. */
      this.vx = approach(this.vx, 0, K.RELEASE_DECEL);
      return;
    }

    if (dir !== 0) {
      this.facing = dir;
      const sameWay = Math.sign(this.vx) === dir || this.vx === 0;
      if (sameWay) {
        const next = this.vx + accel * dir;
        if (Math.abs(next) <= max) {
          this.vx = next;
        } else if (Math.abs(this.vx) <= max) {
          this.vx = max * dir;                   // hold at the cap
        } else {
          /* Above the cap, which only happens by letting go of run while at
             full speed. It does not brake you to walking pace instantly; it
             stops you accelerating and lets friction take it down. */
          this.vx = approach(this.vx, max * dir, K.RELEASE_DECEL);
        }
        if (Math.abs(this.vx) < K.MIN_WALK) this.vx = K.MIN_WALK * dir;
      } else if (this.onGround) {
        this.vx += K.SKID_DECEL * dir;             // the skid
        if (Math.abs(this.vx) < K.SKID_TURN) this.vx = K.MIN_WALK * dir;
      } else {
        this.vx += accel * dir;
      }
    } else if (this.onGround) {
      this.vx = approach(this.vx, 0, K.RELEASE_DECEL);
    }
    /* No air friction: with no direction held in mid-air, speed is kept. */
  }

  swim(input, left, right) {
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir;
      this.vx += K.SWIM_ACCEL * dir;
      this.vx = clamp(this.vx, -K.SWIM_MAX, K.SWIM_MAX);
    } else {
      this.vx = approach(this.vx, 0, K.SWIM_DECEL);
    }
  }

  /* ---------------------------------------------------------------- *
   * Jumping
   * ---------------------------------------------------------------- */

  jump(input, level) {
    const pressed = input.pressed('a');
    this.jumpHeld = input.held('a');

    if (this.underwater) {
      /* Swimming is one stroke per press, and near the surface the stroke is
         weaker so you bob rather than launch out of the water. */
      if (pressed) {
        const surface = this.world.surfaceY(this.x + this.w / 2);
        const centre = this.y + this.h / 2;
        const atSurface = surface !== null && centre < surface + K.SWIM_SURFACE_BAND;
        this.vy = atSurface ? K.SWIM_STROKE_SURFACE : K.SWIM_STROKE;
        this.swimStroke = 16;
        this.world.sfx('swim');
      }
      if (this.swimStroke > 0) this.swimStroke--;
      return;
    }

    if (pressed && this.onGround) {
      const speed = Math.abs(this.vx);
      const row = K.JUMP_TABLE.find((e) => speed < e.speed) || K.JUMP_TABLE[2];
      this.vy = row.vy;
      this.gravityHold = row.hold;
      this.gravityFall = row.fall;
      this.jumping = true;
      this.onGround = false;
      this.world.sfx(this.big ? 'jumpBig' : 'jump');
    }
  }

  applyGravity(input) {
    if (this.underwater) {
      this.vy += K.SWIM_GRAVITY;
      this.vy = clamp(this.vy, K.SWIM_MAX_RISE, K.SWIM_MAX_FALL);
      /* A swimmer cannot leave the top of the screen. On land, jumping off
         the top is fine and occasionally the point; in water there is no
         gravity worth the name to bring you back, so without this a held
         stroke walks the player up out of the level for good. */
      if (this.y < 0) { this.y = 0; if (this.vy < 0) this.vy = 0; }
      return;
    }
    /* The weaker gravity applies only while rising with the button down. The
       moment either stops being true, the arc switches to the heavy one and
       stays there for the rest of the jump. */
    const holding = this.jumping && this.jumpHeld && this.vy < 0;
    this.vy += holding ? this.gravityHold : this.gravityFall;
    if (this.vy > K.MAX_FALL) this.vy = K.MAX_FALL;
  }

  /* ---------------------------------------------------------------- *
   * Touching things
   * ---------------------------------------------------------------- */

  touchTiles(level) {
    const world = this.world;
    forEachOverlappedTile(this, level, (t, col, row) => {
      if (t === T.COIN) {
        level.set(col, row, T.EMPTY);
        world.collectCoin();
      } else if (t === T.LAVA || t === T.SPIKE) {
        this.die(false);
      }
    });

    /* Vines are grabbed rather than collided with. */
    const cx = Math.floor((this.x + this.w / 2) / K.TILE);
    const cy = Math.floor((this.y + this.h / 2) / K.TILE);
    if (isClimbable(level.at(cx, cy)) && this.world.input.held('up')) {
      this.climbing = true;
      this.x = cx * K.TILE + (K.TILE - this.w) / 2;
      this.vx = 0;
      this.vy = 0;
    }
  }

  updateClimb(input, level) {
    const cx = Math.floor((this.x + this.w / 2) / K.TILE);
    const up = input.held('up');
    const down = input.held('down');
    this.vy = up ? -1 : down ? 1 : 0;
    this.y += this.vy;
    if (this.vy !== 0) this.animTimer++;
    const midRow = Math.floor((this.y + this.h / 2) / K.TILE);
    if (!isClimbable(level.at(cx, midRow)) || input.pressed('a')) {
      this.climbing = false;
      if (input.pressed('a')) { this.vy = -3; this.jumping = true; }
    }
  }

  /* ---------------------------------------------------------------- *
   * Damage, power, death
   * ---------------------------------------------------------------- */

  powerUp(kind) {
    if (kind === 'star') {
      this.starTimer = K.STAR_FRAMES;
      this.world.startStarMusic();
      return;
    }
    if (kind === 'flower' && this.power !== SMALL) {
      this.power = FIRE;
      this.state = 'grow';
      this.timer = 40;
      this.world.sfx('powerup');
      return;
    }
    if (this.power === SMALL) {
      this.power = BIG;
      this.state = 'grow';
      this.timer = 40;
      this.applyBody();
      this.world.sfx('powerup');
    } else {
      /* Already big and it was only a mushroom: worth points, not a shape. */
      this.world.addScore(K.SCORE.powerup, this.x, this.y);
      this.world.sfx('powerup');
    }
  }

  hurt() {
    if (this.intangible || this.invincible) return;
    if (this.power === SMALL) { this.die(false); return; }
    this.power = SMALL;
    this.crouching = false;
    this.state = 'shrink';
    this.timer = 40;
    this.hurtTimer = K.HURT_FRAMES + 40;
    this.world.sfx('shrink');
  }

  die(fell) {
    if (this.state === 'dying' || this.dead) return;
    this.state = 'dying';
    this.timer = 0;
    this.vy = fell ? 0 : -4.5;
    this.vx = 0;
    this.dead = true;
    this.world.onPlayerDeath();
  }

  updateDying() {
    this.timer++;
    /* A beat of hang time before the fall, which is the shape of the original
       death and the reason it reads as a stumble rather than a drop. */
    if (this.timer > 24) {
      this.vy += 0.25;
      this.y += this.vy;
    }
  }

  updateTransform() {
    this.timer--;
    if (this.timer <= 0) {
      this.state = 'play';
      this.applyBody();
    }
  }

  /* ---------------------------------------------------------------- *
   * Scripted sequences
   * ---------------------------------------------------------------- */

  enterPipe(dir, dest) {
    this.state = 'pipe';
    this.script = { phase: 'in', dir, dest, t: 0 };
    this.vx = 0;
    this.vy = 0;
    this.crouching = false;
    this.applyBody();
    this.world.sfx('pipe');
  }

  updatePipe() {
    const s = this.script;
    s.t++;
    if (s.phase === 'in') {
      if (s.dir === 'down') this.y += 0.5;
      else this.x += 0.5;
      if (s.t > 40) {
        this.world.arriveAt(s.dest);
        s.phase = 'out';
        s.t = 0;
      }
    } else {
      /* Rising out of the destination pipe, or simply standing up. */
      if (s.rise) { this.y -= 0.5; if (s.t > 32) this.finishPipe(); }
      else this.finishPipe();
    }
  }

  finishPipe() {
    this.state = 'play';
    this.script = null;
    this.vy = 0;
  }

  grabFlag(goal) {
    if (this.state !== 'play') return 0;
    this.state = 'flag';
    this.script = { t: 0, phase: 'slide' };
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.x = goal.x - 8;
    /* Score by how high up the pole you caught it — the one piece of skill
       expression in an otherwise scripted ending. */
    const frac = 1 - (this.y - goal.y) / Math.max(1, goal.height);
    const idx = Math.min(K.SCORE.flagpole.length - 1,
      Math.max(0, Math.floor(frac * K.SCORE.flagpole.length)));
    return K.SCORE.flagpole[idx];
  }

  updateFlag(level) {
    const s = this.script;
    const goal = level.goal;
    s.t++;
    if (s.phase === 'slide') {
      this.y += 2;
      const bottom = goal.base - this.h;
      if (this.y >= bottom) {
        this.y = bottom;
        s.phase = 'hop';
        s.t = 0;
      }
    } else if (s.phase === 'hop') {
      /* Round the pole to the other side before walking off. */
      if (s.t > 12) {
        this.x += 16;
        this.facing = 1;
        this.state = 'walk';
        this.script = { t: 0 };
        this.world.onFlagDown();
      }
    }
  }

  updateWalk(level) {
    this.script.t++;
    this.vx = 1.2;
    moveX(this, level, this.vx);
    this.vy = Math.min(K.MAX_FALL, this.vy + 0.4);
    const hit = moveY(this, level, this.vy);
    this.onGround = hit.ground;
    if (hit.ground) this.vy = 0;
    this.animate();
    if (level.castleDoorX !== undefined && this.x >= level.castleDoorX) {
      this.state = 'done';
      this.world.onEnteredCastle();
    }
  }

  /* ---------------------------------------------------------------- *
   * Which frame to draw
   * ---------------------------------------------------------------- */

  animate() {
    const speed = Math.abs(this.vx);
    if (speed > 0.1) {
      /* Legs cycle faster the faster you go — the same trick the original
         uses, and the reason a full sprint reads as a sprint. */
      this.animTimer += 1 + speed * 1.6;
    } else {
      this.animTimer = 0;
    }
    this.frame = Math.floor(this.animTimer / 8) % 3;
  }

  /* The sprite name for this frame, resolved by the renderer. */
  spriteName() {
    const size = this.power === SMALL ? 'small' : 'big';
    if (this.state === 'dying') return 'small_dead';
    if (this.climbing) return `${size}_climb${Math.floor(this.animTimer / 12) % 2 ? '1' : ''}`;
    if (this.state === 'grow' || this.state === 'shrink') {
      /* Flicker between the two bodies while transforming. */
      return (Math.floor(this.timer / 5) % 2) ? 'big_grow' : `${size}_idle`;
    }
    if (this.underwater) {
      if (this.swimStroke > 0 || !this.onGround) {
        return `${size}_swim${this.swimStroke > 8 ? '0' : '1'}`;
      }
    }
    if (this.crouching && this.big) return 'big_crouch';
    if (!this.onGround) return `${size}_jump`;
    /* Skidding: holding the opposite way to travel, fast enough to matter. */
    if (Math.abs(this.vx) > 0.6 && Math.sign(this.vx) !== this.facing) return `${size}_skid`;
    if (Math.abs(this.vx) > 0.05) return `${size}_walk${this.frame}`;
    return `${size}_idle`;
  }

  /* Which palette: fire white, star cycling, otherwise plain. */
  paletteName(frame) {
    if (this.starTimer > 0) {
      const cycle = ['star1', 'star2', 'star3', 'star2'];
      return cycle[Math.floor(frame / 3) % 4];
    }
    return this.power === FIRE ? 'fire' : 'mario';
  }

  /* Mercy flicker after being hit. */
  visible(frame) {
    if (this.hurtTimer > 0 && this.state === 'play') return (frame >> 1) % 2 === 0;
    return true;
  }
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
