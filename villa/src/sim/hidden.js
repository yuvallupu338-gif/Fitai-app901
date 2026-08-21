/*
 * hidden.js — the openings that are not supposed to be there.
 *
 * A hidden opening has four stages and the player only ever controls one of
 * them. It is chosen for the night and sits dormant; twelve seconds before it
 * wakes, the room it is in makes a noise, and that noise names the room but
 * never the spot. Searching that room finds it. Once found it can be worked
 * on like anything else — except that a gap in a floor or a ceiling takes
 * boards and nothing else, which is where the nail budget on the late nights
 * actually goes.
 *
 * If it is never found, it still wakes up, and it is still a way in. After
 * fifteen seconds of being worked on it gives itself away, but by then it is
 * a fifth of the way through and nobody is near it.
 */

import { GAME_CONFIG } from '../data/config.js';
import { HIDDEN_OPENINGS, HIDDEN_BY_ID, HIDDEN_HINT } from '../data/openings.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { emit } from '../core/events.js';
import { shuffled, randRange } from '../core/rng.js';
import { makeOpening } from './opening.js';

/*
 * Which holes exist tonight. Whatever carried over from last night is kept
 * first — a crack that was there yesterday and is there again is much more
 * unpleasant than a fresh one — and the rest are drawn from the pool.
 */
export function chooseHidden(state, night) {
  const want = night.hidden;
  if (want <= 0) return [];

  const carried = state.hiddenCarry.filter((id) => HIDDEN_BY_ID[id]).slice(0, want);
  const rest = shuffled(state.rng, HIDDEN_OPENINGS.filter((d) => carried.indexOf(d.id) === -1))
    .slice(0, Math.max(0, want - carried.length))
    .map((d) => d.id);

  const ids = carried.concat(rest);
  return ids.map((id) => {
    /* Spread the wake-ups across the middle of the night. Nothing hidden wakes
     * in the first sixth — the opening minutes belong to the doors. */
    const wakeAt = randRange(state.rng, night.seconds * 0.18, night.seconds * 0.82);
    return makeOpening(HIDDEN_BY_ID[id], { hidden: true, wakeAt });
  });
}

/* Decided at dawn, read at dusk. Roughly half of tonight's holes are there
 * again tomorrow; the others close as quietly as they opened. */
export function rollPersistence(state) {
  const kept = [];
  for (const o of state.openings) {
    if (!o.hidden || !o.present) continue;
    /*
     * The draw happens for every hidden opening whether or not the player
     * ever found it — moving it inside the guard would change the random
     * stream and with it every seed and the headless test. Only the telling
     * is gated: being informed at dawn that a crack you never searched for
     * has closed gives away that it was there, which is the one thing the
     * whole `revealed` flag exists to withhold.
     */
    const stays = state.rng() < GAME_CONFIG.HIDDEN_PERSIST_CHANCE;
    if (stays) kept.push(o.id);
    else if (o.revealed) emit(state, 'hidden_gone', { id: o.id, name: o.name });
  }
  state.hiddenCarry = kept;
  return kept;
}

export function tickHidden(state, dt) {
  for (const o of state.openings) {
    if (!o.hidden || !o.present || o.awake) continue;

    /*
     * The warning. It names the room and the sound, never the spot — and only
     * for something still unfound. Searching a room reveals an opening but
     * leaves it asleep, so without the `revealed` test the game went on
     * telling the player to go and search a room whose hole they had already
     * found and boarded, and searching again returned nothing while costing
     * fifteen seconds of the night.
     */
    if (!o.hinted && !o.revealed && state.clock >= o.wakeAt - GAME_CONFIG.HIDDEN_HINT_LEAD) {
      o.hinted = true;
      emit(state, 'noise', {
        id: o.id,
        room: o.room,
        roomName: ROOM_BY_ID[o.room].name,
        hint: HIDDEN_HINT[o.where] || 'רעש חשוד',
      });
    }

    if (state.clock >= o.wakeAt) {
      o.awake = true;
      emit(state, 'hidden_appeared', {
        id: o.id, room: o.room, roomName: ROOM_BY_ID[o.room].name,
      });
    }
  }

  /* Something being worked on for long enough stops being hidden whether it
   * was searched for or not. This is a mercy, not a mechanic to rely on: by
   * the time it fires the opening is well on its way. */
  for (const o of state.openings) {
    if (!o.hidden || o.revealed || !o.awake) continue;
    if (o.attackers > 0) {
      o.selfRevealTimer += dt;
      if (o.selfRevealTimer >= GAME_CONFIG.HIDDEN_SELF_REVEAL) {
        o.revealed = true;
        emit(state, 'hidden_self_revealed', { id: o.id, name: o.name });
      }
    }
  }
}

/*
 * Searching a room. Finds one unfound hole per search, the one nearest to
 * waking, so a player who searches on a noise finds the thing that made it.
 * Returns the opening found, or null.
 */
export function searchRoom(state, roomId) {
  const candidates = state.openings
    .filter((o) => o.hidden && o.present && !o.revealed && o.room === roomId)
    .sort((a, b) => a.wakeAt - b.wakeAt);
  if (candidates.length === 0) return null;
  const found = candidates[0];
  found.revealed = true;
  emit(state, 'hidden_revealed', { id: found.id, name: found.name });
  return found;
}
