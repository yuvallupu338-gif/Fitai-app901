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
const { waitFrames, frameStats } = await import('./backrooms-smoke.mjs');

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
    const centreH = k === 'crawler' ? 0.34 : 1.0;  /* shade is 1.95 tall, centre ~1.0 */
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
      /* Take the mesh from the behaviour table rather than restating it here:
       * a hand-kept list silently stages the wrong model the moment a kind is
       * added, and the test then passes while looking at nothing. */
      mesh: (window.backrooms.BEHAVIOUR[k] || {}).mesh || 'biped',
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
    window.backrooms.entities.dynamics(out, window.backrooms.player.camera());
    return out.map((d) => ({
      mesh: d.mesh, x: d.x, y: d.y, z: d.z, pitch: d.pitch || 0, rot: d.rot,
    }));
  }, phase);
}

/* Read back where every part of the entity actually ends up this frame. */
const partPositions = (page) => page.evaluate(() => {
  const out = [];
  window.backrooms.entities.dynamics(out, window.backrooms.player.camera());
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
  for (const { kind, gait, head, billboard } of [
    { kind: 'hound', gait: true, head: false },
    { kind: 'watcher', gait: false, head: true },
    { kind: 'crawler', gait: true, head: false },
    { kind: 'shade', gait: false, head: false, billboard: true },
  ]) {
    const staged = await stage(page, kind);
    if (!staged) {
      failures.push(`${kind}: found nowhere clear to stand it in view`);
      continue;
    }
    await waitFrames(page, 4);

    const parts = await partPositions(page);
    if (billboard) {
      check(parts.length === 1 && parts[0].mesh === 'shade',
        `${kind}: draws as a single camera-facing pane (${parts.map((q) => q.mesh)})`);
      /*
       * Screenshot it while it is still in frame. This used to come last, and
       * the facing check below swings the yaw by 1.2 rad — nearly twice the
       * half-FOV — so what got saved was an empty corridor, indistinguishable
       * from a monster that never drew at all, and the search for the bug
       * started in the renderer rather than here.
       */
      await page.screenshot({ path: join(SHOT_DIR, `${kind}.png`) });

      /*
       * And prove it is actually *on screen*, which no amount of inspecting
       * the descriptors can tell you: a near-black cut-out standing three
       * metres away under a torch takes a visible bite out of the frame's
       * average brightness. Compare the same view with it deleted.
       */
      const lum = (s) => 0.21 * s.mean[0] + 0.72 * s.mean[1] + 0.07 * s.mean[2];
      const withIt = await frameStats(page);
      await page.evaluate(() => { window.backrooms.entities.list.length = 0; });
      await waitFrames(page, 3);
      const without = await frameStats(page);
      check(lum(withIt) < lum(without) - 1.0,
        `${kind}: is visible in the frame `
        + `(${lum(withIt).toFixed(1)} vs ${lum(without).toFixed(1)} without it)`);

      /*
       * A billboard has to keep facing the camera or it is a flat board on a
       * stick seen edge-on. Note it turns with where the camera *is*, not
       * where it looks — spinning the yaw on the spot is supposed to leave the
       * facing alone — so the move that proves it is a strafe.
       */
      const staged2 = await stage(page, kind);
      if (!staged2) { failures.push(`${kind}: lost its stand point`); continue; }
      const before = (await partPositions(page))[0].rot;
      await page.evaluate(() => {
        const p = window.backrooms.player;
        p.pos.x += Math.cos(p.yaw) * 2.0;
        p.pos.z += -Math.sin(p.yaw) * 2.0;
        p.yaw += 1.2;
      });
      const after = (await partPositions(page))[0];
      const wrapd = (a) => Math.abs(((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const camAngle = await page.evaluate(() => {
        const g = window.backrooms, e = g.entities.list[0], p = g.player;
        return Math.atan2(p.pos.x - e.x, p.pos.z - e.z) + Math.PI;
      });
      check(wrapd(after.rot - camAngle) < 0.02,
        `${kind}: the pane faces the camera (${after.rot.toFixed(2)} vs ${camAngle.toFixed(2)})`);
      check(wrapd(after.rot - before) > 0.05,
        `${kind}: the facing follows the camera as it moves `
        + `(${before.toFixed(2)} → ${after.rot.toFixed(2)})`);
      continue;
    }
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

  /* ------------------------------------------------------------------ *
   * The new kinds, each tested on the one claim that makes it worth
   * having. A monster whose distinguishing rule is not asserted anywhere
   * is a monster that quietly becomes a hound the first time the shared
   * movement code is edited.
   * ------------------------------------------------------------------ */

  /*
   * Save a screenshot AND prove the subject is in it.
   *
   * Twice a shot has been taken after a check moved the camera, and an empty
   * corridor looks exactly like a monster that never rendered — so the shot
   * has to come with a proof.
   *
   * The proof is a projection, not a comparison of two frames. Comparing the
   * frame with the subject against the frame without it sounds stronger and
   * is in fact weaker: level 0 flickers a third of its fixtures, so the
   * brightness and contrast move between any two captures whether or not
   * anything is standing there, and the check passes on noise. Projecting the
   * entity's own position through the same camera basis the renderer uses
   * answers the actual question — is it inside the frustum — and gives the
   * same answer every time.
   */
  const captureSubject = async (name) => {
    /*
     * Pin the subject before shooting. A screenshot under software rendering
     * takes seconds of wall clock and the simulation keeps running through it,
     * so a lurker staged at six metres — it charges at 5.4 m/s — is a metre
     * from the lens by the time the PNG is written, and half out of frame.
     * Holding it still is also just a better photograph.
     */
    const wasSpeed = await page.evaluate(() => {
      const s = window.backrooms.entities.spec;
      const prev = s.speed;
      s.speed = 0;
      const t = document.querySelector('#toast');
      if (t) t.hidden = true;
      return prev === undefined ? null : prev;
    });
    await waitFrames(page, 2);
    await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });

    const where = await page.evaluate(() => {
      const g = window.backrooms, e = g.entities.list[0];
      if (!e) return null;
      const cam = g.player.camera();
      /* Same basis as viewFromEuler: forward is -Z at yaw 0. */
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const fwd = [-sy * cp, sp, -cy * cp];
      const right = [cy, 0, -sy];
      const up = [sy * sp, cp, cy * sp];
      /* Aim at the middle of the body, not its feet. */
      const h = (g.BEHAVIOUR[g.entities.spec.kind] || {}).height || 1.7;
      const v = [e.x - cam.x, (e.y + h * 0.5) - cam.y, e.z - cam.z];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const z = dot(v, fwd);
      if (z <= 0.05) return { z, ndcX: 99, ndcY: 99 };
      const tanHalf = Math.tan((cam.fov || 72) * Math.PI / 360);
      const aspect = g.renderer.canvas.width / g.renderer.canvas.height;
      return {
        z,
        ndcX: dot(v, right) / (z * tanHalf * aspect),
        ndcY: dot(v, up) / (z * tanHalf),
        dist: Math.hypot(v[0], v[2]),
      };
    });
    /* Let it move again, or every check after this one measures a statue. */
    await page.evaluate((prev) => {
      const s = window.backrooms.entities.spec;
      if (prev === null) delete s.speed; else s.speed = prev;
    }, wasSpeed);

    check(where && where.z > 0.05
      && Math.abs(where.ndcX) < 0.92 && Math.abs(where.ndcY) < 0.92,
      `${name}: is inside the frame that was saved `
      + (where
        ? `(${where.dist ? where.dist.toFixed(1) + 'm ahead, ' : ''}`
          + `screen ${where.ndcX.toFixed(2)}, ${where.ndcY.toFixed(2)})`
        : '(nothing staged)'));
  };

  /* Runs the sim for `frames` and reports where the subject ended up. */
  const runFor = async (frames) => {
    await waitFrames(page, frames);
    return page.evaluate(() => {
      const g = window.backrooms, e = g.entities.list[0], p = g.player;
      return e ? { dist: Math.hypot(e.x - p.pos.x, e.z - p.pos.z), moving: e.moving,
        alerted: !!e.alerted, x: e.x, z: e.z } : null;
    });
  };

  /* Put one exactly `at` metres in front of the camera, on clear ground. */
  const placeAhead = (kind, at) => page.evaluate(([k, d]) => {
    const g = window.backrooms, p = g.player;
    for (let t = 0; t < 32; t++) {
      const yaw = p.yaw + (t / 32) * Math.PI * 2;
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      /* Needs clear ground all the way out, or line of sight fails and the
       * behaviour under test never engages. */
      let clear = true;
      for (let s = 0.5; s <= d + 1.5; s += 0.4) {
        const [gx, gz] = g.world.cellOf(p.pos.x + dx * s, p.pos.z + dz * s);
        if (g.world.wallAt(gx, gz) > 0.6) { clear = false; break; }
      }
      if (!clear) continue;
      const x = p.pos.x + dx * d, z = p.pos.z + dz * d;
      const y = g.world.groundAt(x, z, 0.3);
      if (y < -900 || g.world.blocked(x, z, y, 0.35, 0.5)) continue;
      p.yaw = yaw; p.pitch = 0;
      g.entities.spec = { kind: k, density: 1 };
      g.entities.max = 1;
      g.entities.list.length = 0;
      g.entities.list.push({ x, y, z, rot: 0, cooldown: 99, alerted: false,
        frozen: false, moving: false, bob: 0, cue: 99, seed: 1, phase: 0,
        swing: 1, headYaw: 0, path: null, pathI: 0, repath: 0,
        mesh: (g.BEHAVIOUR[k] || {}).mesh || 'biped' });
      return { ok: true, dist: d };
    }
    return { ok: false };
  }, [kind, at]);

  /* --- smiler: the torch pushes it back, and only the torch --- */
  {
    const set = await placeAhead('smiler', 7);
    if (!set.ok) notes.push('smiler: nowhere with 7m of clear sight — skipped');
    else {
      await page.evaluate(() => { window.backrooms.player.flashlightOn = false; });
      const dark0 = await runFor(4);
      const dark1 = await runFor(20);
      check(dark1 && dark0 && dark1.dist < dark0.dist - 0.4,
        `smiler: closes in the dark (${dark0 && dark0.dist.toFixed(1)}m → `
        + `${dark1 && dark1.dist.toFixed(1)}m)`);
      /*
       * Photograph it in the dark, which is the only state it is ever meant
       * to be seen in — but re-stage first. Left to run, a smiler crosses
       * seven metres at 4.2 m/s and ends up beside the camera, and the shot
       * comes out as two teeth at the edge of the frame.
       */
      await placeAhead('smiler', 5.5);
      await captureSubject('smiler');

      /*
       * Re-stage before testing the torch. The dark phase deliberately lets it
       * get right on top of the camera, and from a metre away the direction to
       * it is degenerate — a step in any direction flips which side of the
       * player it is on, so "is it in the beam" is a coin toss and the check
       * measures nothing. Put it back at a distance where the cone means
       * something, then light it up.
       */
      await placeAhead('smiler', 7);
      /*
       * Fresh battery with the switch. By this point the suite has run for
       * several simulated minutes with the torch on for most of them, and a
       * flat battery turns `flashlightOn` back off the very next frame — so
       * the check was measuring a smiler in the dark and correctly finding
       * that it advanced. The torch costing something is the whole tension
       * this monster is built around; the test just has to pay for it.
       */
      await page.evaluate(() => {
        const p = window.backrooms.player;
        p.battery = 1;
        p.flashlightOn = true;
      });
      const lit0 = await runFor(4);
      const lit1 = await runFor(20);
      check(lit1 && lit0 && lit1.dist > lit0.dist + 0.2,
        `smiler: retreats from the torch beam (${lit0 && lit0.dist.toFixed(1)}m → `
        + `${lit1 && lit1.dist.toFixed(1)}m)`);
    }
  }

  /* --- lurker: motionless until you are close, then committed --- */
  {
    const set = await placeAhead('lurker', 14);
    if (!set.ok) notes.push('lurker: nowhere with 14m of clear sight — skipped');
    else {
      const far = await runFor(16);
      check(far && !far.moving && !far.alerted,
        `lurker: does not move at all from 14m away (moving=${far && far.moving})`);
      /* It must also be *perfectly* still — the idle sway that every other
       * kind has is exactly the tell that would give the ambush away. */
      const stillness = await page.evaluate(() => {
        const e = window.backrooms.entities.list[0];
        return { bob: Math.abs(e.bob), swing: Math.abs(e.swing), head: Math.abs(e.headYaw) };
      });
      check(stillness.bob === 0 && stillness.swing === 0 && stillness.head === 0,
        `lurker: holds absolutely still while hidden `
        + `(bob ${stillness.bob}, swing ${stillness.swing}, head ${stillness.head})`);

      /* Walk the camera into its trigger radius and it must commit. */
      await page.evaluate(() => {
        const g = window.backrooms, e = g.entities.list[0], p = g.player;
        const dx = e.x - p.pos.x, dz = e.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.pos.x += (dx / d) * (d - 4.5);
        p.pos.z += (dz / d) * (d - 4.5);
      });
      const near = await runFor(14);
      check(near && near.alerted,
        `lurker: triggers when you walk inside its radius (alerted=${near && near.alerted})`);
      /*
       * Re-place before photographing. A triggered lurker crosses the four
       * metres it was standing at in well under a second, so by the time the
       * check above has confirmed it woke up, it is already past the camera
       * and the shot is of the wall behind where it used to be.
       */
      await placeAhead('lurker', 6);
      await page.evaluate(() => { window.backrooms.entities.list[0].alerted = true; });
      await captureSubject('lurker');
    }
  }

  /* --- stalker: holds its distance while watched, closes when not --- */
  {
    const set = await placeAhead('stalker', 9);
    if (!set.ok) notes.push('stalker: nowhere with 9m of clear sight — skipped');
    else {
      const watched0 = await runFor(4);
      const watched1 = await runFor(24);
      check(watched1 && watched0 && Math.abs(watched1.dist - watched0.dist) < 3.0,
        `stalker: holds its distance while looked at `
        + `(${watched0 && watched0.dist.toFixed(1)}m → ${watched1 && watched1.dist.toFixed(1)}m)`);
      /* Photograph the standoff — the shot has to happen before the camera
       * turns away below, or it is a picture of the wall behind you. */
      await captureSubject('stalker');

      /* Turn away and it must take the ground it was refusing to take. */
      await page.evaluate(() => { window.backrooms.player.yaw += Math.PI; });
      const away0 = await runFor(4);
      const away1 = await runFor(24);
      check(away1 && away0 && away1.dist < away0.dist - 0.5,
        `stalker: closes the moment you look away `
        + `(${away0 && away0.dist.toFixed(1)}m → ${away1 && away1.dist.toFixed(1)}m)`);
    }
  }

  /* --- swarm: deaf until you make noise --- */
  {
    const set = await placeAhead('swarm', 12);
    if (!set.ok) notes.push('swarm: nowhere with 12m of clear sight — skipped');
    else {
      /*
       * Noise is read off the velocity the player actually achieved, so the
       * only honest way to make the player loud is to make them run: writing
       * `vel` from outside does not survive, because player.update() damps it
       * back towards the input every frame before entities.update() ever sees
       * it. Pressing the keys the way a person would is both truthful and the
       * only thing that works.
       *
       * And the measurement is "is it coming", not "how far away is it": a
       * sprinting player is moving too, so distance changes for two reasons
       * at once and proves nothing either way.
       */
      const quiet = await runFor(20);
      check(quiet && !quiet.moving,
        `swarm: ignores you while you stand still (moving=${quiet && quiet.moving})`);
      /* Photographed close and still. At the twelve metres the hearing test
       * needs, a half-metre body in fog is three dark pixels — true to how it
       * plays, and useless as a picture of what the thing is. */
      await placeAhead('swarm', 4.5);
      await page.evaluate(() => { window.backrooms.player.pitch = -0.22; });
      await captureSubject('swarm');

      await page.evaluate(() => {
        const k = window.backrooms.input.keys;
        k.add('KeyW'); k.add('ShiftLeft');
      });
      const loud = await runFor(24);
      await page.evaluate(() => {
        const k = window.backrooms.input.keys;
        k.delete('KeyW'); k.delete('ShiftLeft');
      });
      check(loud && (loud.moving || loud.alerted),
        `swarm: wakes up and comes when you sprint `
        + `(moving=${loud && loud.moving}, alerted=${loud && loud.alerted})`);
    }
  }

  /* --- titan: enormous, and it does not lose interest --- */
  {
    const set = await placeAhead('titan', 10);
    if (!set.ok) notes.push('titan: nowhere with 10m of clear sight — skipped');
    else {
      const parts = await partPositions(page);
      check(parts.length >= 6, `titan: renders as a full articulated body (${parts.length} parts)`);
      const head = parts.find((p) => p.mesh === 'entHead');
      const ground = await page.evaluate(() => window.backrooms.entities.list[0].y);
      check(head && head.y - ground > 2.4,
        `titan: stands far taller than a person (head at `
        + `${head ? (head.y - ground).toFixed(2) : '?'}m)`);

      const seen = await runFor(10);
      /* Photograph it while it is still in front — the turn below is the
       * point of the next check and would leave nothing but wallpaper here. */
      await captureSubject('titan');

      /* Turning away does not help: it is not a watcher and does not care. */
      await page.evaluate(() => { window.backrooms.player.yaw += Math.PI; });
      const after = await runFor(24);
      check(after && seen && after.dist < seen.dist,
        `titan: keeps coming whether or not you face it `
        + `(${seen && seen.dist.toFixed(1)}m → ${after && after.dist.toFixed(1)}m)`);
    }
  }

  /*
   * The thing that separates a hunter from a moth at a window: put a wall
   * between it and the player and see whether it comes round.
   *
   * Progress is counted in rendered frames, never against a stopwatch. Under
   * software rendering the whole sim runs at two or three frames a second
   * with dt clamped, so twenty-five seconds of wall clock is about two
   * seconds of game time, and a timed race there measures the renderer rather
   * than the AI.
   */
  {
    const setup = await page.evaluate(() => {
      const g = window.backrooms;
      const p = g.player;
      for (let t = 0; t < 32; t++) {
        const yaw = (t / 32) * Math.PI * 2;
        const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let crossed = false;
        for (let d = 1.5; d <= 14; d += 0.5) {
          const x = p.pos.x + dx * d, z = p.pos.z + dz * d;
          const [gx, gz] = g.world.cellOf(x, z);
          if (g.world.wallAt(gx, gz) > 0.6) { crossed = true; continue; }
          if (!crossed) continue;
          const y = g.world.groundAt(x, z, 0.3);
          if (y < -900 || g.world.blocked(x, z, y, 0.35, 0.5)) continue;
          g.entities.spec = { kind: 'hound', density: 1 };
          g.entities.max = 1;
          g.entities.list.length = 0;
          g.entities.list.push({
            x, y, z, rot: 0, cooldown: 99, alerted: true, frozen: false,
            moving: true, bob: 0, cue: 99, seed: 1, phase: 0, swing: 1,
            headYaw: 0, path: null, pathI: 0, repath: 0, mesh: 'biped',
          });
          return { ok: true, dist: Math.hypot(x - p.pos.x, z - p.pos.z) };
        }
      }
      return { ok: false };
    });

    if (!setup.ok) {
      notes.push('no wall-separated spot found to test pathfinding — skipped');
    } else {
      /* Where it is, how far, and whether the wall is still between them. */
      const probe = () => page.evaluate(() => {
        const g = window.backrooms, e = g.entities.list[0], p = g.player;
        if (!e) return null;
        const steps = 40;
        let blocked = false;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const [gx, gz] = g.world.cellOf(e.x + (p.pos.x - e.x) * t, e.z + (p.pos.z - e.z) * t);
          if (g.world.wallAt(gx, gz) > 0.6) { blocked = true; break; }
        }
        return {
          blocked,
          pathLen: e.path ? e.path.length : -1,
          dist: Math.hypot(e.x - p.pos.x, e.z - p.pos.z),
        };
      });

      await waitFrames(page, 4);
      const first = await probe();
      check(first && first.blocked,
        'the test actually put a wall between them');
      check(first && first.pathLen > 1,
        `a hunter plans a route round it (${first && first.pathLen} waypoints)`);

      /*
       * Let it walk, measured in frames so the software renderer cannot turn
       * this into a timing test.
       *
       * What is measured is "did it get round", not "did pathI go up". The
       * route is re-planned twice a second and pathI resets to 0 with each
       * new plan, so the index describes a position inside the *current*
       * plan and says nothing at all about progress across plans — which is
       * why the first version of this check failed against a hunter that was
       * in fact walking straight to the player.
       */
      let closest = first ? first.dist : Infinity;
      let cleared = false;
      for (let i = 0; i < 12; i++) {
        await waitFrames(page, 12);
        const now = await probe();
        if (!now) break;
        closest = Math.min(closest, now.dist);
        if (!now.blocked) cleared = true;
        if (cleared && now.dist < 2.5) break;
      }
      check(cleared && closest < (first ? first.dist : 0) - 1.0,
        `the hunter comes round the wall rather than pressing into it `
        + `(line ${cleared ? 'cleared' : 'still blocked'}, `
        + `${(first ? first.dist : 0).toFixed(1)}m → ${closest.toFixed(1)}m)`);
    }
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
