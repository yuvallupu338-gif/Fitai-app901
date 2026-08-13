#!/usr/bin/env node
/*
 * sites-smoke.mjs — drives each site in sites/ in a real browser.
 *
 * These are static marketing pages, so there is no user journey to walk. What
 * there is instead is a list of things that quietly break on exactly this kind
 * of page and are invisible until someone opens it on a phone: a stray
 * `left: 0` that pushes the layout sideways in RTL, a section that overflows at
 * 360px, an icon button with no accessible name, an anchor pointing at an id
 * that was renamed, a font or a map iframe still being fetched from the
 * network. All of it is asserted here, at four widths.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs horror
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/sites-smoke.mjs --shots
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
const SHOT_DIR = resolve(ROOT, 'dist/shots/sites');
const ALL = ['horror', 'escape', 'lawyer'];
const sites = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const TARGETS = sites.length ? sites : ALL;

const WIDTHS = [360, 768, 1280, 1600];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const fails = [];
const fail = (site, msg) => { fails.push(`${site}: ${msg}`); console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

/* ------------------------------------------------------------------ server */

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(ROOT, `.${path}`);
  // Nothing outside the repo, so a bad relative path in a page fails loudly
  // here rather than quietly serving something from the filesystem.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const base = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------------ checks */

const browser = await chromium.launch();

for (const site of TARGETS) {
  console.log(`\n── sites/${site}/`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const offsite = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => consoleErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  // Every one of these sites is supposed to be self-contained. A request to
  // anywhere but this server means a font, a map or a script snuck back in.
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) offsite.push(r.url()); });

  const resp = await page.goto(`${base}/sites/${site}/`, { waitUntil: 'networkidle' });
  if (!resp || !resp.ok()) { fail(site, `page did not load (${resp && resp.status()})`); await context.close(); continue; }
  pass('loads');

  /* --- document basics --- */
  const doc = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.content || '',
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    landmarks: ['header', 'main', 'footer'].filter((t) => document.querySelector(t)),
  }));
  if (doc.lang !== 'he') fail(site, `lang is "${doc.lang}", expected "he"`);
  if (doc.dir !== 'rtl') fail(site, `dir is "${doc.dir}", expected "rtl"`);
  if (!doc.title || doc.title.length < 6) fail(site, 'missing a real <title>');
  if (!doc.desc || doc.desc.length < 30) fail(site, 'missing a real meta description');
  if (doc.h1.length !== 1) fail(site, `expected exactly one h1, found ${doc.h1.length}`);
  if (doc.landmarks.length !== 3) fail(site, `missing landmarks: ${['header', 'main', 'footer'].filter((t) => !doc.landmarks.includes(t))}`);
  if (doc.lang === 'he' && doc.dir === 'rtl' && doc.h1.length === 1) pass('document: lang, dir, single h1, landmarks');

  /* --- anchors resolve --- */
  const deadAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && h !== '#' && !document.querySelector(h)));
  if (deadAnchors.length) fail(site, `anchors point at nothing: ${[...new Set(deadAnchors)].join(', ')}`);
  else pass('in-page anchors all resolve');

  /* --- accessible names on controls --- */
  const unnamed = await page.evaluate(() => {
    const named = (el) => (el.textContent || '').trim()
      || el.getAttribute('aria-label')
      || el.getAttribute('title')
      || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')))
      || (el.labels && el.labels.length);
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      if (el.closest('[hidden]') || el.hidden) continue;
      if (!named(el)) out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`);
    }
    return out;
  });
  if (unnamed.length) fail(site, `${unnamed.length} control(s) with no accessible name: ${[...new Set(unnamed)].slice(0, 6).join(', ')}`);
  else pass('every control has an accessible name');

  /* --- no overflow, at every width --- */
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(220);
    const over = await page.evaluate(() => {
      const doc = document.documentElement;
      const slop = doc.scrollWidth - doc.clientWidth;
      if (slop <= 1) return null;
      // Name the widest offender, so the failure is actionable rather than
      // "something on the page is too wide".
      let worst = null;
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const past = Math.max(r.right - doc.clientWidth, -r.left);
        if (past > 2 && (!worst || past > worst.past)) {
          worst = { past: Math.round(past), tag: el.tagName.toLowerCase(), cls: String(el.className).split(' ')[0] };
        }
      }
      return { slop, worst };
    });
    if (over) fail(site, `horizontal overflow at ${width}px by ${over.slop}px${over.worst ? ` — widest: <${over.worst.tag} class="${over.worst.cls}"> ${over.worst.past}px past the edge` : ''}`);

    if (SHOTS) {
      if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(SHOT_DIR, `${site}-${width}.png`), fullPage: width === 1280 });
    }
  }
  if (!fails.some((f) => f.startsWith(site) && f.includes('overflow'))) pass(`no horizontal overflow at ${WIDTHS.join(', ')}px`);

  /* --- keyboard: the first tab must reach something visible --- */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), outline: s.outlineStyle !== 'none' || s.boxShadow !== 'none' };
  });
  if (!firstFocus) fail(site, 'Tab from the top of the page focuses nothing');
  else if (!firstFocus.outline) fail(site, `first focusable <${firstFocus.tag}> has no visible focus ring`);
  else pass('keyboard focus enters the page with a visible ring');

  /* --- reduced motion: the page still renders everything --- */
  const rmContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const rmPage = await rmContext.newPage();
  await rmPage.goto(`${base}/sites/${site}/`, { waitUntil: 'networkidle' });
  await rmPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await rmPage.waitForTimeout(400);
  const invisible = await rmPage.evaluate(() => [...document.querySelectorAll('.reveal')]
    .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.9).length);
  if (invisible) fail(site, `${invisible} .reveal element(s) still invisible under prefers-reduced-motion`);
  else pass('content is visible under prefers-reduced-motion');
  await rmContext.close();

  /* --- JS off: the page is still readable --- */
  const noJsContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(`${base}/sites/${site}/`, { waitUntil: 'load' });
  const textLen = (await noJsPage.evaluate(() => document.body.innerText)).length;
  if (textLen < 1200) fail(site, `only ${textLen} characters of text render with JS disabled — the content should be in the HTML`);
  else pass(`readable with JS disabled (${textLen} chars)`);
  await noJsContext.close();

  /* --- the self-contained rule --- */
  if (offsite.length) fail(site, `requests left the page: ${[...new Set(offsite)].slice(0, 3).join(', ')}`);
  else pass('no network requests beyond the page itself');

  if (consoleErrors.length) fail(site, `console: ${[...new Set(consoleErrors)].slice(0, 4).join(' | ')}`);
  else pass('no console errors or warnings');

  await context.close();
}

await browser.close();
server.close();

console.log('');
if (fails.length) {
  console.log(`${fails.length} failure(s):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(`all clear — ${TARGETS.join(', ')}`);
