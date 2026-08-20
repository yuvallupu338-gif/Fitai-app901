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
import { faceU, faceV, F, ellipse, pair, lipMask, sampleS, acrossFace } from './face.js';
import { clamp, smoothstep } from '../core/math.js';

const TAU = Math.PI * 2;

/*
 * Base proportions, before a customer's own numbers scale them.
 *
 * A head is 220mm from crown to chin, 145mm across and 195mm front to back:
 * two thirds as wide as it is tall, and a good deal deeper than it is wide.
 * These were 0.74 and 0.86, which measured out at 168mm and 213mm on a 226mm
 * head — three quarters as wide as tall and almost as deep as tall. That is a
 * light bulb, and it is what every bare head in this game looked like.
 */
const BASE_W = 0.575;
const BASE_D = 0.655;

/*
 * The same three numbers as the semi-axes of the ellipsoid everything is
 * displaced from, for the one caller that has to run the parameterisation
 * *backwards*: an imported head arrives as a bag of triangles with no idea what
 * face space is, and turning a position back into an (s, t) means dividing out
 * exactly these. A second copy of them in the importer would be a second
 * definition of what shape a head is.
 */
export const HEAD_AXES = { w: BASE_W, h: 1, d: BASE_D };

/*
 * The eye, as three numbers that have to agree with each other.
 *
 * They did not, and it is the single thing that made every generated customer
 * look like a shop mannequin. The eyeball was placed with its *centre* on the
 * skin, so the ball and the lid shells around it stood five millimetres proud
 * of the face — two ping-pong balls resting on a head rather than two eyes set
 * into one. Nothing about the shading could rescue that, and no amount of
 * looking at the numbers found it either: it took hiding the hair and looking
 * at the bare skull.
 *
 * So the inset is derived rather than chosen — see `eyeAnchor`. Change the
 * socket's depth here and the eye follows it in.
 */
export const EYE = {
  radius: 0.092,       /* the eyeball, in head half-heights: about 21mm across */
  lidShell: 1.045,     /* the lid caps ride just outside it */
  socketDepth: 0.062,  /* how far the socket dish is sunk into the face */
  lidTilt: 0.45,       /* how much of the socket's outward tilt the lids keep */
};

function gauss(x, c, r) {
  const d = (x - c) / r;
  return Math.exp(-d * d);
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
  x *= 1 - jaw * 0.47 * P.jaw;
  z *= 1 - jaw * 0.14;
  /*
   * Under the jaw.
   *
   * The ellipsoid does not stop at the chin, it carries on to a pole 47mm below
   * it, and at the front of the face that is 47mm of nothing hanging under the
   * mouth. The lower face came out half as long again as a face is. A jaw does
   * the opposite: the chin is the lowest point of a head, and the mandible runs
   * back and *up* from it towards the ear.
   *
   * The lift is the same all the way round, because t = 1 is a pole where every
   * s is the same point — anything that varies with s here tears the mesh open
   * at the bottom of the head. Only the tuck backwards is allowed to vary, and
   * it is faded out before the pole for the same reason.
   */
  const under = smoothstep(F.chinT - 0.02, 1.0, t);
  y += under * 0.30;
  /* The crown is narrower than the widest part of the skull, which is at ear
   * height — the difference is small and its absence is very visible. */
  x *= 1 - smoothstep(0.20, 0.0, t) * 0.12;
  /*
   * And the top of a skull is a shallow dome on a squarish vault, not the end
   * of an egg. Without this the head comes to a point above the brows and the
   * whole thing reads as a rugby ball with a face drawn on the side of it.
   */
  const dome = smoothstep(0.26, 0.0, t);
  y -= dome * 0.062 * P.length;
  const behind = Math.max(0, -Math.cos(phi));
  z *= 1 - behind * smoothstep(0.34, 0.02, t) * 0.16;

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
  const socket = EYE.socketDepth * P.eyeDeep * pair(s, t, F.eyeS, F.eyeT - 0.008, 0.125, 0.066, 0.85);
  const temple = 0.020 * pair(s, t, 0.335, 0.285, 0.080, 0.080, 0.9);
  const cheek = 0.041 * P.cheek * pair(s, t, F.cheekS + 0.012, 0.520, 0.130, 0.072, 0.85);
  const foreheadFlat = 0.013 * ellipse(faceU(s), t, 0.5, 0.235, 0.105, 0.080, 0.9);
  const hollow = 0.025 * pair(s, t, 0.258, 0.618, 0.090, 0.055, 0.9);
  let dN = cheek - socket - temple - foreheadFlat - hollow;

  /* ---- displacement along +Z ---- */
  const browRidge = 0.047 * P.brow * pair(s, t, 0.135, F.browT + 0.014, 0.140, 0.032, 0.9);
  /*
   * The glabella — the flat between the brows. `pair` takes the larger of the
   * two brow ridges and both have fallen to nothing by the centre line, so
   * without this there is a notch there, and the nose runs up into it and comes
   * out of the top of a V. Every face had a crease between the eyebrows it had
   * done nothing to earn.
   */
  const glabella = 0.021 * P.brow * gauss(acrossFace(s), 0, 0.028)
    * gauss(t, F.browT + 0.020, 0.032);

  /* Everything on the centre line is shaped against `acrossFace`, not s — see
   * the note on it. In s these were tent poles. */
  const ax = acrossFace(s);
  const noseRidge = 0.056 * P.noseBridge * gauss(ax, 0, 0.030) * band(t, 0.320, 0.500, 0.060);
  const noseTip = 0.118 * P.nose * gauss(ax, 0, 0.024) * gauss(t, F.noseTipT, 0.030);
  const noseWing = 0.048 * P.nose * pair(s, t, F.noseHalfS, F.noseBaseT - 0.006, 0.070, 0.021, 0.8);
  /*
   * Under the nose.
   *
   * This was one shadow 0.115 wide laid straight across the top lip, and on a
   * rendered face it did not read as the underside of a nose at all — it read
   * as a moustache, on every customer, and it was the single thing that made
   * the generated women look like men. What is actually under a nose is two
   * nostrils either side of a septum, and it is the nostrils that make the eye
   * accept the shape above them as a nose rather than a bump.
   */
  const septum = -0.011 * ellipse(faceU(s), t, 0.5, F.noseBaseT + 0.012, 0.010, 0.015, 0.9);
  const nostril = -0.032 * P.nose * pair(s, t, F.nostrilS, F.noseBaseT + 0.002, 0.038, 0.015, 0.75);
  /* And the crease where the wing meets the cheek, which is the line that says
   * the nose has a side to it and is not painted on. */
  const alar = -0.017 * pair(s, t, F.noseHalfS + 0.024, F.noseBaseT - 0.014, 0.032, 0.034, 0.85);
  const noseUnder = septum + nostril + alar;

  const philtrum = -0.006 * gauss(ax, 0, 0.010) * gauss(t, 0.552, 0.020);

  const lm = lipMask(s, t);
  const lipX = clamp(ax / (faceU(0.5 + F.lipHalfS) - 0.5), -1, 1);
  const lipCore = Math.pow(Math.max(0, 1 - lipX * lipX), 0.42);
  /*
   * The two lobes, and the line between them. The line was a slot 3mm deep and
   * 1.5mm wide, which at any distance reads as a mouth held shut with a ruler;
   * a closed mouth is a soft crease with a shadow in it, and most of what makes
   * it read is the shadow, which `headAO` puts there.
   */
  const lips = 0.052 * P.lip * Math.pow(lm, 0.65)
    - 0.016 * gauss(t, F.mouthT, 0.0105) * lipCore;

  const sulcus = -0.013 * ellipse(faceU(s), t, 0.5, 0.655, 0.017, 0.022, 0.9);
  /*
   * The front of the mandible, and then the chin on the end of it.
   *
   * The ellipsoid falls away by twelve millimetres between the lower lip and
   * the chin. A face does not: from the lip down it runs very nearly straight
   * to the point of the chin and only then turns under. Every customer had her
   * chin tucked back into her neck, which reads as a weak jaw whatever the rest
   * of the face is doing.
   *
   * The ramp is structural and the same on everybody, because it is making up
   * for the shape of the ellipsoid rather than describing a person; `P.chin` is
   * what varies, on top of it.
   */
  const jawLine = 0.078 * smoothstep(F.mouthT + 0.02, F.chinT - 0.01, t)
    * (1 - smoothstep(F.chinT + 0.02, F.chinT + 0.13, t));
  const chin = 0.052 * P.chin * ellipse(faceU(s), t, 0.5, F.chinT, 0.021, 0.056, 0.85);
  /* The rest of the tuck: the underside goes back under the jaw as well as up.
   * Faded out before the pole, where it would tear (see `under`). */
  const underBack = -0.155 * under * (1 - smoothstep(0.94, 1.0, t));

  let dZ = browRidge + glabella + noseRidge + noseTip + noseWing + noseUnder
    + philtrum + lips + sulcus + jawLine + chin + underBack;

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
  const nostril = pair(s, t, F.nostrilS, F.noseBaseT + 0.002, 0.038, 0.016, 0.75);
  const mouthLine = gauss(t, F.mouthT, 0.010) * Math.pow(Math.max(0, 1 - ((s - 0.5) / F.lipHalfS) ** 2), 0.4);
  const underJaw = smoothstep(0.80, 0.98, t);
  const underBrow = pair(s, t, F.eyeS, F.creaseT - 0.004, 0.110, 0.030, 0.9);
  const sideNose = pair(s, t, 0.105, 0.470, 0.055, 0.070, 0.9);
  return clamp(1
    - 0.42 * socket - 0.30 * underBrow - 0.52 * nostril
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
      const s = sampleS(i, NS);
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
        evalSurface(P, sampleS(i, NS), j / NT, targets[k], p);
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
  const r = EYE.radius * P.eyeSize;
  /*
   * The axis the lids are built around, which is not the socket's normal.
   *
   * The head is a curved thing, so at the eye its surface points about
   * twenty-five degrees out to the side, and hinging the lids on that puts the
   * eye opening twenty-five degrees off where the eye is looking. The iris then
   * sits jammed against the inner corner with a crescent of white beside it —
   * the customer looked permanently startled and slightly cross-eyed.
   *
   * A real orbit does diverge about that much; a real palpebral fissure does
   * not follow it that far. Keeping part of the tilt is what stops the two eyes
   * reading as a pair of headlamps on a flat plate, so this is a blend rather
   * than a straightening.
   */
  const k = EYE.lidTilt;
  const ax = [n[0] * k, n[1] * k, n[2] * k + (1 - k)];
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  ax[0] /= al; ax[1] /= al; ax[2] /= al;
  /*
   * Where the ball goes, worked out rather than tuned.
   *
   * The lids ride on a shell of radius `r * lidShell` around the ball's centre,
   * and the front of that shell *is* the front of the face at the eye: seat it
   * anywhere else and either the lids stand off the head or the eye disappears
   * into a hole. The version that shipped first had the ball's centre on the
   * skin, which put the whole assembly five millimetres proud — two ping-pong
   * balls resting on a face, and it took hiding the hair and looking at the
   * bare skull to see it.
   *
   * So: find the face the socket was cut into — `p` plus the socket's own depth
   * back along the normal — and put the shell's apex exactly there.
   */
  const R = r * EYE.lidShell;
  const socket = EYE.socketDepth * P.eyeDeep;
  return {
    r,
    s,
    centre: [
      p[0] + n[0] * socket - ax[0] * R,
      p[1] + n[1] * socket - ax[1] * R,
      p[2] + n[2] * socket - ax[2] * R,
    ],
    normal: n,
    axis: ax,
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
 * The lids.
 *
 * The first version built each lid as a round cap sitting on the front of the
 * eyeball, and it was wrong in a way none of the numbers caught: a circular rim
 * cannot bound an almond. Swung open, the upper cap's rim rose clear of the
 * ball towards the corners, so sclera showed all the way round the sides — a
 * white ring with a small pink hat on it. Every customer's eye read as a
 * porthole, and the measurements all passed, because they were measuring the
 * rim at the one azimuth where it was right.
 *
 * So a lid is not a cap. It is a *cup*: a shell wrapped round the ball past its
 * own silhouette with the eye opening cut out of it. Past ninety degrees is the
 * whole point — beyond that the shell is behind the ball from every angle a
 * face is ever seen from, so no sclera can appear anywhere except through the
 * opening, whatever the lid is doing.
 *
 * The opening is stated once, in `lidRim`, in radians on the ball. The mesh,
 * the lashes and the audit all read it. That is deliberate: the porthole
 * survived because the shape of the eye was implied by two half-angles and a
 * hinge, and nothing could be pointed at and called wrong.
 *
 * The cup is built looking straight ahead — the pose the eye is in nearly all
 * the time — and then swung back by the open angle, because the renderer hinges
 * it forward by that same angle to open it. Building in the pose you can reason
 * about, and undoing the hinge once at the end, is much easier to keep right
 * than reasoning about a rim that has already been rotated.
 *
 * Its UVs are not its own. They are mapped into the head's texture space over
 * the lid zone, so a stroke of eyeshadow lands in the same texture whether it
 * hits the lid or the skin around it, and the colour on a closed lid is the
 * colour on the crease when it opens. One paint texture for the whole face is
 * worth the small oddity of a mesh borrowing another mesh's coordinates.
 */
export const LID = {
  /* The opening, in radians on the ball, from the gaze axis. */
  halfWidth: 1.02,   /* axis to canthus: half of how wide the eye opens */
  upper: 0.35,       /* how high the upper rim rides at its crest */
  lower: 0.36,       /* how low the lower rim drops at its trough */
  tilt: 0.14,        /* the outer canthus sits this much above the inner one */
  crest: -0.18,      /* where along the opening the upper rim peaks: -1 nose, +1 temple */
  trough: 0.16,      /* and where the lower rim bottoms out */

  /* How far round the ball each shell reaches, again from the gaze axis. */
  wrap: 1.90,        /* the upper cup, well past the silhouette at pi/2 */
  lowerWrap: 1.55,   /* the lower lid is a band over it, not a second cup */
  lowerLift: 0.016,  /* riding this much proud at its margin, and sunk inside
                      * the cup by twice as much at its far edge, so it has a
                      * lid margin at the lash line and no edge anywhere else */

  /* And how far each swings back to open. */
  upperOpen: 1.36,
  lowerOpen: 1.34,
};

/*
 * A lobe that vanishes at both ends of the opening with its crest slid along.
 * The skew is applied to the parameter rather than the result, which keeps the
 * ends pinned at +-1: however far the crest moves, the two rims still meet
 * exactly at the canthi, and the corners of the eye stay corners.
 */
function lidLobe(u, at) {
  const w = u - at * (1 - u * u);
  return Math.pow(Math.max(0, 1 - w * w), 0.62);
}

/*
 * The eye opening, as a direction on the ball.
 *
 * `u` runs -1 at the inner corner to +1 at the outer one, `lower` picks the
 * rim. The frame is the socket's, looking straight ahead: +Z the way the eye
 * faces, +Y up, +X outward towards the temple for either eye.
 */
export function lidRim(u, lower) {
  const a = u * LID.halfWidth;
  const canthus = u * LID.tilt * 0.5;
  const b = lower
    ? canthus - LID.lower * lidLobe(u, LID.trough)
    : canthus + LID.upper * lidLobe(u, LID.crest);
  const cb = Math.cos(b);
  return [Math.sin(a) * cb, Math.sin(b), Math.cos(a) * cb];
}

/*
 * Where the shell's texture coordinates come from.
 *
 * `eyeOpening` in face.js already says where the eye is in texture space — it
 * is the hole every zone mask is cut around. Registering the shell against it
 * rather than against a pair of hand-set constants means the opening in the
 * geometry and the opening in the masks are the same opening, so eyeliner drawn
 * along the lash line lands on the lid margin and not a millimetre off it.
 *
 * It falls out that a point at the top of the shell, ninety degrees up, maps to
 * 0.336 — the crease, to within a thousandth. That is not a coincidence worth
 * relying on, but it is a good sign the scale is right.
 */
const UV_S = F.eyeHalfS / Math.sin(LID.halfWidth);
const UV_T = 0.017 / Math.sin((LID.upper + LID.lower) / 2);

/* Marches a direction out along its own great circle, away from the gaze axis,
 * to a polar angle of `to`. Azimuth is preserved, so a rim point and the point
 * it grows into stay on the same meridian and the shell does not twist. */
function outwards(d, to) {
  const h = Math.hypot(d[0], d[1]) || 1;
  const st = Math.sin(to), ct = Math.cos(to);
  return [d[0] / h * st, d[1] / h * st, ct];
}

export function buildLid(r, side, lower = false) {
  const b = new MeshBuilder();
  const R = r * EYE.lidShell;
  const cs = 0.5 + side * F.eyeS;
  /* Swing the finished shell back by however far the renderer swings it
   * forward, so that an open eye is the shell exactly as it was designed. */
  const A = lower ? LID.lowerOpen : -LID.upperOpen;
  const ca = Math.cos(A), sa = Math.sin(A);

  const SEG = lower ? 40 : 72, RINGS = lower ? 6 : 10;
  const rows = [];
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS;
    const row = [];
    for (let i = 0; i <= SEG; i++) {
      /*
       * The upper cup is an annulus: its inner edge is the whole opening, both
       * rims, run round as one closed loop. The lower lid is a band, so its
       * inner edge is the lower rim alone.
       */
      let d;
      if (lower) {
        d = lidRim(-1 + 2 * (i / SEG), true);
      } else {
        const f = i / SEG;
        d = f < 0.5
          ? lidRim(1 - 4 * f, false)          /* outer corner round to inner */
          : lidRim(-1 + 4 * (f - 0.5), true); /* and back along the lower rim */
      }
      const rho = Math.acos(clamp(d[2], -1, 1));
      const to = rho + v * ((lower ? LID.lowerWrap : LID.wrap) - rho);
      const p = outwards(d, to);
      /*
       * The band stands proud at the lash line — a lid margin is a real ridge,
       * and it is what the mascara sits on — then dips inside the cup, so its
       * far edge is hidden rather than drawn as a line across the lid.
       */
      const rad = R * (lower ? 1 + LID.lowerLift * (1 - 3 * v * v) : 1);
      const x = p[0] * rad, y = p[1] * rad, z = p[2] * rad;
      /* Undo the hinge: the same rotation the renderer applies, backwards. */
      const ry = y * ca + z * sa;
      const rz = z * ca - y * sa;
      const mx = x * side;
      const nl = Math.hypot(mx, ry, rz) || 1;
      row.push(b.vert(mx, ry, rz, mx / nl, ry / nl, rz / nl,
        cs + p[0] * side * UV_S,
        F.eyeT - p[1] * UV_T,
        /*
         * Darkest at the margin, where a lid meets the eye and the light does
         * not reach; the rest of the shell picks up the face's own shading. The
         * lower lid sits inside the eye's own shadow all the way across, and
         * without that it comes out as a pale crescent under each eye — the
         * shape a person would put concealer on to get rid of.
         */
        (lower ? 0.60 : 0.70) + (lower ? 0.22 : 0.30) * smoothstep(0, 0.45, v)));
    }
    rows.push(row);
  }
  for (let j = 0; j < RINGS; j++) {
    for (let i = 0; i < SEG; i++) {
      /* Mirroring x for the far eye swaps which way round a triangle is. */
      if (side > 0) b.quad(rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]);
      else b.quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
    }
  }
  b.computeNormals();
  return b.build();
}

/*
 * Lashes: a fan of tapered fins along the upper lid's margin, swept forward
 * and up. They are geometry rather than a texture because mascara is a product
 * the player buys, and "the lashes got longer" has to be visible from the
 * distance the game is played at.
 *
 * They grow from `lidRim` — the same curve the opening is cut along — and are
 * drawn with the upper lid's own matrix, so they follow it down through a
 * blink without being rebuilt.
 *
 * Built at full length and scaled down by a uniform, so applying mascara does
 * not rebuild a mesh mid-stroke.
 */
export function buildLashes(r, side) {
  const b = new MeshBuilder();
  const R = r * EYE.lidShell * 1.01;
  const N = 26;
  const ca = Math.cos(-LID.upperOpen), sa = Math.sin(-LID.upperOpen);
  /* Stop short of the canthi: lashes run out before the corners do. */
  const SPAN = 0.88;

  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const u = (-1 + 2 * f) * SPAN;
    const d = lidRim(u, false);
    const bx = d[0] * R, by = d[1] * R, bz = d[2] * R;

    /* Direction the lash grows: away from the eye centre, curled up and out. */
    const outx = d[0], outy = d[1], outz = d[2];
    /* Longest over the middle of the lid and towards the outer corner, which is
     * where a person putting on mascara puts it. */
    const len = r * (0.30 + 0.26 * Math.cos(u * 1.35) * (0.82 + 0.18 * u));
    const tipx = bx + outx * len * 0.35 + u * len * 0.16;
    const tipy = by + outy * len * 0.30 + len * 0.62;
    const tipz = bz + outz * len * 0.55 + len * 0.30;

    const w = r * 0.030 * (0.6 + 0.4 * Math.cos(u * 1.5));
    const put = (x, y, z, tu, tv) => {
      const ry = y * ca + z * sa;
      const rz = z * ca - y * sa;
      return b.vert(x * side, ry, rz, 0, 0, 1, tu, tv, 1);
    };
    const a = put(bx - w, by, bz, f, 1);
    const c = put(bx + w, by, bz, f, 1);
    const d2 = put(tipx, tipy, tipz, f, 0);
    b.tri(a, c, d2);
    /* Doubled the other way round so a lash is visible from behind when the
     * head turns; two triangles is cheaper than disabling face culling for the
     * whole draw. */
    b.tri(a, d2, c);
  }
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
