#!/usr/bin/env node
/*
 * calisthenics-test.mjs — asserts app/index.html is a calisthenics app.
 *
 * The point of this file is the first block. muscleOf() classifies an exercise
 * by its name, weeklyVolume() accounts sets from what it returns, and a name it
 * does not recognise returns null — so a mis-filed or unrecognised exercise
 * does not error, it just stops being counted. Every exercise the app can put
 * in front of a user is checked against the category it is filed under, so that
 * failure mode is a red test rather than a quiet hole in the volume chart.
 *
 * The rest holds the conversion in place: no weight reaches the user, the
 * equipment model actually gates the workout without ever emptying a category,
 * and a profile saved under the old gym build still loads.
 *
 * Usage (needs playwright on the module path, as tools/smoke.mjs does):
 *   npm i -D playwright && node tools/calisthenics-test.mjs app/index.html
 */
import { chromium } from 'playwright';
import path from 'node:path';

const FILE = 'file://' + path.resolve(process.argv[2] || 'app/index.html');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' }))
  .catch(() => chromium.launch());
const results = [];
const errs = [];
const ok = (n, c, d = '') => results.push({ name: n, pass: !!c, detail: d });

async function page(setup) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 } });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(FILE, { waitUntil: 'load' });
  await p.evaluate(cfg => {
    const pp = P(); pp.onboarded = true; pp.goal = 'muscle';
    pp.personal = { name: 'יובל', age: 25, gender: 'זכר', height: 175, weight: 70 };
    pp.fitness.level = cfg.level || 6;
    pp.workout.equipment = cfg.equipment;
    pp.woPrefs = { duration: 60, focus: 'full' };
    save(); const w = document.getElementById('obwrap'); if (w) { w.innerHTML = ''; w.style.display = 'none'; }
    OB = null; setLang('he'); render(); hideSplash();
  }, setup || { equipment: ['pullup', 'dipbar', 'rings', 'box'] });
  return { c, p };
}

/* ---- 1. every exercise the app can prescribe, checked against the classifier ---- */
let table = [];
{
  const { c, p } = await page();
  const r = await p.evaluate(() => {
    const rows = [], wrong = [], notBW = [], noDemo = [];
    Object.keys(PROG).forEach(cat => PROG[cat].forEach((raw, i) => {
      const n = raw.replace(' !', ''), m = muscleOf(n);
      rows.push({ cat, lvl: i + 1, n, m, bw: isBW(n), need: exNeeds(n), demo: !!EXIMG[n], peak: raw !== n });
      if (m !== cat) wrong.push(`${n}: filed ${cat}, muscleOf says ${m}`);
      if (!isBW(n)) notBW.push(n);
      if (!EXIMG[n]) noDemo.push(n);
    }));
    Object.keys(ACCESSORY).forEach(cat => ACCESSORY[cat].forEach(a => {
      const m = muscleOf(a.b);
      rows.push({ cat, lvl: 'acc', n: a.b, he: a.n, m, bw: isBW(a.b), need: exNeeds(a.b), demo: !!EXIMG[a.b] });
      if (m !== cat) wrong.push(`${a.b}: filed ${cat}, muscleOf says ${m}`);
      if (!isBW(a.b)) notBW.push(a.b);
      if (!EXIMG[a.b]) noDemo.push(a.b);
    }));
    return { rows, wrong, notBW, noDemo, count: rows.length };
  });
  table = r.rows;
  ok(`all ${r.count} exercises are filed under the muscle they train`, r.wrong.length === 0, r.wrong.join(' | '));
  ok('none of them falls through the classifier to null', !r.rows.some(x => x.m === null));
  ok('every one of them is bodyweight', r.notBW.length === 0, r.notBW.join(', '));
  ok('only the two with no honest clip lack a demo', r.noDemo.length === 2 && r.noDemo.every(n => /Nordic curl|Glute bridge/.test(n)), r.noDemo.join(', '));
  await c.close();
}

/* ---- 2. no weight ever reaches the user ---- */
{
  const { c, p } = await page();
  const r = await p.evaluate(async () => {
    const shapes = [{ equipment: [] }, { equipment: ['pullup'] },
                    { equipment: ['pullup', 'dipbar', 'rings', 'box'] },
                    { equipment: ['pullup', 'dipbar', 'rings', 'parallettes', 'bands', 'box', 'abwheel'] }];
    const weighted = [];
    shapes.forEach(s => {
      commit(pp => { pp.workout.equipment = s.equipment; });
      if (showWeights(P())) weighted.push(JSON.stringify(s.equipment));
    });
    commit(pp => { pp.workout.equipment = ['pullup', 'dipbar', 'rings', 'box']; });
    const wo = generateWorkout(P());
    openWorkout();                       // the guided session sheet
    await new Promise(r => setTimeout(r, 400));
    const screen = document.querySelector('.sheet, #sheet, #sheetWrap').innerText;
    return { weighted, kgInTarget: wo.filter(e => /ק״ג|1RM/.test(e.target)).map(e => e.name),
             measures: [...new Set(wo.map(e => e.meas))], kgOnScreen: /ק״ג/.test(screen),
             names: wo.map(e => e.name) };
  });
  ok('showWeights is false for every equipment set', r.weighted.length === 0, r.weighted.join(' | '));
  ok('no prescription mentions kilos or a 1RM', r.kgInTarget.length === 0, r.kgInTarget.join(', '));
  ok('no measurement type is a weight', !r.measures.some(m => /משקל/.test(m)), r.measures.join(', '));
  ok('the workout screen shows no kg field', !r.kgOnScreen);
  await c.close();
}

/* ---- 3. the equipment model actually gates the workout ---- */
for (const [label, equipment, forbidden] of [
  ['floor only', [], /pull-up|pullup|chin|hanging|front lever|dips|inverted row|bulgarian|step-up|windshield/i],
  ['a pull-up bar only', ['pullup'], /dips|bulgarian|step-up|rollout/i],
]) {
  const { c, p } = await page({ equipment });
  const r = await p.evaluate(() => {
    const wo = generateWorkout(P());
    const cats = {}; wo.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
    // and the same for every focus, so no split can come back empty
    const empties = [];
    ['upper', 'lower', 'full'].forEach(f => {
      commit(pp => { pp.woPrefs = { duration: 60, focus: f }; });
      if (!generateWorkout(P()).length) empties.push(f);
    });
    commit(pp => { pp.woPrefs = { duration: 60, focus: 'full' }; });
    return { names: wo.map(e => e.base), cats, empties, n: wo.length };
  });
  const leaked = r.names.filter(n => forbidden.test(n));
  ok(`${label}: nothing needing gear you don't have`, leaked.length === 0, leaked.join(', '));
  ok(`${label}: still a full workout (${r.n} exercises, ${Object.keys(r.cats).length} categories)`, r.n >= 6 && Object.keys(r.cats).length >= 3, JSON.stringify(r.cats));
  ok(`${label}: no focus split comes back empty`, r.empties.length === 0, r.empties.join(', '));
  await c.close();
}

/* ---- 4. a park user gets the bar work ---- */
{
  const { c, p } = await page({ equipment: ['pullup', 'dipbar', 'rings', 'box'], level: 7 });
  const r = await p.evaluate(() => {
    const seen = new Set();
    for (let s = 0; s < 8; s++) { commit(pp => { pp.woSeed = s; }); generateWorkout(P()).forEach(e => seen.add(e.base)); }
    return [...seen];
  });
  ok('a bar user is actually given pulling work', r.some(n => /pull-up|Inverted row|chin/i.test(n)), r.join(', ').slice(0, 120));
  ok('and dips, since there are parallel bars', r.some(n => /Dips/.test(n)), '');
  await c.close();
}

/* ---- 5. volume tracking counts every exercise ---- */
{
  const { c, p } = await page();
  const r = await p.evaluate(() => {
    const bases = [];
    Object.keys(PROG).forEach(cat => PROG[cat].forEach(n => bases.push(n.replace(' !', ''))));
    Object.keys(ACCESSORY).forEach(cat => ACCESSORY[cat].forEach(a => bases.push(a.b)));
    commit(pp => { pp.exLog = {}; bases.forEach(b => { pp.exLog[b] = [{ d: Date.now(), sets: 3, reps: 8 }]; }); });
    const v = weeklyVolume(P());
    const total = Object.values(v).reduce((a, x) => a + x, 0);
    return { v, total, expected: bases.length * 3 };
  });
  ok('every logged set lands in a muscle group', r.total === r.expected, `${r.total}/${r.expected} — ${JSON.stringify(r.v)}`);
  ok('all four trained groups are non-zero', ['chest', 'back', 'legs', 'core'].every(k => r.v[k] > 0), JSON.stringify(r.v));
  await c.close();
}

/* ---- 6. an old gym profile migrates instead of breaking ----
   written straight into storage and then reloaded, so it goes through the same
   self-heal pass a returning user's saved profile would */
{
  const { c, p } = await page();
  const raw = await p.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('fitai_v1'));
    db.profiles[db.active].workout = { style: 'gym', location: 'gym',
      equipment: ['dumbbells', 'barbell', 'bench', 'pullup', 'machines'], days: [1, 3, 5] };
    return JSON.stringify(db);
  });
  // seeded before any app script runs, so the page it unloads from cannot
  // write its own copy back over ours
  await p.addInitScript(v => { localStorage.setItem('fitai_v1', v); localStorage.setItem('fitai_v1_bk', v); }, raw);
  await p.reload({ waitUntil: 'load' });
  const r = await p.evaluate(() => {
    const w = P().workout;
    return { style: w.style, location: w.location, equipment: w.equipment, days: w.days,
             wo: generateWorkout(P()).map(e => e.base), weights: showWeights(P()) };
  });
  ok('a gym profile comes back as bodyweight', r.style === 'bodyweight' && r.location === 'home', `${r.style}/${r.location}`);
  ok('a bench becomes a box, dumbbells and machines are dropped', JSON.stringify(r.equipment) === JSON.stringify(['box', 'pullup']) || JSON.stringify(r.equipment) === JSON.stringify(['pullup', 'box']), JSON.stringify(r.equipment));
  ok('training days survive the migration', JSON.stringify(r.days) === JSON.stringify([1, 3, 5]), JSON.stringify(r.days));
  ok('and it still builds a workout, with no weights', r.wo.length > 0 && r.weights === false, r.wo.join(', '));
  await c.close();
}

/* ---- 7. the screens still render ---- */
{
  const { c, p } = await page();
  const r = await p.evaluate(async () => {
    const out = {};
    for (const t of ['home', 'skills', 'nutrition', 'stretches', 'notif', 'settings']) {
      gotoTab(t); await new Promise(r => setTimeout(r, 250));
      const el = document.getElementById('screen');
      out[t] = { len: el.innerText.length, gym: /חדר כושר|סטודיו|מכונות|משקולות יד|במכון/.test(el.innerText) };
    }
    return out;
  });
  for (const [tab, v] of Object.entries(r)) {
    ok(`${tab} renders`, v.len > 200, String(v.len));
    ok(`${tab} has no gym wording left`, !v.gym);
  }
  await c.close();
}

/* ---- 8. the skill tree and its demos ---- */
{
  const { c, p } = await page();
  const r = await p.evaluate(async () => {
    gotoTab('skills'); await new Promise(r => setTimeout(r, 300));
    openLevel = 5; render(); await new Promise(r => setTimeout(r, 250));
    const txt = document.getElementById('screen').innerText;
    const lvl5 = levelExercises(5).map(e => e.name);
    const demos = lvl5.map(n => !!EXIMG[n.replace(/ \(variation\)| — finisher/, '')]);
    return { txt, lvl5, demos, allNine: lvl5.length === 9 };
  });
  ok('level 5 still holds nine exercises', r.allNine, String(r.lvl5.length));
  ok('and every one of them has a demo clip', r.demos.every(Boolean), r.lvl5.filter((_, i) => !r.demos[i]).join(', '));
  ok('the tree shows the new names', /Diamond push-ups|Pull-ups|Bulgarian/.test(r.txt));
  await c.close();
}

await b.close();

/* the answer to "check which exercise works on what muscle", printed from the app */
const HE = { chest: 'חזה', back: 'גב', legs: 'רגליים', core: 'ליבה' };
const NEED = { pullup: 'מוט', dipbar: 'מקבילים', rings: 'טבעות', parallettes: 'פרלטס', bands: 'גומיות', box: 'ספסל', abwheel: 'גלגל' };
console.log('\nEXERCISE → MUSCLE (as the app itself classifies it)');
console.log('─'.repeat(78));
for (const cat of ['chest', 'back', 'legs', 'core']) {
  console.log(`\n${cat.toUpperCase()} (${HE[cat]})`);
  for (const row of table.filter(r => r.cat === cat)) {
    const need = row.need.length ? row.need.map(g => g.map(k => NEED[k] || k).join('/')).join(' + ') : '—';
    const lvl = row.lvl === 'acc' ? 'acc' : String(row.lvl).padStart(2);
    console.log(`  ${lvl}  ${row.n.padEnd(28)} → ${String(row.m).padEnd(7)} ${row.demo ? '🎬' : '  '} ${need}${row.peak ? '  ★peak' : ''}`);
  }
}
console.log('');

let fail = 0;
for (const r of results) { if (!r.pass) fail++; console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? '   [' + r.detail + ']' : ''}`); }
console.log('');
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fail ? `${fail}/${results.length} FAILED` : `all ${results.length} assertions passed`);
process.exit(fail ? 1 : 0);
