/*
 * props.js — the furniture, and the three things in it that matter.
 *
 * Most of what is in here is set dressing: a sofa so the living room is a
 * living room, a counter run so the kitchen is a kitchen. It is built out of
 * boxes on purpose — in a house lit by one failing bulb per room, silhouette
 * and material do all the work and geometry does almost none, so the budget
 * goes on the normal maps rather than on bevels nobody will see.
 *
 * Three props are not dressing, and they are the reason this file returns
 * anchors as well as a mesh:
 *
 *   the telephone   in the entrance, the only one in the villa
 *   the drawer      in the bedroom, where the neighbour's number is
 *   the supplies    in the equipment room, where the timber and nails are
 *
 * Those three are the spec's hard constraints made physical. You cannot call
 * the neighbour from the kitchen because there is no telephone in the kitchen.
 */

import { addBox, addCylinder } from '../render/meshbuilder.js';
import { ROOM_BY_ID } from '../data/rooms.js';
import { roomRect } from './build.js';

/* Anything with a footprint the player should not walk through. Collected as
 * we build so the collision solver gets them for free. */
function solid(list, x, z, sx, sz) {
  list.push({ x0: x - sx / 2, z0: z - sz / 2, x1: x + sx / 2, z1: z + sz / 2 });
}

/* A slab on four legs — table, bench, console. */
function table(mb, m, x, y, z, w, d, top, leg) {
  addBox(mb, x, y, z, w, 0.06, d, 0, top);
  const lx = w / 2 - 0.08, lz = d / 2 - 0.08;
  for (const [ox, oz] of [[-lx, -lz], [lx, -lz], [lx, lz], [-lx, lz]]) {
    addBox(mb, x + ox, y / 2, z + oz, 0.07, y, 0.07, 0, leg, { bottom: false });
  }
}

export function buildProps(mb, mat) {
  const anchors = {};
  const blockers = [];
  const lights = [];
  const R = (id) => roomRect(ROOM_BY_ID[id]);

  /* ---------------------------------------------------------- living */
  {
    const r = R('living');
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;

    /* Sofa: seat, back, two arms. */
    addBox(mb, cx + 1.2, 0.30, cz + 1.1, 2.30, 0.42, 0.92, 0, mat.fabricSofa);
    addBox(mb, cx + 1.2, 0.62, cz + 1.52, 2.30, 0.68, 0.20, 0, mat.fabricSofa);
    addBox(mb, cx + 0.00, 0.48, cz + 1.1, 0.22, 0.60, 0.92, 0, mat.fabricSofa);
    addBox(mb, cx + 2.40, 0.48, cz + 1.1, 0.22, 0.60, 0.92, 0, mat.fabricSofa);
    solid(blockers, cx + 1.2, cz + 1.15, 2.6, 1.1);

    table(mb, mat, cx + 1.2, 0.42, cz - 0.35, 1.20, 0.62, mat.woodDark, mat.woodDark);
    solid(blockers, cx + 1.2, cz - 0.35, 1.2, 0.65);

    /* Sideboard against the inner wall, with a lamp on it that is a real
     * light — a second source in the room the player spends most time in. */
    addBox(mb, r.x0 + 1.5, 0.42, r.z1 - 0.42, 1.80, 0.84, 0.46, 0, mat.woodDark);
    solid(blockers, r.x0 + 1.5, r.z1 - 0.42, 1.9, 0.5);
    addCylinder(mb, r.x0 + 1.5, 0.94, r.z1 - 0.42, 0.09, 0.20, 10, mat.metalPale);
    addCylinder(mb, r.x0 + 1.5, 1.16, r.z1 - 0.42, 0.20, 0.24, 12, mat.lampShade);
    lights.push({
      x: r.x0 + 1.5, y: 1.12, z: r.z1 - 0.42,
      r: 1.0, g: 0.62, b: 0.30, intensity: 4.0, range: 4.0, group: 0, room: 'living',
    });
  }

  /* --------------------------------------------------------- kitchen */
  {
    const r = R('kitchen');
    const runZ = r.z1 - 0.34;
    addBox(mb, (r.x0 + r.x1) / 2, 0.44, runZ, (r.x1 - r.x0) - 1.0, 0.88, 0.62, 0, mat.woodPale);
    addBox(mb, (r.x0 + r.x1) / 2, 0.90, runZ, (r.x1 - r.x0) - 1.0, 0.05, 0.66, 0, mat.metalPale);
    solid(blockers, (r.x0 + r.x1) / 2, runZ, (r.x1 - r.x0) - 1.0, 0.7);

    addBox(mb, r.x0 + 1.1, 0.45, runZ, 0.62, 0.90, 0.62, 0, mat.metalDark);
    addBox(mb, r.x1 - 0.62, 0.90, r.z0 + 0.55, 0.72, 1.80, 0.70, 0, mat.metalPale);
    solid(blockers, r.x1 - 0.62, r.z0 + 0.55, 0.8, 0.8);

    table(mb, mat, (r.x0 + r.x1) / 2, 0.74, (r.z0 + r.z1) / 2 - 0.2, 1.30, 0.85, mat.woodPale, mat.woodPale);
    solid(blockers, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 - 0.2, 1.35, 0.9);
  }

  /* --------------------------------------------------------- bedroom */
  {
    const r = R('bedroom');
    const bx = (r.x0 + r.x1) / 2 + 0.3, bz = r.z1 - 1.35;
    addBox(mb, bx, 0.22, bz, 1.55, 0.34, 2.05, 0, mat.woodDark);
    addBox(mb, bx, 0.46, bz, 1.50, 0.20, 2.00, 0, mat.fabricBed);
    addBox(mb, bx, 0.62, bz - 0.86, 1.40, 0.14, 0.34, 0, mat.fabricBed);
    addBox(mb, bx, 0.62, r.z1 - 0.18, 1.55, 0.80, 0.10, 0, mat.woodDark);
    solid(blockers, bx, bz, 1.7, 2.2);

    addBox(mb, r.x1 - 0.42, 1.02, r.z0 + 1.0, 0.66, 2.04, 0.62, 0, mat.woodDark);
    solid(blockers, r.x1 - 0.42, r.z0 + 1.0, 0.75, 0.75);

    /*
     * The nightstand, and the drawer in it. The drawer front is a separate box
     * pulled slightly proud of the carcass so it reads as a drawer at a
     * glance and so there is something specific to look at when the game says
     * to search it.
     */
    const nx = bx - 1.16, nz = bz - 0.55;
    addBox(mb, nx, 0.28, nz, 0.50, 0.56, 0.44, 0, mat.woodDark);
    addBox(mb, nx, 0.34, nz - 0.235, 0.44, 0.20, 0.03, 0, mat.woodPale);
    addCylinder(mb, nx, 0.34, nz - 0.26, 0.022, 0.05, 8, mat.metalPale);
    solid(blockers, nx, nz, 0.6, 0.55);
    anchors.drawer = { x: nx, y: 0.42, z: nz - 0.26, nx: 0, nz: -1, label: 'המגירה' };
  }

  /* -------------------------------------------------------- entrance */
  {
    const r = R('entrance');
    const tx = r.x0 + 1.25, tz = r.z1 - 0.55;
    addBox(mb, tx, 0.40, tz, 1.10, 0.80, 0.42, 0, mat.woodDark);
    solid(blockers, tx, tz, 1.2, 0.5);

    /*
     * The telephone. The whole neighbour mechanic hangs off this object being
     * here and nowhere else, so it gets more geometry than its size deserves:
     * a body, a handset across the cradle, and a dial.
     */
    addBox(mb, tx, 0.86, tz, 0.26, 0.11, 0.22, 0, mat.metalDark);
    addBox(mb, tx, 0.945, tz - 0.02, 0.30, 0.07, 0.09, 0, mat.metalDark);
    addCylinder(mb, tx, 0.925, tz + 0.06, 0.055, 0.02, 12, mat.metalPale);
    anchors.phone = { x: tx, y: 0.92, z: tz, nx: 0, nz: -1, label: 'הטלפון' };

    /* Coat hooks by the front door, because an empty entrance reads as a
     * corridor and this one has to read as the way in. */
    for (let i = 0; i < 3; i++) {
      addCylinder(mb, r.x0 + 3.2 + i * 0.34, 1.62, r.z1 - 0.08, 0.02, 0.12, 6, mat.metalPale);
    }
  }

  /* ---------------------------------------------------------- supply */
  {
    const r = R('supply');
    const wx = (r.x0 + r.x1) / 2, wz = r.z1 - 0.45;
    addBox(mb, wx, 0.42, wz, 2.40, 0.84, 0.72, 0, mat.woodPale);
    addBox(mb, wx, 0.87, wz, 2.44, 0.06, 0.76, 0, mat.woodPale);
    solid(blockers, wx, wz, 2.5, 0.8);

    /*
     * The timber, stacked. This is the stockpile the whole afternoon is spent
     * carrying away, so it is worth showing as individual boards rather than
     * as one crate — a stack that visibly has boards in it is a stack the
     * player understands they are taking boards from.
     */
    for (let i = 0; i < 7; i++) {
      addBox(mb, r.x0 + 1.1, 0.07 + i * 0.075, wz - 0.1 + (i % 2) * 0.04,
        0.16, 0.06, 1.70, (i % 3) * 0.012, mat.timberPlank);
    }
    solid(blockers, r.x0 + 1.1, wz - 0.1, 0.4, 1.8);

    /* Nail box and tape rolls on the bench. */
    addBox(mb, wx - 0.7, 0.95, wz, 0.22, 0.12, 0.16, 0.2, mat.metalDark);
    for (let i = 0; i < 3; i++) {
      addCylinder(mb, wx + 0.25 + i * 0.16, 0.93, wz - 0.05, 0.055, 0.05, 12, mat.tapeStrip);
    }
    /* A hammer, because the rules keep mentioning it. */
    addBox(mb, wx + 0.85, 0.92, wz + 0.05, 0.28, 0.03, 0.03, 0.4, mat.woodPale);
    addBox(mb, wx + 0.98, 0.94, wz + 0.11, 0.05, 0.09, 0.10, 0.4, mat.metalDark);

    anchors.supplies = { x: wx, y: 0.95, z: wz - 0.5, nx: 0, nz: -1, label: 'הציוד' };

    /* Shelving on the far wall. */
    for (let s = 0; s < 3; s++) {
      addBox(mb, r.x1 - 0.28, 0.65 + s * 0.55, r.z0 + 1.4, 0.44, 0.04, 1.90, 0, mat.woodPale);
    }
  }

  return { anchors, blockers, lights };
}
