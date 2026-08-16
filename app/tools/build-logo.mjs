#!/usr/bin/env node
/*
 * build-logo.mjs — cut the brand artwork into the shapes the app needs.
 *
 * The source is one 640×640 lock-up: the F mark with the figure inside it, the
 * FITAI wordmark under it, and a tagline under that. At 34px in the top bar the
 * wordmark and tagline are mud, so the mark is cut out and squared on its own;
 * the whole lock-up is kept for the splash, where there is room for it.
 *
 * Everything is measured, not guessed: the script finds the three bands of
 * artwork by scanning for rows brighter than the corner pixel, so re-running it
 * on a redrawn logo re-crops correctly instead of trusting stale coordinates.
 *
 * These are written as files rather than base64 inside a script, because the
 * script that used to carry them loads after 23 MB of exercise animations —
 * the brand would not appear until everything else had. As files the top bar,
 * the tab icon and the splash are painted by the stylesheet and the markup, on
 * the first frame.
 *
 *   assets/logo-mark.png       256²  top bar, onboarding, favicon, apple-touch,
 *                                    and the progress card painted on a canvas
 *   assets/logo-icon-512.png   512²  the PWA icon
 *   assets/logo-maskable.png   512²  the same mark inside Android's safe zone,
 *                                    which crops to a circle and would clip the F
 *   assets/logo-full.webp            the whole lock-up, cropped to its ink —
 *                                    the splash screen
 *
 * Usage: node app/tools/build-logo.mjs [source.png]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || resolve(ROOT, 'assets/logo-source.png');
const src = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');

const out = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = src; });
  const c = document.getElementById('c'), g = c.getContext('2d');
  c.width = img.width; c.height = img.height;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const lum = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  /* The corner is the ground. Anything meaningfully brighter is artwork. */
  const bg = lum(0);
  const ground = `rgb(${d[0]},${d[1]},${d[2]})`;
  const bands = [];
  let cur = null;
  for (let y = 0; y < c.height; y++) {
    let n = 0, first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (lum(i) - bg > 26) { n++; if (first < 0) first = x; last = x; }
    }
    if (n > 3) {
      if (!cur) cur = { y0: y, y1: y, x0: first, x1: last };
      else { cur.y1 = y; cur.x0 = Math.min(cur.x0, first); cur.x1 = Math.max(cur.x1, last); }
    } else if (cur) { if (cur.y1 - cur.y0 > 6) bands.push(cur); cur = null; }
  }
  if (cur && cur.y1 - cur.y0 > 6) bands.push(cur);
  if (!bands.length) throw new Error('no artwork found in the source');

  /* One crop of the source, centred in a square, with a margin on the wide side. */
  function square(band, size, margin, type, q0) {
    const o = document.createElement('canvas');
    o.width = o.height = size;
    const q = o.getContext('2d');
    q.fillStyle = ground; q.fillRect(0, 0, size, size);
    q.imageSmoothingQuality = 'high';
    const sw = band.x1 - band.x0 + 1, sh = band.y1 - band.y0 + 1;
    const box = size * (1 - margin * 2);
    const k = Math.min(box / sw, box / sh);
    const w = sw * k, h = sh * k;
    q.drawImage(img, band.x0, band.y0, sw, sh, (size - w) / 2, (size - h) / 2, w, h);
    return o.toDataURL(type || 'image/png', q0);
  }

  /* And one of the whole lock-up, at a chosen width. */
  function lockup(width, margin, type, q0) {
    const u = bands.reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
      y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1),
    }));
    const sw = u.x1 - u.x0 + 1, sh = u.y1 - u.y0 + 1;
    const pad = width * margin, inner = width - pad * 2, k = inner / sw;
    const o = document.createElement('canvas');
    o.width = width; o.height = Math.round(sh * k + pad * 2);
    const q = o.getContext('2d');
    q.fillStyle = ground; q.fillRect(0, 0, o.width, o.height);
    q.imageSmoothingQuality = 'high';
    q.drawImage(img, u.x0, u.y0, sw, sh, pad, pad, inner, sh * k);
    return { url: o.toDataURL(type || 'image/png', q0), width: o.width, height: o.height };
  }

  return {
    bands, ground,
    mark: square(bands[0], 256, 0.10),
    icon: square(bands[0], 512, 0.10),
    maskable: square(bands[0], 512, 0.22),
    full: lockup(560, 0.045, 'image/webp', 0.92),
  };
}, src);

await browser.close();

const write = (name, dataUrl) => {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(resolve(ROOT, 'assets', name), buf);
  return `${name} — ${(buf.length / 1024).toFixed(0)} KB`;
};

console.log(`  bands: ${out.bands.map(b => `${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1}`).join(', ')}   ground ${out.ground}`);
console.log('  ' + write('logo-mark.png', out.mark) + '  (256²)');
console.log('  ' + write('logo-icon-512.png', out.icon) + '  (512²)');
console.log('  ' + write('logo-maskable.png', out.maskable) + '  (512², safe zone)');
console.log('  ' + write('logo-full.webp', out.full.url) + `  (${out.full.width}×${out.full.height})`);
console.log('\n✓ four files written to app/assets/');
