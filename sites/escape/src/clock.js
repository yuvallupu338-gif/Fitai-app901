/* clock.js — the 60:00 in the hero.
 *
 * It counts a deadline down against Date.now() on every tick. An interval that
 * subtracts one second from a counter drifts by seconds a minute on a busy tab,
 * and a clock that is wrong is worse than no clock at all — this one is meant
 * to be the same object the visitor will be watching inside the room.
 */

import { qs, reduced } from './dom.js';

const GAME = 60 * 60 * 1000;
const LOW = 10 * 60 * 1000;
const TICK = 250;

export function initClock() {
  const clock = qs('[data-clock]');
  if (!clock) return;

  const mm = qs('[data-clock-mm]', clock);
  const ss = qs('[data-clock-ss]', clock);
  const colon = qs('[data-clock-colon]', clock);
  const face = qs('[data-clock-time]', clock);
  const over = qs('[data-clock-over]', clock);
  const restart = qs('[data-clock-restart]');

  let deadline = Date.now() + GAME;
  let hiddenAt = 0;
  let timer = 0;

  const pad = (n) => String(n).padStart(2, '0');

  const paint = () => {
    const left = Math.max(0, deadline - Date.now());
    const secs = Math.ceil(left / 1000);
    mm.textContent = pad(Math.floor(secs / 60));
    ss.textContent = pad(secs % 60);

    const low = left <= LOW;
    clock.classList.toggle('is-low', low && left > 0);
    /* The blink is decoration on top of information: the digits stay lit either
       way, and under reduced motion the colon simply does not move. */
    colon.classList.toggle('is-blinking', low && left > 0 && !reduced());

    if (left === 0) stop();
  };

  const run = () => {
    if (timer) return;
    timer = setInterval(paint, TICK);
  };

  const halt = () => { clearInterval(timer); timer = 0; };

  const stop = () => {
    halt();
    clock.classList.remove('is-low');
    colon.classList.remove('is-blinking');
    face.hidden = true;
    over.hidden = false;
    restart.hidden = false;
  };

  restart.addEventListener('click', () => {
    deadline = Date.now() + GAME;
    hiddenAt = 0;
    face.hidden = false;
    over.hidden = true;
    restart.hidden = true;
    /* The button that was focused is about to disappear, so hand focus to the
       thing that replaced it instead of dropping it on the body. */
    clock.tabIndex = -1;
    clock.focus();
    paint();
    run();
  });

  /* A backgrounded tab is not a room you are standing in. The deadline moves
     forward by exactly the time the page spent hidden. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      halt();
      return;
    }
    if (hiddenAt) {
      deadline += Date.now() - hiddenAt;
      hiddenAt = 0;
    }
    if (!over.hidden) return;
    paint();
    run();
  });

  paint();
  run();
}
