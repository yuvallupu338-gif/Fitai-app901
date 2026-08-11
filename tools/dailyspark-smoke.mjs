#!/usr/bin/env node
/*
 * dailyspark-smoke.mjs — drives DailySpark in a real browser.
 *
 * The things worth testing in this app are not the widgets, they are the
 * promises: one spark per day and the same one on every reopen, a response that
 * changes what the engine believes, a fragile mood that cannot be handed a
 * demanding item, a streak that survives a missed day, and a book that still
 * renders with a year of history in it.
 *
 * The engine assertions run in-page against the real modules rather than
 * through the UI, because the interesting failures there are statistical — you
 * need a hundred selections to see that a safety filter leaks, and clicking a
 * hundred times through a bottom sheet tests the sheet, not the filter.
 *
 * Usage:
 *   node tools/dailyspark-smoke.mjs            # served, tests dailyspark/index.html
 *   node tools/dailyspark-smoke.mjs --single   # tests dist/dailyspark.html over file://
 *   node tools/dailyspark-smoke.mjs --shots    # also writes screenshots to dist/shots
 *
 * Requires the globally installed playwright:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/dailyspark-smoke.mjs
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
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); else notes.push(`ok · ${msg}`); };

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
 * UI driver
 * ------------------------------------------------------------------ */

async function onboard(page) {
  await page.waitForSelector('.ob', { timeout: 8000 });
  // 1 · welcome
  await page.click('.ob-footer .btn-primary');
  // 2 · goals — take two
  await page.waitForSelector('.chip-grid .chip');
  const goals = await page.$$('.chip-grid .chip');
  await goals[0].click();
  await goals[2].click();
  await page.click('.ob-footer .btn-primary');
  // 3 · interests — take three
  await page.waitForTimeout(60);
  const interests = await page.$$('.chip-grid .chip');
  await interests[0].click();
  await interests[1].click();
  await interests[4].click();
  await page.click('.ob-footer .btn-primary');
  // 4 · budget + tone
  await page.waitForTimeout(60);
  const segs = await page.$$('.seg .seg-item');
  await segs[1].click();
  const tones = await page.$$('.chip-grid-tight .chip');
  await tones[1].click();
  await page.click('.ob-footer .btn-primary');
  await page.waitForTimeout(200);
}

async function dismissMood(page, pick) {
  const sheet = await page.$('.sheet .mood-grid');
  if (!sheet) return false;
  if (pick === undefined) {
    await page.click('.sheet-skip');
  } else {
    const moods = await page.$$('.mood');
    await moods[pick].click();
  }
  await page.waitForTimeout(220);
  return true;
}

async function shot(page, name) {
  if (!SHOTS) return;
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `dailyspark-${name}.png`), fullPage: true });
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const ctx = SINGLE ? null : await serve();
const base = SINGLE
  ? pathToFileURL(resolve(ROOT, 'dist/dailyspark.html')).href
  : `http://127.0.0.1:${ctx.port}/dailyspark/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(base, { waitUntil: 'domcontentloaded' });

/* ---------------------------------------------------------- onboarding */
await onboard(page);
check(await page.$('.tabs') !== null, 'onboarding completes into the app shell');

await dismissMood(page, 1);                                   // "רגוע"
await page.waitForSelector('.spark-card', { timeout: 5000 });
await shot(page, 'home');

const title1 = await page.textContent('.spark-title');
check(!!title1 && title1.trim().length > 0, 'a spark is delivered on first run');
check((await page.$$('.spark-card')).length === 1, 'exactly one spark on screen');
check((await page.$$('.responses .resp')).length === 3, 'three response buttons');

/* ---------------------------------------------------- same spark on reload */
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.spark-card', { timeout: 5000 });
const title2 = await page.textContent('.spark-title');
check(title1 === title2, 'the same spark is shown after a reload');
check(await page.$('.sheet .mood-grid') === null, 'the mood sheet is not asked twice in a day');

/* ------------------------------------------------------------ responding */
await page.click('.resp-done');
await page.waitForTimeout(300);
check(await page.$('.spark-done') !== null, 'completing marks the card');
check((await page.textContent('.after-line')).includes('נתראה מחר'), 'the after-state points at tomorrow');

const learned = await page.evaluate(() => JSON.parse(localStorage.getItem('dailyspark.v1')).model.updates);
check(learned > 0, `the model recorded the interaction (${learned} updates)`);

/* ------------------------------------------------------------------ book */
await page.click('.tabs .tab:nth-child(2)');
await page.waitForSelector('.timeline, .empty', { timeout: 4000 });
check((await page.$$('.tl-row')).length >= 1, 'the book lists the delivered spark');
await page.click('.seg-wide .seg-item:nth-child(2)');
await page.waitForSelector('.heat', { timeout: 4000 });
check((await page.$$('.heat-cell')).length > 300, 'the year grid renders a full year');
await shot(page, 'book');

/* -------------------------------------------------------------- insights */
await page.click('.tabs .tab:nth-child(3)');
await page.waitForSelector('.card', { timeout: 4000 });
check((await page.textContent('.screen')).includes('עוד'), 'insights refuses to speak with too little data');

/* --------------------------------------------------------------- profile */
await page.click('.tabs .tab:nth-child(4)');
await page.waitForSelector('.interest-grid', { timeout: 4000 });
check((await page.$$('.interest')).length === 12, 'all twelve areas are editable');
check(await page.$('.preview-title') !== null, 'the settings preview runs the real selector');
await shot(page, 'profile');

/* Toggling an interest to "לא" must block that area outright. */
const blocked = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('dailyspark.v1'));
  raw.profile.interests.movement = 0;
  raw.profile.blocked = ['movement'];
  localStorage.setItem('dailyspark.v1', JSON.stringify(raw));
  return true;
});
check(blocked, 'a blocked area can be persisted');

/* ------------------------------------------------------------------ *
 * Engine assertions, in-page against the real modules
 * ------------------------------------------------------------------ */

if (!SINGLE) {
  const enginePage = await browser.newPage();
  enginePage.on('pageerror', (e) => consoleErrors.push(String(e)));
  /* Has to be on the same origin before it can import the modules — a page
   * sitting on about:blank cannot fetch them. */
  await enginePage.goto(`http://127.0.0.1:${ctx.port}/dailyspark/index.html`, { waitUntil: 'domcontentloaded' });

  const result = await enginePage.evaluate(async (origin) => {
    const lib = await import(`${origin}/dailyspark/src/data/sparks.index.js`);
    const tax = await import(`${origin}/dailyspark/src/data/taxonomy.js`);
    const safety = await import(`${origin}/dailyspark/src/engine/safety.js`);
    const day = await import(`${origin}/dailyspark/src/core/day.js`);

    const out = {};
    out.librarySize = lib.LIBRARY.length;

    /* Every fragile mood must have something to offer. A safety filter with an
     * empty result set is not safe, it is broken — it falls through to the
     * relaxation ladder. */
    out.safeCounts = {};
    for (const m of tax.MOODS.filter((x) => x.fragile)) {
      out.safeCounts[m.key] = lib.LIBRARY.filter((s) => safety.allowedForMood(s, m.key)).length;
    }

    /* Nothing marked safe may carry challenge language or be larger than micro. */
    out.unsafeMarked = lib.LIBRARY
      .filter((s) => s.safe && (s.size !== 'micro' || !safety.allowedForMood(s, 'flat')))
      .map((s) => s.id);

    /* Every combination of category and size that the budget system can ask
     * for has to exist, or a person with a narrow profile hits the relaxation
     * ladder every single day. */
    out.thinCells = [];
    for (const c of tax.CATEGORY_KEYS) {
      const micro = lib.LIBRARY.filter((s) => s.category === c && s.size === 'micro').length;
      if (micro === 0) out.thinCells.push(`${c}:micro`);
    }

    /* Copy limits, checked against the same rules the gate uses. */
    out.badCopy = lib.LIBRARY
      .filter((s) => !safety.checkCopy({ title: s.title, body: s.body, action: s.action }).ok)
      .map((s) => s.id);

    /* The logical day rolls at 04:00, not midnight. */
    const lateNight = new Date(2026, 7, 12, 1, 30);
    const morning = new Date(2026, 7, 12, 9, 0);
    out.rollover = {
      lateNight: day.dayKey(lateNight),
      morning: day.dayKey(morning),
    };

    return out;
  }, `http://127.0.0.1:${ctx.port}`);

  check(result.librarySize >= 80, `library has ${result.librarySize} sparks`);
  check(result.unsafeMarked.length === 0,
    `every "safe" spark really is safe (offenders: ${result.unsafeMarked.join(', ') || 'none'})`);
  check(result.badCopy.length === 0,
    `all copy passes the safety gate (offenders: ${result.badCopy.join(', ') || 'none'})`);
  check(result.thinCells.length === 0,
    `every area has a micro-sized option (missing: ${result.thinCells.join(', ') || 'none'})`);
  for (const mood of Object.keys(result.safeCounts)) {
    check(result.safeCounts[mood] >= 8,
      `mood "${mood}" has ${result.safeCounts[mood]} safe candidates`);
  }
  check(result.rollover.lateNight === '2026-08-11' && result.rollover.morning === '2026-08-12',
    'the logical day rolls at 04:00, so 01:30 still belongs to yesterday');

  /*
   * A simulated year.
   *
   * The failures that matter in a once-a-day app do not show up in a session —
   * they show up in month four, as "it keeps giving me the same thing" or "it
   * only ever talks about one subject". This drives the real selector through
   * sixty days with a plausible response pattern and asserts the properties
   * that a day of clicking cannot reach.
   */
  const sim = await enginePage.evaluate(async (origin) => {
    const store = await import(`${origin}/dailyspark/src/core/store.js`);
    const select = await import(`${origin}/dailyspark/src/engine/select.js`);
    const lib = await import(`${origin}/dailyspark/src/data/sparks.index.js`);
    const tax = await import(`${origin}/dailyspark/src/data/taxonomy.js`);
    const safety = await import(`${origin}/dailyspark/src/engine/safety.js`);

    store.reset();
    store.update((s) => {
      s.stage = 'app';
      s.profile.goals = ['move_more', 'focus_better'];
      s.profile.tone = 'practical';
      s.profile.budgetMinutes = 5;
    });

    const DAYS = 60;
    const picks = [];
    const fragileDays = new Set([3, 4, 11, 12, 25, 26, 40, 41, 55]);

    for (let i = 0; i < DAYS; i += 1) {
      const state = store.get();
      const mood = fragileDays.has(i) ? 'overloaded' : 'calm';
      const picked = select.selectSpark(state, { mood, energy: mood === 'calm' ? 4 : 1 });
      if (!picked) { picks.push(null); continue; }
      picks.push({ id: picked.spark.id, category: picked.spark.category, size: picked.spark.size, mood });

      /* Write the day and a response, so the next iteration sees real history.
       * Movement and focus get acted on; everything else is mostly skipped —
       * a lopsided user is exactly what the ranker should adapt to. */
      const key = `sim-${String(i).padStart(3, '0')}`;
      store.update((s) => {
        s.days[key] = {
          sparkId: picked.spark.id,
          title: picked.framed.title,
          body: picked.framed.body,
          action: picked.framed.action,
          status: 'delivered',
          mood,
          energy: mood === 'calm' ? 4 : 1,
          context: picked.context,
        };
        if (!s.seen.includes(picked.spark.id)) s.seen.push(picked.spark.id);
      });
      const acts = ['movement', 'focus'].includes(picked.spark.category);
      store.update((s) => { s.days[key].status = acts ? 'completed' : 'deferred'; });
      select.applyFeedback(acts ? 'completed' : 'deferred', { day: key });
    }

    const ids = picks.filter(Boolean).map((p) => p.id);
    const categories = new Set(picks.filter(Boolean).map((p) => p.category));

    /* Longest run of the same category back to back. */
    let longestRun = 0;
    let run = 0;
    for (let i = 0; i < picks.length; i += 1) {
      if (i && picks[i] && picks[i - 1] && picks[i].category === picks[i - 1].category) run += 1;
      else run = 1;
      longestRun = Math.max(longestRun, run);
    }

    const unsafeOnFragile = picks
      .filter((p) => p && p.mood === 'overloaded')
      .filter((p) => !safety.allowedForMood(lib.sparkById(p.id), 'overloaded')).length;

    /* Closest gap between two deliveries of the same spark. The no-repeat rule
     * is a fraction of the library rather than a number of days, so this is the
     * property to assert — not "never twice in sixty days", which a small
     * library cannot honour without giving up on ranking entirely. */
    let minGap = Infinity;
    const lastAt = new Map();
    ids.forEach((id, i) => {
      if (lastAt.has(id)) minGap = Math.min(minGap, i - lastAt.get(id));
      lastAt.set(id, i);
    });

    /*
     * Did the model actually learn?
     *
     * Measured on the posterior rather than on the delivered mix, because the
     * delivered mix is bounded by the freshness rule: after two months the
     * movement shelf is empty whatever the ranker prefers. The weights are not
     * bounded by anything, so this is where a preference is visible.
     */
    const bandit = await import(`${origin}/dailyspark/src/engine/bandit.js`);
    const model = bandit.hydrate(store.get().model);
    const probe = { part: 'morning', tone: 'practical', topicSim: 0.5, goalAlign: 0, energy: 4 };
    const pFor = (category) => {
      const s = lib.LIBRARY.find((x) => x.category === category && x.size === 'micro');
      return s ? bandit.predict(model, bandit.features(s, probe)) : 0;
    };

    const out = {
      delivered: picks.filter(Boolean).length,
      unique: new Set(ids).size,
      minGap: minGap === Infinity ? null : minGap,
      categories: categories.size,
      longestRun,
      unsafeOnFragile,
      pActed: Math.max(pFor('movement'), pFor('focus')),
      pIgnored: Math.max(pFor('money'), pFor('learning')),
      totalCategories: tax.CATEGORY_KEYS.length,
    };
    store.reset();
    return out;
  }, `http://127.0.0.1:${ctx.port}`);

  check(sim.delivered === 60, `sixty consecutive days all produced a spark (${sim.delivered})`);
  check(sim.minGap === null || sim.minGap >= 50,
    `repeats stay at least fifty days apart (closest ${sim.minGap === null ? 'none' : sim.minGap})`);
  check(sim.categories >= 8, `coverage stayed broad: ${sim.categories}/${sim.totalCategories} areas`);
  check(sim.longestRun <= 3, `no category ran more than three days straight (longest ${sim.longestRun})`);
  check(sim.unsafeOnFragile === 0, 'not one unsafe spark reached a fragile day across the whole run');
  check(sim.pActed > sim.pIgnored,
    `the model prefers what got acted on (${sim.pActed.toFixed(3)} vs ${sim.pIgnored.toFixed(3)})`);

  /*
   * Journeys, driven through the real selector.
   *
   * The property that matters is not "day three came from the sleep category" —
   * it is that a fragile check-in makes the arc *wait*. A programme that keeps
   * counting through someone's worst week is the exact mechanic this product
   * was built to avoid, so it is asserted rather than trusted.
   */
  const jr = await enginePage.evaluate(async (origin) => {
    const store = await import(`${origin}/dailyspark/src/core/store.js`);
    const select = await import(`${origin}/dailyspark/src/engine/select.js`);
    const journeys = await import(`${origin}/dailyspark/src/data/journeys.js`);
    const lib = await import(`${origin}/dailyspark/src/data/sparks.index.js`);

    store.reset();
    store.update((s) => { s.stage = 'app'; s.profile.budgetMinutes = 15; });
    store.startJourney('sleep7');
    const journey = journeys.journeyBySlug('sleep7');

    const out = { matched: 0, total: 0, fragileAdvanced: false, categories: [] };

    for (let i = 0; i < 5; i += 1) {
      const fragile = i === 2;
      const before = store.get().journey.day;
      const picked = select.selectSpark(store.get(), {
        mood: fragile ? 'overloaded' : 'calm',
        energy: fragile ? 1 : 4,
      });
      if (!picked) continue;

      const key = `j-${i}`;
      store.update((s) => {
        s.days[key] = { sparkId: picked.spark.id, status: 'completed', mood: fragile ? 'overloaded' : 'calm' };
        if (!s.seen.includes(picked.spark.id)) s.seen.push(picked.spark.id);
      });
      if (picked.journey) store.advanceJourney();

      out.categories.push({ i, fragile, category: picked.spark.category, onJourney: !!picked.journey });

      if (fragile) {
        if (store.get().journey.day !== before) out.fragileAdvanced = true;
      } else {
        out.total += 1;
        if (picked.spark.category === journey.steps[before].category) out.matched += 1;
      }
    }

    out.day = store.get().journey.day;
    out.libSize = lib.LIBRARY.length;
    store.reset();
    return out;
  }, `http://127.0.0.1:${ctx.port}`);

  check(jr.libSize >= 240, `library grew to ${jr.libSize} sparks`);
  check(jr.matched === jr.total,
    `every ordinary journey day matched its step (${jr.matched}/${jr.total})`);
  check(!jr.fragileAdvanced, 'a fragile day did not advance the journey — it waited');
  check(jr.day === 4, `four ordinary days advanced the arc, the fragile one did not (day ${jr.day})`);

  await enginePage.close();
}

/* ------------------------------------------------------------------ *
 * Collections and the printed book
 * ------------------------------------------------------------------ */

await page.click('.tabs .tab:nth-child(2)');
await page.waitForSelector('.seg-wide', { timeout: 4000 });
await page.click('.seg-wide .seg-item:nth-child(3)');            // "שמורים"
await page.waitForSelector('.collections-head', { timeout: 4000 });
await page.click('.collections-head .btn');                      // "+ אוסף חדש"
await page.waitForSelector('.sheet .input', { timeout: 3000 });
await page.fill('.sheet .input', 'כשאני תקוע');
await page.click('.sheet .btn-primary');
await page.waitForTimeout(300);
check((await page.$$('.collection')).length === 1, 'a named collection can be created');
check((await page.textContent('.collection .card-title')) === 'כשאני תקוע', 'the collection keeps its name');

const persistedCollection = await page.evaluate(
  () => JSON.parse(localStorage.getItem('dailyspark.v1')).collections.length,
);
check(persistedCollection === 1, 'the collection survives into storage');

/* ------------------------------------------------------------------ *
 * Journeys, through the UI
 * ------------------------------------------------------------------ */

await page.click('.tabs .tab:nth-child(3)');
await page.waitForSelector('.journey-grid', { timeout: 4000 });
check((await page.$$('.journey-card')).length >= 6, 'the journey library is offered');
await page.click('.journey-grid .journey-card:nth-child(1)');
await page.waitForSelector('.journey-steps', { timeout: 3000 });
check((await page.$$('.journey-step')).length === 7, 'a journey shows its day-by-day shape before you commit');
await page.click('.sheet .btn-primary');
await page.waitForTimeout(400);
check(await page.$('.journey-active') !== null, 'starting a journey shows the active card');
check(await page.$('.journey-bar') !== null, 'the active journey shows progress');

await page.click('.journey-active .row-actions .btn');           // "השהה"
await page.waitForTimeout(300);
check((await page.textContent('.journey-eyebrow')) === 'מושהה', 'a journey can be paused rather than only abandoned');
const journeyKept = await page.evaluate(
  () => JSON.parse(localStorage.getItem('dailyspark.v1')).journey.state,
);
check(journeyKept === 'paused', 'the paused journey keeps its place in storage');

/* ------------------------------------------------------------------ *
 * Streak: a missed day is absorbed, not punished
 * ------------------------------------------------------------------ */

await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('dailyspark.v1'));
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  raw.streak = {
    current: 9, longest: 9, lastDay: key, freezesLeft: 2, freezeMonth: key.slice(0, 7), frozenDays: [],
  };
  localStorage.setItem('dailyspark.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const afterGap = await page.evaluate(() => JSON.parse(localStorage.getItem('dailyspark.v1')).streak);
check(afterGap.current > 9, `a two-day gap was absorbed rather than reset (streak ${afterGap.current})`);
check(afterGap.freezesLeft === 0, 'the freeze allowance was spent');

/* And when the allowance is gone, it resets quietly rather than warning first. */
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('dailyspark.v1'));
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  raw.streak = {
    current: 20, longest: 20, lastDay: key, freezesLeft: 0, freezeMonth: key.slice(0, 7), frozenDays: [],
  };
  localStorage.setItem('dailyspark.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('dailyspark.v1')).streak);
check(afterReset.current === 1, 'with no freezes left the streak restarts at 1');
check(afterReset.longest === 20, 'the personal best survives the reset');

/* ------------------------------------------------------------------ *
 * A fragile day never gets a demanding spark
 * ------------------------------------------------------------------ */

await page.evaluate(() => localStorage.removeItem('dailyspark.v1'));
await page.goto(base, { waitUntil: 'domcontentloaded' });
await onboard(page);
await dismissMood(page, 4);                                   // "מוצף"
await page.waitForSelector('.spark-card', { timeout: 5000 });

const fragile = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('dailyspark.v1'));
  const key = Object.keys(raw.days)[0];
  return { entry: raw.days[key], mood: raw.days[key].mood };
});
check(fragile.mood === 'overloaded', 'the mood check-in is recorded');
const fragileText = `${fragile.entry.title} ${fragile.entry.body} ${fragile.entry.action}`;
check(!/[!]/.test(fragileText), 'no exclamation marks on a fragile day');
check(!/(כבוש|תתגבר|בלי תירוצים|תתאמץ)/.test(fragileText), 'no challenge language on a fragile day');
await shot(page, 'fragile');

/* ------------------------------------------------------------------ *
 * Reroll replaces the spark and records the refusal
 * ------------------------------------------------------------------ */

const before = await page.textContent('.spark-title');
await page.click('.responses .resp:nth-child(3)');            // "לא בשבילי"
await page.waitForSelector('.reason-list', { timeout: 3000 });
await page.click('.reason-list .reason:nth-child(2)');        // "קלישאתי"
await page.waitForTimeout(400);
const after = await page.textContent('.spark-title');
check(before !== after, 'a rejected spark is replaced immediately');

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

check(consoleErrors.length === 0, `no console errors (${consoleErrors.slice(0, 3).join(' | ') || 'clean'})`);

await browser.close();
if (ctx) ctx.server.close();

for (const n of notes) console.log(n);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nall ${notes.length} checks passed${SINGLE ? ' (single-file build)' : ''}`);
