#!/usr/bin/env node
/*
 * makeup-audit.mjs — everything about the makeup counter that can be checked
 * without a GPU.
 *
 * The renderer needs a browser and gets one in makeup-smoke.mjs. Everything
 * underneath it — the face's coordinate system, the head it generates, the
 * catalogue, the brush, the scoring and the shift — is plain arithmetic, and
 * that is what this drives.
 *
 * Two rules were followed while writing these:
 *
 *   1. A check must not ask the same table its subject asks. Asserting that
 *      every look's requested category exists in CATEGORIES by iterating
 *      CATEGORIES proves only that a loop terminates. The checks here name the
 *      unsafe cases themselves — that a lipstick must never be scored as a
 *      blusher, that the mouth is below the eyes — so deleting the data they
 *      guard makes them fail.
 *
 *   2. Every one of them was watched failing on a deliberate mutation before it
 *      was trusted. Several of them caught real bugs on the way in: the lid
 *      zone overlapping the brow, and a wipe that cleared colour and left the
 *      gloss behind.
 *
 * Usage: node tools/makeup-audit.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(resolve(ROOT, 'makeup/src', p)).href);

const failures = [];
const notes = [];
let checks = 0;

function check(cond, msg) {
  checks++;
  if (cond) notes.push('ok: ' + msg);
  else failures.push(msg);
}

function near(a, b, tol, msg) {
  check(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b}, tol ${tol})`);
}

/*
 * A stand-in for WebGL that records nothing and answers everything. The paint
 * layer's only use of the context is uploading buffers it already owns, so with
 * this in place the audit exercises the real brush, the real blending and the
 * real per-zone statistics — the code that decides whether the game is fair.
 */
function stubGl() {
  const noop = () => {};
  const target = {
    createTexture: () => ({ id: 1 }),
    bindTexture: noop, pixelStorei: noop, texStorage2D: noop, texSubImage2D: noop,
    texImage2D: noop, generateMipmap: noop, texParameteri: noop, texParameterf: noop,
    deleteTexture: noop,
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : 0x1908) });
}

async function main() {
  const color = await load('core/color.js');
  const math = await load('core/math.js');
  const rng = await load('core/rng.js');
  const face = await load('model/face.js');
  const head = await load('model/head.js');
  const products = await load('data/products.js');
  const looks = await load('data/looks.js');
  const customerMod = await load('game/customer.js');
  const paintMod = await load('game/paint.js');
  const scoring = await load('game/scoring.js');
  const shiftMod = await load('game/shift.js');
  const props = await load('model/props.js');
  const textures = await load('render/textures.js');
  const mesh = await load('model/mesh.js');
  const body = await load('model/body.js');

  /* ================================================== colour science == */

  {
    const white = [1, 1, 1], black = [0, 0, 0];
    check(color.rgbToLab(white)[0] > 99, 'white is L*100');
    check(color.rgbToLab(black)[0] < 1, 'black is L*0');
    near(color.deltaE([0.5, 0.2, 0.2], [0.5, 0.2, 0.2]), 0, 1e-9,
      'a colour is zero distance from itself');

    /* The property the shade mechanic rests on: a shade that is two steps away
     * in a ramp must measure further than one that is one step away. If this
     * inverts, "too light" and "too dark" swap and the game lies to the player. */
    const ramp = [];
    for (let i = 0; i <= 6; i++) ramp.push(color.mixLab([0.96, 0.87, 0.80], [0.30, 0.19, 0.13], i / 6));
    let monotone = true;
    for (let i = 1; i < ramp.length; i++) {
      if (color.rgbToLab(ramp[i])[0] >= color.rgbToLab(ramp[i - 1])[0]) monotone = false;
    }
    check(monotone, 'a Lab shade ramp gets steadily darker');
    check(color.deltaE(ramp[0], ramp[3]) > color.deltaE(ramp[0], ramp[1]),
      'shade distance grows with steps along the ramp');

    const warm = color.shadeMiss([0.92, 0.74, 0.52], [0.86, 0.72, 0.66]);
    check(warm.warmth > 0, 'a golden product on a pink skin reads as too warm');
    const cool = color.shadeMiss([0.86, 0.72, 0.72], [0.90, 0.76, 0.55]);
    check(cool.warmth < 0, 'a pink product on a golden skin reads as too cool');
    const pale = color.shadeMiss([0.96, 0.90, 0.86], [0.55, 0.40, 0.32]);
    check(pale.depth > 0, 'a pale product on deep skin reads as too light');

    check(color.undertone([0.95, 0.80, 0.58]) === 'warm', 'golden reads warm');
    check(color.undertone([0.93, 0.78, 0.79]) === 'cool', 'pink reads cool');
  }

  /* ==================================================== deterministic == */

  {
    const a = rng.makeRng('seed-one');
    const b = rng.makeRng('seed-one');
    const c = rng.makeRng('seed-two');
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    check(sa.every((v, i) => v === sb[i]), 'the same seed gives the same sequence');
    check(sa.some((v, i) => v !== sc[i]), 'different seeds diverge');

    /* The generator must not rhyme: a hundred consecutive seeds should not
     * cluster. This catches a hash that ignores its high bits, which produces
     * "every third customer has the same nose". */
    const firsts = [];
    for (let i = 0; i < 200; i++) firsts.push(rng.makeRng(1000 + i)());
    const mean = firsts.reduce((n, v) => n + v, 0) / firsts.length;
    near(mean, 0.5, 0.06, 'consecutive seeds are not biased');
    const buckets = new Array(10).fill(0);
    for (const f of firsts) buckets[Math.min(9, (f * 10) | 0)]++;
    check(buckets.every((n) => n >= 8), 'consecutive seeds fill every decile');
  }

  /* ======================================================= face space == */

  {
    const { faceU, faceV, F } = face;

    /* Monotonicity is a correctness property, not a smoothness preference: a
     * warp that folds turns a band of the head inside out. */
    let uMono = true, vMono = true;
    let prevU = faceU(0), prevV = faceV(0);
    for (let i = 1; i <= 2000; i++) {
      const s = i / 2000;
      const u = faceU(s), v = faceV(s);
      if (u < prevU - 1e-12) uMono = false;
      if (v < prevV - 1e-12) vMono = false;
      prevU = u; prevV = v;
    }
    check(uMono, 'the longitude warp is monotone');
    check(vMono, 'the latitude warp is monotone');
    near(faceU(0.5), 0.5, 1e-9, 'the centre line of the face is the centre of the texture');
    near(faceV(0), 0, 1e-9, 'the crown is at the top of the texture');
    near(faceV(1), 1, 1e-9, 'the base of the neck is at the bottom');

    /* The warp exists for exactly one reason. If it stops paying for itself the
     * lips go back to being twenty texels across and the game is unplayable. */
    const lipWidth = 2 * F.lipHalfS;
    check(lipWidth > 0.22,
      `lips take a usable share of the texture width (${(lipWidth * 100).toFixed(0)}%)`);
    const sphereLipWidth = faceU(0.5 + F.lipHalfS) - faceU(0.5 - F.lipHalfS);
    check(lipWidth / sphereLipWidth > 2.4,
      `the warp magnifies the face by ${(lipWidth / sphereLipWidth).toFixed(1)}x`);

    /* Landmarks in the order a face has them, named here rather than read out
     * of the same table they are being checked against. */
    check(F.hairline < F.browT, 'the hairline is above the brow');
    check(F.browT < F.eyeT, 'the brow is above the eye');
    check(F.eyeT < F.noseTipT, 'the eye is above the tip of the nose');
    check(F.noseTipT < F.mouthT, 'the nose is above the mouth');
    check(F.mouthT < F.chinT, 'the mouth is above the chin');
    check(F.chinT < F.jawT, 'the chin is above the jawline');
    check(F.lidTopT < F.lidBotT, 'the upper lash line is above the lower one');
    check(F.creaseT < F.lidTopT, 'the crease is above the lash line');
  }

  /* ============================================================ masks == */

  {
    const masks = face.buildMasks(256);
    const total = (z) => face.maskTotal(masks, z);
    for (const zone of face.ZONE_NAMES) {
      check(total(zone) > 40, `zone "${zone}" covers a usable area`);
    }
    check(total('skin') > total('lip') * 6, 'the face is much larger than the lips');

    /* Overlaps that would make the scoring meaningless. Lipstick landing in the
     * eyeshadow zone would be counted as eyeshadow. */
    const overlap = (a, b) => {
      let n = 0;
      const A = masks.zones[a], B = masks.zones[b];
      for (let i = 0; i < A.length; i++) n += (A[i] / 255) * (B[i] / 255);
      return n;
    };
    check(overlap('lip', 'lid') < 1, 'the lips and the eyelids do not overlap');
    check(overlap('lip', 'brow') < 1, 'the lips and the brows do not overlap');
    check(overlap('lid', 'brow') < total('brow') * 0.25,
      'the eyeshadow area is mostly clear of the brow');
    check(overlap('lash', 'lid') > 0, 'the lash line touches the lid, which is how liner blends');

    /* Everything paintable must be inside the area the brush is allowed to
     * touch, or products would be clipped away by the very mask meant to keep
     * them on the face. */
    for (const zone of ['lip', 'cheek', 'lid', 'brow', 'glow', 'contour', 'underEye']) {
      const inside = overlap(zone, 'skin') / total(zone);
      check(inside > 0.55, `"${zone}" sits inside the paintable face (${inside.toFixed(2)})`);
    }

    /* Symmetry: a face whose left eye is bigger than its right is a bug that is
     * hard to see and impossible to unsee. */
    const n = masks.size;
    for (const zone of ['lid', 'cheek', 'brow', 'lash', 'underEye']) {
      const buf = masks.zones[zone];
      let left = 0, right = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n / 2; x++) left += buf[y * n + x];
        for (let x = n / 2; x < n; x++) right += buf[y * n + x];
      }
      near(left / right, 1, 0.06, `"${zone}" is symmetrical`);
    }

    /* And the lips are not: a cupid's bow is asymmetrical top to bottom, which
     * is what stops them reading as an oval. */
    const lipBuf = masks.zones.lip;
    let above = 0, below = 0;
    const mouthRow = Math.round(face.F.mouthT * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (y < mouthRow) above += lipBuf[y * n + x]; else below += lipBuf[y * n + x];
      }
    }
    check(below > above * 1.05, 'the lower lip is fuller than the upper one');
  }

  /* ============================================== aimed model matrices == */

  /*
   * Every model matrix built from a direction has to be right-handed.
   *
   * This is the winding bug's twin, and it is even better hidden. A
   * left-handed frame puts the object in the right place, pointing the right
   * way, at the right size — and mirrors it, which swaps the front and back of
   * every triangle in it. Under back-face culling the object then draws its own
   * far side. For an eyeball sitting in a socket that means it draws the half
   * inside the skull, so the eye simply is not there, and every measurement of
   * where it should be says it is fine.
   */
  {
    const m = math.mat4();
    const dirs = [
      [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0],
      [0.3, 0.2, 0.9], [-0.5, -0.4, 0.76], [0.1, 0.99, 0.05],
    ];
    for (const [x, y, z] of dirs) {
      math.aimedBasis(m, x, y, z, 1, 2, 3, 0.115);
      const det = math.basisDeterminant(m);
      check(det > 0, `aiming at (${x}, ${y}, ${z}) gives a right-handed frame (det ${det.toExponential(2)})`);
      /* And it really does point that way, at that place, at that size. */
      const l = Math.hypot(x, y, z);
      near(m[8] / 0.115, x / l, 1e-6, 'the forward axis is the direction asked for');
      near(m[12], 1, 1e-9, 'and the translation is where it was put');
      near(Math.hypot(m[0], m[1], m[2]), 0.115, 1e-6, 'and the scale is uniform');
    }
    /* Straight up, where the horizontal cross product collapses, must still
     * produce a usable frame rather than NaNs across the whole draw. */
    math.aimedBasis(m, 0, 1, 0, 0, 0, 0, 1);
    check(m.every(Number.isFinite) && math.basisDeterminant(m) > 0,
      'aiming straight up does not degenerate');
  }

  /* ========================================================== winding == */

  /*
   * Every closed mesh must be wound outwards.
   *
   * This is the check that found the worst bug in the project. Back-face
   * culling is on, so a mesh wound the wrong way does not vanish and does not
   * flicker — it renders as a smooth, solid, plausible object, because what is
   * on screen is the inside of its far wall with the near wall culled. On a
   * head that is devastating and almost invisible: the silhouette is still a
   * head, the eyeballs are separate meshes and still sit in front of it, the
   * skin texture still maps onto something. The face simply has no features,
   * and no makeup ever appears on it, because the surface being looked at is
   * the back of the skull seen from inside.
   *
   * The signed volume of a closed triangle mesh is positive exactly when its
   * triangles face outwards, which turns all of that into one number.
   */
  {
    const signedVolume = (m) => {
      const p = m.positions, idx = m.indices;
      let v = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
          - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
          + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
      }
      return v;
    };
    /* Built without recomputing normals, so the primitive's own idea of which
     * way it faces is what gets tested. */
    const solo = (fn) => {
      const b = new mesh.MeshBuilder();
      fn(b);
      return b.build();
    };
    const r = rng.makeRng(2024);
    const P = head.faceParams(r);
    const closed = {
      head: head.buildHead(P).mesh,
      eyeball: head.buildEyeball(0.1),
      'upper lid': head.buildLid(0.1, 1, false),
      'lower lid': head.buildLid(0.1, 1, true),
      hair: body.buildHair(P, 'bob', rng.makeRng(1)),
      neck: body.buildNeck(P),
      garment: body.buildGarment(P, 0),
      ears: body.buildEars(P),
      hands: body.buildHands(P),
      sphere: solo((b) => mesh.sphere(b, 0, 0, 0, 1, [24, 16])),
      box: solo((b) => mesh.box(b, 0, 0, 0, 1, 1, 1)),
      lathe: solo((b) => mesh.lathe(b, [[0.5, 0], [0.6, 0.4], [0.3, 1]], 20, 0, 0, 0, {})),
      cylinder: solo((b) => mesh.cylinder(b, 0, 0, 0, 0.5, 1, 20, {})),
      'rounded slab': solo((b) => mesh.roundedSlab(b, 0, 0, 0, 1, 0.2, 0.6, 0.05)),
      torus: solo((b) => mesh.torus(b, 0, 0, 0, 1, 0.2)),
    };
    for (const [name, m] of Object.entries(closed)) {
      check(signedVolume(m) > 0, `"${name}" is wound outwards, not inside out`);
    }

    /*
     * And the normals a primitive writes for itself have to agree with the way
     * it wound its triangles. Half the primitives here set their normals by
     * hand from the maths that generated the surface; if one of those is
     * flipped relative to its winding, the mesh lights as though it were inside
     * out while still being visible, which is a subtler version of the same
     * bug and just as hard to see on a curved surface.
     */
    for (const [name, m] of Object.entries(closed)) {
      const p = m.positions, idx = m.indices;
      let agree = 0, total = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
        const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
        const gx = e1[1] * e2[2] - e1[2] * e2[1];
        const gy = e1[2] * e2[0] - e1[0] * e2[2];
        const gz = e1[0] * e2[1] - e1[1] * e2[0];
        if (Math.hypot(gx, gy, gz) < 1e-12) continue;      /* degenerate at a pole */
        let nx = 0, ny = 0, nz = 0;
        for (const v of [a, b, c]) {
          nx += m.vertices[v * 9 + 3];
          ny += m.vertices[v * 9 + 4];
          nz += m.vertices[v * 9 + 5];
        }
        total++;
        if (gx * nx + gy * ny + gz * nz > 0) agree++;
      }
      check(agree / total > 0.95,
        `"${name}" writes normals that agree with its winding (${(agree / total * 100).toFixed(0)}%)`);
    }
  }

  /* ============================================================= head == */

  {
    const r = rng.makeRng(4242);
    const P = head.faceParams(r);
    const { mesh, morph } = head.buildHead(P);

    check(mesh.positions.every(Number.isFinite), 'every head vertex is a number');
    check(morph.every(Number.isFinite), 'every morph delta is a number');
    check(mesh.triangles > 20000, `the head has enough geometry (${mesh.triangles} triangles)`);

    /* Proportions, in head half-heights. A head 1.4 times as wide as it is tall
     * means a warp or a taper has gone the wrong way. */
    const w = mesh.max[0] - mesh.min[0];
    const h = mesh.max[1] - mesh.min[1];
    const d = mesh.max[2] - mesh.min[2];
    check(w / h > 0.55 && w / h < 0.95, `head width over height is plausible (${(w / h).toFixed(2)})`);
    check(d / h > 0.65 && d / h < 1.15, `head depth over height is plausible (${(d / h).toFixed(2)})`);

    /* The features actually stick out. Without this the shape function can be
     * silently zeroed and the audit would still pass on "it is an ellipsoid". */
    const at = (s, t) => head.evalSurface(P, s, t, head.NEUTRAL_EXPR, []);
    const noseTip = at(0.5, face.F.noseTipT);
    const cheek = at(0.5 + face.F.cheekS, face.F.noseTipT);
    check(noseTip[2] > cheek[2] + 0.06, 'the nose projects in front of the cheeks');

    /*
     * The nose has to be a nose, not a spike. Comparing the tip against the
     * cheek passes even when the nose is 4mm wide, because most of that
     * difference is the curvature of the head — so this measures the tip
     * against the face immediately beside it, and in millimetres, which is the
     * unit the mistake was made in. It was: the first nose was invisible on the
     * rendered head and every check still passed.
     */
    const beside = at(0.5 + 0.12, face.F.noseTipT);
    const projectionMm = (noseTip[2] - beside[2]) * 115;
    check(projectionMm > 7 && projectionMm < 26,
      `the nose stands off its own flank by a human amount (${projectionMm.toFixed(1)}mm)`);
    /* And it is as wide as one: measure where the bridge has fallen to half. */
    const widthAt = (frac) => {
      let lo = 0, hi = 0.35;
      const peak = noseTip[2] - beside[2];
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const h = at(0.5 + mid, face.F.noseTipT)[2] - beside[2];
        if (h > peak * frac) lo = mid; else hi = mid;
      }
      return (at(0.5 + lo, face.F.noseTipT)[0]) * 2 * 115;
    };
    const noseWidthMm = widthAt(0.5);
    check(noseWidthMm > 14 && noseWidthMm < 44,
      `and it is a nose's width across (${noseWidthMm.toFixed(1)}mm)`);
    const lip = at(0.5, face.F.mouthT - 0.02);
    const chin = at(0.5, face.F.chinT);
    check(lip[2] > chin[2], 'the lips are in front of the chin');
    const socket = at(0.5 + face.F.eyeS, face.F.eyeT);
    const brow = at(0.5 + face.F.eyeS, face.F.browT);
    check(brow[2] > socket[2], 'the brow ridge overhangs the eye socket');

    /* Left and right are mirror images. */
    for (const t of [0.3, 0.42, 0.58, 0.72]) {
      const l = at(0.5 - 0.18, t), rr = at(0.5 + 0.18, t);
      near(l[0], -rr[0], 1e-6, `the face is symmetrical at t=${t} (x)`);
      near(l[1], rr[1], 1e-6, `the face is symmetrical at t=${t} (y)`);
      near(l[2], rr[2], 1e-6, `the face is symmetrical at t=${t} (z)`);
    }

    /* Expressions move the face and do not tear it. */
    const smiling = head.evalSurface(P, 0.5 + face.F.lipHalfS * 0.9, face.F.mouthT,
      { smile: 1, concern: 0, squint: 0 }, []);
    const neutral = at(0.5 + face.F.lipHalfS * 0.9, face.F.mouthT);
    check(smiling[1] > neutral[1] + 0.005, 'a smile lifts the corner of the mouth');
    let maxDelta = 0;
    for (let i = 0; i < morph.length; i += 12) {
      maxDelta = Math.max(maxDelta, Math.abs(morph[i]), Math.abs(morph[i + 1]));
    }
    check(maxDelta > 0.004 && maxDelta < 0.15,
      `the smile morph is a movement, not a explosion (${maxDelta.toFixed(3)})`);

    /*
     * You have to be able to see the eyes.
     *
     * Both ways of getting this wrong look bad and only one of them is obvious.
     * Too far forward and the eyeball floats on the face like a bubble; too far
     * back and it vanishes behind the socket, leaving two dark holes on an
     * otherwise finished head — which is what happened here, and what a check
     * on the raw inset distance failed to catch because the number that matters
     * is the inset *relative to how deep the socket is*.
     *
     * So this asks the question directly: fire a ray at the eye from where the
     * player sits and see what it hits first.
     */
    const headMesh = head.buildHead(P).mesh;
    for (const side of [-1, 1]) {
      const anchor = head.eyeAnchor(P, side);
      const ray = {
        ox: anchor.centre[0], oy: anchor.centre[1], oz: 4,
        dx: 0, dy: 0, dz: -1,
      };
      const hit = {};
      const hitHead = math.rayMesh(ray, headMesh, hit);
      check(hitHead, 'a ray at the eye hits the head at all');
      /* Sphere intersection, analytically: the ray runs down -Z through the
       * eye's own centre line, so it enters at z = centre.z + r. */
      const tEye = 4 - (anchor.centre[2] + anchor.r);
      check(tEye < hit.t,
        `the eyeball is in front of the socket and visible (eye at ${tEye.toFixed(3)}, face at ${hit.t.toFixed(3)})`);
      /*
       * Being in front of the socket floor is not the same as bulging off the
       * face, because the socket floor is recessed on purpose. The face to
       * measure against is the one without a socket in it, which is a second
       * evaluation with the socket depth turned off.
       */
      const flat = head.evalSurface({ ...P, eyeDeep: 0 },
        0.5 + side * face.F.eyeS, face.F.eyeT, head.NEUTRAL_EXPR, []);
      const socketDepth = (flat[2] - (4 - hit.t)) * 115;
      const proud = (anchor.centre[2] + anchor.r - flat[2]) * 115;
      check(socketDepth > 2 && socketDepth < 14,
        `the socket is a socket (${socketDepth.toFixed(1)}mm deep)`);
      /* A cornea does stand proud of the bone around it — the lids are what
       * cover it — so this is a band, not a ceiling. */
      check(proud > -3 && proud < 6,
        `and the eye sits in it rather than on top of it (${proud.toFixed(1)}mm proud of the face)`);

      /*
       * The visible disc has to be big enough to read as an eye, and — the part
       * that is easy to miss — wide enough that some white shows around the
       * iris. Get that wrong and the geometry is defensible on every other
       * measure while the face has two black holes in it, because the whole
       * exposed cap is iris.
       */
      const centreDepth = flat[2] - anchor.centre[2];
      const capSin = Math.sqrt(Math.max(0, 1 - (centreDepth / anchor.r) ** 2));
      const capMm = capSin * anchor.r * 2 * 115;
      check(capMm > 14, `and shows a disc you can see (${capMm.toFixed(1)}mm across)`);
      /* A ring of white, not a hairline of it: at 1.25x the iris still reads as
       * a hole in the face from playing distance. */
      check(capSin > textures.IRIS_RADIUS * 1.8,
        `with sclera showing around the iris (cap ${capSin.toFixed(2)} vs iris ${textures.IRIS_RADIUS})`);

      /*
       * And the lids have to be out of the way of it. A lid swung back by less
       * than its own reach leaves its rim below the eye's forward axis — across
       * the pupil — and the customer looks half asleep at every camera angle.
       */
      const upperClear = head.LID.upperOpen - head.LID.upperTheta;
      const lowerClear = head.LID.lowerOpen - head.LID.lowerTheta;
      check(upperClear > 0.12,
        `the open upper lid clears the pupil (${(upperClear * 57.3).toFixed(0)} degrees above centre)`);
      check(lowerClear > 0.12,
        `the open lower lid clears the pupil (${(lowerClear * 57.3).toFixed(0)} degrees below centre)`);
      /* But not so far back that the eye has no lids on it at all. */
      const capAngle = Math.asin(Math.min(1, capSin));
      check(upperClear < capAngle && lowerClear < capAngle,
        'and both still overlap the visible eye rather than sitting off it');
    }

    /* Two different faces are actually different. */
    const P2 = head.faceParams(rng.makeRng(99));
    const other = head.evalSurface(P2, 0.5, face.F.chinT, head.NEUTRAL_EXPR, []);
    check(Math.abs(other[1] - chin[1]) + Math.abs(other[2] - chin[2]) > 0.002,
      'two seeds produce two different chins');
  }

  /* ======================================================== catalogue == */

  {
    const { PRODUCTS, CATEGORIES, FINISH_HE, FAMILY_HE } = products;
    const ids = new Set();
    const shadeIds = new Set();
    for (const p of PRODUCTS) {
      check(!ids.has(p.id), `product id "${p.id}" is unique`);
      ids.add(p.id);
      check(!!CATEGORIES[p.cat], `product "${p.id}" has a known category`);
      check(!!FINISH_HE[p.finish], `product "${p.id}" has a named finish`);
      check(p.shades.length > 0, `product "${p.id}" has at least one shade`);
      check(p.price >= 0, `product "${p.id}" has a price`);
      for (const s of p.shades) {
        check(!shadeIds.has(s.id), `shade id "${s.id}" is unique`);
        shadeIds.add(s.id);
        /* hexToRgb throws on a malformed colour, which is what we want: a typo
         * in the catalogue should stop the build, not ship a black lipstick. */
        const c = color.hexToRgb(s.hex);
        check(c.every((v) => v >= 0 && v <= 1), `shade "${s.id}" is a real colour`);
        check(!!FAMILY_HE[s.family], `shade "${s.id}" is in a named colour family`);
      }
    }

    /* The complexion ramp must cover every skin tone a customer can have,
     * closely enough that a careful player can find a match. Without this the
     * shade mechanic is unwinnable for whoever is at the ends of the range. */
    const people = await load('data/people.js');
    for (const tone of people.SKIN_TONES) {
      /* The undertone written next to a skin tone has to be the undertone that
       * colour actually has, or the game tells the player one thing and scores
       * them on another. */
      check(color.undertone(color.hexToRgb(tone.hex)) === tone.tone,
        `"${tone.he}" is labelled with the undertone it has`);
      const skin = color.hexToRgb(tone.hex);
      let best = Infinity;
      for (const p of PRODUCTS) {
        if (p.cat !== 'foundation') continue;
        for (const s of p.shades) best = Math.min(best, color.deltaE(color.hexToRgb(s.hex), skin));
      }
      check(best < 6.5, `a foundation exists for "${tone.he}" (best ΔE ${best.toFixed(1)})`);
    }

    /* And a wrong shade must be findably wrong: if every shade were within the
     * "perfect" threshold there would be nothing to get right. */
    const fm = products.product('found-matte').shades;
    check(color.deltaE(color.hexToRgb(fm[0].hex), color.hexToRgb(fm[fm.length - 1].hex)) > 40,
      'the foundation range spans a real distance');

    check(products.zoneOf(products.product('lip-matte')) === 'lip', 'a lipstick goes on the lips');
    check(products.zoneOf(products.product('mascara')) === 'lash', 'mascara goes on the lashes');
    check(products.zoneOf(products.product('blush-powder')) === 'cheek', 'blusher goes on the cheeks');
    check(products.product('wipe').erase === true, 'the remover erases');
  }

  /* ============================================================ looks == */

  {
    for (const l of looks.LOOKS) {
      check(l.wants.length >= 3, `look "${l.id}" asks for enough to be a look`);
      check(l.pay > 0, `look "${l.id}" pays`);
      for (const w of l.wants) {
        const stock = products.byCategory(w.cat);
        check(stock.length > 0, `look "${l.id}" wants ${w.cat}, and the shop stocks it`);
        if (w.finish) {
          const ok = stock.some((p) => [].concat(w.finish).includes(p.finish));
          check(ok, `look "${l.id}" can be filled with a ${[].concat(w.finish).join('/')} ${w.cat}`);
        }
        if (w.family) {
          const ok = stock.some((p) => p.shades.some((s) => [].concat(w.family).includes(s.family)));
          check(ok, `look "${l.id}" can be filled with a ${[].concat(w.family).join('/')} ${w.cat}`);
        }
        /* A want that also appears on the avoid list with the same finish is
         * an unwinnable request. */
        const contradiction = l.avoid.some((a) => a.cat === w.cat && !a.coverage
          && (!a.finish || (w.finish && [].concat(w.finish).length === 1 && w.finish[0] === a.finish))
          && !a.family);
        check(!contradiction, `look "${l.id}" does not both want and forbid ${w.cat}`);
      }
    }
    const covered = new Set(looks.requestedCategories());
    check(covered.has('lipstick') && covered.has('foundation'),
      'the looks between them exercise the two categories the game is about');
  }

  /* ======================================================== customers == */

  {
    const a = customerMod.generateCustomer(12345, { day: 3 });
    const b = customerMod.generateCustomer(12345, { day: 3 });
    check(a.name === b.name && a.lookId === b.lookId && a.tone.hex === b.tone.hex,
      'a customer is a pure function of her seed');
    check(a.face.jaw === b.face.jaw, 'so is her face');

    /* The preference must be reachable: it has to name a category she asked
     * for, or the player is guessing. */
    let reachable = 0;
    for (let i = 0; i < 200; i++) {
      const c = customerMod.generateCustomer(9000 + i, { day: 5 });
      if (c.look.wants.some((w) => w.cat === c.prefs.cat)) reachable++;
      check(c.patience > 20, `customer ${i} has a workable amount of patience`);
    }
    check(reachable === 200, 'every customer prefers something she actually asked for');

    /* Difficulty ramps. Day one must not hand out a bride. */
    let day1Max = 0, day9Max = 0;
    for (let i = 0; i < 120; i++) {
      day1Max = Math.max(day1Max, customerMod.generateCustomer(500 + i, { day: 1 }).look.difficulty);
      day9Max = Math.max(day9Max, customerMod.generateCustomer(500 + i, { day: 9 }).look.difficulty);
    }
    check(day1Max <= 2, `day one stays easy (hardest ${day1Max})`);
    check(day9Max >= 4, `later days get hard (hardest ${day9Max})`);

    /* Arrival makeup: some, not all. */
    let bare = 0;
    for (let i = 0; i < 200; i++) {
      if (customerMod.generateCustomer(7000 + i, { day: 4 }).arrival.length === 0) bare++;
    }
    check(bare > 40 && bare < 160, `some customers arrive bare and some do not (${bare}/200)`);

    /* Affinity does what its name says. */
    const c = customerMod.generateCustomer(31337, { day: 4 });
    const wanted = c.look.wants.find((w) => w.cat === 'lipstick');
    if (wanted) {
      const good = products.byCategory('lipstick')
        .find((p) => !wanted.finish || [].concat(wanted.finish).includes(p.finish));
      const bad = products.byCategory('lipstick')
        .find((p) => wanted.finish && !([].concat(wanted.finish).includes(p.finish)));
      if (good && bad) {
        const gi = { product: good, shade: good.shades[0] };
        const bi = { product: bad, shade: bad.shades[0] };
        check(customerMod.affinity(c, gi) > customerMod.affinity(c, bi),
          'she prefers the finish she asked for');
      }
    }
    const matched = customerMod.closestShade(products.product('found-matte').shades, c.skin);
    const others = products.product('found-matte').shades.filter((s) => s.id !== matched.id);
    const mi = { product: products.product('found-matte'), shade: matched };
    const wi = { product: products.product('found-matte'), shade: others[others.length - 1] };
    check(customerMod.affinity(c, mi) > customerMod.affinity(c, wi),
      'she prefers the base that matches her skin');
  }

  /* ============================================================ paint == */

  {
    const gl = stubGl();
    const masks = face.buildMasks(256);
    const paint = new paintMod.PaintLayer(gl, null, 512, masks);
    const lipstick = products.productShade('lip-matte', 'lm-red');

    const zoneCoverage = (p, z) => p.stats()[z].coverage;
    check(zoneCoverage(paint, 'lip') < 0.001, 'a fresh face has nothing on it');

    /* One dab in the middle of the mouth. */
    paint.splat(0.5, face.F.mouthT, lipstick, 1);
    check(zoneCoverage(paint, 'lip') > 0.02, 'a dab of lipstick lands on the lips');
    check(zoneCoverage(paint, 'cheek') < 0.005, 'and not on the cheeks');
    check(zoneCoverage(paint, 'lid') < 0.005, 'and not on the eyelids');

    /* Layering builds. Two passes must reach further than one, and neither may
     * exceed full coverage. */
    const after1 = zoneCoverage(paint, 'lip');
    paint.splat(0.5, face.F.mouthT, lipstick, 1);
    const after2 = zoneCoverage(paint, 'lip');
    check(after2 > after1, 'a second pass builds on the first');
    for (let i = 0; i < 30; i++) paint.splat(0.5, face.F.mouthT, lipstick, 1);
    check(zoneCoverage(paint, 'lip') <= 1.0001, 'coverage never exceeds one');

    /* The colour that comes back out is the colour that went on. */
    const stats = paint.stats();
    const measured = color.hexToRgb(stats.lip.hex);
    check(color.deltaE(measured, color.hexToRgb('#b81f2b')) < 12,
      `the lips measure as the shade applied (ΔE ${color.deltaE(measured, color.hexToRgb('#b81f2b')).toFixed(1)})`);
    check(stats.lip.gloss < 0.2, 'a matte lipstick reads as matte');

    /* A gloss over it changes the finish without repainting the colour — the
     * behaviour the separate fx buffer exists for. */
    const gloss = products.productShade('gloss', 'gl-clear');
    const beforeHex = stats.lip.hex;
    for (let i = 0; i < 8; i++) paint.splat(0.5, face.F.mouthT, gloss, 1);
    const after = paint.stats().lip;
    check(after.gloss > 0.5, 'a clear gloss makes the lips shine');
    check(color.deltaE(color.hexToRgb(after.hex), color.hexToRgb(beforeHex)) < 14,
      'and does not wash the colour out');

    /* The remover takes both away. This is the check that caught a wipe which
     * cleared the colour and left the shine behind. */
    const wipe = products.productShade('wipe', 'wipe');
    for (let i = 0; i < 40; i++) paint.splat(0.5, face.F.mouthT, wipe, 1);
    const wiped = paint.stats().lip;
    check(wiped.coverage < 0.06, `the remover clears the colour (${wiped.coverage.toFixed(3)})`);
    check(wiped.gloss < 0.12, 'and the shine with it');

    /* Nothing may be painted where there is no face. */
    const clean = new paintMod.PaintLayer(gl, null, 512, masks);
    const total = clean.splat(0.02, 0.02, lipstick, 1);
    check(total === 0, 'the brush cannot paint the back of the head');

    /* Assist. At full assist a stroke aimed off the lips leaves nothing behind;
     * at zero it makes a mess, which is what the setting is for. */
    const strict = new paintMod.PaintLayer(gl, null, 512, masks);
    strict.assist = 1;
    strict.splat(0.5, face.F.chinT, lipstick, 1);
    const loose = new paintMod.PaintLayer(gl, null, 512, masks);
    loose.assist = 0;
    loose.splat(0.5, face.F.chinT, lipstick, 1);
    const strictLedger = [...strict.ledger.values()][0];
    const looseLedger = [...loose.ledger.values()][0];
    check(!strictLedger || strictLedger.amount < 0.5,
      'full assist keeps lipstick off the chin');
    check(looseLedger && looseLedger.amount > 0.5, 'no assist lets it land there');
    check(looseLedger.offZone > 0, 'and records it as mess');

    /* Arrival makeup goes through the same brush and is not billed. */
    const arriving = customerMod.generateCustomer(24680, { day: 5 });
    const p2 = new paintMod.PaintLayer(gl, null, 512, masks);
    customerMod.applyArrival(p2, arriving);
    check(p2.applied().length === 0, 'nothing the customer arrived in is charged for');
    if (arriving.arrival.length) {
      check(p2.ledger.size > 0, 'but it is on her face');
    }
  }

  /* ========================================================== scoring == */

  {
    const gl = stubGl();
    const masks = face.buildMasks(256);
    const c = customerMod.generateCustomer(555001, { day: 6 });

    /* Fill everything the look asks for, choosing correctly each time. */
    const fill = (paint, correct) => {
      for (const want of c.look.wants) {
        const stock = products.byCategory(want.cat);
        let p = stock[0];
        if (want.finish) {
          const match = stock.find((x) => [].concat(want.finish).includes(x.finish));
          const miss = stock.find((x) => ![].concat(want.finish).includes(x.finish));
          p = correct ? (match || p) : (miss || match || p);
        }
        let s = p.shades[0];
        if (want.family) {
          const match = p.shades.find((x) => [].concat(want.family).includes(x.family));
          const miss = p.shades.find((x) => ![].concat(want.family).includes(x.family));
          s = correct ? (match || s) : (miss || s);
        }
        if (p.cat === 'foundation') {
          s = correct ? customerMod.closestShade(p.shades, c.skin)
            : p.shades[(p.shades.length - 1) - p.shades.indexOf(customerMod.closestShade(p.shades, c.skin))];
        }
        customerMod.fillZone(paint, { product: p, shade: s }, want.coverage + 0.15, null);
      }
    };

    const good = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(good, true);
    const goodScore = scoring.scoreCustomer(c, good);

    const bad = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(bad, false);
    const badScore = scoring.scoreCustomer(c, bad);

    const empty = new paintMod.PaintLayer(gl, null, 512, masks);
    const emptyScore = scoring.scoreCustomer(c, empty);

    check(goodScore.score > badScore.score,
      `doing what she asked beats doing the wrong thing (${goodScore.score} vs ${badScore.score})`);
    check(badScore.score > emptyScore.score,
      `doing something beats doing nothing (${badScore.score} vs ${emptyScore.score})`);
    check(emptyScore.score < 20, `a bare face scores badly (${emptyScore.score})`);
    check(goodScore.score >= 70, `a careful job scores well (${goodScore.score})`);
    check(goodScore.stars >= 3 && emptyScore.stars <= 1, 'the stars agree with the score');
    check(goodScore.parts.length === c.look.wants.length,
      'the breakdown explains every line of the request');
    check(emptyScore.parts.every((p) => p.note === 'לא הושם בכלל'),
      'and says plainly what was missing');

    /* Adding something she asked not to have must cost. */
    const violating = new paintMod.PaintLayer(gl, null, 512, masks);
    fill(violating, true);
    const ban = c.look.avoid[0];
    if (ban) {
      const stock = products.byCategory(ban.cat);
      const p = stock.find((x) => !ban.finish || x.finish === ban.finish) || stock[0];
      const s = ban.family
        ? (p.shades.find((x) => [].concat(ban.family).includes(x.family)) || p.shades[0])
        : p.shades[0];
      customerMod.fillZone(violating, { product: p, shade: s }, 0.9, null);
      const violated = scoring.scoreCustomer(c, violating);
      check(violated.violations.length > 0, 'the scoring notices what she asked not to have');
      check(violated.score < goodScore.score,
        `and it costs her opinion (${violated.score} vs ${goodScore.score})`);
    }

    /* The till: better work pays more, and reading her right pays more again. */
    const noMark = scoring.till(c, goodScore, null);
    const rightMark = scoring.till(c, goodScore, { bonus: 1 });
    const badTill = scoring.till(c, badScore, null);
    check(noMark.service > badTill.service, 'a better result earns a bigger service fee');
    check(rightMark.tip > noMark.tip, 'reading the customer right earns a bigger tip');
    check(noMark.take === noMark.products + noMark.service + noMark.tip,
      'the total adds up');
    check(noMark.lines.length > 0, 'the receipt lists what was used');

    /* The preference card. */
    const marking = scoring.scoreMarking(c, good, null, null);
    if (marking.favourite) {
      const right = scoring.scoreMarking(c, good, marking.favourite.key, c.prefs.finish);
      check(right.itemRight, 'marking her actual favourite is marked correct');
      check(right.bonus > marking.bonus, 'and is worth more than marking nothing');
      const wrong = scoring.scoreMarking(c, good, 'not-a-real-key', 'not-a-finish');
      check(!wrong.itemRight && !wrong.finishRight, 'a wrong mark is marked wrong');
    }
  }

  /* ============================================================ shift == */

  {
    const s = new shiftMod.Shift({ saveSeed: 7, day: 1 });
    check(s.customersToday >= 3, 'a day has customers in it');
    check(s.target > 0, 'a day has a target');

    const first = s.next();
    const again = new shiftMod.Shift({ saveSeed: 7, day: 1 }).next();
    check(first.seed === again.seed, 'the same save gives the same queue');

    /* Nobody can return before anybody has been served. */
    check(!first.returning, 'the first customer of a save is not a regular');

    let guard = 0;
    while (!s.done && guard++ < 20) {
      s.next();
      s.complete({ stars: 4, score: 80, applied: [] }, { itemRight: true, favourite: { key: 'k' } },
        { take: 300, lines: [], products: 0, service: 0, tip: 0, total: 0 });
    }
    check(s.done, 'a day ends');
    check(s.money > 0, 'and the money went in the till');
    const summary = s.endDay();
    check(summary.day === 1 && s.day === 2, 'the next day starts');
    check(s.index === 0, 'with a fresh queue');

    /* Now that somebody has been served and marked right, regulars can come
     * back — and only ones actually served. */
    let seenReturning = false;
    for (let i = 0; i < 40 && !seenReturning; i++) {
      const t = new shiftMod.Shift(s.toSave());
      t.day = 4 + i;
      const c = t.next();
      if (c.returning) {
        seenReturning = true;
        check(s.served.some((r) => r.seed === c.seed), 'a returning customer is somebody real');
      }
    }
    check(seenReturning, 'regulars do come back once there are any');

    /* A save round-trips. */
    const saved = JSON.parse(JSON.stringify(s.toSave()));
    const restored = new shiftMod.Shift(saved);
    check(restored.day === s.day && restored.money === s.money,
      'a save reloads to the same shift');
    check(restored.served.length <= 50, 'the save does not grow without bound');
  }

  /* ============================================================= shop == */

  {
    const groups = props.buildShop(rng.makeRng('audit-shop'));
    check(groups.length > 8, 'the shop is built out of several materials');
    let tris = 0;
    for (const g of groups) {
      check(g.mesh.positions.every(Number.isFinite), `"${g.name}" has real geometry`);
      tris += g.mesh.triangles;
    }
    check(tris > 5000, `the shop has enough geometry to look like one (${tris} triangles)`);
    check(props.SHOP.counterTopY > 0.8 && props.SHOP.counterTopY < 1.2,
      'the counter is at counter height');
    check(props.SHOP.customerHeadY > props.SHOP.counterTopY,
      'the customer is above the counter, not inside it');

    const tray = props.buildTray([
      products.product('lip-matte'), products.product('powder'),
    ]);
    check(tray.length === 2, 'the tray holds what was put on it');
    check(tray.every((t) => t.mesh.triangles > 0), 'and each item is a real object');
  }

  /* ============================================================ report == */

  if (process.argv.includes('--verbose')) for (const n of notes) console.log(n);
  console.log(`\n${checks} checks, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error('FAIL: ' + f);
    process.exit(1);
  }
  console.log('makeup audit passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
