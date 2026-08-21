/*
 * scoreanim.js — where the score dial should count up from.
 *
 * One number, handed from whoever changed the day to whoever draws it next. It
 * lives in its own file because the two ends are the home screen and the
 * improve panel, and having either import the other made them import each other:
 * home opens improve, improve tells home what the old score was. Real ES modules
 * shrug at that, so it worked in the browser for as long as the app was only
 * ever served — and it took the single-file build down with a blank page,
 * because a flattened bundle has to pick an order and one of the two always
 * loses.
 *
 * It is deliberately a one-shot. The dial animates once, on the render that
 * follows the change, and a value left lying around would make an unrelated
 * later repaint count up from a number nobody remembers.
 */

let pending;

/** Remember the score the dial should animate away from. */
export function animateFrom(previousScore) {
  pending = previousScore;
}

/** Take it, once. Returns undefined when there is nothing to animate. */
export function takeAnimateFrom() {
  const value = pending;
  pending = undefined;
  return value;
}
