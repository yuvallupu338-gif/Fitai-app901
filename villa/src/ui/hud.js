/*
 * hud.js — everything the player reads that is not the floor plan.
 *
 * Three bands: what night it is and how bad things are, what is in the pack,
 * and what can be done from the room you are standing in. The third one is the
 * only interactive part, and it only ever offers actions that are actually
 * possible here and now — an opening in another room has no buttons, because
 * a button that explains why it cannot be pressed is a worse teacher than a
 * button that is not there.
 *
 * The alert feed is deliberately short and deliberately quiet. A horror game
 * that logs every tick teaches the player to stop reading, so only events that
 * change what they should do next get a line.
 */

import { h, s, clear, clock } from './dom.js';
import { UI, EVENTS, PARSER } from '../data/strings.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { GAME_CONFIG } from '../data/config.js';
import { openingState, barricadeState } from '../sim/opening.js';
import { canPerform } from '../sim/sim.js';
import { PHASE } from '../sim/state.js';

const MAX_ALERTS = 5;

export function createHud(onAction) {
  const el = {};
  el.night = h('span.hud-night');
  el.clockLabel = h('span.hud-clock-label');
  el.clock = h('span.hud-clock');
  el.dangerFill = h('i');
  el.dangerBar = h('div.danger-bar', { role: 'meter', 'aria-label': UI.danger }, el.dangerFill);
  el.dangerNum = h('span.danger-num');

  const top = h('header.topbar',
    h('div.top-left', el.night),
    h('div.top-mid', el.clockLabel, el.clock),
    h('div.top-right', h('span.danger-label', { text: UI.danger }), el.dangerBar, el.dangerNum));

  el.kit = h('div.kit');
  el.roomName = h('h2.room-name');
  el.roomDesc = h('p.room-desc');
  el.ops = h('div.op-list');
  el.roomActions = h('div.room-actions');
  el.busyFill = h('i');
  el.busy = h('div.busy', { hidden: true }, h('span.busy-label'), h('div.busy-bar', el.busyFill));
  el.alerts = h('ul.alerts');

  const root = h('div.hud', top, el.kit,
    h('section.room-panel', el.roomName, el.roomDesc, el.ops, el.roomActions),
    el.busy, el.alerts);

  return { root, el, onAction, sig: '', alerts: [], selected: null };
}

/* One chip per number, so the pack reads as a row of quantities rather than a
 * sentence. Nails are marked when they run low, because they are the resource
 * that quietly decides the run and the one players notice last. */
function kitChips(state) {
  const inv = state.inv;
  const n = state.neighbor;
  const lowNails = inv.nails < GAME_CONFIG.NAILS_PER_PLANK;
  return [
    chip(UI.ammo, inv.ammo, inv.ammo === 0 ? 'bad' : ''),
    chip(UI.tape, inv.tape, inv.tape === 0 ? 'dim' : ''),
    chip(UI.planks, inv.planks, inv.planks === 0 ? 'dim' : ''),
    chip(UI.nails, inv.nails, lowNails ? 'bad' : ''),
    chip(UI.callsLeft, n.callsLeft, n.callsLeft === 0 ? 'dim' : ''),
    chip(UI.numberKnown, state.numberFound ? UI.numberYes : UI.numberNo,
      state.numberFound ? 'good' : 'dim'),
  ];
}

function chip(label, value, mod) {
  return h(`div.chip${mod ? '.' + mod : ''}`,
    h('span.chip-label', { text: label }),
    h('span.chip-value', { text: String(value) }));
}

/*
 * The buttons for one opening. Every one is asked of the simulation whether it
 * is possible before it is drawn, so the interface and the rules cannot drift:
 * there is no second copy here of "tape does not close a breach" or "a floor
 * needs boards", and adding a rule in sim/ disables the button on its own.
 */
function openingRow(state, o, onAction, selected) {
  const st = openingState(o);
  const pct = Math.round(o.integrity * 100);
  const actions = [
    { type: 'tape', id: o.id, label: UI.actionTape },
    { type: 'plank', id: o.id, label: UI.actionPlank },
    { type: 'repair', id: o.id, label: UI.actionRepair },
    { type: 'shoot', id: o.id, label: UI.actionShoot },
  ];
  const buttons = actions.map((a) => {
    const why = canPerform(state, a);
    return h('button.op-btn', {
      type: 'button',
      disabled: why ? true : null,
      title: why ? (PARSER[why] || '') : '',
      onclick: () => onAction(a),
    }, a.label);
  });

  /* Width is set through the CSSOM rather than as a `style` attribute. A
   * style attribute is inline style, and this page runs style-src 'self' with
   * no 'unsafe-inline' — the attribute is refused and the bar never moves. */
  const fill = h('i');
  fill.style.width = `${pct}%`;
  const bar = h('div.op-bar', fill);
  return h(`div.op-row.st-${stateClass(o)}${o.id === selected ? '.selected' : ''}`,
    h('div.op-head',
      h('span.op-name', { text: o.name }),
      h('span.op-state', { text: st.name }),
      h('span.op-barr', { text: barricadeState(o) })),
    bar,
    h('div.op-actions', buttons));
}

function stateClass(o) {
  if (o.breached) return 'breached';
  if (o.integrity >= GAME_CONFIG.CRITICAL_AT) return 'critical';
  if (o.integrity >= 0.25) return 'pressure';
  return 'clear';
}

export function updateHud(hud, state, busy) {
  const { el } = hud;
  const night = state.phase === PHASE.DAY;

  el.night.textContent = `${UI.night} ${state.night} ${UI.of} ${GAME_CONFIG.NIGHTS_TOTAL}`;
  el.clockLabel.textContent = night ? `${UI.prepLeft} ` : `${UI.untilDawn} `;
  el.clock.textContent = clock(state.phaseLength - state.clock);
  hud.root.classList.toggle('is-day', night);

  const d = state.danger / GAME_CONFIG.DANGER_MAX;
  el.dangerFill.style.width = `${Math.round(d * 100)}%`;
  el.dangerBar.setAttribute('aria-valuenow', Math.round(state.danger));
  el.dangerNum.textContent = String(Math.round(state.danger));
  el.dangerBar.classList.toggle('high', d > 0.55);
  el.dangerBar.classList.toggle('max', d > 0.85);

  /* Rebuilt only when something in it changed. Rebuilding a row every frame
   * would take the button out from under a finger already on its way down. */
  const room = ROOM_BY_ID[state.player.room];
  const here = state.openings.filter((o) => o.present && o.revealed && o.room === room.id);
  const sig = [
    state.phase, room.id, hud.selected,
    state.inv.ammo, state.inv.tape, state.inv.planks, state.inv.nails,
    state.numberFound, state.neighbor.callsLeft, state.neighbor.status,
    state.stock.tape + state.stock.planks + state.stock.nails,
    state.intruders.filter((i) => i.room === room.id).length,
    here.map((o) => `${o.id}:${stateClass(o)}:${o.planks}:${o.tape}`).join(','),
  ].join('|');

  if (sig !== hud.sig) {
    hud.sig = sig;
    clear(el.kit);
    for (const c of kitChips(state)) el.kit.appendChild(c);

    el.roomName.textContent = room.name;
    el.roomDesc.textContent = room.desc;

    clear(el.ops);
    if (here.length === 0) {
      el.ops.appendChild(h('p.empty', { text: 'אין כאן פתחים שאתה יודע עליהם.' }));
    } else {
      for (const o of here) el.ops.appendChild(openingRow(state, o, hud.onAction, hud.selected));
    }

    clear(el.roomActions);
    for (const a of roomActions(state, room)) {
      const why = canPerform(state, a);
      el.roomActions.appendChild(h('button.room-btn', {
        type: 'button',
        disabled: why ? true : null,
        title: why ? (PARSER[why] || '') : '',
        onclick: () => hud.onAction(a),
      }, a.label));
    }
  }

  /* Hands busy. The world does not stop, which is the point. */
  if (busy) {
    el.busy.hidden = false;
    el.busy.querySelector('.busy-label').textContent = busy.label;
    el.busyFill.style.width = `${Math.round((1 - busy.remaining / busy.total) * 100)}%`;
  } else {
    el.busy.hidden = true;
  }

  /* Alerts age out on their own so the feed never becomes a wall. */
  let dirty = false;
  for (const a of hud.alerts) {
    a.life -= 1 / 60;
    if (a.life <= 0) dirty = true;
  }
  if (dirty) {
    hud.alerts = hud.alerts.filter((a) => a.life > 0);
    renderAlerts(hud);
  }
}

function roomActions(state, room) {
  const list = [];
  if (state.intruders.some((i) => i.room === room.id)) {
    list.push({ type: 'shoot', id: 'intruder', label: 'ירה במה שנכנס' });
  }
  list.push({ type: 'search', label: UI.actionSearch });
  if (room.has.indexOf('supplies') !== -1) list.push({ type: 'gather', label: UI.actionGather });
  if (room.has.indexOf('drawer') !== -1) list.push({ type: 'drawer', label: UI.actionDrawer });
  if (room.has.indexOf('phone') !== -1) list.push({ type: 'call', label: UI.actionPhone });
  if (state.phase === PHASE.DAY) list.push({ type: 'ready', label: UI.actionReady });
  return list;
}

/* Which simulation events are worth a line, and how loud. Everything else the
 * player can see on the plan without being told. */
const ALERT_TONE = {
  breached: 'bad', critical: 'bad', intruder_near: 'bad', defenseless: 'bad',
  intruder_in: 'warn', under_pressure: 'warn', noise: 'warn',
  hidden_appeared: 'warn', tape_snapped: 'warn', plank_broke: 'warn',
  neighbor_leaving_soon: 'warn',
  hidden_revealed: 'good', hidden_self_revealed: 'good', resecured: 'good',
  drawer_found: 'good', neighbor_arrived: 'good', night_survived: 'good',
  phone_dialing: 'good', shot_intruder_out: 'good',
  phone_no_number: 'warn', phone_wrong_room: 'warn', phone_no_calls: 'warn',
  no_ammo: 'warn', supply_empty: 'warn', hidden_gone: 'plain',
  night_start: 'plain', drawer_searched: 'plain', gathered: 'plain',
  dawn_reload: 'plain', neighbor_left: 'plain',
};

export function pushAlert(hud, ev) {
  const tone = ALERT_TONE[ev.kind];
  if (!tone) return;
  const text = describeEvent(ev);
  if (!text) return;
  hud.alerts.unshift({ text, tone, life: tone === 'bad' ? 9 : 6 });
  if (hud.alerts.length > MAX_ALERTS) hud.alerts.length = MAX_ALERTS;
  renderAlerts(hud);
}

function renderAlerts(hud) {
  clear(hud.el.alerts);
  for (const a of hud.alerts) {
    hud.el.alerts.appendChild(h(`li.alert.${a.tone}`, { text: a.text }));
  }
}

const inRoomName = (n) => (n && n.charAt(0) === 'ה' ? 'ב' + n.slice(1) : 'ב' + n);

/* Turns an event into its Hebrew line. Both front-ends call this, so the map
 * and the text prompt say the same words about the same thing. */
export function describeEvent(ev) {
  const t = EVENTS[ev.kind];
  if (!t) return '';
  if (typeof t !== 'function') return t;
  switch (ev.kind) {
    case 'night_start': case 'night_survived': return t(ev.night);
    case 'dawn_reload': return t(ev.ammo);
    case 'noise': return `${ev.hint} ${inRoomName(ev.roomName)}`;
    case 'hidden_appeared': case 'intruder_in': return t(ev.roomName);
    case 'shot': return t(ev.name, ev.left);
    case 'shot_intruder': return t(ev.left);
    case 'drawer_searched': return t(ev.left);
    case 'gathered': return t(ev.tape, ev.planks, ev.nails);
    case 'moved': return t(ev.roomName);
    default: return t(ev.name);
  }
}
