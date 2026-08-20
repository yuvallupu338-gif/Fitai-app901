/*
 * map.js — the villa, drawn as a floor plan.
 *
 * Built once and then updated in place rather than redrawn each frame: about
 * forty nodes, sixty times a second, and rebuilding them all would throw away
 * the CSS transitions that make an opening's state change readable rather than
 * a jump cut.
 *
 * Two rules govern how an opening is drawn, and both matter more than they
 * look. First, **state is never colour alone** — every state also has its own
 * shape, so the difference between "under pressure" and "nearly through"
 * survives a colour-blind player, a dim phone screen, and the red-shifted
 * palette this game is lit in. Second, the barricade is drawn as separate tick
 * marks beside the opening rather than folded into its colour, because
 * "boarded and under pressure" is the normal state of most of the house and
 * the player needs to read both halves at a glance.
 */

import { s, clear } from './dom.js';
import { ROOMS, ROOM_BY_ID, sharedWall } from '../data/rooms.js';
import { GAME_CONFIG } from '../data/config.js';

const W = 100;
const H = 70;

/* Where an opening sits on the plan. Regular openings are on a named wall of
 * their room; hidden ones are somewhere inside it, because a hole in a floor
 * does not belong to any wall. */
export function positionOf(o) {
  const r = ROOM_BY_ID[o.room];
  if (!r) return { x: 0, y: 0 };
  if (o.hidden) {
    return {
      x: r.x + r.w * (0.22 + o.at * 0.56),
      y: r.y + r.h * (0.3 + ((o.at * 1.7) % 1) * 0.4),
      inside: true,
    };
  }
  switch (o.side) {
    case 'north': return { x: r.x + r.w * o.at, y: r.y };
    case 'south': return { x: r.x + r.w * o.at, y: r.y + r.h };
    case 'west': return { x: r.x, y: r.y + r.h * o.at };
    default: return { x: r.x + r.w, y: r.y + r.h * o.at };
  }
}

/*
 * Everything the plan is drawn with, declared once. It is worth the length:
 * a floor plan built from flat rectangles reads as a form, and this game is
 * asking the player to feel something about a house at three in the morning.
 * The depth here comes from four cheap tricks layered — a floorboard pattern,
 * a warm pool of lamplight in the room you are standing in, a soft drop
 * shadow under the walls, and a vignette over the whole thing.
 */
function buildDefs() {
  const defs = s('defs');

  /* Floorboards. A pattern rather than a texture file, tiled at an angle so
   * the eye reads planks instead of graph paper. */
  const boards = s('pattern', {
    id: 'v-boards', width: 6, height: 6, patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(90)',
  });
  boards.appendChild(s('rect', { width: 6, height: 6, fill: 'var(--floor)' }));
  boards.appendChild(s('path', { d: 'M 0 0 L 6 0', stroke: 'var(--floor-line)', 'stroke-width': 0.22 }));
  boards.appendChild(s('path', { d: 'M 0 3 L 6 3', stroke: 'var(--floor-line)', 'stroke-width': 0.1, opacity: 0.6 }));
  defs.appendChild(boards);

  /* The lamp in whichever room the player is in. */
  const lamp = s('radialGradient', { id: 'v-lamp', cx: '50%', cy: '42%', r: '62%' });
  lamp.appendChild(s('stop', { offset: '0%', 'stop-color': 'var(--lamp)', 'stop-opacity': 0.55 }));
  lamp.appendChild(s('stop', { offset: '55%', 'stop-color': 'var(--lamp)', 'stop-opacity': 0.16 }));
  lamp.appendChild(s('stop', { offset: '100%', 'stop-color': 'var(--lamp)', 'stop-opacity': 0 }));
  defs.appendChild(lamp);

  /* A breached opening bleeds into the room. */
  const bleed = s('radialGradient', { id: 'v-bleed', cx: '50%', cy: '50%', r: '50%' });
  bleed.appendChild(s('stop', { offset: '0%', 'stop-color': 'var(--bad)', 'stop-opacity': 0.5 }));
  bleed.appendChild(s('stop', { offset: '100%', 'stop-color': 'var(--bad)', 'stop-opacity': 0 }));
  defs.appendChild(bleed);

  const shadow = s('filter', { id: 'v-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  shadow.appendChild(s('feDropShadow', {
    dx: 0, dy: 0.7, stdDeviation: 0.9, 'flood-color': '#000', 'flood-opacity': 0.75,
  }));
  defs.appendChild(shadow);

  const glow = s('filter', { id: 'v-glow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
  glow.appendChild(s('feGaussianBlur', { stdDeviation: 1.1, result: 'b' }));
  const merge = s('feMerge');
  merge.appendChild(s('feMergeNode', { in: 'b' }));
  merge.appendChild(s('feMergeNode', { in: 'SourceGraphic' }));
  glow.appendChild(merge);
  defs.appendChild(glow);

  return defs;
}

export function createMap(onRoomClick, onOpeningClick) {
  const svg = s('svg', {
    viewBox: `-5 -5 ${W + 10} ${H + 10}`,
    class: 'plan',
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'מפת הווילה',
  });
  svg.appendChild(buildDefs());

  const floorLayer = s('g', { class: 'floors' });
  const doorLayer = s('g', { class: 'doors' });
  const roomLayer = s('g', { class: 'rooms' });
  const glowLayer = s('g', { class: 'glows' });
  const openingLayer = s('g', { class: 'openings' });
  const actorLayer = s('g', { class: 'actors' });
  for (const layer of [floorLayer, glowLayer, roomLayer, doorLayer, openingLayer, actorLayer]) {
    svg.appendChild(layer);
  }

  const refs = { rooms: {}, openings: {}, actorLayer, glowLayer, svg };

  for (const r of ROOMS) {
    /* The floor goes under everything, in its own layer, so the walls of one
     * room are never painted over by the floor of the next. */
    floorLayer.appendChild(s('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.4, fill: 'url(#v-boards)',
    }));

    const g = s('g', {
      class: 'room',
      'data-room': r.id,
      onclick: () => onRoomClick(r.id),
    });
    const rect = s('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.4, class: 'room-box',
      filter: 'url(#v-shadow)',
    });
    const tint = s('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.4, class: 'room-tint',
    });
    const label = s('text', {
      x: r.x + r.w / 2, y: r.y + r.h / 2 + 1.1, class: 'room-label', text: r.name,
    });
    /* Doorways between rooms, drawn as gaps in the shared wall so the plan
     * reads as connected rather than as six sealed boxes. */
    g.appendChild(tint);
    g.appendChild(rect);
    g.appendChild(label);
    /* The click target, last so it is on top of its own group, and
     * transparent rather than absent — a room outlined with `fill: none` has
     * no interior to hit, so without this the only clickable part of a room is
     * the one-pixel line around it. */
    g.appendChild(s('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.4, class: 'room-hit',
    }));
    roomLayer.appendChild(g);
    refs.rooms[r.id] = { g, rect, label, tint, room: r };
  }

  /*
   * Doorways. Drawn after the walls, as a short segment in the floor colour
   * that cuts the wall open, plus a thin threshold line across it. Without
   * these the plan is six rectangles that share edges, and nothing on it says
   * you can walk from one to another — which is the single most important
   * thing a floor plan has to say.
   */
  const drawn = new Set();
  for (const r of ROOMS) {
    for (const link of r.links) {
      const pair = [r.id, link].sort().join('|');
      if (drawn.has(pair)) continue;
      drawn.add(pair);
      const wall = sharedWall(r.id, link);
      if (!wall) continue;
      const mx = (wall.x1 + wall.x2) / 2;
      const my = (wall.y1 + wall.y2) / 2;
      const half = 4;
      const a = wall.vertical
        ? { x1: mx, y1: my - half, x2: mx, y2: my + half }
        : { x1: mx - half, y1: my, x2: mx + half, y2: my };
      doorLayer.appendChild(s('line', Object.assign({ class: 'door-cut' }, a)));
      doorLayer.appendChild(s('line', Object.assign({ class: 'door-sill' }, a)));
    }
  }

  refs.openingLayer = openingLayer;
  refs.onOpeningClick = onOpeningClick;
  return refs;
}

/* An opening's mark: the shape carries the state, the ticks carry the
 * barricade, and neither is readable from the other. */
function buildOpening(o, onClick) {
  const p = positionOf(o);
  const g = s('g', {
    class: 'opening',
    'data-id': o.id,
    transform: `translate(${p.x} ${p.y})`,
    onclick: (e) => { e.stopPropagation(); onClick(o.id); },
  });
  /* A halo under the mark, sized by how bad things are, so a room in trouble
   * is visible from the far side of the plan without reading a single label. */
  g.appendChild(s('circle', { r: 5.5, class: 'op-halo' }));
  g.appendChild(s('circle', { r: 3.4, class: 'op-hit' }));
  g.appendChild(s('path', { class: 'op-mark', d: '' }));
  g.appendChild(s('g', { class: 'op-bars' }));
  return g;
}

/* Four shapes for four states. A square that fills, then a triangle, then a
 * cross — legible as a sequence even with every colour stripped out. */
function markPath(state) {
  switch (state) {
    case 'breached': return 'M -1.9 -1.9 L 1.9 1.9 M 1.9 -1.9 L -1.9 1.9';
    case 'critical': return 'M 0 -2.2 L 2.1 1.7 L -2.1 1.7 Z';
    case 'pressure': return 'M -1.7 -1.7 L 1.7 -1.7 L 1.7 1.7 L -1.7 1.7 Z';
    default: return 'M -1.4 -1.4 L 1.4 -1.4 L 1.4 1.4 L -1.4 1.4 Z';
  }
}

function stateKey(o) {
  if (o.breached) return 'breached';
  if (o.integrity >= GAME_CONFIG.CRITICAL_AT) return 'critical';
  if (o.integrity >= 0.25) return 'pressure';
  return 'clear';
}

export function updateMap(refs, state, selectedId) {
  /* Rooms: which one the player is standing in, and what is in the others. */
  for (const r of ROOMS) {
    const ref = refs.rooms[r.id];
    const here = state.player.room === r.id;
    const intruder = state.intruders.some((i) => i.room === r.id && i.delay <= 0);
    const neighbour = state.neighbor.status === 'here'
      && state.openings.some((o) => o.id === state.neighbor.target && o.room === r.id);
    ref.g.setAttribute('class',
      `room${here ? ' here' : ''}${intruder ? ' intruder' : ''}${neighbour ? ' helped' : ''}`);

    /* How bad this room is, as one number, painted as a red wash over its
     * floor. Reads before any of the marks do. */
    const worst = state.openings.reduce((m, o) => (
      o.present && o.revealed && o.room === r.id ? Math.max(m, o.breached ? 1 : o.integrity) : m
    ), 0);
    ref.tint.setAttribute('opacity', (worst * 0.30).toFixed(3));
  }

  /* The lamp follows the player from room to room. One element moved rather
   * than six toggled, so it slides instead of snapping. */
  clear(refs.glowLayer);
  const lampRoom = ROOM_BY_ID[state.player.room];
  refs.glowLayer.appendChild(s('ellipse', {
    cx: lampRoom.x + lampRoom.w / 2, cy: lampRoom.y + lampRoom.h / 2,
    rx: lampRoom.w * 0.72, ry: lampRoom.h * 0.72,
    fill: 'url(#v-lamp)', class: 'lamp', 'pointer-events': 'none',
  }));
  for (const o of state.openings) {
    if (!o.present || !o.revealed || !o.breached) continue;
    const p = positionOf(o);
    refs.glowLayer.appendChild(s('circle', {
      cx: p.x, cy: p.y, r: 11, fill: 'url(#v-bleed)', class: 'bleed', 'pointer-events': 'none',
    }));
  }

  /* Openings. Only ones the player could actually know about are drawn: an
   * unfound hole in a ceiling is not on anybody's map. */
  const shown = state.openings.filter((o) => o.present && o.revealed);
  const live = new Set();
  for (const o of shown) {
    live.add(o.id);
    let g = refs.openings[o.id];
    if (!g) {
      g = buildOpening(o, refs.onOpeningClick);
      refs.openings[o.id] = g;
      refs.openingLayer.appendChild(g);
    }
    const key = stateKey(o);
    g.setAttribute('class', `opening st-${key}`
      + (o.hidden ? ' is-hidden' : '')
      + (o.isMain ? ' is-main' : '')
      + (o.attackers > 0 ? ' attacked' : '')
      + (o.id === selectedId ? ' selected' : ''));
    g.querySelector('.op-mark').setAttribute('d', markPath(key));
    /* The halo grows with the damage rather than switching on at a threshold,
     * so an opening that is slowly going shows it slowly. */
    const halo = g.querySelector('.op-halo');
    const hurt = o.breached ? 1 : o.integrity;
    halo.setAttribute('r', (2.6 + hurt * 5.0).toFixed(2));
    halo.setAttribute('opacity', (0.04 + hurt * 0.36).toFixed(3));

    /* Barricade ticks: boards below, tape above, so the two never read as one
     * quantity. */
    const bars = g.querySelector('.op-bars');
    const want = `${o.planks}/${o.tape}`;
    if (bars.dataset.state !== want) {
      bars.dataset.state = want;
      clear(bars);
      for (let i = 0; i < o.planks; i++) {
        bars.appendChild(s('rect', {
          x: -2.6 + i * 1.9, y: 2.6, width: 1.4, height: 0.8, class: 'bar-plank',
        }));
      }
      for (let i = 0; i < o.tape; i++) {
        bars.appendChild(s('rect', {
          x: -2.6 + i * 1.9, y: -3.6, width: 1.4, height: 0.6, class: 'bar-tape',
        }));
      }
    }
  }
  /* Anything that closed itself between nights leaves the plan. */
  for (const id of Object.keys(refs.openings)) {
    if (live.has(id)) continue;
    refs.openings[id].remove();
    delete refs.openings[id];
  }

  /* The player, whatever got in, and the neighbour. */
  clear(refs.actorLayer);
  const pr = ROOM_BY_ID[state.player.room];
  refs.actorLayer.appendChild(s('circle', {
    cx: pr.x + pr.w / 2, cy: pr.y + pr.h / 2 - 5.5, r: 2.1, class: 'actor-player',
  }));
  const counted = {};
  for (const it of state.intruders) {
    if (it.delay > 0) continue;
    const r = ROOM_BY_ID[it.room];
    const n = counted[it.room] = (counted[it.room] || 0) + 1;
    refs.actorLayer.appendChild(s('path', {
      class: 'actor-intruder',
      transform: `translate(${r.x + r.w / 2 + n * 4.5 - 2} ${r.y + r.h / 2 + 5})`,
      d: 'M 0 -2.4 L 2.1 1.4 L 0 0.6 L -2.1 1.4 Z',
    }));
  }
  if (state.neighbor.status === 'here') {
    const t = state.openings.find((o) => o.id === state.neighbor.target);
    const r = ROOM_BY_ID[t ? t.room : 'entrance'];
    refs.actorLayer.appendChild(s('circle', {
      cx: r.x + r.w / 2 - 5, cy: r.y + r.h / 2 - 5.5, r: 1.9, class: 'actor-neighbor',
    }));
  }
}
