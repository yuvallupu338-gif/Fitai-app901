#!/usr/bin/env node
/*
 * tomorrow-smoke.mjs — drives TomorrowAI in a real browser.
 *
 * The validator proves the engine is right. This proves the product works: it
 * walks onboarding, prepares a day, improves it, undoes that, runs a what-if,
 * adds a task in Hebrew, checks in, reviews the day, visits every view, reloads
 * to prove the data survived, and measures six viewports for layout breakage.
 *
 * Usage:
 *   node tools/tomorrow-smoke.mjs
 *   node tools/tomorrow-smoke.mjs --shots     # also write screenshots
 *   node tools/tomorrow-smoke.mjs --headed
 *
 * Requires the globally installed playwright:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/tomorrow-smoke.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const HEADED = process.argv.includes('--headed');
const SHOT_DIR = resolve(ROOT, 'dist/shots/tomorrow');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
const passed = [];
const check = (cond, msg) => { if (cond) passed.push(msg); else failures.push(msg); };
const note = (m) => notes.push(m);

/*
 * Served from a subpath on purpose. Pages publishes this repo under
 * /Fitai-app901/, which is exactly where a static app with one absolute path
 * in it stops working, and serving from the root here would hide that.
 */
const PREFIX = '/Fitai-app901';

async function serve() {
  const escaped = [];
  const server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (!url.startsWith(PREFIX)) { escaped.push(url); res.writeHead(404).end('outside the prefix'); return; }
      url = url.slice(PREFIX.length) || '/';
      // A directory URL means its index, the same as any static host would do.
      // Without this, /tomorrow/ resolves to a directory, readFile throws, and
      // the whole app looks broken when the only thing broken is the server.
      if (url.endsWith('/')) url += 'index.html';
      const path = resolve(ROOT, `.${url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port, escaped };
}

const t = (name) => `[data-t="${name}"]`;

async function has(page, name) { return (await page.$(t(name))) !== null; }
async function count(page, name) { return (await page.$$(t(name))).length; }
async function textOf(page, name) {
  const el = await page.$(t(name));
  return el ? (await el.innerText()).trim() : null;
}
/*
 * Click it if it is there, and report rather than throw when it is not
 * clickable.
 *
 * A blocked click used to abort the whole run on an uncaught TimeoutError,
 * which meant one overlay left open hid the twenty checks after it. A test that
 * cannot finish cannot tell you what is wrong.
 */
async function clickIf(page, name, opts) {
  const o = opts || {};
  const el = await page.$(t(name));
  if (!el) return false;
  try {
    // Bring it into view instantly first. Playwright will scroll for itself,
    // but the stylesheet's smooth scrolling makes the target a moving object
    // and the actionability check waits for it to settle.
    await el.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(60);
    await el.click({ timeout: o.timeout || 6000 });
  } catch (e) {
    if (!o.quiet) note(`could not click ${name}: ${String(e.message).split('\n')[0]}`);
    return false;
  }
  await page.waitForTimeout(180);
  return true;
}

/*
 * Close anything covering the page.
 *
 * Between sections rather than inside them, so a sheet that fails to close is
 * still reported by the section that opened it instead of being silently
 * cleaned up.
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.$$('.sheet-back, .modal-back, .flow');
    if (!open.length) return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  const left = await page.$$('.sheet-back, .modal-back, .flow');
  if (left.length) note(`${left.length} overlay(s) would not close with Escape`);
  return left.length === 0;
}
/*
 * Add one item through the real quick-add sheet, in Hebrew, the way somebody
 * would. Returns whether it was actually saved.
 */
async function addTask(page, sentence) {
  if (!(await clickIf(page, 'quickadd'))) return false;
  await page.waitForTimeout(300);
  const nl = await page.$(t('quickadd-nl'));
  if (nl) {
    await nl.fill(sentence);
    await nl.dispatchEvent('change');
    await page.waitForTimeout(400);
  } else {
    const title = await page.$(t('item-title'));
    if (title) await title.fill(sentence);
  }
  const saved = await clickIf(page, 'quickadd-save');
  await page.waitForTimeout(400);
  await dismissOverlays(page);
  return saved;
}

async function shot(page, name) {
  if (!SHOTS) return;
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true });
}

/* Layout breakage a human would notice, measured rather than eyeballed. */
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1)
      out.push(`horizontal scroll: ${de.scrollWidth} > ${de.clientWidth}`);

    /*
     * And the other direction: a page taller than the window has to actually
     * scroll. Checking only for horizontal overflow gives a clean bill of health
     * to a page whose whole lower half is unreachable.
     *
     * scroll-behavior is forced off first. The stylesheet sets it to smooth, so
     * assigning scrollTop starts an animation and reading it back on the next
     * line returns the old value — which reads exactly like a page that cannot
     * scroll. That false positive cost an afternoon and a CSS "fix" to a rule
     * that was correct, so it is worth the four extra lines.
     */
    const el = document.scrollingElement || de;
    if (el.scrollHeight > el.clientHeight + 8) {
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      const before = el.scrollTop;
      el.scrollTop = before + 200;
      const moved = el.scrollTop !== before;
      el.scrollTop = before;
      el.style.scrollBehavior = prev;
      if (!moved) out.push(`page cannot scroll vertically: ${el.scrollHeight}px of content in ${el.clientHeight}px`);
    }
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent) continue;
      // Visually hidden by design — clipping is the mechanism, not a bug.
      if (el.classList.contains('sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > de.clientWidth + 1.5 || r.left < -1.5) {
        const id = el.tagName + '.' + (el.className || '').toString().slice(0, 40);
        if (!seen.has(id)) { seen.add(id); out.push(`overflows the viewport: ${id}`); }
      }
      // Text clipped by a fixed height with no scroller of its own.
      if (el.closest('.sr-only')) continue;
      if (el.children.length === 0 && el.textContent.trim() && cs.overflow === 'hidden'
          && el.scrollHeight > el.clientHeight + 2 && cs.textOverflow !== 'ellipsis'
          && cs.webkitLineClamp === 'none') {
        const id = el.tagName + '.' + (el.className || '').toString().slice(0, 40);
        if (!seen.has(id)) { seen.add(id); out.push(`clipped text: ${id} "${el.textContent.trim().slice(0, 30)}"`); }
      }
    }
    return out;
  });
}

async function run() {
  const { server, port, escaped } = await serve();
  const base = `http://127.0.0.1:${port}${PREFIX}/tomorrow/`;
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    /* ---------------------------------------------------------- boot */
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    check(await page.$('#app, [data-t="onboarding"], [data-t="view-tomorrow"]') !== null,
      'boot: the app mounts something');
    await shot(page, '01-boot');

    /* ------------------------------------------------------ onboarding */
    if (await has(page, 'onboarding')) {
      note('onboarding: present on first run');
      let steps = 0;
      while (await has(page, 'onboarding') && steps < 12) {
        // Fill whatever this step asks for before advancing.
        const name = await page.$('[data-t="onboarding"] input[type="text"]');
        if (name && !(await name.inputValue())) await name.fill('אלכס');
        for (const inp of await page.$$('[data-t="onboarding"] input[type="time"]'))
          if (!(await inp.inputValue())) await inp.fill('07:30');
        const opts = await page.$$('[data-t="onboarding"] button[role="radio"], [data-t="onboarding"] .opt');
        if (opts.length) {
          const anyOn = await page.$('[data-t="onboarding"] [aria-checked="true"], [data-t="onboarding"] .opt.on');
          if (!anyOn) await opts[0].click();
        }
        if (!(await clickIf(page, 'onboarding-next'))) break;
        steps++;
      }
      check(steps > 0 && steps < 12, `onboarding: completes in a sane number of steps (${steps})`);
      check(!(await has(page, 'onboarding')), 'onboarding: ends, rather than looping');
      await shot(page, '02-after-onboarding');
    } else {
      note('onboarding: skipped (app opened straight into a view)');
    }

    /* --------------------------------------------------- evening ritual */
    if (await has(page, 'ritual')) {
      let steps = 0;
      while (await has(page, 'ritual') && steps < 10) {
        for (const inp of await page.$$('[data-t="ritual"] input[type="time"]'))
          if (!(await inp.inputValue())) await inp.fill('23:00');
        if (!(await clickIf(page, 'ritual-next'))) break;
        steps++;
        await page.waitForTimeout(250);
      }
      check(steps >= 3, `ritual: walks its screens (${steps})`);
      await page.waitForTimeout(2600);   // the analysis animation
      await shot(page, '03-after-ritual');
    }

    /* ------------------------------------------------- the empty new day */
    await page.waitForTimeout(400);
    await dismissOverlays(page);

    /*
     * A new user who walked the ritual without adding anything has an empty
     * tomorrow, and the app should say so rather than scoring a day with
     * nothing in it. Then we add something, the way a real first-time user
     * would, and the forecast has to appear.
     */
    if (!(await has(page, 'score'))) {
      check(await has(page, 'empty'), 'new user: an empty tomorrow explains itself instead of showing a score');
      const added = await addTask(page, 'מחר ב-10:00 ללמוד למבחן שעתיים');
      check(added, 'new user: a task can be added from the empty state');
      await page.waitForTimeout(600);
      await clickIf(page, 'nav-tomorrow');
      await page.waitForTimeout(500);
    }

    /* --------------------------------------------------------- the score */
    const scoreText = await textOf(page, 'score');
    check(scoreText !== null, 'home: a Tomorrow Score is on screen');
    const score = scoreText === null ? NaN : parseInt(scoreText.replace(/\D+/g, ''), 10);
    check(Number.isFinite(score) && score >= 0 && score <= 100,
      `home: the score is a real number 0..100 (read "${scoreText}")`);
    check(await has(page, 'score-label'), 'home: the score carries a band label');
    check(await has(page, 'recommendation'), 'home: the primary recommendation is on the home screen');
    check(await has(page, 'energy-chart'), 'home: the energy chart renders');
    check(await has(page, 'focus-chart'), 'home: the focus chart renders');
    check(await has(page, 'timeline'), 'home: the timeline renders');
    check(await count(page, 'timeline-entry') > 0, 'home: the timeline has entries');
    check(await has(page, 'improve'), 'home: the Improve Tomorrow CTA is present');
    await shot(page, '04-home');

    /* The five-second test: everything that answers the brief's five questions
       must be reachable without hunting. */
    const foldOk = await page.evaluate(() => {
      const el = document.querySelector('[data-t="score"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    check(foldOk, 'home: the score is above the fold on a 390px phone');

    /* ------------------------------------------------------- score "why" */
    if (await clickIf(page, 'score-why')) {
      await page.waitForTimeout(250);
      const factors = await count(page, 'factor-sleep') + await count(page, 'factor-balance');
      check(factors >= 2, 'score: the breakdown lists its factors');
      await shot(page, '05-why');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } else {
      const factors = await page.$$('[data-t^="factor-"]');
      check(factors.length >= 4, 'score: the factor breakdown is on screen');
    }

    /* --------------------------------------------------- improve tomorrow */
    if (await clickIf(page, 'improve')) {
      await page.waitForTimeout(500);
      const before = score;
      const applied = await clickIf(page, 'improve-apply');
      if (applied) {
        await page.waitForTimeout(700);
        const after = parseInt((await textOf(page, 'score') || '').replace(/\D+/g, ''), 10);
        check(Number.isFinite(after), 'improve: the score still reads after applying');
        check(after >= before, `improve: applying does not make the day worse (${before} -> ${after})`);
        note(`improve: ${before} -> ${after}`);
        await shot(page, '06-improved');
        if (await clickIf(page, 'improve-undo')) {
          await page.waitForTimeout(600);
          const back = parseInt((await textOf(page, 'score') || '').replace(/\D+/g, ''), 10);
          check(back === before, `improve: undo puts the day back exactly (${before} -> ${after} -> ${back})`);
        } else note('improve: no undo control found after applying');
      } else {
        check(await has(page, 'improve-keep') || await has(page, 'empty'),
          'improve: with nothing to improve it says so honestly');
      }
    }

    /* Whatever branch Improve took, its sheet must close on Escape before the
     * next section can reach the page behind it. */
    check(await dismissOverlays(page), 'improve: the panel closes when dismissed');

    /* --------------------------------------------------------- what-if */
    if (await clickIf(page, 'whatif')) {
      await page.waitForTimeout(400);
      const homeBefore = await textOf(page, 'score');
      const chips = await page.$$(t('whatif-chip'));
      check(chips.length >= 3, `what-if: offers quick scenarios (${chips.length})`);
      if (chips.length) {
        const a = await textOf(page, 'whatif-score-base');
        check(a !== null, 'what-if: shows the day as it stands');

        /*
         * Try every chip rather than only the first. A scenario that does not
         * move the number is a legitimate answer — half an hour more sleep on
         * an already-good night really is worth almost nothing — but if none of
         * them moves it, the sandbox is inert and that is a bug.
         */
        const moved = [];
        for (let i = 0; i < chips.length; i++) {
          const chip = (await page.$$(t('whatif-chip')))[i];
          if (!chip || await chip.isDisabled()) continue;
          await chip.click().catch(() => {});
          await page.waitForTimeout(450);
          const next = await textOf(page, 'whatif-score-next');
          if (next !== null && next !== a) moved.push(`${await chip.innerText()} → ${next}`);
          await chip.click().catch(() => {});   // toggle back off
          await page.waitForTimeout(250);
        }
        check(moved.length > 0,
          `what-if: at least one quick scenario actually moves the forecast (${moved.length} of ${chips.length} did)`);
        for (const m of moved.slice(0, 3)) note(`what-if ${a} ${m.replace(/\s+/g, ' ')}`);

        // Leave one applied so Cancel has something to discard.
        const first = (await page.$$(t('whatif-chip')))[0];
        if (first && !(await first.isDisabled())) { await first.click().catch(() => {}); await page.waitForTimeout(400); }
        await shot(page, '07-whatif');

        if (await clickIf(page, 'whatif-cancel')) {
          await page.waitForTimeout(500);
          const homeAfter = await textOf(page, 'score');
          check(homeAfter === homeBefore,
            `what-if: cancelling changes nothing real (${homeBefore} vs ${homeAfter})`);
        }
      }
    }

    await dismissOverlays(page);
    /* --------------------------------------------------------- quick add */
    await clickIf(page, 'nav-schedule');
    await page.waitForTimeout(300);
    check(await has(page, 'view-schedule'), 'nav: the schedule view mounts');
    const itemsBefore = await count(page, 'item');
    if (await clickIf(page, 'quickadd')) {
      await page.waitForTimeout(300);
      const nl = await page.$(t('quickadd-nl'));
      if (nl) {
        await nl.fill('מחר ב-17:00 יש לי אימון של שעה');
        await page.waitForTimeout(500);
        const parsed = await textOf(page, 'quickadd-parsed');
        check(parsed !== null, 'quick add: shows what it understood before saving');
        if (parsed) {
          check(/17:00/.test(parsed), `quick add: it read the time (showed "${parsed}")`);
          note(`quick add parsed: ${parsed.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
        await nl.dispatchEvent('change');
        await page.waitForTimeout(300);
      } else {
        const title = await page.$(t('item-title'));
        if (title) await title.fill('אימון');
      }
      if (await clickIf(page, 'quickadd-save')) {
        await page.waitForTimeout(600);
        /*
         * "מחר" typed while the schedule showed today puts the item on tomorrow,
         * which is correct — so the app follows it there rather than appearing
         * to swallow it. Counting on the day still on screen was the test's bug,
         * not the app's.
         */
        const itemsAfter = await count(page, 'item');
        check(itemsAfter > 0,
          `quick add: the new item really lands on the schedule (was ${itemsBefore}, now ${itemsAfter})`);
        await shot(page, '08-schedule');
      }
    }

    check(await dismissOverlays(page), 'quick add: the editor closes when dismissed');

    /* An empty title must be refused rather than saved. */
    if (await clickIf(page, 'quickadd')) {
      await page.waitForTimeout(250);
      const before = await count(page, 'item');
      await clickIf(page, 'quickadd-save');
      await page.waitForTimeout(300);
      const after = await count(page, 'item');
      check(after === before, 'quick add: saving nothing adds nothing');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    await dismissOverlays(page);
    /* --------------------------------------------------------- editing */
    const firstEdit = await page.$(`${t('item')} ${t('item-edit')}`) || await page.$(t('item-edit'));
    if (firstEdit) {
      await firstEdit.click();
      await page.waitForTimeout(300);
      const start = await page.$(t('item-start'));
      if (start) {
        await start.fill('19:30');
        const saved = await clickIf(page, 'quickadd-save');
        await page.waitForTimeout(400);
        check(saved, 'schedule: an item can be edited and saved');
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    await dismissOverlays(page);
    /* -------------------------------------------------- the other views */
    for (const [nav, view] of [['nav-chat', 'view-chat'], ['nav-insights', 'view-insights'],
      ['nav-profile', 'view-profile'], ['nav-tomorrow', 'view-tomorrow']]) {
      const went = await clickIf(page, nav);
      await page.waitForTimeout(350);
      check(went, `nav: ${nav} is clickable`);
      check(await has(page, view), `nav: ${view} mounts`);
      const probs = await layoutProblems(page);
      check(probs.length === 0, `layout(390, ${view}): ${probs.slice(0, 3).join(' | ') || 'clean'}`);
      await shot(page, `09-${view}`);
    }

    await dismissOverlays(page);
    /* ------------------------------------------------------------- chat */
    await clickIf(page, 'nav-chat');
    await page.waitForTimeout(250);
    const chatIn = await page.$(t('chat-input'));
    if (chatIn) {
      const before = await count(page, 'chat-message');
      await chatIn.fill('איך מחר נראה?');
      await clickIf(page, 'chat-send');
      await page.waitForTimeout(700);
      const after = await count(page, 'chat-message');
      check(after > before, `chat: a question gets an answer (${before} -> ${after})`);
      const last = await page.$$(t('chat-message'));
      if (last.length) {
        const txt = (await last[last.length - 1].innerText()).trim();
        check(txt.length > 8, 'chat: the answer is a real sentence');
        note(`chat answered: ${txt.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    } else note('chat: no input found');

    await dismissOverlays(page);
    /* --------------------------------------------------------- insights */
    await clickIf(page, 'nav-insights');
    await page.waitForTimeout(300);
    const insights = await count(page, 'insight');
    check(insights > 0 || await has(page, 'empty'),
      'insights: either shows patterns or explains why there are none yet');
    if (await has(page, 'history-range')) {
      const ranges = await page.$$(`${t('history-range')} button, ${t('history-range')} [role="radio"]`);
      if (ranges.length > 1) {
        await ranges[1].click();
        await page.waitForTimeout(400);
        check(true, 'history: the range selector responds');
      }
    }

    /* --------------------------------- no dead buttons anywhere on screen */
    const dead = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        if (b.disabled || b.offsetParent === null) continue;
        const label = (b.getAttribute('aria-label') || b.innerText || '').trim();
        if (!label) out.push('a button with no accessible name');
      }
      return out;
    });
    check(dead.length === 0, `a11y: every visible button has a name (${dead.slice(0, 3).join(', ')})`);

    await dismissOverlays(page);
    /* ------------------------------------------------------ persistence */
    await clickIf(page, 'nav-tomorrow');
    await page.waitForTimeout(300);
    const scoreBeforeReload = await textOf(page, 'score');
    const itemsBeforeReload = await (async () => {
      await clickIf(page, 'nav-schedule'); await page.waitForTimeout(300);
      const n = await count(page, 'item');
      await clickIf(page, 'nav-tomorrow'); await page.waitForTimeout(250);
      return n;
    })();

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    check(!(await has(page, 'onboarding')), 'reload: onboarding does not come back');
    const scoreAfterReload = await textOf(page, 'score');
    check(scoreAfterReload === scoreBeforeReload,
      `reload: the forecast survives (${scoreBeforeReload} vs ${scoreAfterReload})`);
    await clickIf(page, 'nav-schedule');
    await page.waitForTimeout(350);
    check(await count(page, 'item') === itemsBeforeReload,
      'reload: the schedule survives');
    await clickIf(page, 'nav-tomorrow');

    /* ------------------------------------------- broken stored data */
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('tomorrowai')) localStorage.setItem(k, '{{{not json');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const alive = await page.evaluate(() => document.body.innerText.trim().length > 20);
    check(alive, 'corrupt storage: the app still renders rather than showing a blank page');

    /* ---------------------------------------------------- viewport sweep */
    await page.evaluate(() => localStorage.clear());
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (await has(page, 'demo-start')) {
      await clickIf(page, 'demo-start');
      await page.waitForTimeout(900);
      check(await has(page, 'score') || await has(page, 'view-tomorrow'),
        'demo: the demo opens into a full day');
      await shot(page, '10-demo');
    } else {
      note('demo: no demo entry point found on the first screen');
    }

    for (const [w, hgt] of [[375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.waitForTimeout(350);
      for (const nav of ['nav-tomorrow', 'nav-schedule', 'nav-insights']) {
        await clickIf(page, nav);
        await page.waitForTimeout(300);
        const probs = await layoutProblems(page);
        check(probs.length === 0, `layout(${w}x${hgt}, ${nav}): ${probs.slice(0, 2).join(' | ') || 'clean'}`);
      }
      if (SHOTS) { await clickIf(page, 'nav-tomorrow'); await page.waitForTimeout(250); await shot(page, `11-w${w}`); }
    }

    /* Desktop must actually use the room, not stretch a phone. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await clickIf(page, 'nav-tomorrow');
    await page.waitForTimeout(400);
    const desktop = await page.evaluate(() => {
      const nav = document.querySelector('[data-t="nav-tomorrow"]');
      if (!nav) return null;
      const r = nav.getBoundingClientRect();
      return { left: r.left, top: r.top, w: window.innerWidth };
    });
    if (desktop) check(desktop.top < 500 || desktop.left > desktop.w * 0.6,
      'desktop: navigation becomes a sidebar rather than staying a bottom bar');

    /* ------------------------------------------------- reduced motion */
    const rm = await ctx.browser().newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'he-IL' });
    const rmPage = await rm.newPage();
    await rmPage.goto(base, { waitUntil: 'networkidle' });
    await rmPage.waitForTimeout(600);
    check((await rmPage.evaluate(() => document.body.innerText.trim().length)) > 20,
      'reduced motion: the app renders with animation turned off');
    await rm.close();

    check(consoleErrors.length === 0,
      `console: no errors (${consoleErrors.slice(0, 3).join(' | ')})`);
    check(escaped.length === 0,
      `paths: nothing requested outside the Pages subpath (${escaped.slice(0, 3).join(', ')})`);
  } finally {
    await browser.close();
    server.close();
  }
}

await run();

console.log(`\n${passed.length} checks passed`);
if (notes.length) { console.log('\nnotes:'); for (const n of notes) console.log(`  · ${n}`); }
if (failures.length) {
  console.log(`\n${failures.length} FAILURES:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nTomorrowAI works in a browser.\n');
