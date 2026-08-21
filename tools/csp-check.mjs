#!/usr/bin/env node
/*
 * csp-check.mjs — the four pages on this origin, checked against their own
 * Content-Security-Policy.
 *
 * localStorage is per-origin, not per-path. GitHub Pages serves the plan app at
 * /, this repo's larger FitAI at /app/, the game at /backrooms/ and the
 * language-model playground at /lm/, and they share one storage jar — which
 * holds, among other things, the vendor API keys this app keeps under
 * `fitai.key.*`. A policy on one page secures nothing while a neighbour has
 * none, so all four are checked together.
 *
 * For each page: drive it, collect every securitypolicyviolation the browser
 * raises, and then try to run code the way an injection would — an inline
 * handler, a javascript: URL, eval, and a remote script — and require all four
 * to fail.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/csp-check.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');

const PAGES = [
  { name: 'plan app   /',           url: `${BASE}/index.html`,
    drive: async page => {                       // walk into the wizard a little
      await page.waitForTimeout(1200);
      const btn = page.locator('button').first();
      if (await btn.count()) await btn.click().catch(() => {});
      await page.waitForTimeout(800);
    } },
  { name: 'fitai app  /app/',       url: `${BASE}/app/index.html`,
    drive: async page => {
      await page.waitForTimeout(1800);
      for (const t of ['skills', 'nutrition', 'settings']) {
        await page.click(`#nav button[data-tab="${t}"]`, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    } },
  { name: 'game       /backrooms/', url: `${BASE}/backrooms/index.html`,
    drive: async page => {
      await page.waitForTimeout(1500);
      const start = page.locator('button', { hasText: /התחל|Start|שחק/ }).first();
      if (await start.count()) await start.click().catch(() => {});
      await page.waitForTimeout(2500);
    } },
  { name: 'toy model  /lm/',        url: `${BASE}/lm/index.html`,
    drive: async page => {
      /* Everything this page does that a policy could stop: train, write, save
       * a model through a blob URL, and — the two that matter most here — pull
       * a corpus and a trained model in as dynamic imports. Those are the pages
       * only way to load a megabyte of text with connect-src at 'none', and if
       * script-src ever stopped allowing them this is where it would show. */
      await page.waitForTimeout(1200);
      await page.click('#train', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.click('#train', { timeout: 5000 }).catch(() => {});
      await page.click('#write', { timeout: 5000 }).catch(() => {});
      await page.click('#export', { timeout: 5000 }).catch(() => {});
      await page.selectOption('#corpus-pick', 'general', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.click('#load-trained', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } },
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;

for (const p of PAGES) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 402, height: 874 } });

  const violations = [], errors = [];
  await page.addInitScript(() => {
    window.__CSPV = [];
    document.addEventListener('securitypolicyviolation', e => {
      window.__CSPV.push(e.effectiveDirective + ' ← ' + String(e.blockedURI).slice(0, 60));
    });
  });
  let probing = false;                       // our own probes are meant to fail
  const bad = [];
  page.on('pageerror', e => { if (!probing) errors.push(e.message.slice(0, 100)); });
  page.on('console', m => { if (!probing && m.type() === 'error') errors.push(m.text().slice(0, 110)); });
  page.on('response', r => { if (!probing && r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

  await page.goto(p.url, { waitUntil: 'load', timeout: 180000 });
  await p.drive(page);

  /* everything the page did on its own, captured before we start probing */
  violations.push(...await page.evaluate(() => (window.__CSPV || []).slice()));

  const hasPolicy = await page.evaluate(() =>
    !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));

  /* now try to execute, the way an injection would — from here every refusal
     in the console is the expected result, so stop counting them */
  probing = true;
  const esc = await page.evaluate(async () => {
    const out = {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = '<img src="x" onerror="window.__X=1"><b onclick="window.__X=1">x</b>';
    host.querySelector('b').click();
    await new Promise(r => setTimeout(r, 350));
    out.inlineHandler = !!window.__X;
    const a = document.createElement('a');
    a.href = 'javascript:window.__J=1'; document.body.appendChild(a); a.click();
    await new Promise(r => setTimeout(r, 150));
    out.jsUrl = !!window.__J;
    try { (0, eval)('window.__E=1'); } catch (e) {}
    out.evalRan = !!window.__E;
    const s = document.createElement('script');
    s.src = 'https://example.com/x.js';
    out.remote = await new Promise(res => {
      s.onerror = () => res('blocked'); s.onload = () => res('LOADED');
      setTimeout(() => res('blocked'), 1500); document.head.appendChild(s);
    });
    host.remove();
    return out;
  });

  const own = violations;

  const checks = [
    ['has a policy',                    hasPolicy],
    ['no violations from the page itself', own.length === 0],
    ['no console errors',               errors.length === 0],
    ['no failed requests',              bad.length === 0],
    ['injected handler blocked',        esc.inlineHandler === false],
    ['javascript: URL blocked',         esc.jsUrl === false],
    ['eval blocked',                    esc.evalRan === false],
    ['remote script blocked',           esc.remote !== 'LOADED'],
  ];
  console.log(`\n${p.name}`);
  for (const [n, ok] of checks) { if (!ok) failures++; console.log(`   ${ok ? '✓' : '✗'} ${n}`); }
  if (own.length) console.log('     violations:', [...new Set(own)].slice(0, 6).join(' | '));
  if (errors.length) console.log('     errors:', [...new Set(errors)].slice(0, 4).join(' | '));
  if (bad.length) console.log('     failed:', [...new Set(bad)].slice(0, 4).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all four pages carry a policy and none of them will run injected code');
process.exit(failures ? 1 : 0);
