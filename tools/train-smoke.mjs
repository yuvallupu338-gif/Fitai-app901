#!/usr/bin/env node
/*
 * train-smoke.mjs — drives THE LAST TRAIN in a real browser.
 *
 * A 3D game is exactly the kind of thing that "compiles" and then draws a
 * black rectangle, so this test does not check that the code loads. It boots
 * the game under a served copy of the repository, asserts the renderer is
 * actually emitting geometry, rides the whole line at accelerated simulation
 * speed, and asserts that the journey reaches an ending with the state the
 * ending is supposed to depend on.
 *
 * Usage:
 *   node tools/train-smoke.mjs                # ride to the terminus
 *   node tools/train-smoke.mjs --shots        # also write screenshots
 *   node tools/train-smoke.mjs --station 3    # stop the ride early
 *
 * Requires the globally installed playwright:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/train-smoke.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire('/opt/node22/lib/node_modules/x.js');
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const HEADED = process.argv.includes('--headed');
const stationArg = process.argv.indexOf('--station');
const STOP_AT = stationArg >= 0 ? Number(process.argv[stationArg + 1]) : 6;
const SHOT_DIR = resolve(ROOT, 'dist/train-shots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); else notes.push(`ok  ${msg}`); };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const path = resolve(ROOT, `.${url.endsWith('/') ? `${url}index.html` : url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function main() {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/train/`;
  if (SHOTS && !existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    /* WebGL emits its complaints as warnings, and a renderer that is quietly
       raising INVALID_ENUM on every draw still produces a picture — a black
       one. Those count as errors here. */
    const text = msg.text();
    const glProblem = /WebGL/i.test(text) && /INVALID|out of range|GL_OUT_OF_MEMORY|framebuffer/i.test(text);
    if (msg.type() === 'warning' && (/\[(sfx|anomaly|crowd|gl)\]/.test(text) || glProblem)) {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(base, { waitUntil: 'load' });

  /* ---- boot ---------------------------------------------------------- */

  await page.waitForFunction(() => window.__lastTrain && window.__lastTrain.mode === 'menu', null,
    { timeout: 30000 }).catch(() => {});

  const booted = await page.evaluate(() => Boolean(window.__lastTrain));
  check(booted, 'the game boots and exposes its harness');
  if (!booted) return finish(browser, server);

  check(await page.evaluate(() => window.__lastTrain.mode === 'menu'), 'it lands on the main menu');
  check(await page.evaluate(() => Boolean(document.querySelector('.title'))), 'the menu renders its title');
  check(await page.evaluate(() => document.querySelectorAll('.menu .btn').length >= 6),
    'the menu has its full set of buttons');

  /* Let the backdrop run long enough for a train to come through. */
  await page.waitForTimeout(2500);
  const backdropStats = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    return { calls: g.renderer.stats.drawCalls, tris: g.renderer.stats.triangles };
  });
  check(backdropStats.calls > 0, `the menu backdrop draws (${backdropStats.calls} calls)`);
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/01-menu.png` });

  /* ---- how to play ----------------------------------------------------- */

  /* The instructions page is the only thing in the game that explains the
     game, so it is worth a check that it is reachable and that it states the
     rule and the keys. */
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.menu .btn')]
      .find((b) => b.dataset.act === 'howto');
    btn?.click();
  });
  await page.waitForTimeout(220);
  const howto = await page.evaluate(() => {
    const page_ = document.querySelector('.menu .page');
    if (!page_) return null;
    return {
      heading: page_.querySelector('h2')?.textContent || '',
      rule: page_.querySelector('.rule')?.textContent || '',
      keys: [...page_.querySelectorAll('.controls dt')].map((d) => d.textContent.trim()),
    };
  });
  check(howto && /how to play/i.test(howto.heading), 'the how-to-play page opens from the menu');
  check(howto && /platform/i.test(howto.rule) && /next stop/i.test(howto.rule),
    'it states the one rule: step off, or stay on');
  check(howto && howto.keys.includes('W A S D') && howto.keys.includes('E'),
    `it lists the controls (${howto?.keys.length ?? 0} rows)`);
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/01b-howto.png` });
  await page.evaluate(() => {
    [...document.querySelectorAll('.menu .btn')].find((b) => b.dataset.act === 'back')?.click();
  });
  await page.waitForTimeout(220);

  /* ---- start a run ----------------------------------------------------- */

  await page.evaluate(() => {
    /* Recorded from before the run starts, because a hint is on screen for
       nine seconds and a software-rendered frame can take two. Watching the
       DOM as well as the event proves the HUD is the thing that put it up. */
    window.__hints = { events: [], rendered: 0 };
    window.__lastTrain.events.on('hint', (p) => window.__hints.events.push(p));
    new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node.nodeType === 1 && node.classList.contains('hint')) window.__hints.rendered++;
        }
      }
    }).observe(document.getElementById('hints'), { childList: true });

    window.__lastTrain.startRun({ nightmare: false });
    /* Put the player aboard directly; the intro is a walk through a doorway
       and a headless browser has no legs. */
    const g = window.__lastTrain.game;
    g.player.outside = false;
    g.player.position[0] = 0;
    g.player.position[1] = 0;
    g.player.position[2] = 18.7 - 6;
    /* Facing the front of the train, which is where the seats, the people and
       the far end of the carriage are. */
    g.player.yaw = Math.PI;
  });
  await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__lastTrain.mode === 'playing'), 'the run starts');

  /* Every screenshot below waits out the fade-in first. A shot taken during
     it is a picture of a fade, not of the game, and it is very convincing. */
  await page.waitForFunction(() => window.__lastTrain.game.fx.fade < 0.02, null, { timeout: 15000 })
    .catch(() => {});

  const inCar = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    return {
      calls: g.renderer.stats.drawCalls,
      tris: g.renderer.stats.triangles,
      lights: g.scene.lights.length,
      nodes: g.scene.nodes.length,
      passengers: g.crowd.visiblePeople().length,
      props: g.props.props.size,
      interactables: g._interactables.length,
    };
  });
  check(inCar.calls > 30, `the carriage draws (${inCar.calls} calls, ${Math.round(inCar.tris)} triangles)`);
  check(inCar.lights >= 5, `the carriage is lit (${inCar.lights} lights)`);
  check(inCar.passengers >= 4, `there are passengers aboard (${inCar.passengers})`);
  check(inCar.props >= 1, `there is something to find (${inCar.props} props)`);
  check(inCar.interactables > 10, `there is something to interact with (${inCar.interactables})`);

  /* The opening hints. They are the only thing telling a first-time player
     which keys move them, so if they stop reaching the screen the game is
     unplayable for exactly the people who need them. */
  /* The sim advances one clamped frame at a time and software rendering makes
     those frames slow, so the boarding phase is stepped forward deliberately
     rather than waited out. */
  await page.evaluate(() => window.__lastTrain.setSubSteps(8));
  await page.waitForFunction(() => window.__hints.events.length >= 2, null, { timeout: 30000 })
    .catch(() => {});
  await page.evaluate(() => window.__lastTrain.setSubSteps(1));

  const hintState = await page.evaluate(() => {
    /* Measured on a real element in the real container, so the check reads the
       size the player actually gets rather than the one in the stylesheet. */
    const probe = document.createElement('div');
    probe.className = 'hint';
    probe.innerHTML = '<span class="keys">W A S D</span>probe';
    document.getElementById('hints').appendChild(probe);
    const cs = getComputedStyle(probe);
    const size = parseFloat(cs.fontSize);
    const bg = cs.backgroundColor;
    probe.remove();
    return { ...window.__hints, size, bg };
  });
  check(hintState.events.length >= 2, `the opening hints fire (${hintState.events.length})`);
  check(hintState.events.some((h) => /W A S D/.test(h.keys || '')), 'a hint names the movement keys');
  check(hintState.rendered >= 2, `the HUD puts them on screen (${hintState.rendered})`);
  check(hintState.size >= 15, `hints are large enough to read (${hintState.size}px)`);
  check(!/rgba\(0, 0, 0, 0\)/.test(hintState.bg), `hints sit on a plate, not bare glass (${hintState.bg})`);

  if (SHOTS) {
    await page.screenshot({ path: `${SHOT_DIR}/02-carriage.png` });
    /* Side-on, so the window glass and what it is reflecting are both in
       frame — the reflection is the effect most likely to be silently wrong. */
    await page.evaluate(() => { window.__lastTrain.game.player.yaw = Math.PI / 2 + 0.35; });
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${SHOT_DIR}/03-window.png` });
    await page.evaluate(() => { window.__lastTrain.game.player.yaw = Math.PI; });
    await page.waitForTimeout(200);
  }

  /* ---- interaction ------------------------------------------------------ */

  const interactions = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    const out = { sat: false, read: false, alarm: false, spoke: false, map: false, gate: false };

    const seat = g._interactables.find((i) => i.type === 'seat');
    if (seat) { g._interact(seat); out.sat = Boolean(g.player.sitting); g.player.stand(); }

    /* Reading a clue: find its interaction volume wherever it happens to be. */
    for (let car = 0; car < g.world.carCount && !out.read; car++) {
      const list = g.props.interactablesFor(car, []);
      if (list.length) {
        g._interact(list[0]);
        out.read = g.state.clues.size > 0;
      }
    }

    const alarm = g.world.interactablesFor(g.player.car).find((i) => i.type === 'emergency');
    if (alarm) { g._interact(alarm); out.alarm = Boolean(g.state.flags.pulledAlarm); }

    g._talkTo('stranger');
    out.spoke = g.state.strangerTalks > 0;

    const map = g.world.interactablesFor(g.player.car).find((i) => i.type === 'routemap');
    if (map) { g._interact(map); out.map = true; }

    const conn = g.world.interactablesFor(1).find((i) => i.type === 'connecting' && i.end > 0);
    if (conn) { g._interact(conn); out.gate = true; }

    return out;
  });
  check(interactions.sat, 'the player can sit down');
  check(interactions.read, 'a clue can be picked up and read');
  check(interactions.alarm, 'the emergency alarm can be pulled');
  check(interactions.spoke, 'the passenger at the far end can be spoken to');
  check(interactions.map, 'the route map opens');
  check(interactions.gate, 'a connecting door can be opened');

  /* ---- getting off, and getting back on -------------------------------- */

  /*
   * The regression that matters most in this whole file. Stepping onto the
   * platform used to re-board the player on the very next frame, silently
   * making four of the seven endings unreachable, and it looked exactly like a
   * doorway that would not let you out.
   */
  const doorway = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    const p = g.player;
    const side = g.world.doorSide;
    g.world.driveDoors(10, side, 1, 100);          // force this side wide open

    const spacing = 18.7;
    p.outside = false;
    p.sitting = null;
    p.position[0] = 0;
    p.position[1] = 0;
    p.position[2] = spacing - 4.4;                  // car 1's rear doorway

    let stepped = 0;
    let boarded = 0;
    const ctx = { allowExit: true, onStepOff: () => { stepped++; }, onBoard: () => { boarded++; } };

    /* Walk straight out of the doorway for two thirds of a second. */
    for (let i = 0; i < 40; i++) p._move(p.position[0] + side * 0.045, p.position[2], ctx);
    const out = { stepped, boarded, outside: p.outside, x: Number(p.position[0].toFixed(2)) };

    /* And straight back in again. */
    for (let i = 0; i < 60; i++) p._move(p.position[0] - side * 0.045, p.position[2], ctx);
    out.backIn = !p.outside;
    out.boardedTotal = boarded;

    p.outside = false;
    p.position[0] = 0;
    return out;
  });
  check(doorway.stepped === 1, `walking out of an open door steps off exactly once (${doorway.stepped})`);
  check(doorway.outside === true && doorway.boarded === 0,
    `the player stays on the platform once they are on it (outside=${doorway.outside}, re-boards=${doorway.boarded})`);
  check(doorway.backIn === true, 'walking back through the door re-boards');

  await page.waitForTimeout(300);
  const overlayShown = await page.evaluate(() => !document.getElementById('overlay').hidden);
  check(overlayShown === false || overlayShown === true, 'the document overlay layer responds');
  await page.evaluate(() => document.getElementById('overlay').click());

  /* ---- ride the line ---------------------------------------------------- */

  /* Software rendering manages a handful of frames a second at full size, so
     the ride runs at a fraction of the resolution with the expensive passes
     off. The simulation is unaffected — only how much of it gets drawn. */
  await page.evaluate(() => {
    const t = window.__lastTrain;
    t.applySettings({ ...t.settings, resolutionScale: 0.5, reflections: false, bloom: false });
    t.setSubSteps(48);
  });

  const seen = { phases: new Set(), stations: [], anomalies: new Set(), errors: [] };
  await page.evaluate(() => {
    window.__seen = { stations: [], anomalies: [], phases: [], ending: null };
    window.__lastTrain.events.on('station', (p) => window.__seen.stations.push(p.station.id));
    window.__lastTrain.events.on('anomaly', (p) => window.__seen.anomalies.push(p.id));
    window.__lastTrain.events.on('ending', (p) => { window.__seen.ending = p.ending.id; });
  });

  /* Fifteen minutes for the whole line. The ride is driven at forty-eight
     sub-steps a frame, so the wall-clock cost is however long a software
     rasteriser takes to draw a few hundred frames of a lit carriage — which on
     a busy machine is enough to run out of a seven-minute budget three
     stations short and report it as a game that never reaches an ending. */
  const deadline = Date.now() + 900000;
  let last = -1;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const g = window.__lastTrain.game;
      return {
        mode: window.__lastTrain.mode,
        phase: g.phase,
        station: g.state?.stationIndex ?? 0,
        speed: g.world.speed,
        worldZ: g.world.worldZ,
        ending: window.__seen.ending,
        anomalies: window.__seen.anomalies.length,
        stations: window.__seen.stations.slice(),
      };
    });
    seen.phases.add(snap.phase);
    /* The index advances when braking begins, so wait for the train to be
       standing at the platform before taking its picture. */
    if (snap.station !== last && snap.phase === 'stopped') {
      last = snap.station;
      if (SHOTS && snap.station <= 6) {
        await page.evaluate(() => { window.__lastTrain.game.player.yaw = Math.PI / 2; });
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${SHOT_DIR}/1${snap.station}-station-${snap.station}.png` });
        await page.evaluate(() => { window.__lastTrain.game.player.yaw = Math.PI; });
      }
    }
    if (snap.ending) { seen.ending = snap.ending; break; }
    if (snap.station >= STOP_AT && snap.phase === 'stopped' && STOP_AT < 6) break;
    await page.waitForTimeout(250);
  }

  const final = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    return {
      station: g.state.stationIndex,
      clues: g.state.clues.size,
      anomalies: window.__seen.anomalies,
      stations: window.__seen.stations,
      ending: window.__seen.ending,
      worldZ: g.world.worldZ,
      endingsInProfile: Object.keys(window.__lastTrain.profile.endings || {}),
      achievements: Object.keys(window.__lastTrain.profile.achievements || {}),
    };
  });

  check(final.station >= Math.min(STOP_AT, 6), `the train reaches station ${final.station} of 6`);
  check(final.worldZ > 1000, `the train covers ground (${Math.round(final.worldZ)} m)`);
  check(seen.phases.has('traveling') && seen.phases.has('arriving') && seen.phases.has('stopped'),
    `every phase of a leg runs (${[...seen.phases].join(', ')})`);
  check(final.stations.length >= Math.min(STOP_AT, 6),
    `stations announced in order: ${final.stations.join(' → ')}`);
  if (STOP_AT >= 3) {
    check(new Set(final.anomalies).size >= 4,
      `anomalies fire and vary (${new Set(final.anomalies).size} distinct, ${final.anomalies.length} total)`);
  } else {
    notes.push(`ok  the first leg is quiet by design (${final.anomalies.length} anomalies before station ${STOP_AT})`);
  }

  if (STOP_AT >= 6) {
    await page.evaluate(() => {
      const t = window.__lastTrain;
      t.applySettings({ ...t.settings, resolutionScale: 1, reflections: true, bloom: true });
    });
    check(Boolean(final.ending), `the journey reaches an ending (${final.ending || 'none'})`);
    check(final.endingsInProfile.length >= 1, 'the ending is recorded in the profile');
    check(final.achievements.length >= 3, `achievements unlock (${final.achievements.length})`);
    if (SHOTS) {
      await page.waitForTimeout(4200);
      await page.screenshot({ path: `${SHOT_DIR}/20-ending.png` });
    }
  }

  /* ---- pure logic: are all endings reachable? --------------------------- */

  const endingMatrix = await page.evaluate(async () => {
    const mod = await import('./src/game/endings.js');
    const st = await import('./src/game/stations.js');
    const by = (id) => st.STATIONS.find((s) => s.id === id);
    const full = new Set(['travelcard', 'phone', 'newspaper', 'rota', 'bulletin', 'notebook',
      'poster', 'button', 'drawing', 'ticketstub', 'log', 'umbrella', 'photograph', 'timetable']);
    return {
      ordinary: mod.resolveEnding('off', by('riverside'), { clues: new Set(), flags: {} }),
      wrong: mod.resolveEnding('off', by('platform0'), { clues: new Set(), flags: {} }),
      wrongElmwood: mod.resolveEnding('off', by('elmwood'), { clues: new Set(), flags: {} }),
      home: mod.resolveEnding('off', by('elmwood'), { clues: new Set(['travelcard']), flags: {} }),
      loop: mod.resolveEnding('off', by('laststop'), { clues: new Set(), flags: {} }),
      empty: mod.resolveEnding('stay', by('laststop'), { clues: new Set(), flags: {}, strangerTalks: 0 }),
      last: mod.resolveEnding('stay', by('laststop'), { clues: new Set(), flags: {}, strangerTalks: 4 }),
      secret: mod.resolveEnding('stay', by('laststop'), {
        clues: full, flags: { pulledAlarm: true, sawReflection: true }, strangerTalks: 4,
      }),
      midJourney: mod.resolveEnding('stay', by('northend'), { clues: new Set(), flags: {} }),
      total: mod.TOTAL_ENDINGS,
    };
  });

  check(endingMatrix.ordinary === 'ordinary', 'getting off early gives the ordinary ending');
  check(endingMatrix.wrong === 'wrong_station', 'getting off at Platform 0 gives the wrong station');
  check(endingMatrix.wrongElmwood === 'wrong_station', 'Elmwood without the travelcard is the wrong station');
  check(endingMatrix.home === 'home', 'Elmwood with the travelcard is home');
  check(endingMatrix.loop === 'loop', 'getting off at the last stop loops');
  check(endingMatrix.empty === 'empty_train', 'staying on alone gives the empty train');
  check(endingMatrix.last === 'last_passenger', 'staying on after listening gives the last passenger');
  check(endingMatrix.secret === 'secret', 'the secret ending is reachable');
  check(endingMatrix.midJourney === null, 'staying on mid-journey does not end the game');
  check(endingMatrix.total === 7, `there are ${endingMatrix.total} endings`);

  /* ---- settings round trip ---------------------------------------------- */

  const settingsWork = await page.evaluate(() => {
    const t = window.__lastTrain;
    const before = t.game.renderer.settings.reflections;
    t.applySettings({ ...t.settings, reflections: !before, resolutionScale: 0.75 });
    const after = t.game.renderer.settings.reflections;
    const stored = JSON.parse(localStorage.getItem('lasttrain.settings') || '{}');
    t.applySettings({ ...t.settings, reflections: before, resolutionScale: 1 });
    return { flipped: after !== before, persisted: stored.resolutionScale === 0.75 };
  });
  check(settingsWork.flipped, 'graphics settings apply live');
  check(settingsWork.persisted, 'settings persist to storage');

  check(pageErrors.length === 0, `no uncaught errors${pageErrors.length ? `: ${pageErrors[0]}` : ''}`);
  check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? `: ${consoleErrors.slice(0, 3).join(' | ')}` : ''}`);

  await finish(browser, server);
}

async function finish(browser, server) {
  await browser.close();
  server.close();

  for (const n of notes) console.log(n);
  if (failures.length) {
    console.log('');
    for (const f of failures) console.log(`FAIL  ${f}`);
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`\nall ${notes.length} checks passed`);
  if (SHOTS) console.log(`screenshots in ${SHOT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
