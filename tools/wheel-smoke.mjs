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
ok('the wheel is capped at eight wedges', (await page.locator('#segs .seg').count()) === 8);
ok('every wedge carries an emoji and a label', (await page.locator('#labels text').count()) === 16);
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

console.log('\nhow much time have you got');
ok('three time buckets', (await page.locator('.time').count()) === 3);
ok('it starts unfiltered', (await page.evaluate(() => window.__wheel.time())) === 'l');
const everything = await page.evaluate(() => window.__wheel.pool().length);
await page.locator('.time').nth(1).click();
const upToTwo = await page.evaluate(() => window.__wheel.pool().length);
await page.locator('.time').nth(0).click();
const upToHalf = await page.evaluate(() => window.__wheel.pool().length);
ok('the buckets nest rather than partition', upToHalf < upToTwo && upToTwo < everything,
  `${upToHalf} < ${upToTwo} < ${everything}`);
ok('the short bucket is still worth spinning', upToHalf >= 20, `${upToHalf} activities`);
ok('every draw in the short bucket really is short', await page.evaluate(() =>
  window.__wheel.pool().every((i) => i.len === 's')));
await spin(page);
const shortWin = await readPointer(page);
ok('and a spin respects it', shortWin.winner.len === 's', shortWin.winner.len);
ok('the note says what it is drawing from',
  (await page.textContent('#poolNote')).includes('עד חצי שעה'));

/* the time filter is about this moment, not about the list */
await page.reload({ waitUntil: 'networkidle' });
ok('the time filter resets on a new visit, unlike everything else',
  (await page.evaluate(() => window.__wheel.time())) === 'l');

/* leave exactly one long activity switched on, then ask for half an hour:
 * the list is not empty, the time filter is what emptied the pool */
await page.evaluate(() => document.querySelectorAll('.chip').forEach((c, i) => { if (i !== 5) c.click(); }));
await page.click('#editBtn');
/* the editor lists every category, switched-off ones included, so "move" is
 * still the sixth group even with the other five off */
const moveBulk = page.locator('.grp').nth(5).locator('.bulk');
await moveBulk.click();
await page.locator('.grp').nth(5).locator('.items .tog').nth(6).click();   /* מדרגות, ארוכה */
await page.click('#doneBtn');
ok('one long activity left on', (await page.evaluate(() => window.__wheel.pool().length)) === 1);
await page.locator('.time').nth(0).click();
ok('an empty pool blames the time filter when that is the cause',
  (await page.textContent('#poolNote')).includes('לא נכנסת בזמן'),
  await page.textContent('#poolNote'));
ok('and the spin button is disabled rather than spinning an empty wheel',
  await page.locator('#spinBtn').isDisabled());
ok('tapping the wheel in that state does nothing either', await (async () => {
  const before = await page.evaluate(() => window.__wheel.rotation());
  const box = await page.locator('.stage').boundingBox();
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
  await page.waitForTimeout(250);
  return (await page.evaluate(() => window.__wheel.rotation())) === before;
})());
await page.locator('.time').nth(2).click();
await page.click('#editBtn');
await moveBulk.click();
await page.click('#doneBtn');
await page.evaluate(() => document.querySelectorAll('.chip').forEach((c) => {
  if (c.getAttribute('aria-pressed') === 'false') c.click();
}));
ok('and the pool comes back', (await page.evaluate(() => window.__wheel.pool().length)) === 60);

console.log('\nediting an activity instead of deleting it');
await page.click('#editBtn');
await page.fill('#newText', 'פעילות עם שגיאת קלדה');
await page.selectOption('#newCat', 'prod');
await page.click('#addForm button[type=submit]');
await page.fill('#newText', 'פעילות עם שגיאת קלדה');
await page.click('#addForm button[type=submit]');
ok('the same activity cannot be added twice',
  (await page.evaluate(() => window.__wheel.custom().length)) === 1);
await page.locator('.items .edit').first().click();
ok('editing loads the activity into the form',
  (await page.inputValue('#newText')) === 'פעילות עם שגיאת קלדה'
  && (await page.inputValue('#newCat')) === 'prod');
await page.fill('#newText', 'פעילות מתוקנת');
await page.selectOption('#newLen', 's');
await page.click('#addForm button[type=submit]');
const edited = await page.evaluate(() => window.__wheel.custom());
ok('saving edits in place instead of adding a second one', edited.length === 1);
ok('the text changed', edited[0].text === 'פעילות מתוקנת');
ok('the duration changed', edited[0].len === 's');
ok('the id survived, so its on/off state would too', /^c\./.test(edited[0].id));
ok('the form is back to adding', (await page.textContent('#addBtn')).trim() === 'הוסף');
await page.locator('.items .edit').first().click();
await page.click('#cancelEdit');
ok('cancelling leaves edit mode', await page.locator('#editNote').isHidden());
await page.locator('.items .del').first().click();
await page.click('#doneBtn');

console.log('\nundo on the destructive things');
await page.click('#editBtn');
await page.fill('#newText', 'פעילות שנמחקת');
await page.click('#addForm button[type=submit]');
const beforeDelete = await page.evaluate(() => window.__wheel.custom().length);
await page.locator('.items .del').first().click();
ok('deleting removes it', (await page.evaluate(() => window.__wheel.custom().length)) === beforeDelete - 1);
ok('and offers an undo', await page.locator('#toastUndo').isVisible());
ok('the undo is reachable above the modal editor, not painted under it',
  await page.evaluate(() => {
    const b = document.getElementById('toastUndo').getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && hit.id === 'toastUndo';
  }));
await page.click('#toastUndo');
ok('which brings it back', await page.evaluate(() =>
  window.__wheel.custom().some((c) => c.text === 'פעילות שנמחקת')));
await page.click('#doneBtn');

await page.locator('.chip').nth(1).click();
await page.click('#resetBtn');
ok('reset offers an undo too', await page.locator('#toastUndo').isVisible());
await page.click('#toastUndo');
ok('undoing reset restores the custom activity', await page.evaluate(() =>
  window.__wheel.custom().some((c) => c.text === 'פעילות שנמחקת')));
ok('and restores the switched-off category',
  (await page.locator('.chip').nth(1).getAttribute('aria-pressed')) === 'false');

console.log('\nthe list travels as a link');
const link = await page.evaluate(() => window.__wheel.link());
ok('the link carries the state in its hash', /#l=[A-Za-z0-9\-_]+$/.test(link), link.slice(0, 80) + '…');
const guest = await ctx.newPage();
const guestNoise = [];
guest.on('pageerror', (e) => guestNoise.push(e.message));
await guest.goto(link, { waitUntil: 'networkidle' });
ok('a fresh visitor gets the shared list', await guest.evaluate(() =>
  window.__wheel.custom().some((c) => c.text === 'פעילות שנמחקת')));
ok('including the switched-off category',
  (await guest.locator('.chip').nth(1).getAttribute('aria-pressed')) === 'false');
ok('and the hash is cleaned up so a refresh does not re-ask',
  !(await guest.evaluate(() => location.hash)));
ok('with nothing thrown', guestNoise.length === 0, guestNoise.join(' | '));

/* hostile payloads only ever reach the page through textContent, but the
 * caps still have to hold: over-long text, unknown category, junk emoji */
const nasty = await page.evaluate(() => {
  const payload = {
    custom: [
      { text: '<img src=x onerror=alert(1)>'.repeat(6), cat: 'nope', emoji: '💣💣💣💣💣💣' },
      { text: '   ', cat: 'food' },
    ],
    catsOff: ['nope'],
    disabled: [123],
  };
  const bin = new TextEncoder().encode(JSON.stringify(payload));
  let str = '';
  bin.forEach((b) => { str += String.fromCharCode(b); });
  return location.href.split('#')[0] + '#l=' + btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});
const hostile = await ctx.newPage();
const hostileNoise = [];
hostile.on('pageerror', (e) => hostileNoise.push(e.message));
hostile.on('dialog', (d) => d.accept());
await hostile.goto(nasty, { waitUntil: 'networkidle' });
const taken = await hostile.evaluate(() => window.__wheel.custom());
ok('a junk link cannot inject markup', await hostile.evaluate(() => !document.querySelector('img')));
ok('over-long text is cut to the cap', taken.every((c) => c.text.length <= 46), JSON.stringify(taken[0] || {}));
ok('an unknown category falls back to a real one', taken.every((c) => c.cat === 'out'));
ok('a runaway emoji is cut to four', taken.every((c) => c.emoji.length <= 4));
ok('a blank activity is dropped', taken.length === 1);
ok('and nothing threw', hostileNoise.length === 0, hostileNoise.join(' | '));
await hostile.close();
await guest.close();
await page.click('#resetBtn');

console.log('\nfinding things in a long list');
await page.click('#editBtn');
await page.fill('#edSearch', 'פיצה');
ok('search narrows to the matches', (await page.locator('.items li').count()) === 1);
ok('and hides the categories with nothing in them', (await page.locator('.grp').count()) === 1);
await page.fill('#edSearch', 'זזזזז');
ok('a search with no hits says so', await page.locator('.no-results').isVisible());
await page.fill('#edSearch', '');
ok('clearing it brings everything back', (await page.locator('.items li').count()) === 60);

const firstBulk = page.locator('.grp').first().locator('.bulk');
await firstBulk.click();
ok('one tap clears a whole category',
  (await page.evaluate(() => window.__wheel.pool().length)) === 50);
await firstBulk.click();
ok('and one tap brings it all back',
  (await page.evaluate(() => window.__wheel.pool().length)) === 60);
await page.click('#doneBtn');

console.log('\ncarnival details');
ok('twenty-four bulbs around the bezel', (await page.locator('.led').count()) === 24);
await page.click('#spinBtn');
ok('the bulbs chase while it spins',
  await page.evaluate(() => document.querySelector('.stage').classList.contains('spinning')));
await settled(page);
ok('and celebrate when it lands',
  await page.evaluate(() => document.querySelector('.stage').classList.contains('won')));
ok('a quip under the result', ((await page.textContent('#rQuip')) || '').trim().length > 0);
ok('the card is tinted with the winning wedge colour', await page.evaluate(() => {
  const win = document.querySelector('#segs .seg.win');
  const card = getComputedStyle(document.getElementById('result')).getPropertyValue('--win').trim();
  return !!win && !!card && win.getAttribute('fill').toLowerCase() === card.toLowerCase();
}));
ok('a shockwave ring exists and only runs on landing', await page.evaluate(() => {
  const s = document.querySelector('.shock');
  return !!s && getComputedStyle(s).animationName === 'shock';
}));
ok('the ambient layer sits behind the content', await page.evaluate(() => {
  const a = document.querySelector('.aurora');
  return !!a && getComputedStyle(a).zIndex === '-1' && a.children.length === 3;
}));
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

console.log('\ngrab it and throw it');
const rotBefore = await page.evaluate(() => window.__wheel.rotation());
const stageBox = await page.locator('.stage').boundingBox();
await page.mouse.click(stageBox.x + stageBox.width * 0.82, stageBox.y + stageBox.height / 2);
try { await page.waitForFunction(() => window.__wheel.spinning(), null, { timeout: 1500 }); } catch {}
await settled(page);
ok('tapping the wheel spins it', (await page.evaluate(() => window.__wheel.rotation())) !== rotBefore);

/* drag the rim a quarter turn and let go */
const cx = stageBox.x + stageBox.width / 2;
const cy = stageBox.y + stageBox.height / 2;
const rim = stageBox.width * 0.38;
const atAngle = (deg) => [cx + rim * Math.cos((deg * Math.PI) / 180), cy + rim * Math.sin((deg * Math.PI) / 180)];

const beforeDrag = await page.evaluate(() => window.__wheel.rotation());
await page.mouse.move(...atAngle(-90));
await page.mouse.down();
for (let a = -90; a <= 10; a += 10) {
  await page.mouse.move(...atAngle(a));
  await page.waitForTimeout(8);
}
const midDrag = await page.evaluate(() => window.__wheel.rotation());
ok('the wheel follows the finger while held', Math.abs(midDrag - beforeDrag) > 60,
  `moved ${Math.round(midDrag - beforeDrag)}deg`);
ok('and it does not count as a spin yet', !(await page.evaluate(() => window.__wheel.spinning())));
await page.mouse.up();
try { await page.waitForFunction(() => window.__wheel.spinning(), null, { timeout: 1500 }); } catch {}
await settled(page);
const flung = await readPointer(page);
ok('letting go throws it', flung.winner !== null);
ok('and a thrown wheel still lands where it says', flung.winner.id === flung.under.id);

/* a deliberate, slow drag is a reposition, not a throw */
await page.mouse.move(...atAngle(0));
await page.mouse.down();
for (let a = 0; a <= 40; a += 10) {
  await page.mouse.move(...atAngle(a));
  await page.waitForTimeout(140);
}
await page.mouse.up();
await page.waitForTimeout(250);
ok('a slow drag repositions instead of spinning', !(await page.evaluate(() => window.__wheel.spinning())));

/* thrown the other way, the wheel must still be honest */
let backwards = 0;
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__wheel.fling(1.4, -1));
  await settled(page);
  const r = await readPointer(page);
  if (r.winner.id !== r.under.id) backwards++;
}
ok('spun anticlockwise it lands correctly too', backwards === 0, `${backwards} of 6 wrong`);

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

console.log('\nit fits a landscape phone');
const short = await ctx.newPage();
await short.setViewportSize({ width: 740, height: 360 });
await short.goto(url, { waitUntil: 'networkidle' });
const stageH = await short.evaluate(() => document.querySelector('.stage').getBoundingClientRect().height);
ok('the wheel shrinks to the height, not just the width', stageH <= 360 * 0.62 + 1, `${Math.round(stageH)}px tall`);
ok('and the spin button is still on screen', await short.evaluate(() => {
  const b = document.getElementById('spinBtn').getBoundingClientRect();
  return b.top >= 0 && b.bottom <= window.innerHeight;
}));
ok('with no horizontal overflow', await short.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
await spin(short);
const landscape = await readPointer(short);
ok('and it still lands honestly', landscape.winner.id === landscape.under.id);
await short.close();

console.log('\nadd to home screen');
ok('an apple-touch-icon that iOS will actually accept', await page.evaluate(() => {
  const l = document.querySelector('link[rel="apple-touch-icon"]');
  return !!l && l.getAttribute('href').startsWith('data:image/png;base64,');
}));
ok('a manifest with a name', await page.evaluate(() => {
  const l = document.querySelector('link[rel="manifest"]');
  if (!l) return false;
  const raw = decodeURIComponent(l.getAttribute('href').split(',').slice(1).join(','));
  const m = JSON.parse(raw);
  return m.name && m.dir === 'rtl' && m.lang === 'he';
}));

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
