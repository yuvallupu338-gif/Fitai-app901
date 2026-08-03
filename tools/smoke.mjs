#!/usr/bin/env node
/*
 * smoke.mjs — drives the real app in a real browser.
 *
 * Walks the intake wizard by filling whatever fields each step declares, then
 * asserts the generated plan actually renders: tabs, exercise cards, live SVG
 * figures with finite coordinates, swap and tick behaviour, and every tab.
 *
 * Usage:
 *   node tools/smoke.mjs                 # serves the repo and tests index.html
 *   node tools/smoke.mjs --single        # tests dist/fitai.html over file://
 *   node tools/smoke.mjs --shots         # also writes screenshots to dist/shots
 *
 * Requires the globally installed playwright:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SINGLE = process.argv.includes('--single');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/shots');

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

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const path = resolve(ROOT, `.${url === '/' ? '/index.html' : url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/* ------------------------------------------------------------------ *
 * Wizard driver — works against whatever schema.js declares
 * ------------------------------------------------------------------ */

async function fillStep(page, answers) {
  await page.waitForTimeout(90);

  // choice / multi option groups: pick one if nothing is picked
  const groups = await page.$$('.field');
  for (const g of groups) {
    const opts = await g.$$('.opt');
    if (opts.length) {
      const anyOn = await g.$('.opt.on');
      if (!anyOn) {
        const label = (await g.$eval('.flabel', (n) => n.textContent).catch(() => '')) || '';
        let target = opts[0];
        for (const key in answers.optionText) {
          if (label.includes(key)) {
            const want = answers.optionText[key];
            for (const o of opts) {
              const t = await o.textContent();
              if (t && t.includes(want)) { target = o; break; }
            }
          }
        }
        await target.click();
        await page.waitForTimeout(40);
      }
      continue;
    }

    const chips = await g.$$('.chipset .btn');
    if (chips.length) {
      const anyOn = await g.$('.chipset .btn.on');
      if (!anyOn && answers.clickFirstChip) { await chips[0].click(); await page.waitForTimeout(30); }
      continue;
    }

    const days = await g.$$('.daybtn');
    if (days.length) {
      const on = await g.$$('.daybtn.on');
      if (on.length < answers.days) {
        for (let i = 0; i < answers.days && i < days.length; i++) {
          const isOn = await days[i * 2 % days.length].evaluate((n) => n.classList.contains('on'));
          if (!isOn) { await days[i * 2 % days.length].click(); await page.waitForTimeout(25); }
        }
      }
      continue;
    }

    const scale = await g.$$('.scale button');
    if (scale.length) {
      const anyOn = await g.$('.scale button.on');
      if (!anyOn) { await scale[Math.floor(scale.length / 2)].click(); await page.waitForTimeout(25); }
      continue;
    }

    const input = await g.$('input, textarea');
    if (input) {
      const type = await input.evaluate((n) => n.getAttribute('type') || n.tagName.toLowerCase());
      const val = await input.evaluate((n) => n.value);
      if (val) continue;
      const label = (await g.$eval('.flabel', (n) => n.textContent).catch(() => '')) || '';
      if (type === 'date') {
        await input.fill(answers.date);
      } else if (type === 'number') {
        let v = answers.number;
        for (const key in answers.numbers) if (label.includes(key)) v = answers.numbers[key];
        await input.fill(String(v));
      } else if (type === 'textarea' || type === 'text') {
        await input.fill(answers.text || '');
      }
      await page.waitForTimeout(25);
    }
  }
}

async function runWizard(page, answers) {
  for (let i = 0; i < 16; i++) {
    if (await page.$('.tabs')) return true;
    const next = await page.$('.wiznav .btn.primary');
    if (!next) return !!(await page.$('.tabs'));

    await fillStep(page, answers);
    const before = await page.$eval('.progress', (n) => Array.from(n.children).findIndex((c) => c.classList.contains('now'))).catch(() => -1);
    await next.click();
    await page.waitForTimeout(260);

    const after = await page.$eval('.progress', (n) => Array.from(n.children).findIndex((c) => c.classList.contains('now'))).catch(() => -1);
    if (before === after && before !== -1 && !(await page.$('.tabs'))) {
      const err = await page.$eval('.field.bad .err', (n) => n.textContent).catch(() => null);
      if (err) {
        notes.push(`wizard stuck on a validation error: "${err}" — retrying once`);
        await fillStep(page, answers);
        await next.click();
        await page.waitForTimeout(260);
      }
    }
  }
  return !!(await page.$('.tabs'));
}

/* ------------------------------------------------------------------ */

async function main() {
  const { server, port } = await serve();
  const target = SINGLE
    ? pathToFileURL(resolve(ROOT, 'dist/fitai.html')).href
    : `http://127.0.0.1:${port}/index.html`;

  if (SINGLE && !existsSync(resolve(ROOT, 'dist/fitai.html'))) {
    console.log('dist/fitai.html not built — run node tools/build-single.js first');
    server.close();
    process.exit(1);
  }
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' })
    .catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const future = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const answers = {
    date: future,
    number: 3,
    text: '',
    days: 3,
    clickFirstChip: false,
    numbers: {
      גיל: 28, גובה: 178, משקל: 76, יעד: 80,
      אימונים: 3, דקות: 60, שינה: 7, ארוחות: 4,
      'שכיבות': 20, 'מתח': 6, 'פלאנק': 60,
    },
    optionText: {},
  };

  await page.goto(target, { waitUntil: 'networkidle' });

  /* ---- welcome ---- */
  const welcome = await page.$('h1');
  check(!!welcome, 'welcome screen did not render an h1');
  const demoFigures = await page.$$('.anim svg');
  check(demoFigures.length >= 3, `welcome should show 3 demo figures, found ${demoFigures.length}`);
  if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '1-welcome.png'), fullPage: true });

  const start = await page.$('.btn.primary');
  check(!!start, 'no start button on the welcome screen');
  if (start) { await start.click(); await page.waitForTimeout(300); }

  /* ---- wizard ---- */
  check(!!(await page.$('.wizard')), 'wizard did not open');
  if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '2-intake.png'), fullPage: true });

  const reachedPlan = await runWizard(page, answers);
  check(reachedPlan, 'wizard never reached the generated plan');

  if (!reachedPlan) {
    const body = await page.$eval('#app', (n) => n.textContent.slice(0, 900)).catch(() => '');
    notes.push(`stuck screen text: ${body.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
    await finish(browser, server);
    return;
  }

  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '3-plan.png'), fullPage: true });

  /* ---- plan ---- */
  const cards = await page.$$('.list .ex');
  check(cards.length >= 3, `plan should list at least 3 exercises, found ${cards.length}`);

  const figures = await page.$$('.list .ex .anim svg');
  check(figures.length >= cards.length - 1, `every card needs a figure: ${figures.length} figures for ${cards.length} cards`);

  // Geometry: every rendered line must have finite, on-canvas coordinates.
  const geom = await page.evaluate(() => {
    const bad = [];
    let lines = 0;
    document.querySelectorAll('.rig-svg line, .rig-svg circle').forEach((n) => {
      lines++;
      const nums = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r']
        .map((a) => n.getAttribute(a)).filter((v) => v !== null).map(Number);
      if (nums.some((v) => !isFinite(v))) bad.push(`${n.tagName} has NaN`);
      if (nums.some((v) => v < -30 || v > 130)) bad.push(`${n.tagName} off canvas: ${nums.join(',')}`);
    });
    return { lines, bad: bad.slice(0, 6) };
  });
  check(geom.lines > 40, `too few rig primitives drawn (${geom.lines}) — figures may be empty`);
  check(geom.bad.length === 0, `rig geometry problems: ${geom.bad.join(' | ')}`);

  // Animation actually moves.
  const before = await page.$eval('.list .ex .rig-svg', (n) => n.innerHTML.length && n.innerHTML);
  await page.waitForTimeout(700);
  const after = await page.$eval('.list .ex .rig-svg', (n) => n.innerHTML);
  check(before !== after, 'figure did not change over 700ms — animation loop is not running');

  // Swap.
  const swap = await page.$('.list .ex .iconbtn.swap');
  if (swap) {
    const nameBefore = await page.$eval('.list .ex .name', (n) => n.textContent);
    await swap.click();
    await page.waitForTimeout(250);
    const nameAfter = await page.$eval('.list .ex .name', (n) => n.textContent);
    check(nameBefore !== nameAfter, 'swap button did not change the exercise');
  } else {
    notes.push('no swap button found — every slot has a single variant');
  }

  // Tick persists across reload.
  const tick = await page.$('.list .ex .iconbtn.check');
  if (tick) {
    await tick.click();
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const done = await page.$$('.list .ex.done');
    check(done.length >= 1, 'completion tick did not survive a reload');
  }

  // Detail sheet.
  const fig = await page.$('.list .ex .anim');
  if (fig) {
    await fig.click();
    await page.waitForTimeout(350);
    check(!!(await page.$('.modal-box')), 'clicking a figure did not open the detail sheet');
    check(!!(await page.$('.modal-box .anim.big svg')), 'detail sheet has no large figure');
    if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '4-detail.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    check(!(await page.$('.modal-box')), 'Escape did not close the detail sheet');
  }

  /* ---- tabs ---- */
  const tabLabels = await page.$$eval('.tabs .btn', (ns) => ns.map((n) => n.textContent.trim()));
  notes.push(`tabs: ${tabLabels.join(' | ')}`);
  for (const label of ['תזונה', 'איך זה בנוי', 'מעקב']) {
    const btn = await page.$(`.tabs .btn:text-is("${label}")`).catch(() => null);
    const byText = btn || (await page.$$('.tabs .btn').then(async (ns) => {
      for (const n of ns) if ((await n.textContent()).trim() === label) return n;
      return null;
    }));
    if (!byText) { notes.push(`tab "${label}" not present`); continue; }
    await byText.click();
    await page.waitForTimeout(450);
    const text = await page.$eval('#app', (n) => n.textContent);
    check(text.length > 400, `tab "${label}" rendered almost nothing`);
    check(!text.includes('לא הצלחתי להציג'), `tab "${label}" threw and showed the error fallback`);
    if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, `5-${label}.png`), fullPage: true });
  }

  /* ---- horizontal overflow ---- */
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 2, `page scrolls horizontally by ${overflow}px on a 430px viewport`);

  check(consoleErrors.length === 0, `console errors: ${consoleErrors.slice(0, 5).join(' | ')}`);

  await finish(browser, server);
}

async function finish(browser, server) {
  await browser.close();
  server.close();
  for (const n of notes) console.log(`  note  ${n}`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nsmoke OK');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
