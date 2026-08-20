/*
 * gun.js — fifteen rounds, and what they are actually good for.
 *
 * The rifle is deliberately not a solution. It closes nothing and repairs
 * nothing: a shot buys about four and a half seconds of quiet at one opening,
 * and a third of the time drives the thing off it entirely. Fifteen of those
 * across a whole night is a lot of seconds, but it is seconds — spend them all
 * on the living-room window and the kitchen door is still going to give.
 *
 * The one place it does more than delay is inside the house. Something that
 * has already come through a breach can be shot back out of it, and that is
 * the only answer to an intruder besides walking away from it.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import { intrudersInRoom } from './state.js';

const fail = (reason) => ({ ok: false, reason });

/* Dawn. Sets ammo TO the daily figure — an unspent round last night is not a
 * sixteenth round today. The headless test asserts exactly this, because it is
 * the one number the spec fixed that a difficulty pass would quietly relax. */
export function reload(state) {
  state.inv.ammo = GAME_CONFIG.GUN_AMMO_PER_DAY;
  emit(state, 'dawn_reload', { ammo: state.inv.ammo });
  return state.inv.ammo;
}

/*
 * A shot at an opening. Everything working on it stops for GUN_STAGGER_SECONDS,
 * and each attacker independently rolls to be driven off the opening entirely,
 * in which case it has to pick a target and cross the ground again.
 */
export function shootOpening(state, o) {
  if (state.inv.ammo <= 0) { emit(state, 'no_ammo'); return fail('noAmmo'); }
  if (!o.present || !o.revealed) return fail('notRevealed');
  if (o.room !== state.player.room) return fail('notHere');

  state.inv.ammo -= 1;
  state.stats.shotsFired += 1;
  emit(state, 'shot', { id: o.id, name: o.name, left: state.inv.ammo });

  let repelled = 0;
  for (const t of state.threats) {
    if (t.target !== o.id) continue;
    t.stagger = GAME_CONFIG.GUN_STAGGER_SECONDS;
    if (state.rng() < GAME_CONFIG.GUN_REPEL_CHANCE) {
      t.target = null;
      t.retarget = GAME_CONFIG.THREAT_RETARGET_SECONDS;
      repelled += 1;
    }
  }
  if (repelled > 0) emit(state, 'shot_repelled', { id: o.id, name: o.name });
  return { ok: true, reason: null, repelled };
}

/*
 * A shot at whatever is in the room with you. Two hits put it back outside;
 * one buys ten seconds. Note that the breach it came from is still open — the
 * gun has not fixed anything, it has only moved the problem back to where the
 * boards can reach it.
 */
export function shootIntruder(state) {
  if (state.inv.ammo <= 0) { emit(state, 'no_ammo'); return fail('noAmmo'); }
  const here = intrudersInRoom(state, state.player.room);
  if (here.length === 0) return fail('notHere');

  state.inv.ammo -= 1;
  state.stats.shotsFired += 1;
  const it = here[0];
  it.hits += 1;
  it.repelTimer = GAME_CONFIG.INTRUDER_REPEL_SECONDS;
  emit(state, 'shot_intruder', { left: state.inv.ammo });

  if (it.hits >= GAME_CONFIG.GUN_INTRUDER_HITS) {
    state.intruders = state.intruders.filter((x) => x !== it);
    state.timers.caught = 0;
    emit(state, 'shot_intruder_out');
    return { ok: true, reason: null, killed: true };
  }
  return { ok: true, reason: null, killed: false };
}

/* What the player's fire button should do, worked out from the room rather
 * than asked of the player: something already inside is always the more urgent
 * target than something still working on a window. */
export function autoTarget(state) {
  const inside = intrudersInRoom(state, state.player.room);
  if (inside.length) return { kind: 'intruder', target: inside[0] };
  const worst = state.openings
    .filter((o) => o.present && o.revealed && o.room === state.player.room && o.attackers > 0)
    .sort((a, b) => b.integrity - a.integrity)[0];
  return worst ? { kind: 'opening', target: worst } : null;
}
