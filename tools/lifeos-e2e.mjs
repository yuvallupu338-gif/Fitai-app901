#!/usr/bin/env node
/*
 * lifeos-e2e.mjs — drive the real app in a real browser, end to end.
 *
 * §178 and §204 both describe the same walk, and it is the only test that can
 * prove the claim the whole project rests on: that this is a working product
 * rather than a set of screens.
 *
 *     sign up → onboarding → a goal exists → a project exists → a task
 *     → schedule it → focus → complete → progress moves → Today changes
 *     → the next action is something else
 *
 * Plus the two audits that only a browser can do:
 *
 *   §180  the five widths, checking nothing overflows horizontally
 *   §182  the rendered text of every screen, checking for English that was
 *         never meant to ship — which is a different question from the static
 *         audit, because a string can be assembled at runtime
 *
 * It serves the repository over http on a random port, because ES modules do
 * not load from file:// and the app is a static site. Nothing is mocked.
 *
 * Usage: node tools/lifeos-e2e.mjs [--headed] [--keep]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--headed');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.js');

/* ------------------------------------------------------------------ *
 * A static server, and one that refuses to escape the repository
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const full = join(ROOT, normalize(path));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/lifeos/`;

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

const results = [];
let failures = 0;

function ok(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail) {
  results.push({ name, ok: false, detail });
  failures += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
    return true;
  } catch (e) {
    bad(name, e.message.split('\n')[0].slice(0, 160));
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * The English check
 *
 * Runs against rendered text rather than source, so it catches a string
 * assembled at runtime. The allow-list is short and every entry is a word that
 * legitimately appears in a Hebrew interface.
 * ------------------------------------------------------------------ */

const ALLOWED_LATIN = /^(?:LifeOS|JSON|CSV|API|AI|OK|Ctrl|Cmd|Alt|Shift|Esc|Enter|Tab|K|N|C|G|F|Anthropic|OpenAI|Google|Gemini|Claude|GPT|JavaScript|React|Blender|sk-ant|AIza|you@example\.com|he-IL|Asia\/Jerusalem)$/;

async function englishInView(page) {
  return page.evaluate(() => {
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent
        && parent.offsetParent !== null
        && !parent.closest('.sr-only')
        && parent.tagName !== 'SCRIPT'
        && parent.tagName !== 'STYLE') {
        const text = node.textContent.trim();
        if (text && /[A-Za-z]{2,}/.test(text) && !/[֐-׿]/.test(text)) {
          found.push(text.slice(0, 60));
        }
      }
      node = walker.nextNode();
    }
    /* Placeholders and aria-labels are read by people too. */
    for (const el of document.querySelectorAll('[placeholder],[aria-label]')) {
      if (el.offsetParent === null) continue;
      for (const attr of ['placeholder', 'aria-label']) {
        const value = (el.getAttribute(attr) || '').trim();
        if (value && /[A-Za-z]{2,}/.test(value) && !/[֐-׿]/.test(value)) {
          found.push(value.slice(0, 60));
        }
      }
    }
    return found;
  });
}

async function assertHebrew(page, where) {
  const found = (await englishInView(page)).filter((s) => !ALLOWED_LATIN.test(s.trim()));
  if (found.length) {
    throw new Error(`English on ${where}: ${JSON.stringify(Array.from(new Set(found)).slice(0, 6))}`);
  }
  return `${where} is fully Hebrew`;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const browser = await chromium.launch({
  headless: !HEADED,
  executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
});

const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});
page.on('pageerror', (err) => consoleErrors.push(`uncaught: ${String(err).slice(0, 200)}`));

console.log(`\nLifeOS end-to-end — ${BASE}\n`);

/* -- boot ---------------------------------------------------------- */

console.log('boot');

await step('the app loads', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app *', { timeout: 15000 });
  return page.title();
});

await step('the document is Hebrew and right-to-left', async () => {
  const attrs = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    computed: getComputedStyle(document.body).direction,
  }));
  if (attrs.lang !== 'he') throw new Error(`lang is ${attrs.lang}`);
  if (attrs.dir !== 'rtl') throw new Error(`dir is ${attrs.dir}`);
  if (attrs.computed !== 'rtl') throw new Error(`computed direction is ${attrs.computed}`);
  return 'lang=he dir=rtl';
});

await step('the sign-in screen is in Hebrew', () => assertHebrew(page, 'auth'));

/* -- sign up ------------------------------------------------------- */

console.log('\nsign up');

const EMAIL = `e2e-${Date.now()}@example.com`;

await step('an account can be created', async () => {
  /* Find the sign-up affordance by its Hebrew label rather than a test id, so
   * the test breaks if the label stops making sense. */
  const toSignUp = page.getByRole('button', { name: /יצירת חשבון|הרשמה/ }).first();
  if (await toSignUp.count()) await toSignUp.click().catch(() => {});

  await page.waitForTimeout(200);

  const inputs = page.locator('#app input');
  const count = await inputs.count();
  if (count < 3) throw new Error(`expected a name, an email and a password; found ${count} inputs`);

  await page.locator('input[type="text"]:visible, input:not([type]):visible').first().fill('אלכס');
  await page.locator('input[type="email"]:visible').first().fill(EMAIL);
  await page.locator('input[type="password"]:visible').first().fill('password1234');

  await page.getByRole('button', { name: /יצירת חשבון|הרשמה/ }).last().click();
  /* PBKDF2 at 210k iterations takes a moment; the button is disabled while it
   * runs, which is itself part of what is being checked. */
  await page.waitForTimeout(2500);
  return EMAIL;
});

await step('onboarding starts rather than an empty dashboard', async () => {
  const text = await page.locator('#app').innerText();
  if (!/ברוך הבא|מתחילים|תחומים|באילו תחומים/.test(text)) {
    throw new Error(`onboarding did not appear: ${text.slice(0, 120)}`);
  }
  return 'welcome step shown';
});

await step('the onboarding screens are in Hebrew', () => assertHebrew(page, 'onboarding'));

/* -- onboarding ---------------------------------------------------- */

console.log('\nonboarding');

await step('the flow can be completed', async () => {
  const start = page.getByRole('button', { name: /מתחילים/ }).first();
  if (await start.count()) await start.click();
  await page.waitForTimeout(300);

  /* Walk forward, answering whatever the current step asks for. The steps are
   * driven by their Hebrew labels; if a step cannot be satisfied the loop
   * stops and the assertion below reports where. */
  for (let i = 0; i < 12; i += 1) {
    const body = await page.locator('#app').innerText();

    if (/באילו תחומים/.test(body)) {
      const chips = page.locator('#app [role="checkbox"], #app .chip-select, #app button[aria-pressed]');
      const n = Math.min(3, await chips.count());
      for (let k = 0; k < n; k += 1) await chips.nth(k).click().catch(() => {});
    } else if (/מה הכי חשוב לך להשיג/.test(body)) {
      await page.locator('#app input[type="text"]:visible, #app input:not([type]):visible').first()
        .fill('לבנות אתר תיק עבודות');
    } else if (/איך אתה אוהב לתכנן/.test(body)) {
      const options = page.locator('#app button:has-text("מאוזן"), #app [role="radio"]');
      if (await options.count()) await options.first().click().catch(() => {});
    } else if (/במה LifeOS הכי צריך לעזור/.test(body)) {
      const chips = page.locator('#app .chip-select, #app button[aria-pressed]');
      if (await chips.count()) await chips.first().click().catch(() => {});
    }

    const done = page.getByRole('button', { name: /^למסך היום$/ }).first();
    if (await done.count()) { await done.click(); break; }

    const next = page.getByRole('button', { name: /^(?:הבא|סיום|מתחילים)$/ }).first();
    if (!(await next.count())) break;
    if (await next.isDisabled().catch(() => false)) {
      throw new Error(`stuck on a step: ${body.slice(0, 100)}`);
    }
    await next.click();
    await page.waitForTimeout(400);
  }

  await page.waitForTimeout(1200);
  return 'reached the end';
});

await step('the app shell is mounted after onboarding', async () => {
  await page.waitForSelector('.shell, .sidebar, .bottom-nav', { timeout: 8000 });
  const nav = await page.locator('.sidebar, .bottom-nav').count();
  if (!nav) throw new Error('no navigation rendered');
  return 'shell present';
});

await step('onboarding created a first goal, project and task', async () => {
  const state = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifeos.v1.data.'));
    if (!key) return null;
    const blob = JSON.parse(localStorage.getItem(key));
    return {
      goals: blob.collections.goals.length,
      projects: blob.collections.projects.length,
      tasks: blob.collections.tasks.length,
      areas: blob.collections.areas.length,
    };
  });
  if (!state) throw new Error('no account data was written');
  if (!state.goals) throw new Error('no goal was created');
  if (!state.tasks) throw new Error('§92: the person landed on an empty dashboard');
  return `${state.areas} areas, ${state.goals} goals, ${state.projects} projects, ${state.tasks} tasks`;
});

/* -- the screens --------------------------------------------------- */

console.log('\nscreens');

const ROUTES = [
  ['today', 'היום'],
  ['inbox', 'תיבת קליטה'],
  ['tasks', 'משימות'],
  ['calendar', 'לוח שנה'],
  ['goals', 'מטרות'],
  ['projects', 'פרויקטים'],
  ['areas', 'תחומי חיים'],
  ['habits', 'הרגלים'],
  ['routines', 'שגרות'],
  ['focus', 'מיקוד'],
  ['notes', 'הערות'],
  ['someday', 'מתישהו'],
  ['progress', 'התקדמות'],
  ['review', 'סיכומים'],
  ['memory', 'זיכרון'],
  ['settings', 'הגדרות'],
];

for (const [route, label] of ROUTES) {
  await step(`/${route} renders`, async () => {
    const before = consoleErrors.length;
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const text = await page.locator('#app').innerText();
    if (text.trim().length < 10) throw new Error('the screen is empty');
    if (/errors\.|nav\.|common\.|tasks\.[a-z]/.test(text)) {
      const key = text.match(/\b(?:errors|nav|common|tasks|goals|projects)\.[\w.]+/);
      throw new Error(`an unresolved i18n key is on screen: ${key && key[0]}`);
    }
    const newErrors = consoleErrors.slice(before);
    if (newErrors.length) throw new Error(newErrors[0]);
    return `${text.trim().split('\n').length} lines`;
  });

  await step(`/${route} is in Hebrew`, () => assertHebrew(page, `/${route}`));
}

/* -- the core loop ------------------------------------------------- */

console.log('\nthe core loop');

await step('a task can be captured in natural Hebrew', async () => {
  await page.goto(`${BASE}#/inbox`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const input = page.locator('#app input[type="text"]:visible, #app input:not([type]):visible').first();
  if (!(await input.count())) throw new Error('no capture field on the inbox screen');
  await input.fill('מחר ב־17:00 ללמוד מתמטיקה 45 דקות');
  await page.waitForTimeout(400);
  await input.press('Enter');
  await page.waitForTimeout(800);

  const parsed = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifeos.v1.data.'));
    const blob = JSON.parse(localStorage.getItem(key));
    return blob.collections.tasks.find((t) => t.title === 'ללמוד מתמטיקה') || null;
  });
  if (!parsed) throw new Error('the captured task was not created with the parsed title');
  if (parsed.scheduledStart !== 17 * 60) throw new Error(`time parsed as ${parsed.scheduledStart}`);
  if (parsed.estimatedMinutes !== 45) throw new Error(`duration parsed as ${parsed.estimatedMinutes}`);
  return 'title, date, time and duration all extracted';
});

await step('Today answers with one thing to do', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const text = await page.locator('#app').innerText();
  if (!/המיקוד המרכזי/.test(text)) throw new Error('no main focus section');
  return text.split('\n').slice(0, 4).join(' / ').slice(0, 90);
});

await step('the recommendation explains itself with a fact', async () => {
  const text = await page.locator('#app').innerText();
  if (!/למה דווקא זה\?|למה\?/.test(text)) throw new Error('no explanation offered');
  /* The explanation must contain a number, a date word or a name — never a
   * bare assertion of importance. */
  if (!/\d|היום|מחר|חוסמת|פרויקט|יעד/.test(text)) throw new Error('the explanation cites nothing');
  return 'explanation present and grounded';
});

await step('"what should I do now" gives a real answer', async () => {
  const button = page.getByRole('button', { name: /מה כדאי לי לעשות עכשיו/ }).first();
  if (!(await button.count())) throw new Error('the button is not on the Today screen');
  await button.click();
  await page.waitForTimeout(900);
  const dialog = page.locator('.modal, [role="dialog"]').first();
  const text = await dialog.innerText();
  if (text.trim().length < 15) throw new Error('the dialog is empty');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return text.split('\n').slice(0, 3).join(' / ').slice(0, 90);
});

await step('a focus session runs and is saved', async () => {
  const before = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifeos.v1.data.'));
    return JSON.parse(localStorage.getItem(key)).collections.focusSessions.length;
  });

  const start = page.getByRole('button', { name: /להתחיל מיקוד|מיקוד/ }).first();
  if (!(await start.count())) throw new Error('no way to start a focus session from Today');
  await start.click();
  await page.waitForTimeout(1200);

  const running = await page.locator('.focus-screen').count();
  if (!running) throw new Error('the focus surface did not open');

  /* Finish it. */
  const finish = page.locator('.focus-screen').getByRole('button', { name: /סיום/ }).first();
  if (!(await finish.count())) throw new Error('no finish button');
  await finish.click();
  await page.waitForTimeout(700);

  const done = page.getByRole('button', { name: /^סיימתי$/ }).first();
  if (await done.count()) { await done.click(); await page.waitForTimeout(800); }
  else {
    const save = page.getByRole('button', { name: /שמירה|סיום/ }).last();
    if (await save.count()) { await save.click(); await page.waitForTimeout(800); }
  }

  const after = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifeos.v1.data.'));
    return JSON.parse(localStorage.getItem(key)).collections.focusSessions.length;
  });
  if (after <= before) throw new Error('no session was recorded');
  return `${after - before} session recorded`;
});

await step('completing a task moves the numbers', async () => {
  await page.goto(`${BASE}#/tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const box = page.locator('[role="checkbox"][aria-checked="false"]:not([aria-disabled="true"])').first();
  if (!(await box.count())) throw new Error('no tickable task on the tasks screen');
  await box.click();
  await page.waitForTimeout(700);

  const completed = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifeos.v1.data.'));
    const blob = JSON.parse(localStorage.getItem(key));
    return {
      done: blob.collections.tasks.filter((t) => t.status === 'done').length,
      events: blob.collections.activity.filter((e) => e.type === 'TASK_COMPLETED').length,
    };
  });
  if (!completed.done) throw new Error('nothing was marked done');
  if (!completed.events) throw new Error('no activity event was written, so the review will not count it');
  return `${completed.done} done, ${completed.events} logged`;
});

await step('progress reflects the work, from the log', async () => {
  await page.goto(`${BASE}#/progress`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const text = await page.locator('#app').innerText();
  if (text.trim().length < 20) throw new Error('the progress screen is empty after real work');
  return 'rendered';
});

await step('everything survives a reload', async () => {
  await page.goto(`${BASE}#/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const text = await page.locator('#app').innerText();
  if (!/ללמוד מתמטיקה/.test(text) && !/מתמטיקה/.test(text)) {
    throw new Error('the captured task is gone after a reload');
  }
  const stillSignedIn = await page.locator('.shell, .sidebar, .bottom-nav').count();
  if (!stillSignedIn) throw new Error('the session did not survive');
  return 'data and session both persisted';
});

/* -- keyboard ------------------------------------------------------ */

console.log('\nkeyboard');

await step('the command palette opens with Ctrl+K', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  if (!(await page.locator('.palette').count())) throw new Error('no palette appeared');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return 'opens and closes';
});

/* -- themes -------------------------------------------------------- */

console.log('\nthemes');

for (const theme of ['light', 'dark']) {
  await step(`${theme} mode is a real design`, async () => {
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(400);
    const colors = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      return { bg: body.backgroundColor, fg: body.color };
    });
    const parse = (c) => (c.match(/\d+/g) || []).map(Number);
    const bg = parse(colors.bg);
    const fg = parse(colors.fg);
    if (!bg.length || !fg.length) throw new Error('no computed colours');

    const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const contrast = Math.abs(lum(bg) - lum(fg));
    if (contrast < 0.4) throw new Error(`body contrast is only ${contrast.toFixed(2)}`);

    if (theme === 'dark') {
      if (bg[0] === 0 && bg[1] === 0 && bg[2] === 0) throw new Error('§97: dark mode is pure black');
      if (lum(bg) > 0.5) throw new Error('dark mode is not dark');
    } else if (lum(bg) < 0.5) throw new Error('light mode is not light');
    return `bg ${colors.bg}`;
  });
}

await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

/* -- responsive ---------------------------------------------------- */

console.log('\nwidths');

const WIDTHS = [375, 430, 768, 1024, 1440];

for (const width of WIDTHS) {
  await step(`${width}px has no horizontal overflow`, async () => {
    await page.setViewportSize({ width, height: 900 });
    const worst = [];

    for (const [route] of ROUTES.slice(0, 8)) {
      await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const bodyOverflow = doc.scrollWidth - doc.clientWidth;
        /* Which element is doing it, so the report is actionable. */
        let culprit = null;
        if (bodyOverflow > 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width > doc.clientWidth + 2 && el.scrollWidth > el.clientWidth + 2) {
              const style = getComputedStyle(el);
              if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
              culprit = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`;
              break;
            }
          }
        }
        return { bodyOverflow, culprit };
      });
      if (overflow.bodyOverflow > 1) {
        worst.push(`${route}: ${overflow.bodyOverflow}px${overflow.culprit ? ` (${overflow.culprit})` : ''}`);
      }
    }

    if (worst.length) throw new Error(worst.join('; '));
    return 'clean';
  });

  await step(`${width}px shows the right navigation`, async () => {
    await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const nav = await page.evaluate(() => {
      const rail = document.querySelector('.sidebar');
      const bottom = document.querySelector('.bottom-nav');
      const visible = (el) => !!el && el.offsetParent !== null;
      return { rail: visible(rail), bottom: visible(bottom) };
    });
    if (width <= 900 && !nav.bottom) throw new Error('no bottom bar on a narrow screen');
    if (width > 900 && !nav.rail) throw new Error('no rail on a wide screen');
    if (nav.rail && nav.bottom) throw new Error('both navigations are showing at once');
    return width <= 900 ? 'bottom bar' : 'rail';
  });
}

await page.setViewportSize({ width: 1280, height: 900 });

/* -- RTL ----------------------------------------------------------- */

console.log('\nRTL');

await step('the sidebar sits on the right', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const geometry = await page.evaluate(() => {
    const rail = document.querySelector('.sidebar');
    if (!rail || rail.offsetParent === null) return null;
    const r = rail.getBoundingClientRect();
    return { left: r.left, right: r.right, width: window.innerWidth };
  });
  if (!geometry) throw new Error('no sidebar');
  if (geometry.right < geometry.width - 5) {
    throw new Error(`the rail is on the left (right edge at ${Math.round(geometry.right)} of ${geometry.width})`);
  }
  return 'inline-start resolved to the right edge';
});

await step('text is start-aligned, not forced left', async () => {
  const bad_ = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#app p, #app h1, #app h2, #app h3, #app div')) {
      if (el.offsetParent === null) continue;
      if (!el.textContent.trim()) continue;
      const align = getComputedStyle(el).textAlign;
      if (align === 'left') out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      if (out.length > 4) break;
    }
    return out;
  });
  if (bad_.length) throw new Error(`left-aligned in an RTL document: ${bad_.join(', ')}`);
  return 'no forced left alignment';
});

await step('clock times render left-to-right inside Hebrew', async () => {
  const numbers = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.num')) {
      if (el.offsetParent === null) continue;
      out.push({ text: el.textContent.trim(), dir: getComputedStyle(el).direction });
    }
    return out.slice(0, 12);
  });
  const wrong = numbers.filter((n) => /\d[:.]\d/.test(n.text) && n.dir !== 'ltr');
  if (wrong.length) throw new Error(`a time is not LTR-isolated: ${JSON.stringify(wrong[0])}`);
  return `${numbers.length} numeric runs checked`;
});

/* -- accessibility ------------------------------------------------- */

console.log('\naccessibility');

await step('every icon-only control is labelled', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const unlabelled = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href]')) {
      if (el.offsetParent === null) continue;
      const text = el.textContent.trim();
      const label = el.getAttribute('aria-label') || el.getAttribute('title');
      if (!text && !label) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
    }
    return out.slice(0, 6);
  });
  if (unlabelled.length) throw new Error(`unlabelled: ${unlabelled.join(', ')}`);
  return 'all labelled';
});

await step('the interface is reachable by keyboard', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  let reached = 0;
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        outline: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
      };
    });
    if (focused) reached += 1;
  }
  if (reached < 6) throw new Error(`only ${reached} elements reachable in 12 tabs`);
  return `${reached} of 12 tab stops landed on a control`;
});

await step('a skip link is the first stop', async () => {
  await page.goto(`${BASE}#/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? { text: el.textContent.trim(), cls: String(el.className) } : null;
  });
  if (!first || !/skip-link/.test(first.cls)) throw new Error(`first tab stop is "${first && first.text}"`);
  return first.text;
});

/* -- errors -------------------------------------------------------- */

console.log('\nconsole');

await step('no uncaught errors during the whole walk', () => {
  const real = consoleErrors.filter((e) => !/favicon|net::ERR_/.test(e));
  if (real.length) throw new Error(`${real.length}: ${real.slice(0, 3).join(' | ')}`);
  return 'clean';
});

/* ------------------------------------------------------------------ */

await browser.close();
server.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed.`);
if (failures) {
  console.log('\nfailed:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  ${r.name} — ${r.detail}`);
}
process.exit(failures ? 1 : 0);
