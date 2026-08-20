/*
 * drawer.js — the drawer in the bedroom, and the number in it.
 *
 * It takes three goes. Not because a drawer is hard to open, but because the
 * number is the gate on the neighbour and a gate you clear by walking past it
 * once is not a gate: three searches is ninety seconds of a night, or a
 * comfortable slice of the first morning's preparation, and the balance
 * document recommends spending it on day one when nothing else wants the time.
 */

import { GAME_CONFIG } from '../data/config.js';
import { emit } from '../core/events.js';
import { ROOM_BY_ID } from '../data/rooms.js';

export const DRAWER_ROOM = 'bedroom';

export function hasDrawer(roomId) {
  return roomId === DRAWER_ROOM;
}

export function searchDrawer(state) {
  if (!hasDrawer(state.player.room)) {
    return { ok: false, reason: 'notHere' };
  }
  if (state.numberFound) {
    emit(state, 'drawer_empty');
    return { ok: false, reason: 'alreadyFound' };
  }

  state.drawerSearches += 1;
  if (state.drawerSearches >= GAME_CONFIG.DRAWER_SEARCHES) {
    state.numberFound = true;
    emit(state, 'drawer_found');
    return { ok: true, reason: null, found: true };
  }

  emit(state, 'drawer_searched', {
    left: GAME_CONFIG.DRAWER_SEARCHES - state.drawerSearches,
  });
  return { ok: true, reason: null, found: false };
}

/* For the interface: how far through the drawer the player is, so the day
 * screen can show progress rather than making three identical clicks feel like
 * nothing is happening. */
export function drawerProgress(state) {
  return {
    done: state.drawerSearches,
    total: GAME_CONFIG.DRAWER_SEARCHES,
    found: state.numberFound,
    room: ROOM_BY_ID[DRAWER_ROOM].name,
  };
}
