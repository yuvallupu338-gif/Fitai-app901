/*
 * meshbuilder.js — turning quads into vertex buffers.
 *
 * Almost everything in this neighbourhood is a quad: lawns, road, walls,
 * window panes, roof planes, fence pickets, the flat sides of a car. So there
 * is one quad routine, and it does the three things that are easy to get
 * subtly wrong and impossible to notice until the lighting looks cheap:
 *
 *   - it derives the tangent frame from the actual UV gradient rather than
 *     from a hand-written table, so normal maps are never mirrored or rotated;
 *   - it subdivides, so per-vertex ambient occlusion has somewhere to live;
 *   - it interpolates that occlusion bilinearly across the subdivision, which
 *     is what gives a soft dark band where a wall meets a lawn instead of a
 *     hard line at the skirting.
 *
 * The primitives underneath it are the vocabulary the house builder is written
 * in: a box, a tapered limb, a cylinder, a sphere, a crossed billboard, and a
 * gable roof — which is its own routine because a suburb is nothing but gable
 * roofs and getting the rake edge wrong is visible from every window.
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
      triangleCount: this.in / 3,
    };
  }
}

const AO_FLAT = () => 1;

/*
 * One quad, wound p0 to p1 to p2 to p3 counter-clockwise seen from the front.
 *
 * opts:
 *   sub   subdivisions per axis (1 = plain quad, 2 = 2x2, ...)
 *   ao    (s,t) -> occlusion in [0,1], sampled at every subdivided vertex
 *   flick fixture phase for emissive surfaces, or -1 for "does not flicker"
 */
export function addQuad(mb, p0, p1, p2, p3, uv0, uv1, uv2, uv3, mat, opts = {}) {
  const sub = Math.max(1, opts.sub || 1);
  const ao = opts.ao || AO_FLAT;
  const flick = opts.flick === undefined ? -1 : opts.flick;

  const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
  const e2x = p3[0] - p0[0], e2y = p3[1] - p0[1], e2z = p3[2] - p0[2];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

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

/* A flat horizontal patch of ground, subdivided so the AO from nearby walls
 * and hedges has vertices to sit on. UVs are in metres, so the lawn of one
 * house and the lawn of the next show the same blade scale. */
export function addGround(mb, x0, z0, x1, z1, y, mat, opts = {}) {
  const sub = opts.sub || Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 4));
  addQuad(mb,
    [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0],
    [x0, z1], [x1, z1], [x1, z0], [x0, z0], mat,
    { sub, ao: opts.ao, flick: opts.flick });
}

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/*
 * Axis-aligned box, optionally yawed about its own centre. UVs are in metres
 * so a wheelie bin and a garage door show the same grain size.
 *
 * Winding is worth checking with cross(p1-p0, p3-p0) rather than by eye: a
 * box wound the other way draws its own interior under back-face culling and
 * every normal points away from the lights, which on a small dark prop at
 * night is nearly invisible and utterly wrong.
 */
export function addBox(mb, cx, cy, cz, sx, sy, sz, rot, mat, opts = {}) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
  const P = (x, y, z) => [cx + x * cr - z * sr, cy + y, cz + x * sr + z * cr];
  const o = { mat, ao: opts.ao, sub: opts.sub || 1, flick: opts.flick };

  const A = P(-hx, -hy, -hz), B = P(hx, -hy, -hz), C = P(hx, hy, -hz), D = P(-hx, hy, -hz);
  const E = P(-hx, -hy, hz), F = P(hx, -hy, hz), G = P(hx, hy, hz), H = P(-hx, hy, hz);
  const uvW = [[0, 0], [sx, 0], [sx, sy], [0, sy]];
  const uvD = [[0, 0], [sz, 0], [sz, sy], [0, sy]];
  const uvT = [[0, 0], [sx, 0], [sx, sz], [0, sz]];

  if (opts.faces === undefined || opts.faces.zp !== false) addQuad(mb, F, G, H, E, ...uvW, mat, o);
  if (opts.faces === undefined || opts.faces.zn !== false) addQuad(mb, A, D, C, B, ...uvW, mat, o);
  if (opts.faces === undefined || opts.faces.xp !== false) addQuad(mb, B, C, G, F, ...uvD, mat, o);
  if (opts.faces === undefined || opts.faces.xn !== false) addQuad(mb, E, H, D, A, ...uvD, mat, o);
  if (opts.top !== false) addQuad(mb, D, H, G, C, ...uvT, mat, o);
  if (opts.bottom !== false) addQuad(mb, E, A, B, F, ...uvT, mat, o);
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
    const tx = -nz, tz = nx;
    mb.vertex(px, cy, pz, nx, 0, nz, u, 0, tx, 0, tz, 1, ao(0, 0), mat, opts.flick ?? -1);
    mb.vertex(px, cy + height, pz, nx, 0, nz, u, height, tx, 0, tz, 1,
      ao(0, 1), mat, opts.flick ?? -1);
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2;
    mb.quadIdx(a, a + 1, a + 3, a + 2);
  }
  if (opts.cap !== false) {
    const top = mb.vn;
    const cIdx = mb.vertex(cx, cy + height, cz, 0, 1, 0, 0, 0, 1, 0, 0, 1,
      ao(0, 1), mat, opts.flick ?? -1);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      mb.vertex(cx + Math.cos(a) * radius, cy + height, cz + Math.sin(a) * radius,
        0, 1, 0, Math.cos(a) * radius, Math.sin(a) * radius, 1, 0, 0, 1,
        ao(0, 1), mat, opts.flick ?? -1);
    }
    for (let i = 0; i < seg; i++) mb.tri(cIdx, top + 1 + i + 1, top + 1 + i);
  }
}

/*
 * A tapered prism hanging from a joint, built downward from (x, yTop, z) so
 * that rotating the model matrix swings it from the shoulder or the hip rather
 * than around its own middle — the whole difference between a limb and a
 * floating box. Taper matters more than it sounds: a limb of constant
 * thickness reads as a plank, and the eye picks that out of a silhouette in
 * fog long before it can see any surface detail.
 */
export function addLimb(mb, x, yTop, z, top, bot, len, mat, opts = {}) {
  const [tw, td] = top;
  const [bw, bd] = bot;
  const yBot = yTop - len;
  const A = [x - tw, yTop, z - td], B = [x + tw, yTop, z - td];
  const C = [x + tw, yTop, z + td], D = [x - tw, yTop, z + td];
  const E = [x - bw, yBot, z - bd], F = [x + bw, yBot, z - bd];
  const G = [x + bw, yBot, z + bd], H = [x - bw, yBot, z + bd];
  const o = { mat, ao: opts.ao, sub: opts.sub || 1 };
  const uvSide = [[0, 0], [tw * 2, 0], [bw * 2, len], [0, len]];
  const uvEnd = [[0, 0], [td * 2, 0], [bd * 2, len], [0, len]];

  addQuad(mb, G, C, D, H, ...uvSide, mat, o);
  addQuad(mb, E, A, B, F, ...uvSide, mat, o);
  addQuad(mb, F, B, C, G, ...uvEnd, mat, o);
  addQuad(mb, H, D, A, E, ...uvEnd, mat, o);
  addQuad(mb, A, D, C, B, [0, 0], [0, td * 2], [tw * 2, td * 2], [tw * 2, 0], mat, o);
  if (opts.capBottom !== false) {
    addQuad(mb, E, F, G, H, [0, 0], [bw * 2, 0], [bw * 2, bd * 2], [0, bd * 2], mat, o);
  }
}

export function addSphere(mb, cx, cy, cz, radius, segU, segV, mat, opts = {}) {
  const su = Math.max(4, segU | 0), sv = Math.max(3, segV | 0);
  const ao = opts.ao || AO_FLAT;
  const sx = opts.scaleX ?? 1, sy = opts.scaleY ?? 1, sz = opts.scaleZ ?? 1;
  const base = mb.vn;
  for (let j = 0; j <= sv; j++) {
    const v = j / sv;
    const phi = v * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let i = 0; i <= su; i++) {
      const u = i / su;
      const th = u * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const nx = sp * ct, ny = cp, nz = sp * st;
      mb.vertex(
        cx + nx * radius * sx, cy + ny * radius * sy, cz + nz * radius * sz,
        nx, ny, nz,
        u * radius * 3, v * radius * 3,
        -st, 0, ct, 1,
        ao(u, v), mat, opts.flick ?? -1);
    }
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const a = base + j * (su + 1) + i;
      const b = a + su + 1;
      mb.quadIdx(a, a + 1, b + 1, b);
    }
  }
}

/* Two quads crossed at ninety degrees — the cheapest convincing plant, and
 * with an alpha-cut material it is what a hedge and a tree canopy are made of.
 * Emitted with both windings, because foliage has no back face and a bush that
 * vanishes as you walk round it is worse than the extra triangles. */
export function addCross(mb, cx, cy, cz, width, height, rot, mat, opts = {}) {
  const w = width / 2;
  const ao = opts.ao;
  for (let k = 0; k < 2; k++) {
    const a = (rot || 0) + k * Math.PI / 2;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    const p0 = [cx - dx, cy, cz - dz];
    const p1 = [cx + dx, cy, cz + dz];
    const p2 = [cx + dx, cy + height, cz + dz];
    const p3 = [cx - dx, cy + height, cz - dz];
    addQuad(mb, p0, p1, p2, p3, [0, 0], [1, 0], [1, 1], [0, 1], mat, { sub: 1, ao });
    addQuad(mb, p1, p0, p3, p2, [1, 0], [0, 0], [0, 1], [1, 1], mat, { sub: 1, ao });
  }
}

/*
 * A gable roof over the rectangle (x0,z0)-(x1,z1): two sloping planes meeting
 * at a ridge, two triangular gable ends, and an eave overhang.
 *
 * `axis` is which way the ridge runs — 'x' for a ridge parallel to X (the
 * slopes face north and south), 'z' for the other. Every house on this street
 * has its ridge parallel to the street, which is why the whole neighbourhood
 * reads as one place from any angle.
 *
 * The overhang is not decoration. A roof plane that stops exactly at the wall
 * gives a house a paper-model silhouette, and worse, it puts no shadow on the
 * wall below it — and that shadow line under the eave is most of what makes a
 * house look like it is standing in real light.
 */
export function addGableRoof(mb, x0, z0, x1, z1, wallTop, rise, axis, mat, opts = {}) {
  const over = opts.overhang ?? 0.35;
  const ax0 = x0 - over, ax1 = x1 + over, az0 = z0 - over, az1 = z1 + over;
  const ridge = wallTop + rise;
  const ao = opts.ao;
  const uvScale = 1;

  if (axis === 'x') {
    const zm = (az0 + az1) / 2;
    const slope = Math.hypot((az1 - az0) / 2, rise);
    const w = ax1 - ax0;
    /*
     * The two slopes, each wound so its normal points up and away from the
     * ridge. Worth checking with cross(p1-p0, p3-p0) rather than by eye: wound
     * the other way both planes face into the loft, back-face culling removes
     * them, and from the street the house simply has no roof — which reads as
     * a missing model rather than as the winding bug it is.
     */
    addQuad(mb,
      [ax1, wallTop, az0], [ax0, wallTop, az0], [ax0, ridge, zm], [ax1, ridge, zm],
      [0, 0], [w * uvScale, 0], [w * uvScale, slope], [0, slope], mat, { sub: 2, ao });
    addQuad(mb,
      [ax0, wallTop, az1], [ax1, wallTop, az1], [ax1, ridge, zm], [ax0, ridge, zm],
      [0, 0], [w * uvScale, 0], [w * uvScale, slope], [0, slope], mat, { sub: 2, ao });
    /* Gable ends, as two triangles written through the quad routine with a
     * degenerate edge — cheaper than a triangle path nobody else would use. */
    if (opts.gableMat !== undefined) {
      gableEnd(mb, ax0, wallTop, az0, az1, ridge, zm, -1, opts.gableMat, ao);
      gableEnd(mb, ax1, wallTop, az0, az1, ridge, zm, 1, opts.gableMat, ao);
    }
  } else {
    const xm = (ax0 + ax1) / 2;
    const slope = Math.hypot((ax1 - ax0) / 2, rise);
    const d = az1 - az0;
    addQuad(mb,
      [ax0, wallTop, az0], [ax0, wallTop, az1], [xm, ridge, az1], [xm, ridge, az0],
      [0, 0], [d * uvScale, 0], [d * uvScale, slope], [0, slope], mat, { sub: 2, ao });
    addQuad(mb,
      [ax1, wallTop, az1], [ax1, wallTop, az0], [xm, ridge, az0], [xm, ridge, az1],
      [0, 0], [d * uvScale, 0], [d * uvScale, slope], [0, slope], mat, { sub: 2, ao });
    if (opts.gableMat !== undefined) {
      gableEndZ(mb, az0, wallTop, ax0, ax1, ridge, xm, -1, opts.gableMat, ao);
      gableEndZ(mb, az1, wallTop, ax0, ax1, ridge, xm, 1, opts.gableMat, ao);
    }
  }
}

function gableEnd(mb, x, wallTop, z0, z1, ridge, zm, dir, mat, ao) {
  const h = ridge - wallTop;
  const p0 = [x, wallTop, dir > 0 ? z0 : z1];
  const p1 = [x, wallTop, dir > 0 ? z1 : z0];
  const apex = [x, ridge, zm];
  addQuad(mb, p0, p1, apex, apex,
    [0, 0], [z1 - z0, 0], [(z1 - z0) / 2, h], [(z1 - z0) / 2, h], mat, { sub: 1, ao });
}

function gableEndZ(mb, z, wallTop, x0, x1, ridge, xm, dir, mat, ao) {
  const h = ridge - wallTop;
  const p0 = [dir > 0 ? x1 : x0, wallTop, z];
  const p1 = [dir > 0 ? x0 : x1, wallTop, z];
  const apex = [xm, ridge, z];
  addQuad(mb, p0, p1, apex, apex,
    [0, 0], [x1 - x0, 0], [(x1 - x0) / 2, h], [(x1 - x0) / 2, h], mat, { sub: 1, ao });
}

/*
 * A wall with a rectangular hole in it — a doorway or a window opening. Built
 * as four quads around the hole rather than as one quad with an alpha-cut
 * texture, because a cut-out hole has no depth: you would see the wall's own
 * back face through it, and the reveal at the edge of the opening is exactly
 * where the eye looks to judge whether a wall has thickness.
 *
 * The wall runs from (x0,z0) to (x1,z1) at ground level `y`, height `h`, with
 * the hole spanning `u0..u1` along the wall and `v0..v1` up it.
 */
export function addWallWithHole(mb, x0, z0, x1, z1, y, h, u0, u1, v0, v1, mat, opts = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const at = (u, vy) => [x0 + ux * u, y + vy, z0 + uz * u];
  const ao = opts.ao;
  const sub = opts.sub || 1;
  const q = (a, b, c, d, uvA, uvB, uvC, uvD) =>
    addQuad(mb, a, b, c, d, uvA, uvB, uvC, uvD, mat, { sub, ao, flick: opts.flick });

  /* below, above, left, right */
  if (v0 > 0.001) {
    q(at(u0, 0), at(u1, 0), at(u1, v0), at(u0, v0),
      [u0, 0], [u1, 0], [u1, v0], [u0, v0]);
  }
  if (v1 < h - 0.001) {
    q(at(u0, v1), at(u1, v1), at(u1, h), at(u0, h),
      [u0, v1], [u1, v1], [u1, h], [u0, h]);
  }
  if (u0 > 0.001) {
    q(at(0, 0), at(u0, 0), at(u0, h), at(0, h), [0, 0], [u0, 0], [u0, h], [0, h]);
  }
  if (u1 < len - 0.001) {
    q(at(u1, 0), at(len, 0), at(len, h), at(u1, h),
      [u1, 0], [len, 0], [len, h], [u1, h]);
  }
}
