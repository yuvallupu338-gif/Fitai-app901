/*
 * entities.js — what is out there, and what got in.
 *
 * Deliberately never described. The simulation calls them threats and
 * intruders and this file draws them, and between the two there is no lore,
 * no name and no face — a silhouette with the proportions slightly wrong is
 * worse than any model, because the player finishes it themselves.
 *
 * Two kinds, and they are drawn very differently on purpose:
 *
 *   **Outside.** A threat working on an opening is drawn *through* it, beyond
 *   the glass, mostly out of the torch's reach. You get a shape and a
 *   suggestion of movement and no detail at all. It never comes closer.
 *
 *   **Inside.** An intruder that came through a breach is in the room with
 *   you, lit by whatever you are lit by, and it walks. The moment the game
 *   stops being about carpentry and starts being about the doorway behind you.
 *
 * Everything here is rebuilt each frame into one dynamic buffer. A figure is
 * about sixty triangles and there are rarely more than six, so the whole cast
 * is cheaper than a single piece of furniture.
 */

import { MeshBuilder, addBox } from '../render/meshbuilder.js';

/*
 * A body. Not a humanoid rig — a stack of boxes with a long spine, narrow
 * shoulders and arms that hang too low, animated by two sine waves. In the
 * dark, at the far end of a torch beam, this reads as a person who is not
 * quite one.
 */
function figure(mb, x, y, z, yaw, phase, mat, scale) {
  const s = scale || 1;
  const sway = Math.sin(phase) * 0.05;
  const step = Math.sin(phase * 2) * 0.09;

  /* torso */
  addBox(mb, x, y + 1.02 * s, z, 0.36 * s, 0.68 * s, 0.22 * s, yaw + sway * 0.4, mat);
  /* head, set slightly too far forward */
  addBox(mb, x + Math.sin(yaw) * 0.05, y + 1.52 * s, z - Math.cos(yaw) * 0.05,
    0.19 * s, 0.24 * s, 0.20 * s, yaw, mat);
  /* shoulders */
  addBox(mb, x, y + 1.32 * s, z, 0.46 * s, 0.10 * s, 0.20 * s, yaw + sway, mat);

  /* arms, hanging past the knee */
  const ax = Math.cos(yaw) * 0.25 * s, az = Math.sin(yaw) * 0.25 * s;
  addBox(mb, x + ax, y + 0.86 * s + step * 0.2, z + az, 0.11 * s, 0.74 * s, 0.11 * s, yaw, mat);
  addBox(mb, x - ax, y + 0.86 * s - step * 0.2, z - az, 0.11 * s, 0.74 * s, 0.11 * s, yaw, mat);

  /* legs */
  const lx = Math.cos(yaw) * 0.11 * s, lz = Math.sin(yaw) * 0.11 * s;
  addBox(mb, x + lx, y + 0.34 * s + step * 0.5, z + lz, 0.14 * s, 0.68 * s, 0.14 * s, yaw, mat);
  addBox(mb, x - lx, y + 0.34 * s - step * 0.5, z - lz, 0.14 * s, 0.68 * s, 0.14 * s, yaw, mat);
}

/*
 * Everything visible this frame.
 *
 * `state` is the simulation, `anchors` the opening positions from buildVilla,
 * and `roomCentre` a lookup for where to stand an intruder that has no better
 * idea. Returns mesh data, or null when the house is empty — which on night
 * one it usually is, and that is the point of night one.
 */
export function buildEntities(state, anchors, roomCentres, mat, time) {
  const mb = new MeshBuilder(2000);
  let any = 0;

  /* --- outside, working on an opening --- */
  for (const o of state.openings) {
    if (!o.present || o.attackers <= 0 || o.breached) continue;
    const a = anchors[o.id];
    if (!a) continue;
    /* Hidden openings in a floor or a ceiling have nothing to stand behind. */
    if (a.ny) continue;

    for (let i = 0; i < Math.min(o.attackers, 2); i++) {
      /* Beyond the wall: along the negative inward normal. */
      const depth = 0.85 + i * 0.5;
      const side = (i === 0 ? 0 : (i % 2 ? 1 : -1)) * 0.55;
      const x = a.x - a.nx * depth + a.dx * side;
      const z = a.z - a.nz * depth + a.dz * side;
      const yaw = Math.atan2(a.nx, -a.nz);
      /* Slower phase than an intruder: it is working, not walking. */
      figure(mb, x, 0, z, yaw, time * 2.2 + i * 2.1, mat.night, 0.98);
      any++;
    }
  }

  /* --- inside --- */
  for (const it of state.intruders) {
    if (it.delay > 0) continue;
    const c = roomCentres[it.room];
    if (!c) continue;
    /* Drift around the room centre rather than standing on it, so two in one
     * room do not occupy the same spot. */
    const seed = hashId(it.id);
    const ox = Math.sin(time * 0.55 + seed) * 0.9;
    const oz = Math.cos(time * 0.43 + seed * 1.7) * 0.9;
    const yaw = time * 0.4 + seed;
    figure(mb, c.x + ox, 0, c.z + oz, yaw, time * 4.4 + seed, mat.night, 1.04);
    any++;
  }

  return any ? mb.finish() : null;
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (h >>> 8) % 1000 / 100;
}

/* One point per room, for standing things in. */
export function roomCentres(areas) {
  const out = {};
  for (const a of areas) {
    if (!a.room) continue;
    out[a.room] = { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 };
  }
  return out;
}
