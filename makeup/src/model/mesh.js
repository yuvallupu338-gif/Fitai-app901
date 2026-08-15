/*
 * mesh.js — the geometry builder everything in this game is made of.
 *
 * WINDING: every closed surface here is wound so that its triangles are
 * counter-clockwise seen from *outside*. Back-face culling is on, so a
 * primitive wound the other way does not look wrong — it looks like a solid
 * object with no features on it, because what you are seeing is the inside of
 * its far wall with the near wall culled away. That failure is genuinely hard
 * to recognise on a head: the silhouette is still a head, the eyes are separate
 * meshes and still sit in front of it, and the texture still maps onto
 * something. `tools/makeup-audit.mjs` measures the signed volume of every
 * closed mesh and fails when one comes out negative, which is the check that
 * finally named it.
 *
 * There are no model files here, and no loader. A lipstick tube is a lathe, the
 * counter is a rounded box, the customer is a deformed sphere, and all of it is
 * accumulated into one of these builders and handed to the GL layer.
 *
 * Two things the builder does that a naive one does not:
 *
 *   - it keeps the positions and UVs in plain arrays alongside the interleaved
 *     vertex buffer, because the head has to be ray-cast against on every
 *     pointer move and reading them back out of an interleaved Float32Array at
 *     stride 9 is both slower and much harder to read;
 *
 *   - it can compute smooth normals from the triangles after the fact, which is
 *     what the head needs — its shape is a pile of displacements and there is no
 *     closed form for the normal once four of them overlap on a cheekbone.
 */

import { VERTEX_FLOATS } from '../core/gl.js';

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.ao = [];
    this.idx = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  vert(x, y, z, nx, ny, nz, u, v, ao = 1) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.ao.push(ao);
    return this.vertexCount - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }

  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /*
   * Area-weighted smooth normals. Weighting by the cross-product length rather
   * than normalising per face is what keeps a long thin triangle — every one
   * of them along the jaw, where the parametric grid stretches — from pulling
   * the shading as hard as the fat square one next to it.
   */
  computeNormals() {
    const n = new Float32Array(this.pos.length);
    const p = this.pos, idx = this.idx;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      this.nrm[i] = n[i] / l;
      this.nrm[i + 1] = n[i + 1] / l;
      this.nrm[i + 2] = n[i + 2] / l;
    }
    return this;
  }

  /*
   * Weld vertices that share a position so `computeNormals` smooths across a
   * seam. The head's UV seam runs up the back of the skull and its two sides
   * are separate vertices by necessity; without this they shade as a crease
   * that catches the ring light and looks like a scar.
   */
  weldNormals(epsilon = 1e-5) {
    const map = new Map();
    const q = 1 / epsilon;
    const p = this.pos;
    for (let i = 0; i < p.length; i += 3) {
      const key = `${Math.round(p[i] * q)},${Math.round(p[i + 1] * q)},${Math.round(p[i + 2] * q)}`;
      const list = map.get(key);
      if (list) list.push(i); else map.set(key, [i]);
    }
    for (const list of map.values()) {
      if (list.length < 2) continue;
      let nx = 0, ny = 0, nz = 0;
      for (const i of list) { nx += this.nrm[i]; ny += this.nrm[i + 1]; nz += this.nrm[i + 2]; }
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const i of list) {
        this.nrm[i] = nx / l; this.nrm[i + 1] = ny / l; this.nrm[i + 2] = nz / l;
      }
    }
    return this;
  }

  /* Append another builder's geometry, optionally transformed by a 4x4. */
  append(other, m) {
    const base = this.vertexCount;
    const p = other.pos, n = other.nrm;
    for (let i = 0; i < p.length; i += 3) {
      if (m) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        this.pos.push(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14]);
        const nx = n[i], ny = n[i + 1], nz = n[i + 2];
        /* Rotation-only normal transform. Every call site here uses uniform
         * scale; the props that need non-uniform scale get it on the model
         * matrix at draw time, where the shader's normal matrix handles it. */
        let tx = m[0] * nx + m[4] * ny + m[8] * nz;
        let ty = m[1] * nx + m[5] * ny + m[9] * nz;
        let tz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        this.nrm.push(tx / l, ty / l, tz / l);
      } else {
        this.pos.push(p[i], p[i + 1], p[i + 2]);
        this.nrm.push(n[i], n[i + 1], n[i + 2]);
      }
    }
    for (const u of other.uv) this.uv.push(u);
    for (const a of other.ao) this.ao.push(a);
    for (const i of other.idx) this.idx.push(base + i);
    return this;
  }

  build() {
    const count = this.vertexCount;
    const vertices = new Float32Array(count * VERTEX_FLOATS);
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const o = i * VERTEX_FLOATS;
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      vertices[o] = x; vertices[o + 1] = y; vertices[o + 2] = z;
      vertices[o + 3] = this.nrm[i * 3];
      vertices[o + 4] = this.nrm[i * 3 + 1];
      vertices[o + 5] = this.nrm[i * 3 + 2];
      vertices[o + 6] = this.uv[i * 2];
      vertices[o + 7] = this.uv[i * 2 + 1];
      vertices[o + 8] = this.ao[i];
      if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
      if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
      if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    }
    return {
      vertices,
      indices: new Uint32Array(this.idx),
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      min, max,
      triangles: this.idx.length / 3,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Primitives
 *
 * All of them write into a builder rather than returning one, so a prop made
 * of nine parts is nine calls and one buffer.
 * ------------------------------------------------------------------ */

/*
 * Box with per-face UVs and darkened corners. `uvScale` is in world units per
 * texture repeat so a small tube and a two-metre counter get the same grain
 * size out of the same texture.
 */
export function box(b, cx, cy, cz, hx, hy, hz, uvScale = 1, ao = 1) {
  /*
   * Normal, then the two in-plane axes. The pair must satisfy t x b = n, or
   * that face comes out wound backwards while claiming to face outwards — which
   * is exactly what the top and bottom faces did here until the audit measured
   * it. A box with two inverted faces still looks like a box from most angles;
   * what it does not have is a floor you can see when you are standing on it.
   */
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const h = [hx, hy, hz];
  for (const [n, t, bt] of faces) {
    const ext = (v) => Math.abs(v[0]) * h[0] + Math.abs(v[1]) * h[1] + Math.abs(v[2]) * h[2];
    const et = ext(t), eb = ext(bt);
    const base = b.vertexCount;
    for (let i = 0; i < 4; i++) {
      const s = i === 0 || i === 3 ? -1 : 1;
      const u = i < 2 ? -1 : 1;
      const px = cx + n[0] * ext(n) + t[0] * et * s + bt[0] * eb * u;
      const py = cy + n[1] * ext(n) + t[1] * et * s + bt[1] * eb * u;
      const pz = cz + n[2] * ext(n) + t[2] * et * s + bt[2] * eb * u;
      b.vert(px, py, pz, n[0], n[1], n[2],
        (s * et) / uvScale, (u * eb) / uvScale, ao);
    }
    b.quad(base, base + 1, base + 2, base + 3);
  }
}

/*
 * Lathe: spin a 2D profile of [radius, height] pairs around Y. This is what
 * every bottle, tube, jar, brush handle and lamp post in the shop is — the
 * silhouette is the entire design of a cosmetics package and a profile curve
 * is exactly how one is drawn.
 */
export function lathe(b, profile, segments, cx, cy, cz, opts = {}) {
  const closeTop = opts.closeTop !== false;
  const closeBottom = opts.closeBottom !== false;
  const uvScale = opts.uvScale || 1;
  const rows = [];

  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    const row = [];
    /* Slope of the profile gives the normal in the RY plane; averaging the
     * segment either side is what rounds a shoulder instead of faceting it. */
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 1)];
    let dr = next[0] - prev[0], dy = next[1] - prev[1];
    const dl = Math.hypot(dr, dy) || 1;
    dr /= dl; dy /= dl;
    const nr = dy, ny = -dr;

    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      row.push(b.vert(
        cx + ca * r, cy + y, cz + sa * r,
        ca * nr, ny, sa * nr,
        (s / segments) * (2 * Math.PI * Math.max(r, 0.001)) / uvScale, y / uvScale,
        opts.ao === undefined ? 1 : opts.ao));
    }
    rows.push(row);
  }

  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      b.quad(rows[i][s], rows[i + 1][s], rows[i + 1][s + 1], rows[i][s + 1]);
    }
  }

  const cap = (row, y, dir) => {
    const r = dir > 0 ? profile[profile.length - 1][0] : profile[0][0];
    if (r <= 1e-6) return;
    const c = b.vert(cx, cy + y, cz, 0, dir, 0, 0, 0, opts.ao === undefined ? 1 : opts.ao);
    const ring = [];
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      ring.push(b.vert(cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r,
        0, dir, 0,
        (Math.cos(a) * r) / uvScale, (Math.sin(a) * r) / uvScale,
        opts.ao === undefined ? 1 : opts.ao));
    }
    for (let s = 0; s < segments; s++) {
      if (dir > 0) b.tri(c, ring[s + 1], ring[s]);
      else b.tri(c, ring[s], ring[s + 1]);
    }
  };
  if (closeTop) cap(rows[rows.length - 1], profile[profile.length - 1][1], 1);
  if (closeBottom) cap(rows[0], profile[0][1], -1);
}

export function cylinder(b, cx, cy, cz, r, h, segments = 24, opts = {}) {
  lathe(b, [[r, 0], [r, h]], segments, cx, cy, cz, opts);
}

/*
 * UV sphere. Used for eyeballs, pearls, and the base of anything round.
 * `sub` is [longitude, latitude] segments.
 */
export function sphere(b, cx, cy, cz, r, sub = [24, 16], opts = {}) {
  const [su, sv] = sub;
  const rows = [];
  for (let j = 0; j <= sv; j++) {
    const lat = (j / sv) * Math.PI;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    const row = [];
    for (let i = 0; i <= su; i++) {
      const lon = (i / su) * Math.PI * 2;
      const nx = sl * Math.sin(lon), ny = cl, nz = sl * Math.cos(lon);
      row.push(b.vert(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz,
        i / su, j / sv, opts.ao === undefined ? 1 : opts.ao));
    }
    rows.push(row);
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      b.quad(rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]);
    }
  }
}

/*
 * A flat quad in the XY plane, facing +Z. Labels, the till screen, the shop
 * sign, and the card in the customer's hand.
 */
export function plane(b, cx, cy, cz, hw, hh, opts = {}) {
  const ao = opts.ao === undefined ? 1 : opts.ao;
  const u0 = opts.u0 === undefined ? 0 : opts.u0;
  const v0 = opts.v0 === undefined ? 0 : opts.v0;
  const u1 = opts.u1 === undefined ? 1 : opts.u1;
  const v1 = opts.v1 === undefined ? 1 : opts.v1;
  const a = b.vert(cx - hw, cy - hh, cz, 0, 0, 1, u0, v1, ao);
  const c = b.vert(cx + hw, cy - hh, cz, 0, 0, 1, u1, v1, ao);
  const d = b.vert(cx + hw, cy + hh, cz, 0, 0, 1, u1, v0, ao);
  const e = b.vert(cx - hw, cy + hh, cz, 0, 0, 1, u0, v0, ao);
  b.quad(a, c, d, e);
}

/*
 * A box with rounded vertical edges, built as a lathe of a squircle. Every
 * countertop, shelf and palette in the shop uses it: a perfectly sharp 90°
 * edge is the single loudest tell that a room was modelled by a program, and
 * a 6mm radius costs a ring of triangles.
 */
export function roundedSlab(b, cx, cy, cz, hx, hy, hz, r, uvScale = 1, ao = 1) {
  const seg = 5;
  const ring = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of corners) {
    const a0 = Math.atan2(sz, sx) - Math.PI / 4;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      ring.push([
        sx * (hx - r) + Math.cos(a) * r,
        sz * (hz - r) + Math.sin(a) * r,
      ]);
    }
  }

  const top = [], bot = [];
  for (const [x, z] of ring) {
    const nl = Math.hypot(x, z) || 1;
    top.push(b.vert(cx + x, cy + hy, cz + z, x / nl, 0, z / nl, x / uvScale, z / uvScale, ao));
    bot.push(b.vert(cx + x, cy - hy, cz + z, x / nl, 0, z / nl, x / uvScale, z / uvScale, ao * 0.6));
  }
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    b.quad(bot[i], top[i], top[j], bot[j]);
  }

  const capTop = b.vert(cx, cy + hy, cz, 0, 1, 0, 0, 0, ao);
  const capBot = b.vert(cx, cy - hy, cz, 0, -1, 0, 0, 0, ao * 0.5);
  const tv = [], bv = [];
  for (const [x, z] of ring) {
    tv.push(b.vert(cx + x, cy + hy, cz + z, 0, 1, 0, x / uvScale, z / uvScale, ao));
    bv.push(b.vert(cx + x, cy - hy, cz + z, 0, -1, 0, x / uvScale, z / uvScale, ao * 0.5));
  }
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    b.tri(capTop, tv[j], tv[i]);
    b.tri(capBot, bv[i], bv[j]);
  }
}

/* Torus, for the ring light that most of this shop is lit by. */
export function torus(b, cx, cy, cz, R, r, seg = 40, sides = 12, ao = 1) {
  const rows = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const row = [];
    for (let j = 0; j <= sides; j++) {
      const t = (j / sides) * Math.PI * 2;
      const ct = Math.cos(t), st = Math.sin(t);
      const nx = ca * ct, ny = st, nz = sa * ct;
      row.push(b.vert(
        cx + ca * (R + r * ct), cy + r * st, cz + sa * (R + r * ct),
        nx, ny, nz, i / seg, j / sides, ao));
    }
    rows.push(row);
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < sides; j++) {
      b.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    }
  }
}
