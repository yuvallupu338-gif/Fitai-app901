/*
 * entities.js — everything that moves and is not the player.
 *
 * Three conventions run through all of them.
 *
 * Nothing moves until it has been on screen. An enemy placed at tile 140 is
 * frozen until the camera reaches it, which is why the Goomba you can see
 * coming is always in the same place: without it, every enemy in the level
 * would walk left for twenty seconds while you were still at the start, and
 * arrive in a heap at whatever wall was nearest.
 *
 * Damage is a set of verbs rather than a flag. Each enemy answers `onStomp`,
 * `onFireball` and `onShell` separately, and the differences between the
 * answers are the bestiary: a Buzzy Beetle shrugs off fire, a Spiny cannot be
 * stomped at all, a shell is a weapon between two stomps.
 *
 * A dead enemy is not removed, it is flipped: killed by a shell, a fireball
 * or star power, it turns upside down and falls out of the world. That is
 * what makes a kicked shell running through six enemies readable, and it
 * costs one boolean.
 */

import * as K from './constants.js';
import { moveX, moveY, atLedge } from './physics.js';

const SCREEN_W = K.SCREEN_W;

export class Entity {
  constructor(world, x, y, opts) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 16;
    this.h = 16;
    this.opts = opts || {};
    this.dir = -1;                 // enemies walk left, towards the player
    this.dead = false;
    this.remove = false;
    this.flipped = false;
    this.active = false;
    this.harmful = true;
    this.stompable = true;
    this.fireproof = false;
    this.anim = 0;
    this.spawnX = x;
  }

  /* Wakes when the right edge of the screen reaches it, and never sleeps
     again — an enemy that re-froze when you backed up would reset its
     position and reappear somewhere you had already cleared. */
  wake(camera) {
    if (!this.active && this.x < camera.x + SCREEN_W + 32 && this.x > camera.x - 64) {
      this.active = true;
      this.onWake();
    }
    return this.active;
  }

  onWake() {}

  /* Off the bottom, or far enough behind the camera to be gone for good. */
  cull(camera) {
    if (this.y > K.SCREEN_H + 64) this.remove = true;
    if (this.x + this.w < camera.x - 96) this.remove = true;
  }

  update() {}

  /* Shared: walk, fall, turn at walls. */
  walkStep(level, opts) {
    const o = opts || {};
    this.vy = Math.min(K.ENEMY_MAX_FALL, this.vy + (o.gravity || K.ENEMY_GRAVITY));
    if (moveX(this, level, this.vx)) {
      this.dir = -this.dir;
      this.vx = -this.vx;
    }
    if (o.ledgeAware && this.onGround && atLedge(this, level, this.dir)) {
      this.dir = -this.dir;
      this.vx = -this.vx;
      /* Step back off the lip so the turn does not immediately re-trigger. */
      this.x += this.dir * 2;
    }
    const hit = moveY(this, level, this.vy);
    this.onGround = hit.ground;
    if (hit.ground) this.vy = 0;
    if (hit.ceiling) this.vy = 0.5;
  }

  /* The flip-and-fall death. */
  kill(scoreAt) {
    this.flipped = true;
    this.dead = true;
    this.harmful = false;
    this.stompable = false;
    this.vy = -4;
    this.vx = 0;
    if (scoreAt !== false) this.world.addScore(K.SCORE.shellKill, this.x, this.y);
  }

  updateFlipped() {
    this.vy += 0.35;
    this.y += this.vy;
    this.x += this.vx;
  }

  onStomp() { return false; }
  onFireball() { if (this.fireproof) return false; this.kill(); return true; }
  onShell() { this.kill(); return true; }

  sprite() { return null; }
}

/* ------------------------------------------------------------------ *
 * Goomba
 * ------------------------------------------------------------------ */

export class Goomba extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 14;
    this.h = 16;
    this.x += 1;
    this.vx = -K.ENEMY_WALK;
    this.pal = { blue: 'goombaBlue', gray: 'goombaGray' }[this.opts.variant] || 'goomba';
    this.flatTimer = 0;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    if (this.flatTimer > 0) {
      if (--this.flatTimer <= 0) this.remove = true;
      return;
    }
    this.walkStep(level);
    this.anim++;
  }

  onStomp() {
    this.flatTimer = 24;
    this.harmful = false;
    this.stompable = false;
    this.dead = true;
    this.vx = 0;
    return true;
  }

  sprite() {
    if (this.flatTimer > 0) return { name: 'goomba_flat', pal: this.pal };
    return {
      name: (this.anim >> 3) & 1 ? 'goomba1' : 'goomba0',
      pal: this.pal,
      flipY: this.flipped,
      ox: -1,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Koopa Troopa, its shell, and the two variants that behave differently
 * ------------------------------------------------------------------ */

const KOOPA_PAL = { green: 'koopa', red: 'koopaRed', blue: 'koopaBlue', buzzy: 'buzzy' };

export class Koopa extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.variant = this.opts.variant || 'green';
    this.pal = KOOPA_PAL[this.variant] || 'koopa';
    this.w = 14;
    this.h = 24;
    this.x += 1;
    this.y -= 8;                       // the sprite is taller than one tile
    this.vx = -K.ENEMY_WALK;
    /* Red Koopas watch their footing. That single difference is why they are
       the ones on the narrow ledges. */
    this.ledgeAware = this.variant === 'red';
    this.fireproof = this.variant === 'buzzy';
    this.winged = !!this.opts.winged;
    this.hopTimer = 0;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    if (this.winged) {
      /* Winged ones hop, which turns a flat corridor into a timing problem
         without adding anything to the level. */
      if (this.onGround && --this.hopTimer <= 0) {
        this.vy = -3.2;
        this.hopTimer = 40;
      }
      this.walkStep(level, { gravity: 0.22 });
    } else {
      this.walkStep(level, { ledgeAware: this.ledgeAware });
    }
    this.anim++;
  }

  onStomp() {
    if (this.winged) {
      /* First stomp takes the wings off, not the Koopa. */
      this.winged = false;
      this.vy = 0;
      this.hopTimer = 0;
      this.world.addScore(100, this.x, this.y);
      return true;
    }
    const shell = new Shell(this.world, this.x - 1, this.y + this.h - 16, {
      variant: this.variant,
    });
    this.world.spawn(shell);
    this.remove = true;
    return true;
  }

  sprite() {
    return {
      name: (this.anim >> 3) & 1 ? 'koopa1' : 'koopa0',
      pal: this.pal,
      wings: this.winged ? ((this.anim >> 2) & 1 ? 'wing1' : 'wing0') : null,
      ox: -1,
    };
  }
}

export class Shell extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.variant = (opts && opts.variant) || 'green';
    this.pal = KOOPA_PAL[this.variant] || 'koopa';
    this.w = 14;
    this.h = 15;
    this.x += 1;
    this.moving = false;
    this.wakeTimer = K.SHELL_WAKE;
    this.fireproof = this.variant === 'buzzy';
    this.harmful = false;
    this.kills = 0;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    if (!this.moving) {
      /* A still shell wakes back up into a Koopa if left alone long enough,
         which is what stops a level being cleared by parking shells. */
      if (--this.wakeTimer <= 0) {
        const k = new Koopa(this.world, this.x - 1, this.y - 8, { variant: this.variant });
        k.active = true;
        this.world.spawn(k);
        this.remove = true;
        return;
      }
      this.vx = 0;
    }
    this.walkStep(level);
    if (this.moving) this.anim++;
  }

  kick(dir) {
    this.moving = true;
    this.harmful = true;
    this.vx = K.SHELL_SPEED * dir;
    this.dir = dir;
    this.kills = 0;
    this.world.sfx('kick');
  }

  stop() {
    this.moving = false;
    this.harmful = false;
    this.vx = 0;
    this.wakeTimer = K.SHELL_WAKE;
  }

  onStomp() {
    if (this.moving) { this.stop(); return true; }
    return false;      // world decides: kick it, left or right
  }

  sprite() {
    const wobble = !this.moving && this.wakeTimer < 120 && ((this.wakeTimer >> 2) & 1);
    return { name: wobble ? 'shell_wake' : 'shell', pal: this.pal, ox: -1, oy: -1 };
  }
}

/* ------------------------------------------------------------------ *
 * Spiny — the answer to "can I just stomp everything"
 * ------------------------------------------------------------------ */

export class Spiny extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 14;
    this.h = 16;
    this.x += 1;
    this.vx = -K.ENEMY_WALK * 1.2;
    this.stompable = false;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    this.walkStep(level);
    this.anim++;
  }

  sprite() { return { name: 'spiny', pal: 'spiny' }; }
}

/* A Spiny before it lands: Lakitu throws the egg, the egg becomes the Spiny. */
export class SpinyEgg extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 14;
    this.h = 16;
    this.vx = (opts && opts.vx) || 0;
    this.vy = -1;
    this.active = true;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    this.walkStep(level);
    this.anim++;
    if (this.onGround) {
      const s = new Spiny(this.world, this.x - 1, this.y, {});
      s.active = true;
      this.world.spawn(s);
      this.remove = true;
    }
  }

  sprite() { return { name: 'spiny_egg', pal: 'spiny' }; }
}

/* ------------------------------------------------------------------ *
 * Piranha Plant — the only enemy that reacts to where you are standing
 * ------------------------------------------------------------------ */

export class Piranha extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 24;
    this.pipeTop = this.opts.top !== undefined ? this.opts.top : y;
    this.x = x + 8;                    // centred on the two-tile pipe
    this.pal = this.opts.variant === 'red' ? 'piranhaRed' : 'piranha';
    this.up = false;
    this.timer = 40;
    this.offset = 24;                  // fully retracted
    this.stompable = false;
    this.h = 24;
  }

  update() {
    this.anim++;
    /* Refuses to come out while the player is standing on the pipe. Without
       this rule the plant is a coin flip; with it, standing on the pipe is a
       real option and the level can be built around it. */
    const p = this.world.player;
    const near = Math.abs((p.x + p.w / 2) - (this.x + 8)) < 28;

    if (this.up) {
      this.offset = Math.max(0, this.offset - 0.75);
      if (this.offset === 0 && --this.timer <= 0) { this.up = false; this.timer = 60; }
    } else {
      this.offset = Math.min(24, this.offset + 0.75);
      if (this.offset === 24 && --this.timer <= 0 && !near) { this.up = true; this.timer = 50; }
    }
    this.y = this.pipeTop - 24 + this.offset;
    this.harmful = this.offset < 20;
  }

  /* It lives in a pipe: it never falls, and it is never off screen for being
     behind the camera by less than a screen. */
  cull(camera) {
    if (this.x + this.w < camera.x - 160) this.remove = true;
  }

  onStomp() { return false; }

  sprite() {
    if (this.offset >= 23) return null;
    return {
      name: (this.anim >> 3) & 1 ? 'piranha1' : 'piranha0',
      pal: this.pal,
      clipTop: this.offset,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Water
 * ------------------------------------------------------------------ */

export class Cheep extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 12;
    this.y += 2;
    this.pal = this.opts.variant === 'gray' ? 'cheepGray' : 'cheep';
    this.speed = this.opts.speed || 0.5;
    this.vx = -this.speed;
    this.baseY = this.y;
    this.wave = !!this.opts.wave;
    this.phase = (x % 64) / 64 * Math.PI * 2;
    this.stompable = false;            // you cannot stomp underwater
  }

  update() {
    this.x += this.vx;
    this.phase += 0.04;
    if (this.wave) this.y = this.baseY + Math.sin(this.phase) * 20;
    this.anim++;
  }

  cull(camera) {
    if (this.x + this.w < camera.x - 64) this.remove = true;
    if (this.y > K.SCREEN_H + 64) this.remove = true;
  }

  sprite() {
    return { name: (this.anim >> 3) & 1 ? 'cheep1' : 'cheep0', pal: this.pal, flip: this.vx > 0 };
  }
}

export class Blooper extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 14;
    this.h = 22;
    this.stompable = false;
    this.timer = 0;
    this.chasing = true;
  }

  update() {
    /* Pulse towards the player, then drift down. The rhythm is the whole
       enemy: you get past a Blooper by moving during its glide, not by
       out-running it. */
    this.timer++;
    const p = this.world.player;
    if (this.chasing) {
      this.vy = -1.1;
      this.vx = Math.sign((p.x + p.w / 2) - (this.x + this.w / 2)) * 0.8;
      if (this.timer > 40) { this.chasing = false; this.timer = 0; }
    } else {
      this.vy = 0.7;
      this.vx *= 0.9;
      if (this.timer > 44) { this.chasing = true; this.timer = 0; }
    }
    this.x += this.vx;
    this.y += this.vy;
    this.y = Math.max(16, Math.min(K.SCREEN_H - 40, this.y));
    this.anim++;
  }

  cull(camera) {
    if (this.x + this.w < camera.x - 96) this.remove = true;
  }

  sprite() { return { name: 'blooper', pal: 'blooper' }; }
}

/* ------------------------------------------------------------------ *
 * Hammer Brother
 * ------------------------------------------------------------------ */

export class HammerBro extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 14;
    this.h = 24;
    this.x += 1;
    this.vx = -0.4;
    this.throwTimer = 60;
    this.walkTimer = 60;
  }

  update(level) {
    if (this.flipped) return this.updateFlipped();
    this.walkStep(level, { ledgeAware: true });
    this.anim++;

    /* Paces a short beat either side of where it started, so it stays on the
       block it was placed on instead of wandering into the level. */
    if (--this.walkTimer <= 0) {
      this.vx = -this.vx;
      this.dir = -this.dir;
      this.walkTimer = 50 + (this.anim % 30);
    }
    if (Math.abs(this.x - this.spawnX) > 24) {
      this.vx = Math.sign(this.spawnX - this.x) * 0.4;
      this.dir = Math.sign(this.vx);
    }

    if (--this.throwTimer <= 0) {
      const p = this.world.player;
      const towards = Math.sign((p.x + p.w / 2) - (this.x + this.w / 2)) || -1;
      this.world.spawn(new Hammer(this.world, this.x, this.y - 8, { vx: towards * 1.6 }));
      this.throwTimer = 90 - Math.floor(this.world.difficulty * 35);
    }
  }

  sprite() {
    const winding = this.throwTimer < 18;
    return {
      name: winding ? 'hammerbro1' : 'hammerbro0',
      pal: 'hammerbro',
      flip: this.world.player.x < this.x,
      ox: -1,
    };
  }
}

export class Hammer extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 10;
    this.h = 12;
    this.vx = (opts && opts.vx) || -1.6;
    this.vy = -4.2;
    this.active = true;
    this.stompable = false;
  }

  update() {
    this.vy += 0.22;
    this.x += this.vx;
    this.y += this.vy;
    this.anim++;
  }

  sprite() { return { name: 'hammer', pal: 'hammer', spin: this.anim }; }
}

/* ------------------------------------------------------------------ *
 * Lakitu — the pressure enemy
 * ------------------------------------------------------------------ */

export class Lakitu extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 24;
    this.throwTimer = 120;
    this.stompable = true;
  }

  update() {
    /* Hovers a little ahead of the player and keeps up, which is the point:
       it is not an obstacle in a place, it is a clock. */
    const p = this.world.player;
    const target = p.x + 24;
    this.x += (target - this.x) * 0.035;
    this.y = Math.max(16, this.world.camera.y + 24);
    this.anim++;

    if (--this.throwTimer <= 0) {
      this.world.spawn(new SpinyEgg(this.world, this.x, this.y + 16, {
        vx: Math.sign(p.x - this.x) * 0.8,
      }));
      this.throwTimer = 150 - Math.floor(this.world.difficulty * 60);
    }
  }

  cull() { /* stays until the level ends */ }

  onStomp() { this.kill(); return true; }

  sprite() { return { name: 'lakitu', pal: 'lakitu', flip: this.world.player.x > this.x }; }
}

/* ------------------------------------------------------------------ *
 * Artillery
 * ------------------------------------------------------------------ */

export class Cannon extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.period = this.opts.period || 130;
    this.timer = this.period;
    this.harmful = false;
    this.stompable = false;
  }

  update() {
    const p = this.world.player;
    /* Does not fire into the player's face at point blank, and does not fire
       at all once they are past it. */
    const dx = (p.x + p.w / 2) - (this.x + 8);
    if (--this.timer <= 0) {
      this.timer = this.period;
      if (dx < -24 && dx > -SCREEN_W) {
        this.world.spawn(new Bullet(this.world, this.x - 8, this.y, { vx: -2.2 }));
        this.world.sfx('bullet');
      }
    }
  }

  cull(camera) { if (this.x + this.w < camera.x - 96) this.remove = true; }

  sprite() { return { name: 'cannon_top', pal: 'bullet' }; }
}

export class Bullet extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 14;
    this.y += 1;
    this.vx = (opts && opts.vx) || -2.2;
    this.active = true;
    this.fireproof = true;             // fire goes straight through it
  }

  update() {
    this.x += this.vx;
    this.anim++;
  }

  onStomp() { this.kill(false); this.world.addScore(200, this.x, this.y); return true; }
  onFireball() { return false; }

  sprite() { return { name: 'bullet', pal: 'bullet', flip: this.vx > 0 }; }
}

/* ------------------------------------------------------------------ *
 * Castle furniture
 * ------------------------------------------------------------------ */

export class Podoboo extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 12;
    this.h = 14;
    this.homeY = y;
    this.rise = this.opts.rise || 96;
    this.period = this.opts.period || 140;
    this.timer = (x % this.period) | 0;
    this.stompable = false;
    this.fireproof = true;
    this.launched = false;
  }

  update() {
    this.timer++;
    if (!this.launched) {
      this.y = this.homeY + 8;
      if (this.timer >= this.period) {
        this.timer = 0;
        this.launched = true;
        /* Chosen so the apex lands exactly `rise` above the lava, which is
           what lets a level place one under a ledge and mean it. */
        this.vy = -Math.sqrt(2 * 0.22 * this.rise);
      }
    } else {
      this.vy += 0.22;
      this.y += this.vy;
      if (this.y >= this.homeY + 8) {
        this.y = this.homeY + 8;
        this.launched = false;
        this.timer = 0;
      }
    }
    this.anim++;
  }

  cull(camera) { if (this.x + this.w < camera.x - 96) this.remove = true; }

  sprite() { return { name: 'podoboo', pal: 'podoboo', flipY: this.vy > 0, ox: -2 }; }
}

/*
 * A firebar is a pivot and a list of fireballs on a radius. It has no body of
 * its own — the world tests the player against each ball — which is why it
 * can be six tiles long without being a six-tile rectangle of death.
 */
export class Firebar extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 0;
    this.h = 0;
    this.len = this.opts.len || 5;
    this.speed = this.opts.speed || 0.03;
    this.angle = 0;
    this.stompable = false;
    this.harmful = false;              // the balls are, not the pivot
    this.balls = [];
  }

  update() {
    this.angle += this.speed;
    this.balls.length = 0;
    for (let i = 1; i <= this.len; i++) {
      this.balls.push({
        x: this.x + Math.cos(this.angle) * i * 8 - 4,
        y: this.y + Math.sin(this.angle) * i * 8 - 4,
        w: 8, h: 8,
      });
    }
    this.anim++;
  }

  cull(camera) { if (this.x < camera.x - 96) this.remove = true; }

  sprite() { return { name: 'firebar', pal: 'fireball' }; }
}

/* ------------------------------------------------------------------ *
 * Lifts
 * ------------------------------------------------------------------ */

export class Platform extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.tiles = this.opts.tiles || 3;
    this.w = this.tiles * 16;
    this.h = 8;
    this.mode = this.opts.mode || 'h';
    this.span = this.opts.span || 64;
    this.speed = this.opts.speed || 0.8;
    this.originX = x;
    this.originY = y;
    this.dir = 1;
    this.harmful = false;
    this.stompable = false;
    this.rider = false;
    this.falling = false;
    this.fallTimer = 0;
    this.isPlatform = true;
  }

  onWake() {
    /* Vertical lifts start mid-track so they are not all in phase. */
    if (this.mode === 'v') this.y = this.originY - this.span / 2;
  }

  update() {
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.mode === 'h') {
      this.x += this.speed * this.dir;
      if (this.x > this.originX + this.span) { this.x = this.originX + this.span; this.dir = -1; }
      if (this.x < this.originX) { this.x = this.originX; this.dir = 1; }
    } else if (this.mode === 'v') {
      this.y += this.speed * this.dir;
      if (this.y > this.originY + this.span / 2) this.dir = -1;
      if (this.y < this.originY - this.span / 2) this.dir = 1;
    } else if (this.mode === 'fall') {
      if (this.falling) {
        this.vy = Math.min(4, this.vy + 0.2);
        this.y += this.vy;
      } else if (this.rider) {
        /* A beat of warning before it goes, so standing on one is a decision
           rather than an ambush. */
        if (++this.fallTimer > 20) this.falling = true;
      } else {
        this.fallTimer = 0;
      }
    }
    this.rider = false;
  }

  cull(camera) {
    if (this.y > K.SCREEN_H + 96) this.remove = true;
    if (this.x + this.w < camera.x - 128) this.remove = true;
  }

  sprite() { return { name: 'platform_lift', pal: 'platform' }; }
}

export class Spring extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 32;
    this.harmful = false;
    this.stompable = false;
    this.compress = 0;
    this.isSpring = true;
  }

  update() {
    if (this.compress > 0) this.compress--;
  }

  /* Where the top of the springboard is right now. The world stands the
     player on this and the renderer draws to it, so a squashed spring cannot
     look one height and behave another. */
  compressOffset() {
    return this.compress > 12 ? 22 : this.compress > 0 ? 15 : 8;
  }

  cull(camera) { if (this.x + this.w < camera.x - 96) this.remove = true; }

  sprite() {
    const stage = this.compress > 12 ? 'spring2' : this.compress > 0 ? 'spring1' : 'spring0';
    return { name: stage, pal: 'spring' };
  }
}

export class Axe extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    /*
     * Drawn as a 16x16 axe on the floor, but collided with as a column the
     * full height of the screen.
     *
     * The axe is not an object you may pick up, it is the end of the level.
     * Given a hitbox its own size it can be jumped clean over — and since the
     * castle floor runs on past it to the right wall, a player who does that
     * ends up standing at the end of a level that has no way to finish. The
     * original never had this problem because there was nowhere further to
     * go; here the fix is to make the axe unmissable rather than to shorten
     * the floor, so a running leap over the bridge still ends the castle.
     */
    this.drawY = y;
    this.y = 0;
    this.w = 16;
    this.h = K.SCREEN_H;
    this.harmful = false;
    this.stompable = false;
    this.active = true;
  }

  update() { this.anim++; }
  cull() {}

  sprite() { return { name: 'axe', pal: 'axe', oy: this.drawY }; }
}

/* ------------------------------------------------------------------ *
 * The one at the end of the castle
 * ------------------------------------------------------------------ */

export class Boss extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 30;
    this.h = 30;
    this.hp = this.opts.hp || 3;
    this.floor = this.opts.floor !== undefined ? this.opts.floor : y + 32;
    this.homeX = x;
    this.range = this.opts.range || 80;
    this.vx = -0.4;
    this.stompable = false;
    this.fireTimer = 90;
    this.hopTimer = 120;
    this.hurtFlash = 0;
    this.active = false;
  }

  onWake() { this.world.onBossSeen(); }

  /* The axe took the bridge out from under him. Not a flip — he goes down
     the way he was standing, which is the only dignified death in the game. */
  plunge() {
    this.plunging = true;
    this.dead = true;
    this.harmful = false;
    this.stompable = false;
    this.vx = 0;
    this.vy = 0;
  }

  update(level) {
    if (this.plunging) {
      this.vy += 0.3;
      this.y += this.vy;
      return;
    }
    if (this.flipped) return this.updateFlipped();
    this.anim++;
    if (this.hurtFlash > 0) this.hurtFlash--;

    /* Paces its bridge, turning at the ends of a fixed range so it never
       walks off into the level or backs the player into a corner. */
    this.x += this.vx;
    if (this.x < this.homeX - this.range) { this.x = this.homeX - this.range; this.vx = Math.abs(this.vx); }
    if (this.x > this.homeX + this.range * 0.4) { this.x = this.homeX + this.range * 0.4; this.vx = -Math.abs(this.vx); }

    this.vy = Math.min(K.ENEMY_MAX_FALL, this.vy + 0.3);
    const hit = moveY(this, level, this.vy);
    if (hit.ground) this.vy = 0;
    this.onGround = hit.ground;

    if (--this.hopTimer <= 0 && this.onGround) {
      this.vy = -3.6;
      this.hopTimer = 130 - Math.floor(this.world.difficulty * 50);
    }

    if (--this.fireTimer <= 0) {
      const p = this.world.player;
      this.world.spawn(new BossFire(this.world, this.x - 8, this.y + 12, {
        vx: -2.4,
        vy: Math.sign((p.y - this.y)) * 0.35,
      }));
      this.world.sfx('bossFire');
      this.fireTimer = 100 - Math.floor(this.world.difficulty * 40);
    }
  }

  cull() {}

  onFireball() {
    this.hurtFlash = 8;
    this.world.sfx('bump');
    if (--this.hp <= 0) {
      this.kill(false);
      this.world.addScore(K.SCORE.boss, this.x, this.y);
      this.world.onBossDefeated();
      return true;
    }
    return false;                      // hit, but not killed: no fireball pop
  }

  onShell() { return this.onFireball(); }
  onStomp() { return false; }

  sprite() {
    return {
      name: (this.anim >> 4) & 1 ? 'boss1' : 'boss0',
      pal: this.hurtFlash > 0 && (this.hurtFlash & 1) ? 'bossAngry' : 'boss',
      flip: false,
      ox: -1,
    };
  }
}

export class BossFire extends Entity {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 8;
    this.vx = (opts && opts.vx) || -2.4;
    this.vy = (opts && opts.vy) || 0;
    this.active = true;
    this.stompable = false;
    this.fireproof = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.anim++;
  }

  onFireball() { return false; }
  onShell() { return false; }

  sprite() { return { name: 'boss_fire', pal: 'podoboo', flip: this.vx > 0 }; }
}

/* Names the level format uses, resolved when a level is loaded. */
export const ENTITY_TYPES = {
  goomba: Goomba,
  koopa: Koopa,
  shell: Shell,
  spiny: Spiny,
  piranha: Piranha,
  cheep: Cheep,
  blooper: Blooper,
  hammerbro: HammerBro,
  lakitu: Lakitu,
  cannon: Cannon,
  bullet: Bullet,
  podoboo: Podoboo,
  firebar: Firebar,
  platform: Platform,
  spring: Spring,
  axe: Axe,
  boss: Boss,
};
