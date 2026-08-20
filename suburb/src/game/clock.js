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

/*
 * The evening before it, at a minute an hour.
 *
 * The afternoon used to have no clock at all: the player wandered until they
 * pressed E on a bed. That made the daylight walk free, and a free walk is one
 * with nothing at stake — you could talk to all ten neighbours, or none, and
 * the night was the same either way.
 *
 * So it runs, and it runs fast: one real minute is one game hour. Four real
 * minutes from four in the afternoon to eight in the evening, and at eight the
 * street goes indoors and stays there. Everything tonight's lock needs is in
 * those four minutes and in nobody's mouth afterwards.
 *
 * The compression is the whole point of the two clocks being different. An
 * hour a minute is a summary of an afternoon; the night is one real second to
 * one game second because the player has to be able to feel what a minute of
 * it costs. Nothing else in the game runs at any other rate.
 */
export const DAY_START_H = 16;      /* four in the afternoon                 */
export const DAY_INSIDE_H = 20;     /* and everybody is indoors by eight     */

export class DayClock {
  constructor() {
    this.t = 0;                     /* real seconds since the afternoon began */
    this.running = false;
  }

  start() { this.t = 0; this.running = true; }
  stop() { this.running = false; }
  update(dt) { if (this.running) this.t += dt; }

  /* One real second is one game minute, which is the same statement as one
   * real minute being one game hour and is the form the arithmetic wants. */
  get minutes() { return DAY_START_H * 60 + this.t; }
  get hour() { return this.minutes / 60; }
  get insideYet() { return this.hour >= DAY_INSIDE_H; }
  /* How much of the afternoon is left, in real seconds, for the HUD bar. */
  get leftReal() { return Math.max(0, (DAY_INSIDE_H - DAY_START_H) * 60 - this.t); }

  /* "18:24". No seconds: a clock ticking sixty times a minute in a scene that
   * lasts four of them is a stopwatch, and this is meant to read as an
   * afternoon going by. */
  get text() {
    const m = Math.floor(this.minutes);
    return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
  }
}

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
