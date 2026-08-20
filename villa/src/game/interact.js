/*
 * interact.js — what you are looking at.
 *
 * A cone test rather than a ray cast. A ray demands that the player put the
 * crosshair exactly on a thing, which in a dark house with a torch is
 * unpleasant; a cone lets "looking at the kitchen window" mean what a person
 * means by it. Candidates inside the cone are ranked by angle rather than by
 * distance, so the thing you are most pointed at wins even if something else
 * is closer to your feet.
 *
 * Nothing here decides whether an action is allowed — that is `canPerform` in
 * the simulation, and asking it is what keeps the prompt and the rules from
 * ever disagreeing.
 */

import { ROOM_BY_ID } from '../data/rooms.js';

const REACH = 2.9;
const CONE = Math.cos(30 * Math.PI / 180);

function look(player, target) {
  const dx = target.x - player.x;
  const dy = (target.y === undefined ? player.y : target.y) - player.y;
  const dz = target.z - player.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > REACH || dist < 0.001) return null;
  const f = player.forward();
  const dot = (dx * f[0] + dy * f[1] + dz * f[2]) / dist;
  if (dot < CONE) return null;
  return { dist, dot };
}

/*
 * The best candidate in front of the player: an opening they could work on, or
 * one of the three props the rules care about. Returns null when they are
 * looking at a wall, which is most of the time.
 */
export function findTarget(player, state, anchors, propAnchors) {
  let best = null;
  let bestDot = CONE;

  for (const o of state.openings) {
    if (!o.present || !o.revealed) continue;
    const a = anchors[o.id];
    if (!a || a.room !== player.room) continue;
    const hit = look(player, a);
    if (!hit || hit.dot <= bestDot) continue;
    bestDot = hit.dot;
    best = { kind: 'opening', id: o.id, opening: o, anchor: a, dist: hit.dist };
  }

  for (const [key, a] of Object.entries(propAnchors)) {
    const room = PROP_ROOM[key];
    if (room && room !== player.room) continue;
    const hit = look(player, a);
    if (!hit || hit.dot <= bestDot) continue;
    bestDot = hit.dot;
    best = { kind: key, id: key, anchor: a, label: a.label, dist: hit.dist };
  }

  return best;
}

const PROP_ROOM = { phone: 'entrance', drawer: 'bedroom', supplies: 'supply' };

/*
 * Which room the player is standing in, as far as the rules are concerned.
 * The simulation tracks a room rather than a position — barricading needs to
 * know you are in the living room, not that you are at (4.2, 1.6, 3.1) — so
 * this is the one place the two representations meet.
 */
export function syncRoom(state, roomId) {
  if (roomId && state.player.room !== roomId) {
    state.player.room = roomId;
    return true;
  }
  return false;
}

export function roomName(id) {
  const r = ROOM_BY_ID[id];
  return r ? r.name : '';
}
