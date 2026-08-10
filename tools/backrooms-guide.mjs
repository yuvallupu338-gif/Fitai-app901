#!/usr/bin/env node
/*
 * backrooms-guide.mjs — can a player actually finish?
 *
 * Reaching Level 99 means finding one rare doorway on each of a hundred levels
 * that have no edges and no map. That is the difference between a game with an
 * ending and a game with a hundred rooms, and none of the other suites test it
 * at all: they check that an exit exists, not that a person could ever find it.
 *
 * So this checks the guide as a navigation instrument. The needle has to point
 * at the thing (verified against the real bearing, not against itself), the
 * distance has to shrink as you walk towards it, the hint button has to find
 * exits the passive search has not, and switching hints off has to actually
 * switch them off. Then it walks the last level's exit and confirms there is a
 * real ending on the other side rather than a silent return to the menu.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/backrooms-guide.mjs
 *   … --file      test the single-file build instead of the served app
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');
const { waitFrames } = await import('./backrooms-smoke.mjs');

const USE_FILE = process.argv.includes('--file');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const failures = [];
const notes = [];
const check = (c, m) => { if (!c) failures.push(m); else notes.push('ok: ' + m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const p = resolve(ROOT, `.${url}`);
      if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

const guide = (page) => page.evaluate(() => {
  const el = document.querySelector('#guide');
  const arrow = document.querySelector('#guide-arrow');
  const g = window.backrooms;
  const t = g.guideTarget;
  const p = g.player;
  let bearing = null, trueBearing = null;
  if (t) {
    const ex = t.exit.x - p.pos.x, ez = t.exit.z - p.pos.z;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    trueBearing = Math.atan2(ex * cy + ez * -sy, ex * -sy + ez * -cy);
    const m = /rotate\(([-0-9.]+)rad\)/.exec(arrow.style.transform || '');
    bearing = m ? Number(m[1]) : null;
  }
  return {
    visible: !el.hidden,
    text: document.querySelector('#guide-dist').textContent,
    hasTarget: !!t,
    dist: t ? t.dist : null,
    liveDist: t ? Math.hypot(t.exit.x - p.pos.x, t.exit.z - p.pos.z) : null,
    bearing,
    trueBearing,
    close: el.classList.contains('close'),
  };
});

async function main() {
  const { server, port } = await serve();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--allow-file-access-from-files'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = USE_FILE
    ? `file://${resolve(ROOT, 'dist/backrooms.html')}`
    : `http://127.0.0.1:${port}/backrooms/`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.backrooms, null, { timeout: 30000 });
  await page.evaluate(() => window.backrooms.enterLevel(0));
  await page.waitForFunction(
    () => window.backrooms.state === 'play' && !window.backrooms.loading,
    null, { timeout: 200000 });
  await waitFrames(page, 8);

  /* ---- the needle exists and points at the thing ---- */
  await page.evaluate(() => window.backrooms.useHint());
  await waitFrames(page, 3);
  let g = await guide(page);
  check(g.hasTarget, 'a way down is found from the starting room');
  check(g.visible, 'the guide is on screen once a way down is known');
  check(/^\d+m$/.test(g.text), `the guide shows a distance (${g.text})`);
  if (g.hasTarget) {
    check(near(g.bearing, g.trueBearing, 0.02),
      `the needle points at the exit (${g.bearing?.toFixed(2)} vs true ${g.trueBearing?.toFixed(2)})`);
  }

  /* ---- and it is a bearing, not a fixed arrow: turning must move it ---- */
  if (g.hasTarget) {
    const before = g.bearing;
    await page.evaluate(() => { window.backrooms.player.yaw += 1.0; });
    await waitFrames(page, 3);
    const after = await guide(page);
    check(Math.abs(after.bearing - before) > 0.5,
      `turning the head swings the needle (${before?.toFixed(2)} → ${after.bearing?.toFixed(2)})`);
    check(near(after.bearing, after.trueBearing, 0.02),
      'the needle still points at the exit after turning');
  }

  /* ---- walking towards it closes the distance, and it says so ---- */
  if (g.hasTarget) {
    const start = await guide(page);
    await page.evaluate(() => {
      const b = window.backrooms;
      const t = b.guideTarget.exit;
      const p = b.player;
      /* Half-way there, in a straight line — the readout has to follow. */
      p.pos.x += (t.x - p.pos.x) * 0.5;
      p.pos.z += (t.z - p.pos.z) * 0.5;
      p.pos.y = b.world.groundAt(p.pos.x, p.pos.z);
    });
    await waitFrames(page, 4);
    const halfway = await guide(page);
    check(halfway.liveDist < start.liveDist * 0.75,
      `the distance falls as you approach (${start.liveDist?.toFixed(0)}m → ${halfway.liveDist?.toFixed(0)}m)`);
    check(Number(halfway.text.replace('m', '')) < Number(start.text.replace('m', '')),
      'the readout follows the real distance');
  }

  /* ---- standing on it flags close, and E takes you down ---- */
  const lvlBefore = await page.evaluate(() => window.backrooms.level.id);
  await page.evaluate(() => {
    const b = window.backrooms;
    const t = b.guideTarget.exit;
    b.player.pos.x = t.x;
    b.player.pos.z = t.z;
    b.player.pos.y = b.world.groundAt(t.x, t.z);
  });
  await waitFrames(page, 4);
  const onIt = await guide(page);
  check(onIt.close, 'the guide marks itself when you are on top of the exit');
  await page.evaluate(() => window.backrooms.input.tap('KeyE'));
  await page.waitForFunction(
    (from) => window.backrooms.state === 'play' && !window.backrooms.loading
      && window.backrooms.level.id !== from,
    lvlBefore, { timeout: 200000 });
  check(await page.evaluate(() => window.backrooms.level.id) === lvlBefore + 1,
    'following the guide to the exit descends a level');

  /* ---- hints off means off ---- */
  await page.evaluate(() => {
    window.backrooms.fillSettings();
    const s = document.querySelector('#set-hints');
    s.checked = false;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFrames(page, 4);
  check(!(await guide(page)).visible, 'turning hints off hides the guide');
  await page.evaluate(() => {
    const s = document.querySelector('#set-hints');
    s.checked = true;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFrames(page, 4);
  check((await guide(page)).visible, 'turning hints back on restores it');

  /* ---- the ending is a real ending ---- */
  await page.evaluate(() => window.backrooms.enterLevel(99));
  await page.waitForFunction(
    () => window.backrooms.state === 'play' && !window.backrooms.loading
      && window.backrooms.level.id === 99,
    null, { timeout: 200000 });
  await waitFrames(page, 6);
  await page.evaluate(() => window.backrooms.descend('test'));
  await waitFrames(page, 3);
  const ending = await page.evaluate(() => ({
    state: window.backrooms.state,
    shown: !document.querySelector('#screen-dead').hidden,
    title: document.querySelector('#dead-title').textContent,
    note: document.querySelector('#dead-note').textContent,
    retryHidden: document.querySelector('#btn-retry').hidden,
  }));
  check(ending.shown, 'going down from Level 99 shows an ending screen');
  check(ending.title.includes('יצאת'), `the ending says you got out (${ending.title})`);
  check(/\d/.test(ending.note), 'the ending reports what the run was');
  check(ending.retryHidden, 'the ending offers no "try again on this level"');

  for (const e of errors) failures.push(e);
  await browser.close();
  server.close();

  if (process.argv.includes('--verbose')) for (const n of notes) console.log('  ' + n);
  console.log(`${notes.length} checks passed${USE_FILE ? ' (single-file build)' : ''}`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log('the way out is findable, and there is something at the bottom.');
}

main().catch((e) => { console.error(e); process.exit(1); });
