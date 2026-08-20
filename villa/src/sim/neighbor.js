/*
 * neighbor.js — the two phone calls.
 *
 * The spec fixes three things and this file changes none of them: he can be
 * called twice in the whole week, he stays five minutes, and he works on
 * doors. What it adds is the thing that keeps him from being the answer to
 * everything — he works on **one door at a time**. He walks to whichever door
 * is worst, spends about twelve seconds getting it back and boarding it, then
 * moves to the next one. On night seven, with four doors under pressure and
 * eleven other openings that were never his to cover, that is a large help and
 * nowhere near a solution.
 *
 * He also takes twenty seconds to arrive, so calling him is a plan rather than
 * a panic button, and his five minutes are capped at whatever is left of the
 * night — which is exactly why calling him on night one wastes a call.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import { PHASE } from './state.js';
import { stripBarricades } from './opening.js';

const fail = (reason) => ({ ok: false, reason });

/* Every gate the spec asked for, in one place and in this order, so that the
 * message the player gets names the first thing actually wrong. */
export function canCall(state) {
  if (state.phase !== PHASE.NIGHT) return 'nightOnly';
  if (!state.numberFound) return 'phone_no_number';
  if (state.player.room !== GAME_CONFIG.PHONE_LOCATION) return 'phone_wrong_room';
  if (state.neighbor.callsLeft <= 0) return 'phone_no_calls';
  if (state.neighbor.status === 'coming' || state.neighbor.status === 'here') return 'phone_no_calls';
  return null;
}

export function call(state) {
  const why = canCall(state);
  if (why) { emit(state, why === 'nightOnly' ? 'phone_no_calls' : why); return fail(why); }

  const n = state.neighbor;
  n.callsLeft -= 1;
  n.status = 'coming';
  n.timer = GAME_CONFIG.NEIGHBOR_TRAVEL_SECONDS;
  n.warned = false;
  n.target = null;
  n.workTimer = 0;
  n.moveTimer = 0;
  n.usedOnNights.push(state.night);
  state.stats.neighborCalls += 1;
  emit(state, 'phone_dialing', { callsLeft: n.callsLeft });
  return { ok: true, reason: null, callsLeft: n.callsLeft };
}

/* Doors only — never a window, never a hole in a floor. Worst first, and a
 * breached door outranks any intact one however far gone it is, because a door
 * standing open is the thing he is actually there for. */
function chooseDoor(state) {
  const doors = state.openings.filter(
    (o) => o.present && o.revealed && o.kind === 'door' && (o.breached || o.integrity > 0.05),
  );
  if (doors.length === 0) return null;
  doors.sort((a, b) => (Number(b.breached) - Number(a.breached)) || (b.integrity - a.integrity));
  return doors[0];
}

export function tickNeighbor(state, dt) {
  const n = state.neighbor;
  if (n.status === 'idle' || n.status === 'gone') return;

  if (n.status === 'coming') {
    n.timer -= dt;
    if (n.timer <= 0) {
      n.status = 'here';
      /* Capped at what is left of the night. Five minutes is five minutes, but
       * he does not stay past dawn. */
      n.timer = Math.min(GAME_CONFIG.NEIGHBOR_HELP_SECONDS, state.phaseLength - state.clock);
      emit(state, 'neighbor_arrived');
    }
    return;
  }

  /* status === 'here' */
  n.timer -= dt;
  if (!n.warned && n.timer <= GAME_CONFIG.NEIGHBOR_WARN_SECONDS) {
    n.warned = true;
    emit(state, 'neighbor_leaving_soon');
  }
  if (n.timer <= 0) {
    n.status = 'gone';
    n.target = null;
    emit(state, 'neighbor_left');
    return;
  }

  if (n.moveTimer > 0) { n.moveTimer -= dt; return; }

  const current = n.target && state.openings.find((o) => o.id === n.target);
  const stillWorth = current && current.present
    && (current.breached || current.integrity > 0.05);
  if (!stillWorth) {
    const next = chooseDoor(state);
    if (!next) return;                       // nothing for him to do this second
    n.target = next.id;
    n.workTimer = 0;
    n.moveTimer = GAME_CONFIG.NEIGHBOR_MOVE_SECONDS;
    emit(state, 'neighbor_working', { id: next.id, name: next.name });
    return;
  }

  /* Holding the door: he pulls integrity back faster than it is being pushed
   * on most nights, but only on the one door he is standing at. */
  current.integrity = Math.max(0, current.integrity - GAME_CONFIG.NEIGHBOR_RELIEF_RATE * dt);
  if (current.integrity < GAME_CONFIG.CRITICAL_AT) current.announced.critical = false;
  n.workTimer += dt;

  if (n.workTimer >= GAME_CONFIG.NEIGHBOR_WORK_SECONDS) {
    /* And then he boards it, with his own timber. This is the part worth two
     * calls a week: it costs the player no planks and no nails. */
    if (current.breached) {
      current.breached = false;
      stripBarricades(current);
      current.integrity = GAME_CONFIG.PLANK_REBUILD_INTEGRITY;
      current.mainTimer = 0;
      state.intruders = state.intruders.filter((i) => i.from !== current.id);
      emit(state, 'resecured', { id: current.id, name: current.name });
    }
    if (current.planks < GAME_CONFIG.PLANK_MAX) {
      current.planks += 1;
      current.plankHp = GAME_CONFIG.PLANK_HP;
      emit(state, 'plank_applied', { id: current.id, name: current.name, by: 'neighbor' });
    }
    n.target = null;
    n.workTimer = 0;
  }
}

/* He does not stay between nights, and the calls he has left do. */
export function resetForNight(state) {
  const n = state.neighbor;
  n.status = 'idle';
  n.timer = 0;
  n.target = null;
  n.workTimer = 0;
  n.moveTimer = 0;
  n.warned = false;
}

export function isHelping(state) {
  return state.neighbor.status === 'here';
}
