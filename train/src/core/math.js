/*
 * math.js — the small linear-algebra kit the renderer runs on.
 *
 * Matrices are column-major Float32Array(16), which is what WebGL wants, so
 * nothing has to be transposed on the way to a uniform. Vectors are plain
 * arrays of three numbers; every function takes an `out` first so hot paths
 * can reuse scratch storage instead of allocating per frame.
 */

export function mat4() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function identity(out) {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

export function copyMat(out, a) {
  out.set(a);
  return out;
}

export function perspective(out, fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad / 2);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[11] = -1;
  out[12] = 0; out[13] = 0; out[15] = 0;
  const nf = 1 / (near - far);
  out[10] = (far + near) * nf;
  out[14] = 2 * far * near * nf;
  return out;
}

export function ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

export function multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function translate(out, a, x, y, z) {
  if (out !== a) copyMat(out, a);
  out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
  out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
  out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
  out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  return out;
}

export function scale(out, a, x, y, z) {
  out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
  out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
  out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
  out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
  return out;
}

export function rotateX(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  if (out !== a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
  out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
  return out;
}

export function rotateY(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  if (out !== a) { out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
  out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
  return out;
}

export function rotateZ(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  if (out !== a) { out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
  out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
  return out;
}

export function invert(out, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

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

export function transpose(out, a) {
  if (out === a) {
    const a01 = a[1], a02 = a[2], a03 = a[3], a12 = a[6], a13 = a[7], a23 = a[11];
    out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
    out[4] = a01; out[6] = a[9]; out[7] = a[13];
    out[8] = a02; out[9] = a12; out[11] = a[14];
    out[12] = a03; out[13] = a13; out[14] = a23;
    return out;
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i * 4 + j] = a[j * 4 + i];
  return out;
}

export function lookAt(out, eye, center, up) {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2);
  if (len < 1e-6) { z0 = 0; z1 = 0; z2 = 1; len = 1; }
  z0 /= len; z1 /= len; z2 /= len;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len < 1e-6) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }

  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

/* Composes translation, YXZ euler rotation and scale into one matrix.
   YXZ is the order a head uses: yaw, then pitch, then roll. */
export function compose(out, tx, ty, tz, ry, rx, rz, sx, sy, sz) {
  identity(out);
  translate(out, out, tx, ty, tz);
  if (ry) rotateY(out, out, ry);
  if (rx) rotateX(out, out, rx);
  if (rz) rotateZ(out, out, rz);
  if (sx !== 1 || sy !== 1 || sz !== 1) scale(out, out, sx, sy, sz);
  return out;
}

/* Upper-left 3x3 of the inverse-transpose, packed as a mat3 for normals. */
export function normalMatrix(out9, m) {
  const inv = invert(NORMAL_SCRATCH, m);
  out9[0] = inv[0]; out9[1] = inv[4]; out9[2] = inv[8];
  out9[3] = inv[1]; out9[4] = inv[5]; out9[5] = inv[9];
  out9[6] = inv[2]; out9[7] = inv[6]; out9[8] = inv[10];
  return out9;
}
const NORMAL_SCRATCH = mat4();

export function transformPoint(out, v, m) {
  const x = v[0], y = v[1], z = v[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

export function transformDir(out, v, m) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z;
  out[1] = m[1] * x + m[5] * y + m[9] * z;
  out[2] = m[2] * x + m[6] * y + m[10] * z;
  return out;
}

/* Mirrors a transform across the plane x = px. Used for the window
   reflections, which are the only mirrors in the game and are all vertical
   planes facing along X. Handedness flips, so faces are culled the other way
   while this matrix is on the stack. */
export function mirrorX(out, px) {
  identity(out);
  out[0] = -1;
  out[12] = 2 * px;
  return out;
}

export const vec3 = {
  set(out, x, y, z) { out[0] = x; out[1] = y; out[2] = z; return out; },
  copy(out, a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; },
  add(out, a, b) { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2]; return out; },
  sub(out, a, b) { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; return out; },
  scale(out, a, s) { out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s; return out; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  len(a) { return Math.hypot(a[0], a[1], a[2]); },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
  normalize(out, a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[0] = a[0] / l; out[1] = a[1] / l; out[2] = a[2] / l;
    return out;
  },
  cross(out, a, b) {
    const x = a[1] * b[2] - a[2] * b[1];
    const y = a[2] * b[0] - a[0] * b[2];
    const z = a[0] * b[1] - a[1] * b[0];
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  },
  lerp(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  },
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/* Frame-rate independent exponential approach. `rate` is roughly "how much of
   the remaining gap is closed per second", so the same call feels identical at
   30fps and 144fps — which matters because the camera easing and the audio
   ducking both run through it. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/* Signed shortest angular difference, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* Ray against an axis-aligned box, slab method. Returns the near hit distance
   or -1. Every interactable in the game is tested with this. */
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < min[i] || o[i] > max[i]) return -1;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}
