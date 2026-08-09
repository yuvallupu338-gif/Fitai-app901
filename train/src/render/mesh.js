/*
 * mesh.js — the geometry builder.
 *
 * Everything in the game is built here at load time and frozen into a handful
 * of static buffers: a carriage is one Mesh with a dozen material groups, a
 * passenger is one Mesh with a joint list layered on top. Nothing streams,
 * nothing is loaded from disk, and no vertex is generated per frame.
 *
 * Two details carry most of the look:
 *
 * - UVs are metric. A face asks for "1.4 tiles per metre" and gets the same
 *   texel density whether it is a seat cushion or the whole floor, which is
 *   the difference between a room and a set of stretched boxes.
 *
 * - Occlusion is baked into the vertex colour's alpha by a callback the caller
 *   installs. Corners, the underside of seats and the strip of wall behind a
 *   pole get darkened once, at build time, and cost nothing at draw time.
 */

import { mat4, identity, copyMat, multiply, translate, rotateX, rotateY, rotateZ, scale } from '../core/math.js';
import { Mesh, VERTEX_FLOATS } from './gl.js';

export class Builder {
  constructor() {
    this.verts = [];
    this.groups = new Map();     // material key -> array of indices
    this.current = 'default';
    this.stack = [];
    this.matrix = mat4();
    this.color = [1, 1, 1];
    this.ao = 1;
    this.aoFn = null;
    this.vertexCount = 0;
    this._scratch = mat4();
  }

  material(key) { this.current = key; return this; }

  tint(r, g, b) { this.color = [r, g, b]; return this; }

  push() {
    this.stack.push(copyMat(mat4(), this.matrix));
    return this;
  }

  pop() {
    const m = this.stack.pop();
    if (m) copyMat(this.matrix, m);
    return this;
  }

  translate(x, y, z) { translate(this.matrix, this.matrix, x, y, z); return this; }
  rotateX(a) { rotateX(this.matrix, this.matrix, a); return this; }
  rotateY(a) { rotateY(this.matrix, this.matrix, a); return this; }
  rotateZ(a) { rotateZ(this.matrix, this.matrix, a); return this; }
  scale(x, y = x, z = x) { scale(this.matrix, this.matrix, x, y, z); return this; }

  reset() { identity(this.matrix); this.stack.length = 0; return this; }

  _vertex(px, py, pz, nx, ny, nz, u, v) {
    const m = this.matrix;
    const wx = m[0] * px + m[4] * py + m[8] * pz + m[12];
    const wy = m[1] * px + m[5] * py + m[9] * pz + m[13];
    const wz = m[2] * px + m[6] * py + m[10] * pz + m[14];
    let tnx = m[0] * nx + m[4] * ny + m[8] * nz;
    let tny = m[1] * nx + m[5] * ny + m[9] * nz;
    let tnz = m[2] * nx + m[6] * ny + m[10] * nz;
    const len = Math.hypot(tnx, tny, tnz) || 1;
    tnx /= len; tny /= len; tnz /= len;

    let ao = this.ao;
    if (this.aoFn) ao *= this.aoFn(wx, wy, wz, tnx, tny, tnz);

    this.verts.push(wx, wy, wz, tnx, tny, tnz, u, v,
      this.color[0], this.color[1], this.color[2], ao);
    return this.vertexCount++;
  }

  _indices() {
    let list = this.groups.get(this.current);
    if (!list) { list = []; this.groups.set(this.current, list); }
    return list;
  }

  /* Four corners in counter-clockwise order as seen from the front face. */
  quad(a, b, c, d, uv, normal) {
    let n = normal;
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
    }
    const [u0, v0, u1, v1] = uv || [0, 0, 1, 1];
    const i0 = this._vertex(a[0], a[1], a[2], n[0], n[1], n[2], u0, v0);
    const i1 = this._vertex(b[0], b[1], b[2], n[0], n[1], n[2], u1, v0);
    const i2 = this._vertex(c[0], c[1], c[2], n[0], n[1], n[2], u1, v1);
    const i3 = this._vertex(d[0], d[1], d[2], n[0], n[1], n[2], u0, v1);
    const idx = this._indices();
    idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  /*
   * Axis-aligned box centred on the current origin.
   *
   * `faces` drops the ones nobody can see. Half the carriage's triangle count
   * used to be the outward faces of wall panels pressed against the hull.
   */
  box(w, h, d, opts = {}) {
    const tiles = opts.tiles ?? 1;      // texture repeats per metre
    const faces = opts.faces || 'all';
    const uvOffset = opts.uvOffset || [0, 0];
    const flip = opts.inward ? -1 : 1;
    const x = w / 2, y = h / 2, z = d / 2;
    const ox = opts.anchor ? opts.anchor[0] * x : 0;
    const oy = opts.anchor ? opts.anchor[1] * y : 0;
    const oz = opts.anchor ? opts.anchor[2] * z : 0;

    const has = (f) => faces === 'all' || faces.includes(f);
    const uvFor = (su, sv) => [
      uvOffset[0], uvOffset[1],
      uvOffset[0] + su * tiles, uvOffset[1] + sv * tiles,
    ];
    const P = (px, py, pz) => [px + ox, py + oy, pz + oz];

    if (has('+z')) this._face(
      P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z), uvFor(w, h), [0, 0, flip], flip);
    if (has('-z')) this._face(
      P(x, -y, -z), P(-x, -y, -z), P(-x, y, -z), P(x, y, -z), uvFor(w, h), [0, 0, -flip], flip);
    if (has('+x')) this._face(
      P(x, -y, z), P(x, -y, -z), P(x, y, -z), P(x, y, z), uvFor(d, h), [flip, 0, 0], flip);
    if (has('-x')) this._face(
      P(-x, -y, -z), P(-x, -y, z), P(-x, y, z), P(-x, y, -z), uvFor(d, h), [-flip, 0, 0], flip);
    if (has('+y')) this._face(
      P(-x, y, z), P(x, y, z), P(x, y, -z), P(-x, y, -z), uvFor(w, d), [0, flip, 0], flip);
    if (has('-y')) this._face(
      P(-x, -y, -z), P(x, -y, -z), P(x, -y, z), P(-x, -y, z), uvFor(w, d), [0, -flip, 0], flip);
    return this;
  }

  _face(a, b, c, d, uv, normal, flip) {
    if (flip < 0) this.quad(b, a, d, c, uv, normal);
    else this.quad(a, b, c, d, uv, normal);
  }

  /* A flat quad in the XY plane, facing +Z. Posters, ads, screens, signs. */
  panel(w, h, opts = {}) {
    const x = w / 2, y = h / 2;
    const uv = opts.uv || [0, 0, 1, 1];
    this.quad([-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], uv, [0, 0, 1]);
    if (opts.doubleSided) {
      this.quad([x, -y, 0], [-x, -y, 0], [-x, y, 0], [x, y, 0], uv, [0, 0, -1]);
    }
    return this;
  }

  /* Cylinder along Y, centred. Poles, handrails, bottles, arms. */
  cylinder(radiusTop, radiusBottom, height, segments = 12, opts = {}) {
    const half = height / 2;
    const idx = this._indices();
    const ring = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = t * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      const nx = cos, nz = sin;
      const top = this._vertex(cos * radiusTop, half, sin * radiusTop, nx, 0.15, nz, t * (opts.tiles ?? 1), 0);
      const bot = this._vertex(cos * radiusBottom, -half, sin * radiusBottom, nx, -0.15, nz,
        t * (opts.tiles ?? 1), height * (opts.tilesV ?? 1));
      ring.push([top, bot]);
    }
    for (let i = 0; i < segments; i++) {
      const [t0, b0] = ring[i];
      const [t1, b1] = ring[i + 1];
      idx.push(b0, b1, t1, b0, t1, t0);
    }
    if (opts.caps) {
      const capTop = this._vertex(0, half, 0, 0, 1, 0, 0.5, 0.5);
      const capBot = this._vertex(0, -half, 0, 0, -1, 0, 0.5, 0.5);
      for (let i = 0; i < segments; i++) {
        idx.push(capTop, ring[i][0], ring[i + 1][0]);
        idx.push(capBot, ring[i + 1][1], ring[i][1]);
      }
    }
    return this;
  }

  /* UV sphere. Only heads and a few light bulbs need one, so the segment
     counts stay low and the poles are allowed to pinch. */
  sphere(radius, segments = 12, rings = 8, opts = {}) {
    const idx = this._indices();
    const grid = [];
    const sy = opts.scaleY ?? 1;
    const sz = opts.scaleZ ?? 1;
    for (let r = 0; r <= rings; r++) {
      const v = r / rings;
      const phi = v * Math.PI;
      const row = [];
      for (let s = 0; s <= segments; s++) {
        const u = s / segments;
        const theta = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        row.push(this._vertex(nx * radius, ny * radius * sy, nz * radius * sz, nx, ny / sy, nz / sz, u, 1 - v));
      }
      grid.push(row);
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = grid[r][s], b = grid[r + 1][s], c = grid[r + 1][s + 1], d = grid[r][s + 1];
        if (r !== 0) idx.push(a, b, d);
        if (r !== rings - 1) idx.push(b, c, d);
      }
    }
    return this;
  }

  /* Rounded box, used for anything upholstered. Chamfers catch the overhead
     light along their edge, which is most of what makes a seat look soft. */
  roundedBox(w, h, d, bevel, opts = {}) {
    const b = Math.min(bevel, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    this.push();
    this.box(w - b * 2, h, d, opts);
    this.box(w, h - b * 2, d, opts);
    this.box(w, h, d - b * 2, opts);
    this.pop();
    return this;
  }

  isEmpty() { return this.vertexCount === 0; }

  build(gl, materials) {
    const indices = [];
    const groups = [];
    for (const [key, list] of this.groups) {
      if (!list.length) continue;
      groups.push({
        material: materials?.[key] || materials?.default || { key },
        key,
        start: indices.length,
        count: list.length,
      });
      for (const i of list) indices.push(i);
    }
    const vertices = new Float32Array(this.verts);
    const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
    const mesh = new Mesh(gl, vertices, new IndexArray(indices), groups);
    mesh.builderVertexCount = this.vertexCount;
    mesh.triangleCount = indices.length / 3;
    return mesh;
  }

  /* Raw data, for callers that want the geometry without a GPU upload —
     the collision baker and the headless smoke test both use this. */
  data() {
    const indices = [];
    const groups = [];
    for (const [key, list] of this.groups) {
      if (!list.length) continue;
      groups.push({ key, start: indices.length, count: list.length });
      for (const i of list) indices.push(i);
    }
    return {
      vertices: new Float32Array(this.verts),
      indices: this.vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
      groups,
      stride: VERTEX_FLOATS,
    };
  }
}

/*
 * The occlusion function the carriage builds with.
 *
 * Cheap and entirely faked: darken toward the floor, toward the ceiling, and
 * toward the two side walls, plus a soft pool under every seat bank. It is not
 * ambient occlusion in any defensible sense, but a corridor lit from above
 * really is darkest exactly there, and the shape of it is what the eye reads.
 */
export function carriageAO(interiorHalfWidth, interiorHeight, seatBands) {
  return (x, y, _z, _nx, ny) => {
    let ao = 1;
    const floorGap = Math.max(0, y);
    ao *= 0.76 + 0.24 * Math.min(1, floorGap / 0.45);
    const ceilGap = Math.max(0, interiorHeight - y);
    ao *= 0.86 + 0.14 * Math.min(1, ceilGap / 0.35);
    const wallGap = Math.max(0, interiorHalfWidth - Math.abs(x));
    ao *= 0.84 + 0.16 * Math.min(1, wallGap / 0.5);
    /* Under the seat overhang. Upward-facing surfaces there see nothing. */
    if (seatBands && y < 0.44 && Math.abs(x) > interiorHalfWidth - 0.75 && ny > 0.2) {
      ao *= 0.62;
    }
    return Math.max(0.42, Math.min(1, ao));
  };
}

export function combineMatrices(out, ...mats) {
  identity(out);
  for (const m of mats) multiply(out, out, m);
  return out;
}
