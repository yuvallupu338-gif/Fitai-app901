/*
 * phone.js — the landline in the entrance, and nothing else.
 *
 * There is one telephone in the villa and it is in the entrance hall. That is
 * the whole of this module's job: refuse the call from anywhere else, refuse
 * it before the number has been found, and otherwise hand off to the
 * neighbour. It exists as its own file because the spec states the constraint
 * twice, and a rule stated twice is one somebody will try to relax.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import * as neighbor from './neighbor.js';

export const PHONE_ROOM = GAME_CONFIG.PHONE_LOCATION;

export function hasPhone(roomId) {
  return roomId === PHONE_ROOM;
}

/* What picking up the handset does. The order of the refusals is the order a
 * person would hit them: you have to be standing at it, then you have to know
 * the number, then he has to have a call left. */
export function usePhone(state) {
  if (!hasPhone(state.player.room)) {
    emit(state, 'phone_wrong_room');
    return { ok: false, reason: 'phone_wrong_room' };
  }
  if (!state.numberFound) {
    emit(state, 'phone_no_number');
    return { ok: false, reason: 'phone_no_number' };
  }
  if (state.neighbor.callsLeft <= 0) {
    emit(state, 'phone_no_calls');
    return { ok: false, reason: 'phone_no_calls' };
  }
  return neighbor.call(state);
}
