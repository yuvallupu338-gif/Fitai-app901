/*
 * world.js — one level, running.
 *
 * Owns the map, the camera, everything alive in it, the clock and the score,
 * and the order all of that happens in. The order is not arbitrary:
 *
 *   1. the player moves and resolves against tiles
 *   2. entities move and resolve against tiles
 *   3. entities are tested against each other  (shells, fireballs)
 *   4. entities are tested against the player  (stomps, damage, items)
 *   5. the camera follows what is left
 *
 * Doing 4 before 3 means a shell you kicked this frame kills you before it
 * kills the Goomba it is touching. Doing 5 before 1 means the camera shows
 * you last frame's position, which reads as input lag on a fast run.
 *
 * The camera never scrolls back. That is one line, and it is the reason the
 * left edge of the screen is a wall you can be crushed against — a rule the
 * original used to make forward progress the only progress, and which every
 * level here is built assuming.
 */

import * as K from './constants.js';
import { T, bumpOf, isSolid, isWater } from './tiles.js';
import { overlaps } from './physics.js';
import { Player, SMALL, FIRE } from './player.js';
import { ENTITY_TYPES, Shell, Boss } from './entities.js';
import { Fireball, Debris, CoinPop, ScorePop, itemFromBlock } from './items.js';

const BUMP_FRAMES = 10;

export class World {
  constructor(level, input, audio, run) {
    this.level = level;
    this.rooms = [level, ...(level.rooms || []).slice(1)];
    this.roomIndex = 0;
    this.input = input;
    this.audio = audio;
    this.run = run;                    // lives, score, coins — survives a death

    this.player = new Player(this);
    this.player.reset(level.start.x, level.start.y + 16, run.power || SMALL);

    this.entities = [];
    this.effects = [];
    this.camera = { x: 0, y: 0 };
    this.frame = 0;
    this.timeLeft = level.time;
    this.timeTicker = 0;
    this.state = 'play';        // play | dead | clear | timeup | boss-dead
    this.stateTimer = 0;
    this.bumps = [];
    this.multiCoin = new Map();
    this.hurried = false;
    this.flagScore = 0;
    this.bridgeGone = false;
    this.difficulty = Math.min(1, ((level.id || 1) - 1) / 99);

    this.loadRoomEntities();
  }

  /* ---------------------------------------------------------------- *
   * Room loading
   * ---------------------------------------------------------------- */

  loadRoomEntities() {
    this.entities.length = 0;
    for (const def of this.level.entities) {
      const Type = ENTITY_TYPES[def.type];
      if (!Type) continue;
      const e = new Type(this, def.x, def.y, def);
      this.entities.push(e);
    }
  }

  /* Going down a pipe: swap the map under everything and put the player at
     the other end. The old room's entities are dropped rather than kept warm,
     because a coin room is thirty seconds long and nothing in the main level
     should have been walking around while you were in it. */
  arriveAt(dest) {
    const room = this.rooms[dest.room] || this.rooms[0];
    this.level = room;
    this.roomIndex = dest.room;
    this.loadRoomEntities();
    this.effects.length = 0;
    this.bumps.length = 0;

    if (dest.room === 0 && dest.x !== undefined) {
      this.player.x = dest.x;
      this.player.y = dest.y;
      this.camera.x = Math.max(0, Math.min(dest.x - 96, room.w * 16 - K.SCREEN_W));
    } else {
      this.player.x = room.start.x;
      this.player.y = room.start.y;
      this.camera.x = 0;
    }
    this.player.vx = 0;
    this.player.vy = 0;
    this.audio.playMusic(room.music);
  }

  /* ---------------------------------------------------------------- *
   * The frame
   * ---------------------------------------------------------------- */

  update() {
    this.frame++;

    if (this.state === 'play' || this.state === 'clear') this.tickClock();

    this.player.update(this.input, this.level, this.frame);

    if (this.state === 'play' && this.player.state === 'play') {
      this.tryFire();
      this.checkWarps();
    }

    this.updateEntities();
    this.updateEffects();
    this.updateBumps();
    this.updateBridge();

    if (this.player.state !== 'dying' && this.state !== 'dead') {
      this.entityVsEntity();
      this.entityVsPlayer();
    }
    if (this.state === 'play') this.checkGoal();

    /*
     * A castle ends on the axe, not on a door, so there is nothing for the
     * player to walk into that would declare the level over. The bridge
     * collapsing and the boss going into the lava is the ending, and when
     * that has had time to happen the level is finished.
     */
    if (this.state === 'clear' && this.level.goal && this.level.goal.type === 'axe'
      && this.stateTimer > 170) {
      this.state = 'finished';
      this.stateTimer = 0;
    }

    this.updateCamera();
    this.stateTimer++;
    return this.state;
  }

  tickClock() {
    if (this.player.state !== 'play' && this.player.state !== 'walk') return;
    if (++this.timeTicker < K.TIMER_TICK) return;
    this.timeTicker = 0;
    if (this.timeLeft > 0) this.timeLeft--;
    if (this.timeLeft === 100 && !this.hurried) {
      this.hurried = true;
      this.audio.hurry();
    }
    if (this.timeLeft <= 0 && this.state === 'play') {
      this.state = 'timeup';
      this.player.die(false);
    }
  }

  updateEntities() {
    const cam = this.camera;
    for (const e of this.entities) {
      if (!e.active && !e.wake(cam)) continue;
      e.update(this.level, this);
      e.cull(cam);
    }
    this.entities = this.entities.filter((e) => !e.remove);
  }

  updateEffects() {
    for (const f of this.effects) {
      f.update(this.level, this);
      if (f.cull) f.cull(this.camera);
    }
    this.effects = this.effects.filter((f) => !f.remove);
  }

  updateBumps() {
    for (const b of this.bumps) b.t++;
    this.bumps = this.bumps.filter((b) => b.t < BUMP_FRAMES);
  }

  updateCamera() {
    const p = this.player;
    const maxX = Math.max(0, this.level.w * K.TILE - K.SCREEN_W);
    /* Keeps the player a bit left of centre, so the screen shows more of what
       is coming than of what is behind. */
    const want = p.x + p.w / 2 - K.SCREEN_W * 0.42;
    if (want > this.camera.x) this.camera.x = Math.min(want, maxX);
    if (this.camera.x < 0) this.camera.x = 0;
    this.camera.y = 0;
  }

  /* ---------------------------------------------------------------- *
   * Fire
   * ---------------------------------------------------------------- */

  tryFire() {
    if (this.player.power !== FIRE) return;
    if (!this.input.pressed('b')) return;
    const live = this.effects.filter((f) => f.isFireball && f.bursting === 0).length;
    if (live >= K.MAX_FIREBALLS) return;
    const p = this.player;
    const ball = new Fireball(
      this, p.facing > 0 ? p.x + p.w : p.x - 8, p.y + 8, p.facing,
    );
    this.effects.push(ball);
    this.sfx('fire');
  }

  /* ---------------------------------------------------------------- *
   * Blocks
   * ---------------------------------------------------------------- */

  bumpBlock(col, row, by) {
    const t = this.level.at(col, row);
    const rule = bumpOf(t);
    if (!rule) { if (isSolid(t)) this.sfx('bump'); return; }

    this.bumps.push({ col, row, t: 0 });
    /* Anything standing on the block gets thrown off it. This is the trick
       that makes hitting a brick from underneath a way of killing things. */
    this.flipRiders(col, row);

    if (rule.breakable) {
      if (by && by.big) {
        this.level.set(col, row, T.EMPTY);
        this.breakBricks(col, row);
        this.addScore(K.SCORE.bricks, col * 16, row * 16);
        this.sfx('breakBlock');
      } else {
        this.sfx('bump');
      }
      return;
    }

    if (rule.gives === 'coin') {
      /* A coin brick pays out several times, on a timer that starts with the
         first hit — the original's rule, and the reason a coin block is worth
         standing under rather than hitting once. */
      const key = row * this.level.w + col;
      let pot = this.multiCoin.get(key);
      if (!pot) {
        pot = { left: rule.repeat ? 5 : 1, until: this.frame + 320 };
        this.multiCoin.set(key, pot);
      }
      pot.left--;
      this.collectCoin();
      this.effects.push(new CoinPop(this, col * 16, row * 16 - 16));
      this.sfx('coin');
      if (pot.left <= 0 || this.frame > pot.until) {
        this.level.set(col, row, rule.spent || rule.becomes || T.USED);
        this.multiCoin.delete(key);
      } else {
        this.level.set(col, row, t);
      }
      return;
    }

    this.level.set(col, row, rule.becomes === undefined ? T.USED : rule.becomes);
    const item = itemFromBlock(this, rule.gives, col, row - 1);
    if (item) {
      this.effects.push(item);
      this.sfx(rule.gives === 'oneup' ? 'sprout' : 'sprout');
    }
  }

  breakBricks(col, row) {
    const x = col * 16 + 4;
    const y = row * 16 + 4;
    this.effects.push(new Debris(this, x - 4, y - 4, -1.2, -4));
    this.effects.push(new Debris(this, x + 4, y - 4, 1.2, -4));
    this.effects.push(new Debris(this, x - 4, y + 4, -1.6, -2.4));
    this.effects.push(new Debris(this, x + 4, y + 4, 1.6, -2.4));
  }

  /* Enemies standing on a block that was just hit from below. */
  flipRiders(col, row) {
    const top = row * 16;
    for (const e of this.entities) {
      if (e.dead || !e.active || e.isPlatform) continue;
      if (Math.abs((e.y + e.h) - top) > 4) continue;
      if (e.x + e.w < col * 16 || e.x > col * 16 + 16) continue;
      if (e.onStomp === undefined) continue;
      e.kill();
      e.vx = 0.6;
    }
  }

  /* ---------------------------------------------------------------- *
   * Collisions
   * ---------------------------------------------------------------- */

  entityVsEntity() {
    /* Shells against everything else. */
    for (const s of this.entities) {
      if (!(s instanceof Shell) || !s.moving || s.dead) continue;
      for (const e of this.entities) {
        if (e === s || e.dead || !e.active) continue;
        if (e.isPlatform || e.isSpring) continue;
        if (!overlaps(s, e)) continue;
        if (e instanceof Shell) {
          /* Two shells: both die, which is the only way to lose a shell you
             kicked without it leaving the screen. */
          e.kill(); s.kill();
          continue;
        }
        if (e.onShell(this)) {
          s.kills++;
          this.addScore(chainScore(s.kills), e.x, e.y);
          this.sfx('kick');
        }
      }
    }

    /* Fireballs against everything. */
    for (const f of this.effects) {
      if (!f.isFireball || f.bursting > 0) continue;
      for (const e of this.entities) {
        if (e.dead || !e.active || e.isPlatform || e.isSpring) continue;
        if (!overlaps(f, e)) continue;
        const killed = e.onFireball(this);
        if (killed) this.addScore(K.SCORE.fireballKill, e.x, e.y);
        /* Fire stops on anything it hits, killed or not — except the things
           that are explicitly transparent to it. */
        if (!e.fireproof || killed) { f.burst(); break; }
      }
    }
  }

  entityVsPlayer() {
    const p = this.player;
    if (p.state !== 'play' && p.state !== 'walk') return;

    for (const e of this.entities) {
      if (!e.active) continue;

      if (e.isPlatform) { this.ridePlatform(e); continue; }
      if (e.isSpring) { this.rideSpring(e); continue; }

      if (e.balls) { this.firebarVsPlayer(e); continue; }

      if (e.dead || !overlaps(p, e)) continue;

      if (e.constructor === ENTITY_TYPES.axe) { this.hitAxe(); continue; }

      /* Star power flattens everything it touches, no questions. */
      if (p.invincible) {
        if (e.kill) {
          e.kill(false);
          e.vx = p.facing * 0.8;
          p.stompChain++;
          this.addScore(chainScore(p.stompChain), e.x, e.y);
          this.sfx('kick');
        }
        continue;
      }

      /* A stomp needs downward motion and feet above the enemy's shoulders.
         Testing only "is the player above" lets you kill a Goomba by walking
         into it on a slope; testing only "is falling" lets you kill one by
         jumping into its side. */
      const falling = p.vy > 0;
      const above = (p.y + p.h) - p.vy <= e.y + e.h * 0.5;

      if (falling && above && e.stompable) {
        if (e.onStomp(this)) {
          p.stompChain++;
          this.addScore(chainScore(p.stompChain), e.x, e.y);
          if (p.stompChain >= K.STOMP_CHAIN.length) this.addLife();
          p.vy = p.jumpHeld ? K.BOUNCE_VY_HELD : K.BOUNCE_VY;
          p.y = e.y - p.h;
          this.sfx('stomp');
        } else if (e instanceof Shell) {
          /* A still shell that was landed on is kicked away from the player. */
          this.kickShell(e);
          p.vy = p.jumpHeld ? K.BOUNCE_VY_HELD : K.BOUNCE_VY;
        }
        continue;
      }

      if (e instanceof Shell && !e.moving) { this.kickShell(e); continue; }
      if (e.harmful) p.hurt();
    }

    /* Items are in the effects list so they draw behind blocks while they
       emerge, but they are collected like anything else. */
    for (const f of this.effects) {
      if (!f.isItem || f.emerging) continue;
      if (overlaps(p, f)) f.collect();
    }
  }

  kickShell(shell) {
    const p = this.player;
    const dir = (p.x + p.w / 2) < (shell.x + shell.w / 2) ? 1 : -1;
    shell.kick(dir);
    /* Pushed clear so the kick does not immediately count as a body hit. */
    shell.x += dir * 6;
  }

  firebarVsPlayer(bar) {
    const p = this.player;
    if (p.invincible || p.intangible) return;
    for (const b of bar.balls) {
      if (overlaps(p, b)) { p.hurt(); return; }
    }
  }

  ridePlatform(plat) {
    const p = this.player;
    const feet = p.y + p.h;
    const onTop = p.vy >= 0
      && feet >= plat.y - 2 && feet <= plat.y + 8
      && p.x + p.w > plat.x + 1 && p.x < plat.x + plat.w - 1;
    if (!onTop) return;
    p.y = plat.y - p.h;
    p.vy = 0;
    p.onGround = true;
    p.jumping = false;
    plat.rider = true;
    /* Carried by the platform's own movement this frame. */
    if (plat.mode === 'h') p.x += plat.speed * plat.dir;
    else if (plat.mode === 'v') p.y += plat.speed * plat.dir;
    else if (plat.falling) p.y += plat.vy;
  }

  rideSpring(spring) {
    const p = this.player;
    const feet = p.y + p.h;
    const top = spring.y + spring.compressOffset();
    const onTop = p.vy >= 0
      && feet >= top - 2 && feet <= top + 10
      && p.x + p.w > spring.x + 2 && p.x < spring.x + spring.w - 2;
    if (!onTop) return;
    p.y = top - p.h;
    p.onGround = true;
    if (spring.compress === 0) {
      spring.compress = 18;
      this.sfx('spring');
    }
    if (spring.compress === 1) {
      /* Launch on the way back up, and hard if the button is held: the
         difference between the two heights is the whole trick. */
      p.vy = p.jumpHeld ? K.SPRING_VY_HELD : K.SPRING_VY;
      p.jumping = true;
      p.gravityHold = K.JUMP_TABLE[2].hold;
      p.gravityFall = K.JUMP_TABLE[2].fall;
      p.onGround = false;
    } else {
      p.vy = 0;
    }
  }

  /* ---------------------------------------------------------------- *
   * Warps
   * ---------------------------------------------------------------- */

  checkWarps() {
    const p = this.player;
    for (const w of this.level.warps || []) {
      const zx = w.col * 16;
      const zy = w.row * 16;
      if (w.dir === 'down') {
        const onLip = Math.abs((p.y + p.h) - zy) < 4
          && p.x + p.w > zx + 2 && p.x < zx + w.w * 16 - 2;
        if (onLip && this.input.held('down')) {
          p.enterPipe('down', w.to.room === 0
            ? { room: 0, x: w.backTo.x, y: w.backTo.y }
            : { room: w.to.room });
          return;
        }
      } else if (w.dir === 'right') {
        const inMouth = p.x + p.w > zx && p.x < zx + 12
          && p.y + p.h > zy && p.y < zy + w.h * 16;
        if (inMouth && this.input.held('right')) {
          p.enterPipe('right', { room: w.to.room, x: w.to.x, y: w.to.y });
          return;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * The end of the level
   * ---------------------------------------------------------------- */

  checkGoal() {
    const goal = this.level.goal;
    if (!goal) return;
    const p = this.player;
    if (goal.type === 'flag') {
      if (p.x + p.w >= goal.x && p.state === 'play') {
        this.flagScore = p.grabFlag(goal);
        this.addScore(this.flagScore, p.x, p.y - 16);
        this.state = 'clear';
        this.stateTimer = 0;
        this.audio.stopMusic();
        this.sfx('flagpole');
      }
    }
  }

  hitAxe() {
    if (this.bridgeGone) return;
    this.bridgeGone = true;
    const b = this.level.bridge;
    if (b) {
      /* The bridge goes one tile at a time from the far end, which is what
         gives the boss time to notice and fall. */
      this.bridgeCollapse = { col: b.col + b.w - 1, row: b.row, t: 0, from: b.col };
    }
    for (const e of this.entities) if (e instanceof Boss) e.plunge();
    this.entities = this.entities.filter((e) => e.constructor !== ENTITY_TYPES.axe);
    this.audio.stopMusic();
    this.sfx('flagpole');
    this.audio.playJingle('clear');
    this.state = 'clear';
    this.stateTimer = 0;
  }

  updateBridge() {
    const b = this.bridgeCollapse;
    if (!b) return;
    if (++b.t % 3) return;
    if (b.col < b.from) { this.bridgeCollapse = null; return; }
    this.level.set(b.col, b.row, T.EMPTY);
    b.col--;
    this.sfx('bump');
  }

  onFlagDown() { this.audio.playJingle('clear'); }

  onEnteredCastle() {
    this.state = 'finished';
    this.stateTimer = 0;
  }

  onBossSeen() { /* hook for a music sting; the castle theme already plays */ }

  onBossDefeated() {
    this.sfx('bossDown');
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.stateTimer = 0;
    this.audio.stopMusic();
    this.audio.playJingle('death');
  }

  /* ---------------------------------------------------------------- *
   * Bookkeeping the run cares about
   * ---------------------------------------------------------------- */

  addScore(n, x, y) {
    if (!n) return;
    this.run.score += n;
    if (x !== undefined) this.popScore(String(n), x, y);
  }

  popScore(text, x, y) {
    this.effects.push(new ScorePop(this, x, y, text));
  }

  collectCoin() {
    this.run.coins++;
    this.run.score += K.SCORE.coin;
    this.sfx('coin');
    if (this.run.coins >= K.COINS_PER_LIFE) {
      this.run.coins -= K.COINS_PER_LIFE;
      this.addLife();
    }
  }

  addLife() {
    this.run.lives++;
    this.audio.playJingle('oneUp');
  }

  spawn(e) { this.entities.push(e); }

  sfx(name) { this.audio.sfx(name); }

  startStarMusic() { this.audio.starMusic(K.STAR_FRAMES); }

  /* ---------------------------------------------------------------- *
   * Water
   * ---------------------------------------------------------------- */

  isUnderwater(x, y) {
    const level = this.level;
    if (level.water) return true;
    if (level.waterLine === undefined) return false;
    if (y < level.waterLine * 16) return false;
    return isWater(level.at(Math.floor(x / 16), Math.floor(y / 16)));
  }

  /* The y of the water surface above a point, or null on dry land. Used for
     the weaker stroke near the top. */
  surfaceY(x) {
    const level = this.level;
    if (level.water) return 16;
    if (level.waterLine === undefined) return null;
    return level.waterLine * 16;
  }
}

function chainScore(n) {
  return K.STOMP_CHAIN[Math.min(n - 1, K.STOMP_CHAIN.length - 1)] || 100;
}
