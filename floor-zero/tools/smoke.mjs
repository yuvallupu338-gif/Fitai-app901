/**
 * End-to-end playthrough in a real browser.
 *
 * Boots the built game in Chromium, plays from the main menu through the
 * prologue, all five chapters and one ending, and fails if the console reports
 * an error at any point. Run with:  node tools/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'The smoke test needs Playwright, which is not a project dependency:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  );
  process.exit(1);
}

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const shotsDir = path.join(root, 'dist', 'shots');
const PORT = 4319;
const BASE = `http://127.0.0.1:${PORT}/`;

const ENDING = Number(process.argv[2] ?? 1);
const chromePath = [process.env.FZ_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (candidate) => candidate && existsSync(candidate),
);
const KEEP_SHOTS = process.argv.includes('--shots');

async function alreadyServing() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function startServer() {
  // Detached so the whole `npx → sh → vite` tree can be killed as one group.
  // SIGTERM to npx alone leaves the vite process holding the port and its stdio
  // pipe open, which keeps this script's event loop alive for ever.
  const child = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server did not start')), 25000);
    const onData = (buffer) => {
      if (buffer.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
  });
}

const steps = [];
function pass(name, detail = '') {
  steps.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  console.log(`  ✗ ${name} — ${detail}`);
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  // Reuse a preview server that is already up, otherwise start one and make
  // sure it dies with this process.
  const server = (await alreadyServing()) ? null : await startServer();
  const stopServer = () => {
    if (!server?.pid) return;
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  if (server) {
    for (const signal of ['SIGINT', 'SIGTERM', 'exit']) process.on(signal, stopServer);
  }

  const browser = await chromium.launch({
    // Use a preinstalled Chromium when one is available, else Playwright's own.
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--mute-audio',
    ],
  });

  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  let shotIndex = 0;
  const shot = async (name) => {
    if (!KEEP_SHOTS) return;
    shotIndex += 1;
    await page.screenshot({ path: path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`) });
  };

  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__floorZero, null, { timeout: 90000 });
    await page.waitForFunction(() => window.__floorZero.state.phase === 'menu', null, { timeout: 90000 });
    pass('main menu reached');
    await shot('menu');

    // The menu backdrop is a live render, so a frame must actually have drawn.
    const drew = await page.evaluate(() => window.__floorZero.renderer.info.render.frame > 3);
    drew ? pass('renderer is drawing frames') : fail('renderer is drawing frames', 'no frames');

    // --- Menu buttons -------------------------------------------------
    const buttonLabels = await page.$$eval('.menu__content .btn', (nodes) =>
      nodes.map((node) => ({ text: node.textContent, disabled: node.disabled })),
    );
    buttonLabels.length >= 5
      ? pass('menu buttons present', `${buttonLabels.length} buttons`)
      : fail('menu buttons present', JSON.stringify(buttonLabels));

    await page.click('text=הגדרות');
    await page.waitForSelector('.settings:not([hidden])');
    const tabCount = await page.$$eval('.tabs .tab', (n) => n.length);
    tabCount === 5 ? pass('settings opens with all tabs') : fail('settings tabs', String(tabCount));
    await page.click('.settings .panel__header .btn');
    pass('settings closes');

    // Software rendering: run at the cheapest settings so the frame rate stays
    // high enough for the timed sequences to play at a sensible pace.
    await page.evaluate(() => {
      const g = window.__floorZero;
      g.applySettings({ ...g.settings, quality: 'low', shadows: false, screenEffects: 0 }, false);
    });
    pass('applies low quality settings');

    // --- Start the game ------------------------------------------------
    await page.click('text=משחק חדש');
    await page.waitForFunction(() => window.__floorZero.state.phase === 'playing', null, { timeout: 90000 });
    pass('new game starts');

    // Prologue is a cinematic; wait for control to return.
    await page.waitForFunction(() => !window.__floorZero.state.cinematic, null, { timeout: 90000 });
    pass('prologue hands control to the player');
    await shot('street');

    const run = (fn, arg) => page.evaluate(fn, arg);

    // --- Walk into the lobby -------------------------------------------
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(0, 3.4, 0);
      g.interactions.activate(g.interactions.get('door_entrance'), g);
    });
    await page.waitForTimeout(900);
    await run(() => window.__floorZero.player.teleport(0, -1.5, 0));
    await page.waitForTimeout(300);
    const inLobby = await run(() => window.__floorZero.world.roomAt(0, -1.5) === 'lobby');
    inLobby ? pass('entered the lobby') : fail('entered the lobby', 'room lookup failed');
    await shot('lobby');

    // --- Restore power --------------------------------------------------
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(3.6, -5, Math.PI / 2);
      g.interactions.activate(g.interactions.get('lobby_power'), g);
    });
    const powered = await run(() => window.__floorZero.state.flag('lobby_power'));
    powered ? pass('electrical cabinet restores power') : fail('cabinet', 'flag not set');

    // --- Ride down ------------------------------------------------------
    await run(() => {
      const g = window.__floorZero;
      g.interactions.activate(g.interactions.get('lift_call'), g);
    });
    await page.waitForTimeout(1400);
    await run(() => {
      const g = window.__floorZero;
      const rig = g.world.current.elevator;
      g.player.teleport(rig.interior.x, rig.interior.z, rig.facing);
      g.interactions.activate(g.interactions.get('lift_button_0'), g);
    });
    await page.waitForFunction(() => window.__floorZero.world.levelId === 'floor0', null, { timeout: 90000 });
    await page.waitForFunction(() => !window.__floorZero.state.cinematic, null, { timeout: 90000 });
    pass('the lift arrives at Floor 0');
    await shot('floor0');

    const visit1 = await run(() => window.__floorZero.state.run.visit);
    visit1 === 1 ? pass('visit counter starts at 1') : fail('visit counter', String(visit1));

    const recording = await run(() => window.__floorZero.recorder.isRecording);
    recording ? pass('the recorder is running') : fail('recorder', 'not recording');

    // --- The optional photographs ----------------------------------------
    const photoTaken = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(1.05, -0.3, 0);
      g.interactions.activate(g.interactions.get('photo_1'), g);
      g.ui.hideNote();
      return g.state.flag('found_photo_1');
    });
    photoTaken ? pass('a hidden photograph can be collected') : fail('photograph', 'flag not set');

    // The corridor board is readable, and says something before it knows you.
    const boardRead = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(2.0, -0.4, 0);
      g.interactions.activate(g.interactions.get('corridor_board_read'), g);
      const open = g.ui.isReading;
      g.ui.hideNote();
      return open;
    });
    boardRead ? pass('the notice board can be read') : fail('notice board', 'reader did not open');

    // --- Nothing is hidden inside solid geometry --------------------------
    // Walls are 0.18m thick and centred on their coordinate, and picture
    // surrounds have depth of their own, so a flat panel placed at the wall's
    // coordinate is swallowed whole and silently never drawn. Every note,
    // plate, drawing and photograph has to clear the surface it hangs on.
    const buried = await run(() => {
      const g = window.__floorZero;
      const solids = [];
      const panels = [];
      g.world.current.builder.group.traverse((object) => {
        if (!object.geometry || !object.visible) return;
        object.updateWorldMatrix(true, false);
        if (object.geometry.type === 'PlaneGeometry') {
          const e = object.matrixWorld.elements;
          panels.push({ name: object.name, x: e[12], y: e[13], z: e[14] });
          return;
        }
        if (object.geometry.type !== 'BoxGeometry') return;
        object.geometry.computeBoundingBox();
        solids.push({
          name: object.name,
          box: object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld),
        });
      });
      // A hair of tolerance so a panel resting flush on a face is not "inside".
      const bite = 0.004;
      return panels
        .map((panel) => {
          const hit = solids.find(
            (s) =>
              panel.x > s.box.min.x + bite && panel.x < s.box.max.x - bite &&
              panel.y > s.box.min.y + bite && panel.y < s.box.max.y - bite &&
              panel.z > s.box.min.z + bite && panel.z < s.box.max.z - bite,
          );
          return hit ? `${panel.name} in ${hit.name}` : null;
        })
        .filter(Boolean);
    });
    buried.length === 0
      ? pass('no wall decoration is buried in solid geometry')
      : fail('buried decorations', `${buried.length}: ${buried.slice(0, 4).join(', ')}`);

    // --- Every doorway is walkable ----------------------------------------
    // Furniture is placed by hand in room coordinates, so nothing stops a
    // wardrobe being written into the middle of a doorway — and it is only
    // noticed by someone who happens to walk that way.
    const doorways = await run(() => {
      const g = window.__floorZero;
      const collision = g.world.collision;
      // Everything that is supposed to be openable, opened: a shut leaf and the
      // sealed alcove are meant to block, and neither is what this is looking
      // for. Prior states are remembered so the level is handed back intact.
      const wasOpen = g.world.current.doors.all.map((door) => [door, door.open]);
      for (const [door] of wasOpen) door.forceState(true);
      collision.setSolid('alcove_seal', false);
      collision.setSolid('control_cover', false);
      collision.setSolid('shutter_col', false);

      const RADIUS = 0.3;
      const openings = [
        { id: 'apt01', at: -1.4, x: 4.3, into: -1 },
        { id: 'alcove', at: -1.4, x: 8.9, into: -1 },
        { id: 'apt03', at: -1.4, x: 13.3, into: -1 },
        { id: 'control', at: -1.4, x: 22.5, into: -1 },
        { id: 'apt02', at: 1.4, x: 8.3, into: 1 },
        { id: 'apt04a', at: 1.4, x: 18.0, into: 1 },
        { id: 'apt04b', at: 1.4, x: 20.6, into: 1 },
      ];
      const blocked = [];
      for (const o of openings) {
        for (const step of [-0.5, 0, 0.5, 1.0, 1.5]) {
          const z = o.at + o.into * step;
          if (!collision.overlaps(o.x, z, RADIUS, 0.05, 1.7)) continue;
          const by = collision.all
            .filter(
              (b) =>
                b.solid &&
                o.x > b.minX - RADIUS && o.x < b.maxX + RADIUS &&
                z > b.minZ - RADIUS && z < b.maxZ + RADIUS &&
                b.minY < 1.7 && b.maxY > 0.05,
            )
            .map((b) => b.id);
          blocked.push(`${o.id} by ${by.join('/') || '?'}`);
          break;
        }
      }

      // Put the level back the way it was found: the shutter puzzle is tested
      // later in this same run and needs its collider, and the lift doors have
      // to stay as the arrival left them.
      for (const [door, open] of wasOpen) door.forceState(open);
      collision.setSolid('alcove_seal', true);
      collision.setSolid('control_cover', true);
      collision.setSolid('shutter_col', true);
      return blocked;
    });
    doorways.length === 0
      ? pass('every doorway can be walked through')
      : fail('blocked doorways', doorways.slice(0, 3).join(', '));

    // --- Chapter 1: find the fuse, restore the floor --------------------
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(4.3, -0.2, 0);
      g.interactions.activate(g.interactions.get('door_apt01'), g);
    });
    await page.waitForTimeout(700);
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(3.1, -4.8, Math.PI);
      g.interactions.activate(g.interactions.get('fuse'), g);
    });
    const hasFuse = await run(() => window.__floorZero.state.hasItem('fuse'));
    hasFuse ? pass('the fuse can be picked up') : fail('fuse', 'not collected');

    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(2.6, 0.6, Math.PI);
      g.interactions.activate(g.interactions.get('corridor_panel_use'), g);
    });
    const floorPower = await run(() => window.__floorZero.state.flag('floor_power'));
    const chapterAfter1 = await run(() => window.__floorZero.state.run.chapter);
    floorPower ? pass('the fuse restores the floor') : fail('floor power', 'flag not set');
    chapterAfter1 === 2 ? pass('chapter 1 completes') : fail('chapter advance', `chapter=${chapterAfter1}`);

    // Walk a little so the recording has real movement in it.
    await run(async () => {
      const g = window.__floorZero;
      for (let i = 0; i < 40; i++) {
        g.player.teleport(2.6 + i * 0.2, 0, -Math.PI / 2);
        await new Promise((r) => setTimeout(r, 16));
      }
    });

    // --- Ride again: chapter 2 -------------------------------------------
    const rideBack = async () => {
      const before = await run(() => window.__floorZero.state.run.visit);
      await run(() => {
        const g = window.__floorZero;
        const rig = g.world.current.elevator;
        g.player.teleport(rig.interior.x, rig.interior.z, rig.facing);
        g.interactions.activate(g.interactions.get('lift_button_0'), g);
      });
      // The visit counter only moves once the floor has actually been rebuilt.
      await page.waitForFunction((b) => window.__floorZero.state.run.visit > b, before, {
        timeout: 120000,
      });
      await page.waitForFunction(() => !window.__floorZero.state.cinematic, null, { timeout: 120000 });
      await page.waitForTimeout(600);
    };

    await rideBack();
    const visit2 = await run(() => window.__floorZero.state.run.visit);
    visit2 === 2 ? pass('the lift rebuilds Floor 0 for visit 2') : fail('visit 2', String(visit2));

    const trackSamples = await run(() => window.__floorZero.state.run.lastTrack?.s.length ?? 0);
    trackSamples > 20
      ? pass('visit 1 was recorded', `${trackSamples / 7} samples packed`)
      : fail('recording saved', `${trackSamples} numbers`);

    // --- Chapter 2: the replay puzzle -------------------------------------
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(5.7, -6.0, 0);
      g.interactions.activate(g.interactions.get('shutter_switch'), g);
    });
    const switchRecorded = await run(() => window.__floorZero.state.flag('switch_recorded'));
    switchRecorded ? pass('the shutter switch can be tripped') : fail('shutter switch', 'flag missing');

    await run(async () => {
      const g = window.__floorZero;
      for (let i = 0; i < 30; i++) {
        g.player.teleport(5.7 - i * 0.15, -6 + i * 0.2, 0);
        await new Promise((r) => setTimeout(r, 16));
      }
    });

    await rideBack();
    const eventInTrack = await run(() => {
      const track = window.__floorZero.state.run.lastTrack;
      return !!track && track.e.some((entry) => entry[2] === 'shutter_switch');
    });
    eventInTrack
      ? pass('the switch survives into the saved recording')
      : fail('recorded switch event', 'not present in packed track');

    // The mimic replays through exactly this call.
    const shutterOpened = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(11.4, 0, -Math.PI / 2);
      const ok = g.interactions.replay('shutter_switch');
      return ok && g.world.current.doors.get('shutter').open;
    });
    shutterOpened
      ? pass('a replayed interaction really opens the shutter')
      : fail('replayed shutter', 'door did not open');

    await page.waitForTimeout(1500);
    const solvedShutter = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(13.0, 0, -Math.PI / 2);
      return new Promise((resolve) => setTimeout(() => resolve(g.state.isSolved('puzzle_shutter')), 300));
    });
    solvedShutter ? pass('passing the shutter solves the puzzle') : fail('shutter puzzle', 'not solved');

    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(25.4, -0.6, 0);
      g.interactions.activate(g.interactions.get('reset_lever'), g);
    });
    const chapterAfter2 = await run(() => window.__floorZero.state.run.chapter);
    chapterAfter2 === 3 ? pass('chapter 2 completes') : fail('chapter 2', `chapter=${chapterAfter2}`);
    await shot('corridor');

    // --- A door that says "open" opens ---------------------------------------
    // The chapter just advanced and the floor has NOT been rebuilt, so the level
    // still carries the lock state it was built with while canOpen() already
    // says yes. This is the exact state a player is in after pulling the reset
    // lever and walking to apartment 03, and the door used to read "open" and
    // then do absolutely nothing.
    const stale = await run(() => {
      const g = window.__floorZero;
      const item = g.interactions.get('door_apt03');
      const door = g.world.current.doors.get('door_apt03');
      g.player.teleport(13.3, -0.2, 0);
      const prompt = item.prompt(g);
      g.interactions.activate(item, g);
      return { prompt, opened: door.open, locked: door.locked };
    });
    stale.prompt !== 'נעול' && stale.opened
      ? pass('a door promising "open" actually opens after a chapter advance')
      : fail('stale door lock', `prompt=${stale.prompt} open=${stale.opened} locked=${stale.locked}`);

    // --- Chapter 3: the clocks ---------------------------------------------
    await rideBack();
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(13.3, -0.2, 0);
      g.interactions.activate(g.interactions.get('door_apt03'), g);
    });
    await page.waitForTimeout(700);
    const apt03Open = await run(() => window.__floorZero.world.current.doors.get('door_apt03').open);
    apt03Open ? pass('apartment 03 unlocks in chapter 3') : fail('apt 03', 'still locked');

    // The clock already showing its answer locks itself, so only three are left.
    const clocksLeft = await run(() => window.__floorZero.world.current.puzzles.clocks.remaining);
    clocksLeft === 3
      ? pass('one clock starts already answered')
      : fail('clock lock-in', `${clocksLeft} remaining`);

    const clocksSolved = await run(async () => {
      const g = window.__floorZero;
      const solution = [5, 1, 3, 0];
      const ids = ['clock_1', 'clock_2', 'clock_3', 'clock_4'];
      g.player.teleport(12.6, -3.5, 0);
      for (let i = 0; i < ids.length; i++) {
        const item = g.interactions.get(ids[i]);
        for (let press = 0; press < solution[i]; press++) {
          item.activate(g);
          await new Promise((r) => setTimeout(r, 8));
        }
      }
      return g.state.isSolved('puzzle_clocks');
    });
    clocksSolved ? pass('the clock puzzle accepts its solution') : fail('clock puzzle', 'not solved');

    // A clock that has locked refuses further presses rather than cycling off
    // its own answer.
    const stayedLocked = await run(() => {
      const g = window.__floorZero;
      const item = g.interactions.get('clock_1');
      item.activate(g);
      item.activate(g);
      return g.state.isSolved('puzzle_clocks');
    });
    stayedLocked ? pass('a locked clock cannot be turned back off') : fail('clock lock', 'unsolved again');

    const serviceOpen = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(17.9, -9.2, Math.PI);
      g.interactions.activate(g.interactions.get('door_service'), g);
      return g.world.current.doors.get('door_service').open;
    });
    serviceOpen ? pass('the service door releases') : fail('service door', 'still locked');

    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(18.1, -11.0, Math.PI);
      g.interactions.activate(g.interactions.get('tape_4'), g);
    });
    await page.waitForTimeout(400);
    const chapterAfter3 = await run(() => window.__floorZero.state.run.chapter);
    chapterAfter3 === 4 ? pass('chapter 3 completes') : fail('chapter 3', `chapter=${chapterAfter3}`);
    await shot('apartment');

    // --- Chapter 4: the toys -------------------------------------------------
    await rideBack();
    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(8.3, 0.2, Math.PI);
      g.interactions.activate(g.interactions.get('door_apt02'), g);
    });
    await page.waitForTimeout(600);
    const kidsOpen = await run(() => window.__floorZero.world.current.doors.get('door_apt02').open);
    kidsOpen ? pass("the children's room unlocks in chapter 4") : fail('apt 02', 'still locked');

    const toyRun = await run(async () => {
      const g = window.__floorZero;
      g.player.teleport(8.4, 10.0, 0);
      const puzzle = g.world.current.puzzles.toys;
      const waitFor = async (stage, ms) => {
        const deadline = Date.now() + ms;
        while (puzzle.stage !== stage && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 200));
        }
        return puzzle.stage === stage;
      };

      // Start the sequence and wait for the mimic to finish its half.
      g.interactions.activate(g.interactions.get('toy_0'), g);
      if (!(await waitFor('player', 40000))) return { opened: false };
      const sequence = puzzle.sequence;

      // Deliberately get it wrong: the mimic should re-offer the three tones
      // the player owes rather than starting the whole sequence over.
      const wrong = (sequence[3] + 1) % 4;
      g.interactions.activate(g.interactions.get(`toy_${wrong}`), g);
      const retried = await waitFor('retry', 4000);
      const reopened = await waitFor('player', 60000);

      for (let i = 3; i < 6; i++) {
        g.interactions.activate(g.interactions.get(`toy_${sequence[i]}`), g);
        await new Promise((r) => setTimeout(r, 120));
      }
      return { opened: true, retried, reopened, solved: g.state.isSolved('puzzle_toys') };
    });
    toyRun.retried
      ? pass('a wrong toy re-offers the sequence instead of restarting it')
      : fail('toy retry', 'puzzle did not enter the retry phase');
    toyRun.reopened ? pass('the answer window reopens by itself') : fail('toy retry', 'window never reopened');
    toyRun.solved ? pass('the toy sequence puzzle can be completed') : fail('toy puzzle', 'not solved');

    const gotKey = await run(() => {
      const g = window.__floorZero;
      g.player.teleport(5.6, 10.8, Math.PI);
      g.interactions.activate(g.interactions.get('control_key'), g);
      return g.state.hasItem('control_key');
    });
    gotKey ? pass('the control key is awarded') : fail('control key', 'not collected');
    await shot('kids');

    const chapterAfter4 = await run(() => window.__floorZero.state.run.chapter);
    chapterAfter4 === 5 ? pass('chapter 4 completes') : fail('chapter 4', `chapter=${chapterAfter4}`);

    // --- Chapter 5: chase and control room ------------------------------------
    await rideBack();
    const hiddenDoor = await run(() => {
      const g = window.__floorZero;
      return g.world.prop('control_cover').visible === false;
    });
    hiddenDoor ? pass('the hidden door is revealed in chapter 5') : fail('hidden door', 'still covered');

    await run(async () => {
      const g = window.__floorZero;
      for (let i = 0; i < 30; i++) {
        g.player.teleport(10 + i * 0.4, 0, -Math.PI / 2);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    const chaseStarted = await run(() => window.__floorZero.mimic.isChasing);
    chaseStarted ? pass('the chase triggers on approach') : fail('chase', 'never started');

    await run(() => {
      const g = window.__floorZero;
      g.player.teleport(22.5, -0.2, 0);
      g.interactions.activate(g.interactions.get('door_control'), g);
    });
    await page.waitForTimeout(700);
    await run(() => window.__floorZero.player.teleport(22.5, -3.0, 0));
    await page.waitForTimeout(600);
    const chaseEnded = await run(() => !window.__floorZero.mimic.isChasing);
    chaseEnded ? pass('reaching the control room ends the chase') : fail('chase end', 'still chasing');
    await shot('control');

    const feedCount = await run(() => window.__floorZero.world.feeds.length);
    feedCount >= 9 ? pass('the monitor wall is live', `${feedCount} feeds`) : fail('feeds', String(feedCount));

    // --- The figure that stands at the end and malfunctions --------------------
    const sentinel = await run(async () => {
      const g = window.__floorZero;
      // player.teleport only moves the player; the camera is written during the
      // next frame's update, so anything reading camera position or facing has
      // to let a frame run first.
      const frames = (n) =>
        new Promise((resolve) => {
          let left = n;
          const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
          requestAnimationFrame(tick);
        });

      g.player.teleport(6, 0, -Math.PI / 2);
      await frames(3);
      g.mimic.standWatching(g, 30);
      const standing = g.mimic.isStandingWatch;
      const spot = { x: g.mimic.controller.position.x, z: g.mimic.controller.position.z };

      // Force a burst and sample it: the body must actually be displaced, and
      // nothing may be said while it happens.
      const saidBefore = g.state.objective;
      g.mimic.controller.glitch(1.2, 1);
      let displaced = 0;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 25));
        const p = g.mimic.controller.position;
        displaced = Math.max(displaced, Math.hypot(p.x - spot.x, p.z - spot.z));
      }
      // And it must come back to exactly where it was standing. The sentinel
      // schedules bursts of its own, so sample on the very frame the burst
      // ends rather than after a delay that could land inside the next one.
      const deadline = Date.now() + 20000;
      let settled = null;
      while (settled === null && Date.now() < deadline) {
        await frames(1);
        if (!g.mimic.controller.isGlitching) {
          settled = { x: g.mimic.controller.position.x, z: g.mimic.controller.position.z };
        }
      }
      const returned = !!settled && Math.hypot(settled.x - spot.x, settled.z - spot.z) < 0.001;
      g.mimic.clearVisit();
      return { standing, displaced, returned, quiet: g.state.objective === saidBefore };
    });
    sentinel.standing ? pass('the figure takes up its post at the end') : fail('sentinel', 'never stood');
    sentinel.displaced > 0.01
      ? pass('it glitches in place', `${sentinel.displaced.toFixed(3)}m of snap`)
      : fail('glitch', 'the body never moved');
    sentinel.returned ? pass('and settles back exactly where it stood') : fail('glitch', 'drifted off its post');
    sentinel.quiet ? pass('the glitch says nothing') : fail('glitch', 'it spoke');

    // Facing conventions, shared by the beats below. forward is
    // (-sin yaw, -cos yaw), so yaw -PI/2 points the player up the corridor
    // (+x) and anything spawned "behind" them lands at low x; staring back at
    // it means turning to yaw +PI/2.
    const AWAY = -Math.PI / 2;
    const TOWARD = Math.PI / 2;

    // --- It arrives at your shoulder without a sound ---------------------------
    const behind = await run(
      async ([away]) => {
        const g = window.__floorZero;
        const frames = (n) =>
          new Promise((resolve) => {
            let left = n;
            const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
            requestAnimationFrame(tick);
          });
        g.mimic.clearVisit();
        g.player.teleport(12, 0, away);
        await frames(3);

        const played = [];
        const realPlay = g.audio.play.bind(g.audio);
        g.audio.play = (id, opts) => {
          played.push(id);
          return realPlay(id, opts);
        };
        const snapped = g.mimic.snapBehind(g);
        const quiet = played.length === 0;
        g.audio.play = realPlay;

        const p = g.mimic.controller.position;
        const dx = p.x - g.camera.position.x;
        const dz = p.z - g.camera.position.z;
        const distance = Math.hypot(dx, dz);
        const forward = g.player.forward;
        // Negative dot means it is behind the shoulders, not merely off to one side.
        const dot = (forward.x * dx + forward.z * dz) / distance;

        // A moment later the presence should have ramped up on its own.
        await new Promise((r) => setTimeout(r, 1600));
        const presence = g.mimic.closeBehind;

        g.mimic.clearVisit();
        return { snapped, quiet, distance, dot, presence };
      },
      [AWAY],
    );
    behind.snapped ? pass('it can snap to the player') : fail('snap behind', 'refused');
    behind.dot < -0.6 && behind.distance < 2.6
      ? pass('it lands behind the shoulders', `${behind.distance.toFixed(2)}m, dot ${behind.dot.toFixed(2)}`)
      : fail('snap position', `${behind.distance.toFixed(2)}m, dot ${behind.dot.toFixed(2)}`);
    behind.quiet ? pass('the snap itself is silent') : fail('snap behind', 'it made a sound');
    behind.presence > 0.5
      ? pass('standing there builds a presence', behind.presence.toFixed(2))
      : fail('presence', `only reached ${behind.presence.toFixed(2)}`);

    // --- It is audible ---------------------------------------------------------
    // The tapes promise footsteps repeating the player's route; for most of the
    // project the figure walked in silence.
    const steps = await run(async () => {
      const g = window.__floorZero;
      g.mimic.clearVisit();
      const heard = [];
      const realPlay = g.audio.play.bind(g.audio);
      g.audio.play = (id, opts) => {
        if (String(id).startsWith('step_')) heard.push(id);
        return realPlay(id, opts);
      };
      // Walk it down the corridor under its own power.
      g.mimic.controller.show();
      g.mimic.controller.teleport(g.mimic.controller.position.clone().set(6, 0, 0));
      g.mimic.controller.walkPath(
        [4, 8, 12].map((x) => g.mimic.controller.position.clone().set(x, 0, 0)),
        1.6,
      );
      await new Promise((r) => setTimeout(r, 4000));
      g.audio.play = realPlay;
      g.mimic.clearVisit();
      return heard.length;
    });
    steps > 0 ? pass('the mimic has footsteps', `${steps} heard`) : fail('mimic footsteps', 'walked in silence');

    // --- The creatures ---------------------------------------------------------
    // Both close in from behind while unwatched. What being looked at does is
    // what separates them: the crawler breaks off under a working light, the
    // tall one just stops dead and waits.
    const creatures = await run(
      async ([away, toward]) => {
        const g = window.__floorZero;
        const frames = (n) =>
          new Promise((resolve) => {
            let left = n;
            const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
            requestAnimationFrame(tick);
          });
        const out = {};
        for (const kind of ['crawler', 'tall']) {
          g.creatures.clear();
          g.creatures.reset(0);
          g.world.lighting.setOn('*', true);
          // Face up the corridor and let the camera catch up before spawning:
          // send() places the creature relative to where the camera is *now*.
          g.player.teleport(14, 0, away);
          await frames(3);
          const sent = g.creatures.send(g, kind);
          const creature = g.creatures.active;
          const start = creature ? creature.distanceTo(g.camera.position) : 0;

          // Unwatched: it should be closing.
          await new Promise((r) => setTimeout(r, 2500));
          const closed = creature ? start - creature.distanceTo(g.camera.position) : 0;

          // Now turn and look straight at it, under a lit corridor.
          g.player.teleport(14, 0, toward);
          await frames(3);
          await new Promise((r) => setTimeout(r, 500));
          const held = creature ? creature.distanceTo(g.camera.position) : 0;
          await new Promise((r) => setTimeout(r, 1500));
          const after = creature ? creature.distanceTo(g.camera.position) : 0;

          out[kind] = {
            sent,
            start,
            closed,
            delta: after - held,
            state: creature ? creature.state : 'none',
          };
          g.creatures.clear();
        }
        g.creatures.reset(999);
        return out;
      },
      [AWAY, TOWARD],
    );
    for (const kind of ['crawler', 'tall']) {
      const row = creatures[kind];
      row.sent ? pass(`the ${kind} can be sent`) : fail(`${kind}`, 'refused to spawn');
      row.closed > 0.3
        ? pass(`the ${kind} closes in while unwatched`, `${row.closed.toFixed(1)}m`)
        : fail(`${kind} approach`, `gained only ${row.closed.toFixed(2)}m`);
    }
    creatures.crawler.delta > 0.4
      ? pass('the crawler breaks off when seen in the light', `retreated ${creatures.crawler.delta.toFixed(1)}m`)
      : fail('crawler light rule', `moved ${creatures.crawler.delta.toFixed(2)}m, state=${creatures.crawler.state}`);
    Math.abs(creatures.tall.delta) < 0.35
      ? pass('the tall one stops dead while watched')
      : fail('tall one freeze', `moved ${creatures.tall.delta.toFixed(2)}m, state=${creatures.tall.state}`);

    // The crawler turns up when the tubes are out, so the torch has to be able
    // to do the job on its own — otherwise its one weakness is unusable exactly
    // when the player meets it.
    const torch = await run(
      async ([away, toward]) => {
        const g = window.__floorZero;
        const frames = (n) =>
          new Promise((resolve) => {
            let left = n;
            const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
            requestAnimationFrame(tick);
          });
        g.creatures.clear();
        g.creatures.reset(0);
        g.world.lighting.setOn('*', false);
        g.player.setFlashlight(false, g);
        g.player.teleport(14, 0, away);
        await frames(3);
        g.creatures.send(g, 'crawler');
        const creature = g.creatures.active;

        // Dark corridor, no torch, staring at it: it should hold, not flee.
        g.player.teleport(14, 0, toward);
        await frames(3);
        const a = creature.distanceTo(g.camera.position);
        await new Promise((r) => setTimeout(r, 1200));
        const dark = creature.distanceTo(g.camera.position) - a;

        // Same again with the torch on it.
        g.player.setFlashlight(true, g);
        await frames(3);
        const b = creature.distanceTo(g.camera.position);
        await new Promise((r) => setTimeout(r, 1500));
        const lit = creature.distanceTo(g.camera.position) - b;
        const state = creature.state;

        g.player.setFlashlight(false, g);
        g.creatures.clear();
        g.creatures.reset(999);
        g.world.lighting.setOn('*', true);
        return { dark, lit, state };
      },
      [AWAY, TOWARD],
    );
    Math.abs(torch.dark) < 0.35
      ? pass('in the dark the crawler only freezes when stared at')
      : fail('crawler dark rule', `moved ${torch.dark.toFixed(2)}m without a torch`);
    torch.lit > 0.4
      ? pass('the torch alone drives the crawler off', `retreated ${torch.lit.toFixed(1)}m`)
      : fail('torch rule', `moved ${torch.lit.toFixed(2)}m, state=${torch.state}`);

    // --- Every anomaly, forced ------------------------------------------------
    // The director normally picks a handful per visit, so a full playthrough
    // proves almost nothing about the catalogue. Fire all of them by hand.
    const anomalyRun = await run(async () => {
      const g = window.__floorZero;
      g.player.teleport(12.0, 0, -Math.PI / 2);
      const ids = g.anomalies.catalogue.map((def) => def.id);
      const broken = [];
      for (const id of ids) {
        try {
          g.anomalies.force(id, g);
        } catch (error) {
          broken.push(`${id}: ${error}`);
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      // Let the routines the anomalies queued actually run for a while.
      await new Promise((r) => setTimeout(r, 4000));
      return { count: ids.length, broken };
    });
    anomalyRun.count >= 30
      ? pass('the anomaly catalogue is stocked', `${anomalyRun.count} definitions`)
      : fail('anomaly catalogue', `${anomalyRun.count} definitions`);
    anomalyRun.broken.length === 0
      ? pass('every anomaly runs without throwing')
      : fail('anomalies', anomalyRun.broken.slice(0, 3).join(' | '));

    // --- Ending --------------------------------------------------------------
    const endingId = { 1: 'ending_lift', 2: 'ending_stop', 3: 'ending_erase' }[ENDING];
    await run((id) => {
      const g = window.__floorZero;
      g.interactions.activate(g.interactions.get(id), g);
    }, endingId);
    await page.waitForFunction(() => window.__floorZero.state.phase === 'menu', null, { timeout: 180000 });
    const unlocked = await run(() => window.__floorZero.state.meta.endingsUnlocked);
    unlocked.includes(ENDING)
      ? pass(`ending ${ENDING} plays and unlocks`)
      : fail('ending', JSON.stringify(unlocked));
    await shot('ending');

    // --- Save round trip ------------------------------------------------------
    const savedMeta = await run(() => JSON.parse(localStorage.getItem('floor-zero.save.v1')).meta);
    savedMeta.endingsUnlocked.includes(ENDING)
      ? pass('progress is written to localStorage')
      : fail('save', JSON.stringify(savedMeta));

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__floorZero?.state.phase === 'menu', null, { timeout: 90000 });
    const survived = await run(() => window.__floorZero.state.meta.endingsUnlocked.length > 0);
    survived ? pass('progress survives a reload') : fail('reload', 'meta lost');

    const chapterSelect = await page.$$eval('.menu__content .btn', (nodes) =>
      nodes.some((node) => node.textContent.includes('בחירת פרק') && !node.disabled),
    );
    chapterSelect ? pass('chapter select unlocks after finishing') : fail('chapter select', 'still locked');
  } finally {
    const realErrors = errors.filter(
      (text) => !/favicon|AudioContext|autoplay|WebGL: INVALID|Deprecat/i.test(text),
    );
    if (realErrors.length === 0) pass('no console errors');
    else fail('console errors', realErrors.slice(0, 5).join(' | '));

    await browser.close();
    stopServer();
  }

  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`);
  // Explicit: a stray handle from the browser or the server must not turn a
  // finished run into a hang with its output still sitting in the buffer.
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
