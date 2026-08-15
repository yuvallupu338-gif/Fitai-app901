/*
 * unwrap.js — putting somebody else's head into face space.
 *
 * A head downloaded from the internet is a bag of triangles with the artist's
 * UV layout on it, or with none at all. Neither is any use here: every mask,
 * brush, coverage figure and scoring rule in this game is written in face
 * space, and an imported head that keeps its own UVs is a head you cannot put
 * lipstick on.
 *
 * So its UVs are thrown away and it is unwrapped again, into face space. That
 * is possible because face space is not an arbitrary atlas — it is a warped
 * spherical parameterisation with a closed-form forward direction, so it has a
 * backward one:
 *
 *   1. Put the head where the game's head lives. The twenty landmarks give a
 *      rotation, a scale and an origin, so an imported model in centimetres,
 *      Z-up and facing backwards ends up the same size and in the same place as
 *      the generated one — which is what lets the eyes, the lids, the camera
 *      and the whole shop stay exactly as they are.
 *   2. Run the sphere backwards. Longitude and latitude of every vertex, then
 *      the two warps inverted, gives a first (s, t).
 *   3. Correct it with the landmarks. Step 2 puts the features roughly where
 *      face space expects them, roughly being the operative word: this head's
 *      mouth is not at the same latitude as the generated one's. Two monotone
 *      curves through the marks — the same fit the photographic side uses, from
 *      the same module — move each feature onto its own coordinate.
 *
 * What it cannot do is invent a parameterisation for geometry that is not
 * star-shaped about the middle of the head. Ears fold. The inside of the mouth
 * folds. So does the pocket under the nose, which is concave and faces partly
 * upwards — a ray from inside a head leaves it twice. That is a property of
 * projecting a sphere and not a bug waiting to be fixed, which is why this
 * counts what folded and hands the number back instead of hiding it. On a
 * carefully marked head the folded area on the front of the face is around four
 * thousandths of a percent, all of it in that dimple; a head where a *band*
 * folds is a head whose marks are wrong, and the number is how you tell.
 */

import { faceU, faceV, F } from '../face.js';
import { evalSurface, headAO, HEAD_AXES, NEUTRAL_EXPR } from '../head.js';
import {
  LANDMARK_KEYS, MESH_EDGE_S, VERTICAL_ANCHORS, horizontalAnchors,
  faceUInverse, fitMonotone, orderProblems,
} from '../landmarks.js';
import { clamp } from '../../core/math.js';

const TAU = Math.PI * 2;

/* The average face — no customer's numbers, just the shape face space is
 * defined against. An imported head is fitted to this one. */
const AVERAGE = {
  width: 1, length: 1, depth: 1, jaw: 1, chin: 1, cheek: 1, brow: 1,
  nose: 1, noseBridge: 1, lip: 1, eyeSize: 1, eyeDeep: 1,
};

/*
 * Where each mark sits on the average head, in face space. Only the fifteen
 * whose (s, t) is unambiguous are here: they are used to find the scale and the
 * origin, and adding the five whose position is a matter of degree — the peak
 * of a brow, the top of a lip — would put noise into a number that wants none.
 */
function referenceFaceCoords() {
  const h = horizontalAnchors(MESH_EDGE_S);
  const off = (key) => h.find((a) => a.key === key).s;
  const pair = (key, t) => ({
    [key + 'L']: [0.5 - off(key), t],
    [key + 'R']: [0.5 + off(key), t],
  });
  return {
    hairline: [0.5, F.hairline],
    noseTip: [0.5, F.noseTipT],
    noseBase: [0.5, F.noseBaseT],
    chin: [0.5, F.chinT],
    ...pair('eye', F.eyeT),
    ...pair('eyeOuter', F.eyeT),
    ...pair('mouth', F.mouthT),
    ...pair('noseWing', F.noseBaseT),
    ...pair('face', 0.5),
  };
}

/* ------------------------------------------------------------------ *
 * Small vector helpers
 * ------------------------------------------------------------------ */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/* ------------------------------------------------------------------ *
 * The latitude warp, inverted
 * ------------------------------------------------------------------ */

/*
 * `faceV` is a monotone cubic with no closed-form inverse, and this runs once
 * per vertex on a forty-thousand-triangle head. A table built once and read
 * with a linear interpolation is accurate to about a ten-thousandth of a t —
 * a hundredth of a millimetre on a face — and about forty times faster than
 * bisecting the cubic each time.
 */
const V_TABLE = (() => {
  const N = 2048;
  const v = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) v[i] = faceV(i / N);
  return { N, v };
})();

function faceVInverse(target) {
  const { N, v } = V_TABLE;
  if (target <= v[0]) return 0;
  if (target >= v[N]) return 1;
  let lo = 0, hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (v[mid] <= target) lo = mid; else hi = mid;
  }
  const span = v[hi] - v[lo];
  const k = span > 0 ? (target - v[lo]) / span : 0;
  return (lo + k) / N;
}

/* ------------------------------------------------------------------ *
 * Landmarks in, problems out
 * ------------------------------------------------------------------ */

export function validateHeadMarks(landmarks) {
  const bad = [];
  const lm = landmarks || {};
  for (const key of LANDMARK_KEYS) {
    const p = lm[key];
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) {
      bad.push(`landmark ${key} missing or not a 3D point`);
    }
  }
  return bad;
}

/* ------------------------------------------------------------------ *
 * The fit
 * ------------------------------------------------------------------ */

/*
 * Rotation, scale and origin, from the marks alone.
 *
 * The rotation is built rather than solved: the line between the pupils is the
 * x axis by definition, the line from the hairline to the chin is very nearly
 * the y axis, and one Gram-Schmidt step makes them exactly orthogonal. Solving
 * a least-squares rotation over all twenty marks would need a 3x3 SVD to buy an
 * improvement smaller than the marking error.
 *
 * The scale and the origin are then the ratio and difference of the two point
 * clouds' spreads and centres, which is the same answer a similarity fit would
 * give once the rotation is fixed.
 */
export function fitPose(landmarks) {
  const problems = validateHeadMarks(landmarks);
  if (problems.length) throw new Error('head marks unusable:\n  ' + problems.join('\n  '));

  const lm = landmarks;
  const right = norm(sub(lm.eyeR, lm.eyeL));
  const rawUp = norm(sub(lm.hairline, lm.chin));
  const up = norm([
    rawUp[0] - right[0] * dot(rawUp, right),
    rawUp[1] - right[1] * dot(rawUp, right),
    rawUp[2] - right[2] * dot(rawUp, right),
  ]);
  /* Right-handed, the same convention `aimedBasis` builds and the renderer
   * culls against. A left-handed frame here would mirror the whole head and
   * turn every triangle in it inside out. */
  const forward = cross(right, up);

  const eyeMid = [
    (lm.eyeL[0] + lm.eyeR[0]) / 2,
    (lm.eyeL[1] + lm.eyeR[1]) / 2,
    (lm.eyeL[2] + lm.eyeR[2]) / 2,
  ];
  if (dot(sub(lm.noseTip, eyeMid), forward) <= 0) {
    throw new Error(
      'the marks say the nose points into the back of the head — eyeL and eyeR '
      + 'are almost certainly swapped. L is the eye on the *left of the screen* '
      + 'with the head facing you, which is the head\'s own right eye.');
  }

  /* The two clouds: the marks as given, and where the average head has them. */
  const ref = referenceFaceCoords();
  const keys = Object.keys(ref);
  const refPts = keys.map((k) => evalSurface(AVERAGE, ref[k][0], ref[k][1], NEUTRAL_EXPR, []));
  /* Into the frame first, so the scale is measured along the same axes it will
   * be applied along. */
  const impPts = keys.map((k) => {
    const d = sub(lm[k], eyeMid);
    return [dot(d, right), dot(d, up), dot(d, forward)];
  });

  const centroid = (pts) => {
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return c.map((v) => v / pts.length);
  };
  const spread = (pts, c) => Math.sqrt(
    pts.reduce((n, p) => n + dot(sub(p, c), sub(p, c)), 0) / pts.length);

  const impC = centroid(impPts), refC = centroid(refPts);
  const impS = spread(impPts, impC), refS = spread(refPts, refC);
  if (!(impS > 0)) throw new Error('the marks are all in the same place');
  const scale = refS / impS;

  /* mesh point -> head space */
  const toHead = (p) => {
    const d = sub(p, eyeMid);
    return [
      (dot(d, right) - impC[0]) * scale + refC[0],
      (dot(d, up) - impC[1]) * scale + refC[1],
      (dot(d, forward) - impC[2]) * scale + refC[2],
    ];
  };

  /* How well it fits, in head half-heights — about 115mm each. A head marked
   * carefully lands under 0.03; anything past 0.10 is a mark on the wrong
   * feature, and it is worth saying so rather than shipping a face whose mouth
   * is a centimetre from where the game thinks it is. */
  let residual = 0;
  for (let i = 0; i < keys.length; i++) {
    const d = sub(toHead(lm[keys[i]]), refPts[i]);
    residual += dot(d, d);
  }
  residual = Math.sqrt(residual / keys.length);

  return { right, up, forward, origin: eyeMid, scale, toHead, residual };
}

/* ------------------------------------------------------------------ *
 * The unwrap
 * ------------------------------------------------------------------ */

/*
 * Sphere, backwards. `q` is already in head space, so this is the exact inverse
 * of the first four lines of `evalSurface` — divide out the ellipsoid, read off
 * the two angles, and run each warp the other way.
 */
function rawFaceCoords(q) {
  const x = q[0] / HEAD_AXES.w, y = q[1] / HEAD_AXES.h, z = q[2] / HEAD_AXES.d;
  const phi = Math.atan2(x, z);
  const rho = Math.hypot(x, z);
  /* atan2 rather than acos(y): the polar angle of the normalised point stays
   * meaningful for the neck and the shoulders, which sit outside the ellipsoid
   * the head is displaced from and would otherwise all collapse onto t = 1. */
  const lam = Math.atan2(rho, y);
  return [faceUInverse(phi / TAU + 0.5), faceVInverse(clamp(lam / Math.PI, 0, 1))];
}

/*
 * Everything above, applied to a mesh.
 *
 * Returns the same shape `buildHead` does — an interleaved vertex buffer, an
 * index buffer and a morph buffer — so the renderer, the ray-cast the brush
 * runs on and the customer assets cannot tell the difference.
 */
export function unwrapHead(source, landmarks, opts = {}) {
  const pose = fitPose(landmarks);
  const { positions, indices } = source;
  const vertexCount = positions.length / 3;

  /* ---- pass one: every vertex into head space and face space ---- */
  const P = new Float32Array(positions.length);
  const S = new Float64Array(vertexCount);
  const T = new Float64Array(vertexCount);
  const q = [0, 0, 0];
  for (let i = 0; i < vertexCount; i++) {
    const h = pose.toHead([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    P[i * 3] = h[0]; P[i * 3 + 1] = h[1]; P[i * 3 + 2] = h[2];
    q[0] = h[0]; q[1] = h[1]; q[2] = h[2];
    const st = rawFaceCoords(q);
    S[i] = st[0]; T[i] = st[1];
  }

  /* ---- the landmark correction ---- *
   *
   * Step two put the features roughly where face space expects them. Roughly is
   * not enough: the sphere it inverted is the shape *before* a nose and a chin
   * and a brow ridge were displaced out of it, so a vertex on the tip of the
   * nose comes back a full percent of the head above where it belongs — and
   * this head's mouth is not at the same latitude as the average one's anyway.
   * Two monotone curves through the marks move each feature onto its own
   * coordinate, and every vertex near it along with it.
   */
  const raw = {};
  for (const key of LANDMARK_KEYS) raw[key] = rawFaceCoords(pose.toHead(landmarks[key]));

  /* t runs down the face and so do the marks once they are in face space, so
   * the order rules read straight off. */
  const orderBad = orderProblems((key) => raw[key][1]);

  const mapT = fitMonotone(VERTICAL_ANCHORS.map((a) => [
    a.keys.reduce((n, k) => n + raw[k][1], 0) / a.keys.length, a.t,
  ]));
  const anchors = horizontalAnchors(MESH_EDGE_S);
  const halfMap = (side) => fitMonotone([
    [0, 0],
    ...anchors.map((a) => [Math.abs(raw[a.key + (side < 0 ? 'L' : 'R')][0] - 0.5), a.s]),
  ]);
  const mapL = halfMap(-1), mapR = halfMap(1);

  const correct = (s, t) => {
    const d = s - 0.5;
    return [d < 0 ? 0.5 - mapL(-d) : 0.5 + mapR(d), mapT(t)];
  };

  /* Where the marks ended up. The corrected ones are what everything
   * downstream wants — an eyeball is hung on `marked.eyeL` — and they are also
   * the assertion that the correction did its job: each of them has to come out
   * on the face-space coordinate it stands for, to the last decimal. */
  const marked = {};
  for (const key of LANDMARK_KEYS) marked[key] = correct(raw[key][0], raw[key][1]);

  /* ---- the seam ---- *
   *
   * Longitude wraps behind the head, so a triangle straddling the back has one
   * corner near s = 0 and another near s = 1, and its texture stretches right
   * across the face. The fix is the one every spherical unwrap uses: the
   * corners on the near side are duplicated and pushed past 1, so the triangle
   * spans 0.98..1.03 instead of 0.03..0.98. Nothing is painted back there —
   * that is the point of it being the seam — but a smear up the back of the
   * skull is visible from the side and looks like a tear in the mesh.
   *
   * It has to happen *before* the correction and not after. The correction is a
   * curve fitted to the front of the face and continued outwards, so past the
   * ear it carries s beyond 0 and 1; once that has happened "which of these two
   * corners is on the far side of the wrap" is no longer a question about 0.5,
   * and the split silently stops working. In the raw coordinates the wrap is
   * exactly at 0 and 1, because that is what a longitude is.
   */
  const idx = Array.from(indices);
  const pos = Array.from(P);
  const su = Array.from(S), tv = Array.from(T);
  const shifted = new Map();
  let seamSplit = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const lo = Math.min(su[a], su[b], su[c]);
    const hi = Math.max(su[a], su[b], su[c]);
    if (hi - lo <= 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const vi = idx[f + k];
      if (su[vi] > 0.5) continue;
      let ni = shifted.get(vi);
      if (ni === undefined) {
        ni = su.length;
        pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
        su.push(su[vi] + 1);
        tv.push(tv[vi]);
        shifted.set(vi, ni);
        seamSplit++;
      }
      idx[f + k] = ni;
    }
  }

  for (let i = 0; i < su.length; i++) {
    const st = correct(su[i], tv[i]);
    su[i] = st[0]; tv[i] = st[1];
  }

  /* ---- normals, from the triangles ---- */
  const n = new Float32Array(pos.length);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const fn = cross(e1, e2);
    for (const o of [a, b, c]) { n[o] += fn[0]; n[o + 1] += fn[1]; n[o + 2] += fn[2]; }
  }
  /* Welded across the seam by construction: the duplicated corners share a
   * position, so both copies get the sum of both sides' faces. */
  const weld = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] * 1e5)},${Math.round(pos[i + 1] * 1e5)},${Math.round(pos[i + 2] * 1e5)}`;
    const list = weld.get(key);
    if (list) list.push(i); else weld.set(key, [i]);
  }
  for (const list of weld.values()) {
    if (list.length < 2) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const i of list) { nx += n[i]; ny += n[i + 1]; nz += n[i + 2]; }
    for (const i of list) { n[i] = nx; n[i + 1] = ny; n[i + 2] = nz; }
  }

  /* ---- how well it went ---- */
  let flipped = 0, degenerate = 0;
  const triangles = idx.length / 3;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const area = (su[b] - su[a]) * (tv[c] - tv[a]) - (su[c] - su[a]) * (tv[b] - tv[a]);
    if (Math.abs(area) < 1e-12) degenerate++;
    else if (area > 0) flipped++;
  }
  /* Which way round "flipped" is depends on the winding the file arrived with,
   * so it is measured rather than assumed: whichever sign the majority of the
   * mesh has is the right way up, and the minority is what folded. */
  if (flipped > triangles / 2) flipped = triangles - flipped - degenerate;

  /* ---- out ---- */
  const count = su.length;
  const vertices = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    vertices[o] = pos[i * 3];
    vertices[o + 1] = pos[i * 3 + 1];
    vertices[o + 2] = pos[i * 3 + 2];
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    vertices[o + 3] = n[i * 3] / l;
    vertices[o + 4] = n[i * 3 + 1] / l;
    vertices[o + 5] = n[i * 3 + 2] / l;
    vertices[o + 6] = su[i];
    vertices[o + 7] = tv[i];
    /* The socket, the nostril and the underside of the jaw are dark on every
     * face and the fields that carve them are already written. Borrowing the
     * generated head's occlusion costs nothing and is much closer to right than
     * a flat 1.0, which reads as a face lit from inside. */
    vertices[o + 8] = headAO(AVERAGE, clamp(su[i], 0, 1), clamp(tv[i], 0, 1));
  }

  return {
    mesh: {
      vertices,
      indices: new Uint32Array(idx),
      positions: new Float32Array(pos),
      triangles,
    },
    /* An imported head cannot smile: there is no shape function to evaluate a
     * second time. Zero deltas rather than no buffer, so the one vertex shader
     * still draws it and the expression code upstream needs no special case. */
    morph: new Float32Array(count * 12),
    pose,
    marked,
    raw,
    stats: {
      vertices: count,
      triangles,
      seamSplit,
      flipped,
      degenerate,
      residual: pose.residual,
      orderProblems: orderBad,
    },
    opts,
  };
}
