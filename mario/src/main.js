/*
 * main.js — boot, and the state machine above the levels.
 *
 * Everything below this file is one level running. This is the layer that
 * decides which one, keeps the lives and the score across it, and draws the
 * cards between: title, level select, the WORLD x-y card, play, dead, clear,
 * game over.
 *
 * The canvas is 256x240 and is scaled up by whole numbers only. A fractional
 * scale resamples every 16-pixel tile differently depending on where it lands,
 * which is exactly the muddy look this art is trying not to have. Better a
 * black border than a blurred picture.
 */

import { createLoop } from './core/loop.js';
import { createInput, bindTouchPad } from './core/input.js';
import { save } from './core/save.js';
import { buildAtlas, makeDrawSprite } from './render/atlas.js';
import { createRenderer } from './render/scene.js';
import { drawHud, drawLevelCard, drawClearCard, drawGameOver, drawPause } from './render/hud.js';
import { createAudio } from './audio/audio.js';
import { musicForTheme } from './audio/music.js';
import { CATALOG, levelById, worldName } from './levels/catalog.js';
import { buildLevel } from './levels/generator.js';
import { World } from './game/world.js';
import { isSolid, isSemiSolid } from './game/tiles.js';
import { SCREEN_W, SCREEN_H, START_LIVES, TIME_BONUS } from './game/constants.js';
import { createTitleScreen, createSelectScreen, createEndingScreen } from './screens.js';

const canvas = document.getElementById('screen');
const stage = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

/* ------------------------------------------------------------------ *
 * Scaling and fullscreen
 * ------------------------------------------------------------------ */

/*
 * The picture is 256x240 and the screen is not, so something has to give.
 *
 * Whole-number scaling is the crisp answer — every source pixel becomes the
 * same square of device pixels — but on a 1080p screen the largest whole
 * multiple of 240 is 960, which leaves an eighth of the display black for the
 * sake of a difference most people cannot see. So: snap to the whole number
 * when it is close, and otherwise take the fractional scale and fill the
 * screen. `image-rendering: pixelated` keeps the edges hard either way; the
 * cost of the fractional case is that some columns of pixels end up a device
 * pixel wider than their neighbours.
 *
 * The aspect ratio is never broken. Stretching 256x240 to 16:9 would make the
 * player oval, and there is no version of "fills the screen" worth that.
 */
const SNAP = 0.12;   // within 12% of a whole step, take the whole step

function fit() {
  const full = !!document.fullscreenElement;
  const margin = full ? 0 : 8;
  const w = window.innerWidth - margin * 2;
  const h = window.innerHeight - margin * 2;
  const raw = Math.min(w / SCREEN_W, h / SCREEN_H);
  const whole = Math.max(1, Math.floor(raw));
  const scale = (raw - whole) / whole < SNAP ? whole : raw;
  canvas.style.width = `${Math.round(SCREEN_W * scale)}px`;
  canvas.style.height = `${Math.round(SCREEN_H * scale)}px`;
}
window.addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);

/*
 * Fullscreen has to be asked for inside a user gesture, which a keypress is
 * and a game-loop tick is not — so this is called from the step, which runs
 * inside the same task as the keydown that set the button. Failures are
 * swallowed: a browser that refuses (an iframe without the permission, an
 * iPhone) should leave the game running in a window, not throw.
 */
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen({ navigationUI: 'hide' });
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
  } catch (e) { /* not available here */ }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

let atlas;
try {
  atlas = buildAtlas();
} catch (e) {
  const el = document.getElementById('fallback');
  el.style.display = 'flex';
  el.textContent = `לא ניתן להפעיל את המשחק בדפדפן הזה: ${e.message}`;
  throw e;
}

const drawSprite = makeDrawSprite(atlas, ctx);
const renderer = createRenderer(ctx, atlas, drawSprite);
const input = createInput();
const audio = createAudio(save.muted);
bindTouchPad(document.getElementById('pad'), input);

const title = createTitleScreen(ctx, drawSprite, audio, input);
const select = createSelectScreen(ctx, drawSprite, audio);
const ending = createEndingScreen(ctx, drawSprite, audio);

/* ------------------------------------------------------------------ *
 * Run state — what survives a death but not a game over
 * ------------------------------------------------------------------ */

function newRun(startId) {
  return {
    lives: START_LIVES,
    score: 0,
    coins: 0,
    power: 0,
    levelId: startId,
    startedAt: startId,
  };
}

let run = newRun(1);
let world = null;
let levelDef = null;
let mode = 'title';       // title | select | card | play | dead | clear | over | ending
let modeTimer = 0;
let paused = false;
let quitArmed = 0;

/*
 * Built fresh every time a level is entered, and deliberately not cached.
 *
 * Playing a level edits its tile array — coins are removed, blocks are spent,
 * bricks are broken — so handing back a cached one would restart you into the
 * level as you left it, with the mushroom already taken. Generation is a few
 * milliseconds for 260 tiles, which is cheaper than the bookkeeping a
 * copy-on-load cache would need.
 */
function getLevel(id) {
  const def = levelById(id);
  const level = buildLevel(def);
  level.music = musicForTheme(def.theme, def.castle);
  return level;
}

function startLevel(id, keepPower) {
  levelDef = levelById(id);
  run.levelId = id;
  if (!keepPower) run.power = run.power || 0;
  const level = getLevel(id);
  world = new World(level, input, audio, run);
  mode = 'card';
  modeTimer = 0;
  audio.stopMusic();
  audio.playJingle('levelStart');
}

function toTitle() {
  mode = 'title';
  world = null;
  title.enter();
}

function toSelect() {
  mode = 'select';
  select.enter();
}

/* ------------------------------------------------------------------ *
 * The step
 * ------------------------------------------------------------------ */

function step(frame) {
  audio.tick();

  switch (mode) {
    case 'title': {
      const next = title.update(input);
      if (next === 'select') toSelect();
      break;
    }

    case 'select': {
      const next = select.update(input);
      if (next === 'title') toTitle();
      else if (next && next.go === 'play') {
        run = newRun(next.id);
        startLevel(next.id, false);
      }
      break;
    }

    case 'card': {
      modeTimer++;
      if (modeTimer > 110 || input.pressed('start') || input.pressed('a')) {
        mode = 'play';
        modeTimer = 0;
        audio.playMusic(world.level.music);
      }
      break;
    }

    case 'play': {
      if (input.pressed('start')) {
        paused = !paused;
        audio.sfx('pause');
        quitArmed = paused ? 40 : 0;
        if (paused) audio.stopMusic();
        else audio.playMusic(world.level.music);
      }
      if (paused) {
        /* A second press of start while already paused leaves the level.
           Armed for a moment first so the press that paused cannot also
           quit. */
        if (quitArmed > 0) quitArmed--;
        else if (input.pressed('b')) { paused = false; toSelect(); }
        break;
      }
      const state = world.update();
      if (state === 'dead' && world.stateTimer > 160) onDeath();
      else if (state === 'finished') onCleared();
      break;
    }

    case 'dead': {
      modeTimer++;
      if (modeTimer > 40) {
        if (run.lives > 0) startLevel(run.levelId, false);
        else { mode = 'over'; modeTimer = 0; audio.playJingle('gameOver'); }
      }
      break;
    }

    case 'clear': {
      modeTimer++;
      /* The clock is cashed in at fifty points a unit, counted down rather
         than added at once, with a tick for each — the sound is most of the
         reward. */
      if (world.timeLeft > 0 && modeTimer % 2 === 0) {
        const chunk = Math.min(world.timeLeft, 5);
        world.timeLeft -= chunk;
        run.score += chunk * TIME_BONUS;
        audio.sfx('coin');
      }
      if (world.timeLeft <= 0 && modeTimer > 150) {
        const next = run.levelId + 1;
        if (next > 100) { mode = 'ending'; ending.enter(); }
        else startLevel(next, true);
      }
      break;
    }

    case 'over': {
      modeTimer++;
      if (modeTimer > 200 || input.pressed('start')) toTitle();
      break;
    }

    case 'ending': {
      const next = ending.update(input);
      if (next === 'title') toTitle();
      break;
    }

    default: break;
  }

  if (input.pressed('mute')) {
    audio.setMuted(!audio.muted);
    save.setMuted(audio.muted);
  }
  if (input.pressed('fullscreen')) toggleFullscreen();
  input.flush();
}

function onDeath() {
  run.lives--;
  run.power = 0;
  mode = 'dead';
  modeTimer = 0;
  save.recordScore(run.score);
}

function onCleared() {
  mode = 'clear';
  modeTimer = 0;
  run.power = world.player.power;
  save.clear(run.levelId, {
    timeLeft: world.timeLeft,
    coins: run.coins,
    score: run.score,
  });
  save.recordScore(run.score);
  save.setCurrent(Math.min(100, run.levelId + 1));
  audio.playJingle('clear');
}

/* ------------------------------------------------------------------ *
 * The frame
 * ------------------------------------------------------------------ */

let frame = 0;

function draw() {
  frame++;
  switch (mode) {
    case 'title': title.draw(frame); break;
    case 'select': select.draw(frame); break;

    case 'card':
      drawLevelCard(ctx, levelDef, run, worldName(levelDef.world));
      /* The player sprite next to the life count. */
      drawSprite('small_idle', 'mario', SCREEN_W / 2 - 34, 128);
      break;

    case 'play':
    case 'dead':
      renderer.draw(world, frame);
      drawHud(ctx, world, run, frame);
      if (paused) drawPause(ctx);
      break;

    case 'clear':
      renderer.draw(world, frame);
      drawHud(ctx, world, run, frame);
      if (modeTimer > 150) drawClearCard(ctx, world, run, levelDef);
      break;

    case 'over': drawGameOver(ctx, run); break;
    case 'ending': ending.draw(frame); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ *
 * Go
 * ------------------------------------------------------------------ */

const loop = createLoop(step, draw);

/* The audio context can only be created inside a user gesture, so the first
   real input unlocks it and every later one is a no-op. */
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);
window.addEventListener('touchstart', unlock, { passive: true });

/* The corner button, for people who would rather not learn a key. It is a
   real click, so the fullscreen request is inside a gesture. */
const fsButton = document.getElementById('fullscreen');
if (fsButton) {
  fsButton.addEventListener('click', () => { audio.unlock(); toggleFullscreen(); });
}

fit();
toTitle();
loop.start();

/* A backgrounded tab should not keep playing music into a room nobody is
   looking at, and coming back should not fast-forward the level. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.stopMusic(); loop.stop(); }
  else loop.start();
});

/* Exposed for tools/mario-smoke.mjs, which drives a real browser through a
   real level and asserts what happened. Nothing in the game reads it — it is
   here so the test can read the map the way a player reads it (where is the
   floor, where is the wall) instead of guessing from pixels. */
window.__mario = {
  tiles: { isSolid, isSemiSolid },
  get mode() { return mode; },
  get world() { return world; },
  get run() { return run; },
  get frame() { return frame; },
  input,
  toggleFullscreen,
  startLevel,
  /* Drops the WORLD x-y card, which the harness has no reason to sit through. */
  skipCard() { if (mode === 'card') { mode = 'play'; modeTimer = 0; } },
  /* A clean run, so one test level cannot start the next one holding a fire
     flower it earned in a different test. */
  resetRun(id) { run = newRun(id || 1); },
  goSelect: toSelect,
  goTitle: toTitle,
  catalog: CATALOG,
};
