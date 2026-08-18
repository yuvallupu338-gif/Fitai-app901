#!/usr/bin/env node
/**
 * Opens the single-file build straight off the disk (file://) and plays far
 * enough to prove it needs no server: menu, new game, prologue, into the lobby,
 * restore power, ride the lift to Floor 0. Fails on any console error.
 *
 *   node tools/verify-single.mjs [path/to/floor-zero.html]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const file = path.resolve(root, process.argv[2] ?? '../dist/floor-zero.html');
if (!existsSync(file)) {
  console.error(`no such file: ${file} — run "npm run build:single" first`);
  process.exit(1);
}

const chromePath = [process.env.FZ_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (candidate) => candidate && existsSync(candidate),
);

const browser = await chromium.launch({
  ...(chromePath ? { executablePath: chromePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.__floorZero?.state.phase === 'menu', null, { timeout: 90000 });
check('boots from file:// with no server', true);
check('renders frames', await page.evaluate(() => window.__floorZero.renderer.info.render.frame > 3));

await page.evaluate(() => {
  const g = window.__floorZero;
  g.applySettings({ ...g.settings, quality: 'low', shadows: false, screenEffects: 0 }, false);
});
await page.click('text=משחק חדש');
await page.waitForFunction(() => window.__floorZero.state.phase === 'playing', null, { timeout: 90000 });
await page.waitForFunction(() => !window.__floorZero.state.cinematic, null, { timeout: 120000 });
check('prologue plays', true);

await page.evaluate(() => {
  const g = window.__floorZero;
  g.player.teleport(0, 3.4, 0);
  g.interactions.activate(g.interactions.get('door_entrance'), g);
  g.player.teleport(3.6, -5, Math.PI / 2);
  g.interactions.activate(g.interactions.get('lobby_power'), g);
  g.interactions.activate(g.interactions.get('lift_call'), g);
});
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__floorZero;
  const rig = g.world.current.elevator;
  g.player.teleport(rig.interior.x, rig.interior.z, rig.facing);
  g.interactions.activate(g.interactions.get('lift_button_0'), g);
});
await page.waitForFunction(() => window.__floorZero.world.levelId === 'floor0', null, { timeout: 120000 });
await page.waitForFunction(() => !window.__floorZero.state.cinematic, null, { timeout: 120000 });
check('reaches Floor 0', true);
check('audio engine started', await page.evaluate(() => window.__floorZero.audio.ready));
check(
  'save written to localStorage',
  await page.evaluate(() => !!localStorage.getItem('floor-zero.save.v1')),
);

// Keep the debug frame inside the project's own build directory: the file
// under test may live in a tracked one.
const shot = path.join(root, 'dist', 'verify-single.png');
mkdirSync(path.dirname(shot), { recursive: true });
await page.screenshot({ path: shot });

const real = errors.filter((text) => !/favicon|AudioContext|autoplay|Deprecat/i.test(text));
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((ok) => !ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
