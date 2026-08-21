/*
 * motion.js — one answer to "should this animate", for CSS and JavaScript alike.
 *
 * Two sources say no: the operating system's own reduced-motion setting, and
 * the switch in the profile. They are ORed, never overridden — the profile
 * setting exists for people whose OS is not configured that way but who still
 * want the interface to hold still, and it must not be possible for the app's
 * own preference to turn the system's answer back on.
 *
 * The result is mirrored onto <html data-motion="reduced"> so the stylesheet
 * can honour it, and exported as reduced() for the handful of animations that
 * are driven from script rather than CSS — the score counting up, mostly. Both
 * read the same function, so they cannot disagree.
 */

import { reduceMotion } from './dom.js';
import { get, subscribe } from './store.js';

export function reduced() {
  const profile = get().profile;
  return reduceMotion.matches || !!(profile && profile.reduceMotion);
}

function apply() {
  const el = document.documentElement;
  if (reduced()) el.setAttribute('data-motion', 'reduced');
  else el.removeAttribute('data-motion');
}

/*
 * iOS flips the system setting from the accessibility shortcut without
 * reloading the page, so this has to be a live subscription rather than a
 * question asked once at boot.
 */
export function watch() {
  apply();
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', apply);
  else if (reduceMotion.addListener) reduceMotion.addListener(apply);
  subscribe(apply);
}

/**
 * Count a number from one value to another.
 *
 * The one animation in this app that earns its place: the score moving from 74
 * to 86 after Apply is the moment the whole product is built around, and a
 * number that simply swaps has not shown anybody that something improved.
 * Returns a cancel function, and lands on the exact target whether or not it
 * was allowed to animate.
 */
export function countTo(from, to, ms, onFrame) {
  if (reduced() || from === to) {
    onFrame(to, 1);
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const tick = (t) => {
    const p = Math.min(1, (t - start) / ms);
    // Ease-out cubic: fast enough to feel responsive, settling slowly enough
    // that the final number is readable rather than snapped into place.
    const eased = 1 - Math.pow(1 - p, 3);
    onFrame(Math.round(from + (to - from) * eased), eased);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
