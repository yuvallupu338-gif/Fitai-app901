/*
 * math.js — the linear algebra this game actually uses.
 *
 * Column-major Float32Array matrices, which is what WebGL wants, so they go
 * to uniformMatrix4fv with transpose=false and no copying.
 *
 * The one piece here that is not boilerplate is `rayMesh`. Every brush stroke
 * in this game is a pointer position that has to become a texel on a face, and
 * that conversion — screen ray, into the head's triangles, out as a UV — is
 * the whole input path. It is at the bottom of this file with the reasoning
 * for why it walks triangles rather than doing anything cleverer.
 */

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/* Frame-rate independent exponential approach: `rate` is roughly how much of
 * the gap is closed per second, so a 144Hz machine and a 30Hz one agree. */
export function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(m) {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function copy(out, a) { out.set(a); return out; }

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  out[10] = (far + near) / (near - far);
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/* Trans-rotate-scale, built directly. Rotation order is Y then X then Z,
 * which is what reads naturally for props: turn it, tip it, tilt it. */
export function compose(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);

  /* R = Ry * Rx * Rz */
  const m00 = cy * cz + syr * sxr * szr;
  const m01 = cx * szr;
  const m02 = -syr * cz + cy * sxr * szr;
  const m10 = -cy * szr + syr * sxr * cz;
  const m11 = cx * cz;
  const m12 = syr * szr + cy * sxr * cz;
  const m20 = syr * cx;
  const m21 = -sxr;
  const m22 = cy * cx;

  out[0] = m00 * sx; out[1] = m01 * sx; out[2]  = m02 * sx; out[3]  = 0;
  out[4] = m10 * sy; out[5] = m11 * sy; out[6]  = m12 * sy; out[7]  = 0;
  out[8] = m20 * sz; out[9] = m21 * sz; out[10] = m22 * sz; out[11] = 0;
  out[12] = tx;      out[13] = ty;      out[14] = tz;       out[15] = 1;
  return out;
}

/*
 * The 3×3 inverse-transpose, for normals. Non-uniform scale is everywhere in
 * this game — a lipstick tube is a cylinder scaled thin, the counter is a cube
 * scaled flat — and skipping this makes every one of them shade as if it were
 * still a cube, which reads as "the lighting is broken" long before anyone
 * works out that it is the normals.
 */
export function normalMatrix(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;

  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) { out[0] = out[4] = out[8] = 1; return out; }
  det = 1 / det;

  out[0] = b01 * det;
  out[1] = (-a22 * a01 + a02 * a21) * det;
  out[2] = (a12 * a01 - a02 * a11) * det;
  out[3] = b11 * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a12 * a00 + a02 * a10) * det;
  out[6] = b21 * det;
  out[7] = (-a21 * a00 + a01 * a20) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}

export function invert(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(out);
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/*
 * An orbit camera's view matrix. The camera is always looking at a target,
 * because everything in this game is either a face or a counter and both are
 * things you look *at* — there is no walking around.
 */
export function lookAt(out, ex, ey, ez, tx, ty, tz) {
  let fx = ex - tx, fy = ey - ty, fz = ez - tz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  /* World up is +Y. If the eye is directly above the target the cross product
   * collapses; nudge instead of producing NaNs across the whole frame. */
  let rx = fz, ry = 0, rz = -fx;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-6) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;

  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;

  out[0] = rx; out[4] = ry; out[8]  = rz;  out[12] = -(rx * ex + ry * ey + rz * ez);
  out[1] = ux; out[5] = uy; out[9]  = uz;  out[13] = -(ux * ex + uy * ey + uz * ez);
  out[2] = fx; out[6] = fy; out[10] = fz;  out[14] = -(fx * ex + fy * ey + fz * ez);
  out[3] = 0;  out[7] = 0;  out[11] = 0;   out[15] = 1;
  return out;
}

/*
 * A model matrix that points a mesh's +Z along `f`, with its +Y as close to
 * world up as that allows, at `p`, scaled uniformly.
 *
 * The reason this is a shared function with a test rather than three lines at
 * each call site: the frame has to be right-handed. Build it the other way
 * round — right = forward x up instead of up x forward — and every axis still
 * looks correct, the object still sits in the right place pointing the right
 * way, and the matrix has a negative determinant, which mirrors the mesh and
 * reverses which side of every triangle is the front. With back-face culling
 * on, the object then draws its own far side, which for an eyeball parked in a
 * socket means it draws the half that is inside the head and vanishes. Both
 * eyes and all four lids were built that way, and the symptom was two dark
 * holes in a face that was otherwise finished.
 */
export function aimedBasis(out, fx, fy, fz, px, py, pz, scale) {
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  /* right = up x forward. Written out because two of world up's terms are 0. */
  let rx = fz, ry = 0, rz = -fx;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-6) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;

  /* up = forward x right, which closes a right-handed frame. */
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;

  out[0] = rx * scale; out[1] = ry * scale; out[2] = rz * scale; out[3] = 0;
  out[4] = ux * scale; out[5] = uy * scale; out[6] = uz * scale; out[7] = 0;
  out[8] = fx * scale; out[9] = fy * scale; out[10] = fz * scale; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
}

/* The determinant of a model matrix's rotation part. Negative means the mesh
 * is mirrored, and every triangle in it has swapped which side is the front. */
export function basisDeterminant(m) {
  return m[0] * (m[5] * m[10] - m[6] * m[9])
    - m[4] * (m[1] * m[10] - m[2] * m[9])
    + m[8] * (m[1] * m[6] - m[2] * m[5]);
}

export function transformPoint(out, m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

/*
 * Screen pixel -> world-space ray. `invViewProj` is the inverse of the same
 * matrix the frame was drawn with, so a stroke always lands where the player
 * saw the face, not where it was last frame.
 */
export function rayFromScreen(out, invViewProj, ndcX, ndcY) {
  const near = new Float32Array(3);
  const far = new Float32Array(3);
  transformPoint(near, invViewProj, ndcX, ndcY, -1);
  transformPoint(far, invViewProj, ndcX, ndcY, 1);
  out.ox = near[0]; out.oy = near[1]; out.oz = near[2];
  out.dx = far[0] - near[0];
  out.dy = far[1] - near[1];
  out.dz = far[2] - near[2];
  const l = Math.hypot(out.dx, out.dy, out.dz) || 1;
  out.dx /= l; out.dy /= l; out.dz /= l;
  return out;
}

/* Slab test against an axis-aligned box, used to reject the head in one go
 * before any triangle is touched. */
export function rayAABB(ray, min, max) {
  let t0 = 0, t1 = Infinity;
  const o = [ray.ox, ray.oy, ray.oz];
  const d = [ray.dx, ray.dy, ray.dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return false;
      continue;
    }
    const inv = 1 / d[i];
    let a = (min[i] - o[i]) * inv;
    let b = (max[i] - o[i]) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

/*
 * Möller–Trumbore, single-sided. Back faces are rejected on purpose: the head
 * is a closed surface and a stroke must land on the cheek facing the player,
 * never on the inside of the far cheek, which is exactly what a two-sided test
 * does when the front-facing hit is a hair further away in a concave spot like
 * the eye socket.
 */
function rayTriangle(ray, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

  const px = ray.dy * e2z - ray.dz * e2y;
  const py = ray.dz * e2x - ray.dx * e2z;
  const pz = ray.dx * e2y - ray.dy * e2x;

  const det = e1x * px + e1y * py + e1z * pz;
  if (det < 1e-9) return -1;               /* parallel, or facing away */

  const inv = 1 / det;
  const tx = ray.ox - ax, ty = ray.oy - ay, tz = ray.oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (ray.dx * qx + ray.dy * qy + ray.dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;

  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t < 1e-5) return -1;
  hitU = u; hitV = v;
  return t;
}

let hitU = 0, hitV = 0;

/*
 * Ray against a mesh in its own object space, returning the barycentric-
 * interpolated UV of the nearest front-facing hit.
 *
 * This walks every triangle. The head is about twelve thousand of them and a
 * stroke asks once per pointer event, which measures at a fraction of a
 * millisecond — a BVH here would be a data structure to keep correct in
 * exchange for time nobody is short of. The bounding-box reject above it is
 * worth having anyway, because most pointer moves during a stroke are over
 * the tray or the counter and never touch the face at all.
 *
 * The caller passes the ray already transformed into object space, which is
 * one matrix inverse per pick instead of one matrix multiply per vertex.
 */
export function rayMesh(ray, mesh, out) {
  if (mesh.min && !rayAABB(ray, mesh.min, mesh.max)) return false;

  const pos = mesh.positions;
  const uv = mesh.uvs;
  const idx = mesh.indices;
  let best = Infinity, bu = 0, bv = 0, bi = -1;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const t = rayTriangle(ray,
      pos[a], pos[a + 1], pos[a + 2],
      pos[b], pos[b + 1], pos[b + 2],
      pos[c], pos[c + 1], pos[c + 2]);
    if (t >= 0 && t < best) { best = t; bu = hitU; bv = hitV; bi = i; }
  }
  if (bi < 0) return false;

  const ia = idx[bi] * 2, ib = idx[bi + 1] * 2, ic = idx[bi + 2] * 2;
  const w = 1 - bu - bv;
  out.u = uv[ia] * w + uv[ib] * bu + uv[ic] * bv;
  out.v = uv[ia + 1] * w + uv[ib + 1] * bu + uv[ic + 1] * bv;
  out.t = best;
  out.x = ray.ox + ray.dx * best;
  out.y = ray.oy + ray.dy * best;
  out.z = ray.oz + ray.dz * best;
  return true;
}

/* Transform a world ray into an object's space. Direction is not renormalised
 * on purpose when the matrix has uniform scale, but every model matrix here
 * may be scaled, so it is — otherwise `t` comes back in the wrong units and
 * the nearest-hit comparison across two objects picks the wrong one. */
export function rayToObject(out, ray, invModel) {
  const p = new Float32Array(3);
  transformPoint(p, invModel, ray.ox, ray.oy, ray.oz);
  out.ox = p[0]; out.oy = p[1]; out.oz = p[2];
  const q = new Float32Array(3);
  transformPoint(q, invModel, ray.ox + ray.dx, ray.oy + ray.dy, ray.oz + ray.dz);
  out.dx = q[0] - p[0]; out.dy = q[1] - p[1]; out.dz = q[2] - p[2];
  const l = Math.hypot(out.dx, out.dy, out.dz) || 1;
  out.dx /= l; out.dy /= l; out.dz /= l;
  return out;
}
