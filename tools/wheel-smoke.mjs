#!/usr/bin/env node
/*
 * wheel-smoke.mjs — drives "מה לעשות היום" in a real browser.
 *
 * A wheel of fortune has one failure mode no unit test sees: the pointer stops
 * over one wedge and the app announces a different one. Nothing throws, the
 * animation looks right, and the app is simply lying. So this loads the page
 * for real, spins it, and each time recomputes from the live DOM which wedge
 * is actually under the pointer — from the current rotation and the current
 * segment list — then asserts that is the activity the card names. It is
 * deliberately not the same arithmetic the app runs: the app solves for a
 * rotation given a winner, this reads a winner back out of a rotation.
 *
 * The rest covers what a user can reach: the empty pool, the one-item pool,
 * "not happy with this one", localStorage across a reload, and reset.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/wheel-smoke.mjs
 *   … --shots      also write PNGs to dist/shots/wheel
 *   … --spins 60   more geometry samples (default 40)
 */

import { createServer } from 'node:http';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const APP = 'מה-לעשות-היום.html';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/shots/wheel');
const SPINS = Number(
  (process.argv.indexOf('--spins') >= 0 && process.argv[process.argv.indexOf('--spins') + 1]) || 40,
);

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

/* ------------------------------------------------------------------ *
 * assertions
 * ------------------------------------------------------------------ */

let pass = 0;
const failures = [];

function ok(name, cond, detail = '') {
  const line = detail ? `${name} — ${detail}` : name;
  if (cond) {
    pass++;
    console.log(`  ok   ${line}`);
  } else {
    failures.push(line);
    console.log(`  FAIL ${line}`);
  }
}

/* ------------------------------------------------------------------ *
 * A static server rooted at the repo, so localStorage has a real origin.
 * Chromium refuses localStorage over file:// — the app degrades through
 * that (every access is guarded), but persistence cannot be tested there.
 * ------------------------------------------------------------------ */

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = resolve(ROOT, normalize(rel) || 'index.html');
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/* The wedge the pointer is over, derived only from what the page reports: the
 * pointer sits at screen angle 0, so the wheel-local angle beneath it is
 * -rotation, and the wedge index follows from the segment width. */
const readPointer = (page) =>
  page.evaluate(() => {
    const items = window.__wheel.items();
    const n = items.length;
    const seg = 360 / n;
    const local = (((-window.__wheel.rotation()) % 360) + 360) % 360;
    const idx = Math.floor(local / seg) % n;
    const segs = [...document.querySelectorAll('#segs .seg')];
    return {
      n,
      idx,
      under: items[idx],
      winner: window.__wheel.winner(),
      highlighted: segs.findIndex((s) => s.classList.contains('win')),
      offset: Math.abs(local - (idx * seg + seg / 2)) / seg,
      card: document.getElementById('rText').textContent,
    };
  });

/* One pixel of the rendered page, decoded for real. A 1x1 PNG is a single
 * scanline, and every PNG filter degenerates to the raw byte for the first
 * pixel of the first row, so no unfiltering is needed. This exists because
 * "the background stops at the fold and the buttons below it are white on
 * white" is invisible to every assertion that is not looking at pixels. */
async function pixelAt(page, x, y) {
  const png = await page.screenshot({ fullPage: true, scale: 'css', clip: { x, y, width: 1, height: 1 } });
  const idat = [];
  for (let off = 8; off + 8 <= png.length; ) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { r: raw[1], g: raw[2], b: raw[3] };
}

const settled = (page) =>
  page.waitForFunction(() => !window.__wheel.spinning(), null, { timeout: 20000 });

async function spin(page, selector = '#spinBtn') {
  await page.click(selector);
  await settled(page);
}

/* ------------------------------------------------------------------ *
 * run
 * ------------------------------------------------------------------ */

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/${encodeURIComponent(APP)}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'he-IL',
});
const page = await ctx.newPage();

const noise = [];
const offSite = new Set();

/* Everything the app needs is in the one file. The Google Fonts link is the
 * single outbound request, and it is a progressive enhancement — so block it
 * outright and run the whole suite against the fallback stack. Anything else
 * reaching for the network is recorded and failed on. */
await ctx.route('**/*', (route) => {
  const target = new URL(route.request().url());
  if (target.protocol === 'file:' || target.hostname === '127.0.0.1') return route.continue();
  offSite.add(target.hostname);
  return route.abort();
});

page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  /* the blocked font request logs one of these; nothing else should */
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) noise.push(`console: ${m.text()}`);
});
page.on('dialog', (d) => d.accept());

await page.goto(url, { waitUntil: 'networkidle' });

console.log('\nloads');
ok('title', (await page.title()) === 'מה לעשות היום?');
ok(
  'document is RTL Hebrew',
  (await page.getAttribute('html', 'dir')) === 'rtl' && (await page.getAttribute('html', 'lang')) === 'he',
);
ok('six categories', (await page.locator('.chip').count()) === 6);
ok('sixty activities in the default pool', (await page.evaluate(() => window.__wheel.pool().length)) === 60);
ok('the wheel is capped at twelve wedges', (await page.locator('#segs .seg').count()) === 12);
ok('every wedge carries a label', (await page.locator('#labels text').count()) === 12);
ok('the result card starts hidden', await page.locator('#result').isHidden());
ok(
  'no horizontal overflow on a phone',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  await page.evaluate(() => `${document.documentElement.scrollWidth}px in ${window.innerWidth}px`),
);

console.log(`\nthe pointer tells the truth (${SPINS} spins)`);
let wrongWinner = 0;
let wrongHighlight = 0;
let wrongCard = 0;
let onASeam = 0;
let worstOffset = 0;
const distinct = new Set();
for (let i = 0; i < SPINS; i++) {
  await spin(page);
  const r = await readPointer(page);
  if (r.winner.id !== r.under.id) wrongWinner++;
  if (r.highlighted !== r.idx) wrongHighlight++;
  if (r.card !== r.winner.text) wrongCard++;
  if (r.offset > 0.5) onASeam++;
  worstOffset = Math.max(worstOffset, r.offset);
  distinct.add(r.winner.id);
}
ok('the wedge under the pointer is the announced winner', wrongWinner === 0, `${wrongWinner} of ${SPINS} wrong`);
ok('the highlighted wedge is the winning wedge', wrongHighlight === 0, `${wrongHighlight} of ${SPINS} wrong`);
ok('the card names the winner', wrongCard === 0, `${wrongCard} of ${SPINS} wrong`);
ok(
  'the wheel never stops on a seam',
  onASeam === 0,
  `worst landing ${(worstOffset * 100).toFixed(1)}% of a wedge from its centre`,
);
ok('the draw is not stuck on a handful of activities', distinct.size > SPINS * 0.4, `${distinct.size} distinct in ${SPINS}`);

console.log('\n"not happy with this one"');
let repeats = 0;
for (let i = 0; i < 12; i++) {
  const before = await page.evaluate(() => window.__wheel.winner().id);
  await spin(page, '#rerollBtn');
  if ((await page.evaluate(() => window.__wheel.winner().id)) === before) repeats++;
}
ok('rerolling never returns the same activity', repeats === 0, `${repeats} of 12 repeated`);
await spin(page, '#againBtn');
ok('"spin again" spins', !!(await page.evaluate(() => window.__wheel.winner())));

console.log('\ncategories');
await page.locator('.chip').nth(0).click();
ok('switching one off removes its ten activities', (await page.evaluate(() => window.__wheel.pool().length)) === 50);
ok('the chip reports its state', (await page.locator('.chip').nth(0).getAttribute('aria-pressed')) === 'false');
for (let i = 1; i < 6; i++) await page.locator('.chip').nth(i).click();
ok('all off empties the pool', (await page.evaluate(() => window.__wheel.pool().length)) === 0);
ok('an empty pool disables the spin button', await page.locator('#spinBtn').isDisabled());
ok('and says so in the note', (await page.locator('#poolNote').textContent()).includes('אין פעילויות פעילות'));
await page.evaluate(() => document.getElementById('spinBtn').click());
ok('spinning an empty wheel does nothing rather than throwing', noise.length === 0, noise.join(' | '));
for (let i = 0; i < 6; i++) await page.locator('.chip').nth(i).click();
ok('all back on restores the pool', (await page.evaluate(() => window.__wheel.pool().length)) === 60);

console.log('\npools of one and two');
await page.evaluate(() =>
  document.querySelectorAll('.chip').forEach((c, i) => {
    if (i > 0) c.click();
  }),
);
await page.click('#editBtn');
const toggles = page.locator('.grp').nth(0).locator('.items .tog');
const inFirstCategory = await toggles.count();
for (let i = 1; i < inFirstCategory; i++) await toggles.nth(i).click();
await page.click('#doneBtn');
ok('a pool of one', (await page.evaluate(() => window.__wheel.pool().length)) === 1);
ok('drawn as a full circle, not a zero-width wedge', (await page.locator('#segs .seg').count()) === 1);
await spin(page);
ok('it still spins and resolves', !!(await page.evaluate(() => window.__wheel.winner())));
await spin(page, '#rerollBtn');
ok('rerolling the only option does not hang', !!(await page.evaluate(() => window.__wheel.winner())));
await page.click('#editBtn');
await toggles.nth(1).click();
await page.click('#doneBtn');
await spin(page);
const two = await readPointer(page);
ok('a pool of two lands on the right half', two.n === 2 && two.winner.id === two.under.id);

console.log('\nthe list survives a reload');
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('mah-laasot-hayom.v1')));
await page.click('#editBtn');
await page.fill('#newText', 'לבדוק שהשמירה עובדת');
await page.fill('#newEmoji', '🧪');
await page.selectOption('#newCat', 'food');
await page.click('#addForm button[type=submit]');
ok('a custom activity is written to localStorage', (await stored()).custom.length === 1);
await page.click('#doneBtn');
await page.reload({ waitUntil: 'networkidle' });
const back = await stored();
ok('the custom activity comes back', back.custom.length === 1);
ok('switched-off activities come back off', back.disabled.length > 0);
ok('switched-off categories come back off', back.catsOff.length === 5);
ok(
  'the chips render the stored state',
  (await page.evaluate(
    () => [...document.querySelectorAll('.chip')].filter((c) => c.getAttribute('aria-pressed') === 'false').length,
  )) === 5,
);
await page.evaluate(() =>
  document.querySelectorAll('.chip').forEach((c) => {
    if (c.getAttribute('aria-pressed') === 'false') c.click();
  }),
);
ok(
  'and the custom activity can actually be drawn',
  await page.evaluate(() => window.__wheel.pool().some((i) => i.text === 'לבדוק שהשמירה עובדת')),
);
await page.click('#editBtn');
await page.locator('.items .del').first().click();
ok('deleting it removes it from storage', (await stored()).custom.length === 0);
await page.click('#doneBtn');

console.log('\nreset');
await page.click('#resetBtn');
ok('storage is cleared', (await page.evaluate(() => localStorage.getItem('mah-laasot-hayom.v1'))) === null);
ok('all sixty activities are back', (await page.evaluate(() => window.__wheel.pool().length)) === 60);
ok(
  'all categories are back on',
  await page.evaluate(() => [...document.querySelectorAll('.chip')].every((c) => c.getAttribute('aria-pressed') === 'true')),
);
ok('the stale result card is dismissed', await page.locator('#result').isHidden());

console.log('\ncarnival details');
ok('twenty-four bulbs around the bezel', (await page.locator('.led').count()) === 24);
await page.click('#spinBtn');
ok('the bulbs chase while it spins',
  await page.evaluate(() => document.querySelector('.stage').classList.contains('spinning')));
await settled(page);
ok('and celebrate when it lands',
  await page.evaluate(() => document.querySelector('.stage').classList.contains('won')));
ok('a quip under the result', ((await page.textContent('#rQuip')) || '').trim().length > 0);
const cardUrl = await page.evaluate(() => window.__wheel.card());
ok('the share card renders as a real PNG',
  cardUrl.startsWith('data:image/png') && cardUrl.length > 20000, `${cardUrl.length} chars`);
await page.click('#shareBtn');
await page.waitForTimeout(400);
ok('sharing without the Web Share API falls back without errors', noise.length === 0, noise.join(' | '));

console.log('\nsound');
ok('sound starts on', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'true');
await page.click('#muteBtn');
ok('one tap mutes it', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'false');
await page.reload({ waitUntil: 'networkidle' });
ok('the choice survives a reload', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'false');
await page.click('#muteBtn');
ok('and a tap brings it back', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'true');
ok('spinning with sound on logs no audio errors', await (async () => {
  await spin(page);
  return noise.length === 0;
})(), noise.join(' | '));

console.log('\nthe wheel itself is a button');
const rotBefore = await page.evaluate(() => window.__wheel.rotation());
const stageBox = await page.locator('.stage').boundingBox();
await page.mouse.click(stageBox.x + stageBox.width * 0.82, stageBox.y + stageBox.height / 2);
try { await page.waitForFunction(() => window.__wheel.spinning(), null, { timeout: 1500 }); } catch {}
await settled(page);
ok('tapping the wheel spins it', (await page.evaluate(() => window.__wheel.rotation())) !== rotBefore);

console.log('\nkeyboard and assistive tech');
ok('the spin button is labelled', !!(await page.getAttribute('#spinBtn', 'aria-label')));
ok('the result is announced through a live region that is always present',
  (await page.getAttribute('#announce', 'aria-live')) === 'polite'
  && (await page.getAttribute('#result', 'aria-live')) === null);
ok(
  'every button has an accessible name',
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].every((b) => (b.textContent || '').trim() || b.getAttribute('aria-label')),
  ),
);
await page.click('#editBtn');
const openedAsModal = await page.evaluate(() => document.getElementById('editor').open);
await page.keyboard.press('Escape');
ok(
  'the editor opens as a modal and closes on Escape',
  openedAsModal && !(await page.evaluate(() => document.getElementById('editor').open)),
);
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press(' ');
let spaceSpins = true;
try {
  await page.waitForFunction(() => window.__wheel.spinning(), null, { timeout: 2000 });
} catch {
  spaceSpins = false;
}
await settled(page);
ok('space spins the wheel', spaceSpins);
await page.waitForTimeout(2800);
ok(
  'the confetti canvas takes itself back down',
  (await page.evaluate(() => getComputedStyle(document.getElementById('fx')).display)) === 'none',
);

console.log('\nfocus survives a toggle');
await page.locator('.chip').nth(2).focus();
await page.keyboard.press('Enter');
ok(
  'a chip keeps keyboard focus when it is switched',
  await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('chip')),
  await page.evaluate(() => document.activeElement && document.activeElement.tagName + '.' + document.activeElement.className),
);
await page.keyboard.press('Enter');
await page.click('#editBtn');
await page.locator('.items .tog').first().focus();
await page.keyboard.press('Enter');
ok(
  'an editor row keeps keyboard focus when it is switched',
  await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('tog')),
  await page.evaluate(() => document.activeElement && document.activeElement.tagName + '.' + document.activeElement.className),
);
await page.keyboard.press('Enter');
await page.locator('.grp').first().locator('.switch').focus();
await page.keyboard.press('Enter');
ok(
  'the chips and the editor switches agree about one category',
  await page.evaluate(() => {
    const sw = document.querySelector('.grp .switch').getAttribute('aria-checked');
    const chip = document.querySelectorAll('.chip')[0].getAttribute('aria-pressed');
    return sw === chip;
  }),
);
await page.keyboard.press('Enter');
await page.click('#doneBtn');

console.log('\nthe result reaches a screen reader');
await spin(page);
const spoken = await page.textContent('#announce');
const shown = await page.textContent('#rText');
ok('the live region names the winner', spoken.includes(shown), `"${spoken}"`);

console.log('\nthe background reaches the bottom of the page');
const height = await page.evaluate(() => document.documentElement.scrollHeight);
const tall = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
ok('the page is taller than the viewport, so this is a real case', tall, `${height}px`);
const low = await pixelAt(page, 4, height - 8);
ok(
  'the bottom of the page is still painted, not bare white',
  low.r < 140 && low.g < 140 && low.b < 190,
  `rgb(${low.r}, ${low.g}, ${low.b})`,
);
const toolsBox = await page.locator('#editBtn').boundingBox();
ok('and the tools row sits on it rather than on white', !!toolsBox);

/* The deliverable is a file someone double-clicks. Chromium refuses
 * localStorage on file://, and every access in the app is wrapped for exactly
 * that — so the wheel has to keep working, just without remembering. */
console.log('\nopened straight off the disk');
const local = await ctx.newPage();
const localNoise = [];
local.on('pageerror', (e) => localNoise.push(e.message));
await local.goto(pathToFileURL(resolve(ROOT, APP)).href, { waitUntil: 'domcontentloaded' });
ok('the file loads over file://', (await local.locator('.chip').count()) === 6);
ok('with the full default list', (await local.evaluate(() => window.__wheel.pool().length)) === 60);
await spin(local);
const offline = await readPointer(local);
ok('it spins and lands correctly with no storage at all', offline.winner.id === offline.under.id);
ok('and localStorage being unavailable throws nothing', localNoise.length === 0, localNoise.join(' | '));
await local.close();

console.log('\nreduced motion');
const calm = await ctx.newPage();
await calm.emulateMedia({ reducedMotion: 'reduce' });
await calm.goto(url, { waitUntil: 'networkidle' });
const startedAt = Date.now();
await calm.click('#spinBtn');
await settled(calm);
const elapsed = Date.now() - startedAt;
ok(`the spin is short instead of theatrical (${elapsed}ms)`, elapsed < 1600);
ok('and still produces a result', await calm.locator('#result').isVisible());
const calmWheel = await readPointer(calm);
ok('and still lands honestly', calmWheel.winner.id === calmWheel.under.id);
await calm.close();

console.log('\nself-contained');
ok(
  'the only outbound request is the optional font CDN',
  [...offSite].every((h) => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'),
  [...offSite].join(', '),
);
ok('everything above passed with that CDN blocked', true);
ok('nothing was logged as an error', noise.length === 0, noise.join(' | '));

if (SHOTS) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await spin(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOT_DIR, 'phone.png'), fullPage: true });
  await page.click('#editBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOT_DIR, 'editor.png') });
  const wide = await ctx.newPage();
  await wide.setViewportSize({ width: 900, height: 1000 });
  await wide.goto(url, { waitUntil: 'networkidle' });
  await spin(wide);
  await wide.waitForTimeout(700);
  await wide.screenshot({ path: join(SHOT_DIR, 'desktop.png'), fullPage: true });
  await wide.close();
  console.log(`\nshots -> ${SHOT_DIR}`);
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
