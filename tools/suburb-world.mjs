#!/usr/bin/env node
/*
 * suburb-world.mjs — headless checks over Pine Court.
 *
 * These are the invariants that are invisible in any single frame and fatal
 * when they break. The one that matters most is reachability: a flag on a
 * garage roof with nothing to climb, or a bed standing in front of the only
 * bedroom door, is not a hard night — it is a night that cannot be finished,
 * and it looks completely normal on screen. Both of those were real, and both
 * were found here rather than by playing.
 *
 * Usage:
 *   node --experimental-default-type=module tools/suburb-world.mjs
 *   … --seeds 3     how many neighbourhoods to sweep (default 3)
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(join(ROOT, p)).href);

const { buildLayout, PLAN, interiorOf } = await load('suburb/src/world/layout.js');
const { buildWorld } = await load('suburb/src/world/build.js');
const { nightConfig, NIGHTS } = await load('suburb/src/game/nights.js');
const { Whistler } = await load('suburb/src/game/whistler.js');
const { Flag } = await load('suburb/src/game/flag.js');
const { Clock } = await load('suburb/src/game/clock.js');
const { neighbourLines } = await load('suburb/src/game/story.js');
const { Neighbours } = await load('suburb/src/game/neighbours.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const SEEDS = Array.from({ length: Number(arg('--seeds', 3)) },
  (_, i) => 1000 + i * 7919);

const layout0 = buildLayout(1, SEEDS[0]);

let checks = 0;
const failures = [];
const check = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
};

/* ------------------------------------------------------------------ *
 * Reachability
 *
 * A flood fill over a 35cm grid using the same rules the player controller
 * uses: you may step up 62cm, you need 34cm of clearance around you, and a
 * hole in the ground is somewhere you can stand. Doors are treated as open,
 * because they are — pressing E is not a puzzle.
 * ------------------------------------------------------------------ */

const GRID = 0.35, STEP = 0.62, RADIUS = 0.34;

function floodFill(layout, world) {
  const col = world.collision;
  for (const d of world.doors) { d.box.solid = false; d.box.opaque = false; }
  col.build();

  const b = layout.bounds;
  const nx = Math.floor((b.x1 - b.x0) / GRID);
  const nz = Math.floor((b.z1 - b.z0) / GRID);
  const seen = new Map();
  const key = (i, j) => j * nx + i;
  const si = Math.round((layout.spawn.x - b.x0) / GRID);
  const sj = Math.round((layout.spawn.z - b.z0) / GRID);
  const start = col.groundAt(layout.spawn.x, layout.spawn.z, 2, STEP);
  const queue = [[si, sj, start]];
  seen.set(key(si, sj), start);

  while (queue.length) {
    const [i, j, y] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 1 || nj < 1 || ni >= nx - 1 || nj >= nz - 1) continue;
      const k = key(ni, nj);
      const x = b.x0 + ni * GRID, z = b.z0 + nj * GRID;
      const g = col.groundAt(x, z, y, STEP, 0);
      if (g > y + STEP) continue;
      if (!col.standableAt(x, z, g, RADIUS, 1.75, STEP)) continue;
      const prev = seen.get(k);
      if (prev !== undefined && prev >= g - 0.01) continue;
      seen.set(k, g);
      queue.push([ni, nj, g]);
    }
  }
  return { seen, nx, b };
}

/*
 * Can the flag be picked up from anywhere the player can stand?
 *
 * This asks exactly what Flag.inReach() asks, and it has to: measuring some
 * other distance is how a test passes a site the game then refuses to hand
 * over. Reaching up is 1.3m and reaching down is 1.6m from the hand, which is
 * 90cm above the feet — so a flag on a garage roof is reachable from the crate
 * below it and a flag in a pit is reachable from its floor.
 */
function reachDistance(fill, site) {
  let best = 1e9;
  for (const [k, cy] of fill.seen) {
    const i = k % fill.nx, j = Math.floor(k / fill.nx);
    const px = fill.b.x0 + i * GRID, pz = fill.b.z0 + j * GRID;
    const dy = site.y - (cy + 0.9);
    if (dy > 1.3 || dy < -1.6) continue;
    const d = Math.hypot(px - site.x, pz - site.z);
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The sweep
 * ------------------------------------------------------------------ */

for (const seed of SEEDS) {
  /* The street is a pure function of the seed, so the fill is done once and
   * every night of that save is checked against it. */
  const first = buildLayout(1, seed);
  const firstWorld = buildWorld(first);
  const fill = floodFill(first, firstWorld);
  check(fill.seen.size > 20000,
    `seed ${seed}: only ${fill.seen.size} standable cells — the player is boxed in`);

  /* The street must not move between nights, or the daylight walk is a lie. */
  const fingerprint = (l) => l.houses.map((h) => [
    h.x, h.z0, h.siding, h.garageSide, h.dog ? 1 : 0, h.wallTop.toFixed(2),
  ].join(',')).join('|');
  const propPrint = (l) => l.props.map((p) => `${p.kind}:${(p.x ?? 0).toFixed(2)}`).join('|');
  const base = fingerprint(first), baseProps = propPrint(first);

  const usedSites = new Set();
  for (const cfg of NIGHTS) {
    const n = cfg.n;
    const layout = buildLayout(n, seed);
    const world = buildWorld(layout);

    check(fingerprint(layout) === base,
      `seed ${seed} night ${n}: the houses moved between nights`);
    check(propPrint(layout) === baseProps,
      `seed ${seed} night ${n}: the street furniture moved between nights`);

    /* Every night's flag has to be standable-next-to. */
    const s = layout.flagSite;
    const d = reachDistance(fill, s);
    check(d < 2.1,
      `seed ${seed} night ${n}: flag site "${s.id}" is ${d.toFixed(1)}m from anywhere `
      + 'the player can stand at the right height');
    usedSites.add(s.id);

    /* And it has to be gettable home inside the time, at a walk, with no
     * detours: the shortest path there and back at walking pace must leave at
     * least a minute for the finding and the solving. */
    const home = layout.goal;
    const trip = 2 * Math.hypot(s.x - home.x, s.z - home.z);
    const clock = new Clock(n);
    const budget = clock.duration - clock.flagAt;
    check(trip / 2.7 < budget - 60,
      `seed ${seed} night ${n}: ${Math.round(trip)}m round trip needs `
      + `${Math.round(trip / 2.7)}s of a ${budget}s window — no time to play`);

    /* The lock, if there is one, must be a puzzle that exists and whose answer
     * is derivable from something a neighbour says in daylight. */
    if (s.lock) {
      const p = layout.puzzles[s.lock];
      check(!!p, `seed ${seed} night ${n}: site "${s.id}" locks with unknown puzzle`);
      check(p && !p.solved, `seed ${seed} night ${n}: puzzle "${s.lock}" starts solved`);
      if (p && p.kind === 'keypad') {
        check(/^[0-9]+$/.test(String(p.answer)) && String(p.answer).length === p.digits,
          `seed ${seed} night ${n}: keypad answer "${p.answer}" is not ${p.digits} digits`);
      }
      if (p && p.kind === 'order') {
        const sorted = p.items.slice().sort((a, b) => a.age - b.age).map((x) => x.id);
        check(sorted.join() === p.answer.join(),
          `seed ${seed} night ${n}: the gnome answer is not the ages in order`);
      }
      if (p && p.kind === 'choice') {
        check(p.options[p.answer].semitone === 0,
          `seed ${seed} night ${n}: the correct music box is not the in-tune one`);
      }
    }

    /* The daytime clue for tonight's lock must come out of a mouth that is
     * actually in a garden that afternoon. */
    const day = new Neighbours(layout, cfg, seed, 'day');
    const spoken = new Set(day.people.map((p) => p.houseId));
    const clueHouse = {
      code: 9, gnomes: 6, mirror: 7, sound: 3,
    }[s.lock];
    if (clueHouse) {
      const h = layout.houses.find((x) => x.number === clueHouse);
      check(spoken.has(h.id),
        `seed ${seed} night ${n}: the clue for "${s.lock}" belongs to number `
        + `${clueHouse}, who is not outside in the daylight`);
      const lines = neighbourLines(h, layout, n);
      check(lines.length >= 2,
        `seed ${seed} night ${n}: number ${clueHouse} has nothing to say`);
      if (s.lock === 'code') {
        /* The neighbour says it in words and the box itself has it in digits.
         * Both have to be there: the words are the clue you get in daylight,
         * and the digits are what you can still read at 3:33 with nobody to
         * ask. */
        check(lines.join(' ').includes('פחות שלוש'),
          `seed ${seed} night ${n}: the neighbour does not state the arithmetic`);
        check(layout.puzzles.code.note.includes('פחות 3'),
          `seed ${seed} night ${n}: the mailbox does not carry the arithmetic`);
        const mail = layout.houses.find((x) => x.number === 9);
        check(String((mail.number - 3) * 2) === layout.puzzles.code.answer,
          `seed ${seed} night ${n}: the mailbox answer does not follow from the clue`);
      }
      if (s.lock === 'gnomes') {
        const ages = layout.puzzles.gnomes.items.slice()
          .sort((a, b) => a.age - b.age).map((g) => g.age);
        const said = lines.join(' ');
        const order = ages.map((a) => said.indexOf(`בן ${a}`));
        check(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])),
          `seed ${seed} night ${n}: the gnome clue lists the ages out of order`);
      }
    }

    /* Her walk graph has to be connected, or she patrols one corner all night
     * while the other half of the neighbourhood is free. */
    const g = layout.graph;
    const seenN = new Uint8Array(g.nodes.length);
    const stack = [0];
    seenN[0] = 1;
    let count = 1;
    while (stack.length) {
      for (const nb of g.adj[stack.pop()]) {
        if (seenN[nb]) continue;
        seenN[nb] = 1;
        count++;
        stack.push(nb);
      }
    }
    check(count === g.nodes.length,
      `seed ${seed} night ${n}: the walk graph has ${g.nodes.length - count} `
      + 'unreachable nodes');

    /* She must start far enough away that the player can get out of their own
     * front door before anything happens. */
    const w = new Whistler(layout, cfg, seed);
    const away = Math.hypot(w.pos.x - layout.spawn.x, w.pos.z - layout.spawn.z);
    check(away > 45,
      `seed ${seed} night ${n}: she starts ${Math.round(away)}m from the player's bed`);

    /* Nothing may be inside a house that is not enterable, and the flag may
     * never be inside one. */
    if (s.inside !== undefined) {
      const h = layout.houses.find((x) => x.id === s.inside);
      check(h && h.enterable,
        `seed ${seed} night ${n}: the flag is inside number ${h && h.number}, `
        + 'which is locked');
    }

    /* A relocating flag must always have somewhere to go, and never into a
     * lock. */
    if (cfg.relocate) {
      const flag = new Flag(layout, cfg, seed);
      flag.place();
      const free = layout.sites.filter((x) => !x.lock && x.id !== flag.site.id);
      check(free.length > 0,
        `seed ${seed} night ${n}: nowhere for the flag to relocate to`);
      if (!flag.site.lock) {
        flag.age = cfg.relocate + 1;
        flag.update(0.1);
        check(!flag.site.lock,
          `seed ${seed} night ${n}: the flag relocated into a locked site`);
      }
    }

    /* The interior anchors the builder and the spawn both read. */
    for (const h of layout.houses) {
      const IN = interiorOf(h);
      const doorX = h.x - h.w / 2 + IN.doorU;
      check(Math.abs(doorX - IN.bed.x) > 1.4,
        `seed ${seed}: number ${h.number} has its bed in the bedroom doorway`);
      check(Math.abs(doorX - IN.wardrobe.x) > 1.1,
        `seed ${seed}: number ${h.number} has its wardrobe in the doorway`);
    }

    /* Houses must not stand in the road. */
    for (const h of layout.houses) {
      const half = PLAN.roadHalf + PLAN.pave;
      check(Math.min(Math.abs(h.z0), Math.abs(h.z1)) > half,
        `seed ${seed}: number ${h.number} is built on the pavement`);
      check(Math.abs(h.x) - h.w / 2 > half || Math.abs(h.z0) > half,
        `seed ${seed}: number ${h.number} is built across Elm Court`);
    }

    /* Every interactable the mesher promised is inside the world. */
    for (const it of world.interact) {
      check(it.x >= layout.bounds.x0 && it.x <= layout.bounds.x1
        && it.z >= layout.bounds.z0 && it.z <= layout.bounds.z1,
        `seed ${seed} night ${n}: "${it.kind}" is outside the neighbourhood`);
    }
    check(world.interact.some((i) => i.kind === 'bed'),
      `seed ${seed} night ${n}: there is no bed to sleep in`);
    check(world.doors.length === layout.houses.length,
      `seed ${seed} night ${n}: ${world.doors.length} doors for `
      + `${layout.houses.length} houses`);
    check(world.sectors.length > 4 && world.sectors.every((x) => x.data.triangleCount > 0),
      `seed ${seed} night ${n}: empty geometry sector`);
    check(world.lights.length >= 10,
      `seed ${seed} night ${n}: only ${world.lights.length} lights in the street`);
  }

  /* Seven nights should not be the same three places. */
  check(usedSites.size >= 5,
    `seed ${seed}: only ${usedSites.size} distinct flag sites across seven nights`);
}

/* ------------------------------------------------------------------ *
 * Five minutes of her
 *
 * Everything above is static: the street, the sites, the numbers. This runs an
 * actual night at thirty frames a second with a scripted player and watches
 * what she does with it, because the one thing that cannot be read off the
 * layout is whether her patrol goes anywhere.
 *
 * It exists because the first version did not. She stepped to a random
 * neighbouring node whenever she arrived at one, which sounds like wandering
 * and is actually loitering: 175 metres in five minutes, six of the sixty
 * ten-metre squares in the neighbourhood, and a player could walk the whole
 * street twice without being noticed. Nothing in the code looked wrong. The
 * numbers below are what "she is out there somewhere" has to mean.
 * ------------------------------------------------------------------ */

function walkNight(night, seed, mode) {
  const layout = buildLayout(night, seed);
  const world = buildWorld(layout);
  for (const d of world.doors) { d.box.solid = false; d.box.opaque = false; }
  world.collision.build();
  const cfg = nightConfig(night);
  const w = new Whistler(layout, cfg, seed);
  const home = layout.home;
  const player = {
    pos: { x: home.x, y: 0, z: home.frontZ - home.sign * 6 },
    eye: 1.66, crouch: false, speed: 0, torchOn: false, carrying: false,
    hidden: null, frozen: mode === 'still',
  };
  /* A lap of the neighbourhood, at a walk, for the moving case. */
  const route = [[0, 0], [60, 0], [60, 20], [0, 20], [0, -30], [-60, -10]];
  let leg = 0;

  const dt = 1 / 30;
  const steps = Math.round((cfg.end - cfg.start) / dt);
  const cells = new Set();
  let moved = 0, stuck = 0, caught = 0;
  let prev = { x: w.pos.x, z: w.pos.z };

  for (let i = 0; i < steps; i++) {
    if (mode === 'walk') {
      const t = route[leg];
      const dx = t[0] - player.pos.x, dz = t[1] - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) leg = (leg + 1) % route.length;
      else {
        player.pos.x += (dx / d) * 2.7 * dt;
        player.pos.z += (dz / d) * 2.7 * dt;
        player.speed = 2.7;
      }
      if (i % 15 === 0) w.hear(player.pos.x, player.pos.z, 0.45, world.collision);
    }
    w.update(dt, player, world.collision, 0.25);
    for (const e of w.events) if (e.type === 'caught') caught++;
    const step = Math.hypot(w.pos.x - prev.x, w.pos.z - prev.z);
    moved += step;
    if (step < 0.002 && w.pause <= 0 && w.state !== 'hunt') stuck++;
    prev = { x: w.pos.x, z: w.pos.z };
    cells.add(`${Math.round(w.pos.x / 10)},${Math.round(w.pos.z / 10)}`);
    if (!Number.isFinite(w.pos.x) || !Number.isFinite(w.pos.z)) break;
  }
  return { moved, cells: cells.size, stuck: stuck / steps, caught, state: w.state, w };
}

for (const seed of SEEDS.slice(0, 2)) {
  for (const night of [1, 4, 7]) {
    for (const mode of ['still', 'walk']) {
      const r = walkNight(night, seed, mode);
      const cfg = nightConfig(night);
      /* Half the ground she could cover if she never stopped. She stops a lot,
       * which is the point of her, so half is the floor rather than the aim. */
      const could = cfg.speed * (cfg.end - cfg.start);
      check(r.moved > could * 0.45,
        `seed ${seed} night ${night} (${mode}): she covered `
        + `${Math.round(r.moved)}m of a possible ${Math.round(could)}m — she is loitering`);
      check(r.cells >= 8,
        `seed ${seed} night ${night} (${mode}): she visited ${r.cells} squares of the `
        + 'neighbourhood in a whole night');
      check(r.stuck < 0.08,
        `seed ${seed} night ${night} (${mode}): she was stuck against something for `
        + `${Math.round(r.stuck * 100)}% of the night`);
      check(r.caught <= 1,
        `seed ${seed} night ${night} (${mode}): the catch fired ${r.caught} times`);
      check(Number.isFinite(r.w.pos.x) && Number.isFinite(r.w.pos.z),
        `seed ${seed} night ${night} (${mode}): she ended up at a non-finite position`);
      const b = layout0.bounds;
      check(r.w.pos.x >= b.x0 - 5 && r.w.pos.x <= b.x1 + 5
        && r.w.pos.z >= b.z0 - 5 && r.w.pos.z <= b.z1 + 5,
        `seed ${seed} night ${night} (${mode}): she left the neighbourhood`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * The clock
 * ------------------------------------------------------------------ */

for (const cfg of NIGHTS) {
  const c = new Clock(cfg.n);
  c.start();
  check(c.text === `3:${String(Math.floor((cfg.start % 3600) / 60)).padStart(2, '0')}:00`,
    `night ${cfg.n}: the clock starts at ${c.text}`);
  c.update(c.duration + 5);
  check(c.text === '3:35:00', `night ${cfg.n}: the night ends at ${c.text}, not 3:35`);
  check(c.phase === 'over', `night ${cfg.n}: the clock did not stop`);
  const c2 = new Clock(cfg.n);
  c2.start();
  c2.update(c2.flagAt + 0.1);
  check(c2.phase === 'hunt', `night ${cfg.n}: the flag phase did not start at 3:31`);
}

/* Difficulty has to actually go one way. */
for (let i = 1; i < NIGHTS.length; i++) {
  check(NIGHTS[i].speed >= NIGHTS[i - 1].speed,
    `night ${NIGHTS[i].n} is not faster than the one before it`);
  check(NIGHTS[i].sight >= NIGHTS[i - 1].sight,
    `night ${NIGHTS[i].n} does not see further than the one before it`);
  check(NIGHTS[i].hideTime <= NIGHTS[i - 1].hideTime,
    `night ${NIGHTS[i].n} gives longer in a wardrobe than the one before it`);
}
check(nightConfig(99).n === 7, 'nightConfig does not clamp past the last night');
check(nightConfig(0).n === 1, 'nightConfig does not clamp before the first night');

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

if (failures.length) {
  console.error(`\n${failures.length} of ${checks} checks failed:\n`);
  for (const f of failures.slice(0, 40)) console.error('  ✗ ' + f);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`${checks} checks passed over ${SEEDS.length} neighbourhoods `
  + `and ${NIGHTS.length} nights each.`);
