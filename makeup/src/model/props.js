/*
 * props.js — the shop.
 *
 * A counter, a wall of backlit shelving, a ring light, a till, and about forty
 * bottles. All of it in metres, all of it generated, and all of it merged down
 * to a handful of meshes by material — the shop is background and does not
 * deserve a draw call per lipstick.
 *
 * The silhouettes are the point. Cosmetics packaging is almost entirely
 * profile: a pump bottle, a dropper, a squat jar, a lipstick bullet and a
 * mascara tube are the same cylinder with different shoulders, and a lathe of
 * eight points is enough to tell them apart across a room.
 */

import {
  MeshBuilder, box, lathe, cylinder, sphere, plane, roundedSlab, torus,
} from './mesh.js';
import { compose, mat4 } from '../core/math.js';

/* Where everything is. Exported because the camera, the customer and the
 * pointer picking all need to agree with the geometry. */
export const SHOP = {
  counterTopY: 1.02,
  counterFrontZ: 0.21,
  counterBackZ: -0.51,
  counterHalfX: 1.45,
  customerZ: -0.95,
  customerHeadY: 1.475,
  /* One head unit in metres: a head is about 23cm from crown to chin. */
  headScale: 0.115,
};

/* ------------------------------------------------------------------ *
 * Packaging
 * ------------------------------------------------------------------ */

const PACKAGES = {
  pump: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.92, 0], [r, h * 0.05], [r, h * 0.62], [r * 0.86, h * 0.72],
      [r * 0.30, h * 0.80], [r * 0.26, h * 0.92], [r * 0.34, h * 0.95],
      [r * 0.30, h * 1.02], [0.001, h * 1.03],
    ], 20, x, y, z, { uvScale: 0.10 });
  },
  dropper: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.8, 0], [r, h * 0.08], [r, h * 0.66], [r * 0.55, h * 0.74],
      [r * 0.42, h * 0.76], [r * 0.42, h * 1.06], [0.001, h * 1.07],
    ], 18, x, y, z, { uvScale: 0.10 });
  },
  jar: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.86, 0], [r, h * 0.16], [r, h * 0.60], [r * 0.98, h * 0.66],
      [r * 1.02, h * 0.70], [r * 1.02, h * 1.0], [r * 0.9, h * 1.04],
      [0.001, h * 1.05],
    ], 20, x, y, z, { uvScale: 0.10 });
  },
  bullet: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.9, 0], [r, h * 0.04], [r, h * 0.46], [r * 1.04, h * 0.48],
      [r * 1.04, h * 0.98], [r * 0.92, h * 1.02], [0.001, h * 1.03],
    ], 18, x, y, z, { uvScale: 0.08 });
  },
  mascara: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.7, 0], [r * 0.78, h * 0.06], [r * 0.78, h * 0.55],
      [r, h * 0.60], [r, h * 1.0], [r * 0.8, h * 1.04], [0.001, h * 1.05],
    ], 16, x, y, z, { uvScale: 0.08 });
  },
  compact: (b, x, y, z, h, r) => {
    lathe(b, [
      [r * 0.94, 0], [r, h * 0.10], [r, h * 0.78], [r * 0.94, h * 0.90],
      [0.001, h * 0.92],
    ], 24, x, y, z, { uvScale: 0.10 });
  },
};

export const PACKAGE_NAMES = Object.keys(PACKAGES);

/*
 * One product, standing up, in whatever packaging its category uses. Returned
 * as its own builder so the caller can merge it into a colour group.
 */
export function buildPackage(kind, height, radius) {
  const b = new MeshBuilder();
  (PACKAGES[kind] || PACKAGES.pump)(b, 0, 0, 0, height, radius);
  b.computeNormals();
  return b;
}

/* ------------------------------------------------------------------ *
 * The set
 * ------------------------------------------------------------------ */

/*
 * `rng` seeds the dressing — which bottle stands where on the shelves, how the
 * brushes lean in the cup. The room itself is fixed: a shop that rearranges
 * itself between shifts would be disorienting, and the seed is per save.
 */
export function buildShop(rng) {
  const groups = [];
  const add = (name, mat, fn) => {
    const b = new MeshBuilder();
    fn(b);
    b.computeNormals();
    groups.push({ name, mat, mesh: b.build() });
  };

  /* ---- room ---- */
  add('floor', 'floor', (b) => {
    box(b, 0, -0.02, -0.8, 3.4, 0.02, 3.0, 0.6, 1);
  });

  add('walls', 'wall', (b) => {
    /* Back, sides and ceiling as thin slabs facing in. The room is never seen
     * from outside, so single-sided boxes with the camera inside would be
     * invisible — these are boxes with real thickness instead of flipped
     * planes, which also means the corners meet. */
    box(b, 0, 1.55, -3.32, 3.4, 1.75, 0.06, 1.2, 1);
    box(b, -3.34, 1.55, -0.8, 0.06, 1.75, 3.0, 1.2, 0.9);
    box(b, 3.34, 1.55, -0.8, 0.06, 1.75, 3.0, 1.2, 0.9);
    box(b, 0, 3.32, -0.8, 3.4, 0.06, 3.0, 1.2, 0.75);
  });

  /* ---- counter ---- */
  add('counterTop', 'marble', (b) => {
    roundedSlab(b, 0, SHOP.counterTopY - 0.03, -0.15,
      SHOP.counterHalfX, 0.032, 0.36, 0.022, 0.9, 1);
  });

  add('counterBody', 'lacquer', (b) => {
    box(b, 0, 0.49, -0.17, SHOP.counterHalfX - 0.05, 0.49, 0.30, 0.7, 0.85);
    /* Kick recess, so the counter has a shadow line at the floor rather than
     * meeting it flush like a cardboard box. */
    box(b, 0, 0.05, -0.20, SHOP.counterHalfX - 0.12, 0.05, 0.26, 0.7, 0.4);
  });

  add('counterGlow', 'emissive', (b) => {
    box(b, 0, 0.985, 0.205, SHOP.counterHalfX - 0.06, 0.006, 0.004, 1, 1);
  });

  /* ---- shelving ---- */
  add('shelves', 'lacquer', (b) => {
    for (const y of [0.72, 1.16, 1.60, 2.04]) {
      box(b, 0, y, -2.86, 2.15, 0.018, 0.17, 0.6, 0.9);
    }
    box(b, -2.20, 1.40, -2.86, 0.05, 1.40, 0.18, 0.6, 0.8);
    box(b, 2.20, 1.40, -2.86, 0.05, 1.40, 0.18, 0.6, 0.8);
    box(b, 0, 2.44, -2.86, 2.25, 0.05, 0.20, 0.6, 0.8);
  });

  add('shelfGlow', 'emissive', (b) => {
    /* The light behind the bottles. This one panel is most of the reason the
     * back of the shop reads as a shop and not a wall. */
    box(b, 0, 1.40, -3.02, 2.16, 1.36, 0.01, 1, 1);
  });

  /* ---- ring light ---- */
  add('ringLight', 'emissive', (b) => {
    const ring = new MeshBuilder();
    torus(ring, 0, 0, 0, 0.30, 0.030, 44, 10, 1);
    const m = mat4();
    compose(m, 0, 1.86, 0.34, Math.PI / 2, 0, 0, 1, 1, 1);
    b.append(ring, m);
  });

  add('rigging', 'metal', (b) => {
    cylinder(b, 0, 1.86, 0.34, 0.012, 1.0, 12, { uvScale: 0.1 });
    /* The ring light hangs from the ceiling; the stand would be in the way of
     * the counter. */
    box(b, 0, 2.88, 0.34, 0.06, 0.03, 0.06, 0.2, 0.7);
    for (const x of [-1.6, 1.6]) {
      cylinder(b, x, 2.30, -1.2, 0.008, 1.0, 10, { uvScale: 0.1 });
    }
  });

  add('pendants', 'emissive', (b) => {
    for (const x of [-1.6, 1.6]) {
      sphere(b, x, 2.26, -1.2, 0.075, [18, 14], { ao: 1 });
    }
  });

  /* ---- till ---- */
  add('till', 'metal', (b) => {
    roundedSlab(b, 1.03, 1.06, -0.20, 0.17, 0.028, 0.13, 0.012, 0.3, 0.9);
    const screen = new MeshBuilder();
    box(screen, 0, 0, 0, 0.155, 0.105, 0.008, 0.3, 0.95);
    const m = mat4();
    compose(m, 1.03, 1.19, -0.24, -0.38, 0, 0, 1, 1, 1);
    b.append(screen, m);
    /* Card reader, angled towards the customer's side of the counter. */
    const reader = new MeshBuilder();
    box(reader, 0, 0, 0, 0.045, 0.075, 0.012, 0.2, 0.9);
    const m2 = mat4();
    compose(m2, 0.72, 1.10, -0.30, -0.5, 0.25, 0, 1, 1, 1);
    b.append(reader, m2);
  });

  add('tillScreen', 'screen', (b) => {
    const p = new MeshBuilder();
    plane(p, 0, 0, 0, 0.148, 0.098, {});
    const m = mat4();
    compose(m, 1.03, 1.19, -0.232, -0.38, 0, 0, 1, 1, 1);
    b.append(p, m);
  });

  add('sign', 'sign', (b) => {
    const p = new MeshBuilder();
    plane(p, 0, 0, 0, 0.85, 0.19, {});
    const m = mat4();
    compose(m, 0, 2.68, -2.92, 0, 0, 0, 1, 1, 1);
    b.append(p, m);
  });

  /* ---- counter dressing ---- */
  add('tools', 'metal', (b) => {
    /* Brush cup and the brushes in it. The handles lean on a fixed spread
     * rather than a random one so the silhouette is always legible. */
    lathe(b, [[0.052, 0], [0.050, 0.02], [0.048, 0.115], [0.052, 0.12]],
      20, -1.06, SHOP.counterTopY, -0.04, { uvScale: 0.1, closeTop: false });
    const leans = [[-0.10, 0.06], [0.02, -0.05], [0.11, 0.04], [-0.02, 0.12], [0.06, 0.10]];
    for (let i = 0; i < leans.length; i++) {
      const brush = new MeshBuilder();
      lathe(brush, [
        [0.004, 0], [0.006, 0.10], [0.007, 0.16], [0.009, 0.17],
        [0.013, 0.185], [0.014, 0.225], [0.006, 0.255], [0.001, 0.26],
      ], 10, 0, 0, 0, { uvScale: 0.05 });
      const m = mat4();
      compose(m, -1.06 + leans[i][0] * 0.35, SHOP.counterTopY + 0.02,
        -0.04 + leans[i][1] * 0.35, leans[i][1] * 1.6, 0, -leans[i][0] * 1.6, 1, 1, 1);
      b.append(brush, m);
    }
  });

  add('palette', 'lacquer', (b) => {
    roundedSlab(b, -0.62, SHOP.counterTopY + 0.011, 0.02, 0.13, 0.011, 0.085, 0.01, 0.25, 0.95);
    /* Pans of colour in the open palette are drawn by the texture; the
     * geometry is the case. */
  });

  /* ---- the wall of product ---- */
  /*
   * Bottles are merged into a small number of colour groups. Forty separate
   * draws for background dressing would cost more than the entire customer.
   */
  const TINTS = [
    'productA', 'productB', 'productC', 'productD', 'productE', 'productF',
  ];
  const buckets = TINTS.map(() => new MeshBuilder());
  const shelfY = [0.738, 1.178, 1.618, 2.058];
  for (let row = 0; row < shelfY.length; row++) {
    let x = -2.02;
    while (x < 2.02) {
      const kind = rng.pick(PACKAGE_NAMES);
      const h = rng.range(0.10, 0.20) * (kind === 'compact' ? 0.35 : 1);
      const r = rng.range(0.022, 0.036) * (kind === 'compact' ? 1.7 : 1);
      const pkg = buildPackage(kind, h, r);
      const m = mat4();
      compose(m, x + rng.range(-0.008, 0.008), shelfY[row], -2.86 + rng.range(-0.03, 0.03),
        0, rng.range(0, 6.28), 0, 1, 1, 1);
      buckets[rng.int(0, TINTS.length - 1)].append(pkg, m);
      x += r * 2 + rng.range(0.035, 0.085);
    }
  }
  for (let i = 0; i < TINTS.length; i++) {
    groups.push({ name: TINTS[i], mat: TINTS[i], mesh: buckets[i].build() });
  }

  return groups;
}

/*
 * The tray of products the player has actually taken out, standing on the
 * counter between them and the customer. Rebuilt when the loadout changes,
 * which is a handful of times a shift.
 *
 * These are placed left to right in the same order as the on-screen tray, so
 * "the third one along" means the same thing in both places.
 */
export function buildTray(products) {
  const groups = [];
  const n = Math.max(1, products.length);
  const span = Math.min(0.95, n * 0.105);
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const b = new MeshBuilder();
    const h = p.pack === 'compact' ? 0.045 : p.pack === 'bullet' ? 0.075 : 0.10;
    const r = p.pack === 'compact' ? 0.048 : p.pack === 'bullet' ? 0.013 : 0.022;
    const pkg = buildPackage(p.pack, h, r);
    const x = -0.15 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span);
    const m = mat4();
    compose(m, x, SHOP.counterTopY + 0.002, 0.06, 0, i * 0.7, 0, 1, 1, 1);
    b.append(pkg, m);
    b.computeNormals();
    groups.push({ mesh: b.build(), product: p, x });
  }
  return groups;
}
