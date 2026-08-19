/*
 * flag.js — the thing you are out here for.
 *
 * It has four states and they are the shape of the night: not yet, waiting,
 * carried, home. The interesting one is `waiting`, because a flag that is
 * simply lying on the ground is a fetch quest — what makes it a game is that
 * it is inside something. The site says what: a locked mailbox wants a code, a
 * locked car wants four gnomes stood in the right order, a doghouse wants you
 * to reach past a dog.
 *
 * From the fifth night it moves if you leave it too long, which changes the
 * whole calculation: you can no longer stand at the corner and wait for her to
 * drift away.
 */

import { rngFrom } from '../core/rng.js';

export const FLAG = {
  WAITING: 'waiting',    /* before 3:31; nothing is out there yet          */
  PLACED: 'placed',
  CARRIED: 'carried',
  HOME: 'home',
};

export class Flag {
  constructor(layout, cfg, seed) {
    this.layout = layout;
    this.cfg = cfg;
    this.rng = rngFrom(((seed | 0) ^ 0x3fa1) + cfg.n * 131);
    this.state = FLAG.WAITING;
    this.site = layout.flagSite;
    this.x = this.site.x;
    this.y = this.site.y;
    this.z = this.site.z;
    this.age = 0;              /* how long it has sat where it is          */
    this.moves = 0;
    this.events = [];
  }

  place() {
    if (this.state !== FLAG.WAITING) return;
    this.state = FLAG.PLACED;
    this.age = 0;
    this.events.push({ type: 'appeared', site: this.site });
  }

  /*
   * Move to another site. Only ever to one with no lock: relocating into a
   * puzzle you have already solved would be free, and relocating into one you
   * have not, with ninety seconds left, is not a difficulty increase — it is
   * the night being taken away.
   */
  relocate() {
    const pool = this.layout.sites.filter((s) => s.id !== this.site.id && !s.lock);
    if (!pool.length) return;
    this.site = this.rng.pick(pool);
    this.x = this.site.x;
    this.y = this.site.y;
    this.z = this.site.z;
    this.age = 0;
    this.moves++;
    this.events.push({ type: 'moved', site: this.site });
  }

  update(dt) {
    this.events.length = 0;
    if (this.state !== FLAG.PLACED) return this.events;
    this.age += dt;
    /* A locked site never moves. Relocating out of a puzzle would hand the
     * night back to a player who was about to lose it, and relocating into
     * one with ninety seconds left is not difficulty, it is the night being
     * taken away. When the flag is behind a lock, the lock is the timer. */
    if (this.cfg.relocate && !this.site.lock && this.age > this.cfg.relocate) {
      this.relocate();
    }
    return this.events;
  }

  /* Close enough to take, and standing at the right height for it — the
   * branch and the garage roof both want you up there, not underneath. */
  inReach(player) {
    if (this.state !== FLAG.PLACED) return false;
    const d = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
    if (d > 2.1) return false;
    const dy = this.y - (player.pos.y + 0.9);
    if (dy > 1.3 || dy < -1.6) return false;
    if (this.site.crouch && !player.crouch) return false;
    return true;
  }

  take(player) {
    if (this.state !== FLAG.PLACED) return false;
    this.state = FLAG.CARRIED;
    player.carrying = true;
    this.events.push({ type: 'taken' });
    return true;
  }

  deliver() {
    this.state = FLAG.HOME;
    this.events.push({ type: 'home' });
  }

  /* Drawn on its pole where it waits, and held out to the right of the camera
   * once you have it — visible in the frame, because a red flag you cannot see
   * is a red flag you forget you are carrying, and carrying it is what is
   * making her notice you. */
  dynamics(out, cam, time) {
    if (this.state === FLAG.PLACED) {
      out.push({
        mesh: 'flag', x: this.x, y: this.y - 0.3, z: this.z,
        rot: Math.sin(time * 0.6) * 0.12, scale: 1,
      });
    } else if (this.state === FLAG.CARRIED) {
      const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      const ox = 0.42, oz = 0.55;
      out.push({
        mesh: 'flag',
        x: cam.x + ox * c - oz * -s,
        y: cam.y - 0.85 + Math.sin(time * 3.1) * 0.02,
        z: cam.z + ox * s + oz * -c,
        rot: cam.yaw + 0.5,
        pitch: 0.2 + Math.sin(time * 2.6) * 0.05,
        scale: 1,
      });
    }
  }
}
