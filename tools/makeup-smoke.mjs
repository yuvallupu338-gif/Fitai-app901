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
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/*
 * A downloaded head for the game to serve, built here in Node.
 *
 * Nobody else's model is committed to make this test run. The geometry comes
 * from the game's own shape function on a coarse grid — a stand-in for
 * *geometry*, not for artistry — and it is then put through exactly what a real
 * download goes through: landmarks in the model's own coordinates, the pose
 * fit, the spherical unwrap, the landmark correction, the seam split, and the
 * pack into the sixteen-bit arrays a head module carries. What the page gets
 * handed is a record indistinguishable from one the marking tool wrote.
 */
async function makeFixtureHead() {
  const load = (p) => import(pathToFileURL(resolve(ROOT, 'makeup/src', p)).href);
  const head = await load('model/head.js');
  const { F } = await load('model/face.js');
  const marksMod = await load('model/landmarks.js');
  const { unwrapHead } = await load('model/import/unwrap.js');
  const { packHead } = await load('model/import/heads.js');

  const P = {
    width: 1.04, length: 1.02, depth: 0.99, jaw: 1.1, chin: 1.15, cheek: 1.2,
    brow: 1.1, nose: 1.1, noseBridge: 1.05, lip: 1.3, eyeSize: 1.05, eyeDeep: 1.05,
  };
  /* Coarse on purpose: forty by fifty-two is a head with the features still on
   * it and a twentieth of the vertices, which keeps the record small enough to
   * hand across to the page in one call. */
  const NS = 40, NT = 52;
  const pos = [], idx = [];
  const p = [0, 0, 0];
  for (let j = 0; j <= NT; j++) {
    for (let i = 0; i <= NS; i++) {
      head.evalSurface(P, i / NS, j / NT, head.NEUTRAL_EXPR, p);
      pos.push(p[0], p[1], p[2]);
    }
  }
  const at = (i, j) => j * (NS + 1) + i;
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NS; i++) {
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1));
      idx.push(at(i, j), at(i + 1, j + 1), at(i + 1, j));
    }
  }

  const { MESH_EDGE_S, BROW_PEAK_T, LIP_TOP_T, LIP_BOTTOM_T } = marksMod;
  const ST = {
    hairline: [0.5, F.hairline],
    browL: [0.5 - F.browS, BROW_PEAK_T], browR: [0.5 + F.browS, BROW_PEAK_T],
    eyeTop: [0.5 - F.eyeS, F.lidTopT],
    eyeL: [0.5 - F.eyeS, F.eyeT], eyeR: [0.5 + F.eyeS, F.eyeT],
    eyeBottom: [0.5 - F.eyeS, F.lidBotT],
    eyeOuterL: [0.5 - (F.eyeS + F.eyeHalfS), F.eyeT],
    eyeOuterR: [0.5 + (F.eyeS + F.eyeHalfS), F.eyeT],
    noseTip: [0.5, F.noseTipT],
    noseWingL: [0.5 - F.noseHalfS, F.noseBaseT], noseWingR: [0.5 + F.noseHalfS, F.noseBaseT],
    noseBase: [0.5, F.noseBaseT],
    lipTop: [0.5, LIP_TOP_T],
    mouthL: [0.5 - F.lipHalfS, F.mouthT], mouthR: [0.5 + F.lipHalfS, F.mouthT],
    lipBottom: [0.5, LIP_BOTTOM_T],
    chin: [0.5, F.chinT],
    faceL: [0.5 - MESH_EDGE_S, 0.5], faceR: [0.5 + MESH_EDGE_S, 0.5],
  };
  /* Exported the way a modelling package would: Z-up, centimetres, off the
   * origin. If the pose fit did not undo all three the head arrives lying on
   * its side and every mark is in the wrong place. */
  const place = (q) => [q[0] * 28.4 + 31, -q[2] * 28.4 - 9, q[1] * 28.4 + 4];
  const positions = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const q = place([pos[i], pos[i + 1], pos[i + 2]]);
    positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2];
  }
  const landmarks = {};
  for (const [k, st] of Object.entries(ST)) {
    landmarks[k] = place(head.evalSurface(P, st[0], st[1], head.NEUTRAL_EXPR, []));
  }

  const unwrapped = unwrapHead({ positions, indices: new Uint32Array(idx) }, landmarks);
  return packHead(unwrapped, {
    id: 'smoke-head',
    name: 'ראש מיובא',
    credit: 'Procedural test fixture (CC-BY equivalent), generated by this repository',
    provides: ['ears'],
    landmarks,
  });
}

/*
 * A face for the photographic path to serve, drawn in the page.
 *
 * Not a photograph of anybody: a picture whose landmarks are known exactly,
 * because it is drawn from them. That is the property a real photograph cannot
 * have and the reason this exists — every number the marking tool would have to
 * be clicked to produce is here as a constant, so a failure downstream is a
 * failure in the fit, the masks or the compositor and never in the marking.
 *
 * Runs inside the browser; Playwright ships the source across, so it closes
 * over nothing.
 */
function makeFixtureAvatar() {
  const W = 800, H = 1000, cx = 400;
  const P = {
    hairline: [cx, 290],
    browL: [cx - 72, 435], browR: [cx + 72, 435],
    eyeTop: [cx - 72, 462],
    eyeL: [cx - 72, 480], eyeR: [cx + 72, 480],
    eyeBottom: [cx - 72, 500],
    eyeOuterL: [cx - 103, 482], eyeOuterR: [cx + 103, 482],
    noseTip: [cx, 565],
    noseWingL: [cx - 41, 585], noseWingR: [cx + 41, 585],
    noseBase: [cx, 597],
    lipTop: [cx - 18, 640],
    mouthL: [cx - 60, 665], mouthR: [cx + 60, 665],
    lipBottom: [cx, 695],
    chin: [cx, 750],
    faceL: [cx - 170, 500], faceR: [cx + 170, 500],
  };

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3b3038');
  bg.addColorStop(1, '#211a20');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  /* Hair behind, so the silhouette has something to end against. */
  g.fillStyle = '#2a1c18';
  g.beginPath(); g.ellipse(cx, 430, 220, 262, 0, 0, 7); g.fill();
  g.fillRect(cx - 220, 430, 440, 470);

  g.fillStyle = '#c98d6d';
  g.fillRect(cx - 72, 690, 144, 210);

  const skin = g.createRadialGradient(cx - 40, 430, 40, cx, 520, 310);
  skin.addColorStop(0, '#f1ba96');
  skin.addColorStop(1, '#cd8e6e');
  g.fillStyle = skin;
  g.beginPath();
  g.moveTo(cx - 170, 500);
  g.bezierCurveTo(cx - 172, 330, cx - 120, 262, cx, 262);
  g.bezierCurveTo(cx + 120, 262, cx + 172, 330, cx + 170, 500);
  g.bezierCurveTo(cx + 166, 642, cx + 90, 752, cx, 752);
  g.bezierCurveTo(cx - 90, 752, cx - 166, 642, cx - 170, 500);
  g.closePath(); g.fill();

  /* The fringe, cut at the marked hairline. */
  g.fillStyle = '#2a1c18';
  g.beginPath();
  g.moveTo(cx - 202, 480);
  g.bezierCurveTo(cx - 206, 300, cx - 130, 198, cx, 198);
  g.bezierCurveTo(cx + 130, 198, cx + 206, 300, cx + 202, 480);
  g.lineTo(cx + 178, 470);
  g.bezierCurveTo(cx + 150, 320, cx + 90, 292, cx, 290);
  g.bezierCurveTo(cx - 90, 292, cx - 150, 320, cx - 178, 470);
  g.closePath(); g.fill();

  g.lineCap = 'round';
  g.strokeStyle = '#4a3123'; g.lineWidth = 11;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 30, 452);
    g.quadraticCurveTo(cx + s * 74, 429, cx + s * 112, 453);
    g.stroke();
  }

  for (const s of [-1, 1]) {
    const ex = cx + s * 72;
    g.fillStyle = '#f6efe9';
    g.beginPath(); g.ellipse(ex, 481, 32, 15, 0, 0, 7); g.fill();
    g.fillStyle = '#5a3f22';
    g.beginPath(); g.arc(ex, 481, 13, 0, 7); g.fill();
    g.fillStyle = '#1a120c';
    g.beginPath(); g.arc(ex, 481, 5.5, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(ex - 4, 476, 2.5, 0, 7); g.fill();
    g.strokeStyle = '#33241a'; g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(ex - 33, 482); g.quadraticCurveTo(ex, 461, ex + 33, 482);
    g.stroke();
  }

  g.strokeStyle = 'rgba(150,95,70,0.45)'; g.lineWidth = 7;
  g.beginPath();
  g.moveTo(cx - 12, 500); g.quadraticCurveTo(cx - 23, 555, cx - 5, 572);
  g.stroke();
  g.fillStyle = 'rgba(90,55,40,0.6)';
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + s * 20, 586, 9, 5, 0, 0, 7); g.fill();
  }

  g.fillStyle = '#b96a63';
  g.beginPath();
  g.moveTo(cx - 60, 665);
  g.bezierCurveTo(cx - 34, 635, cx - 12, 646, cx, 641);
  g.bezierCurveTo(cx + 12, 646, cx + 34, 635, cx + 60, 665);
  g.bezierCurveTo(cx + 30, 701, cx - 30, 701, cx - 60, 665);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(90,45,45,0.55)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 60, 665); g.quadraticCurveTo(cx, 672, cx + 60, 665);
  g.stroke();

  /* Grain, so the frame has the sort of high-frequency detail a photograph has
   * and the stddev check means something. */
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6);
  }

  const landmarks = {};
  for (const [k, p] of Object.entries(P)) landmarks[k] = [p[0] / W, p[1] / H];
  window.bella.addAvatar({
    id: 'smoke-fixture',
    name: 'דגם בדיקה',
    width: W, height: H,
    image: cv.toDataURL('image/jpeg', 0.9),
    landmarks,
  });
}

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

    /*
     * Ignore whatever photographs this working copy has in it. Both paths are
     * driven below — the modelled head first and then a drawn face registered
     * at run time — and leaving the committed list on would mean the first half
     * of this test quietly stopped running the moment somebody added a face.
     */
    await page.evaluate(() => { window.bella.setPhotos(false); window.bella.setHeads(false); });
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

    /*
     * Start a shift and get a customer into the chair.
     *
     * Through the seam rather than the button, and with the seed written down.
     * A new shift normally seeds itself from the clock, which means the queue,
     * the looks and what each customer walked in wearing are different on every
     * run — and then a check like "the score is above zero" is a check on the
     * dice. With the seed fixed, the same four customers ask for the same four
     * things every time, and a score that changes is a change in the game.
     */
    await page.evaluate(() => window.bella.startShift({ saveSeed: 20260815 }));
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

    /* ---------------------------------------------------------------- *
     * The photographic customer
     *
     * A face drawn on a canvas rather than a photograph of a person, for two
     * reasons: nobody's picture belongs in a test suite, and this one's
     * landmarks are known exactly because they are the numbers it was drawn
     * from. Everything downstream of the marks — the fit, the masks, the crop,
     * the compositor, the pick — is the same code a real photograph goes
     * through, so it is that path this exercises.
     * ---------------------------------------------------------------- */
    await page.evaluate(makeFixtureAvatar);
    /* Pinned, because the counter now draws from a pool of photographs,
     * downloaded heads and generated ones, and a test that waits for the dice
     * to come up "photograph" is a test that fails one run in three. */
    await page.evaluate(() => window.bella.forceFace('photo'));
    await page.evaluate(() => window.bella.nextCustomer());
    await page.waitForFunction(() => window.bella.state === 'work', null, { timeout: 120000 });
    await waitFrames(page, 8);

    const portrait = await page.evaluate(() => {
      const p = window.bella.portrait;
      if (!p) return null;
      return {
        id: p.prepared.avatar.id,
        tone: window.bella.customer.tone,
        brushScale: p.prepared.frame.brushScale,
        skinLum: p.skinLum,
      };
    });
    check(!!portrait, 'a photograph is served once the counter has one');
    check(portrait && portrait.tone.measured === true,
      `her shade is measured off the picture, not drawn from the table (${portrait && portrait.tone.hex})`);
    check(portrait && portrait.brushScale > 0.3 && portrait.brushScale < 1.6,
      `the brushes were rescaled to the crop (${portrait && portrait.brushScale.toFixed(2)})`);

    st = await frameStats(page);
    check(!st.lost, 'the context survives the switch to a photograph');
    check(st.centre[0] > 24 && st.centre[1] > 16,
      `the photograph is on screen (${st.centre.map((n) => n.toFixed(0)).join(',')})`);
    check(st.stddev > 8, `and has a face's worth of detail in it (stddev ${st.stddev.toFixed(1)})`);
    await shot('09-portrait');

    /* The same assertion the modelled head gets, and the one that covers the
     * whole chain: pick, crop map, masks, brush, upload, compositor. */
    await page.evaluate(() => window.bella.setView('lips'));
    await waitFrames(page, 5);
    const beforePhoto = await frameStats(page);

    const photoMouth = await page.evaluate(() => {
      window.bella.select('lip-matte', 'lm-red');
      const r = window.bella.renderer;
      const w = r.portraitWindow();
      /* F.mouthT — the line between the lips, in face space. */
      const [p, q] = r.portrait.prepared.frame.faceToCrop(0.5, 0.580);
      const rect = document.getElementById('view').getBoundingClientRect();
      return {
        x: rect.left + ((p - w.centre[0]) / w.scale[0] + 0.5) * rect.width,
        y: rect.top + ((q - w.centre[1]) / w.scale[1] + 0.5) * rect.height,
        w: rect.width,
      };
    });
    check(photoMouth.x > 0 && photoMouth.x < 1180, 'the mouth of the photograph is on screen');

    await page.mouse.move(photoMouth.x - photoMouth.w * 0.04, photoMouth.y);
    await page.mouse.down();
    for (let i = 0; i <= 10; i++) {
      await page.mouse.move(
        photoMouth.x - photoMouth.w * 0.04 + (i / 10) * photoMouth.w * 0.08,
        photoMouth.y + Math.sin(i) * 2, { steps: 2 });
    }
    await page.mouse.up();
    await waitFrames(page, 5);

    const photoLip = await page.evaluate(() => window.bella.stats().lip.coverage);
    check(photoLip > 0.02,
      `dragging over the photographed mouth put lipstick on it (coverage ${photoLip.toFixed(3)})`);
    const afterPhoto = await frameStats(page);
    check(redness(afterPhoto.core) > redness(beforePhoto.core) + 3,
      `and the photograph got redder (${redness(beforePhoto.core).toFixed(1)} -> ${redness(afterPhoto.core).toFixed(1)})`);
    await shot('10-portrait-lips');

    /* Off the face is not paintable: a stroke on the background must move the
     * picture rather than paint the wall behind her. Zoomed back out first —
     * with the view on the mouth the corner of the screen is her cheek, which
     * is a fine thing to paint. */
    await page.evaluate(() => window.bella.setView('face'));
    await waitFrames(page, 3);
    const offFace = await page.evaluate(() => {
      const r = window.bella.renderer;
      const rect = document.getElementById('view').getBoundingClientRect();
      return !r.pickPortrait(rect.left + 4, rect.top + 4);
    });
    check(offFace, 'the corner of the frame is not part of her face');

    /* ---------------------------------------------------------------- *
     * The imported customer
     *
     * A head that went through the whole import — read, fitted, unwrapped,
     * packed — and is handed to the game as a downloaded one. Nobody else's
     * model is committed to run this: the fixture is generated from the game's
     * own shape function at a coarse resolution, which makes it a stand-in for
     * geometry rather than for artistry, and every step between it and the
     * lipstick is the real one.
     * ---------------------------------------------------------------- */
    const headRecord = await makeFixtureHead();
    await page.evaluate((record) => {
      window.bella.setHeads(true);
      window.bella.addHead(record);
      window.bella.forceFace('head');
    }, headRecord);
    await page.evaluate(() => window.bella.nextCustomer());
    await page.waitForFunction(() => window.bella.state === 'work', null, { timeout: 120000 });
    await waitFrames(page, 8);

    const impo = await page.evaluate(() => {
      const a = window.bella.assets;
      if (!a || !a.imported) return null;
      const c = window.bella.renderer.customer;
      return {
        id: a.imported.id,
        triangles: a.head.triangles,
        eyeGap: Math.abs(c.eyeR.centre[0] - c.eyeL.centre[0]),
        hairTris: a.hair.triangles,
        earTris: a.ears.triangles,
        credit: document.getElementById('credit').textContent,
        name: window.bella.customer.name,
      };
    });
    check(!!impo, 'a downloaded head is served once the counter has one');
    check(impo && impo.id === 'smoke-head', `and it is the one that was added (${impo && impo.id})`);
    check(impo && impo.triangles > 1000, `with its geometry intact (${impo && impo.triangles} triangles)`);
    check(impo && impo.eyeGap > 0.30 && impo.eyeGap < 0.75,
      `its eyes a face apart (${impo && impo.eyeGap.toFixed(3)})`);
    check(impo && impo.earTris === 0,
      'and the game does not build ears into a model that already has them');
    check(impo && impo.hairTris > 0, 'but does build the hair the model does not have');
    check(impo && /CC-BY|test fixture/i.test(impo.credit),
      `the model's credit is on screen, which is the licence's condition (${impo && impo.credit.slice(0, 40)})`);
    check(impo && impo.name === 'ראש מיובא', 'and she is called what the model calls her');

    st = await frameStats(page);
    check(!st.lost, 'the context survives an imported head');
    check(st.centre[0] > 24 && st.centre[1] > 16,
      `it is on screen (${st.centre.map((n) => n.toFixed(0)).join(',')})`);
    check(st.stddev > 8, `and lit like a face (stddev ${st.stddev.toFixed(1)})`);
    await shot('11-imported');

    /* The assertion that covers the unwrap end to end: the mouth of a mesh that
     * never had a UV layout, found by the same pointer path, painted by the same
     * brush, through the masks of the same face space. */
    await page.evaluate(() => window.bella.setView('lips'));
    await waitFrames(page, 5);
    const beforeImp = await frameStats(page);
    const impMouth = await page.evaluate(() => {
      window.bella.select('lip-matte', 'lm-red');
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
    await page.mouse.move(impMouth.x - impMouth.w * 0.04, impMouth.y);
    await page.mouse.down();
    for (let i = 0; i <= 10; i++) {
      await page.mouse.move(
        impMouth.x - impMouth.w * 0.04 + (i / 10) * impMouth.w * 0.08,
        impMouth.y + Math.sin(i) * 2, { steps: 2 });
    }
    await page.mouse.up();
    await waitFrames(page, 5);

    const impLip = await page.evaluate(() => window.bella.stats().lip.coverage);
    check(impLip > 0.02,
      `dragging over the imported mouth put lipstick on the lips (coverage ${impLip.toFixed(3)})`);
    const afterImp = await frameStats(page);
    check(redness(afterImp.core) > redness(beforeImp.core) + 3,
      `and the head got redder (${redness(beforeImp.core).toFixed(1)} -> ${redness(afterImp.core).toFixed(1)})`);
    await shot('12-imported-lips');

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
