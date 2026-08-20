/*
 * math.js — vectors, matrices and the frustum test.
 *
 * A sibling of backrooms/src/core/math.js rather than an import of it. Every
 * app on this origin is self-contained on purpose: one of them can be deleted
 * or rewritten without the other three noticing, and a shared engine module
 * between two games that are balanced and shipped separately is a coupling
 * that only ever costs. This file is generic linear algebra and there is
 * nothing villa-specific to add to it.
 */

export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/* Frame-rate independent exponential approach. `rate` is roughly "how much of
 * the gap is closed per second"; dt scaling keeps a 30fps machine from feeling
 * different to a 144fps one. */
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

export function ortho(out, l, r, b, t, n, f) {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  out[14] = -(f + n) / (f - n);
  out[15] = 1;
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

/*
 * View matrix straight from an FPS camera: position plus yaw/pitch, no roll.
 * This is the inverse of the camera transform, built directly rather than by
 * composing and inverting — fewer ops and no chance of an inverse going
 * singular on a degenerate up vector, which is the classic lookAt failure when
 * you stare at the ceiling.
 */
export function viewFromEuler(out, px, py, pz, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  /* Camera basis: right, up, forward(-z). */
  const rx = cy,       ry = 0,   rz = -sy;
  const ux = sy * sp,  uy = cp,  uz = cy * sp;
  const fx = sy * cp,  fy = -sp, fz = cy * cp;

  out[0] = rx; out[4] = ry; out[8]  = rz;  out[12] = -(rx * px + ry * py + rz * pz);
  out[1] = ux; out[5] = uy; out[9]  = uz;  out[13] = -(ux * px + uy * py + uz * pz);
  out[2] = fx; out[6] = fy; out[10] = fz;  out[14] = -(fx * px + fy * py + fz * pz);
  out[3] = 0;  out[7] = 0;  out[11] = 0;   out[15] = 1;
  return out;
}

/* Forward direction for the same yaw/pitch convention as viewFromEuler.
 * yaw=0 looks down -Z; yaw grows counter-clockwise seen from above. */
export function forwardFromEuler(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

export function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

/*
 * Six frustum planes pulled out of a view-projection matrix (Gribb/Hartmann).
 * Planes come out as [a,b,c,d] with the normal pointing inwards, so a point is
 * inside when a*x + b*y + c*z + d >= 0. Used to skip chunks, which matters far
 * more here than it sounds: a chunk is a few thousand triangles and the fog
 * hides most of them anyway.
 */
export function frustumFromMatrix(m, out) {
  const p = out || new Float32Array(24);
  for (let i = 0; i < 3; i++) {
    const s = i * 2;
    /* row3 + rowI, then row3 - rowI */
    p[s * 4]     = m[3]  + m[i];
    p[s * 4 + 1] = m[7]  + m[4 + i];
    p[s * 4 + 2] = m[11] + m[8 + i];
    p[s * 4 + 3] = m[15] + m[12 + i];
    p[(s + 1) * 4]     = m[3]  - m[i];
    p[(s + 1) * 4 + 1] = m[7]  - m[4 + i];
    p[(s + 1) * 4 + 2] = m[11] - m[8 + i];
    p[(s + 1) * 4 + 3] = m[15] - m[12 + i];
  }
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    const l = Math.hypot(p[o], p[o + 1], p[o + 2]) || 1;
    p[o] /= l; p[o + 1] /= l; p[o + 2] /= l; p[o + 3] /= l;
  }
  return p;
}

export function aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    const a = planes[o], b = planes[o + 1], c = planes[o + 2], d = planes[o + 3];
    /* Positive vertex: the corner furthest along the plane normal. If even that
     * one is behind the plane, the whole box is out. */
    const x = a >= 0 ? maxX : minX;
    const y = b >= 0 ? maxY : minY;
    const z = c >= 0 ? maxZ : minZ;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
