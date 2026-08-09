/*
 * main.js — boot, the frame loop, and the seam between menu and game.
 *
 * There is one renderer, one world and one audio graph for the life of the
 * tab. The menu is not a separate scene; it is the same train seen from the
 * platform. Starting a game moves the camera inside and resets the run state,
 * which is why "Play" is instant and why the menu's train is the train you get
 * on.
 */

import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { randomSeed } from './core/rng.js';
import { loadSettings, saveSettings, loadProfile, saveProfile, loadSave, hasSave, clearSave } from './core/store.js';
import { AudioEngine } from './audio/engine.js';
import { Sfx } from './audio/sfx.js';
import { AchievementTracker } from './game/achievements.js';
import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { Overlay } from './ui/overlay.js';
import { Menu } from './ui/menu.js';
import { Backdrop } from './ui/backdrop.js';

const canvas = document.getElementById('view');
const hudRoot = document.getElementById('hud');
const overlayRoot = document.getElementById('overlay');
const menuRoot = document.getElementById('menu');

const events = new Emitter();
const settings = loadSettings();
const profile = loadProfile();
const audio = new AudioEngine(settings);
const sfx = new Sfx(audio, events);
const achievements = new AchievementTracker(profile, events);

let game = null;
let menu = null;
let hud = null;
let overlay = null;
let backdrop = null;
let input = null;
let mode = 'boot';        // boot | menu | playing | paused | ending
let loop = null;
/* A monotonic simulation clock, separate from the frame clock, so the
   headless test can run several simulation steps per drawn frame without
   handing the game a delta big enough to teleport through a closing door. */
let simClock = 0;
let subSteps = 1;

boot();

function boot() {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'preparing the 00:47';
  document.getElementById('app').appendChild(loading);

  try {
    game = new Game({ canvas, settings, profile, events, audio, sfx, achievements });
  } catch (err) {
    loading.remove();
    fatal(err);
    return;
  }

  hud = new Hud(hudRoot, events, settings);
  overlay = new Overlay(overlayRoot, events, sfx);
  input = new Input(canvas);
  input.onEscape = onEscape;
  input.onLockChange = (locked) => {
    document.body.classList.toggle('playing', locked);
    /* Losing the lock any way other than through the pause key still pauses,
       because the alternative is a game that carries on being played by
       nobody. */
    if (!locked && mode === 'playing') pause();
  };

  menu = new Menu(menuRoot, {
    settings, profile, events, sfx,
    callbacks: {
      onPlay: ({ nightmare }) => startRun({ nightmare }),
      onContinue: () => resumeSave(),
      onResume: () => unpause(),
      onQuitToMenu: () => toMenu(),
      onSettingsChanged: applySettings,
      hasSave: () => hasSave(),
    },
  });

  overlay.onClose = () => {
    if (mode !== 'playing') return;
    game.player.locked = false;
    /* The click that dismissed the overlay is still in the buffer. Without a
       beat of cooldown the same click interacts with whatever the crosshair
       happens to be resting on the moment the paper comes away. */
    game.interactCooldown = 0.3;
    input.requestLock();
  };
  /* A document stops the world; a line of flavour text does not. Locking the
     player out of walking for four seconds because they looked at a window is
     the single most annoying thing this layer could do. */
  events.on('overlay:open', ({ transient }) => {
    if (game && !transient) game.player.locked = true;
  });
  events.on('ending', (payload) => onEnding(payload));
  events.on('achievement', () => saveProfile(profile));

  /* The world is built once, here, and every subsequent "new game" reuses it.
     Building costs a few hundred milliseconds of canvas drawing and mesh
     construction, and doing it between the menu and the first frame of a run
     would be the only stall in the game. */
  requestAnimationFrame(() => {
    try {
      game.build(randomSeed());
      backdrop = new Backdrop(game, sfx);
    } catch (err) {
      loading.remove();
      fatal(err);
      return;
    }
    loading.remove();
    toMenu();
    loop = new Loop(frame);
    loop.start();
  });

  window.addEventListener('resize', () => game?.renderer.resize());
  window.addEventListener('beforeunload', () => {
    saveSettings(settings);
    saveProfile(profile);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') pause();
  });

  canvas.addEventListener('mousedown', () => {
    audio.init();
    audio.resume();
    if (mode === 'playing' && !input.locked && !overlay.open) input.requestLock();
  });
}

/* ---- frame ------------------------------------------------------------- */

function frame(dt) {
  simClock += dt;
  if (mode === 'menu' || mode === 'ending') {
    backdrop?.update(dt, simClock);
    backdrop?.render();
    audio.updateAmbient(dt, 0, { doorsOpen: true, hvac: true });
    return;
  }

  if (mode === 'paused') {
    /* Still drawn, still lit, simply not advancing. A paused horror game that
       goes black loses the thing it spent an hour building. */
    game.render();
    return;
  }

  if (mode === 'playing') {
    for (let i = 0; i < subSteps; i++) {
      if (i > 0) simClock += dt;
      game.update(dt, i === 0 ? input : null, simClock);
      if (mode !== 'playing') break;
    }
    game.render();
    hud.update(overlay.open ? null : game.player.hover, { hideAll: overlay.open });
    input.endFrame();
  }
}

/* ---- transitions -------------------------------------------------------- */

function toMenu() {
  mode = 'menu';
  hud.show(false);
  overlay.hide(true);
  input.releaseLock();
  input.enabled = false;
  document.body.classList.remove('playing');
  if (game?.running) game.running = false;
  backdrop?.enter();
  menu.showMain({ hasSave: hasSave() });
  saveProfile(profile);
  saveSettings(settings);
}

function startRun({ nightmare = false } = {}) {
  audio.init();
  audio.resume();
  clearSave();
  backdrop?.leave();
  menu.close();
  hud.show(true);
  input.enabled = true;
  mode = 'playing';
  game.startNew({ nightmare, seed: randomSeed() });
  input.requestLock();
}

function resumeSave() {
  const save = loadSave();
  if (!save) { startRun({}); return; }
  audio.init();
  audio.resume();
  backdrop?.leave();
  menu.close();
  hud.show(true);
  input.enabled = true;
  mode = 'playing';
  game.loadFrom(save);
  input.requestLock();
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.enabled = false;
  input.releaseLock();
  document.body.classList.remove('playing');
  hud.show(false);
  audio.duck(0.25, 0.3);
  menu.showPause({
    stationName: game.station?.name,
    clues: game.state?.clues.size ?? 0,
    clueSet: game.state?.clues,
    nightmare: game.nightmare,
  });
}

function unpause() {
  if (mode !== 'paused') return;
  menu.close();
  hud.show(true);
  input.enabled = true;
  mode = 'playing';
  audio.duck(1, 0.4);
  input.requestLock();
}

function onEscape() {
  if (overlay.open) { overlay.hide(); return; }
  if (mode === 'playing') { pause(); return; }
  if (mode === 'paused') { unpause(); }
}

function onEnding(payload) {
  mode = 'ending';
  input.enabled = false;
  input.releaseLock();
  document.body.classList.remove('playing');
  saveProfile(profile);
  /* The fade is already running inside the game; the card arrives after it
     has finished, on black. */
  setTimeout(() => {
    hud.show(false);
    backdrop?.enter();
    backdrop.fx.fade = 1;
    menu.runState = {
      clueSet: payload.state.clues,
      nightmare: payload.nightmare,
      stationName: game.station?.name,
      clues: payload.state.clues.size,
    };
    menu.showEnding(payload);
    audio.duck(1, 2.5);
  }, 3400);
}

function applySettings(next) {
  Object.assign(settings, next);
  saveSettings(settings);
  audio.applySettings(settings);
  game?.renderer.applySettings(settings);
  sfx.systemVoice = settings.speechVoice === 'system';
  document.documentElement.style.setProperty('--hud-scale', String(settings.subtitleSize ?? 1));
}

function fatal(err) {
  console.error(err);
  const message = String(err?.message || err).includes('WEBGL2')
    ? 'This game needs WebGL 2, and this browser is not giving it to us.'
    : 'Something went wrong before the doors opened.';
  const shell = menu || { showFatal: null };
  if (shell.showFatal) shell.showFatal(message, String(err?.message || err));
  else {
    menuRoot.classList.add('open');
    menuRoot.innerHTML = `<div class="fatal"><div><h1>The 00:47 is cancelled</h1><p>${message}</p></div></div>`;
  }
}

/* Exposed for the headless smoke test, which drives a whole journey without a
   pair of hands. Harmless in a browser and it is the only way to assert that
   an ending is reachable without playing to it. */
window.__lastTrain = {
  get mode() { return mode; },
  get game() { return game; },
  get settings() { return settings; },
  get profile() { return profile; },
  get clock() { return simClock; },
  events,
  startRun,
  toMenu,
  pause,
  unpause,
  /* Simulation steps per drawn frame. 1 in normal play. */
  setSubSteps(n) { subSteps = Math.max(1, Math.min(64, n | 0)); },
  applySettings,
};
