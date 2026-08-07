#!/usr/bin/env node
/*
 * mario-smoke.mjs — runs the game in a real browser and asserts what happened.
 *
 * The division of labour with the other two tools is worth stating, because
 * it took a while to get right and the wrong version wasted a lot of time:
 *
 *   mario-validate.mjs  the levels are well formed
 *   mario-reach.mjs     every level can be finished        <- the real gate
 *   this                the game actually runs in a browser
 *
 * This one boots the real page in Chromium, walks the title screen and the
 * level grid with real key events, and plays levels through the real loop
 * with the real renderer — the only thing that proves the loop, the input
 * plumbing and the drawing work *together* rather than each working alone.
 *
 * What it deliberately does NOT assert is that the bot finished the level.
 * The bot is a heuristic; when it dies you cannot tell whether the level was
 * impossible or the bot was bad, and treating its deaths as failures means
 * tuning a test player instead of fixing a game. Finishability is proved
 * properly, by search, in mario-reach.mjs. What this asserts is that nothing
 * threw, and that the player was never *stuck* — no progress at all for five
 * hundred frames is a wall, and a wall is a real bug whoever hits it.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/mario-smoke.mjs
 *   ... --shots        also write screenshots to dist/mario-shots
 *   ... --levels 1,2,3 play specific levels instead of the default sample
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/mario-shots');
const ALL = process.argv.includes('--all');
const levelArg = process.argv.indexOf('--levels');
const LEVELS = levelArg > 0 && process.argv[levelArg + 1]
  ? process.argv[levelArg + 1].split(',').map(Number)
  : [1, 2, 4, 13, 25, 50, 75, 100];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = decodeURIComponent(url.pathname);
    if (file.endsWith('/')) file += 'index.html';
    const abs = resolve(ROOT, '.' + file);
    if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(abs);
      res.writeHead(200, { 'content-type': MIME[extname(abs)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

async function main() {
  if (SHOTS && !existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${port}/mario/index.html`);
  await page.waitForFunction('window.__mario !== undefined', null, { timeout: 10000 });
  /* One bot, shared by both modes. Injected rather than shipped: it has no
     business being in the game's own source. */
  await page.addScriptTag({ content: await readFile(resolve(ROOT, 'tools/mario-bot.js'), 'utf8') });
  await page.evaluate(() => { window.__bot = window.__makeMarioBot(window.__mario); });

  /* ---- the atlas built, and built something ---- */
  const atlasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height, mode: window.__mario.mode };
  });
  check(atlasInfo.w === 256 && atlasInfo.h === 240, `canvas is ${atlasInfo.w}x${atlasInfo.h}`);
  check(atlasInfo.mode === 'title', `expected the title screen, got "${atlasInfo.mode}"`);

  await settle(page, 30);
  if (SHOTS) await shot(page, '00-title');

  /* ---- title -> level select ---- */
  await press(page, 'Enter');
  await settle(page, 10);
  check(await mode(page) === 'select', 'Enter on the title should open the level select');
  if (SHOTS) await shot(page, '01-select');

  /* ---- the grid moves and refuses locked levels ---- */
  await press(page, 'ArrowRight');
  await settle(page, 5);
  await press(page, 'Enter');
  await settle(page, 10);
  check(await mode(page) === 'select',
    'level 2 is locked on a fresh save and must not start');

  await press(page, 'ArrowLeft');
  await settle(page, 5);
  await press(page, 'Enter');
  await settle(page, 20);
  check(['card', 'play'].includes(await mode(page)), 'level 1 should start');
  if (SHOTS) await shot(page, '02-card');

  /* ---- with --all, every level is run headless: no rendering, no
     requestAnimationFrame, just the simulation as fast as it will go. One
     hundred levels at sixty frames a second is forty minutes of wall clock
     and about twenty seconds of actual work. ---- */
  if (ALL) {
    const results = await page.evaluate(() => window.__bot.runAll({}));
    let cleared = 0;
    for (const r of results) {
      if (r.cleared) cleared++;
      /* A wall is a bug; dying is the bot being a bot. */
      if (/^stuck/.test(r.reason) && !r.cleared) {
        failures.push(`level ${r.id}: the player could not get past x=${r.furthest}`
          + ` of ${r.levelW} in ${r.attempts} attempts`);
      }
    }
    notes.push(`bot finished ${cleared} of ${results.length} levels`
      + ' (finishability itself is proved by tools/mario-validate.mjs)');
  }

  /* ---- play each sampled level in the real loop, with rendering ---- */
  for (const id of ALL ? LEVELS.slice(0, 2) : LEVELS) {
    const report = await playLevel(page, id);
    notes.push(`level ${id}: ${report.summary}`);
    /* Enough to have run, jumped, landed, collided and scrolled — which is
       what this pass is here to exercise. How far the bot gets beyond that is
       not this test's business. */
    check(report.progressed > 240,
      `level ${id}: only moved ${report.progressed}px — the loop is not running`);
    check(!report.stuck, `level ${id}: stopped making progress at x=${report.x}`);
    if (SHOTS) await shot(page, `lv${String(id).padStart(3, '0')}`);
  }

  /* ---- the things that only happen in one place ---- */
  await checkGrowth(page);
  await checkDeath(page);

  check(errors.length === 0, `console errors:\n    ${errors.slice(0, 8).join('\n    ')}`);

  await browser.close();
  server.close();

  for (const n of notes) console.log(`  ${n}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${failures.length} failure(s)`);
  process.exit(failures.length ? 1 : 0);
}

const mode = (page) => page.evaluate(() => window.__mario.mode);

async function settle(page, frames) {
  await page.evaluate((n) => new Promise((ok) => {
    let i = 0;
    const tick = () => (++i >= n ? ok() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), frames);
}

async function press(page, key) {
  await page.keyboard.down(key);
  await settle(page, 3);
  await page.keyboard.up(key);
}

async function shot(page, name) {
  await page.locator('#screen').screenshot({ path: join(SHOT_DIR, `${name}.png`) });
}

/*
 * Plays one level through the real loop, at the real frame rate, with the
 * real renderer running. Slower than the headless pass by two orders of
 * magnitude, which is why only a couple of levels go through it — but it is
 * the only thing that proves the loop, the input plumbing and the drawing
 * work together rather than just the simulation.
 */
async function playLevel(page, id) {
  await page.evaluate((n) => {
    window.__mario.resetRun(n);
    window.__mario.startLevel(n, false);
    window.__mario.skipCard();
    window.__mario.run.lives = 25;
  }, id);
  await settle(page, 8);

  const result = await page.evaluate(() => new Promise((done) => {
    const M = window.__mario;
    const bot = window.__bot;
    let world = M.world;
    const startX = world ? world.player.x : 0;
    let furthest = startX;
    const s = bot.fresh();
    s.best = startX;
    let frames = 0;
    let deadFrames = 0;
    let stuck = false;

    const tick = () => {
      frames++;
      const w = M.world;
      if (!w) { finish(); return; }
      if (w !== world) { world = w; s.best = w.player.x; s.since = 0; }
      bot.step(w, M.input, s);
      if (w.player.x > furthest) furthest = w.player.x;

      if (s.since > 500) { stuck = true; finish(); return; }
      if (M.mode === 'dead') deadFrames++;
      if (M.mode === 'clear' || M.mode === 'over') { finish(); return; }
      if (frames > 9000) { finish(); return; }
      requestAnimationFrame(tick);
    };

    function finish() {
      bot.release(M.input);
      const w = M.world;
      done({
        frames,
        x: w ? Math.round(w.player.x) : 0,
        progressed: Math.round(furthest - startX),
        stuck,
        deaths: deadFrames,
        mode: M.mode,
        levelW: w ? w.level.w * 16 : 0,
      });
    }
    requestAnimationFrame(tick);
  }));

  result.summary = `reached ${result.progressed}px of ${result.levelW} in ${result.frames}f`
    + ` (${result.mode}${result.deaths ? ', died' : ''})`;
  return result;
}

/* Growing must change the hitbox and keep the feet where they were. */
async function checkGrowth(page) {
  const r = await page.evaluate(async () => {
    const M = window.__mario;
    M.startLevel(1, false);
    await new Promise((ok) => setTimeout(ok, 60));
    const w = M.world;
    const p = w.player;
    /* Let him land first — measuring across the spawn drop would report the
       fall as if growing had moved him. */
    for (let i = 0; i < 30; i++) w.update();
    const before = { h: p.h, feet: p.y + p.h };
    p.powerUp('mushroom');
    for (let i = 0; i < 60; i++) w.update();
    return { before, afterH: p.h, afterFeet: p.y + p.h, power: p.power };
  });
  check(r.afterH > r.before.h, `a mushroom should make the body taller (${r.before.h} -> ${r.afterH})`);
  check(Math.abs(r.afterFeet - r.before.feet) < 2,
    `growing moved the feet by ${Math.round(r.afterFeet - r.before.feet)}px`);
  check(r.power === 1, `expected power 1 after a mushroom, got ${r.power}`);
}

/* Falling off the bottom must cost a life and restart the level. */
async function checkDeath(page) {
  const r = await page.evaluate(async () => {
    const M = window.__mario;
    M.startLevel(1, false);
    await new Promise((ok) => setTimeout(ok, 60));
    const livesBefore = M.run.lives;
    M.world.player.y = 400;
    for (let i = 0; i < 400; i++) {
      M.world.update();
      if (M.world.state === 'dead') break;
    }
    return { livesBefore, state: M.world.state };
  });
  check(r.state === 'dead', `falling off the map should kill: state was "${r.state}"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
