/*
 * clock.js — the five minutes.
 *
 * One game second is one real second. That is not a technical decision, it is
 * the design: the HUD says 3:33:12 and the player can feel what a minute of it
 * costs, which is the entire tension of the game. Everything else in this file
 * exists so that no other module has to do arithmetic on it.
 *
 * The clock runs from the night's start time to 3:35:00 and then stops. It
 * does not pause when a puzzle panel is open — a keypad you can stand at
 * forever is a keypad with no cost, and the cost is the puzzle.
 */

import { nightConfig } from './nights.js';

export const PHASE = {
  GRACE: 'grace',      /* she is out, the flag has not appeared yet         */
  HUNT: 'hunt',        /* the flag is somewhere; go                          */
  CARRY: 'carry',      /* you have it; get home                              */
  OVER: 'over',        /* 3:35, and you did not                              */
};

export class Clock {
  constructor(night) {
    this.cfg = nightConfig(night);
    this.t = 0;                       /* seconds since the night started    */
    this.running = false;
    this.phase = PHASE.GRACE;
  }

  start() {
    this.t = 0;
    this.running = true;
    this.phase = PHASE.GRACE;
  }

  stop() { this.running = false; }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.running = false;
      this.phase = PHASE.OVER;
    } else if (this.phase === PHASE.GRACE && this.t >= this.flagAt) {
      this.phase = PHASE.HUNT;
    }
  }

  get duration() { return this.cfg.end - this.cfg.start; }
  get flagAt() { return this.cfg.flag - this.cfg.start; }
  get timeLeft() { return Math.max(0, this.duration - this.t); }
  get flagIn() { return Math.max(0, this.flagAt - this.t); }
  /* Absolute seconds past 3:00:00, which is what the HUD shows. */
  get absolute() { return this.cfg.start + this.t; }

  /* "3:31:24". Padded, and always three fields: a clock that switches between
   * 3:31 and 3:31:04 makes the last minute unreadable at exactly the moment
   * the player is reading it most. */
  get text() {
    const total = Math.floor(this.absolute);
    const h = 3 + Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /* 0 at the start of the night, 1 when the whistle stops. */
  get progress() { return this.duration > 0 ? this.t / this.duration : 0; }
}
