/*
 * state.js — the whole world, as one plain object.
 *
 * Everything the game knows lives here and nothing else holds game data: no
 * module-level mutable state, no DOM, no closures over the current night. That
 * is a deliberate constraint and it buys three things — the state can be saved
 * by writing it to localStorage and resumed by reading it back, the headless
 * test can run a night in a loop with no browser anywhere, and the text mode
 * and the map mode are genuinely the same game rather than two that agree.
 *
 * The rng is the one exception: a function cannot be serialised, so the
 * function hangs off the state and its integer state is what gets saved.
 */

import { GAME_CONFIG } from '../data/config.js';
import { START_ROOM } from '../data/rooms.js';
import { startingInventory } from '../data/items.js';
import { makeRng } from '../core/rng.js';

export const PHASE = {
  MENU: 'menu',
  DAY: 'day',
  NIGHT: 'night',
  PAUSE: 'pause',
  OVER: 'over',
  WON: 'won',
};

export function createState(seed) {
  const s = {
    seed: seed >>> 0,
    rng: makeRng(seed),

    phase: PHASE.MENU,
    phaseBeforePause: null,
    night: 1,
    clock: 0,                 // seconds elapsed in the current phase
    phaseLength: 0,           // how long the current phase runs

    player: { room: START_ROOM },
    inv: startingInventory(GAME_CONFIG),
    stock: { tape: 0, planks: 0, nails: 0 },

    openings: [],
    threats: [],
    intruders: [],
    nextId: 1,

    danger: 0,

    neighbor: {
      callsLeft: GAME_CONFIG.NEIGHBOR_CALLS_TOTAL,
      status: 'idle',         // idle | coming | here | gone
      timer: 0,               // counts down to arrival, then counts down the help
      target: null,
      workTimer: 0,
      moveTimer: 0,
      warned: false,
      usedOnNights: [],
    },

    numberFound: false,
    drawerSearches: 0,

    /* Which hidden openings carry into tomorrow. The spec wants some of them
     * to come and go between nights, so this is decided at the end of a night
     * and read at the start of the next one. */
    hiddenCarry: [],

    timers: { defenseless: 0, caught: 0 },

    events: [],
    outcome: null,            // { kind: 'victory' | 'defeat', reason, night }

    stats: {
      shotsFired: 0,
      tapeUsed: 0,
      planksUsed: 0,
      nailsUsed: 0,
      breaches: 0,
      nightsSurvived: 0,
      neighborCalls: 0,
    },
  };
  return s;
}

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

export function findOpening(state, id) {
  return state.openings.find((o) => o.id === id) || null;
}

/* Present and either a real door or a hidden one the player has actually
 * found. Everything the player is allowed to see or act on goes through here,
 * so an unfound hole in the ceiling cannot be boarded up by guessing its name. */
export function visibleOpenings(state) {
  return state.openings.filter((o) => o.present && o.revealed);
}

export function openingsInRoom(state, roomId) {
  return visibleOpenings(state).filter((o) => o.room === roomId);
}

export function activeOpenings(state) {
  return state.openings.filter((o) => o.present);
}

export function breachedOpenings(state) {
  return state.openings.filter((o) => o.present && o.breached);
}

export function intrudersInRoom(state, roomId) {
  return state.intruders.filter((i) => i.room === roomId);
}

export function doorsUnderPressure(state) {
  return state.openings.filter(
    (o) => o.present && o.kind === 'door' && (o.integrity > 0 || o.breached),
  );
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export function canPlank(state) {
  return state.inv.hammer
    && state.inv.planks > 0
    && state.inv.nails >= GAME_CONFIG.NAILS_PER_PLANK;
}

export function canTape(state) {
  return state.inv.tape > 0;
}

/* The spec's fifth loss condition, made concrete: nothing left to shoot with,
 * nothing left to stick on, and either no boards or not enough nails to fix
 * one on. Whether that is fatal depends on what the openings are doing, which
 * rules.js decides — this only answers "is the cupboard bare". */
export function isDefenseless(state) {
  return state.inv.ammo <= 0
    && state.inv.tape <= 0
    && !canPlank(state);
}

export function nextId(state, prefix) {
  return `${prefix}_${state.nextId++}`;
}

/* ------------------------------------------------------------------ *
 * Save and load
 * ------------------------------------------------------------------ */

/* The rng function is rebuilt on load from the integer it was holding, so a
 * run resumed mid-night continues the same night rather than rerolling it. */
export function toSave(state) {
  const copy = JSON.parse(JSON.stringify(Object.assign({}, state, { rng: undefined })));
  delete copy.rng;
  copy.rngState = state.rng.state();
  return copy;
}

export function fromSave(save) {
  const s = Object.assign(createState(save.seed >>> 0), save);
  s.rng = makeRng(save.seed >>> 0);
  if (typeof save.rngState === 'number') s.rng.setState(save.rngState);
  delete s.rngState;
  return s;
}
