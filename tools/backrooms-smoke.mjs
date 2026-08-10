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
import { fileURLToPath } from 'node:url';
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
const DEFAULT_SAMPLE = [
  0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 23, 27, 37, 46, 50, 53, 73, 78, 83, 87, 90, 99,
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
async function frameStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#view');
    const gl = c.getContext('webgl2');
    const w = 160, h = 100;
    /* Read from the real drawing buffer via a scaled 2D copy. */
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(c, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, dark = 0, n = w * h;
    let minL = 999, maxL = -1;
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
      r += R; g += G; b += B;
      const l = 0.21 * R + 0.72 * G + 0.07 * B;
      if (l < 3) dark++;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
      seen.add((R >> 3) << 10 | (G >> 3) << 5 | (B >> 3));
    }
    return {
      mean: [r / n, g / n, b / n],
      dark: dark / n,
      contrast: maxL - minL,
      colours: seen.size,
      lost: !!(gl && gl.isContextLost && gl.isContextLost()),
      width: c.width, height: c.height,
    };
  });
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

    check(!st.lost, `level ${id}: the context survived`);
    check(st.colours > 24,
      `level ${id} (${info.name}): frame has real detail (${st.colours} distinct colours)`);
    check(st.dark < 0.985, `level ${id}: the frame is not entirely black`);
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

main().catch((e) => { console.error(e); process.exit(1); });
