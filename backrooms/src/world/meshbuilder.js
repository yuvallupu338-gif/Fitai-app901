/*
 * meshbuilder.js — turning quads into vertex buffers.
 *
 * Everything drawn in this game is quads: floors, ceilings, wall faces, water
 * surfaces, light panels, and the boxes and cylinders that make up the props.
 * So there is exactly one quad routine, and it does the three things that are
 * easy to get subtly wrong and impossible to notice until the lighting looks
 * cheap:
 *
 *   - it derives the tangent frame from the actual UV gradient rather than
 *     from a hand-written table, so normal maps are never mirrored or rotated;
 *   - it subdivides, so per-vertex ambient occlusion has somewhere to live;
 *   - it interpolates AO bilinearly across the subdivision, which is what
 *     gives soft dark corners instead of a hard band at the skirting.
 */

import { VERTEX_FLOATS } from '../core/gl.js';

export class MeshBuilder {
  constructor(estVerts = 8192) {
    this.v = new Float32Array(estVerts * VERTEX_FLOATS);
    this.i = new Uint32Array(estVerts * 2);
    this.vn = 0;   /* vertices written */
    this.in = 0;   /* indices written  */
  }

  _growV(needVerts) {
    const need = (this.vn + needVerts) * VERTEX_FLOATS;
    if (need <= this.v.length) return;
    let cap = this.v.length || VERTEX_FLOATS;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.v);
    this.v = next;
  }

  _growI(needIdx) {
    const need = this.in + needIdx;
    if (need <= this.i.length) return;
    let cap = this.i.length || 16;
    while (cap < need) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.i);
    this.i = next;
  }

  vertex(px, py, pz, nx, ny, nz, u, vv, tx, ty, tz, tw, ao, mat, flick) {
    this._growV(1);
    let o = this.vn * VERTEX_FLOATS;
    const a = this.v;
    a[o++] = px; a[o++] = py; a[o++] = pz;
    a[o++] = nx; a[o++] = ny; a[o++] = nz;
    a[o++] = u;  a[o++] = vv;
    a[o++] = tx; a[o++] = ty; a[o++] = tz; a[o++] = tw;
    a[o++] = ao; a[o++] = mat; a[o++] = flick;
    return this.vn++;
  }

  tri(a, b, c) {
    this._growI(3);
    this.i[this.in++] = a;
    this.i[this.in++] = b;
    this.i[this.in++] = c;
  }

  quadIdx(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }

  get empty() { return this.in === 0; }

  finish() {
    return {
      vertices: this.v.subarray(0, this.vn * VERTEX_FLOATS),
      indices: this.i.subarray(0, this.in),
      vertexCount: this.vn,
    };
  }
}

const AO_FLAT = () => 1;

/*
 * One quad, wound p0→p1→p2→p3 counter-clockwise seen from the front.
 *
 * opts:
 *   sub   subdivisions per axis (1 = plain quad, 2 = 2×2, …)
 *   ao    (s,t) → occlusion in [0,1], sampled at every subdivided vertex
 *   mat   material layer index
 *   flick fixture phase for emissive surfaces, or -1 for "does not flicker"
 */
export function addQuad(mb, p0, p1, p2, p3, uv0, uv1, uv2, uv3, mat, opts = {}) {
  const sub = Math.max(1, opts.sub || 1);
  const ao = opts.ao || AO_FLAT;
  const flick = opts.flick === undefined ? -1 : opts.flick;

  /* Face normal from the winding. */
  const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
  const e2x = p3[0] - p0[0], e2y = p3[1] - p0[1], e2z = p3[2] - p0[2];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  /* Tangent frame from the UV gradient. */
  const du1 = uv1[0] - uv0[0], dv1 = uv1[1] - uv0[1];
  const du2 = uv3[0] - uv0[0], dv2 = uv3[1] - uv0[1];
  const det = du1 * dv2 - du2 * dv1;
  let tx, ty, tz, bx, by, bz;
  if (Math.abs(det) < 1e-9) {
    tx = e1x; ty = e1y; tz = e1z;
    bx = e2x; by = e2y; bz = e2z;
  } else {
    const r = 1 / det;
    tx = (e1x * dv2 - e2x * dv1) * r;
    ty = (e1y * dv2 - e2y * dv1) * r;
    tz = (e1z * dv2 - e2z * dv1) * r;
    bx = (e2x * du1 - e1x * du2) * r;
    by = (e2y * du1 - e1y * du2) * r;
    bz = (e2z * du1 - e1z * du2) * r;
  }
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  /* Handedness: does N×T point along B, or against it? */
  const cx = ny * tz - nz * ty;
  const cy = nz * tx - nx * tz;
  const cz = nx * ty - ny * tx;
  const tw = (cx * bx + cy * by + cz * bz) < 0 ? -1 : 1;

  const base = mb.vn;
  const n1 = sub + 1;
  for (let j = 0; j < n1; j++) {
    const t = j / sub;
    for (let i = 0; i < n1; i++) {
      const s = i / sub;
      /* Bilinear across the quad: p0 + s along the p0→p1 edge, t along p0→p3. */
      const a = (1 - s) * (1 - t), b = s * (1 - t), c = s * t, d = (1 - s) * t;
      const px = p0[0] * a + p1[0] * b + p2[0] * c + p3[0] * d;
      const py = p0[1] * a + p1[1] * b + p2[1] * c + p3[1] * d;
      const pz = p0[2] * a + p1[2] * b + p2[2] * c + p3[2] * d;
      const u  = uv0[0] * a + uv1[0] * b + uv2[0] * c + uv3[0] * d;
      const v  = uv0[1] * a + uv1[1] * b + uv2[1] * c + uv3[1] * d;
      mb.vertex(px, py, pz, nx, ny, nz, u, v, tx, ty, tz, tw, ao(s, t), mat, flick);
    }
  }
  for (let j = 0; j < sub; j++) {
    for (let i = 0; i < sub; i++) {
      const a = base + j * n1 + i;
      mb.quadIdx(a, a + 1, a + n1 + 1, a + n1);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Primitives, for props
 * ------------------------------------------------------------------ */

/* Axis-aligned box, optionally yawed. UVs are in metres so a big crate and a
 * small crate show the same grain size. */
export function addBox(mb, cx, cy, cz, sx, sy, sz, rot, mat, opts = {}) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
  const P = (x, y, z) => [cx + x * cr - z * sr, cy + y, cz + x * sr + z * cr];
  const ao = opts.ao;
  const o = { mat, ao, sub: opts.sub || 1 };

  const A = P(-hx, -hy, -hz), B = P(hx, -hy, -hz), C = P(hx, hy, -hz), D = P(-hx, hy, -hz);
  const E = P(-hx, -hy, hz), F = P(hx, -hy, hz), G = P(hx, hy, hz), H = P(-hx, hy, hz);
  const uvW = [[0, 0], [sx, 0], [sx, sy], [0, sy]];
  const uvD = [[0, 0], [sz, 0], [sz, sy], [0, sy]];
  const uvT = [[0, 0], [sx, 0], [sx, sz], [0, sz]];

  addQuad(mb, F, E, H, G, ...uvW, mat, o);   /* +Z */
  addQuad(mb, A, B, C, D, ...uvW, mat, o);   /* -Z */
  addQuad(mb, B, F, G, C, ...uvD, mat, o);   /* +X */
  addQuad(mb, E, A, D, H, ...uvD, mat, o);   /* -X */
  addQuad(mb, D, C, G, H, ...uvT, mat, o);   /* +Y */
  if (opts.bottom !== false) addQuad(mb, E, F, B, A, ...uvT, mat, o); /* -Y */
}

export function addCylinder(mb, cx, cy, cz, radius, height, segments, mat, opts = {}) {
  const seg = Math.max(3, segments | 0);
  const ao = opts.ao || AO_FLAT;
  const base = mb.vn;
  const circ = 2 * Math.PI * radius;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    const px = cx + nx * radius, pz = cz + nz * radius;
    const u = (i / seg) * circ;
    /* Tangent runs around the circumference; bitangent is straight up. */
    const tx = -nz, tz = nx;
    mb.vertex(px, cy, pz, nx, 0, nz, u, 0, tx, 0, tz, 1, ao(0, 0), mat, -1);
    mb.vertex(px, cy + height, pz, nx, 0, nz, u, height, tx, 0, tz, 1, ao(0, 1), mat, -1);
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2;
    mb.quadIdx(a, a + 2, a + 3, a + 1);
  }
  if (opts.cap !== false) {
    const top = mb.vn;
    const cIdx = mb.vertex(cx, cy + height, cz, 0, 1, 0, 0, 0, 1, 0, 0, 1, ao(0, 1), mat, -1);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      mb.vertex(cx + Math.cos(a) * radius, cy + height, cz + Math.sin(a) * radius,
        0, 1, 0, Math.cos(a) * radius, Math.sin(a) * radius, 1, 0, 0, 1, ao(0, 1), mat, -1);
    }
    for (let i = 0; i < seg; i++) mb.tri(cIdx, top + 1 + i + 1, top + 1 + i);
  }
}

/* Two quads crossed at ninety degrees — the cheapest convincing plant, and
 * with an alpha-cut material it is what a wheat field is made of. */
export function addCross(mb, cx, cy, cz, width, height, rot, mat) {
  const w = width / 2;
  for (let k = 0; k < 2; k++) {
    const a = (rot || 0) + k * Math.PI / 2;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    const p0 = [cx - dx, cy, cz - dz];
    const p1 = [cx + dx, cy, cz + dz];
    const p2 = [cx + dx, cy + height, cz + dz];
    const p3 = [cx - dx, cy + height, cz - dz];
    /* Emitted twice with opposite winding: foliage has no back face and a
     * one-sided blade of grass vanishing as you walk round it is worse than
     * the extra triangles. */
    addQuad(mb, p0, p1, p2, p3, [0, 0], [1, 0], [1, 1], [0, 1], mat, { sub: 1 });
    addQuad(mb, p1, p0, p3, p2, [1, 0], [0, 0], [0, 1], [1, 1], mat, { sub: 1 });
  }
}
