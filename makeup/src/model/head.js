/*
 * head.js — the customer's head, built from face space.
 *
 * The shape is a pile of displacements applied to an ellipsoid: a socket here,
 * a bridge there, two lobes for the lips. None of it is sculpted by hand and
 * none of it is loaded from a file, which means a customer's face is a dozen
 * numbers and two customers are never the same person.
 *
 * `evalSurface` is the single definition of that shape. The mesh calls it for
 * every vertex; the eyeballs, the lids and the lashes call it to find where to
 * sit; the morph targets call it twice and subtract. Nothing recomputes the
 * face a second way, because the moment two definitions exist, an eyeball ends
 * up floating a millimetre outside a socket and it takes an afternoon to find
 * out why.
 *
 * Units are head half-heights: 1.0 is the distance from the middle of the head
 * to the crown, about 115mm. The model matrix scales that into the metres the
 * rest of the shop is built in.
 */

import { MeshBuilder } from './mesh.js';
import { faceU, faceV, F, ellipse, pair, lipMask } from './face.js';
import { clamp, smoothstep } from '../core/math.js';

const TAU = Math.PI * 2;

/* Base proportions, before a customer's own numbers scale them. */
const BASE_W = 0.74;
const BASE_D = 0.86;

/*
 * The same three numbers as the semi-axes of the ellipsoid everything is
 * displaced from, for the one caller that has to run the parameterisation
 * *backwards*: an imported head arrives as a bag of triangles with no idea what
 * face space is, and turning a position back into an (s, t) means dividing out
 * exactly these. A second copy of them in the importer would be a second
 * definition of what shape a head is.
 */
export const HEAD_AXES = { w: BASE_W, h: 1, d: BASE_D };

function gauss(x, c, r) {
  const d = (x - c) / r;
  return Math.exp(-d * d);
}
function gauss2(s, cs, rs, t, ct, rt) {
  return gauss(s, cs, rs) * gauss(t, ct, rt);
}
function band(t, a, b, soft = 0.05) {
  return smoothstep(a - soft, a + soft, t) * (1 - smoothstep(b - soft, b + soft, t));
}

/*
 * A face, as numbers. Every one of them is a multiplier on a displacement, so
 * 1.0 is the average face and the generator only has to decide how far from
 * average to go.
 */
export function faceParams(rng) {
  const g = (sd, lo, hi) => clamp(rng.gauss(1, sd), lo, hi);
  return {
    width: g(0.06, 0.86, 1.14),
    length: g(0.05, 0.88, 1.12),
    depth: g(0.04, 0.90, 1.10),
    jaw: g(0.18, 0.55, 1.45),        /* how much the lower face tapers */
    chin: g(0.30, 0.35, 1.75),
    cheek: g(0.30, 0.30, 1.80),
    brow: g(0.28, 0.40, 1.70),
    nose: g(0.22, 0.55, 1.55),
    noseBridge: g(0.25, 0.45, 1.60),
    lip: g(0.30, 0.45, 1.85),
    eyeSize: g(0.09, 0.82, 1.20),
    eyeDeep: g(0.22, 0.55, 1.50),
  };
}

export const NEUTRAL_EXPR = { smile: 0, concern: 0, squint: 0 };

/*
 * The shape function. `E` carries the expression, which is applied here rather
 * than in a separate pass so a smile bends the same surface everything else is
 * defined against.
 */
export function evalSurface(P, s, t, E = NEUTRAL_EXPR, out = [0, 0, 0]) {
  const u = faceU(s), v = faceV(t);
  const phi = (u - 0.5) * TAU;
  const lam = v * Math.PI;
  const sl = Math.sin(lam), cl = Math.cos(lam);

  const W = BASE_W * P.width, H = P.length, D = BASE_D * P.depth;
  let x = sl * Math.sin(phi) * W;
  let y = cl * H;
  let z = sl * Math.cos(phi) * D;

  /* The lower face narrows into a jaw. Without this the head is an egg and
   * every customer looks like the same egg. */
  const jaw = smoothstep(0.48, 0.94, t);
  x *= 1 - jaw * 0.42 * P.jaw;
  z *= 1 - jaw * 0.14;
  /* The crown is narrower than the widest part of the skull, which is at ear
   * height — the difference is small and its absence is very visible. */
  x *= 1 - smoothstep(0.20, 0.0, t) * 0.12;

  /* Ellipsoid normal, good enough to displace along: the displacements are
   * small compared with the radius, so using the undeformed normal costs
   * nothing and avoids a second evaluation to get the deformed one. */
  let nx = x / (W * W), ny = y / (P.length * P.length), nz = z / (D * D);
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  /* How much of the front of the face we are on. Frontal features — the nose,
   * the lips — push along +Z; past the corner of the eye that would drag the
   * side of the head forward, so it fades out. */
  const fr = Math.max(0, Math.cos(phi)) ** 0.6;

  /* ---- displacement along the surface normal ---- */
  const socket = 0.052 * P.eyeDeep * pair(s, t, F.eyeS, F.eyeT - 0.008, 0.125, 0.066, 0.85);
  const temple = 0.020 * pair(s, t, 0.335, 0.285, 0.080, 0.080, 0.9);
  const cheek = 0.028 * P.cheek * pair(s, t, F.cheekS + 0.012, 0.520, 0.130, 0.072, 0.85);
  const foreheadFlat = 0.013 * ellipse(s, t, 0.5, 0.235, 0.30, 0.080, 0.9);
  const hollow = 0.015 * pair(s, t, 0.258, 0.618, 0.090, 0.055, 0.9);
  let dN = cheek - socket - temple - foreheadFlat - hollow;

  /* ---- displacement along +Z ---- */
  const browRidge = 0.034 * P.brow * pair(s, t, 0.135, F.browT + 0.014, 0.140, 0.032, 0.9);

  const noseRidge = 0.056 * P.noseBridge * gauss(s, 0.5, 0.090) * band(t, 0.320, 0.500, 0.060);
  const noseTip = 0.104 * P.nose * gauss2(s, 0.5, 0.085, t, F.noseTipT, 0.028);
  const noseWing = 0.048 * P.nose * pair(s, t, F.noseHalfS, F.noseBaseT - 0.006, 0.070, 0.021, 0.8);
  const noseUnder = -0.020 * ellipse(s, t, 0.5, F.noseBaseT + 0.016, 0.115, 0.016, 0.9);

  const philtrum = -0.006 * gauss2(s, 0.5, 0.055, t, 0.552, 0.020);

  const lm = lipMask(s, t);
  const lipX = clamp((s - 0.5) / F.lipHalfS, -1, 1);
  const lipCore = Math.pow(Math.max(0, 1 - lipX * lipX), 0.42);
  const lips = 0.044 * P.lip * Math.pow(lm, 0.65)
    - 0.019 * gauss(t, F.mouthT, 0.0075) * lipCore;

  const sulcus = -0.013 * ellipse(s, t, 0.5, 0.655, 0.078, 0.022, 0.9);
  const chin = 0.036 * P.chin * ellipse(s, t, 0.5, F.chinT, 0.088, 0.052, 0.85);

  let dZ = browRidge + noseRidge + noseTip + noseWing + noseUnder
    + philtrum + lips + sulcus + chin;

  /* ---- expression ---- */
  let dY = 0, dX = 0;
  if (E.smile) {
    /* A smile is mostly two corners going up and out, and the cheek mass that
     * rides up with them. The lips themselves barely move. */
    const corners = pair(s, t, F.lipHalfS * 0.90, F.mouthT + 0.004, 0.075, 0.048, 0.85);
    dY += E.smile * 0.024 * corners;
    dX += E.smile * 0.016 * corners * Math.sign(s - 0.5);
    dN += E.smile * 0.014 * pair(s, t, F.cheekS, 0.540, 0.120, 0.065, 0.85);
    dZ -= E.smile * 0.010 * lm;
    /* and the lower lid rises, which is the difference between a smile and a
     * mouth that happens to be curved */
    dY += E.smile * 0.008 * pair(s, t, F.eyeS, F.lidBotT + 0.006, 0.070, 0.016, 0.8);
  }
  if (E.concern) {
    const inner = pair(s, t, 0.075, F.browT - 0.004, 0.070, 0.028, 0.85);
    dY += E.concern * 0.014 * inner;
    dZ += E.concern * 0.010 * inner;
    const corners = pair(s, t, F.lipHalfS * 0.88, F.mouthT + 0.006, 0.070, 0.042, 0.85);
    dY -= E.concern * 0.018 * corners;
    dZ -= E.concern * 0.008 * lm;
  }
  if (E.squint) {
    dY += E.squint * 0.012 * pair(s, t, F.eyeS, F.lidBotT + 0.010, 0.075, 0.022, 0.8);
    dY -= E.squint * 0.008 * pair(s, t, F.eyeS, F.creaseT + 0.010, 0.075, 0.026, 0.8);
  }

  out[0] = x + nx * dN + dX;
  out[1] = y + ny * dN + dY;
  out[2] = z + nz * dN + dZ * fr;
  return out;
}

/*
 * Position and outward normal at an (s, t), by finite difference. Used to hang
 * the eyeballs, lids and lashes off the same surface the mesh is made of.
 */
export function surfaceFrame(P, s, t, E = NEUTRAL_EXPR) {
  const h = 0.0025;
  const p = evalSurface(P, s, t, E, []);
  const ps = evalSurface(P, s + h, t, E, []);
  const pt = evalSurface(P, s, t + h, E, []);
  const ax = ps[0] - p[0], ay = ps[1] - p[1], az = ps[2] - p[2];
  const bx = pt[0] - p[0], by = pt[1] - p[1], bz = pt[2] - p[2];
  /* (ds x dt) points inwards with this parameterisation, so negate. */
  let nx = -(ay * bz - az * by);
  let ny = -(az * bx - ax * bz);
  let nz = -(ax * by - ay * bx);
  const l = Math.hypot(nx, ny, nz) || 1;
  return { p, n: [nx / l, ny / l, nz / l] };
}

/* Baked ambient occlusion. The eye socket, the crease beside the nose and the
 * underside of the jaw are dark on every real face and free here — the fields
 * that carve them are already computed. */
export function headAO(P, s, t) {
  const socket = pair(s, t, F.eyeS, F.eyeT - 0.006, 0.110, 0.060, 0.85);
  const nostril = pair(s, t, F.nostrilS, F.noseBaseT + 0.004, 0.055, 0.026, 0.85);
  const mouthLine = gauss(t, F.mouthT, 0.010) * Math.pow(Math.max(0, 1 - ((s - 0.5) / F.lipHalfS) ** 2), 0.4);
  const underJaw = smoothstep(0.80, 0.98, t);
  const underBrow = pair(s, t, F.eyeS, F.creaseT - 0.004, 0.110, 0.030, 0.9);
  const sideNose = pair(s, t, 0.105, 0.470, 0.055, 0.070, 0.9);
  return clamp(1
    - 0.42 * socket - 0.30 * underBrow - 0.30 * nostril
    - 0.35 * mouthLine - 0.55 * underJaw - 0.16 * sideNose, 0.22, 1);
}

/* The mesh is uniform in texture space, so this is also where the triangles
 * end up: about a third of them land between the brow and the chin. */
export const HEAD_GRID = { s: 160, t: 208 };

/*
 * The head mesh, plus two morph targets.
 *
 * The grid is uniform in texture space, so the triangles land where the detail
 * is: about a third of them are between the brow and the chin, and the back of
 * the skull — which nobody paints and the hair covers — gets the rest.
 */
export function buildHead(P) {
  const b = new MeshBuilder();
  const { s: NS, t: NT } = HEAD_GRID;
  const rows = [];
  const p = [0, 0, 0];

  for (let j = 0; j <= NT; j++) {
    const t = j / NT;
    const row = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      evalSurface(P, s, t, NEUTRAL_EXPR, p);
      /* Normals are computed from the triangles afterwards: the shape is a sum
       * of a dozen fields and differentiating it analytically would be a
       * second definition to keep in step with the first. */
      row.push(b.vert(p[0], p[1], p[2], 0, 1, 0, s, t, headAO(P, s, t)));
    }
    rows.push(row);
  }

  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NS; i++) {
      /* The poles collapse to a point; emitting the degenerate triangles there
       * would give computeNormals zero-area faces to average in. */
      const a = rows[j][i], bb = rows[j][i + 1];
      const c = rows[j + 1][i + 1], d = rows[j + 1][i];
      if (j === 0) b.tri(a, d, c);
      else if (j === NT - 1) b.tri(a, d, bb);
      else b.quad(a, d, c, bb);
    }
  }

  b.computeNormals();
  b.weldNormals();
  const mesh = b.build();

  /* Morph targets, as deltas from the neutral position. Storing deltas rather
   * than absolute positions means the vertex shader adds instead of mixing,
   * and two expressions can be half-on at once without fighting. */
  const morph = new Float32Array(mesh.positions.length * 4);
  const targets = [{ ...NEUTRAL_EXPR, smile: 1 }, { ...NEUTRAL_EXPR, concern: 1 }];
  for (let k = 0; k < 2; k++) {
    const nb = new MeshBuilder();
    for (let j = 0; j <= NT; j++) {
      for (let i = 0; i <= NS; i++) {
        evalSurface(P, i / NS, j / NT, targets[k], p);
        nb.vert(p[0], p[1], p[2], 0, 1, 0, 0, 0, 1);
      }
    }
    nb.idx = mesh.indices;
    nb.computeNormals();
    for (let vi = 0; vi < mesh.positions.length / 3; vi++) {
      const o = vi * 12 + k * 6;
      morph[o] = nb.pos[vi * 3] - mesh.positions[vi * 3];
      morph[o + 1] = nb.pos[vi * 3 + 1] - mesh.positions[vi * 3 + 1];
      morph[o + 2] = nb.pos[vi * 3 + 2] - mesh.positions[vi * 3 + 2];
      morph[o + 3] = nb.nrm[vi * 3] - mesh.vertices[vi * 9 + 3];
      morph[o + 4] = nb.nrm[vi * 3 + 1] - mesh.vertices[vi * 9 + 4];
      morph[o + 5] = nb.nrm[vi * 3 + 2] - mesh.vertices[vi * 9 + 5];
    }
  }

  return { mesh, morph };
}

/* ------------------------------------------------------------------ *
 * Eyes
 * ------------------------------------------------------------------ */

/*
 * Where an eyeball goes. It is pushed back along the surface normal from the
 * middle of the socket so that the visible sliver of sclera sits flush with the
 * lid edge — the depth is a fraction of the radius rather than a constant,
 * because a customer with a bigger eye needs a deeper socket to hold it.
 */
export function eyeAnchor(P, side) {
  const s = 0.5 + side * F.eyeS;
  const { p, n } = surfaceFrame(P, s, F.eyeT);
  /*
   * A human eyeball is about 24mm across, which is 0.10 here — but almost all
   * of it is behind the lids, and modelling it at full size on the front of the
   * head puts two spheres on a face.
   *
   * The inset is what decides how much of it shows, and it has to be read
   * against the socket's own depth: sink the eye further back than the socket
   * is deep and it disappears into a dark hole, which is what the first version
   * did — two empty sockets on an otherwise finished face.
   */
  const r = 0.092 * P.eyeSize;
  const inset = r * 0.02;
  return {
    r,
    s,
    centre: [p[0] - n[0] * inset, p[1] - n[1] * inset, p[2] - n[2] * inset],
    normal: n,
  };
}

export function buildEyeball(r) {
  const b = new MeshBuilder();
  /* The iris is a texture, not geometry, but the cornea in front of it is a
   * real bulge — it is what makes the highlight sit proud of the eye instead
   * of painted flat on it, and it is 12 lines. */
  const NS = 32, NT = 24;
  const rows = [];
  for (let j = 0; j <= NT; j++) {
    const lat = (j / NT) * Math.PI;
    const row = [];
    for (let i = 0; i <= NS; i++) {
      const lon = (i / NS) * TAU;
      const nx = Math.sin(lat) * Math.sin(lon);
      const ny = Math.cos(lat);
      const nz = Math.sin(lat) * Math.cos(lon);
      /* Cornea: a small raised cap centred on +Z, which is where the eye looks. */
      const bulge = 1 + 0.055 * smoothstep(0.80, 1.0, nz);
      /*
       * Planar UVs, not the sphere's own. The iris is a disc in the middle of
       * its texture, and a longitude/latitude unwrap would smear it round the
       * equator and leave the front of the eye sampling the sclera. Projecting
       * straight down +Z puts the disc exactly where the eye looks; the back
       * half folds onto the same texels and is never seen.
       */
      row.push(b.vert(nx * r * bulge, ny * r * bulge, nz * r * bulge,
        nx, ny, nz, 0.5 + nx * 0.5, 0.5 - ny * 0.5, 1));
    }
    rows.push(row);
  }
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NS; i++) {
      b.quad(rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]);
    }
  }
  b.computeNormals();
  return b.build();
}

/*
 * The lid.
 *
 * A cap of a sphere a little larger than the eyeball, hinged on the eye's own
 * left-right axis. Closed, it covers the opening; open, it rotates up and tucks
 * under the brow.
 *
 * Its UVs are not its own. They are mapped into the head's texture space over
 * the lid zone, so a stroke of eyeshadow lands in the same texture whether it
 * hits the lid or the skin around it, and the colour on a closed lid is the
 * colour on the crease when it opens. One paint texture for the whole face is
 * worth the small oddity of a mesh borrowing another mesh's coordinates.
 */
/*
 * The lids, as angles.
 *
 * `theta` is how far a lid cap reaches from its own axis; `open` is how far it
 * is swung back when the eye is open. The difference between them is what is
 * left uncovered, and it is the whole difference between an eye and a slit:
 * swing the upper lid back by less than its own reach and the rim ends up below
 * the eye's forward axis, which puts it across the pupil. Both lids did exactly
 * that in the first version and every customer looked half asleep.
 */
export const LID = {
  upperTheta: 1.16,
  lowerTheta: 0.92,
  upperOpen: 1.36,
  lowerOpen: 1.34,
};

export function buildLid(r, side, lower = false) {
  const b = new MeshBuilder();
  const R = r * 1.045;
  const RINGS = 10, SEG = 28;
  /* The upper lid has to reach past the middle of the eye when it closes; the
   * lower one only ever covers the bottom sliver. */
  const maxTheta = lower ? LID.lowerTheta : LID.upperTheta;
  const rows = [];
  const cs = 0.5 + side * F.eyeS;
  const lidCentreT = lower
    ? F.underEyeT - 0.008
    : (F.creaseT + F.lidBotT) / 2 + 0.004;
  const lidSpanT = lower ? 0.030 : 0.044;

  for (let j = 0; j <= RINGS; j++) {
    const theta = (j / RINGS) * maxTheta;
    const st = Math.sin(theta), ct = Math.cos(theta);
    const row = [];
    for (let i = 0; i <= SEG; i++) {
      const psi = (i / SEG) * TAU;
      const px = st * Math.cos(psi);
      const py = st * Math.sin(psi);
      /* Slight flattening towards the outer corner keeps the lid from reading
       * as a contact lens sitting on the face. */
      const flat = 1 - 0.10 * Math.max(0, px * side);
      const nx = px * flat, ny = py, nz = ct;
      const nl = Math.hypot(nx, ny, nz);
      row.push(b.vert(nx * R, ny * R, nz * R, nx / nl, ny / nl, nz / nl,
        cs + px * 0.052 * (side > 0 ? 1 : -1),
        lidCentreT - py * lidSpanT,
        1 - 0.25 * (1 - j / RINGS)));
    }
    rows.push(row);
  }
  for (let j = 0; j < RINGS; j++) {
    for (let i = 0; i < SEG; i++) {
      b.quad(rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]);
    }
  }
  b.computeNormals();
  return b.build();
}

/*
 * Lashes: a fan of tapered fins along the lower rim of the lid, swept forward
 * and up. They are geometry rather than a texture because mascara is a product
 * the player buys, and "the lashes got longer" has to be visible from the
 * distance the game is played at.
 *
 * Built at full length and scaled down by a uniform, so applying mascara does
 * not rebuild a mesh mid-stroke.
 */
export function buildLashes(r, side) {
  const b = new MeshBuilder();
  const R = r * 1.05;
  const theta = 1.16;
  const N = 26;
  /* Only the lower arc of the cap carries lashes — the top of the lid is under
   * the brow. Azimuth from -160 to -20 degrees, measured with +Y up. */
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const psi = (-2.79 + f * 2.44);
    const st = Math.sin(theta), ct = Math.cos(theta);
    const bx = st * Math.cos(psi) * R;
    const by = st * Math.sin(psi) * R;
    const bz = ct * R;

    /* Direction the lash grows: away from the eye centre, curled up and out. */
    const l = Math.hypot(bx, by, bz);
    const outx = bx / l, outy = by / l, outz = bz / l;
    const len = r * (0.34 + 0.20 * Math.sin(f * Math.PI));
    const tipx = bx + outx * len * 0.35 + Math.sign(bx || 1) * len * 0.10;
    const tipy = by + outy * len * 0.30 + len * 0.62;
    const tipz = bz + outz * len * 0.55 + len * 0.30;

    const w = r * 0.030 * (0.6 + 0.4 * Math.sin(f * Math.PI));
    const a = b.vert(bx - w, by, bz, 0, 0, 1, f, 1, 1);
    const c = b.vert(bx + w, by, bz, 0, 0, 1, f, 1, 1);
    const d = b.vert(tipx, tipy, tipz, 0, 0, 1, f, 0, 1);
    b.tri(a, c, d);
    /* Doubled the other way round so a lash is visible from behind when the
     * head turns; two triangles is cheaper than disabling face culling for the
     * whole draw. */
    b.tri(a, d, c);
  }
  void side;
  b.computeNormals();
  return b.build();
}

/*
 * Brow hairs are painted into the skin texture rather than modelled — a brow is
 * read as a shape and a density, never as individual hairs at this distance,
 * and the pencil product needs to darken and extend it, which a texture does
 * and a mesh does not.
 *
 * This is here as a note rather than a function because it is the kind of
 * decision that gets re-litigated by whoever adds the next feature.
 */
