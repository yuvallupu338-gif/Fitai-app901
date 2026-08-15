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
  const child = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
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
  if (server) {
    for (const signal of ['SIGINT', 'SIGTERM', 'exit']) {
      process.on(signal, () => server.kill('SIGTERM'));
    }
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

    const toysSolved = await run(async () => {
      const g = window.__floorZero;
      g.player.teleport(8.4, 10.0, 0);
      // Start the sequence, wait for the mimic to finish its half, then answer.
      const puzzle = g.world.current.puzzles.toys;
      g.interactions.activate(g.interactions.get('toy_0'), g);
      const deadline = Date.now() + 40000;
      while (puzzle.stage !== 'player' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const sequence = puzzle.sequence;
      for (let i = 3; i < 6; i++) {
        g.interactions.activate(g.interactions.get(`toy_${sequence[i]}`), g);
        await new Promise((r) => setTimeout(r, 120));
      }
      return g.state.isSolved('puzzle_toys');
    });
    toysSolved ? pass('the toy sequence puzzle can be completed') : fail('toy puzzle', 'not solved');

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
    server?.kill('SIGTERM');
  }

  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
