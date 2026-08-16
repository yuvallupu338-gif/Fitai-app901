#!/usr/bin/env node
/*
 * build-apk.mjs — package the web app in ../../app as an Android APK.
 *
 * Three steps, in order, because each depends on the last:
 *
 *   1. Copy app/ into android/app/src/main/assets/. It is 25 MB and it is
 *      generated, so it is gitignored rather than committed twice.
 *   2. Cut the launcher icons out of app/assets/logo-source.png at the five
 *      densities Android asks for, plus the adaptive-icon foreground.
 *   3. Hand the whole thing to Gradle.
 *
 * The APK lands in dist/. It is debug-signed, which is what a sideloaded build
 * wants; see android/README.md for what a Play release needs instead.
 *
 *   node android/tools/build-apk.mjs [--assets-only] [--release]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ANDROID = resolve(HERE, '..');
const ROOT = resolve(ANDROID, '..');
const WEB = resolve(ROOT, 'app');
const ASSETS = resolve(ANDROID, 'app/src/main/assets');
const RES = resolve(ANDROID, 'app/src/main/res');

const argv = process.argv.slice(2);
const assetsOnly = argv.includes('--assets-only');
const release = argv.includes('--release');

/* ---- 1. the web app becomes the asset tree ---------------------------- */
console.log('· copying app/ into assets');
rmSync(ASSETS, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
for (const entry of ['index.html', 'styles', 'src', 'i18n', 'assets']) {
  cpSync(resolve(WEB, entry), resolve(ASSETS, entry), { recursive: true });
}
/* The source artwork and the build tools are not part of the app. */
rmSync(resolve(ASSETS, 'assets/logo-source.png'), { force: true });
rmSync(resolve(ASSETS, 'styles/rubik.css'), { force: true });

const bytes = execFileSync('du', ['-sb', ASSETS]).toString().split('\t')[0];
console.log(`  ${(bytes / 1048576).toFixed(1)} MB of assets`);

/* The shell loads index.html from the asset root, so it must be there. */
if (!existsSync(resolve(ASSETS, 'index.html'))) throw new Error('assets/index.html missing after copy');
/* And it must still carry the policy the shell depends on. */
if (!/script-src 'self'/.test(readFileSync(resolve(ASSETS, 'index.html'), 'utf8'))) {
  throw new Error("assets/index.html no longer says script-src 'self' — "
    + 'MainActivity serves over https for that reason; check before shipping');
}

/* ---- 2. launcher icons ------------------------------------------------- */
console.log('· cutting launcher icons');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const SRC = 'data:image/png;base64,' + readFileSync(resolve(WEB, 'assets/logo-source.png')).toString('base64');
/* mipmap density -> launcher size. The adaptive foreground is drawn at 108dp
 * with the mark inside the middle 66dp, because the launcher masks the rest. */
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');
const icons = await page.evaluate(async ({ src, densities }) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = src; });
  const c = document.getElementById('c'), g = c.getContext('2d');
  c.width = img.width; c.height = img.height; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const lum = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const bg = lum(0), ground = `rgb(${d[0]},${d[1]},${d[2]})`;

  /* the first band of artwork is the mark; same scan as tools/build-logo.mjs */
  let band = null;
  for (let y = 0; y < c.height; y++) {
    let n = 0, first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (lum(i) - bg > 26) { n++; if (first < 0) first = x; last = x; }
    }
    if (n > 3) {
      if (!band) band = { y0: y, y1: y, x0: first, x1: last };
      else { band.y1 = y; band.x0 = Math.min(band.x0, first); band.x1 = Math.max(band.x1, last); }
    } else if (band && band.y1 - band.y0 > 6) break;
  }
  if (!band) throw new Error('no artwork found in logo-source.png');

  const draw = (size, margin) => {
    const o = document.createElement('canvas');
    o.width = o.height = size;
    const q = o.getContext('2d');
    q.fillStyle = ground; q.fillRect(0, 0, size, size);
    q.imageSmoothingQuality = 'high';
    const sw = band.x1 - band.x0 + 1, sh = band.y1 - band.y0 + 1;
    const box = size * (1 - margin * 2);
    const k = Math.min(box / sw, box / sh);
    q.drawImage(img, band.x0, band.y0, sw, sh,
      (size - sw * k) / 2, (size - sh * k) / 2, sw * k, sh * k);
    return o.toDataURL('image/png');
  };

  const out = { legacy: {}, foreground: {} };
  for (const [name, px] of Object.entries(densities)) {
    out.legacy[name] = draw(px, 0.10);
    // 108dp canvas, mark kept inside the 66dp safe circle the mask leaves
    out.foreground[name] = draw(Math.round(px * 108 / 48), 0.29);
  }
  return out;
}, { src: SRC, densities: DENSITIES });
await browser.close();

for (const [name] of Object.entries(DENSITIES)) {
  const dir = resolve(RES, `mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'ic_launcher.png'), Buffer.from(icons.legacy[name].split(',')[1], 'base64'));
  writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), Buffer.from(icons.foreground[name].split(',')[1], 'base64'));
}
mkdirSync(resolve(RES, 'mipmap-anydpi-v26'), { recursive: true });
writeFileSync(resolve(RES, 'mipmap-anydpi-v26/ic_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon: the launcher masks this to whatever shape the device uses,
     so the mark sits inside the safe circle and the near-black ground fills
     the rest rather than letting the system pick a colour. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ground" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`);
console.log(`  ${Object.keys(DENSITIES).length} densities, legacy + adaptive`);

if (assetsOnly) { console.log('\n--assets-only: stopping before Gradle'); process.exit(0); }

/* ---- 3. gradle --------------------------------------------------------- */
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('ANDROID_HOME is not set — point it at an Android SDK');
writeFileSync(resolve(ANDROID, 'local.properties'), `sdk.dir=${sdk}\n`);

const task = release ? 'assembleRelease' : 'assembleDebug';
console.log(`· gradle ${task}`);
execFileSync('gradle', ['--project-dir', ANDROID, task, '--console=plain', '-q'],
  { stdio: 'inherit', env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } });

const built = resolve(ANDROID, `app/build/outputs/apk/${release ? 'release' : 'debug'}`,
  `app-${release ? 'release' : 'debug'}.apk`);
if (!existsSync(built)) throw new Error(`gradle finished but ${built} is not there`);

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
const out = resolve(ROOT, `dist/FitAI-${release ? 'release' : 'debug'}.apk`);
cpSync(built, out);
console.log(`\n✓ ${out.replace(ROOT + '/', '')} — ${(statSync(out).size / 1048576).toFixed(1)} MB`);
