/*
 * barricade.js — the two ways to shut something, and how both of them fail.
 *
 * Tape is fast, weak and temporary: it multiplies the breach rate down to
 * 0.55, wears through under attack, and when it goes it goes all at once. A
 * board is slow, strong and costs two nails: 0.30 for the first, 0.16 for the
 * second, 0.09 for a third. Neither of them is a repair — integrity that has
 * already been lost stays lost until somebody pushes the thing back, which is
 * what `repair` is for and why it takes thirty-five seconds and no materials.
 *
 * Every function here returns `{ ok, reason }` rather than throwing, because
 * both front-ends need to say why something did not happen, in Hebrew, without
 * catching anything.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import { stripBarricades } from './opening.js';

const fail = (reason) => ({ ok: false, reason });
const done = (extra) => Object.assign({ ok: true, reason: null }, extra);

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

export function applyTape(state, o) {
  if (!o.present || !o.revealed) return fail('notRevealed');
  if (!o.canTape) return fail('cantTape');
  if (o.breached) return fail('cantTape');       // tape does not close a breach
  if (state.inv.tape <= 0) return fail('noTape');
  if (o.tape >= GAME_CONFIG.TAPE_MAX) return fail('alreadyMax');

  state.inv.tape -= 1;
  state.stats.tapeUsed += 1;
  o.tape += 1;
  /* Hit points are for the stack, not per layer — a second roll over the first
   * renews the whole patch, which is why re-taping is a real option when a
   * board is not affordable. */
  o.tapeHp = GAME_CONFIG.TAPE_HP;
  emit(state, 'tape_applied', { id: o.id, name: o.name });
  return done();
}

export function applyPlank(state, o) {
  if (!o.present || !o.revealed) return fail('notRevealed');
  if (!state.inv.hammer) return fail('noHammer');
  if (state.inv.planks <= 0) return fail('noPlanks');
  if (state.inv.nails < GAME_CONFIG.NAILS_PER_PLANK) return fail('noNails');
  if (!o.breached && o.planks >= GAME_CONFIG.PLANK_MAX) return fail('alreadyMax');

  state.inv.planks -= 1;
  state.inv.nails -= GAME_CONFIG.NAILS_PER_PLANK;
  state.stats.planksUsed += 1;
  state.stats.nailsUsed += GAME_CONFIG.NAILS_PER_PLANK;

  /* Boarding up something that has already given way is the only way back
   * from a breach, and it does not come back clean: the opening restarts at
   * PLANK_REBUILD_INTEGRITY, badly damaged and holding. */
  if (o.breached) {
    o.breached = false;
    stripBarricades(o);
    o.integrity = GAME_CONFIG.PLANK_REBUILD_INTEGRITY;
    o.planks = 1;
    o.plankHp = GAME_CONFIG.PLANK_HP;
    o.mainTimer = 0;
    o.announced.critical = false;
    /* Whatever came through it has no doorway to stand in any more. */
    state.intruders = state.intruders.filter((i) => i.from !== o.id);
    emit(state, 'resecured', { id: o.id, name: o.name });
    return done({ resecured: true });
  }

  o.planks += 1;
  o.plankHp = GAME_CONFIG.PLANK_HP;
  emit(state, 'plank_applied', { id: o.id, name: o.name });
  return done();
}

/* No materials, only time. Shoulder against the door, shove the sideboard
 * back. It buys integrity, never a barricade. */
export function repair(state, o) {
  if (!o.present || !o.revealed) return fail('notRevealed');
  if (o.breached) return fail('cantTape');       // past repairing; needs a board
  if (o.integrity <= 0) return fail('alreadyMax');

  o.integrity = Math.max(0, o.integrity - GAME_CONFIG.REPAIR_AMOUNT);
  if (o.integrity < GAME_CONFIG.CRITICAL_AT) o.announced.critical = false;
  if (o.integrity < 0.25) o.announced.pressure = false;
  emit(state, 'repaired', { id: o.id, name: o.name });
  return done();
}

/* ------------------------------------------------------------------ *
 * Wearing out
 * ------------------------------------------------------------------ */

/*
 * Called once per tick per opening being worked on.
 *
 * **Tape wears through. Boards do not.** That asymmetry is straight out of the
 * specification — tape is the one described as breakable — and it is also the
 * only version of this that balances. Boards that expire were tried first and
 * they break the game from both ends: every barricade becomes temporary, so a
 * night can be lost to attrition no matter how well the afternoon was spent,
 * and the supply table stops being a budget you allocate and becomes a rate
 * you cannot keep up with. With boards permanent, what you nail up stays up
 * and the pressure comes from where it should — more openings than you have
 * nails for, and the ones that were not there yesterday.
 *
 * A board still goes, but only with the opening: `stripBarricades` clears
 * everything when integrity reaches one, so a breach costs you the timber you
 * already spent on it.
 *
 * Tape over a board is therefore a sacrificial layer, and a deliberate play:
 * the tape takes the wear, and the board underneath keeps its multiplier.
 */
export function wear(state, o, dt) {
  if (o.attackers <= 0 || o.tape <= 0) return;

  o.tapeHp -= GAME_CONFIG.TAPE_WEAR_PER_SEC * o.attackers * dt;
  if (o.tapeHp <= 0) {
    o.tape -= 1;
    o.tapeHp = o.tape > 0 ? GAME_CONFIG.TAPE_HP * 0.6 : 0;
    emit(state, 'tape_snapped', { id: o.id, name: o.name });
  }
}
