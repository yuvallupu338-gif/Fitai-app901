#!/usr/bin/env node
/*
 * portfolio-smoke.mjs — drives the portfolio app in a real browser, downloads
 * the file it produces, and opens that file the way the person receiving it
 * would: off the disk, over file://, with nothing else around.
 *
 * `tools/portfolio-audit.mjs` proves the exporter builds a safe string. It
 * cannot prove the app ever calls it, that the form reaches the store, that a
 * reload keeps the work, or that the string a browser actually parses contains
 * no script — a claim about markup is only worth what a parser says about it.
 * That is this file.
 *
 * The last part is the one worth stating plainly, because it is the whole
 * promise the app makes: what comes out is one file, and it renders with the
 * server switched off. So the download is opened from a temporary directory
 * over file://, after the local server has been closed.
 *
 * Usage:
 *   node tools/portfolio-smoke.mjs
 *   node tools/portfolio-smoke.mjs --shots     # writes dist/shots/portfolio/
 *   node tools/portfolio-smoke.mjs --verbose
 */

import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = resolve(ROOT, 'dist/shots/portfolio');

const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); else notes.push('ok: ' + msg); };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const path = resolve(ROOT, `.${url}`);
      if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/*
 * A real PNG, larger than the ceiling the app resizes to.
 *
 * Built here rather than checked in as base64, because the only interesting
 * thing about it is its size: 2400px wide against a 1400px limit, so the resize
 * the picture path exists for actually runs. A 4×4 test image would have gone
 * through untouched and proved nothing about it.
 */
const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   /* 8 bits per channel */
  ihdr[9] = 2;   /* truecolour */
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = 120;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const IMAGE_MAX_PX = 1400;

const PARAGRAPH = 'עיצבתי ובניתי אתר למספרה של רון ב-2024, לבד, בפיגמה ו-HTML\n'
  + 'אפליקציית מתכונים לעצמי, התחלתי ב-2023 ועדיין עובד על זה, React\n'
  + 'מיתוג לכנס נגישות בעבודה, 2019 עד 2021, הובלתי צוות של שניים';

/* The one work the whole run is about. Its answers are ordinary on purpose —
 * the hostile ones are the audit's job — except the title, which carries a
 * script tag through the form, the store, a reload and the export. */
const WORK = {
  title: 'אתר תדמית <script>alert(1)</script>',
  role: 'עיצוב ופיתוח',
  brief: 'למספרה לא היה שום דבר באינטרנט. אנשים חיפשו טלפון ולא מצאו.',
  did: 'אפיינתי את המבנה\nעיצבתי בפיגמה\nבניתי בלי תלויות',
  tools: 'Figma, HTML, CSS',
  result: 'רוב התורים נקבעים דרך האתר.',
};

async function main() {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/portfolio/`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' })
    .catch(() => chromium.launch());
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`); });
  /* If anything in the app ever calls alert(), the injected script ran. */
  let dialogs = 0;
  page.on('dialog', async (d) => { dialogs += 1; await d.dismiss(); });

  const downloads = await mkdtemp(join(tmpdir(), 'portfolio-'));
  if (SHOTS) await mkdir(SHOT_DIR, { recursive: true });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, name + '.png'), fullPage: true }); };

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.tabs');

  /* ---- the short way in: three details and a paragraph ---- */

  check((await page.locator('.tabs .btn.on').textContent()) === 'מהיר',
    'an empty app does not open on the quick screen');

  await page.getByLabel('איך קוראים לך', { exact: true }).fill('נועה בר');
  /* Written with spaces on purpose: this is the phone shape that used to be
   * laid out backwards in the exported document. */
  await page.getByLabel('טלפון', { exact: true }).fill('03 6961234');
  await page.getByLabel('אתר או פרופיל, אם יש', { exact: true }).fill('noabar.co.il');
  await page.getByLabel('מה עשית?', { exact: true }).fill(PARAGRAPH);
  await shot('01-quick');

  /* The model box is FitAI's provider/model/key rows, mounted in this app. It is
   * shared code and therefore the thing most likely to break silently here. */
  await page.locator('.aibox > summary').click();
  check((await page.locator('.aibox input[type="password"]').count()) === 1,
    'the model box has no key field');
  /* Provider and model are chip rows, not selects — that is how the shared
   * settings render them, and asserting on the wrong element is how a check
   * fails for a reason that has nothing to do with the app. */
  check((await page.locator('.aibox .opts .opt').count()) >= 2,
    'the model box has no provider or model picker');
  check((await page.textContent('.aibox')).includes('רק הפסקה שכתבת'),
    'the model box does not say what is sent');
  const chosen = await page.locator('.aibox .opts .opt.on').first().textContent();
  check(chosen.includes('DeepSeek'), `the reader defaults to "${chosen.trim()}" rather than DeepSeek`);
  /* The default vendor is the one that does not document browser calls, so the
   * caveat has to be on the screen before the button, not after the failure. */
  check((await page.textContent('.aibox')).includes('לא מצהיר על תמיכה בקריאה ישירה מדפדפן'),
    'the browser-call caveat is missing from the model box');

  await page.getByRole('button', { name: 'בלי מודל' }).click();
  await page.waitForSelector('.readlist');
  const readTitles = await page.locator('.readlist li').allTextContents();
  check(readTitles.length === 3, `the rules split the paragraph into ${readTitles.length} works, not 3`);
  check(readTitles[0].startsWith('עיצבתי ובניתי אתר למספרה'), `the first work is "${readTitles[0]}"`);
  check((await page.locator('.readlist').locator('..').textContent()).includes('בלי מודל'),
    'the screen does not say which of the two readers ran');
  const offlineKinds = await page.evaluate(() => window.portfolio.store.get().works.map((w) => w.kind));
  check(JSON.stringify(offlineKinds) === JSON.stringify(['site', 'app', 'brand']),
    `the rules read the kinds as ${JSON.stringify(offlineKinds)}`);
  const offlineYears = await page.evaluate(() => window.portfolio.store.get().works.map((w) => w.period.fromYear));
  check(JSON.stringify(offlineYears) === JSON.stringify([2024, 2023, 2019]),
    `the years came out ${JSON.stringify(offlineYears)}`);
  await shot('02-read');

  /* Undo has to be a real undo, or the button is a lie about somebody's work. */
  await page.getByRole('button', { name: 'בטל את ההוספה' }).click();
  check((await page.evaluate(() => window.portfolio.store.get().works.length)) === 0,
    'undoing the import left works behind');

  /* ---- the same paragraph, through a stubbed model ---- */

  /*
   * The model path with no key and no network: the request is intercepted and
   * answered with the shape a provider really returns. What that proves is the
   * whole wiring — the request body this app builds, the tool call it extracts,
   * the normalising, and the works landing in the store — and it proves the
   * privacy claim on the screen, which is that the paragraph is the only thing
   * that leaves.
   */
  let sent = null;
  /*
   * DeepSeek's shape, not Anthropic's, because that is what this app now asks
   * by default — and it is the harder of the two to get right: the system
   * prompt is a message rather than a field, and the tool arguments come back
   * as a JSON *string*, which is the one place a perfectly good HTTP 200 can
   * still carry unparseable content.
   */
  const TOOL_INPUT = {
    headline: 'מעצבת מוצר',
    works: [
      {
        title: 'אתר תדמית למספרה', kind: 'site', context: 'client', clientName: 'מספרת רון',
        team: 'alone', fromYear: 2024, fromMonth: 3, toYear: 2024, toMonth: 5,
        brief: 'לא היו באינטרנט בכלל.', did: ['עיצבתי בפיגמה', 'בניתי בלי תלויות'],
        tools: ['Figma', 'HTML'], result: 'התורים נקבעים דרך האתר.',
      },
      /* Everything below is what a wrong or hostile answer looks like. */
      { title: 'עבודה עם סוג מומצא', kind: 'SUPER_KIND', context: 'nope', team: 'x', fromYear: 3024 },
      { title: '', brief: 'בלי שם' },
      { title: 'קישור אסור', kind: 'site', links: [{ url: 'javascript:alert(1)' }] },
    ],
    missing: ['שנים', 'מה יצא'],
  };

  await page.route('https://api.deepseek.com/**', async (route) => {
    sent = route.request().postData();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{
              type: 'function',
              function: { name: 'fill_portfolio', arguments: JSON.stringify(TOOL_INPUT) },
            }],
          },
        }],
      }),
    });
  });
  await page.evaluate(() => window.localStorage.setItem('fitai.key.deepseek', 'sk-' + 'x'.repeat(28)));
  await page.reload({ waitUntil: 'load' });
  await page.getByLabel('מה עשית?', { exact: true }).fill(PARAGRAPH);
  await page.getByRole('button', { name: 'תרכיב לי את התיק' }).click();
  await page.waitForSelector('.readlist', { timeout: 20000 });

  check(!!sent, 'the model button sent no request');
  const body = JSON.parse(sent || '{}');
  check(body.tools && body.tools[0] && body.tools[0].function
    && body.tools[0].function.name === 'fill_portfolio',
    'the request was not built in the OpenAI-compatible shape this vendor wants');
  check((body.messages || [])[0] && body.messages[0].role === 'system',
    'the system prompt was sent as a field, which is the other vendor\'s shape');
  check(String(body.model || '').startsWith('deepseek'), `the request names model "${body.model}"`);
  check(JSON.stringify(body.messages || []).includes('מספרה'), 'the paragraph was not in the request');
  check(!JSON.stringify(body).includes('6961234'), 'the phone number was sent to the model');
  check(!JSON.stringify(body).includes('noabar.co.il'), "the person's site was sent to the model");

  const fromModel = await page.evaluate(() => window.portfolio.store.get().works.map((w) => ({
    title: w.title, kind: w.kind, context: w.context, links: w.links.length, from: w.period.fromYear,
  })));
  check(fromModel.length === 3, `${fromModel.length} works survived normalising, not 3`);
  check(fromModel[1].kind === 'other' && fromModel[1].context === 'personal',
    `an invented enum survived as ${fromModel[1].kind}/${fromModel[1].context}`);
  check(fromModel[1].from === null, 'a year in the year 3024 survived');
  check(fromModel[2].links === 0, 'a javascript: link from the model reached a work');
  check((await page.locator('.readlist li').count()) === 3, 'the report does not list what was added');
  check((await page.textContent('.callout.good')).includes('המודל קרא'), 'the screen does not say the model ran');
  await shot('03-model');

  await page.getByRole('button', { name: 'בטל את ההוספה' }).click();
  await page.unroute('https://api.deepseek.com/**');
  await page.evaluate(() => window.localStorage.removeItem('fitai.key.deepseek'));

  /* ---- the rest of the details, on the tab that holds all of them ---- */

  await page.getByRole('button', { name: 'פרטים' }).click();
  await page.getByLabel('במשפט אחד', { exact: true }).fill('מעצבת מוצר');
  await page.getByLabel('אימייל', { exact: true }).fill('noa@example.com');
  await page.waitForTimeout(600);
  check((await page.locator('.explain h3').textContent()).includes('נועה בר'),
    'the name typed on the quick screen did not reach the details screen');
  await shot('04-owner');
  await page.getByRole('button', { name: 'לעבודות ←' }).click();

  /* ---- one work ---- */

  await page.getByRole('button', { name: '+ עבודה חדשה' }).click();
  await page.waitForSelector('.explain');
  const beforeTyping = await page.locator('.explain .opening').textContent();

  await page.getByLabel('שם העבודה', { exact: true }).fill(WORK.title);
  await page.getByLabel('סוג העבודה', { exact: true }).selectOption('app');
  await page.getByLabel('התפקיד שלי', { exact: true }).fill(WORK.role);
  await page.getByLabel('באיזו מסגרת', { exact: true }).selectOption('client');
  await page.getByLabel('שם הלקוח', { exact: true }).fill('מספרת רון');
  await page.getByLabel('לבד או בצוות', { exact: true }).selectOption('team');
  await page.getByLabel('שנת התחלה', { exact: true }).fill('2024');
  await page.getByLabel('חודש התחלה', { exact: true }).selectOption('3');
  await page.getByLabel('שנת סיום', { exact: true }).fill('2024');
  await page.getByLabel('חודש סיום', { exact: true }).selectOption('5');
  await page.getByLabel('מה היה צריך', { exact: true }).fill(WORK.brief);
  await page.getByLabel('מה עשיתי', { exact: true }).fill(WORK.did);
  await page.getByLabel('כלים וטכנולוגיות', { exact: true }).fill(WORK.tools);
  await page.getByLabel('מה יצא מזה', { exact: true }).fill(WORK.result);

  const opening = await page.locator('.explain .opening').textContent();
  check(opening !== beforeTyping, 'the explanation did not change while the form was being filled');
  check(opening.includes('זו אפליקציה שבניתי ללקוח מספרת רון'),
    `the explanation reads "${opening}"`);
  check(opening.includes('בין מרץ למאי 2024'), `the period is not in the explanation — "${opening}"`);
  check(opening.includes('עבדתי עליה בצוות'), `the team sentence disagrees with the kind — "${opening}"`);
  check(!(await page.locator('.gaps').count()),
    'a work with every field answered is still reported as missing something');
  await shot('02-editor');

  await page.getByRole('button', { name: 'שמירה וחזרה' }).click();
  await page.waitForSelector('.workrow');

  /* ---- a reload, which is the only proof that any of it was stored ---- */

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tabs');
  await page.getByRole('button', { name: 'העבודות' }).click();
  await page.waitForSelector('.workrow');
  const rowTitle = await page.locator('.workrow .namebtn').first().textContent();
  check(rowTitle === WORK.title, `after a reload the work is called "${rowTitle}"`);
  check((await page.locator('.workrow .gapline.ok').count()) === 1,
    'after a reload the work no longer counts as complete');
  await shot('03-works');

  /* ---- a second work, moved and then deleted ---- */

  /*
   * Order is the person's, not a sort, so it is a pair of buttons — and the
   * order in the list has to be the order in the document, which is the part a
   * count of rows would not notice.
   */
  await page.getByRole('button', { name: '+ עבודה חדשה' }).click();
  await page.getByLabel('שם העבודה', { exact: true }).fill('עבודה שנייה');
  await page.getByRole('button', { name: 'שמירה וחזרה' }).click();
  await page.waitForSelector('.workrow');
  check((await page.locator('.workrow').count()) === 2, 'a second work did not appear in the list');

  await page.locator('.workrow').nth(1).getByRole('button', { name: 'העלאה למעלה ברשימה' }).click();
  check((await page.locator('.workrow .namebtn').first().textContent()) === 'עבודה שנייה',
    'moving a work up did not move it');
  check(await page.locator('.workrow').nth(0).getByRole('button', { name: 'העלאה למעלה ברשימה' }).isDisabled(),
    'the first work can still be moved up');

  await page.getByRole('button', { name: 'הקובץ' }).click();
  await page.waitForSelector('iframe.preview');
  const ordered = await page.getAttribute('iframe.preview', 'srcdoc');
  const second = ordered.indexOf('עבודה שנייה');
  const first = ordered.indexOf('מספרת רון');
  /* Both indices are checked, because -1 &lt; anything: an assertion that only
   * compared them would have passed on a document missing a work entirely. */
  check(second >= 0 && first >= 0, 'one of the two works is missing from the document');
  check(second < first, 'the order in the list is not the order in the document');
  check(ordered.includes('<nav class="toc">') === false, 'two works should not get a contents list');

  await page.getByRole('button', { name: 'העבודות' }).click();
  await page.locator('.workrow .namebtn').first().click();
  await page.getByRole('button', { name: 'מחיקת העבודה' }).click();
  check((await page.locator('.modal-box').count()) === 1, 'deleting a work did not ask first');
  await page.getByRole('button', { name: 'ביטול' }).click();
  check((await page.locator('.workrow').count()) === 0, 'cancelling the dialog left the list showing');
  await page.getByRole('button', { name: 'מחיקת העבודה' }).click();
  await page.getByRole('button', { name: 'כן, למחוק' }).click();
  await page.waitForSelector('.workrow');
  check((await page.locator('.workrow').count()) === 1, 'deleting a work left it in the list');
  check((await page.locator('.workrow .namebtn').first().textContent()) === WORK.title,
    'deleting a work took the wrong one');

  /* ---- a photograph, which is the only thing here that leaves the browser bigger than it arrived ---- */

  /*
   * The picture path is the one that cannot be checked without a browser at all:
   * a File is read, drawn to a canvas, resized and re-encoded, and what comes
   * out is a JPEG data URL whether a PNG went in. Node has none of those.
   */
  const png = join(downloads, 'shot.png');
  await writeFile(png, makePng(2400, 1200));
  await page.locator('.workrow .namebtn').first().click();
  await page.waitForSelector('.explain');
  await page.setInputFiles('.formcard .filebtn input[type="file"]', png);
  await page.waitForSelector('.thumb img');
  const thumb = await page.getAttribute('.thumb img', 'src');
  check(thumb.startsWith('data:image/jpeg;base64,'), `the picture was stored as "${thumb.slice(0, 30)}…"`);
  /* Measured through the browser's own decoder: what went in was 2400px wide,
   * and what is being stored has to be the resized copy — the quota is a few
   * megabytes and a phone photograph is several. */
  const stored = await page.evaluate((src) => new Promise((done) => {
    const img = new Image();
    img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight, bytes: src.length });
    img.onerror = () => done({ w: 0, h: 0, bytes: 0 });
    img.src = src;
  }), thumb);
  check(stored.w === IMAGE_MAX_PX, `the picture was stored ${stored.w}px wide, not ${IMAGE_MAX_PX}`);
  check(stored.h === IMAGE_MAX_PX / 2, `the resize did not keep the proportions: ${stored.w}×${stored.h}`);
  check(stored.bytes < 400000, `a resized picture still costs ${Math.round(stored.bytes / 1024)}KB of the quota`);
  await page.locator('.thumb input').fill('עמוד הבית');
  await page.getByRole('button', { name: '+ קישור' }).click();
  await page.locator('.linkrow input').first().fill('לאתר');
  await page.locator('.linkrow input').nth(1).fill('example.com/ronbarber');
  await page.getByRole('button', { name: 'שמירה וחזרה' }).click();
  await page.waitForSelector('.workrow');

  /*
   * An edit that is abandoned mid-keystroke by switching tabs.
   *
   * The editor writes to storage on a short delay, so the last thing typed is
   * still only in the draft when the tab changes. Leaving the screen has to
   * flush it — this is the check that noticed the screens were being painted
   * over without being told they were finished.
   */
  await page.locator('.workrow .namebtn').first().click();
  await page.getByLabel('התפקיד שלי', { exact: true }).fill('עיצוב, פיתוח ואפיון');
  await page.getByRole('button', { name: 'הקובץ' }).click();
  await page.waitForSelector('iframe.preview');
  check((await page.getAttribute('iframe.preview', 'srcdoc')).includes('עיצוב, פיתוח ואפיון'),
    'an edit was lost by leaving the editor before its save landed');

  /* Coming back lands where the work was left, not on the list. */
  await page.getByRole('button', { name: 'העבודות' }).click();
  await page.waitForSelector('.explain');
  check((await page.getByLabel('התפקיד שלי', { exact: true }).inputValue()) === 'עיצוב, פיתוח ואפיון',
    'the editor did not reopen on the work that was being edited');
  await page.getByRole('button', { name: '→ חזרה לרשימה' }).click();
  await page.waitForSelector('.workrow');

  /* ---- the file ---- */

  await page.getByRole('button', { name: 'הקובץ' }).click();
  await page.waitForSelector('iframe.preview');
  const srcdoc = await page.getAttribute('iframe.preview', 'srcdoc');
  check(srcdoc && srcdoc.includes('<!DOCTYPE html>'), 'the preview is not the document');
  check(srcdoc.includes('זו אפליקציה שבניתי ללקוח מספרת רון'),
    'the explanation from the editor is not in the previewed file');
  await shot('04-file');

  /*
   * "הדפסה / PDF" is how most people will turn this into a PDF, and until now
   * nothing had ever pressed it. Headless Chromium's print() returns without a
   * dialog, so what is checked is the part that can be wrong on a real machine:
   * that the frame it prints holds the document itself rather than the app.
   */
  await page.getByRole('button', { name: 'הורדה כ-PDF' }).click();
  await page.waitForFunction(() => document.querySelectorAll('iframe').length > 1, null, { timeout: 20000 });
  const printFrame = await page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const last = frames[frames.length - 1];
    return { doc: (last.srcdoc || '').slice(0, 15), hidden: getComputedStyle(last).opacity };
  });
  check(printFrame.doc === '<!DOCTYPE html>', 'printing does not print the document');
  check(printFrame.hidden === '0', 'the print frame is visible on the page');
  /* The dialog is modal, so the one instruction that is not obvious has to be
   * on the page before it opens. */
  check((await page.textContent('.filecard')).includes('שמירה כ-PDF'),
    'the PDF button does not say what to choose in the dialog');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'הורדת הקובץ' }).click(),
  ]);
  const saved = join(downloads, 'portfolio.html');
  await download.saveAs(saved);
  /*
   * The name the browser actually saved it under, which is the reason
   * `fileNameFor` is ASCII. This container runs a POSIX locale, and Chromium on
   * one of those throws away a `download` attribute with Hebrew in it — the
   * file arrives called "download", with no extension and nothing to open it
   * with. The assertion is the extension, because that is the part that decides
   * whether a double-click shows a portfolio or a text editor.
   */
  const suggested = download.suggestedFilename();
  check(suggested.endsWith('.html'), `the download is named "${suggested}" — it lost its extension`);
  check(/^[\x20-\x7e]+$/.test(suggested), `the download name did not survive the trip: "${suggested}"`);

  const fileText = await readFile(saved, 'utf8');
  check(fileText === srcdoc, 'the downloaded file is not byte for byte what the preview showed');
  check(fileText.length > 1500, `the downloaded file is ${fileText.length} bytes`);

  /* ---- a backup, a wipe, and a restore ---- */

  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'הורדת גיבוי' }).click(),
  ]);
  const backupPath = join(downloads, 'backup.json');
  await backup.saveAs(backupPath);

  await page.getByRole('button', { name: 'מחיקת הכל' }).click();
  await page.getByRole('button', { name: 'כן, למחוק' }).click();
  await page.waitForTimeout(200);
  check((await page.getAttribute('iframe.preview', 'srcdoc')).includes('התיק הזה עדיין ריק'),
    'deleting everything left works in the document');

  await page.setInputFiles('.filebtn input[type="file"]', backupPath);
  await page.waitForTimeout(400);
  const restored = await page.getAttribute('iframe.preview', 'srcdoc');
  check(restored.includes('מספרת רון'), 'the backup did not restore the work');
  check(restored === srcdoc.replace(/עודכן ב[^<]*/, restored.match(/עודכן ב[^<]*/) || ''),
    'the document after a restore is not the document before the backup');

  /* ---- the two devices that will not keep the answer ---- */

  /*
   * Both messages exist because they say different things to do, and neither
   * had ever been rendered by anything. localStorage is broken in the page
   * before the app loads, which is what a private window or a locked-down
   * browser looks like from inside.
   */
  const blocked = await context.newPage();
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError: storage is disabled'); },
    });
  });
  await blocked.goto(base, { waitUntil: 'load' });
  await blocked.waitForSelector('.tabs');
  const blockedText = await blocked.evaluate(() => document.body.innerText);
  check(blockedText.includes('הדפדפן הזה לא שומר'), 'a browser that cannot save is not told so on arrival');
  check((await blocked.evaluate(() => window.portfolio.store.persists())) === false,
    'the app claims to persist on a device where storage throws');
  check((await blocked.evaluate(() => window.portfolio.html({ now: new Date() }).slice(0, 15))) === '<!DOCTYPE html>',
    'a device that cannot save also cannot export, which is the one thing left to do');
  await blocked.close();

  const full = await context.newPage();
  await full.addInitScript(() => {
    const real = window.localStorage;
    const quota = () => {
      const e = new Error('exceeded');
      e.name = 'QuotaExceededError';
      throw e;
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({
        getItem: (k) => real.getItem(k),
        removeItem: (k) => real.removeItem(k),
        setItem: (k, v) => (k.endsWith('.probe') ? real.setItem(k, v) : quota()),
      }),
    });
  });
  await full.goto(base, { waitUntil: 'load' });
  await full.waitForSelector('.tabs');
  await full.getByLabel('איך קוראים לך', { exact: true }).fill('מי שאין לו מקום');
  /* Waited for rather than asserted on, and the absence is a reported failure
   * rather than a timeout — a check that dies takes the rest of the run with
   * it, and this one sits before the file:// pass. */
  const warned = await full.waitForSelector('.warnbox.hot', { timeout: 10000 }).then(() => true, () => false);
  check(warned, 'a device with no room left says nothing on the details screen');
  const fullText = warned ? await full.locator('.warnbox.hot').first().textContent() : '';
  check(fullText.includes('אין מקום'), `a full device says "${fullText.slice(0, 40)}…"`);
  check((await full.getByLabel('איך קוראים לך', { exact: true }).inputValue()) === 'מי שאין לו מקום',
    'a save that failed also took the answer out of the form');
  await full.close();

  /* ---- the file, opened the way it will be opened ---- */

  server.close();
  const reader = await context.newPage();
  const readerErrors = [];
  reader.on('pageerror', (e) => readerErrors.push(`pageerror: ${e.message}`));
  reader.on('console', (m) => { if (m.type() === 'error') readerErrors.push(`console: ${m.text()}`); });
  reader.on('dialog', async (d) => { dialogs += 1; await d.dismiss(); });
  await reader.goto(pathToFileURL(saved).href, { waitUntil: 'load' });

  const seen = await reader.evaluate(() => ({
    scripts: document.querySelectorAll('script').length,
    iframes: document.querySelectorAll('iframe').length,
    articles: document.querySelectorAll('article.work').length,
    heading: (document.querySelector('article.work h2') || {}).textContent || '',
    opening: (document.querySelector('.opening') || {}).textContent || '',
    sections: Array.from(document.querySelectorAll('.sec h3')).map((n) => n.textContent),
    bullets: document.querySelectorAll('.sec li').length,
    chips: Array.from(document.querySelectorAll('.chip')).map((n) => n.textContent),
    images: document.querySelectorAll('.shots img').length,
    imageSrc: ((document.querySelector('.shots img') || {}).getAttribute
      ? document.querySelector('.shots img').getAttribute('src') : '').slice(0, 23),
    caption: (document.querySelector('.shots figcaption') || {}).textContent || '',
    dir: document.documentElement.getAttribute('dir'),
    lang: document.documentElement.getAttribute('lang'),
    externals: Array.from(document.querySelectorAll('[src], link[href]'))
      .map((n) => n.getAttribute('src') || n.getAttribute('href'))
      .filter((u) => u && !u.startsWith('data:')),
    bodyText: document.body.innerText.slice(0, 4000),
  }));

  check(seen.scripts === 0, `the exported file contains ${seen.scripts} script elements`);
  check(seen.iframes === 0, `the exported file contains ${seen.iframes} iframes`);
  check(dialogs === 0, `something in the file ran and opened ${dialogs} dialog(s)`);
  check(seen.articles === 1, `the exported file has ${seen.articles} works in it, not 1`);
  check(seen.heading === WORK.title,
    `the title came out of the parser as "${seen.heading}" — the script tag was not text`);
  check(seen.bodyText.includes('<script>alert(1)</script>'),
    'the title is not shown to the reader as the text that was typed');
  check(seen.opening.includes('זו אפליקציה שבניתי ללקוח מספרת רון'), 'the explanation is missing from the file');
  check(JSON.stringify(seen.sections) === JSON.stringify(['מה היה צריך', 'מה עשיתי', 'מה יצא מזה']),
    `the file's sections are ${JSON.stringify(seen.sections)}`);
  check(seen.bullets === 3, `three lines of "מה עשיתי" produced ${seen.bullets} bullets`);
  check(seen.chips.includes('Figma') && seen.chips.includes('CSS'), 'the tools are missing from the file');
  check(seen.images === 1, `the file carries ${seen.images} pictures, not 1`);
  check(seen.imageSrc === 'data:image/jpeg;base64,', `the picture is not embedded: "${seen.imageSrc}"`);
  check(seen.caption === 'עמוד הבית', `the caption came out "${seen.caption}"`);
  check(seen.dir === 'rtl' && seen.lang === 'he', `the file is ${seen.lang}/${seen.dir}`);
  check(seen.externals.length === 0,
    `the file asks the network for ${JSON.stringify(seen.externals.slice(0, 3))} — it is not self-contained`);
  check(readerErrors.length === 0, `the file logged errors when opened: ${readerErrors.slice(0, 2).join(' | ')}`);

  if (SHOTS) await reader.screenshot({ path: join(SHOT_DIR, '05-exported-file.png'), fullPage: true });

  /* Printing is what turns the file into a PDF, and an empty print stylesheet
   * is a thing nobody notices until somebody prints. */
  await reader.emulateMedia({ media: 'print' });
  const printed = await reader.evaluate(() => {
    const link = document.querySelector('.links a');
    return {
      background: getComputedStyle(document.body).backgroundColor,
      links: document.querySelectorAll('.links a').length,
      linkAfter: link ? getComputedStyle(link, '::after').content : 'none',
      linkDirection: link ? getComputedStyle(link).direction : '',
      headingBreak: getComputedStyle(document.querySelector('h2')).breakAfter,
      figureBreak: getComputedStyle(document.querySelector('figure')).breakInside,
    };
  });
  check(printed.links === 1, `the document has ${printed.links} links, so the print rule for addresses is untested`);
  /* On paper the address has to be printed beside the text, because a printed
   * link is only its text. This is the rule that says so, resolved by the
   * browser rather than read out of the stylesheet. */
  check(printed.linkAfter.includes('https://example.com/ronbarber'),
    `printed links do not carry their address: ${printed.linkAfter}`);
  check(printed.linkDirection === 'ltr', 'an address is laid out by the RTL paragraph around it');
  check(printed.figureBreak === 'avoid', `a picture may be split across pages: "${printed.figureBreak}"`);
  check(printed.headingBreak === 'avoid', `printed headings break after with "${printed.headingBreak}"`);
  check(printed.background === 'rgb(255, 255, 255)' || printed.background === 'rgba(0, 0, 0, 0)',
    `the printed page background is ${printed.background}`);
  if (SHOTS) await reader.screenshot({ path: join(SHOT_DIR, '06-print.png'), fullPage: true });
  await reader.emulateMedia({ media: 'screen' });

  /* ---- the single-file build of the app itself ---- */

  /*
   * Not the same claim as the exported document. This one is the app bundled
   * into one file, opened off the disk with no server — where localStorage is
   * usually refused, which is exactly the case the store degrades into and the
   * banner warns about. If the bundle has not been built, the check says so
   * rather than passing quietly.
   */
  const bundle = resolve(ROOT, 'dist/portfolio.html');
  if (existsSync(bundle)) {
    const offline = await context.newPage();
    const offlineErrors = [];
    offline.on('pageerror', (e) => offlineErrors.push(`pageerror: ${e.message}`));
    await offline.goto(pathToFileURL(bundle).href, { waitUntil: 'load' });
    await offline.waitForSelector('.tabs', { timeout: 20000 });
    const built = await offline.evaluate(() => ({
      tabs: document.querySelectorAll('.tabs .btn').length,
      persists: window.portfolio.store.persists(),
      doc: window.portfolio.html({ now: new Date('2026-08-12T09:00:00Z') }).slice(0, 15),
      warned: document.body.innerText.includes('לא שומר'),
    }));
    check(built.tabs === 4, `the bundle opened with ${built.tabs} tabs`);
    check(built.doc === '<!DOCTYPE html>', 'the bundle cannot build a document');
    check(built.persists || built.warned, 'the bundle cannot save and does not say so');
    check(offlineErrors.length === 0, `the bundle logged ${offlineErrors.join(' | ')}`);
    if (SHOTS) await offline.screenshot({ path: join(SHOT_DIR, '07-single-file.png'), fullPage: true });
    await offline.close();
  } else {
    notes.push('skipped: dist/portfolio.html is not built (node tools/build-single.js portfolio/index.html dist/portfolio.html)');
    console.log('  note  dist/portfolio.html not built — the single-file check did not run');
  }

  for (const e of consoleErrors) failures.push(e);

  await rm(downloads, { recursive: true, force: true });
  await finish(browser, server);
}

async function finish(browser, server) {
  await browser.close();
  try { server.close(); } catch { /* already closed before the file:// pass */ }
  if (process.argv.includes('--verbose')) for (const n of notes) console.log('  ' + n);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`\nall good — ${notes.length} checks passed, and the exported file opens off the disk.`);
  if (SHOTS) console.log(`shots in ${SHOT_DIR}`);
}

if (!existsSync(resolve(ROOT, 'portfolio/index.html'))) {
  console.error('portfolio/index.html is missing — nothing to smoke');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
