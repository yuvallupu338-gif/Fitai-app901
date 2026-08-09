/*
 * loop.js — the frame clock.
 *
 * dt is clamped hard. A tab left in the background for a minute comes back
 * with one enormous delta, and every integrator in the game — the player's
 * velocity, the door slide, the anomaly timers — would jump a minute forward
 * in one step. Clamping means the world simply pauses while the tab is hidden,
 * which is also what a paused horror game should do.
 */

export class Loop {
  constructor(step) {
    this.step = step;
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.elapsed = 0;
    this.frame = 0;
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = now();
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _tick() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);

    const t = now();
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > MAX_DT) dt = MAX_DT;

    this.elapsed += dt;
    this.frame++;

    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    this.step(dt, this.elapsed, this.frame);
  }
}

const MAX_DT = 1 / 15;

export const now = typeof performance !== 'undefined' && performance.now
  ? () => performance.now()
  : () => Date.now();
