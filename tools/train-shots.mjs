#!/usr/bin/env node
/*
 * train-shots.mjs — honest screenshots of THE LAST TRAIN.
 *
 * `page.screenshot()` does not tell the truth about a WebGL canvas under
 * software rendering: the headless compositor resamples the canvas layer, so
 * a frame that is provably sharp in the framebuffer — read back pixel by
 * pixel, edges landing in two pixels — arrives as a soft, veiled mess. Judging
 * the game's picture from those images means fixing things that are not
 * broken.
 *
 * So this takes the pixels out of the GL framebuffer directly, the same bytes
 * the player's monitor gets, and encodes them in the page with the 2D canvas.
 * The HUD is captured separately over a transparent background and composited
 * on top, so a shot with a hint or a prompt in it shows both at full
 * resolution.
 *
 * Usage:
 *   node tools/train-shots.mjs                 # the standard set
 *   node tools/train-shots.mjs --out dir       # somewhere else
 *   node tools/train-shots.mjs --width 1600 --height 900
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire('/opt/node22/lib/node_modules/x.js');
const { chromium } = require('playwright');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = resolve(ROOT, arg('out', 'dist/train-shots'));
const WIDTH = Number(arg('width', 1280));
const HEIGHT = Number(arg('height', 720));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = resolve(dir, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await serve(resolve(ROOT, 'train'));
  const port = server.address().port;
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (e) => console.error('page error:', e.message));

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__lastTrain && window.__lastTrain.mode === 'menu',
    null, { timeout: 60000 });

  /* The renderer is installed with a hook that keeps the last frame's pixels
     readable. Without it the drawing buffer is gone by the time anything can
     ask for it. */
  await page.evaluate(() => {
    window.__grab = () => {
      const g = window.__lastTrain.game;
      const r = g.renderer;
      const gl = r.gl;
      if (window.__lastTrain.mode === 'menu') g.render(); else g.render();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      /* GL hands rows back bottom-up. */
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4;
        img.data.set(px.subarray(src, src + w * 4), y * w * 4);
      }
      ctx.putImageData(img, 0, 0);
      window.__grabbed = c;
      return c.toDataURL('image/png');
    };
    /* Composites a transparent capture of the DOM layers on top of the frame
       that __grab already took. */
    window.__overlay = (dataUrl) => new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        const c = window.__grabbed;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/png'));
      };
      im.src = dataUrl;
    });
  });

  const written = [];

  /* A frame of the game itself, read out of the framebuffer, with the HUD
     composited on top at full resolution. */
  async function shot(name, { hud = true } = {}) {
    await page.evaluate(() => window.__grab());
    let data;
    if (hud) {
      await page.evaluate(() => {
        document.getElementById('view').style.visibility = 'hidden';
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        /* The CSS grain blends with mix-blend-mode: overlay, and over a
           transparent backdrop the browser blends it against black — a
           full-screen dark veil that halved the brightness of every
           composited shot. The game's own grain is in the GL frame already. */
        document.getElementById('grain').style.display = 'none';
      });
      const dom = await page.screenshot({ omitBackground: true });
      await page.evaluate(() => {
        document.getElementById('view').style.visibility = '';
        document.documentElement.style.background = '';
        document.body.style.background = '';
        document.getElementById('grain').style.display = '';
      });
      data = await page.evaluate((url) => window.__overlay(url),
        `data:image/png;base64,${dom.toString('base64')}`);
    } else {
      data = await page.evaluate(() => window.__grabbed.toDataURL('image/png'));
    }
    const file = resolve(OUT, `${name}.png`);
    await writeFile(file, Buffer.from(data.split(',')[1], 'base64'));
    written.push(`${name}.png`);
    console.log('wrote', file);
  }

  /* A DOM-only page (menus, how to play, the journal). The compositor is
     perfectly honest about text. */
  async function domShot(name) {
    const file = resolve(OUT, `${name}.png`);
    await writeFile(file, await page.screenshot());
    written.push(`${name}.png`);
    console.log('wrote', file);
  }

  /* Runs the simulation forward by roughly `seconds`, by asking for more
     sub-steps rather than waiting — a software-rendered frame can take two
     seconds of wall clock and the sim would otherwise never move. */
  async function sim(seconds) {
    const steps = Math.max(1, Math.round(seconds * 15));
    await page.evaluate((n) => window.__lastTrain.setSubSteps(Math.min(64, n)), Math.min(64, steps));
    const rounds = Math.ceil(steps / 64);
    for (let i = 0; i < rounds; i++) await page.waitForTimeout(2200);
    await page.evaluate(() => window.__lastTrain.setSubSteps(1));
    await page.waitForTimeout(600);
  }

  /* ---- the menu, and the page that explains the game ------------------- */

  await page.waitForTimeout(2500);
  await domShot('00-menu');

  await page.evaluate(() => {
    [...document.querySelectorAll('.menu .btn')].find((b) => b.dataset.act === 'howto')?.click();
  });
  await page.waitForTimeout(400);
  await domShot('01-howto');
  await page.evaluate(() => {
    [...document.querySelectorAll('.menu .btn')].find((b) => b.dataset.act === 'back')?.click();
  });
  await page.waitForTimeout(300);

  /* ---- on the platform, before boarding -------------------------------- */

  await page.evaluate(() => window.__lastTrain.startRun({ nightmare: false }));
  await sim(3);
  await shot('02-platform');

  /* ---- aboard, looking down the carriage ------------------------------- */

  await page.evaluate(() => {
    const g = window.__lastTrain.game;
    g.player.outside = false;
    g.player.position[0] = 0;
    g.player.position[1] = 0;
    g.player.position[2] = 12.7;
    /* Toward the front of the train, which is where the cast is. */
    g.player.yaw = Math.PI;
    g.player.pitch = 0;
  });
  await sim(3);
  await shot('03-carriage');

  /* Close enough to read a face, which is the thing that has to hold up. */
  const framed = await page.evaluate(() => {
    const g = window.__lastTrain.game;
    const here = g.player.position[2];
    /* Whoever is nearest the camera in this car, seen from a metre and a half
       away, from the far side of the aisle rather than head on.

       The camera looks along (-sin yaw, -cos yaw) — the opposite of what the
       movement code's basis suggests at a glance — so aiming at a point is
       atan2(dx, dz) plus a half turn. Without the half turn every shot in this
       file was of the wall behind the photographer. */
    const best = g.crowd.visiblePeople()
      .map((q) => ({ q, p: q.position() }))
      .filter((e) => Math.abs(e.p[2] - here) < 9)
      .sort((a, b) => Math.abs(a.p[2] - here) - Math.abs(b.p[2] - here))[0];
    if (!best) return null;
    const [px, , pz] = best.p;
    const side = Math.sign(px) || 1;
    g.player.position[0] = -side * 0.55;
    g.player.position[2] = pz + 0.85;
    const dx = px - g.player.position[0];
    const dz = pz - g.player.position[2];
    g.player.yaw = Math.atan2(dx, dz) + Math.PI;
    g.player.pitch = Math.atan2(1.14 - g.player.eyeHeight, Math.hypot(dx, dz));
    return { id: best.q.id, px, pz, cam: [...g.player.position], yaw: g.player.yaw };
  });
  console.log('framed', JSON.stringify(framed));
  await sim(1.5);
  await shot('04-passenger');

  /* ---- the window, and what is in it ----------------------------------- */

  await page.evaluate(() => {
    const g = window.__lastTrain.game;
    g.player.position[0] = 0;
    g.player.position[2] = 12.7;
    g.player.yaw = -Math.PI / 2 + 0.3;
    g.player.pitch = -0.05;
  });
  await sim(2);
  await shot('05-window');

  /* ---- the run, station by station ------------------------------------- */

  for (let i = 1; i <= 6; i++) {
    /* Long enough to cross a leg, brake and stand at the next platform. */
    await page.evaluate(() => {
      const g = window.__lastTrain.game;
      g.player.position[0] = 0;
      g.player.position[2] = 12.7;
      g.player.yaw = Math.PI;
      g.player.pitch = 0;
    });
    let guard = 0;
    while (guard++ < 14) {
      await sim(8);
      const at = await page.evaluate(() => {
        const g = window.__lastTrain.game;
        return { i: g.state.stationIndex, phase: g.phase, mode: window.__lastTrain.mode };
      });
      if (at.mode !== 'playing') break;
      if (at.i >= i && at.phase === 'stopped') break;
    }
    /* In the doorway, looking out at whatever is standing on the platform —
       which is the picture the station is actually for. */
    const state = await page.evaluate(() => {
      const g = window.__lastTrain.game;
      /* Down the carriage from the middle of it. Framing on the doorway
         needs the car's own centre — which this file does not have — and a
         guess at it puts the lens against a wall panel. */
      const side = g.station?.side ?? 1;
      g.player.position[0] = -side * 0.35;
      g.player.position[2] = 12.7;
      g.player.yaw = Math.PI;
      g.player.pitch = -0.02;
      return {
        mode: window.__lastTrain.mode,
        i: g.state.stationIndex,
        name: g.station?.name,
      };
    });
    if (state.mode !== 'playing') break;
    await page.waitForTimeout(1500);
    await shot(`1${i}-station-${i}-${String(state.name || '').toLowerCase().replace(/\W+/g, '')}`);
  }

  console.log(`\n${written.length} screenshots in ${OUT}`);
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
