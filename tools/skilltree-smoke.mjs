#!/usr/bin/env node
/*
 * skilltree-smoke.mjs — drives SkillTree in a real browser.
 *
 * The logic tests prove the rules are right. This proves the app is wired to
 * them: that clicking through onboarding produces a profile, that answering a
 * quiz actually awards the XP the domain calculated, that the number on the
 * dashboard survives a reload, and that the tree is usable at 375px.
 *
 * It walks the flow the brief calls out in §74 end to end, then checks the
 * things that only break in a browser — console errors, horizontal overflow,
 * unreachable controls.
 *
 * Usage:
 *   node tools/skilltree-smoke.mjs           # serve the repo, test index.html
 *   node tools/skilltree-smoke.mjs --single  # test dist/skilltree.html over file://
 *   node tools/skilltree-smoke.mjs --shots   # also write screenshots
 *
 * Requires the globally installed playwright, same as tools/smoke.mjs:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/skilltree-smoke.mjs
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
      const path = resolve(ROOT, `.${url === '/' ? '/skilltree/index.html' : url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { server, port: server.address().port };
}

/* Deterministic reset between phases: clear storage, then install whatever
 * state the phase needs through the app's own API rather than by clicking. */
async function reset(page) {
  await page.evaluate(() => window.localStorage.clear());
}

/*
 * Click a tree node at real coordinates, choosing one that is actually within
 * the canvas viewport.
 *
 * The tree is a pannable, zoomable surface clipped by `overflow: hidden`, so
 * "the first node in the DOM" is frequently scrolled out of view or sitting
 * behind the sidebar — where a real user could not click it either. Picking a
 * node that is genuinely on screen and clicking its centre is what a person
 * does, and it keeps the test honest about hit-testing rather than bypassing
 * it with a synthetic dispatch.
 */
async function clickNode(page, selector = '.node') {
  await page.waitForTimeout(400); /* let any pending fit() settle */

  const target = await page.evaluate((sel) => {
    const shell = document.querySelector('.tree-shell');
    if (!shell) return null;
    const box = shell.getBoundingClientRect();

    for (const node of document.querySelectorAll(sel)) {
      const r = node.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx > box.left + 12 && cx < box.right - 12 && cy > box.top + 12 && cy < box.bottom - 12) {
        return { x: cx, y: cy, skill: node.dataset.skill, state: node.dataset.state };
      }
    }
    return null;
  }, selector);

  if (!target) return null;
  await page.mouse.click(target.x, target.y);
  return target;
}

async function shot(page, name) {
  if (!SHOTS) return;
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `skilltree-${name}.png`), fullPage: false });
}

async function main() {
  const { server, port } = SINGLE ? { server: null, port: 0 } : await serve();
  const base = SINGLE
    ? pathToFileURL(resolve(ROOT, 'dist/skilltree.html')).href
    : `http://127.0.0.1:${port}/skilltree/index.html`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  /* ============================================================== *
   * 1. Onboarding, clicked through as a person would
   * ============================================================== */
  await page.goto(base);
  await reset(page);
  await page.goto(`${base}#/onboarding`);
  await page.waitForSelector('.onboard-card', { timeout: 10000 });

  check(await page.locator('h1').first().isVisible(), 'onboarding: no heading');
  await shot(page, 'onboarding');

  await page.getByRole('button', { name: 'Set up' }).click();
  await page.locator('input[aria-label="Your name"]').fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();

  /* Area — take the first option, then continue. */
  await page.locator('.pick').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  /* Level */
  await page.locator('.pick').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  /* Time */
  await page.locator('.pick').nth(1).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  /* Goal */
  await page.locator('.pick').first().click();
  await page.getByRole('button', { name: 'Build my tree' }).click();

  await page.waitForSelector('.card', { timeout: 10000 });
  check(page.url().includes('#/dashboard'), `onboarding did not land on the dashboard (${page.url()})`);
  check((await page.locator('body').innerText()).includes('Sam'), 'dashboard does not greet the name given in onboarding');

  const afterOnboarding = await page.evaluate(() => ({
    onboarded: window.SkillTree.store.get().onboarded,
    goal: window.SkillTree.store.get().goal?.targetSkillId || null,
  }));
  check(afterOnboarding.onboarded === true, 'onboarding did not mark the profile onboarded');
  check(!!afterOnboarding.goal, 'onboarding did not record a goal');
  await shot(page, 'dashboard-new');

  /* ============================================================== *
   * 2. The tree renders, pans, zooms, and opens a skill
   * ============================================================== */
  await page.goto(`${base}#/tree`);
  await page.waitForSelector('.node', { timeout: 10000 });

  const nodeCount = await page.locator('.node').count();
  check(nodeCount >= 20, `tree rendered only ${nodeCount} nodes`);
  check(await page.locator('.tree-edge').count() > 10, 'tree drew no dependency edges');
  check(await page.locator('.node[data-state="locked"]').count() > 0, 'tree shows no locked nodes');
  check(await page.locator('.node[data-state="available"]').count() > 0, 'tree shows no available nodes');

  /* Zoom via the control, and confirm the transform actually changed. */
  const before = await page.locator('.tree-canvas').getAttribute('style');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(120);
  const after = await page.locator('.tree-canvas').getAttribute('style');
  check(before !== after, 'zoom control did not change the canvas transform');

  /* Pan by dragging the background. */
  /* Drag empty canvas — avoiding the zoom controls bottom-right and the legend
   * bottom-left, which sit above the viewport and correctly do not start a
   * drag. */
  const shell = await page.locator('.tree-shell').boundingBox();
  await page.mouse.move(shell.x + shell.width / 2, shell.y + 24);
  await page.mouse.down();
  await page.mouse.move(shell.x + shell.width / 2 - 140, shell.y + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  check(await page.locator('.tree-canvas').getAttribute('style') !== after, 'dragging did not pan the canvas');
  await shot(page, 'tree');

  /* Restore the framing before selecting, so the node under test is on screen. */
  await page.getByRole('button', { name: 'Fit to view' }).click();

  /* A locked node must explain itself rather than doing nothing. */
  const lockedNode = await clickNode(page, '.node[data-state="locked"]');
  check(!!lockedNode, 'no locked node reachable in the canvas viewport');
  await page.waitForSelector('.sheet', { timeout: 5000 });
  const lockedText = await page.locator('.sheet').innerText();
  check(/Requirements to unlock/i.test(lockedText), 'locked skill panel does not list requirements');
  check(/Not yet/i.test(lockedText), 'locked skill panel does not mark unmet requirements in text');
  check(await page.locator('.sheet').getByRole('button', { name: 'Locked' }).isDisabled(),
    'locked skill offers an enabled start button');
  await shot(page, 'skill-locked');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* ============================================================== *
   * 3. The core flow: do an activity, get XP, see it persist
   * ============================================================== */
  const xpBefore = await page.evaluate(() => window.SkillTree.session.overview().xp);

  await page.goto(`${base}#/activity/internet_basics.quiz`);
  await page.waitForSelector('.pick', { timeout: 10000 });

  /* Answer every question correctly, using the data rather than guessing —
   * the point is to test the pipeline, not to test whether we can pass. */
  /* Read the real answers rather than guessing. A guess would pass by accident
   * whenever the content happened to put the answer first — which is precisely
   * the bug that hid here before. */
  const answers = await page.evaluate(() => window.SkillTree.catalog
    .findActivity('internet_basics.quiz').activity.questions.map((q) => q.answer));
  check(Array.isArray(answers) && answers.length > 0 && answers.every(Number.isInteger),
    'could not read the quiz answer key — the rest of this section would be guessing');
  check(new Set(answers).size > 1 || answers.length < 3,
    `every answer in one quiz is at index ${answers[0]} — options are not being shuffled`);

  const cards = page.locator('.card');
  const cardCount = await cards.count();
  let answered = 0;
  for (let i = 0; i < cardCount; i += 1) {
    const options = cards.nth(i).locator('.pick');
    const n = await options.count();
    if (!n) continue;
    await options.nth(answers[answered]).click();
    answered += 1;
  }
  check(answered === answers.length, `answered ${answered} of ${answers.length} questions`);

  await page.getByRole('button', { name: 'Submit answers' }).click();
  await page.waitForSelector('.card.feature', { timeout: 10000 });

  const resultText = await page.locator('[data-result]').innerText();
  check(/%/.test(resultText), 'no score shown on the result panel');
  check(/Quiz passed/i.test(resultText), `expected a pass with correct answers, got: ${resultText.slice(0, 120)}`);
  check(/100%/.test(resultText), `expected 100% with the answer key, got: ${resultText.slice(0, 120)}`);

  const xpAfter = await page.evaluate(() => window.SkillTree.session.overview().xp);
  check(xpAfter > xpBefore, `XP did not increase after a passed quiz (${xpBefore} -> ${xpAfter})`);
  notes.push(`quiz awarded ${xpAfter - xpBefore} XP`);

  /* The ledger, not just a counter. */
  const ledger = await page.evaluate(() => window.SkillTree.store.get().xpEvents.length);
  check(ledger > 0, 'no XP events recorded in the ledger');
  await shot(page, 'activity-result');

  /* Persistence across a full reload — §90's "המידע נשמר אחרי refresh". */
  await page.goto(`${base}#/dashboard`);
  await page.reload();
  await page.waitForSelector('.card', { timeout: 10000 });
  const xpReloaded = await page.evaluate(() => window.SkillTree.session.overview().xp);
  check(xpReloaded === xpAfter, `XP did not survive a reload (${xpAfter} -> ${xpReloaded})`);

  /* ============================================================== *
   * 4. A locked activity refuses to run
   * ============================================================== */
  await page.goto(`${base}#/activity/react_state.challenge`);
  await page.waitForSelector('.empty', { timeout: 8000 });
  check(/not open yet/i.test(await page.locator('body').innerText()),
    'an activity behind a shut gate did not refuse to open');
  check(await page.locator('.textarea').count() === 0,
    'a locked activity still rendered its editor');

  /* ============================================================== *
   * 5. A code challenge really executes
   * ============================================================== */
  /* Switch to the populated demo profile, where js_basics is genuinely
   * unlocked — rather than forcing the gate open, which would test a state the
   * app cannot actually reach. */
  await page.goto(`${base}#/demo`);
  await page.waitForSelector('.card', { timeout: 10000 });

  await page.goto(`${base}#/activity/js_basics.challenge`);
  await page.waitForSelector('.textarea', { timeout: 10000 });

  /* A deliberately wrong solution first: the grader must reject it. */
  await page.locator('.textarea').fill('function fizzBuzz(n) { return "Fizz" }');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await page.waitForSelector('.testrow', { timeout: 10000 });
  check(await page.locator('.testrow.fail').count() > 0, 'a wrong solution passed the code grader');
  check(/Not yet/i.test(await page.locator('[data-result]').innerText()), 'a failing submission was not reported as such');
  check(await page.locator('[data-result]').count() === 1, 'more than one result panel after one run');

  /* Then the right one. Result panels must replace, not stack. */
  await page.locator('.textarea').fill(
    'function fizzBuzz(n) { let s = ""; if (n % 3 === 0) s += "Fizz"; if (n % 5 === 0) s += "Buzz"; return s || String(n); }',
  );
  await page.getByRole('button', { name: 'Run again' }).click();
  await page.waitForSelector('.testrow.pass', { timeout: 10000 });
  check(await page.locator('[data-result]').count() === 1, 'result panels stacked instead of replacing');
  check(await page.locator('.testrow.fail').count() === 0, 'the reference solution failed a test in the browser');

  const codeResult = await page.locator('[data-result]').innerText();
  check(/Challenge complete/i.test(codeResult), `a passing code submission was not reported as complete: ${codeResult.slice(0, 100)}`);
  check(/\+\d+ XP/.test(codeResult), 'a first-time code pass awarded no XP');
  await shot(page, 'code-challenge');

  /* ============================================================== *
   * 6. Unlocks and level-ups actually fire
   * ============================================================== */
  await page.goto(`${base}#/demo`);
  await page.waitForSelector('.card', { timeout: 10000 });

  const demo = await page.evaluate(() => {
    const o = window.SkillTree.session.overview();
    const p = window.SkillTree.store.get();
    return {
      level: o.level,
      xp: o.xp,
      skills: Object.keys(p.skills).length,
      mastered: o.skillsMastered,
      achievements: o.achievements,
      streak: o.streak.longest,
    };
  });
  check(demo.level >= 5, `demo profile is only level ${demo.level}`);
  check(demo.skills >= 25, `demo profile has only ${demo.skills} skills`);
  check(demo.mastered >= 3, `demo profile has only ${demo.mastered} mastered skills`);
  check(demo.achievements >= 5, `demo profile has only ${demo.achievements} achievements`);
  check(demo.streak >= 7, `demo profile's longest streak is only ${demo.streak}`);
  notes.push(`demo: level ${demo.level}, ${demo.xp} XP, ${demo.skills} skills, ${demo.mastered} mastered, ${demo.streak}d streak`);
  await shot(page, 'dashboard-demo');

  /* The tree on a populated profile must show every state. */
  await page.goto(`${base}#/tree/web`);
  await page.waitForSelector('.node', { timeout: 10000 });
  for (const state of ['locked', 'available', 'in_progress', 'completed', 'mastered']) {
    check(await page.locator(`.node[data-state="${state}"]`).count() > 0,
      `populated tree shows no "${state}" nodes`);
  }
  await shot(page, 'tree-demo');

  /* Hovering a node lights its dependency chain. */
  await page.waitForTimeout(400);
  const hoverTarget = await page.evaluate(() => {
    const shell = document.querySelector('.tree-shell').getBoundingClientRect();
    for (const n of document.querySelectorAll('.node[data-state="mastered"], .node[data-state="completed"]')) {
      const r = n.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx > shell.left + 12 && cx < shell.right - 12 && cy > shell.top + 12 && cy < shell.bottom - 12) {
        return { x: cx, y: cy };
      }
    }
    return null;
  });
  check(!!hoverTarget, 'no completed node reachable to hover');
  await page.mouse.move(hoverTarget.x, hoverTarget.y);
  await page.waitForTimeout(200);
  check(await page.locator('.tree-canvas.focusing').count() === 1, 'hovering a node did not highlight its chain');
  check(await page.locator('.node.lit').count() > 1, 'highlight lit only the hovered node');

  /* ============================================================== *
   * 7. Every screen renders on a populated profile
   * ============================================================== */
  for (const [route, marker] of [
    ['dashboard', '.card'],
    ['tree', '.node'],
    ['explore', '.card'],
    ['progress', '.chart'],
    ['achievements', '.card'],
    ['profile', '.stat'],
    ['settings', '.card'],
  ]) {
    await page.goto(`${base}#/${route}`);
    try {
      await page.waitForSelector(marker, { timeout: 8000 });
    } catch {
      failures.push(`screen "${route}" did not render ${marker}`);
    }
    const text = await page.locator('body').innerText();
    check(!/undefined|NaN|\[object Object\]/.test(text), `screen "${route}" rendered a raw undefined/NaN/[object Object]`);
    await shot(page, route);
  }

  /* The charts carry real numbers, and a table alternative. */
  await page.goto(`${base}#/progress`);
  await page.waitForSelector('.chart', { timeout: 8000 });
  check(await page.locator('.barfill').count() > 10, 'the XP chart drew no bars');
  check(await page.locator('.radar-shape').count() > 0, 'the radar chart drew no shape');
  await page.getByRole('button', { name: 'Show numbers' }).first().click();
  check(await page.locator('table').first().isVisible(), 'the chart table alternative did not open');

  /* An unknown route must not blank the page. */
  await page.goto(`${base}#/nonsense-route`);
  await page.waitForSelector('.empty', { timeout: 8000 });
  check(/Nothing here/i.test(await page.locator('body').innerText()), 'unknown route did not show a not-found state');

  /* ============================================================== *
   * 8. Themes
   * ============================================================== */
  await page.goto(`${base}#/settings`);
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.getByRole('button', { name: 'Light mode' }).click();
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light',
    'light theme did not apply');
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await shot(page, 'settings-light');

  await page.reload();
  await page.waitForSelector('.card', { timeout: 8000 });
  check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light',
    'light theme did not survive a reload');

  await page.getByRole('button', { name: 'Dark mode' }).click();
  await page.waitForTimeout(200);
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(lightBg !== darkBg, 'light and dark themes render the same background');

  /* ============================================================== *
   * 9. Responsive — the sizes §89 names
   * ============================================================== */
  for (const [width, height, label] of [[375, 812, 'mobile'], [768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
    await page.setViewportSize({ width, height });

    for (const route of ['dashboard', 'tree', 'progress', 'profile']) {
      await page.goto(`${base}#/${route}`);
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }));
      /* A couple of pixels of slack for sub-pixel rounding; anything more is a
       * real sideways scroll. */
      check(overflow.doc <= overflow.win + 2,
        `${label} ${width}px: "${route}" overflows horizontally (${overflow.doc} > ${overflow.win})`);
    }

    if (width <= 860) {
      await page.goto(`${base}#/dashboard`);
      await page.waitForTimeout(300);
      check(await page.locator('.tabbar').isVisible(), `${label}: bottom tab bar is not visible`);
      check(!(await page.locator('.nav').isVisible()), `${label}: desktop sidebar is still visible`);

      /* Touch targets. */
      const small = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.tab')];
        return tabs.filter((t) => t.getBoundingClientRect().height < 44).length;
      });
      check(small === 0, `${label}: ${small} tab targets are under 44px tall`);

      /*
       * The bottom of a page must be reachable.
       *
       * Measured after scrolling to the end — a long page having content below
       * the fold is just scrolling. What matters is whether the final card is
       * still stuck behind the bar once you have scrolled as far as you can,
       * which is what too little bottom padding causes.
       */
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const behindBar = await page.evaluate(() => {
        const bar = document.querySelector('.tabbar').getBoundingClientRect();
        const last = document.querySelector('.main .wrap')?.lastElementChild;
        if (!last) return 0;
        return Math.max(0, Math.round(last.getBoundingClientRect().bottom - bar.top));
      });
      check(behindBar <= 0, `${label}: at the end of the scroll the last card is still ${behindBar}px behind the tab bar`);
      await page.evaluate(() => window.scrollTo(0, 0));

      /*
       * Stat tiles must stay multi-column. Stacking nine of them one per row
       * turned the Progress screen into a thousand pixels of scrolling; this
       * asserts the tiles share rows rather than each owning one.
       */
      await page.goto(`${base}#/progress`);
      await page.waitForSelector('.grid.stats', { timeout: 8000 });
      const statRows = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('.grid.stats > *')];
        return { tiles: tiles.length, rows: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size };
      });
      check(statRows.rows < statRows.tiles,
        `${label}: ${statRows.tiles} stat tiles occupy ${statRows.rows} rows — they are stacking one per row`);

      /* The tree is the product on this screen: its canvas must be visible
       * above the tab bar, with its controls reachable, and the tree switcher
       * must not wrap into several rows and push it down. */
      await page.goto(`${base}#/tree`);
      await page.waitForSelector('.node', { timeout: 8000 });
      await page.waitForTimeout(600);
      const treeFit = await page.evaluate(() => {
        const shell = document.querySelector('.tree-shell').getBoundingClientRect();
        const bar = document.querySelector('.tabbar').getBoundingClientRect();
        const controls = document.querySelector('.tree-controls').getBoundingClientRect();
        const chips = [...document.querySelectorAll('.tree-switch .chip')];
        return {
          shellBottom: Math.round(shell.bottom),
          shellHeight: Math.round(shell.height),
          barTop: Math.round(bar.top),
          controlsBottom: Math.round(controls.bottom),
          chipRows: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size,
        };
      });
      check(treeFit.shellBottom <= treeFit.barTop,
        `${label}: the tree canvas runs ${treeFit.shellBottom - treeFit.barTop}px behind the tab bar`);
      check(treeFit.controlsBottom <= treeFit.barTop,
        `${label}: the zoom controls are hidden behind the tab bar`);
      check(treeFit.chipRows === 1,
        `${label}: the tree switcher wraps onto ${treeFit.chipRows} rows`);
      check(treeFit.shellHeight >= 300,
        `${label}: the tree canvas is only ${treeFit.shellHeight}px tall`);
    } else {
      await page.goto(`${base}#/dashboard`);
      await page.waitForTimeout(300);
      check(await page.locator('.nav').isVisible(), `${label}: sidebar is not visible`);
    }

    await shot(page, `${label}-dashboard`);
  }

  /* The skill panel becomes a bottom sheet on a phone. */
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}#/tree/web`);
  await page.waitForSelector('.node', { timeout: 8000 });
  /* The canvas re-frames itself on mount and on resize, both inside an
   * animation frame. Measuring before that settles gives coordinates that are
   * stale by the time the click lands. */
  await page.waitForTimeout(700);

  const phoneNode = await clickNode(page);
  check(!!phoneNode, 'no tree node is reachable at 375px — the tree opens unusable on a phone');
  await page.waitForSelector('.sheet', { timeout: 5000 });
  /* The sheet slides up over 300ms; measuring mid-animation reports it below
   * the fold, which is where it correctly starts from. */
  await page.waitForTimeout(500);
  const sheetBox = await page.locator('.sheet').boundingBox();
  check(sheetBox.width >= 360, `mobile sheet is only ${Math.round(sheetBox.width)}px wide — not a bottom sheet`);
  check(sheetBox.y + sheetBox.height <= 812 + 4, 'mobile sheet extends past the bottom of the screen');
  await shot(page, 'mobile-sheet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('.sheet').count() === 0, 'Escape did not close the mobile bottom sheet');

  /* ============================================================== *
   * 10. Keyboard and accessibility basics
   * ============================================================== */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}#/dashboard`);
  await page.goto(`${base}#/tree/web`);
  await page.waitForSelector('.node', { timeout: 8000 });
  await page.waitForTimeout(700);

  await page.locator('.node').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const movedTo = await page.evaluate(() => document.activeElement?.dataset?.skill || null);
  check(!!movedTo, 'arrow keys do not move focus between tree nodes');

  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet', { timeout: 5000 });
  check(await page.locator('.sheet[role="dialog"][aria-modal="true"]').count() === 1,
    'the skill sheet is not marked as a modal dialog');

  /* Escape closes, and focus returns where it came from. */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await page.locator('.sheet').count() === 0, 'Escape did not close the sheet');

  /* Every node carries a text label for assistive tech, not just a colour. */
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.node')]
    .filter((n) => !n.getAttribute('aria-label')).length);
  check(unlabelled === 0, `${unlabelled} tree nodes have no aria-label`);

  const liveRegions = await page.locator('[aria-live]').count();
  check(liveRegions > 0, 'no live region for announcing XP and unlocks');

  /* ============================================================== *
   * 11. No console errors anywhere in that run
   * ============================================================== */
  const realErrors = consoleErrors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
  check(realErrors.length === 0, `console errors:\n    ${realErrors.slice(0, 6).join('\n    ')}`);

  await browser.close();
  if (server) server.close();

  /* ---- report ---- */
  console.log(`\nSkillTree smoke — ${SINGLE ? 'single file' : 'served'}`);
  for (const note of notes) console.log(`  · ${note}`);
  if (failures.length) {
    console.log(`\nFAILED — ${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((err) => {
  console.error('smoke run crashed:', err);
  process.exit(1);
});
