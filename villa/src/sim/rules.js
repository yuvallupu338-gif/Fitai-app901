/*
 * rules.js — the one way to win and the five ways to lose.
 *
 * All five loss conditions from the specification live here and nowhere else,
 * checked in a fixed order every tick, so that when a run ends the reason the
 * player is given is the reason that actually ended it. Four of the five run
 * on timers that reset the instant the situation improves — being in trouble
 * is not losing, and staying in it is.
 *
 * The order matters only for the message. A run that trips three of these in
 * the same tick was over either way.
 */

import { GAME_CONFIG, breachLimit } from '../data/config.js';
import { FAIL } from '../data/strings.js';
import { breachedOpenings } from './state.js';

export const LOSS = {
  BREACH_LIMIT: 'breach_limit',
  MAIN_BREACH: 'main_breach',
  CAUGHT: 'caught',
  DANGER_MAX: 'danger_max',
  DEFENSELESS: 'defenseless',
};

/*
 * Returns `{ reason, text }` if the run is over, or null. Never mutates the
 * state — night.js decides what to do about it.
 */
export function evaluate(state) {
  /* 1 — too many openings through at once. The house is no longer a house.
   * "Too many" is a third of whatever the villa has tonight, never fewer than
   * three — see the note in config.js. */
  if (breachedOpenings(state).length >= breachLimit(state.night)) {
    return { reason: LOSS.BREACH_LIMIT, text: FAIL.breach_limit };
  }

  /* 2 — a main door or main window standing open and nobody dealing with it. */
  const abandoned = state.openings.find(
    (o) => o.present && o.isMain && o.breached && o.mainTimer >= GAME_CONFIG.MAIN_BREACH_GRACE,
  );
  if (abandoned) {
    return { reason: LOSS.MAIN_BREACH, text: FAIL.main_breach, id: abandoned.id };
  }

  /* 3 — something got in and stayed in the room with you. */
  if (state.timers.caught >= GAME_CONFIG.CAUGHT_SECONDS) {
    return { reason: LOSS.CAUGHT, text: FAIL.caught };
  }

  /* 4 — the meter. Breaches drive it up fast, near-breaches slowly, and it
   * falls back whenever the house is quiet, so reaching the top takes a
   * sustained bad night rather than one bad moment. */
  if (state.danger >= GAME_CONFIG.DANGER_MAX) {
    return { reason: LOSS.DANGER_MAX, text: FAIL.danger_max };
  }

  /* 5 — no rounds, no tape, no usable boards, something about to give, and no
   * neighbour in the house. Twenty seconds to change one of those. */
  if (state.timers.defenseless >= GAME_CONFIG.DEFENSELESS_GRACE) {
    return { reason: LOSS.DEFENSELESS, text: FAIL.defenseless };
  }

  return null;
}

/* Victory is the absence of all of the above for seven nights, which night.js
 * declares at the end of night seven. Here for symmetry, and so that a reader
 * looking for the win condition finds it beside the loss conditions. */
export function hasWon(state) {
  return state.stats.nightsSurvived >= GAME_CONFIG.NIGHTS_TOTAL;
}
