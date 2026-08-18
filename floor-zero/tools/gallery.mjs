/**
 * Visual pass. Jumps straight to a chapter through the chapter-select path and
 * photographs the game from hand-picked vantage points, so the art can be
 * judged without playing through. Run with:  node tools/gallery.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const out = path.join(root, 'dist', 'gallery');
const PORT = 4327;
const chromePath = [process.env.FZ_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (candidate) => candidate && existsSync(candidate),
);

mkdirSync(out, { recursive: true });

const BASE = `http://127.0.0.1:${PORT}/`;
const alreadyServing = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
  .then((response) => response.ok)
  .catch(() => false);

const server = alreadyServing
  ? null
  : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (server) {
  for (const signal of ['SIGINT', 'SIGTERM', 'exit']) {
    process.on(signal, () => server.kill('SIGTERM'));
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 25000);
    const onData = (buffer) => {
      if (buffer.toString().includes('Local:')) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
  });
}

const browser = await chromium.launch({
  ...(chromePath ? { executablePath: chromePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 400)));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__floorZero?.state.phase === 'menu', null, { timeout: 60000 });

// Unlock chapter select the way finishing the game would, then use it.
await page.evaluate(() => {
  const g = window.__floorZero;
  g.state.meta.completedOnce = true;
  g.state.meta.highestChapterReached = 5;
  g.save.saveMeta(g.state.meta);
  g.ui.menu.setMeta(g.state.meta, g.save.hasRun);
  g.applySettings({ ...g.settings, quality: 'high', shadows: true, screenEffects: 0.85 }, false);
});
await page.click('text=בחירת פרק');
await page.waitForTimeout(400);
await page.click('text=פרק 5');
await page.waitForFunction(() => window.__floorZero.state.phase === 'playing', null, { timeout: 60000 });
// This is a photo tool: keep the chapter-5 chase (and its blackout) from
// arming while the camera is teleported around.
await page.evaluate(() => window.__floorZero.state.setFlag('entered_control'));
await page.waitForTimeout(3000);

const shots = [
  { name: 'corridor-long', x: 2.4, z: 0, yaw: -Math.PI / 2, pitch: 0 },
  { name: 'corridor-mid', x: 10.5, z: 0.6, yaw: -Math.PI / 2, pitch: -0.05 },
  { name: 'corridor-back', x: 22, z: 0, yaw: Math.PI / 2, pitch: 0 },
  { name: 'notice-board', x: 2.0, z: 1.0, yaw: 0, pitch: 0.06 },
  { name: 'photo-corridor', x: 1.05, z: -0.35, yaw: 0, pitch: -0.5 },
  { name: 'photo-apt01', x: 3.0, z: -3.2, yaw: Math.PI / 2, pitch: -0.2 },
  { name: 'family-photo', x: 10.4, z: 0.9, yaw: 0, pitch: 0.05 },
  { name: 'apt03-living', x: 13.4, z: -6.0, yaw: Math.PI / 2 + 0.5, pitch: -0.05 },
  { name: 'apt03-clocks', x: 12.6, z: -3.4, yaw: 0, pitch: 0.12 },
  { name: 'apt03-kitchen', x: 17.2, z: -6.4, yaw: Math.PI, pitch: 0 },
  { name: 'kids-room', x: 8.4, z: 8.4, yaw: Math.PI, pitch: -0.05 },
  { name: 'kids-toys', x: 8.4, z: 8.8, yaw: Math.PI, pitch: 0.3 },
  { name: 'control-room', x: 24.6, z: -3.0, yaw: Math.PI / 2, pitch: 0 },
  { name: 'control-monitors', x: 21.6, z: -3.6, yaw: Math.PI / 2, pitch: 0.05 },
  { name: 'lift-inside', x: -1.1, z: 0, yaw: -Math.PI / 2, pitch: 0 },
  { name: 'torch-dark', x: 8.0, z: 0, yaw: -Math.PI / 2, pitch: -0.02, torch: true, dark: true },
  { name: 'service-doorway', x: 17.9, z: -8.2, yaw: 0, pitch: -0.06, torch: true },
  { name: 'apt04-doorway', x: 20.6, z: 0.4, yaw: Math.PI, pitch: -0.05 },
  { name: 'crawler', x: 13.5, z: 0, yaw: Math.PI / 2, pitch: -0.1, creature: 'crawler', at: 9.6 },
  { name: 'tall-one', x: 13.5, z: 0, yaw: Math.PI / 2, pitch: 0.13, creature: 'tall', at: 10.4 },
];

for (const shot of shots) {
  await page.evaluate((s) => {
    const g = window.__floorZero;
    // Open everything so the rooms can be photographed.
    for (const door of g.world.current.doors.all) {
      if (!door.id.startsWith('lift')) door.forceState(true);
    }
    const cover = g.world.prop('control_cover');
    if (cover) {
      cover.visible = false;
      g.world.collision.setSolid('control_cover', false);
    }
    g.player.teleport(s.x, s.z, s.yaw);
    g.player.view.pitch = s.pitch;
    g.player.frozen = true;

    g.player.setFlashlight(!!s.torch, g);
    if (s.dark) g.world.lighting.setOn('*', false);

    if (s.creature) {
      // place() rather than send(): send() positions relative to the camera,
      // which has not caught up with the teleport above yet.
      g.world.lighting.setOn('*', true);
      g.creatures.clear();
      g.creatures.place(s.creature, g.player.position.clone().set(s.at, 0, 0), Math.PI / 2);
    } else {
      g.creatures.clear();
      if (!s.dark) g.world.lighting.setOn('*', true);
    }
  }, shot);
  // A single frame at high quality under software rendering can take most of a
  // second, and a freshly placed creature fades in over several frames, so the
  // creature shots need long enough for that fade to finish.
  await page.waitForTimeout(shot.creature ? 7000 : 1600);
  await page.screenshot({ path: path.join(out, `${shot.name}.png`) });
  console.log('shot', shot.name);
}

await browser.close();
server?.kill('SIGTERM');
process.exit(0);
