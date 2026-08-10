#!/usr/bin/env node
/*
 * backrooms-entity.mjs — look at the things that walk around.
 *
 * The other two suites can pass with an entity never once appearing on screen:
 * they spawn on their own schedule, out in the fog, and the checks are about
 * the level rather than its population. So this puts one directly in front of
 * the camera under a torch, holds it there, and both screenshots it and
 * asserts the things a screenshot cannot: that the limbs are actually in
 * different places from one frame to the next, and that they are in different
 * places from *each other* — a walk cycle that moves both legs together is a
 * hop, and one where the "swing" is a constant is a mannequin on a trolley.
 *
 * Usage:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/backrooms-entity.mjs
 *   … --level 5      which level to stage it on (default 5, Terror Hotel)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join('/opt/node22/lib/node_modules/', 'x.js'));
const { chromium } = require('playwright');
const { waitFrames } = await import('./backrooms-smoke.mjs');

const SHOT_DIR = resolve(ROOT, 'dist/shots/entity');
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const LEVEL = Number(argOf('--level', '0'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const failures = [];
const notes = [];
const check = (c, m) => { if (!c) failures.push(m); else notes.push('ok: ' + m); };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const p = resolve(ROOT, `.${url}`);
      if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/* Pin one entity a fixed distance in front of the camera, walking, and stop
 * the sim from moving or despawning it while we look. */
async function stage(page, kind) {
  return page.evaluate((k) => {
    const g = window.backrooms;
    const p = g.player;
    p.flashlightOn = true;
    /*
     * Find somewhere it can actually stand and be seen. Staging it at a fixed
     * distance straight ahead buries it in a wall on any level whose corridors
     * are one cell wide — which is most of them — and then the screenshot is
     * of the wallpaper. Sweep the yaw as well as the distance, and point the
     * camera at whatever clear spot turns up.
     */
    /*
     * Pick the *most open* direction, not merely the first clear one. Taking
     * the first clear ray reliably parks the subject against a wall edge that
     * is nearer the camera than it is, and half of it ends up occluded — which
     * makes the screenshot useless for the one thing it exists to show.
     */
    let best = null, bestScore = -1;
    for (let t = 0; t < 24; t++) {
      const yaw = p.yaw + (t / 24) * Math.PI * 2;
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      let reach = 0;
      for (let d = 0.6; d <= 9; d += 0.3) {
        const tx = p.pos.x + dx * d, tz = p.pos.z + dz * d;
        const [gx, gz] = g.world.cellOf(tx, tz);
        if (g.world.wallAt(gx, gz) > 1.2) break;
        if (g.world.groundAt(tx, tz, 0.3) < -900) break;
        reach = d;
      }
      /* Also want elbow room to the sides at the stand point, so the body is
       * not pressed into a corner. */
      if (reach < 2.4) continue;
      const stand = Math.min(3.2, reach - 0.9);
      const sx = p.pos.x + dx * stand, sz = p.pos.z + dz * stand;
      let room = 0;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [gx2, gz2] = g.world.cellOf(sx + ax * 1.2, sz + az * 1.2);
        if (g.world.wallAt(gx2, gz2) <= 1.2) room++;
      }
      const score = reach + room * 1.5;
      if (score > bestScore) {
        const sy = g.world.groundAt(sx, sz, 0.3);
        if (sy > -900 && !g.world.blocked(sx, sz, sy, 0.35, 0.5)) {
          bestScore = score;
          best = { x: sx, y: sy, z: sz, yaw };
        }
      }
    }
    if (!best) return null;
    p.yaw = best.yaw;
    /* Aim at the subject's middle. A level camera frames a 1.8m biped fine and
     * cuts a 0.5m quadruped off the bottom of the screen entirely. */
    const centreH = k === 'crawler' ? 0.34 : 1.0;
    const camY = p.pos.y + p.eye;
    const flat = Math.hypot(best.x - p.pos.x, best.z - p.pos.z);
    p.pitch = Math.atan2((best.y + centreH) - camY, flat);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const x = best.x, z = best.z, y = best.y;
    /* speed 0 pins it where it was staged. A hound closes at 3.6 m/s and, with
     * its attack suppressed, simply walks into the camera and out of frame
     * within a few frames — the articulation is what is being looked at here,
     * not the pathfinding. */
    g.entities.spec = { kind: k, density: 1, speed: 0 };
    g.entities.max = 1;
    g.entities.list.length = 0;
    /*
     * The body is deliberately turned ~50° off the player. Facing it straight
     * at them makes the head-independence check meaningless — an aligned head
     * would be the correct answer — so the interesting case is a body pointing
     * one way with a face pointing another, which is the behaviour worth
     * having in the first place.
     */
    const facing = Math.atan2(-fx, -fz) + Math.PI;
    g.entities.list.push({
      x, y, z,
      rot: facing + 0.9,
      cooldown: 99, alerted: false, frozen: false,
      moving: true, bob: 0, cue: 99, seed: 1.0,
      phase: 0, swing: 1, headYaw: 0,
      mesh: k === 'crawler' ? 'crawler' : 'biped',
    });
    return { x, y, z, ground: y, facing };
  }, kind);
}

/*
 * Pin the walk cycle to an exact phase and read the resulting transforms. The
 * articulation is a pure function of phase, so testing it against a phase we
 * choose is both deterministic and a stronger check than sampling whatever
 * frame the software renderer happened to produce.
 */
async function readAtPhase(page, phase) {
  /* Set and read in ONE evaluate. Splitting them lets a frame land in between,
   * and update() then rewrites the very fields being posed — which showed up
   * as a walk cycle that appeared to barely move. */
  return page.evaluate((ph) => {
    const e = window.backrooms.entities.list[0];
    e.phase = ph;
    e.swing = 1;
    e.moving = true;
    const out = [];
    window.backrooms.entities.dynamics(out);
    return out.map((d) => ({
      mesh: d.mesh, x: d.x, y: d.y, z: d.z, pitch: d.pitch || 0, rot: d.rot,
    }));
  }, phase);
}

/* Read back where every part of the entity actually ends up this frame. */
const partPositions = (page) => page.evaluate(() => {
  const out = [];
  window.backrooms.entities.dynamics(out);
  return out.map((d) => ({
    mesh: d.mesh, x: d.x, y: d.y, z: d.z, pitch: d.pitch || 0, rot: d.rot,
  }));
});

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/backrooms/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.backrooms, null, { timeout: 20000 });
  await page.evaluate((lvl) => window.backrooms.enterLevel(lvl), LEVEL);
  await page.waitForFunction(
    () => window.backrooms.state === 'play' && !window.backrooms.loading,
    null, { timeout: 180000 });
  await waitFrames(page, 6);

  /*
   * Which kind is staged matters, because their behaviours differ in exactly
   * the way the checks care about. A watcher stared at from three metres is
   * *supposed* to stand perfectly still, so it is the wrong subject for a gait
   * check and the right one for head-tracking; a hound closes regardless of
   * being watched, so it is the one to inspect mid-stride.
   */
  for (const { kind, gait, head } of [
    { kind: 'hound', gait: true, head: false },
    { kind: 'watcher', gait: false, head: true },
    { kind: 'crawler', gait: true, head: false },
  ]) {
    const staged = await stage(page, kind);
    if (!staged) {
      failures.push(`${kind}: found nowhere clear to stand it in view`);
      continue;
    }
    await waitFrames(page, 4);

    const parts = await partPositions(page);
    check(parts.length >= (kind === 'crawler' ? 5 : 6),
      `${kind}: renders as multiple articulated parts (${parts.length})`);

    if (kind !== 'crawler') {
      const names = parts.map((p) => p.mesh);
      for (const want of ['entTorso', 'entHead', 'entArm', 'entLeg']) {
        check(names.includes(want), `${kind}: has a ${want}`);
      }
      const arms = parts.filter((p) => p.mesh === 'entArm');
      const legs = parts.filter((p) => p.mesh === 'entLeg');
      check(arms.length === 2 && legs.length === 2,
        `${kind}: two arms and two legs (${arms.length}/${legs.length})`);
      /*
       * Opposition, sampled at a phase we set rather than whatever phase the
       * clock happened to be at. Reading limbs on an arbitrary frame can catch
       * the cycle crossing zero, where both arms legitimately sit at their
       * sides — which says nothing about whether they oppose each other. Only
       * meaningful for something that walks: a frozen watcher with its arms
       * down is correct, not a bug.
       */
      if (gait) {
        const at = await readAtPhase(page, Math.PI / 2);
        const a2 = at.filter((q) => q.mesh === 'entArm');
        const l2 = at.filter((q) => q.mesh === 'entLeg');
        check(Math.abs(a2[0].pitch - a2[1].pitch) > 0.05,
          `${kind}: the arms swing in opposition (${a2[0].pitch.toFixed(2)} vs ${a2[1].pitch.toFixed(2)})`);
        check(Math.abs(l2[0].pitch - l2[1].pitch) > 0.05,
          `${kind}: the legs swing in opposition (${l2[0].pitch.toFixed(2)} vs ${l2[1].pitch.toFixed(2)})`);
        /* Arms lead the opposite leg, as a body does. */
        check(Math.sign(a2[0].pitch) !== Math.sign(l2[0].pitch),
          `${kind}: each arm swings opposite its own side's leg`);
      }
      /*
       * The head is steered independently of the body, and steered at the
       * player: with the body turned away, the face has to end up better
       * aligned with the player than the shoulders are.
       */
      if (head) {
        const hd = parts.find((p) => p.mesh === 'entHead');
        const torso = parts.find((p) => p.mesh === 'entTorso');
        const wrap = (a) => Math.abs(((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const headOff = wrap(hd.rot - staged.facing);
        const bodyOff = wrap(torso.rot - staged.facing);
        check(Math.abs(hd.rot - torso.rot) > 0.05,
          `${kind}: the head turns independently of the body`);
        check(headOff < bodyOff - 0.1,
          `${kind}: the head tracks the player past the shoulders `
          + `(head ${headOff.toFixed(2)} rad off vs body ${bodyOff.toFixed(2)})`);
        /* And the defining behaviour: watched means frozen. */
        const still = await page.evaluate(() => {
          const e = window.backrooms.entities.list[0];
          return { moving: e.moving, swing: e.swing };
        });
        check(!still.moving,
          `${kind}: stops dead while it is being looked at`);
      }
    }

    /* Advance the cycle and confirm the limbs actually moved. */
    if (gait) {
    const before = await readAtPhase(page, 0.4);
    const after = await readAtPhase(page, 0.4 + 1.6);
    let maxDelta = 0;
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      maxDelta = Math.max(maxDelta, Math.abs(before[i].pitch - after[i].pitch));
    }
    check(maxDelta > 0.1,
      `${kind}: the walk cycle actually moves the limbs (max Δpitch ${maxDelta.toFixed(2)})`);
    }

    /* Pose it mid-stride and get the level-intro toast out of the way. */
    await readAtPhase(page, 1.05);
    await page.evaluate(() => {
      const t = document.querySelector('#toast');
      if (t) t.hidden = true;
    });
    await waitFrames(page, 2);
    await page.screenshot({ path: join(SHOT_DIR, `${kind}.png`) });
  }

  for (const e of errors) failures.push(e);
  await browser.close();
  server.close();

  console.log(`${notes.length} checks passed`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`entities look like bodies. shots in ${SHOT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
