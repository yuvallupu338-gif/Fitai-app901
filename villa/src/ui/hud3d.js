/*
 * hud3d.js — the overlay for the first-person game.
 *
 * Much less than the 2D build's panel, on purpose. In first person the room
 * itself is the interface: how many boards are on that window is something you
 * find out by looking at the window, not by reading a number. So this shows
 * only what the room cannot say — the night, the clock, the danger, what is in
 * your pack, and what the thing you are looking at can have done to it.
 *
 * The prompt is the important part. It never offers an action the rules would
 * refuse, because it asks the rules: every line is `canPerform`. That is the
 * same guarantee the 2D build makes and it matters more here, where a player
 * with a torch in a dark room should not be finding out about the nail budget
 * by pressing a key and having nothing happen.
 */

import { h, clear, clock } from './dom.js';
import { UI, PARSER } from '../data/strings.js';
import { GAME_CONFIG } from '../data/config.js';
import { canPerform } from '../sim/sim.js';
import { PHASE } from '../sim/state.js';
import { openingState, barricadeState } from '../sim/opening.js';

/* The actions an opening offers, in the order the number keys are bound. */
export const OPENING_ACTIONS = [
  { key: '1', type: 'tape', label: UI.actionTape },
  { key: '2', type: 'plank', label: UI.actionPlank },
  { key: '3', type: 'repair', label: UI.actionRepair },
  { key: '4', type: 'shoot', label: UI.actionShoot },
];

export const PROP_ACTIONS = {
  phone: { key: 'E', type: 'call', label: UI.actionPhone },
  drawer: { key: 'E', type: 'drawer', label: UI.actionDrawer },
  supplies: { key: 'E', type: 'gather', label: UI.actionGather },
};

export function createHud3d() {
  const el = {};
  el.night = h('span.h3-night');
  el.clock = h('span.h3-clock');
  el.dangerFill = h('i');
  el.danger = h('div.h3-danger', el.dangerFill);

  el.top = h('div.h3-top',
    h('div.h3-topline', el.night, el.clock),
    el.danger);

  el.crosshair = h('div.h3-cross');
  el.prompt = h('div.h3-prompt', { hidden: true });
  el.kit = h('div.h3-kit');
  el.alerts = h('ul.h3-alerts');
  el.busyFill = h('i');
  el.busy = h('div.h3-busy', { hidden: true }, h('span.h3-busy-label'), h('div.h3-busy-bar', el.busyFill));
  el.torch = h('div.h3-torch');

  const root = h('div.hud3', el.top, el.crosshair, el.prompt,
    h('div.h3-bottom', el.busy, el.kit, el.torch), el.alerts);

  return { root, el, alerts: [], sig: '', promptSig: '' };
}

export function updateHud3d(hud, state, ctx) {
  const { el } = hud;
  const day = state.phase === PHASE.DAY;

  el.night.textContent = day
    ? `${UI.dayPrep} · ${UI.night} ${state.night}`
    : `${UI.night} ${state.night} / ${GAME_CONFIG.NIGHTS_TOTAL}`;
  el.clock.textContent = clock(state.phaseLength - state.clock);

  const d = state.danger / GAME_CONFIG.DANGER_MAX;
  el.dangerFill.style.width = `${Math.round(d * 100)}%`;
  el.danger.classList.toggle('high', d > 0.55);
  el.danger.classList.toggle('max', d > 0.85);
  hud.root.classList.toggle('is-day', day);

  /* --- the pack --- */
  const inv = state.inv;
  const sig = [inv.ammo, inv.tape, inv.planks, inv.nails,
    state.neighbor.callsLeft, state.numberFound].join('|');
  if (sig !== hud.sig) {
    hud.sig = sig;
    clear(el.kit);
    const chips = [
      ['◈', inv.ammo, inv.ammo === 0 ? 'bad' : ''],
      ['▤', inv.planks, inv.planks === 0 ? 'dim' : ''],
      ['✚', inv.nails, inv.nails < GAME_CONFIG.NAILS_PER_PLANK ? 'bad' : ''],
      ['▬', inv.tape, inv.tape === 0 ? 'dim' : ''],
      ['☎', state.neighbor.callsLeft, state.neighbor.callsLeft === 0 ? 'dim' : ''],
    ];
    for (const [icon, value, mod] of chips) {
      el.kit.appendChild(h(`div.h3-chip${mod ? '.' + mod : ''}`,
        h('span.h3-icon', { text: icon }),
        h('span.h3-value', { text: String(value) })));
    }
    if (!state.numberFound) {
      el.kit.appendChild(h('div.h3-chip.dim', h('span.h3-icon', { text: '☎' }),
        h('span.h3-value', { text: '?' })));
    }
  }

  el.torch.textContent = ctx.torch ? 'פנס · F' : 'פנס כבוי · F';
  el.torch.classList.toggle('off', !ctx.torch);

  /* --- what you are looking at --- */
  const t = ctx.target;
  let psig = 'none';
  if (t) psig = t.kind + ':' + t.id + ':' + (t.opening
    ? `${t.opening.planks}:${t.opening.tape}:${Math.round(t.opening.integrity * 20)}:${t.opening.breached}`
    : '') + ':' + sig;
  if (psig !== hud.promptSig) {
    hud.promptSig = psig;
    clear(el.prompt);
    if (!t) {
      el.prompt.hidden = true;
    } else {
      el.prompt.hidden = false;
      if (t.kind === 'opening') {
        const o = t.opening;
        el.prompt.appendChild(h('div.h3-name', { text: o.name }));
        el.prompt.appendChild(h('div.h3-state',
          h('span', { text: openingState(o).name }),
          h('span.sep', { text: '·' }),
          h('span', { text: barricadeState(o) }),
          h('span.sep', { text: '·' }),
          h('span', { text: `${o.planks} קרשים` }),
          h('span.sep', { text: '·' }),
          h('span', { text: `${o.tape} סקוץ׳` })));
        const row = h('div.h3-actions');
        for (const a of OPENING_ACTIONS) {
          const why = canPerform(state, { type: a.type, id: o.id });
          row.appendChild(h(`div.h3-act${why ? '.off' : ''}`,
            h('kbd', { text: a.key }),
            h('span', { text: a.label }),
            why ? h('em', { text: PARSER[why] || '' }) : null));
        }
        el.prompt.appendChild(row);
      } else {
        const a = PROP_ACTIONS[t.kind];
        el.prompt.appendChild(h('div.h3-name', { text: t.label || '' }));
        if (a) {
          const why = canPerform(state, { type: a.type });
          el.prompt.appendChild(h('div.h3-actions',
            h(`div.h3-act${why ? '.off' : ''}`,
              h('kbd', { text: a.key }),
              h('span', { text: a.label }),
              why ? h('em', { text: PARSER[why] || '' }) : null)));
        }
      }
    }
  }

  /* --- busy --- */
  if (ctx.busy) {
    el.busy.hidden = false;
    el.busy.querySelector('.h3-busy-label').textContent = ctx.busy.label;
    el.busyFill.style.width = `${Math.round((1 - ctx.busy.remaining / ctx.busy.total) * 100)}%`;
  } else {
    el.busy.hidden = true;
  }

  /* --- alerts --- */
  let dirty = false;
  for (const a of hud.alerts) {
    a.life -= ctx.dt;
    if (a.life <= 0) dirty = true;
  }
  if (dirty) {
    hud.alerts = hud.alerts.filter((a) => a.life > 0);
    renderAlerts(hud);
  }

  el.crosshair.classList.toggle('on', !!t);
}

export function pushAlert3d(hud, text, tone) {
  if (!text) return;
  hud.alerts.unshift({ text, tone: tone || 'plain', life: tone === 'bad' ? 8 : 5.5 });
  if (hud.alerts.length > 4) hud.alerts.length = 4;
  renderAlerts(hud);
}

function renderAlerts(hud) {
  clear(hud.el.alerts);
  for (const a of hud.alerts) {
    hud.el.alerts.appendChild(h(`li.h3-alert.${a.tone}`, { text: a.text }));
  }
}
