/*
 * loop.js — a fixed 60Hz step with a rendered frame on top.
 *
 * The physics in game/constants.js are per-frame values lifted from a machine
 * that ran at exactly 60.098Hz and never missed. Feeding them a variable dt
 * would quietly change every jump arc with the refresh rate: on a 144Hz laptop
 * the same held jump would clear a different gap than on a 60Hz one. So the
 * simulation always advances in whole 1/60 steps and the display just draws
 * whatever the last step produced.
 *
 * Two guards matter. A backgrounded tab hands back a multi-second delta on
 * return, so the accumulator is clamped — better to drop time than to run two
 * hundred steps at once and teleport the player through a wall. And a slow
 * frame is allowed to run at most five steps, so a machine that cannot keep up
 * runs the game slightly slow instead of spiralling.
 */

const MAX_STEPS = 5;
const MAX_ACC = 0.25;

export function createLoop(step, draw) {
  const dt = 1 / 60;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let frames = 0;

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    const elapsed = last ? (now - last) / 1000 : dt;
    last = now;
    acc = Math.min(acc + elapsed, MAX_ACC);

    let n = 0;
    while (acc >= dt && n < MAX_STEPS) {
      acc -= dt;
      n++;
      frames++;
      step(frames);
    }
    /* Whatever is left over stays in the accumulator rather than being drawn
       as an interpolated in-between frame: at 16px tiles and integer art,
       interpolation reads as jitter, not smoothness. */
    if (n > 0) draw();
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() { return running; },
    get frames() { return frames; },
  };
}
