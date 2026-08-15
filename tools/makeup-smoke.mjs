#!/usr/bin/env node
/*
 * makeup-smoke.mjs — drives the makeup counter in a real browser.
 *
 * A renderer cannot be unit tested into correctness. Its failure modes are "the
 * screen is black", "the face is inside out" and "the lipstick went on and
 * nothing changed", and no headless assertion notices any of them. So this
 * loads the game for real, plays a customer from the door to the till, and
 * checks the pixels that came back.
 *
 * The check that matters most is the one in the middle: it photographs the
 * face, applies a red lipstick, photographs it again, and asserts that the
 * frame got redder. That single assertion covers the ray-cast from pointer to
 * face space, the brush, the dirty-rectangle upload, the texture binding and
 * the shader's compositing — the entire path the game is about — and it fails
 * if any one link in it breaks.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/makeup-smoke.mjs
 *   … --shots       also write PNGs to dist/shots/makeup
 *   … --headed      run with a visible browser
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
const SHOT_DIR = resolve(ROOT, 'dist/shots/makeup');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
const check = (cond, msg) => {
  if (cond) notes.push('ok: ' + msg);
  else failures.push(msg);
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
 * Ask the renderer to summarise the frame it is drawing, from inside the render
 * call. Reading the canvas from out here is unreliable — without
 * preserveDrawingBuffer the contents are undefined after compositing — and an
 * unreliable pixel check is worse than none, because it fails on frames that
 * are fine.
 */
async function frameStats(page) {
  await page.evaluate(() => window.bella.renderer.requestCapture());
  await page.waitForFunction(() => !!window.bella.renderer.lastCapture, null, { timeout: 60000 });
  const st = await page.evaluate(() => window.bella.renderer.lastCapture);
  st.lost = await page.evaluate(() => {
    const gl = window.bella.renderer.gl;
    return !!(gl && gl.isContextLost && gl.isContextLost());
  });
  return st;
}

/* Wait for rendered frames rather than wall-clock time: under SwiftShader the
 * game runs at a few frames a second and every "wait 200ms then assert" becomes
 * a coin toss. */
async function waitFrames(page, n = 4) {
  const from = await page.evaluate(() => window.bella.renderer.frames);
  await page.waitForFunction((f) => window.bella.renderer.frames >= f,
    from + n, { timeout: 60000 });
}

const redness = (rgb) => rgb[0] - (rgb[1] + rgb[2]) / 2;

async function main() {
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({
    headless: !process.argv.includes('--headed'),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`) });
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/makeup/`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.bella, null, { timeout: 30000 });
    check(await page.evaluate(() => window.bella.state) === 'title', 'the game boots to the title');
    check(await page.evaluate(() => !document.getElementById('fatal').hidden) === false,
      'no fatal error on boot');

    /* The title screen already draws the shop behind it, so a black frame here
     * means the renderer never worked at all. */
    await waitFrames(page, 6);
    let st = await frameStats(page);
    check(!st.lost, 'the WebGL context survives boot');
    check(st.meanL > 6, `the shop is lit (mean luminance ${st.meanL.toFixed(1)})`);
    check(st.stddev > 8, `and has detail in it (stddev ${st.stddev.toFixed(1)})`);
    check(st.blackFraction < 0.55, `and is not mostly black (${(st.blackFraction * 100).toFixed(0)}%)`);
    await shot('01-title');

    /* Start a shift and get a customer into the chair. */
    await page.click('#btn-new');
    await page.waitForFunction(() => window.bella.state === 'day', null, { timeout: 20000 });
    await page.click('#btn-open');
    await page.waitForFunction(() => window.bella.state === 'work', null, { timeout: 120000 });
    await waitFrames(page, 8);

    const customer = await page.evaluate(() => {
      const c = window.bella.customer;
      return { name: c.name, look: c.lookId, arrival: c.arrival.length, prefs: c.prefs };
    });
    check(!!customer.name, `a customer arrived (${customer.name}, ${customer.look})`);

    st = await frameStats(page);
    check(st.centre[0] > 24 && st.centre[1] > 16,
      `there is a face in the middle of the frame (${st.centre.map((n) => n.toFixed(0)).join(',')})`);
    check(st.stddev > 10, 'the customer scene has real contrast');
    await shot('02-customer');

    /*
     * The core loop, through the real pointer path: pick a lipstick in the
     * tray, find the mouth on screen, and drag across it.
     */
    await page.evaluate(() => window.bella.setView('lips'));
    await waitFrames(page, 5);
    const beforeLips = await frameStats(page);

    const mouth = await page.evaluate(() => {
      window.bella.select('lip-matte', 'lm-red');
      /* Project the middle of the mouth into screen space the same way the
       * renderer did, so the drag lands where the lips actually are. */
      const r = window.bella.renderer;
      const c = r.customer;
      const m = c.headMatrix;
      const p = c.focus.lips;
      const wx = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      const wy = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      const wz = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      const vp = r.viewProj;
      const cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
      const cx = (vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12]) / cw;
      const cy = (vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13]) / cw;
      const rect = document.getElementById('view').getBoundingClientRect();
      return {
        x: rect.left + (cx * 0.5 + 0.5) * rect.width,
        y: rect.top + (0.5 - cy * 0.5) * rect.height,
        w: rect.width,
      };
    });
    check(mouth.x > 0 && mouth.x < 1180, 'the mouth projects onto the screen');

    /* Drag across the mouth, in steps, like a person would. */
    await page.mouse.move(mouth.x - mouth.w * 0.05, mouth.y);
    await page.mouse.down();
    for (let i = 0; i <= 10; i++) {
      await page.mouse.move(
        mouth.x - mouth.w * 0.05 + (i / 10) * mouth.w * 0.10,
        mouth.y + Math.sin(i) * 2, { steps: 2 });
    }
    await page.mouse.up();
    await waitFrames(page, 5);

    const painted = await page.evaluate(() => window.bella.stats().lip.coverage);
    check(painted > 0.02,
      `dragging over the mouth put lipstick on the lips (coverage ${painted.toFixed(3)})`);

    /* Measured in the tight window, which with the camera on the mouth is
     * almost entirely lips. The whole-frame average moves by less than a point
     * when a mouth changes colour and is not an assertion worth making. */
    const afterLips = await frameStats(page);
    check(redness(afterLips.core) > redness(beforeLips.core) + 3,
      `and the frame actually got redder (${redness(beforeLips.core).toFixed(1)} -> ${redness(afterLips.core).toFixed(1)})`);
    await shot('03-lips');

    /* The eyes: closing the lids for an eye product is what makes the lid
     * paintable at all, so check it happens and that shadow lands. */
    await page.evaluate(() => {
      window.bella.setView('eyes');
      window.bella.select('shadow-shimmer', 'ss-bronze');
    });
    await waitFrames(page, 20);
    const lidClosed = await page.evaluate(() => window.bella.renderer.customer.anim.lid);
    check(lidClosed > 0.6, `she closes her eyes for an eye product (${lidClosed.toFixed(2)})`);

    await page.evaluate(() => window.bella.autoApply('shadow-shimmer', 'ss-bronze', 0.9));
    await waitFrames(page, 4);
    const lidCoverage = await page.evaluate(() => window.bella.stats().lid.coverage);
    check(lidCoverage > 0.3, `eyeshadow covers the lids (${lidCoverage.toFixed(2)})`);
    await shot('04-eyes');

    /* Fill in the rest of the look so the till has something to ring up. */
    await page.evaluate(() => {
      window.bella.setView('face');
      window.bella.autoApply('found-dewy', 'FD-N30', 0.85);
      window.bella.autoApply('blush-powder', 'bp-rose', 0.7);
      window.bella.autoApply('mascara', 'ms-black', 0.9);
      window.bella.autoApply('brow', 'br-brown', 0.7);
    });
    await waitFrames(page, 6);
    await shot('05-done');

    const appliedCount = await page.evaluate(() => window.bella.paint.applied().length);
    check(appliedCount >= 5, `the ledger recorded everything used (${appliedCount})`);

    /* Wipe: the remover has to actually remove. */
    const beforeWipe = await page.evaluate(() => window.bella.stats().cheek.coverage);
    await page.evaluate(() => window.bella.autoApply('wipe', 'wipe', 1));
    await waitFrames(page, 3);
    const afterWipe = await page.evaluate(() => window.bella.stats().cheek.coverage);
    check(afterWipe < beforeWipe * 0.5,
      `the remover takes makeup off (${beforeWipe.toFixed(2)} -> ${afterWipe.toFixed(2)})`);
    await page.evaluate(() => window.bella.autoApply('blush-powder', 'bp-rose', 0.7));

    /* To the till. */
    await page.click('#btn-done');
    await page.waitForFunction(() => window.bella.state === 'register', null, { timeout: 20000 });
    const receiptLines = await page.evaluate(() => document.querySelectorAll('#rc-lines li').length);
    check(receiptLines >= 4, `the receipt lists what went on her face (${receiptLines} lines)`);
    const markOptions = await page.evaluate(() => document.querySelectorAll('#mark-items button').length);
    check(markOptions >= 4, `the preference card offers what was used (${markOptions} options)`);
    await shot('06-register');

    /* Mark a preference and charge. */
    await page.evaluate(() => {
      document.querySelectorAll('#mark-items button')[0].click();
      document.querySelectorAll('#mark-finish button')[0].click();
    });
    await page.click('#btn-charge');
    await page.waitForFunction(() => window.bella.state === 'result', null, { timeout: 20000 });

    const result = await page.evaluate(() => ({
      score: +document.getElementById('res-score').textContent,
      take: document.getElementById('res-take').textContent,
      parts: document.querySelectorAll('#res-parts li').length,
      money: window.bella.shift.money,
      index: window.bella.shift.index,
    }));
    check(result.score > 0, `the customer was scored (${result.score})`);
    check(result.parts > 0, 'the result explains itself line by line');
    check(result.money > 0, `money went into the till (${result.take})`);
    check(result.index === 1, 'the queue moved on');
    await shot('07-result');

    /* And on to the next customer, which is where a leak or a stale mesh would
     * show up. */
    await page.click('#btn-next');
    await page.waitForFunction(() => window.bella.state === 'work', null, { timeout: 120000 });
    await waitFrames(page, 8);
    const second = await page.evaluate(() => window.bella.customer.name);
    check(!!second, `a second customer arrived (${second})`);
    const freshLip = await page.evaluate(() => window.bella.stats().lip.coverage);
    const secondArrival = await page.evaluate(() => window.bella.customer.arrival.length);
    check(secondArrival > 0 || freshLip < 0.05,
      'the new customer starts from her own face, not the last one');
    st = await frameStats(page);
    check(!st.lost, 'the context survives a customer change');
    check(st.centre[0] > 24, 'and the second customer is on screen');
    await shot('08-second');

    check(errors.length === 0, `no console errors (${errors.slice(0, 3).join(' | ')})`);
  } catch (err) {
    failures.push('threw: ' + (err && err.stack ? err.stack.split('\n')[0] : err));
    if (SHOTS) await page.screenshot({ path: resolve(SHOT_DIR, 'failure.png') }).catch(() => {});
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }

  if (process.argv.includes('--verbose')) for (const n of notes) console.log(n);
  console.log(`\n${notes.length + failures.length} checks, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error('FAIL: ' + f);
    process.exit(1);
  }
  console.log('makeup smoke passed');
}

main();
