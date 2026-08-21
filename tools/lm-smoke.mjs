#!/usr/bin/env node
/*
 * lm-smoke.mjs — drives lm/index.html in a real browser.
 *
 * The arithmetic is checked in lm-check.mjs; what is checked here is everything
 * that only exists once the page is running. That the loop actually trains
 * inside a frame budget rather than freezing the tab. That the loss on screen
 * falls below the line the page draws for random guessing. That a model can be
 * saved to a file and loaded back — which is the one operation on this page that
 * crosses the CSP, since the download is a blob URL on an origin whose policy is
 * default-src 'none'. And that a text too short to train on says so instead of
 * throwing.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/lm-smoke.mjs
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/lm-smoke.mjs --shots
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
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

const number = (text) => Number(String(text).replace(/[^\d.]/g, ''));

const { server, port } = await serve();
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

const problems = [];
const requested = [];
page.on('request', (r) => requested.push(r.url()));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
  });
});

/* The app is served from a subpath here for the same reason the FitAI smoke
 * test does it: Pages serves this repository under /Fitai-app901/, and one
 * absolute path anywhere in the module graph would 404 there and nowhere else. */
await page.goto(`http://127.0.0.1:${port}/lm/index.html`, { waitUntil: 'networkidle' });

/* ---------------------------------------------------------------- start */

/* Nothing large may be on the critical path. Together the corpora and the
 * trained model are well over a megabyte, and a page that pulls them before
 * anyone has asked for a corpus or pressed a button is a page nobody opens
 * twice on a phone. */
const eager = requested.filter((u) => /\/(code|general|agents)\.js/.test(u));
check(eager.length === 0, `loaded before being asked for: ${eager.join(', ')}`);
const boot = requested.filter((u) => u.endsWith('.js')).length;
notes.push(`first paint pulled ${boot} modules, none of them a corpus`);

const paramsText = await page.textContent('#params');
check(/משקלים/.test(paramsText), `the parameter count did not render: ${paramsText}`);
notes.push(`fresh page: ${paramsText}, ${await page.textContent('#text-stats')}`);

const noise = await page.textContent('#out');
check(noise.length > 100, 'an untrained model wrote nothing');
check(await page.getAttribute('#out', 'class') === 'out idle', 'untrained output is not marked as idle');

const vocab = await page.evaluate(() => {
  const text = document.querySelector('#corpus').value;
  return [...new Set(text)];
});
check([...noise].every((ch) => vocab.includes(ch)), 'the model emitted a character that is not in the text');

/* ---------------------------------------------------------------- training */

await page.click('#train');
check(await page.textContent('#train') === 'עצור', 'the train button did not turn into a stop button');

/* Responsiveness is the whole design of the training loop, so it gets asserted
 * rather than assumed: a click has to land while the model is training. */
const clickStart = Date.now();
await page.click('#prompt');
const clickTook = Date.now() - clickStart;
check(clickTook < 900, `the page took ${clickTook}ms to accept a click while training`);

await page.waitForFunction(() => {
  const steps = Number(document.querySelector('#s-steps').textContent.replace(/[^\d]/g, ''));
  return steps >= 800;
}, null, { timeout: 60000 });

const rate = number(await page.textContent('#s-rate'));
const trainLoss = number(await page.textContent('#s-train'));
const valLoss = number(await page.textContent('#s-val'));
const baseline = Math.log(vocab.length);

check(rate > 20, `only ${rate} steps per second`);
check(trainLoss < baseline - 1, `training loss ${trainLoss} did not fall below random guessing (${baseline.toFixed(2)})`);
check(valLoss > 0 && valLoss < baseline - 1, `held-out loss ${valLoss} did not fall below random guessing`);
notes.push(`after 800 steps: train ${trainLoss}, held out ${valLoss}, random guessing ${baseline.toFixed(2)}, ${rate}/s`);

const auto = await page.textContent('#out');
check(auto !== noise, 'the automatic sample never refreshed during training');
check(/צעדים/.test(await page.textContent('#out-label')), 'the sample is not labelled with a step count');

if (SHOTS) {
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, 'lm-training.png'), fullPage: true });
}

await page.click('#train');
check(await page.textContent('#train') === 'המשך אימון', 'stopping did not offer to continue');
const stopped = await page.textContent('#s-steps');
await page.waitForTimeout(400);
check(await page.textContent('#s-steps') === stopped, 'the model kept training after stop');

/* The curve has to survive a resize. Setting a canvas's width clears it, and
 * when nothing is training there is no next frame to draw it again — so a phone
 * turned sideways, or a window dragged wider, used to leave an empty box where
 * the run was. Count the lit pixels, resize, count them again. */
const litPixels = () => page.evaluate(() => {
  const c = document.querySelector('#chart');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
  return n;
});
const beforeResize = await litPixels();
check(beforeResize > 500, `the loss curve drew only ${beforeResize} pixels`);
await page.setViewportSize({ width: 900, height: 1000 });
await page.waitForTimeout(300);
const afterResize = await litPixels();
check(afterResize > 500, `the loss curve vanished on resize: ${beforeResize} pixels before, ${afterResize} after`);
await page.setViewportSize({ width: 1280, height: 1000 });
await page.waitForTimeout(300);
notes.push(`curve pixels: ${beforeResize} drawn, ${afterResize} after a resize`);

/* ---------------------------------------------------------------- writing */

await page.fill('#prompt', 'שבוע 3');
await page.click('#write');
const written = await page.textContent('#out');
check(written.length > 100, 'the write button produced nothing');
check([...written].every((ch) => vocab.includes(ch)), 'writing emitted a character outside the vocabulary');
check(/לבקשתך/.test(await page.textContent('#out-label')), 'a manual sample was not labelled as one');
notes.push(`sample: ${JSON.stringify(written.slice(0, 70))}`);

/* ---------------------------------------------------------------- the file */

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
  page.click('#export'),
]);
check(!!download, 'saving a model produced no download — the CSP on this page may be blocking blob URLs');

let savedPath = null;
if (download) {
  savedPath = await download.path();
  const file = JSON.parse(await readFile(savedPath, 'utf8'));
  check(file.format === 'dumb-lm/1', `the saved file has the wrong format tag: ${file.format}`);
  check(Array.isArray(file.weights?.W1) && file.weights.W1.length > 0, 'the saved file has no weights');
  check(file.meta?.steps > 0, 'the saved file does not record how long it trained');
  notes.push(`saved ${download.suggestedFilename()}, ${(JSON.stringify(file).length / 1048576).toFixed(2)} MB`);

  /* Reload the page first, so the import is really rebuilding a model from the
   * file rather than finding one already in memory. */
  await page.reload({ waitUntil: 'networkidle' });
  await page.setInputFiles('#import', savedPath);
  await page.waitForFunction(() => !document.querySelector('#file-msg').hidden, null, { timeout: 10000 });
  const msg = await page.textContent('#file-msg');
  check(/נטען מודל/.test(msg), `importing a model reported: ${msg}`);
  check(await page.getAttribute('#file-msg', 'class') === 'msg good', `importing a good file was flagged: ${msg}`);

  await page.click('#write');
  const afterImport = await page.textContent('#out');
  check(afterImport.length > 100, 'an imported model wrote nothing');
  check(number(await page.textContent('#s-steps')) === 0, 'an imported model claims to have trained in this tab');
  notes.push(`imported: ${JSON.stringify(afterImport.slice(0, 70))}`);

  /* Whether the imported weights are really the ones being used is not
   * something the samples can settle — a well-trained model and a fresh one
   * both produce Hebrew-looking rubbish to a test. The loss can settle it. Take
   * a few dozen steps and read it: a model carrying 800 steps of training
   * resumes near where it left off, and a model that quietly re-initialised
   * would be up at ln(V). */
  await page.click('#train');
  await page.waitForFunction(() => {
    const steps = Number(document.querySelector('#s-steps').textContent.replace(/[^\d]/g, ''));
    return steps >= 60;
  }, null, { timeout: 30000 });
  const resumed = number(await page.textContent('#s-train'));
  await page.click('#train');
  check(resumed < 1.5, `an imported model resumed at loss ${resumed}, as if it had never trained`);
  notes.push(`resumed training at loss ${resumed} (random guessing is ${baseline.toFixed(2)})`);
}

/* The model that ships with the page: a module imported on demand, so that a
 * visitor who does not want to wait for training can see a trained one write.
 * The manifest that labels the button must describe the model the button
 * actually loads — they are generated together and can drift apart if one is
 * regenerated alone. */
await page.reload({ waitUntil: 'networkidle' });
const trainedNote = await page.textContent('#trained-note');
check(/צעדים/.test(trainedNote), `the trained model is not described: ${trainedNote}`);

await page.click('#load-trained');
await page.waitForFunction(
  () => /נטען מודל/.test(document.querySelector('#file-msg').textContent),
  null, { timeout: 30000 },
);
const trainedMsg = await page.textContent('#file-msg');
const notedSteps = (trainedNote.match(/[\d,]+/) || ['0'])[0];
check(notedSteps.length > 0 && trainedMsg.includes(notedSteps),
  `the button promised ${notedSteps} steps and loaded: ${trainedMsg}`);
await page.click('#write');
const trainedText = await page.textContent('#out');
check(trainedText.length > 100, 'the shipped trained model wrote nothing');
notes.push(`shipped model: ${trainedNote.trim()} → ${JSON.stringify(trainedText.slice(0, 60))}`);

/* A file that is not a model must be refused with a message, not a stack trace. */
await page.setInputFiles('#import', {
  name: 'not-a-model.json',
  mimeType: 'application/json',
  buffer: Buffer.from('{"format":"gpt-5","weights":{}}'),
});
await page.waitForFunction(
  () => document.querySelector('#file-msg').className.includes('bad'),
  null, { timeout: 8000 },
);
check(/לא נטען/.test(await page.textContent('#file-msg')), 'a junk model file was not refused clearly');

/* ---------------------------------------------------------------- corpora */

/* The three agent-written corpora are ES modules imported on demand, which is
 * the only way this page can load half a megabyte of text while keeping
 * connect-src at 'none'. What that buys has to be checked from the page: that
 * choosing one really replaces the text, that the model is rebuilt around its
 * larger alphabet, and that it trains. */
await page.reload({ waitUntil: 'networkidle' });
const options = await page.$$eval('#corpus-pick option', (os) => os.map((o) => o.value));
check(options.join(',') === 'log,code,general,both,custom', `the picker offers ${options.join(', ')}`);

await page.selectOption('#corpus-pick', 'code');
await page.waitForFunction(
  () => document.querySelector('#corpus').value.length > 50000 && !document.querySelector('#corpus-pick').disabled,
  null, { timeout: 30000 },
);
check(requested.some((u) => /\/code\.js/.test(u)), 'choosing the code corpus did not import it');
const codeText = await page.inputValue('#corpus');
check(/function |def |const /.test(codeText), 'the code corpus does not look like code');
check(/^(?:\/\/|#|--) ?[\w@][\w./@-]*\.\w{1,5}$/m.test(codeText), 'the code corpus lost the file-path headers its snippets are split on');
check(number(await page.textContent('#s-steps')) === 0, 'switching corpus did not start a fresh model');
notes.push(`code corpus in the page: ${codeText.length.toLocaleString()} characters, ${new Set(codeText).size} distinct`);

await page.click('#train');
await page.waitForFunction(() => {
  const steps = Number(document.querySelector('#s-steps').textContent.replace(/[^\d]/g, ''));
  return steps >= 400;
}, null, { timeout: 60000 });
await page.click('#train');
const codeLoss = number(await page.textContent('#s-train'));
const codeBaseline = Math.log(new Set(codeText).size);
check(codeLoss < codeBaseline - 0.8, `training on code went from ${codeBaseline.toFixed(2)} to ${codeLoss} in 400 steps`);
notes.push(`code corpus after 400 steps: ${codeLoss} against random guessing ${codeBaseline.toFixed(2)}`);

await page.selectOption('#corpus-pick', 'both');
await page.waitForFunction(
  () => document.querySelector('#corpus').value.length > 100000 && !document.querySelector('#corpus-pick').disabled,
  null, { timeout: 30000 },
);
const bothText = await page.inputValue('#corpus');
check(/[֐-׿]/.test(bothText) && /function |def |const /.test(bothText),
  'the combined corpus is missing one of its two halves');
check(bothText.length > codeText.length, 'the combined corpus is no larger than the code corpus alone');
notes.push(`combined corpus: ${bothText.length.toLocaleString()} characters, ${new Set(bothText).size} distinct`);

/* Typing over a chosen corpus makes it yours, and the picker has to say so. */
await page.fill('#corpus', 'שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום');
await page.waitForTimeout(200);
check(await page.inputValue('#corpus-pick') === 'custom', 'editing the text left the picker claiming a corpus it no longer holds');

/* ---------------------------------------------------------------- edges */

await page.reload({ waitUntil: 'networkidle' });
await page.fill('#corpus', 'אבג');
await page.waitForFunction(
  () => document.querySelector('#text-msg').className.includes('bad'),
  null, { timeout: 8000 },
);
check(/קצר/.test(await page.textContent('#text-msg')), 'a text shorter than the context window was not explained');
check(await page.isDisabled('#train'), 'a text too short to train on left the train button live');

await page.fill('#corpus', 'abababababababababababababababababababab');
await page.waitForFunction(() => !document.querySelector('#train').disabled, null, { timeout: 8000 });
check(!(await page.isDisabled('#train')), 'a workable text did not re-enable training');
check(/נשמרים לבדיקה|קצר מדי/.test(await page.textContent('#text-msg')), 'the split was not explained');

/* Rebuilding on a slider must actually reset the run. */
await page.click('#train');
await page.waitForFunction(() => Number(document.querySelector('#s-steps').textContent.replace(/[^\d]/g, '')) > 60, null, { timeout: 20000 });
await page.fill('#hidden', '256');
await page.dispatchEvent('#hidden', 'change');
await page.waitForTimeout(300);
check(number(await page.textContent('#s-steps')) === 0, 'changing the model size did not start a fresh model');
check(await page.textContent('#train') === 'התחל אימון', 'a rebuilt model still offers to continue the old run');

const csp = await page.evaluate(() => window.__csp);
check(csp.length === 0, `content security policy violations: ${csp.join('; ')}`);
check(problems.length === 0, `browser errors: ${problems.join(' | ')}`);

await browser.close();
server.close();

if (notes.length) {
  console.log('lm-smoke notes:');
  for (const n of notes) console.log(`  · ${n}`);
}
if (failures.length) {
  console.error(`\nlm-smoke: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\nlm-smoke: all checks passed');
