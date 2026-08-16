#!/usr/bin/env node
/* security-check.mjs — the regression test for the hardening pass.
 *
 * Three things, all measured in a real browser rather than argued from the
 * source:
 *
 *   1. The payloads that used to execute. Each is planted in the stored
 *      profile before the app boots — the state an imported .json leaves
 *      behind — and the app is driven to the screen that renders it.
 *   2. The CSP. An inline handler and a javascript: URL are injected straight
 *      into the DOM; both must fail to run. This is what makes the difference
 *      between "no known injection" and "injection cannot become code".
 *   3. The controls that stopped being inline handlers. If data-call is
 *      broken, the questionnaire silently stops working — so every converted
 *      control is pressed and its effect checked.
 *
 * Serve the repo, then:  node app/tools/security-check.mjs [url]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const BASE = process.argv[2] || 'http://127.0.0.1:8099/app/index.html';
const BODY = `<img src=x onerror="window.__PWNED=1">`;
const ATTR = `9"><img src=x onerror="window.__PWNED=1">`;

const PAYLOADS = [
  ['goalWeight',         { goalWeight: BODY },                                    ['home']],
  ['naTarget',           { naTarget: BODY },                                      ['nutrition']],
  ['sugTarget',          { sugTarget: BODY },                                     ['nutrition']],
  ['weights[0].v',       { weights: [{ d: Date.now(), v: BODY }] },               ['home']],
  ['xp',                 { xp: BODY },                                            ['home']],
  ['workout.equipment',  { __workout: { equipment: [BODY] } },                    ['home', 'settings']],
  ['consent.v',          { consent: { v: BODY, at: Date.now(), lang: 'he' } },    ['legalSheet']],
  ['_foodId',            { _foodId: `" ><img src=x onerror="window.__PWNED=1" ` },['foodDiary']],
  ['exLog[].w',          { exLog: { 'Push-ups': [{ d: Date.now(), w: BODY, reps: 8, sets: 3, cat: 'chest' }] } }, ['trends']],
  ['personal.age',       { __personal: { age: ATTR } },                           ['settings']],
  ['personal.height',    { __personal: { height: ATTR } },                        ['settings']],
  ['naTarget (attr)',    { naTarget: ATTR },                                      ['settings']],
  ['reminders.morning',  { reminders: { morning: ATTR, workout: '18:00', sleep: '22:00', water: true, waterEvery: 3 } }, ['notif']],
  ['exWeights{}',        { __workout: { style: 'gym', location: 'gym', equipment: ['machines', 'barbell', 'dumbbells', 'bench', 'cables', 'weight'] }, exWeights: { 'Machine chest press': ATTR } }, ['skillsPopover']],
  ['foodQty{}',          { foodQty: { 0: ATTR, 1: ATTR } },                       ['portionSheet']],
  ['exLog[].reps',       { exLog: { 'Push-ups': [{ d: Date.now(), w: 0, reps: ATTR, sets: 3, cat: 'chest' }] } }, ['guidedWorkout']],
  ['name is an object',  { name: {} },                                            ['home']],
  ['personal is a string', { __replace: { personal: 'x', workout: { days: [1] } } }, ['home']],
];

const browser = await chromium.launch();
let failures = 0;

/* ---- a clean, onboarded profile to base every trial on ---- */
let CLEAN;
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const p = P(); p.onboarded = true; p.personal.name = 'בודק'; p.name = 'בודק';
    p.history = [Date.now() - 86400000]; p.workouts = 3; p.xp = 250; p.goalWeight = 65;
    p.weights = [{ d: Date.now(), v: 70 }]; p.restorePoints = [];
    flushSave();
  });
  CLEAN = await page.evaluate(() => localStorage.getItem('fitai_v1'));
  await ctx.close();
}

async function seeded(patch) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(({ CLEAN, patch }) => {
    const db = JSON.parse(CLEAN);
    let p = db.profiles[db.active];
    for (const k of Object.keys(patch || {})) {
      if (k === '__personal') Object.assign(p.personal, patch[k]);
      else if (k === '__workout') Object.assign(p.workout, patch[k]);
      else if (k === '__replace') Object.assign(p, patch[k]);
      else p[k] = patch[k];
    }
    localStorage.setItem('fitai_v1', JSON.stringify(db));
    localStorage.setItem('fitai_v1_bk', JSON.stringify(db));
  }, { CLEAN, patch });
  const page = await ctx.newPage({ viewport: { width: 402, height: 874 } });
  page.on('pageerror', () => {}); page.on('console', () => {});
  await page.goto(BASE, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const pwned = async page => {
  const h = await page.evaluate(() => !!window.__PWNED).catch(() => false);
  if (h) await page.evaluate(() => { window.__PWNED = 0; }).catch(() => {});
  return h;
};

async function visit(page, w) {
  if (['home', 'nutrition', 'notif', 'settings', 'skills'].includes(w)) {
    await page.click(`#nav button[data-tab="${w}"]`, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(450);
  } else if (w === 'skillsPopover') {
    await page.click('#nav button[data-tab="skills"]', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => { try { const es = levelExercises(1); const e = es.find(x => /press|chest/i.test((x.base || '') + (x.name || ''))) || es[0]; exercisePopover(e.id, 1); } catch (_) {} });
    await page.waitForTimeout(500);
  } else if (w === 'portionSheet') { await page.evaluate(() => { try { openFoodPortion(0); } catch (_) {} }); await page.waitForTimeout(450); }
  else if (w === 'legalSheet')     { await page.evaluate(() => { try { openLegal(); } catch (_) {} }); await page.waitForTimeout(450); }
  else if (w === 'trends')         { await page.evaluate(() => { try { trendsModal(); } catch (_) {} }); await page.waitForTimeout(550); }
  else if (w === 'guidedWorkout')  { await page.evaluate(() => { try { openWorkout(); WO.phase = 'main'; renderWorkout(); } catch (_) {} }); await page.waitForTimeout(650); }
  else if (w === 'foodDiary') {
    await page.evaluate(() => { try { commit(pp => addFoodEntry(pp, { n: 'x', cal: 10, p: 1, c: 1, f: 1 }, 1, 'breakfast')); render(); } catch (_) {} });
    await page.waitForTimeout(400);
    await page.click('#nav button[data-tab="nutrition"]', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(450);
  }
}

console.log('1. payloads that used to execute\n');
for (const [label, patch, where] of PAYLOADS) {
  const { ctx, page } = await seeded(patch);
  let fired = await pwned(page) ? 'boot' : null;
  for (const w of where) { if (fired) break; await visit(page, w); if (await pwned(page)) fired = w; }
  const alive = await page.evaluate(() => {
    const ps = Object.values(JSON.parse(localStorage.getItem('fitai_v1') || '{}').profiles || {});
    return ps.length === 1 && ps[0].workouts === 3 && (ps[0].history || []).length === 1;
  }).catch(() => false);
  if (fired) failures++;
  console.log(`   ${(fired ? '✗ FIRED @ ' + fired : '✓ blocked').padEnd(22)} ${label.padEnd(22)} ${alive ? 'profile intact' : '⚠ profile damaged'}`);
  if (!alive) failures++;
  await ctx.close();
}

console.log('\n2. the CSP itself\n');
{
  const { ctx, page } = await seeded(null);
  const r = await page.evaluate(async () => {
    const out = {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    // an inline event handler, injected the way an XSS would arrive
    host.innerHTML = '<img src="data:," onerror="window.__CSP_HANDLER=1"><b onclick="window.__CSP_HANDLER=1">x</b>';
    host.innerHTML += '<img src="x" onerror="window.__CSP_HANDLER=1">';
    host.querySelector('b').click();
    await new Promise(r => setTimeout(r, 400));
    out.inlineHandler = !!window.__CSP_HANDLER;
    // a javascript: URL
    const a = document.createElement('a');
    a.href = 'javascript:window.__CSP_JSURL=1'; document.body.appendChild(a); a.click();
    await new Promise(r => setTimeout(r, 200));
    out.jsUrl = !!window.__CSP_JSURL;
    // eval / Function
    try { (0, eval)('window.__CSP_EVAL=1'); } catch (e) {}
    try { new Function('window.__CSP_FN=1')(); } catch (e) {}
    out.evalRan = !!window.__CSP_EVAL; out.functionRan = !!window.__CSP_FN;
    // a remote script
    try {
      const s = document.createElement('script');
      s.src = 'https://example.com/x.js';
      const p = new Promise(res => { s.onerror = () => res('blocked'); s.onload = () => res('LOADED'); setTimeout(() => res('blocked'), 1500); });
      document.head.appendChild(s);
      out.remoteScript = await p;
    } catch (e) { out.remoteScript = 'blocked'; }
    host.remove();
    return out;
  });
  const checks = [
    ['injected inline handler does not run', r.inlineHandler === false],
    ['javascript: URL does not run',         r.jsUrl === false],
    ['eval() is blocked',                    r.evalRan === false],
    ['new Function() is blocked',            r.functionRan === false],
    ['remote script is blocked',             r.remoteScript !== 'LOADED'],
  ];
  for (const [name, ok] of checks) { if (!ok) failures++; console.log(`   ${ok ? '✓' : '✗'} ${name}`); }
  await ctx.close();
}

console.log('\n3. the controls that stopped being inline handlers\n');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 402, height: 874 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 80)));
  await page.goto(BASE, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(900);

  const step = () => page.evaluate(() => (typeof OB !== 'undefined' && OB) ? OB.step : 'done');
  const check = async (name, ok) => { if (!ok) failures++; console.log(`   ${ok ? '✓' : '✗'} ${name}`); };

  await page.locator('#obwrap .pill', { hasText: 'Hebrew' }).first().click();
  await page.waitForTimeout(400);
  await check('obSetLang — language pill advances the step', await step() === -0.5);

  const tg = page.locator('#obwrap .toggle');
  for (let i = 0, n = await tg.count(); i < n; i++) await tg.nth(i).click();
  await page.waitForTimeout(300);
  await check('obToggleConsent — both boxes tick', await page.evaluate(() => !!(OB.data.c_health && OB.data.c_terms)));

  await page.locator('#obwrap button.btn.grad').last().click();
  await page.waitForTimeout(400);
  await check('obConsentAccept — moves to step 0', await step() === 0);

  await page.locator('#obwrap input').first().fill('נבדק');
  await page.waitForTimeout(250);
  await check('obSet — typing the name reaches OB.data', await page.evaluate(() => OB.data.name === 'נבדק'));

  const ageBox = page.locator('#obwrap input[inputmode="numeric"]').first();
  if (await ageBox.count()) { await ageBox.fill('31'); await page.waitForTimeout(250); }
  await check('obSet — typing the age reaches OB.data', await page.evaluate(() => String(OB.data.age) === '31'));

  await page.locator('#obwrap .pills .pill').first().click();
  await page.waitForTimeout(300);
  await check('obPick — a pill selects', await page.evaluate(() => !!document.querySelector('#obwrap .pills .pill.act')));

  await page.locator('#obwrap button.btn.grad').last().click();
  await page.waitForTimeout(450);
  await check('obStep — continue advances', await step() === 1);

  await page.evaluate(() => obStep(2));
  await page.waitForTimeout(400);
  const daySel = page.locator('#obwrap .daysel button');
  if (await daySel.count()) {
    const before = await page.evaluate(() => (OB.data.days || []).length);
    await daySel.first().click(); await page.waitForTimeout(250);
    await check('obToggleDay — a day toggles', await page.evaluate(() => (OB.data.days || []).length) !== before);
  }

  // finish, then the in-app controls
  await page.evaluate(() => { try { obFinish(); } catch (e) {} });
  // the build screen runs on its own timer; wait it out rather than guessing
  for (let i = 0; i < 40; i++) {
    const gone = await page.evaluate(() => { const w = document.getElementById('obwrap'); return !w || w.style.display === 'none' || !w.innerHTML.trim(); });
    if (gone) break;
    await page.evaluate(() => { const b = document.querySelector('#obwrap button.btn.grad'); if (b) b.click(); });
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(800);
  await check('obFinish — the app is on screen', await page.evaluate(() => P().onboarded && document.getElementById('screen').innerHTML.length > 500));

  await page.click('#nav button[data-tab="settings"]'); await page.waitForTimeout(600);
  const langBtn = page.locator('#screen .pill', { hasText: 'English' }).first();
  if (await langBtn.count()) { await langBtn.click(); await page.waitForTimeout(700); }
  await check('setLang — the language button switches', await page.evaluate(() => DB.lang === 'en'));
  await page.evaluate(() => setLang('he')); await page.waitForTimeout(600);

  await page.click('#nav button[data-tab="settings"]'); await page.waitForTimeout(600);
  const slider = page.locator('#screen input[type="range"]').first();
  if (await slider.count()) {
    const before = await page.evaluate(() => P().fontScale);
    await slider.evaluate(el => { el.value = String(Math.min(10, (+el.value || 3) + 2)); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(600);
    await check('setFontLevel — the size slider applies', await page.evaluate(() => P().fontScale) !== before);
  }

  await page.click('#nav button[data-tab="skills"]'); await page.waitForTimeout(700);
  const search = page.locator('#screen input').first();
  if (await search.count()) {
    await search.fill('zzzzz'); await page.waitForTimeout(500);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('#screen .lvl')].some(l => l.style.display === 'none'));
    await check('skillFilter — the search box filters', hidden);
    await search.fill(''); await page.waitForTimeout(300);
  }

  await page.evaluate(() => { try { openFoodPortion(0); } catch (e) {} });
  await page.waitForTimeout(500);
  const qty = page.locator('#fp_qty');
  if (await qty.count()) {
    const before = await page.evaluate(() => (document.getElementById('fp_res') || {}).textContent || document.querySelector('#sheet').textContent);
    await qty.fill('250'); await page.waitForTimeout(400);
    const after = await page.evaluate(() => (document.getElementById('fp_res') || {}).textContent || document.querySelector('#sheet').textContent);
    await check('foodPortionCalc — the portion recalculates', after !== before);
    const mult = page.locator('#sheet button', { hasText: '×' }).first();
    if (await mult.count()) { await mult.click(); await page.waitForTimeout(350); await check('fpSetQty — a multiplier button sets the quantity', await page.evaluate(() => +document.getElementById('fp_qty').value) !== 250); }
  }
  await page.evaluate(() => { try { closeSheet(); } catch (e) {} });

  await check('no page errors while driving the controls', errs.length === 0);
  if (errs.length) console.log('     ', errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
