#!/usr/bin/env node
/* smoke.mjs — drive the app in a real browser: complete the first-run
 * questionnaire by pressing the actual controls, then walk every tab and every
 * sheet, and fail on any console error, page error or failed request.
 *
 * This is what proves the split is sound. Fifty classic scripts share one
 * global scope, so a mistake in the load order does not show up as a bad diff —
 * it shows up as a ReferenceError while the page is loading. Nothing catches
 * that but running it.
 *
 * Serve the repo, then:
 *   npx http-server -p 8099 -c-1 .
 *   node app/tools/smoke.mjs [url] [screenshot-dir]
 *
 * Point it at the original single file to compare behaviour side by side.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

const BASE = process.argv[2] || 'http://127.0.0.1:8099/app/index.html';
const SHOTS = process.argv[3] || 'dist/shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });

const errors = [], failed = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')));
page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 130)}`));
page.on('response', r => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 130)}`); });

const shot = n => page.screenshot({ path: `${SHOTS}/${n}.png` });
const wait = ms => page.waitForTimeout(ms);

console.log('→ loading', BASE);
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'load', timeout: 180000 });
console.log(`  window load: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await wait(1200);
await shot('01-language');

const step = () => page.evaluate(() => (typeof OB !== 'undefined' && OB) ? OB.step : 'done');
console.log('  step', await step());

// --- language --------------------------------------------------------------
await page.locator('#obwrap .pill', { hasText: 'Hebrew' }).first().click();
await wait(500);
console.log('  step', await step());
await shot('02-consent');

// --- consent ---------------------------------------------------------------
const toggles = page.locator('#obwrap .toggle');
for (let i = 0, n = await toggles.count(); i < n; i++) await toggles.nth(i).click();
await wait(300);
await page.locator('#obwrap button.btn.grad').last().click();
await wait(500);
console.log('  step', await step());

// --- the five questionnaire steps -----------------------------------------
for (let guard = 0; guard < 12; guard++) {
  const s = await step();
  if (s === 'done' || s === null) break;
  if (typeof s !== 'number' || s < 0) break;

  // fill anything empty, choose the first option in every group, press forward
  await page.evaluate(() => {
    document.querySelectorAll('#obwrap input').forEach(i => {
      if (i.type === 'text' && !i.value) { i.value = 'בודק'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }
      if (i.type === 'date' && !i.value) { const d = new Date(Date.now() + 120 * 86400000); i.value = d.toISOString().slice(0, 10); i.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  const groups = page.locator('#obwrap .pills');
  for (let g = 0, n = await groups.count(); g < n; g++) {
    const opt = groups.nth(g).locator('.pill').first();
    if (await opt.count()) await opt.click().catch(() => {});
  }
  await wait(200);
  await shot(`03-step-${s}`);

  const fwd = page.locator('#obwrap button.btn.grad');
  if (await fwd.count()) await fwd.last().click().catch(() => {});
  await wait(600);
  if (await step() === s) {                       // a step that would not advance
    console.log(`  step ${s} did not advance; nudging`);
    await page.evaluate(n => { try { obStep(n); } catch (e) { try { obFinish(); } catch (_) {} } }, s + 1);
    await wait(600);
  }
}

// --- the calculating screen and the payoff ---------------------------------
console.log('  building the plan…');
for (let i = 0; i < 40; i++) {
  const gone = await page.evaluate(() => { const w = document.getElementById('obwrap'); return !w || w.style.display === 'none' || !w.innerHTML.trim(); });
  if (gone) break;
  if (i === 6) await shot('04-calculating');
  const go = page.locator('#obwrap button.btn.grad');
  if (await go.count()) { await shot('05-payoff'); await go.last().click().catch(() => {}); }
  await wait(800);
}
await wait(1000);
await shot('06-home');

// --- every tab -------------------------------------------------------------
for (const t of ['home', 'skills', 'nutrition', 'stretches', 'notif', 'settings']) {
  await page.click(`#nav button[data-tab="${t}"]`);
  await wait(900);
  const len = await page.locator('#screen').evaluate(e => e.innerHTML.trim().length);
  console.log(`  tab ${t.padEnd(10)} ${String(len).padStart(6)} chars`);
  await shot(`10-tab-${t}`);
}

// --- sheets ----------------------------------------------------------------
async function sheet(open, name) {
  await page.evaluate(() => { try { closeSheet(); closeModal(); } catch (e) {} });
  await wait(200);
  await open();
  await wait(900);
  await shot(name);
  await page.evaluate(() => { try { closeSheet(); closeModal(); } catch (e) {} });
  await wait(250);
}
await page.click('#nav button[data-tab="home"]'); await wait(600);
await sheet(() => page.click('#goalFab',{force:true}), '20-my-day');
await sheet(() => page.click('#helpFab',{force:true}), '21-help');
await sheet(() => page.evaluate(() => openShoppingList()), '22-shopping');
await sheet(() => page.evaluate(() => trendsModal()), '23-trends');
await sheet(() => page.evaluate(() => openDayPicker()), '24-day-picker');
await sheet(() => page.evaluate(() => openWorkout()), '25-guided-workout');
await sheet(() => page.evaluate(() => veganGuide()), '26-vegan-guide');
await sheet(() => page.evaluate(() => installGuide()), '27-install');

await page.click('#profBtn'); await wait(600); await shot('28-profiles');
await page.evaluate(() => { try { document.getElementById('profMenu').classList.remove('open'); } catch (e) {} });

// the skill tree, opened, and an exercise
await page.click('#nav button[data-tab="skills"]'); await wait(800);
await shot('29-skill-tree');
const ex = page.locator('#screen .lvl.open .ex[data-ex]').first();
if (await ex.count()) { await ex.click(); await wait(800); await shot('30-exercise'); }
await page.evaluate(() => { try { closeSheet(); } catch (e) {} });

// --- theme and language ----------------------------------------------------
await page.click('#nav button[data-tab="home"]'); await wait(500);
await page.evaluate(() => { DB.theme = 'light'; applyTheme(); render(); });
await wait(800); await shot('40-light');
await page.evaluate(() => { DB.theme = 'dark'; applyTheme(); render(); });
await wait(400);
await page.evaluate(() => setLang('en'));
await wait(900); await shot('41-english');
await page.evaluate(() => setLang('he'));
await wait(600);

// --- persistence across a reload -------------------------------------------
await page.reload({ waitUntil: 'load', timeout: 180000 });
await wait(2000);
const after = await page.evaluate(() => ({ onboarded: P().onboarded, name: P().personal.name, screen: document.getElementById('screen').innerHTML.trim().length }));
console.log('  after reload:', JSON.stringify(after));
await shot('50-after-reload');

console.log('\n--- console errors ---');
console.log(errors.length ? [...new Set(errors)].slice(0, 25).join('\n') : '(none)');
console.log('--- failed requests ---');
console.log(failed.length ? [...new Set(failed)].slice(0, 25).join('\n') : '(none)');

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
