/*
 * main.js — boot, the loop, and the two ways to play.
 *
 * What is deliberately *not* here: any rule. This file owns the frame loop,
 * which screen is showing, and turning a keypress into an action object.
 * Everything that decides what happens lives in villa/src/sim/, which has no
 * idea a renderer exists — which is what let the same simulation be shipped
 * first as a floor plan and then as a house you walk around in without a
 * single balance number changing.
 *
 * Two front-ends share it. First person is the game: the room is the
 * interface, and how many boards are on a window is something you find out by
 * looking at the window. The Hebrew prompt is the same night, turn by turn,
 * where time only moves when you act. Both go through one fixed-timestep
 * accumulator in sim.js, so a night played either way unfolds identically.
 *
 * The floor plan from the 2D build survives as the in-game map, on Tab.
 */

import { h, qs, clear, clock } from './ui/dom.js';
import { UI, OUTCOME, PARSER, inRoom, toRoom } from './data/strings.js';
import { GAME_CONFIG } from './data/config.js';
import { nightData } from './data/nights.js';
import { ROOM_BY_ID } from './data/rooms.js';
import { drain } from './core/events.js';
import { PHASE } from './sim/state.js';
import { newRun, step, performTimed, perform, canPerform, actionCost, pause, resume } from './sim/sim.js';

import { Renderer } from './render/renderer.js';
import { MATERIALS, MATERIAL_INDEX, CUTOUT_MATERIALS } from './render/materials.js';
import { MeshBuilder } from './render/meshbuilder.js';
import { buildVilla, EYE_H, WALL_H, roomRect } from './world/build.js';
import { buildProps } from './world/props.js';
import { buildAllBarricades, barricadeSignature } from './world/barricade.js';
import { Input } from './game/input.js';
import { Player } from './game/player.js';
import { findTarget, syncRoom } from './game/interact.js';
import { buildEntities, roomCentres } from './game/entities.js';

import { createMap, updateMap } from './ui/map.js';
import { createHud3d, updateHud3d, pushAlert3d, OPENING_ACTIONS, PROP_ACTIONS } from './ui/hud3d.js';
import { describeEvent } from './ui/hud.js';
import { createConsole, print, clearConsole, parse, statusLines, openingReport } from './ui/text.js';
import { Audio, EVENT_SOUND } from './audio/audio.js';
import * as store from './ui/store.js';

const audio = new Audio();
const input = { ref: null };

let renderer = null;
let world = null;          /* geometry, anchors, lights, walkable areas   */
let gpu = null;            /* uploaded meshes                             */
let player = null;
let state = null;

let hud = null;
let mapRefs = null;
let con = null;

let busy = null;
let mode = 'fp';
let mapOpen = false;
let running = false;
let lastFrame = 0;
let lastPhase = null;
let lastNight = 0;
let saveIn = 2;
let clockTime = 0;

const SPEEDS = [1, 2, 4];
let speed = 1;

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

const SCREENS = ['loading', 'menu', 'how', 'brief', 'pause', 'over', 'won'];

function show(name) {
  for (const s of SCREENS) qs(`#screen-${s}`).hidden = (s !== name);
  const playing = !name;
  running = playing;
  qs('#controls').hidden = !playing;
  qs('#view').hidden = !playing || mode !== 'fp';
  if (hud) hud.root.hidden = !playing || mode !== 'fp';
  if (con) con.root.hidden = !playing || mode !== 'text';
  qs('#mapover').hidden = !(playing && mode === 'fp' && mapOpen);
  if (playing) lastFrame = performance.now();
  if (!playing && document.pointerLockElement) document.exitPointerLock();
}

/* ------------------------------------------------------------------ *
 * Building the villa — once, behind a loading screen
 * ------------------------------------------------------------------ */

/*
 * Baking twenty-five materials at 256px is a second or two of solid
 * arithmetic, so it is done once, on the first run, with the loading screen
 * already painted. Yielding a frame between each one is what lets the bar
 * actually move rather than the whole thing freezing and then finishing.
 */
async function loadWorld() {
  if (world) return;
  show('loading');
  const fill = qs('#load-fill');
  const note = qs('#load-note');
  await frameGap();

  renderer.quality.textureSize = pickTextureSize();
  note.textContent = 'בונה חומרים…';
  const baked = [];
  for (let i = 0; i < MATERIALS.length; i++) {
    baked.push(MATERIALS[i]);
    fill.style.width = `${Math.round((i + 1) / MATERIALS.length * 78)}%`;
    if (i % 4 === 3) await frameGap();
  }
  renderer.setMaterials(baked);

  note.textContent = 'בונה את הבית…';
  fill.style.width = '86%';
  await frameGap();

  world = buildVilla(MATERIAL_INDEX);
  const propMb = new MeshBuilder(20000);
  const props = buildProps(propMb, MATERIAL_INDEX);
  world.props = props;
  world.blockers = props.blockers;
  world.lights = world.lights.concat(props.lights);
  world.anchors = Object.assign({}, world.anchors);
  world.propAnchors = props.anchors;
  world.centres = roomCentres(world.areas);

  gpu = {
    building: renderer.upload(world.mesh),
    props: renderer.upload(propMb.finish()),
    glass: renderer.upload(world.glass),
    barricade: null,
    tape: null,
    entities: null,
    sig: '',
  };

  fill.style.width = '100%';
  await frameGap();
}

function frameGap() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/* A phone baking at 256px spends four seconds on it and then renders at a
 * third of the resolution anyway. */
function pickTextureSize() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 560;
  return (coarse || small) ? 128 : 256;
}

/* ------------------------------------------------------------------ *
 * Runs
 * ------------------------------------------------------------------ */

async function startRun(resumed) {
  await loadWorld();
  state = resumed || newRun(Date.now() >>> 0);
  busy = null;
  lastPhase = null;
  lastNight = 0;
  clockTime = 0;

  /* Standing at the front door, looking into the house. */
  const e = roomRect(ROOM_BY_ID.entrance);
  player = new Player((e.x0 + e.x1) / 2, e.z1 - 1.6, 0);
  player.torch = true;
  state.player.room = 'entrance';

  if (con) clearConsole(con);
  drain(state);
  if (mode === 'text') {
    print(con, ['— שבעה לילות בוילה —', 'כתוב "עזרה" לרשימת הפקודות.'], 'event');
  }
  enterPhase();
}

function enterPhase() {
  if (state.phase !== PHASE.DAY) { show(null); return; }
  const n = nightData(state.night);
  qs('#brief-eyebrow').textContent = state.night === 1
    ? 'הלילה הראשון' : `לפנות בוקר · יום ${state.night}`;
  qs('#brief-title').textContent = `${UI.night} ${state.night} ${UI.of} ${GAME_CONFIG.NIGHTS_TOTAL}`;

  const tally = clear(qs('#brief-tally'));
  for (let i = 1; i <= GAME_CONFIG.NIGHTS_TOTAL; i++) {
    tally.appendChild(h(`i${i < state.night ? '.done' : i === state.night ? '.now' : ''}`));
  }
  qs('#brief-note').textContent = n.note;
  const stats = clear(qs('#brief-stats'));
  for (const [num, label] of [
    [n.total, 'פתחים'], [n.hidden, 'מסתוריים'], [n.threats, 'איומים'], [n.difficulty, 'קושי'],
  ]) {
    stats.appendChild(h('div.stat',
      h('span.stat-num', { text: String(num) }),
      h('span.stat-label', { text: label })));
  }
  show('brief');
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
    [s.nightsSurvived, 'לילות'], [s.shotsFired, 'יריות'],
    [s.planksUsed, 'קרשים'], [s.breaches, 'פריצות'],
  ]) {
    node.appendChild(h('div.stat',
      h('span.stat-num', { text: String(num) }),
      h('span.stat-label', { text: label })));
  }
}

/* ------------------------------------------------------------------ *
 * Acting
 * ------------------------------------------------------------------ */

/*
 * The first-person order: check it is possible, hold the player's hands for
 * the duration, then apply. The house keeps working while you are boarding a
 * window — including, sometimes, the window you were boarding.
 */
function doAction(action) {
  if (!running || busy || !state) return;
  audio.start();
  const why = canPerform(state, action);
  if (why) {
    pushAlert3d(hud, PARSER[why] || 'אי אפשר.', 'warn');
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

/* Events into Hebrew and into sound, for whichever front-end is showing. */
function drainEvents() {
  const lines = [];
  for (const ev of drain(state)) {
    const sound = EVENT_SOUND[ev.kind];
    if (sound) audio.play(sound);
    const line = describeEvent(ev);
    if (!line) continue;
    if (mode === 'fp') pushAlert3d(hud, line, TONE[ev.kind] || 'plain');
    else lines.push(line);
  }
  return lines;
}

const TONE = {
  breached: 'bad', critical: 'bad', intruder_near: 'bad', defenseless: 'bad',
  intruder_in: 'warn', under_pressure: 'warn', noise: 'warn', hidden_appeared: 'warn',
  tape_snapped: 'warn', plank_broke: 'warn', neighbor_leaving_soon: 'warn',
  hidden_revealed: 'good', hidden_self_revealed: 'good', resecured: 'good',
  drawer_found: 'good', neighbor_arrived: 'good', night_survived: 'good',
  phone_dialing: 'good', shot_intruder_out: 'good',
};

/* ------------------------------------------------------------------ *
 * The loop
 * ------------------------------------------------------------------ */

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  if (!state || !world) return;
  clockTime += dt;

  if (running && mode === 'fp') {
    const gdt = dt * speed;

    /* --- the player --- */
    const moved = player.update(dt, input.ref, world, {});
    if (moved.stepped) audio.play('step');
    syncRoom(state, player.roomAt(world.areas));

    /* --- the world --- */
    step(state, gdt);
    if (busy) {
      busy.remaining -= gdt;
      if (busy.remaining <= 0) {
        const action = busy.action;
        busy = null;
        if (state.phase === PHASE.DAY || state.phase === PHASE.NIGHT) {
          const r = perform(state, action);
          if (!r.ok) pushAlert3d(hud, PARSER[r.reason] || 'מאוחר מדי.', 'warn');
        }
      }
    }
    handleKeys();
    drainEvents();

    if (state.phase === PHASE.OVER || state.phase === PHASE.WON) { finish(); return; }
    if (state.phase !== lastPhase || state.night !== lastNight) {
      const wasNight = lastPhase === PHASE.NIGHT;
      lastPhase = state.phase;
      lastNight = state.night;
      if (wasNight && state.phase === PHASE.DAY) { enterPhase(); return; }
    }

    /* --- draw --- */
    const target = findTarget(
      { x: player.x, y: player.y, z: player.z, room: state.player.room, forward: () => player.forward() },
      state, world.anchors, world.propAnchors,
    );
    renderer.resize();
    renderer.updateFlicker(clockTime);
    renderer.render(buildView(target, dt));
    updateHud3d(hud, state, { target, busy, dt, torch: player.torch });

    if (mapOpen) updateMap(mapRefs, state, target && target.kind === 'opening' ? target.id : null);

    saveIn -= dt;
    if (saveIn <= 0) { saveIn = 2; store.saveRun(state); }
  }

  audio.update(state.danger / GAME_CONFIG.DANGER_MAX, dt);
}

/*
 * Everything the renderer needs this frame. The barricades are rebuilt only
 * when a board or a roll actually changed — fifteen openings' worth of
 * oriented boxes is not something to redo sixty times a second to arrive at
 * the same buffer.
 */
function buildView(target, dt) {
  const sig = barricadeSignature(state.openings);
  if (sig !== gpu.sig) {
    gpu.sig = sig;
    const built = buildAllBarricades(state.openings, world.anchors, MATERIAL_INDEX);
    if (gpu.barricade) renderer.release(gpu.barricade);
    if (gpu.tape) renderer.release(gpu.tape);
    gpu.barricade = renderer.upload(built.solid);
    gpu.tape = renderer.upload(built.tape);
  }

  const ent = buildEntities(state, world.anchors, world.centres, MATERIAL_INDEX, clockTime);
  gpu.entities = renderer.uploadDynamic(gpu.entities, ent);

  const meshes = [
    { mesh: gpu.building }, { mesh: gpu.props }, { mesh: gpu.barricade },
    { mesh: gpu.entities && gpu.entities.count ? gpu.entities : null },
    { mesh: gpu.glass },
    { mesh: gpu.tape, cutout: true },
  ];

  /*
   * The lamps go out at dusk. Not for effect — it is the mechanic the whole
   * game rests on. In daylight you can see the whole room and the work is
   * bookkeeping; at night there is one failing bulb and a torch, and the same
   * work becomes a decision about where not to be looking.
   */
  const night = state.phase !== PHASE.DAY;
  const danger = state.danger / GAME_CONFIG.DANGER_MAX;
  /* At dusk most of the house goes dark. One fixture per room stays on at a
   * third, which is enough to navigate by and nowhere near enough to work by —
   * that is what the torch is for, and what makes turning it off to listen a
   * real decision rather than a setting. */
  const lights = world.lights.map((l) => Object.assign({}, l, {
    intensity: (l.intensity === undefined ? 1 : l.intensity) * (night ? 0.30 : 1),
  }));

  return {
    camera: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, fov: 70 },
    meshes,
    lights,
    torch: {
      on: player.torch, level: night ? 1 : 0.55,
      range: 15, inner: 15, outer: 31,
    },
    ambient: night ? [0.010, 0.012, 0.020] : [0.16, 0.155, 0.145],
    fog: { color: night ? [0.010, 0.012, 0.020] : [0.045, 0.046, 0.050], density: night ? 0.075 : 0.035 },
    stress: danger,
    time: clockTime,
  };
}

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

/*
 * Read once per frame rather than on the event, so that holding a key does
 * not queue fifty barricades and so that every action goes through the same
 * "is anything in front of me" check.
 */
function handleKeys() {
  const inp = input.ref;
  const taps = inp.takeTaps();
  if (!taps.length) return;

  const target = findTarget(
    { x: player.x, y: player.y, z: player.z, room: state.player.room, forward: () => player.forward() },
    state, world.anchors, world.propAnchors,
  );

  for (const tap of taps) {
    if (tap === 'torch') { player.torch = !player.torch; audio.play('click'); continue; }
    if (tap === 'shoot') { doAction({ type: 'shoot' }); continue; }
    if (tap === 'search') { doAction({ type: 'search' }); continue; }
    if (tap === 'ready') { doAction({ type: 'ready' }); continue; }

    if (tap === 'interact') {
      if (!target) { doAction({ type: 'search' }); continue; }
      if (target.kind === 'opening') {
        /* The first thing that is actually possible, which is what a person
         * reaching for a window would do. */
        const a = OPENING_ACTIONS.find((x) => !canPerform(state, { type: x.type, id: target.id }));
        if (a) doAction({ type: a.type, id: target.id });
        else pushAlert3d(hud, 'אין מה לעשות כאן עכשיו.', 'warn');
      } else {
        const a = PROP_ACTIONS[target.kind];
        if (a) doAction({ type: a.type });
      }
      continue;
    }

    const n = OPENING_ACTIONS.find((x) => x.key === tap);
    if (n && target && target.kind === 'opening') doAction({ type: n.type, id: target.id });
  }
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
  const lines = drainEvents();
  if (result.reason === 'foundNothing') lines.push('חיפשת. לא מצאת כלום.');
  if (lines.length) print(con, lines, 'event');

  if (state.phase === PHASE.OVER || state.phase === PHASE.WON) { finish(); return; }
  if (before === PHASE.DAY && state.phase === PHASE.NIGHT) print(con, ['השמש שקעה.'], 'bad');
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
  return [
    `${o.name} — ${inRoom(ROOM_BY_ID[o.room].name)}.`,
    `נזק: ${Math.round(o.integrity * 100)}% · קרשים: ${o.planks} · סקוץ׳: ${o.tape}`
    + (o.canTape ? '' : ' · אי אפשר להדביק על זה סקוץ׳'),
    o.attackers > 0 ? 'משהו עובד עליו עכשיו.' : 'שקט מהצד השני.',
  ];
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/*
 * The two front-ends track position differently — the prompt knows which room
 * you are in, the first-person view knows where you are standing in it — so
 * switching has to reconcile them or you walk out of the kitchen at the prompt
 * and find yourself still in the living room in 3D.
 */
function placeInRoom(roomId) {
  if (!player || !world) return;
  const c = world.centres[roomId];
  if (!c) return;
  player.x = c.x;
  player.z = c.z;
  player.vx = 0;
  player.vz = 0;
}

function setMode(next) {
  const was = mode;
  mode = next;
  if (was === 'text' && next === 'fp' && state) placeInRoom(state.player.room);
  store.setPrefs({ mode });
  qs('#btn-mode').textContent = mode === 'fp' ? UI.modeText : 'מצב תלת־ממד';
  qs('#view').hidden = !running || mode !== 'fp';
  hud.root.hidden = !running || mode !== 'fp';
  con.root.hidden = !running || mode !== 'text';
  qs('#mapover').hidden = !(running && mode === 'fp' && mapOpen);
  if (mode === 'text' && state) {
    if (document.pointerLockElement) document.exitPointerLock();
    print(con, statusLines(state), 'status');
    con.input.focus();
  }
  lastFrame = performance.now();
}

function toggleMap() {
  mapOpen = !mapOpen;
  qs('#mapover').hidden = !(running && mode === 'fp' && mapOpen);
  if (mapOpen && document.pointerLockElement) document.exitPointerLock();
}

function doPause() {
  if (!running || !state) return;
  pause(state);
  qs('#pause-where').textContent = `${UI.night} ${state.night} · ${ROOM_BY_ID[state.player.room].name}`;
  show('pause');
}

function boot() {
  const canvas = qs('#view');
  try {
    renderer = new Renderer(canvas, { renderScale: pickRenderScale() });
  } catch (e) {
    /* No WebGL2. The game still exists — it is the same simulation — so say so
     * and drop straight into the prompt rather than showing a black page. */
    qs('#screen-menu').hidden = false;
    qs('#menu-best').textContent = 'הדפדפן הזה לא תומך ב-WebGL2. המשחק ירוץ במצב טקסט.';
    mode = 'text';
  }

  input.ref = new Input(canvas);
  hud = createHud3d();
  qs('#hud-slot').appendChild(hud.root);

  mapRefs = createMap(() => {}, () => {});
  qs('#stage').appendChild(mapRefs.svg);

  con = createConsole(onCommand);
  qs('#console-slot').appendChild(con.root);
  con.root.hidden = true;

  const p = store.prefs();
  mode = (p.mode === 'text' || !renderer) ? 'text' : 'fp';
  speed = SPEEDS.indexOf(p.speed) === -1 ? 1 : p.speed;
  qs('#btn-speed').textContent = `${speed}×`;
  qs('#btn-mode').textContent = mode === 'fp' ? UI.modeText : 'מצב תלת־ממד';
  audio.setMuted(!!p.muted);
  qs('#btn-mute').textContent = p.muted ? 'בטל השתקה' : 'השתקה';

  const b = store.best();
  if (renderer) {
    qs('#menu-best').textContent = b.won
      ? `שרדת את השבוע. השיא: ${b.nights} לילות.`
      : (b.nights ? `הכי רחוק שהגעת: ${b.nights} לילות מתוך 7.` : '');
  }
  qs('#btn-continue').hidden = !store.hasRun();

  qs('#btn-start').addEventListener('click', () => { audio.start(); store.clearRun(); startRun(null); });
  qs('#btn-continue').addEventListener('click', () => {
    audio.start();
    startRun(store.loadRun());
  });
  qs('#btn-how').addEventListener('click', () => show('how'));
  qs('#btn-how-back').addEventListener('click', () => show('menu'));
  qs('#btn-brief-go').addEventListener('click', () => {
    audio.start();
    lastPhase = state.phase;
    lastNight = state.night;
    show(null);
    if (mode === 'fp') input.ref.requestLock();
    else print(con, statusLines(state), 'status');
  });

  qs('#btn-speed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    store.setPrefs({ speed });
    qs('#btn-speed').textContent = `${speed}×`;
  });
  qs('#btn-map').addEventListener('click', toggleMap);
  qs('#btn-mode').addEventListener('click', () => setMode(mode === 'fp' ? 'text' : 'fp'));
  qs('#btn-mute').addEventListener('click', () => {
    const next = !audio.muted;
    audio.setMuted(next);
    store.setPrefs({ muted: next });
    qs('#btn-mute').textContent = next ? 'בטל השתקה' : 'השתקה';
  });
  qs('#btn-pause').addEventListener('click', doPause);
  qs('#btn-resume').addEventListener('click', () => {
    resume(state); show(null);
    if (mode === 'fp') input.ref.requestLock();
  });
  qs('#btn-pause-mode').addEventListener('click', () => {
    setMode(mode === 'fp' ? 'text' : 'fp'); resume(state); show(null);
  });
  qs('#btn-quit').addEventListener('click', () => { resume(state); show('menu'); });
  qs('#btn-retry').addEventListener('click', () => startRun(null));
  qs('#btn-again').addEventListener('click', () => startRun(null));
  qs('#btn-over-menu').addEventListener('click', () => show('menu'));
  qs('#btn-won-menu').addEventListener('click', () => show('menu'));

  canvas.addEventListener('click', () => {
    if (running && mode === 'fp' && !mapOpen) {
      if (!input.ref.locked) input.ref.requestLock();
      else input.ref.press('shoot');
    }
  });

  /*
   * One key table. Everything routes through Input's tap queue so that the
   * on-screen buttons on a phone and the keyboard hit the identical path.
   */
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { if (mapOpen) toggleMap(); else if (running) doPause(); return; }
    if (!running || mode !== 'fp') return;
    if (document.activeElement === con.input) return;
    const map = {
      KeyE: 'interact', KeyF: 'torch', Space: 'shoot', KeyQ: 'search',
      Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', KeyR: 'ready',
    };
    if (e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
    const tap = map[e.code];
    if (tap) { e.preventDefault(); input.ref.press(tap); }
  });

  window.addEventListener('resize', () => { if (renderer) renderer.resize(); });

  show('menu');
  requestAnimationFrame(frame);
}

function pickRenderScale() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? 0.72 : 1;
}

boot();
