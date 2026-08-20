/*
 * sim.js — the only thing a front-end talks to.
 *
 * Two drivers run this same core. The map screen calls `step(dt)` sixty times
 * a second; the Hebrew text mode calls `advance(25)` when the player tapes a
 * window. Both go through one fixed-timestep accumulator, so a night played by
 * typing and a night played by clicking integrate at exactly the same
 * granularity and reach exactly the same state — which is the property that
 * makes "two front-ends over one game" true rather than aspirational, and the
 * headless test checks it directly.
 *
 * Actions do not charge their own time. `perform` validates and applies; the
 * caller decides when the clock moves, because the two front-ends want opposite
 * orders — text mode charges the cost and then applies, the map screen holds
 * the player still for the duration and applies at the end.
 */

import { GAME_CONFIG } from '../data/config.js';
import { ROOM_BY_ID, areAdjacent } from '../data/rooms.js';
import { emit } from '../core/events.js';
import { seedFrom } from '../core/rng.js';
import {
  PHASE, createState, findOpening, canPlank,
} from './state.js';
import { applyTape, applyPlank, repair } from './barricade.js';
import { canCall } from './neighbor.js';
import { shootOpening, shootIntruder, autoTarget } from './gun.js';
import { searchRoom } from './hidden.js';
import { searchDrawer } from './drawer.js';
import { usePhone } from './phone.js';
import { beginDay, beginNight, tickDay, tickNight } from './night.js';

/* Passed through as a plain binding. The bundler in tools/build-single.js
 * reads imports and exports but not the forwarding form (`export { X } from
 * './y.js'`), and the single-file build is how this game is actually kept. */
export { PHASE };

/* ------------------------------------------------------------------ *
 * Starting
 * ------------------------------------------------------------------ */

export function newRun(seed) {
  const s = createState(typeof seed === 'string' ? seedFrom(seed) : (seed >>> 0) || 1);
  s.accum = 0;
  beginDay(s);
  return s;
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/*
 * The accumulator is the whole trick. Whatever size chunk a caller hands in,
 * the world only ever moves in TICK_MAX slices and the remainder is carried,
 * so sixty small steps and one large one land on the same integer number of
 * slices. Without this, a threshold crossed at 0.24 seconds into a slice would
 * land differently depending on who was driving.
 */
export function step(state, dt) {
  if (state.phase === PHASE.OVER || state.phase === PHASE.WON
    || state.phase === PHASE.PAUSE || state.phase === PHASE.MENU) return state;

  state.accum = (state.accum || 0) + Math.max(0, dt);
  let guard = 0;
  while (state.accum >= GAME_CONFIG.TICK_MAX) {
    state.accum -= GAME_CONFIG.TICK_MAX;
    tick(state, GAME_CONFIG.TICK_MAX);
    if (state.phase === PHASE.OVER || state.phase === PHASE.WON) { state.accum = 0; break; }
    /* A pathological dt (a backgrounded tab handing over four minutes) must
     * not lock the loop up; the night has a length and cannot need more slices
     * than that. */
    if (++guard > 20000) { state.accum = 0; break; }
  }
  return state;
}

/* The same function under the name the turn-based driver uses, because
 * `advance(25)` reads correctly at a text prompt and `step(25)` does not. */
export const advance = step;

function tick(state, dt) {
  if (state.phase === PHASE.DAY) tickDay(state, dt);
  else if (state.phase === PHASE.NIGHT) tickNight(state, dt);
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/*
 * What each action costs in game seconds. Looking at things is free; anything
 * that puts your hands on the house is not.
 *
 * Daylight is cheaper. The same board goes up in a third of the time when you
 * are not stopping every few seconds to work out what that noise was, and that
 * multiplier is what makes a three-hundred-second afternoon enough to prepare
 * for night one comfortably and not quite enough for night seven.
 */
export function actionCost(action, phase) {
  const C = GAME_CONFIG;
  const scale = phase === PHASE.DAY ? C.DAY_ACTION_SCALE : 1;
  return rawCost(action, C) * scale;
}

function rawCost(action, C) {
  switch (action.type) {
    case 'move': return C.MOVE_SECONDS;
    case 'tape': return C.TAPE_SECONDS;
    case 'plank': return C.PLANK_SECONDS;
    case 'repair': return C.REPAIR_SECONDS;
    case 'shoot': return C.GUN_SHOT_SECONDS;
    case 'search': return C.SEARCH_SECONDS;
    case 'drawer': return C.SEARCH_SECONDS;
    case 'gather': return C.GATHER_SECONDS;
    case 'call': return C.CALL_SECONDS;
    case 'wait': return C.WAIT_SECONDS;
    default: return 0;
  }
}

const fail = (reason) => ({ ok: false, reason, cost: 0 });

/*
 * Can this be attempted at all? Checked before a single second is charged,
 * because "repair the window" typed at a window that is already through should
 * cost nothing — the player learns it is too late, not that they wasted
 * thirty-five seconds finding out.
 *
 * It deliberately does not check everything `perform` checks. Whether the
 * opening survives the time your hands are busy is not knowable up front, and
 * that failure — starting a board and having the thing give way under it — is
 * one the game should keep.
 */
export function canPerform(state, action) {
  if (state.phase !== PHASE.DAY && state.phase !== PHASE.NIGHT) return 'nightOnly';
  switch (action.type) {
    case 'move': {
      if (!ROOM_BY_ID[action.room]) return 'unknownRoom';
      if (action.room === state.player.room) return 'notHere';
      if (!areAdjacent(state.player.room, action.room)) return 'needAdjacent';
      return null;
    }
    case 'tape': case 'plank': case 'repair': {
      const o = findOpening(state, action.id);
      if (!o) return 'unknownTarget';
      if (o.room !== state.player.room) return 'notHere';
      if (!o.present || !o.revealed) return 'notRevealed';
      if (action.type === 'tape') {
        if (!o.canTape || o.breached) return 'cantTape';
        if (state.inv.tape <= 0) return 'noTape';
        if (o.tape >= GAME_CONFIG.TAPE_MAX) return 'alreadyMax';
      }
      if (action.type === 'plank') {
        if (!state.inv.hammer) return 'noHammer';
        if (state.inv.planks <= 0) return 'noPlanks';
        if (state.inv.nails < GAME_CONFIG.NAILS_PER_PLANK) return 'noNails';
        if (!o.breached && o.planks >= GAME_CONFIG.PLANK_MAX) return 'alreadyMax';
      }
      if (action.type === 'repair') {
        if (o.breached) return 'cantTape';
        if (o.integrity <= 0) return 'alreadyMax';
      }
      return null;
    }
    case 'shoot': {
      if (state.inv.ammo <= 0) return 'noAmmo';
      if (action.id === 'intruder') {
        return state.intruders.some((i) => i.room === state.player.room) ? null : 'notHere';
      }
      if (action.id) {
        const o = findOpening(state, action.id);
        if (!o) return 'unknownTarget';
        if (o.room !== state.player.room) return 'notHere';
        if (!o.present || !o.revealed) return 'notRevealed';
        return null;
      }
      return autoTarget(state) ? null : 'notHere';
    }
    case 'drawer':
      if (state.player.room !== 'bedroom') return 'notHere';
      if (state.numberFound) return 'alreadyFound';
      return null;
    case 'gather':
      if (state.player.room !== 'supply') return 'notHere';
      if (state.stock.tape + state.stock.planks + state.stock.nails === 0) return 'supplyEmpty';
      return null;
    case 'call':
      return canCall(state);
    case 'ready':
      return state.phase === PHASE.DAY ? null : 'nightOnly';
    case 'search': case 'wait':
      return null;
    default:
      return 'unknown';
  }
}

/*
 * Validate and apply. Returns `{ ok, reason, cost }` — `reason` is a key in
 * strings.js PARSER, so both front-ends can say why in Hebrew without either
 * of them owning the vocabulary.
 */
export function perform(state, action) {
  if (state.phase !== PHASE.DAY && state.phase !== PHASE.NIGHT) return fail('nightOnly');
  const cost = actionCost(action, state.phase);

  switch (action.type) {
    case 'move': {
      const to = action.room;
      if (!ROOM_BY_ID[to]) return fail('unknownRoom');
      if (to === state.player.room) return fail('notHere');
      if (!areAdjacent(state.player.room, to)) return fail('needAdjacent');
      state.player.room = to;
      emit(state, 'moved', { room: to, roomName: ROOM_BY_ID[to].name });
      return { ok: true, reason: null, cost };
    }

    case 'tape':
    case 'plank':
    case 'repair': {
      const o = findOpening(state, action.id);
      if (!o) return fail('unknownTarget');
      if (o.room !== state.player.room) return fail('notHere');
      const fn = action.type === 'tape' ? applyTape : action.type === 'plank' ? applyPlank : repair;
      const r = fn(state, o);
      return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0 };
    }

    case 'shoot': {
      if (action.id === 'intruder') {
        const r = shootIntruder(state);
        return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0 };
      }
      if (!action.id) {
        const t = autoTarget(state);
        if (!t) return fail('notHere');
        const r = t.kind === 'intruder' ? shootIntruder(state) : shootOpening(state, t.target);
        return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0 };
      }
      const o = findOpening(state, action.id);
      if (!o) return fail('unknownTarget');
      const r = shootOpening(state, o);
      return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0 };
    }

    case 'search': {
      const found = searchRoom(state, state.player.room);
      /* A search that finds nothing still costs the thirty seconds. Searching
       * the wrong room is a decision with a price, which is the only thing
       * that makes searching the right one worth anything. */
      return { ok: true, reason: found ? null : 'foundNothing', cost, found };
    }

    case 'drawer': {
      const r = searchDrawer(state);
      return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0, found: r.found };
    }

    case 'gather': {
      if (state.player.room !== 'supply') return fail('notHere');
      const took = { tape: state.stock.tape, planks: state.stock.planks, nails: state.stock.nails };
      if (took.tape + took.planks + took.nails === 0) {
        emit(state, 'supply_empty');
        return fail('supplyEmpty');
      }
      state.inv.tape += took.tape;
      state.inv.planks += took.planks;
      state.inv.nails += took.nails;
      state.stock = { tape: 0, planks: 0, nails: 0 };
      emit(state, 'gathered', took);
      return { ok: true, reason: null, cost, took };
    }

    case 'call': {
      const r = usePhone(state);
      return { ok: r.ok, reason: r.reason, cost: r.ok ? cost : 0 };
    }

    case 'wait':
      return { ok: true, reason: null, cost };

    case 'ready': {
      if (state.phase !== PHASE.DAY) return fail('nightOnly');
      beginNight(state);
      return { ok: true, reason: null, cost: 0 };
    }

    default:
      return fail('unknown');
  }
}

/* The text front-end's order: pay for it, then do it. Anything can happen to
 * the house in the seconds your hands are busy, including the thing you were
 * reaching for giving way — which is correct, and is why the cost is charged
 * before the effect rather than after. */
export function performTimed(state, action) {
  const why = canPerform(state, action);
  if (why) return { ok: false, reason: why, cost: 0 };

  const cost = actionCost(action, state.phase);
  if (cost > 0) advance(state, cost);
  if (state.phase === PHASE.OVER || state.phase === PHASE.WON) {
    return { ok: false, reason: 'runEnded', cost };
  }
  const r = perform(state, action);
  return Object.assign({}, r, { cost });
}

/* ------------------------------------------------------------------ *
 * Pausing
 * ------------------------------------------------------------------ */

export function pause(state) {
  if (state.phase === PHASE.DAY || state.phase === PHASE.NIGHT) {
    state.phaseBeforePause = state.phase;
    state.phase = PHASE.PAUSE;
  }
  return state;
}

export function resume(state) {
  if (state.phase === PHASE.PAUSE && state.phaseBeforePause) {
    state.phase = state.phaseBeforePause;
    state.phaseBeforePause = null;
  }
  return state;
}

/* ------------------------------------------------------------------ *
 * A read-only view, for the interface
 * ------------------------------------------------------------------ */

export function snapshot(state) {
  return {
    phase: state.phase,
    night: state.night,
    nightsTotal: GAME_CONFIG.NIGHTS_TOTAL,
    timeLeft: Math.max(0, state.phaseLength - state.clock),
    phaseLength: state.phaseLength,
    room: state.player.room,
    roomName: ROOM_BY_ID[state.player.room].name,
    danger: state.danger,
    dangerPct: state.danger / GAME_CONFIG.DANGER_MAX,
    inv: Object.assign({}, state.inv),
    stock: Object.assign({}, state.stock),
    canPlank: canPlank(state),
    numberFound: state.numberFound,
    callsLeft: state.neighbor.callsLeft,
    neighborStatus: state.neighbor.status,
    neighborTimer: Math.max(0, state.neighbor.timer),
    outcome: state.outcome,
  };
}
