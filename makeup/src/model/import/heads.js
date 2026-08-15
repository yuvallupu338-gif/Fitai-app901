/*
 * heads.js — a downloaded head, packed for the game and unpacked at boot.
 *
 * The expensive half of importing — parsing a file format, fitting twenty
 * marks, inverting a sphere for forty thousand vertices — happens once, in the
 * marking tool, and never again. What ships is the result: positions already in
 * head space, texture coordinates already in face space, and the indices
 * between them. Loading one is three typed-array views and a normal pass.
 *
 * Packed rather than written out as numbers, because the numbers are the whole
 * file. A forty-thousand-vertex head is about nine hundred kilobytes of binary
 * and four megabytes of JSON, and the game is a single HTML file somebody keeps
 * on a phone.
 *
 * The quantisation is chosen to be invisible rather than "good enough":
 * positions are sixteen bits over a four-unit range, which is fourteen microns
 * on a face, and texture coordinates are sixteen bits over two and a half,
 * which is a fortieth of a texel of the paint layer.
 */

import { HEADS as BUILT_IN } from '../../data/heads/index.js';
import { F } from '../face.js';

/* Face space's own answer to "where is an eye", which the lashes and the lid
 * meshes are built around and which does not change with the model. */
const LEFT_EYE_S = F.eyeS;

const POS_RANGE = 2.0;      /* head half-heights; a head fits inside 1.4 */
const UV_MIN = -0.5;        /* the seam carries s past 1, and the fit past 0 */
const UV_RANGE = 2.5;

/* ------------------------------------------------------------------ *
 * Base64, for arrays too large to spread
 * ------------------------------------------------------------------ */

function toBase64(bytes) {
  let s = '';
  /* In chunks: `String.fromCharCode(...bytes)` on a megabyte overflows the
   * argument list and throws, which is a fun one to debug at four in the
   * morning because it only happens on the big models. */
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(text) {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ *
 * Packing
 * ------------------------------------------------------------------ */

/*
 * An unwrapped head, as the three arrays a module will carry.
 *
 * Everything else the game needs about the head — where its eyes are, what to
 * frame a close-up on — is computed here too, from the marks rather than from
 * the generated shape function, because there is no shape function any more.
 */
export function packHead(unwrapped, meta = {}) {
  const { mesh, marked, pose } = unwrapped;
  const count = mesh.positions.length / 3;
  const V = mesh.vertices;

  const pos = new Int16Array(count * 3);
  const uv = new Uint16Array(count * 2);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = Math.round(clampTo(mesh.positions[i * 3 + k] / POS_RANGE, -1, 1) * 32767);
    }
    uv[i * 2] = Math.round(clampTo((V[i * 9 + 6] - UV_MIN) / UV_RANGE, 0, 1) * 65535);
    uv[i * 2 + 1] = Math.round(clampTo((V[i * 9 + 7] - UV_MIN) / UV_RANGE, 0, 1) * 65535);
  }

  /*
   * The eyes, from the marks and from the surface they were clicked on.
   *
   * A generated head hangs its eyeballs off its own shape function; an imported
   * one has no shape function, so the pupil somebody clicked is the best
   * statement of where the eye is that exists — and the mesh around that click
   * is the best statement of which way the socket faces. The lids hinge on that
   * normal, so getting it from the geometry rather than assuming straight ahead
   * is what stops them cutting across the eye on a head that is not perfectly
   * frontal.
   */
  const eye = (side) => {
    const on = pose.toHead(meta.landmarks[side < 0 ? 'eyeL' : 'eyeR']);
    const outer = pose.toHead(meta.landmarks[side < 0 ? 'eyeOuterL' : 'eyeOuterR']);
    const half = Math.hypot(on[0] - outer[0], on[1] - outer[1], on[2] - outer[2]);

    /* Average the normals within half an eye-width of the click, which is wide
     * enough that a single badly-shaded vertex cannot decide it and narrow
     * enough to still be the socket rather than the cheek. */
    let nx = 0, ny = 0, nz = 0;
    const r2 = (half * 0.5) ** 2;
    for (let i = 0; i < count; i++) {
      const dx = mesh.positions[i * 3] - on[0];
      const dy = mesh.positions[i * 3 + 1] - on[1];
      const dz = mesh.positions[i * 3 + 2] - on[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      nx += V[i * 9 + 3]; ny += V[i * 9 + 4]; nz += V[i * 9 + 5];
    }
    const l = Math.hypot(nx, ny, nz);
    const normal = l > 1e-6 ? [nx / l, ny / l, nz / l] : [side * 0.18, 0, 0.98];
    return { on, half, normal };
  };
  const eL = eye(-1), eR = eye(1);
  /* A human eyeball is about 24mm across — 0.10 in head units — and the
   * generated head uses 0.092 for an average eye whose outer corner is
   * `REFERENCE_HALF` from its pupil. Scaling by the marked half-width is what
   * keeps a model with large stylised eyes from getting two marbles in it. */
  const REFERENCE_HALF = 0.128;
  const radius = 0.092 * clampTo(((eL.half + eR.half) / 2) / REFERENCE_HALF, 0.6, 1.7);
  /* Sunk a hair below the surface, the same fraction of the radius the
   * generated head uses: enough that the sliver of sclera sits flush with the
   * lid edge, not so much that the eye disappears into a dark hole. */
  const sink = (e) => [
    e.on[0] - e.normal[0] * radius * 0.02,
    e.on[1] - e.normal[1] * radius * 0.02,
    e.on[2] - e.normal[2] * radius * 0.02,
  ];

  const mouth = pose.toHead(meta.landmarks.mouthL);
  const mouthR = pose.toHead(meta.landmarks.mouthR);

  return {
    id: meta.id,
    name: meta.name,
    credit: meta.credit || '',
    provides: meta.provides || [],
    landmarks: meta.landmarks,
    vertexCount: count,
    triangleCount: mesh.triangles,
    eyeRadius: radius,
    eyeL: { centre: sink(eL), normal: eL.normal, r: radius, s: 0.5 - LEFT_EYE_S },
    eyeR: { centre: sink(eR), normal: eR.normal, r: radius, s: 0.5 + LEFT_EYE_S },
    focus: {
      face: [0, -0.25, 0],
      eyes: [0, (eL.on[1] + eR.on[1]) / 2, 0.30],
      lips: [
        (mouth[0] + mouthR[0]) / 2,
        (mouth[1] + mouthR[1]) / 2,
        (mouth[2] + mouthR[2]) / 2,
      ],
    },
    fit: {
      residual: unwrapped.stats.residual,
      flipped: unwrapped.stats.flipped,
      seamSplit: unwrapped.stats.seamSplit,
    },
    pos: toBase64(new Uint8Array(pos.buffer)),
    uv: toBase64(new Uint8Array(uv.buffer)),
    idx: toBase64(new Uint8Array(new Uint32Array(mesh.indices).buffer)),
  };
}

function clampTo(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ------------------------------------------------------------------ *
 * Unpacking
 * ------------------------------------------------------------------ */

/*
 * Back into the shape `buildHead` returns, so nothing downstream can tell the
 * difference between a head the game generated and one somebody downloaded.
 *
 * Normals are recomputed rather than stored. They are the one attribute that
 * costs as much to carry as to derive — three more channels per vertex against
 * one pass over the triangles at boot — and deriving them here means a head
 * cannot arrive with normals that disagree with its own geometry.
 */
export function buildImportedHead(record) {
  const pos16 = new Int16Array(fromBase64(record.pos).buffer);
  const uv16 = new Uint16Array(fromBase64(record.uv).buffer);
  const indices = new Uint32Array(fromBase64(record.idx).buffer);
  const count = record.vertexCount;
  if (pos16.length !== count * 3 || uv16.length !== count * 2) {
    throw new Error(`head "${record.id}": packed arrays do not match its vertex count`);
  }

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (pos16[i] / 32767) * POS_RANGE;

  const n = new Float32Array(count * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }

  /*
   * Weld across the seam, the same way the generated head does.
   *
   * The unwrap duplicates the vertices along the back of the skull so the
   * texture does not stretch across the face, and those twins share a position.
   * Left unwelded they shade as a crease that catches the ring light and reads
   * as a scar; and a vertex all of whose triangles moved to its twin has no
   * normal at all, which is a black seam rather than a bright one.
   */
  const weld = new Map();
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const key = `${pos16[o]},${pos16[o + 1]},${pos16[o + 2]}`;
    const list = weld.get(key);
    if (list) list.push(o); else weld.set(key, [o]);
  }
  for (const list of weld.values()) {
    if (list.length < 2) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const o of list) { nx += n[o]; ny += n[o + 1]; nz += n[o + 2]; }
    for (const o of list) { n[o] = nx; n[o + 1] = ny; n[o + 2] = nz; }
  }

  const vertices = new Float32Array(count * 9);
  /*
   * The separate UV array is not a duplicate for convenience: it is what the
   * brush's ray-cast reads. `rayMesh` interpolates the hit's texture
   * coordinates off `mesh.uvs`, and a mesh without one is a head the pointer
   * throws on the moment it touches it — with the stroke silently abandoned and
   * the coverage numbers still moving, because the arrival makeup is already
   * there. The bounding box next to it is the ray's early-out.
   */
  const uvs = new Float32Array(count * 2);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    vertices[o] = x; vertices[o + 1] = y; vertices[o + 2] = z;
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    vertices[o + 3] = n[i * 3] / l;
    vertices[o + 4] = n[i * 3 + 1] / l;
    vertices[o + 5] = n[i * 3 + 2] / l;
    const s = (uv16[i * 2] / 65535) * UV_RANGE + UV_MIN;
    const t = (uv16[i * 2 + 1] / 65535) * UV_RANGE + UV_MIN;
    vertices[o + 6] = s;
    vertices[o + 7] = t;
    vertices[o + 8] = 1;
    uvs[i * 2] = s;
    uvs[i * 2 + 1] = t;
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
  }

  return {
    mesh: { vertices, indices, positions, uvs, min, max, triangles: indices.length / 3 },
    /* No shape function, so no expressions. Zeroes rather than nothing, so the
     * one vertex shader still draws it. */
    morph: new Float32Array(count * 12),
  };
}

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

const runtime = [];
let headsOn = true;

export function setHeadsEnabled(on) { headsOn = !!on; }

export function listHeads() {
  return [...(headsOn ? BUILT_IN : []), ...runtime];
}

export function hasHeads() { return listHeads().length > 0; }

export function registerHead(record) {
  const at = runtime.findIndex((h) => h.id === record.id);
  if (at >= 0) runtime[at] = record; else runtime.push(record);
  cache.clear();
  return record;
}

/* The same head for the same customer, every time — a shift is replayable from
 * its seed and a face that changed between two runs of it would be the most
 * confusing bug available. */
export function pickHead(rng) {
  const all = listHeads();
  return all.length ? rng.pick(all) : null;
}

/* Unpacked once per session. A head is a megabyte of arrays and a returning
 * customer should not pay for it twice. */
const cache = new Map();

export function loadHead(record) {
  let hit = cache.get(record.id);
  if (!hit) {
    hit = buildImportedHead(record);
    cache.set(record.id, hit);
  }
  return hit;
}

export function forgetHeads() { cache.clear(); }
