/*
 * night.js — the shape of a day and the shape of a night.
 *
 * One decision worth stating out loud, because it is the one a reader will
 * question: **the house is put back together every morning.** Openings reset
 * to undamaged and unboarded at the start of each day, and the day's
 * preparation time is spent barricading them again from that day's supply.
 *
 * The alternative — boards persisting across nights — was tried on paper and
 * collapses the game: by night five a careful player is watching a house that
 * is already sealed, the supply table stops meaning anything, and the
 * preparation phase turns into a button that says "begin". Resetting keeps
 * every morning a real allocation problem against that night's opening count,
 * which is the game the spec describes.
 */

import { GAME_CONFIG } from '../data/config.js';
import { nightData } from '../data/nights.js';
import { REGULAR_OPENINGS } from '../data/openings.js';
import { ROOM_BY_ID, nextStepToward } from '../data/rooms.js';
import { regularCount, daySeconds } from '../data/config.js';
import { emit } from '../core/events.js';
import { PHASE, breachedOpenings, isDefenseless } from './state.js';
import { makeOpening } from './opening.js';
import { wear } from './barricade.js';
import { reload } from './gun.js';
import { scheduleThreats, tickThreats } from './threats.js';
import { chooseHidden, rollPersistence, tickHidden } from './hidden.js';
import * as neighbor from './neighbor.js';
import { evaluate } from './rules.js';

/* ------------------------------------------------------------------ *
 * Morning
 * ------------------------------------------------------------------ */

export function beginDay(state) {
  const night = nightData(state.night);

  state.phase = PHASE.DAY;
  state.clock = 0;
  state.phaseLength = daySeconds(state.night);
  state.threats = [];
  state.intruders = [];
  state.danger = 0;
  state.timers.defenseless = 0;
  state.timers.caught = 0;
  neighbor.resetForNight(state);

  /* Tonight's openings, built now so the preparation phase has something to
   * work on. The hidden ones are here too — present, dormant, unfound — which
   * is what makes searching a room during the day a real option and not a
   * wasted three minutes. */
  const regular = REGULAR_OPENINGS
    .slice(0, regularCount(state.night))
    .map((def) => makeOpening(def));
  state.openings = regular.concat(chooseHidden(state, night));

  /* The rifle goes back to fifteen. Not plus fifteen. */
  reload(state);

  state.stock = {
    tape: night.supply.tape,
    planks: night.supply.planks,
    nails: night.supply.nails,
  };
  emit(state, 'supply_restock', { night: state.night });
  return state;
}

/* Preparation runs on a clock too, so that "check the drawer" and "board the
 * kitchen door" compete for the same three minutes. */
export function tickDay(state, dt) {
  state.clock += dt;
  if (state.clock >= state.phaseLength) beginNight(state);
}

/* ------------------------------------------------------------------ *
 * Dusk
 * ------------------------------------------------------------------ */

export function beginNight(state) {
  const night = nightData(state.night);
  state.phase = PHASE.NIGHT;
  state.clock = 0;
  state.phaseLength = night.seconds;
  state.intruders = [];
  state.timers.defenseless = 0;
  state.timers.caught = 0;
  neighbor.resetForNight(state);
  scheduleThreats(state, night);
  emit(state, 'night_start', { night: state.night, seconds: night.seconds });
  return state;
}

export function tickNight(state, dt) {
  const night = nightData(state.night);
  state.clock += dt;

  tickHidden(state, dt);
  tickThreats(state, night, dt);
  for (const o of state.openings) wear(state, o, dt);
  neighbor.tickNeighbor(state, dt);
  tickIntruders(state, dt);
  tickDanger(state, dt);
  tickLossTimers(state, dt);

  const outcome = evaluate(state);
  if (outcome) { endRun(state, outcome); return; }

  if (state.clock >= state.phaseLength) endNight(state);
}

/* ------------------------------------------------------------------ *
 * What came through
 * ------------------------------------------------------------------ */

function tickIntruders(state, dt) {
  for (const it of state.intruders) {
    if (it.delay > 0) {
      it.delay -= dt;
      if (it.delay <= 0 && !it.announced) {
        it.announced = true;
        emit(state, 'intruder_in', { room: it.room, roomName: ROOM_BY_ID[it.room].name });
      }
      continue;
    }
    if (it.repelTimer > 0) { it.repelTimer -= dt; continue; }

    if (it.room === state.player.room) continue;   // already where it wants to be
    it.stepTimer -= dt;
    if (it.stepTimer <= 0) {
      it.stepTimer = GAME_CONFIG.INTRUDER_STEP_SECONDS;
      it.room = nextStepToward(it.room, state.player.room);
      if (it.room === state.player.room) emit(state, 'intruder_near');
    }
  }
}

/* ------------------------------------------------------------------ *
 * The meter
 * ------------------------------------------------------------------ */

/* Net rate. Decay is always subtracted — see the note on DANGER_DECAY in
 * config.js for why "only decay when nothing at all is wrong" does not
 * survive contact with a house that has fifteen openings in it. */
function tickDanger(state, dt) {
  let rise = 0;
  for (const o of state.openings) {
    if (!o.present) continue;
    if (o.breached) rise += GAME_CONFIG.DANGER_PER_BREACH;
    else if (o.integrity >= GAME_CONFIG.CRITICAL_AT) rise += GAME_CONFIG.DANGER_PER_CRITICAL;
  }
  state.danger += (rise - GAME_CONFIG.DANGER_DECAY) * dt;
  state.danger = Math.max(0, Math.min(GAME_CONFIG.DANGER_MAX, state.danger));
}

/*
 * Three clocks that only run while something is wrong, and reset the moment it
 * stops being wrong. They are the difference between a loss condition that
 * fires on a bad second and one that fires on a bad decision.
 */
function tickLossTimers(state, dt) {
  for (const o of state.openings) {
    if (!o.present) continue;
    o.mainTimer = (o.isMain && o.breached) ? o.mainTimer + dt : 0;
  }

  const inRoom = state.intruders.some(
    (i) => i.delay <= 0 && i.repelTimer <= 0 && i.room === state.player.room,
  );
  state.timers.caught = inRoom ? state.timers.caught + dt : 0;

  const exposed = state.openings.some(
    (o) => o.present && (o.breached || o.integrity >= GAME_CONFIG.DEFENSELESS_AT),
  );
  const bare = isDefenseless(state) && exposed && !neighbor.isHelping(state);
  if (bare && state.timers.defenseless === 0) emit(state, 'defenseless');
  state.timers.defenseless = bare ? state.timers.defenseless + dt : 0;
}

/* ------------------------------------------------------------------ *
 * Dawn
 * ------------------------------------------------------------------ */

export function endNight(state) {
  state.stats.nightsSurvived += 1;
  emit(state, 'night_survived', { night: state.night });
  rollPersistence(state);

  if (state.night >= GAME_CONFIG.NIGHTS_TOTAL) {
    state.phase = PHASE.WON;
    state.outcome = { kind: 'victory', reason: null, night: state.night };
    return;
  }
  state.night += 1;
  beginDay(state);
}

export function endRun(state, outcome) {
  state.phase = PHASE.OVER;
  state.outcome = Object.assign({ kind: 'defeat', night: state.night }, outcome);
}

/* How many openings are currently through, for the interface and for the
 * loss check that counts them. */
export function breachCount(state) {
  return breachedOpenings(state).length;
}
