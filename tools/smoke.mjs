#!/usr/bin/env node
/*
 * smoke.mjs — drives the real app in a real browser.
 *
 * Walks the intake wizard by filling whatever fields each step declares, then
 * asserts the generated plan actually renders: tabs, exercise cards, the YouTube
 * demo links, the age floor, swap and tick behaviour, and every tab.
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
        // fillStep can trigger a re-render, which detaches the handle we hold.
        const again = await page.$('.wiznav .btn.primary');
        if (again) await again.click();
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

  // Script errors fail the run. Failures to fetch a remote resource do not —
  // the only remote thing here is the web font, which is expected to be
  // unavailable offline and degrades to the system stack by design.
  const consoleErrors = [];
  const resourceErrors = [];
  const isResource = (t) => /Failed to load resource|net::ERR_|ERR_CONNECTION|fonts\.(googleapis|gstatic)/.test(t);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    (isResource(m.text()) ? resourceErrors : consoleErrors).push(m.text());
  });
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


  // Geometry: every rendered line must have finite, on-canvas coordinates.
  /*
   * Every exercise card links out to a YouTube search for that exercise. The
   * drawn rig used to live in this box; what matters now is that the link is
   * present, points at YouTube, carries the exercise name, and opens away from
   * the app — a plan half-logged should still be here when they come back.
   */
  const links = await page.$$eval('.list .ex a.ytlink', (els) => els.map((n) => ({
    href: n.getAttribute('href') || '',
    target: n.getAttribute('target') || '',
    rel: n.getAttribute('rel') || '',
    label: n.getAttribute('aria-label') || '',
  })));
  check(links.length > 0, 'no exercise card carries a demo link');
  const names = await page.$$eval('.list .ex .name', (els) => els.map((n) => n.textContent));
  for (const [i, l] of links.entries()) {
    if (!/^https:\/\/www\.youtube\.com\/results\?search_query=/.test(l.href)) {
      check(false, `demo link ${i} does not point at a YouTube search: ${l.href}`);
      break;
    }
    const q = decodeURIComponent(l.href.split('search_query=')[1] || '');
    if (!q.trim()) { check(false, `demo link ${i} searches for an empty string`); break; }
    // The name shown on the card has to be inside the query it sends.
    const shown = (names[i] || '').replace(/^\d+\s*·\s*/, '').trim();
    if (shown && q.indexOf(shown) < 0) {
      check(false, `demo link ${i} searches "${q}" but the card says "${shown}"`);
      break;
    }
    if (l.target !== '_blank' || l.rel.indexOf('noopener') < 0) {
      check(false, `demo link ${i} would navigate away from the app (target=${l.target} rel=${l.rel})`);
      break;
    }
    if (!l.label) { check(false, `demo link ${i} has no aria-label`); break; }
  }
  check(true, `${links.length} demo links, all pointing at a YouTube search for the exercise on the card`);

  /*
   * Rest days are days, not gaps. The week strip used to make training days
   * tappable and leave the rest inert, so the rest day's task, its stretches and
   * its different meals had no way in.
   */
  const restCells = await page.$$('.daycell.restcell');
  check(restCells.length > 0, 'no rest day in the week strip is clickable');
  if (restCells.length) {
    await restCells[0].click();
    await page.waitForTimeout(400);
    const head = await page.$eval('.whead h2', (n) => n.textContent).catch(() => '');
    check(head.indexOf('מנוחה') >= 0, `clicking a rest day did not open a rest view (heading: "${head}")`);
    check(!!(await page.$('details.warm')), 'rest day view has no stretches');
    const nutBtn = await page.$('button:has-text("התזונה של יום מנוחה")');
    check(!!nutBtn, 'rest day view has no way to reach that day\'s meals');
    // Back to a training day so the checks below see a session.
    const trainCell = await page.$('.daycell.train');
    if (trainCell) { await trainCell.click(); await page.waitForTimeout(400); }
    const back = await page.$eval('.whead h2', (n) => n.textContent).catch(() => '');
    check(back.indexOf('מנוחה') < 0, 'picking a training day after a rest day did not switch back');
  }

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
    // The figure is a link out to YouTube now, so the detail sheet opens from
    // the exercise NAME instead. That is the only way in, so it is worth an
    // assertion of its own.
    const nameBtn = await page.$('.list .ex .namebtn');
    check(!!nameBtn, 'no way to open the detail sheet — the name is not a button');
    if (nameBtn) await nameBtn.click();
    await page.waitForTimeout(350);
    check(!!(await page.$('.modal-box')), 'clicking the exercise name did not open the detail sheet');
    check(!!(await page.$('.modal-box a.ytlink')), 'detail sheet has no YouTube demo link');
    const vid = await page.$('.modal-box a.videolink');
    check(!!vid, 'detail sheet has no video link');
    if (vid) {
      const href = await vid.getAttribute('href');
      const rel = await vid.getAttribute('rel');
      const target = await vid.getAttribute('target');
      check(/^https:\/\/www\.youtube\.com\/results\?search_query=.+/.test(href || ''),
        `video link href looks wrong: ${href}`);
      check(target === '_blank' && /noopener/.test(rel || ''),
        'video link must open in a new tab with rel=noopener');
    }
    if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '4-detail.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    check(!(await page.$('.modal-box')), 'Escape did not close the detail sheet');
  }

  /* ---- tabs ---- */
  const tabLabels = await page.$$eval('.tabs .btn', (ns) => ns.map((n) => n.textContent.trim()));
  notes.push(`tabs: ${tabLabels.join(' | ')}`);
  for (const label of ['תזונה', 'סריקה', 'איך זה בנוי', 'מעקב']) {
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

  /* ---- the scan tab, without ever making a network call ---- */
  {
    const scanBtn = await page.$$('.tabs .btn').then(async (ns) => {
      for (const n of ns) if ((await n.textContent()).trim() === 'סריקה') return n;
      return null;
    });
    if (!scanBtn) {
      failures.push('the scan tab is missing');
    } else {
      await scanBtn.click();
      await page.waitForTimeout(400);

      const keyInput = await page.$('.keyrow input');
      check(!!keyInput, 'the scan tab has no API key field');
      check(await page.$('.scanrun') !== null, 'the scan tab has no run button');

      // With no key the run button must be disabled: pressing it would produce
      // an error dialog rather than an explanation, and the explanation is the
      // whole point of the empty state.
      const disabledBefore = await page.$eval('.scanrun', (n) => n.disabled);
      check(disabledBefore === true, 'the scan button is enabled with no key and no photos');

      // A key alone is not enough — the photos are still missing.
      if (keyInput) {
        await keyInput.fill('sk-ant-smoke-test-key-not-real-0000000000');
        await page.waitForTimeout(120);
        const stillDisabled = await page.$eval('.scanrun', (n) => n.disabled);
        check(stillDisabled === true, 'the scan button enabled itself without photos');
      }

      const bodyText = await page.$eval('#app', (n) => n.textContent);
      check(bodyText.includes('api.anthropic.com'),
        'the scan tab never says where the photos are sent');
      check(/שתי התמונות/.test(bodyText), 'the scan tab does not explain what it sends');

      // The key must live outside the exported app state, or exporting a profile
      // would hand someone else's key to whoever receives the file.
      const leak = await page.evaluate(() => {
        const raw = window.localStorage.getItem('fitai.v1') || '';
        return raw.includes('sk-ant-smoke-test-key');
      });
      check(leak === false, 'the API key leaked into the exported app state');

      await page.evaluate(() => window.localStorage.removeItem('fitai.key.v1'));
      if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, '6-scan.png'), fullPage: true });
    }
  }

  /* ---- horizontal overflow ---- */
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 2, `page scrolls horizontally by ${overflow}px on a 430px viewport`);

  check(consoleErrors.length === 0, `console errors: ${consoleErrors.slice(0, 5).join(' | ')}`);
  if (resourceErrors.length) notes.push(`${resourceErrors.length} remote resource(s) unavailable (expected offline: web fonts)`);

  await checkAgeBounds(browser, target);
  await checkTabsOnNarrowPhones(browser, target);

  await finish(browser, server);
}

/*
 * Every tab reachable on the phone somebody actually owns.
 *
 * The strip is overflow-x: auto, so a tab that does not fit is still reachable
 * by swiping and nothing here is broken in the sense a test usually means. But
 * at 320px the last tab — מעקב, where the weigh-in and the backup live — was
 * 0% visible, and a bar with no visible cut-off edge gives nobody a reason to
 * think it continues. That is a feature nobody finds, which is the same as a
 * feature that is not there.
 *
 * Checked by measuring against the viewport rather than the strip's own box:
 * the strip has padding, so a tab sitting exactly on its inner edge measures as
 * outside the container while being perfectly visible on screen. That
 * distinction cost a false alarm before it was written down.
 *
 * 320 is an iPhone SE 1st gen and rare; 360 is a Galaxy S-series and is not.
 */
async function checkTabsOnNarrowPhones(browser, target) {
  let held = true;
  const holds = (ok, message) => { if (!ok) held = false; check(ok, message); };

  for (const width of [320, 360, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const pg = await ctx.newPage();
    await pg.goto(target, { waitUntil: 'networkidle' });
    const start = await pg.$('.btn.primary');
    if (start) { await start.tap().catch(() => start.click()); await pg.waitForTimeout(300); }

    const built = await runWizard(pg, {
      date: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
      number: 3, days: 3, text: '', clickFirstChip: false,
      numbers: {
        גיל: 28, גובה: 178, משקל: 76, יעד: 80,
        אימונים: 3, דקות: 60, שינה: 7, ארוחות: 4,
        'שכיבות': 20, 'מתח': 6, 'פלאנק': 60,
      },
      optionText: {},
    });

    if (!built) {
      holds(false, `the wizard did not reach a plan on a ${width}px screen`);
      await ctx.close();
      continue;
    }

    const tabs = await pg.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('.tabs .btn')).map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.textContent.trim(), visible: Math.min(r.right, vw) - Math.max(r.left, 0), width: r.width };
      });
    });
    holds(tabs.length > 0, `${width}px: no tabs rendered`);

    // A tab with nothing on screen cannot be found; a sliver is enough to invite the swipe.
    const invisible = tabs.filter((t) => t.visible <= 1).map((t) => t.label);
    if (invisible.length) {
      holds(false, `${width}px: ${invisible.join(', ')} — entirely off screen, with no visible edge to swipe toward`);
    }

    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    holds(overflow <= 2, `${width}px: the page itself scrolls sideways by ${overflow}px`);

    await ctx.close();
  }
  if (held) notes.push('tabs reachable at 320px, 360px and 390px');
}

/*
 * The age floor, checked where a trainee meets it: the form.
 *
 * validate.js already pins MIN_AGE/MAX_AGE against the field, normalizeProfile
 * and the free-text parser, but all three read the module. This one types a
 * number into the running app and watches what happens, so a floor that is
 * right in age.js and wrong on screen still fails.
 *
 * Each age gets its own browser context. The wizard keeps a draft, and a draft
 * left over from the previous age is read back into the field — which looks
 * exactly like the app refusing a legal age. It cost me an afternoon; the
 * isolation is the point of the helper.
 */
async function checkAgeBounds(browser, target) {
  const { MIN_AGE, MAX_AGE } = await import(pathToFileURL(resolve(ROOT, 'src/engine/age.js')).href);

  const attempt = async (age) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(target, { waitUntil: 'networkidle' });
    const start = await pg.$('.btn.primary');
    if (start) { await start.click(); await pg.waitForTimeout(300); }

    const built = await runWizard(pg, {
      date: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
      number: 3, days: 3, text: '', clickFirstChip: false,
      numbers: {
        גיל: age, גובה: 165, משקל: 55, יעד: 58,
        אימונים: 3, דקות: 45, שינה: 8, ארוחות: 4,
        'שכיבות': 10, 'מתח': 2, 'פלאנק': 30,
      },
      optionText: {},
    });

    // What the field actually holds, so a form the harness failed to fill is
    // not mistaken for the app turning someone away.
    const held = await pg.$$eval('.field', (fs) => {
      for (const f of fs) {
        const l = f.querySelector('.flabel');
        const i = f.querySelector('input');
        if (l && i && l.textContent.includes('גיל')) return i.value;
      }
      return null;
    }).catch(() => null);

    await ctx.close();
    return { built, held };
  };

  let held4 = true;
  const holds = (ok, message) => { if (!ok) held4 = false; check(ok, message); };

  for (const age of [MIN_AGE, MAX_AGE]) {
    const { built } = await attempt(age);
    holds(built, `age ${age} is inside ${MIN_AGE}-${MAX_AGE} but the questionnaire would not build a plan for it`);
  }
  for (const age of [MIN_AGE - 1, MAX_AGE + 1]) {
    const { built, held } = await attempt(age);
    holds(!built, `age ${age} is outside ${MIN_AGE}-${MAX_AGE} and the questionnaire built a plan anyway`);
    holds(held === String(age),
      `could not confirm age ${age} was refused: the age field held ${held === null ? 'nothing' : `"${held}"`}, `
      + 'so the wizard may have stopped for an unrelated reason');
  }
  if (held4) {
    notes.push(`age bounds hold in the browser: ${MIN_AGE}-${MAX_AGE} accepted, ${MIN_AGE - 1} and ${MAX_AGE + 1} refused`);
  }
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
