/*
 * main.js — boot, the loop, and the two ways to play.
 *
 * The important thing here is what is *not* here: no rules. This file owns the
 * frame loop, which screen is showing, and turning a click or a typed line
 * into an action object. Everything that decides what happens lives in
 * villa/src/sim/, which has no idea any of this exists.
 *
 * The two modes differ in one respect and it is deliberate. On the map, time
 * runs on its own and an action holds your hands still for its duration — the
 * house keeps working while you are boarding a window. At the prompt, time
 * only moves when you act, and the cost is charged before the action lands.
 * Both go through the same fixed-timestep accumulator in sim.js, so a night
 * played either way unfolds identically.
 */

import { h, qs, clear, clock } from './ui/dom.js';
import { UI, OUTCOME, PARSER, inRoom, toRoom } from './data/strings.js';
import { GAME_CONFIG } from './data/config.js';
import { nightData } from './data/nights.js';
import { ROOM_BY_ID } from './data/rooms.js';
import { drain } from './core/events.js';
import { PHASE } from './sim/state.js';
import {
  newRun, step, performTimed, perform, canPerform, actionCost, pause, resume,
} from './sim/sim.js';
import { createMap, updateMap } from './ui/map.js';
import { createHud, updateHud, pushAlert, describeEvent } from './ui/hud.js';
import {
  createConsole, print, clearConsole, parse, statusLines, openingReport,
} from './ui/text.js';
import { Audio, EVENT_SOUND } from './audio/audio.js';
import * as store from './ui/store.js';

const audio = new Audio();

let state = null;
let mapRefs = null;
let hud = null;
let con = null;
let busy = null;
let selected = null;
let mode = 'map';
let running = false;
let lastFrame = 0;
let lastPhase = null;
let lastNight = 0;
let saveIn = 2;

/*
 * How fast the clock runs against real time. A night is between three and a
 * half and eight minutes of game time and there are seven of them with an
 * afternoon each, so a full week at 1x is a little over an hour — right for
 * someone settling in, far too long for someone who wants to see night five.
 * It multiplies the frame delta and nothing else: every rate, cost and timer
 * in the simulation is in game seconds and none of them know about it.
 *
 * The text mode ignores it entirely, because there time only moves when the
 * player does something.
 */
const SPEEDS = [1, 2, 4];
let speed = 1;

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

const SCREENS = ['menu', 'how', 'brief', 'pause', 'over', 'won'];

function show(name) {
  for (const s of SCREENS) qs(`#screen-${s}`).hidden = (s !== name);
  const playing = !name;
  qs('#game').hidden = !playing || mode !== 'map';
  qs('#controls').hidden = !playing;
  if (con) con.root.hidden = !playing || mode !== 'text';
  running = playing;
  if (playing) lastFrame = performance.now();
}

/* ------------------------------------------------------------------ *
 * Starting and ending
 * ------------------------------------------------------------------ */

function startRun(resumed) {
  /* Date.now() as the seed lives here rather than in the simulation, which
   * never calls it — every roll inside a run comes from that one integer. */
  state = resumed || newRun(Date.now() >>> 0);
  busy = null;
  selected = null;
  lastPhase = null;
  lastNight = 0;
  if (con) clearConsole(con);
  drain(state);
  if (mode === 'text') {
    print(con, ['— שבעה לילות בוילה —', 'כתוב "עזרה" לרשימת הפקודות.'], 'event');
  }
  enterPhase();
}

/* Shown at the top of every day: what is coming, and what there is to do it
 * with. The one place the player is told the shape of the night in advance. */
function enterPhase() {
  const n = nightData(state.night);
  if (state.phase === PHASE.DAY) {
    qs('#brief-eyebrow').textContent = state.night === 1 ? 'הלילה הראשון' : `לפנות בוקר · יום ${state.night}`;
    qs('#brief-title').textContent = `${UI.night} ${state.night} ${UI.of} ${GAME_CONFIG.NIGHTS_TOTAL}`;

    const tally = clear(qs('#brief-tally'));
    for (let i = 1; i <= GAME_CONFIG.NIGHTS_TOTAL; i++) {
      tally.appendChild(h(`i${i < state.night ? '.done' : i === state.night ? '.now' : ''}`));
    }

    qs('#brief-note').textContent = n.note;

    const stats = clear(qs('#brief-stats'));
    for (const [num, label] of [
      [n.total, 'פתחים'],
      [n.hidden, 'מסתוריים'],
      [n.threats, 'איומים'],
      [n.difficulty, 'קושי'],
    ]) {
      stats.appendChild(h('div.stat',
        h('span.stat-num', { text: String(num) }),
        h('span.stat-label', { text: label })));
    }
    show('brief');
  } else {
    show(null);
  }
}

function finish() {
  store.recordOutcome(state);
  if (state.phase === PHASE.WON) {
    qs('#won-text').textContent = OUTCOME.victoryText;
    fillStats(qs('#won-stats'));
    audio.play('dawn');
    show('won');
  } else {
    qs('#over-eyebrow').textContent = OUTCOME.nightReached(state.night);
    qs('#over-title').textContent = OUTCOME.defeatTitle;
    qs('#over-reason').textContent = (state.outcome && state.outcome.text) || '';
    fillStats(qs('#over-stats'));
    audio.play('dead');
    show('over');
  }
  if (mode === 'text') {
    print(con, [(state.outcome && state.outcome.text) || '', OUTCOME.nightReached(state.night)], 'bad');
  }
}

function fillStats(node) {
  const s = state.stats;
  clear(node);
  for (const [num, label] of [
    [s.nightsSurvived, 'לילות'],
    [s.shotsFired, 'יריות'],
    [s.planksUsed, 'קרשים'],
    [s.breaches, 'פריצות'],
  ]) {
    node.appendChild(h('div.stat',
      h('span.stat-num', { text: String(num) }),
      h('span.stat-label', { text: label })));
  }
}

/* ------------------------------------------------------------------ *
 * Doing things
 * ------------------------------------------------------------------ */

/*
 * The map screen's order: check it is possible, then hold the player still for
 * the duration, then apply. Anything can happen to the house while your hands
 * are busy — including the window you were reaching for giving way — which is
 * correct, and is why the cost is spent before the effect and not after.
 */
function doAction(action) {
  if (!running || busy) return;
  audio.start();
  const why = canPerform(state, action);
  if (why) {
    flash(PARSER[why] || 'אי אפשר.');
    audio.play('click');
    return;
  }
  const cost = actionCost(action, state.phase);
  if (cost <= 0) { perform(state, action); return; }
  busy = { action, remaining: cost, total: cost, label: labelFor(action) };
}

function labelFor(action) {
  const o = action.id && state.openings.find((x) => x.id === action.id);
  switch (action.type) {
    case 'move': return `הולך ${toRoom(ROOM_BY_ID[action.room].name)}…`;
    case 'tape': return `מדביק סקוץ׳ על ${o ? o.name : ''}…`;
    case 'plank': return `מקרש את ${o ? o.name : ''}…`;
    case 'repair': return `דוחף בחזרה את ${o ? o.name : ''}…`;
    case 'search': return 'מחפש בחדר…';
    case 'drawer': return 'מחטט במגירה…';
    case 'gather': return 'אוסף ציוד…';
    case 'call': return 'מחייג…';
    case 'shoot': return 'יורה…';
    default: return 'רגע…';
  }
}

/* A one-off line in the alert feed for things the simulation did not emit —
 * mostly "you cannot do that from here". */
function flash(text) {
  hud.alerts.unshift({ text, tone: 'warn', life: 3 });
  if (hud.alerts.length > 5) hud.alerts.length = 5;
  hud.sig = '';
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

const REPORTS = {
  report_kit: (s) => [
    `${s.inv.ammo} כדורים · ${s.inv.tape} סקוץ׳ · ${s.inv.planks} קרשים · ${s.inv.nails} מסמרים`
    + (s.inv.hammer ? ' · פטיש' : ' · אין פטיש'),
    `בחדר הציוד נשאר: ${s.stock.tape} סקוץ׳, ${s.stock.planks} קרשים, ${s.stock.nails} מסמרים.`,
  ],
  report_openings: (s) => openingReport(s),
  report_time: (s) => [s.phase === PHASE.DAY
    ? `נשארו ${clock(s.phaseLength - s.clock)} של אור יום.`
    : `${clock(s.phaseLength - s.clock)} עד הבוקר. מד הסכנה: ${Math.round(s.danger)}.`],
  help: () => PARSER.help,
};

function onCommand(line) {
  if (!running) return;
  audio.start();
  print(con, [`> ${line}`], 'echo');

  const { action, error } = parse(line, state);
  if (error) { print(con, [error], 'bad'); return; }

  const report = REPORTS[action.type];
  if (report) { print(con, report(state), 'event'); return; }

  if (action.type === 'look' || action.type === 'look_room') {
    print(con, describeTarget(action), 'event');
    return;
  }

  const before = state.phase;
  const result = performTimed(state, action);
  if (!result.ok && result.cost === 0) {
    print(con, [PARSER[result.reason] || 'לא עכשיו.'], 'bad');
    return;
  }

  const lines = drainToLines();
  if (result.reason === 'foundNothing') lines.push('חיפשת. לא מצאת כלום.');
  if (lines.length) print(con, lines, 'event');

  if (state.phase === PHASE.OVER || state.phase === PHASE.WON) { finish(); return; }
  if (before === PHASE.DAY && state.phase === PHASE.NIGHT) {
    print(con, ['השמש שקעה.'], 'bad');
  }
  print(con, statusLines(state), 'status');
}

function describeTarget(action) {
  if (action.type === 'look_room') {
    const r = ROOM_BY_ID[action.room];
    const ops = state.openings.filter((o) => o.present && o.revealed && o.room === r.id);
    return [`${r.name}: ${r.desc}`].concat(
      ops.length ? ops.map((o) => `  · ${o.name}`) : ['  אין שם פתחים ידועים.'],
    );
  }
  const o = state.openings.find((x) => x.id === action.id);
  if (!o) return [PARSER.unknownTarget('')];
  const pct = Math.round(o.integrity * 100);
  return [
    `${o.name} — ${inRoom(ROOM_BY_ID[o.room].name)}.`,
    `נזק: ${pct}% · קרשים: ${o.planks} · סקוץ׳: ${o.tape}`
    + (o.canTape ? '' : ' · אי אפשר להדביק על זה סקוץ׳'),
    o.attackers > 0 ? 'משהו עובד עליו עכשיו.' : 'שקט מהצד השני.',
  ];
}

/* Events into Hebrew lines, and into sound. Shared by both modes, which is why
 * the map and the prompt describe the same thing with the same words. */
function drainToLines() {
  const out = [];
  for (const ev of drain(state)) {
    const sound = EVENT_SOUND[ev.kind];
    if (sound) audio.play(sound);
    if (mode === 'map') pushAlert(hud, ev);
    else {
      const line = describeEvent(ev);
      if (line) out.push(line);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The loop
 * ------------------------------------------------------------------ */

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, 0.5);
  lastFrame = now;
  if (!state) return;

  if (running && mode === 'map') {
    const gdt = dt * speed;
    step(state, gdt);

    if (busy) {
      busy.remaining -= gdt;
      if (busy.remaining <= 0) {
        const action = busy.action;
        busy = null;
        if (state.phase === PHASE.DAY || state.phase === PHASE.NIGHT) {
          const r = perform(state, action);
          if (!r.ok) flash(PARSER[r.reason] || 'מאוחר מדי.');
        }
      }
    }
    drainToLines();

    /* A new day means a new briefing; the end of a run means a screen. */
    if (state.phase === PHASE.OVER || state.phase === PHASE.WON) { finish(); return; }
    if (state.phase !== lastPhase || state.night !== lastNight) {
      const wasNight = lastPhase === PHASE.NIGHT;
      lastPhase = state.phase;
      lastNight = state.night;
      if (wasNight && state.phase === PHASE.DAY) { enterPhase(); return; }
    }

    updateMap(mapRefs, state, selected);
    updateHud(hud, state, busy);

    /* Saving is a full JSON round-trip of the world. Once every couple of
     * seconds is enough to survive a closed tab and cheap enough not to show
     * up in a frame budget; sixty times a second was neither. */
    saveIn -= dt;
    if (saveIn <= 0) { saveIn = 2; store.saveRun(state); }
  }

  audio.update(state.danger / GAME_CONFIG.DANGER_MAX, dt);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function setMode(next) {
  mode = next;
  store.setPrefs({ mode });
  qs('#btn-mode').textContent = mode === 'map' ? UI.modeText : UI.modeHud;
  qs('#game').hidden = !running || mode !== 'map';
  con.root.hidden = !running || mode !== 'text';
  if (mode === 'text' && state) {
    print(con, statusLines(state), 'status');
    con.input.focus();
  }
  if (mode === 'map' && state) { lastFrame = performance.now(); }
}

function boot() {
  const p = store.prefs();
  mode = p.mode === 'text' ? 'text' : 'map';

  mapRefs = createMap(
    (roomId) => doAction({ type: 'move', room: roomId }),
    (id) => { selected = (selected === id ? null : id); if (hud) hud.selected = selected; },
  );
  qs('#stage').appendChild(mapRefs.svg);

  hud = createHud(doAction);
  qs('#hud-slot').appendChild(hud.root);

  con = createConsole(onCommand);
  qs('#console-slot').appendChild(con.root);
  con.root.hidden = true;

  speed = SPEEDS.indexOf(p.speed) === -1 ? 1 : p.speed;
  qs('#btn-speed').textContent = `${speed}×`;
  audio.setMuted(!!p.muted);
  qs('#btn-mute').textContent = p.muted ? 'בטל השתקה' : 'השתקה';
  qs('#btn-mode').textContent = mode === 'map' ? UI.modeText : UI.modeHud;

  const b = store.best();
  qs('#menu-best').textContent = b.won
    ? `שרדת את השבוע. השיא: ${b.nights} לילות.`
    : (b.nights ? `הכי רחוק שהגעת: ${b.nights} לילות מתוך 7.` : '');
  qs('#btn-continue').hidden = !store.hasRun();

  /* menu */
  qs('#btn-start').addEventListener('click', () => { audio.start(); store.clearRun(); startRun(null); });
  qs('#btn-continue').addEventListener('click', () => {
    audio.start();
    const saved = store.loadRun();
    if (saved) startRun(saved); else startRun(null);
  });
  qs('#btn-how').addEventListener('click', () => show('how'));
  qs('#btn-how-back').addEventListener('click', () => show('menu'));
  qs('#btn-brief-go').addEventListener('click', () => {
    audio.start();
    lastPhase = state.phase;
    lastNight = state.night;
    show(null);
    if (mode === 'text') print(con, statusLines(state), 'status');
  });

  /* in-game controls */
  qs('#btn-speed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    store.setPrefs({ speed });
    qs('#btn-speed').textContent = `${speed}×`;
  });
  qs('#btn-mode').addEventListener('click', () => setMode(mode === 'map' ? 'text' : 'map'));
  qs('#btn-mute').addEventListener('click', () => {
    const next = !audio.muted;
    audio.setMuted(next);
    store.setPrefs({ muted: next });
    qs('#btn-mute').textContent = next ? 'בטל השתקה' : 'השתקה';
  });
  qs('#btn-pause').addEventListener('click', doPause);
  qs('#btn-resume').addEventListener('click', () => { resume(state); show(null); });
  qs('#btn-pause-mode').addEventListener('click', () => {
    setMode(mode === 'map' ? 'text' : 'map');
    resume(state);
    show(null);
  });
  qs('#btn-quit').addEventListener('click', () => { resume(state); show('menu'); });

  /* outcomes */
  qs('#btn-retry').addEventListener('click', () => startRun(null));
  qs('#btn-again').addEventListener('click', () => startRun(null));
  qs('#btn-over-menu').addEventListener('click', () => show('menu'));
  qs('#btn-won-menu').addEventListener('click', () => show('menu'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && running) { doPause(); return; }
    if (mode !== 'map' || !running || document.activeElement === con.input) return;
    /* Space is the fire button, because in a game about being interrupted the
     * one action that must never need aiming is the one you take by reflex. */
    if (e.code === 'Space') { e.preventDefault(); doAction({ type: 'shoot' }); }
  });

  show('menu');
  requestAnimationFrame(frame);
}

function doPause() {
  if (!running || !state) return;
  pause(state);
  qs('#pause-where').textContent = `${UI.night} ${state.night} · ${ROOM_BY_ID[state.player.room].name}`;
  show('pause');
}

boot();
