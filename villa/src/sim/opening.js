/*
 * opening.js — what an opening is, and how hard it is to come through.
 *
 * `integrity` runs 0 (untouched) to 1 (given way), which reads backwards from
 * the word but keeps every rate in the game a positive number added to it.
 * Barricades do not add integrity; they multiply the rate at which it climbs,
 * which is the difference between "tape makes this stronger" and "tape buys
 * you time", and the second is the game the spec asked for.
 */

import { GAME_CONFIG } from '../data/config.js';
import { OPENING_STATES, BARRICADE_STATES } from '../data/openings.js';

export function makeOpening(def, opts) {
  const o = {
    id: def.id,
    name: def.name,
    room: def.room,
    kind: (opts && opts.hidden) ? 'hidden' : def.kind,
    isMain: !!def.isMain,
    side: def.side || null,
    at: typeof def.at === 'number' ? def.at : 0.5,

    hidden: !!(opts && opts.hidden),
    where: def.where || null,
    canTape: def.canTape === undefined ? true : !!def.canTape,

    integrity: 0,
    tape: 0,
    tapeHp: 0,
    planks: 0,
    plankHp: 0,
    breached: false,

    present: true,
    /* A regular door is visible from the moment the night starts. A hole in a
     * ceiling is not visible, is not attackable, and does not exist as far as
     * the player is concerned until it wakes up and is then found. */
    revealed: !(opts && opts.hidden),
    hinted: false,
    wakeAt: (opts && opts.wakeAt) || 0,
    awake: !(opts && opts.hidden),

    attackers: 0,
    selfRevealTimer: 0,
    mainTimer: 0,
    announced: { pressure: false, critical: false },
  };
  return o;
}

/* The multiplier a barricade stack puts on the breach rate. Tape and boards
 * compound, with a floor: three boards and two rolls of tape is 0.09 × 0.40 =
 * 0.036, which would be a night's work to get through, so the floor puts it at
 * 0.06 and keeps "impenetrable" out of the game. */
export function rateMul(o) {
  const p = GAME_CONFIG.PLANK_MUL[Math.min(o.planks, GAME_CONFIG.PLANK_MAX)];
  const t = GAME_CONFIG.TAPE_MUL[Math.min(o.tape, GAME_CONFIG.TAPE_MAX)];
  return Math.max(p * t, GAME_CONFIG.BARRICADE_MIN_MUL);
}

/* Safe · under pressure · nearly through · breached. The UI ranks openings by
 * this and the text mode prints it, so both describe an opening the same way. */
export function openingState(o) {
  if (o.breached) return OPENING_STATES[3];
  if (o.integrity >= GAME_CONFIG.CRITICAL_AT) return OPENING_STATES[2];
  if (o.integrity >= 0.25) return OPENING_STATES[1];
  return OPENING_STATES[0];
}

/* Reported separately, because an opening is nearly always both something and
 * barricaded-something: "חסום חלקית, תחת לחץ" is the normal case. */
export function barricadeState(o) {
  if (o.planks >= 2 || (o.planks >= 1 && o.tape >= 1)) return BARRICADE_STATES.full;
  if (o.planks >= 1 || o.tape >= 1) return BARRICADE_STATES.partial;
  return BARRICADE_STATES.none;
}

export function barricadeKey(o) {
  if (o.planks >= 2 || (o.planks >= 1 && o.tape >= 1)) return 'full';
  if (o.planks >= 1 || o.tape >= 1) return 'partial';
  return 'none';
}

/* Only openings that are present, awake and attackable count as targets. A
 * hidden opening that has not woken yet is not a way in — it is a rumour. */
export function isAttackable(o) {
  return o.present && o.awake && !o.breached;
}

/* Everything a barricade was holding is lost when the opening gives way. That
 * is what makes a breach expensive rather than merely bad: re-securing it
 * costs boards you already spent once. */
export function stripBarricades(o) {
  o.tape = 0;
  o.tapeHp = 0;
  o.planks = 0;
  o.plankHp = 0;
}

export function describe(o) {
  const parts = [openingState(o).name, barricadeState(o)];
  return `${o.name} — ${parts.join(', ')}`;
}
