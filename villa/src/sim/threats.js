/*
 * threats.js — what is outside, and what it does with an opening.
 *
 * A threat is not a character. It is a unit of pressure with a target: it
 * picks an opening, spends six to eighteen seconds getting to it, and then
 * adds to that opening's integrity at the night's base rate, multiplied down
 * by whatever is nailed over it. Shooting it makes it stop, and sometimes makes
 * it pick somewhere else.
 *
 * They are never described in the interface, only heard. Nothing in the game
 * says what they are, and nothing in this file knows either.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import { randRange } from '../core/rng.js';
import { isAttackable, rateMul, stripBarricades } from './opening.js';
import { nextId } from './state.js';

/* Threats arrive over the first two thirds of the night rather than all at
 * once, so that a night has a shape: a quiet opening, a build, and a last
 * stretch with everything awake at the same time. */
export function scheduleThreats(state, night) {
  const count = night.threats;
  state.threats = [];
  for (let i = 0; i < count; i++) {
    state.threats.push({
      id: nextId(state, 'threat'),
      target: null,
      arriveIn: 0,
      stagger: 0,
      retarget: 0,
      /* The first is out there from the start; the rest fade in. */
      waking: i === 0 ? 0 : (night.seconds * 0.66) * (i / count) + randRange(state.rng, 0, 12),
    });
  }
}

/* Prefer whatever is closest to giving way, so pressure concentrates rather
 * than spreading evenly — an evenly-pressed house is a house where nothing
 * ever actually breaks, which is not a horror game. Ties break randomly so two
 * threats do not lockstep onto the same door every night. */
function chooseTarget(state) {
  const options = state.openings.filter(isAttackable);
  if (options.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const o of options) {
    const busy = state.threats.filter((t) => t.target === o.id).length;
    const score = o.integrity * GAME_CONFIG.TARGET_INTEGRITY_WEIGHT
      - busy * GAME_CONFIG.TARGET_BUSY_WEIGHT
      - (o.planks + o.tape) * 0.12        // barricades are mildly discouraging
      + state.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}

export function tickThreats(state, night, dt) {
  /* Recomputed from scratch each tick: the count of things actually working on
   * an opening drives both the breach rate and the wear, and deriving it is
   * cheaper than keeping two lists in agreement. */
  for (const o of state.openings) o.attackers = 0;

  for (const t of state.threats) {
    if (t.waking > 0) { t.waking -= dt; continue; }
    if (t.stagger > 0) { t.stagger = Math.max(0, t.stagger - dt); continue; }

    if (t.retarget > 0) { t.retarget -= dt; continue; }

    const current = t.target && state.openings.find((o) => o.id === t.target);
    if (!current || !isAttackable(current)) {
      const next = chooseTarget(state);
      t.target = next ? next.id : null;
      t.arriveIn = next
        ? randRange(state.rng, GAME_CONFIG.THREAT_APPROACH_MIN, GAME_CONFIG.THREAT_APPROACH_MAX)
        : 0;
      continue;
    }

    if (t.arriveIn > 0) { t.arriveIn -= dt; continue; }
    current.attackers += 1;
  }

  applyPressure(state, night, dt);
}

function applyPressure(state, night, dt) {
  for (const o of state.openings) {
    if (o.attackers <= 0 || !isAttackable(o)) continue;

    /* Quieter, and slower, while it is still getting away with it. */
    const stealth = (o.hidden && !o.revealed) ? GAME_CONFIG.HIDDEN_UNFOUND_MUL : 1;
    o.integrity += night.breachRate * rateMul(o) * o.attackers * stealth * dt;

    if (!o.announced.pressure && o.integrity >= 0.25) {
      o.announced.pressure = true;
      emit(state, 'under_pressure', { id: o.id, name: o.name, room: o.room });
    }
    if (!o.announced.critical && o.integrity >= GAME_CONFIG.CRITICAL_AT) {
      o.announced.critical = true;
      emit(state, 'critical', { id: o.id, name: o.name, room: o.room });
    }

    if (o.integrity >= 1) {
      o.integrity = 1;
      o.breached = true;
      stripBarricades(o);
      state.stats.breaches += 1;
      emit(state, 'breached', { id: o.id, name: o.name, room: o.room });
      spawnIntruder(state, o);
    }
  }
}

/* A breach is a countdown, not a verdict. Something comes through it after
 * eight seconds and starts walking; boarding the opening back up before then
 * costs a plank and two nails and nothing else. */
function spawnIntruder(state, o) {
  state.intruders.push({
    id: nextId(state, 'in'),
    from: o.id,
    room: o.room,
    delay: GAME_CONFIG.INTRUDER_DELAY,
    stepTimer: GAME_CONFIG.INTRUDER_STEP_SECONDS,
    repelTimer: 0,
    hits: 0,
    announced: false,
  });
}
