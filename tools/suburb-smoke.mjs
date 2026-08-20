#!/usr/bin/env node
/*
 * suburb-smoke.mjs — plays The Quiet Neighborhood in a real browser.
 *
 * A game like this cannot be asserted into correctness from the outside. The
 * failure modes are "the screen is black", "the house has no roof", "the flag
 * cannot be picked up" and "the night never ends", and none of those is
 * visible to a unit test. So this loads the real page, walks the real day,
 * sleeps, waits for 3:31, takes the flag, carries it home, and checks what
 * actually came back — including the pixels, because a renderer that draws
 * nothing passes every logic check ever written.
 *
 * It drives the game the way a player does: it presses E rather than calling
 * the pickup function, and clicks the keypad rather than setting `solved`.
 * The only thing it does that a player cannot is move the clock forward and
 * put the player somewhere, because a five-minute night times seven under
 * software rendering is forty minutes of test.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/suburb-smoke.mjs
 *   … --shots     also write PNGs to dist/shots/suburb
 *   … --head      run with a visible browser
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/shots/suburb');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
/* Printed as they happen rather than collected for the end. This test drives a
 * real browser through seven nights under software rendering and takes minutes;
 * a run that dies in the middle should still say how far it got. */
const check = (cond, msg) => {
  if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); }
  else { notes.push(msg); console.log('  ✓ ' + msg); }
};

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const path = resolve(ROOT, `.${url}`);
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

/*
 * Ask the renderer to summarise its own framebuffer from inside the render
 * frame. Reading the canvas from out here is unreliable — without
 * preserveDrawingBuffer the contents are undefined after compositing — and an
 * unreliable pixel check is worse than none, because it fails on frames that
 * were fine.
 */
async function frameStats(page) {
  await page.evaluate(() => window.suburb.renderer.requestCapture());
  await page.waitForFunction(() => !!window.suburb.renderer.lastCapture,
    null, { timeout: 60000 });
  return page.evaluate(() => window.suburb.renderer.lastCapture);
}

/* Wait for real rendered frames rather than wall-clock time: under software
 * rendering the game runs at a few frames a second, and every "wait 200ms then
 * assert" becomes a coin toss. */
async function frames(page, n = 4) {
  const from = await page.evaluate(() => window.suburb.renderer.frames);
  /*
   * Three minutes for four frames sounds absurd and is not: this runs under
   * SwiftShader, and on a machine that is also building the rest of the world
   * a frame can take several seconds. A tighter timeout here does not catch
   * anything — a genuinely stuck renderer never produces another frame at all
   * — it only makes the test fail on a busy machine.
   */
  await page.waitForFunction((f) => window.suburb.renderer.frames >= f,
    from + n, { timeout: 180000 });
}

async function press(page, code, n = 3) {
  await page.evaluate((c) => window.suburb.input.tap(c), code);
  await frames(page, n);
}

/*
 * Put the player somewhere. `feet` is the height to look for the ground from,
 * and it matters: ask from far enough up and the answer is the roof, because
 * a roof is ground to anything standing above it. Default is head height in a
 * room, which is what almost every call wants.
 */
async function teleport(page, x, z, yaw, feet = 1.2) {
  await page.evaluate(([px, pz, y, f]) => {
    const p = window.suburb.player;
    p.pos.x = px; p.pos.z = pz;
    p.pos.y = window.suburb.world.collision.groundAt(px, pz, f, 0.62);
    p.vel.x = p.vel.z = 0;
    p.crouch = false;
    if (y !== null) p.yaw = y;
  }, [x, z, yaw ?? null, feet]);
  await frames(page, 2);
}

/*
 * Walk up to the flag until it is actually in reach.
 *
 * A fixed offset does not work across the ten sites: one of them is at the
 * bottom of a hole with a heap of spoil beside it, and standing a metre from
 * the flag puts you on the heap looking down at it, which is out of reach and
 * correctly so. So this tries a handful of places to stand and stops at the
 * first one the game itself says works, which is what a player does.
 */
async function approachFlag(page) {
  return page.evaluate(() => {
    const g = window.suburb;
    const f = g.flag;
    const p = g.player;
    /*
     * The ring goes out to a metre and a half because one of the ten sites is
     * a branch four metres up a tree and the only way to it is the ladder,
     * whose rungs sit about 1.2 m to one side of the flag. Every offset inside
     * a metre lands on the grass under the tree, where the branch is over your
     * head and correctly out of reach, so this check reported the seventh
     * night unwinnable whenever it drew the tree — and it was the harness
     * looking in the wrong places, not the night.
     */
    const spots = [
      [0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.7, 0.7], [1.3, 0],
      [0, 1.2], [0, -1.2], [-1.3, 0], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2],
      [-1.2, -1.2], [0, 1.5], [0, -1.5],
    ];
    for (const [dx, dz] of spots) {
      const x = f.x + dx, z = f.z + dz;
      p.pos.x = x;
      p.pos.z = z;
      /* Asked from just above the flag, so a rung counts as ground: the
       * player standing on a ladder is standing on something. */
      p.pos.y = g.world.collision.groundAt(x, z, Math.max(1.2, f.y + 0.3), 0.62);
      p.vel.x = p.vel.z = p.vel.y = 0;
      p.crouch = !!f.site.crouch;
      /*
       * Standable as well as in reach. Without the first test the flag's own
       * position always wins — it is zero metres away — and the player is then
       * standing inside the fountain rim, gets pushed out by the very next
       * collision step, and is three metres away by the time the key is
       * pressed.
       */
      const room = g.world.collision.standableAt(x, z, p.pos.y, 0.34,
        p.crouch ? 1.1 : 1.75);
      if (room && f.inReach(p)) {
        p.yaw = Math.atan2(-(f.x - p.pos.x), -(f.z - p.pos.z));
        if (f.site.crouch) g.input.hold('KeyC', true);
        return { ok: true, dx, dz, ground: p.pos.y };
      }
    }
    return { ok: false, site: f.site.id, y: f.y };
  });
}

async function enterNight(page, n) {
  await page.evaluate((night) => window.suburb.enterNight(night), n);
  await page.waitForFunction(() => window.suburb.state === 'play' && !window.suburb.loading,
    null, { timeout: 120000 });
  await frames(page, 4);
}

/* Get into the night half of a night: press E on the bed, which is what a
 * player does, and confirm the clock started. */
async function sleep(page) {
  /* Stand a metre off the bed on the side the room is, whichever way this
   * house faces — half the street faces the other way, and a test that assumes
   * one of them walks through the back wall of the other. */
  const bed = await page.evaluate(() => {
    const g = window.suburb;
    const b = g.world.interact.find((i) => i.kind === 'bed');
    const h = g.layout.home;
    /* Beside the bed, towards the middle of the room in X. Not in Z: the
     * bedroom is only a few metres deep and the wall between the two rooms is
     * right there. */
    const dx = Math.sign(h.x - b.x) || 1;
    return { x: b.x, z: b.z, sx: b.x + dx * 1.4, sz: b.z };
  });
  await teleport(page, bed.sx, bed.sz);
  await page.evaluate((b) => {
    const g = window.suburb;
    g.player.yaw = Math.atan2(-(b.x - g.player.pos.x), -(b.z - g.player.pos.z));
  }, bed);
  await frames(page, 2);
  await press(page, 'KeyE', 6);
  /*
   * The first night goes to bed through three scenes — the photograph on the
   * kitchen table, twenty seconds of dream, and waking at 3:29 — which is why
   * this is a loop and not one waitForFunction: Escape ends the sequence that
   * is on screen and the next one starts behind it. Every night after the
   * first goes straight from the bed to the street, and the loop falls through
   * on its first pass. Returns whether any of it played, so the caller can
   * assert that it did on night one.
   */
  const until = Date.now() + 90000;
  let dreamt = false;
  for (;;) {
    const st = await page.evaluate(() => ({
      scene: window.suburb.scene,
      playing: !!window.suburb.cutscene && window.suburb.cutscene.playing,
    }));
    if (st.scene === 'night' && !st.playing) break;
    if (Date.now() > until) throw new Error('the night never started');
    if (st.playing) {
      dreamt = true;
      await page.keyboard.press('Escape');
    }
    await frames(page, 2);
  }
  await frames(page, 4);
  return dreamt;
}

async function main() {
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({
    headless: !process.argv.includes('--head'),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/suburb/`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.suburb, null, { timeout: 30000 });
    check(await page.evaluate(() => !!window.suburb.renderer), 'the renderer came up');

    /* ---- the afternoon ---- */
    await page.click('#btn-start');
    await page.waitForFunction(() => window.suburb.state === 'play' && !window.suburb.loading,
      null, { timeout: 120000 });
    await frames(page, 6);

    const day = await page.evaluate(() => {
      const g = window.suburb;
      return {
        scene: g.scene,
        night: g.night,
        people: g.neighbours.people.length,
        outside: !g.player.indoors,
        houses: g.layout.houses.length,
        sectors: g.renderer.stats.sectors,
        tris: g.renderer.stats.tris,
      };
    });
    check(day.scene === 'day', `the night opens in daylight (got ${day.scene})`);
    check(day.people >= 8, `${day.people} neighbours are out in the afternoon`);
    check(day.outside, 'the player starts outside their own front door');
    check(day.sectors >= 2 && day.tris > 3000,
      `${day.tris} triangles across ${day.sectors} sectors are on screen`);

    const dayPix = await frameStats(page);
    check(dayPix.colours > 200, `the daylight frame has ${dayPix.colours} distinct colours`);
    check(dayPix.dark < 0.5, `${Math.round(dayPix.dark * 100)}% of the day frame is black`);
    check(dayPix.contrast > 60, `the day frame has ${Math.round(dayPix.contrast)} contrast`);
    await shot('day');

    /*
     * The first afternoon opens on a script — Bob over the fence, the boxes
     * still in the hall — and two things about it are load-bearing. It has to
     * be on the screen with words in it, and Escape has to end it: everything
     * below this point in the file is a keyboard driving the game, and so is
     * the eleventh replay by a player who already knows what Bob says.
     */
    const opening = await page.evaluate(() => {
      const el = document.querySelector('#scene');
      return {
        playing: !!(window.suburb.cutscene && window.suburb.cutscene.playing),
        up: !!el && !el.hidden,
        text: el ? el.textContent.trim() : '',
      };
    });
    check(opening.playing && opening.up,
      'the first afternoon opens with a cutscene');
    check(opening.text.length > 8,
      `the cutscene has a line on screen (got "${opening.text.slice(0, 40)}")`);
    check(await page.evaluate(() => !window.suburb.input.enabled),
      'the game does not take the keyboard while a scene is playing');
    await page.keyboard.press('Escape');
    const skipped = await page.waitForFunction(
      () => !window.suburb.cutscene.playing, null, { timeout: 10000},
    ).then(() => true).catch(() => false);
    check(skipped, 'Escape skips it');
    await frames(page, 3);
    check(await page.evaluate(() => window.suburb.input.enabled),
      'the keyboard comes back afterwards');

    /* Talking to a neighbour is how every puzzle answer is learned. Stand
     * between them and the road — their own house is behind them, and half the
     * street faces the other way. */
    const person = await page.evaluate(() => {
      const p = window.suburb.neighbours.people[0];
      const h = window.suburb.layout.houses.find((x) => x.id === p.houseId);
      return { x: p.x, z: p.z, name: p.name, sx: p.x, sz: p.z - h.sign * 1.6 };
    });
    await teleport(page, person.sx, person.sz);
    await page.evaluate((t) => {
      const g = window.suburb;
      g.player.yaw = Math.atan2(-(t.x - g.player.pos.x), -(t.z - g.player.pos.z));
    }, person);
    await frames(page, 3);
    const prompt = await page.evaluate(() => {
      const el = document.querySelector('#hud-prompt');
      return el.hidden ? '' : el.textContent;
    });
    check(prompt.includes('לדבר'),
      `standing in front of ${person.name} offers a conversation (prompt: "${prompt}")`);
    await press(page, 'KeyE', 2);
    /* Poll rather than read once. The key is consumed on the next frame the
     * game runs, and under software rendering "the next frame" is tens to
     * hundreds of milliseconds away — a single read here is a coin toss, and a
     * flaky check is worse than no check. */
    const said = await page.waitForFunction(() => {
      const el = document.querySelector('#subtitle');
      return el.hidden ? null : el.textContent;
    }, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => '');
    check(said.includes(person.name) || said.length > 10,
      `pressing E on ${person.name} says something (got "${String(said).slice(0, 40)}")`);

    /* The map is drawn from the layout, so it cannot disagree with the world. */
    await press(page, 'KeyM', 3);
    check(await page.evaluate(() => !document.querySelector('#map').hidden),
      'M opens the map');
    await shot('map');
    await press(page, 'KeyM', 2);

    /* ---- the night ---- */
    const dreamt = await sleep(page);
    check(dreamt, 'the first night goes to bed through the dream');
    const night = await page.evaluate(() => {
      const g = window.suburb;
      return {
        scene: g.scene,
        clock: g.clock.text,
        phase: g.clock.phase,
        whistler: !!g.whistler,
        away: Math.round(Math.hypot(g.whistler.pos.x - g.player.pos.x,
          g.whistler.pos.z - g.player.pos.z)),
        sleepers: g.neighbours.people.length,
        audio: g.audio.ready,
      };
    });
    check(night.scene === 'night', 'going to bed starts the night');
    check(night.clock === '3:30:00', `the night starts at 3:30 (got ${night.clock})`);
    check(night.phase === 'grace', 'the flag has not appeared yet at 3:30');
    check(night.away > 40, `she starts ${night.away}m away`);
    if (night.audio) notes.push('ok: the audio context started');
    else notes.push('note: no audio context in this browser — sound checks skipped');

    /*
     * Two different pictures, and both have to work. The bedroom at 3:30 with
     * the light off is meant to be nearly black — asserting it has colour in it
     * would be asserting the game is lit wrong. What must not be black is the
     * street, which is where the night is actually played, so the frame check
     * that matters is taken out on the lawn under the lamps.
     */
    const bedroomPix = await frameStats(page);
    check(bedroomPix.dark < 0.99,
      `the bedroom at 3:30 is dark but not pure black `
      + `(${Math.round(bedroomPix.dark * 100)}% black)`);
    await shot('bedroom');

    const outside = await page.evaluate(() => {
      const h = window.suburb.layout.home;
      return { x: h.x, z: h.frontZ - h.sign * 9 };
    });
    await teleport(page, outside.x, outside.z);
    await page.evaluate(() => {
      const g = window.suburb;
      /* Look down the street, which is where the lamps are. */
      g.player.yaw = Math.PI / 2;
      g.player.pitch = 0;
    });
    await frames(page, 4);
    const nightPix = await frameStats(page);
    check(nightPix.dark < 0.9,
      `${Math.round(nightPix.dark * 100)}% of the street at night is pure black`);
    check(nightPix.colours > 60,
      `the street at night has ${nightPix.colours} distinct colours`);
    check(nightPix.contrast > 25,
      `the street at night has ${Math.round(nightPix.contrast)} contrast`);
    await shot('night');

    /* 3:31. The flag appears, and the HUD says where to look. */
    await page.evaluate(() => { window.suburb.clock.t = window.suburb.clock.flagAt - 0.2; });
    await frames(page, 8);
    const flag = await page.evaluate(() => {
      const g = window.suburb;
      return {
        state: g.flag.state,
        site: g.flag.site.id,
        lock: g.flag.site.lock,
        x: g.flag.x, y: g.flag.y, z: g.flag.z,
        guide: !document.querySelector('#guide').hidden,
        clock: g.clock.text,
        answer: String(g.layout.puzzles.code.answer),
      };
    });
    check(flag.state === 'placed', `the flag is out at ${flag.clock} (${flag.site})`);
    check(flag.guide, 'the arrow points at it');
    /* The first night is always the mailbox at 14, because the arithmetic is
     * stamped on the box and it is thirty metres from Adam's door. */
    check(flag.site === 'mailbox' && flag.lock === 'code',
      `night one is the mailbox with the combination (got ${flag.site}/${flag.lock})`);

    const stood = await approachFlag(page);
    check(stood.ok, `there is somewhere to stand to reach the ${flag.site}`);
    await frames(page, 3);
    await shot('flag');

    /* E on a locked flag opens the lock, not the flag. */
    await press(page, 'KeyE', 4);
    check(await page.evaluate(() => !document.querySelector('#puzzle').hidden),
      'E on the locked mailbox opens the keypad');
    await shot('puzzle');

    /* A wrong code first, because a wrong answer is supposed to cost. */
    const wrong = flag.answer.split('').map((d) => String((Number(d) + 1) % 10)).join('');
    for (const d of wrong) await page.click(`#puzzle-body .key >> text="${d}"`);
    await frames(page, 3);
    const bad = await page.evaluate(() => ({
      cls: document.querySelector('#puzzle-status').className,
      solved: window.suburb.layout.puzzles.code.solved,
    }));
    check(!bad.solved && bad.cls === 'bad', 'a wrong code is rejected');

    for (const d of flag.answer) await page.click(`#puzzle-body .key >> text="${d}"`);
    await frames(page, 6);
    check(await page.evaluate(() => window.suburb.layout.puzzles.code.solved),
      'the right code opens the box');
    await page.waitForFunction(() => document.querySelector('#puzzle').hidden,
      null, { timeout: 10000 });

    await approachFlag(page);
    await frames(page, 2);
    await press(page, 'KeyE', 5);
    const took = await page.evaluate(() => ({
      state: window.suburb.flag.state,
      carrying: window.suburb.player.carrying,
    }));
    check(took.state === 'carried' && took.carrying,
      `E on an open box picks the flag up (state ${took.state})`);

    /* Carry it home. */
    await page.evaluate(() => window.suburb.input.hold('KeyC', false));
    const goal = await page.evaluate(() => window.suburb.layout.goal);
    await teleport(page, goal.x, goal.z);
    await page.waitForFunction(() => window.suburb.state === 'over', null, { timeout: 20000 });
    /* The first night ends on one more scene — seven in the morning, Bob at
     * the fence again — and the card comes up behind it. Skip it the way a
     * player would, then wait for what it was covering. */
    check(await page.evaluate(() => window.suburb.cutscene.playing),
      'the first night ends on the morning scene');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.suburb.ui.current === 'night',
      null, { timeout: 20000 });
    /* And the black comes off with it: #scene sits over the screens, so a veil
     * left up here is a card nobody can read. */
    await frames(page, 6);
    check(await page.evaluate(() => {
      const el = document.querySelector('#scene');
      return el.hidden || !el.classList.contains('black');
    }), 'the black comes off the night-over card');
    const won = await page.evaluate(() => ({
      screen: window.suburb.ui.current,
      cleared: JSON.parse(localStorage.getItem('suburb.v1')).cleared,
    }));
    check(won.screen === 'night', 'carrying it through the front door ends the night');
    check(won.cleared.includes(1), 'the first night is recorded as cleared');
    await shot('won');

    /* ---- being caught ---- */
    await enterNight(page, 2);
    await sleep(page);
    /* Out on the front lawn, in the open. Doing this inside the bedroom would
     * put her on the other side of a wall, and the correct answer to that is
     * that she cannot see you — which is the opposite of what this is
     * testing. */
    const lawn = await page.evaluate(() => {
      const h = window.suburb.layout.home;
      return { x: h.x, z: h.frontZ - h.sign * 8 };
    });
    await teleport(page, lawn.x, lawn.z);
    await page.evaluate(() => {
      const g = window.suburb;
      /* Four metres in front of the player, looking straight at them, with the
       * torch on. Nothing else is forced: the suspicion has to fill on its
       * own, from the rules. */
      const p = g.player;
      const dir = Math.sign(g.layout.home.sign) || 1;
      g.whistler.pos.x = p.pos.x;
      g.whistler.pos.z = p.pos.z - dir * 4;
      g.whistler.yaw = dir > 0 ? Math.PI : 0;
      g.whistler.path = [];
      g.whistler.state = 'drift';
      p.torchOn = true;
    });
    await page.waitForFunction(() => window.suburb.whistler.awareness > 0.05,
      null, { timeout: 20000 });
    const seen = await page.evaluate(() => window.suburb.whistler.awareness);
    check(seen > 0.05, `standing in front of her with a torch on raises suspicion (${seen.toFixed(2)})`);
    await page.waitForFunction(() => window.suburb.state === 'over'
      || window.suburb.whistler.state === 'hunt', null, { timeout: 60000 });
    await page.evaluate(() => {
      const g = window.suburb;
      g.whistler.pos.x = g.player.pos.x + 0.5;
      g.whistler.pos.z = g.player.pos.z;
    });
    await page.waitForFunction(() => window.suburb.state === 'over', null, { timeout: 30000 });
    const caught = await page.evaluate(() => ({
      screen: window.suburb.ui.current,
      eyebrow: document.querySelector('#night-eyebrow').textContent,
      cleared: JSON.parse(localStorage.getItem('suburb.v1')).cleared,
    }));
    check(caught.screen === 'night', 'being caught ends the night');
    check(!caught.cleared.includes(2), 'a night you were caught on is not recorded as cleared');
    await shot('caught');

    /* ---- a lock you do with your hands ---- */
    /*
     * Three of the ten locks have no panel at all: read the writing on a window
     * through a mirror and lift the right porch board, drag a ladder under
     * cover of the whistle, dig up a bone for the dog. This drives the first
     * one, because it is the one that spans two ends of the neighbourhood.
     */
    await enterNight(page, 3);
    await sleep(page);
    const world = await page.evaluate(() => {
      const g = window.suburb;
      const P = g.layout.puzzles;
      const mirror = g.world.interact.find((i) => i.kind === 'mirror');
      const win = g.world.interact.find((i) => i.kind === 'window');
      const board = g.world.interact.find((i) => i.kind === 'board');
      return {
        read: P.mirror.read, solved: P.mirror.solved,
        mirror: mirror && { x: mirror.x, z: mirror.z },
        window: win && { x: win.x, z: win.z },
        board: board && { x: board.x, z: board.z },
      };
    });
    check(!!world.mirror && !!world.window && !!world.board,
      'the empty house has a window, a mirror and a loose board');
    if (world.mirror && world.board) {
      const face = async (t) => {
        await page.evaluate((p) => {
          const g = window.suburb;
          g.player.yaw = Math.atan2(-(p.x - g.player.pos.x), -(p.z - g.player.pos.z));
        }, t);
        await frames(page, 2);
      };
      /* The board does not come up until the mirror has been read. Stand
       * close: these prompts have a 1.6m radius and the diagonal of a 1.2m
       * offset is 1.7. */
      await teleport(page, world.board.x + 0.8, world.board.z + 0.8);
      await face(world.board);
      await press(page, 'KeyE', 4);
      check(!(await page.evaluate(() => window.suburb.layout.puzzles.mirror.solved)),
        'the board stays down until the writing has been read');
      await teleport(page, world.mirror.x + 0.9, world.mirror.z + 0.9);
      await face(world.mirror);
      await press(page, 'KeyE', 4);
      check(await page.evaluate(() => window.suburb.layout.puzzles.mirror.read),
        'the mirror reads the writing the right way round');
      await teleport(page, world.board.x + 0.8, world.board.z + 0.8);
      await face(world.board);
      await press(page, 'KeyE', 4);
      const lifted = await page.evaluate(() => ({
        solved: window.suburb.layout.puzzles.mirror.solved,
        prompt: document.querySelector('#hud-prompt').textContent,
      }));
      check(lifted.solved, `and then the board comes up (prompt: "${lifted.prompt}")`);
    }

    /*
     * The fuse cabinet. The README's table says four switches and one strip of
     * red tape, so the tape has to be on exactly one of them and it has to be
     * the one the panel accepts — the lock at the fountain is standing in the
     * open park with the pump off, not a one-in-four guess with a buzzer.
     */
    await page.evaluate(() => window.suburb.openPuzzle('panel'));
    await frames(page, 3);
    const tape = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#puzzle-body .choice button')];
      return {
        count: bs.length,
        taped: bs.map((b, i) => (b.querySelector('.tape') ? i : -1))
          .filter((i) => i >= 0),
        answer: window.suburb.layout.puzzles.panel.answer,
        labelled: bs.some((b) => (b.getAttribute('aria-label') || '')
          .includes('סרט אדום')),
      };
    });
    check(tape.count === 4, `the cabinet has ${tape.count} switches in it`);
    check(tape.taped.length === 1 && tape.taped[0] === tape.answer,
      `the red tape is on switch ${tape.taped[0] + 1}, which is the one that `
      + `works (answer ${tape.answer + 1})`);
    check(tape.labelled, 'and a screen reader is told about the tape');
    await page.evaluate(() => window.suburb.puzzle.close());
    await frames(page, 2);

    /* ---- the last night ---- */
    await page.evaluate(() => {
      /* Open the seventh night without playing the five in between. */
      const st = JSON.parse(localStorage.getItem('suburb.v1'));
      st.night = 7;
      st.cleared = [1, 2, 3, 4, 5, 6];
      localStorage.setItem('suburb.v1', JSON.stringify(st));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.suburb, null, { timeout: 30000 });
    await enterNight(page, 7);
    await sleep(page);
    await page.evaluate(() => { window.suburb.clock.t = window.suburb.clock.flagAt + 1; });
    await frames(page, 6);
    const last = await page.evaluate(() => {
      const g = window.suburb;
      const p = g.layout.puzzles[g.flag.site.lock];
      /*
       * The lock is not what this is testing — the ending is — so it is opened
       * from here rather than played. But opening it means what the game means
       * by it: two of the ten locks change the world as well as their own
       * `solved` flag, and setting the flag alone leaves the world in a state
       * the player can never actually be in. The ladder is the one that
       * matters, because until its rungs are standable the branch is four
       * metres up with nothing under it, and the seventh night lands on the
       * tree often enough that this failed roughly one run in ten and looked
       * like a real regression every time.
       */
      if (p) p.solved = true;
      if (p && p.id === 'ladder') {
        p.progress = 1;
        for (const b of g.world.collision.boxes) {
          if (b.tag === 'rung') b.platform = true;
        }
        g.world.collision.build();
      }
      if (p && p.id === 'hedges') {
        for (const it of g.world.interact) {
          if (it.kind === 'gate' && it.box) { it.box.solid = false; it.box.opaque = false; }
        }
        g.world.collision.build();
      }
      return { site: g.flag.site.id, x: g.flag.x, y: g.flag.y, z: g.flag.z };
    });
    const stoodLast = await approachFlag(page);
    check(stoodLast.ok, `there is somewhere to stand to reach the ${last.site}`);
    await frames(page, 3);
    await press(page, 'KeyE', 5);
    const offered = await page.evaluate(() => ({
      open: !document.querySelector('#puzzle').hidden,
      dismissable: !document.querySelector('#puzzle-close').hidden,
      site: window.suburb.flag.site.id,
      state: window.suburb.flag.state,
      inReach: window.suburb.flag.inReach(window.suburb.player),
      log: [...document.querySelectorAll('#hud-log div')].map((d) => d.textContent).join(' / '),
    }));
    check(offered.open,
      `the seventh night offers a choice rather than a pickup `
      + `(site ${offered.site}, flag ${offered.state}, in reach ${offered.inReach}, `
      + `log "${offered.log}")`);
    if (offered.open) {
      check(!offered.dismissable, 'the choice cannot be dismissed');
      await shot('ending');
      await page.click('#puzzle-body .choice button:nth-child(2)');
      await frames(page, 4);
      const ending = await page.evaluate(() => ({
        screen: window.suburb.ui.current,
        saved: JSON.parse(localStorage.getItem('suburb.v1')).ending,
        title: document.querySelector('#night-title').textContent,
      }));
      check(ending.saved === 'leave', `leaving the flag is recorded (got ${ending.saved})`);
      check(ending.screen === 'night' && ending.title.length > 2,
        'leaving the flag ends the game with an ending');

      /* And the archive grows a second half. The connections table is the one
       * place the game explains itself, and it is behind the ending because
       * read any earlier it turns every mechanic into a puzzle about the plot. */
      await page.evaluate(() => window.suburb.refresh());
      await frames(page, 2);
      const links = await page.evaluate(() => {
        const box = document.querySelector('#archive-links');
        return {
          shown: !!box && !box.hidden,
          rows: box ? box.querySelectorAll('.link-row').length : 0,
          first: box ? (box.querySelector('.link-row .t') || {}).textContent : '',
        };
      });
      check(links.shown && links.rows >= 8,
        `the archive explains itself once it is over (${links.rows} rows, `
        + `first "${links.first}")`);
    }

    /* ---- the phone ---- */
    const touch = await page.evaluate(() => {
      document.body.classList.add('touch');
      window.suburb.ui.show(null);
      const out = [];
      for (const b of document.querySelectorAll('#touch .tbtn')) {
        const r = b.getBoundingClientRect();
        out.push({ id: b.id, w: Math.round(r.width), h: Math.round(r.height),
          onScreen: r.left >= 0 && r.top >= 0
            && r.right <= window.innerWidth && r.bottom <= window.innerHeight });
      }
      return out;
    });
    check(touch.length >= 5, `${touch.length} on-screen buttons exist`);
    for (const b of touch) {
      check(b.w >= 44 && b.h >= 44, `${b.id} is ${b.w}x${b.h}, big enough for a thumb`);
      check(b.onScreen, `${b.id} is on screen`);
    }
    await shot('touch');

    check(errors.length === 0, `no console errors (got ${errors.length}: ${errors[0] || ''})`);
    check(!(await page.evaluate(() => {
      const gl = window.suburb.renderer.gl;
      return !!(gl && gl.isContextLost && gl.isContextLost());
    })), 'the WebGL context survived the whole run');
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} checks failed:\n`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`\n${notes.length} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
