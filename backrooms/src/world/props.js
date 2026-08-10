/*
 * props.js — the objects that make a generated space read as a place.
 *
 * A corridor with nothing in it is a corridor with nothing in it. A corridor
 * with a stack of crates against one wall and a pipe run overhead is a
 * *service* corridor, and the player never has to be told. All of these are
 * boxes and cylinders — there is no modelling here — but they are boxes with
 * the right proportions, and proportion is what the eye actually reads.
 *
 * Props are baked into their chunk's mesh. They never move, so paying for a
 * draw call each would be pure waste; anything that does move (items you can
 * pick up, the things that follow you) lives in entities.js instead.
 */

import { addBox, addCylinder, addCross } from './meshbuilder.js';
import { MAT } from './grid.js';

const AO_PROP = () => 0.82;   /* props sit slightly darker than the world  */

export const PROPS = {

  crate(mb, p) {
    const s = 0.75 * (p.scale || 1);
    addBox(mb, p.wx, p.wy + s / 2, p.wz, s, s, s * 0.95, p.rot, p.mat ?? MAT.PROP,
      { ao: AO_PROP, bottom: false });
    if ((p.scale || 1) > 1.2) {
      const t = s * 0.7;
      addBox(mb, p.wx + 0.1, p.wy + s + t / 2, p.wz - 0.05, t, t, t, (p.rot || 0) + 0.4,
        p.mat ?? MAT.PROP, { ao: AO_PROP, bottom: false });
    }
  },

  barrel(mb, p) {
    const r = 0.29 * (p.scale || 1), h = 0.88 * (p.scale || 1);
    addCylinder(mb, p.wx, p.wy, p.wz, r, h, 12, p.mat ?? MAT.PROP, { ao: AO_PROP });
  },

  /* Lagged pipes bolted to a wall or slung under a ceiling. Three diameters
   * together look like plumbing; one on its own looks like a mistake. */
  piperun(mb, p) {
    const len = p.len || 5;
    const rot = p.rot || 0;
    const dx = Math.cos(rot), dz = Math.sin(rot);
    const mat = p.mat ?? MAT.PROP;
    const radii = [0.11, 0.07, 0.05];
    for (let i = 0; i < radii.length; i++) {
      const off = (i - 1) * 0.26;
      const ox = -dz * off, oz = dx * off;
      const seg = 10;
      /* A cylinder built along the run rather than the usual vertical one:
       * addCylinder is vertical, so this walks it as a chain of boxes, which
       * at these radii is indistinguishable and much cheaper. */
      addBox(mb, p.wx + ox + dx * len / 2, p.wy + (i === 2 ? 0.18 : 0), p.wz + oz + dz * len / 2,
        len, radii[i] * 2, radii[i] * 2, rot, mat, { ao: AO_PROP });
      void seg;
    }
    /* Brackets. */
    for (let s = 0; s <= len; s += 2.2) {
      addBox(mb, p.wx + dx * s, p.wy + 0.02, p.wz + dz * s, 0.06, 0.34, 0.7, rot, mat,
        { ao: AO_PROP });
    }
  },

  lamppost(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    addCylinder(mb, p.wx, p.wy, p.wz, 0.09, 4.6, 8, mat, { ao: AO_PROP });
    addBox(mb, p.wx + 0.35, p.wy + 4.55, p.wz, 0.9, 0.16, 0.3, 0, mat, { ao: AO_PROP });
    addBox(mb, p.wx + 0.75, p.wy + 4.42, p.wz, 0.44, 0.12, 0.26, 0, MAT.LIGHT,
      { ao: () => 1 });
  },

  rubble(mb, p) {
    const s = p.scale || 1;
    for (let i = 0; i < 4; i++) {
      const a = (p.rot || 0) + i * 1.9;
      const d = 0.18 + i * 0.11;
      addBox(mb, p.wx + Math.cos(a) * d, p.wy + 0.06 + (i % 2) * 0.07, p.wz + Math.sin(a) * d,
        0.34 * s, 0.16 * s, 0.28 * s, a * 1.7, p.mat ?? MAT.PROP, { ao: AO_PROP, bottom: false });
    }
  },

  /* Cut-out vegetation: wheat, reeds, scrub. One of these per few square
   * metres is a field. */
  billboard(mb, p) {
    const h = (p.height || 1.1) * (p.scale || 1);
    addCross(mb, p.wx, p.wy, p.wz, h * 0.85, h, p.rot || 0, p.mat ?? MAT.FOLIAGE);
  },

  tree(mb, p) {
    const s = p.scale || 1;
    addCylinder(mb, p.wx, p.wy, p.wz, 0.16 * s, 2.4 * s, 7, p.mat ?? MAT.PROP, { ao: AO_PROP });
    addCross(mb, p.wx, p.wy + 1.9 * s, p.wz, 3.2 * s, 3.0 * s, p.rot || 0,
      p.mat2 ?? MAT.FOLIAGE);
  },

  shelf(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    const w = 2.2, d = 0.75, h = 2.4;
    for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) {
      for (const sz of [-d / 2 + 0.05, d / 2 - 0.05]) {
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        addBox(mb, p.wx + sx * c - sz * s, p.wy + h / 2, p.wz + sx * s + sz * c,
          0.1, h, 0.1, p.rot || 0, mat, { ao: AO_PROP });
      }
    }
    for (let i = 0; i < 3; i++) {
      addBox(mb, p.wx, p.wy + 0.55 + i * 0.85, p.wz, w, 0.06, d, p.rot || 0, mat,
        { ao: AO_PROP });
    }
  },

  desk(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    addBox(mb, p.wx, p.wy + 0.72, p.wz, 1.5, 0.05, 0.75, p.rot || 0, mat, { ao: AO_PROP });
    const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
    for (const [ox, oz] of [[-0.68, -0.3], [0.68, -0.3], [-0.68, 0.3], [0.68, 0.3]]) {
      addBox(mb, p.wx + ox * c - oz * s, p.wy + 0.36, p.wz + ox * s + oz * c,
        0.06, 0.72, 0.06, p.rot || 0, mat, { ao: AO_PROP });
    }
  },

  chair(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    addBox(mb, p.wx, p.wy + 0.44, p.wz, 0.48, 0.06, 0.46, p.rot || 0, mat, { ao: AO_PROP });
    const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
    addBox(mb, p.wx + 0.22 * s * -1, p.wy + 0.72, p.wz + 0.22 * c,
      0.46, 0.5, 0.06, p.rot || 0, mat, { ao: AO_PROP });
    addCylinder(mb, p.wx, p.wy, p.wz, 0.05, 0.42, 6, mat, { ao: AO_PROP, cap: false });
  },

  car(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    const rot = p.rot || 0;
    addBox(mb, p.wx, p.wy + 0.62, p.wz, 4.3, 0.72, 1.76, rot, mat, { ao: AO_PROP });
    addBox(mb, p.wx - 0.15 * Math.cos(rot), p.wy + 1.24, p.wz - 0.15 * Math.sin(rot),
      2.1, 0.58, 1.6, rot, MAT.PROP2, { ao: AO_PROP });
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [ox, oz] of [[-1.4, -0.85], [1.4, -0.85], [-1.4, 0.85], [1.4, 0.85]]) {
      addCylinder(mb, p.wx + ox * c - oz * s, p.wy + 0.02, p.wz + ox * s + oz * c,
        0.31, 0.22, 8, MAT.PROP2, { ao: AO_PROP });
    }
  },

  /* A door standing in a frame. Never opens; that is rather the point. */
  door(mb, p) {
    const mat = p.mat ?? MAT.PROP;
    addBox(mb, p.wx, p.wy + 1.02, p.wz, 0.92, 2.04, 0.06, p.rot || 0, mat, { ao: AO_PROP });
    addBox(mb, p.wx + 0.33, p.wy + 1.02, p.wz + 0.06, 0.09, 0.03, 0.09, p.rot || 0,
      MAT.PROP2, { ao: () => 0.9 });
  },
};

export const PROP_NAMES = Object.keys(PROPS);
