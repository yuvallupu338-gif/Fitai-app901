#!/usr/bin/env node
/*
 * backrooms-smoke.mjs — drives the Backrooms build in a real browser.
 *
 * A renderer cannot be unit tested into correctness: the failure modes are
 * "the screen is black", "everything is inside out" and "the walls have no
 * texture", none of which a headless assertion notices. So this loads the game
 * for real, walks into a sample of the hundred levels, and checks the actual
 * pixels that came back — that the frame is not one flat colour, that it is
 * not black, and that the level's own palette is on screen.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/backrooms-smoke.mjs
 *   … --shots            also write PNGs to dist/shots/backrooms
 *   … --levels 0,4,37    test specific levels instead of the default sample
 *   … --all              test all 100 (slow: several minutes under SwiftShader)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/shots/backrooms');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

/* One level per archetype at minimum, plus the awkward ones: the dark levels,
 * the flooded levels, the outdoor levels and the two that are mostly holes. */
/*
 * A spread across the archetypes, plus — deliberately — the levels with the
 * least light in them.
 *
 * The second half of that list was added after a global dimmer shipped that
 * took Service Alleys to seven distinct colours and The Last Corridor to
 * twelve, against a bar of twenty-four, and this sample said everything was
 * fine. It was: none of those levels were in it. A sample chosen for variety
 * covers the interesting cases and misses the fragile ones, and the fragile
 * ones here are the levels with no torch and few working tubes, the ones lit
 * only by their own sky, and the ones where the torch is all there is. One of
 * each is now permanently in the default run — 92 in particular, whose torch
 * has never lit it and which nothing caught until it was tested directly.
 */
const DEFAULT_SAMPLE = [
  0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 23, 27, 37, 46, 50, 53, 73, 78, 83, 87, 90, 99,
  /* fixture-lit and nearly out */ 38, 58, 98,
  /* lit only by their own sky */ 48, 57,
  /* the torch is the whole level */ 92, 95,
];
const LEVELS = process.argv.includes('--all')
  ? Array.from({ length: 100 }, (_, i) => i)
  : (arg('--levels') || '').length
    ? arg('--levels').split(',').map(Number)
    : DEFAULT_SAMPLE;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); else notes.push('ok: ' + msg); };

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

/* Read the canvas back and describe it: mean colour, spread, and how much of
 * the frame is pure black. A working frame is never uniform and never fully
 * dark, even on the levels whose whole idea is darkness. */
/*
 * Ask the renderer to summarise its own framebuffer from inside the render
 * frame. Reading the canvas from out here is unreliable — without
 * preserveDrawingBuffer the contents are undefined after compositing — and an
 * unreliable pixel check is worse than none, because it fails on frames that
 * are fine.
 */
export async function frameStats(page) {
  await page.evaluate(() => window.backrooms.renderer.requestCapture());
  await page.waitForFunction(() => !!window.backrooms.renderer.lastCapture,
    null, { timeout: 60000 });
  const st = await page.evaluate(() => window.backrooms.renderer.lastCapture);
  st.lost = await page.evaluate(() => {
    const gl = window.backrooms.renderer.gl;
    return !!(gl && gl.isContextLost && gl.isContextLost());
  });
  return st;
}

/* Wait for real rendered frames rather than wall-clock time. Under software
 * rendering at phone resolution the game runs at a few frames a second, and
 * every "wait 200ms then assert" in a test becomes a coin toss. */
export async function waitFrames(page, n = 4) {
  const from = await page.evaluate(() => window.backrooms.renderer.frames);
  await page.waitForFunction(
    (f) => window.backrooms.renderer.frames >= f,
    from + n, { timeout: 60000 });
}

async function enter(page, id) {
  await page.evaluate((lvl) => window.backrooms.enterLevel(lvl), id);
  await page.waitForFunction(
    () => window.backrooms && window.backrooms.state === 'play' && !window.backrooms.loading,
    null, { timeout: 90000 });
  /* Let a few frames run so streaming and the fade are done. */
  await page.waitForTimeout(900);
}

async function main() {
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/backrooms/`;

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1120, height: 700 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.backrooms, null, { timeout: 20000 });

  check(await page.isVisible('#screen-menu'), 'the title screen renders');
  const cards = await page.$$('#level-grid .level-card');
  check(cards.length === 100, `the level list holds 100 levels (found ${cards.length})`);

  const hasGL = await page.evaluate(
    () => !!(window.backrooms && window.backrooms.renderer && window.backrooms.renderer.gl));
  check(hasGL, 'a WebGL2 context was created');
  if (!hasGL) { await finish(browser, server); return; }

  const table = [];
  for (const id of LEVELS) {
    const t0 = Date.now();
    try {
      await enter(page, id);
    } catch (e) {
      failures.push(`level ${id}: never reached play state (${e.message})`);
      continue;
    }
    const info = await page.evaluate(() => {
      const g = window.backrooms;
      return {
        name: g.level.name,
        arch: g.level.arch,
        chunks: g.renderer.stats.chunks,
        tris: g.renderer.stats.tris,
        lights: g.renderer.stats.lights,
        loaded: g.world.chunks.size,
        px: g.player.pos.x, py: g.player.pos.y, pz: g.player.pos.z,
        ground: g.world.groundAt(g.player.pos.x, g.player.pos.z),
      };
    });
    const st = await frameStats(page);

    /*
     * How much detail to demand depends on what the level is. A few levels are
     * meant to be almost entirely black — a void with a torch in it — and
     * holding them to the same bar as the Lobby would either fail forever or
     * force them to be lit, which would ruin them. So the bar drops for them,
     * and in exchange they get a check the bright levels do not: the torch has
     * to demonstrably light the place, because it is the only thing that makes
     * them playable at all.
     */
    const lvl = await page.evaluate(() => {
      const l = window.backrooms.level;
      const a = typeof l.ambient === 'string'
        ? [1, 3, 5].map((i) => parseInt(l.ambient.slice(i, i + 2), 16) / 255)
        : l.ambient;
      return {
        unlit: l.gen.lightSpacing === 0,
        torch: !!l.flashlight,
        ambient: a[0] * 0.21 + a[1] * 0.72 + a[2] * 0.07,
      };
    });
    const veryDark = lvl.unlit && lvl.ambient < 0.09;

    check(!st.lost, `level ${id}: the context survived`);
    check(st.colours > (veryDark ? 8 : 24),
      `level ${id} (${info.name}): frame has real detail (${st.colours} distinct colours`
      + `${veryDark ? ', dark level' : ''})`);
    check(st.dark < 0.985, `level ${id}: the frame is not entirely black`);

    if (lvl.torch) {
      /*
       * Point at the floor, the way anyone holding a torch does — but in more
       * than one direction.
       *
       * This used to sample the single direction the spawn happened to face,
       * and on Blacksite that direction is a sightline down an unlit run with
       * no surface inside torch range, so the torch had nothing to land on and
       * the gain came back at +2.5. The level was reported as having a torch
       * that does not work. Sweeping it afterwards showed gains of 8 to 41 in
       * twenty-three of twenty-four directions: the torch was always fine and
       * the check was describing one bad sightline as a broken level.
       *
       * The claim being made is about the level, so the measurement has to be
       * about the level: turn around and see whether the torch lights the
       * place anywhere. A torch that genuinely does nothing scores near zero
       * in every direction and still fails — on Blacksite the best of four is
       * 35 against a bar of 12, so this is not a threshold squeaking past.
       */
      const yaw0 = await page.evaluate(() => window.backrooms.player.yaw);
      const lit = async (yaw, on) => {
        await page.evaluate(([y, v]) => {
          const p = window.backrooms.player;
          p.yaw = y; p.pitch = -0.45; p.flashlightOn = v;
        }, [yaw, on]);
        await page.waitForTimeout(260);
        return frameStats(page);
      };
      let gain = -Infinity;
      for (let q = 0; q < 4; q++) {
        const yaw = yaw0 + (q * Math.PI) / 2;
        const off = await lit(yaw, false);
        const on = await lit(yaw, true);
        gain = Math.max(gain, (on.mean[0] + on.mean[1] + on.mean[2])
                            - (off.mean[0] + off.mean[1] + off.mean[2]));
      }
      check(gain > 12,
        `level ${id}: the torch actually lights the level `
        + `(+${gain.toFixed(1)} over three channels, best of four directions)`);
      await page.evaluate((y) => {
        window.backrooms.player.pitch = 0;
        window.backrooms.player.yaw = y;
      }, yaw0);
    }
    check(info.chunks > 0, `level ${id}: chunks were drawn (${info.chunks})`);
    check(info.tris > 500, `level ${id}: geometry was built (${Math.round(info.tris)} tris)`);
    check(Math.abs(info.py - info.ground) < 1.2,
      `level ${id}: the player is standing on the floor `
      + `(y=${info.py.toFixed(2)} ground=${info.ground.toFixed(2)})`);

    /* Walk for a moment and confirm the world both moves and stays solid. */
    const before = await page.evaluate(() => ({ ...window.backrooms.player.pos }));
    await page.evaluate(() => {
      const g = window.backrooms;
      g.input.keys.add('KeyW');
    });
    await page.waitForTimeout(1400);
    await page.evaluate(() => window.backrooms.input.keys.delete('KeyW'));
    const after = await page.evaluate(() => ({
      pos: { ...window.backrooms.player.pos },
      ground: window.backrooms.world.groundAt(
        window.backrooms.player.pos.x, window.backrooms.player.pos.z),
      health: window.backrooms.player.health,
    }));
    const moved = Math.hypot(after.pos.x - before.x, after.pos.z - before.z);
    check(after.pos.y > -60,
      `level ${id}: walking did not drop the player out of the world (y=${after.pos.y.toFixed(1)})`);
    notes.push(`level ${id}: walked ${moved.toFixed(2)}m in 1.4s`);

    if (SHOTS) {
      await page.screenshot({ path: join(SHOT_DIR, `level-${String(id).padStart(2, '0')}.png`) });
    }
    table.push({
      id,
      name: info.name,
      arch: info.arch,
      chunks: info.chunks,
      ktris: Math.round(info.tris / 1000),
      lights: info.lights,
      colours: st.colours,
      mean: st.mean.map((v) => Math.round(v)).join(','),
      ms: Date.now() - t0,
    });
  }

  console.table(table);
  for (const e of errors) failures.push(e);
  await finish(browser, server);
}

async function finish(browser, server) {
  await browser.close();
  server.close();
  if (process.argv.includes('--verbose')) for (const n of notes) console.log('  ' + n);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`\nall good — ${notes.length} checks passed across ${LEVELS.length} levels.`);
}

/* Only run when invoked directly — backrooms-mobile.mjs imports the pixel and
 * frame helpers from here. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
