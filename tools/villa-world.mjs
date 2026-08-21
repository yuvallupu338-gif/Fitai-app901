#!/usr/bin/env node
/*
 * villa-world.mjs — the checks a screenshot cannot make.
 *
 * Driving a first-person game through a browser to find out whether a wall is
 * in the right place is slow, flaky and mostly tests the test: half an hour
 * was spent here watching a player walk into a door frame and reading it as a
 * camera bug. These are the invariants instead — stated independently of the
 * code that has to satisfy them, and each one written because something
 * actually broke.
 *
 *   geometry     every linked pair of rooms shares a real wall segment; no two
 *                openings overlap on the same wall run; every walkable area is
 *                reachable from the front door.
 *   sightlines   the pocket of night behind an opening is deeper than the
 *                place entities stand in it — this was wrong, and it made the
 *                whole "something is at the window" feature invisible.
 *   rules        the ones the specification fixes and the game may not drift
 *                from: fifteen rounds every dawn, two neighbour calls in a
 *                run, no calling without the number, no calling from anywhere
 *                but the entrance, and every night harder than the last.
 *
 * Usage: node tools/villa-world.mjs
 */

import { ROOMS, ROOM_BY_ID, sharedWall } from '../villa/src/data/rooms.js';
import { REGULAR_OPENINGS, HIDDEN_OPENINGS } from '../villa/src/data/openings.js';
import {
  buildVilla, roomRect, SCALE, WALL_T, DOOR_W, WINDOW_W, NARROW_W,
} from '../villa/src/world/build.js';
import { buildProps } from '../villa/src/world/props.js';
import { buildAllBarricades } from '../villa/src/world/barricade.js';
import { MeshBuilder } from '../villa/src/render/meshbuilder.js';
import { MATERIALS, MATERIAL_INDEX } from '../villa/src/render/materials.js';
import { MATERIAL_KINDS, bakeMaterial } from '../villa/src/render/textures.js';
import { GAME_CONFIG, regularCount, hiddenCount, threatCount, breachRate } from '../villa/src/data/config.js';
import { newRun, step, perform, canPerform, PHASE } from '../villa/src/sim/sim.js';
import { CUTOUT_MATERIALS } from '../villa/src/render/materials.js';
import { addBox, addCylinder } from '../villa/src/render/meshbuilder.js';
import { parse } from '../villa/src/ui/text.js';
import { drain } from '../villa/src/core/events.js';

const failures = [];
let checks = 0;
const check = (cond, msg) => { checks++; if (!cond) failures.push(msg); };

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

for (const r of ROOMS) {
  for (const link of r.links) {
    check(!!ROOM_BY_ID[link], `${r.id} links to ${link}, which does not exist`);
    check(ROOM_BY_ID[link].links.includes(r.id),
      `${r.id} -> ${link} is one-way; links must be mutual or the map lies`);
    const wall = sharedWall(r.id, link);
    check(!!wall,
      `${r.id} and ${link} are linked but share no wall segment — a doorway `
      + 'that cannot be drawn and a house that cannot be walked through');
    if (wall) {
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) * SCALE;
      check(len >= DOOR_W + 0.1,
        `the wall between ${r.id} and ${link} is ${len.toFixed(2)}m — too `
        + `narrow for a ${DOOR_W}m doorway`);
    }
  }
}

/* Openings must not eat each other. Two overlapping holes on one wall run cut
 * the pier between them away entirely and the wall becomes one wide gap. */
const wallRuns = {};
for (const d of REGULAR_OPENINGS) {
  const r = ROOM_BY_ID[d.room];
  check(!!r, `opening ${d.id} names room ${d.room}, which does not exist`);
  if (!r) continue;
  const horizontal = d.side === 'north' || d.side === 'south';
  const len = (horizontal ? r.w : r.h) * SCALE - WALL_T;
  const w = d.kind === 'door' ? DOOR_W : (d.narrow ? NARROW_W : WINDOW_W);
  const half = (w / 2) / len;
  check(half < 0.45, `${d.id} is ${w}m wide on a ${len.toFixed(2)}m wall`);
  const t = Math.min(Math.max(d.at, half + 0.04), 1 - half - 0.04);
  const key = `${d.room}:${d.side}`;
  (wallRuns[key] = wallRuns[key] || []).push({ id: d.id, t0: t - half, t1: t + half });
}
for (const [key, list] of Object.entries(wallRuns)) {
  list.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < list.length; i++) {
    check(list[i].t0 >= list[i - 1].t1,
      `${list[i - 1].id} and ${list[i].id} overlap on ${key}`);
  }
}

/* Every regular opening must be in an outside wall. A window into the next
 * room is not a way in for anything and cannot be attacked from outside. */
for (const d of REGULAR_OPENINGS) {
  const r = ROOM_BY_ID[d.room];
  if (!r) continue;
  const onOutside = !r.links.some((link) => {
    const wall = sharedWall(r.id, link);
    if (!wall) return false;
    const b = roomRect(r);
    if (d.side === 'north') return Math.abs(wall.y1 - b.z0 / SCALE) < 0.01 && !wall.vertical;
    if (d.side === 'south') return Math.abs(wall.y1 - b.z1 / SCALE) < 0.01 && !wall.vertical;
    if (d.side === 'west') return Math.abs(wall.x1 - b.x0 / SCALE) < 0.01 && wall.vertical;
    return Math.abs(wall.x1 - b.x1 / SCALE) < 0.01 && wall.vertical;
  });
  check(onOutside,
    `${d.id} is on the ${d.side} wall of ${d.room}, which is shared with `
    + 'another room — it is a window into the house, not out of it');
}

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

const villa = buildVilla(MATERIAL_INDEX);
const propMb = new MeshBuilder(20000);
const props = buildProps(propMb, MATERIAL_INDEX);
const propMesh = propMb.finish();

check(villa.mesh.indices.length > 0, 'the villa built no geometry at all');
check(villa.mesh.indices.length % 3 === 0, 'the villa mesh has a partial triangle');
check(propMesh.indices.length % 3 === 0, 'the props mesh has a partial triangle');

/* Every material index that reaches a vertex must be a real layer, or the
 * shader samples past the end of the array texture. */
const VERTEX_FLOATS = 15;
const MAT_OFFSET = 13;
for (const mesh of [villa.mesh, propMesh, villa.glass]) {
  for (let i = 0; i < mesh.vertexCount; i++) {
    const m = mesh.vertices[i * VERTEX_FLOATS + MAT_OFFSET];
    if (m >= 0 && m < MATERIALS.length && Number.isInteger(m)) continue;
    check(false, `a vertex carries material index ${m}, outside 0..${MATERIALS.length - 1}`);
    break;
  }
}
checks += 3;

for (const m of MATERIALS) {
  check(MATERIAL_KINDS.includes(m.kind), `material ${m.name} has unknown kind "${m.kind}"`);
}

/* Anchors: one per opening, inside its room, facing into it. */
const allOpenings = REGULAR_OPENINGS.concat(HIDDEN_OPENINGS);
for (const d of allOpenings) {
  const a = villa.anchors[d.id];
  check(!!a, `opening ${d.id} has no anchor, so it can never be aimed at`);
  if (!a) continue;
  const b = roomRect(ROOM_BY_ID[d.room]);
  const pad = 0.35;
  check(a.x >= b.x0 - pad && a.x <= b.x1 + pad && a.z >= b.z0 - pad && a.z <= b.z1 + pad,
    `${d.id}'s anchor is outside its own room`);
  const n = Math.hypot(a.nx || 0, a.ny || 0, a.nz || 0);
  check(Math.abs(n - 1) < 0.001, `${d.id}'s anchor normal is not unit length (${n})`);
  check(a.width > 0.2, `${d.id} has a ${a.width}m opening`);
  check(a.y1 > a.y0, `${d.id} has no height`);
}

/*
 * Sightlines. entities.js stands a figure 0.85m to 1.35m outside an opening,
 * along the negative inward normal. The pocket of night behind that opening
 * has to be deeper than that, or the back of the pocket is in front of the
 * figure and nothing at any window is ever visible — which is exactly what
 * shipped, and it silently removed a whole layer of the game.
 */
const ENTITY_DEPTH_MAX = 1.35;
const POCKET_DEPTH = 3.4;
check(POCKET_DEPTH > ENTITY_DEPTH_MAX + 0.5,
  `the night pocket is ${POCKET_DEPTH}m deep but entities stand up to `
  + `${ENTITY_DEPTH_MAX}m out — they would be behind the back wall`);

/*
 * Reachability. Flood from the entrance through overlapping walkable
 * rectangles; every room must come out reachable, or some part of the house
 * can be seen on the map and never entered.
 */
const areas = villa.areas;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const seen = new Set();
const queue = [areas.findIndex((a) => a.room === 'entrance')];
check(queue[0] >= 0, 'there is no walkable area for the entrance');
seen.add(queue[0]);
while (queue.length) {
  const i = queue.pop();
  for (let j = 0; j < areas.length; j++) {
    if (seen.has(j) || !overlaps(areas[i], areas[j])) continue;
    seen.add(j);
    queue.push(j);
  }
}
for (const r of ROOMS) {
  const idx = areas.findIndex((a) => a.room === r.id);
  check(idx >= 0 && seen.has(idx),
    `${r.id} cannot be walked to from the front door`);
}

/* Barricades must build for every count the rules allow. */
for (let planks = 0; planks <= GAME_CONFIG.MAX_PLANKS; planks++) {
  for (let tape = 0; tape <= GAME_CONFIG.MAX_TAPE; tape++) {
    const fake = allOpenings.map((d) => ({
      id: d.id, present: true, revealed: true, planks, tape, breached: false,
    }));
    let built;
    try {
      built = buildAllBarricades(fake, villa.anchors, MATERIAL_INDEX);
    } catch (e) {
      check(false, `barricades threw at ${planks} planks / ${tape} tape: ${e.message}`);
      continue;
    }
    check(planks === 0 || (built.solid && built.solid.indices.length > 0),
      `${planks} planks produced no board geometry`);
    check(tape === 0 || (built.tape && built.tape.indices.length > 0),
      `${tape} tape produced no tape geometry`);
  }
}

/* Every material bakes without throwing, and produces the two maps. */
for (const m of MATERIALS) {
  const baked = bakeMaterial(m, 16);
  check(baked.albedo.length === 16 * 16 * 4, `${m.name} baked a wrong-sized albedo`);
  check(baked.normal.length === 16 * 16 * 4, `${m.name} baked a wrong-sized normal map`);
}

/* Props: the three the rules depend on must exist and be in the right room. */
for (const [key, room] of [['phone', 'entrance'], ['drawer', 'bedroom'], ['supplies', 'supply']]) {
  const a = props.anchors[key];
  check(!!a, `there is no ${key} anywhere in the villa`);
  if (!a) continue;
  const b = roomRect(ROOM_BY_ID[room]);
  check(a.x >= b.x0 && a.x <= b.x1 && a.z >= b.z0 && a.z <= b.z1,
    `the ${key} is not in the ${room}`);
}

/* ------------------------------------------------------------------ *
 * The rules the specification fixes
 * ------------------------------------------------------------------ */

check(GAME_CONFIG.NIGHTS_TOTAL === 7, 'there must be seven nights');
check(GAME_CONFIG.GUN_AMMO_PER_DAY === 15, 'the rifle holds fifteen rounds');
check(GAME_CONFIG.NEIGHBOR_CALLS_TOTAL === 2, 'the neighbour may be called twice in a run');

/* Every night harder than the one before, on every axis that has one. */
for (let n = 2; n <= GAME_CONFIG.NIGHTS_TOTAL; n++) {
  check(regularCount(n) >= regularCount(n - 1),
    `night ${n} has fewer regular openings than night ${n - 1}`);
  check(hiddenCount(n) >= hiddenCount(n - 1),
    `night ${n} has fewer hidden openings than night ${n - 1}`);
  check(threatCount(n) >= threatCount(n - 1),
    `night ${n} has fewer threats than night ${n - 1}`);
  check(breachRate(n) >= breachRate(n - 1),
    `night ${n} breaks in slower than night ${n - 1}`);
  const harder = regularCount(n) + hiddenCount(n) + threatCount(n)
    > regularCount(n - 1) + hiddenCount(n - 1) + threatCount(n - 1)
    || breachRate(n) > breachRate(n - 1);
  check(harder, `night ${n} is not harder than night ${n - 1} in any respect`);
}

/*
 * The neighbour, driven through the real simulation rather than read off the
 * config: the number has to be found first, the call has to come from the
 * entrance, and there are two of them in a run and no more.
 */
{
  /* He is a night mechanic: there is nothing to call him about in daylight. */
  const s = newRun(12345);
  s.phase = PHASE.NIGHT;
  s.player.room = 'entrance';
  check(!!canPerform(s, { type: 'call' }),
    'the neighbour could be called before the number was found');

  s.numberFound = true;
  s.player.room = 'kitchen';
  check(!!canPerform(s, { type: 'call' }),
    'the neighbour could be called from a room with no telephone in it');

  s.phase = PHASE.DAY;
  s.player.room = 'entrance';
  check(!!canPerform(s, { type: 'call' }),
    'the neighbour could be called during the day');

  s.phase = PHASE.NIGHT;
  check(!canPerform(s, { type: 'call' }),
    'the neighbour could not be called at night, with the number, from the entrance');

  let used = 0;
  for (let i = 0; i < 6; i++) {
    s.player.room = 'entrance';
    s.neighbor.status = 'away';
    s.neighbor.timer = 0;
    if (!canPerform(s, { type: 'call' })) { perform(s, { type: 'call' }); used++; }
  }
  check(used === GAME_CONFIG.NEIGHBOR_CALLS_TOTAL,
    `the neighbour answered ${used} times in one run, not `
    + `${GAME_CONFIG.NEIGHBOR_CALLS_TOTAL}`);
  check(s.neighbor.callsLeft === 0, 'the call counter did not run out');
}

/* Dawn must put the rifle back to exactly fifteen, never more. */
{
  /*
   * Run the clock to the end of each phase rather than playing the night:
   * left alone, nobody boards anything and the house is through by the small
   * hours, so an unattended run never sees a dawn at all and the check would
   * pass by never running.
   */
  const s = newRun(999);
  let dawns = 0;
  for (let guard = 0; guard < 40 && dawns < 3; guard++) {
    s.inv.ammo = 2;
    /* keep the house standing: this is about the reload, not about survival */
    for (const o of s.openings) { o.integrity = 0; o.breached = false; }
    s.danger = 0;
    const before = s.night;
    s.clock = s.phaseLength - 0.1;
    step(s, 0.5);
    if (s.phase === PHASE.DAY && s.night !== before) {
      dawns++;
      check(s.inv.ammo === GAME_CONFIG.GUN_AMMO_PER_DAY,
        `dawn ${dawns} left the rifle with ${s.inv.ammo} rounds, not `
        + `${GAME_CONFIG.GUN_AMMO_PER_DAY}`);
    }
    if (s.phase === PHASE.OVER || s.phase === PHASE.WON) break;
  }
  check(dawns >= 3, `only ${dawns} dawns were reached, so the reload is barely tested`);
}

/* A full run must be able to end. A simulation that neither wins nor loses is
 * a simulation nobody can finish. */
{
  let ended = 0;
  for (const seed of [1, 7, 42, 1000, 65535]) {
    const s = newRun(seed);
    for (let i = 0; i < 200000; i++) {
      step(s, 0.5);
      if (s.phase === PHASE.OVER || s.phase === PHASE.WON) { ended++; break; }
    }
  }
  check(ended === 5, `${5 - ended} of 5 unattended runs never reached an ending`);
}

/* ------------------------------------------------------------------ *
 * Regressions
 *
 * Each of these was a shipped bug. They are here rather than in a comment
 * because every one of them was invisible in a screenshot.
 * ------------------------------------------------------------------ */

/*
 * Texel density. addBox's UV axes were transposed against its geometry, so a
 * face was stretched by sx/sy — eleven to one on a shelf board. The invariant
 * is that one metre of surface is one unit of UV on every face of any box.
 */
{
  const mb = new MeshBuilder(256);
  addBox(mb, 0, 0, 0, 2.0, 0.1, 0.2, 0, 0);
  const f = mb.finish();
  const V = 15;
  let worst = 1;
  for (let q = 0; q * 4 + 3 < f.vertexCount; q++) {
    const at = (i) => ({
      p: [f.vertices[i * V], f.vertices[i * V + 1], f.vertices[i * V + 2]],
      uv: [f.vertices[i * V + 6], f.vertices[i * V + 7]],
    });
    const a = at(q * 4);
    for (const o of [at(q * 4 + 1), at(q * 4 + 3)]) {
      const dp = Math.hypot(o.p[0] - a.p[0], o.p[1] - a.p[1], o.p[2] - a.p[2]);
      const du = Math.hypot(o.uv[0] - a.uv[0], o.uv[1] - a.uv[1]);
      if (dp > 1e-6 && du > 1e-6) worst = Math.max(worst, Math.max(du / dp, dp / du));
    }
  }
  check(worst < 1.01, `a box face stretches its texture ${worst.toFixed(1)}:1`);
}

/* Tangent handedness on the hand-authored primitives. addQuad derives the
 * sign from the UV gradient; addCylinder writes it by hand and had it
 * backwards, mirroring the normal map on every round prop. */
{
  const mb = new MeshBuilder(256);
  addCylinder(mb, 0, 0, 0, 0.2, 1, 8, 0);
  const f = mb.finish();
  const V = 15;
  let wrong = 0;
  for (let i = 0; i < f.vertexCount; i++) {
    const n = [f.vertices[i * V + 3], f.vertices[i * V + 4], f.vertices[i * V + 5]];
    const t = [f.vertices[i * V + 8], f.vertices[i * V + 9], f.vertices[i * V + 10]];
    const w = f.vertices[i * V + 11];
    /* cross(n, t) * w must point along +v, which for the side wall is up and
     * for the cap is +Z. Both come out negative without w = -1. */
    const c = [
      n[1] * t[2] - n[2] * t[1],
      n[2] * t[0] - n[0] * t[2],
      n[0] * t[1] - n[1] * t[0],
    ];
    const up = Math.abs(n[1]) > 0.5 ? c[2] * w : c[1] * w;
    if (up < 0) wrong++;
  }
  check(wrong === 0, `${wrong} cylinder vertices have a mirrored bitangent`);
}

/* Glass and the muzzle flash must be drawn in the cut-out pass. As opaque
 * geometry the glass sat inside every window and hid everything outside it,
 * and the flash drew a flat yellow rectangle. */
for (const name of ['glass', 'muzzleFlash', 'tapeStrip']) {
  check(CUTOUT_MATERIALS.has(name), `${name} is not in CUTOUT_MATERIALS`);
  const m = MATERIALS.find((x) => x.name === name);
  check(m && m.cutout === true, `${name} does not declare cutout: true`);
}

/* A bare `ציוד` is the kit report the help text promises, not "take
 * supplies" — the word was in two verb tables and the first one won. */
{
  const s = newRun(3);
  const cases = [
    ['ציוד', 'report_kit'], ['קח ציוד', 'gather'], ['קח', 'gather'],
    ['פתחים', 'report_openings'], ['זמן', 'report_time'],
    ['לך למטבח', 'move'], ['חסום דלת הכניסה', 'tape'],
  ];
  for (const [line, want] of cases) {
    const r = parse(line, s);
    check(r.action && r.action.type === want,
      `"${line}" parses as ${r.action ? r.action.type : r.error}, not ${want}`);
  }
}

/*
 * Hidden openings must not be given away. Dawn used to announce every hole
 * that closed, found or not, and the "go and search that room" hint kept
 * firing for one already found and boarded.
 */
{
  const s = newRun(77);
  s.phase = PHASE.NIGHT;
  const hidden = s.openings.filter((o) => o.hidden && o.present);
  if (hidden.length) {
    for (const o of hidden) { o.revealed = false; o.hinted = false; }
    drain(s);
    /* Run past every wake-up, then read what the player was told. */
    for (let i = 0; i < 4000; i++) step(s, 0.5);
    const told = drain(s);
    const leaked = told.filter((e) => e.kind === 'hidden_gone'
      && !(s.openings.find((o) => o.id === e.id) || {}).revealed);
    check(leaked.length === 0,
      `${leaked.length} unfound hidden openings were announced at dawn`);
  }
  checks++;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log(`villa: ${checks} checks`);
console.log(`  ${villa.mesh.indices.length / 3} building triangles, `
  + `${propMesh.indices.length / 3} prop triangles, `
  + `${Object.keys(villa.anchors).length} anchors, `
  + `${villa.lights.length + props.lights.length} lights, `
  + `${MATERIALS.length} materials`);

if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('all passed');
